import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  fields as defaultFields,
  ground as defaultGround,
  riverX as defaultRiverX,
} from '../simulation';
import { FARMSTEADS as defaultFarmsteads } from '../rural-life';

/**
 * Botanical species native to the Midwest and Great Plains prairie ecosystems.
 */
export type TreeType = 'cottonwood' | 'oak' | 'cedar' | 'willow';

export interface TreeSpeciesInfo {
  type: TreeType;
  commonName: string;
  botanicalName: string;
  minHeight: number;
  maxHeight: number;
  baseHeight: number;
  color: string;
  isConifer: boolean;
  roughness: number;
  description: string;
}

export const TREE_SPECIES_CONFIG: Record<TreeType, TreeSpeciesInfo> = {
  cottonwood: {
    type: 'cottonwood',
    commonName: 'Plains Cottonwood',
    botanicalName: 'Populus deltoides',
    minHeight: 16,
    maxHeight: 24,
    baseHeight: 20,
    color: '#5a8d3b',
    isConifer: false,
    roughness: 0.82,
    description:
      'Towering river valley giant with shimmering summer foliage and broad wind-swept silhouette',
  },
  oak: {
    type: 'oak',
    commonName: 'Bur Oak',
    botanicalName: 'Quercus macrocarpa',
    minHeight: 12,
    maxHeight: 18,
    baseHeight: 15,
    color: '#3b6e2e',
    isConifer: false,
    roughness: 0.86,
    description:
      'Mighty, stout gnarled trunk with rugged low branching and massive broad dome umbrella canopy',
  },
  cedar: {
    type: 'cedar',
    commonName: 'Eastern Redcedar',
    botanicalName: 'Juniperus virginiana',
    minHeight: 8,
    maxHeight: 15,
    baseHeight: 11.5,
    color: '#2c5a45',
    isConifer: true,
    roughness: 0.9,
    description:
      'Evergreen windbreak conifer with conical tiered crown layers and slender tapered profile',
  },
  willow: {
    type: 'willow',
    commonName: 'Prairie River Willow',
    botanicalName: 'Salix amygdaloides',
    minHeight: 10,
    maxHeight: 16,
    baseHeight: 13,
    color: '#78a342',
    isConifer: false,
    roughness: 0.8,
    description:
      'Graceful riparian tree along the river with drooping, pendulous cascading canopy lobes',
  },
};

/**
 * Deterministic pseudo-random generator with 32-bit linear congruential steps.
 */
function seeded(seed: number): () => number {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Procedural Geometry Generation
// ---------------------------------------------------------------------------

/**
 * Creates trunk geometry for Plains Cottonwood:
 * Tall, towering hardwood trunk with a flared root collar and ascending limbs.
 */
export function createCottonwoodTrunkGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Flared root collar at base
  const rootCollar = new T.CylinderGeometry(0.85, 1.5, 3.2, 8);
  rootCollar.translate(0, 1.6, 0);
  parts.push(rootCollar);

  // Main ascending bole
  const mainTrunk = new T.CylinderGeometry(0.46, 0.85, 10.0, 8);
  mainTrunk.translate(0, 8.0, 0);
  parts.push(mainTrunk);

  // High ascending primary scaffold limb 1
  const limb1 = new T.CylinderGeometry(0.22, 0.42, 5.0, 6);
  limb1.rotateZ(0.24);
  limb1.translate(0.65, 14.5, 0.2);
  parts.push(limb1);

  // High ascending scaffold limb 2
  const limb2 = new T.CylinderGeometry(0.2, 0.4, 4.6, 6);
  limb2.rotateZ(-0.22);
  limb2.rotateX(0.18);
  limb2.translate(-0.6, 14.2, -0.35);
  parts.push(limb2);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates tiered crown geometry for Plains Cottonwood:
 * Towering height (16-24m), spreading tiered crown lobes with broad wind-swept silhouette.
 */
export function createCottonwoodCrownGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Apex towering lobe
  const apex = new T.IcosahedronGeometry(4.2, 1);
  apex.scale(1.0, 1.06, 1.0);
  apex.translate(0, 18.0, 0);
  parts.push(apex);

  // Upper mid-tier spreading lobes
  const mid1 = new T.IcosahedronGeometry(3.8, 1);
  mid1.scale(1.1, 0.95, 1.05);
  mid1.translate(3.4, 15.0, 1.2);
  parts.push(mid1);

  const mid2 = new T.IcosahedronGeometry(3.6, 1);
  mid2.scale(1.05, 0.95, 1.1);
  mid2.translate(-3.2, 14.5, -1.5);
  parts.push(mid2);

  const mid3 = new T.IcosahedronGeometry(3.5, 1);
  mid3.scale(1.1, 0.9, 1.0);
  mid3.translate(0.8, 15.2, -3.4);
  parts.push(mid3);

  // Broad wind-swept lower tiered lobes
  const low1 = new T.IcosahedronGeometry(3.4, 1);
  low1.scale(1.15, 0.85, 1.0);
  low1.translate(-2.4, 11.5, 2.6);
  parts.push(low1);

  const low2 = new T.IcosahedronGeometry(3.2, 1);
  low2.scale(1.1, 0.85, 1.1);
  low2.translate(2.8, 12.0, -1.8);
  parts.push(low2);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates trunk geometry for Bur Oak:
 * Stout, mighty gnarled trunk with flared root collar and rugged low branching.
 */
export function createOakTrunkGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Massive flared root collar
  const rootCollar = new T.CylinderGeometry(1.15, 1.65, 2.2, 8);
  rootCollar.translate(0, 1.1, 0);
  parts.push(rootCollar);

  // Heavy gnarled bole
  const bole = new T.CylinderGeometry(0.85, 1.15, 4.2, 8);
  bole.translate(0, 4.0, 0);
  parts.push(bole);

  // Rugged low lateral limb 1
  const b1 = new T.CylinderGeometry(0.38, 0.72, 4.8, 6);
  b1.rotateZ(0.58);
  b1.translate(2.2, 6.0, 0.2);
  parts.push(b1);

  // Rugged low lateral limb 2
  const b2 = new T.CylinderGeometry(0.35, 0.68, 4.6, 6);
  b2.rotateZ(-0.55);
  b2.rotateX(0.32);
  b2.translate(-2.0, 5.8, 1.4);
  parts.push(b2);

  // Rugged low lateral limb 3
  const b3 = new T.CylinderGeometry(0.36, 0.7, 4.5, 6);
  b3.rotateX(-0.52);
  b3.rotateZ(-0.25);
  b3.translate(-0.8, 6.2, -2.1);
  parts.push(b3);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates crown geometry for Bur Oak:
 * Massive broad dome umbrella canopy (12-18m height, wide lateral spread).
 */
export function createOakCrownGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Center broad dome
  const centerDome = new T.IcosahedronGeometry(5.6, 1);
  centerDome.scale(1.25, 0.72, 1.25);
  centerDome.translate(0, 12.2, 0);
  parts.push(centerDome);

  // Broad umbrella perimeter lobes
  const p1 = new T.IcosahedronGeometry(4.2, 1);
  p1.scale(1.2, 0.75, 1.2);
  p1.translate(5.2, 10.0, 1.0);
  parts.push(p1);

  const p2 = new T.IcosahedronGeometry(4.1, 1);
  p2.scale(1.2, 0.75, 1.2);
  p2.translate(-5.0, 10.2, 1.8);
  parts.push(p2);

  const p3 = new T.IcosahedronGeometry(4.0, 1);
  p3.scale(1.2, 0.75, 1.2);
  p3.translate(1.8, 10.0, -5.2);
  parts.push(p3);

  const p4 = new T.IcosahedronGeometry(4.0, 1);
  p4.scale(1.2, 0.75, 1.2);
  p4.translate(-2.2, 9.8, -4.8);
  parts.push(p4);

  const p5 = new T.IcosahedronGeometry(3.9, 1);
  p5.scale(1.2, 0.75, 1.2);
  p5.translate(3.6, 9.5, 4.2);
  parts.push(p5);

  // Underbelly filler lobe bridging to low branches
  const under = new T.IcosahedronGeometry(3.6, 1);
  under.scale(1.1, 0.7, 1.1);
  under.translate(-1.0, 8.0, 0.5);
  parts.push(under);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates trunk geometry for Eastern Redcedar:
 * Slender tapered conifer trunk.
 */
export function createCedarTrunkGeometry(): T.BufferGeometry {
  const trunk = new T.CylinderGeometry(0.1, 0.42, 9.5, 6);
  trunk.translate(0, 4.75, 0);
  trunk.computeVertexNormals();
  trunk.computeBoundingBox();
  trunk.computeBoundingSphere();
  return trunk;
}

/**
 * Creates crown geometry for Eastern Redcedar:
 * Conical / pyramidal tiered evergreen crown layers (8-15m height, slender tapered profile).
 */
export function createCedarCrownGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Tier 1 (bottom skirt)
  const t1 = new T.ConeGeometry(2.6, 3.6, 7);
  t1.translate(0, 3.2, 0);
  parts.push(t1);

  // Tier 2
  const t2 = new T.ConeGeometry(2.1, 3.4, 7);
  t2.translate(0, 5.5, 0);
  parts.push(t2);

  // Tier 3
  const t3 = new T.ConeGeometry(1.6, 3.2, 7);
  t3.translate(0, 7.7, 0);
  parts.push(t3);

  // Tier 4
  const t4 = new T.ConeGeometry(1.1, 2.8, 7);
  t4.translate(0, 9.6, 0);
  parts.push(t4);

  // Tier 5 (apex spire)
  const t5 = new T.ConeGeometry(0.55, 2.4, 7);
  t5.translate(0, 11.2, 0);
  parts.push(t5);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates trunk geometry for Prairie River Willow:
 * Graceful leaning riparian trunk splitting into arching limbs.
 */
export function createWillowTrunkGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Main leaning trunk
  const lower = new T.CylinderGeometry(0.55, 0.78, 3.8, 7);
  lower.rotateZ(0.12);
  lower.translate(0.2, 1.9, 0);
  parts.push(lower);

  // Arching branch 1
  const w1 = new T.CylinderGeometry(0.22, 0.45, 4.4, 6);
  w1.rotateZ(0.42);
  w1.translate(1.4, 4.8, 0.4);
  parts.push(w1);

  // Arching branch 2
  const w2 = new T.CylinderGeometry(0.2, 0.42, 4.2, 6);
  w2.rotateZ(-0.38);
  w2.rotateX(0.28);
  w2.translate(-1.2, 4.7, 0.9);
  parts.push(w2);

  // Arching branch 3
  const w3 = new T.CylinderGeometry(0.2, 0.4, 4.0, 6);
  w3.rotateX(-0.4);
  w3.rotateZ(0.1);
  w3.translate(0.1, 4.9, -1.3);
  parts.push(w3);

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates crown geometry for Prairie River Willow:
 * Drooping, pendulous cascading canopy lobes along the river bank.
 */
export function createWillowCrownGeometry(): T.BufferGeometry {
  const parts: T.BufferGeometry[] = [];

  // Central arching dome
  const dome = new T.IcosahedronGeometry(4.2, 1);
  dome.scale(1.05, 0.85, 1.05);
  dome.translate(0, 11.2, 0);
  parts.push(dome);

  // Cascading pendulous weeping lobes hanging down
  const weepingOffsets: [number, number, number, number][] = [
    [3.8, 7.8, 0.8, 2.4],
    [-3.6, 7.6, 1.2, 2.3],
    [1.2, 7.9, -3.7, 2.4],
    [-2.0, 7.7, -3.2, 2.3],
    [2.7, 7.4, 3.0, 2.2],
    [-1.6, 7.5, 3.4, 2.2],
  ];

  for (const [ox, oy, oz, r] of weepingOffsets) {
    const lobe = new T.IcosahedronGeometry(r, 1);
    lobe.scale(0.9, 1.75, 0.9);
    lobe.translate(ox, oy, oz);
    parts.push(lobe);
  }

  const merged = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  if (!merged) return new T.BufferGeometry();

  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates the procedural trunk geometry for the given species.
 */
export function createTreeTrunkGeometry(species: TreeType): T.BufferGeometry {
  switch (species) {
    case 'cottonwood':
      return createCottonwoodTrunkGeometry();
    case 'oak':
      return createOakTrunkGeometry();
    case 'cedar':
      return createCedarTrunkGeometry();
    case 'willow':
      return createWillowTrunkGeometry();
  }
}

/**
 * Creates the procedural crown geometry for the given species.
 */
export function createTreeCrownGeometry(species: TreeType): T.BufferGeometry {
  switch (species) {
    case 'cottonwood':
      return createCottonwoodCrownGeometry();
    case 'oak':
      return createOakCrownGeometry();
    case 'cedar':
      return createCedarCrownGeometry();
    case 'willow':
      return createWillowCrownGeometry();
  }
}

/**
 * Convenience helper to merge trunk and crown into a single geometry.
 */
export function createFullTreeGeometry(species: TreeType): T.BufferGeometry {
  const trunk = createTreeTrunkGeometry(species);
  const crown = createTreeCrownGeometry(species);
  const tNonIndexed = trunk.index ? trunk.toNonIndexed() : trunk.clone();
  const cNonIndexed = crown.index ? crown.toNonIndexed() : crown.clone();
  trunk.dispose();
  crown.dispose();
  const merged = mergeGeometries([tNonIndexed, cNonIndexed]);
  tNonIndexed.dispose();
  cNonIndexed.dispose();
  if (!merged) return new T.BufferGeometry();
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ---------------------------------------------------------------------------
// Tree Materials & Custom Shaders
// ---------------------------------------------------------------------------

/**
 * Creates standard material for tree crowns with animated wind sway,
 * subsurface light scattering, and crown volume ambient occlusion.
 */
export function createTreeCrownMaterial(
  windTime: { value: number },
  sunDir?: T.Vector3,
  options?: T.MeshStandardMaterialParameters,
): T.MeshStandardMaterial {
  const sunDirection = sunDir
    ? sunDir.clone().normalize()
    : new T.Vector3(0.5, 0.8, 0.3).normalize();
  const sunUniform = { value: sunDirection };

  const material = new T.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.84,
    metalness: 0.05,
    side: T.DoubleSide,
    ...options,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.uniforms.sunDirection = sunUniform;

    // Inject varyings and uniforms into vertex shader
    shader.vertexShader =
      'varying vec3 vWorldPosition;\n' +
      'varying vec3 vWorldNormal;\n' +
      'varying float vTreeHeight;\n' +
      'uniform float windTime;\n' +
      shader.vertexShader;

    // Foliage wind sway vertex displacement (y^2 displacement driven by branch height)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float branchHeight = max(0.0, position.y);
      vTreeHeight = branchHeight;

      #ifdef USE_INSTANCING
        vec3 worldBase = vec3(instanceMatrix[3].x, instanceMatrix[3].y, instanceMatrix[3].z);
        vWorldPosition = (modelMatrix * (instanceMatrix * vec4(position, 1.0))).xyz;
        vWorldNormal = normalize((modelMatrix * (instanceMatrix * vec4(normal, 0.0))).xyz);
      #else
        vec3 worldBase = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      #endif

      // Traveling prairie wind gust wave across world coordinates
      float gustPhase = windTime * 2.1 + worldBase.x * 0.032 + worldBase.z * 0.024;
      float gustWave = sin(gustPhase);
      float flutter = sin(windTime * 4.8 + position.x * 1.5 + position.z * 1.5) * 0.22;

      // y^2 displacement: higher canopy lobes sway significantly more than lower branches
      float swayScale = (branchHeight * branchHeight) * 0.0035;
      float totalSway = (gustWave + flutter) * swayScale;

      transformed.x += totalSway * 0.72;
      transformed.z += totalSway * 0.48;
      transformed.y += sin(gustPhase * 1.5) * swayScale * 0.12;`,
    );

    // Inject varyings and uniforms into fragment shader
    shader.fragmentShader =
      'varying vec3 vWorldPosition;\n' +
      'varying vec3 vWorldNormal;\n' +
      'varying float vTreeHeight;\n' +
      'uniform float windTime;\n' +
      'uniform vec3 sunDirection;\n' +
      shader.fragmentShader;

    // Inject crown volume AO and subsurface scattering into fragment shader
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Normal-based ambient occlusion / crown volume shading:
      // Darker interior shadowed underbelly, sunlit luminous upper crown
      vec3 norm = normalize(vWorldNormal);
      float underbellyAO = smoothstep(-0.85, 0.45, norm.y);
      float crownVolumeAO = mix(0.55, 1.08, underbellyAO);
      diffuseColor.rgb *= crownVolumeAO;

      // Sunlit upper crown illumination
      vec3 sunDirNorm = normalize(sunDirection);
      float sunFacing = max(0.0, dot(norm, sunDirNorm));
      diffuseColor.rgb += diffuseColor.rgb * vec3(0.18, 0.22, 0.08) * sunFacing * 0.35;

      // Subsurface light scattering / leaf translucency:
      // When back-lit by the sun, crowns glow with warm leaf transmittance
      vec3 viewDir = normalize(cameraPosition - vWorldPosition);
      float sssFactor = pow(max(0.0, dot(viewDir, -sunDirNorm)), 3.0);
      float canopyTransmittance = sssFactor * (0.35 + 0.65 * max(0.0, norm.y));
      vec3 warmLeafTransmittance = vec3(0.85, 0.92, 0.30) * canopyTransmittance * 0.45;
      diffuseColor.rgb += warmLeafTransmittance * diffuseColor.rgb * 1.8;`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-tree-crown-v1';
  return material;
}

/**
 * Creates rough bark material for tree trunks with vertical bark furrow fissures.
 */
export function createTreeTrunkMaterial(
  options?: T.MeshStandardMaterialParameters,
): T.MeshStandardMaterial {
  const material = new T.MeshStandardMaterial({
    color: '#5c4d3c',
    roughness: 0.92,
    metalness: 0.04,
    ...options,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'varying vec3 vTrunkPos;\n' +
      'varying vec3 vTrunkNormal;\n' +
      shader.vertexShader;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vTrunkPos = position;
      vTrunkNormal = normal;`,
    );

    shader.fragmentShader =
      'varying vec3 vTrunkPos;\n' +
      'varying vec3 vTrunkNormal;\n' +
      shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      // Vertical bark furrow fissures in fragment shader, rough bark aesthetic (#544633 to #6b5c47)
      float barkAngle = atan(vTrunkPos.x, vTrunkPos.z);
      float furrowMain = sin(barkAngle * 12.0 + sin(vTrunkPos.y * 2.8) * 1.6);
      float furrowFine = sin(barkAngle * 24.0 + vTrunkPos.y * 6.5) * 0.5 + 0.5;
      float fissureFactor = smoothstep(-0.25, 0.55, furrowMain * 0.65 + furrowFine * 0.35);

      vec3 barkFurrow = vec3(0.329, 0.275, 0.200); // #544633 deep fissure
      vec3 barkRidge = vec3(0.420, 0.361, 0.278);  // #6b5c47 weathered outer bark
      vec3 barkColor = mix(barkFurrow, barkRidge, fissureFactor);

      // Vertical weathering bands and roughness variation
      float ringMottling = sin(vTrunkPos.y * 1.6 + barkAngle * 2.0) * 0.035;
      diffuseColor.rgb = barkColor + ringMottling;`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-tree-trunk-v1';
  return material;
}

// ---------------------------------------------------------------------------
// TreeSystem Ecosystem & Placement
// ---------------------------------------------------------------------------

export interface TreeInstanceData {
  species: TreeType;
  x: number;
  y: number;
  z: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  angle: number;
  tiltX: number;
  tiltZ: number;
  color: T.Color;
}

export interface TreeSystemOptions {
  scene?: T.Scene;
  windTime?: { value: number };
  sunDir?: T.Vector3;
  seed?: number;
  count?: number;
  groundFn?: (x: number, z: number) => number;
  riverXFn?: (z: number) => number;
  fields?: ReadonlyArray<{
    x: number;
    z: number;
    boundary: ReadonlyArray<{ x: number; z: number }>;
  }>;
  farmsteads?: ReadonlyArray<readonly [number, number]>;
}

export class TreeSystem {
  group = new T.Group();
  trunkMaterial: T.MeshStandardMaterial;
  crownMaterial: T.MeshStandardMaterial;
  crownMaterials: T.MeshStandardMaterial[] = [];

  trunkMeshes = new Map<TreeType, T.InstancedMesh>();
  crownMeshes = new Map<TreeType, T.InstancedMesh>();

  speciesCounts: Record<TreeType, number> = {
    cottonwood: 0,
    oak: 0,
    cedar: 0,
    willow: 0,
  };

  totalTrees = 0;
  windTime: { value: number };
  sunDir?: T.Vector3;

  private scene?: T.Scene;
  private disposed = false;
  private instances: TreeInstanceData[] = [];

  constructor(
    sceneOrOptions?: T.Scene | TreeSystemOptions,
    maybeOptions?: TreeSystemOptions,
  ) {
    let scene: T.Scene | undefined;
    let opts: TreeSystemOptions;
    if (sceneOrOptions instanceof T.Scene) {
      scene = sceneOrOptions;
      opts = maybeOptions ?? {};
    } else {
      opts = sceneOrOptions ?? {};
      scene = opts.scene;
    }
    this.scene = scene;

    this.windTime = opts.windTime ?? { value: 0 };
    this.sunDir = opts.sunDir;

    // Materials
    this.trunkMaterial = createTreeTrunkMaterial();
    this.crownMaterial = createTreeCrownMaterial(this.windTime, this.sunDir);
    this.crownMaterials.push(this.crownMaterial);

    const count = opts.count ?? 2000;
    const seed = opts.seed ?? 621;
    const groundFn = opts.groundFn ?? defaultGround;
    const riverXFn = opts.riverXFn ?? defaultRiverX;
    const fieldList = opts.fields ?? defaultFields;
    const farmsteadList = opts.farmsteads ?? defaultFarmsteads;

    this.generateEcosystem(
      count,
      seed,
      groundFn,
      riverXFn,
      fieldList,
      farmsteadList,
    );
    this.buildInstancedMeshes();

    if (this.scene) {
      this.scene.add(this.group);
    }
  }

  /**
   * Distributes trees across prairie ecological zones:
   * 1. Riparian corridor along the river (cottonwoods & willows)
   * 2. Field hedgerows, shelterbelts, and windbreaks (bur oaks & redcedars)
   * 3. Farmstead clearing perimeter shade trees (bur oaks, cottonwoods, redcedars)
   */
  private generateEcosystem(
    totalCount: number,
    seed: number,
    groundFn: (x: number, z: number) => number,
    riverXFn: (z: number) => number,
    fieldList: ReadonlyArray<{
      x: number;
      z: number;
      boundary: ReadonlyArray<{ x: number; z: number }>;
    }>,
    farmsteadList: ReadonlyArray<readonly [number, number]>,
  ): void {
    const rand = seeded(seed);
    const riparianTarget = Math.floor(totalCount * 0.42);
    const windbreakTarget = Math.floor(totalCount * 0.54);
    const farmsteadTarget = totalCount - riparianTarget - windbreakTarget;

    // 1. Riparian zone near river
    for (let i = 0; i < riparianTarget; i++) {
      const z = (rand() - 0.5) * 7400;
      const rx = riverXFn(z);
      const side = rand() > 0.5 ? 1 : -1;
      const distFromRiver = 58 + rand() * 88;
      const x = rx + side * distFromRiver;

      // Willows cling to immediate water's edge, Cottonwoods dominate broader floodplain
      const species: TreeType =
        distFromRiver < 85
          ? rand() < 0.62
            ? 'willow'
            : 'cottonwood'
          : rand() < 0.76
            ? 'cottonwood'
            : 'willow';

      this.addTreeInstance(species, x, z, rand, groundFn);
    }

    // 2. Field boundaries, shelterbelts, and hedgerows
    if (fieldList.length > 0) {
      for (let i = 0; i < windbreakTarget; i++) {
        const field = fieldList[Math.floor(rand() * fieldList.length)];
        const boundary = field.boundary;
        if (!boundary || boundary.length < 2) continue;

        const edgeIdx = Math.floor(rand() * boundary.length);
        const a = boundary[edgeIdx];
        const b = boundary[(edgeIdx + 1) % boundary.length];

        const t = rand();
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const edgeLen = Math.hypot(dx, dz);
        if (edgeLen < 1) continue;

        // Position along edge with outward offset for windbreak hedgerow
        const outwardOffset = 8 + rand() * 7;
        const normalX = (dz / edgeLen) * outwardOffset;
        const normalZ = (-dx / edgeLen) * outwardOffset;

        const x = field.x + a.x + dx * t + normalX;
        const z = field.z + a.z + dz * t + normalZ;

        // Shelterbelts: Eastern Redcedars provide dense evergreen barrier; Bur Oaks stand sturdy
        const species: TreeType = rand() < 0.58 ? 'cedar' : 'oak';
        this.addTreeInstance(species, x, z, rand, groundFn);
      }
    }

    // 3. Farmstead clearing perimeter shade trees
    if (farmsteadList.length > 0) {
      for (let i = 0; i < farmsteadTarget; i++) {
        const farmstead =
          farmsteadList[Math.floor(rand() * farmsteadList.length)];
        const fx = farmstead[0];
        const fz = farmstead[1];

        // Perimeter shelterbelt behind the homestead (outside the central yard so barns and houses remain prominently visible)
        const angle = rand() * Math.PI * 2;
        const radius = 65 + rand() * 32;
        const x = fx + Math.cos(angle) * radius;
        const z = fz + Math.sin(angle) * radius;

        // Homestead species: Bur Oak shade trees, tall Cottonwoods, evergreen Redcedars
        const roll = rand();
        const species: TreeType =
          roll < 0.52 ? 'oak' : roll < 0.82 ? 'cottonwood' : 'cedar';

        this.addTreeInstance(species, x, z, rand, groundFn);
      }
    }
  }

  private addTreeInstance(
    species: TreeType,
    x: number,
    z: number,
    rand: () => number,
    groundFn: (x: number, z: number) => number,
  ): void {
    const config = TREE_SPECIES_CONFIG[species];
    const height =
      config.minHeight + rand() * (config.maxHeight - config.minHeight);
    const scale = height / config.baseHeight;

    const groundY = groundFn(x, z);
    const angle = rand() * Math.PI * 2;
    const tiltX = (rand() - 0.5) * 0.08;
    const tiltZ = (rand() - 0.5) * 0.08;
    const spreadScale = scale * (0.92 + rand() * 0.16);

    // Natural chromatic variation around species foliage base color
    const baseColor = new T.Color(config.color);
    const hsl = { h: 0, s: 0, l: 0 };
    baseColor.getHSL(hsl);
    const treeColor = new T.Color().setHSL(
      hsl.h + (rand() - 0.5) * 0.04,
      Math.min(1.0, Math.max(0.15, hsl.s * (0.88 + rand() * 0.24))),
      Math.min(1.0, Math.max(0.15, hsl.l * (0.88 + rand() * 0.24))),
    );

    this.instances.push({
      species,
      x,
      y: groundY,
      z,
      scaleX: spreadScale,
      scaleY: scale,
      scaleZ: spreadScale,
      angle,
      tiltX,
      tiltZ,
      color: treeColor,
    });

    this.speciesCounts[species]++;
    this.totalTrees++;
  }

  private buildInstancedMeshes(): void {
    const dummy = new T.Object3D();
    const speciesList: TreeType[] = ['cottonwood', 'oak', 'cedar', 'willow'];

    for (const species of speciesList) {
      const count = this.speciesCounts[species];
      if (count === 0) continue;

      const trunkGeom = createTreeTrunkGeometry(species);
      const crownGeom = createTreeCrownGeometry(species);

      const trunkMesh = new T.InstancedMesh(
        trunkGeom,
        this.trunkMaterial,
        count,
      );
      const crownMesh = new T.InstancedMesh(
        crownGeom,
        this.crownMaterial,
        count,
      );

      trunkMesh.castShadow = true;
      crownMesh.castShadow = true;
      crownMesh.receiveShadow = true;

      const speciesInstances = this.instances.filter(
        (inst) => inst.species === species,
      );

      for (let i = 0; i < speciesInstances.length; i++) {
        const inst = speciesInstances[i];
        dummy.position.set(inst.x, inst.y, inst.z);
        dummy.rotation.set(inst.tiltX, inst.angle, inst.tiltZ);
        dummy.scale.set(inst.scaleX, inst.scaleY, inst.scaleZ);
        dummy.updateMatrix();

        trunkMesh.setMatrixAt(i, dummy.matrix);
        crownMesh.setMatrixAt(i, dummy.matrix);
        crownMesh.setColorAt(i, inst.color);
      }

      trunkMesh.instanceMatrix.needsUpdate = true;
      crownMesh.instanceMatrix.needsUpdate = true;
      if (crownMesh.instanceColor) {
        crownMesh.instanceColor.needsUpdate = true;
      }

      this.trunkMeshes.set(species, trunkMesh);
      this.crownMeshes.set(species, crownMesh);

      this.group.add(trunkMesh);
      this.group.add(crownMesh);
    }
  }

  /**
   * Updates wind animation and time uniform for canopy sway.
   */
  update(_dt: number, time: number): void {
    if (this.disposed) return;
    this.windTime.value = time;
  }

  /**
   * Disposes of all geometry buffers, materials, and removes meshes from scene.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const [, mesh] of this.trunkMeshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    for (const [, mesh] of this.crownMeshes) {
      mesh.geometry.dispose();
      this.group.remove(mesh);
    }
    this.trunkMeshes.clear();
    this.crownMeshes.clear();

    this.trunkMaterial.dispose();
    this.crownMaterial.dispose();
    this.crownMaterials = [];

    if (this.scene) {
      this.scene.remove(this.group);
    }
    this.instances = [];
    this.totalTrees = 0;
    this.speciesCounts = {
      cottonwood: 0,
      oak: 0,
      cedar: 0,
      willow: 0,
    };
  }

  /**
   * Returns generated tree instances for inspection or testing.
   */
  getInstances(): ReadonlyArray<TreeInstanceData> {
    return this.instances;
  }

  getSpeciesCount(type: TreeType): number {
    return this.speciesCounts[type];
  }
}
