import type { CountyCommand, CountyJob, Standing } from '../county';
import { MAX_PILOTS, LEASE_MS, initialFlight, serialize } from '../county';
import type { Simulation } from '../simulation';
export type PilotRow = {
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
export type ClaimRow = {
  id: number;
  season: number;
  owner: string;
  lease_until: number;
  coverage: number;
  completed_at: number | null;
  callsign: string;
};

export const liveWindow = 15000;
export type CountyWrite = {
  id: string;
  command: CountyCommand;
  now: number;
  season: ReturnType<typeof import('../county').seasonAt>;
  oldActive: number | null;
  claim: ClaimRow | null;
  p: PilotRow;
  sim: Simulation;
  active: number | null;
  selected: CountyJob | null;
  finished: number | null;
  callsign: string;
  credit: number;
};
export interface CountyStore {
  pilot(id: string): Promise<PilotRow | null>;
  standings(season: number): Promise<Standing[]>;
  claims(season: number): Promise<ClaimRow[]>;
  nearby(since: number): Promise<PilotRow[]>;
  claim(id: number): Promise<ClaimRow | null>;
  createPilot(id: string, season: number, now: number): Promise<void>;
  commit(write: CountyWrite): Promise<boolean>;
}
export class D1CountyStore implements CountyStore {
  constructor(public db: D1Database) {}
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

  async claims(season: number) {
    return (
      await this.db
        .prepare(
          'SELECT f.*, p.callsign FROM field_claims f LEFT JOIN pilots p ON p.id=f.owner WHERE f.season = ?',
        )
        .bind(season)
        .all<ClaimRow>()
    ).results;
  }
  async nearby(since: number) {
    return (
      await this.db
        .prepare(
          'SELECT id, callsign, state, seen_at FROM pilots WHERE seen_at > ? ORDER BY seen_at DESC LIMIT ?',
        )
        .bind(since, MAX_PILOTS)
        .all<PilotRow>()
    ).results;
  }
  claim(id: number) {
    return this.db
      .prepare('SELECT * FROM field_claims WHERE id = ?')
      .bind(id)
      .first<ClaimRow>();
  }
  async createPilot(id: string, season: number, now: number) {
    await this.db
      .prepare(
        'INSERT INTO pilots (id,callsign,state,revision,season,seen_at,credit,updated_at) SELECT ?,?,?,0,?,?,0.15,? WHERE (SELECT COUNT(*) FROM pilots WHERE seen_at > ?) < ? ON CONFLICT(id) DO NOTHING',
      )
      .bind(
        id,
        `Pilot ${id.slice(0, 6).toUpperCase()}`,
        JSON.stringify(initialFlight()),
        season,
        now,
        now,
        now - liveWindow,
        MAX_PILOTS,
      )
      .run();
  }
  async commit(write: CountyWrite) {
    const {
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
    } = write;
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
    return Boolean(result[0].meta.changes);
  }
}
