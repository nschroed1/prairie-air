import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Weather } from '../weather';
import type { Simulation } from '../simulation';
import { windVector } from '../weather';

/**
 * Balloon Livery Palettes for Midwestern County Fairs & Prairie Horizons:
 * - 'sunrise': Vibrant crimson, tangerine, and warm golden amber
 * - 'heartland': Classic royal blue, sunny yellow, and cloud white
 * - 'rainbow': Multi-gore rainbow spectrum
 * - 'harvest': Forest pine, rustic burgundy, harvest gold, and cream
 */
export type BalloonPalette = 'sunrise' | 'heartland' | 'rainbow' | 'harvest';

export interface HotAirBalloon {
  id: string;
  group: T.Group;
  envelopeMesh: T.Mesh;
  basketMesh: T.Mesh;
  flameMesh: T.Mesh;
  palette: BalloonPalette;
  baseX: number;
  baseZ: number;
  baseY: number;
  scale: number;
  driftSpeedMult: number;
  bobFrequency: number;
  bobPhase: number;
  yawSpeed: number;
  burnTimer: number;
  burnCycle: number;
  burnDuration: number;
  cooldown: number;
  visible: boolean;
}

export interface ContrailRibbon {
  mesh: T.Mesh;
  geometry: T.BufferGeometry;
  positions: Float32Array;
  alphas: Float32Array;
  knots: Array<{
    x: number;
    y: number;
    z: number;
    age: number;
    active: boolean;
  }>;
  dropTimer: number;
}

export interface JetTransit {
  id: string;
  group: T.Group;
  jetMesh: T.Mesh;
  strobeMeshes: T.Mesh[];
  contrailLeft: ContrailRibbon;
  contrailRight: ContrailRibbon;
  x: number;
  y: number;
  z: number;
  altitude: number;
  speed: number;
  heading: number;
  strobeTimer: number;
  active: boolean;
}

export interface SoaringHawk {
  group: T.Group;
  centerX: number;
  centerZ: number;
  radius: number;
  baseY: number;
  angularSpeed: number;
  angle: number;
  climbPhase: number;
}

export interface SkyLifeEvent {
  type: 'balloon_flyby';
  balloonId: string;
  bonus: number;
  message: string;
  pos: T.Vector3;
}

/**
 * Generates an authentic hot air balloon envelope geometry with a classic teardrop profile.
 * Width is maximum near upper third (shoulder), tapering gently into lower burner throat.
 */
export function createBalloonEnvelopeGeometry(): T.BufferGeometry {
  const points: T.Vector2[] = [];
  const segments = 24;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments; // 0 at throat, 1 at apex
    const y = 1.0 + t * 21.0;
    let r: number;
    if (t < 0.22) {
      // Throat collar expanding to lower cone
      r = 1.8 + (t / 0.22) * 2.6;
    } else if (t < 0.65) {
      // Lower cone curving up into shoulder
      const u = (t - 0.22) / 0.43;
      r = 4.4 + Math.sin(u * Math.PI * 0.5) * 4.1;
    } else {
      // Shoulder rounding up into top dome apex
      const u = (t - 0.65) / 0.35;
      r = 8.5 * Math.cos(u * Math.PI * 0.5);
    }
    points.push(new T.Vector2(Math.max(0.01, r), y));
  }
  const envelope = new T.LatheGeometry(points, 24);
  envelope.computeVertexNormals();
  return envelope;
}

/**
 * Generates wicker basket, suspension cables, and burner ring.
 */
export function createBalloonBasketGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // Wicker basket
  const basket = new T.BoxGeometry(2.4, 1.5, 2.4);
  basket.translate(0, -1.6, 0);
  geometries.push(basket);

  // Basket rim
  const rim = new T.BoxGeometry(2.6, 0.22, 2.6);
  rim.translate(0, -0.8, 0);
  geometries.push(rim);

  // 4 corner suspension cables connecting basket rim to envelope throat
  const cableRadius = 0.04;
  const cableHeight = 1.8;
  const corners = [
    [-1.05, -1.05],
    [1.05, -1.05],
    [-1.05, 1.05],
    [1.05, 1.05],
  ];

  for (const [cx, cz] of corners) {
    const cable = new T.CylinderGeometry(cableRadius, cableRadius, cableHeight, 4);
    cable.translate(cx, -0.05, cz);
    geometries.push(cable);
  }

  // Burner ring frame
  const burnerRing = new T.CylinderGeometry(0.55, 0.55, 0.2, 8);
  burnerRing.translate(0, 0.45, 0);
  geometries.push(burnerRing);

  const merged = mergeGeometries(geometries);
  basket.dispose();
  rim.dispose();
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

/**
 * Creates custom procedural material with authentic gore striping for hot air balloons.
 */
export function createBalloonMaterial(palette: BalloonPalette): T.MeshStandardMaterial {
  const mat = new T.MeshStandardMaterial({
    roughness: 0.82,
    metalness: 0.05,
    side: T.DoubleSide,
  });

  const paletteColors: Record<BalloonPalette, [string, string, string, string]> = {
    sunrise: ['#dc2626', '#f97316', '#eab308', '#fef3c7'],
    heartland: ['#1d4ed8', '#38bdf8', '#facc15', '#ffffff'],
    rainbow: ['#ef4444', '#f59e0b', '#10b981', '#3b82f6'],
    harvest: ['#15803d', '#ca8a04', '#881337', '#f5f5f4'],
  };

  const [c1, c2, c3, c4] = paletteColors[palette].map((hex) => new T.Color(hex));

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uColor1 = { value: c1 };
    shader.uniforms.uColor2 = { value: c2 };
    shader.uniforms.uColor3 = { value: c3 };
    shader.uniforms.uColor4 = { value: c4 };

    shader.vertexShader = `
      varying vec2 vBalloonUv;
      ${shader.vertexShader}
    `;

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vBalloonUv = uv;
      `,
    );

    shader.fragmentShader = `
      uniform vec3 uColor1;
      uniform vec3 uColor2;
      uniform vec3 uColor3;
      uniform vec3 uColor4;
      varying vec2 vBalloonUv;
      ${shader.fragmentShader}
    `;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float gore = fract(vBalloonUv.x * 12.0);
      float goreId = floor(vBalloonUv.x * 12.0);
      int band = int(mod(goreId, 4.0));

      vec3 panelColor = uColor1;
      if (band == 1) panelColor = uColor2;
      else if (band == 2) panelColor = uColor3;
      else if (band == 3) panelColor = uColor4;

      // Subtle horizontal accent band across upper shoulder
      float ring = smoothstep(0.48, 0.52, vBalloonUv.y) * (1.0 - smoothstep(0.56, 0.60, vBalloonUv.y));
      panelColor = mix(panelColor, vec3(0.98, 0.98, 0.98), ring * 0.75);

      // Quilted balloon panel depth: shadow at gore seams
      float seamShadow = smoothstep(0.0, 0.12, gore) * (1.0 - smoothstep(0.88, 1.0, gore));
      panelColor *= (0.82 + 0.18 * seamShadow);

      diffuseColor.rgb = panelColor;
      `,
    );
  };

  mat.customProgramCacheKey = () => `prairie-balloon-${palette}`;
  return mat;
}

/**
 * Creates high-altitude commercial twin-turbofan jet airliner geometry.
 */
export function createJetAirlinerGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // Fuselage (Length 38m, Diameter 3.6m)
  const fuselage = new T.CylinderGeometry(1.8, 1.8, 38, 12);
  fuselage.rotateX(Math.PI / 2);
  geometries.push(fuselage);

  // Nose radome cone
  const nose = new T.ConeGeometry(1.8, 5.5, 12);
  nose.rotateX(-Math.PI / 2);
  nose.translate(0, 0, 21.75);
  geometries.push(nose);

  // Tail cone
  const tailCone = new T.ConeGeometry(1.8, 7.0, 12);
  tailCone.rotateX(Math.PI / 2);
  tailCone.translate(0, 0.4, -22.5);
  geometries.push(tailCone);

  // Swept Main Wings (Span 34m)
  const wingLeft = new T.BoxGeometry(15.5, 0.45, 4.8);
  wingLeft.rotateY(-0.48); // 27.5 deg sweep
  wingLeft.translate(-8.5, -0.3, 0);
  geometries.push(wingLeft);

  const wingRight = new T.BoxGeometry(15.5, 0.45, 4.8);
  wingRight.rotateY(0.48);
  wingRight.translate(8.5, -0.3, 0);
  geometries.push(wingRight);

  // Twin Turbofan Engine Nacelles (Under wings at x = +-7.2m)
  const engineLeft = new T.CylinderGeometry(1.1, 1.0, 6.2, 10);
  engineLeft.rotateX(Math.PI / 2);
  engineLeft.translate(-7.2, -1.7, 1.5);
  geometries.push(engineLeft);

  const engineRight = new T.CylinderGeometry(1.1, 1.0, 6.2, 10);
  engineRight.rotateX(Math.PI / 2);
  engineRight.translate(7.2, -1.7, 1.5);
  geometries.push(engineRight);

  // Horizontal Stabilizers
  const hStab = new T.BoxGeometry(12.5, 0.3, 2.6);
  hStab.translate(0, 0.8, -20.5);
  geometries.push(hStab);

  // Vertical Fin / Rudder
  const vFin = new T.BoxGeometry(0.35, 7.5, 3.8);
  vFin.rotateX(-0.35); // Swept vertical fin
  vFin.translate(0, 4.2, -19.5);
  geometries.push(vFin);

  const merged = mergeGeometries(geometries);
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

/**
 * Creates low-poly soaring raptor (hawk) with outstretched wings and fan tail.
 */
export function createHawkGeometry(): T.BufferGeometry {
  const geometries: T.BufferGeometry[] = [];

  // Torso
  const body = new T.ConeGeometry(0.45, 2.2, 6);
  body.rotateX(-Math.PI / 2);
  geometries.push(body);

  // Broad outstretched wings (Wingspan 4.2m)
  const wingLeft = new T.BoxGeometry(2.1, 0.08, 0.9);
  wingLeft.rotateZ(0.08); // Slight dihedral
  wingLeft.translate(-1.15, 0.1, 0);
  geometries.push(wingLeft);

  const wingRight = new T.BoxGeometry(2.1, 0.08, 0.9);
  wingRight.rotateZ(-0.08);
  wingRight.translate(1.15, 0.1, 0);
  geometries.push(wingRight);

  // Fan-tail
  const tail = new T.BoxGeometry(1.3, 0.05, 1.1);
  tail.translate(0, 0.05, -1.2);
  geometries.push(tail);

  const merged = mergeGeometries(geometries);
  for (const g of geometries) {
    if (g !== merged) g.dispose();
  }
  return merged;
}

const MAX_CONTRAIL_KNOTS = 64;

/**
 * Creates a preallocated dynamic ribbon mesh for a jet condensation trail ("chem trail").
 */
function createContrailRibbon(): ContrailRibbon {
  const knots = Array.from({ length: MAX_CONTRAIL_KNOTS }, () => ({
    x: 0,
    y: 0,
    z: 0,
    age: 999,
    active: false,
  }));

  const vertexCount = MAX_CONTRAIL_KNOTS * 2;
  const positions = new Float32Array(vertexCount * 3);
  const alphas = new Float32Array(vertexCount);
  const uvs = new Float32Array(vertexCount * 2);

  // Initialize triangle index buffer for triangle strip
  const indexCount = (MAX_CONTRAIL_KNOTS - 1) * 6;
  const indices = new Uint16Array(indexCount);
  let idx = 0;
  for (let i = 0; i < MAX_CONTRAIL_KNOTS - 1; i++) {
    const v0 = i * 2;
    const v1 = i * 2 + 1;
    const v2 = (i + 1) * 2;
    const v3 = (i + 1) * 2 + 1;
    indices[idx++] = v0;
    indices[idx++] = v1;
    indices[idx++] = v2;
    indices[idx++] = v1;
    indices[idx++] = v3;
    indices[idx++] = v2;
  }

  for (let i = 0; i < MAX_CONTRAIL_KNOTS; i++) {
    const u = i / (MAX_CONTRAIL_KNOTS - 1);
    uvs[i * 4] = u;
    uvs[i * 4 + 1] = 0;
    uvs[i * 4 + 2] = u;
    uvs[i * 4 + 3] = 1;
  }

  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  geometry.setAttribute('uv', new T.BufferAttribute(uvs, 2));
  geometry.setAttribute('alpha', new T.BufferAttribute(alphas, 1).setUsage(T.DynamicDrawUsage));
  geometry.setIndex(new T.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0); // Initially draw nothing until active knots exist

  // Custom Contrail Material: strictly horizontal ribbon, soft lateral feathering, age fade
  const material = new T.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0.82,
    depthWrite: false,
    side: T.DoubleSide,
    blending: T.NormalBlending,
  });

  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `
      attribute float alpha;
      varying float vContrailAlpha;
      varying vec2 vContrailUv;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vContrailAlpha = alpha;
      vContrailUv = uv;
      `,
    );

    shader.fragmentShader = `
      varying float vContrailAlpha;
      varying vec2 vContrailUv;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      // Soft lateral feathering across ribbon edges
      float lateral = abs(vContrailUv.y - 0.5) * 2.0;
      float edgeFeather = 1.0 - smoothstep(0.25, 1.0, lateral);
      diffuseColor.a *= vContrailAlpha * edgeFeather;
      `,
    );
  };
  material.customProgramCacheKey = () => 'prairie-contrail-ribbon-v2';

  const mesh = new T.Mesh(geometry, material);
  mesh.frustumCulled = false;

  return {
    mesh,
    geometry,
    positions,
    alphas,
    knots,
    dropTimer: 0,
  };
}

/**
 * SkyLifeSystem manages medium-altitude hot air balloons, high-altitude commercial
 * jets with expanding persistent contrails, and soaring thermal raptors to give the
 * sky immense atmospheric depth.
 */
export class SkyLifeSystem {
  group = new T.Group();
  balloons: HotAirBalloon[] = [];
  jets: JetTransit[] = [];
  hawks: SoaringHawk[] = [];
  balloonGeometry: T.BufferGeometry;
  basketGeometry: T.BufferGeometry;
  balloonMaterials: Map<BalloonPalette, T.MeshStandardMaterial> = new Map();
  jetGeometry: T.BufferGeometry;
  jetMaterial: T.MeshStandardMaterial;
  hawkGeometry: T.BufferGeometry;
  hawkMaterial: T.MeshStandardMaterial;
  flameMaterial: T.MeshBasicMaterial;
  basketMaterial: T.MeshStandardMaterial;
  strobeMaterial: T.MeshBasicMaterial;
  sun?: T.DirectionalLight;
  private jetRespawnTimer = 10.0;

  constructor(scene: T.Scene, sun?: T.DirectionalLight) {
    this.sun = sun;
    this.group.name = 'SkyLifeSystem';

    // Shared Geometries
    this.balloonGeometry = createBalloonEnvelopeGeometry();
    this.basketGeometry = createBalloonBasketGeometry();
    this.jetGeometry = createJetAirlinerGeometry();
    this.hawkGeometry = createHawkGeometry();

    // Shared Materials
    this.basketMaterial = new T.MeshStandardMaterial({
      color: '#926a44',
      roughness: 0.9,
    });
    this.flameMaterial = new T.MeshBasicMaterial({
      color: '#ff922b',
      transparent: true,
      opacity: 0.9,
      blending: T.AdditiveBlending,
    });
    this.jetMaterial = new T.MeshStandardMaterial({
      color: '#f8fafc',
      metalness: 0.45,
      roughness: 0.35,
    });
    this.hawkMaterial = new T.MeshStandardMaterial({
      color: '#4a3728',
      roughness: 0.85,
    });
    this.strobeMaterial = new T.MeshBasicMaterial({
      color: '#ffffff',
    });

    // Populate Hot Air Balloons across medium altitudes (140m - 280m)
    this.initBalloons();

    // Populate High-Altitude Jet Transits (3400m - 4400m)
    this.initJets();

    // Populate Soaring Thermal Raptors (95m - 160m)
    this.initHawks();

    scene.add(this.group);
  }

  private initBalloons() {
    const configs: Array<{
      id: string;
      palette: BalloonPalette;
      x: number;
      y: number;
      z: number;
      scale: number;
      driftSpeed: number;
      burnInterval: number;
    }> = [
      {
        id: 'balloon-sunrise-1',
        palette: 'sunrise',
        x: -950,
        y: 190,
        z: -650,
        scale: 1.0,
        driftSpeed: 0.32,
        burnInterval: 7.2,
      },
      {
        id: 'balloon-heartland-2',
        palette: 'heartland',
        x: 820,
        y: 245,
        z: -1400,
        scale: 1.08,
        driftSpeed: 0.38,
        burnInterval: 8.5,
      },
      {
        id: 'balloon-rainbow-3',
        palette: 'rainbow',
        x: -1600,
        y: 155,
        z: 920,
        scale: 0.95,
        driftSpeed: 0.28,
        burnInterval: 6.8,
      },
      {
        id: 'balloon-harvest-4',
        palette: 'harvest',
        x: 1450,
        y: 280,
        z: 750,
        scale: 1.15,
        driftSpeed: 0.35,
        burnInterval: 9.1,
      },
    ];

    for (const cfg of configs) {
      let mat = this.balloonMaterials.get(cfg.palette);
      if (!mat) {
        mat = createBalloonMaterial(cfg.palette);
        this.balloonMaterials.set(cfg.palette, mat);
      }

      const balloonGroup = new T.Group();
      balloonGroup.position.set(cfg.x, cfg.y, cfg.z);
      balloonGroup.scale.setScalar(cfg.scale);

      const envelope = new T.Mesh(this.balloonGeometry, mat);
      envelope.castShadow = true;
      balloonGroup.add(envelope);

      const basket = new T.Mesh(this.basketGeometry, this.basketMaterial);
      balloonGroup.add(basket);

      // Emissive flame cone
      const flame = new T.Mesh(
        new T.ConeGeometry(0.7, 1.8, 8),
        this.flameMaterial,
      );
      flame.position.set(0, 0.65, 0);
      flame.visible = false;
      balloonGroup.add(flame);

      this.group.add(balloonGroup);

      this.balloons.push({
        id: cfg.id,
        group: balloonGroup,
        envelopeMesh: envelope,
        basketMesh: basket,
        flameMesh: flame,
        palette: cfg.palette,
        baseX: cfg.x,
        baseZ: cfg.z,
        baseY: cfg.y,
        scale: cfg.scale,
        driftSpeedMult: cfg.driftSpeed,
        bobFrequency: 0.35 + Math.random() * 0.15,
        bobPhase: Math.random() * Math.PI * 2,
        yawSpeed: (Math.random() - 0.5) * 0.04,
        burnTimer: Math.random() * cfg.burnInterval,
        burnCycle: cfg.burnInterval,
        burnDuration: 2.4,
        cooldown: 0,
        visible: true,
      });
    }
  }

  private initJets() {
    // 2 active or alternating high-altitude transcontinental jet routes
    const jetConfigs = [
      {
        id: 'jet-transcon-1',
        altitude: 3800,
        speed: 118,
        startX: -6800,
        startZ: -5400,
        heading: 0.72,
      },
      {
        id: 'jet-transcon-2',
        altitude: 4400,
        speed: 126,
        startX: 6500,
        startZ: -5800,
        heading: 2.45,
      },
    ];

    for (const cfg of jetConfigs) {
      const jetGroup = new T.Group();
      jetGroup.position.set(cfg.startX, cfg.altitude, cfg.startZ);
      jetGroup.rotation.y = cfg.heading;

      const jetMesh = new T.Mesh(this.jetGeometry, this.jetMaterial);
      jetGroup.add(jetMesh);

      // Strobe lights at wingtips
      const strobes: T.Mesh[] = [];
      const strobeLeft = new T.Mesh(new T.SphereGeometry(0.45, 6, 6), this.strobeMaterial);
      strobeLeft.position.set(-16.0, 0, -2.5);
      jetGroup.add(strobeLeft);
      strobes.push(strobeLeft);

      const strobeRight = new T.Mesh(new T.SphereGeometry(0.45, 6, 6), this.strobeMaterial);
      strobeRight.position.set(16.0, 0, -2.5);
      jetGroup.add(strobeRight);
      strobes.push(strobeRight);

      const contrailLeft = createContrailRibbon();
      const contrailRight = createContrailRibbon();
      this.group.add(contrailLeft.mesh);
      this.group.add(contrailRight.mesh);

      this.group.add(jetGroup);

      this.jets.push({
        id: cfg.id,
        group: jetGroup,
        jetMesh,
        strobeMeshes: strobes,
        contrailLeft,
        contrailRight,
        x: cfg.startX,
        y: cfg.altitude,
        z: cfg.startZ,
        altitude: cfg.altitude,
        speed: cfg.speed,
        heading: cfg.heading,
        strobeTimer: 0,
        active: true,
      });
    }
  }

  private initHawks() {
    const hawkConfigs = [
      {
        centerX: 420,
        centerZ: -320,
        radius: 42,
        baseY: 110,
        speed: 0.32,
      },
      {
        centerX: 950,
        centerZ: 380,
        radius: 48,
        baseY: 145,
        speed: 0.28,
      },
    ];

    for (const cfg of hawkConfigs) {
      const hawkGroup = new T.Group();
      const hawkMesh = new T.Mesh(this.hawkGeometry, this.hawkMaterial);
      hawkGroup.add(hawkMesh);
      this.group.add(hawkGroup);

      this.hawks.push({
        group: hawkGroup,
        centerX: cfg.centerX,
        centerZ: cfg.centerZ,
        radius: cfg.radius,
        baseY: cfg.baseY,
        angularSpeed: cfg.speed,
        angle: Math.random() * Math.PI * 2,
        climbPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Updates sky life simulation: balloon drifting/bobbing, burner flicker, jet transits,
   * contrail ribbon expansion, soaring raptor thermals, and flyby detection.
   */
  update(
    dt: number,
    time: number,
    weather: Weather,
    sim?: Simulation,
  ): SkyLifeEvent[] {
    const events: SkyLifeEvent[] = [];
    const wind = windVector(weather, time);

    // Weather gating: Hot air balloons stay grounded during heavy overcast or storms
    const fairWeather = weather.cloud <= 0.65 && weather.rain <= 0.1;

    // 1. Update Hot Air Balloons
    for (const b of this.balloons) {
      if (b.cooldown > 0) b.cooldown -= dt;

      b.visible = fairWeather;
      b.group.visible = fairWeather;
      if (!fairWeather) continue;

      // Wind drift: gentle drift with county wind vector
      b.group.position.x += wind.x * b.driftSpeedMult * dt;
      b.group.position.z += wind.z * b.driftSpeedMult * dt;

      // Boundary wrapping: keep balloons within scenic county airspace (+-5500m)
      if (Math.abs(b.group.position.x) > 5500) {
        b.group.position.x = -Math.sign(b.group.position.x) * 5200;
      }
      if (Math.abs(b.group.position.z) > 5500) {
        b.group.position.z = -Math.sign(b.group.position.z) * 5200;
      }

      // Vertical buoyancy sinusoidal float
      b.bobPhase += dt * b.bobFrequency;
      b.group.position.y = b.baseY + Math.sin(b.bobPhase) * 4.5;

      // Gentle yaw rotation
      b.group.rotation.y += b.yawSpeed * dt;

      // Burner flame pulse cycle
      b.burnTimer += dt;
      const isBurning = b.burnTimer % b.burnCycle < b.burnDuration;
      b.flameMesh.visible = isBurning;
      if (isBurning) {
        const flicker = 0.85 + Math.sin(time * 30.0) * 0.15;
        b.flameMesh.scale.set(flicker, flicker * (1.0 + Math.sin(time * 18.0) * 0.25), flicker);
      }

      // Proximity flyby check (stunt bonus)
      if (sim && b.cooldown <= 0) {
        const dist = Math.hypot(
          sim.x - b.group.position.x,
          sim.y - b.group.position.y,
          sim.z - b.group.position.z,
        );
        // Player flyby clearance between 16m and 48m
        if (dist >= 16 && dist <= 48) {
          b.cooldown = 24.0; // Prevent spamming
          events.push({
            type: 'balloon_flyby',
            balloonId: b.id,
            bonus: 100,
            message: '★ BALLOON CHASER! +$100',
            pos: b.group.position.clone(),
          });
        }
      }
    }

    // 2. Update High-Altitude Jets & Contrails ("Chem Trails")
    for (const jet of this.jets) {
      if (!jet.active) continue;

      // Advance jet along heading at high altitude
      const vx = Math.sin(jet.heading) * jet.speed * dt;
      const vz = -Math.cos(jet.heading) * jet.speed * dt;
      jet.x += vx;
      jet.z += vz;
      jet.group.position.set(jet.x, jet.altitude, jet.z);
      jet.group.updateMatrixWorld(true);

      // Strobe flashing
      jet.strobeTimer += dt;
      const strobeOn = jet.strobeTimer % 1.2 < 0.12;
      for (const s of jet.strobeMeshes) {
        s.visible = strobeOn;
      }

      // Drop contrail knots every 0.35s behind each turbofan nozzle
      const engineLeftWorld = new T.Vector3(-7.2, -1.7, -1.5).applyMatrix4(jet.group.matrixWorld);
      const engineRightWorld = new T.Vector3(7.2, -1.7, -1.5).applyMatrix4(jet.group.matrixWorld);

      this.updateContrail(jet.contrailLeft, dt, engineLeftWorld, wind, jet.heading);
      this.updateContrail(jet.contrailRight, dt, engineRightWorld, wind, jet.heading);

      // Check if jet has flown off the sky dome
      if (Math.hypot(jet.x, jet.z) > 13000) {
        jet.active = false;
        jet.group.visible = false;
      }
    }

    // Respawn inactive jets
    this.jetRespawnTimer -= dt;
    if (this.jetRespawnTimer <= 0) {
      this.jetRespawnTimer = 22.0 + Math.random() * 15.0;
      const inactiveJet = this.jets.find((j) => !j.active);
      if (inactiveJet) {
        const alt = 3600 + Math.random() * 1000;
        const angle = Math.random() * Math.PI * 2;
        inactiveJet.x = Math.cos(angle) * 9200;
        inactiveJet.z = Math.sin(angle) * 9200;
        inactiveJet.altitude = alt;
        inactiveJet.heading = angle + Math.PI + (Math.random() - 0.5) * 0.5;
        inactiveJet.group.rotation.y = inactiveJet.heading;
        inactiveJet.group.position.set(inactiveJet.x, alt, inactiveJet.z);
        inactiveJet.active = true;
        inactiveJet.group.visible = true;

        // Reset contrail knots
        for (const k of inactiveJet.contrailLeft.knots) k.active = false;
        for (const k of inactiveJet.contrailRight.knots) k.active = false;
      }
    }

    // 3. Update Soaring Thermal Raptors
    for (const h of this.hawks) {
      h.angle += h.angularSpeed * dt;
      h.climbPhase += dt * 0.45;

      const hx = h.centerX + Math.cos(h.angle) * h.radius;
      const hz = h.centerZ + Math.sin(h.angle) * h.radius;
      const hy = h.baseY + Math.sin(h.climbPhase) * 6.5;

      h.group.position.set(hx, hy, hz);
      // Face tangent of orbital path
      h.group.rotation.y = -h.angle + Math.PI / 2;
      // Banking angle into turn (centripetal tilt)
      h.group.rotation.z = -0.26;
    }

    // Contrail sunlight color modulation (warms up at sunset/dawn)
    if (this.sun) {
      const sunY = this.sun.position.y;
      const sunsetFactor = Math.max(0, Math.min(1, (350 - sunY) / 350));
      const contrailColor = new T.Color('#ffffff').lerp(new T.Color('#fed7aa'), sunsetFactor * 0.7);
      for (const j of this.jets) {
        (j.contrailLeft.mesh.material as T.MeshBasicMaterial).color.copy(contrailColor);
        (j.contrailRight.mesh.material as T.MeshBasicMaterial).color.copy(contrailColor);
      }
    }

    return events;
  }

  private updateContrail(
    ribbon: ContrailRibbon,
    dt: number,
    nozzleWorld: T.Vector3,
    wind: { x: number; z: number },
    jetHeading: number,
  ) {
    ribbon.dropTimer += dt;
    if (ribbon.dropTimer >= 0.35) {
      ribbon.dropTimer = 0;
      // Shift knots back and drop fresh knot at nozzle
      for (let i = MAX_CONTRAIL_KNOTS - 1; i > 0; i--) {
        const prev = ribbon.knots[i - 1];
        ribbon.knots[i].x = prev.x;
        ribbon.knots[i].y = prev.y;
        ribbon.knots[i].z = prev.z;
        ribbon.knots[i].age = prev.age;
        ribbon.knots[i].active = prev.active;
      }
      ribbon.knots[0].x = nozzleWorld.x;
      ribbon.knots[0].y = nozzleWorld.y;
      ribbon.knots[0].z = nozzleWorld.z;
      ribbon.knots[0].age = 0;
      ribbon.knots[0].active = true;
    }

    // Count active knots
    let activeCount = 0;
    for (let i = 0; i < MAX_CONTRAIL_KNOTS; i++) {
      if (ribbon.knots[i].active) {
        activeCount++;
      } else {
        break;
      }
    }

    // Update knots: drift slightly with wind, expand width strictly horizontally in XZ, fade alpha
    const pos = ribbon.positions;
    const alphas = ribbon.alphas;

    // Heading fallback tangent vector
    const defaultTx = Math.sin(jetHeading);
    const defaultTz = -Math.cos(jetHeading);

    let lastActiveX = nozzleWorld.x;
    let lastActiveY = nozzleWorld.y;
    let lastActiveZ = nozzleWorld.z;

    for (let i = 0; i < MAX_CONTRAIL_KNOTS; i++) {
      const k = ribbon.knots[i];
      const v0 = i * 2;
      const v1 = i * 2 + 1;

      if (k.active) {
        k.age += dt;
        k.x += wind.x * dt * 0.15;
        k.z += wind.z * dt * 0.15;

        lastActiveX = k.x;
        lastActiveY = k.y;
        lastActiveZ = k.z;

        // Compute local tangent along the contrail in the horizontal XZ plane
        let tx = defaultTx;
        let tz = defaultTz;
        if (i < activeCount - 1 && ribbon.knots[i + 1].active) {
          const dx = k.x - ribbon.knots[i + 1].x;
          const dz = k.z - ribbon.knots[i + 1].z;
          const len = Math.hypot(dx, dz);
          if (len > 0.01) {
            tx = dx / len;
            tz = dz / len;
          }
        } else if (i > 0) {
          const dx = ribbon.knots[i - 1].x - k.x;
          const dz = ribbon.knots[i - 1].z - k.z;
          const len = Math.hypot(dx, dz);
          if (len > 0.01) {
            tx = dx / len;
            tz = dz / len;
          }
        }

        // Perpendicular vector in the horizontal XZ plane (pure horizontal spread)
        const perpX = -tz;
        const perpZ = tx;

        // Contrail dispersion: expands from 0.8m at nozzle up to 36m wide horizontally
        const halfWidth = 0.4 + Math.min(18.0, k.age * 0.55);

        // Alpha fade over lifespan (~32 seconds)
        const alpha = Math.max(0, Math.min(1, 1.0 - k.age / 32.0));
        alphas[v0] = alpha;
        alphas[v1] = alpha;

        // Both vertices have EXACTLY k.y (the high cruising altitude)! Purely horizontal.
        pos[v0 * 3] = k.x - perpX * halfWidth;
        pos[v0 * 3 + 1] = k.y;
        pos[v0 * 3 + 2] = k.z - perpZ * halfWidth;

        pos[v1 * 3] = k.x + perpX * halfWidth;
        pos[v1 * 3 + 1] = k.y;
        pos[v1 * 3 + 2] = k.z + perpZ * halfWidth;

        // Expire old knots
        if (k.age > 32.0) {
          k.active = false;
        }
      } else {
        // Inactive knots: park at last active position with alpha = 0 (never project to -9999)
        alphas[v0] = 0;
        alphas[v1] = 0;
        pos[v0 * 3] = lastActiveX;
        pos[v0 * 3 + 1] = lastActiveY;
        pos[v0 * 3 + 2] = lastActiveZ;
        pos[v1 * 3] = lastActiveX;
        pos[v1 * 3 + 1] = lastActiveY;
        pos[v1 * 3 + 2] = lastActiveZ;
      }
    }

    // Set WebGL draw range so only active quads are rasterized
    if (activeCount >= 2) {
      ribbon.geometry.setDrawRange(0, (activeCount - 1) * 6);
    } else {
      ribbon.geometry.setDrawRange(0, 0);
    }

    ribbon.geometry.attributes.position.needsUpdate = true;
    ribbon.geometry.attributes.alpha.needsUpdate = true;
  }

  /**
   * Cleans up all geometries, materials, and scene nodes to prevent memory leaks.
   */
  dispose() {
    this.balloonGeometry.dispose();
    this.basketGeometry.dispose();
    this.jetGeometry.dispose();
    this.hawkGeometry.dispose();
    this.basketMaterial.dispose();
    this.flameMaterial.dispose();
    this.jetMaterial.dispose();
    this.hawkMaterial.dispose();
    this.strobeMaterial.dispose();

    for (const mat of this.balloonMaterials.values()) {
      mat.dispose();
    }
    this.balloonMaterials.clear();

    for (const j of this.jets) {
      j.contrailLeft.geometry.dispose();
      (j.contrailLeft.mesh.material as T.Material).dispose();
      j.contrailRight.geometry.dispose();
      (j.contrailRight.mesh.material as T.Material).dispose();
    }

    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
  }
}
