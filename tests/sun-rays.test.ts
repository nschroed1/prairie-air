import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  SunRays,
  computeRayIntensity,
  SUN_RAYS_DAY_COLOR,
  SUN_RAYS_SUNSET_COLOR,
  DEFAULT_SHAFT_COUNT,
} from '../lib/fx/sun-rays';

function setupSunRays() {
  const scene = new T.Scene();
  const cloudGroup = new T.Group();
  scene.add(cloudGroup);
  const sun = new T.DirectionalLight('#ffe3a8', 3.15);
  sun.position.set(-640, 620, -880);
  scene.add(sun);
  const rays = new SunRays(scene, cloudGroup, sun);
  return { scene, cloudGroup, sun, rays };
}

void test('SunRays instantiates, attaches meshes to scene, and configures volumetric shader', () => {
  const { scene, cloudGroup, sun, rays } = setupSunRays();

  // Instance reference checks
  assert.equal(rays.scene, scene, 'Scene reference should match');
  assert.equal(rays.cloudGroup, cloudGroup, 'Cloud group reference should match');
  assert.equal(rays.sun, sun, 'Sun reference should match');

  // Attached to scene
  assert.ok(scene.children.includes(rays.group), 'Group should be added to scene');
  assert.equal(rays.group.name, 'sun-rays');

  // Preallocated shafts in expected range (16 - 24)
  assert.equal(rays.shafts.length, DEFAULT_SHAFT_COUNT);
  assert.ok(
    rays.shafts.length >= 16 && rays.shafts.length <= 24,
    'Shaft count should be between 16 and 24',
  );
  assert.equal(rays.group.children.length, DEFAULT_SHAFT_COUNT);

  for (const shaft of rays.shafts) {
    assert.ok(shaft instanceof T.Mesh, 'Each shaft must be a T.Mesh');
    assert.equal(shaft.frustumCulled, false, 'Frustum culling should be false to prevent pop-in');
    assert.equal(shaft.geometry, rays.geometry, 'Shafts should share the preallocated geometry');
    assert.equal(shaft.material, rays.material, 'Shafts should share the volumetric material');
  }

  // Geometry checks
  assert.ok(rays.geometry instanceof T.CylinderGeometry);

  // Material property checks
  const mat = rays.material;
  assert.ok(mat instanceof T.ShaderMaterial);
  assert.equal(mat.transparent, true, 'Material must be transparent');
  assert.equal(mat.depthWrite, false, 'depthWrite must be false for additive shafts');
  assert.equal(mat.blending, T.AdditiveBlending, 'Must use AdditiveBlending');
  assert.equal(mat.side, T.DoubleSide, 'Must use DoubleSide');

  // Uniform checks
  assert.ok(mat.uniforms.rayTime, 'Uniform rayTime must exist');
  assert.ok(mat.uniforms.sunDir, 'Uniform sunDir must exist');
  assert.ok(mat.uniforms.rayIntensity, 'Uniform rayIntensity must exist');
  assert.ok(mat.uniforms.cloudDensity, 'Uniform cloudDensity must exist');
  assert.ok(mat.uniforms.rayColor, 'Uniform rayColor must exist');

  // Shader contents checks
  assert.ok(
    mat.vertexShader.includes('lateralSpread'),
    'Vertex shader should include lateral spreading',
  );
  assert.ok(
    mat.vertexShader.includes('sunDir'),
    'Vertex shader should extrude along light vector',
  );
  assert.ok(
    mat.fragmentShader.includes('sin(pos.x * 0.01 + rayTime * 0.5)'),
    'Fragment shader must include the specified atmospheric traveling noise formula',
  );
  assert.ok(
    mat.fragmentShader.includes('radialGaussian') || mat.fragmentShader.includes('exp('),
    'Fragment shader should implement Gaussian falloff',
  );
  assert.ok(
    mat.fragmentShader.includes('groundFade') && mat.fragmentShader.includes('ceilingFade'),
    'Fragment shader should implement distance fade at ground and cloud ceiling',
  );

  rays.dispose();
});

void test('SunRays modulates intensity based on cloud cover according to weather requirements', () => {
  const { rays } = setupSunRays();

  // 1. Clear sky (weatherCover < 0.05): rays are invisible or very faint (<= 0.05)
  const clearSkyCovers = [0.0, 0.01, 0.02, 0.035, 0.049];
  for (const cover of clearSkyCovers) {
    rays.update(0.016, 1.0, cover, 100);
    assert.ok(
      rays.intensity <= 0.05,
      `Intensity at cover ${cover} should be <= 0.05, got ${rays.intensity}`,
    );
    assert.equal(rays.material.uniforms.rayIntensity.value, rays.intensity);
  }

  // 2. Scattered / broken cumulus clouds (0.12 <= weatherCover <= 0.65): dramatic shafts (0.25 - 0.45)
  const brokenCloudCovers = [0.12, 0.2, 0.3, 0.385, 0.45, 0.55, 0.65];
  for (const cover of brokenCloudCovers) {
    rays.update(0.016, 1.0, cover, 100);
    assert.ok(
      rays.intensity >= 0.25 && rays.intensity <= 0.45,
      `Intensity at cover ${cover} should be in [0.25, 0.45], got ${rays.intensity}`,
    );
    assert.equal(rays.material.uniforms.rayIntensity.value, rays.intensity);
  }

  // Peak of broken clouds should be around 0.385 - 0.4
  const peakIntensity = computeRayIntensity(0.385);
  assert.ok(peakIntensity >= 0.4 && peakIntensity <= 0.45, 'Peak intensity should reach ~0.44');

  // 3. Thick overcast / storm (weatherCover > 0.8): diffuse away (< 0.08)
  const overcastCovers = [0.81, 0.85, 0.9, 0.95, 1.0];
  for (const cover of overcastCovers) {
    rays.update(0.016, 1.0, cover, 100);
    assert.ok(
      rays.intensity < 0.08,
      `Intensity at overcast cover ${cover} should be < 0.08, got ${rays.intensity}`,
    );
    assert.equal(rays.material.uniforms.rayIntensity.value, rays.intensity);
  }

  rays.dispose();
});

void test('SunRays aligns orientation with directional sun vector and handles sunPos override', () => {
  const { sun, rays } = setupSunRays();

  // Test with default sun position
  sun.position.set(-500, 700, -300);
  rays.update(0.016, 2.0, 0.4, 80);

  const expectedDir = sun.position.clone().normalize();
  const actualDir = rays.material.uniforms.sunDir.value as T.Vector3;
  assert.ok(
    actualDir.distanceTo(expectedDir) < 0.01,
    'sunDir uniform should match normalized sun position',
  );

  // Test with sunPos override
  const overridePos = new T.Vector3(400, 800, 600);
  rays.update(0.016, 2.5, 0.4, 80, overridePos);

  const expectedOverrideDir = overridePos.clone().normalize();
  assert.ok(
    actualDir.distanceTo(expectedOverrideDir) < 0.01,
    'sunDir uniform should reflect sunPos override',
  );

  // Shafts should be oriented with the light direction
  for (const shaft of rays.shafts) {
    assert.equal(shaft.visible, true);
    // Cylinder is aligned along Y axis; test that its forward/up transformation aligns with sunDir
    const shaftUp = new T.Vector3(0, 1, 0).applyQuaternion(shaft.quaternion);
    assert.ok(
      shaftUp.distanceTo(expectedOverrideDir) < 0.01,
      'Shaft quaternion should orient cone along sunDir',
    );
  }

  rays.dispose();
});

void test('SunRays color shifts between daytime radiant sunlight and sunset golden tones', () => {
  const { rays } = setupSunRays();

  // High sun (daytime)
  const highSun = new T.Vector3(0, 1000, 0);
  rays.update(0.016, 1.0, 0.4, 50, highSun);
  const dayColor = rays.material.uniforms.rayColor.value as T.Color;
  const dayTarget = new T.Color(SUN_RAYS_DAY_COLOR);
  const dayDelta = Math.hypot(
    dayColor.r - dayTarget.r,
    dayColor.g - dayTarget.g,
    dayColor.b - dayTarget.b,
  );
  assert.ok(
    dayDelta < 0.05,
    `High sun should match daytime sunlight ${SUN_RAYS_DAY_COLOR}, got #${dayColor.getHexString()}`,
  );

  // Low sun (golden hour / sunset)
  const lowSun = new T.Vector3(1000, 100, 0); // Elevation ~ 0.1
  rays.update(0.016, 1.0, 0.4, 50, lowSun);
  const sunsetColor = rays.material.uniforms.rayColor.value as T.Color;
  const sunsetTarget = new T.Color(SUN_RAYS_SUNSET_COLOR);
  const sunsetDelta = Math.hypot(
    sunsetColor.r - sunsetTarget.r,
    sunsetColor.g - sunsetTarget.g,
    sunsetColor.b - sunsetTarget.b,
  );
  assert.ok(
    sunsetDelta < 0.05,
    `Low sun should shift toward golden tone ${SUN_RAYS_SUNSET_COLOR}, got #${sunsetColor.getHexString()}`,
  );

  rays.dispose();
});

void test('SunRays anchors under cumulus clouds (650m-900m) and beams down toward farmland', () => {
  const { cloudGroup, rays } = setupSunRays();

  // Verify all predefined cluster cloud altitudes are in [650, 900]
  for (const cluster of rays.clusters) {
    assert.ok(
      cluster.cloudAlt >= 650 && cluster.cloudAlt <= 900,
      `Cloud altitude ${cluster.cloudAlt} must be between 650m and 900m`,
    );
  }

  // Update with high sun directly overhead
  const overheadSun = new T.Vector3(0, 1000, 0);
  rays.update(0.016, 1.0, 0.4, 50, overheadSun);

  for (let i = 0; i < rays.shafts.length; i++) {
    const shaft = rays.shafts[i];
    const cluster = rays.clusters[i];
    const rayLength = shaft.scale.y;

    // Shaft midpoint Y should be halfway between cloud ceiling and ground (y ~ 0)
    const expectedMidY = cluster.cloudAlt * 0.5;
    assert.ok(
      Math.abs(shaft.position.y - expectedMidY) < 1.0,
      `Midpoint Y (${shaft.position.y}) should be half of cloud altitude (${cluster.cloudAlt})`,
    );

    // Top of shaft (midpoint + half length) reaches cloud altitude
    const topY = shaft.position.y + rayLength * 0.5;
    assert.ok(
      Math.abs(topY - cluster.cloudAlt) < 1.0,
      `Top of shaft (${topY}) should reach cloud altitude (${cluster.cloudAlt})`,
    );

    // Bottom of shaft (midpoint - half length) reaches farmland
    const bottomY = shaft.position.y - rayLength * 0.5;
    assert.ok(
      Math.abs(bottomY - 0) < 1.0,
      `Bottom of shaft (${bottomY}) should reach ground farmland (y=0)`,
    );
  }

  // Wind drifts cloudGroup
  cloudGroup.position.set(250, 0, -400);
  rays.update(0.016, 2.0, 0.4, 50, overheadSun);

  for (let i = 0; i < rays.shafts.length; i++) {
    const shaft = rays.shafts[i];
    const cluster = rays.clusters[i];
    assert.ok(
      Math.abs(shaft.position.x - (cluster.x + 250)) < 1.0,
      'Shaft should drift along with cloudGroup.position.x',
    );
    assert.ok(
      Math.abs(shaft.position.z - (cluster.z - 400)) < 1.0,
      'Shaft should drift along with cloudGroup.position.z',
    );
  }

  rays.dispose();
});

void test('SunRays cleanly disposes geometries, materials, and removes meshes from scene', () => {
  const { scene, rays } = setupSunRays();

  assert.equal(scene.children.includes(rays.group), true);
  assert.equal(rays.shafts.length, DEFAULT_SHAFT_COUNT);

  let geomDisposed = false;
  let matDisposed = false;
  rays.geometry.addEventListener('dispose', () => {
    geomDisposed = true;
  });
  rays.material.addEventListener('dispose', () => {
    matDisposed = true;
  });

  rays.dispose();

  assert.equal(
    scene.children.includes(rays.group),
    false,
    'Group should be detached from scene on dispose',
  );
  assert.equal(rays.shafts.length, 0, 'Shafts array should be cleared');
  assert.equal(rays.group.children.length, 0, 'Group children should be emptied');
  assert.equal(geomDisposed, true, 'Geometry should be disposed');
  assert.equal(matDisposed, true, 'Material should be disposed');
});
