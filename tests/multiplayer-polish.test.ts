import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { GameAudio, audioFrame } from '../lib/game-audio';
import { Simulation } from '../lib/simulation';
import type { RemotePilotEntry } from '../lib/world';
import type { PublicPilot } from '../lib/county';

// Mock Web Audio environment
class MockAudioParam {
  value = 0;
  targetValue = 0;
  timeConstant = 0;
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
  setTargetAtTime(val: number, _time: number, timeConstant: number) {
    this.targetValue = val;
    this.value = val;
    this.timeConstant = timeConstant;
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
  currentTime = 12;
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

void test('GameAudio.updateRemoteProximity synthesizes engine volume, frequency, and pan', () => {
  const originalContext = (globalThis as unknown as Record<string, unknown>)
    .AudioContext;
  (globalThis as unknown as Record<string, unknown>).AudioContext =
    MockAudioContext;

  try {
    const audio = new GameAudio();
    const sim = new Simulation();
    const frame = audioFrame(sim);

    // Make audio audible with effects enabled
    audio.update(
      { ...frame, phase: 'flying' },
      { music: 0.5, effects: 0.8 },
      true,
      false,
      false,
    );

    // Access private audio nodes for verification
    const internal = audio as unknown as {
      remoteEngineGain: MockGainNode;
      remoteEngineOsc: MockOscillatorNode;
      remoteEnginePan: MockStereoPannerNode;
    };

    // 1. Close proximity (15m): maximum proximity (1.0) -> targetGain = 1.0 * 1.0 * 0.16 = 0.16
    audio.updateRemoteProximity(15, 0, 0);
    assert.equal(
      Math.round(internal.remoteEngineGain.gain.targetValue * 1000) / 1000,
      0.16,
      'Close proximity gain should be 0.16',
    );
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      92,
      'Rest relative speed frequency should be 92 Hz',
    );
    assert.equal(
      internal.remoteEnginePan.pan.targetValue,
      0,
      'Center pan should be 0',
    );

    // 2. Mid proximity (82.5m): proximity = 1 - (82.5 - 15) / 135 = 0.5 -> targetGain = 0.25 * 0.16 = 0.04
    // High relative speed (40 m/s): freq = 92 + min(28, 40 * 0.45) = 92 + 18 = 110 Hz
    // Left stereo pan (-0.6)
    audio.updateRemoteProximity(82.5, 40, -0.6);
    assert.equal(
      Math.round(internal.remoteEngineGain.gain.targetValue * 1000) / 1000,
      0.04,
      'Mid proximity gain should be 0.04',
    );
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      110,
      'Frequency at 40 m/s relative speed should be 110 Hz',
    );
    assert.equal(
      Math.round(internal.remoteEnginePan.pan.targetValue * 10) / 10,
      -0.6,
      'Pan should be -0.6',
    );

    // 3. Pan clamping: values beyond [-0.9, 0.9] should be clamped
    audio.updateRemoteProximity(50, 100, -2.5);
    assert.equal(
      internal.remoteEnginePan.pan.targetValue,
      -0.9,
      'Pan should clamp to -0.9 on extreme left',
    );
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      120,
      'Frequency should clamp to 120 Hz (92 + 28)',
    );

    audio.updateRemoteProximity(50, 20, 3.0);
    assert.equal(
      internal.remoteEnginePan.pan.targetValue,
      0.9,
      'Pan should clamp to 0.9 on extreme right',
    );

    // 4. Distant (> 150m): gain should be silenced (0)
    audio.updateRemoteProximity(180, 50, 0);
    assert.equal(
      internal.remoteEngineGain.gain.targetValue,
      0,
      'Distant remote aircraft should be silenced',
    );

    audio.dispose();
  } finally {
    (globalThis as unknown as Record<string, unknown>).AudioContext =
      originalContext;
  }
});

void test('RemotePilotEntry data structures and smooth quaternion slerp interpolation', () => {
  const mesh = new T.Group();
  const pilot: PublicPilot = {
    id: 'pilot-42',
    callsign: 'Dusty Crophopper',
    x: 100,
    y: 12,
    z: -300,
    heading: Math.PI / 4,
    roll: 0.1,
    pitch: -0.05,
    speed: 38,
    phase: 'flying',
    spraying: true,
    seenAt: Date.now(),
  };

  const entry: RemotePilotEntry = {
    mesh,
    target: pilot,
    targetPos: new T.Vector3(pilot.x, pilot.y, pilot.z),
    targetQuat: new T.Quaternion().setFromEuler(
      new T.Euler(pilot.pitch, pilot.heading, pilot.roll, 'YXZ'),
    ),
    sprayPositions: new Float32Array(60 * 3),
    sprayLife: new Float32Array(60),
    sprayIndex: 0,
  };

  mesh.position.set(0, 5, 0);
  mesh.quaternion.identity();

  // Test position lerp
  mesh.position.lerp(entry.targetPos, 0.18);
  assert.ok(mesh.position.x > 0 && mesh.position.x < 100, 'Position X should lerp toward target');
  assert.ok(mesh.position.y > 5 && mesh.position.y < 12, 'Position Y should lerp toward target');
  assert.ok(mesh.position.z < 0 && mesh.position.z > -300, 'Position Z should lerp toward target');

  // Test orientation slerp
  mesh.quaternion.slerp(entry.targetQuat, 0.15);
  const len = mesh.quaternion.length();
  assert.ok(Math.abs(len - 1.0) < 0.0001, 'Slerped quaternion should remain a normalized unit quaternion');

  // Verify distance calculation
  const dist = mesh.position.distanceTo(entry.targetPos);
  assert.ok(dist > 0 && Number.isFinite(dist), 'Distance should be positive and finite');
});

void test('Remote spray mist particles emit and drift when spraying is active', () => {
  const count = 60;
  const sprayPositions = new Float32Array(count * 3);
  const sprayLife = new Float32Array(count);
  let sprayIndex = 0;

  // Initialize all off-screen
  for (let i = 0; i < count; i++) {
    sprayPositions[i * 3 + 1] = -1000;
    sprayLife[i] = 0;
  }

  // Simulate emission when target.spraying is true
  const dt = 1 / 60;
  const emitCount = 2;
  const cloudWind = new T.Vector3(5, 0, -3);

  for (let p = 0; p < emitCount; p++) {
    const idx = sprayIndex % count;
    sprayIndex++;
    sprayPositions[idx * 3] = 50;
    sprayPositions[idx * 3 + 1] = 10;
    sprayPositions[idx * 3 + 2] = -20;
    sprayLife[idx] = 2.2;
  }

  assert.ok(
    Math.abs(sprayLife[0] - 2.2) < 0.001,
    'Emitted particle 0 should have life ~2.2',
  );
  assert.ok(
    Math.abs(sprayLife[1] - 2.2) < 0.001,
    'Emitted particle 1 should have life ~2.2',
  );
  assert.equal(sprayLife[2], 0, 'Unemitted particle 2 should have 0 life');

  // Advance 1 frame of particle physics
  for (let p = 0; p < count; p++) {
    if (sprayLife[p] > 0) {
      sprayLife[p] -= dt;
      sprayPositions[p * 3] += cloudWind.x * dt * 0.6;
      sprayPositions[p * 3 + 1] -= dt * 4.5;
      sprayPositions[p * 3 + 2] += cloudWind.z * dt * 0.6;
    } else {
      sprayPositions[p * 3 + 1] = -1000;
    }
  }

  assert.ok(sprayLife[0] < 2.2, 'Active particle life should decrease');
  assert.ok(sprayPositions[1] < 10, 'Particle Y should settle downward from gravity/wash');
  assert.ok(sprayPositions[0] > 50, 'Particle X should drift with wind');
  assert.equal(sprayPositions[2 * 3 + 1], -1000, 'Inactive particle Y should stay parked at -1000');
});

void test('Mini-map radar pip boundary clamping and distance formatting', () => {
  const w = 320;
  const h = 320;

  // Target off-screen to the top-right
  const screenX = 500;
  const screenZ = -200;

  const angle = Math.atan2(screenZ - h / 2, screenX - w / 2);
  const edgeX = Math.max(
    12,
    Math.min(w - 12, w / 2 + Math.cos(angle) * (w / 2 - 14)),
  );
  const edgeZ = Math.max(
    12,
    Math.min(h - 12, h / 2 + Math.sin(angle) * (h / 2 - 14)),
  );

  // Assert pip coordinates stay strictly inside the visible canvas
  assert.ok(edgeX >= 12 && edgeX <= w - 12, `Edge X (${edgeX}) must stay within canvas margins [12, ${w - 12}]`);
  assert.ok(edgeZ >= 12 && edgeZ <= h - 12, `Edge Z (${edgeZ}) must stay within canvas margins [12, ${h - 12}]`);

  // Distance formatters
  const formatDist = (distM: number) =>
    distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}k`;

  assert.equal(formatDist(420), '420m', 'Distances under 1000m should format with m suffix');
  assert.equal(formatDist(999), '999m', '999m formats with m suffix');
  assert.equal(formatDist(1200), '1.2k', '1200m formats with k suffix');
  assert.equal(formatDist(4500), '4.5k', '4500m formats with k suffix');
});

void test('Callsign and rival placard formatting distinguishes rival and standard pilots', () => {
  const formatPlacard = (callsign: string, isRival: boolean, distMeters?: number) => {
    let text = isRival ? `★ RIVAL · ${callsign}` : callsign;
    if (distMeters !== undefined && distMeters > 0) {
      text += ` · ${distMeters < 1000 ? `${distMeters}m` : `${(distMeters / 1000).toFixed(1)}km`}`;
    }
    return text;
  };

  assert.equal(
    formatPlacard('Hawkeye-1', false, 350),
    'Hawkeye-1 · 350m',
    'Standard pilot placard includes callsign and meter distance',
  );
  assert.equal(
    formatPlacard('Hawkeye-1', false, 1850),
    'Hawkeye-1 · 1.9km',
    'Standard pilot placard formats km distance over 1000m',
  );
  assert.equal(
    formatPlacard('Viper-7', true, 80),
    '★ RIVAL · Viper-7 · 80m',
    'Rival placard includes ★ RIVAL badge',
  );
});

void test('3D vector Doppler closing speed and receding pitch drop', () => {
  const originalContext = (globalThis as unknown as Record<string, unknown>)
    .AudioContext;
  (globalThis as unknown as Record<string, unknown>).AudioContext =
    MockAudioContext;

  try {
    const audio = new GameAudio();
    const sim = new Simulation();
    const frame = audioFrame(sim);

    audio.update(
      { ...frame, phase: 'flying' },
      { music: 0.5, effects: 0.8 },
      true,
      false,
      false,
    );

    const internal = audio as unknown as {
      remoteEngineGain: MockGainNode;
      remoteEngineOsc: MockOscillatorNode;
      remoteEnginePan: MockStereoPannerNode;
    };

    // 1. Approaching at 60 m/s closing speed: freq = 92 + min(28, 60 * 0.45) = 92 + 27 = 119 Hz
    audio.updateRemoteProximity(35, 60, 0);
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      119,
      'Approaching at 60 m/s should shift pitch up to 119 Hz',
    );

    // 2. Receding at -40 m/s (passing by): freq = 92 + max(-24, -40 * 0.45) = 92 - 18 = 74 Hz
    audio.updateRemoteProximity(35, -40, 0);
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      74,
      'Receding at -40 m/s should drop pitch down to 74 Hz',
    );

    // 3. Extreme receding clamp: -100 m/s -> clamped to 92 - 24 = 68 Hz
    audio.updateRemoteProximity(35, -100, 0);
    assert.equal(
      internal.remoteEngineOsc.frequency.targetValue,
      68,
      'Extreme receding speed clamps to 68 Hz',
    );

    audio.dispose();
  } finally {
    (globalThis as unknown as Record<string, unknown>).AudioContext =
      originalContext;
  }
});

void test('3D cockpit-relative stereo panning inverts pan during inverted flight', () => {
  const plane = new T.Group();
  plane.position.set(0, 50, 0);

  // Upright level flight (0 roll)
  plane.quaternion.identity();
  plane.updateMatrixWorld(true);

  // Remote aircraft 20m off the starboard (right / +X) wing
  const remoteWorldPos = new T.Vector3(20, 50, 0);

  const localPosUpright = plane.worldToLocal(remoteWorldPos.clone());
  const panUpright = Math.max(-0.9, Math.min(0.9, localPosUpright.x / 35));
  assert.ok(panUpright > 0.5, `Upright starboard wingman should pan right (> 0.5), got ${panUpright}`);

  // Roll 180° inverted (cockpit upside down)
  plane.quaternion.setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI);
  plane.updateMatrixWorld(true);

  const localPosInverted = plane.worldToLocal(remoteWorldPos.clone());
  const panInverted = Math.max(-0.9, Math.min(0.9, localPosInverted.x / 35));
  assert.ok(
    panInverted < -0.5,
    `Inverted flight should pan left (< -0.5) when wingman is on visual left, got ${panInverted}`,
  );
  assert.ok(
    Math.abs(panUpright + panInverted) < 0.001,
    'Upright and inverted panning must be exact mirror opposites',
  );
});

void test('Player-centric off-screen radar pip angles accurately point toward remote aircraft', () => {
  const w = 320;
  const h = 320;

  // Player aircraft at (x = 1000, z = -500)
  const player = { x: 1000, z: -500 };

  // Remote pilot to the West (x = 200, z = -500)
  const remoteWest = { x: 200, z: -500 };
  const angleWest = Math.atan2(remoteWest.z - player.z, remoteWest.x - player.x);
  assert.ok(
    Math.abs(Math.abs(angleWest) - Math.PI) < 0.001,
    'Angle to western aircraft must be ~PI (180 deg)',
  );

  const edgeXWest = Math.max(12, Math.min(w - 12, w / 2 + Math.cos(angleWest) * (w / 2 - 14)));
  assert.equal(edgeXWest, 14, 'Western aircraft must place radar pip on left canvas border (14px)');

  // Remote pilot to the North (x = 1000, z = -1200)
  const remoteNorth = { x: 1000, z: -1200 };
  const angleNorth = Math.atan2(remoteNorth.z - player.z, remoteNorth.x - player.x);
  assert.ok(
    Math.abs(angleNorth - (-Math.PI / 2)) < 0.001,
    'Angle to northern aircraft must be -PI/2 (-90 deg)',
  );

  const edgeZNorth = Math.max(12, Math.min(h - 12, h / 2 + Math.sin(angleNorth) * (h / 2 - 14)));
  assert.equal(edgeZNorth, 14, 'Northern aircraft must place radar pip on top canvas border (14px)');
});

