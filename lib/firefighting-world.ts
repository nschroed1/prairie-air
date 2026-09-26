import * as T from 'three';
import type { FirefightingState } from './firefighting';
import type { Simulation } from './simulation';

export class FirefightingWorld {
  private group = new T.Group();
  private firePoints: T.Points | null = null;
  private smokePoints: T.Points | null = null;
  private firePositions: Float32Array;
  private fireColors: Float32Array;
  private smokePositions: Float32Array;
  private smokeColors: Float32Array;
  private smokeVelocities: Float32Array;
  private fireCount: number;
  private smokeCount = 180;

  constructor(
    private scene: T.Scene,
    private state: FirefightingState,
  ) {
    this.fireCount = state.hotspots.length * 16;
    this.firePositions = new Float32Array(this.fireCount * 3);
    this.fireColors = new Float32Array(this.fireCount * 3);
    this.smokePositions = new Float32Array(this.smokeCount * 3);
    this.smokeColors = new Float32Array(this.smokeCount * 3);
    this.smokeVelocities = new Float32Array(this.smokeCount * 3);

    this.initParticles();
    this.scene.add(this.group);
  }

  private initParticles(): void {
    // Fire particles
    const fireGeo = new T.BufferGeometry();
    let pIdx = 0;
    for (const spot of this.state.hotspots) {
      for (let i = 0; i < 16; i++) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * spot.radius * 0.85;
        this.firePositions[pIdx * 3] = spot.x + Math.cos(angle) * rad;
        this.firePositions[pIdx * 3 + 1] = spot.y + Math.random() * 3.5;
        this.firePositions[pIdx * 3 + 2] = spot.z + Math.sin(angle) * rad;

        // Vivid orange/yellow embers
        this.fireColors[pIdx * 3] = 1.0;
        this.fireColors[pIdx * 3 + 1] = 0.35 + Math.random() * 0.45;
        this.fireColors[pIdx * 3 + 2] = 0.05;
        pIdx++;
      }
    }
    fireGeo.setAttribute(
      'position',
      new T.BufferAttribute(this.firePositions, 3),
    );
    fireGeo.setAttribute('color', new T.BufferAttribute(this.fireColors, 3));
    const fireMat = new T.PointsMaterial({
      size: 5.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: T.AdditiveBlending,
      depthWrite: false,
    });
    this.firePoints = new T.Points(fireGeo, fireMat);
    this.group.add(this.firePoints);

    // Billowing smoke particles
    const smokeGeo = new T.BufferGeometry();
    for (let i = 0; i < this.smokeCount; i++) {
      const spot =
        this.state.hotspots[i % this.state.hotspots.length];
      const angle = Math.random() * Math.PI * 2;
      const rad = Math.random() * spot.radius;
      this.smokePositions[i * 3] = spot.x + Math.cos(angle) * rad;
      this.smokePositions[i * 3 + 1] = spot.y + Math.random() * 45;
      this.smokePositions[i * 3 + 2] = spot.z + Math.sin(angle) * rad;

      this.smokeVelocities[i * 3] = (Math.random() - 0.5) * 1.5;
      this.smokeVelocities[i * 3 + 1] = 4.5 + Math.random() * 6.0;
      this.smokeVelocities[i * 3 + 2] = (Math.random() - 0.5) * 1.5;

      const shade = 0.12 + Math.random() * 0.18;
      this.smokeColors[i * 3] = shade;
      this.smokeColors[i * 3 + 1] = shade;
      this.smokeColors[i * 3 + 2] = shade;
    }
    smokeGeo.setAttribute(
      'position',
      new T.BufferAttribute(this.smokePositions, 3),
    );
    smokeGeo.setAttribute('color', new T.BufferAttribute(this.smokeColors, 3));
    const smokeMat = new T.PointsMaterial({
      size: 14.0,
      vertexColors: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    });
    this.smokePoints = new T.Points(smokeGeo, smokeMat);
    this.group.add(this.smokePoints);
  }

  update(dt: number, sim: Simulation, time: number): void {
    if (!this.firePoints || !this.smokePoints) return;

    // Animate fire flicker and scale down extinguished spots
    const firePos = this.firePoints.geometry.attributes.position as T.BufferAttribute;
    const fireCol = this.firePoints.geometry.attributes.color as T.BufferAttribute;

    let idx = 0;
    for (const spot of this.state.hotspots) {
      for (let i = 0; i < 16; i++) {
        const intensity = spot.intensity;
        if (intensity <= 0.01) {
          firePos.setY(idx, -100); // hide below ground
          fireCol.setXYZ(idx, 0, 0, 0);
        } else {
          const flicker = Math.sin(time * 18 + idx) * 0.6;
          firePos.setY(idx, spot.y + Math.max(0.2, (1.8 + flicker) * intensity));
          fireCol.setXYZ(
            idx,
            1.0 * intensity,
            (0.35 + Math.sin(time * 12 + idx) * 0.25) * intensity,
            0.04 * intensity,
          );
        }
        idx++;
      }
    }
    firePos.needsUpdate = true;
    fireCol.needsUpdate = true;

    // Billow smoke upwards and with wind
    const smokePos = this.smokePoints.geometry.attributes.position as T.BufferAttribute;
    const wind = sim.windVector;

    for (let i = 0; i < this.smokeCount; i++) {
      const spot =
        this.state.hotspots[i % this.state.hotspots.length];
      if (spot.intensity <= 0.01) {
        smokePos.setY(i, -100);
        continue;
      }
      let y = smokePos.getY(i) + this.smokeVelocities[i * 3 + 1] * dt;
      let x = smokePos.getX(i) + (this.smokeVelocities[i * 3] + wind.x * 0.4) * dt;
      let z = smokePos.getZ(i) + (this.smokeVelocities[i * 3 + 2] + wind.z * 0.4) * dt;

      if (y > spot.y + 65) {
        y = spot.y + Math.random() * 2;
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * spot.radius * 0.8;
        x = spot.x + Math.cos(angle) * rad;
        z = spot.z + Math.sin(angle) * rad;
      }
      smokePos.setXYZ(i, x, y, z);
    }
    smokePos.needsUpdate = true;
  }

  dispose(): void {
    if (this.firePoints) {
      this.firePoints.geometry.dispose();
      (this.firePoints.material as T.Material).dispose();
      this.group.remove(this.firePoints);
      this.firePoints = null;
    }
    if (this.smokePoints) {
      this.smokePoints.geometry.dispose();
      (this.smokePoints.material as T.Material).dispose();
      this.group.remove(this.smokePoints);
      this.smokePoints = null;
    }
    this.scene.remove(this.group);
  }
}
