import * as T from 'three';
import { CEDAR_DIP_POND, type FirefightingState } from './firefighting';
import type { Simulation } from './simulation';
import { ground } from './terrain-math';

function attachVariableParticleShader(material: T.PointsMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        'attribute float fxAlpha;\nattribute float fxSize;\nvarying float vFxAlpha;\nvoid main() {\nvFxAlpha = fxAlpha;',
      )
      .replace('gl_PointSize = size;', 'gl_PointSize = size * fxSize;');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        'void main() {',
        'varying float vFxAlpha;\nvoid main() {',
      )
      .replace(
        '#include <premultiplied_alpha_fragment>',
        'gl_FragColor.a *= vFxAlpha;\n#include <premultiplied_alpha_fragment>',
      );
  };
}

function createRadialTexture(
  innerColor: string,
  midColor: string,
  outerColor: string,
  size = 64,
): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const half = size / 2;
      const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
      grad.addColorStop(0, innerColor);
      grad.addColorStop(0.38, midColor);
      grad.addColorStop(0.76, outerColor);
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      return new T.CanvasTexture(canvas);
    }
  }

  // Headless Node.js fallback
  const s = 16;
  const data = new Uint8Array(s * s * 4);
  const center = (s - 1) / 2;
  const maxR = s / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const dist = Math.hypot(x - center, y - center) / maxR;
      const alpha = Math.max(
        0,
        Math.min(255, Math.round(255 * (1 - Math.min(1, dist * dist)))),
      );
      const idx = (y * s + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }
  const tex = new T.DataTexture(data, s, s, T.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Multi-lobed billowing smoke puff texture so plumes look like turbulent
 * convective clouds rather than flat geometric discs.
 */
function createSmokeCloudTexture(size = 96): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const half = size / 2;
      ctx.clearRect(0, 0, size, size);

      const lobes = [
        { dx: 0, dy: 0, r: half * 0.85, a: 0.72 },
        { dx: -half * 0.24, dy: -half * 0.16, r: half * 0.62, a: 0.52 },
        { dx: half * 0.25, dy: -half * 0.12, r: half * 0.6, a: 0.5 },
        { dx: -half * 0.18, dy: half * 0.22, r: half * 0.58, a: 0.48 },
        { dx: half * 0.2, dy: half * 0.2, r: half * 0.56, a: 0.45 },
      ];

      for (const l of lobes) {
        const cx = half + l.dx;
        const cy = half + l.dy;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, l.r);
        grad.addColorStop(0, `rgba(245, 242, 238, ${l.a})`);
        grad.addColorStop(0.45, `rgba(205, 198, 190, ${l.a * 0.68})`);
        grad.addColorStop(0.8, `rgba(145, 138, 130, ${l.a * 0.25})`);
        grad.addColorStop(1, 'rgba(90, 84, 78, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, l.r, 0, Math.PI * 2);
        ctx.fill();
      }

      return new T.CanvasTexture(canvas);
    }
  }
  return createRadialTexture(
    'rgba(220, 215, 210, 0.85)',
    'rgba(160, 154, 148, 0.55)',
    'rgba(90, 84, 78, 0.12)',
    32,
  );
}

/**
 * High-detail procedural burning ground texture featuring:
 * - Charred black carbon crust
 * - Radiant branching magma fissure veins (#ff3300 -> #ff9900 -> #fff2a8)
 * - Molten glowing ember beds
 * - Smooth radial edge transparency fade to seamlessly blend into Iowa terrain
 */
function createBurningGroundTexture(size = 128): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const half = size / 2;
      ctx.fillStyle = '#161210';
      ctx.fillRect(0, 0, size, size);

      const bgGrad = ctx.createRadialGradient(
        half,
        half,
        4,
        half,
        half,
        half * 0.9,
      );
      bgGrad.addColorStop(0, 'rgba(255, 68, 0, 0.85)');
      bgGrad.addColorStop(0.45, 'rgba(180, 40, 10, 0.65)');
      bgGrad.addColorStop(0.8, 'rgba(40, 16, 10, 0.4)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      const drawVein = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        depth: number,
      ) => {
        if (depth > 3) return;
        const mx = (x1 + x2) / 2 + (Math.random() - 0.5) * (14 / (depth + 1));
        const my = (y1 + y2) / 2 + (Math.random() - 0.5) * (14 / (depth + 1));

        ctx.strokeStyle = depth === 0 ? '#ff3300' : '#ff6600';
        ctx.lineWidth = Math.max(1.2, 5 - depth * 1.3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();

        ctx.strokeStyle = depth === 0 ? '#ffdd44' : '#ffaa22';
        ctx.lineWidth = Math.max(0.8, 2.5 - depth * 0.7);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();

        if (depth < 2 && Math.random() > 0.3) {
          const bx = mx + (Math.random() - 0.5) * 24;
          const by = my + (Math.random() - 0.5) * 24;
          drawVein(mx, my, bx, by, depth + 1);
        }
        drawVein(x1, y1, mx, my, depth + 1);
        drawVein(mx, my, x2, y2, depth + 1);
      };

      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const r = half * (0.6 + Math.random() * 0.3);
        const ex = half + Math.cos(angle) * r;
        const ey = half + Math.sin(angle) * r;
        drawVein(half, half, ex, ey, 0);
      }

      const coreGrad = ctx.createRadialGradient(
        half,
        half,
        0,
        half,
        half,
        half * 0.35,
      );
      coreGrad.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
      coreGrad.addColorStop(0.3, 'rgba(255, 200, 50, 0.85)');
      coreGrad.addColorStop(0.7, 'rgba(255, 80, 0, 0.4)');
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, size, size);

      ctx.globalCompositeOperation = 'destination-in';
      const maskGrad = ctx.createRadialGradient(
        half,
        half,
        half * 0.4,
        half,
        half,
        half * 0.98,
      );
      maskGrad.addColorStop(0, 'rgba(0, 0, 0, 1)');
      maskGrad.addColorStop(0.75, 'rgba(0, 0, 0, 0.85)');
      maskGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = maskGrad;
      ctx.fillRect(0, 0, size, size);

      const tex = new T.CanvasTexture(canvas);
      tex.wrapS = T.ClampToEdgeWrapping;
      tex.wrapT = T.ClampToEdgeWrapping;
      return tex;
    }
  }

  // Node.js fallback
  const s = 16;
  const data = new Uint8Array(s * s * 4);
  const center = (s - 1) / 2;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const d = Math.hypot(x - center, y - center) / (s / 2);
      const alpha = Math.max(
        0,
        Math.min(255, Math.round(255 * (1 - Math.min(1, d)))),
      );
      const idx = (y * s + x) * 4;
      data[idx] = 255;
      data[idx + 1] = Math.round(120 * (1 - d * 0.5));
      data[idx + 2] = 20;
      data[idx + 3] = alpha;
    }
  }
  const tex = new T.DataTexture(data, s, s, T.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

/**
 * Multi-tongued 3D billboard flame texture with central and flanking flame tongues,
 * incandescent white-yellow core, and turbulent licking tips.
 */
function createBillboardFlameTexture(w = 128, h = 256): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, w, h);

      const drawTongue = (
        baseLeft: number,
        baseRight: number,
        tipX: number,
        tipY: number,
        c0: string,
        c1: string,
        c2: string,
      ) => {
        ctx.beginPath();
        ctx.moveTo(w * baseLeft, h);
        ctx.bezierCurveTo(
          w * (baseLeft - 0.04),
          h * 0.62,
          w * (tipX - 0.14),
          h * (tipY + 0.25),
          w * tipX,
          h * tipY,
        );
        ctx.bezierCurveTo(
          w * (tipX + 0.14),
          h * (tipY + 0.25),
          w * (baseRight + 0.04),
          h * 0.62,
          w * baseRight,
          h,
        );
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, h, 0, h * tipY);
        grad.addColorStop(0, c0);
        grad.addColorStop(0.45, c1);
        grad.addColorStop(0.85, c2);
        grad.addColorStop(1, 'rgba(180, 15, 0, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
      };

      // Outer crimson/orange multi-tongues
      drawTongue(
        0.08,
        0.65,
        0.28,
        0.16,
        'rgba(255, 115, 15, 0.92)',
        'rgba(245, 55, 10, 0.85)',
        'rgba(210, 20, 5, 0.55)',
      );
      drawTongue(
        0.35,
        0.92,
        0.72,
        0.19,
        'rgba(255, 115, 15, 0.92)',
        'rgba(245, 55, 10, 0.85)',
        'rgba(210, 20, 5, 0.55)',
      );
      drawTongue(
        0.12,
        0.88,
        0.5,
        0.03,
        'rgba(255, 145, 20, 0.98)',
        'rgba(255, 65, 10, 0.92)',
        'rgba(220, 25, 5, 0.68)',
      );

      // Middle gold/amber tongues
      drawTongue(
        0.2,
        0.8,
        0.48,
        0.14,
        'rgba(255, 235, 85, 0.98)',
        'rgba(255, 165, 20, 0.92)',
        'rgba(255, 80, 10, 0.48)',
      );
      drawTongue(
        0.26,
        0.72,
        0.6,
        0.24,
        'rgba(255, 225, 70, 0.9)',
        'rgba(255, 150, 20, 0.82)',
        'rgba(245, 65, 10, 0.42)',
      );

      // Inner white-hot core
      drawTongue(
        0.33,
        0.67,
        0.5,
        0.3,
        'rgba(255, 255, 248, 1)',
        'rgba(255, 245, 155, 0.95)',
        'rgba(255, 190, 45, 0.25)',
      );

      const tex = new T.CanvasTexture(canvas);
      tex.wrapS = T.ClampToEdgeWrapping;
      tex.wrapT = T.ClampToEdgeWrapping;
      return tex;
    }
  }

  // Node.js fallback
  const s = 16;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const ny = 1 - y / s;
      const nx = Math.abs(x - s / 2) / (s / 2);
      const alpha = Math.max(
        0,
        Math.min(255, Math.round(255 * ny * (1 - nx))),
      );
      const idx = (y * s + x) * 4;
      data[idx] = 255;
      data[idx + 1] = Math.round(180 * ny);
      data[idx + 2] = Math.round(40 * ny);
      data[idx + 3] = alpha;
    }
  }
  const tex = new T.DataTexture(data, s, s, T.RGBAFormat);
  tex.needsUpdate = true;
  return tex;
}

interface FlameBillboard {
  mesh: T.Mesh;
  hotspotIndex: number;
  baseWidth: number;
  baseHeight: number;
  phaseOffset: number;
  speed: number;
  baseX: number;
  baseY: number;
  baseZ: number;
}

interface TimberTree {
  group: T.Group;
  hotspotIndex: number;
  foliageMat: T.MeshLambertMaterial;
  emberCrownMat: T.MeshBasicMaterial;
  emberCrownMesh: T.Mesh;
  swayPhase: number;
}

export class FirefightingWorld {
  private group = new T.Group();

  // 1. Terrain-Conforming Burning Ground & Tactical Hotspot Rings
  private burningGroundMeshes: T.Mesh[] = [];
  private emberGlowMeshes: T.Mesh[] = [];
  private hotspotRingMeshes: T.Mesh[] = [];

  // 2. Cedar Valley Timber Grove (Burning Conifers & Snags)
  private timberTrees: TimberTree[] = [];
  private sharedGeometries: T.BufferGeometry[] = [];
  private sharedMaterials: T.Material[] = [];

  // 3. Cedar Valley Dip Basin (Scoop Pond + Animated Beacon Ring)
  private dipWaterMesh: T.Mesh | null = null;
  private dipShoreMesh: T.Mesh | null = null;
  private dipBeaconRing: T.Mesh | null = null;
  private dipOuterPulseRing: T.Mesh | null = null;
  private dipBuoyMeshes: T.Mesh[] = [];

  // 4. Persistent Crimson Phos-Chek Retardant Swath Decals
  private retardantDecalPool: T.Mesh[] = [];
  private maxRetardantDecals = 90;

  // 5. Towering 3D Billboard Flame Walls (18m - 26m leaping fire)
  private flameBillboards: FlameBillboard[] = [];

  // 6. Dynamic Flame Particle Sprites
  private firePoints: T.Points | null = null;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private fireAlphas: Float32Array;
  private fireSizes: Float32Array;
  private fireHeights: Float32Array;
  private fireRadii: Float32Array;
  private fireAngles: Float32Array;
  private fireSpeeds: Float32Array;
  private fireCount: number;

  // 7. Flying Embers & Sparks System
  private emberPoints: T.Points | null = null;
  private emberPositions: Float32Array;
  private emberColors: Float32Array;
  private emberVelocities: Float32Array;
  private emberLifetimes: Float32Array;
  private emberCount = 320;

  // 8. Massive Towering Smoke Plumes (Up to 420m sky columns)
  private smokePoints: T.Points | null = null;
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private smokeAlphas: Float32Array;
  private smokeSizes: Float32Array;
  private smokeVelocities: Float32Array;
  private smokeBaseRadii: Float32Array;
  private smokeCount = 450;

  // 9. Steam Puff Explosions on Extinguish
  private steamPoints: T.Points | null = null;
  private steamPositions: Float32Array;
  private steamColors: Float32Array;
  private steamAlphas: Float32Array;
  private steamSizes: Float32Array;
  private steamMaxCount = 110;

  // 10. Point Lights for Flame Illumination
  private pointLights: T.PointLight[] = [];

  // Textures
  private groundTex: T.Texture;
  private billboardFlameTex: T.Texture;
  private flameTex: T.Texture;
  private emberTex: T.Texture;
  private smokeTex: T.Texture;
  private steamTex: T.Texture;
  private retardantTex: T.Texture;

  constructor(
    private scene: T.Scene,
    private state: FirefightingState,
  ) {
    this.fireCount = state.hotspots.length * 45;

    this.groundTex = createBurningGroundTexture(128);
    this.billboardFlameTex = createBillboardFlameTexture(128, 256);
    this.flameTex = createRadialTexture(
      'rgba(255, 255, 235, 1)',
      'rgba(255, 155, 20, 0.92)',
      'rgba(225, 38, 25, 0.32)',
      64,
    );
    this.emberTex = createRadialTexture(
      'rgba(255, 255, 245, 1)',
      'rgba(255, 195, 50, 0.95)',
      'rgba(249, 115, 22, 0.45)',
      32,
    );
    this.smokeTex = createSmokeCloudTexture(96);
    this.steamTex = createSmokeCloudTexture(64);
    this.retardantTex = createRadialTexture(
      'rgba(225, 29, 72, 0.9)',
      'rgba(190, 18, 60, 0.65)',
      'rgba(159, 18, 57, 0)',
      64,
    );

    // Allocations
    this.firePositions = new Float32Array(this.fireCount * 3);
    this.fireColors = new Float32Array(this.fireCount * 3);
    this.fireAlphas = new Float32Array(this.fireCount);
    this.fireSizes = new Float32Array(this.fireCount);
    this.fireHeights = new Float32Array(this.fireCount);
    this.fireRadii = new Float32Array(this.fireCount);
    this.fireAngles = new Float32Array(this.fireCount);
    this.fireSpeeds = new Float32Array(this.fireCount);

    this.emberPositions = new Float32Array(this.emberCount * 3);
    this.emberColors = new Float32Array(this.emberCount * 3);
    this.emberVelocities = new Float32Array(this.emberCount * 3);
    this.emberLifetimes = new Float32Array(this.emberCount * 2);

    this.smokePositions = new Float32Array(this.smokeCount * 3);
    this.smokeColors = new Float32Array(this.smokeCount * 3);
    this.smokeAlphas = new Float32Array(this.smokeCount);
    this.smokeSizes = new Float32Array(this.smokeCount);
    this.smokeVelocities = new Float32Array(this.smokeCount * 3);
    this.smokeBaseRadii = new Float32Array(this.smokeCount);

    this.steamPositions = new Float32Array(this.steamMaxCount * 3);
    this.steamColors = new Float32Array(this.steamMaxCount * 3);
    this.steamAlphas = new Float32Array(this.steamMaxCount);
    this.steamSizes = new Float32Array(this.steamMaxCount);

    this.initConformingBurningGround();
    this.initTimberGrove();
    this.initDipBasin();
    this.initRetardantSwaths();
    this.initBillboardFlames();
    this.initPointLights();
    this.initFlameParticles();
    this.initEmberParticles();
    this.initSmokeParticles();
    this.initSteamParticles();

    this.scene.add(this.group);
  }

  private initConformingBurningGround(): void {
    const segments = 20;

    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const diameter = spot.radius * 2.35;

      // 1. Charred Scorch Base Mesh
      const scorchGeo = new T.PlaneGeometry(
        diameter,
        diameter,
        segments,
        segments,
      );
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchPos = scorchGeo.attributes.position;

      for (let v = 0; v < scorchPos.count; v++) {
        const lx = scorchPos.getX(v);
        const lz = scorchPos.getZ(v);
        const wx = spot.x + lx;
        const wz = spot.z + lz;
        scorchPos.setY(v, ground(wx, wz) + 0.18);
      }
      scorchGeo.computeVertexNormals();

      const scorchMat = new T.MeshBasicMaterial({
        map: this.groundTex,
        color: new T.Color('#181412'),
        transparent: true,
        opacity: 0.92,
        depthWrite: false,
      });

      const scorchMesh = new T.Mesh(scorchGeo, scorchMat);
      scorchMesh.position.set(spot.x, 0, spot.z);
      this.burningGroundMeshes.push(scorchMesh);
      this.group.add(scorchMesh);

      // 2. Incandescent Molten Magma & Ember Vein Glow Mesh
      const glowGeo = new T.PlaneGeometry(
        diameter,
        diameter,
        segments,
        segments,
      );
      glowGeo.rotateX(-Math.PI / 2);
      const glowPos = glowGeo.attributes.position;

      for (let v = 0; v < glowPos.count; v++) {
        const lx = glowPos.getX(v);
        const lz = glowPos.getZ(v);
        const wx = spot.x + lx;
        const wz = spot.z + lz;
        glowPos.setY(v, ground(wx, wz) + 0.26);
      }
      glowGeo.computeVertexNormals();

      const glowMat = new T.MeshBasicMaterial({
        map: this.groundTex,
        color: new T.Color('#ff4d00'),
        transparent: true,
        opacity: 0.88,
        blending: T.AdditiveBlending,
        depthWrite: false,
      });

      const glowMesh = new T.Mesh(glowGeo, glowMat);
      glowMesh.position.set(spot.x, 0, spot.z);
      this.emberGlowMeshes.push(glowMesh);
      this.group.add(glowMesh);

      // 3. Tactical Hotspot Perimeter Ring (helps pilots gauge drop line & knockdown)
      const ringGeo = new T.RingGeometry(
        spot.radius * 0.96,
        spot.radius * 1.06,
        40,
      );
      ringGeo.rotateX(-Math.PI / 2);
      const ringPos = ringGeo.attributes.position;
      for (let v = 0; v < ringPos.count; v++) {
        const lx = ringPos.getX(v);
        const lz = ringPos.getZ(v);
        ringPos.setY(v, ground(spot.x + lx, spot.z + lz) + 0.34);
      }
      const ringMat = new T.MeshBasicMaterial({
        color: new T.Color('#ff5500'),
        transparent: true,
        opacity: 0.65,
        side: T.DoubleSide,
        blending: T.AdditiveBlending,
        depthWrite: false,
      });
      const ringMesh = new T.Mesh(ringGeo, ringMat);
      ringMesh.position.set(spot.x, 0, spot.z);
      this.hotspotRingMeshes.push(ringMesh);
      this.group.add(ringMesh);
    }
  }

  /**
   * Builds a 3D Cedar & Pine timber grove across the 6 wildfire hotspots so
   * the "Cedar Valley Timber Blaze" visibly engulfs a forest of conifers.
   */
  private initTimberGrove(): void {
    const trunkGeo = new T.CylinderGeometry(0.45, 0.85, 5.5, 6);
    trunkGeo.translate(0, 2.75, 0);
    const tier1Geo = new T.ConeGeometry(4.2, 7.5, 7);
    tier1Geo.translate(0, 6.2, 0);
    const tier2Geo = new T.ConeGeometry(3.2, 6.5, 7);
    tier2Geo.translate(0, 10.2, 0);
    const tier3Geo = new T.ConeGeometry(2.1, 5.2, 7);
    tier3Geo.translate(0, 13.5, 0);
    const crownGlowGeo = new T.ConeGeometry(3.6, 11.5, 7);
    crownGlowGeo.translate(0, 9.2, 0);

    const trunkMat = new T.MeshLambertMaterial({ color: 0x261a14 });

    this.sharedGeometries.push(
      trunkGeo,
      tier1Geo,
      tier2Geo,
      tier3Geo,
      crownGlowGeo,
    );
    this.sharedMaterials.push(trunkMat);

    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const treeCount = 14;

      for (let t = 0; t < treeCount; t++) {
        // Deterministic pseudo-random placement around each hotspot
        const seed = h * 101 + t * 37;
        const fracRadius = 0.16 + ((seed * 19) % 100) / 105;
        const angle =
          (t / treeCount) * Math.PI * 2 + (((seed * 7) % 20) - 10) * 0.03;
        const dist = spot.radius * fracRadius;
        const tx = spot.x + Math.cos(angle) * dist;
        const tz = spot.z + Math.sin(angle) * dist;
        const ty = ground(tx, tz);

        const scale = 0.78 + ((seed * 13) % 45) / 100;
        const treeGroup = new T.Group();
        treeGroup.position.set(tx, ty, tz);
        treeGroup.scale.setScalar(scale);
        treeGroup.rotation.y = (seed % 62) * 0.1;

        const foliageMat = new T.MeshLambertMaterial({
          color: new T.Color('#2d3a24'),
          emissive: new T.Color('#5a1800'),
          emissiveIntensity: 0.65,
        });
        const emberCrownMat = new T.MeshBasicMaterial({
          color: new T.Color('#ff5500'),
          transparent: true,
          opacity: 0.55,
          blending: T.AdditiveBlending,
          depthWrite: false,
          wireframe: true,
        });
        this.sharedMaterials.push(foliageMat, emberCrownMat);

        const trunk = new T.Mesh(trunkGeo, trunkMat);
        const c1 = new T.Mesh(tier1Geo, foliageMat);
        const c2 = new T.Mesh(tier2Geo, foliageMat);
        const c3 = new T.Mesh(tier3Geo, foliageMat);
        const emberCrownMesh = new T.Mesh(crownGlowGeo, emberCrownMat);

        treeGroup.add(trunk, c1, c2, c3, emberCrownMesh);
        this.group.add(treeGroup);

        this.timberTrees.push({
          group: treeGroup,
          hotspotIndex: h,
          foliageMat,
          emberCrownMat,
          emberCrownMesh,
          swayPhase: seed * 0.4,
        });
      }
    }
  }

  /**
   * Builds the 3D Cedar Valley Dip Basin at CEDAR_DIP_POND (-165, 225) so
   * pilots have a clear, visually unmistakable alpine water-scooping reservoir
   * right beside the fire ridge (in addition to the Cedar River).
   */
  private initDipBasin(): void {
    const { x: px, z: pz, radius } = CEDAR_DIP_POND;
    const segments = 24;

    // 1. Shoreline gravel/earth rim
    const shoreDiameter = radius * 2.28;
    const shoreGeo = new T.PlaneGeometry(
      shoreDiameter,
      shoreDiameter,
      segments,
      segments,
    );
    shoreGeo.rotateX(-Math.PI / 2);
    const shorePos = shoreGeo.attributes.position;
    for (let v = 0; v < shorePos.count; v++) {
      const lx = shorePos.getX(v);
      const lz = shorePos.getZ(v);
      shorePos.setY(v, ground(px + lx, pz + lz) + 0.14);
    }
    const shoreMat = new T.MeshBasicMaterial({
      map: createRadialTexture(
        'rgba(58, 77, 68, 0.95)',
        'rgba(78, 92, 74, 0.85)',
        'rgba(60, 74, 52, 0)',
        64,
      ),
      transparent: true,
      depthWrite: false,
    });
    this.dipShoreMesh = new T.Mesh(shoreGeo, shoreMat);
    this.dipShoreMesh.position.set(px, 0, pz);
    this.group.add(this.dipShoreMesh);

    // 2. Shimmering Reservoir Water Surface
    const waterDiameter = radius * 2.0;
    const waterGeo = new T.PlaneGeometry(
      waterDiameter,
      waterDiameter,
      segments,
      segments,
    );
    waterGeo.rotateX(-Math.PI / 2);
    const waterPos = waterGeo.attributes.position;
    for (let v = 0; v < waterPos.count; v++) {
      const lx = waterPos.getX(v);
      const lz = waterPos.getZ(v);
      waterPos.setY(v, ground(px + lx, pz + lz) + 0.24);
    }
    const waterMat = new T.MeshBasicMaterial({
      map: createRadialTexture(
        'rgba(14, 116, 144, 0.96)',
        'rgba(2, 132, 199, 0.88)',
        'rgba(56, 189, 248, 0)',
        64,
      ),
      color: new T.Color('#38bdf8'),
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    this.dipWaterMesh = new T.Mesh(waterGeo, waterMat);
    this.dipWaterMesh.position.set(px, 0, pz);
    this.group.add(this.dipWaterMesh);

    // 3. Tactical Cyan Scoop Corridor Ring
    const beaconGeo = new T.RingGeometry(radius * 0.72, radius * 0.82, 48);
    beaconGeo.rotateX(-Math.PI / 2);
    const bPos = beaconGeo.attributes.position;
    for (let v = 0; v < bPos.count; v++) {
      const lx = bPos.getX(v);
      const lz = bPos.getZ(v);
      bPos.setY(v, ground(px + lx, pz + lz) + 0.42);
    }
    const beaconMat = new T.MeshBasicMaterial({
      color: new T.Color('#38bdf8'),
      transparent: true,
      opacity: 0.75,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.dipBeaconRing = new T.Mesh(beaconGeo, beaconMat);
    this.dipBeaconRing.position.set(px, 0, pz);
    this.group.add(this.dipBeaconRing);

    // 4. Elevated Pulse Ring (guides pilots from high altitude)
    const pulseGeo = new T.RingGeometry(radius * 0.45, radius * 0.54, 36);
    pulseGeo.rotateX(-Math.PI / 2);
    const pulseMat = new T.MeshBasicMaterial({
      color: new T.Color('#7dd3fc'),
      transparent: true,
      opacity: 0.5,
      side: T.DoubleSide,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.dipOuterPulseRing = new T.Mesh(pulseGeo, pulseMat);
    this.dipOuterPulseRing.position.set(px, ground(px, pz) + 3.2, pz);
    this.group.add(this.dipOuterPulseRing);

    // 5. High-Visibility Perimeter Marker Buoys
    const buoyGeo = new T.SphereGeometry(1.35, 8, 8);
    const buoyMat = new T.MeshBasicMaterial({ color: 0xf97316 });
    this.sharedGeometries.push(buoyGeo);
    this.sharedMaterials.push(buoyMat);

    const buoyCount = 10;
    for (let i = 0; i < buoyCount; i++) {
      const a = (i / buoyCount) * Math.PI * 2;
      const bx = px + Math.cos(a) * (radius * 0.86);
      const bz = pz + Math.sin(a) * (radius * 0.86);
      const by = ground(bx, bz) + 0.65;
      const buoy = new T.Mesh(buoyGeo, buoyMat);
      buoy.position.set(bx, by, bz);
      this.dipBuoyMeshes.push(buoy);
      this.group.add(buoy);
    }
  }

  /**
   * Pre-allocates terrain-projected crimson Phos-Chek retardant decals that
   * paint the ridge as the player drops fire retardant.
   */
  private initRetardantSwaths(): void {
    const decalGeo = new T.PlaneGeometry(1, 1);
    decalGeo.rotateX(-Math.PI / 2);
    this.sharedGeometries.push(decalGeo);

    for (let i = 0; i < this.maxRetardantDecals; i++) {
      const mat = new T.MeshBasicMaterial({
        map: this.retardantTex,
        color: new T.Color('#f43f5e'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new T.Mesh(decalGeo, mat);
      mesh.visible = false;
      this.retardantDecalPool.push(mesh);
      this.group.add(mesh);
    }
  }

  private initBillboardFlames(): void {
    const billboardsPerSpot = 10;

    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];

      for (let b = 0; b < billboardsPerSpot; b++) {
        const angle = (b / billboardsPerSpot) * Math.PI * 2 + b * 0.45;
        const dist =
          b === 0 ? 0 : (0.2 + 0.68 * (b / billboardsPerSpot)) * spot.radius;
        const wx = spot.x + Math.cos(angle) * dist;
        const wz = spot.z + Math.sin(angle) * dist;
        const wy = ground(wx, wz);

        const width = 15 + Math.random() * 7;
        const height = 19 + Math.random() * 9;

        const geo = new T.PlaneGeometry(width, height);
        geo.translate(0, height / 2, 0);

        const mat = new T.MeshBasicMaterial({
          map: this.billboardFlameTex,
          transparent: true,
          blending: T.AdditiveBlending,
          depthWrite: false,
          side: T.DoubleSide,
        });

        const mesh = new T.Mesh(geo, mat);
        mesh.position.set(wx, wy, wz);

        this.flameBillboards.push({
          mesh,
          hotspotIndex: h,
          baseWidth: width,
          baseHeight: height,
          phaseOffset: Math.random() * Math.PI * 2,
          speed: 8.0 + Math.random() * 6.0,
          baseX: wx,
          baseY: wy,
          baseZ: wz,
        });

        this.group.add(mesh);
      }
    }
  }

  private initPointLights(): void {
    for (const spot of this.state.hotspots) {
      const spotY = ground(spot.x, spot.z);
      const light = new T.PointLight(0xff5510, 4.6, 110, 1.5);
      light.position.set(spot.x, spotY + 4.5, spot.z);
      this.pointLights.push(light);
      this.group.add(light);
    }
  }

  private initFlameParticles(): void {
    const geo = new T.BufferGeometry();
    let idx = 0;
    const perSpot = Math.floor(this.fireCount / this.state.hotspots.length);

    for (const spot of this.state.hotspots) {
      const spotY = ground(spot.x, spot.z);
      for (let i = 0; i < perSpot; i++) {
        this.fireAngles[idx] = Math.random() * Math.PI * 2;
        this.fireRadii[idx] = Math.random() * spot.radius * 0.92;
        this.fireHeights[idx] = Math.random() * 8.5;
        this.fireSpeeds[idx] = 5.5 + Math.random() * 8.5;

        this.firePositions[idx * 3] =
          spot.x + Math.cos(this.fireAngles[idx]) * this.fireRadii[idx];
        this.firePositions[idx * 3 + 1] = spotY + this.fireHeights[idx];
        this.firePositions[idx * 3 + 2] =
          spot.z + Math.sin(this.fireAngles[idx]) * this.fireRadii[idx];

        this.fireColors[idx * 3] = 1.0;
        this.fireColors[idx * 3 + 1] = 0.72;
        this.fireColors[idx * 3 + 2] = 0.18;
        this.fireAlphas[idx] = 0.92;
        this.fireSizes[idx] = 1.0;
        idx++;
      }
    }

    geo.setAttribute('position', new T.BufferAttribute(this.firePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.fireColors, 3));
    geo.setAttribute('fxAlpha', new T.BufferAttribute(this.fireAlphas, 1));
    geo.setAttribute('fxSize', new T.BufferAttribute(this.fireSizes, 1));

    const mat = new T.PointsMaterial({
      size: 18.0,
      map: this.flameTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    attachVariableParticleShader(mat);

    this.firePoints = new T.Points(geo, mat);
    this.group.add(this.firePoints);
  }

  private initEmberParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.emberCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      this.resetEmber(i, spot);
    }

    geo.setAttribute('position', new T.BufferAttribute(this.emberPositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.emberColors, 3));

    const mat = new T.PointsMaterial({
      size: 4.8,
      map: this.emberTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });

    this.emberPoints = new T.Points(geo, mat);
    this.group.add(this.emberPoints);
  }

  private resetEmber(i: number, spot: (typeof this.state.hotspots)[0]): void {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.random() * spot.radius * 0.95;
    const wx = spot.x + Math.cos(angle) * rad;
    const wz = spot.z + Math.sin(angle) * rad;
    const wy = ground(wx, wz);

    this.emberPositions[i * 3] = wx;
    this.emberPositions[i * 3 + 1] = wy + 0.5 + Math.random() * 4.5;
    this.emberPositions[i * 3 + 2] = wz;

    this.emberVelocities[i * 3] = (Math.random() - 0.5) * 8.5;
    this.emberVelocities[i * 3 + 1] = 11.0 + Math.random() * 18.0;
    this.emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 8.5;

    const maxLife = 1.5 + Math.random() * 2.4;
    this.emberLifetimes[i * 2] = Math.random() * maxLife * 0.4;
    this.emberLifetimes[i * 2 + 1] = maxLife;

    this.emberColors[i * 3] = 1.0;
    this.emberColors[i * 3 + 1] = 0.62 + Math.random() * 0.35;
    this.emberColors[i * 3 + 2] = 0.08;
  }

  private initSmokeParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.random() * spot.radius * 0.85;
      this.smokeBaseRadii[i] = rad;

      const wx = spot.x + Math.cos(angle) * rad;
      const wz = spot.z + Math.sin(angle) * rad;
      const wy = ground(wx, wz);
      const startH = Math.random() * 340;

      this.smokePositions[i * 3] = wx;
      this.smokePositions[i * 3 + 1] = wy + startH;
      this.smokePositions[i * 3 + 2] = wz;

      this.smokeVelocities[i * 3] = (Math.random() - 0.5) * 3.2;
      this.smokeVelocities[i * 3 + 1] = 6.5 + Math.random() * 9.5;
      this.smokeVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3.2;

      const shade = 0.14 + Math.random() * 0.18;
      this.smokeColors[i * 3] = shade * 1.15;
      this.smokeColors[i * 3 + 1] = shade;
      this.smokeColors[i * 3 + 2] = shade * 0.85;
      this.smokeAlphas[i] = 0.65;
      this.smokeSizes[i] = 0.45 + (startH / 340) * 1.1;
    }

    geo.setAttribute('position', new T.BufferAttribute(this.smokePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.smokeColors, 3));
    geo.setAttribute('fxAlpha', new T.BufferAttribute(this.smokeAlphas, 1));
    geo.setAttribute('fxSize', new T.BufferAttribute(this.smokeSizes, 1));

    const mat = new T.PointsMaterial({
      size: 64.0,
      map: this.smokeTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.68,
      depthWrite: false,
    });
    attachVariableParticleShader(mat);

    this.smokePoints = new T.Points(geo, mat);
    this.group.add(this.smokePoints);
  }

  private initSteamParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.steamMaxCount; i++) {
      this.steamPositions[i * 3] = 0;
      this.steamPositions[i * 3 + 1] = -500;
      this.steamPositions[i * 3 + 2] = 0;

      this.steamColors[i * 3] = 0.96;
      this.steamColors[i * 3 + 1] = 0.98;
      this.steamColors[i * 3 + 2] = 1.0;
      this.steamAlphas[i] = 0;
      this.steamSizes[i] = 1.0;
    }

    geo.setAttribute('position', new T.BufferAttribute(this.steamPositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.steamColors, 3));
    geo.setAttribute('fxAlpha', new T.BufferAttribute(this.steamAlphas, 1));
    geo.setAttribute('fxSize', new T.BufferAttribute(this.steamSizes, 1));

    const mat = new T.PointsMaterial({
      size: 36.0,
      map: this.steamTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    });
    attachVariableParticleShader(mat);

    this.steamPoints = new T.Points(geo, mat);
    this.group.add(this.steamPoints);
  }

  update(
    dt: number,
    sim: Simulation,
    time: number,
    camera?: T.Camera,
  ): void {
    if (!this.firePoints || !this.smokePoints || !this.emberPoints) return;

    const wind = sim.windVector;

    // 1. Animate Conforming Burning Ground, Ember Glow, & Tactical Hotspot Rings
    for (let i = 0; i < this.state.hotspots.length; i++) {
      const spot = this.state.hotspots[i];
      const intensity = spot.intensity;
      const scorch = this.burningGroundMeshes[i];
      const glow = this.emberGlowMeshes[i];
      const ring = this.hotspotRingMeshes[i];
      const light = this.pointLights[i];

      if (scorch) {
        const mat = scorch.material as T.MeshBasicMaterial;
        mat.opacity = 0.55 + intensity * 0.42;
      }

      if (glow) {
        const glowMat = glow.material as T.MeshBasicMaterial;
        if (intensity <= 0.01) {
          glow.visible = false;
        } else {
          glow.visible = true;
          const heatPulse = 0.65 + 0.35 * Math.sin(time * 5.5 + i * 2.1);
          glowMat.opacity = intensity * heatPulse * 0.95;
          const hueShift = 0.05 + 0.025 * Math.sin(time * 8.0 + i);
          glowMat.color.setHSL(hueShift, 1.0, 0.45 + heatPulse * 0.15);
        }
      }

      if (ring) {
        const ringMat = ring.material as T.MeshBasicMaterial;
        if (intensity <= 0.06) {
          // Contained emerald ring subtle glow
          ringMat.color.setHex(0x10b981);
          ringMat.opacity = 0.22 + 0.08 * Math.sin(time * 3.0 + i);
        } else {
          const pulse = 0.45 + 0.25 * Math.sin(time * 6.0 + i * 1.4);
          ringMat.opacity = (0.28 + intensity * 0.45) * pulse;
          ringMat.color.setHSL(0.04 + (1 - intensity) * 0.08, 1.0, 0.52);
        }
      }

      if (light) {
        if (intensity <= 0.01) {
          light.intensity = 0;
        } else {
          const flicker =
            Math.sin(time * 18 + i * 2.7) * 0.6 +
            Math.cos(time * 31 + i) * 0.3;
          light.intensity = intensity * (4.0 + flicker);
        }
      }
    }

    // 2. Animate Cedar Valley Timber Grove (Crown Fire Glow + Thermal Sway)
    for (let i = 0; i < this.timberTrees.length; i++) {
      const tree = this.timberTrees[i];
      const spot = this.state.hotspots[tree.hotspotIndex];
      const intensity = spot.intensity;

      // Thermal updraft and wind sway
      const swayAmp = 0.018 + intensity * 0.032;
      tree.group.rotation.z =
        Math.sin(time * 3.6 + tree.swayPhase) * swayAmp + wind.x * 0.002;
      tree.group.rotation.x =
        Math.cos(time * 2.9 + tree.swayPhase) * swayAmp + wind.z * 0.002;

      if (intensity <= 0.06) {
        tree.emberCrownMesh.visible = false;
        tree.foliageMat.color.setHex(0x232620);
        tree.foliageMat.emissiveIntensity = 0;
      } else {
        tree.emberCrownMesh.visible = true;
        const pulse = 0.6 + 0.4 * Math.sin(time * 9.0 + tree.swayPhase);
        tree.emberCrownMat.opacity = intensity * pulse * 0.52;
        tree.foliageMat.color.setHSL(
          0.26,
          0.25 * (1 - intensity * 0.6),
          0.14 + (1 - intensity) * 0.08,
        );
        tree.foliageMat.emissiveIntensity = intensity * (0.45 + 0.35 * pulse);
      }
    }

    // 3. Animate Cedar Valley Dip Basin (Water Shimmer & Low-Tank Scoop Beacon)
    if (this.dipWaterMesh && this.dipBeaconRing && this.dipOuterPulseRing) {
      const tankRatio =
        this.state.waterTank / Math.max(1, this.state.waterCapacity);
      const needsWater = tankRatio < 0.45;
      const beaconMat = this.dipBeaconRing.material as T.MeshBasicMaterial;
      const pulseMat = this.dipOuterPulseRing.material as T.MeshBasicMaterial;

      const wave = 0.5 + 0.5 * Math.sin(time * (needsWater ? 5.5 : 2.8));
      beaconMat.opacity = needsWater ? 0.55 + wave * 0.4 : 0.3 + wave * 0.2;

      const ringScale = 0.85 + ((time * (needsWater ? 0.65 : 0.35)) % 1.0) * 0.55;
      this.dipOuterPulseRing.scale.set(ringScale, ringScale, 1);
      pulseMat.opacity =
        (needsWater ? 0.65 : 0.3) * (1 - (ringScale - 0.85) / 0.55);
    }

    // 4. Sync Persistent Phos-Chek Retardant Swath Decals
    const drops = this.state.retardantDrops;
    for (let i = 0; i < this.maxRetardantDecals; i++) {
      const mesh = this.retardantDecalPool[i];
      if (i < drops.length) {
        const d = drops[i];
        if (!mesh.visible) {
          mesh.visible = true;
        }
        const gy = ground(d.x, d.z) + 0.31 + (i % 5) * 0.006;
        mesh.position.set(d.x, gy, d.z);
        mesh.rotation.y = d.heading;
        mesh.scale.set(d.radius * 1.85, 1, d.radius * 2.25);
        const mat = mesh.material as T.MeshBasicMaterial;
        mat.opacity = Math.min(0.85, d.alpha * 0.78);
      } else if (mesh.visible) {
        mesh.visible = false;
      }
    }

    // 5. Animate Leaping 3D Billboard Flame Sheets
    for (let i = 0; i < this.flameBillboards.length; i++) {
      const b = this.flameBillboards[i];
      const spot = this.state.hotspots[b.hotspotIndex];
      const intensity = spot.intensity;

      if (intensity <= 0.01) {
        b.mesh.visible = false;
        continue;
      }

      b.mesh.visible = true;

      if (camera) {
        b.mesh.rotation.y = Math.atan2(
          camera.position.x - b.mesh.position.x,
          camera.position.z - b.mesh.position.z,
        );
      } else {
        b.mesh.rotation.y = Math.atan2(
          sim.x - b.mesh.position.x,
          sim.z - b.mesh.position.z,
        );
      }

      const flicker =
        1.0 +
        0.26 * Math.sin(time * b.speed + b.phaseOffset) +
        0.14 * Math.cos(time * (b.speed * 1.8) + b.phaseOffset * 2.3);
      const widthScale =
        intensity * (1.0 + 0.12 * Math.sin(time * 7 + b.phaseOffset));
      const heightScale = intensity * flicker;

      b.mesh.scale.set(widthScale, heightScale, widthScale);
      b.mesh.position.x = b.baseX + wind.x * 0.25 * (flicker - 0.8);
      b.mesh.position.z = b.baseZ + wind.z * 0.25 * (flicker - 0.8);
    }

    // 6. Animate Dynamic Flame Particles
    const firePos = this.firePoints.geometry.attributes
      .position as T.BufferAttribute;
    const fireCol = this.firePoints.geometry.attributes
      .color as T.BufferAttribute;
    const fireAlpha = this.firePoints.geometry.attributes
      .fxAlpha as T.BufferAttribute;
    const fireSize = this.firePoints.geometry.attributes
      .fxSize as T.BufferAttribute;

    let pIdx = 0;
    const perSpot = Math.floor(this.fireCount / this.state.hotspots.length);
    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const spotY = ground(spot.x, spot.z);
      const intensity = spot.intensity;

      for (let i = 0; i < perSpot; i++) {
        if (intensity <= 0.01) {
          firePos.setY(pIdx, -500);
          fireAlpha.setX(pIdx, 0);
        } else {
          this.fireHeights[pIdx] += this.fireSpeeds[pIdx] * dt;
          const maxFlameH =
            (7.5 + Math.sin(time * 16 + pIdx) * 2.6) * intensity;

          if (this.fireHeights[pIdx] > maxFlameH) {
            this.fireHeights[pIdx] = Math.random() * 0.5;
            this.fireAngles[pIdx] = Math.random() * Math.PI * 2;
            this.fireRadii[pIdx] = Math.random() * spot.radius * 0.88;
          }

          const angle = this.fireAngles[pIdx] + time * 0.35;
          const rad = this.fireRadii[pIdx];
          const x = spot.x + Math.cos(angle) * rad + wind.x * 0.2;
          const y = spotY + this.fireHeights[pIdx];
          const z = spot.z + Math.sin(angle) * rad + wind.z * 0.2;

          firePos.setXYZ(pIdx, x, y, z);

          const heightRatio = Math.min(
            1,
            this.fireHeights[pIdx] / Math.max(0.1, maxFlameH),
          );
          const r = 1.0 * intensity;
          const g = (0.78 - heightRatio * 0.55) * intensity;
          const b = Math.max(0.02, 0.28 - heightRatio * 0.25) * intensity;

          fireCol.setXYZ(pIdx, r, g, b);
          fireAlpha.setX(pIdx, (1 - heightRatio * 0.75) * intensity);
          fireSize.setX(pIdx, (1.15 - heightRatio * 0.45) * intensity);
        }
        pIdx++;
      }
    }
    firePos.needsUpdate = true;
    fireCol.needsUpdate = true;
    fireAlpha.needsUpdate = true;
    fireSize.needsUpdate = true;

    // 7. Animate Flying Embers & Sparks
    const emberPos = this.emberPoints.geometry.attributes
      .position as T.BufferAttribute;
    const emberCol = this.emberPoints.geometry.attributes
      .color as T.BufferAttribute;

    for (let i = 0; i < this.emberCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      if (spot.intensity <= 0.01) {
        emberPos.setY(i, -500);
        continue;
      }

      this.emberLifetimes[i * 2] += dt;
      const life = this.emberLifetimes[i * 2];
      const maxLife = this.emberLifetimes[i * 2 + 1];

      if (life >= maxLife) {
        this.resetEmber(i, spot);
        continue;
      }

      const x =
        emberPos.getX(i) + (this.emberVelocities[i * 3] + wind.x * 0.85) * dt;
      const y = emberPos.getY(i) + this.emberVelocities[i * 3 + 1] * dt;
      const z =
        emberPos.getZ(i) +
        (this.emberVelocities[i * 3 + 2] + wind.z * 0.85) * dt;

      emberPos.setXYZ(i, x, y, z);

      const lifeRatio = 1 - life / maxLife;
      const sparkFlicker = 0.7 + Math.sin(time * 35 + i * 5) * 0.3;
      const bBright = lifeRatio * sparkFlicker * spot.intensity;

      emberCol.setXYZ(
        i,
        1.0 * bBright,
        (0.65 + Math.sin(time * 22 + i) * 0.3) * bBright,
        0.12 * bBright,
      );
    }
    emberPos.needsUpdate = true;
    emberCol.needsUpdate = true;

    // 8. Animate Massive Volumetric Smoke Plumes (Billowing & Under-Lit at Base)
    const smokePos = this.smokePoints.geometry.attributes
      .position as T.BufferAttribute;
    const smokeCol = this.smokePoints.geometry.attributes
      .color as T.BufferAttribute;
    const smokeAlpha = this.smokePoints.geometry.attributes
      .fxAlpha as T.BufferAttribute;
    const smokeSize = this.smokePoints.geometry.attributes
      .fxSize as T.BufferAttribute;

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      const spotY = ground(spot.x, spot.z);
      if (spot.intensity <= 0.01) {
        smokePos.setY(i, -500);
        smokeAlpha.setX(i, 0);
        continue;
      }

      let y = smokePos.getY(i);
      if (y < spotY) {
        y = spotY + Math.random() * 8;
      }
      y += this.smokeVelocities[i * 3 + 1] * (0.45 + 0.55 * spot.intensity) * dt;
      const plumeH = Math.max(0, y - spotY);
      const altFactor = Math.min(1, plumeH / 370);

      // Swirl and wind shear increase with altitude
      const swirlX = Math.sin(time * 0.9 + i * 0.7) * 2.4 * altFactor;
      const swirlZ = Math.cos(time * 0.8 + i * 0.5) * 2.4 * altFactor;
      let x =
        smokePos.getX(i) +
        (this.smokeVelocities[i * 3] + wind.x * (0.45 + altFactor * 0.65) + swirlX) *
          dt;
      let z =
        smokePos.getZ(i) +
        (this.smokeVelocities[i * 3 + 2] +
          wind.z * (0.45 + altFactor * 0.65) +
          swirlZ) *
          dt;

      if (plumeH > 380) {
        y = spotY + Math.random() * 4.5;
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * spot.radius * 0.75;
        x = spot.x + Math.cos(angle) * rad;
        z = spot.z + Math.sin(angle) * rad;
      }

      smokePos.setXYZ(i, x, y, z);

      // Warm fire-lit base transitioning to dark ash-grey column and lighter cloud top
      const fireGlow = Math.max(0, 1 - plumeH / 48) * spot.intensity;
      const baseShade = 0.14 + altFactor * 0.28;
      const r = baseShade + fireGlow * 0.48 + 0.04 * altFactor;
      const g = baseShade + fireGlow * 0.18 + 0.02 * altFactor;
      const b = baseShade - fireGlow * 0.04;

      smokeCol.setXYZ(i, r, g, b);

      // Smooth fade-in at ground, dense core, smooth fade-out at top of column
      const fadeIn = Math.min(1, plumeH / 18);
      const fadeOut = Math.max(0, 1 - Math.pow(altFactor, 1.8));
      smokeAlpha.setX(i, fadeIn * fadeOut * (0.35 + 0.65 * spot.intensity));
      smokeSize.setX(i, 0.38 + altFactor * 1.25);
    }
    smokePos.needsUpdate = true;
    smokeCol.needsUpdate = true;
    smokeAlpha.needsUpdate = true;
    smokeSize.needsUpdate = true;

    // 9. Animate Steam Puff Explosions (On Retardant Hit / Hotspot Knockdown)
    if (this.steamPoints && this.state.steamPuffs) {
      const steamPos = this.steamPoints.geometry.attributes
        .position as T.BufferAttribute;
      const steamCol = this.steamPoints.geometry.attributes
        .color as T.BufferAttribute;
      const steamAlpha = this.steamPoints.geometry.attributes
        .fxAlpha as T.BufferAttribute;
      const steamSize = this.steamPoints.geometry.attributes
        .fxSize as T.BufferAttribute;

      const puffs = this.state.steamPuffs;
      for (let i = 0; i < this.steamMaxCount; i++) {
        if (i < puffs.length) {
          const p = puffs[i];
          steamPos.setXYZ(i, p.x, p.y, p.z);
          const progress = p.life / Math.max(0.1, p.maxLife);
          const lifeRatio = Math.max(0, 1 - progress);
          steamCol.setXYZ(i, 0.96, 0.98, 1.0);
          steamAlpha.setX(i, Math.sin(lifeRatio * Math.PI * 0.5) * 0.85);
          steamSize.setX(i, 0.55 + progress * 1.35);
        } else {
          steamPos.setY(i, -500);
          steamAlpha.setX(i, 0);
        }
      }
      steamPos.needsUpdate = true;
      steamCol.needsUpdate = true;
      steamAlpha.needsUpdate = true;
      steamSize.needsUpdate = true;
    }

    // 10. Dynamic Atmospheric Scene Fog & Smoke Obscuration
    if (this.scene.fog && this.scene.fog instanceof T.FogExp2) {
      const exposure = this.state.smokeExposure ?? 0;
      if (exposure > 0.02) {
        const smokeFogDensity = 0.0001 + exposure * 0.0055;
        this.scene.fog.density = Math.max(
          this.scene.fog.density,
          smokeFogDensity,
        );

        const smokeFogColor = new T.Color('#382d22').lerp(
          new T.Color('#241f1a'),
          exposure,
        );
        this.scene.fog.color.lerp(smokeFogColor, Math.min(1, exposure * 0.75));
      }
    }
  }

  dispose(): void {
    if (this.firePoints) {
      this.firePoints.geometry.dispose();
      (this.firePoints.material as T.Material).dispose();
      this.group.remove(this.firePoints);
      this.firePoints = null;
    }
    if (this.emberPoints) {
      this.emberPoints.geometry.dispose();
      (this.emberPoints.material as T.Material).dispose();
      this.group.remove(this.emberPoints);
      this.emberPoints = null;
    }
    if (this.smokePoints) {
      this.smokePoints.geometry.dispose();
      (this.smokePoints.material as T.Material).dispose();
      this.group.remove(this.smokePoints);
      this.smokePoints = null;
    }
    if (this.steamPoints) {
      this.steamPoints.geometry.dispose();
      (this.steamPoints.material as T.Material).dispose();
      this.group.remove(this.steamPoints);
      this.steamPoints = null;
    }

    for (const b of this.flameBillboards) {
      b.mesh.geometry.dispose();
      (b.mesh.material as T.Material).dispose();
      this.group.remove(b.mesh);
    }
    this.flameBillboards = [];

    for (const mesh of this.burningGroundMeshes) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
      this.group.remove(mesh);
    }
    this.burningGroundMeshes = [];

    for (const mesh of this.emberGlowMeshes) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
      this.group.remove(mesh);
    }
    this.emberGlowMeshes = [];

    for (const mesh of this.hotspotRingMeshes) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
      this.group.remove(mesh);
    }
    this.hotspotRingMeshes = [];

    for (const tree of this.timberTrees) {
      this.group.remove(tree.group);
    }
    this.timberTrees = [];

    for (const mesh of this.retardantDecalPool) {
      (mesh.material as T.Material).dispose();
      this.group.remove(mesh);
    }
    this.retardantDecalPool = [];

    for (const mesh of [
      this.dipWaterMesh,
      this.dipShoreMesh,
      this.dipBeaconRing,
      this.dipOuterPulseRing,
    ]) {
      if (mesh) {
        mesh.geometry.dispose();
        (mesh.material as T.Material).dispose();
        this.group.remove(mesh);
      }
    }
    this.dipWaterMesh = null;
    this.dipShoreMesh = null;
    this.dipBeaconRing = null;
    this.dipOuterPulseRing = null;

    for (const buoy of this.dipBuoyMeshes) {
      this.group.remove(buoy);
    }
    this.dipBuoyMeshes = [];

    for (const geo of this.sharedGeometries) {
      geo.dispose();
    }
    this.sharedGeometries = [];

    for (const mat of this.sharedMaterials) {
      mat.dispose();
    }
    this.sharedMaterials = [];

    for (const light of this.pointLights) {
      this.group.remove(light);
      light.dispose();
    }
    this.pointLights = [];

    this.groundTex.dispose();
    this.billboardFlameTex.dispose();
    this.flameTex.dispose();
    this.emberTex.dispose();
    this.smokeTex.dispose();
    this.steamTex.dispose();
    this.retardantTex.dispose();

    this.scene.remove(this.group);
  }
}
