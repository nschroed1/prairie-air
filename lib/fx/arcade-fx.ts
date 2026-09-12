import * as T from 'three';
import type { Simulation } from '../simulation';
import { nextPass } from '../flight-guidance';

// Pool sizes
const BADGE_POOL_SIZE = 32;
const LEAF_CHAFF_POOL_SIZE = 360;

// Maximum altitude for deck skimming (30 feet in meters)
export const DECK_SKIM_ALTITUDE_METERS = 9.144; // 30 ft
// Sweet spot for DECK HUGGER pocket indicator (20 - 32 ft in meters)
export const DECK_HUGGER_MIN_METERS = 6.096; // 20 ft
export const DECK_HUGGER_MAX_METERS = 9.754; // 32 ft
// Swath lock tolerance
export const SWATH_LOCK_TOLERANCE_METERS = 1.5;

export interface FloatingBadge {
  id: number;
  active: boolean;
  text: string;
  color: string;
  worldPos: T.Vector3;
  basePos: T.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  opacity: number;
  sprite?: T.Sprite;
}

function createChaffTexture(): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Leaf / oval flake shape
      ctx.beginPath();
      ctx.ellipse(16, 16, 14, 8, Math.PI / 4, 0, Math.PI * 2);
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 14);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
      gradient.addColorStop(0.5, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(0.85, 'rgba(255, 255, 255, 0.4)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
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

function createBadgeTexture(text: string, color: string): T.Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, 256, 64);
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Glow outline
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 4;
      ctx.strokeText(text, 128, 32);

      // Main colored text
      ctx.fillStyle = color;
      ctx.fillText(text, 128, 32);
      return new T.CanvasTexture(canvas);
    }
  }

  // Headless fallback
  const size = 16;
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) {
    data[i] = 255;
    data[i + 1] = 255;
    data[i + 2] = 255;
    data[i + 3] = 255;
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
    shader.fragmentShader = 'varying float vFxAlpha;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\ndiffuseColor.a *= vFxAlpha;',
    );
  };
  material.customProgramCacheKey = () => cacheKey;
}

export class ArcadeFX {
  private scene?: T.Scene;
  private plane?: T.Group;
  private camera?: T.Camera;
  private chaffTexture: T.Texture;
  private disposed = false;

  // 1. Floating Score Badges
  private badges: FloatingBadge[] = [];
  private badgePoolIdx = 0;
  private badgeGroup?: T.Group;

  // 2. Swath Lock Reticle FX
  private _swathLocked = false;
  private _swathLockPulse = 0;
  private _swathOffset = Infinity;
  private _signedSwathOffset = 0;
  private reticleMesh?: T.Mesh;
  private reticleMaterial?: T.MeshBasicMaterial;

  // 3. Deck Skimmer Crop Wash FX
  private leafGeo?: T.BufferGeometry;
  private leafMaterial?: T.PointsMaterial;
  private leafPoints?: T.Points;
  private leafPositions = new Float32Array(LEAF_CHAFF_POOL_SIZE * 3);
  private leafAlphas = new Float32Array(LEAF_CHAFF_POOL_SIZE);
  private leafColors = new Float32Array(LEAF_CHAFF_POOL_SIZE * 3);
  private leafVelocities = new Float32Array(LEAF_CHAFF_POOL_SIZE * 3);
  private leafLife = new Float32Array(LEAF_CHAFF_POOL_SIZE);
  private leafMaxLife = new Float32Array(LEAF_CHAFF_POOL_SIZE);
  private leafIdx = 0;
  private leafEmissionAcc = 0;

  private lastRewardId = 0;
  private pendingReward: Simulation['rewards'][number] | null = null;

  // Scratchpads for zero-allocation updates
  private readonly tempPlanePos = new T.Vector3();
  private readonly backwardDir = new T.Vector3();
  private readonly tempVec = new T.Vector3();

  constructor(
    scene?: T.Scene,
    plane?: T.Group,
    camera?: T.Camera,
    worldBadges = true,
  ) {
    this.scene = scene;
    this.plane = plane;
    this.camera = camera;
    this.chaffTexture = createChaffTexture();

    // Initialize Floating Badge Pool
    if (this.scene && worldBadges) {
      this.badgeGroup = new T.Group();
      this.badgeGroup.name = 'arcade-fx-badges';
      this.scene.add(this.badgeGroup);
    }

    for (let i = 0; i < BADGE_POOL_SIZE; i++) {
      let sprite: T.Sprite | undefined;
      if (this.scene && this.badgeGroup) {
        const mat = new T.SpriteMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        sprite = new T.Sprite(mat);
        sprite.visible = false;
        this.badgeGroup.add(sprite);
      }

      this.badges.push({
        id: i,
        active: false,
        text: '',
        color: '#ffffff',
        worldPos: new T.Vector3(0, -10000, 0),
        basePos: new T.Vector3(0, -10000, 0),
        life: 0,
        maxLife: 1.2,
        scale: 0,
        opacity: 0,
        sprite,
      });
    }

    // Initialize Deck Skimmer Crop Wash FX
    for (let i = 0; i < LEAF_CHAFF_POOL_SIZE; i++) {
      this.leafPositions[i * 3 + 1] = -10000;
      this.leafAlphas[i] = 0;
      this.leafColors[i * 3] = 0.2;
      this.leafColors[i * 3 + 1] = 0.8;
      this.leafColors[i * 3 + 2] = 0.3;
    }

    this.leafGeo = new T.BufferGeometry();
    const leafPosAttr = new T.BufferAttribute(this.leafPositions, 3).setUsage(
      T.DynamicDrawUsage,
    );
    const leafAlphaAttr = new T.BufferAttribute(this.leafAlphas, 1).setUsage(
      T.DynamicDrawUsage,
    );
    const leafColorAttr = new T.BufferAttribute(this.leafColors, 3).setUsage(
      T.DynamicDrawUsage,
    );

    this.leafGeo.setAttribute('position', leafPosAttr);
    this.leafGeo.setAttribute('fxAlpha', leafAlphaAttr);
    this.leafGeo.setAttribute('color', leafColorAttr);

    this.leafMaterial = new T.PointsMaterial({
      size: 4.8,
      transparent: true,
      opacity: 0.88,
      depthWrite: false,
      vertexColors: true,
      blending: T.NormalBlending,
      map: this.chaffTexture,
      sizeAttenuation: true,
    });
    attachAlphaShader(this.leafMaterial, 'arcade-leaf-chaff-v1');

    this.leafPoints = new T.Points(this.leafGeo, this.leafMaterial);
    this.leafPoints.name = 'arcade-fx-leaf-chaff';
    this.leafPoints.frustumCulled = false;
    if (this.scene) {
      this.scene.add(this.leafPoints);
    }

    // Optional 3D Swath Lock Crosshair Reticle Mesh
    if (this.scene && this.plane) {
      const ringGeo = new T.RingGeometry(0.8, 0.95, 24);
      this.reticleMaterial = new T.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      });
      this.reticleMesh = new T.Mesh(ringGeo, this.reticleMaterial);
      this.reticleMesh.position.set(0, 0, -12);
      this.reticleMesh.name = 'arcade-fx-reticle';
      this.plane.add(this.reticleMesh);
    }
  }

  /**
   * Adds a floating text badge into the preallocated pool with spring bounce and alpha fade.
   */
  addFloatingBadge(
    text: string,
    color: string,
    worldPos: T.Vector3,
  ): FloatingBadge {
    if (this.disposed) return this.badges[0];

    // Find an inactive badge or take the oldest in the pool
    let badge = this.badges.find((b) => !b.active);
    if (!badge) {
      badge = this.badges[this.badgePoolIdx];
      this.badgePoolIdx = (this.badgePoolIdx + 1) % BADGE_POOL_SIZE;
    }

    badge.active = true;
    badge.text = text;
    badge.color = color;
    badge.basePos.copy(worldPos);
    badge.worldPos.copy(worldPos);
    badge.maxLife = 1.2;
    badge.life = 1.2;
    badge.scale = 0;
    badge.opacity = 1;

    if (badge.sprite) {
      (badge.sprite.material as T.SpriteMaterial).map?.dispose();
      const texture = createBadgeTexture(text, color);
      (badge.sprite.material as T.SpriteMaterial).map = texture;
      (badge.sprite.material as T.SpriteMaterial).needsUpdate = true;
      badge.sprite.position.copy(worldPos);
      badge.sprite.scale.set(0, 0, 1);
      (badge.sprite.material as T.SpriteMaterial).opacity = 1;
      badge.sprite.visible = true;
    }

    return badge;
  }

  /**
   * Main per-frame simulation update.
   */
  update(dt: number, sim: Simulation, _time: number): void {
    if (this.disposed || dt <= 0) return;

    // Cache plane position and orientation
    if (this.plane) {
      this.plane.updateMatrixWorld();
      this.tempPlanePos.setFromMatrixPosition(this.plane.matrixWorld);
      this.backwardDir.set(0, 0, 1).transformDirection(this.plane.matrixWorld);
    } else {
      this.tempPlanePos.set(sim.x, sim.y, sim.z);
      this.backwardDir.set(-Math.sin(sim.heading), 0, -Math.cos(sim.heading));
    }

    // 1. Update Floating Badges (Float vertical & damped spring bounce)
    this.updateFloatingBadges(dt);

    // 2. Update Swath Lock Reticle FX
    this.updateSwathLock(dt, sim);

    // 3. Update Deck Skimmer Crop Wash FX
    this.updateCropWash(dt, sim);

    // 4. Track Automatic Micro-Reward Milestones
    this.updateMicroRewardMilestones(dt, sim);
  }

  private updateFloatingBadges(dt: number): void {
    for (let i = 0; i < BADGE_POOL_SIZE; i++) {
      const badge = this.badges[i];
      if (!badge.active) continue;

      badge.life -= dt;
      if (badge.life <= 0) {
        badge.active = false;
        badge.opacity = 0;
        badge.scale = 0;
        if (badge.sprite) {
          badge.sprite.visible = false;
        }
        continue;
      }

      const elapsed = badge.maxLife - badge.life; // 0 to 1.2s
      const progress = Math.min(1, Math.max(0, elapsed / badge.maxLife));

      // Smooth vertical float: rises smoothly by 3.5m over 1.2s
      badge.worldPos.y = badge.basePos.y + progress * 3.5;

      // Spring bounce scale: pop in with damped harmonic overshoot over the first 0.35s
      const bounceT = Math.min(1, elapsed / 0.35);
      const spring =
        1 + Math.sin(bounceT * Math.PI * 2.5) * Math.exp(-bounceT * 4.2) * 0.45;
      badge.scale = bounceT >= 1 ? 1 : Math.max(0, bounceT * spring);

      // Smooth alpha fade: full opacity through 0.65 (0.78s), then fades down to 0
      if (progress < 0.65) {
        badge.opacity = 1;
      } else {
        const fadeProgress = (progress - 0.65) / 0.35;
        badge.opacity = Math.max(0, 1 - fadeProgress);
      }

      // Update 3D billboard sprite if present
      if (badge.sprite) {
        badge.sprite.visible = true;
        badge.sprite.position.copy(badge.worldPos);
        badge.sprite.scale.set(badge.scale * 4.5, badge.scale * 1.2, 1);
        (badge.sprite.material as T.SpriteMaterial).opacity = badge.opacity;
      }
    }
  }

  private updateSwathLock(dt: number, sim: Simulation): void {
    // Swath Alignment calculation
    let offset = Infinity;
    let signedOffset = 0;
    if (sim.job) {
      try {
        const pass = nextPass(sim);
        if (pass && typeof pass.x === 'number') {
          offset = Math.abs(sim.x - pass.x);
          const rawDx = sim.x - pass.x;
          const headingNorth = Math.cos(sim.heading) >= 0;
          signedOffset = headingNorth ? rawDx : -rawDx;
        }
      } catch {
        // Safe fallback
      }
    } else if (sim.arcade && typeof sim.arcade.swathLocked === 'boolean') {
      offset = sim.arcade.swathLocked ? 0 : 10;
      signedOffset = 0;
    }

    this._swathOffset = offset;
    this._signedSwathOffset = signedOffset;

    // Check +-1.5m alignment tolerance
    const withinTolerance = offset <= SWATH_LOCK_TOLERANCE_METERS;

    // Decay previous pulse animation over 0.45s
    if (this._swathLockPulse > 0) {
      this._swathLockPulse = Math.max(0, this._swathLockPulse - dt / 0.45);
    }

    if (withinTolerance) {
      if (!this._swathLocked) {
        // Just entered alignment: trigger crosshair pulse!
        this._swathLocked = true;
        this._swathLockPulse = 1.0;
      }
    } else {
      this._swathLocked = false;
    }

    // Update 3D reticle mesh if attached to scene/plane
    if (this.reticleMesh && this.reticleMaterial) {
      if (this._swathLocked || this._swathLockPulse > 0) {
        const pulseScale = 1.0 + this._swathLockPulse * 0.5;
        this.reticleMesh.scale.set(pulseScale, pulseScale, 1);
        this.reticleMaterial.opacity = Math.max(
          0.35,
          this._swathLockPulse * 0.9,
        );
        this.reticleMaterial.color.setHex(0x10b981);
      } else {
        this.reticleMaterial.opacity = 0;
      }
    }
  }

  private updateCropWash(dt: number, sim: Simulation): void {
    const isUnder30Ft = sim.altitude < DECK_SKIM_ALTITUDE_METERS;
    const washActive = isUnder30Ft && sim.speed > 16;
    const groundY = (this.plane ? this.plane.position.y : sim.y) - sim.altitude;
    const wind = sim.windVector;

    if (washActive) {
      const proximity = Math.max(
        0,
        1 - sim.altitude / DECK_SKIM_ALTITUDE_METERS,
      );
      const speedRatio = Math.min(1, sim.speed / 40);
      const intensity = proximity * speedRatio;

      // High density emission when skimming low
      this.leafEmissionAcc += dt * (intensity * 130);
      const emitCount = Math.floor(this.leafEmissionAcc);
      this.leafEmissionAcc -= emitCount;

      for (let s = 0; s < emitCount; s++) {
        const idx = this.leafIdx;
        this.leafIdx = (this.leafIdx + 1) % LEAF_CHAFF_POOL_SIZE;

        // Spread across swath wash footprint
        const lateralSpread = (Math.random() - 0.5) * (sim.swath * 0.7);
        const forwardJitter = (Math.random() - 0.5) * 4.0;

        this.tempVec.set(
          this.tempPlanePos.x + lateralSpread,
          groundY + 0.05 + Math.random() * 0.4,
          this.tempPlanePos.z + forwardJitter,
        );

        const i3 = idx * 3;
        this.leafPositions[i3] = this.tempVec.x;
        this.leafPositions[i3 + 1] = this.tempVec.y;
        this.leafPositions[i3 + 2] = this.tempVec.z;

        // High kick velocity: backward blast + turbulent whirlwind dispersion
        const blastSpeed = 8.0 + sim.speed * 0.35;
        this.leafVelocities[i3] =
          this.backwardDir.x * blastSpeed + (Math.random() - 0.5) * 3.4;
        this.leafVelocities[i3 + 1] = 1.8 + Math.random() * 3.2 * intensity; // Upward buoyant kick
        this.leafVelocities[i3 + 2] =
          this.backwardDir.z * blastSpeed + (Math.random() - 0.5) * 3.4;

        // Botanical palette: 55% vibrant green crop leaves, 45% golden chaff husks
        const isLeaf = Math.random() < 0.55;
        if (isLeaf) {
          // Lush crop leaves: vibrant greens (#22c55e, #16a34a, #84cc16)
          const shade = Math.random();
          if (shade < 0.4) {
            this.leafColors[i3] = 0.13;
            this.leafColors[i3 + 1] = 0.77;
            this.leafColors[i3 + 2] = 0.37;
          } else if (shade < 0.7) {
            this.leafColors[i3] = 0.09;
            this.leafColors[i3 + 1] = 0.64;
            this.leafColors[i3 + 2] = 0.29;
          } else {
            this.leafColors[i3] = 0.52;
            this.leafColors[i3 + 1] = 0.8;
            this.leafColors[i3 + 2] = 0.09;
          }
        } else {
          // Chaff & grain husks: goldenrod/amber (#facc15, #eab308, #d97706)
          const shade = Math.random();
          if (shade < 0.5) {
            this.leafColors[i3] = 0.98;
            this.leafColors[i3 + 1] = 0.8;
            this.leafColors[i3 + 2] = 0.08;
          } else {
            this.leafColors[i3] = 0.92;
            this.leafColors[i3 + 1] = 0.7;
            this.leafColors[i3 + 2] = 0.03;
          }
        }

        const maxLife = 0.65 + Math.random() * 0.55;
        this.leafMaxLife[idx] = maxLife;
        this.leafLife[idx] = maxLife;
      }
    }

    // Simulate particle trajectory, wind drift, and ground settling
    for (let i = 0; i < LEAF_CHAFF_POOL_SIZE; i++) {
      if (this.leafLife[i] > 0) {
        this.leafLife[i] -= dt;
        const progress = Math.max(0, this.leafLife[i] / this.leafMaxLife[i]);
        this.leafAlphas[i] = Math.min(1, progress * 1.8) * 0.85;

        const i3 = i * 3;
        // React to windVector with slight tumbling drag
        this.leafVelocities[i3] +=
          (wind.x * 2.2 - this.leafVelocities[i3] * 0.8) * dt;
        this.leafVelocities[i3 + 2] +=
          (wind.z * 2.2 - this.leafVelocities[i3 + 2] * 0.8) * dt;
        // Gravity
        this.leafVelocities[i3 + 1] -= 3.8 * dt;

        this.leafPositions[i3] += this.leafVelocities[i3] * dt;
        this.leafPositions[i3 + 1] += this.leafVelocities[i3 + 1] * dt;
        this.leafPositions[i3 + 2] += this.leafVelocities[i3 + 2] * dt;

        // Ground settling
        if (this.leafPositions[i3 + 1] < groundY) {
          this.leafPositions[i3 + 1] = groundY + 0.03;
          this.leafVelocities[i3 + 1] = 0;
          this.leafVelocities[i3] *= 0.75;
          this.leafVelocities[i3 + 2] *= 0.75;
        }
      } else {
        this.leafPositions[i * 3 + 1] = -10000;
        this.leafAlphas[i] = 0;
      }
    }

    if (this.leafGeo) {
      this.leafGeo.attributes.position.needsUpdate = true;
      this.leafGeo.attributes.fxAlpha.needsUpdate = true;
      this.leafGeo.attributes.color.needsUpdate = true;
    }
  }

  private updateMicroRewardMilestones(_dt: number, sim: Simulation): void {
    const unseen = sim.rewards.filter((r) => r.id > this.lastRewardId);
    if (unseen.length) this.lastRewardId = unseen[unseen.length - 1].id;
    // Surface one meaningful award; small fresh-coverage ticks are already
    // included in the live bonus total and need not obscure the approach.
    const incoming = [...unseen].reverse().find((r) => r.cue !== 'spray-pop');
    if (incoming) this.pendingReward = incoming;
    if (this.pendingReward && sim.elapsed - this.pendingReward.at > 5)
      this.pendingReward = null;
    const reward = this.pendingReward;
    if (!reward || sim.warning.danger || sim.phase !== 'flying') return;
    this.pendingReward = null;
    for (const badge of this.badges) {
      badge.active = false;
      if (badge.sprite) badge.sprite.visible = false;
    }
    this.addFloatingBadge(
      `${reward.amount ? `+$${reward.amount} ` : ''}${reward.title}`,
      reward.cue === 'powerup' ? '#90e0ef' : '#facc15',
      this.tempPlanePos,
    );
  }

  // Getters for status & HUD inspection
  isSwathLocked(): boolean {
    return this._swathLocked;
  }

  getSwathLockPulse(): number {
    return this._swathLockPulse;
  }

  getSwathOffset(): number {
    return this._swathOffset;
  }

  getSignedSwathOffset(): number {
    return this._signedSwathOffset;
  }

  getBadges(): readonly FloatingBadge[] {
    return this.badges;
  }

  getActiveBadges(): FloatingBadge[] {
    return this.badges.filter((b) => b.active);
  }

  getLeafChaffPoints(): T.Points | undefined {
    return this.leafPoints;
  }

  getReticleMesh(): T.Mesh | undefined {
    return this.reticleMesh;
  }

  /**
   * Cleans up all resources, removes objects from scene, and releases geometries/materials/textures.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    // Dispose badges
    for (const badge of this.badges) {
      badge.active = false;
      if (badge.sprite) {
        if (this.badgeGroup) {
          this.badgeGroup.remove(badge.sprite);
        }
        (badge.sprite.material as T.SpriteMaterial).map?.dispose();
        badge.sprite.material.dispose();
      }
    }

    if (this.badgeGroup && this.scene) {
      this.scene.remove(this.badgeGroup);
    }

    // Dispose crop wash leaf points
    if (this.leafPoints && this.scene) {
      this.scene.remove(this.leafPoints);
    }
    this.leafGeo?.dispose();
    this.leafMaterial?.dispose();
    this.chaffTexture.dispose();

    // Dispose reticle mesh
    if (this.reticleMesh && this.plane) {
      this.plane.remove(this.reticleMesh);
    }
    this.reticleMesh?.geometry.dispose();
    this.reticleMaterial?.dispose();
  }
}
