import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Simulation,
  freshControls,
  contracts,
  fields,
  ground,
  loadCareer,
  freshCareer,
  OVERSPRAY_PENALTY_PER_ACRE,
} from '../lib/simulation';
import { hydrate, serialize, type FlightState } from '../lib/county';

void test('starting each contract places aircraft at safe spraying altitude by the correct crop', () => {
  const sim = new Simulation();
  for (const job of contracts) {
    sim.reset(job);
    assert.equal(sim.phase, 'flying');
    assert.equal(sim.altitude, 19);
    assert.equal(sim.coverage, 0);
    assert.equal(
      fields.find((f) => f.x === job.x && f.z === job.z)?.crop,
      job.crop,
    );
  }
});
void test('parallel passes cover the field; repeat passes and off-field spraying do not inflate coverage', () => {
  const sim = new Simulation();
  sim.reset();
  sim.x = sim.z = 0;
  sim.y = ground(0, 0) + 19;
  sim.paint(0, 0, 0.016);
  const initial = sim.coverage;
  assert.ok(initial > 0);
  sim.paint(0, 0, 0.016);
  assert.equal(sim.coverage, initial);
  sim.paint(10000, 10000, 0.016);
  assert.equal(sim.coverage, initial);
  for (let x = -215; x <= 235; x += 45)
    for (let z = -230; z <= 230; z += 4) sim.paint(x, z, 0.016);
  assert.ok(sim.coverage >= 99, 'well-spaced passes can earn the top bonus');
  assert.ok(sim.coverage <= 100);
});
void test('wrong altitude and steep banks consume spray but cannot treat the field', () => {
  const sim = new Simulation();
  const input = { ...freshControls(), spray: true };
  sim.reset();
  sim.x = sim.z = 0;
  sim.y = ground(0, 0) + 70;
  sim.step(0.03, input);
  assert.equal(sim.coverage, 0);
  assert.ok(sim.tank < 100);
  sim.y = ground(sim.x, sim.z) + 19;
  sim.roll = 0.74;
  sim.step(0.03, { ...input, left: true });
  assert.equal(sim.coverage, 0);
  sim.roll = 0;
  sim.step(0.03, input);
  assert.ok(sim.coverage > 0);
});
void test('payment requires the target and is claimed only once; precision gets its bonus', () => {
  const sim = new Simulation();
  sim.reset();
  assert.equal(sim.finish(), false);
  for (let i = 0; i < 1156; i++) sim.covered.add(i);
  assert.equal(sim.finish(), true);
  assert.equal(sim.career.cash, 1200);
  assert.equal(sim.result.bonus, 0);
  assert.equal(sim.finish(), false);
  assert.equal(sim.career.cash, 1200);
  sim.reset();
  for (let i = 0; i < 1444; i++) sim.covered.add(i);
  assert.equal(sim.finish(), true);
  assert.equal(sim.result.bonus, 450);
  assert.equal(sim.career.cash, 2850);
  assert.deepEqual(sim.career.completed, [0]);
});
void test('upgrades enforce price and max level, and refill preserves progress', () => {
  const sim = new Simulation();
  sim.reset();
  assert.equal(sim.buy('tank'), false);
  sim.career.cash = 10000;
  for (let i = 0; i < 3; i++) assert.equal(sim.buy('tank'), true);
  assert.equal(sim.buy('tank'), false);
  assert.equal(sim.career.cash, 6400);
  assert.equal(sim.tankCapacity, 220);
  sim.paint(0, 0, 0.016);
  const before = sim.coverage;
  sim.tank = 0;
  sim.refill();
  assert.equal(sim.coverage, before);
  assert.equal(sim.tank, 220);
  assert.equal(sim.altitude, 19);
});
void test('flight turns and climbs, pauses safely, and ground impact restarts cleanly', () => {
  const sim = new Simulation();
  sim.reset();
  const x = sim.x,
    y = sim.y;
  for (let i = 0; i < 30; i++)
    sim.step(1 / 60, { ...freshControls(), left: true, up: true });
  assert.ok(sim.x < x);
  assert.ok(sim.y > y);
  sim.phase = 'paused';
  const z = sim.z;
  sim.step(0.05, freshControls());
  assert.equal(sim.z, z);
  sim.phase = 'flying';
  sim.y = ground(sim.x, sim.z) + 1;
  sim.step(0.01, freshControls());
  assert.equal(sim.phase, 'crashed');
  sim.reset();
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.coverage, 0);
});
void test('career saves round trip and invalid browser storage recovers safely', () => {
  const career = freshCareer();
  career.cash = 1200;
  career.upgrades.boom = 2;
  career.completed = [0];
  assert.deepEqual(loadCareer(JSON.stringify(career)), career);
  for (const raw of [null, 'broken', 'null', '{}', '{"cash":-30}'])
    assert.deepEqual(loadCareer(raw), freshCareer());
});

void test('overspray measures the part of the boom outside the actual field, including repeated discharge', () => {
  const sim = new Simulation();
  sim.reset();
  sim.paint(0, 0, 0.05);
  assert.equal(sim.oversprayAcres, 0);
  sim.x = 220;
  sim.z = 0;
  assert.equal(
    sim.inField,
    true,
    'The aircraft center can be inside while its boom crosses the edge',
  );
  sim.paint(220, 0, 0.05);
  const edge = sim.oversprayAcres;
  assert.ok(edge > 0);
  assert.ok(sim.offTargetFraction > 0 && sim.offTargetFraction < 1);
  const coverage = sim.coverage;
  sim.paint(600, 0, 0.05);
  const fullSwath = sim.oversprayAcres - edge;
  assert.ok(fullSwath > edge);
  assert.equal(sim.offTargetFraction, 1);
  assert.equal(sim.coverage, coverage);
  sim.paint(600, 0, 0.05);
  assert.ok(Math.abs(sim.oversprayAcres - edge - fullSwath * 2) < 1e-10);
  const end = new Simulation();
  end.reset();
  end.heading = Math.PI / 2;
  end.paint(0, 227, 0.05);
  assert.ok(
    end.oversprayAcres > 0,
    'The real north/south field edge is 226 m from center',
  );
});

void test('off-field acreage scales with time and boom width rather than frame count', () => {
  const amount = (frames: number, boom = 0) => {
    const sim = new Simulation();
    sim.reset();
    sim.career.upgrades.boom = boom;
    for (let i = 0; i < frames; i++) sim.paint(600, 0, 1 / frames);
    return sim.oversprayAcres;
  };
  assert.ok(Math.abs(amount(20) - amount(120)) < 1e-10);
  assert.ok(Math.abs(amount(60, 3) / amount(60) - 112 / 58) < 1e-10);
});

void test('banked or high off-field spraying still incurs a penalty, but idle and empty aircraft do not', () => {
  const sim = new Simulation();
  sim.reset();
  sim.x = 600;
  sim.z = 0;
  sim.y = ground(sim.x, sim.z) + 70;
  sim.roll = 0.7;
  sim.step(0.05, { ...freshControls(), spray: true, left: true });
  assert.ok(sim.oversprayAcres > 0);
  assert.equal(sim.coverage, 0);
  assert.equal(sim.overspraying, true);
  const sprayed = sim.oversprayAcres;
  sim.step(0.05, freshControls());
  assert.equal(sim.overspraying, false);
  sim.phase = 'paused';
  sim.step(0.05, { ...freshControls(), spray: true });
  assert.equal(sim.oversprayAcres, sprayed);
  sim.phase = 'flying';
  sim.tank = 0;
  sim.step(0.05, { ...freshControls(), spray: true });
  assert.equal(sim.oversprayAcres, sprayed);
  sim.tank = 0.00001;
  sim.step(0.05, { ...freshControls(), spray: true });
  assert.ok(
    sim.oversprayAcres - sprayed < 0.00002,
    'Only charge for the last liquid actually released',
  );
});

void test('overspray survives refill and serialization; restarting starts a fresh attempt', () => {
  const sim = new Simulation();
  sim.reset();
  sim.paint(600, 0, 0.05);
  sim.paint(0, 0, 0.05);
  const restored = hydrate(serialize(sim));
  assert.equal(restored.oversprayAcres, sim.oversprayAcres);
  restored.refill();
  assert.equal(restored.oversprayAcres, sim.oversprayAcres);
  assert.equal(restored.coverage, sim.coverage);
  restored.reset();
  assert.equal(restored.oversprayAcres, 0);
  assert.equal(restored.coverage, 0);
});

void test('overspray is deducted once from earned pay and bonus, with no negative payout', () => {
  const sim = new Simulation();
  sim.reset();
  for (let i = 0; i < 1444; i++) sim.covered.add(i);
  sim.oversprayAcres = 2.5;
  assert.equal(sim.finish(), true);
  assert.equal(sim.result.bonus, 450);
  assert.equal(sim.result.penalty, 2.5 * OVERSPRAY_PENALTY_PER_ACRE);
  assert.equal(sim.result.total, 1550);
  assert.equal(sim.career.cash, 1550);
  assert.equal(sim.career.totalEarned, 1550);
  assert.equal(sim.finish(), false);
  assert.equal(sim.career.cash, 1550);
  sim.reset();
  for (let i = 0; i < 1444; i++) sim.covered.add(i);
  sim.oversprayAcres = 10000;
  sim.finish();
  assert.equal(sim.result.penalty, 1650);
  assert.equal(sim.result.total, 0);
  assert.equal(sim.career.cash, 1550);
});

void test('older saved flights and completion receipts load without retroactive penalties', () => {
  const state = serialize(new Simulation());
  const {
    oversprayAcres: _acres,
    offTargetFraction: _fraction,
    result: _result,
    ...legacy
  } = state;
  const restored = hydrate({
    ...legacy,
    result: { pay: 1200, bonus: 450, coverage: 100 },
  } as FlightState);
  assert.equal(restored.oversprayAcres, 0);
  assert.equal(restored.oversprayPenalty, 0);
  assert.equal(restored.result.penalty, 0);
  assert.equal(restored.result.total, 1650);
});

void test('coverage at field edges stays on the existing saved map grid', () => {
  const sim = new Simulation();
  sim.reset();
  sim.paint(0, -210, 0.01);
  assert.deepEqual(
    [...new Set([...sim.covered].map((n) => Math.floor(n / 38)))].sort(),
    [1, 2],
    'The footprint matches the rows rendered by the existing world and map',
  );
  sim.paint(0, 225, 0.01);
  assert.ok([...sim.covered].some((n) => Math.floor(n / 38) === 37));
  assert.ok([...sim.covered].every((n) => Math.floor(n / 38) < 38));
});
