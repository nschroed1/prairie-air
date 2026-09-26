import * as T from 'three';
import type { FirefightingState } from './firefighting';
import type { Simulation } from './simulation';

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

export class FirefightingWorld {
  private group = new T.Group();

  // 1. Dynamic Flame Pillars
  private firePoints: T.Points | null = null;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private fireHeights: Float32Array;
  private fireRadii: Float32Array;
  private fireAngles: Float32Array;
  private fireSpeeds: Float32Array;
  private fireCount: number;

  // 2. Flying Embers & Sparks System
  private emberPoints: T.Points | null = null;
  private emberPositions: Float32Array;
  private emberColors: Float32Array;
  private emberVelocities: Float32Array;
  private emberLifetimes: Float32Array;
  private emberCount = 220;

  // 3. Volumetric Smoke Plumes
  private smokePoints: T.Points | null = null;
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private smokeVelocities: Float32Array;
  private smokeBaseRadii: Float32Array;
  private smokeCount = 360;

  // 4. Steam Puff Explosions on Extinguish
  private steamPoints: T.Points | null = null;
  private steamPositions: Float32Array;
  private steamColors: Float32Array;
  private steamMaxCount = 80;

  // 5. Point Lights for Flame Illumination
  private pointLights: T.PointLight[] = [];

  // 6. Charred Ground Scorch Discs
  private scorchMeshes: T.Mesh[] = [];

  private flameTex: T.Texture;
  private emberTex: T.Texture;
  private smokeTex: T.Texture;
  private steamTex: T.Texture;

  constructor(
    private scene: T.Scene,
    private state: FirefightingState,
  ) {
    this.fireCount = state.hotspots.length * 32;

    this.flameTex = createRadialTexture(
      'rgba(255, 255, 220, 1)',
      'rgba(255, 140, 20, 0.85)',
      'rgba(220, 38, 38, 0.25)',
      32,
    );
    this.emberTex = createRadialTexture(
      'rgba(255, 255, 240, 1)',
      'rgba(255, 180, 50, 0.95)',
      'rgba(249, 115, 22, 0.3)',
      16,
    );
    this.smokeTex = createRadialTexture(
      'rgba(70, 60, 50, 0.8)',
      'rgba(45, 38, 32, 0.55)',
      'rgba(25, 22, 18, 0.1)',
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

    this.initScorchDiscs();
    this.initPointLights();
    this.initFlameParticles();
    this.initEmberParticles();
    this.initSmokeParticles();
    this.initSteamParticles();

    this.scene.add(this.group);
  }

  private initScorchDiscs(): void {
    for (const spot of this.state.hotspots) {
      const geo = new T.CircleGeometry(spot.radius * 1.15, 20);
      geo.rotateX(-Math.PI / 2);
      const mat = new T.MeshBasicMaterial({
        color: new T.Color('#1c1714'),
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
      });
      const mesh = new T.Mesh(geo, mat);
      mesh.position.set(spot.x, spot.y - 0.7, spot.z);
      this.scorchMeshes.push(mesh);
      this.group.add(mesh);
    }
  }

  private initPointLights(): void {
    for (const spot of this.state.hotspots) {
      const light = new T.PointLight(0xff6e1a, 2.5, 75, 1.8);
      light.position.set(spot.x, spot.y + 3.5, spot.z);
      this.pointLights.push(light);
      this.group.add(light);
    }
  }

  private initFlameParticles(): void {
    const geo = new T.BufferGeometry();
    let idx = 0;

    for (const spot of this.state.hotspots) {
      for (let i = 0; i < 32; i++) {
        this.fireAngles[idx] = Math.random() * Math.PI * 2;
        this.fireRadii[idx] = Math.random() * spot.radius * 0.88;
        this.fireHeights[idx] = Math.random() * 5.0;
        this.fireSpeeds[idx] = 4.0 + Math.random() * 6.5;

        this.firePositions[idx * 3] =
          spot.x + Math.cos(this.fireAngles[idx]) * this.fireRadii[idx];
        this.firePositions[idx * 3 + 1] = spot.y + this.fireHeights[idx];
        this.firePositions[idx * 3 + 2] =
          spot.z + Math.sin(this.fireAngles[idx]) * this.fireRadii[idx];

        this.fireColors[idx * 3] = 1.0;
        this.fireColors[idx * 3 + 1] = 0.65;
        this.fireColors[idx * 3 + 2] = 0.1;
        idx++;
      }
    }

    geo.setAttribute('position', new T.BufferAttribute(this.firePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.fireColors, 3));

    const mat = new T.PointsMaterial({
      size: 6.5,
      map: this.flameTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
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
      size: 3.2,
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
    const rad = Math.random() * spot.radius * 0.9;
    this.emberPositions[i * 3] = spot.x + Math.cos(angle) * rad;
    this.emberPositions[i * 3 + 1] = spot.y + 0.5 + Math.random() * 2.0;
    this.emberPositions[i * 3 + 2] = spot.z + Math.sin(angle) * rad;

    this.emberVelocities[i * 3] = (Math.random() - 0.5) * 6.0;
    this.emberVelocities[i * 3 + 1] = 9.0 + Math.random() * 14.0;
    this.emberVelocities[i * 3 + 2] = (Math.random() - 0.5) * 6.0;

    const maxLife = 1.2 + Math.random() * 1.8;
    this.emberLifetimes[i * 2] = Math.random() * maxLife * 0.5;
    this.emberLifetimes[i * 2 + 1] = maxLife;

    this.emberColors[i * 3] = 1.0;
    this.emberColors[i * 3 + 1] = 0.55 + Math.random() * 0.35;
    this.emberColors[i * 3 + 2] = 0.08;
  }

  private initSmokeParticles(): void {
    const geo = new T.BufferGeometry();

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.random() * spot.radius;
      this.smokeBaseRadii[i] = rad;

      this.smokePositions[i * 3] = spot.x + Math.cos(angle) * rad;
      this.smokePositions[i * 3 + 1] = spot.y + Math.random() * 120;
      this.smokePositions[i * 3 + 2] = spot.z + Math.sin(angle) * rad;

      this.smokeVelocities[i * 3] = (Math.random() - 0.5) * 2.2;
      this.smokeVelocities[i * 3 + 1] = 4.2 + Math.random() * 6.8;
      this.smokeVelocities[i * 3 + 2] = (Math.random() - 0.5) * 2.2;

      const shade = 0.1 + Math.random() * 0.16;
      this.smokeColors[i * 3] = shade * 1.15;
      this.smokeColors[i * 3 + 1] = shade;
      this.smokeColors[i * 3 + 2] = shade * 0.85;
    }

    geo.setAttribute('position', new T.BufferAttribute(this.smokePositions, 3));
    geo.setAttribute('color', new T.BufferAttribute(this.smokeColors, 3));

    const mat = new T.PointsMaterial({
      size: 18.0,
      map: this.smokeTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.52,
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
      size: 24.0,
      map: this.steamTex,
      vertexColors: true,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });

    this.steamPoints = new T.Points(geo, mat);
    this.group.add(this.steamPoints);
  }

  update(dt: number, sim: Simulation, time: number): void {
    if (!this.firePoints || !this.smokePoints || !this.emberPoints) return;

    const wind = sim.windVector;

    // 1. Update Point Lights and Scorch Discs
    for (let i = 0; i < this.state.hotspots.length; i++) {
      const spot = this.state.hotspots[i];
      const light = this.pointLights[i];
      const scorch = this.scorchMeshes[i];

      if (light) {
        if (spot.intensity <= 0.01) {
          light.intensity = 0;
        } else {
          const flicker = Math.sin(time * 16 + i * 2.3) * 0.45;
          light.intensity = spot.intensity * (2.2 + flicker);
        }
      }

      if (scorch) {
        const mat = scorch.material as T.MeshBasicMaterial;
        mat.opacity = 0.4 + spot.intensity * 0.45;
      }
    }

    // 2. Animate Dynamic Flame Pillars
    const firePos = this.firePoints.geometry.attributes
      .position as T.BufferAttribute;
    const fireCol = this.firePoints.geometry.attributes
      .color as T.BufferAttribute;

    let pIdx = 0;
    for (let h = 0; h < this.state.hotspots.length; h++) {
      const spot = this.state.hotspots[h];
      const intensity = spot.intensity;

      for (let i = 0; i < 32; i++) {
        if (intensity <= 0.01) {
          firePos.setY(pIdx, -500);
          fireCol.setXYZ(pIdx, 0, 0, 0);
        } else {
          this.fireHeights[pIdx] += this.fireSpeeds[pIdx] * dt;
          const maxFlameH = (4.0 + Math.sin(time * 15 + pIdx) * 1.5) * intensity;

          if (this.fireHeights[pIdx] > maxFlameH) {
            this.fireHeights[pIdx] = Math.random() * 0.4;
            this.fireAngles[pIdx] = Math.random() * Math.PI * 2;
            this.fireRadii[pIdx] = Math.random() * spot.radius * 0.85;
          }

          const angle = this.fireAngles[pIdx] + time * 0.4;
          const rad = this.fireRadii[pIdx];
          const x = spot.x + Math.cos(angle) * rad + wind.x * 0.15;
          const y = spot.y + this.fireHeights[pIdx];
          const z = spot.z + Math.sin(angle) * rad + wind.z * 0.15;

          firePos.setXYZ(pIdx, x, y, z);

          // Color gradient from base to tip
          const heightRatio = Math.min(1, this.fireHeights[pIdx] / Math.max(0.1, maxFlameH));
          const r = 1.0 * intensity;
          const g = (0.75 - heightRatio * 0.5) * intensity;
          const b = Math.max(0.02, (0.25 - heightRatio * 0.22)) * intensity;

          fireCol.setXYZ(pIdx, r, g, b);
        }
        pIdx++;
      }
    }
    firePos.needsUpdate = true;
    fireCol.needsUpdate = true;

    // 3. Animate Flying Embers & Sparks
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

      const x = emberPos.getX(i) + (this.emberVelocities[i * 3] + wind.x * 0.8) * dt;
      const y = emberPos.getY(i) + this.emberVelocities[i * 3 + 1] * dt;
      const z = emberPos.getZ(i) + (this.emberVelocities[i * 3 + 2] + wind.z * 0.8) * dt;

      emberPos.setXYZ(i, x, y, z);

      // Flickering spark brightness fading over lifespan
      const lifeRatio = 1 - life / maxLife;
      const sparkFlicker = 0.7 + Math.sin(time * 30 + i * 5) * 0.3;
      const bBright = lifeRatio * sparkFlicker * spot.intensity;

      emberCol.setXYZ(
        i,
        1.0 * bBright,
        (0.6 + Math.sin(time * 20 + i) * 0.3) * bBright,
        0.1 * bBright,
      );
    }
    emberPos.needsUpdate = true;
    emberCol.needsUpdate = true;

    // 4. Animate Volumetric Smoke Plumes
    const smokePos = this.smokePoints.geometry.attributes
      .position as T.BufferAttribute;
    const smokeCol = this.smokePoints.geometry.attributes
      .color as T.BufferAttribute;

    for (let i = 0; i < this.smokeCount; i++) {
      const spot = this.state.hotspots[i % this.state.hotspots.length];
      if (spot.intensity <= 0.01) {
        smokePos.setY(i, -500);
        continue;
      }

      let y = smokePos.getY(i) + this.smokeVelocities[i * 3 + 1] * dt;
      let x = smokePos.getX(i) + (this.smokeVelocities[i * 3] + wind.x * 0.5) * dt;
      let z = smokePos.getZ(i) + (this.smokeVelocities[i * 3 + 2] + wind.z * 0.5) * dt;

      const plumeH = y - spot.y;
      if (plumeH > 155) {
        y = spot.y + Math.random() * 2.5;
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * spot.radius * 0.75;
        x = spot.x + Math.cos(angle) * rad;
        z = spot.z + Math.sin(angle) * rad;
      }

      smokePos.setXYZ(i, x, y, z);

      // Diffuse color as smoke climbs into sky
      const altFactor = Math.min(1, Math.max(0, plumeH / 150));
      const baseShade = 0.12 + altFactor * 0.22;
      const r = (baseShade + 0.05 * altFactor) * spot.intensity;
      const g = (baseShade + 0.02 * altFactor) * spot.intensity;
      const b = (baseShade - 0.02 * altFactor) * spot.intensity;

      smokeCol.setXYZ(i, r, g, b);
    }
    smokePos.needsUpdate = true;
    smokeCol.needsUpdate = true;

    // 5. Animate Steam Puff Explosions
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

    // 6. Dynamic Atmospheric Scene Fog & Smoke Obscuration
    if (this.scene.fog && this.scene.fog instanceof T.FogExp2) {
      const exposure = this.state.smokeExposure ?? 0;
      if (exposure > 0.02) {
        // Dramatic low visibility: thick smoke reduces sight range
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

    for (const light of this.pointLights) {
      this.group.remove(light);
      light.dispose();
    }
    this.pointLights = [];

    for (const mesh of this.scorchMeshes) {
      mesh.geometry.dispose();
      (mesh.material as T.Material).dispose();
      this.group.remove(mesh);
    }
    this.scorchMeshes = [];

    this.flameTex.dispose();
    this.emberTex.dispose();
    this.smokeTex.dispose();
    this.steamTex.dispose();

    this.scene.remove(this.group);
  }
}

