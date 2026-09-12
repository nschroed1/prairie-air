import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fieldCells,
  fieldOutline,
  insideField,
  polygonArea,
  parcelShape,
} from '../lib/field-geometry';
import {
  Simulation,
  contracts,
  fields,
  ground,
  legacyGround,
  freshControls,
} from '../lib/simulation';
import { serialize, hydrate, seasonJobs, seasonAt } from '../lib/county';
import { flightPasses, spraySafety } from '../lib/flight-guidance';

void test('county parcels are deterministic, convex, varied and contained in the legacy coverage grid', () => {
  const outlines = new Set<string>();
  for (const f of fields) {
    const p = fieldOutline(f);
    outlines.add(JSON.stringify(p));
    assert.ok(p.every((v) => Math.abs(v.x) <= 228 && Math.abs(v.z) <= 226));
    for (let i = 0; i < p.length; i++) {
      const a = p[i],
        b = p[(i + 1) % p.length],
        c = p[(i + 2) % p.length];
      assert.ok((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x) >= -1e-8);
    }
    const area = [...fieldCells(f).values()].reduce(
      (sum, cell) => sum + polygonArea(cell),
      0,
    );
    assert.ok(Math.abs(area - polygonArea(p)) < 1e-5);
    assert.ok(area > 70000);
  }
  assert.ok(outlines.size > 40);
  assert.deepEqual(parcelShape(-2, 1), parcelShape(-2, 1));
  for (const job of seasonJobs(seasonAt()))
    assert.equal(
      job.acres,
      job.kind === 'skywriting'
        ? 0
        : Math.round(polygonArea(fieldOutline(job)) / 4046.8564224),
    );
});

void test('spray in a removed corner earns no coverage and incurs overspray', () => {
  const sim = new Simulation();
  sim.reset(contracts[1]);
  sim.x = sim.job.x + 90;
  sim.z = sim.job.z - 168;
  sim.y = ground(sim.x, sim.z) + 19;
  assert.equal(insideField(sim.job, sim.x, sim.z), false);
  assert.equal(spraySafety(sim), 'outside');
  sim.paint(sim.x, sim.z, 0.05);
  assert.equal(sim.coverage, 0);
  assert.ok(sim.oversprayAcres > 0);
});

void test('every clipped cell is treatable, duplicate passes do not inflate coverage, and replay preserves shape', () => {
  for (const job of [
    contracts[1],
    contracts[2],
    ...seasonJobs(seasonAt()).filter((j) => j.kind !== 'skywriting').slice(0, 12),
  ]) {
    const sim = new Simulation();
    sim.reset(job);
    for (const polygon of fieldCells(job).values()) {
      const x = job.x + polygon.reduce((s, p) => s + p.x, 0) / polygon.length;
      const z = job.z + polygon.reduce((s, p) => s + p.z, 0) / polygon.length;
      sim.paint(x, z, 0.016);
    }
    assert.equal(sim.coverage, 100);
    assert.equal(sim.covered.size, fieldCells(job).size);
    const size = sim.covered.size;
    sim.paint(job.x, job.z, 0.016);
    assert.equal(sim.covered.size, size);
    const replay = hydrate(serialize(sim));
    assert.deepEqual(replay.job.boundary, job.boundary);
    assert.equal(replay.coverage, 100);
    assert.equal(replay.finish(), true);
    assert.equal(replay.result.bonus, job.bonus);
  }
});

void test('guidance shortens passes along the clipped corner', () => {
  const sim = new Simulation();
  sim.reset(contracts[1]);
  const passes = flightPasses(sim);
  assert.ok(passes.at(-1)!.minZ > passes[0].minZ + 20);
  for (const pass of passes)
    assert.equal(
      insideField(sim.job, pass.x, (pass.minZ + pass.maxZ) / 2),
      true,
    );
});

void test('hills create terrain-following decisions while the introductory plot remains gentle', () => {
  const heights = fields.map((f) => ground(f.x, f.z));
  assert.ok(Math.max(...heights) - Math.min(...heights) > 100);
  const sim = new Simulation();
  sim.reset(contracts[2]);
  sim.x = -1450;
  sim.z = 1000;
  sim.y = ground(sim.x, sim.z) + 35;
  const before = sim.altitude,
    altitude = sim.y;
  for (let i = 0; i < 100; i++) sim.step(0.05, freshControls());
  assert.equal(sim.y, altitude);
  assert.ok(Math.abs(sim.altitude - before) > 2);
  for (let x = -100; x <= 100; x += 50)
    for (let z = -150; z <= 150; z += 50) {
      const legacy =
        7 +
        Math.sin(x * 0.0017) * 8 +
        Math.cos(z * 0.0014) * 7 +
        Math.sin((x + z) * 0.003) * 3;
      assert.equal(ground(x, z), legacy);
    }
});

void test('legacy flights retain their ground clearance once when hills are introduced', () => {
  const sim = new Simulation();
  sim.reset(contracts[2]);
  const saved = serialize(sim);
  saved.terrainVersion = undefined;
  saved.y = legacyGround(saved.x, saved.z) + 19;
  const migrated = hydrate(saved);
  assert.ok(Math.abs(migrated.altitude - 19) < 1e-8);
  const again = hydrate(serialize(migrated));
  assert.equal(again.y, migrated.y);
  assert.equal(again.coverage, migrated.coverage);
});
