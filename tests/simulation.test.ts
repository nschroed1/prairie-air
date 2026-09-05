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
} from '../lib/simulation';

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
