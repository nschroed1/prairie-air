import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Weather } from '../weather';

/**
 * Cloud layer configurations & altitudes:
 * - Squall Line (Shelf Cloud / Gust Front): Low ragged shelf lip at 220m-380m AGL, towering anvil to 3,200m
 * - Stratus / Stratocumulus: Low-to-mid undulating blanket rolls at 480m-760m AGL
 * - Cumulus: Fair-weather flat-base cauliflower domes at 720m-1,200m AGL
 * - Cirrus: High-altitude feathery ice-crystal wisps at 4,200m-6,500m AGL
 */

export const CUMULUS_COUNT = 320;
export const STRATUS_COUNT = 96;
export const CIRRUS_COUNT = 64;
export const SQUALL_SEGMENTS = 72;

/**
 * Creates a flat-bottomed cumulus puff geometry.
 * Truncates the lower hemisphere at y = 0 to establish the authentic
 * atmospheric lifting condensation level (LCL) flat base.
 */
export function createCumulusPuffGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // Central main dome (radius 1.0, base at y = 0)
  const mainDome = new T.SphereGeometry(1.0, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.5);
  mainDome.scale(1.4, 0.95, 1.2);
  geometries.push(mainDome);

  // Flanking billow lobes around perimeter
  const lobeOffsets = [
    [-0.65, 0.15, -0.45, 0.72],
    [0.70, 0.12, -0.40, 0.76],
    [-0.55, 0.10, 0.60, 0.68],
    [0.60, 0.18, 0.55, 0.74],
    [0.05, 0.35, -0.65, 0.82],
    [-0.05, 0.30, 0.62, 0.80],
  ];

  for (const [lx, ly, lz, lr] of lobeOffsets) {
    const lobe = new T.SphereGeometry(lr, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
    lobe.translate(lx, ly, lz);
    geometries.push(lobe);
  }

  // Flat base sealing plate
  const baseDisk = new T.CircleGeometry(1.45, 12);
  baseDisk.rotateX(Math.PI / 2);
  baseDisk.translate(0, 0.0, 0);
  geometries.push(baseDisk);

  const merged = mergeGeometries(geometries);
  // Ensure perfectly flat base at y = 0
  const pos = merged.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < 0) {
      pos.setY(i, 0);
    }
  }
  merged.computeVertexNormals();
  mainDome.dispose();
  baseDisk.dispose();
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

/**
 * Creates a broad, flattened stratus blanket sheet geometry.
 */
export function createStratusSheetGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // Flattened horizontal ellipsoid disk
  const sheet = new T.SphereGeometry(1.0, 12, 6);
  sheet.scale(4.8, 0.42, 3.2);
  geometries.push(sheet);

  // Soft edge rim
  const edge = new T.SphereGeometry(0.85, 10, 6);
  edge.scale(4.2, 0.35, 2.8);
  edge.translate(0.6, 0.05, -0.4);
  geometries.push(edge);

  const merged = mergeGeometries(geometries);
  sheet.dispose();
  edge.dispose();
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

/**
 * Creates a high-altitude wispy cirrus streak geometry.
 */
export function createCirrusStreakGeometry(): T.BufferGeometry {
  const geom = new T.PlaneGeometry(16.0, 4.2, 6, 2);
  geom.rotateX(-Math.PI / 2);
  // Subtle curved sweep along plane
  const pos = geom.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setZ(i, z + Math.sin(x * 0.18) * 1.6);
  }
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates the dark shelf cloud roll segment geometry for the incoming squall line.
 * Features a menacing, turbulent low-hanging roll lip and towering anvil wall.
 */
export function createSquallRollGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // 1. Menacing lower shelf cloud roll lip (hanging low toward prairie floor)
  const shelfLip = new T.CylinderGeometry(0.9, 1.3, 3.8, 10);
  shelfLip.rotateZ(Math.PI / 2);
  shelfLip.scale(1.6, 0.85, 2.2);
  shelfLip.translate(0, 0.4, 1.2);
  geometries.push(shelfLip);

  // 2. Turbulent billow lobes along the shelf edge
  const lobes = [
    [-1.4, 0.3, 1.8, 1.1],
    [0.0, 0.45, 2.1, 1.35],
    [1.5, 0.25, 1.7, 1.05],
    [-0.8, -0.15, 2.4, 0.95],
    [0.9, -0.2, 2.3, 0.92],
  ];

  for (const [lx, ly, lz, lr] of lobes) {
    const lobe = new T.SphereGeometry(lr, 8, 6);
    lobe.scale(1.2, 0.75, 1.0);
    lobe.translate(lx, ly, lz);
    geometries.push(lobe);
  }

  // 3. Towering vertical storm anvil column rising behind the shelf
  const anvilColumn = new T.BoxGeometry(3.6, 8.5, 4.2);
  anvilColumn.translate(0, 4.2, -1.2);
  geometries.push(anvilColumn);

  // 4. Broad spreading anvil top
  const anvilTop = new T.CylinderGeometry(3.4, 2.2, 2.4, 8);
  anvilTop.scale(1.4, 0.6, 1.8);
  anvilTop.translate(0, 8.8, -1.8);
  geometries.push(anvilTop);

  const merged = mergeGeometries(geometries);
  shelfLip.dispose();
  anvilColumn.dispose();
  anvilTop.dispose();
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

/**
 * Creates trailing virga / heavy precipitation curtain mesh for the squall line.
 */
export function createVirgaCurtainGeometry(): T.BufferGeometry {
  const plane = new T.PlaneGeometry(4.5, 7.5, 4, 4);
  plane.translate(0, -3.75, -2.5);
  return plane;
}

/**
 * Creates custom procedural material for flat-bottomed cumulus clouds.
 * Injects volumetric height gradient (dark slate underside -> sunlit crest)
 * and forward Mie scattering silver lining.
 */
export function createCumulusMaterial(sunDirUniform: { value: T.Vector3 }): T.MeshStandardMaterial {
  const mat = new T.MeshStandardMaterial({
    color: '#f5f2e8',
    roughness: 0.95,
    metalness: 0.02,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunDirUniform;

    shader.vertexShader = `
      varying float vCumulusY;
      varying vec3 vWorldNormal;
      varying vec3 vViewVec;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vCumulusY = position.y;
      vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
      vec4 worldPos = modelMatrix * vec4(position, 1.0);
      vViewVec = normalize(cameraPosition - worldPos.xyz);
      `,
    );

    shader.fragmentShader = `
      uniform vec3 uSunDir;
      varying float vCumulusY;
      varying vec3 vWorldNormal;
      varying vec3 vViewVec;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      // Volumetric height gradient: Flat base shadow vs sunlit dome
      // Lower base is inky slate/indigo, top dome is sun-drenched warm white
      float heightGradient = smoothstep(-0.05, 0.95, vCumulusY);
      vec3 baseShade = vec3(0.52, 0.58, 0.66);
      vec3 crestShade = vec3(1.0, 0.98, 0.94);
      diffuseColor.rgb *= mix(baseShade, crestShade, heightGradient);

      // Forward Mie Scattering ("Silver Lining"): Glancing sunlight rim when facing sun
      float sunDot = max(0.0, dot(vViewVec, uSunDir));
      float rim = pow(sunDot, 3.8) * (1.0 - abs(vWorldNormal.y) * 0.65);
      diffuseColor.rgb += vec3(0.95, 0.88, 0.72) * rim * 0.48;
      `,
    );
  };

  mat.customProgramCacheKey = () => 'prairie-cumulus-realistic-v3';
  return mat;
}

/**
 * Creates custom procedural material for low/mid stratus blanket sheets.
 */
export function createStratusMaterial(): T.MeshStandardMaterial {
  const mat = new T.MeshStandardMaterial({
    color: '#abbdc6',
    roughness: 1.0,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      varying vec3 vWorldStratus;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vWorldStratus = (modelMatrix * vec4(position, 1.0)).xyz;
      `,
    );

    shader.fragmentShader = `
      varying vec3 vWorldStratus;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Undulating soft overcast density ripples
      float ripple = sin(vWorldStratus.x * 0.003) * cos(vWorldStratus.z * 0.003) * 0.12;
      diffuseColor.rgb *= 0.94 + ripple;
      `,
    );
  };

  mat.customProgramCacheKey = () => 'prairie-stratus-realistic-v1';
  return mat;
}

/**
 * Creates material for high-altitude feathery cirrus wisps.
 */
export function createCirrusMaterial(sunDirUniform: { value: T.Vector3 }): T.MeshBasicMaterial {
  const mat = new T.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.NormalBlending,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uSunDir = sunDirUniform;

    shader.fragmentShader = `
      uniform vec3 uSunDir;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Warm golden/pink tint when sun is near horizon
      float sunsetWarmth = max(0.0, 1.0 - uSunDir.y * 2.5);
      vec3 warmCirrus = mix(vec3(1.0), vec3(1.0, 0.82, 0.74), sunsetWarmth);
      diffuseColor.rgb *= warmCirrus;
      `,
    );
  };

  mat.customProgramCacheKey = () => 'prairie-cirrus-v1';
  return mat;
}

/**
 * Creates custom material for the menacing dark squall line ("Impending Doom").
 * Features inky storm-charcoal palette with bruised greenish-teal hail undertones
 * and internal sheet lightning illumination pulses.
 */
export function createSquallMaterial(lightningUniform: { value: number }): T.MeshStandardMaterial {
  const mat = new T.MeshStandardMaterial({
    color: '#1a222a',
    roughness: 0.88,
    metalness: 0.08,
  });

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLightning = lightningUniform;

    shader.vertexShader = `
      varying float vSquallY;
      varying vec3 vSquallWorld;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vSquallY = position.y;
      vSquallWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      `,
    );

    shader.fragmentShader = `
      uniform float uLightning;
      varying float vSquallY;
      varying vec3 vSquallWorld;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>

      // Bruised severe storm palette:
      // Dark underbelly shelf lip is inky charcoal (#12171e) with greenish hail tint
      // Upper anvil is brooding dark slate (#26313d)
      float yGrad = clamp(vSquallY / 8.5, 0.0, 1.0);
      vec3 rollBase = vec3(0.09, 0.12, 0.14); // Inky shelf lip
      vec3 hailGreen = vec3(0.11, 0.17, 0.15); // Severe prairie hail-core green
      vec3 anvilTop = vec3(0.24, 0.29, 0.35); // Upper anvil wall

      vec3 stormColor = mix(mix(rollBase, hailGreen, 0.42), anvilTop, yGrad);

      // Turbulent shelf edge billow mottling
      float mottle = sin(vSquallWorld.x * 0.008) * cos(vSquallWorld.y * 0.006) * 0.08;
      stormColor *= 1.0 + mottle;

      // Internal Sheet Lightning Flash:
      // Illuminates cloud interior with brilliant cold blue-white light
      vec3 lightningColor = vec3(0.88, 0.94, 1.0);
      stormColor = mix(stormColor, lightningColor, uLightning * 0.92);

      diffuseColor.rgb = stormColor;
      `,
    );
  };

  mat.customProgramCacheKey = () => 'prairie-squall-doom-v2';
  return mat;
}

/**
 * Creates virga rain curtain material cascading beneath the squall line.
 */
export function createVirgaMaterial(): T.MeshBasicMaterial {
  return new T.MeshBasicMaterial({
    color: '#151d24',
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    side: T.DoubleSide,
  });
}

/**
 * CloudSystem manages all realistic meteorological cloud layers and the
 * dark incoming squall line ("Impending Doom").
 */
export class CloudSystem {
  group = new T.Group();
  squallGroup = new T.Group();
  cumulusGroup = new T.Group();
  stratusGroup = new T.Group();
  cirrusGroup = new T.Group();

  cumulusMesh!: T.InstancedMesh;
  stratusMesh!: T.InstancedMesh;
  cirrusMesh!: T.InstancedMesh;
  squallMesh!: T.InstancedMesh;
  virgaMesh!: T.InstancedMesh;

  cumulusGeom!: T.BufferGeometry;
  stratusGeom!: T.BufferGeometry;
  cirrusGeom!: T.BufferGeometry;
  squallGeom!: T.BufferGeometry;
  virgaGeom!: T.BufferGeometry;

  cumulusMat!: T.MeshStandardMaterial;
  stratusMat!: T.MeshStandardMaterial;
  cirrusMat!: T.MeshBasicMaterial;
  squallMat!: T.MeshStandardMaterial;
  virgaMat!: T.MeshBasicMaterial;

  sunDirUniform = { value: new T.Vector3(0, 1, 0) };
  lightningUniform = { value: 0.0 };

  private lightningTimer = 8.0;
  private lightningDuration = 0.0;
  private lightningPhase = 0;
  private squallBaseDistance = 8200;
  private dummy = new T.Object3D();

  constructor(scene: T.Scene, sun?: T.DirectionalLight) {
    if (sun) {
      this.sunDirUniform.value.copy(sun.position).normalize();
    }

    this.group.name = 'CloudSystem';
    this.group.add(this.squallGroup);
    this.group.add(this.cumulusGroup);
    this.group.add(this.stratusGroup);
    this.group.add(this.cirrusGroup);

    this.initGeometries();
    this.initMaterials();
    this.initCumulus();
    this.initStratus();
    this.initCirrus();
    this.initSquallLine();

    scene.add(this.group);
  }

  private initGeometries() {
    this.cumulusGeom = createCumulusPuffGeometry();
    this.stratusGeom = createStratusSheetGeometry();
    this.cirrusGeom = createCirrusStreakGeometry();
    this.squallGeom = createSquallRollGeometry();
    this.virgaGeom = createVirgaCurtainGeometry();
  }

  private initMaterials() {
    this.cumulusMat = createCumulusMaterial(this.sunDirUniform);
    this.stratusMat = createStratusMaterial();
    this.cirrusMat = createCirrusMaterial(this.sunDirUniform);
    this.squallMat = createSquallMaterial(this.lightningUniform);
    this.virgaMat = createVirgaMaterial();
  }

  private initCumulus() {
    this.cumulusMesh = new T.InstancedMesh(this.cumulusGeom, this.cumulusMat, CUMULUS_COUNT);
    this.cumulusMesh.frustumCulled = false;

    // Distribute flat-bottomed cumulus clusters in natural wind-aligned cloud streets
    let idx = 0;
    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    const rand = rng(4217);

    for (let c = 0; c < 40; c++) {
      const streetX = (rand() - 0.5) * 14000;
      const streetZ = (rand() - 0.5) * 14000;
      const baseAlt = 740 + rand() * 320;
      const clusterSize = 70 + rand() * 90;

      for (let p = 0; p < 8; p++) {
        if (idx >= CUMULUS_COUNT) break;
        const scale = clusterSize * (0.55 + rand() * 0.85);
        this.dummy.position.set(
          streetX + (rand() - 0.5) * clusterSize * 3.8,
          baseAlt + (p < 3 ? 0 : rand() * scale * 0.28), // Flat bases aligned
          streetZ + (rand() - 0.5) * clusterSize * 1.6,
        );
        this.dummy.rotation.set(0, rand() * Math.PI * 2, 0);
        this.dummy.scale.set(scale, scale * (0.65 + rand() * 0.45), scale);
        this.dummy.updateMatrix();
        this.cumulusMesh.setMatrixAt(idx++, this.dummy.matrix);
      }
    }
    this.cumulusGroup.add(this.cumulusMesh);
  }

  private initStratus() {
    this.stratusMesh = new T.InstancedMesh(this.stratusGeom, this.stratusMat, STRATUS_COUNT);
    this.stratusMesh.frustumCulled = false;

    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    const rand = rng(8831);

    for (let i = 0; i < STRATUS_COUNT; i++) {
      const scale = 140 + rand() * 220;
      this.dummy.position.set(
        (rand() - 0.5) * 16000,
        520 + rand() * 220, // Low overcast layer (520m - 740m)
        (rand() - 0.5) * 16000,
      );
      this.dummy.rotation.set(0, rand() * Math.PI * 2, 0);
      this.dummy.scale.set(scale, scale * 0.45, scale);
      this.dummy.updateMatrix();
      this.stratusMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.stratusGroup.add(this.stratusMesh);
  }

  private initCirrus() {
    this.cirrusMesh = new T.InstancedMesh(this.cirrusGeom, this.cirrusMat, CIRRUS_COUNT);
    this.cirrusMesh.frustumCulled = false;

    const rng = (seed: number) => {
      let s = seed >>> 0;
      return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
      };
    };
    const rand = rng(1209);

    for (let i = 0; i < CIRRUS_COUNT; i++) {
      const scale = 220 + rand() * 340;
      this.dummy.position.set(
        (rand() - 0.5) * 18000,
        4600 + rand() * 1600, // High-altitude wisps (4,600m - 6,200m)
        (rand() - 0.5) * 18000,
      );
      this.dummy.rotation.set(0, 0.45 + (rand() - 0.5) * 0.35, 0); // Aligned with upper shear
      this.dummy.scale.set(scale, 1, scale * 0.5);
      this.dummy.updateMatrix();
      this.cirrusMesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.cirrusGroup.add(this.cirrusMesh);
  }

  /**
   * Initializes the continuous, menacing incoming squall line wall along
   * the western/northwestern horizon ($15,000\text{m}$ span).
   */
  private initSquallLine() {
    this.squallMesh = new T.InstancedMesh(this.squallGeom, this.squallMat, SQUALL_SEGMENTS);
    this.squallMesh.frustumCulled = false;

    this.virgaMesh = new T.InstancedMesh(this.virgaGeom, this.virgaMat, SQUALL_SEGMENTS);
    this.virgaMesh.frustumCulled = false;

    // Lay out a continuous, imposing wall along the horizon from angle 115 deg to 175 deg (~15,000m span)
    const arcRadius = 8200;
    const startAngle = Math.PI * 0.65;
    const endAngle = Math.PI * 1.05;

    for (let i = 0; i < SQUALL_SEGMENTS; i++) {
      const t = i / (SQUALL_SEGMENTS - 1);
      const angle = startAngle + t * (endAngle - startAngle);
      const dist = arcRadius + Math.sin(t * Math.PI * 3.5) * 450; // Undulating front line

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Low ragged shelf lip hangs at 260m - 340m AGL, anvil rises to 2,800m
      const shelfAlt = 280 + Math.sin(t * 12.0) * 45;
      const scale = 110 + Math.sin(t * 7.0) * 25;

      // Squall roll mesh
      this.dummy.position.set(x, shelfAlt, z);
      // Face inward toward the county center
      this.dummy.rotation.set(0, -angle - Math.PI / 2, 0);
      this.dummy.scale.set(scale, scale, scale);
      this.dummy.updateMatrix();
      this.squallMesh.setMatrixAt(i, this.dummy.matrix);

      // Virga precipitation curtain hanging below
      this.dummy.position.set(x, shelfAlt - 20, z);
      this.dummy.scale.set(scale * 1.1, shelfAlt / 7.5, scale);
      this.dummy.updateMatrix();
      this.virgaMesh.setMatrixAt(i, this.dummy.matrix);
    }

    this.squallGroup.add(this.squallMesh);
    this.squallGroup.add(this.virgaMesh);
  }

  /**
   * Adapts cloud layers to weather conditions:
   * - Under clear: Prominent fair-weather cumulus, high cirrus, distant squall line.
   * - Under haze: Stratocumulus rolls with warm golden haze.
   * - Under overcast: Dense stratocumulus sheets, advancing squall line.
   * - Under rain / severe: Dark, looming squall line advancing close with frequent lightning!
   */
  updateWeather(forecast: Weather, dt: number, _time: number) {
    const blend = 1 - Math.exp(-dt * 0.8);

    // Weather coverage thresholds
    const isStorm = forecast.rain > 0.1 || forecast.cloud > 0.75;
    const isOvercast = forecast.cloud > 0.55;

    // Adjust layer instance counts and visibility
    const cumulusCount = isOvercast
      ? Math.round(CUMULUS_COUNT * 0.45)
      : Math.round(CUMULUS_COUNT * (0.5 + forecast.cloud * 0.5));
    this.cumulusMesh.count = Math.min(CUMULUS_COUNT, Math.max(40, cumulusCount));

    const stratusCount = isOvercast
      ? STRATUS_COUNT
      : Math.round(STRATUS_COUNT * Math.max(0.1, (forecast.cloud - 0.2) * 1.4));
    this.stratusMesh.count = Math.min(STRATUS_COUNT, Math.max(0, stratusCount));

    // Cirrus wisps most visible under fair skies, obscured in dense overcast
    this.cirrusMat.opacity = Math.max(0.05, 0.42 * (1.0 - forecast.cloud * 0.7));

    // Stratus opacity and color
    this.stratusMat.opacity = Math.min(0.92, 0.35 + forecast.cloud * 0.58);
    const targetStratusColor = new T.Color(isStorm ? '#687782' : isOvercast ? '#8fa1ac' : '#b2c3cc');
    this.stratusMat.color.lerp(targetStratusColor, blend);

    // Squall Line Proximity ("Impending Doom" advances under stormy weather)
    const targetDist = isStorm ? 4800 : isOvercast ? 6400 : 8200;
    this.squallBaseDistance += (targetDist - this.squallBaseDistance) * blend;
    const scaleFactor = this.squallBaseDistance / 8200;
    this.squallGroup.scale.set(scaleFactor, 1.0, scaleFactor);
  }

  /**
   * Updates cloud drift with wind, animates internal sheet lightning pulses,
   * and updates sun direction for forward silver-lining rim lighting.
   */
  update(
    dt: number,
    _time: number,
    wind: { x: number; z: number },
    camera?: T.Camera,
    sun?: T.DirectionalLight,
  ) {
    // 1. Drift cumulus and stratus layers gently with wind
    this.cumulusGroup.position.x += wind.x * dt * 0.5;
    this.cumulusGroup.position.z += wind.z * dt * 0.5;
    this.stratusGroup.position.x += wind.x * dt * 0.4;
    this.stratusGroup.position.z += wind.z * dt * 0.4;

    // Cirrus drifts with high-altitude upper wind shear
    this.cirrusGroup.position.x += wind.x * dt * 0.75;
    this.cirrusGroup.position.z += wind.z * dt * 0.75;

    // 2. Update Sun direction for silver lining
    if (sun) {
      this.sunDirUniform.value.copy(sun.position).normalize();
    } else if (camera) {
      this.sunDirUniform.value.set(0.65, 0.6, -0.45).normalize();
    }

    // 3. Animate Squall Line Sheet Lightning Pulses
    this.updateLightning(dt);
  }

  private updateLightning(dt: number) {
    if (this.lightningDuration > 0) {
      this.lightningDuration -= dt;

      // Realistic double-flash pulse sequence
      if (this.lightningPhase === 1) {
        // Flash 1
        this.lightningUniform.value = Math.min(1.0, this.lightningDuration * 14.0);
        if (this.lightningDuration <= 0.12) {
          this.lightningPhase = 2; // Dark pause between flashes
        }
      } else if (this.lightningPhase === 2) {
        // Dark interval
        this.lightningUniform.value = 0.0;
        if (this.lightningDuration <= 0.08) {
          this.lightningPhase = 3; // Flash 2
        }
      } else if (this.lightningPhase === 3) {
        // Flash 2 (longer decay)
        this.lightningUniform.value = Math.max(0.0, this.lightningDuration / 0.08);
        if (this.lightningDuration <= 0) {
          this.lightningUniform.value = 0.0;
          this.lightningPhase = 0;
        }
      }
    } else {
      this.lightningUniform.value = 0.0;
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.triggerLightning();
      }
    }
  }

  /**
   * Triggers an internal sheet lightning flash pulse inside the squall line.
   */
  triggerLightning() {
    this.lightningTimer = 6.0 + Math.random() * 8.0;
    this.lightningDuration = 0.22;
    this.lightningPhase = 1;
    this.lightningUniform.value = 1.0;
  }

  /**
   * Cleans up all geometries, materials, and instanced meshes to prevent memory leaks.
   */
  dispose() {
    this.cumulusGeom.dispose();
    this.stratusGeom.dispose();
    this.cirrusGeom.dispose();
    this.squallGeom.dispose();
    this.virgaGeom.dispose();

    this.cumulusMat.dispose();
    this.stratusMat.dispose();
    this.cirrusMat.dispose();
    this.squallMat.dispose();
    this.virgaMat.dispose();

    this.cumulusMesh.dispose();
    this.stratusMesh.dispose();
    this.cirrusMesh.dispose();
    this.squallMesh.dispose();
    this.virgaMesh.dispose();

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
