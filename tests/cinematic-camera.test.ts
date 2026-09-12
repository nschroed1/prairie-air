import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { CinematicCamera } from '../lib/fx/cinematic-camera';
import type { Simulation } from '../lib/simulation';

function createMockRenderer(options?: { failInit?: boolean; failRender?: boolean }) {
  let renderCallCount = 0;
  return {
    domElement: { clientWidth: 1280, clientHeight: 720 },
    getRenderTarget: () => null,
    setRenderTarget: () => {},
    clear: () => {},
    render: () => {
      renderCallCount++;
      if (options?.failRender) {
        throw new Error('WebGL render context lost');
      }
    },
    getClearColor: () => new T.Color(),
    getClearAlpha: () => 1,
    setClearColor: () => {},
    getPixelRatio: () => {
      if (options?.failInit) {
        throw new Error('Init error');
      }
      return 1;
    },
    getSize: (v: T.Vector2) => v.set(1280, 720),
    capabilities: { isWebGL2: true },
    getRenderCallCount: () => renderCallCount,
  } as unknown as T.WebGLRenderer & { getRenderCallCount: () => number };
}

void test('CinematicCamera initializes composer and UnrealBloomPass with requested parameters', () => {
  const renderer = createMockRenderer();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(60, 16 / 9, 0.1, 1000);

  const cinematic = new CinematicCamera(renderer, scene, camera);

  assert.equal(cinematic.baseFov, 50);
  assert.equal(cinematic.camera.fov, 50);
  assert.equal(cinematic.enabled, true);
  assert.ok(cinematic.composer !== null);
  assert.ok(cinematic.bloomPass !== null);
  assert.equal(cinematic.bloomPass.strength, 0.22);
  assert.equal(cinematic.bloomPass.radius, 0.35);
  assert.equal(cinematic.bloomPass.threshold, 0.86);
  assert.equal(cinematic.bloomPass.resolution.x, 1280);
  assert.equal(cinematic.bloomPass.resolution.y, 720);
});

void test('CinematicCamera gracefully handles initialization errors with fallback', () => {
  const renderer = createMockRenderer({ failInit: true });
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(60, 16 / 9, 0.1, 1000);

  const cinematic = new CinematicCamera(renderer, scene, camera);

  assert.equal(cinematic.composer, null);
  assert.equal(cinematic.bloomPass, null);

  const sim = { speed: 20, altitude: 25 } as Simulation;
  cinematic.render(0.016, sim, 1.0);
  assert.equal(renderer.getRenderCallCount(), 1);
});

void test('CinematicCamera dynamic speed FOV lerps towards 55 during fast/low flight', () => {
  const renderer = createMockRenderer();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 16 / 9, 0.1, 1000);

  const cinematic = new CinematicCamera(renderer, scene, camera);
  assert.equal(cinematic.camera.fov, 50);

  // High altitude or low speed: target FOV is 50
  const normalSim = { speed: 30, altitude: 20 } as Simulation;
  cinematic.render(0.05, normalSim, 0);
  assert.equal(cinematic.camera.fov, 50);

  // Fast and low flight: speed > 35 && altitude < 18 -> target FOV 55
  const fastLowSim = { speed: 45, altitude: 10 } as Simulation;
  const dt = 0.1;
  const expectedAlpha = 1 - Math.exp(-dt * 3.5);
  const expectedFov = 50 + (55 - 50) * expectedAlpha;

  cinematic.render(dt, fastLowSim, 0);
  assert.ok(
    Math.abs(cinematic.camera.fov - expectedFov) < 1e-5,
    `Expected fov close to ${expectedFov}, got ${cinematic.camera.fov}`,
  );
  assert.ok(cinematic.camera.fov > 50 && cinematic.camera.fov < 55);

  // Back to normal flight: target FOV returns to 50
  const currentFov = cinematic.camera.fov;
  cinematic.render(dt, normalSim, 0);
  const expectedReturningFov = currentFov + (50 - currentFov) * expectedAlpha;
  assert.ok(
    Math.abs(cinematic.camera.fov - expectedReturningFov) < 1e-5,
    `Expected fov returning towards 50, got ${cinematic.camera.fov}`,
  );
});

void test('CinematicCamera low-altitude ground rush rumble adds micro-vibration to camera position', () => {
  const renderer = createMockRenderer();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 16 / 9, 0.1, 1000);
  camera.position.set(100, 15, 200);

  const cinematic = new CinematicCamera(renderer, scene, camera);

  // Skimming crops: altitude < 8 and speed > 32
  const skimmingSim = { speed: 38, altitude: 5 } as Simulation;
  const time = 2.5;
  const initialY = camera.position.y;
  const expectedVibration = Math.sin(time * 50) * 0.035;

  cinematic.render(0.016, skimmingSim, time);
  assert.ok(
    Math.abs(camera.position.y - (initialY + expectedVibration)) < 1e-6,
    `Expected camera.position.y to have vibration added`,
  );

  // High altitude: altitude >= 8 -> no vibration added
  const safeSim = { speed: 38, altitude: 12 } as Simulation;
  const yBeforeSafe = camera.position.y;
  cinematic.render(0.016, safeSim, time + 0.1);
  assert.equal(camera.position.y, yBeforeSafe);
});

void test('CinematicCamera resize updates composer and bloom pass', () => {
  const renderer = createMockRenderer();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 16 / 9, 0.1, 1000);

  const cinematic = new CinematicCamera(renderer, scene, camera);
  cinematic.resize(1920, 1080);

  assert.equal(cinematic.bloomPass?.resolution.x, 1920);
  assert.equal(cinematic.bloomPass?.resolution.y, 1080);
});

void test('CinematicCamera dispose cleans up passes and composer', () => {
  const renderer = createMockRenderer();
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(50, 16 / 9, 0.1, 1000);

  const cinematic = new CinematicCamera(renderer, scene, camera);
  cinematic.dispose();

  assert.equal(cinematic.composer, null);
  assert.equal(cinematic.bloomPass, null);
  assert.equal(cinematic.renderPass, null);
});
