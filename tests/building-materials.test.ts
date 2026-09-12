import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createBarnwoodMaterial,
  createCorrugatedRoofMaterial,
  createSiloMaterial,
  createFarmhouseClapboardMaterial,
  createGlassMaterial,
  buildEnhancedBarn,
  buildEnhancedSilo,
  buildEnhancedHouse,
} from '../lib/fx/building-materials';

interface MockShader {
  uniforms: Record<string, T.IUniform>;
  vertexShader: string;
  fragmentShader: string;
}

function createMockShader(): MockShader {
  return {
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
        #include <normal_fragment_begin>
      }
    `,
  };
}

void test('createBarnwoodMaterial instantiates with correct properties, shaders, and cache key', () => {
  // Default color
  const defaultMat = createBarnwoodMaterial();
  assert.ok(defaultMat instanceof T.MeshStandardMaterial);
  assert.equal(defaultMat.color.getHexString(), '9e2b1b');
  assert.equal(defaultMat.roughness, 0.88);
  assert.equal(typeof defaultMat.customProgramCacheKey, 'function');
  assert.equal(defaultMat.customProgramCacheKey(), 'prairie-barnwood-#9e2b1b');

  // Custom color
  const customMat = createBarnwoodMaterial('#eae6dc');
  assert.equal(customMat.color.getHexString(), 'eae6dc');
  assert.equal(customMat.customProgramCacheKey(), 'prairie-barnwood-#eae6dc');
  assert.notEqual(
    defaultMat.customProgramCacheKey(),
    customMat.customProgramCacheKey(),
  );

  // onBeforeCompile shader inspection
  const mockShader = createMockShader();
  defaultMat.onBeforeCompile(
    mockShader as unknown as Parameters<T.Material['onBeforeCompile']>[0],
    {} as T.WebGLRenderer,
  );

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldPos;'));
  assert.ok(
    mockShader.vertexShader.includes(
      'vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    ),
  );

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldPos;'));
  assert.ok(mockShader.fragmentShader.includes('fract(vWorldPos.x * 0.85)'));
  assert.ok(mockShader.fragmentShader.includes('fract(vWorldPos.z * 0.85)'));
  assert.ok(mockShader.fragmentShader.includes('edgeShadow'));
  assert.ok(mockShader.fragmentShader.includes('grain'));
  assert.ok(mockShader.fragmentShader.includes('weatheredEdging'));
});

void test('createCorrugatedRoofMaterial instantiates with correct properties, shaders, and cache key', () => {
  // Default tint
  const defaultRoof = createCorrugatedRoofMaterial();
  assert.ok(defaultRoof instanceof T.MeshStandardMaterial);
  assert.equal(defaultRoof.color.getHexString(), 'd5d2be');
  assert.equal(defaultRoof.metalness, 0.55);
  assert.equal(defaultRoof.roughness, 0.38);
  assert.equal(typeof defaultRoof.customProgramCacheKey, 'function');
  assert.equal(
    defaultRoof.customProgramCacheKey(),
    'prairie-corrugated-#d5d2be',
  );

  // Custom tint
  const customRoof = createCorrugatedRoofMaterial('#95988e');
  assert.equal(customRoof.color.getHexString(), '95988e');
  assert.equal(
    customRoof.customProgramCacheKey(),
    'prairie-corrugated-#95988e',
  );
  assert.notEqual(
    defaultRoof.customProgramCacheKey(),
    customRoof.customProgramCacheKey(),
  );

  // onBeforeCompile shader inspection
  const mockShader = createMockShader();
  defaultRoof.onBeforeCompile(
    mockShader as unknown as Parameters<T.Material['onBeforeCompile']>[0],
    {} as T.WebGLRenderer,
  );

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying vec3 vRoofPos;'));
  assert.ok(
    mockShader.vertexShader.includes(
      'vRoofPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    ),
  );

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vRoofPos;'));
  assert.ok(mockShader.fragmentShader.includes('sin(vRoofPos.x * 8.0)'));
  assert.ok(mockShader.fragmentShader.includes('vRoofPos.z / 3.0'));
  assert.ok(mockShader.fragmentShader.includes('zincSpangle'));
  assert.ok(
    mockShader.fragmentShader.includes(
      'normal = normalize(normal + mat3(viewMatrix) * ridgeNormalPerturbation);',
    ),
  );
});

void test('createSiloMaterial instantiates with correct properties, shaders, and cache key', () => {
  const siloMat = createSiloMaterial();
  assert.ok(siloMat instanceof T.MeshStandardMaterial);
  assert.equal(siloMat.color.getHexString(), 'b8c4c2');
  assert.equal(siloMat.metalness, 0.65);
  assert.equal(siloMat.roughness, 0.32);
  assert.equal(typeof siloMat.customProgramCacheKey, 'function');
  assert.equal(siloMat.customProgramCacheKey(), 'prairie-silo-v1');

  // onBeforeCompile shader inspection
  const mockShader = createMockShader();
  siloMat.onBeforeCompile(
    mockShader as unknown as Parameters<T.Material['onBeforeCompile']>[0],
    {} as T.WebGLRenderer,
  );

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldPos;'));
  assert.ok(
    mockShader.vertexShader.includes(
      'vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;',
    ),
  );

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldPos;'));
  assert.ok(mockShader.fragmentShader.includes('fract(vWorldPos.y * 0.38)'));
  assert.ok(mockShader.fragmentShader.includes('rivetDots'));
});

void test('createFarmhouseClapboardMaterial instantiates with drop-lap shadows and unique cache key', () => {
  const clapboard = createFarmhouseClapboardMaterial();
  assert.ok(clapboard instanceof T.MeshStandardMaterial);
  assert.equal(clapboard.color.getHexString(), 'f2efe9');
  assert.equal(clapboard.roughness, 0.85);
  assert.equal(typeof clapboard.customProgramCacheKey, 'function');
  assert.equal(clapboard.customProgramCacheKey(), 'prairie-clapboard-#f2efe9');

  const customClapboard = createFarmhouseClapboardMaterial('#d0c8be');
  assert.equal(
    customClapboard.customProgramCacheKey(),
    'prairie-clapboard-#d0c8be',
  );

  // onBeforeCompile shader inspection
  const mockShader = createMockShader();
  clapboard.onBeforeCompile(
    mockShader as unknown as Parameters<T.Material['onBeforeCompile']>[0],
    {} as T.WebGLRenderer,
  );

  assert.ok(mockShader.vertexShader.includes('varying vec3 vWorldPos;'));
  assert.ok(mockShader.fragmentShader.includes('varying vec3 vWorldPos;'));
  assert.ok(mockShader.fragmentShader.includes('fract(vWorldPos.y * 1.8)'));
  assert.ok(mockShader.fragmentShader.includes('lapShadow'));
});

void test('createGlassMaterial instantiates with deep reflective blue properties', () => {
  const glass = createGlassMaterial();
  assert.ok(glass instanceof T.MeshStandardMaterial);
  assert.equal(glass.color.getHexString(), '1b3246');
  assert.equal(glass.metalness, 0.85);
  assert.equal(glass.roughness, 0.12);
});

void test('buildEnhancedBarn constructs barn meshes, cross-braced doors, roof eaves, and cupola', () => {
  const parent = new T.Group();
  const redMat = new T.MeshStandardMaterial({ color: 0x9e2b1b });
  const roofMat = new T.MeshStandardMaterial({ color: 0xd5d2be });
  const whiteTrim = new T.MeshStandardMaterial({ color: 0xffffff });
  const darkMat = new T.MeshStandardMaterial({ color: 0x222222 });

  buildEnhancedBarn(parent, redMat, roofMat, whiteTrim, darkMat);

  // Group attachment check
  assert.equal(parent.children.length, 1);
  const barnGroup = parent.children[0] as T.Group;
  assert.ok(barnGroup instanceof T.Group);

  // Traverse and gather all meshes
  const meshes: T.Mesh[] = [];
  barnGroup.traverse((obj) => {
    if (obj instanceof T.Mesh) {
      meshes.push(obj);
    }
  });

  // Verify mesh count is substantial (body, foundation, roof, eaves, door framing, cross braces, loft door, windows, cupola)
  assert.ok(
    meshes.length >= 25,
    `Expected at least 25 meshes in barn assembly, got ${meshes.length}`,
  );

  // Check geometries present
  const hasBox = meshes.some((m) => m.geometry instanceof T.BoxGeometry);
  const hasGable = meshes.some((m) => m.name === 'barn-gable-roof');
  const hasCone = meshes.some((m) => m.geometry instanceof T.ConeGeometry);
  assert.ok(hasBox, 'Barn should contain BoxGeometry elements');
  assert.ok(hasGable, 'Barn roof has a gable profile');
  const roof = meshes.find((m) => m.name === 'barn-gable-roof')!;
  const bounds = new T.Box3().setFromObject(roof);
  assert.ok(
    bounds.min.y >= 14.9 && bounds.max.y <= 21.1,
    'The roof stays above the loft and below the cupola',
  );
  assert.ok(
    bounds.min.x < -15 && bounds.max.x > 15,
    'Both eaves overhang the walls',
  );
  assert.ok(hasCone, 'Barn cupola cap should contain ConeGeometry');

  // Verify materials used
  const usedMaterials = new Set(meshes.map((m) => m.material));
  assert.ok(usedMaterials.has(redMat), 'Barn should utilize redMat');
  assert.ok(usedMaterials.has(roofMat), 'Barn should utilize roofMat');
  assert.ok(usedMaterials.has(whiteTrim), 'Barn should utilize whiteTrim');
  assert.ok(usedMaterials.has(darkMat), 'Barn should utilize darkMat');

  // Verify cross-braced diagonal rotation exists
  const diagonalMesh = meshes.find(
    (m) => Math.abs(m.rotation.z) > 0.4 && Math.abs(m.rotation.z) < 0.6,
  );
  assert.ok(
    diagonalMesh,
    'Barn doors must contain diagonal cross-brace members',
  );
});

void test('buildEnhancedSilo constructs silo cylinder, dome, ladder, safety cage, and cupola at (x, z)', () => {
  const parent = new T.Group();
  const siloMat = new T.MeshStandardMaterial({ color: 0xb8c4c2 });
  const metalTrim = new T.MeshStandardMaterial({ color: 0x555555 });

  const testX = 45.0;
  const testZ = -18.0;
  buildEnhancedSilo(parent, siloMat, metalTrim, testX, testZ);

  assert.equal(parent.children.length, 1);
  const siloGroup = parent.children[0] as T.Group;
  assert.ok(siloGroup instanceof T.Group);
  assert.equal(siloGroup.position.x, testX);
  assert.equal(siloGroup.position.z, testZ);

  const meshes: T.Mesh[] = [];
  siloGroup.traverse((obj) => {
    if (obj instanceof T.Mesh) {
      meshes.push(obj);
    }
  });

  // Verify mesh count (cylinder, dome, base ring, hoops, ladder rails, rungs, cage arches, blower pipe, cupola)
  assert.ok(
    meshes.length >= 25,
    `Expected at least 25 meshes in silo assembly, got ${meshes.length}`,
  );

  // Geometry checks
  const hasCylinder = meshes.some(
    (m) => m.geometry instanceof T.CylinderGeometry,
  );
  const hasSphere = meshes.some((m) => m.geometry instanceof T.SphereGeometry);
  const hasCone = meshes.some((m) => m.geometry instanceof T.ConeGeometry);
  assert.ok(hasCylinder, 'Silo should contain CylinderGeometry for main body');
  assert.ok(hasSphere, 'Silo should contain SphereGeometry for dome roof');
  assert.ok(hasCone, 'Silo cupola should contain ConeGeometry cap');

  // Materials check
  const usedMaterials = new Set(meshes.map((m) => m.material));
  assert.ok(usedMaterials.has(siloMat), 'Silo should utilize siloMat');
  assert.ok(usedMaterials.has(metalTrim), 'Silo should utilize metalTrim');
});

void test('buildEnhancedHouse constructs clapboard walls, roof overhangs, porch, and multi-pane windows', () => {
  const parent = new T.Group();
  const wallMat = new T.MeshStandardMaterial({ color: 0xf2efe9 });
  const roofMat = new T.MeshStandardMaterial({ color: 0xd5d2be });
  const glassMat = new T.MeshStandardMaterial({ color: 0x1b3246 });
  const whiteTrim = new T.MeshStandardMaterial({ color: 0xffffff });

  buildEnhancedHouse(parent, wallMat, roofMat, glassMat, whiteTrim);

  assert.equal(parent.children.length, 1);
  const houseGroup = parent.children[0] as T.Group;
  assert.ok(houseGroup instanceof T.Group);
  assert.equal(houseGroup.position.x, -36);
  assert.equal(houseGroup.position.z, 10);

  const meshes: T.Mesh[] = [];
  houseGroup.traverse((obj) => {
    if (obj instanceof T.Mesh) {
      meshes.push(obj);
    }
  });

  // Verify extensive mesh count (walls, foundation, corners, roof planes, eaves, porch deck/posts/roof, windows, sashes, door, chimney)
  assert.ok(
    meshes.length >= 35,
    `Expected at least 35 meshes in farmhouse assembly, got ${meshes.length}`,
  );

  // Verify all materials are utilized
  const usedMaterials = new Set(meshes.map((m) => m.material));
  assert.ok(usedMaterials.has(wallMat), 'House should utilize wallMat');
  assert.ok(usedMaterials.has(roofMat), 'House should utilize roofMat');
  assert.ok(usedMaterials.has(glassMat), 'House should utilize glassMat');
  assert.ok(usedMaterials.has(whiteTrim), 'House should utilize whiteTrim');

  // Verify multi-pane window glass panes are present
  const glassMeshes = meshes.filter((m) => m.material === glassMat);
  assert.ok(
    glassMeshes.length >= 6,
    `Expected at least 6 glass panes across windows, got ${glassMeshes.length}`,
  );

  // Verify pitched roof planes with slope rotation
  const roofMeshes = meshes.filter(
    (m) => m.material === roofMat && Math.abs(m.rotation.z) > 0.5,
  );
  assert.ok(
    roofMeshes.length >= 2,
    'House should contain dual sloping pitched roof planes',
  );
});
