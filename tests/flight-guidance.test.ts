import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Simulation,
  contracts,
  fieldCellCount,
  fieldSize,
  freshControls,
  ground,
} from '../lib/simulation';
import { seasonAt, seasonJobs, hydrate, serialize } from '../lib/county';
import {
  flightPasses,
  nextPass,
  lineUpLesson,
  spraySafety,
  sprayFootprint,
  coachMessage,
  loadPracticeBests,
  isPersonalBest,
  debriefTip,
} from '../lib/flight-guidance';

void test('the starter uses four short strips; public county dimensions and scoring stay unchanged', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  assert.equal(fieldCellCount(sim.job), 384);
  assert.equal(flightPasses(sim).length, 4);
  sim.career.upgrades.boom = 3;
  sim.reset(contracts[0]);
  assert.equal(
    sim.x,
    nextPass(sim).x,
    'An upgraded aircraft starts on its wider first strip',
  );
  sim.z = 0;
  sim.y = ground(sim.x, sim.z) + 19;
  assert.equal(spraySafety(sim), 'safe');
  for (const job of seasonJobs(seasonAt())) {
    assert.deepEqual(fieldSize(job), { width: 456, depth: 452 });
    assert.equal(fieldCellCount(job), 1444);
    assert.equal(job.windStrength, undefined);
  }
});

void test('flying the guided starter strips can complete the contract and fund a first upgrade', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const seen = new Set<number>();
  for (let pass = 0; pass < 4; pass++) {
    const guide = nextPass(sim);
    seen.add(guide.index);
    assert.equal(lineUpLesson(sim), true);
    const direction = Math.cos(sim.heading);
    // Real flight steps, using the published preview cue to release spray.
    for (let frame = 0; frame < 1000; frame++) {
      const spray = spraySafety(sim) === 'safe';
      sim.step(1 / 60, { ...freshControls(), spray });
      assert.equal(sim.phase, 'flying');
      if ((sim.z - sim.job.z) * direction < -fieldSize(sim.job).depth / 2 - 20)
        break;
    }
  }
  assert.equal(
    seen.size,
    4,
    'The guidance must advance through all four strips',
  );
  assert.ok(
    sim.coverage >= sim.job.target,
    `Starter coverage: ${sim.coverage}`,
  );
  assert.ok(
    sim.oversprayAcres < 0.01,
    `Clean guided flight overspray: ${sim.oversprayAcres}`,
  );
  assert.ok(
    sim.elapsed < 180,
    'Straight flight portions fit a short first lesson',
  );
  assert.equal(sim.finish(), true);
  assert.ok(sim.result.total >= 750);
  assert.equal(sim.buy('stability'), true);
  assert.equal(sim.finish(), false, 'A debrief cannot pay twice');
});

void test('spraying unassigned corn beside a starter plot incurs overspray without coverage', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.paint(175, 0, 0.05);
  assert.equal(sim.coverage, 0);
  assert.ok(sim.oversprayAcres > 0);
  for (let x = -90; x <= 90; x += 12)
    for (let z = -138; z <= 138; z += 12) sim.paint(x, z, 0.01);
  assert.equal(sim.coverage, 100);
  assert.equal(sim.covered.size, 384);
  const restored = hydrate(serialize(sim));
  assert.equal(restored.coverage, 100);
  assert.equal(restored.job.width, 192);
});

void test('the footprint warns before the edge and includes wind drift and upgraded boom width', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.x = 0;
  sim.z = 0;
  sim.y = ground(0, 0) + 19;
  assert.equal(spraySafety(sim), 'safe');
  sim.z = -125;
  sim.y = ground(sim.x, sim.z) + 19;
  assert.equal(spraySafety(sim), 'edge');
  assert.equal(coachMessage(sim).step, 2);
  sim.x = 60;
  sim.z = 0;
  sim.y = ground(sim.x, sim.z) + 19;
  assert.equal(spraySafety(sim), 'safe');
  sim.career.upgrades.boom = 3;
  assert.equal(spraySafety(sim), 'outside');
  const snapshot = serialize(sim);
  sprayFootprint(sim);
  spraySafety(sim);
  nextPass(sim);
  assert.deepEqual(
    serialize(sim),
    snapshot,
    'Guidance must not change authoritative flight state',
  );
  sim.reset(contracts[1]);
  const footprint = sprayFootprint(sim);
  assert.ok(
    footprint.reduce((sum, point) => sum + point.x, 0) / 4 > sim.x,
    'A west wind carries treatment east of the aircraft',
  );
});

void test('the second job creates stronger physical drift than the first lesson', () => {
  const displacement = (job: (typeof contracts)[number]) => {
    const sim = new Simulation();
    sim.reset(job);
    const x = sim.x;
    for (let i = 0; i < 60; i++) sim.step(1 / 60, freshControls());
    return sim.x - x;
  };
  assert.ok(displacement(contracts[1]) > displacement(contracts[0]) * 8);
});

void test('line-up assistance is only for the flying starter and preserves resources and earnings', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.paint(0, 0, 0.05);
  sim.paint(175, 0, 0.05);
  sim.tank = 41;
  const before = {
    coverage: sim.coverage,
    penalty: sim.oversprayAcres,
    cash: sim.career.cash,
  };
  assert.equal(lineUpLesson(sim), true);
  assert.equal(sim.tank, 41);
  assert.equal(sim.coverage, before.coverage);
  assert.equal(sim.oversprayAcres, before.penalty);
  assert.equal(sim.career.cash, before.cash);
  sim.phase = 'paused';
  assert.equal(lineUpLesson(sim), false);
  sim.reset(contracts[1]);
  assert.equal(lineUpLesson(sim), false);
  sim.reset(seasonJobs(seasonAt())[0]);
  assert.equal(lineUpLesson(sim), false);
});

void test('practice bests persist safely and prefer higher pay then coverage, waste and flight time', () => {
  const best = { total: 950, coverage: 98, oversprayAcres: 1.25, elapsed: 120 };
  assert.deepEqual(loadPracticeBests(JSON.stringify({ 0: best })), { 0: best });
  for (const raw of [null, 'broken', 'null', '[]', '{"0":{"total":-1}}'])
    assert.deepEqual(loadPracticeBests(raw), {});
  assert.equal(isPersonalBest(best), true);
  assert.equal(isPersonalBest(best, best), false);
  assert.equal(isPersonalBest({ ...best, total: 1000 }, best), true);
  assert.equal(isPersonalBest({ ...best, coverage: 99 }, best), true);
  assert.equal(
    isPersonalBest({ ...best, total: 900, elapsed: 30 }, best),
    false,
  );
  assert.equal(isPersonalBest({ ...best, elapsed: 100 }, best), true);
});

void test('debrief coaching explains deductions before suggesting extra coverage', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.result.penalty = 1;
  assert.match(debriefTip(sim), /footprint is amber/);
  sim.result.penalty = 0;
  assert.match(debriefTip(sim), /dark strips/);
  sim.result.bonus = 250;
  assert.match(debriefTip(sim), /Willow Creek/);
});
