import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { World } from '../lib/world';
import { Simulation, contracts } from '../lib/simulation';

void test('starting the first contract builds pickups even when the landing scene used the same job', () => {
  // Exercise the real scene update without allocating a WebGL renderer.
  const world: World = Object.assign(Object.create(World.prototype), {
    sim: new Simulation(),
    collectiblesGroup: new T.Group(),
    collectibleMeshes: [],
    collectiblesLayout: '',
    time: 0,
  });
  world.updateCollectibles(0.016);
  assert.equal(world.collectiblesGroup.children.length, 0);
  world.sim.reset(contracts[0]);
  world.updateCollectibles(0.016);
  assert.equal(
    world.collectiblesGroup.children.length,
    world.sim.collectibles.length,
  );
  assert.ok(world.collectibleMeshes.length > 0);

  const first = world.collectibleMeshes[0].mesh;
  world.sim.collectibles[0].collected = true;
  world.updateCollectibles(0.016);
  assert.equal(first.visible, false, 'A collected pickup disappears');
  assert.equal(
    world.collectibleMeshes[0].mesh,
    first,
    'Collecting does not rebuild other meshes',
  );

  world.sim.reset(contracts[0]);
  world.updateCollectibles(0.016);
  assert.equal(
    first.visible,
    true,
    'Replaying the same contract restores visible pickups',
  );

  world.sim.collectibles = [];
  world.updateCollectibles(0.016);
  assert.equal(world.collectiblesGroup.children.length, 0);
});
