import test from 'node:test';
import assert from 'node:assert/strict';
import { hydrate, serialize } from '../lib/county';
import {
  Simulation,
  contracts,
  freshControls,
  ground,
} from '../lib/simulation';

function roundTrip(sim: Simulation) {
  return hydrate(JSON.parse(JSON.stringify(serialize(sim))));
}

void test('older saved flights resume with a working tracker and no duplicate pickup grant', () => {
  const saved = serialize(new Simulation());
  delete saved.arcade;
  delete saved.collectibles;
  delete saved.inBarn;
  delete saved.inBarnInverted;
  delete saved.barnstormCount;
  delete saved.turnaroundCombo;
  delete saved.lastSprayExitTime;
  delete saved.lastSprayExitHeading;
  const restored = hydrate(saved);
  assert.equal(restored.arcade.passStreak, 1);
  assert.deepEqual(restored.collectibles, []);
  assert.equal(restored.barnstormCount, 0);
  restored.reset(contracts[0]);
  restored.step(0.05, freshControls());
  assert.ok(restored.collectibles.length > 0);
});

void test('server packet boundaries preserve flow rewards and ongoing clean-pass tracking', () => {
  const initial = new Simulation();
  initial.reset(contracts[0]);
  initial.x = initial.job.x;
  initial.z = initial.job.z + 80;
  initial.y = ground(initial.x, initial.z) + 19;
  initial.speed = initial.throttle = 34;
  const continuous = roundTrip(initial);
  let packeted = roundTrip(initial);
  const controls = { ...freshControls(), spray: true };

  for (let i = 0; i < 60; i++) {
    continuous.step(0.05, controls);
    packeted.step(0.05, controls);
    if (i % 4 === 3) packeted = roundTrip(packeted);
  }
  assert.ok(
    continuous.covered.size > 0,
    'The test must actually treat the field',
  );
  assert.ok(
    continuous.result.stuntBonus > 0,
    'A continuous pass earns flow rewards',
  );
  assert.equal(
    JSON.stringify(serialize(packeted)),
    JSON.stringify(serialize(continuous)),
  );
});

void test('collected pickups and a barn passage survive authoritative replay without another payout', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const pickup = sim.collectibles.find((item) => item.kind === 'cash')!;
  // Keep the flight safely above the terrain while crossing a collectible.
  pickup.x = sim.x;
  pickup.z = sim.z;
  pickup.y = sim.y;
  sim.step(0.05, freshControls());
  assert.equal(pickup.collected, true);
  const paid = sim.career.cash;
  sim.inBarn = true;
  sim.inBarnInverted = true;
  sim.barnstormCount = 2;
  sim.turnaroundCombo = 3;
  sim.lastSprayExitTime = sim.elapsed;
  sim.lastSprayExitHeading = sim.heading;

  const restored = roundTrip(sim);
  assert.deepEqual(restored.collectibles, sim.collectibles);
  assert.equal(restored.inBarn, true);
  assert.equal(restored.inBarnInverted, true);
  assert.equal(restored.barnstormCount, 2);
  assert.equal(restored.turnaroundCombo, 3);
  assert.equal(restored.lastSprayExitTime, sim.elapsed);
  restored.inBarn = false;
  restored.inBarnInverted = false;
  restored.step(0.05, freshControls());
  assert.equal(restored.career.cash, paid, 'A saved pickup cannot pay twice');
});
