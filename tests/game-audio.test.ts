import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioCueTracker, audioFrame, readAudioMix } from '../lib/game-audio';
import { Simulation, ground } from '../lib/simulation';
import { countyWeather } from '../lib/weather';

void test('hazard warnings and bird strikes sound once instead of repeating on steady frames', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    birdHits: 0,
    hazard: false,
  };
  tracker.reset(frame);
  assert.deepEqual(tracker.update({ ...frame, hazard: true }, 1), ['hazard']);
  assert.deepEqual(tracker.update({ ...frame, hazard: true }, 2), []);
  assert.deepEqual(tracker.update({ ...frame, hazard: true, birdHits: 1 }, 3), [
    'bird-strike',
  ]);
  assert.deepEqual(
    tracker.update({ ...frame, hazard: true, birdHits: 1 }, 4),
    [],
  );
});

void test('audio starts quietly and does not replay earned milestones when enabled', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    coverage: 96,
  };
  assert.deepEqual(tracker.update(frame, 0), []);
  assert.deepEqual(tracker.update(frame, 1), []);
  assert.deepEqual(tracker.update({ ...frame, coverage: 94 }, 2), []);
  assert.deepEqual(tracker.update(frame, 3), []);
});

void test('target and bonus each sound once despite server coverage corrections', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    coverage: 79,
  };
  tracker.reset(frame);
  assert.deepEqual(tracker.update({ ...frame, coverage: 80 }, 1), ['target']);
  assert.deepEqual(tracker.update(frame, 2), []);
  assert.deepEqual(tracker.update({ ...frame, coverage: 81 }, 3), []);
  assert.deepEqual(tracker.update({ ...frame, coverage: 96 }, 4), ['bonus']);
  assert.deepEqual(tracker.update({ ...frame, coverage: 94 }, 5), []);
  assert.deepEqual(tracker.update({ ...frame, coverage: 97 }, 6), []);
});

void test('free flight has no assignment milestones or overspray alarms', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation(), false),
    phase: 'flying' as const,
    elapsed: 20,
  };
  tracker.reset(frame);
  assert.deepEqual(
    tracker.update({ ...frame, coverage: 100, overspraying: true }, 1),
    [],
  );
});

void test('overspray alarm is throttled and a paused flight is quiet', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    overspraying: true,
    elapsed: 20,
  };
  tracker.reset(frame);
  assert.deepEqual(tracker.update(frame, 1), ['overspray']);
  assert.deepEqual(tracker.update(frame, 2), []);
  assert.deepEqual(tracker.update(frame, 6.1), ['overspray']);
  assert.deepEqual(tracker.update({ ...frame, phase: 'paused' }, 12), []);
});

void test('low tank, refill and completion cues use actual transitions', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    tank: 16,
  };
  tracker.reset(frame);
  assert.deepEqual(tracker.update({ ...frame, tank: 15 }, 1), ['low-tank']);
  assert.deepEqual(tracker.update({ ...frame, tank: 14 }, 2), []);
  assert.deepEqual(tracker.update({ ...frame, tank: 100 }, 3), ['refill']);
  assert.deepEqual(
    tracker.update({ ...frame, phase: 'complete', tank: 100 }, 4),
    ['complete'],
  );
  assert.deepEqual(
    tracker.update({ ...frame, phase: 'complete', tank: 100 }, 5),
    [],
  );
});

void test('a larger purchased tank is not mistaken for a refill', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    tank: 90,
  };
  tracker.reset(frame);
  assert.deepEqual(
    tracker.update({ ...frame, tank: 130, capacity: 140 }, 1),
    [],
  );
});

void test('a public completion still pays off audibly when its assignment is released', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    coverage: 96,
  };
  tracker.reset(frame);
  assert.deepEqual(
    tracker.update({ ...frame, phase: 'complete', assigned: false }, 1),
    ['complete'],
  );
  assert.deepEqual(
    tracker.update({ ...frame, phase: 'complete', assigned: false }, 2),
    [],
  );
});

void test('low-tank warnings do not repeat on corrections and rearm after a refill', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'flying' as const,
    elapsed: 20,
    tank: 16,
  };
  tracker.reset(frame);
  assert.deepEqual(tracker.update({ ...frame, tank: 14 }, 1), ['low-tank']);
  assert.deepEqual(tracker.update(frame, 2), []);
  assert.deepEqual(tracker.update({ ...frame, tank: 14 }, 3), []);
  assert.deepEqual(tracker.update({ ...frame, tank: 100 }, 4), ['refill']);
  assert.deepEqual(tracker.update({ ...frame, tank: 14 }, 5), ['low-tank']);
});

void test('new flights reset milestones and pause/resume does not repeat launch', () => {
  const tracker = new AudioCueTracker();
  const frame = {
    ...audioFrame(new Simulation()),
    phase: 'complete' as const,
    elapsed: 90,
    coverage: 99,
  };
  tracker.reset(frame);
  const next = { ...frame, phase: 'flying' as const, elapsed: 0, coverage: 0 };
  assert.deepEqual(tracker.update(next, 1), ['launch']);
  assert.deepEqual(tracker.update({ ...next, elapsed: 20, coverage: 80 }, 2), [
    'target',
  ]);
  assert.deepEqual(
    tracker.update({ ...next, phase: 'paused', elapsed: 21, coverage: 80 }, 3),
    [],
  );
  assert.deepEqual(
    tracker.update({ ...next, elapsed: 21, coverage: 80 }, 4),
    [],
  );
});

void test('saved volumes reject malformed values and preserve zero', () => {
  assert.deepEqual(readAudioMix('broken'), { music: 0.35, effects: 0.6 });
  assert.deepEqual(readAudioMix('null'), { music: 0.35, effects: 0.6 });
  assert.deepEqual(readAudioMix('{"music":0,"effects":3}'), {
    music: 0,
    effects: 1,
  });
  assert.deepEqual(readAudioMix('{"music":-1,"effects":"1"}'), {
    music: 0,
    effects: 0.6,
  });
});

void test('soundscape follows actual wind, rain and aircraft heading', () => {
  const sim = new Simulation();
  sim.weather = {
    ...countyWeather(0, 2),
    windMps: 8,
    gust: 0,
    windFrom: 270,
    rain: 1,
  };
  sim.job = { ...sim.job, windStrength: 1 };
  sim.heading = 0;
  sim.y = ground(sim.x, sim.z) + 20;
  const east = audioFrame(sim);
  assert.equal(east.rain, 1);
  assert.equal(east.altitude, 20);
  assert.equal(east.wind, 8);
  assert.equal(east.pan, 0.7);
  sim.heading = Math.PI;
  assert.equal(audioFrame(sim).pan, -0.7);
});
