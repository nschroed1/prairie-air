import { countyWeather } from '../weather';
import {
  D1CountyStore,
  liveWindow,
  type CountyStore,
  type ClaimRow,
} from './county-store';
import { Simulation, ground } from '../simulation';
import { freshSkywriting, SKYWRITING_UNLOCK } from '../skywriting';
import {
  seasonAt,
  seasonJobs,
  serialize,
  hydrate,
  runFlight,
  MAX_PILOTS,
  practiceContract,
  type CountyCommand,
  type CountySnapshot,
  type FlightState,
  type PublicPilot,
} from '../county';

export class CountyError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export class CountyService {
  store: CountyStore;
  constructor(
    db: D1Database | CountyStore,
    public now: () => number = Date.now,
  ) {
    this.store = 'prepare' in db ? new D1CountyStore(db) : db;
  }
  pilot(id: string) {
    return this.store.pilot(id);
  }
  standings(season: number) {
    return this.store.standings(season);
  }
  forecast(now: number) {
    const season = seasonAt(now);
    const weather = countyWeather(now, season.phaseIndex);
    return {
      ...weather,
      nextChangeAt: Math.min(weather.nextChangeAt!, season.nextWaveAt),
    };
  }
  async snapshot(
    viewerId: string | null,
    compact = false,
  ): Promise<CountySnapshot> {
    const now = this.now(),
      season = seasonAt(now),
      weather = this.forecast(now);
    const [claims, nearby, standings, previousStandings, player] =
      await Promise.all([
        compact
          ? Promise.resolve([] as ClaimRow[])
          : this.store.claims(season.id),
        this.store.nearby(now - liveWindow),
        compact ? Promise.resolve([]) : this.standings(season.id),
        compact ? Promise.resolve([]) : this.standings(season.id - 1),
        viewerId ? this.pilot(viewerId) : null,
      ]);
    const byId = new Map(claims.map((c) => [c.id, c]));
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
    const pilots: PublicPilot[] = nearby.map((p) => {
      const f = hydrate(JSON.parse(p.state) as FlightState);
      return {
        id: p.id,
        callsign: p.callsign,
        skywriting: f.isSkywriting
          ? {
              jobId: f.job.id,
              elapsed: f.elapsed,
              smoke: f.skywriting.smoke.slice(-8),
            }
          : undefined,
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
      weather,
      nextWeather: this.forecast(weather.nextChangeAt),
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
      await this.store.createPilot(id, season.id, now);
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
      sim.service();
      const carriedCareer = sim.career;
      sim = new Simulation();
      sim.career = carriedCareer;
      sim.career.completed = [];
      active = null;
      credit = 0.15;
    }
    const oldActive = active;
    let claim: ClaimRow | null = null;
    if (active !== null) {
      claim = await this.store.claim(active);
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
    // Apply a county-wide forecast after replaying already-recorded inputs.
    // Clients receive the new weather with this authoritative flight state.
    if (active === null || (!sim.job.challenge && !sim.isSkywriting))
      sim.weather = this.forecast(now);
    if (active === null && sim.phase !== 'complete' && sim.job.challenge)
      sim.job = {
        ...sim.job,
        pay: sim.job.challenge.basePay,
        challenge: undefined,
        noSprayZones: undefined,
      };
    if (active === null && sim.job.windStrength !== undefined)
      sim.job = { ...sim.job, windStrength: undefined };
    let selected =
      active === null
        ? null
        : (seasonJobs(season).find((j) => j.id === active) ?? null);
    // An already-claimed legacy field keeps its saved footprint and acreage.
    if (selected && sim.job.id === active)
      selected = {
        ...selected,
        ...sim.job,
        width: sim.job.width,
        depth: sim.job.depth,
        boundary: sim.job.boundary,
      };
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
        if (job.kind === 'skywriting' && sim.career.flights < SKYWRITING_UNLOCK)
          throw new CountyError(
            'Complete three jobs before taking a skywriting contract.',
            409,
          );
        active = job.id;
        sim.reset(job);
        credit = 0.15;
        break;
      }
      case 'finish':
        if (active === null || !sim.finish())
          throw new CountyError(
            sim.isSkywriting
              ? 'Finish the heart circuit with 80% written and 65% smoke accuracy.'
              : 'Reach the coverage target before completing this contract.',
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
        if (active === null && sim.isSkywriting && sim.phase === 'complete')
          sim.phase = 'ready';
        if (sim.phase === 'paused' || sim.phase === 'ready')
          sim.phase = 'flying';
        break;
      case 'refill':
        if (active === null) {
          sim.service();
          sim.crashReason = '';
          sim.inBarn = sim.inBarnInverted = false;
          sim.arcade.reset();
          sim.tank = sim.tankCapacity;
          sim.phase = 'flying';
          sim.spraying = false;
          sim.offTargetFraction = 0;
          sim.y = Math.max(sim.y, ground(sim.x, sim.z) + 38);
        } else {
          sim.refill();
        }
        break;
      case 'retry':
        if (active === null) {
          sim.service();
          sim.crashReason = '';
          sim.inBarn = sim.inBarnInverted = false;
          sim.arcade.reset();
          sim.tank = sim.tankCapacity;
          sim.x = -170;
          sim.z = 400;
          sim.y = ground(-170, 400) + 42;
          sim.heading = 0;
          sim.pitch = sim.roll = 0;
          sim.speed = 44;
          sim.throttle = 44;
          sim.phase = 'ready';
          sim.spraying = false;
          sim.offTargetFraction = 0;
        } else {
          sim.reset();
        }
        break;
      case 'release':
        sim.service();
        sim.job = {
          ...sim.job,
          pay: sim.job.challenge?.basePay ?? sim.job.pay,
          challenge: undefined,
          noSprayZones: undefined,
        };
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
    if (active === null && sim.isSkywriting && sim.phase !== 'complete') {
      sim.job = { ...practiceContract(), windStrength: undefined };
      sim.skywriting = freshSkywriting();
      sim.spraying = false;
    }
    const committed = await this.store.commit({
      id,
      command,
      now,
      season,
      oldActive,
      claim,
      p,
      sim,
      active,
      selected,
      finished,
      callsign,
      credit,
    });
    if (!committed)
      throw new CountyError(
        command.action === 'claim'
          ? 'Another pilot claimed or completed that field. Choose an open contract.'
          : 'Flight state changed or the county is full. Reconnect to continue.',
        409,
      );
    return this.snapshot(
      id,
      command.action === 'tick' &&
        !command.refreshCounty &&
        p.season === season.id,
    );
  }
}
