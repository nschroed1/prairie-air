import * as T from 'three';
import type { FirefightingState } from './firefighting';
import type { Simulation } from './simulation';
import { ground } from './terrain-math';

function createRadialTexture(
  innerColor: string,
  midColor: string,
  outerColor: string,
  size = 32,
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
      grad.addColorStop(0.35, midColor);
      grad.addColorStop(0.75, outerColor);
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
 * Creates high-detail procedural burning ground texture featuring:
 * - Charred black carbon crust
 * - Radiant branching magma fissure veins (#ff3300 -> #ff9900 -> #fff2a8)
 * - Molten glowing ember embers
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
      // 1. Dark charcoal carbon base
      ctx.fillStyle = '#161210';
      ctx.fillRect(0, 0, size, size);

      // 2. Burning ember glow wash
      const bgGrad = ctx.createRadialGradient(half, half, 4, half, half, half * 0.9);
      bgGrad.addColorStop(0, 'rgba(255, 68, 0, 0.85)');
      bgGrad.addColorStop(0.45, 'rgba(180, 40, 10, 0.65)');
      bgGrad.addColorStop(0.8, 'rgba(40, 16, 10, 0.4)');
      bgGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, size, size);

      // 3. Procedural branching magma fissures & glowing veins
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

        // Outer red-orange glow
        ctx.strokeStyle = depth === 0 ? '#ff3300' : '#ff6600';
        ctx.lineWidth = Math.max(1.2, 5 - depth * 1.3);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();

        // Inner hot gold/yellow core
        ctx.strokeStyle = depth === 0 ? '#ffdd44' : '#ffaa22';
        ctx.lineWidth = Math.max(0.8, 2.5 - depth * 0.7);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.quadraticCurveTo(mx, my, x2, y2);
        ctx.stroke();

        // Branching splits
        if (depth < 2 && Math.random() > 0.3) {
          const bx = mx + (Math.random() - 0.5) * 24;
          const by = my + (Math.random() - 0.5) * 24;
          drawVein(mx, my, bx, by, depth + 1);
        }
        drawVein(x1, y1, mx, my, depth + 1);
        drawVein(mx, my, x2, y2, depth + 1);
      };

      // Generate 8 main fissure lines from center
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const r = half * (0.6 + Math.random() * 0.3);
        const ex = half + Math.cos(angle) * r;
        const ey = half + Math.sin(angle) * r;
        drawVein(half, half, ex, ey, 0);
      }

      // 4. White-hot center magma core
      const coreGrad = ctx.createRadialGradient(half, half, 0, half, half, half * 0.35);
      coreGrad.addColorStop(0, 'rgba(255, 255, 230, 0.95)');
      coreGrad.addColorStop(0.3, 'rgba(255, 200, 50, 0.85)');
      coreGrad.addColorStop(0.7, 'rgba(255, 80, 0, 0.4)');
      coreGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fillRect(0, 0, size, size);

      // 5. Feathered radial edge transparency mask
      ctx.globalCompositeOperation = 'destination-in';
      const maskGrad = ctx.createRadialGradient(half, half, half * 0.4, half, half, half * 0.98);
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
      const alpha = Math.max(0, Math.min(255, Math.round(255 * (1 - Math.min(1, d)))));
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
 * Creates realistic 3D billboard flame texture featuring:
 * - Leaping multi-tongued fire silhouette
 * - Bright incandescent white-hot core
 * - Searing gold mid-body
 * - Deep crimson-orange flickering edges
 */
function createBillboardFlameTexture(w = 128, h = 256): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, w, h);

      // Outer Flame Tongue Envelope (Crimson / Deep Orange)
      ctx.beginPath();
      ctx.moveTo(w * 0.1, h);
      ctx.bezierCurveTo(w * 0.05, h * 0.65, w * 0.22, h * 0.35, w * 0.5, h * 0.04);
      ctx.bezierCurveTo(w * 0.78, h * 0.35, w * 0.95, h * 0.65, w * 0.9, h);
      ctx.closePath();
      const outerGrad = ctx.createLinearGradient(0, h, 0, 0);
      outerGrad.addColorStop(0, 'rgba(255, 140, 20, 0.98)');
      outerGrad.addColorStop(0.35, 'rgba(255, 60, 10, 0.92)');
      outerGrad.addColorStop(0.7, 'rgba(220, 25, 5, 0.7)');
      outerGrad.addColorStop(1, 'rgba(160, 10, 0, 0)');
      ctx.fillStyle = outerGrad;
      ctx.fill();

      // Middle Vibrant Yellow / Orange Licking Tongues
      ctx.beginPath();
      ctx.moveTo(w * 0.22, h);
      ctx.bezierCurveTo(w * 0.18, h * 0.6, w * 0.32, h * 0.38, w * 0.48, h * 0.16);
      ctx.bezierCurveTo(w * 0.68, h * 0.38, w * 0.82, h * 0.6, w * 0.78, h);
      ctx.closePath();
      const midGrad = ctx.createLinearGradient(0, h, 0, h * 0.15);
      midGrad.addColorStop(0, 'rgba(255, 235, 80, 0.98)');
      midGrad.addColorStop(0.4, 'rgba(255, 160, 20, 0.92)');
      midGrad.addColorStop(0.85, 'rgba(255, 75, 10, 0.5)');
      midGrad.addColorStop(1, 'rgba(240, 30, 0, 0)');
      ctx.fillStyle = midGrad;
      ctx.fill();

      // Inner White-Hot Core
      ctx.beginPath();
      ctx.moveTo(w * 0.35, h);
      ctx.bezierCurveTo(w * 0.32, h * 0.72, w * 0.4, h * 0.52, w * 0.5, h * 0.32);
      ctx.bezierCurveTo(w * 0.6, h * 0.52, w * 0.68, h * 0.72, w * 0.65, h);
      ctx.closePath();
      const coreGrad = ctx.createLinearGradient(0, h, 0, h * 0.3);
      coreGrad.addColorStop(0, 'rgba(255, 255, 245, 1)');
      coreGrad.addColorStop(0.5, 'rgba(255, 245, 150, 0.95)');
      coreGrad.addColorStop(1, 'rgba(255, 180, 40, 0)');
      ctx.fillStyle = coreGrad;
      ctx.fill();

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
      const alpha = Math.max(0, Math.min(255, Math.round(255 * ny * (1 - nx))));
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

export class FirefightingWorld {
  private group = new T.Group();

  // 1. Terrain-Conforming Burning Ground Meshes
  private burningGroundMeshes: T.Mesh[] = [];
  private emberGlowMeshes: T.Mesh[] = [];

  // 2. Towering 3D Billboard Flame Walls (18m - 26m leaping fire)
  private flameBillboards: FlameBillboard[] = [];

  // 3. Dynamic Flame Particle Sprites
  private firePoints: T.Points | null = null;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private fireHeights: Float32Array;
  private fireRadii: Float32Array;
  private fireAngles: Float32Array;
  private fireSpeeds: Float32Array;
  private fireCount: number;

  // 4. Flying Embers & Sparks System
  private emberPoints: T.Points | null = null;
  private emberPositions: Float32Array;
  private emberColors: Float32Array;
  private emberVelocities: Float32Array;
  private emberLifetimes: Float32Array;
  private emberCount = 280;

  // 5. Massive Towering Smoke Plumes (Up to 420m sky columns)
  private smokePoints: T.Points | null = null;
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private smokeVelocities: Float32Array;
  private smokeBaseRadii: Float32Array;
  private smokeCount = 420;

  // 6. Steam Puff Explosions on Extinguish
  private steamPoints: T.Points | null = null;
  private steamPositions: Float32Array;
  private steamColors: Float32Array;
  private steamMaxCount = 80;

  // 7. Point Lights for Flame Illumination
  private pointLights: T.PointLight[] = [];

  // Textures
  private groundTex: T.Texture;
  private billboardFlameTex: T.Texture;
  private flameTex: T.Texture;
  private emberTex: T.Texture;
  private smokeTex: T.Texture;
  private steamTex: T.Texture;

  constructor(
    private scene: T.Scene,
    private state: FirefightingState,
  ) {
    this.fireCount = state.hotspots.length * 40;

    this.groundTex = createBurningGroundTexture(128);
    this.billboardFlameTex = createBillboardFlameTexture(128, 256);
    this.flameTex = createRadialTexture(
      'rgba(255, 255, 230, 1)',
      'rgba(255, 150, 20, 0.9)',
      'rgba(220, 40, 30, 0.3)',
      32,
    );
    this.emberTex = createRadialTexture(
      'rgba(255, 255, 240, 1)',
      'rgba(255, 190, 50, 0.95)',
      'rgba(249, 115, 22, 0.4)',
      16,
    );
    this.smokeTex = createRadialTexture(
      'rgba(65, 55, 45, 0.85)',
      'rgba(40, 34, 28, 0.65)',
      'rgba(20, 18, 15, 0.15)',
      32,
    );
    this.steamTex = createRadialTexture(
      'rgba(245, 248, 255, 0.85)',
      'rgba(226, 232, 240, 0.55)',
      'rgba(203, 213, 225, 0.15)',
      32,
    );

    // Allocations
    this.firePositions = new Float32Array(this.fireCount * 3);
    this.fireColors = new Float32Array(this.fireCount * 3);
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
    this.smokeVelocities = new Float32Array(this.smokeCount * 3);
    this.smokeBaseRadii = new Float32Array(this.smokeCount);

    this.steamPositions = new Float32Array(this.steamMaxCount * 3);
    this.steamColors = new Float32Array(this.steamMaxCount * 3);

    this.initConformingBurningGround();
    this.initBillboardFlames();
    this.initPointLights();
    this.initFlameParticles();
    this.initEmberParticles();
    this.initSmokeParticles();
    this.initSteamParticles();

    this.scene.add(this.group);
  }

  /**
   * Builds undulating terrain-conforming burning ground meshes that hug every
   * contour of the Iowa hills at ground(wx, wz) + 0.18, with:
   * - Charred carbon scorch layer that permanently marks the burn zone
   * - Radiating molten magma vein layer that pulses vibrantly with fire intensity
   */
  private initConformingBurningGround(): void {
    const segments = 20;

    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const diameter = spot.radius * 2.3;

      // 1. Charred Scorch Base Mesh
      const scorchGeo = new T.PlaneGeometry(diameter, diameter, segments, segments);
      scorchGeo.rotateX(-Math.PI / 2);
      const scorchPos = scorchGeo.attributes.position;

      for (let v = 0; v < scorchPos.count; v++) {
        const lx = scorchPos.getX(v);
        const lz = scorchPos.getZ(v);
        const wx = spot.x + lx;
        const wz = spot.z + lz;
        // Conform directly to terrain height!
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
      const glowGeo = new T.PlaneGeometry(diameter, diameter, segments, segments);
      glowGeo.rotateX(-Math.PI / 2);
      const glowPos = glowGeo.attributes.position;

      for (let v = 0; v < glowPos.count; v++) {
        const lx = glowPos.getX(v);
        const lz = glowPos.getZ(v);
        const wx = spot.x + lx;
        const wz = spot.z + lz;
        // Position slightly above scorch mesh to prevent z-fighting
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
    }
  }

  /**
   * Instantiates towering 3D billboard flame sheets (16m - 24m tall) per hotspot
   * distributed across the burning cluster, making the fire leap into the air and
   * visible from kilometers away.
   */
  private initBillboardFlames(): void {
    const billboardsPerSpot = 9;

    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];

      for (let b = 0; b < billboardsPerSpot; b++) {
        // Stagger positions: 1 at center, rest at varied radii and angles
        const angle = (b / billboardsPerSpot) * Math.PI * 2 + b * 0.45;
        const dist = b === 0 ? 0 : (0.2 + 0.65 * (b / billboardsPerSpot)) * spot.radius;
        const wx = spot.x + Math.cos(angle) * dist;
        const wz = spot.z + Math.sin(angle) * dist;
        const wy = ground(wx, wz);

        const width = 14 + Math.random() * 6; // 14m - 20m wide
        const height = 18 + Math.random() * 8; // 18m - 26m tall!

        const geo = new T.PlaneGeometry(width, height);
        // Translate pivot so bottom edge rests on terrain ground
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
      const light = new T.PointLight(0xff5510, 4.2, 95, 1.6);
      light.position.set(spot.x, spotY + 3.8, spot.z);
      this.pointLights.push(light);
      this.group.add(light);
    }
  }

  private initFlameParticles(): void {
    const geo = new T.BufferGeometry();
    let idx = 0;

    for (const spot of this.state.hotspots) {
      const spotY = ground(spot.x, spot.z);
      for (let i = 0; i < 40; i++) {
        this.fireAngles[idx] = Math.random() * Math.PI * 2;
        this.fireRadii[idx] = Math.random() * spot.radius * 0.92;
        this.fireHeights[idx] = Math.random() * 7.0;
        this.fireSpeeds[idx] = 5.0 + Math.random() * 7.5;

        this.firePositions[idx * 3] =
          spot.x + Math.cos(this.fireAngles[idx]) * this.fireRadii[idx];
        this.firePositions[idx * 3 + 1] = spotY + this.fireHeights[idx];
        this.firePositions[idx * 3 + 2] =
          spot.z + Math.sin(this.fireAngles[idx]) * this.fireRadii[idx];

        this.fireColors[idx * 3] = 1.0;
        this.fireColors[idx * 3 + 1] = 0.7;
        this.fireColors[idx * 3 + 2] = 0.15;
        idx++;
      }
    }

    geo.setAttribute('position', new T.BufferAttribute(this.firePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.fireColors, 3));

    const mat = new T.PointsMaterial({
      size: 16.0,
      map: this.flameTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });

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
      size: 4.5,
      map: this.emberTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
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
    this.emberPositions[i * 3 + 1] = wy + 0.5 + Math.random() * 3.0;
    this.emberPositions[i * 3 + 2] = wz;

    this.emberVelocities[i * 3] = (Math.random() - 0.5) * 7.5;
    this.emberVelocities[i * 3 + 1] = 10.0 + Math.random() * 16.0;
    this.emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 7.5;

    const maxLife = 1.4 + Math.random() * 2.2;
    this.emberLifetimes[i * 2] = Math.random() * maxLife * 0.4;
    this.emberLifetimes[i * 2 + 1] = maxLife;

    this.emberColors[i * 3] = 1.0;
    this.emberColors[i * 3 + 1] = 0.6 + Math.random() * 0.35;
    this.emberColors[i * 3 + 2] = 0.08;
  }

  private initSmokeParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.random() * spot.radius * 0.9;
      this.smokeBaseRadii[i] = rad;

      const wx = spot.x + Math.cos(angle) * rad;
      const wz = spot.z + Math.sin(angle) * rad;
      const wy = ground(wx, wz);

      this.smokePositions[i * 3] = wx;
      this.smokePositions[i * 3 + 1] = wy + Math.random() * 300;
      this.smokePositions[i * 3 + 2] = wz;

      this.smokeVelocities[i * 3] = (Math.random() - 0.5) * 3.0;
      this.smokeVelocities[i * 3 + 1] = 5.5 + Math.random() * 9.0;
      this.smokeVelocities[i * 3 + 2] = (Math.random() - 0.5) * 3.0;

      const shade = 0.12 + Math.random() * 0.18;
      this.smokeColors[i * 3] = shade * 1.15;
      this.smokeColors[i * 3 + 1] = shade;
      this.smokeColors[i * 3 + 2] = shade * 0.85;
    }

    geo.setAttribute('position', new T.BufferAttribute(this.smokePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.smokeColors, 3));

    const mat = new T.PointsMaterial({
      size: 72.0, // Billowing, huge smoke clouds visible across county
      map: this.smokeTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });

    this.smokePoints = new T.Points(geo, mat);
    this.group.add(this.smokePoints);
  }

  private initSteamParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.steamMaxCount; i++) {
      this.steamPositions[i * 3] = 0;
      this.steamPositions[i * 3 + 1] = -500;
      this.steamPositions[i * 3 + 2] = 0;

      this.steamColors[i * 3] = 0.95;
      this.steamColors[i * 3 + 1] = 0.97;
      this.steamColors[i * 3 + 2] = 1.0;
    }

    geo.setAttribute('position', new T.BufferAttribute(this.steamPositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.steamColors, 3));

    const mat = new T.PointsMaterial({
      size: 32.0,
      map: this.steamTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

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

    // 1. Animate Conforming Burning Ground & Ember Glow Meshes
    for (let i = 0; i < this.state.hotspots.length; i++) {
      const spot = this.state.hotspots[i];
      const intensity = spot.intensity;
      const scorch = this.burningGroundMeshes[i];
      const glow = this.emberGlowMeshes[i];
      const light = this.pointLights[i];

      if (scorch) {
        const mat = scorch.material as T.MeshBasicMaterial;
        // Burnt charcoal scar remains visible even after fire is extinguished
        mat.opacity = 0.5 + intensity * 0.45;
      }

      if (glow) {
        const glowMat = glow.material as T.MeshBasicMaterial;
        if (intensity <= 0.01) {
          glow.visible = false;
        } else {
          glow.visible = true;
          // Pulsing molten heat veins
          const heatPulse = 0.65 + 0.35 * Math.sin(time * 5.5 + i * 2.1);
          glowMat.opacity = intensity * heatPulse * 0.95;

          // Color shifts from yellow-gold to intense orange-red
          const hueShift = 0.05 + 0.025 * Math.sin(time * 8.0 + i);
          glowMat.color.setHSL(hueShift, 1.0, 0.45 + heatPulse * 0.15);
        }
      }

      if (light) {
        if (intensity <= 0.01) {
          light.intensity = 0;
        } else {
          const flicker = Math.sin(time * 18 + i * 2.7) * 0.6 + Math.cos(time * 31 + i) * 0.3;
          light.intensity = intensity * (3.8 + flicker);
        }
      }
    }

    // 2. Animate Leaping 3D Billboard Flame Sheets
    for (let i = 0; i < this.flameBillboards.length; i++) {
      const b = this.flameBillboards[i];
      const spot = this.state.hotspots[b.hotspotIndex];
      const intensity = spot.intensity;

      if (intensity <= 0.01) {
        b.mesh.visible = false;
        continue;
      }

      b.mesh.visible = true;

      // Rotate billboard around vertical axis to face camera (or plane)
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

      // Flame scale animation: leaping and flickering heights
      const flicker =
        1.0 +
        0.25 * Math.sin(time * b.speed + b.phaseOffset) +
        0.12 * Math.cos(time * (b.speed * 1.8) + b.phaseOffset * 2.3);
      const widthScale = intensity * (1.0 + 0.1 * Math.sin(time * 7 + b.phaseOffset));
      const heightScale = intensity * flicker;

      b.mesh.scale.set(widthScale, heightScale, widthScale);

      // Subtle flame sway in wind
      b.mesh.position.x = b.baseX + wind.x * 0.25 * (flicker - 0.8);
      b.mesh.position.z = b.baseZ + wind.z * 0.25 * (flicker - 0.8);
    }

    // 3. Animate Dynamic Flame Particles
    const firePos = this.firePoints.geometry.attributes
      .position as T.BufferAttribute;
    const fireCol = this.firePoints.geometry.attributes
      .color as T.BufferAttribute;

    let pIdx = 0;
    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const spotY = ground(spot.x, spot.z);
      const intensity = spot.intensity;

      for (let i = 0; i < 40; i++) {
        if (intensity <= 0.01) {
          firePos.setY(pIdx, -500);
          fireCol.setXYZ(pIdx, 0, 0, 0);
        } else {
          this.fireHeights[pIdx] += this.fireSpeeds[pIdx] * dt;
          const maxFlameH = (6.0 + Math.sin(time * 16 + pIdx) * 2.2) * intensity;

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

          // Color gradient from base to tip
          const heightRatio = Math.min(1, this.fireHeights[pIdx] / Math.max(0.1, maxFlameH));
          const r = 1.0 * intensity;
          const g = (0.75 - heightRatio * 0.52) * intensity;
          const b = Math.max(0.02, (0.28 - heightRatio * 0.25)) * intensity;

          fireCol.setXYZ(pIdx, r, g, b);
        }
        pIdx++;
      }
    }
    firePos.needsUpdate = true;
    fireCol.needsUpdate = true;

    // 4. Animate Flying Embers & Sparks
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

      const x = emberPos.getX(i) + (this.emberVelocities[i * 3] + wind.x * 0.85) * dt;
      const y = emberPos.getY(i) + this.emberVelocities[i * 3 + 1] * dt;
      const z = emberPos.getZ(i) + (this.emberVelocities[i * 3 + 2] + wind.z * 0.85) * dt;

      emberPos.setXYZ(i, x, y, z);

      // Flickering spark brightness fading over lifespan
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

    // 5. Animate Massive Volumetric Smoke Plumes (Towering into Sky)
    const smokePos = this.smokePoints.geometry.attributes
      .position as T.BufferAttribute;
    const smokeCol = this.smokePoints.geometry.attributes
      .color as T.BufferAttribute;

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      const spotY = ground(spot.x, spot.z);
      if (spot.intensity <= 0.01) {
        smokePos.setY(i, -500);
        continue;
      }

      let y = smokePos.getY(i) + this.smokeVelocities[i * 3 + 1] * dt;
      let x = smokePos.getX(i) + (this.smokeVelocities[i * 3] + wind.x * 0.6) * dt;
      let z = smokePos.getZ(i) + (this.smokeVelocities[i * 3 + 2] + wind.z * 0.6) * dt;

      const plumeH = y - spotY;
      // Towering up to 380m into Iowa sky
      if (plumeH > 380) {
        y = spotY + Math.random() * 3.5;
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * spot.radius * 0.8;
        x = spot.x + Math.cos(angle) * rad;
        z = spot.z + Math.sin(angle) * rad;
      }

      smokePos.setXYZ(i, x, y, z);

      // Diffuse color as smoke climbs into sky
      const altFactor = Math.min(1, Math.max(0, plumeH / 360));
      const baseShade = 0.11 + altFactor * 0.24;
      const r = (baseShade + 0.06 * altFactor) * spot.intensity;
      const g = (baseShade + 0.03 * altFactor) * spot.intensity;
      const b = (baseShade - 0.02 * altFactor) * spot.intensity;

      smokeCol.setXYZ(i, r, g, b);
    }
    smokePos.needsUpdate = true;
    smokeCol.needsUpdate = true;

    // 6. Animate Steam Puff Explosions
    if (this.steamPoints && this.state.steamPuffs) {
      const steamPos = this.steamPoints.geometry.attributes
        .position as T.BufferAttribute;
      const steamCol = this.steamPoints.geometry.attributes
        .color as T.BufferAttribute;

      const puffs = this.state.steamPuffs;
      for (let i = 0; i < this.steamMaxCount; i++) {
        if (i < puffs.length) {
          const p = puffs[i];
          steamPos.setXYZ(i, p.x, p.y, p.z);
          const lifeRatio = 1 - p.life / p.maxLife;
          steamCol.setXYZ(i, 0.95 * lifeRatio, 0.97 * lifeRatio, 1.0 * lifeRatio);
        } else {
          steamPos.setY(i, -500);
        }
      }
      steamPos.needsUpdate = true;
      steamCol.needsUpdate = true;
    }

    // 7. Dynamic Atmospheric Scene Fog & Smoke Obscuration
    if (this.scene.fog && this.scene.fog instanceof T.FogExp2) {
      const exposure = this.state.smokeExposure ?? 0;
      if (exposure > 0.02) {
        const smokeFogDensity = 0.0001 + exposure * 0.0055;
        this.scene.fog.density = Math.max(this.scene.fog.density, smokeFogDensity);

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

    this.scene.remove(this.group);
  }
}
