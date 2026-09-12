import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  StuntWorldProps,
  WIRE_POLE_HEIGHT,
  WIRE_DIP_AGL,
  WIRE_MIN_AGL,
  WIRE_MAX_AGL,
  WIRE_MIN_SPEED,
  WIRE_BONUS,
  TRESTLE_Z,
  TRESTLE_MIN_ABOVE_WATER,
  TRESTLE_MAX_ABOVE_WATER,
  TRESTLE_BONUS,
  NEAR_MISS_MIN_CLEARANCE,
  NEAR_MISS_MAX_CLEARANCE,
  NEAR_MISS_MIN_SPEED,
  type StuntObstacle,
} from '../lib/fx/stunt-props';
import { Simulation, contracts, ground, riverX } from '../lib/simulation';
import { AudioCueTracker, audioFrame } from '../lib/game-audio';

function createMockSim(): Simulation {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  return sim;
}

function createPilotWithChallenge(flights = 4, index = 2): Simulation {
  const sim = new Simulation();
  sim.career.flights = flights;
  sim.reset(contracts[index]);
  return sim;
}

void test('contract near misses retain their cooldown between render frames', () => {
  const props = new StuntWorldProps(new T.Scene(), new T.Group());
  try {
    const sim = createPilotWithChallenge(4, 0);
    const index = sim.job.challenge!.obstacles.findIndex(
      (item) => item.kind === 'barn',
    );
    const barn = sim.job.challenge!.obstacles[index];
    assert.equal(barn.kind, 'barn');
    sim.x = sim.job.x + barn.x + barn.bodyWidth / 2 + 2;
    sim.z = sim.job.z + barn.z;
    sim.y = ground(sim.job.x + barn.x, sim.z) + 5;
    sim.speed = 40;
    const target = `contract_barn_${index}`;
    assert.ok(
      props.checkNearMiss(sim, 10).some((event) => event.targetName === target),
    );
    assert.ok(
      !props
        .checkNearMiss(sim, 10.016)
        .some((event) => event.targetName === target),
    );
    assert.ok(
      props
        .checkNearMiss(sim, 14.1)
        .some((event) => event.targetName === target),
    );
  } finally {
    props.dispose();
  }
});

void test('StuntWorldProps exports correct game rule specifications and stunt parameters', () => {
  assert.equal(WIRE_POLE_HEIGHT, 10.0);
  assert.equal(WIRE_DIP_AGL, 7.5);
  assert.equal(WIRE_MIN_AGL, 3.0);
  assert.equal(WIRE_MAX_AGL, 7.2);
  assert.equal(WIRE_MIN_SPEED, 30.0);
  assert.equal(WIRE_BONUS, 50);

  assert.equal(TRESTLE_Z, 150.0);
  assert.equal(TRESTLE_MIN_ABOVE_WATER, 3.0);
  assert.equal(TRESTLE_MAX_ABOVE_WATER, 7.0);
  assert.equal(TRESTLE_BONUS, 200);

  assert.equal(NEAR_MISS_MIN_CLEARANCE, 0.8);
  assert.equal(NEAR_MISS_MAX_CLEARANCE, 3.8);
  assert.equal(NEAR_MISS_MIN_SPEED, 32.0);
});

void test('StuntWorldProps instantiates telephone wires with 10m poles and catenary wires dipping to 7.5m AGL', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  assert.ok(
    stuntProps.wireSpans.length > 0,
    'Should generate wire spans along section roads',
  );

  // Verify utility pole heights and catenary wire sag
  for (const span of stuntProps.wireSpans) {
    const pole1Height = span.p1.y - span.ground1;
    const pole2Height = span.p2.y - span.ground2;

    assert.ok(
      Math.abs(pole1Height - WIRE_POLE_HEIGHT) < 0.3,
      `Pole 1 height should be ~${WIRE_POLE_HEIGHT}m, got ${pole1Height}`,
    );
    assert.ok(
      Math.abs(pole2Height - WIRE_POLE_HEIGHT) < 0.3,
      `Pole 2 height should be ~${WIRE_POLE_HEIGHT}m, got ${pole2Height}`,
    );

    // Midpoint wire height AGL should dip to WIRE_DIP_AGL (7.5m)
    const avgGround = (span.ground1 + span.ground2) / 2;
    const midAgly = span.midpoint.y - avgGround;
    assert.ok(
      Math.abs(midAgly - WIRE_DIP_AGL) < 0.2,
      `Wire midpoint dip should be ~${WIRE_DIP_AGL}m AGL, got ${midAgly}`,
    );
  }

  stuntProps.dispose();
});

void test('Under the Wire detection awards +$50 Wire Skimmer bonus when flying under wires at speed >= 30 m/s', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  assert.ok(stuntProps.wireSpans.length > 0);
  const span = stuntProps.wireSpans[0];

  // 1. Valid pass under the wire: altitude 5.5m AGL (in [3.0, 7.2]), speed 35 m/s (>= 30)
  const pMid = span.midpoint.clone();
  // Vector perpendicular to the span in XZ plane
  const spanDir = new T.Vector3().subVectors(span.p2, span.p1).normalize();
  const perpDir = new T.Vector3(-spanDir.z, 0, spanDir.x);

  const prevPos = pMid.clone().addScaledVector(perpDir, -10);
  const currPos = pMid.clone().addScaledVector(perpDir, 10);
  const altitude = 5.5; // Sweet spot under the wire
  const speed = 35.0; // >= 30 m/s

  const event = stuntProps.checkUnderWire(
    prevPos,
    currPos,
    speed,
    altitude,
    1.0,
  );
  assert.ok(event !== null, 'Should trigger Wire Skimmer event on crossing');
  assert.equal(event?.type, 'wire-skimmer');
  assert.equal(event?.bonus, WIRE_BONUS);
  assert.match(event?.message ?? '', /WIRE SKIMMER/);
  assert.match(event?.message ?? '', /\+\$50/);

  // 2. Cooldown prevents duplicate trigger on same span within cooldown window
  const duplicate = stuntProps.checkUnderWire(
    prevPos,
    currPos,
    speed,
    altitude,
    2.0,
  );
  assert.equal(
    duplicate,
    null,
    'Cooldown should prevent immediate re-trigger on same span',
  );

  // 3. Low altitude < 3.0m AGL does NOT qualify (would be terrain hazard)
  const tooLow = stuntProps.checkUnderWire(prevPos, currPos, speed, 2.5, 20.0);
  assert.equal(tooLow, null, 'Altitude < 3.0m should not trigger wire skimmer');

  // 4. High altitude > 7.2m AGL (above the catenary sag dip) does NOT qualify
  const tooHigh = stuntProps.checkUnderWire(prevPos, currPos, speed, 7.8, 30.0);
  assert.equal(
    tooHigh,
    null,
    'Altitude > 7.2m should not trigger wire skimmer',
  );

  // 5. Slow speed < 30 m/s does NOT qualify
  const tooSlow = stuntProps.checkUnderWire(
    prevPos,
    currPos,
    25.0,
    altitude,
    40.0,
  );
  assert.equal(tooSlow, null, 'Speed < 30 m/s should not trigger wire skimmer');

  stuntProps.dispose();
});

void test('River Gorge Railroad Trestle Bridge structure spans Cedar River at z = 150m', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  const bridge = stuntProps.trestleBridge;
  assert.equal(bridge.z, TRESTLE_Z);
  assert.ok(
    Math.abs(bridge.riverX - riverX(TRESTLE_Z)) < 1.0,
    'Bridge should be centered on Cedar River gorge',
  );
  assert.ok(
    bridge.spanWidth >= 90,
    'Bridge span width should cross the river channel',
  );
  assert.ok(
    bridge.deckY > ground(bridge.riverX, bridge.z) + 12,
    'Deck clears the hilly riverbed',
  );
  assert.ok(
    bridge.waterY > ground(bridge.riverX, bridge.z),
    'Bridge follows the actual river elevation',
  );

  stuntProps.dispose();
});

void test('Trestle Runner stunt detection awards +$200 when flying through bent arches 3m to 7m above water', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  const rx = stuntProps.trestleBridge.riverX;
  const zBridge = stuntProps.trestleBridge.z;
  const waterY = stuntProps.trestleBridge.waterY;

  // 1. Fly north through trestle arches: from z = 135 to z = 165 at x = rx
  const prevZ = zBridge - 10;
  const currZ = zBridge + 10;
  const x = rx; // Right through the center river gorge arch
  const y = waterY + 5.0; // 5.0m above water (in [3.0, 7.0])
  const speed = 36.0;

  const event = stuntProps.checkTrestle(prevZ, currZ, x, y, speed, 1.0);
  assert.ok(event !== null, 'Should trigger Trestle Runner stunt event');
  assert.equal(event?.type, 'trestle-runner');
  assert.equal(event?.bonus, TRESTLE_BONUS);
  assert.match(event?.message ?? '', /TRESTLE RUNNER/);
  assert.match(event?.message ?? '', /\+\$200/);

  // 2. Cooldown prevents duplicate trigger
  const duplicate = stuntProps.checkTrestle(prevZ, currZ, x, y, speed, 2.0);
  assert.equal(
    duplicate,
    null,
    'Cooldown should prevent immediate duplicate trigger',
  );

  // 3. Flying above 7m above water (> bridge deck clearance) does NOT trigger
  const tooHighY = waterY + 9.5;
  const highPass = stuntProps.checkTrestle(
    prevZ,
    currZ,
    x,
    tooHighY,
    speed,
    15.0,
  );
  assert.equal(highPass, null, 'Pass > 7m above water should not trigger');

  // 4. Flying below 3m above water does NOT trigger
  const tooLowY = waterY + 2.0;
  const lowPass = stuntProps.checkTrestle(
    prevZ,
    currZ,
    x,
    tooLowY,
    speed,
    25.0,
  );
  assert.equal(lowPass, null, 'Pass < 3m above water should not trigger');

  // 5. Flying far outside the river gorge bridge span does NOT trigger
  const outsideX = rx + 120; // Beyond gorge
  const widePass = stuntProps.checkTrestle(
    prevZ,
    currZ,
    outsideX,
    y,
    speed,
    35.0,
  );
  assert.equal(widePass, null, 'Pass outside gorge span should not trigger');

  stuntProps.dispose();
});

void test('Near-Miss Adrenaline System calculates accurate obstacle clearance and proximity-scaled cash ($25 to $100)', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  // Test silo obstacle (cylinder)
  const silo: StuntObstacle = {
    id: 'test_silo',
    kind: 'silo',
    x: 100,
    z: 200,
    baseY: 10,
    height: 25,
    radius: 6.5,
    lastTriggeredTime: -Infinity,
  };

  const siloRadius = silo.radius ?? 6.5;

  // 1. Exactly 0.8m clearance from silo surface
  const px1 = silo.x + siloRadius + 0.8;
  const py1 = silo.baseY + 12;
  const pz1 = silo.z;
  const clr1 = stuntProps.calculateClearance(px1, py1, pz1, silo);
  assert.ok(
    Math.abs(clr1 - 0.8) < 1e-4,
    `Expected 0.8m clearance, got ${clr1}`,
  );
  const bonus1 = stuntProps.calculateNearMissBonus(clr1);
  assert.equal(bonus1, 100, 'Max proximity (0.8m) should award $100');

  // 2. Exactly 3.8m clearance from silo surface
  const px2 = silo.x + siloRadius + 3.8;
  const clr2 = stuntProps.calculateClearance(px2, py1, pz1, silo);
  assert.ok(
    Math.abs(clr2 - 3.8) < 1e-4,
    `Expected 3.8m clearance, got ${clr2}`,
  );
  const bonus2 = stuntProps.calculateNearMissBonus(clr2);
  assert.equal(bonus2, 25, 'Min proximity (3.8m) should award $25');

  // 3. Midpoint proximity (2.3m clearance): 50% between 25 and 100 -> ~63
  const pxMid = silo.x + siloRadius + 2.3;
  const clrMid = stuntProps.calculateClearance(pxMid, py1, pz1, silo);
  assert.ok(
    Math.abs(clrMid - 2.3) < 1e-4,
    `Expected 2.3m clearance, got ${clrMid}`,
  );
  const bonusMid = stuntProps.calculateNearMissBonus(clrMid);
  assert.ok(bonusMid >= 62 && bonusMid <= 63, `Expected ~$63, got ${bonusMid}`);

  // Test barn obstacle (box)
  const barn: StuntObstacle = {
    id: 'test_barn',
    kind: 'barn',
    x: 0,
    z: 0,
    baseY: 10,
    height: 18,
    width: 28,
    depth: 44,
    lastTriggeredTime: -Infinity,
  };

  // Fly along side wall (X = halfW + 1.5m, Z = 0)
  const barnClearance = stuntProps.calculateClearance(
    14.0 + 1.5,
    15.0,
    0,
    barn,
  );
  assert.ok(
    Math.abs(barnClearance - 1.5) < 1e-4,
    `Expected 1.5m clearance beside barn, got ${barnClearance}`,
  );

  // Test windmill obstacle
  const windmill: StuntObstacle = {
    id: 'test_windmill',
    kind: 'windmill',
    x: 50,
    z: 50,
    baseY: 10,
    height: 19,
    radius: 2.6,
    lastTriggeredTime: -Infinity,
  };
  const millClearance = stuntProps.calculateClearance(
    50 + 2.6 + 2.0,
    18,
    50,
    windmill,
  );
  assert.ok(
    Math.abs(millClearance - 2.0) < 1e-4,
    `Expected 2.0m clearance beside windmill, got ${millClearance}`,
  );

  stuntProps.dispose();
});

void test('Near-Miss Adrenaline System triggers events at speed >= 32 m/s and respects cooldown', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  const stuntProps = new StuntWorldProps(scene, group);

  const sim = createMockSim();
  assert.ok(stuntProps.obstacles.length > 0);
  const siloObs = stuntProps.obstacles.find((o) => o.kind === 'silo')!;
  assert.ok(siloObs !== undefined);

  // Position aircraft for high-speed close flyby past the silo
  const radius = siloObs.radius ?? 8.0;
  sim.x = siloObs.x + radius + 1.5; // 1.5m clearance (in [0.8, 3.8])
  sim.z = siloObs.z;
  sim.y = siloObs.baseY + 12.0;
  sim.speed = 36.0; // >= 32 m/s
  sim.phase = 'flying';

  // 1. Trigger near-miss
  const events = stuntProps.checkNearMiss(sim, 1.0);
  assert.equal(events.length, 1, 'Should trigger exactly 1 near-miss event');
  const e = events[0];
  assert.equal(e.type, 'near-miss');
  assert.ok(e.bonus >= 25 && e.bonus <= 100);
  assert.ok(
    e.clearance !== undefined && e.clearance >= 0.8 && e.clearance <= 3.8,
  );
  assert.match(e.message, /NEAR MISS/);
  assert.ok((e.intensity ?? 0) > 0.5);

  // 2. Cooldown on the same obstacle prevents spamming on subsequent frame
  const duplicateEvents = stuntProps.checkNearMiss(sim, 2.0);
  assert.equal(
    duplicateEvents.length,
    0,
    'Near-miss should not re-trigger within cooldown',
  );

  // 3. Speed < 32 m/s does not trigger near-miss
  sim.speed = 28.0;
  siloObs.lastTriggeredTime = -Infinity; // Reset cooldown for test
  const slowEvents = stuntProps.checkNearMiss(sim, 10.0);
  assert.equal(
    slowEvents.length,
    0,
    'Speed < 32 m/s should not trigger near-miss',
  );

  stuntProps.dispose();
});

void test('inverted barnstorming: threading barn breezeway completely inverted (roll > 2.6 rad) awards +$750 and fanfare', () => {
  const sim = createPilotWithChallenge(4, 2);
  const barn = sim.job.challenge?.obstacles.find((o) => o.kind === 'barn');
  assert.ok(barn !== undefined, 'Contract should include barn obstacle');

  const bx = sim.job.x + barn.x;
  const bz = sim.job.z + barn.z;
  const gy = ground(bx, bz);

  // 1. Approach aligned North, but inverted (roll = Math.PI)
  sim.x = bx;
  sim.z = bz - barn.bodyDepth / 2 - 12;
  sim.y = gy + 5.5; // Sweet spot altitude inside breezeway
  sim.heading = 0; // Heading north
  sim.roll = Math.PI; // Inverted! Math.abs(roll) = 3.14159 > 2.6
  sim.stepHazards(0.05);

  assert.equal(sim.phase, 'flying');
  assert.equal(sim.inBarn, false);
  assert.equal(sim.invertedBarnstormed, false);

  // 2. Enter the barn corridor while inverted
  sim.z = bz;
  sim.y = gy + 5.5;
  sim.roll = -3.0; // Inverted: Math.abs(-3.0) = 3.0 > 2.6 rad
  sim.stepHazards(0.05);

  assert.equal(
    sim.phase,
    'flying',
    'Aircraft should survive inverted entry through breezeway',
  );
  assert.equal(sim.inBarn, true);
  assert.equal(sim.inBarnInverted, true);
  assert.equal(sim.invertedBarnstormed, false);

  // 3. Exit the far open gable end into open sky
  sim.z = bz + barn.bodyDepth / 2 + 12;
  sim.y = gy + 5.5;
  sim.stepHazards(0.05);

  assert.equal(sim.phase, 'flying');
  assert.equal(sim.inBarn, false);
  assert.equal(sim.invertedBarnstormed, true);
  assert.equal(sim.barnstormed, true);
  assert.equal(
    sim.result.stuntBonus,
    750,
    'Should award +$750 inverted barnstormer bonus',
  );
  assert.equal(sim.rewards.at(-1)?.title, 'Inverted barnstormer');
  assert.equal(sim.rewards.at(-1)?.amount, 750);
  assert.equal(sim.career.cash, 0);
  assert.equal(sim.lastStuntCue, 'inverted-barnstormer');

  // 4. Verify AudioCueTracker picks up inverted-barnstormer fanfare
  const tracker = new AudioCueTracker();
  // Provide baseline frame before stunt completion
  tracker.update(
    {
      ...audioFrame(sim),
      rewards: [],
      invertedBarnstormed: false,
      barnstormed: false,
      elapsed: 0,
    },
    1.0,
  );
  const frame = audioFrame(sim);
  assert.equal(frame.invertedBarnstormed, true);
  const cues = tracker.update({ ...frame, hazard: false }, 2.0);
  assert.ok(
    cues.includes('inverted-barnstormer'),
    'AudioCueTracker should trigger inverted-barnstormer cue',
  );
});

void test('inverted barnstorming: tilted wings at non-inverted bank inside barn still crashes into wall', () => {
  const sim = createPilotWithChallenge(4, 2);
  const barn = sim.job.challenge?.obstacles.find((o) => o.kind === 'barn');
  assert.ok(barn !== undefined);

  const bx = sim.job.x + barn.x;
  const bz = sim.job.z + barn.z;
  const gy = ground(bx, bz);

  // Inside barn corridor with intermediate bank angle (neither level <0.28 nor inverted >2.6)
  sim.x = bx;
  sim.z = bz;
  sim.y = gy + 5.5;
  sim.heading = 0;
  sim.roll = 1.2; // ~69 degrees bank
  sim.stepHazards(0.05);

  assert.equal(sim.phase, 'crashed');
  assert.match(sim.crashReason, /Barn wall strike/);
});

void test('StuntWorldProps clean disposal frees meshes, geometries, and materials', () => {
  const scene = new T.Scene();
  const group = new T.Group();
  scene.add(group);
  const stuntProps = new StuntWorldProps(scene, group);

  assert.ok(group.children.length > 0);
  stuntProps.dispose();

  assert.equal(
    group.children.length,
    0,
    'Group children should be cleared on dispose',
  );
  assert.equal(stuntProps.wireSpans.length, 0);
  assert.equal(stuntProps.obstacles.length, 0);
});
