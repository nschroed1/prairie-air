import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dustOffContract,
  getDustOffState,
  DustOffAiPilot,
} from '../lib/dust-off';
import { Simulation, contracts, fieldCellCount } from '../lib/simulation';

test('dustOffContract generates valid 1v1 match sprint contract', () => {
  const base = contracts[0];
  const job = dustOffContract(base, 'Bennett');
  assert.equal(job.kind, 'dust_off');
  assert.equal(job.target, 50);
  assert.ok(job.name.includes('Dust-Off 1v1'));
  assert.ok(job.pay > base.pay);
  assert.ok(job.bonus > base.bonus);
});

test('swath claiming rule enforces first-come first-served cell ownership', () => {
  const sim = new Simulation();
  const job = dustOffContract(contracts[0]);
  sim.reset(job);

  assert.equal(sim.isDustOff, true);
  assert.equal(sim.covered.size, 0);
  assert.equal(sim.rivalCovered.size, 0);

  // Rival claims cell 100 first
  sim.rivalCovered.add(100);

  // Player flies directly over cell 100 with spray active
  // Place aircraft at field center
  sim.x = job.x;
  sim.z = job.z;
  sim.y = 480;
  sim.speed = 34;

  sim.paint(job.x, job.z, 0.05, true);

  // Player cannot claim cell 100 since rival owns it
  assert.equal(sim.covered.has(100), false);
  // But player can claim other cells in their swath
  assert.ok(sim.covered.size > 0);
});

test('getDustOffState tracks lead/lag and determines winner', () => {
  const sim = new Simulation();
  const job = dustOffContract(contracts[0]);
  sim.reset(job);

  const total = fieldCellCount(job);

  // Give player 60% coverage (knockout win)
  for (let i = 0; i < Math.floor(total * 0.6); i++) {
    sim.covered.add(i);
  }

  const state = getDustOffState(sim);
  assert.equal(state.myCoverage >= 50, true);
  assert.equal(state.winner, 'player');
  assert.ok(state.leadAcres > 0);
});

test('DustOffAiPilot flies passes and deposits swaths into sim.rivalCovered', () => {
  const sim = new Simulation();
  const job = dustOffContract(contracts[0]);
  sim.reset(job);

  const ai = new DustOffAiPilot(job);
  assert.ok(ai.x !== undefined && ai.z !== undefined);

  // Step AI pilot for several seconds
  for (let i = 0; i < 200; i++) {
    ai.update(0.02, sim);
  }

  assert.ok(sim.rivalCovered.size > 0, 'AI rival should have claimed crop cells');
});
