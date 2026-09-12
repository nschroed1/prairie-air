import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  RoadTrafficSystem,
  createHeadlightBeamMaterial,
  createVehicleMesh,
  generateSectionRoadRoutes,
  SECTION_ROAD_INTERVAL,
} from '../lib/fx/road-traffic';
import { ground } from '../lib/simulation';

void test('generateSectionRoadRoutes produces grid routes and Hwy B14 with right-hand traffic offsets', () => {
  const routes = generateSectionRoadRoutes();
  assert.ok(routes.length >= 10, 'Should have multiple section road routes');

  // Check for Hwy B14 route (Z = -1785)
  const hwyRoute = routes.find((r) => r.id.includes('b14'));
  assert.ok(hwyRoute, 'Should include Hwy B14 route');
  assert.equal(hwyRoute.axis, 'x');
  assert.equal(hwyRoute.fixedCoord, -1785);

  // Check section road coordinate spacing
  assert.equal(SECTION_ROAD_INTERVAL, 510);
});

void test('createHeadlightBeamMaterial initializes additive blending trapezoidal projector material', () => {
  const mat = createHeadlightBeamMaterial();
  assert.ok(mat instanceof T.ShaderMaterial);
  assert.equal(mat.transparent, true);
  assert.equal(mat.depthWrite, false);
  assert.equal(mat.blending, T.AdditiveBlending);
  assert.ok(mat.uniforms.beamColor !== undefined);
  assert.ok(mat.uniforms.beamOpacity !== undefined);
  assert.equal(mat.uniforms.beamOpacity.value, 0.0);
});

void test('createVehicleMesh builds pickup, flatbed, and sedan bodies with headlights and taillights', () => {
  const headlightMat = createHeadlightBeamMaterial();
  const taillightMat = new T.MeshBasicMaterial({ color: '#ff2020' });

  for (const type of ['pickup', 'flatbed', 'sedan'] as const) {
    const mesh = createVehicleMesh(type, '#c0392b', headlightMat, taillightMat);
    assert.ok(mesh instanceof T.Group);
    assert.ok(mesh.children.length >= 3, `${type} should have body, headlights, and taillights`);

    // Verify presence of headlight beam cone/plane
    const beam = mesh.children.find((c) => c instanceof T.Mesh && c.geometry instanceof T.PlaneGeometry);
    assert.ok(beam, `${type} should have headlight beam projection`);
  }
});

void test('RoadTrafficSystem initializes fleet, places vehicles on roads, and adheres to terrain height', () => {
  const scene = new T.Scene();
  const traffic = new RoadTrafficSystem(scene, 18);

  assert.ok(scene.children.includes(traffic.group));
  assert.equal(traffic.vehicles.length, 18);

  for (const v of traffic.vehicles) {
    assert.ok(v.mesh instanceof T.Group);
    assert.ok(v.speed > 0);
    assert.ok(v.route !== undefined);

    // Verify vehicle y matches ground(x, z)
    const expectedGroundY = ground(v.mesh.position.x, v.mesh.position.z) + 0.12;
    assert.ok(
      Math.abs(v.mesh.position.y - expectedGroundY) < 1.0,
      `Vehicle elevation ${v.mesh.position.y} should match ground elevation ${expectedGroundY}`,
    );
  }

  traffic.dispose();
  assert.ok(!scene.children.includes(traffic.group));
});

void test('RoadTrafficSystem updates vehicle positions along routes and toggles night headlights', () => {
  const scene = new T.Scene();
  const traffic = new RoadTrafficSystem(scene, 12);

  const initialPositions = traffic.vehicles.map((v) => ({
    dist: v.distanceAlongRoute,
    pos: v.mesh.position.clone(),
  }));

  // Daytime update (nightFactor = 0):
  traffic.update(1.0, 0, 0, 0.0);
  assert.equal(traffic.beamMat.uniforms.beamOpacity.value, 0.0);
  assert.equal(traffic.taillightMat.opacity, 0.0);

  // Verify vehicles have moved forward along routes
  for (let i = 0; i < traffic.vehicles.length; i++) {
    const v = traffic.vehicles[i];
    const prev = initialPositions[i];
    assert.notEqual(v.distanceAlongRoute, prev.dist, `Vehicle ${i} should have advanced along route`);
  }

  // Nighttime update (nightFactor = 1.0):
  traffic.update(0.1, 0, 0, 1.0);
  assert.equal(traffic.beamMat.uniforms.beamOpacity.value, 0.75);
  assert.equal(traffic.taillightMat.opacity, 1.0);

  traffic.dispose();
});
