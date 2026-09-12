import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {
  createCornPlantGeometry,
  createWheatPlantGeometry,
  createSoybeanPlantGeometry,
  createCropGeometry,
  createCropMaterial,
  CROP_CONFIG,
} from '../lib/fx/crop-models';

function validateGeometry(geom: T.BufferGeometry, name: string) {
  assert.ok(geom instanceof T.BufferGeometry, `${name} must be a BufferGeometry`);

  const pos = geom.getAttribute('position');
  assert.ok(pos, `${name} must have a position attribute`);
  assert.equal(pos.itemSize, 3, `${name} position itemSize must be 3`);
  assert.ok(pos.count > 0, `${name} position count must be > 0`);

  const norm = geom.getAttribute('normal');
  assert.ok(norm, `${name} must have a normal attribute`);
  assert.equal(norm.itemSize, 3, `${name} normal itemSize must be 3`);
  assert.equal(norm.count, pos.count, `${name} normal count must match position count`);

  // Check no NaN or infinite values in position or normal attributes
  for (let i = 0; i < pos.count * 3; i++) {
    assert.ok(
      Number.isFinite(pos.array[i]),
      `${name} position at index ${i} is not finite: ${pos.array[i]}`,
    );
    assert.ok(
      Number.isFinite(norm.array[i]),
      `${name} normal at index ${i} is not finite: ${norm.array[i]}`,
    );
  }

  assert.ok(geom.boundingBox, `${name} must have boundingBox computed`);
  assert.ok(geom.boundingSphere, `${name} must have boundingSphere computed`);
  assert.ok(geom.boundingSphere.radius > 0, `${name} boundingSphere radius must be > 0`);
}

void test('createCornPlantGeometry creates non-empty BufferGeometry with realistic botanical dimensions', () => {
  const corn = createCornPlantGeometry();
  validateGeometry(corn, 'corn');

  const bb = corn.boundingBox!;
  const height = bb.max.y - bb.min.y;
  const spreadX = bb.max.x - bb.min.x;
  const spreadZ = bb.max.z - bb.min.z;

  // Stalk reaches ~2.3m, apex tassel reaches up to ~2.5m
  assert.ok(height >= 2.2 && height <= 2.65, `Corn height should be ~2.3-2.5m, got ${height}`);
  // Arching leaves span ~1.2m to 1.8m horizontally
  assert.ok(spreadX >= 1.0 && spreadX <= 2.0, `Corn leaf spread X should be > 1m, got ${spreadX}`);
  assert.ok(spreadZ >= 1.0 && spreadZ <= 2.0, `Corn leaf spread Z should be > 1m, got ${spreadZ}`);
  // Base starts near ground level (y >= 0)
  assert.ok(bb.min.y >= -0.1 && bb.min.y <= 0.1, `Corn base should be at y=0, got ${bb.min.y}`);

  corn.dispose();
});

void test('createWheatPlantGeometry creates non-empty BufferGeometry with tillered stems and nodding heads', () => {
  const wheat = createWheatPlantGeometry();
  validateGeometry(wheat, 'wheat');

  const bb = wheat.boundingBox!;
  const height = bb.max.y - bb.min.y;
  const spreadX = bb.max.x - bb.min.x;
  const spreadZ = bb.max.z - bb.min.z;

  // Stem + nodding head + awns height ~0.95m - 1.25m
  assert.ok(height >= 0.9 && height <= 1.3, `Wheat height should be ~0.95-1.2m, got ${height}`);
  // Clump spread is slender (< 0.6m)
  assert.ok(spreadX > 0.1 && spreadX < 0.65, `Wheat spread X should be compact, got ${spreadX}`);
  assert.ok(spreadZ > 0.1 && spreadZ < 0.65, `Wheat spread Z should be compact, got ${spreadZ}`);
  assert.ok(bb.min.y >= -0.05 && bb.min.y <= 0.05, `Wheat base should be at y=0, got ${bb.min.y}`);

  wheat.dispose();
});

void test('createSoybeanPlantGeometry creates non-empty BufferGeometry with bushy legume dome canopy', () => {
  const soybean = createSoybeanPlantGeometry();
  validateGeometry(soybean, 'soybeans');

  const bb = soybean.boundingBox!;
  const height = bb.max.y - bb.min.y;
  const spreadX = bb.max.x - bb.min.x;
  const spreadZ = bb.max.z - bb.min.z;

  // Mound height ~0.75m
  assert.ok(height >= 0.65 && height <= 0.95, `Soybean height should be ~0.75m, got ${height}`);
  // Broad agricultural canopy mound spread ~1.2m - 1.6m
  assert.ok(spreadX >= 1.1 && spreadX <= 1.7, `Soybean spread X should be ~1.4m, got ${spreadX}`);
  assert.ok(spreadZ >= 1.1 && spreadZ <= 1.7, `Soybean spread Z should be ~1.4m, got ${spreadZ}`);
  assert.ok(bb.min.y >= -0.05 && bb.min.y <= 0.1, `Soybean base should be near y=0, got ${bb.min.y}`);

  soybean.dispose();
});

void test('createCropGeometry returns distinct geometries for corn, pasture, and soybeans', () => {
  const corn = createCropGeometry('corn');
  const pasture = createCropGeometry('pasture');
  const soybeans = createCropGeometry('soybeans');

  validateGeometry(corn, 'crop-corn');
  validateGeometry(pasture, 'crop-pasture');
  validateGeometry(soybeans, 'crop-soybeans');

  const countCorn = corn.getAttribute('position').count;
  const countPasture = pasture.getAttribute('position').count;
  const countSoybeans = soybeans.getAttribute('position').count;

  // Geometries must be distinct with different counts and proportions
  assert.notEqual(countCorn, countPasture);
  assert.notEqual(countCorn, countSoybeans);
  assert.notEqual(countPasture, countSoybeans);

  const heightCorn = corn.boundingBox!.max.y - corn.boundingBox!.min.y;
  const heightPasture = pasture.boundingBox!.max.y - pasture.boundingBox!.min.y;
  const heightSoybeans = soybeans.boundingBox!.max.y - soybeans.boundingBox!.min.y;

  // Corn tallest (> 2.2m), then Wheat/Pasture (~1m), Soybeans dome (~0.75m)
  assert.ok(heightCorn > heightPasture);
  assert.ok(heightPasture > heightSoybeans);

  corn.dispose();
  pasture.dispose();
  soybeans.dispose();
});

void test('createCropMaterial configures base colors, roughness, doubleSide, and cache key', () => {
  const windTime = { value: 1.0 };

  // 1. Corn
  const cornMat = createCropMaterial('corn', windTime);
  assert.ok(cornMat instanceof T.MeshStandardMaterial);
  assert.equal(cornMat.color.getHexString().toLowerCase(), '4f8a32');
  assert.equal(cornMat.roughness, 0.85);
  assert.equal(cornMat.side, T.DoubleSide);
  assert.equal(typeof cornMat.customProgramCacheKey, 'function');
  assert.equal(cornMat.customProgramCacheKey(), 'prairie-crop-model-v1-corn');

  // 2. Wheat / Pasture
  const pastureMat = createCropMaterial('pasture', windTime);
  assert.equal(pastureMat.color.getHexString().toLowerCase(), 'd1a842');
  assert.equal(pastureMat.roughness, 0.9);
  assert.equal(pastureMat.side, T.DoubleSide);
  assert.equal(pastureMat.customProgramCacheKey(), 'prairie-crop-model-v1-pasture');

  // 3. Soybeans
  const soyMat = createCropMaterial('soybeans', windTime);
  assert.equal(soyMat.color.getHexString().toLowerCase(), '397232');
  assert.equal(soyMat.roughness, 0.85);
  assert.equal(soyMat.side, T.DoubleSide);
  assert.equal(soyMat.customProgramCacheKey(), 'prairie-crop-model-v1-soybeans');

  // 4. Custom roughness and options override
  const customMat = createCropMaterial('corn', windTime, { roughness: 0.88 });
  assert.equal(customMat.roughness, 0.88);

  // 5. CROP_CONFIG constants
  assert.equal(CROP_CONFIG.corn.color, '#4f8a32');
  assert.equal(CROP_CONFIG.pasture.color, '#d1a842');
  assert.equal(CROP_CONFIG.soybeans.color, '#397232');
  assert.equal(CROP_CONFIG.corn.roughness, 0.85);
  assert.equal(CROP_CONFIG.pasture.roughness, 0.9);
  assert.equal(CROP_CONFIG.soybeans.roughness, 0.85);

  cornMat.dispose();
  pastureMat.dispose();
  soyMat.dispose();
  customMat.dispose();
});

void test('createCropMaterial onBeforeCompile attaches uniforms and injects vertex and fragment shaders', () => {
  const windTime = { value: 3.42 };
  const material = createCropMaterial('corn', windTime);

  const mockShader = {
    uniforms: {} as Record<string, T.IUniform>,
    vertexShader: `
      #include <common>
      void main() {
        #include <begin_vertex>
        #include <project_vertex>
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
  material.onBeforeCompile(
    mockShader as unknown as Parameters<NonNullable<T.MeshStandardMaterial['onBeforeCompile']>>[0],
    {} as unknown as T.WebGLRenderer,
  );

  // Uniform checks
  assert.equal(mockShader.uniforms.windTime, windTime);

  // Vertex shader checks
  assert.ok(mockShader.vertexShader.includes('varying float vPlantY;'));
  assert.ok(mockShader.vertexShader.includes('uniform float windTime;'));
  assert.ok(mockShader.vertexShader.includes('vPlantY = position.y;'));
  assert.ok(mockShader.vertexShader.includes('#ifdef USE_INSTANCING'));
  assert.ok(
    mockShader.vertexShader.includes(
      'float sway = sin(windTime * 2.2 + instanceMatrix[3].x * 0.045 + instanceMatrix[3].z * 0.035);',
    ),
  );
  assert.ok(
    mockShader.vertexShader.includes(
      'transformed.x += sway * position.y * position.y * 0.055;',
    ),
  );
  assert.ok(
    mockShader.vertexShader.includes(
      'transformed.z += cos(windTime * 1.8 + instanceMatrix[3].z * 0.04) * position.y * 0.025;',
    ),
  );

  // Fragment shader checks
  assert.ok(mockShader.fragmentShader.includes('varying float vPlantY;'));
  assert.ok(mockShader.fragmentShader.includes('uniform float windTime;'));
  assert.ok(
    mockShader.fragmentShader.includes(
      'float distanceFade = 1.0 - smoothstep(145.0, 210.0, length(vViewPosition));',
    ),
  );
  assert.ok(
    mockShader.fragmentShader.includes(
      'float screenDoor = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);',
    ),
  );
  assert.ok(
    mockShader.fragmentShader.includes('if (screenDoor > distanceFade) discard;'),
  );
  // Subtle vertical tonal gradient
  assert.ok(mockShader.fragmentShader.includes('vPlantY'));
  assert.ok(mockShader.fragmentShader.includes('goldenApex'));
  assert.ok(mockShader.fragmentShader.includes('diffuseColor.rgb'));

  material.dispose();
});
