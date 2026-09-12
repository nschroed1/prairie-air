import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  CloudSystem,
  createCumulusPuffGeometry,
  createStratusSheetGeometry,
  createCirrusStreakGeometry,
  createSquallRollGeometry,
  createVirgaCurtainGeometry,
  createCumulusMaterial,
  createStratusMaterial,
  createCirrusMaterial,
  createSquallMaterial,
  CUMULUS_COUNT,
  STRATUS_COUNT,
  CIRRUS_COUNT,
  SQUALL_SEGMENTS,
} from '../lib/fx/cloud-systems';
import type { Weather } from '../lib/weather';

const FAIR_WEATHER: Weather = {
  id: 1,
  kind: 'clear',
  label: 'Clear skies',
  temperature: 75,
  windMps: 4.0,
  windFrom: 270,
  gust: 0.12,
  cloud: 0.18,
  fog: 0.00008,
  sunlight: 3.15,
  rain: 0,
};

const STORM_WEATHER: Weather = {
  id: 2,
  kind: 'rain',
  label: 'Severe squall line',
  temperature: 62,
  windMps: 14.0,
  windFrom: 315,
  gust: 0.75,
  cloud: 0.98,
  fog: 0.0006,
  sunlight: 0.45,
  rain: 0.9,
};

void test('createCumulusPuffGeometry produces flat-bottomed lifting condensation base', () => {
  const geom = createCumulusPuffGeometry();
  assert.ok(geom.getAttribute('position'), 'Must have positions');
  assert.ok(geom.getAttribute('normal'), 'Must have normals');

  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  assert.ok(Math.abs(bb.min.y) < 0.05, `Base must be flat at y=0, got ${bb.min.y}`);
  assert.ok(bb.max.y > 0.8, 'Cumulus dome must rise above base');
  geom.dispose();
});

void test('createStratusSheetGeometry produces broad flattened ellipsoid blanket', () => {
  const geom = createStratusSheetGeometry();
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const width = bb.max.x - bb.min.x;
  const height = bb.max.y - bb.min.y;

  assert.ok(width > 8.0, `Stratus width should be wide, got ${width}`);
  assert.ok(height < 1.8, `Stratus height should be thin and flat, got ${height}`);
  geom.dispose();
});

void test('createCirrusStreakGeometry produces high-altitude wispy curved ribbon', () => {
  const geom = createCirrusStreakGeometry();
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;
  const span = bb.max.x - bb.min.x;

  assert.ok(span >= 15.0, `Cirrus streak span should be ~16m, got ${span}`);
  geom.dispose();
});

void test('createSquallRollGeometry builds low ragged shelf lip and towering vertical anvil', () => {
  const geom = createSquallRollGeometry();
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;

  // Shelf lip extends forward (Z) and hangs low
  assert.ok(bb.max.z > 2.0, 'Shelf lip must extend forward into incoming front');
  // Towering anvil rises up
  assert.ok(bb.max.y > 9.0, 'Storm anvil column must reach high altitude');
  geom.dispose();
});

void test('createVirgaCurtainGeometry produces descending precipitation sheet', () => {
  const geom = createVirgaCurtainGeometry();
  geom.computeBoundingBox();
  const bb = geom.boundingBox!;

  assert.ok(bb.min.y < -5.0, 'Virga curtain must descend below cloud base');
  geom.dispose();
});

void test('cloud materials inject volumetric shaders, silver lining, and lightning uniforms', () => {
  const sunDir = { value: new T.Vector3(0.5, 0.7, 0.2).normalize() };
  const lightning = { value: 0.0 };

  // 1. Cumulus Material (volumetric gradient + silver lining)
  const cumulusMat = createCumulusMaterial(sunDir);
  assert.equal(cumulusMat.customProgramCacheKey(), 'prairie-cumulus-realistic-v3');

  const cShader = {
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
    uniforms: {} as Record<string, { value: unknown }>,
  };
  cumulusMat.onBeforeCompile(
    cShader as unknown as T.WebGLProgramParametersWithUniforms,
    {} as unknown as T.WebGLRenderer,
  );
  assert.ok(cShader.vertexShader.includes('vCumulusY'), 'Cumulus must compute height varying');
  assert.ok(cShader.fragmentShader.includes('Silver Lining'), 'Cumulus must compute silver lining');

  // 2. Stratus Material
  const stratusMat = createStratusMaterial();
  assert.equal(stratusMat.customProgramCacheKey(), 'prairie-stratus-realistic-v1');

  // 3. Cirrus Material
  const cirrusMat = createCirrusMaterial(sunDir);
  assert.equal(cirrusMat.customProgramCacheKey(), 'prairie-cirrus-v1');

  // 4. Squall Line Material (bruised storm palette + lightning flash)
  const squallMat = createSquallMaterial(lightning);
  assert.equal(squallMat.customProgramCacheKey(), 'prairie-squall-doom-v2');

  const sShader = {
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
    uniforms: {} as Record<string, { value: unknown }>,
  };
  squallMat.onBeforeCompile(
    sShader as unknown as T.WebGLProgramParametersWithUniforms,
    {} as unknown as T.WebGLRenderer,
  );
  assert.ok(sShader.fragmentShader.includes('uLightning'), 'Squall shader must use uLightning');
  assert.ok(sShader.fragmentShader.includes('hailGreen'), 'Squall shader must include hail-core green');

  cumulusMat.dispose();
  stratusMat.dispose();
  cirrusMat.dispose();
  squallMat.dispose();
});

void test('CloudSystem instantiates all layers, manages squall line proximity, and triggers lightning', () => {
  const scene = new T.Scene();
  const sun = new T.DirectionalLight('#ffffff', 1.0);
  sun.position.set(200, 400, 200);
  scene.add(sun);

  const cloudSystem = new CloudSystem(scene, sun);

  assert.equal(cloudSystem.cumulusMesh.count, CUMULUS_COUNT);
  assert.equal(cloudSystem.stratusMesh.count, STRATUS_COUNT);
  assert.equal(cloudSystem.cirrusMesh.count, CIRRUS_COUNT);
  assert.equal(cloudSystem.squallMesh.count, SQUALL_SEGMENTS);
  assert.equal(cloudSystem.virgaMesh.count, SQUALL_SEGMENTS);
  assert.ok(scene.children.includes(cloudSystem.group));

  // 1. Weather adaptation: fair weather
  cloudSystem.updateWeather(FAIR_WEATHER, 1.0, 5.0);
  const fairSquallScale = cloudSystem.squallGroup.scale.x;
  assert.ok(fairSquallScale >= 0.95, 'Squall line sits on distant horizon during fair weather');

  // 2. Weather adaptation: severe storm brings squall line ("impending doom") closer
  for (let i = 0; i < 10; i++) {
    cloudSystem.updateWeather(STORM_WEATHER, 0.5, 6.0 + i * 0.5);
  }
  const stormSquallScale = cloudSystem.squallGroup.scale.x;
  assert.ok(
    stormSquallScale < fairSquallScale,
    `Squall line scale (${stormSquallScale}) should advance closer than fair weather (${fairSquallScale})`,
  );

  // 3. Lightning flash trigger
  assert.equal(cloudSystem.lightningUniform.value, 0.0, 'Lightning should be idle initially');
  cloudSystem.triggerLightning();
  assert.equal(cloudSystem.lightningUniform.value, 1.0, 'Lightning must flash immediately on trigger');

  // Advance time to simulate double-flash decay
  cloudSystem.update(0.1, 10.0, { x: 5, z: 2 });
  assert.ok(cloudSystem.lightningUniform.value >= 0.0, 'Lightning value should remain valid');

  // 4. Clean disposal
  cloudSystem.dispose();
  assert.ok(!scene.children.includes(cloudSystem.group), 'Disposal removes group from scene');
});
