import test from 'node:test';
import assert from 'node:assert/strict';
import {
  firefightingContract,
  freshFirefightingState,
  stepFirefighting,
  getFireHotspots,
} from '../lib/firefighting';
import { Simulation, contracts, freshControls, ground, riverX } from '../lib/simulation';

void test('firefighting contract is configured with air tanker payload and targets', () => {
  const contract = firefightingContract(contracts[0]);
  assert.equal(contract.kind, 'firefighting');
  assert.equal(contract.id, 9904);
  assert.equal(contract.target, 95);
  assert.equal(contract.bonusTarget, 100);
  assert.ok(contract.pay >= 900);
});

void test('fire hotspots initialize with full intensity across Cedar valley ridge', () => {
  const state = freshFirefightingState();
  assert.equal(state.hotspots.length, 6);
  assert.equal(state.containedFraction, 0);
  assert.equal(state.completed, false);
  assert.equal(state.waterTank, 100);
  for (const spot of state.hotspots) {
    assert.equal(spot.intensity, 1.0);
    assert.ok(spot.radius >= 20);
  }
});

void test('spraying retardant over hotspots reduces fire intensity and advances containment', () => {
  const sim = new Simulation();
  sim.phase = 'flying';
  sim.speed = 35;
  const contract = firefightingContract(contracts[0]);
  sim.reset(contract);
  assert.ok(sim.firefightingState);

  const targetSpot = sim.firefightingState.hotspots[0];
  sim.x = targetSpot.x;
  sim.z = targetSpot.z;
  sim.y = targetSpot.y + 12; // 12m AGL, good drop height
  sim.spraying = true;

  // Step 2 seconds of retardant drop
  for (let i = 0; i < 40; i++) {
    sim.step(0.05, { ...freshControls(), spray: true });
  }

  assert.ok(
    targetSpot.intensity < 1.0,
    `Target spot intensity (${targetSpot.intensity}) should decrease under retardant drop`,
  );
  assert.ok(
    sim.firefightingState.containedFraction > 0,
    'Overall containment should increase above 0%',
  );
  assert.ok(
    sim.firefightingState.waterTank < 100,
    'Water tank should deplete during retardant discharge',
  );
});

void test('skimming Cedar River below 4.5m AGL scoops water and refills tank', () => {
  const sim = new Simulation();
  sim.phase = 'flying';
  sim.speed = 35;
  const contract = firefightingContract(contracts[0]);
  sim.reset(contract);
  assert.ok(sim.firefightingState);

  // Deplete water tank
  sim.firefightingState.waterTank = 10;

  // Fly low over Cedar River at z = 100
  sim.z = 100;
  sim.x = riverX(100);
  sim.y = ground(sim.x, sim.z) + 3.8; // ~3.8m above river surface

  const result = stepFirefighting(sim.firefightingState, sim, 0.5);
  assert.equal(result.scooped, true);
  assert.equal(sim.firefightingState.isScooping, true);
  assert.ok(sim.firefightingState.waterTank > 10, 'Tank should gain water while skimming river');
});

void test('smoke exposure and downwind plume reduce visibility when cutting through smoke', () => {
  const sim = new Simulation();
  sim.phase = 'flying';
  const contract = firefightingContract(contracts[0]);
  sim.reset(contract);
  assert.ok(sim.firefightingState);

  // 1. Far away from fire ridge (e.g. runway x = 0, z = 0)
  sim.x = 0;
  sim.z = 0;
  sim.y = 50;
  for (let i = 0; i < 10; i++) {
    stepFirefighting(sim.firefightingState, sim, 0.1);
  }
  assert.equal(
    sim.firefightingState.smokeExposure < 0.05,
    true,
    'Smoke exposure should be near 0 far away from fire',
  );

  // 2. Directly inside smoke column over hotspot 0
  const spot = sim.firefightingState.hotspots[0];
  sim.x = spot.x;
  sim.z = spot.z;
  sim.y = spot.y + 25; // 25m above flames

  for (let i = 0; i < 20; i++) {
    stepFirefighting(sim.firefightingState, sim, 0.1);
  }
  assert.ok(
    sim.firefightingState.smokeExposure > 0.4,
    `Smoke exposure (${sim.firefightingState.smokeExposure.toFixed(2)}) should be elevated directly above active fire`,
  );
  assert.ok(
    sim.firefightingState.thermalLift > 1.0,
    `Thermal updraft (${sim.firefightingState.thermalLift.toFixed(2)}) should be active over fire`,
  );
  assert.ok(
    sim.firefightingState.turbulence > 0.3,
    `Turbulence buffeting (${sim.firefightingState.turbulence.toFixed(2)}) should be active over fire`,
  );
});

void test('FirefightingWorld instantiates lights, flames, embers, smoke, and cleans up cleanly', async () => {
  const T = await import('three');
  const { FirefightingWorld } = await import('../lib/firefighting-world');
  const scene = new T.Scene();
  scene.fog = new T.FogExp2('#bdd6e0', 0.0001);

  const state = freshFirefightingState();
  const world = new FirefightingWorld(scene, state);

  // Points systems + group added
  const sim = new Simulation();
  sim.phase = 'flying';
  sim.firefightingState = state;

  // Run update steps
  world.update(0.016, sim, 0.016);
  world.update(0.016, sim, 0.032);

  // Simulate high smoke exposure and verify fog response
  state.smokeExposure = 0.85;
  world.update(0.016, sim, 0.048);

  const fog = scene.fog as import('three').FogExp2;
  assert.ok(
    fog.density > 0.00015,
    `Scene fog density (${fog.density}) should increase when smoke exposure is high`,
  );

  // Clean disposal
  world.dispose();
  assert.equal(scene.children.length, 0, 'Scene should be cleared after dispose');
});
