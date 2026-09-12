import test from 'node:test';
import assert from 'node:assert/strict';
import {
  tandemContract,
  getTandemState,
  TandemAiPartner,
} from '../lib/tandem';
import { Simulation, contracts, fieldCellCount } from '../lib/simulation';

test('tandemContract creates valid cooperative contract', () => {
  const base = contracts[0];
  const job = tandemContract(base, 'Bennett');
  assert.equal(job.kind, 'tandem');
  assert.equal(job.target, 88);
  assert.ok(job.name.includes('Tandem Co-Op'));
  assert.ok(job.acres >= base.acres);
  assert.ok(job.pay > base.pay);
});

test('cooperative coverage aggregates both pilots swaths toward target', () => {
  const sim = new Simulation();
  const job = tandemContract(contracts[0]);
  sim.reset(job);

  assert.equal(sim.isTandem, true);
  const total = fieldCellCount(job);

  // Player treats 45% of field
  for (let i = 0; i < Math.floor(total * 0.45); i++) {
    sim.covered.add(i);
  }
  // Partner treats different 45% of field
  for (let i = Math.floor(total * 0.45); i < Math.floor(total * 0.9); i++) {
    sim.partnerCovered.add(i);
  }

  assert.ok(sim.coverage >= 88);
  assert.equal(sim.completionReady, true);
});

test('TandemAiPartner flies alongside and activates formation slipstream', () => {
  const sim = new Simulation();
  const job = tandemContract(contracts[0]);
  sim.reset(job);

  const partner = new TandemAiPartner(job);

  // Place player 35m away from partner
  sim.x = partner.x + 35;
  sim.y = partner.y;
  sim.z = partner.z;

  // Step partner
  partner.update(0.02, sim);

  assert.equal(sim.inFormation, true);
  assert.ok(sim.formationSeconds > 0);

  const state = getTandemState(sim);
  assert.equal(state.inFormation, true);
  assert.ok(state.formationBonus >= 0);
});
