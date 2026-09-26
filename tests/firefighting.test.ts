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
