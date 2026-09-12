import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRallyGates,
  freshRallyState,
  stepRally,
  rallyContract,
  RALLY_PAR_TIMES,
} from '../lib/rally';
import { Simulation, contracts, ground, freshControls } from '../lib/simulation';

test('getRallyGates produces 10 sequential gates at landmark coordinates', () => {
  const gates = getRallyGates();
  assert.equal(gates.length, 10);
  assert.equal(gates[0].name, 'Airstrip Departure');
  assert.equal(gates[4].name, 'River Trestle Runner');
  assert.equal(gates[6].name, 'The Red Barn Breezeway');
  assert.equal(gates[9].name, 'Airstrip Checkered Flag');

  // Verify all gates have realistic altitudes
  for (const g of gates) {
    assert.ok(g.radius >= 15 && g.radius <= 25);
    const gr = ground(g.x, g.z);
    assert.ok(g.y >= gr, `Gate ${g.name} should be above ground`);
  }
});

test('stepRally detects gate passage and stunt bonuses', () => {
  const state = freshRallyState();
  const gates = getRallyGates();

  // Gate 1: Airstrip Departure
  const g1 = gates[0];
  const r1 = stepRally(state, { x: g1.x, y: g1.y, z: g1.z }, g1.targetHeading, 0, 35, 0.02, 1.0);
  assert.equal(r1.gatePassed?.id, 1);
  assert.equal(state.gateIndex, 1);
  assert.equal(state.splits.length, 1);

  // Gate 2: Silos
  const g2 = gates[1];
  const r2 = stepRally(state, { x: g2.x, y: g2.y, z: g2.z }, g2.targetHeading, 0, 38, 0.02, 6.5);
  assert.equal(r2.gatePassed?.id, 2);
  assert.equal(state.gateIndex, 2);

  // Gate 3: Yew Avenue Wire Skim (< 7.2m AGL)
  const g3 = gates[2];
  const r3 = stepRally(state, { x: g3.x, y: g3.y, z: g3.z }, g3.targetHeading, 0, 36, 0.02, 12.0);
  assert.equal(r3.gatePassed?.id, 3);
  assert.equal(r3.stuntEarned?.name, 'Wire Skimmer Razor!');
  assert.equal(state.bonusSeconds, 1.5);

  // Fast forward through gates 4, 5, 6
  for (let i = 3; i < 6; i++) {
    const g = gates[i];
    stepRally(state, { x: g.x, y: g.y, z: g.z }, g.targetHeading, 0, 36, 0.02, 15.0 + i * 5);
  }
  assert.equal(state.gateIndex, 6);

  // Gate 7: Red Barn with Inverted Flight (roll = 2.8 rad)
  const g7 = gates[6];
  const r7 = stepRally(state, { x: g7.x, y: g7.y, z: g7.z }, g7.targetHeading, 2.8, 36, 0.02, 45.0);
  assert.equal(r7.gatePassed?.id, 7);
  assert.equal(r7.stuntEarned?.name, 'Inverted Barnstormer!');
  assert.ok(state.bonusSeconds >= 4.5); // 1.5 wire + 3.0 barn

  // Finish remaining gates 8, 9, 10
  for (let i = 7; i < 10; i++) {
    const g = gates[i];
    stepRally(state, { x: g.x, y: g.y, z: g.z }, g.targetHeading, 0, 36, 0.02, 50.0 + (i - 7) * 4);
  }

  assert.equal(state.completed, true);
  assert.ok(state.finalTime > 0);
  assert.ok(state.medal !== null);
});

test('Simulation integrates rallyContract and finishes with par payout', () => {
  const sim = new Simulation();
  const job = rallyContract({ ...contracts[0], id: 9901 });
  sim.reset(job);

  assert.equal(sim.isRally, true);
  assert.equal(sim.matchMode, 'rally');
  assert.ok(sim.rallyState !== null);
  assert.equal(sim.completionReady, false);

  // Simulate flying through all 10 gates in 60 seconds (Gold run)
  const gates = getRallyGates();
  for (let i = 0; i < 10; i++) {
    const g = gates[i];
    sim.x = g.x;
    sim.y = g.y;
    sim.z = g.z;
    sim.heading = g.targetHeading;
    sim.speed = 36;
    sim.step(0.02, freshControls());
  }

  assert.equal(sim.rallyState?.completed, true);
  assert.equal(sim.completionReady, true);
  assert.equal(sim.rallyState?.medal, 'gold');

  const beforeCash = sim.career.cash;
  const finished = sim.finish();
  assert.equal(finished, true);
  assert.equal(sim.result.bonus, 600); // Gold par bonus
  assert.ok(sim.career.cash > beforeCash);
});
