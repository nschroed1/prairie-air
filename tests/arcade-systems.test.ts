import test from 'node:test';
import assert from 'node:assert/strict';
import { ArcadeTracker } from '../lib/arcade-systems';
import {
  Simulation,
  ground,
  contracts,
  freshControls,
} from '../lib/simulation';
import { flightPasses } from '../lib/flight-guidance';
import { fieldCells } from '../lib/field-geometry';
import {
  GameAudio,
  AudioCueTracker,
  audioFrame,
  type AudioFrame,
} from '../lib/game-audio';

// Mock Web Audio environment for headless execution
class MockAudioParam {
  value = 0;
  setValueAtTime(val: number, _time: number) {
    this.value = val;
    return this;
  }
  linearRampToValueAtTime(val: number, _time: number) {
    this.value = val;
    return this;
  }
  exponentialRampToValueAtTime(val: number, _time: number) {
    this.value = val;
    return this;
  }
  setTargetAtTime(val: number, _time: number, _timeConstant: number) {
    this.value = val;
    return this;
  }
}

class MockAudioNode {
  connect(dest: unknown) {
    return dest;
  }
  disconnect() {}
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
}

class MockOscillatorNode extends MockAudioNode {
  type: OscillatorType = 'sine';
  frequency = new MockAudioParam();
  detune = new MockAudioParam();
  onended: (() => void) | null = null;
  started = false;
  stopped = false;
  setPeriodicWave(_wave: unknown) {}
  start(_time?: number) {
    this.started = true;
  }
  stop(_time?: number) {
    this.stopped = true;
  }
}

class MockBiquadFilterNode extends MockAudioNode {
  type: BiquadFilterType = 'lowpass';
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
}

class MockStereoPannerNode extends MockAudioNode {
  pan = new MockAudioParam();
}

class MockDynamicsCompressorNode extends MockAudioNode {
  threshold = new MockAudioParam();
  knee = new MockAudioParam();
  ratio = new MockAudioParam();
  attack = new MockAudioParam();
  release = new MockAudioParam();
}

class MockAudioBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  loop = false;
  start(_when?: number, _offset?: number) {}
  stop(_when?: number) {}
}

class MockAudioContext {
  state = 'running';
  currentTime = 10;
  sampleRate = 44100;
  destination = new MockAudioNode();

  createGain() {
    return new MockGainNode();
  }
  createOscillator() {
    return new MockOscillatorNode();
  }
  createDynamicsCompressor() {
    return new MockDynamicsCompressorNode();
  }
  createBiquadFilter() {
    return new MockBiquadFilterNode();
  }
  createStereoPanner() {
    return new MockStereoPannerNode();
  }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      getChannelData: (_channel: number) => new Float32Array(length),
    };
  }
  createBufferSource() {
    return new MockAudioBufferSourceNode();
  }
  createPeriodicWave(_real: Float32Array, _imag: Float32Array) {
    return {};
  }
  resume() {
    this.state = 'running';
    return Promise.resolve();
  }
  close() {
    this.state = 'closed';
    return Promise.resolve();
  }
}

// 1. Clean Pass Streaks (x1 to x5) & Overspray Penalty
void test('clean pass streaks increment up to x5 ($25 to $125) on strip completion', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const tracker = new ArcadeTracker();

  assert.equal(tracker.passStreak, 1, 'Initial streak should be 1');

  // Strip cells for strips 0, 1, 2, 3
  const valid = fieldCells(sim.job);
  const width = sim.job.width ?? 192;
  const count = Math.ceil(width / (sim.swath - 8));
  const stripCells: number[][] = Array.from({ length: count }, () => []);
  for (let row = 0; row < 38; row++) {
    for (let col = 0; col < 38; col++) {
      const cellId = row * 38 + col;
      if (!valid.has(cellId)) continue;
      const x = sim.job.x - 228 + col * 12 + 6;
      const sIdx = Math.max(
        0,
        Math.min(
          count - 1,
          Math.floor((x - sim.job.x + width / 2) / (width / count)),
        ),
      );
      stripCells[sIdx].push(cellId);
    }
  }

  // --- Pass 1: fly Strip 0 (clean coverage >= 70%) ---
  sim.x = sim.job.x - width / 2 + 10;
  sim.z = sim.job.z;
  sim.y = ground(sim.x, sim.z) + 15;
  sim.roll = 0.05;
  sim.spraying = true;
  sim.oversprayAcres = 0;
  tracker.update(0.1, sim);

  // Add 85% coverage to strip 0
  const cellsToCover0 = Math.floor(stripCells[0].length * 0.85);
  for (let i = 0; i < cellsToCover0; i++) {
    sim.covered.add(stripCells[0][i]);
  }
  tracker.update(0.5, sim);

  // Cut spray to complete strip
  sim.spraying = false;
  const pass1Events = tracker.update(0.1, sim);
  assert.equal(pass1Events.length, 1);
  assert.deepEqual(pass1Events[0], {
    type: 'clean_pass',
    streak: 1,
    bonus: 25,
  });
  assert.equal(tracker.passStreak, 2, 'Streak increments to 2 after Pass 1');

  // --- Pass 2: fly Strip 1 (streak 2 -> bonus $50) ---
  sim.x = sim.job.x - width / 2 + 58;
  sim.z = sim.job.z;
  sim.spraying = true;
  tracker.update(0.1, sim);

  // Add 85% coverage to strip 1
  const cellsToCover1 = Math.floor(stripCells[1].length * 0.85);
  for (let i = 0; i < cellsToCover1; i++) {
    sim.covered.add(stripCells[1][i]);
  }
  sim.spraying = false;
  const pass2Events = tracker.update(0.1, sim);
  assert.equal(pass2Events.length, 1);
  assert.deepEqual(pass2Events[0], {
    type: 'clean_pass',
    streak: 2,
    bonus: 50,
  });
  assert.equal(tracker.passStreak, 3, 'Streak increments to 3 after Pass 2');

  // --- Pass 3: fly Strip 2 (streak 3 -> bonus $75) ---
  sim.x = sim.job.x - width / 2 + 106;
  sim.z = sim.job.z;
  sim.spraying = true;
  tracker.update(0.1, sim);

  const cellsToCover2 = Math.floor(stripCells[2].length * 0.85);
  for (let i = 0; i < cellsToCover2; i++) {
    sim.covered.add(stripCells[2][i]);
  }
  sim.spraying = false;
  const pass3Events = tracker.update(0.1, sim);
  assert.equal(pass3Events.length, 1);
  assert.deepEqual(pass3Events[0], {
    type: 'clean_pass',
    streak: 3,
    bonus: 75,
  });
  assert.equal(tracker.passStreak, 4, 'Streak increments to 4 after Pass 3');

  // --- Pass 4: fly Strip 3 (streak 4 -> bonus $100) ---
  sim.x = sim.job.x - width / 2 + 154;
  sim.z = sim.job.z;
  sim.spraying = true;
  tracker.update(0.1, sim);

  const cellsToCover3 = Math.floor(stripCells[3].length * 0.85);
  for (let i = 0; i < cellsToCover3; i++) {
    sim.covered.add(stripCells[3][i]);
  }
  sim.spraying = false;
  const pass4Events = tracker.update(0.1, sim);
  assert.equal(pass4Events.length, 1);
  assert.deepEqual(pass4Events[0], {
    type: 'clean_pass',
    streak: 4,
    bonus: 100,
  });
  assert.equal(tracker.passStreak, 5, 'Streak increments to 5 after Pass 4');

  // --- Pass 5: at streak 5 -> bonus $125 and stays clamped at 5 ---
  tracker.passStreak = 5;
  for (const c of stripCells[0]) sim.covered.delete(c);
  sim.x = sim.job.x - width / 2 + 10;
  sim.spraying = true;
  tracker.update(0.1, sim);
  for (let i = 0; i < cellsToCover0; i++) sim.covered.add(stripCells[0][i]);
  sim.spraying = false;
  const pass5Events = tracker.update(0.1, sim);
  assert.equal(pass5Events.length, 1);
  assert.deepEqual(pass5Events[0], {
    type: 'clean_pass',
    streak: 5,
    bonus: 125,
  });
  assert.equal(tracker.passStreak, 5, 'Streak is capped at 5');
});

void test('overspray penalty (>0.25s outside field) drops streak to 1', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.x = sim.job.x;
  sim.z = sim.job.z; // inside field
  const tracker = new ArcadeTracker();
  tracker.passStreak = 4;

  // Spraying inside field
  sim.spraying = true;
  sim.offTargetFraction = 0;
  tracker.update(0.2, sim);
  assert.equal(
    tracker.passStreak,
    4,
    'Streak preserved during in-field spraying',
  );

  // Overspray begins (spraying outside field)
  sim.offTargetFraction = 0.6;
  tracker.update(0.15, sim); // 0.15s < 0.25s
  assert.equal(tracker.passStreak, 4, 'Streak preserved under 0.25s threshold');

  tracker.update(0.15, sim); // Total 0.30s > 0.25s
  assert.equal(
    tracker.passStreak,
    1,
    'Streak drops to 1 after >0.25s overspray',
  );
});

void test('pass fails to qualify if coverage < 70%, overspray >= 0.04 ac, or excessive roll', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.x = sim.job.x;
  sim.z = sim.job.z;
  const tracker = new ArcadeTracker();

  // 1. Inadequate coverage (< 70%)
  sim.spraying = true;
  tracker.update(0.1, sim);
  sim.covered.add(1); // only 1 cell
  sim.spraying = false;
  const failCovEvents = tracker.update(0.1, sim);
  assert.equal(failCovEvents.filter((e) => e.type === 'clean_pass').length, 0);
  assert.equal(tracker.passStreak, 1);

  // 2. Excessive overspray (>= 0.04 ac)
  tracker.reset();
  sim.covered.clear();
  sim.spraying = true;
  sim.oversprayAcres = 0;
  tracker.update(0.1, sim);
  // Add plenty of cells
  for (let i = 0; i < 150; i++) sim.covered.add(i);
  sim.oversprayAcres = 0.05; // >= 0.04 ac
  sim.spraying = false;
  const failOversprayEvents = tracker.update(0.1, sim);
  assert.equal(
    failOversprayEvents.filter((e) => e.type === 'clean_pass').length,
    0,
  );

  // 3. Roll exceeded limits (> 0.52 rad)
  tracker.reset();
  sim.covered.clear();
  sim.oversprayAcres = 0;
  sim.spraying = true;
  sim.roll = 0.65; // > 0.52 rad
  tracker.update(0.1, sim);
  for (let i = 0; i < 150; i++) sim.covered.add(i);
  sim.spraying = false;
  const failRollEvents = tracker.update(0.1, sim);
  assert.equal(failRollEvents.filter((e) => e.type === 'clean_pass').length, 0);
});

void test('fresh coverage pays by treated area, while repeat and invalid spraying earn nothing', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.x = sim.job.x;
  sim.z = sim.job.z;
  sim.y = ground(sim.x, sim.z) + 18;
  sim.spraying = true;
  sim.speed = 40;
  const tracker = new ArcadeTracker();
  tracker.passStreak = 3;
  sim.newCellsAdded = 0;
  assert.equal(tracker.update(5, sim).filter((e) => 'bonus' in e).length, 0);
  sim.newCellsAdded = 6;
  assert.deepEqual(
    tracker.update(0.05, sim).filter((e) => e.type === 'flow_tick'),
    [{ type: 'flow_tick', streak: 3, bonus: 6 }],
  );
  sim.newCellsAdded = 0;
  assert.equal(tracker.update(5, sim).filter((e) => 'bonus' in e).length, 0);
  sim.newCellsAdded = 12;
  sim.offTargetFraction = 0.5;
  assert.equal(tracker.update(0.05, sim).filter((e) => 'bonus' in e).length, 0);
});

void test('deck skim pays only for fresh, valid coverage in the altitude pocket', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  sim.x = sim.job.x;
  sim.z = sim.job.z;
  sim.y = ground(sim.x, sim.z) + 8;
  sim.spraying = true;
  sim.speed = 40;
  const tracker = new ArcadeTracker();
  sim.newCellsAdded = 8;
  assert.equal(
    tracker.update(0.05, sim).filter((e) => e.type === 'deck_skim').length,
    1,
  );
  sim.newCellsAdded = 0;
  assert.equal(
    tracker.update(5, sim).filter((e) => e.type === 'deck_skim').length,
    0,
  );
  sim.newCellsAdded = 8;
  sim.speed = 70;
  assert.equal(
    tracker.update(0.05, sim).filter((e) => e.type === 'deck_skim').length,
    0,
  );
  assert.equal(tracker.isDeckSkimming, false);
});

// 4. "Swath Lock" Alignment Tracker (within +-1.5m of pass line)
void test('swath lock alignment tracker detects within +-1.5m of pass line', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const tracker = new ArcadeTracker();
  const passes = flightPasses(sim);
  const targetPass = passes[0];

  // Position plane within 0.8m of pass centerline
  sim.x = targetPass.x + 0.8;
  sim.z = targetPass.minZ + 50;

  const lockEvents = tracker.update(0.1, sim);
  assert.equal(tracker.locked, true);
  assert.equal(tracker.swathLocked, true);
  assert.ok(
    lockEvents.some((e) => e.type === 'swath_lock' && e.locked === true),
  );

  // Drift off centerline (> 1.5m)
  sim.x = targetPass.x + 2.5;
  const unlockEvents = tracker.update(0.1, sim);
  assert.equal(tracker.locked, false);
  assert.equal(tracker.swathLocked, false);
  assert.ok(
    unlockEvents.some((e) => e.type === 'swath_lock' && e.locked === false),
  );
});

// 5. Acrobatic Ag-Turn Detection
void test('acrobatic ag-turn: SNAP AG-TURN (flat turn <= 8s) awards $40', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const tracker = new ArcadeTracker();

  // Spraying at edge of field
  sim.x = sim.job.x;
  sim.z = sim.job.z;
  sim.spraying = true;
  sim.heading = 0;
  sim.y = ground(sim.x, sim.z) + 15;
  sim.roll = 0;
  tracker.update(0.1, sim);

  for (const id of [...fieldCells(sim.job).keys()].slice(0, 12))
    sim.covered.add(id);
  // Cut spray to initiate turn
  sim.spraying = false;
  tracker.update(0.1, sim);

  // Flat snap turn in 4.0s: heading reverses to Math.PI, climb is minimal
  sim.elapsed += 4.0;
  sim.heading = Math.PI;
  sim.roll = 0.2; // flat turn

  // Spray turned back on
  sim.spraying = true;
  const events = tracker.update(0.1, sim);
  const turn = events.find((e) => e.type === 'ag_turn');
  assert.ok(turn, 'Should emit ag_turn event');
  assert.equal(turn?.name, 'SNAP AG-TURN');
  assert.equal(turn?.bonus, 40);
});

void test('acrobatic ag-turn: WIZARD WINGOVER (apex climb >= 12m, roll > 35°, time <= 12s) awards $75', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const tracker = new ArcadeTracker();

  sim.x = sim.job.x;
  sim.z = sim.job.z;
  sim.spraying = true;
  sim.heading = 0;
  sim.y = ground(sim.x, sim.z) + 15;
  tracker.update(0.1, sim);

  for (const id of [...fieldCells(sim.job).keys()].slice(0, 12))
    sim.covered.add(id);
  // Cut spray
  sim.spraying = false;
  tracker.update(0.1, sim);

  // Wingover climb + roll
  sim.elapsed += 6.0; // <= 12s
  sim.y += 14; // apex climb >= 12m
  sim.roll = 0.65; // Reachable with normal banking
  sim.heading = Math.PI; // heading reversed

  sim.spraying = true;
  const events = tracker.update(0.1, sim);
  const turn = events.find((e) => e.type === 'ag_turn');
  assert.ok(turn);
  assert.equal(turn?.name, 'WIZARD WINGOVER');
  assert.equal(turn?.bonus, 75);
});

void test('acrobatic ag-turn: CLIMBING REVERSAL (climb >= 18m, roll > 40°, dive) awards $125', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const tracker = new ArcadeTracker();

  sim.x = sim.job.x;
  sim.z = sim.job.z;
  sim.spraying = true;
  sim.heading = 0;
  const startY = ground(sim.x, sim.z) + 15;
  sim.y = startY;
  tracker.update(0.1, sim);

  for (const id of [...fieldCells(sim.job).keys()].slice(0, 12))
    sim.covered.add(id);
  // Cut spray
  sim.spraying = false;
  tracker.update(0.1, sim);

  // Step 1: Climb 20m + inverted roll (150° = 2.61 rad)
  sim.elapsed += 3.0;
  sim.y = startY + 20; // apex climb >= 18m
  sim.roll = 0.73; // Reachable with normal banking
  tracker.update(0.1, sim);

  // Step 2: Dive down 6m
  sim.elapsed += 3.0;
  sim.y = startY + 14; // descended 6m from apex
  sim.pitch = -0.25; // diving
  sim.heading = Math.PI; // heading reversed

  // Turn spray back on
  sim.spraying = true;
  const events = tracker.update(0.1, sim);
  const turn = events.find((e) => e.type === 'ag_turn');
  assert.ok(turn, 'Should detect CLIMBING REVERSAL');
  assert.equal(turn?.name, 'CLIMBING REVERSAL');
  assert.equal(turn?.bonus, 125);
});

// 6. Simulation Integration & Stunt Bonus Crediting
void test('Simulation integrates ArcadeTracker, advances in sim.step, holds earned flight bonuses until completion', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  assert.ok(sim.arcade instanceof ArcadeTracker);

  // Position plane in field
  sim.x = 0;
  sim.z = 0;
  sim.y = ground(sim.x, sim.z) + 8.0;
  sim.roll = 0;
  sim.speed = 40;
  sim.throttle = 40;

  const initialCash = sim.career.cash;
  const initialStunt = sim.result.stuntBonus ?? 0;

  // Step 1.2s while spraying in field
  for (let f = 0; f < 24; f++) {
    sim.step(0.05, { ...freshControls(), spray: true });
  }

  // Should have received flow ticks and deck skim bonuses
  assert.equal(
    sim.career.cash,
    initialCash,
    'Bonuses settle with the contract',
  );
  assert.ok(
    (sim.result.stuntBonus ?? 0) > initialStunt,
    `Stunt bonus credited: ${sim.result.stuntBonus} > ${initialStunt}`,
  );
  assert.ok(sim.lastArcadeEvents !== undefined);

  // Reset clears arcade tracker
  sim.arcade.passStreak = 5;
  sim.reset();
  assert.equal(sim.arcade.passStreak, 1);
});

// 7. Web Audio Procedural Synthesis (Mock AudioContext)
void test('GameAudio procedural synthesis methods execute cleanly in mock audio context', () => {
  // Install mock AudioContext
  const originalContext = (globalThis as unknown as Record<string, unknown>)
    .AudioContext;
  (globalThis as unknown as Record<string, unknown>).AudioContext =
    MockAudioContext;

  try {
    const audio = new GameAudio();

    // 1. playSprayPop (circular oscillator pool)
    assert.doesNotThrow(() => {
      for (let i = 0; i < 16; i++) {
        audio.playSprayPop();
      }
    });

    // 2. playStreakChord (1 to 5 notes, 5 has chorus)
    for (let s = 1; s <= 5; s++) {
      assert.doesNotThrow(() => {
        audio.playStreakChord(s);
      });
    }

    // 3. playCashRegister (dual bell harmonics + latch)
    assert.doesNotThrow(() => {
      audio.playCashRegister();
    });

    // 4. playDeckHum (120 Hz acoustic cushion drone)
    assert.doesNotThrow(() => {
      audio.playDeckHum(true);
      audio.playDeckHum(false);
    });

    // 5. playNearMissWhoosh (60 Hz sub-bass air displacement)
    assert.doesNotThrow(() => {
      audio.playNearMissWhoosh();
    });

    audio.dispose();
  } finally {
    (globalThis as unknown as Record<string, unknown>).AudioContext =
      originalContext;
  }
});

void test('AudioCueTracker handles arcade events and avoids repeating frames', () => {
  const tracker = new AudioCueTracker();
  const baseFrame: AudioFrame = {
    ...audioFrame(new Simulation()),
    rewards: undefined,
    phase: 'flying',
    elapsed: 25,
    coverage: 50,
  };

  tracker.reset(baseFrame);

  // 1. Clean pass event emits streak-chord
  const passFrame: AudioFrame = {
    ...baseFrame,
    elapsed: 26,
    arcadeEvents: [{ type: 'clean_pass', streak: 2, bonus: 50 }],
  };
  assert.deepEqual(tracker.update(passFrame, 1), ['streak-chord']);

  // Steady frame should not repeat
  assert.deepEqual(tracker.update(passFrame, 2), []);

  // 2. Ag turn event emits cash-register
  const turnFrame: AudioFrame = {
    ...baseFrame,
    elapsed: 27,
    arcadeEvents: [{ type: 'ag_turn', name: 'WIZARD WINGOVER', bonus: 75 }],
  };
  assert.deepEqual(tracker.update(turnFrame, 3), ['cash-register']);
  assert.deepEqual(tracker.update(turnFrame, 4), []);

  // 3. Spray pop emits spray-pop
  const popFrame: AudioFrame = {
    ...baseFrame,
    elapsed: 28,
    sprayPop: true,
  };
  assert.deepEqual(tracker.update(popFrame, 5), ['spray-pop']);
  assert.deepEqual(tracker.update(popFrame, 6), []);
});
