import * as T from 'three';
import { FARMSTEADS, farmRotation } from '../landmark-data';
import { ground } from '../terrain-math';

export interface FarmsteadLightEntry {
  x: number;
  z: number;
  groundY: number;
  rotationY: number;
}

/**
 * Creates ground light pool geometry & radial falloff shader material
 * representing the warm glow cast by high-pressure sodium dusk-to-dawn yard lights.
 */
export function createYardLightPoolMaterial(): T.ShaderMaterial {
  const color = new T.Color('#ffc86b');
  const opacityUniform = { value: 0.0 };
  return new T.ShaderMaterial({
    uniforms: {
      color: { value: color },
      lightColor: { value: color },
      opacity: opacityUniform,
      poolOpacity: opacityUniform,
      radius: { value: 28.0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform vec3 color;
      uniform float opacity;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float d = length(p);
        if (d > 1.0) discard;
        // Soft cubic radial falloff from center pole
        float falloff = pow(clamp(1.0 - d, 0.0, 1.0), 1.8) * opacity;
        gl_FragColor = vec4(color, falloff);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
}

/**
 * FarmsteadLightsSystem manages all rural nighttime illumination:
 * - Dusk-to-dawn yard light poles with ground light pools
 * - Glowing warm farmhouse windows
 * - Blinking red obstruction beacons on grain silos
 * - Green threshold and white runway edge lighting at the home airstrip
 */
export class FarmsteadLightsSystem {
  group = new T.Group();
  yardLightPolesGroup = new T.Group();
  yardLightPoolsGroup = new T.Group();
  windowGlowGroup = new T.Group();
  siloBeaconsGroup = new T.Group();
  runwayLightsGroup = new T.Group();

  poolMaterial: T.ShaderMaterial;
  poleMaterial: T.MeshStandardMaterial;
  yardBulbMaterial: T.MeshBasicMaterial;
  windowGlowMaterial: T.MeshBasicMaterial;
  siloBeaconMaterial: T.MeshBasicMaterial;
  runwayEdgeMaterial: T.MeshBasicMaterial;
  runwayThresholdMaterial: T.MeshBasicMaterial;

  yardLightPositions: { x: number; y: number; z: number }[] = [];
  siloBeaconPositions: { x: number; y: number; z: number }[] = [];
  runwayLightPositions: { x: number; y: number; z: number; type: 'threshold' | 'edge' }[] = [];

  constructor(public scene: T.Scene) {
    this.group.name = 'farmstead-lights-system';

    // 1. Shared Materials
    this.poolMaterial = createYardLightPoolMaterial();
    this.poleMaterial = new T.MeshStandardMaterial({
      color: '#524536',
      roughness: 0.9,
    });
    this.yardBulbMaterial = new T.MeshBasicMaterial({
      color: '#fff5d6',
    });
    this.windowGlowMaterial = new T.MeshBasicMaterial({
      color: '#ffaa33',
      transparent: true,
      opacity: 0.0,
    });
    this.siloBeaconMaterial = new T.MeshBasicMaterial({
      color: '#ff1a1a',
      transparent: true,
      opacity: 0.0,
    });
    this.runwayEdgeMaterial = new T.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.0,
    });
    this.runwayThresholdMaterial = new T.MeshBasicMaterial({
      color: '#22c55e',
      transparent: true,
      opacity: 0.0,
    });

    // 2. Build Farmstead Lighting (poles, pools, windows, silo beacons)
    this.buildFarmsteads();

    // 3. Build Airstrip Lighting (runway markers, threshold, windsock)
    this.buildAirstrip();

    this.group.add(
      this.yardLightPolesGroup,
      this.yardLightPoolsGroup,
      this.windowGlowGroup,
      this.siloBeaconsGroup,
      this.runwayLightsGroup,
    );
    this.scene.add(this.group);
  }

  private buildFarmsteads(): void {
    const poleGeo = new T.CylinderGeometry(0.16, 0.22, 9.0, 6);
    const armGeo = new T.CylinderGeometry(0.06, 0.06, 2.2, 5);
    armGeo.rotateZ(Math.PI / 3);
    const shadeGeo = new T.ConeGeometry(0.65, 0.35, 8, 1, true);
    const bulbGeo = new T.SphereGeometry(0.28, 8, 6);
    const poolGeo = new T.PlaneGeometry(56, 56);
    poolGeo.rotateX(-Math.PI / 2);

    const windowGeo = new T.PlaneGeometry(2.5, 3.2);
    const beaconGeo = new T.SphereGeometry(0.45, 8, 6);

    let farmIndex = 0;
    for (const [fx, fz] of FARMSTEADS) {
      const fy = ground(fx, fz);
      const rot = farmRotation(farmIndex);
      const isBig = farmIndex % 2 === 0;

      // Yard light placed in central farmyard between barn and house
      // Local offset relative to farmstead center: (x: -12, z: 22)
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);
      const lx = -12;
      const lz = 22;
      const poleX = fx + cosR * lx - sinR * lz;
      const poleZ = fz + sinR * lx + cosR * lz;
      const poleY = ground(poleX, poleZ);

      this.yardLightPositions.push({ x: poleX, y: poleY + 8.6, z: poleZ });

      // Yard light pole assembly
      const pole = new T.Mesh(poleGeo, this.poleMaterial);
      pole.position.set(poleX, poleY + 4.5, poleZ);
      this.yardLightPolesGroup.add(pole);

      const arm = new T.Mesh(armGeo, this.poleMaterial);
      arm.position.set(poleX + 0.8, poleY + 8.8, poleZ);
      this.yardLightPolesGroup.add(arm);

      const shade = new T.Mesh(shadeGeo, this.poleMaterial);
      shade.position.set(poleX + 1.4, poleY + 8.5, poleZ);
      this.yardLightPolesGroup.add(shade);

      const bulb = new T.Mesh(bulbGeo, this.yardBulbMaterial);
      bulb.position.set(poleX + 1.4, poleY + 8.35, poleZ);
      this.yardLightPolesGroup.add(bulb);

      // Ground light pool decal
      const pool = new T.Mesh(poolGeo, this.poolMaterial);
      pool.position.set(poleX + 1.4, poleY + 0.15, poleZ);
      this.yardLightPoolsGroup.add(pool);

      // Lit House Windows (house is at local [-36, 0, 10])
      const hx = fx + cosR * -36 - sinR * 10;
      const hz = fz + sinR * -36 + cosR * 10;
      const hy = ground(hx, hz);

      // Front lower & upper windows
      for (const side of [-4.8, 4.8]) {
        // Lower window
        const winL = new T.Mesh(windowGeo, this.windowGlowMaterial);
        winL.position.set(
          hx + cosR * side - sinR * 8.05,
          hy + 3.8,
          hz + sinR * side + cosR * 8.05,
        );
        winL.rotation.y = rot;
        this.windowGlowGroup.add(winL);

        // Upper window
        const winU = new T.Mesh(windowGeo, this.windowGlowMaterial);
        winU.position.set(
          hx + cosR * side - sinR * 8.05,
          hy + 8.0,
          hz + sinR * side + cosR * 8.05,
        );
        winU.rotation.y = rot;
        this.windowGlowGroup.add(winU);
      }

      // Silo red warning beacon at apex
      // Silo height: 32 * (isBig ? 1.15 : 0.95) ~ 30-37m!
      const siloHeight = 32 * (isBig ? 1.15 : 0.95);
      const sx = fx + cosR * -8 - sinR * 0;
      const sz = fz + sinR * -8 + cosR * 0;
      const sy = ground(sx, sz) + siloHeight + 0.6;

      this.siloBeaconPositions.push({ x: sx, y: sy, z: sz });

      const beacon = new T.Mesh(beaconGeo, this.siloBeaconMaterial);
      beacon.position.set(sx, sy, sz);
      this.siloBeaconsGroup.add(beacon);

      farmIndex++;
    }
  }

  private buildAirstrip(): void {
    const bulbGeo = new T.SphereGeometry(0.24, 6, 6);
    const postGeo = new T.CylinderGeometry(0.08, 0.08, 0.6, 5);

    // Home grass airstrip at Yew Avenue (farmIndex 0, near x = 40, z = 0)
    // Runway extends from z = -135 to z = +135 along x = 28 and x = 52
    const minZ = -130;
    const maxZ = 130;
    const leftX = 28;
    const rightX = 52;

    // Runway Edge Markers (spaced every 26m)
    for (let z = minZ; z <= maxZ; z += 26) {
      for (const x of [leftX, rightX]) {
        const y = ground(x, z);
        this.runwayLightPositions.push({ x, y: y + 0.35, z, type: 'edge' });

        const post = new T.Mesh(postGeo, this.poleMaterial);
        post.position.set(x, y + 0.3, z);
        this.runwayLightsGroup.add(post);

        const bulb = new T.Mesh(bulbGeo, this.runwayEdgeMaterial);
        bulb.position.set(x, y + 0.6, z);
        this.runwayLightsGroup.add(bulb);
      }
    }

    // Runway Green Threshold Lights (4 lights at each end threshold)
    for (const z of [minZ, maxZ]) {
      for (let i = 0; i < 4; i++) {
        const x = leftX + 4 + i * 5.3;
        const y = ground(x, z);
        this.runwayLightPositions.push({ x, y: y + 0.35, z, type: 'threshold' });

        const post = new T.Mesh(postGeo, this.poleMaterial);
        post.position.set(x, y + 0.3, z);
        this.runwayLightsGroup.add(post);

        const bulb = new T.Mesh(bulbGeo, this.runwayThresholdMaterial);
        bulb.position.set(x, y + 0.6, z);
        this.runwayLightsGroup.add(bulb);
      }
    }

    // Windsock spotlight bulb at x = 25, z = -55, y = ground + 9
    const wy = ground(25, -55) + 8.6;
    const windsockBulb = new T.Mesh(bulbGeo, this.yardBulbMaterial);
    windsockBulb.position.set(25, wy, -54.2);
    this.runwayLightsGroup.add(windsockBulb);
  }

  get poolMat(): T.ShaderMaterial { return this.poolMaterial; }
  get windowMat(): T.MeshBasicMaterial { return this.windowGlowMaterial; }
  get beaconMat(): T.MeshBasicMaterial { return this.siloBeaconMaterial; }
  get runwayMat(): T.MeshBasicMaterial { return this.runwayEdgeMaterial; }
  get beaconMeshes(): T.Object3D[] { return this.siloBeaconsGroup.children; }
  get poleMeshes(): T.Object3D[] { return this.yardLightPolesGroup.children; }
  get windowMeshes(): T.Object3D[] { return this.windowGlowGroup.children; }
  get runwayLights(): T.Object3D[] { return this.runwayLightsGroup.children; }

  /**
   * Updates lighting intensities and pulsing silo warning beacons.
   */
  update(dtOrNight: number, timeOrDt: number, nightOrTime?: number): void {
    let time = timeOrDt;
    let nightFactor = nightOrTime ?? 0;

    if (nightOrTime !== undefined) {
      time = timeOrDt;
      nightFactor = nightOrTime;
    } else {
      nightFactor = timeOrDt;
    }

    if (nightFactor <= 0.001) {
      this.group.visible = false;
      this.poolMaterial.uniforms.opacity.value = 0.0;
      this.poolMaterial.uniforms.poolOpacity.value = 0.0;
      this.windowGlowMaterial.opacity = 0.0;
      this.siloBeaconMaterial.opacity = 0.0;
      this.runwayEdgeMaterial.opacity = 0.0;
      this.runwayThresholdMaterial.opacity = 0.0;
      return;
    }

    this.group.visible = true;

    // Ground light pool opacity ramps up smoothly with nightFactor
    this.poolMaterial.uniforms.opacity.value = nightFactor * 0.76;
    this.poolMaterial.uniforms.poolOpacity.value = nightFactor;

    // Farmhouse window glow
    this.windowGlowMaterial.opacity = nightFactor * 0.92;

    // Grain silo red obstruction beacons blink rhythmically (1.0 Hz)
    // 450ms ON, 550ms OFF
    const blinkCycle = (time * 1.0) % 1.0;
    const beaconOn = blinkCycle < 0.45;
    this.siloBeaconMaterial.opacity = nightFactor * (beaconOn ? 1.0 : 0.05);

    // Runway edge and threshold lights
    this.runwayEdgeMaterial.opacity = nightFactor * 0.88;
    this.runwayThresholdMaterial.opacity = nightFactor * 0.92;
  }

  dispose(): void {
    this.scene.remove(this.group);

    this.poolMaterial.dispose();
    this.poleMaterial.dispose();
    this.yardBulbMaterial.dispose();
    this.windowGlowMaterial.dispose();
    this.siloBeaconMaterial.dispose();
    this.runwayEdgeMaterial.dispose();
    this.runwayThresholdMaterial.dispose();

    this.group.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}
