import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  prepareContract,
  challengeTier,
  challengeWeather,
  frontStageSeconds,
  birdFlock,
  locustSwarm,
  tornadoState,
} from '../lib/challenge';
import {
  Simulation,
  contracts,
  ground,
  freshControls,
  loadCareer,
  availableCash,
} from '../lib/simulation';
import { AudioCueTracker, audioFrame } from '../lib/game-audio';
import {
  fieldCells,
  insideField,
  polygonArea,
  fieldOutline,
} from '../lib/field-geometry';
import { hydrate, serialize, seasonAt, seasonJobs } from '../lib/county';
import { spraySafety, sprayFootprint } from '../lib/flight-guidance';
import { HazardWorld } from '../lib/hazard-world';

function pilot(flights: number, index = 2) {
  const sim = new Simulation();
  sim.career.flights = flights;
  sim.reset(contracts[index]);
  return sim;
}
function fullCoverage(sim: Simulation) {
  sim.covered = new Set(fieldCells(sim.job).keys());
}

void test('challenge unlocks follow completed jobs, frozen retries preserve hazards and danger pay', () => {
  assert.deepEqual(
    [0, 1, 2, 3, 4, 6, 7, 11, 12, 99].map(challengeTier),
    [0, 0, 1, 1, 2, 2, 3, 3, 4, 4],
  );
  const sim = pilot(3),
    plan = structuredClone(sim.job.challenge),
    pay = sim.job.pay;
  sim.reset();
  assert.deepEqual(sim.job.challenge, plan);
  assert.equal(sim.job.pay, pay);
  fullCoverage(sim);
  assert.equal(sim.finish(), true);
  sim.reset();
  assert.equal(sim.job.challenge!.tier, 2);
  assert.equal(sim.job.pay, Math.round(contracts[2].pay * 1.2));
  for (const n of [0, 1]) {
    const rookie = pilot(n);
    assert.equal(rookie.job.challenge!.obstacles.length, 0);
    assert.equal(birdFlock(rookie.job, 30), null);
    assert.equal(locustSwarm(rookie.job, 30), null);
    assert.equal(tornadoState(rookie.job, 130), null);
  }
});

void test('each contract has a clear window, a stronger rainy front, then relief; severity grows with experience', () => {
  let peak = 0;
  for (const flights of [0, 2, 4, 7, 12]) {
    const sim = pilot(flights),
      length = frontStageSeconds(sim.job.challenge!.tier);
    const calm = challengeWeather(sim.job, 0),
      rain = challengeWeather(sim.job, length * 2),
      relief = challengeWeather(sim.job, length * 4);
    assert.equal(calm.kind, 'clear');
    assert.equal(calm.rain, 0);
    assert.ok(
      rain.rain > 0 && rain.windMps > calm.windMps && rain.cloud > calm.cloud,
    );
    assert.ok(rain.windMps > peak);
    peak = rain.windMps;
    assert.equal(relief.rain, 0);
    assert.equal(relief.windMps, calm.windMps);
    const before = challengeWeather(sim.job, length * 2 - 0.001);
    assert.ok(
      Math.abs(before.windMps - rain.windMps) < 0.001,
      'Front transitions do not jump physics',
    );
  }
});

void test('yards remove exact coverage cells, stay off the first approach, and never make 100% treatment impossible', () => {
  for (const source of [
    contracts[0],
    contracts[1],
    ...seasonJobs(seasonAt()).filter((j) => j.kind !== 'skywriting').slice(0, 20),
  ]) {
    const sim = new Simulation();
    sim.career.flights = 12;
    sim.reset(source);
    assert.ok(
      !sim.job.noSprayZones!.some(
        (z) =>
          Math.abs(sim.x - sim.job.x - z.x) < z.width / 2 &&
          Math.abs(sim.z - sim.job.z - z.z) < z.depth / 2,
      ),
    );
    const cells = fieldCells(sim.job),
      expectedArea =
        polygonArea(fieldOutline(sim.job)) -
        sim.job.noSprayZones!.reduce((sum, z) => sum + z.width * z.depth, 0);
    const area = [...cells.values()].reduce(
      (sum, p) => sum + polygonArea(p),
      0,
    );
    assert.ok(Math.abs(area - expectedArea) < 1e-5);
    for (const [id, polygon] of cells) {
      const x =
        sim.job.x + polygon.reduce((n, p) => n + p.x, 0) / polygon.length;
      const z =
        sim.job.z + polygon.reduce((n, p) => n + p.z, 0) / polygon.length;
      sim.paint(x, z, 0.016);
      assert.ok(sim.covered.has(id));
    }
    assert.equal(sim.coverage, 100);
    assert.equal(sim.finish(), true);
  }
});

void test('spray footprint cannot bridge over a no-spray yard even when all four corners miss it', () => {
  const sim = pilot(4);
  const silo = sim.job.challenge!.obstacles.find((o) => o.kind === 'silo')!;
  sim.career.upgrades.boom = 3;
  sim.heading = Math.PI / 2;
  sim.x = sim.job.x + silo.x - sim.sprayDrift;
  sim.z = sim.job.z + silo.z - sim.sprayDriftZ;
  sim.y = ground(sim.x, sim.z) + 19;
  assert.ok(
    sprayFootprint(sim).every((p) =>
      insideField({ ...sim.job, noSprayZones: [] }, p.x, p.z),
    ),
    'All corners lie within the outer field',
  );
  assert.equal(spraySafety(sim), 'outside');
  const barn = sim.job.challenge!.obstacles[0];
  assert.equal(
    insideField(sim.job, sim.job.x + barn.x, sim.job.z + barn.z),
    false,
  );
});

void test('obstruction collisions use height; bird hits are recoverable and have a cooldown', () => {
  const sim = pilot(4),
    o = sim.job.challenge!.obstacles[0];
  sim.x = sim.job.x + o.x;
  sim.z = sim.job.z + o.z;
  sim.y = ground(sim.x, sim.z) + o.height + 10;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'flying');
  sim.y = ground(sim.x, sim.z) + 10;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'crashed');
  assert.equal(sim.integrity, 0);
  sim.reset();
  sim.elapsed = 10;
  const birds = birdFlock(sim.job, sim.elapsed)!;
  sim.x = birds.x;
  sim.z = birds.z;
  sim.y = ground(sim.x, sim.z) + birds.altitude;
  sim.stepHazards(0.05);
  assert.equal(sim.integrity, 82);
  assert.equal(sim.birdHits, 1);
  assert.equal(sim.phase, 'flying');
  sim.stepHazards(0.05);
  assert.equal(sim.integrity, 82);
  assert.equal(
    sim.repairsDue,
    590,
    'The earlier crash bill survives alongside the bird strike',
  );
});

void test('barnstorming: aligned low-level pass through barn corridor survives and awards stunt bonus', () => {
  const sim = pilot(4),
    barn = sim.job.challenge!.obstacles[0];
  assert.equal(barn.kind, 'barn');
  // Approach aligned with North-South corridor, level wings, sweet spot altitude (5.5m AGL)
  sim.x = sim.job.x + barn.x;
  sim.z = sim.job.z + barn.z - barn.bodyDepth / 2 - 10;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.heading = 0; // Flying North
  sim.roll = 0;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.inBarn, false);

  // Enter the barn corridor
  sim.z = sim.job.z + barn.z;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.inBarn, true);
  assert.equal(sim.barnstormed, false);

  // Exit the other side into open sky
  sim.z = sim.job.z + barn.z + barn.bodyDepth / 2 + 10;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.inBarn, false);
  assert.equal(sim.barnstormed, true);
  assert.equal(sim.result.stuntBonus, 250);
  assert.equal(sim.rewards.at(-1)?.title, 'Barnstormer');
  assert.equal(sim.career.cash, 0, 'Stunts settle on completion');
});

void test('barnstorming: tilted wings or side collision inside barn trigger an authentic crash', () => {
  const sim = pilot(4),
    barn = sim.job.challenge!.obstacles[0];
  // 1. Tilted wings inside barn
  sim.x = sim.job.x + barn.x;
  sim.z = sim.job.z + barn.z;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.heading = 0;
  sim.roll = 0.35; // Tilted bank
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'crashed');
  assert.match(sim.crashReason, /Barn wall strike/);

  // 2. Broadside entry through side wall
  sim.reset();
  sim.x = sim.job.x + barn.x;
  sim.z = sim.job.z + barn.z;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.heading = Math.PI / 2; // Flying East into wall
  sim.roll = 0;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'crashed');
  assert.match(sim.crashReason, /Barn strike · enter through the open doors/);

  // 3. Loft strike (flying too high through the upper hayloft floor)
  sim.reset();
  sim.x = sim.job.x + barn.x;
  sim.z = sim.job.z + barn.z;
  sim.y = ground(sim.x, sim.z) + 11;
  sim.heading = 0;
  sim.roll = 0;
  sim.stepHazards(0.05);
  assert.equal(sim.phase, 'crashed');
  assert.match(sim.crashReason, /Hayloft strike/);
});

void test('locusts clog coverage, climbing avoids them, and service restores the boom without erasing the bill', () => {
  const sim = pilot(7),
    swarm = locustSwarm(sim.job, 0)!;
  sim.x = swarm.x;
  sim.z = swarm.z;
  sim.y = ground(sim.x, sim.z) + 50;
  sim.stepHazards(1);
  assert.equal(sim.clog, 0);
  sim.y = ground(sim.x, sim.z) + swarm.altitude;
  const width = sim.swath;
  sim.stepHazards(1);
  assert.ok(sim.swath < width);
  sim.integrity = 70;
  sim.wear = 20;
  sim.covered.add([...fieldCells(sim.job).keys()][0]);
  const elapsed = sim.elapsed,
    due = sim.serviceDue,
    covered = sim.coverage;
  sim.refill();
  assert.equal(sim.swath, width);
  assert.equal(sim.integrity, 100);
  assert.equal(sim.clog, 0);
  assert.equal(sim.serviceDue, due);
  assert.equal(sim.coverage, covered);
  assert.equal(sim.elapsed, elapsed);
  sim.reset();
  assert.equal(sim.serviceDue, due);
  assert.equal(sim.career.cash, 0);
});

void test('maintenance and repair tabs survive retries, pay before upgrades, and never strand a broke pilot', () => {
  const sim = pilot(0, 0);
  sim.integrity = 0;
  sim.wear = 30;
  sim.reset();
  assert.equal(sim.serviceDue, 530);
  assert.equal(sim.integrity, 100);
  assert.equal(sim.career.cash, 0);
  sim.career.cash = 1000;
  assert.equal(sim.buy('tank'), false);
  assert.equal(availableCash(sim.career), 470);
  fullCoverage(sim);
  const projected = sim.projectedPay;
  assert.equal(sim.finish(), true);
  assert.equal(sim.result.total, projected);
  assert.equal(sim.result.maintenance, 30);
  assert.equal(sim.result.repairs, 500);
  assert.equal(sim.result.total, 720);
  assert.equal(sim.career.cash, 1720);
  assert.equal(sim.finish(), false);
  assert.equal(sim.buy('tank'), true);
  sim.reset();
  sim.integrity = 0;
  sim.career.repairDebt = 2500;
  fullCoverage(sim);
  sim.finish();
  assert.equal(sim.result.total, 0);
  assert.equal(sim.result.debt, 1750);
  sim.reset();
  assert.equal(sim.phase, 'flying');
  assert.equal(sim.integrity, 100);
  assert.equal(loadCareer(JSON.stringify(sim.career)).repairDebt, 1750);
});

void test('tornadoes are occasional and veteran-only with 30 seconds of warning and an escapable outflow', () => {
  let chosen: ReturnType<typeof prepareContract> | undefined,
    count = 0;
  for (let i = 12; i < 212; i++) {
    const job = prepareContract(contracts[2], i);
    if (job.challenge!.tornado) {
      count++;
      chosen ??= job;
    }
  }
  assert.ok(
    count > 20 && count < 75,
    `Expected occasional tornadoes, got ${count}/200`,
  );
  const sim = new Simulation();
  sim.reset(chosen!);
  const warning = tornadoState(sim.job, 100)!;
  assert.equal(warning.active, false);
  assert.equal(warning.seconds, 30);
  assert.equal(tornadoState(sim.job, 99), null);
  assert.equal(tornadoState(sim.job, 130)!.active, true);
  sim.elapsed = 160;
  const tornado = tornadoState(sim.job, sim.elapsed)!;
  sim.x = tornado.x + 250;
  sim.z = tornado.z;
  sim.y = ground(sim.x, sim.z) + 60;
  sim.stepHazards(0.05);
  assert.equal(sim.integrity, 100);
  sim.x = tornado.x;
  sim.z = tornado.z;
  sim.y = ground(sim.x, sim.z) + 80;
  sim.stepHazards(0.05);
  assert.ok(sim.integrity < 100);
});

void test('hazards, wear, clocks and collision cooldowns replay identically after saving mid-flight', () => {
  const sim = pilot(7);
  sim.elapsed = 10;
  const birds = birdFlock(sim.job, sim.elapsed)!;
  sim.x = birds.x;
  sim.z = birds.z;
  sim.y = ground(sim.x, sim.z) + birds.altitude;
  sim.stepHazards(0.05);
  sim.clog = 28;
  sim.wear = 12.25;
  const restored = hydrate(JSON.parse(JSON.stringify(serialize(sim))));
  for (let i = 0; i < 100; i++) {
    sim.step(0.016, freshControls());
    restored.step(0.016, freshControls());
  }
  assert.deepEqual(serialize(sim), serialize(restored));
  const legacy = serialize(pilot(0));
  delete legacy.integrity;
  delete legacy.clog;
  delete legacy.wear;
  delete legacy.birdHits;
  delete legacy.lastBirdHit;
  legacy.job.challenge = undefined;
  const old = hydrate(legacy);
  assert.equal(old.integrity, 100);
  assert.equal(old.serviceDue, 0);
});

void test('procedural hazard meshes stay finite and synchronized through a full storm cycle and job replacement', () => {
  const sim = pilot(12);
  sim.job.challenge!.tornado = true;
  const scene = new T.Scene(),
    visual = new HazardWorld(scene);
  for (const time of [0, 20, 100, 129, 130, 160, 195, 220, 240]) {
    sim.elapsed = time;
    visual.update(sim);
    assert.ok(
      visual.yards.children.length < 25,
      'Yard parts are batched by material',
    );
    scene.updateMatrixWorld();
    scene.traverse((o) =>
      assert.ok(o.matrixWorld.elements.every(Number.isFinite), o.name),
    );
    for (const mesh of [
      visual.birds,
      visual.wings,
      visual.insects,
      visual.debris,
    ])
      assert.ok(Array.from(mesh.instanceMatrix.array).every(Number.isFinite));
    assert.equal(visual.funnel.visible, Boolean(tornadoState(sim.job, time)));
  }
  sim.job = prepareContract(contracts[0], 0);
  visual.update(sim);
  assert.equal(visual.yards.children.length, 0);
  assert.equal(visual.birds.visible, false);
  visual.update(sim, false);
  assert.equal(visual.root.visible, false);
});

void test('collectibles spawn in world, award cash & refills on collision, and trigger audio cues', () => {
  const sim = new Simulation();
  sim.career.flights = 4; // Tier 2 with barn
  sim.reset(prepareContract(contracts[2], 4));
  assert.ok(sim.collectibles.length >= 3);
  const coin = sim.collectibles.find((c) => c.kind === 'cash')!;
  assert.ok(coin);
  assert.equal(coin.collected, false);

  const tracker = new AudioCueTracker();
  tracker.update(audioFrame(sim), 0);

  const initialCash = sim.career.cash;
  sim.x = coin.x;
  sim.z = coin.z;
  sim.y = coin.y;
  sim.step(0.016, freshControls());

  assert.equal(coin.collected, true);
  assert.equal(sim.career.cash, initialCash);
  assert.equal(sim.pendingSkillBonus, coin.value);
  assert.equal(sim.lastCollectedCue, 'coin');

  const frame = audioFrame(sim);
  assert.equal(frame.collectedCue, 'coin');
  const cues = tracker.update({ ...frame, hazard: false }, 1);
  assert.ok(cues.includes('coin'));

  const refill = sim.collectibles.find((c) => c.kind === 'refill')!;
  assert.ok(refill);
  sim.tank = 10;
  sim.x = refill.x;
  sim.z = refill.z;
  sim.y = refill.y;
  sim.step(0.016, freshControls());

  assert.equal(refill.collected, true);
  assert.ok(sim.tank > 10);
  assert.equal(sim.lastCollectedCue, 'powerup');

  const frame2 = audioFrame(sim);
  assert.equal(frame2.collectedCue, 'powerup');
  const cues2 = tracker.update({ ...frame2, hazard: false }, 2);
  assert.ok(cues2.includes('powerup'));
});
