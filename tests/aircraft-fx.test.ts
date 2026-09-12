import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { Simulation } from '../lib/simulation';
import { AircraftFX } from '../lib/fx/aircraft-fx';

void test('AircraftFX initializes particle systems with fixed pools, DynamicDrawUsage, and adds to scene', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);

  const fx = new AircraftFX(scene, plane);

  // Scene should have the 3 particle point meshes added
  const points = scene.children.filter((c) => c instanceof T.Points) as T.Points[];
  assert.equal(points.length, 3, 'Should create 3 Points meshes (vortex, dust, exhaust)');

  for (const p of points) {
    assert.equal(p.frustumCulled, false);
    const geo = p.geometry as T.BufferGeometry;
    const posAttr = geo.getAttribute('position') as T.BufferAttribute;
    const alphaAttr = geo.getAttribute('fxAlpha') as T.BufferAttribute;

    assert.ok(posAttr, 'Should have position attribute');
    assert.ok(alphaAttr, 'Should have fxAlpha attribute');
    assert.equal(posAttr.usage, T.DynamicDrawUsage, 'Positions should use DynamicDrawUsage');
    assert.equal(alphaAttr.usage, T.DynamicDrawUsage, 'Alphas should use DynamicDrawUsage');
  }

  fx.dispose();
});

void test('Wingtip vapor vortices emit only when pulling Gs and trail/fade over time', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new AircraftFX(scene, plane);

  const sim = new Simulation();
  // Level flight, moderate speed
  sim.roll = 0.05;
  sim.pitch = 0.05;
  sim.speed = 30;

  // Run update in calm state
  for (let i = 0; i < 5; i++) {
    fx.update(0.016, sim, i * 0.016);
  }

  const vortexPoints = scene.getObjectByName('aircraft-fx-vortices') as T.Points;
  const alphas = vortexPoints.geometry.getAttribute('fxAlpha') as T.BufferAttribute;

  let activeVortices = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeVortices++;
  }
  assert.equal(activeVortices, 0, 'No vortices should emit in calm level flight');

  // Trigger high roll Gs
  sim.roll = 0.45; // > 0.32
  for (let i = 0; i < 10; i++) {
    fx.update(0.016, sim, 1 + i * 0.016);
  }

  activeVortices = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeVortices++;
  }
  assert.ok(activeVortices > 0, 'Vortices should emit during high bank');

  // Let time elapse past 0.75s to ensure fading
  sim.roll = 0;
  for (let i = 0; i < 60; i++) {
    fx.update(0.02, sim, 2 + i * 0.02);
  }

  activeVortices = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeVortices++;
  }
  assert.equal(activeVortices, 0, 'Vortices should fade completely over 0.75 seconds');

  // Test speed trigger (> 38)
  sim.speed = 42;
  fx.update(0.05, sim, 4.0);
  activeVortices = 0;
  for (let i = 0; i < alphas.count; i++) {
    if (alphas.getX(i) > 0) activeVortices++;
  }
  assert.ok(activeVortices > 0, 'Vortices should emit when speed > 38');

  fx.dispose();
});

void test('Propeller ground wash kicks up dust and pollen when low and fast, drifting with windVector', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new AircraftFX(scene, plane);

  const sim = new Simulation();
  // High altitude (> 9m)
  sim.y = 200;
  sim.speed = 35;

  for (let i = 0; i < 5; i++) {
    fx.update(0.016, sim, i * 0.016);
  }

  const dustPoints = scene.getObjectByName('aircraft-fx-dust') as T.Points;
  const dustAlphas = dustPoints.geometry.getAttribute('fxAlpha') as T.BufferAttribute;

  let activeDust = 0;
  for (let i = 0; i < dustAlphas.count; i++) {
    if (dustAlphas.getX(i) > 0) activeDust++;
  }
  assert.equal(activeDust, 0, 'No ground dust when at high altitude');

  // Low altitude (< 9m) with speed > 20
  sim.y = (sim.y - sim.altitude) + 4; // altitude = 4
  sim.speed = 30;

  for (let i = 0; i < 15; i++) {
    fx.update(0.016, sim, 1 + i * 0.016);
  }

  activeDust = 0;
  for (let i = 0; i < dustAlphas.count; i++) {
    if (dustAlphas.getX(i) > 0) activeDust++;
  }
  assert.ok(activeDust > 0, 'Ground dust should kick up when altitude < 9 and speed > 20');

  // Check color attribute exists and has valid values
  const colorAttr = dustPoints.geometry.getAttribute('color') as T.BufferAttribute;
  assert.ok(colorAttr, 'Dust should have vertex colors');
  assert.ok(colorAttr.getX(0) > 0, 'Dust vertex color should be set');

  fx.dispose();
});

void test('Exhaust heat shimmer emits at high throttle and stays idle at low throttle', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new AircraftFX(scene, plane);

  const sim = new Simulation();
  sim.throttle = 25; // < 36

  for (let i = 0; i < 5; i++) {
    fx.update(0.016, sim, i * 0.016);
  }

  const exhaustPoints = scene.getObjectByName('aircraft-fx-exhaust') as T.Points;
  const exhaustAlphas = exhaustPoints.geometry.getAttribute('fxAlpha') as T.BufferAttribute;

  let activeExhaust = 0;
  for (let i = 0; i < exhaustAlphas.count; i++) {
    if (exhaustAlphas.getX(i) > 0) activeExhaust++;
  }
  assert.equal(activeExhaust, 0, 'No exhaust shimmer at low throttle');

  // High throttle (> 36)
  sim.throttle = 48;
  for (let i = 0; i < 15; i++) {
    fx.update(0.016, sim, 1 + i * 0.016);
  }

  activeExhaust = 0;
  for (let i = 0; i < exhaustAlphas.count; i++) {
    if (exhaustAlphas.getX(i) > 0) activeExhaust++;
  }
  assert.ok(activeExhaust > 0, 'Exhaust shimmer should emit at throttle > 36');

  fx.dispose();
});

void test('dispose removes all meshes from scene and safe against double-dispose or post-dispose updates', () => {
  const scene = new T.Scene();
  const plane = new T.Group();
  scene.add(plane);
  const fx = new AircraftFX(scene, plane);

  assert.equal(scene.children.filter((c) => c instanceof T.Points).length, 3);

  fx.dispose();
  assert.equal(scene.children.filter((c) => c instanceof T.Points).length, 0);

  // Calling dispose again should be a safe no-op
  fx.dispose();

  // Updating after dispose should safely no-op
  const sim = new Simulation();
  sim.roll = 0.5;
  fx.update(0.016, sim, 1.0);
});
