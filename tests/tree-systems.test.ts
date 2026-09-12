import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  type TreeType,
  TREE_SPECIES_CONFIG,
  createCottonwoodTrunkGeometry,
  createCottonwoodCrownGeometry,
  createOakTrunkGeometry,
  createOakCrownGeometry,
  createCedarTrunkGeometry,
  createCedarCrownGeometry,
  createWillowTrunkGeometry,
  createWillowCrownGeometry,
  createTreeTrunkGeometry,
  createTreeCrownGeometry,
  createFullTreeGeometry,
  createTreeCrownMaterial,
  createTreeTrunkMaterial,
  TreeSystem,
} from '../lib/fx/tree-systems';

function validateBufferGeometry(geom: T.BufferGeometry, name: string): void {
  assert.ok(geom instanceof T.BufferGeometry, `${name} must be a BufferGeometry`);

  const pos = geom.getAttribute('position');
  assert.ok(pos, `${name} must have a position attribute`);
  assert.equal(pos.itemSize, 3, `${name} position itemSize must be 3`);
  assert.ok(pos.count > 0, `${name} position count must be > 0`);

  const norm = geom.getAttribute('normal');
  assert.ok(norm, `${name} must have a normal attribute`);
  assert.equal(norm.itemSize, 3, `${name} normal itemSize must be 3`);
  assert.equal(norm.count, pos.count, `${name} normal count must match position count`);

  // Ensure all values are finite (no NaN or Infinity)
  for (let i = 0; i < pos.count * 3; i++) {
    assert.ok(
      Number.isFinite(pos.array[i]),
      `${name} position[${i}] is not finite: ${pos.array[i]}`,
    );
    assert.ok(
      Number.isFinite(norm.array[i]),
      `${name} normal[${i}] is not finite: ${norm.array[i]}`,
    );
  }

  assert.ok(geom.boundingBox, `${name} must have boundingBox computed`);
  assert.ok(geom.boundingSphere, `${name} must have boundingSphere computed`);
  assert.ok(geom.boundingSphere.radius > 0, `${name} boundingSphere radius must be > 0`);
}

// ---------------------------------------------------------------------------
// 1. Botanical Species Configuration & Traits
// ---------------------------------------------------------------------------

test('TREE_SPECIES_CONFIG specifies all four prairie species with botanical traits and foliage colors', () => {
  const speciesList: TreeType[] = ['cottonwood', 'oak', 'cedar', 'willow'];

  for (const sp of speciesList) {
    const cfg = TREE_SPECIES_CONFIG[sp];
    assert.ok(cfg, `Species config for ${sp} must exist`);
    assert.equal(cfg.type, sp);
    assert.ok(cfg.commonName.length > 0);
    assert.ok(cfg.botanicalName.length > 0);
    assert.ok(cfg.minHeight > 0);
    assert.ok(cfg.maxHeight > cfg.minHeight);
    assert.ok(cfg.baseHeight >= cfg.minHeight && cfg.baseHeight <= cfg.maxHeight);
  }

  // 1a. Plains Cottonwood: towering height (16-24m), vibrant summer green (#5a8d3b)
  const cottonwood = TREE_SPECIES_CONFIG.cottonwood;
  assert.equal(cottonwood.minHeight, 16);
  assert.equal(cottonwood.maxHeight, 24);
  assert.equal(cottonwood.color.toLowerCase(), '#5a8d3b');
  assert.equal(cottonwood.isConifer, false);

  // 1b. Bur Oak: broad dome umbrella (12-18m height), deep forest green (#3b6e2e)
  const oak = TREE_SPECIES_CONFIG.oak;
  assert.equal(oak.minHeight, 12);
  assert.equal(oak.maxHeight, 18);
  assert.equal(oak.color.toLowerCase(), '#3b6e2e');
  assert.equal(oak.isConifer, false);

  // 1c. Eastern Redcedar: evergreen conifer (8-15m height), juniper teal (#2c5a45)
  const cedar = TREE_SPECIES_CONFIG.cedar;
  assert.equal(cedar.minHeight, 8);
  assert.equal(cedar.maxHeight, 15);
  assert.equal(cedar.color.toLowerCase(), '#2c5a45');
  assert.equal(cedar.isConifer, true);

  // 1d. Prairie River Willow: riparian drooping cascade (10-16m height), chartreuse/lime (#78a342)
  const willow = TREE_SPECIES_CONFIG.willow;
  assert.equal(willow.minHeight, 10);
  assert.equal(willow.maxHeight, 16);
  assert.equal(willow.color.toLowerCase(), '#78a342');
  assert.equal(willow.isConifer, false);
});

// ---------------------------------------------------------------------------
// 2. Procedural Geometries: Distinct Conifers vs Hardwoods
// ---------------------------------------------------------------------------

test('createTreeTrunkGeometry generates distinct conifer vs hardwood trunk geometries', () => {
  const cottonwoodTrunk = createCottonwoodTrunkGeometry();
  const oakTrunk = createOakTrunkGeometry();
  const cedarTrunk = createCedarTrunkGeometry();
  const willowTrunk = createWillowTrunkGeometry();

  validateBufferGeometry(cottonwoodTrunk, 'cottonwoodTrunk');
  validateBufferGeometry(oakTrunk, 'oakTrunk');
  validateBufferGeometry(cedarTrunk, 'cedarTrunk');
  validateBufferGeometry(willowTrunk, 'willowTrunk');

  // Cedar conifer trunk has a slender tapered profile without flared hardwood root collar
  const cedarBB = cedarTrunk.boundingBox!;
  const cedarSpreadX = cedarBB.max.x - cedarBB.min.x;
  assert.ok(cedarSpreadX < 1.0, `Cedar conifer trunk should be slender (<1m), got ${cedarSpreadX}`);

  // Cottonwood & Oak trunks have flared root collars at the base (wider than 2m)
  const cottonwoodBB = cottonwoodTrunk.boundingBox!;
  const cottonwoodSpreadX = cottonwoodBB.max.x - cottonwoodBB.min.x;
  assert.ok(
    cottonwoodSpreadX >= 1.5,
    `Cottonwood trunk flared collar and branches should be >1.5m, got ${cottonwoodSpreadX}`,
  );

  const oakBB = oakTrunk.boundingBox!;
  const oakSpreadX = oakBB.max.x - oakBB.min.x;
  assert.ok(
    oakSpreadX >= 2.0,
    `Bur Oak stout gnarled trunk with rugged low branching should be wide (>2m), got ${oakSpreadX}`,
  );

  // Willow trunk has graceful arching branches
  const willowBB = willowTrunk.boundingBox!;
  assert.ok(willowBB.max.y > 5.0, 'Willow trunk branches reach above 5m');

  // All trunks start at ground level (min.y near 0)
  for (const trunk of [cottonwoodTrunk, oakTrunk, cedarTrunk, willowTrunk]) {
    assert.ok(Math.abs(trunk.boundingBox!.min.y) < 0.1, 'Trunk base must start at ground level (y=0)');
  }

  // Generic factory dispatch matches individual species functions
  const genericCedar = createTreeTrunkGeometry('cedar');
  assert.equal(
    genericCedar.getAttribute('position').count,
    cedarTrunk.getAttribute('position').count,
  );
  genericCedar.dispose();

  cottonwoodTrunk.dispose();
  oakTrunk.dispose();
  cedarTrunk.dispose();
  willowTrunk.dispose();
});

test('createTreeCrownGeometry generates distinct tiered crowns for each species matching botanical silhouettes', () => {
  const cottonwoodCrown = createCottonwoodCrownGeometry();
  const oakCrown = createOakCrownGeometry();
  const cedarCrown = createCedarCrownGeometry();
  const willowCrown = createWillowCrownGeometry();

  validateBufferGeometry(cottonwoodCrown, 'cottonwoodCrown');
  validateBufferGeometry(oakCrown, 'oakCrown');
  validateBufferGeometry(cedarCrown, 'cedarCrown');
  validateBufferGeometry(willowCrown, 'willowCrown');

  // Cottonwood: towering apex height (16-24m)
  const cwBB = cottonwoodCrown.boundingBox!;
  assert.ok(
    cwBB.max.y >= 18 && cwBB.max.y <= 24,
    `Cottonwood crown apex should reach 18-24m, got ${cwBB.max.y}`,
  );
  const cwSpreadX = cwBB.max.x - cwBB.min.x;
  assert.ok(cwSpreadX > 10, `Cottonwood broad silhouette spread should be >10m, got ${cwSpreadX}`);

  // Oak: massive broad dome umbrella canopy (12-18m height, wide lateral spread where width > height)
  const oakBB = oakCrown.boundingBox!;
  const oakHeight = oakBB.max.y - oakBB.min.y;
  const oakSpreadX = oakBB.max.x - oakBB.min.x;
  const oakSpreadZ = oakBB.max.z - oakBB.min.z;
  assert.ok(
    oakBB.max.y >= 13 && oakBB.max.y <= 18,
    `Bur Oak crown apex should be 13-18m, got ${oakBB.max.y}`,
  );
  assert.ok(
    oakSpreadX > oakHeight,
    `Bur Oak umbrella canopy spread (${oakSpreadX}) must be wider than its crown vertical height (${oakHeight})`,
  );
  assert.ok(oakSpreadX >= 14, `Bur Oak massive lateral spread should be >=14m, got ${oakSpreadX}`);
  assert.ok(oakSpreadZ >= 14, `Bur Oak massive lateral spread Z should be >=14m, got ${oakSpreadZ}`);

  // Cedar: conical / pyramidal tiered evergreen layers with slender tapered profile (spread / height < 0.55)
  const cedarBB = cedarCrown.boundingBox!;
  const cedarHeight = cedarBB.max.y - cedarBB.min.y;
  const cedarSpreadX = cedarBB.max.x - cedarBB.min.x;
  assert.ok(
    cedarBB.max.y >= 9 && cedarBB.max.y <= 15,
    `Cedar crown apex should be 9-15m, got ${cedarBB.max.y}`,
  );
  const cedarAspect = cedarSpreadX / cedarHeight;
  assert.ok(
    cedarAspect < 0.55,
    `Cedar profile must be slender/tapered (spread/height < 0.55), got ${cedarAspect}`,
  );

  // Willow: drooping pendulous cascading canopy lobes along river bank (lobes drape downwards toward base)
  const willowBB = willowCrown.boundingBox!;
  assert.ok(
    willowBB.max.y >= 11 && willowBB.max.y <= 16,
    `Willow apex should be 11-16m, got ${willowBB.max.y}`,
  );
  assert.ok(
    willowBB.min.y <= 5.0,
    `Willow pendulous cascading lobes must drape down low (min.y <= 5.0m), got ${willowBB.min.y}`,
  );

  // Generic factory dispatch
  const genericOak = createTreeCrownGeometry('oak');
  assert.equal(
    genericOak.getAttribute('position').count,
    oakCrown.getAttribute('position').count,
  );
  genericOak.dispose();

  cottonwoodCrown.dispose();
  oakCrown.dispose();
  cedarCrown.dispose();
  willowCrown.dispose();
});

test('createFullTreeGeometry merges trunk and crown into a cohesive tree starting at ground level', () => {
  const fullTree = createFullTreeGeometry('cottonwood');
  validateBufferGeometry(fullTree, 'fullCottonwood');

  const bb = fullTree.boundingBox!;
  assert.ok(Math.abs(bb.min.y) < 0.05, `Full tree base must start at y=0, got ${bb.min.y}`);
  assert.ok(bb.max.y >= 18 && bb.max.y <= 24, `Full cottonwood height should be 18-24m, got ${bb.max.y}`);

  fullTree.dispose();
});

// ---------------------------------------------------------------------------
// 3. Tree Visual FX & Shaders
// ---------------------------------------------------------------------------

test('createTreeCrownMaterial configures properties, cache key, and shader injections', () => {
  const windTime = { value: 4.2 };
  const sunDir = new T.Vector3(0.6, 0.7, 0.2);
  const material = createTreeCrownMaterial(windTime, sunDir);

  assert.ok(material instanceof T.MeshStandardMaterial);
  assert.equal(material.roughness, 0.84);
  assert.equal(material.side, T.DoubleSide);
  assert.equal(typeof material.customProgramCacheKey, 'function');
  assert.equal(material.customProgramCacheKey(), 'prairie-tree-crown-v1');

  // Mock WebGL shader object to test onBeforeCompile
  const mockShader: any = {
    uniforms: {},
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      void main() {
        vec4 diffuseColor = vec4(1.0);
        #include <color_fragment>
      }
    `,
  };

  assert.equal(typeof material.onBeforeCompile, 'function');
  material.onBeforeCompile(mockShader, {} as any);

  // Uniform checks
  assert.equal(mockShader.uniforms.windTime, windTime);
  assert.ok(mockShader.uniforms.sunDirection);
  assert.ok(mockShader.uniforms.sunDirection.value instanceof T.Vector3);

  // Vertex Shader: Foliage wind sway vertex displacement (y^2 branch height)
  assert.ok(mockShader.vertexShader.includes('uniform float windTime;'));
  assert.ok(mockShader.vertexShader.includes('varying float vTreeHeight;'));
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldPosition;'));
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldNormal;'));
  assert.ok(
    mockShader.vertexShader.includes('branchHeight * branchHeight'),
    'Vertex shader must displace foliage using branch height squared (y^2)',
  );
  assert.ok(mockShader.vertexShader.includes('transformed.x += totalSway'));
  assert.ok(mockShader.vertexShader.includes('transformed.z += totalSway'));

  // Fragment Shader: Subsurface scattering & Crown Volume AO
  assert.ok(mockShader.fragmentShader.includes('uniform vec3 sunDirection;'));
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldNormal;'));
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldPosition;'));

  // Crown volume AO / underbelly darkening
  assert.ok(
    mockShader.fragmentShader.includes('underbellyAO'),
    'Fragment shader must include underbelly AO',
  );
  assert.ok(
    mockShader.fragmentShader.includes('crownVolumeAO'),
    'Fragment shader must modulate diffuse by crown volume AO',
  );

  // Subsurface light scattering / leaf translucency
  assert.ok(
    mockShader.fragmentShader.includes('sssFactor'),
    'Fragment shader must compute subsurface scattering factor',
  );
  assert.ok(
    mockShader.fragmentShader.includes('warmLeafTransmittance'),
    'Fragment shader must add warm leaf transmittance glow',
  );

  material.dispose();
});

test('createTreeCrownMaterial handles optional sunDir and custom options', () => {
  const windTime = { value: 1.0 };
  const material = createTreeCrownMaterial(windTime, undefined, { roughness: 0.77 });

  assert.equal(material.roughness, 0.77);

  const mockShader: any = {
    uniforms: {},
    vertexShader: '#include <begin_vertex>',
    fragmentShader: '#include <color_fragment>',
  };
  material.onBeforeCompile(mockShader, {} as any);

  assert.ok(mockShader.uniforms.sunDirection.value instanceof T.Vector3);
  material.dispose();
});

test('createTreeTrunkMaterial configures rough bark material, fissures, and cache key', () => {
  const material = createTreeTrunkMaterial();

  assert.ok(material instanceof T.MeshStandardMaterial);
  assert.equal(material.roughness, 0.92);
  assert.equal(typeof material.customProgramCacheKey, 'function');
  assert.equal(material.customProgramCacheKey(), 'prairie-tree-trunk-v1');

  const mockShader: any = {
    uniforms: {},
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
      }
    `,
    fragmentShader: `
      #include <common>
      void main() {
        vec4 diffuseColor = vec4(1.0);
        #include <color_fragment>
      }
    `,
  };

  material.onBeforeCompile(mockShader, {} as any);

  // Vertex shader passes position and normal
  assert.ok(mockShader.vertexShader.includes('varying vec3 vTrunkPos;'));
  assert.ok(mockShader.vertexShader.includes('varying vec3 vTrunkNormal;'));

  // Fragment shader creates vertical bark furrow fissures
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vTrunkPos;'));
  assert.ok(mockShader.fragmentShader.includes('fissureFactor'));
  assert.ok(mockShader.fragmentShader.includes('barkFurrow'));
  assert.ok(mockShader.fragmentShader.includes('barkRidge'));
  // Deep fissure (#544633) and weathered outer bark (#6b5c47)
  assert.ok(mockShader.fragmentShader.includes('0.329'));
  assert.ok(mockShader.fragmentShader.includes('0.420'));

  material.dispose();
});

// ---------------------------------------------------------------------------
// 4. TreeSystem Ecosystem & World Placement
// ---------------------------------------------------------------------------

test('TreeSystem instantiates, populates instanced meshes, and distributes species naturally', () => {
  const scene = new T.Scene();
  const windTime = { value: 0 };
  const sunDir = new T.Vector3(0.5, 0.8, 0.3);

  const treeSystem = new TreeSystem(scene, {
    count: 600,
    windTime,
    sunDir,
    seed: 42,
  });

  // Verify group added to scene
  assert.ok(scene.children.includes(treeSystem.group));
  assert.equal(treeSystem.totalTrees, 600);

  // Verify all 4 species are populated
  const speciesList: TreeType[] = ['cottonwood', 'oak', 'cedar', 'willow'];
  for (const sp of speciesList) {
    const count = treeSystem.getSpeciesCount(sp);
    assert.ok(count > 0, `Species ${sp} must have trees generated, got ${count}`);

    const trunkMesh = treeSystem.trunkMeshes.get(sp);
    const crownMesh = treeSystem.crownMeshes.get(sp);

    assert.ok(trunkMesh instanceof T.InstancedMesh, `${sp} trunkMesh must be an InstancedMesh`);
    assert.ok(crownMesh instanceof T.InstancedMesh, `${sp} crownMesh must be an InstancedMesh`);
    assert.equal(trunkMesh.count, count);
    assert.equal(crownMesh.count, count);

    // Verify shadows enabled
    assert.equal(trunkMesh.castShadow, true);
    assert.equal(crownMesh.castShadow, true);
    assert.equal(crownMesh.receiveShadow, true);

    // Verify instance colors allocated
    assert.ok(crownMesh.instanceColor !== null, `${sp} crownMesh must have instanceColor`);
  }

  // Verify natural distribution across ecological zones
  const instances = treeSystem.getInstances();
  assert.equal(instances.length, 600);

  // Riparian corridor: near river, high proportion of cottonwoods and willows
  const riparianTrees = instances.filter((t) => t.species === 'cottonwood' || t.species === 'willow');
  assert.ok(
    riparianTrees.length >= 150,
    `Riparian species (cottonwood + willow) should be prevalent near water, got ${riparianTrees.length}`,
  );

  // Field hedgerows and windbreaks: redcedar and bur oak
  const windbreakTrees = instances.filter((t) => t.species === 'cedar' || t.species === 'oak');
  assert.ok(
    windbreakTrees.length >= 200,
    `Windbreak species (cedar + oak) should form field shelterbelts, got ${windbreakTrees.length}`,
  );

  // Animation update
  treeSystem.update(0.016, 5.5);
  assert.equal(treeSystem.windTime.value, 5.5);

  // Clean disposal
  treeSystem.dispose();
  assert.ok(!scene.children.includes(treeSystem.group));
  assert.equal(treeSystem.trunkMeshes.size, 0);
  assert.equal(treeSystem.crownMeshes.size, 0);
  assert.equal(treeSystem.crownMaterials.length, 0);
});

test('createFullTreeGeometry builds valid combined geometries for all four species', () => {
  const speciesList: TreeType[] = ['cottonwood', 'oak', 'cedar', 'willow'];
  for (const sp of speciesList) {
    const full = createFullTreeGeometry(sp);
    validateBufferGeometry(full, `full-${sp}`);

    const bb = full.boundingBox!;
    // Tree base must be at ground level (y=0)
    assert.ok(Math.abs(bb.min.y) < 0.1, `${sp} full tree base must be at y=0, got ${bb.min.y}`);
    // Tree height must match species limits
    const height = bb.max.y - bb.min.y;
    const cfg = TREE_SPECIES_CONFIG[sp];
    assert.ok(
      height >= cfg.minHeight * 0.9 && height <= cfg.maxHeight * 1.1,
      `${sp} height ${height} must be near config range [${cfg.minHeight}, ${cfg.maxHeight}]`,
    );

    full.dispose();
  }
});

test('TreeSystem works in headless mode and supports custom options and farmstead shading', () => {
  // Custom mock terrain, river, field, and farmsteads
  const mockGround = (x: number, z: number) => 15.0 + Math.sin(x * 0.01) * 2;
  const mockRiverX = (z: number) => Math.sin(z * 0.005) * 50;
  const mockFields = [
    {
      x: 100,
      z: 200,
      boundary: [
        { x: -50, z: -50 },
        { x: 50, z: -50 },
        { x: 50, z: 50 },
        { x: -50, z: 50 },
      ],
    },
  ];
  const mockFarmsteads = [[-200, -300], [400, 500]] as const;

  const system = new TreeSystem({
    count: 300,
    seed: 999,
    groundFn: mockGround,
    riverXFn: mockRiverX,
    fields: mockFields,
    farmsteads: mockFarmsteads,
  });

  assert.equal(system.totalTrees, 300);
  const instances = system.getInstances();
  assert.equal(instances.length, 300);

  // Check elevation matches custom mock ground
  for (const inst of instances) {
    const expectedY = mockGround(inst.x, inst.z);
    assert.equal(inst.y, expectedY, 'Instance y must match custom ground function');
  }

  // Check farmstead perimeter trees exist near farmstead locations
  const nearFarmstead = instances.filter((inst) =>
    mockFarmsteads.some(([fx, fz]) => Math.hypot(inst.x - fx, inst.z - fz) < 120),
  );
  assert.ok(nearFarmstead.length > 0, 'Should place shade trees in farmstead clearing perimeter');

  // Verify colors are tinted close to species config color
  for (const inst of instances) {
    const cfg = TREE_SPECIES_CONFIG[inst.species];
    const targetColor = new T.Color(cfg.color);
    assert.ok(inst.color instanceof T.Color);
    // Rough distance check in RGB space: instance color should be close to base color
    const dist = Math.hypot(
      inst.color.r - targetColor.r,
      inst.color.g - targetColor.g,
      inst.color.b - targetColor.b,
    );
    assert.ok(dist < 0.35, `${inst.species} color should be close to config color`);
  }

  system.dispose();
  assert.equal(system.totalTrees, 0);
});

