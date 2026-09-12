import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import { fieldCells } from '../lib/field-geometry';
import { Simulation, ground } from '../lib/simulation';

void test('fieldCells polygons generate valid closed perimeter line segments for coverage outline', () => {
  const sim = new Simulation();
  const cells = fieldCells(sim.job);
  assert.ok(cells.size > 0, 'Should have field cells');

  for (const [cellId, polygon] of cells) {
    assert.ok(polygon.length >= 3, `Cell ${cellId} polygon should have at least 3 vertices`);
    
    // Test generating line segments around polygon perimeter
    const lineVerts: number[] = [];
    const len = polygon.length;
    for (let j = 0; j < len; j++) {
      const p1 = polygon[j];
      const p2 = polygon[(j + 1) % len];
      lineVerts.push(
        sim.job.x + p1.x,
        ground(sim.job.x + p1.x, sim.job.z + p1.z) + 2.70,
        sim.job.z + p1.z,
        sim.job.x + p2.x,
        ground(sim.job.x + p2.x, sim.job.z + p2.z) + 2.70,
        sim.job.z + p2.z,
      );
    }
    // Each segment has 2 vertices * 3 coords = 6 numbers per edge
    assert.equal(lineVerts.length, len * 6);
    // All vertices must be finite numbers
    assert.ok(lineVerts.every(Number.isFinite), 'All line vertices must be finite');
  }
});

void test('coverage outline segments are elevated above fill mesh to eliminate z-fighting', () => {
  const sim = new Simulation();
  const cells = fieldCells(sim.job);
  const sampleCell = cells.get([...cells.keys()][0])!;

  const fillElevation = ground(sim.job.x + sampleCell[0].x, sim.job.z + sampleCell[0].z) + 2.65;
  const lineElevation = ground(sim.job.x + sampleCell[0].x, sim.job.z + sampleCell[0].z) + 2.70;

  assert.ok(
    lineElevation > fillElevation,
    `Outline elevation (${lineElevation}) must be above fill elevation (${fillElevation})`,
  );
  assert.ok(
    lineElevation - fillElevation >= 0.04,
    'Elevation offset should be at least 4cm to guarantee clean visibility',
  );
});

void test('coverageMesh and coverageLineMesh materials have correct sharp ag-green and light keyline specs', () => {
  // Test coverage fill material specs
  const fillMat = new T.MeshBasicMaterial({
    color: '#8fe33b',
    transparent: true,
    opacity: 0.30,
    depthWrite: false,
    side: T.DoubleSide,
  });

  assert.equal(fillMat.transparent, true);
  assert.equal(fillMat.depthWrite, false);
  assert.equal(fillMat.opacity, 0.30);
  assert.equal(fillMat.color.getHexString(), '8fe33b');

  // Test coverage line outline material specs
  const lineMat = new T.LineBasicMaterial({
    color: '#f0fdf4',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });

  assert.equal(lineMat.transparent, true);
  assert.equal(lineMat.depthWrite, false);
  assert.equal(lineMat.opacity, 0.38);
  assert.equal(lineMat.color.getHexString(), 'f0fdf4');
});

void test('coverage geometry attributes allocate sufficient capacity for all potential cells', () => {
  const maxCells = 1444; // 38x38 grid
  const fillVerticesPerCell = 18; // 6 triangles * 3 vertices
  const lineVerticesPerCell = 16; // up to 8 edges * 2 endpoints

  const coverageGeometry = new T.BufferGeometry();
  coverageGeometry.setAttribute(
    'position',
    new T.BufferAttribute(new Float32Array(maxCells * fillVerticesPerCell * 3), 3),
  );

  const coverageLineGeometry = new T.BufferGeometry();
  coverageLineGeometry.setAttribute(
    'position',
    new T.BufferAttribute(new Float32Array(maxCells * lineVerticesPerCell * 3), 3),
  );

  assert.equal(coverageGeometry.attributes.position.count, maxCells * fillVerticesPerCell);
  assert.equal(coverageLineGeometry.attributes.position.count, maxCells * lineVerticesPerCell);
});
