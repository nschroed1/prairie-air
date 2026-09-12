import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  NightSkySystem,
  createStarfieldGeometry,
  createStarfieldMaterial,
  createMoonMesh,
  NIGHT_FOG_COLOR,
  NIGHT_HEMI_SKY,
  NIGHT_HEMI_GROUND,
} from '../lib/fx/night-sky';
import {
  FarmsteadLightsSystem,
  createYardLightPoolMaterial,
} from '../lib/fx/farmstead-lights';

void test('createStarfieldGeometry generates spherical distribution of stars with color classes', () => {
  const count = 2600;
  const geom = createStarfieldGeometry(count);
  const posAttr = geom.getAttribute('position') as T.BufferAttribute;
  const colorAttr = geom.getAttribute('color') as T.BufferAttribute;
  const sizeAttr = geom.getAttribute('size') as T.BufferAttribute;

  assert.equal(posAttr.count, count);
  assert.equal(colorAttr.count, count);
  assert.equal(sizeAttr.count, count);

  // Check spherical radius: each star should be near radius 9800m
  for (let i = 0; i < 20; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const dist = Math.hypot(x, y, z);
    assert.ok(Math.abs(dist - 9800) < 50, `Star ${i} should be near celestial sphere radius 9800m, got ${dist}`);
    // Stars should be on or above horizon in celestial dome
    assert.ok(y >= -400, `Star ${i} should not be deep below horizon`);
  }

  // Check color attribute contains non-zero RGB
  for (let i = 0; i < 10; i++) {
    const r = colorAttr.getX(i);
    const g = colorAttr.getY(i);
    const b = colorAttr.getZ(i);
    assert.ok(r > 0 && g > 0 && b > 0, `Star color should have non-zero RGB`);
  }
});

void test('createStarfieldMaterial initializes twinkling scintillation shader with required uniforms', () => {
  const mat = createStarfieldMaterial();
  assert.ok(mat instanceof T.ShaderMaterial);
  assert.equal(mat.transparent, true);
  assert.equal(mat.depthWrite, false);
  assert.ok(mat.uniforms.time !== undefined);
  assert.ok(mat.uniforms.scintillation !== undefined);
  assert.ok(mat.uniforms.starOpacity !== undefined);
  assert.equal(mat.uniforms.starOpacity.value, 0.0);
});

void test('createMoonMesh creates lunar body with luminous corona halo', () => {
  const moonGroup = createMoonMesh();
  assert.ok(moonGroup instanceof T.Group);
  assert.equal(moonGroup.children.length, 2);

  const moonSphere = moonGroup.children[0] as T.Mesh;
  const moonHalo = moonGroup.children[1] as T.Mesh;

  assert.ok(moonSphere.geometry instanceof T.SphereGeometry);
  assert.ok(moonHalo.material instanceof T.ShaderMaterial);
  assert.equal((moonHalo.material as T.ShaderMaterial).transparent, true);
});

void test('NightSkySystem updates celestial position, star twinkling, and blends moonlight', () => {
  const scene = new T.Scene();
  const nightSky = new NightSkySystem(scene);

  // Scene should contain celestial group and moonlight
  assert.ok(scene.children.includes(nightSky.group));
  assert.ok(scene.children.includes(nightSky.moonLight));

  // In daytime (nightFactor = 0):
  const camPos = new T.Vector3(500, 100, -300);
  nightSky.update(0.016, 10.0, camPos, 0.0);

  assert.equal(nightSky.starfield.position.x, camPos.x);
  assert.equal(nightSky.starfield.position.y, camPos.y);
  assert.equal(nightSky.starfield.position.z, camPos.z);
  assert.equal(nightSky.starMat.uniforms.starOpacity.value, 0.0);
  assert.equal(nightSky.moonLight.intensity, 0.0);
  assert.equal(nightSky.group.visible, false);

  // In nighttime (nightFactor = 1.0):
  nightSky.update(0.016, 12.0, camPos, 1.0);
  assert.equal(nightSky.group.visible, true);
  assert.equal(nightSky.starMat.uniforms.starOpacity.value, 1.0);
  assert.ok(nightSky.moonLight.intensity > 0.45);
  assert.equal(nightSky.starMat.uniforms.time.value, 12.0);

  nightSky.dispose();
  assert.ok(!scene.children.includes(nightSky.group));
  assert.ok(!scene.children.includes(nightSky.moonLight));
});

void test('createYardLightPoolMaterial produces warm golden radial falloff shader', () => {
  const mat = createYardLightPoolMaterial();
  assert.ok(mat instanceof T.ShaderMaterial);
  assert.equal(mat.transparent, true);
  assert.equal(mat.depthWrite, false);
  assert.ok(mat.uniforms.lightColor !== undefined);
  assert.ok(mat.uniforms.poolOpacity !== undefined);
  assert.equal(mat.uniforms.poolOpacity.value, 0.0);
});

void test('FarmsteadLightsSystem illuminates farmsteads, blinks silo beacons, and cleans up cleanly', () => {
  const scene = new T.Scene();
  const farmLights = new FarmsteadLightsSystem(scene);

  assert.ok(scene.children.includes(farmLights.group));
  assert.ok(farmLights.beaconMeshes.length > 0, 'Should have blinking beacons on silos');
  assert.ok(farmLights.poleMeshes.length > 0, 'Should have yard light poles on farmsteads');
  assert.ok(farmLights.windowMeshes.length > 0, 'Should have farmhouse window meshes');
  assert.ok(farmLights.runwayLights.length > 0, 'Should have runway threshold & edge lights');

  // In daytime (nightFactor = 0):
  farmLights.update(0.016, 1.0, 0.0);
  assert.equal(farmLights.poolMat.uniforms.poolOpacity.value, 0.0);
  assert.equal(farmLights.windowMat.opacity, 0.0);
  assert.equal(farmLights.beaconMat.opacity, 0.0);
  assert.equal(farmLights.runwayMat.opacity, 0.0);

  // In night (nightFactor = 1.0):
  // At t = 1.0, beacon phase (1.0 * 1.0) % 1.0 = 0.0 < 0.45 -> beacon on
  farmLights.update(0.016, 1.0, 1.0);
  assert.equal(farmLights.poolMat.uniforms.poolOpacity.value, 1.0);
  assert.ok(farmLights.windowMat.opacity > 0.85);
  assert.ok(farmLights.runwayMat.opacity > 0.85);
  assert.equal(farmLights.beaconMat.opacity, 1.0);

  // At t = 1.6, beacon phase (1.6 * 1.0) % 1.0 = 0.6 > 0.45 -> beacon off
  farmLights.update(0.016, 1.6, 1.0);
  assert.equal(farmLights.beaconMat.opacity, 0.05);

  farmLights.dispose();
  assert.ok(!scene.children.includes(farmLights.group));
});

void test('Night lighting color constants are defined with correct hex palettes', () => {
  assert.equal(NIGHT_FOG_COLOR, '#070e1a');
  assert.equal(NIGHT_HEMI_SKY, '#1a263e');
  assert.equal(NIGHT_HEMI_GROUND, '#08100c');
});
