import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation, contracts, ground, loadCareer } from '../lib/simulation';
import {
  freshSkywriting,
  skywritingContract,
  skywritingAvailable,
  skyRoute,
  skyAudienceView,
  skyAccuracy,
  skyCoverage,
  SKY_LENGTH,
  SKY_SMOKE_LIMIT,
  stepSkywriting,
} from '../lib/skywriting';
import { SkywritingPractice } from '../lib/skywriting-practice';
import { SkywritingWorld } from '../lib/skywriting-world';
import {
  serialize,
  hydrate,
  runFlight,
  seasonAt,
  seasonJobs,
  SEASON_EPOCH,
  SEASON_MS,
  type PublicPilot,
} from '../lib/county';
import { flyHeart, skyInput } from './helpers/sky-flight';

const flight = (level: 0 | 1 = 0) => {
  const sim = new Simulation();
  sim.career.flights = 3;
  sim.reset(skywritingContract({ ...contracts[0], id: 3 }, level));
  return sim;
};

for (const level of [0, 1] as const)
  void test(`normal flight controls complete the ${level ? 'crosswind' : 'gentle'} heart with a precision bonus`, () => {
    const sim = flight(level),
      route = skyRoute(sim.job);
    assert.ok(
      Math.hypot(route[0].x - route[80].x, route[0].z - route[80].z) < 0.001,
    );
    assert.ok(route.every((p) => p.y - ground(p.x, p.z) >= 109));
    assert.equal(sim.collectibles.length, 0);
    flyHeart(sim);
    assert.equal(sim.completionReady, true);
    assert.ok(sim.coverage >= 95, `coverage: ${sim.coverage}`);
    assert.ok(skyAccuracy(sim.skywriting) >= 90);
    assert.ok(sim.elapsed < 90);
    assert.equal(sim.covered.size, 0);
    assert.equal(sim.result.stuntBonus, 0);
    assert.equal(sim.job.acres, 0);
    const projected = sim.projectedPay,
      before = sim.career.cash;
    assert.equal(sim.finish(), true);
    assert.equal(sim.result.bonus, sim.job.bonus);
    assert.ok(sim.result.maintenance > 0);
    assert.equal(sim.result.total, projected);
    assert.equal(sim.career.cash, before + projected);
    assert.equal(sim.career.lastSkywritingFlight, 4);
    assert.equal(sim.finish(), false);
    assert.equal(sim.career.cash, before + projected);
  });

void test('out-of-order gates, high-altitude smoke, stationary smoke and teleports cannot earn coverage', () => {
  const sim = flight(),
    route = skyRoute(sim.job);
  const state = freshSkywriting();
  for (let i = 30; i < 50; i++) {
    for (let j = 0; j < 30; j++) {
      const a = route[i],
        b = route[i + 1],
        t = j / 30;
      stepSkywriting(
        state,
        sim.job,
        { x: a.x + (b.x - a.x) * t, y: a.y, z: a.z + (b.z - a.z) * t },
        true,
        0.03,
        34,
        i + j * 0.03,
      );
    }
  }
  assert.equal(skyCoverage(state), 0);
  assert.ok(state.straySmoke > 0);
  assert.equal(state.progress, 0);
  const high = freshSkywriting();
  for (let j = 0; j < 30; j++) {
    const a = route[0],
      b = route[1],
      t = j / 30;
    stepSkywriting(
      high,
      sim.job,
      { x: a.x + (b.x - a.x) * t, y: a.y + 20, z: a.z + (b.z - a.z) * t },
      true,
      0.03,
      34,
      j * 0.03,
    );
  }
  assert.equal(skyCoverage(high), 0);
  const teleport = freshSkywriting();
  teleport.last = route[0];
  stepSkywriting(teleport, sim.job, route[2], true, 0.02, 34, 1);
  assert.equal(skyCoverage(teleport), 0);
  const stationary = structuredClone(teleport);
  for (let i = 0; i < 100; i++)
    stepSkywriting(teleport, sim.job, route[2], true, 0.02, 34, i);
  assert.deepEqual(teleport, stationary);
});

void test('a dry circuit is not payable; refill keeps strokes and costs, and a clean second pass fills gaps', () => {
  const sim = flight();
  for (let i = 0; i < 3300 && !sim.skywriting.loops; i++)
    sim.step(0.02, { ...skyInput(sim), spray: false });
  assert.equal(sim.skywriting.loops, 1);
  assert.equal(sim.coverage, 0);
  assert.equal(sim.finish(), false);
  sim.refill();
  assert.equal(sim.skywriting.loops, 1);
  const before = sim.serviceDue;
  assert.ok(before > 0);
  flyHeart(sim);
  assert.equal(sim.completionReady, true);
  assert.ok(sim.serviceDue >= before);
  const ink = [...sim.skywriting.ink],
    penalty = sim.oversprayPenalty;
  sim.refill();
  assert.deepEqual(sim.skywriting.ink, ink);
  assert.equal(sim.oversprayPenalty, penalty);
  sim.reset();
  assert.equal(sim.coverage, 0);
  assert.equal(sim.skywriting.loops, 0);
});

void test('replayed input packets preserve route, smoke, payout and weather across reconnects', () => {
  const sim = flight(1),
    initial = structuredClone(serialize(sim));
  const steps = flyHeart(sim);
  let resumed = hydrate(initial);
  for (let i = 0; i < steps.length; i += 20) {
    const packet = steps.slice(i, i + 20);
    resumed = runFlight(structuredClone(serialize(resumed)), packet, 1).sim;
  }
  assert.deepEqual(serialize(resumed), serialize(sim));
  assert.equal(resumed.finish(), true);
  assert.equal(sim.finish(), true);
  assert.deepEqual(resumed.result, sim.result);
  const saved = serialize(sim);
  saved.skywriting!.ink[0] = 0;
  assert.ok(
    sim.skywriting.ink[0] > 0,
    'network state must not alias live smoke scoring',
  );
  const old = serialize(new Simulation());
  delete old.skywriting;
  assert.equal(hydrate(old).isSkywriting, false);
});

void test('practice restores career, upgrades and workshop obligations after retries, damage and completion', () => {
  const sim = flight();
  sim.career.cash = 5000;
  sim.career.maintenanceDebt = 73;
  sim.career.repairDebt = 121;
  sim.career.upgrades.stability = 2;
  sim.wear = 14;
  sim.clog = 12;
  sim.integrity = 64;
  const before = {
    career: structuredClone(sim.career),
    wear: sim.wear,
    clog: sim.clog,
    integrity: sim.integrity,
  };
  const session = new SkywritingPractice();
  session.begin(sim);
  sim.reset(skywritingContract({ ...contracts[0], id: 3 }));
  sim.crash('Practice collision');
  sim.refill();
  sim.buy('tank');
  session.begin(sim);
  sim.reset();
  flyHeart(sim);
  assert.equal(sim.finish(), true);
  assert.equal(session.active, true);
  session.end(sim);
  assert.equal(session.active, false);
  assert.deepEqual(
    {
      career: sim.career,
      wear: sim.wear,
      clog: sim.clog,
      integrity: sim.integrity,
    },
    before,
  );
  session.end(sim);
  assert.deepEqual(sim.career, before.career);
});

void test('paid practice commissions have a saved cooldown and cannot replace existing season-zero fields', () => {
  const sim = flight();
  assert.equal(skywritingAvailable(sim.career), true);
  flyHeart(sim);
  sim.finish();
  assert.equal(skywritingAvailable(sim.career), false);
  const loaded = loadCareer(JSON.stringify(sim.career));
  assert.equal(loaded.lastSkywritingFlight, 4);
  assert.ok(loaded.completed.includes(3));
  loaded.flights = 11;
  assert.equal(skywritingAvailable(loaded), false);
  loaded.flights = 12;
  assert.equal(skywritingAvailable(loaded), true);
  assert.equal(
    seasonJobs(seasonAt(SEASON_EPOCH)).filter((j) => j.kind === 'skywriting')
      .length,
    0,
  );
  const season = seasonAt(SEASON_EPOCH + SEASON_MS);
  const jobs = seasonJobs(season),
    sky = jobs.filter((j) => j.kind === 'skywriting');
  assert.equal(jobs.length, 60);
  assert.equal(sky.length, 7);
  assert.deepEqual(jobs, seasonJobs(season));
  assert.ok(
    sky.every(
      (j) =>
        j.acres === 0 &&
        !j.challenge &&
        skyRoute(j).every((p) => Math.abs(p.x) < 3100 && Math.abs(p.z) < 3100),
    ),
  );
});

void test('low accuracy and incomplete circuits block payment even after enough written coverage', () => {
  const sim = flight();
  flyHeart(sim);
  sim.skywriting.loops = 0;
  assert.equal(sim.finish(), false);
  sim.skywriting.loops = 1;
  sim.skywriting.straySmoke = SKY_LENGTH;
  assert.ok(skyAccuracy(sim.skywriting) < 65);
  assert.equal(sim.finish(), false);
  sim.skywriting.straySmoke = sim.skywriting.goodSmoke * 0.3;
  assert.ok(skyAccuracy(sim.skywriting) > 65);
  assert.equal(sim.earnedBonus, 0);
  const gross = sim.job.pay + sim.cleanBonus + sim.speedBonus;
  assert.equal(sim.finish(), true);
  assert.ok(sim.result.penalty > 0);
  assert.equal(
    sim.result.total,
    gross - sim.result.penalty - sim.result.maintenance - sim.result.repairs,
  );
});

void test('smoke buffers stay bounded and repeated network snapshots do not duplicate trails', () => {
  const sim = flight();
  flyHeart(sim);
  assert.ok(sim.skywriting.smoke.length <= SKY_SMOKE_LIMIT);
  const scene = new T.Scene(),
    world = new SkywritingWorld(scene);
  const pilot: PublicPilot = {
    id: 'friend',
    callsign: 'ACE',
    x: sim.x,
    y: sim.y,
    z: sim.z,
    heading: sim.heading,
    roll: 0,
    pitch: 0,
    speed: 34,
    spraying: true,
    phase: 'flying',
    seenAt: 0,
    skywriting: {
      jobId: 3,
      elapsed: sim.elapsed,
      smoke: sim.skywriting.smoke.slice(-8),
    },
  };
  world.receive([pilot], sim.elapsed);
  world.receive([pilot], sim.elapsed + 0.1);
  world.update(sim, sim.elapsed + 0.1, true, 800);
  assert.equal(world.remote.geometry.drawRange.count, 8);
  const retry = {
    ...pilot,
    skywriting: {
      jobId: 3,
      elapsed: 1,
      smoke: [[1, 131, 3, 1] as [number, number, number, number]],
    },
  };
  world.receive([retry], sim.elapsed + 1);
  world.update(sim, sim.elapsed + 1, true, 800);
  assert.equal(
    world.remote.geometry.drawRange.count,
    1,
    'retrying the same job starts a fresh visible smoke trail',
  );
  assert.equal(world.own.geometry.drawRange.count, sim.skywriting.smoke.length);
  sim.finish();
  world.update(sim, sim.elapsed + 0.2, true, 800);
  assert.equal(world.guide.visible, false);
  assert.equal(world.own.visible, true);
  world.update(sim, sim.elapsed + 161, true, 800);
  assert.equal(world.remote.geometry.drawRange.count, 0);
  world.receive(null, sim.elapsed + 162);
  assert.equal(world.remoteTrails.size, 0);
  world.dispose();
  assert.equal(scene.children.length, 0);
});

void test('the reveal looks up from standing height and keeps the heart readable on desktop and mobile', () => {
  const job = flight().job;
  for (const aspect of [1365 / 900, 390 / 844]) {
    const { eye, look, fov } = skyAudienceView(job, aspect);
    assert.ok(Math.abs(eye.y - ground(eye.x, eye.z) - 1.7) < 1e-6);
    assert.ok(look.y > eye.y + 400);
    const camera = new T.PerspectiveCamera(fov, aspect, 0.1, 20000);
    camera.position.set(eye.x, eye.y, eye.z);
    camera.up.set(0, 0, -1);
    camera.lookAt(look.x, look.y, look.z);
    camera.updateMatrixWorld();
    const projected = skyRoute(job).map((p) =>
      new T.Vector3(p.x, p.y, p.z).project(camera),
    );
    assert.ok(
      projected.every((p) => Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.67),
    );
    assert.ok(
      projected[0].y > projected[40].y,
      'the notch is above the point for spectators',
    );
  }
});
