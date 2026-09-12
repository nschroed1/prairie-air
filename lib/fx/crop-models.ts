import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Field } from '../simulation';

/**
 * Procedural botanical crop fidelity models for agricultural rendering in Prairie Air.
 * Generates low-poly, high-fidelity botanical geometries for corn, wheat (pasture),
 * and soybeans with custom wind swaying and screen-door distance fading shaders.
 */

export const CROP_CONFIG = {
  corn: { color: '#4f8a32', roughness: 0.85 },
  pasture: { color: '#d1a842', roughness: 0.9 },
  soybeans: { color: '#397232', roughness: 0.85 },
} as const;

/**
 * Creates an arching, drooping corn leaf ribbon geometry.
 *
 * @param length Leaf length outward from stem (0.6m - 0.9m)
 * @param droop Downward gravity droop curvature factor
 */
function createCornLeafRibbon(length: number, droop: number): T.BufferGeometry {
  const segments = 6;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let s = 0; s <= segments; s++) {
    const u = s / segments;
    const x = u * length;
    // Arch upward first, then droop realistically with gravity
    const y = Math.sin(u * Math.PI * 0.55) * 0.22 - u * u * droop;
    // Leaf profile: clasping stem width, expanding, then tapering to point
    const w = Math.max(0.012, (0.075 + 0.095 * Math.sin(u * Math.PI)) * (1.0 - 0.72 * u));
    const z = w * 0.5;

    positions.push(x, y, -z);
    positions.push(x, y, z);
    uvs.push(u, 0);
    uvs.push(u, 1);
  }

  for (let s = 0; s < segments; s++) {
    const v0 = s * 2;
    const v1 = s * 2 + 1;
    const v2 = (s + 1) * 2;
    const v3 = (s + 1) * 2 + 1;
    indices.push(v0, v1, v2);
    indices.push(v1, v3, v2);
  }

  const geom = new T.BufferGeometry();
  geom.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
  geom.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
  geom.setIndex(indices);
  geom.computeVertexNormals();
  return geom;
}

/**
 * Procedural Corn Plant (Zea mays):
 * - Stalk: Slender vertical cylinder (2.3m high, 0.08m radius).
 * - Leaves: 7 alternating arching leaves with realistic drooping curvature extending outward
 *   0.6m-0.9m at alternating heights (0.5m to 1.9m) and rotation angles (45°-60° apart).
 * - Tassel: Top crown of feathery silken tassel spikes at the apex (2.2m-2.5m).
 * - Merged into a single BufferGeometry with normals computed.
 */
export function createCornPlantGeometry(): T.BufferGeometry {
  const pieces: T.BufferGeometry[] = [];

  // 1. Stalk: Slender vertical cylinder (2.3m high, 0.08m radius)
  const stalkHeight = 2.3;
  const stalkRadius = 0.08;
  const stalk = new T.CylinderGeometry(stalkRadius * 0.9, stalkRadius, stalkHeight, 6, 2);
  stalk.translate(0, stalkHeight * 0.5, 0);
  pieces.push(stalk);

  // 2. Leaves: 7 alternating arching leaves with realistic drooping curvature (0.6m - 0.9m long)
  const leafHeights = [0.55, 0.75, 0.95, 1.15, 1.35, 1.58, 1.82];
  for (let i = 0; i < leafHeights.length; i++) {
    const angle = (i * 52 * Math.PI) / 180 + (i % 2 === 1 ? Math.PI : 0);
    // Mid-stalk leaves reach furthest outward
    const normalizedH = i / (leafHeights.length - 1);
    const leafLen = 0.64 + Math.sin(normalizedH * Math.PI) * 0.24; // 0.64m to 0.88m
    const droop = 0.38 + normalizedH * 0.12;

    const leaf = createCornLeafRibbon(leafLen, droop);
    leaf.rotateY(angle);
    leaf.translate(0, leafHeights[i], 0);
    pieces.push(leaf);
  }

  // 3. Tassel: Top crown of feathery silken tassel spikes at the apex (2.2m - 2.5m)
  // Central spike reaching up to 2.5m
  const centralSpike = new T.CylinderGeometry(0.003, 0.014, 0.28, 4, 1);
  centralSpike.translate(0, 2.36, 0);
  pieces.push(centralSpike);

  // Lateral feathery tassel spikes radiating outward
  const tasselBranches = 5;
  for (let k = 0; k < tasselBranches; k++) {
    const branchAngle = (k * 2 * Math.PI) / tasselBranches;
    const branch = new T.CylinderGeometry(0.002, 0.008, 0.22, 4, 1);
    branch.rotateZ(0.42); // ~24° outward tilt
    branch.rotateY(branchAngle);
    branch.translate(0, 2.31, 0);
    pieces.push(branch);
  }

  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Procedural Wheat / Small Grain (Triticum):
 * - Stems: Clump of 6-8 slender tillered grass stems (0.95m high, 0.02m radius) spreading slightly.
 * - Heads: Distinct nodding, tapered awned spike heads (bearded wheat grains) at top of each stem
 *   (0.18m long, angled slightly).
 * - Merged into a single BufferGeometry with normals computed.
 */
export function createWheatPlantGeometry(): T.BufferGeometry {
  const pieces: T.BufferGeometry[] = [];
  const stemCount = 7;
  const stemHeight = 0.95;
  const stemRadius = 0.018;
  const headLength = 0.18;

  for (let i = 0; i < stemCount; i++) {
    const azimuth = (i * 2 * Math.PI) / stemCount + (i * 0.15);
    // Outward tiller spread
    const tilt = 0.045 + (i % 3) * 0.025; // 2.5° to 5.5°

    // 1. Stem
    const stem = new T.CylinderGeometry(stemRadius * 0.85, stemRadius, stemHeight, 5, 1);
    stem.translate(0, stemHeight * 0.5, 0);
    stem.rotateZ(tilt);
    stem.rotateY(azimuth);
    pieces.push(stem);

    // Tip position of the stem
    const tipX = Math.sin(tilt) * stemHeight * Math.cos(azimuth);
    const tipY = Math.cos(tilt) * stemHeight;
    const tipZ = Math.sin(tilt) * stemHeight * Math.sin(azimuth);

    // 2. Nodding spike head (bearded wheat grain, 0.18m long, nodding outward)
    const nodAngle = tilt + 0.32; // ~18° additional nodding tilt under grain weight
    const head = new T.CylinderGeometry(0.018, 0.03, headLength, 5, 1);
    head.translate(0, headLength * 0.5, 0);
    head.rotateZ(nodAngle);
    head.rotateY(azimuth);
    head.translate(tipX, tipY, tipZ);
    pieces.push(head);

    // 3. Awns (bearded wheat bristles extending past the tip of the spike head)
    const headTipX = tipX + Math.sin(nodAngle) * headLength * Math.cos(azimuth);
    const headTipY = tipY + Math.cos(nodAngle) * headLength;
    const headTipZ = tipZ + Math.sin(nodAngle) * headLength * Math.sin(azimuth);

    for (let a = -1; a <= 1; a++) {
      const awnLen = 0.085;
      const awn = new T.CylinderGeometry(0.0015, 0.0035, awnLen, 3, 1);
      awn.translate(0, awnLen * 0.5, 0);
      awn.rotateZ(nodAngle + a * 0.1);
      awn.rotateY(azimuth);
      awn.translate(headTipX, headTipY, headTipZ);
      pieces.push(awn);
    }
  }

  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Creates a single trifoliate (3-leaf) rounded clover-like leaf cluster.
 */
function createTrifoliateLeafCluster(): T.BufferGeometry {
  const leaflets: T.BufferGeometry[] = [];
  const leafletRadius = 0.11;

  // 3 leaflets: 1 terminal leaflet and 2 lateral leaflets at ±55°
  const angles = [0, -0.95, 0.95];
  for (let i = 0; i < angles.length; i++) {
    const isTerminal = i === 0;
    const leaflet = new T.CircleGeometry(leafletRadius * (isTerminal ? 1.05 : 0.92), 6);
    // Scale into rounded ovate leaflet plane
    leaflet.scale(0.82, 1.25, 1.0);
    // Rotate to face outward/upward
    leaflet.rotateX(-Math.PI * 0.35);
    leaflet.rotateY(angles[i]);
    // Offset outward from petiole center
    const dist = isTerminal ? 0.12 : 0.095;
    leaflet.translate(Math.sin(angles[i]) * dist, isTerminal ? 0.025 : 0.0, Math.cos(angles[i]) * dist);
    leaflets.push(leaflet);
  }

  const merged = mergeGeometries(leaflets)!;
  leaflets.forEach((l) => l.dispose());
  return merged;
}

/**
 * Procedural Soybeans (Glycine max):
 * - Canopy: Bushy rounded legume canopy mound (0.75m high, 1.4m spread).
 * - Leaves: Multiple clusters of trifoliate (3-leaf) rounded clover-like leaf planes oriented outward
 *   forming a dense, bushy agricultural dome.
 * - Merged into a single BufferGeometry with normals computed.
 */
export function createSoybeanPlantGeometry(): T.BufferGeometry {
  const pieces: T.BufferGeometry[] = [];

  // Canopy mound parameters: height 0.75m, spread 1.4m (base radius 0.55m + outer leaflets = 0.70m)
  const canopyHeight = 0.75;
  const canopyRadius = 0.55;

  // Structural branching stems
  const stemRays = 4;
  for (let s = 0; s < stemRays; s++) {
    const stemAngle = (s * 2 * Math.PI) / stemRays + 0.3;
    const stem = new T.CylinderGeometry(0.014, 0.024, 0.45, 4, 1);
    stem.translate(0, 0.45 * 0.5, 0);
    stem.rotateZ(0.48);
    stem.rotateY(stemAngle);
    pieces.push(stem);
  }

  // Distribution rings of trifoliate leaf clusters covering the dome
  const rings = [
    { count: 8, elevationFrac: 0.28, radiusFrac: 0.95 },
    { count: 6, elevationFrac: 0.62, radiusFrac: 0.72 },
    { count: 3, elevationFrac: 0.88, radiusFrac: 0.38 },
  ];

  for (const ring of rings) {
    for (let c = 0; c < ring.count; c++) {
      const phi = (c * 2 * Math.PI) / ring.count + ring.elevationFrac * 1.5;
      const r = canopyRadius * ring.radiusFrac;
      const x = Math.cos(phi) * r;
      const z = Math.sin(phi) * r;
      const y = canopyHeight * ring.elevationFrac;

      const cluster = createTrifoliateLeafCluster();
      // Orient cluster outwards from mound center
      const yaw = Math.atan2(x, z);
      cluster.rotateY(yaw);
      cluster.translate(x, y, z);
      pieces.push(cluster);
    }
  }

  // Apex crown cluster at top of mound
  const apex = createTrifoliateLeafCluster();
  apex.rotateX(-0.1);
  apex.translate(0, canopyHeight, 0);
  pieces.push(apex);

  const merged = mergeGeometries(pieces)!;
  pieces.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Maps agricultural crop kind to its procedural botanical plant BufferGeometry.
 */
export function createCropGeometry(crop: Field['crop']): T.BufferGeometry {
  switch (crop) {
    case 'corn':
      return createCornPlantGeometry();
    case 'pasture':
      return createWheatPlantGeometry();
    case 'soybeans':
      return createSoybeanPlantGeometry();
    default: {
      const _exhaustiveCheck: never = crop;
      return createCornPlantGeometry();
    }
  }
}

/**
 * Creates high-fidelity botanical crop material with wind swaying,
 * screen-door distance fade, and height tonal gradient shaders.
 */
export function createCropMaterial(
  crop: Field['crop'],
  windTime: { value: number },
  options?: { roughness?: number; side?: T.Side },
): T.MeshStandardMaterial {
  const config = CROP_CONFIG[crop] ?? { color: '#4f8a32', roughness: 0.88 };
  const roughness = options?.roughness ?? config.roughness;
  const side = options?.side ?? T.DoubleSide;

  const material = new T.MeshStandardMaterial({
    color: new T.Color(config.color),
    roughness,
    side,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;

    shader.vertexShader =
      'varying float vPlantY;\nuniform float windTime;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vPlantY = position.y;
      #ifdef USE_INSTANCING
        float sway = sin(windTime * 2.2 + instanceMatrix[3].x * 0.045 + instanceMatrix[3].z * 0.035);
        transformed.x += sway * position.y * position.y * 0.055;
        transformed.z += cos(windTime * 1.8 + instanceMatrix[3].z * 0.04) * position.y * 0.025;
      #endif`,
    );

    shader.fragmentShader =
      'varying float vPlantY;\nuniform float windTime;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float distanceFade = 1.0 - smoothstep(145.0, 210.0, length(vViewPosition));
      float screenDoor = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      if (screenDoor > distanceFade) discard;

      // Subtle vertical tonal gradient based on vPlantY (tassels/wheat heads lighter golden, lower foliage richer green)
      float heightGradient = clamp(vPlantY / 2.3, 0.0, 1.0);
      vec3 goldenApex = vec3(0.92, 0.82, 0.48);
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.92, mix(diffuseColor.rgb, goldenApex, 0.32), heightGradient);`,
    );
  };

  material.customProgramCacheKey = () => 'prairie-crop-model-v1-' + crop;
  return material;
}
