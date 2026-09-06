import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { CountyService } from '../lib/server/county-service';
import {
  seasonAt,
  seasonJobs,
  SEASON_EPOCH,
  SEASON_MS,
  validateCommand,
  runFlight,
  initialFlight,
  serialize,
  hydrate,
  type CountyCommand,
} from '../lib/county';
import { freshControls } from '../lib/simulation';

class TestStatement {
  args: SQLInputValue[] = [];
  constructor(
    public db: DatabaseSync,
    public sql: string,
  ) {}
  bind(...args: SQLInputValue[]) {
    this.args = args;
    return this;
  }
  first() {
    return Promise.resolve(this.db.prepare(this.sql).get(...this.args) ?? null);
  }
  all() {
    return Promise.resolve({
      results: this.db.prepare(this.sql).all(...this.args),
    });
  }
  run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return Promise.resolve({
      meta: { changes: Number(result.changes) },
      results: [],
    });
  }
}
function setup() {
  const db = new DatabaseSync(':memory:');
  db.exec(
    readFileSync(
      new URL('../drizzle/0000_nasty_darkhawk.sql', import.meta.url),
      'utf8',
    ),
  );
  let batchQueue: Promise<unknown> = Promise.resolve();
  const adapter = {
    prepare: (sql: string) => new TestStatement(db, sql),
    batch(statements: TestStatement[]) {
      const execution = batchQueue.then(async () => {
        db.exec('BEGIN');
        try {
          const result = [];
          for (const statement of statements)
            result.push(await statement.run());
          db.exec('COMMIT');
          return result;
        } catch (e) {
          db.exec('ROLLBACK');
          throw e;
        }
      });
      batchQueue = execution.catch(() => {});
      return execution;
    },
  };
  let now = SEASON_EPOCH + 1000;
  const service = new CountyService(
    adapter as unknown as D1Database,
    () => now,
  );
  const command = async (
    id: string,
    action: CountyCommand['action'],
    extra: Partial<CountyCommand> = {},
  ) => {
    const p = await service.pilot(id);
    return service.command(id, {
      requestId: crypto.randomUUID(),
      revision: p?.revision ?? 0,
      action,
      steps: [],
      ...extra,
    });
  };
  return { db, service, command, advance: (ms: number) => (now += ms) };
}

void test('simultaneous claims have one winner and leave the loser without a reservation', async () => {
  const { command, service } = setup();
  await command('alice', 'join');
  await command('bob', 'join');
  const outcomes = await Promise.allSettled([
    command('alice', 'claim', { jobId: 100 }),
    command('bob', 'claim', { jobId: 100 }),
  ]);
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1);
  const a = await service.pilot('alice'),
    b = await service.pilot('bob');
  assert.equal([a, b].filter((p) => p!.active_job === 100).length, 1);
});

void test('empty circling does not renew a claim; genuine new coverage does', async () => {
  const { command, service, advance, db } = setup();
  await command('alice', 'join');
  await command('alice', 'claim', { jobId: 100 });
  const initial = (await service.snapshot(null)).jobs[0].leaseUntil;
  advance(45000);
  await command('alice', 'tick');
  assert.equal((await service.snapshot(null)).jobs[0].leaseUntil, initial);
  const row = (await service.pilot('alice'))!,
    sim = hydrate(JSON.parse(row.state));
  sim.covered.add(100);
  db.prepare('UPDATE pilots SET state=? WHERE id=?').run(
    JSON.stringify(serialize(sim)),
    'alice',
  );
  await command('alice', 'tick');
  assert.ok((await service.snapshot(null)).jobs[0].leaseUntil > initial);
});
void test('a season has exactly 60 unique physical fields, 20 jobs per scheduled wave', () => {
  const s = seasonAt(SEASON_EPOCH),
    jobs = seasonJobs(s);
  assert.equal(jobs.length, 60);
  assert.equal(new Set(jobs.map((j) => `${j.x},${j.z}`)).size, 60);
  assert.equal(jobs.filter((j) => j.status === 'open').length, 20);
  assert.equal(
    seasonJobs(seasonAt(SEASON_EPOCH + SEASON_MS / 2)).filter(
      (j) => j.status === 'open',
    ).length,
    40,
  );
  assert.equal(seasonAt(SEASON_EPOCH + SEASON_MS).id, 1);
  assert.equal(
    seasonJobs(seasonAt(SEASON_EPOCH + SEASON_MS))[0].id,
    jobs[0].id + 1000,
  );
});
void test('a field can only be claimed by one pilot and future jobs cannot be claimed', async () => {
  const { command, service } = setup();
  await command('alice', 'join');
  await command('bob', 'join');
  await command('alice', 'claim', { jobId: 100 });
  await assert.rejects(command('bob', 'claim', { jobId: 100 }), /claimed/);
  await assert.rejects(
    command('bob', 'claim', { jobId: 140 }),
    /not available/,
  );
  const world = await service.snapshot(null);
  assert.equal(world.jobs[0].owner, 'alice');
  assert.equal(world.jobs[0].status, 'claimed');
  assert.equal(world.pilots.length, 2);
});
void test('stale claims release after two minutes; completed fields never reopen', async () => {
  const { command, service, advance } = setup();
  await command('alice', 'join');
  await command('bob', 'join');
  await command('alice', 'claim', { jobId: 100 });
  advance(120001);
  await command('bob', 'claim', { jobId: 100 });
  const world = await service.snapshot('alice');
  assert.equal(world.jobs[0].owner, 'bob');
  await command('alice', 'tick');
  assert.equal((await service.pilot('alice'))!.active_job, null);
});
void test('server coverage is required, payment is once-only, and a season archives the score', async () => {
  const { command, service, db, advance } = setup();
  await command('alice', 'join');
  await command('alice', 'claim', { jobId: 100 });
  await assert.rejects(command('alice', 'finish'), /coverage target/);
  // Seed a server-owned flight fixture at a completed pass, never client-submitted coverage.
  const p = (await service.pilot('alice'))!,
    sim = hydrate(JSON.parse(p.state));
  for (let i = 0; i < 1444; i++) sim.covered.add(i);
  db.prepare('UPDATE pilots SET state=? WHERE id=?').run(
    JSON.stringify(serialize(sim)),
    'alice',
  );
  const receipt = {
    requestId: crypto.randomUUID(),
    revision: p.revision,
    action: 'finish' as const,
    steps: [],
  };
  const finished = await service.command('alice', receipt);
  assert.equal(finished.player!.flight.career.cash, 1650);
  assert.equal(finished.jobs[0].status, 'complete');
  assert.equal(finished.standings[0].jobs, 1);
  const retry = await service.command('alice', receipt);
  assert.equal(retry.player!.flight.career.cash, 1650);
  assert.equal(retry.standings[0].jobs, 1);
  await assert.rejects(command('alice', 'claim', { jobId: 100 }), /completed/);
  advance(SEASON_MS);
  const next = await command('alice', 'join');
  assert.equal(next.player!.flight.career.cash, 1650);
  assert.equal(next.standings.length, 0);
  assert.equal(next.previousStandings[0].earnings, 1650);
  assert.equal(next.jobs[0].status, 'open');
});
void test('the server records off-field discharge, preserves it on refill, and ranks only net earnings', async () => {
  const { command, service, advance, db } = setup();
  await command('alice', 'join');
  await command('alice', 'claim', { jobId: 100 });
  advance(1000);
  const sprayed = await command('alice', 'tick', {
    steps: Array.from({ length: 20 }, () => ({
      dt: 0.05,
      input: { ...freshControls(), spray: true },
    })),
  });
  const acres = sprayed.player!.flight.oversprayAcres!;
  assert.ok(acres > 0, 'The spawn approach is outside the claimed field');
  const refilled = await command('alice', 'refill');
  assert.equal(refilled.player!.flight.oversprayAcres, acres);
  const sim = hydrate(refilled.player!.flight);
  // The coverage fixture is server-owned; clients only submit bounded inputs.
  for (let i = 0; i < 1444; i++) sim.covered.add(i);
  db.prepare('UPDATE pilots SET state=? WHERE id=?').run(
    JSON.stringify(serialize(sim)),
    'alice',
  );
  const receipt = {
    requestId: crypto.randomUUID(),
    revision: refilled.player!.revision,
    action: 'finish' as const,
    steps: [],
  };
  const completed = await service.command('alice', receipt);
  const result = completed.player!.flight.result;
  assert.ok(result.penalty > 0);
  assert.equal(result.total, 1650 - result.penalty);
  assert.equal(completed.player!.flight.career.cash, result.total);
  assert.equal(completed.standings[0].earnings, result.total);
  const retry = await service.command('alice', receipt);
  assert.equal(retry.player!.flight.career.cash, result.total);
  assert.equal(retry.standings[0].jobs, 1);
});
void test('stale revisions cannot overwrite a newer flight or buy free upgrades', async () => {
  const { command, service } = setup();
  const joined = await command('alice', 'join');
  const revision = joined.player!.revision;
  await command('alice', 'rename', { callsign: 'Prairie Pilot' });
  await assert.rejects(
    service.command('alice', {
      requestId: crypto.randomUUID(),
      revision,
      action: 'tick',
      steps: [],
    }),
    /another tab/,
  );
  await assert.rejects(
    command('alice', 'upgrade', { upgrade: 'tank' }),
    /cannot purchase/,
  );
});
void test('input packets enforce bounded clocks and reject malformed controls', () => {
  const valid = {
    requestId: crypto.randomUUID(),
    revision: 0,
    action: 'tick',
    steps: [{ dt: 0.05, input: freshControls() }],
  };
  assert.equal(validateCommand(valid).steps.length, 1);
  assert.throws(() =>
    validateCommand({ ...valid, steps: [{ dt: NaN, input: freshControls() }] }),
  );
  assert.throws(() =>
    validateCommand({
      ...valid,
      steps: [{ dt: 0.05, input: { spray: true } }],
    }),
  );
  assert.throws(() => runFlight(initialFlight(), valid.steps, 0.01), /ahead/);
});
void test('switching fields releases the old claim and keeps one active job per pilot', async () => {
  const { command, service } = setup();
  await command('alice', 'join');
  await command('alice', 'claim', { jobId: 100 });
  const state = await command('alice', 'claim', { jobId: 101 });
  assert.equal(state.jobs[0].status, 'open');
  assert.equal(state.jobs[1].status, 'claimed');
  assert.equal((await service.pilot('alice'))!.active_job, 101);
});
