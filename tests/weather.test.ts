import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countyWeather,
  weatherFromSeed,
  practiceWeather,
  WEATHER_PERIOD,
  LESSON_WEATHER,
  windVector,
  windLabel,
} from '../lib/weather';
import {
  Simulation,
  contracts,
  freshControls,
  ground,
} from '../lib/simulation';
import { hydrate, serialize } from '../lib/county';
import { sprayFootprint } from '../lib/flight-guidance';

void test('county forecasts are deterministic within a shared half-hour and advance at the boundary', () => {
  const start = 1000 * WEATHER_PERIOD;
  assert.deepEqual(
    countyWeather(start),
    countyWeather(start + WEATHER_PERIOD - 1),
  );
  assert.notEqual(
    countyWeather(start).id,
    countyWeather(start + WEATHER_PERIOD).id,
  );
  assert.equal(countyWeather(start).nextChangeAt, start + WEATHER_PERIOD);
  assert.deepEqual(
    new Set(
      Array.from({ length: 200 }, (_, seed) => weatherFromSeed(seed).kind),
    ),
    new Set(['clear', 'haze', 'overcast', 'rain']),
  );
});

void test('the starter keeps calm clear weather and the second lesson keeps its promised west wind', () => {
  for (let seed = 0; seed < 100; seed++) {
    assert.deepEqual(practiceWeather(0, seed), LESSON_WEATHER);
    assert.equal(practiceWeather(1, seed).windFrom, 270);
    assert.ok(practiceWeather(1, seed).windMps <= 1.1);
  }
  assert.ok(
    new Set(
      Array.from({ length: 100 }, (_, seed) => practiceWeather(2, seed).id),
    ).size > 1,
  );
});

void test('meteorological direction produces matching drift and stability reduces both axes', () => {
  const west = windVector({ ...LESSON_WEATHER, windFrom: 270 }, 0);
  assert.ok(west.x > 0);
  assert.ok(Math.abs(west.z) < 1e-8);
  const north = windVector({ ...LESSON_WEATHER, windFrom: 0 }, 0);
  assert.ok(north.z > 0);
  assert.ok(Math.abs(north.x) < 1e-8);
  const southWest = { ...LESSON_WEATHER, windFrom: 225 };
  const base = windVector(southWest, 3),
    upgraded = windVector(southWest, 3, 1, 3);
  assert.ok(Math.abs(upgraded.x) < Math.abs(base.x));
  assert.ok(Math.abs(upgraded.z) < Math.abs(base.z));
  assert.match(windLabel(southWest), /^SW \d+ kt$/);
});

void test('wind drives aircraft and predicted spray in both axes and survives server replay', () => {
  const sim = new Simulation();
  sim.reset(contracts[2]);
  sim.weather = { ...weatherFromSeed(22), windFrom: 225 };
  sim.x = sim.z = 0;
  sim.y = ground(0, 0) + 19;
  const still = hydrate(serialize(sim));
  still.weather = { ...sim.weather, windMps: 0 };
  sim.step(0.05, freshControls());
  still.step(0.05, freshControls());
  assert.ok(sim.x > still.x);
  assert.ok(sim.z < still.z);
  const footprint = sprayFootprint(sim);
  assert.ok(footprint.reduce((sum, p) => sum + p.x, 0) / 4 > sim.x);
  assert.ok(footprint.reduce((sum, p) => sum + p.z, 0) / 4 < sim.z);
  const restored = hydrate(serialize(sim));
  assert.deepEqual(restored.weather, sim.weather);
  sim.step(0.05, { ...freshControls(), spray: true });
  restored.step(0.05, { ...freshControls(), spray: true });
  assert.deepEqual(serialize(restored), serialize(sim));
});

void test('old saved flights retain their legacy wind until a forecast is assigned', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  const { weather: _weather, ...legacy } = serialize(sim);
  const restored = hydrate(legacy);
  assert.equal(restored.weather, null);
  assert.deepEqual(restored.windVector, sim.windVector);
});
