import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  SkyLifeSystem,
  createBalloonEnvelopeGeometry,
  createBalloonBasketGeometry,
  createBalloonMaterial,
  createJetAirlinerGeometry,
  createHawkGeometry,
  type BalloonPalette,
} from '../lib/fx/sky-life';
import { Simulation } from '../lib/simulation';
import type { Weather } from '../lib/weather';

const FAIR_WEATHER: Weather = {
  id: 1,
  kind: 'clear',
  label: 'Clear skies',
  temperature: 75,
  windMps: 4.2,
  windFrom: 270,
  gust: 0.15,
  cloud: 0.22,
  fog: 0.0001,
  sunlight: 3.1,
  rain: 0,
};

const STORM_WEATHER: Weather = {
  id: 2,
  kind: 'rain',
  label: 'Severe storm',
  temperature: 61,
  windMps: 12.0,
  windFrom: 315,
  gust: 0.65,
  cloud: 0.95,
  fog: 0.0008,
  sunlight: 0.4,
  rain: 0.85,
};

void test('createBalloonEnvelopeGeometry produces valid teardrop profile', () => {
  const geom = createBalloonEnvelopeGeometry();
  assert.ok(geom.getAttribute('position'), 'Must have position attribute');
  assert.ok(geom.getAttribute('normal'), 'Must have normal attribute');
  assert.ok(geom.getAttribute('uv'), 'Must have uv attribute');

  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const height = bb.max.y - bb.min.y;
  const width = bb.max.x - bb.min.x;

  assert.ok(height >= 20.0 && height <= 23.0, `Envelope height should be ~21m, got ${height}`);
  assert.ok(width >= 15.0 && width <= 18.0, `Envelope width should be ~17m, got ${width}`);
  geom.dispose();
});

void test('createBalloonBasketGeometry builds merged wicker basket and rigging', () => {
  const basket = createBalloonBasketGeometry();
  assert.ok(basket.getAttribute('position'), 'Must have position attribute');
  basket.computeBoundingBox();
  const bb = basket.boundingBox!;
  assert.ok(bb.min.y < -1.0, 'Basket should extend below throat opening');
  assert.ok(bb.max.y > 0.0, 'Burner frame should reach throat level');
  basket.dispose();
});

void test('createBalloonMaterial creates distinct shaders for all four county fair palettes', () => {
  const palettes: BalloonPalette[] = ['sunrise', 'heartland', 'rainbow', 'harvest'];

  for (const pal of palettes) {
    const mat = createBalloonMaterial(pal);
    assert.equal(
      mat.customProgramCacheKey(),
      `prairie-balloon-${pal}`,
      `Cache key must be unique for ${pal}`,
    );
    assert.equal(mat.side, T.DoubleSide, 'Envelope should be double-sided');

    // Simulate Three.js shader compilation
    const shader = {
      vertexShader: '#include <begin_vertex>',
      fragmentShader: '#include <color_fragment>',
      uniforms: {} as Record<string, { value: unknown }>,
    };
    mat.onBeforeCompile(
      shader as unknown as T.WebGLProgramParametersWithUniforms,
      {} as unknown as T.WebGLRenderer,
    );

    assert.ok(shader.vertexShader.includes('vBalloonUv'), 'Vertex shader must export vBalloonUv');
    assert.ok(shader.fragmentShader.includes('uColor1'), 'Fragment shader must use palette uniforms');
    assert.ok(shader.fragmentShader.includes('vBalloonUv'), 'Fragment shader must receive vBalloonUv');
    mat.dispose();
  }
});

void test('createJetAirlinerGeometry generates swept-wing commercial twin-turbofan model', () => {
  const jet = createJetAirlinerGeometry();
  assert.ok(jet.getAttribute('position'), 'Jet must have positions');
  jet.computeBoundingBox();
  const bb = jet.boundingBox!;

  const wingspan = bb.max.x - bb.min.x;
  const length = bb.max.z - bb.min.z;

  assert.ok(wingspan >= 30.0 && wingspan <= 38.0, `Wingspan should be ~34m, got ${wingspan}`);
  assert.ok(length >= 40.0 && length <= 55.0, `Fuselage length should be ~45-50m, got ${length}`);
  jet.dispose();
});

void test('createHawkGeometry creates soaring raptor with outstretched wings and fan tail', () => {
  const hawk = createHawkGeometry();
  assert.ok(hawk.getAttribute('position'), 'Hawk must have positions');
  hawk.computeBoundingBox();
  const bb = hawk.boundingBox!;

  const wingspan = bb.max.x - bb.min.x;
  assert.ok(wingspan >= 3.8 && wingspan <= 4.8, `Hawk wingspan should be ~4.2m, got ${wingspan}`);
  hawk.dispose();
});

void test('SkyLifeSystem instantiates entities, updates wind drift, buoyancy, and weather gating', () => {
  const scene = new T.Scene();
  const sun = new T.DirectionalLight('#ffffff', 1.0);
  scene.add(sun);

  const skyLife = new SkyLifeSystem(scene, sun);
  assert.equal(skyLife.balloons.length, 4, 'Should initialize 4 hot air balloons');
  assert.equal(skyLife.jets.length, 2, 'Should initialize 2 high-altitude jets');
  assert.equal(skyLife.hawks.length, 2, 'Should initialize 2 soaring raptors');
  assert.ok(scene.children.includes(skyLife.group), 'SkyLifeSystem group must be in scene');

  const b0 = skyLife.balloons[0];
  const initialX = b0.group.position.x;
  const initialZ = b0.group.position.z;

  // 1. Advance simulation during fair weather
  skyLife.update(1.0, 5.0, FAIR_WEATHER);

  assert.ok(b0.visible, 'Hot air balloons must be visible in fair weather');
  assert.ok(
    b0.group.position.x !== initialX || b0.group.position.z !== initialZ,
    'Balloon must drift horizontally with wind vector',
  );
  assert.ok(
    Number.isFinite(b0.group.position.y),
    'Balloon Y position must remain finite during buoyancy bobbing',
  );

  // 2. Advance simulation during severe storm
  skyLife.update(1.0, 6.0, STORM_WEATHER);
  assert.ok(!b0.visible, 'Hot air balloons must be grounded/hidden during storm conditions');
  assert.ok(!b0.group.visible, 'Group visibility must be false during storm');

  // 3. Jet and contrails update
  const jet0 = skyLife.jets[0];
  const initialJetX = jet0.x;
  skyLife.update(0.5, 7.0, FAIR_WEATHER);
  assert.ok(jet0.x !== initialJetX, 'Jet must advance along airway corridor');
  assert.ok(jet0.altitude >= 3400, 'Jet must cruise at high altitude (above clouds)');

  // 4. Soaring raptor updates
  const hawk0 = skyLife.hawks[0];
  const hx = hawk0.group.position.x;
  const hz = hawk0.group.position.z;
  const distToCenter = Math.hypot(hx - hawk0.centerX, hz - hawk0.centerZ);
  assert.ok(
    Math.abs(distToCenter - hawk0.radius) < 2.0,
    `Hawk must maintain orbital thermal radius (~${hawk0.radius}m), got ${distToCenter}`,
  );

  skyLife.dispose();
  assert.ok(!scene.children.includes(skyLife.group), 'Clean disposal removes group from scene');
});

void test('SkyLifeSystem awards balloon close flyby stunt bonus', () => {
  const scene = new T.Scene();
  const skyLife = new SkyLifeSystem(scene);
  const sim = new Simulation();

  const b0 = skyLife.balloons[0];
  // Place balloon in fair weather
  skyLife.update(0.1, 1.0, FAIR_WEATHER);

  // Position player aircraft within close flyby range (28m clearance)
  sim.x = b0.group.position.x + 20;
  sim.y = b0.group.position.y + 15;
  sim.z = b0.group.position.z + 10;
  sim.phase = 'flying';

  const events = skyLife.update(0.1, 1.1, FAIR_WEATHER, sim);
  const flyby = events.find((e) => e.type === 'balloon_flyby');

  assert.ok(flyby, 'Should detect close flyby past hot air balloon');
  assert.equal(flyby?.bonus, 100, 'Flyby bonus should be $100');
  assert.ok(flyby?.message.includes('BALLOON'), 'Message should announce balloon flyby');
  assert.ok(b0.cooldown > 0, 'Balloon should enter cooldown to prevent duplicate triggers');

  // Second immediate frame should not re-trigger during cooldown
  const repeatEvents = skyLife.update(0.1, 1.2, FAIR_WEATHER, sim);
  assert.equal(
    repeatEvents.filter((e) => e.type === 'balloon_flyby').length,
    0,
    'Must not trigger during cooldown',
  );

  skyLife.dispose();
});

void test('Jet contrails are strictly horizontal ribbons with no vertical plunge vertices', () => {
  const scene = new T.Scene();
  const skyLife = new SkyLifeSystem(scene);

  const jet = skyLife.jets[0];
  const ribbon = jet.contrailLeft;

  // Initially drawRange is 0 (no active knots yet)
  assert.equal(ribbon.geometry.drawRange.count, 0, 'Initial drawRange count must be 0');

  // Advance simulation across several drop timer intervals (dt = 0.4s * 5)
  for (let step = 0; step < 5; step++) {
    skyLife.update(0.4, step * 0.4, FAIR_WEATHER);
  }

  // Count active knots
  const activeKnots = ribbon.knots.filter((k) => k.active);
  assert.ok(activeKnots.length >= 3, `Should have at least 3 active knots, got ${activeKnots.length}`);

  // Check draw range matches active quads exactly
  const expectedDrawCount = (activeKnots.length - 1) * 6;
  assert.equal(
    ribbon.geometry.drawRange.count,
    expectedDrawCount,
    `DrawRange count (${ribbon.geometry.drawRange.count}) must match active quads (${expectedDrawCount})`,
  );

  const pos = ribbon.positions;
  const alphas = ribbon.alphas;

  // Verify that all active vertices lie in the horizontal plane at the jet altitude
  for (let i = 0; i < activeKnots.length; i++) {
    const k = ribbon.knots[i];
    const v0 = i * 2;
    const v1 = i * 2 + 1;

    const y0 = pos[v0 * 3 + 1];
    const y1 = pos[v1 * 3 + 1];

    // Left and right edges must have identical Y equal to the knot's altitude
    assert.ok(
      Math.abs(y0 - k.y) < 0.001,
      `Knot ${i} vertex 0 Y (${y0}) must match knot altitude (${k.y})`,
    );
    assert.ok(
      Math.abs(y1 - k.y) < 0.001,
      `Knot ${i} vertex 1 Y (${y1}) must match knot altitude (${k.y})`,
    );

    // Lateral separation in XZ must be horizontal and non-zero
    const dx = pos[v1 * 3] - pos[v0 * 3];
    const dz = pos[v1 * 3 + 2] - pos[v0 * 3 + 2];
    const ribbonWidth = Math.hypot(dx, dz);
    assert.ok(
      ribbonWidth >= 0.8 && ribbonWidth <= 38.0,
      `Ribbon width at knot ${i} (${ribbonWidth}) must be between 0.8m and 38m`,
    );

    // Alpha must be positive and non-zero for active knots
    assert.ok(alphas[v0] > 0 && alphas[v0] <= 1.0, `Alpha for active knot ${i} must be > 0`);
  }

  // Verify that NO vertex in the entire buffer has y == -9999 (the vertical beacon bug)
  for (let i = 0; i < ribbon.positions.length / 3; i++) {
    const y = ribbon.positions[i * 3 + 1];
    assert.notEqual(y, -9999, `Vertex ${i} has Y = -9999 (vertical plunge artifact detected)`);
    assert.ok(y >= 0, `Vertex ${i} Y (${y}) must be above ground level`);
  }

  skyLife.dispose();
});

