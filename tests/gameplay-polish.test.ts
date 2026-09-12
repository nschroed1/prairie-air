import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  Simulation,
  contracts,
  freshControls,
  ground,
  type Controls,
} from '../lib/simulation';
import {
  serialize,
  hydrate,
  validateCommand,
  seasonAt,
  seasonJobs,
} from '../lib/county';
import { fieldCells } from '../lib/field-geometry';
import { StuntWorldProps } from '../lib/fx/stunt-props';
import { AudioCueTracker, audioFrame } from '../lib/game-audio';

function replay(sim: Simulation) {
  return hydrate(JSON.parse(JSON.stringify(serialize(sim))));
}
function fly(sim: Simulation, seconds: number, input: Partial<Controls> = {}) {
  for (let i = 0; i < Math.round(seconds / 0.05); i++)
    sim.step(0.05, { ...freshControls(), ...input });
}

void test('one settlement reconciles flight rewards, completion bonuses, repairs, and the wallet', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.awardReward('Barnstormer', 250, 'barnstormer', 'barn');
  assert.equal(sim.awardReward('Barnstormer', 250, 'barnstormer', 'barn'), 0);
  assert.equal(sim.career.cash, 0);
  sim.integrity = 80;
  sim.wear = 20;
  sim.covered = new Set(fieldCells(sim.job).keys());
  sim.elapsed = 70;
  const projected = sim.projectedPay;
  assert.equal(sim.finish(), true);
  assert.equal(sim.result.total, 1380); // 750 + 250 + 250 + 150 + 100 - 100 - 20
  assert.equal(sim.result.total, projected);
  assert.equal(sim.career.cash, sim.result.total);
  assert.equal(sim.career.totalEarned, sim.result.total);
  assert.equal(sim.finish(), false);
  assert.equal(sim.career.cash, 1380);
  assert.equal(sim.buy('tank'), true);
  assert.equal(
    sim.career.totalEarned,
    1380,
    'Buying equipment never reduces earned rank',
  );
});

void test('legacy banked stunts are not paid again and modern pending rewards survive reload', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.result.stuntBonus = 250;
  sim.career.cash = sim.career.totalEarned = 250;
  const old = serialize(sim);
  delete old.rewardVersion;
  delete old.bankedStuntBonus;
  const restored = hydrate(old);
  assert.equal(restored.pendingSkillBonus, 0);
  restored.awardReward('Clean pass', 25);
  const modern = replay(restored);
  assert.equal(modern.pendingSkillBonus, 25);
  modern.covered = new Set(fieldCells(modern.job).keys());
  modern.finish();
  assert.equal(modern.result.total, 1275);
  assert.equal(modern.career.cash, 1525);
});

void test('skill rewards are bounded per job, retained on service, and forfeited on retry', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const credited = sim.awardReward('Test award', 10000);
  assert.equal(credited, sim.skillBonusLimit);
  assert.equal(sim.rewards.at(-1)!.amount, credited);
  sim.refill();
  assert.equal(sim.pendingSkillBonus, credited);
  assert.equal(sim.awardReward('Another award', 100), 0);
  sim.reset();
  assert.equal(sim.pendingSkillBonus, 0);
  assert.equal(sim.career.cash, 0);
});

void test('old completed receipts never display unpaid completion ratings as new money', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const old = serialize(sim);
  delete old.rewardVersion;
  old.phase = 'complete';
  old.result = {
    ...old.result,
    pay: 750,
    bonus: 250,
    total: 1000,
    cleanBonus: 150,
    speedBonus: 100,
  };
  const restored = hydrate(old);
  assert.equal(restored.result.total, 1000);
  assert.equal(restored.result.cleanBonus, 0);
  assert.equal(restored.result.speedBonus, 0);
});

void test('real control sequences earn each standard turn reward after fresh coverage', () => {
  for (const [climb, name] of [
    [0, 'SNAP AG-TURN'],
    [1.2, 'WIZARD WINGOVER'],
    [2, 'CLIMBING REVERSAL'],
  ] as const) {
    const sim = new Simulation();
    sim.reset(contracts[0]);
    sim.x = 0;
    sim.z = 110;
    sim.y = ground(0, 110) + 19;
    sim.speed = sim.throttle = 34;
    fly(sim, 3, { spray: true });
    fly(sim, 0.05);
    if (climb) fly(sim, climb, { left: true, up: true });
    fly(sim, 4 - climb, { left: true });
    if (climb) fly(sim, climb, { down: true });
    fly(sim, 1);
    assert.equal(sim.phase, 'flying');
    assert.ok(
      sim.rewards.some((r) => r.title === name),
      `${name} is attainable through the controls`,
    );
  }
});

void test('aerobatic hold reaches and holds inversion; releasing it levels the plane', () => {
  let sim = new Simulation();
  sim.reset(contracts[0]);
  sim.y += 80;
  fly(sim, 1.65, { acro: true, left: true });
  assert.ok(Math.abs(sim.roll) > 2.6);
  sim = replay(sim);
  const inverted = sim.roll;
  fly(sim, 1, { acro: true });
  assert.equal(sim.roll, inverted);
  fly(sim, 1.5);
  assert.ok(Math.abs(sim.roll) < 0.1);
  assert.equal(sim.phase, 'flying');
  assert.throws(
    () =>
      validateCommand({
        requestId: 'polish-validation',
        revision: 0,
        action: 'tick',
        steps: [{ dt: 0.05, input: { ...freshControls(), acro: 'yes' } }],
      }),
    /controls/,
  );
});

void test('the server and rendered world use the same landmarks, and scenery cannot credit cash', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const props = new StuntWorldProps(new T.Scene(), new T.Group());
  try {
    assert.deepEqual(props.obstacles, sim.stunts.obstacles);
    assert.equal(props.wireSpans.length, sim.stunts.wireSpans.length);
    for (const [i, span] of props.wireSpans.entries()) {
      assert.deepEqual(
        span.p1.toArray(),
        Object.values(sim.stunts.wireSpans[i].p1),
      );
      assert.deepEqual(
        span.p2.toArray(),
        Object.values(sim.stunts.wireSpans[i].p2),
      );
    }
    assert.deepEqual(props.trestleBridge, sim.stunts.trestleBridge);
    props.animateScenery(0.05);
    assert.equal(sim.career.cash, 0);
    assert.equal(sim.pendingSkillBonus, 0);
  } finally {
    props.dispose();
  }
});

void test('a wire pass survives packet replay and can only reward the same wire once per job', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const wire = sim.stunts.wireSpans.find(
    (w) => w.p1.x !== w.p2.x && w.midpoint.x < 0,
  )!;
  sim.x = wire.midpoint.x;
  sim.z = wire.midpoint.z + 5;
  sim.y = ground(sim.x, sim.z) + 5.5;
  sim.speed = sim.throttle = 34;
  const continuous = replay(sim);
  let packeted = replay(sim);
  for (let i = 0; i < 8; i++) {
    continuous.step(0.05, freshControls());
    packeted.step(0.05, freshControls());
    packeted = replay(packeted);
  }
  assert.ok(continuous.rewards.some((r) => r.title === 'Wire Skimmer'));
  assert.equal(
    JSON.stringify(serialize(packeted)),
    JSON.stringify(serialize(continuous)),
  );
  assert.equal(packeted.career.cash, 0);
  const key = `stunt:wire-skimmer:${wire.id}`;
  assert.equal(
    packeted.awardReward('Wire Skimmer', 50, 'wire-skimmer', key),
    0,
  );
});

void test('a trestle run is above the terrain and achievable through normal flight steps', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const bridge = sim.stunts.trestleBridge;
  sim.x = bridge.riverX;
  sim.z = bridge.z + 5;
  sim.y = bridge.waterY + 5;
  sim.speed = sim.throttle = 34;
  fly(sim, 0.3);
  assert.equal(sim.phase, 'flying');
  assert.ok(sim.rewards.some((r) => r.title === 'Trestle Runner'));
});

void test('approaches and their starting chase cameras clear farm buildings across practice and public fields', () => {
  for (const job of [...contracts, ...seasonJobs(seasonAt())]) {
    const sim = new Simulation();
    sim.reset(job);
    for (const obstacle of sim.stunts.obstacles) {
      assert.ok(
        sim.stunts.calculateClearance(sim.x, sim.y, sim.z, obstacle) > 8,
      );
      assert.ok(
        sim.stunts.calculateClearance(
          sim.x,
          sim.y + 8.5,
          sim.z + 30,
          obstacle,
        ) > 8,
      );
    }
  }
});

void test('authoritative reward audio waits for danger to clear and never repeats after hydration', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const audio = new AudioCueTracker();
  audio.update(audioFrame(sim), 0);
  sim.awardReward('Clean pass', 25, 'streak-chord');
  assert.ok(
    !audio
      .update({ ...audioFrame(sim), hazard: true }, 1)
      .includes('streak-chord'),
  );
  assert.ok(
    audio
      .update({ ...audioFrame(sim), hazard: false }, 2)
      .includes('streak-chord'),
  );
  assert.ok(
    !audio
      .update({ ...audioFrame(replay(sim)), hazard: false }, 3)
      .includes('streak-chord'),
  );
});
