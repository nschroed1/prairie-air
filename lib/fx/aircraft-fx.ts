import * as T from 'three';
import type { Simulation } from '../simulation';

const LEFT_WINGTIP = new T.Vector3(-10, -0.25, -0.3);
const RIGHT_WINGTIP = new T.Vector3(10, -0.25, -0.3);
const EXHAUST_PIPE = new T.Vector3(0.74, -0.52, -3.8);

const VORTEX_POOL_SIZE = 260; // 130 left wingtip + 130 right wingtip
const DUST_POOL_SIZE = 240;
const EXHAUST_POOL_SIZE = 160;

const VORTEX_LIFETIME = 0.75;

function createParticleTexture(): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.35, 'rgba(255, 255, 255, 0.65)');
      gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.18)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 32, 32);
      return new T.CanvasTexture(canvas);
    }
  }

  // Fallback DataTexture for headless / test environments
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  const maxR = size / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dist = Math.hypot(x - center, y - center) / maxR;
      const alpha = Math.max(
        0,
        Math.min(255, Math.round(255 * (1 - Math.min(1, dist * dist)))),
      );
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }
  const texture = new T.DataTexture(data, size, size, T.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function attachAlphaShader(material: T.PointsMaterial, cacheKey: string): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute float fxAlpha;\nvarying float vFxAlpha;\n' +
      shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvFxAlpha = fxAlpha;',
    );
    shader.fragmentShader =
      'varying float vFxAlpha;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vFxAlpha;',
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

export interface VaporStreakTier {
  streak: number;
  name: string;
  color: string;
  hex: number;
  opacity: number;
  additive: boolean;
}

export const VAPOR_STREAK_TIERS: Record<1 | 2 | 3 | 4 | 5, VaporStreakTier> = {
  1: {
    streak: 1,
    name: 'Standard Condensation Trail',
    color: '#ffffff',
    hex: 0xffffff,
    opacity: 0.4,
    additive: true,
  },
  2: {
    streak: 2,
    name: 'Silver Streamer',
    color: '#e2e8f0',
    hex: 0xe2e8f0,
    opacity: 0.55,
    additive: true,
  },
  3: {
    streak: 3,
    name: 'Goldenrod Trail',
    color: '#f59e0b',
    hex: 0xf59e0b,
    opacity: 0.7,
    additive: true,
  },
  4: {
    streak: 4,
    name: 'Emerald Ribbon',
    color: '#10b981',
    hex: 0x10b981,
    opacity: 0.8,
    additive: true,
  },
  5: {
    streak: 5,
    name: 'Radiant Amber Firestream',
    color: '#fbbf24',
    hex: 0xfbbf24,
    opacity: 0.95,
    additive: true,
  },
};

export function getVaporStreakTier(streak: number = 1): VaporStreakTier {
  if (streak >= 5) return VAPOR_STREAK_TIERS[5];
  if (streak === 4) return VAPOR_STREAK_TIERS[4];
  if (streak === 3) return VAPOR_STREAK_TIERS[3];
  if (streak === 2) return VAPOR_STREAK_TIERS[2];
  return VAPOR_STREAK_TIERS[1];
}

export class AircraftFX {
  private scene: T.Scene;
  private plane: T.Group;
  private particleTexture: T.Texture;
  private disposed = false;
  private currentTier = 1;

  // Wingtip Vortices (Condensation Trails)
  private vortexGeo: T.BufferGeometry;
  private vortexMaterial: T.PointsMaterial;
  private vortexPoints: T.Points;
  private vortexPositions = new Float32Array(VORTEX_POOL_SIZE * 3);
  private vortexAlphas = new Float32Array(VORTEX_POOL_SIZE);
  private vortexLife = new Float32Array(VORTEX_POOL_SIZE);
  private vortexVelocities = new Float32Array(VORTEX_POOL_SIZE * 3);
  private vortexLeftIdx = 0;
  private vortexRightIdx = 0;
  private vortexEmissionAcc = 0;
  private prevLeftTip = new T.Vector3();
  private prevRightTip = new T.Vector3();
  private hasPrevWingtip = false;

  get vortexMat(): T.PointsMaterial {
    return this.vortexMaterial;
  }

  get currentStreakTier(): VaporStreakTier {
    return getVaporStreakTier(this.currentTier);
  }

  // Propeller Ground Wash Dust / Crop Debris
  private dustGeo: T.BufferGeometry;
  private dustMaterial: T.PointsMaterial;
  private dustPoints: T.Points;
  private dustPositions = new Float32Array(DUST_POOL_SIZE * 3);
  private dustAlphas = new Float32Array(DUST_POOL_SIZE);
  private dustColors = new Float32Array(DUST_POOL_SIZE * 3);
  private dustLife = new Float32Array(DUST_POOL_SIZE);
  private dustMaxLife = new Float32Array(DUST_POOL_SIZE);
  private dustVelocities = new Float32Array(DUST_POOL_SIZE * 3);
  private dustIdx = 0;
  private dustEmissionAcc = 0;

  // Exhaust Heat Shimmer / Puffs
  private exhaustGeo: T.BufferGeometry;
  private exhaustMaterial: T.PointsMaterial;
  private exhaustPoints: T.Points;
  private exhaustPositions = new Float32Array(EXHAUST_POOL_SIZE * 3);
  private exhaustAlphas = new Float32Array(EXHAUST_POOL_SIZE);
  private exhaustLife = new Float32Array(EXHAUST_POOL_SIZE);
  private exhaustMaxLife = new Float32Array(EXHAUST_POOL_SIZE);
  private exhaustVelocities = new Float32Array(EXHAUST_POOL_SIZE * 3);
  private exhaustIdx = 0;
  private exhaustEmissionAcc = 0;

  // Preallocated math scratchpads (Zero allocations per frame)
  private readonly tempVec1 = new T.Vector3();
  private readonly tempVec2 = new T.Vector3();
  private readonly tempVec3 = new T.Vector3();
  private readonly backwardDir = new T.Vector3();
  private readonly curLeftTip = new T.Vector3();
  private readonly curRightTip = new T.Vector3();

  constructor(scene: T.Scene, plane: T.Group) {
    this.scene = scene;
    this.plane = plane;
    this.particleTexture = createParticleTexture();

    // 1. Initialize Wingtip Vortices
    for (let i = 0; i < VORTEX_POOL_SIZE; i++) {
      this.vortexPositions[i * 3 + 1] = -10000;
      this.vortexAlphas[i] = 0;
    }
    this.vortexGeo = new T.BufferGeometry();
    const vortexPosAttr = new T.BufferAttribute(
      this.vortexPositions,
      3,
    ).setUsage(T.DynamicDrawUsage);
    const vortexAlphaAttr = new T.BufferAttribute(
      this.vortexAlphas,
      1,
    ).setUsage(T.DynamicDrawUsage);
    this.vortexGeo.setAttribute('position', vortexPosAttr);
    this.vortexGeo.setAttribute('fxAlpha', vortexAlphaAttr);

    const defaultTier = getVaporStreakTier(1);
    this.vortexMaterial = new T.PointsMaterial({
      color: defaultTier.hex,
      size: 2.6,
      transparent: true,
      opacity: defaultTier.opacity,
      depthWrite: false,
      blending: T.AdditiveBlending,
      map: this.particleTexture,
      sizeAttenuation: true,
    });
    attachAlphaShader(this.vortexMaterial, 'aircraft-vortex-v1');

    this.vortexPoints = new T.Points(this.vortexGeo, this.vortexMaterial);
    this.vortexPoints.name = 'aircraft-fx-vortices';
    this.vortexPoints.frustumCulled = false;
    this.scene.add(this.vortexPoints);

    // 2. Initialize Ground Wash Dust / Crop Debris
    for (let i = 0; i < DUST_POOL_SIZE; i++) {
      this.dustPositions[i * 3 + 1] = -10000;
      this.dustAlphas[i] = 0;
      this.dustColors[i * 3] = 0.8;
      this.dustColors[i * 3 + 1] = 0.74;
      this.dustColors[i * 3 + 2] = 0.52;
    }
    this.dustGeo = new T.BufferGeometry();
    const dustPosAttr = new T.BufferAttribute(this.dustPositions, 3).setUsage(
      T.DynamicDrawUsage,
    );
    const dustAlphaAttr = new T.BufferAttribute(this.dustAlphas, 1).setUsage(
      T.DynamicDrawUsage,
    );
    const dustColorAttr = new T.BufferAttribute(this.dustColors, 3).setUsage(
      T.DynamicDrawUsage,
    );
    this.dustGeo.setAttribute('position', dustPosAttr);
    this.dustGeo.setAttribute('fxAlpha', dustAlphaAttr);
    this.dustGeo.setAttribute('color', dustColorAttr);

    this.dustMaterial = new T.PointsMaterial({
      size: 4.5,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      vertexColors: true,
      blending: T.NormalBlending,
      map: this.particleTexture,
      sizeAttenuation: true,
    });
    attachAlphaShader(this.dustMaterial, 'aircraft-dust-v1');

    this.dustPoints = new T.Points(this.dustGeo, this.dustMaterial);
    this.dustPoints.name = 'aircraft-fx-dust';
    this.dustPoints.frustumCulled = false;
    this.scene.add(this.dustPoints);

    // 3. Initialize Exhaust Heat Shimmer / Puffs
    for (let i = 0; i < EXHAUST_POOL_SIZE; i++) {
      this.exhaustPositions[i * 3 + 1] = -10000;
      this.exhaustAlphas[i] = 0;
    }
    this.exhaustGeo = new T.BufferGeometry();
    const exhaustPosAttr = new T.BufferAttribute(
      this.exhaustPositions,
      3,
    ).setUsage(T.DynamicDrawUsage);
    const exhaustAlphaAttr = new T.BufferAttribute(
      this.exhaustAlphas,
      1,
    ).setUsage(T.DynamicDrawUsage);
    this.exhaustGeo.setAttribute('position', exhaustPosAttr);
    this.exhaustGeo.setAttribute('fxAlpha', exhaustAlphaAttr);

    this.exhaustMaterial = new T.PointsMaterial({
      color: 0xf5eee6,
      size: 3.4,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      blending: T.NormalBlending,
      map: this.particleTexture,
      sizeAttenuation: true,
    });
    attachAlphaShader(this.exhaustMaterial, 'aircraft-exhaust-v1');

    this.exhaustPoints = new T.Points(this.exhaustGeo, this.exhaustMaterial);
    this.exhaustPoints.name = 'aircraft-fx-exhaust';
    this.exhaustPoints.frustumCulled = false;
    this.scene.add(this.exhaustPoints);
  }

  update(dt: number, sim: Simulation, _time: number): void {
    if (this.disposed || dt <= 0) return;

    // Ensure the plane world transform is synchronized
    this.plane.updateMatrixWorld();

    // Cache backward direction in world space (+Z is backwards in plane model)
    this.backwardDir.set(0, 0, 1).transformDirection(this.plane.matrixWorld);

    // Current world positions for wingtips
    this.curLeftTip.copy(LEFT_WINGTIP).applyMatrix4(this.plane.matrixWorld);
    this.curRightTip.copy(RIGHT_WINGTIP).applyMatrix4(this.plane.matrixWorld);

    if (!this.hasPrevWingtip) {
      this.prevLeftTip.copy(this.curLeftTip);
      this.prevRightTip.copy(this.curRightTip);
      this.hasPrevWingtip = true;
    }

    this.updateVortices(dt, sim);
    this.updateGroundWash(dt, sim);
    this.updateExhaust(dt, sim);

    // Store previous wingtip positions for seamless trail interpolation
    this.prevLeftTip.copy(this.curLeftTip);
    this.prevRightTip.copy(this.curRightTip);
  }

  private updateVortices(dt: number, sim: Simulation): void {
    // Dynamic streak tier based on sim.arcade?.passStreak ?? 1
    const streak = sim.arcade?.passStreak ?? 1;
    const tier = getVaporStreakTier(streak);
    this.currentTier = tier.streak;
    this.vortexMaterial.color.setHex(tier.hex);
    this.vortexMaterial.opacity = tier.opacity;
    if (tier.streak >= 5) {
      this.vortexMaterial.blending = T.AdditiveBlending;
    }

    // Condition: plane pulling Gs (hard bank, steep pitch, or high speed)
    const pullingGs =
      Math.abs(sim.roll) > 0.32 ||
      Math.abs(sim.pitch) > 0.18 ||
      sim.speed > 38;

    if (pullingGs) {
      this.vortexEmissionAcc += dt * 85;
      const emitCount = Math.floor(this.vortexEmissionAcc);
      this.vortexEmissionAcc -= emitCount;

      const halfPool = VORTEX_POOL_SIZE / 2; // 130 per wing

      for (let s = 0; s < emitCount; s++) {
        const frac = (s + 1) / emitCount;

        // Left wingtip
        const lIdx = this.vortexLeftIdx;
        this.vortexLeftIdx = (this.vortexLeftIdx + 1) % halfPool;
        this.tempVec1.lerpVectors(this.prevLeftTip, this.curLeftTip, frac);
        const l3 = lIdx * 3;
        this.vortexPositions[l3] = this.tempVec1.x;
        this.vortexPositions[l3 + 1] = this.tempVec1.y;
        this.vortexPositions[l3 + 2] = this.tempVec1.z;
        this.vortexVelocities[l3] =
          this.backwardDir.x * 2.2 + (Math.random() - 0.5) * 0.4;
        this.vortexVelocities[l3 + 1] =
          -0.25 + (Math.random() - 0.5) * 0.2; // slight downwash
        this.vortexVelocities[l3 + 2] =
          this.backwardDir.z * 2.2 + (Math.random() - 0.5) * 0.4;
        this.vortexLife[lIdx] = VORTEX_LIFETIME;

        // Right wingtip
        const rIdx = halfPool + this.vortexRightIdx;
        this.vortexRightIdx = (this.vortexRightIdx + 1) % halfPool;
        this.tempVec2.lerpVectors(this.prevRightTip, this.curRightTip, frac);
        const r3 = rIdx * 3;
        this.vortexPositions[r3] = this.tempVec2.x;
        this.vortexPositions[r3 + 1] = this.tempVec2.y;
        this.vortexPositions[r3 + 2] = this.tempVec2.z;
        this.vortexVelocities[r3] =
          this.backwardDir.x * 2.2 + (Math.random() - 0.5) * 0.4;
        this.vortexVelocities[r3 + 1] =
          -0.25 + (Math.random() - 0.5) * 0.2;
        this.vortexVelocities[r3 + 2] =
          this.backwardDir.z * 2.2 + (Math.random() - 0.5) * 0.4;
        this.vortexLife[rIdx] = VORTEX_LIFETIME;
      }
    }

    const wind = sim.windVector;

    // Simulate & fade over 0.75 seconds
    for (let i = 0; i < VORTEX_POOL_SIZE; i++) {
      if (this.vortexLife[i] > 0) {
        this.vortexLife[i] -= dt;
        const progress = Math.max(0, this.vortexLife[i] / VORTEX_LIFETIME);
        this.vortexAlphas[i] = Math.min(1, progress * 1.35) * 0.85;

        const i3 = i * 3;
        this.vortexPositions[i3] +=
          (this.vortexVelocities[i3] + wind.x * 0.25) * dt;
        this.vortexPositions[i3 + 1] += this.vortexVelocities[i3 + 1] * dt;
        this.vortexPositions[i3 + 2] +=
          (this.vortexVelocities[i3 + 2] + wind.z * 0.25) * dt;
      } else {
        this.vortexPositions[i * 3 + 1] = -10000;
        this.vortexAlphas[i] = 0;
      }
    }

    this.vortexGeo.attributes.position.needsUpdate = true;
    this.vortexGeo.attributes.fxAlpha.needsUpdate = true;
  }

  private updateGroundWash(dt: number, sim: Simulation): void {
    const groundY = this.plane.position.y - sim.altitude;
    const wind = sim.windVector;

    // Condition: low altitude (< 9 meters, under 30 ft AGL) and throttle/speed active (> 20)
    const washActive = sim.altitude < 9 && sim.speed > 20;

    if (washActive) {
      const groundProximity = Math.max(0, 1 - sim.altitude / 9);
      const speedFactor = Math.min(1, (sim.speed - 20) / 20);
      const washIntensity = groundProximity * speedFactor;

      this.dustEmissionAcc += dt * (washIntensity * 85);
      const emitCount = Math.floor(this.dustEmissionAcc);
      this.dustEmissionAcc -= emitCount;

      for (let s = 0; s < emitCount; s++) {
        const idx = this.dustIdx;
        this.dustIdx = (this.dustIdx + 1) % DUST_POOL_SIZE;

        const rand = Math.random();
        let localX: number;
        const localY = -2.2;
        let localZ: number;

        if (rand < 0.35) {
          // Left wheel wake
          localX = -1.7 + (Math.random() - 0.5) * 0.5;
          localZ = 0.3 + Math.random() * 0.8;
        } else if (rand < 0.7) {
          // Right wheel wake
          localX = 1.7 + (Math.random() - 0.5) * 0.5;
          localZ = 0.3 + Math.random() * 0.8;
        } else {
          // Propeller slipstream ground wash
          localX = (Math.random() - 0.5) * 3.4;
          localZ = -2.2 + Math.random() * 3.8;
        }

        this.tempVec1.set(localX, localY, localZ).applyMatrix4(
          this.plane.matrixWorld,
        );
        this.tempVec1.y = groundY + 0.05 + Math.random() * 0.35;

        const i3 = idx * 3;
        this.dustPositions[i3] = this.tempVec1.x;
        this.dustPositions[i3 + 1] = this.tempVec1.y;
        this.dustPositions[i3 + 2] = this.tempVec1.z;

        // Kick up velocity: backward wash plus turbulent upward dispersion
        const washSpeed = (7.5 + sim.speed * 0.32) * groundProximity;
        this.dustVelocities[i3] =
          this.backwardDir.x * washSpeed + (Math.random() - 0.5) * 2.6;
        this.dustVelocities[i3 + 1] =
          1.1 + Math.random() * 2.4 * washIntensity;
        this.dustVelocities[i3 + 2] =
          this.backwardDir.z * washSpeed + (Math.random() - 0.5) * 2.6;

        // Color variety: soil dust, dried tan husks, and yellow-green crop debris/pollen
        const cType = Math.random();
        if (cType < 0.35) {
          // Crop debris / pollen
          this.dustColors[i3] = 0.78;
          this.dustColors[i3 + 1] = 0.85;
          this.dustColors[i3 + 2] = 0.35;
        } else if (cType < 0.7) {
          // Tan dust / chaff
          this.dustColors[i3] = 0.85;
          this.dustColors[i3 + 1] = 0.78;
          this.dustColors[i3 + 2] = 0.56;
        } else {
          // Loam soil
          this.dustColors[i3] = 0.64;
          this.dustColors[i3 + 1] = 0.54;
          this.dustColors[i3 + 2] = 0.4;
        }

        const maxLife = 0.8 + Math.random() * 0.6;
        this.dustMaxLife[idx] = maxLife;
        this.dustLife[idx] = maxLife;
      }
    }

    for (let i = 0; i < DUST_POOL_SIZE; i++) {
      if (this.dustLife[i] > 0) {
        this.dustLife[i] -= dt;
        const progress = Math.max(0, this.dustLife[i] / this.dustMaxLife[i]);
        this.dustAlphas[i] = Math.min(1, progress * 1.8) * 0.65;

        const i3 = i * 3;
        // Drifts with sim.windVector while settling with gravity
        this.dustVelocities[i3] +=
          (wind.x * 1.5 - this.dustVelocities[i3] * 0.65) * dt;
        this.dustVelocities[i3 + 2] +=
          (wind.z * 1.5 - this.dustVelocities[i3 + 2] * 0.65) * dt;
        this.dustVelocities[i3 + 1] -= 3.6 * dt;

        this.dustPositions[i3] += this.dustVelocities[i3] * dt;
        this.dustPositions[i3 + 1] += this.dustVelocities[i3 + 1] * dt;
        this.dustPositions[i3 + 2] += this.dustVelocities[i3 + 2] * dt;

        if (this.dustPositions[i3 + 1] < groundY) {
          this.dustPositions[i3 + 1] = groundY + 0.02;
          this.dustVelocities[i3 + 1] = 0;
          this.dustVelocities[i3] *= 0.85;
          this.dustVelocities[i3 + 2] *= 0.85;
        }
      } else {
        this.dustPositions[i * 3 + 1] = -10000;
        this.dustAlphas[i] = 0;
      }
    }

    this.dustGeo.attributes.position.needsUpdate = true;
    this.dustGeo.attributes.fxAlpha.needsUpdate = true;
    this.dustGeo.attributes.color.needsUpdate = true;
  }

  private updateExhaust(dt: number, sim: Simulation): void {
    const wind = sim.windVector;

    // Condition: high throttle (sim.throttle > 36)
    const exhaustActive = sim.throttle > 36;

    if (exhaustActive) {
      const throttleFactor = Math.min(1, (sim.throttle - 36) / 24);
      this.exhaustEmissionAcc += dt * (throttleFactor * 60);
      const emitCount = Math.floor(this.exhaustEmissionAcc);
      this.exhaustEmissionAcc -= emitCount;

      for (let s = 0; s < emitCount; s++) {
        const idx = this.exhaustIdx;
        this.exhaustIdx = (this.exhaustIdx + 1) % EXHAUST_POOL_SIZE;

        // Exhaust pipe tip with minor jitter
        const lx = EXHAUST_PIPE.x + (Math.random() - 0.5) * 0.08;
        const ly = EXHAUST_PIPE.y + (Math.random() - 0.5) * 0.08;
        const lz = EXHAUST_PIPE.z + (Math.random() - 0.5) * 0.12;

        this.tempVec1.set(lx, ly, lz).applyMatrix4(this.plane.matrixWorld);

        const i3 = idx * 3;
        this.exhaustPositions[i3] = this.tempVec1.x;
        this.exhaustPositions[i3 + 1] = this.tempVec1.y;
        this.exhaustPositions[i3 + 2] = this.tempVec1.z;

        // Jet backward with engine exhaust velocity and thermal rise
        const exhaustSpeed = 6.5 + sim.speed * 0.3;
        this.exhaustVelocities[i3] =
          this.backwardDir.x * exhaustSpeed + (Math.random() - 0.5) * 0.4;
        this.exhaustVelocities[i3 + 1] =
          this.backwardDir.y * exhaustSpeed + 0.7 + Math.random() * 0.5;
        this.exhaustVelocities[i3 + 2] =
          this.backwardDir.z * exhaustSpeed + (Math.random() - 0.5) * 0.4;

        const maxLife = 0.42 + Math.random() * 0.24;
        this.exhaustMaxLife[idx] = maxLife;
        this.exhaustLife[idx] = maxLife;
      }
    }

    for (let i = 0; i < EXHAUST_POOL_SIZE; i++) {
      if (this.exhaustLife[i] > 0) {
        this.exhaustLife[i] -= dt;
        const progress = Math.max(0, this.exhaustLife[i] / this.exhaustMaxLife[i]);
        // Parabolic rise and fade for faint translucent heat shimmer
        const shimmer = progress * (1 - progress) * 4;
        this.exhaustAlphas[i] = shimmer * 0.22;

        const i3 = i * 3;
        this.exhaustVelocities[i3 + 1] += 0.4 * dt; // Heat rises

        this.exhaustPositions[i3] +=
          (this.exhaustVelocities[i3] + wind.x * 0.35) * dt;
        this.exhaustPositions[i3 + 1] += this.exhaustVelocities[i3 + 1] * dt;
        this.exhaustPositions[i3 + 2] +=
          (this.exhaustVelocities[i3 + 2] + wind.z * 0.35) * dt;
      } else {
        this.exhaustPositions[i * 3 + 1] = -10000;
        this.exhaustAlphas[i] = 0;
      }
    }

    this.exhaustGeo.attributes.position.needsUpdate = true;
    this.exhaustGeo.attributes.fxAlpha.needsUpdate = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.scene.remove(this.vortexPoints);
    this.vortexGeo.dispose();
    this.vortexMaterial.dispose();

    this.scene.remove(this.dustPoints);
    this.dustGeo.dispose();
    this.dustMaterial.dispose();

    this.scene.remove(this.exhaustPoints);
    this.exhaustGeo.dispose();
    this.exhaustMaterial.dispose();

    this.particleTexture.dispose();
  }
}
