import { Simulation } from '../simulation';
import {
  seasonAt,
  seasonJobs,
  serialize,
  hydrate,
  initialFlight,
  runFlight,
  LEASE_MS,
  MAX_PILOTS,
  type CountyCommand,
  type CountySnapshot,
  type FlightState,
  type PublicPilot,
  type Standing,
} from '../county';

export class CountyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
type PilotRow = {
  id: string;
  callsign: string;
  state: string;
  revision: number;
  request_id: string | null;
  season: number;
  active_job: number | null;
  seen_at: number;
  credit: number;
  updated_at: number;
};
type ClaimRow = {
  id: number;
  season: number;
  owner: string;
  lease_until: number;
  coverage: number;
  completed_at: number | null;
  callsign: string;
};
const liveWindow = 15000;
export class CountyService {
  constructor(
    public db: D1Database,
    public now: () => number = Date.now,
  ) {}
  pilot(id: string) {
    return this.db
      .prepare('SELECT * FROM pilots WHERE id = ?')
      .bind(id)
      .first<PilotRow>();
  }
  async standings(season: number) {
    return (
      await this.db
        .prepare(
          'SELECT a.pilot, p.callsign, SUM(a.earnings) AS earnings, COUNT(*) AS jobs, SUM(a.acres) AS acres, AVG(a.coverage) AS precision FROM payouts a JOIN pilots p ON p.id = a.pilot WHERE a.season = ? GROUP BY a.pilot ORDER BY earnings DESC, precision DESC, a.pilot LIMIT 50',
        )
        .bind(season)
        .all<Standing>()
    ).results;
  }
  async snapshot(
    viewerId: string | null,
    compact = false,
  ): Promise<CountySnapshot> {
    const now = this.now(),
      season = seasonAt(now);
    const [claims, nearby, standings, previousStandings, player] =
      await Promise.all([
        compact
          ? Promise.resolve({ results: [] as ClaimRow[] })
          : this.db
              .prepare(
                'SELECT f.*, p.callsign FROM field_claims f LEFT JOIN pilots p ON p.id=f.owner WHERE f.season = ?',
              )
              .bind(season.id)
              .all<ClaimRow>(),
        this.db
          .prepare(
            'SELECT id, callsign, state, seen_at FROM pilots WHERE seen_at > ? ORDER BY seen_at DESC LIMIT ?',
          )
          .bind(now - liveWindow, MAX_PILOTS)
          .all<PilotRow>(),
        compact ? Promise.resolve([]) : this.standings(season.id),
        compact ? Promise.resolve([]) : this.standings(season.id - 1),
        viewerId ? this.pilot(viewerId) : null,
      ]);
    const byId = new Map(claims.results.map((c) => [c.id, c]));
    const jobs = seasonJobs(season).map((job) => {
      const claim = byId.get(job.id);
      if (!claim) return job;
      return {
        ...job,
        status: claim.completed_at
          ? ('complete' as const)
          : claim.lease_until > now
            ? ('claimed' as const)
            : job.status,
        owner: claim.owner,
        leaseUntil: claim.lease_until,
        coverage: claim.coverage,
        pilot: claim.callsign,
      };
    });
    const pilots: PublicPilot[] = nearby.results.map((p) => {
      const f = JSON.parse(p.state) as FlightState;
      return {
        id: p.id,
        callsign: p.callsign,
        x: f.x,
        y: f.y,
        z: f.z,
        heading: f.heading,
        roll: f.roll,
        pitch: f.pitch,
        speed: f.speed,
        spraying: f.spraying,
        phase: f.phase,
        seenAt: p.seen_at,
      };
    });
    return {
      compact,
      season,
      jobs: compact ? [] : jobs,
      pilots,
      standings,
      previousStandings,
      viewerId,
      player: player
        ? {
            id: player.id,
            callsign: player.callsign,
            revision: player.revision,
            activeJob: player.season === season.id ? player.active_job : null,
            flight: JSON.parse(player.state),
          }
        : null,
      capacity: MAX_PILOTS,
      now,
    };
  }
  async command(id: string, command: CountyCommand) {
    const now = this.now(),
      season = seasonAt(now);
    let p = await this.pilot(id);
    if (!p) {
      if (command.action !== 'join')
        throw new CountyError('Join the county before taking a contract.', 409);
      await this.db
        .prepare(
          'INSERT INTO pilots (id,callsign,state,revision,season,seen_at,credit,updated_at) SELECT ?,?,?,0,?,?,0.15,? WHERE (SELECT COUNT(*) FROM pilots WHERE seen_at > ?) < ? ON CONFLICT(id) DO NOTHING',
        )
        .bind(
          id,
          `Pilot ${id.slice(0, 6).toUpperCase()}`,
          JSON.stringify(initialFlight()),
          season.id,
          now,
          now,
          now - liveWindow,
          MAX_PILOTS,
        )
        .run();
      p = await this.pilot(id);
      if (!p)
        throw new CountyError(
          'The county has 32 pilots online. You can watch until a space opens.',
          409,
        );
    }
    if (p.request_id === command.requestId) return this.snapshot(id);
    if (command.revision !== p.revision)
      throw new CountyError(
        'This flight changed in another tab. Reconnect to take control.',
        409,
      );
    let sim = hydrate(JSON.parse(p.state) as FlightState),
      active = p.active_job;
    let credit = Math.min(
      2,
      Math.max(0, (now - p.updated_at) / 1000) + p.credit,
    );
    if (p.season !== season.id) {
      sim = new Simulation();
      sim.career = (JSON.parse(p.state) as FlightState).career;
      sim.career.completed = [];
      active = null;
      credit = 0.15;
    }
    const oldActive = active;
    let claim: ClaimRow | null = null;
    if (active !== null) {
      claim = await this.db
        .prepare('SELECT * FROM field_claims WHERE id = ?')
        .bind(active)
        .first<ClaimRow>();
      if (
        !claim ||
        claim.owner !== id ||
        claim.completed_at ||
        claim.lease_until <= now
      ) {
        active = null;
        sim.phase = 'ready';
        sim.covered.clear();
      }
    }
    try {
      const run = runFlight(
        serialize(sim),
        p.season === season.id ? command.steps : [],
        credit,
      );
      sim = run.sim;
      credit = run.remaining;
    } catch (e) {
      throw new CountyError(
        e instanceof Error ? e.message : 'Invalid flight clock.',
        409,
      );
    }
    let selected =
      active === null
        ? null
        : (seasonJobs(season).find((j) => j.id === active) ?? null);
    let finished: number | null = null;
    let callsign = p.callsign;
    switch (command.action) {
      case 'claim': {
        const job = seasonJobs(season).find((j) => j.id === command.jobId);
        if (!job || job.opensAt > now)
          throw new CountyError(
            'That field is not available in this season.',
            409,
          );
        selected = job;
        active = job.id;
        sim.reset(job);
        credit = 0.15;
        break;
      }
      case 'finish':
        if (active === null || !sim.finish())
          throw new CountyError(
            'Reach the coverage target before completing this contract.',
            409,
          );
        finished = active;
        active = null;
        break;
      case 'pause':
        if (sim.phase === 'flying') sim.phase = 'paused';
        sim.spraying = false;
        break;
      case 'resume':
        if (sim.phase === 'paused' || sim.phase === 'ready')
          sim.phase = 'flying';
        break;
      case 'refill':
        if (active === null)
          throw new CountyError('Claim a field before refilling.', 409);
        sim.refill();
        break;
      case 'retry':
        if (active === null)
          throw new CountyError('This field is no longer reserved.', 409);
        sim.reset();
        break;
      case 'release':
        active = null;
        sim.phase = 'ready';
        sim.spraying = false;
        sim.covered.clear();
        break;
      case 'upgrade':
        if (!command.upgrade || !sim.buy(command.upgrade))
          throw new CountyError('You cannot purchase that upgrade yet.', 409);
        break;
      case 'rename':
        callsign = command.callsign!;
        break;
      case 'join':
        if (sim.phase === 'flying') sim.phase = 'paused';
        break;
    }
    // The first statement wins the player revision and contract claim atomically.
    // Every following write is conditional on that exact winning request.
    let gate = '',
      gateArgs: unknown[] = [];
    if (command.action === 'claim') {
      gate =
        ' AND NOT EXISTS (SELECT 1 FROM field_claims WHERE id = ? AND (completed_at IS NOT NULL OR (owner != ? AND lease_until > ?)))';
      gateArgs = [selected!.id, id, now];
    } else if (
      oldActive !== null &&
      claim &&
      claim.owner === id &&
      claim.lease_until > now &&
      !claim.completed_at &&
      command.action !== 'release'
    ) {
      gate =
        ' AND EXISTS (SELECT 1 FROM field_claims WHERE id = ? AND owner = ? AND lease_until > ? AND completed_at IS NULL)';
      gateArgs = [oldActive, id, now];
    }
    const rev = p.revision + 1;
    const winner =
      'EXISTS (SELECT 1 FROM pilots WHERE id = ? AND revision = ? AND request_id = ?)';
    const winArgs = [id, rev, command.requestId];
    const writes = [
      this.db
        .prepare(
          `UPDATE pilots SET callsign=?,state=?,revision=?,request_id=?,season=?,active_job=?,seen_at=?,credit=?,updated_at=? WHERE id=? AND revision=? AND (seen_at > ? OR (SELECT COUNT(*) FROM pilots WHERE seen_at > ?) < ?)${gate}`,
        )
        .bind(
          callsign,
          JSON.stringify(serialize(sim)),
          rev,
          command.requestId,
          season.id,
          active,
          now,
          credit,
          now,
          id,
          p.revision,
          now - liveWindow,
          now - liveWindow,
          MAX_PILOTS,
          ...gateArgs,
        ),
    ];
    if (command.action === 'claim') {
      writes.push(
        this.db
          .prepare(
            `UPDATE field_claims SET lease_until=0 WHERE owner=? AND id!=? AND completed_at IS NULL AND ${winner}`,
          )
          .bind(id, selected!.id, ...winArgs),
      );
      writes.push(
        this.db
          .prepare(
            `INSERT INTO field_claims(id,season,owner,lease_until,coverage) SELECT ?,?,?,?,0 WHERE ${winner} ON CONFLICT(id) DO UPDATE SET owner=excluded.owner,lease_until=excluded.lease_until,coverage=0 WHERE field_claims.completed_at IS NULL AND (field_claims.owner=excluded.owner OR field_claims.lease_until<=?)`,
          )
          .bind(selected!.id, season.id, id, now + LEASE_MS, ...winArgs, now),
      );
    } else if (finished !== null) {
      writes.push(
        this.db
          .prepare(
            `UPDATE field_claims SET completed_at=?,coverage=?,lease_until=0 WHERE id=? AND owner=? AND completed_at IS NULL AND ${winner}`,
          )
          .bind(now, sim.coverage, finished, id, ...winArgs),
      );
      writes.push(
        this.db
          .prepare(
            `INSERT INTO payouts(job,season,pilot,earnings,acres,coverage,elapsed,completed_at) SELECT ?,?,?,?,?,?,?,? WHERE ${winner} AND EXISTS(SELECT 1 FROM field_claims WHERE id=? AND owner=? AND completed_at=?) ON CONFLICT(job) DO NOTHING`,
          )
          .bind(
            finished,
            season.id,
            id,
            sim.result.pay + sim.result.bonus,
            (sim.job.acres * sim.coverage) / 100,
            sim.coverage,
            sim.elapsed,
            now,
            ...winArgs,
            finished,
            id,
            now,
          ),
      );
    } else if (active !== null) {
      // Only new coverage renews a reservation; circling or idling cannot hold it forever.
      writes.push(
        this.db
          .prepare(
            `UPDATE field_claims SET coverage=?,lease_until=CASE WHEN ? THEN ? ELSE lease_until END WHERE id=? AND owner=? AND completed_at IS NULL AND ${winner}`,
          )
          .bind(
            sim.coverage,
            sim.coverage > (claim?.coverage ?? 0) ? 1 : 0,
            now + LEASE_MS,
            active,
            id,
            ...winArgs,
          ),
      );
    } else if (oldActive !== null) {
      writes.push(
        this.db
          .prepare(
            `UPDATE field_claims SET lease_until=0 WHERE id=? AND owner=? AND completed_at IS NULL AND ${winner}`,
          )
          .bind(oldActive, id, ...winArgs),
      );
    }
    const result = await this.db.batch(writes);
    if (!result[0].meta.changes)
      throw new CountyError(
        command.action === 'claim'
          ? 'Another pilot claimed or completed that field. Choose an open contract.'
          : 'Flight state changed or the county is full. Reconnect to continue.',
        409,
      );
    return this.snapshot(
      id,
      command.action === 'tick' && !command.refreshCounty,
    );
  }
}
