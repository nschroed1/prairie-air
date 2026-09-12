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
import { freshControls, ground } from '../lib/simulation';
import { fieldCells } from '../lib/field-geometry';
import { challengeWeather } from '../lib/challenge';
import { WEATHER_PERIOD } from '../lib/weather';

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

void test('the server supplies one county forecast to spectators and both pilots, then rolls it forward', async () => {
  const { command, service, advance } = setup();
  const a = await command('weather-alice', 'join');
  const b = await command('weather-bob', 'join');
  const spectator = await service.snapshot(null);
  assert.deepEqual(a.weather, b.weather);
  assert.deepEqual(a.weather, spectator.weather);
  assert.deepEqual(a.player!.flight.weather, a.weather);
  assert.equal(
    a.player!.flight.job.windStrength,
    undefined,
    'Public free flight does not inherit the practice lesson wind multiplier',
  );
  advance(WEATHER_PERIOD);
  const later = await command('weather-alice', 'tick');
  const other = await command('weather-bob', 'tick');
  assert.notEqual(later.weather!.id, a.weather!.id);
  assert.deepEqual(later.weather, other.weather);
  assert.deepEqual(later.player!.flight.weather, later.weather);
});

void test('the server derives career hazards, preserves the workshop tab, and replays the same local front', async () => {
  const { db, command, service } = setup();
  const id = 'veteran';
  await command(id, 'join');
  const row = (await service.pilot(id))!;
  const career = hydrate(JSON.parse(row.state));
  career.career.flights = 12;
  db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(
    JSON.stringify(serialize(career)),
    id,
  );
  const claimed = await command(id, 'claim', { jobId: 100 });
  const sim = hydrate(claimed.player!.flight);
  assert.equal(sim.job.challenge!.tier, 4);
  assert.equal(sim.job.pay, Math.round(sim.job.challenge!.basePay * 1.45));
  sim.elapsed = 120;
  sim.integrity = 82;
  sim.clog = 20;
  sim.wear = 16;
  sim.y = ground(sim.x, sim.z) + 120;
  const saved = JSON.stringify(serialize(sim));
  db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(saved, id);
  const predicted = hydrate(JSON.parse(saved));
  predicted.step(0.05, freshControls());
  const tick = await command(id, 'tick', {
    steps: [{ dt: 0.05, input: freshControls() }],
  });
  assert.deepEqual(tick.player!.flight, serialize(predicted));
  assert.deepEqual(
    tick.player!.flight.weather,
    challengeWeather(sim.job, 120.05),
  );
  const bill = predicted.serviceDue;
  const repaired = await command(id, 'refill');
  assert.equal(repaired.player!.flight.integrity, 100);
  assert.equal(repaired.player!.flight.clog, 0);
  assert.equal(hydrate(repaired.player!.flight).serviceDue, bill);
  const released = await command(id, 'release');
  assert.equal(hydrate(released.player!.flight).serviceDue, bill);
  const next = await command(id, 'claim', { jobId: 101 });
  const finish = hydrate(next.player!.flight);
  finish.covered = new Set(fieldCells(finish.job).keys());
  const projected = finish.projectedPay;
  db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(
    JSON.stringify(serialize(finish)),
    id,
  );
  const paid = await command(id, 'finish');
  assert.equal(paid.player!.flight.result.total, projected);
  assert.equal(paid.standings[0].earnings, projected);
  assert.equal(
    paid.player!.flight.result.maintenance + paid.player!.flight.result.repairs,
    bill,
  );
});

void test('unpaid damage and maintenance carry across the season boundary', async () => {
  const { db, command, service, advance } = setup();
  const id = 'workshop-credit';
  await command(id, 'join');
  const row = (await service.pilot(id))!,
    sim = hydrate(JSON.parse(row.state));
  sim.integrity = 0;
  sim.wear = 23;
  sim.career.repairDebt = 700;
  db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(
    JSON.stringify(serialize(sim)),
    id,
  );
  advance(SEASON_MS);
  const newSeason = await command(id, 'join');
  assert.equal(newSeason.player!.flight.career.repairDebt, 1200);
  assert.equal(newSeason.player!.flight.career.maintenanceDebt, 23);
  assert.equal(newSeason.player!.flight.integrity, 100);
});

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

void test('the advertised front arrives exactly on schedule and stronger seasonal weather is shared', async () => {
  const { command, service, advance } = setup();
  const first = await command('forecast-pilot', 'join');
  assert.equal(first.weather!.severity, 'Gentle');
  const nextAt = first.weather!.nextChangeAt!;
  advance(nextAt - first.now);
  const next = await command('forecast-pilot', 'tick');
  assert.deepEqual(next.weather, first.nextWeather);
  assert.deepEqual(next.player!.flight.weather, first.nextWeather);
  const fallTime = SEASON_EPOCH + (SEASON_MS * 2) / 3;
  advance(fallTime - next.now - 1);
  const beforeFall = await service.snapshot(null);
  assert.equal(beforeFall.weather!.severity, 'Challenging');
  assert.equal(beforeFall.weather!.nextChangeAt, fallTime);
  advance(1);
  const fall = await command('forecast-pilot', 'tick');
  assert.equal(fall.weather!.severity, 'Demanding');
  assert.deepEqual(fall.weather, beforeFall.nextWeather);
  assert.deepEqual(fall.player!.flight.weather, fall.weather);
  advance(SEASON_MS / 3);
  const newSeason = await command('forecast-pilot', 'tick');
  assert.equal(newSeason.weather!.severity, 'Gentle');
  assert.equal(
    newSeason.compact,
    false,
    'Season turnover must refresh the board and all rivals',
  );
  assert.equal(newSeason.jobs.length, 60);
  assert.ok(newSeason.jobs.every((job) => job.season === newSeason.season.id));
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
  assert.equal(finished.player!.flight.career.cash, 1900);
  assert.equal(finished.jobs[0].status, 'complete');
  assert.equal(finished.standings[0].jobs, 1);
  const retry = await service.command('alice', receipt);
  assert.equal(retry.player!.flight.career.cash, 1900);
  assert.equal(retry.standings[0].jobs, 1);
  await assert.rejects(command('alice', 'claim', { jobId: 100 }), /completed/);
  advance(SEASON_MS);
  const next = await command('alice', 'join');
  assert.equal(next.player!.flight.career.cash, 1900);
  assert.equal(next.standings.length, 0);
  assert.equal(next.previousStandings[0].earnings, 1900);
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
  assert.equal(
    result.total,
    1650 +
      result.cleanBonus +
      result.speedBonus +
      result.stuntBonus -
      result.penalty -
      result.maintenance -
      result.repairs,
  );
  assert.ok(result.maintenance > 0);
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

void test('free flight refill and retry succeed without 409 errors', async () => {
  const { command, service } = setup();
  await command('alice', 'join');

  // Verify Alice has no active job (Free Flight)
  const initial = await service.pilot('alice');
  assert.equal(initial!.active_job, null);

  // 1. Refill in free flight replenishes tank and does not throw 409
  const refilled = await command('alice', 'refill');
  assert.equal(refilled.player?.flight.tank, 100);
  assert.equal(refilled.player?.activeJob, null);

  // 2. Retry in free flight repairs and respawns without throwing 409
  const retried = await command('alice', 'retry');
  assert.equal(retried.player?.flight.phase, 'ready');
  assert.equal(retried.player?.flight.x, -170);
  assert.equal(retried.player?.flight.z, 400);
  assert.equal(retried.player?.activeJob, null);
});

void test('refill grants at least 60s lease buffer to return to field', async () => {
  const { command, service, advance } = setup();
  await command('alice', 'join');
  await command('alice', 'claim', { jobId: 100 });

  // Advance time by 100 seconds (lease has only 20s remaining)
  advance(100000);

  // Alice refills chemical
  await command('alice', 'refill');

  // Verify claim has at least 60s lease remaining
  const claim = await (service.store as unknown as { claim: (id: number) => Promise<{ lease_until: number }> }).claim(100);
  const now = service.now();
  assert.ok(
    claim.lease_until >= now + 60000,
    `Lease until (${claim.lease_until}) must be at least now + 60s (${now + 60000})`,
  );
});


void test('public skywriting is exclusive, replays smoke server-side, pays once, and awards no farmland acres', async () => {
  const { skyInput } = await import('./helpers/sky-flight');
  const { db, command, service, advance } = setup();
  advance(SEASON_MS);
  const first = await command('sky-alice', 'join');
  const job = first.jobs.find(
    (j) => j.kind === 'skywriting' && j.status === 'open',
  )!;
  assert.ok(job);
  await assert.rejects(
    () => command('sky-alice', 'claim', { jobId: job.id }),
    /Complete three jobs/,
  );
  for (const id of ['sky-alice', 'sky-bob']) {
    await command(id, 'join');
    const row = (await service.pilot(id))!;
    const sim = hydrate(JSON.parse(row.state));
    sim.career.flights = 3;
    db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(
      JSON.stringify(serialize(sim)),
      id,
    );
  }
  let snapshot = await command('sky-alice', 'claim', { jobId: job.id });
  await assert.rejects(
    () => command('sky-bob', 'claim', { jobId: job.id }),
    /Another pilot/,
  );
  await assert.rejects(
    () => command('sky-alice', 'finish'),
    /Finish the heart circuit/,
  );
  let sim = hydrate(snapshot.player!.flight);
  const forecast = structuredClone(sim.weather);
  for (let packet = 0; packet < 240 && !sim.completionReady; packet++) {
    const steps = [];
    for (let i = 0; i < 20 && !sim.completionReady; i++) {
      const step = { dt: 0.02, input: skyInput(sim) };
      sim.step(step.dt, step.input);
      steps.push(step);
    }
    advance(steps.length * 20);
    snapshot = await command('sky-alice', 'tick', { steps });
    assert.deepEqual(snapshot.player!.flight.skywriting, sim.skywriting);
    sim = hydrate(snapshot.player!.flight);
  }
  assert.equal(sim.completionReady, true);
  assert.deepEqual(sim.weather, forecast);
  const visible = (await service.snapshot('sky-bob')).pilots.find(
    (p) => p.id === 'sky-alice',
  )!;
  assert.equal(
    visible.skywriting!.smoke.length,
    8,
    'broadcast only a small recent tail',
  );
  const projected = sim.projectedPay;
  const paid = await command('sky-alice', 'finish');
  assert.equal(paid.player!.flight.result.total, projected);
  assert.equal(paid.standings[0].acres, 0);
  assert.equal(paid.standings[0].jobs, 1);
  assert.equal(paid.standings[0].earnings, projected);
  await assert.rejects(() => command('sky-alice', 'finish'));
  const resumed = await command('sky-alice', 'resume');
  assert.equal(resumed.player!.flight.phase, 'flying');
  assert.notEqual(resumed.player!.flight.job.kind, 'skywriting');
  assert.equal(resumed.player!.flight.skywriting, undefined);
});

void test('releasing a skywriting job clears its smoke and route from public free flight', async () => {
  const { db, command, service, advance } = setup();
  advance(SEASON_MS);
  const first = await command('sky-release', 'join');
  const row = (await service.pilot('sky-release'))!;
  const sim = hydrate(JSON.parse(row.state));
  sim.career.flights = 3;
  db.prepare('UPDATE pilots SET state = ? WHERE id = ?').run(
    JSON.stringify(serialize(sim)),
    'sky-release',
  );
  const job = first.jobs.find(
    (j) => j.kind === 'skywriting' && j.status === 'open',
  )!;
  await command('sky-release', 'claim', { jobId: job.id });
  const released = await command('sky-release', 'release');
  assert.equal(released.player!.activeJob, null);
  assert.notEqual(released.player!.flight.job.kind, 'skywriting');
  assert.equal(released.player!.flight.skywriting, undefined);
  const resumed = await command('sky-release', 'resume');
  assert.equal(resumed.player!.flight.phase, 'flying');
});
