import * as T from 'three';
import { ground } from '../terrain-math';

export type VehicleKind = 'pickup' | 'flatbed' | 'sedan';

export interface RoadRoute {
  id: string;
  axis: 'x' | 'z';
  fixedCoord: number; // constant coordinate (e.g. z = 255 or x = -255)
  start: number;
  end: number;
  speed: number;
  direction: 1 | -1;
  kind: VehicleKind;
  bodyColor: string;
}

export interface VehicleState {
  route: RoadRoute;
  pos: number; // current position along travel axis
  distanceAlongRoute: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  group: T.Group;
  mesh: T.Group;
  headlightMesh: T.Mesh;
  taillightMesh: T.Mesh;
  headlightBeam: T.Mesh;
}

export const SECTION_ROAD_INTERVAL = 510;

/** Predefined rural traffic routes along O'Brien County section roads */
export function getTrafficRoutes(): RoadRoute[] {
  return [
    // 1. Yew Avenue (X = -255): Home farm road
    {
      id: 'yew-ave-south',
      axis: 'z',
      fixedCoord: -255,
      start: -1800,
      end: 1800,
      speed: 17.5, // ~40 mph
      direction: 1, // Heading south
      kind: 'pickup',
      bodyColor: '#b91c1c', // Classic farm red
    },
    {
      id: 'yew-ave-north',
      axis: 'z',
      fixedCoord: -255,
      start: 1600,
      end: -1600,
      speed: 16.0,
      direction: -1, // Heading north
      kind: 'flatbed',
      bodyColor: '#334155', // Slate farm truck
    },
    // 2. 100th Avenue (X = +255): East section road
    {
      id: '100th-ave-south',
      axis: 'z',
      fixedCoord: 255,
      start: -1900,
      end: 1700,
      speed: 18.0,
      direction: 1,
      kind: 'sedan',
      bodyColor: '#0369a1', // Rural blue sedan
    },
    {
      id: '100th-ave-north',
      axis: 'z',
      fixedCoord: 255,
      start: 1800,
      end: -1800,
      speed: 19.5,
      direction: -1,
      kind: 'pickup',
      bodyColor: '#f8fafc', // White pickup
    },
    // 3. 300th Street (Z = +255): South section road
    {
      id: '300th-st-east',
      axis: 'x',
      fixedCoord: 255,
      start: -1800,
      end: 1800,
      speed: 17.0,
      direction: 1, // Heading east
      kind: 'pickup',
      bodyColor: '#15803d', // Forest green
    },
    {
      id: '300th-st-west',
      axis: 'x',
      fixedCoord: 255,
      start: 1700,
      end: -1700,
      speed: 18.5,
      direction: -1, // Heading west
      kind: 'sedan',
      bodyColor: '#e2e8f0', // Silver sedan
    },
    // 4. 290th Street (Z = -255): North section road
    {
      id: '290th-st-east',
      axis: 'x',
      fixedCoord: -255,
      start: -1700,
      end: 1700,
      speed: 16.5,
      direction: 1,
      kind: 'flatbed',
      bodyColor: '#78350f', // Grain harvest brown
    },
    {
      id: '290th-st-west',
      axis: 'x',
      fixedCoord: -255,
      start: 1800,
      end: -1800,
      speed: 17.5,
      direction: -1,
      kind: 'pickup',
      bodyColor: '#c2410c', // Terracotta orange
    },
    // 5. County Road B14 (Z = -1785): Paved highway
    {
      id: 'hwy-b14-east',
      axis: 'x',
      fixedCoord: -1785,
      start: -2400,
      end: 2400,
      speed: 24.5, // ~55 mph highway speed
      direction: 1,
      kind: 'sedan',
      bodyColor: '#1e293b', // Midnight sedan
    },
    {
      id: 'hwy-b14-west',
      axis: 'x',
      fixedCoord: -1785,
      start: 2400,
      end: -2400,
      speed: 23.0,
      direction: -1,
      kind: 'flatbed',
      bodyColor: '#475569',
    },
    // 6. 310th Street (Z = 765): Far south road
    {
      id: '310th-st-east',
      axis: 'x',
      fixedCoord: 765,
      start: -1600,
      end: 1600,
      speed: 16.0,
      direction: 1,
      kind: 'pickup',
      bodyColor: '#eab308', // Yellow farm utility truck
    },
    // 7. 90th Avenue (X = -765): Far west section road
    {
      id: '90th-ave-south',
      axis: 'z',
      fixedCoord: -765,
      start: -1700,
      end: 1700,
      speed: 18.0,
      direction: 1,
      kind: 'pickup',
      bodyColor: '#0f172a',
    },
  ];
}

export const generateSectionRoadRoutes = getTrafficRoutes;

/**
 * Builds vehicle 3D model with cab, bed/trunk, wheels, headlights, and taillights.
 */
export function createVehicleMesh(
  kind: VehicleKind,
  bodyColor: string,
  headlightMat?: T.Material,
  taillightMat?: T.Material,
  beamMat?: T.Material,
): T.Group & {
  group: T.Group;
  headlightMesh: T.Mesh;
  taillightMesh: T.Mesh;
  headlightBeam: T.Mesh;
} {
  const group = new T.Group();
  const hlMat = headlightMat ?? new T.MeshBasicMaterial({ color: '#fffbe8' });
  const tlMat = taillightMat ?? new T.MeshBasicMaterial({ color: '#ef4444' });
  const bmMat = beamMat ?? createHeadlightBeamMaterial();

  const bodyMat = new T.MeshStandardMaterial({
    color: bodyColor,
    metalness: 0.25,
    roughness: 0.65,
  });
  const glassMat = new T.MeshStandardMaterial({
    color: '#0f172a',
    metalness: 0.7,
    roughness: 0.2,
  });
  const wheelMat = new T.MeshStandardMaterial({
    color: '#1e293b',
    roughness: 0.9,
  });

  const width = 2.2;
  const length = kind === 'flatbed' ? 7.2 : kind === 'pickup' ? 5.6 : 4.8;
  const height = kind === 'flatbed' ? 2.4 : 1.8;

  // 1. Main Lower Chassis
  const chassisGeo = new T.BoxGeometry(width, 0.7, length);
  const chassis = new T.Mesh(chassisGeo, bodyMat);
  chassis.position.set(0, 0.65, 0);
  chassis.castShadow = true;
  group.add(chassis);

  // 2. Cab / Cabin
  const cabL = kind === 'sedan' ? 2.6 : 2.2;
  const cabZ = kind === 'sedan' ? 0 : 0.6;
  const cabGeo = new T.BoxGeometry(width * 0.9, height * 0.65, cabL);
  const cab = new T.Mesh(cabGeo, bodyMat);
  cab.position.set(0, 1.35, cabZ);
  cab.castShadow = true;
  group.add(cab);

  // Windshield
  const wsGeo = new T.BoxGeometry(width * 0.88, height * 0.55, 0.2);
  const windshield = new T.Mesh(wsGeo, glassMat);
  windshield.position.set(0, 1.38, cabZ + cabL / 2 + 0.05);
  windshield.rotation.x = -0.22;
  group.add(windshield);

  // 3. Cargo Bed (for Pickups and Flatbeds)
  if (kind === 'pickup' || kind === 'flatbed') {
    const bedL = length - cabL - 1.2;
    const bedZ = -cabL / 2 - bedL / 2;
    // Bed walls
    const wallGeo = new T.BoxGeometry(width * 0.96, 0.55, bedL);
    const bedWall = new T.Mesh(wallGeo, bodyMat);
    bedWall.position.set(0, 1.1, bedZ);
    group.add(bedWall);
  }

  // 4. Wheels (4 wheels)
  const wheelGeo = new T.CylinderGeometry(0.42, 0.42, 0.32, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelZFront = length * 0.32;
  const wheelZBack = -length * 0.32;
  const wheelX = width / 2;

  for (const z of [wheelZFront, wheelZBack]) {
    for (const sx of [-1, 1]) {
      const w = new T.Mesh(wheelGeo, wheelMat);
      w.position.set(sx * wheelX, 0.42, z);
      group.add(w);
    }
  }

  // 5. Headlights (Twin front lights)
  // Vehicle points toward +Z by default
  const lightGeo = new T.BoxGeometry(0.38, 0.22, 0.15);
  const headlightGroup = new T.Group();
  for (const sx of [-0.75, 0.75]) {
    const hl = new T.Mesh(lightGeo, hlMat);
    hl.position.set(sx, 0.75, length / 2 + 0.08);
    headlightGroup.add(hl);
  }
  // Use a merged/composite representation
  const headlightMesh = headlightGroup.children[0] as T.Mesh;
  group.add(headlightGroup);

  // 6. Taillights (Twin red rear lights at -Z)
  const tailGeo = new T.BoxGeometry(0.32, 0.18, 0.12);
  const taillightGroup = new T.Group();
  for (const sx of [-0.75, 0.75]) {
    const tl = new T.Mesh(tailGeo, tlMat);
    tl.position.set(sx, 0.75, -length / 2 - 0.08);
    taillightGroup.add(tl);
  }
  const taillightMesh = taillightGroup.children[0] as T.Mesh;
  group.add(taillightGroup);

  // 7. Projected Headlight Ground Beam (soft angled cone shining down road)
  const beamGeo = new T.PlaneGeometry(5.5, 24);
  beamGeo.rotateX(-Math.PI / 2);
  const headlightBeam = new T.Mesh(beamGeo, bmMat);
  headlightBeam.position.set(0, 0.12, length / 2 + 12);
  group.add(headlightBeam);

  return Object.assign(group, { group, headlightMesh, taillightMesh, headlightBeam });
}

/**
 * Material for projected headlight ground illumination beams.
 */
export function createHeadlightBeamMaterial(): T.ShaderMaterial {
  const color = new T.Color('#fff7d9');
  const opacityUniform = { value: 0.0 };
  return new T.ShaderMaterial({
    uniforms: {
      color: { value: color },
      beamColor: { value: color },
      opacity: opacityUniform,
      beamOpacity: opacityUniform,
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
        // Soft trapezoidal beam projection ahead of headlights
        float lateral = abs(vUv.x - 0.5) * 2.0;
        float longitudinal = vUv.y; // 0 (near bumper) to 1 (far ahead)
        if (lateral > 1.0) discard;
        float beam = (1.0 - lateral * 0.8) * pow(1.0 - longitudinal, 1.4) * opacity;
        gl_FragColor = vec4(color, beam * 0.55);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: T.AdditiveBlending,
    side: T.DoubleSide,
  });
}

/**
 * RoadTrafficSystem coordinates cars and pickup trucks traveling
 * along rural section roads day and night.
 */
export class RoadTrafficSystem {
  group = new T.Group();
  vehicles: VehicleState[] = [];

  headlightMaterial: T.MeshBasicMaterial;
  taillightMaterial: T.MeshBasicMaterial;
  beamMaterial: T.ShaderMaterial;

  get headlightMat(): T.MeshBasicMaterial { return this.headlightMaterial; }
  get taillightMat(): T.MeshBasicMaterial { return this.taillightMaterial; }
  get beamMat(): T.ShaderMaterial { return this.beamMaterial; }

  constructor(public scene: T.Scene, fleetSize?: number) {
    this.group.name = 'road-traffic-system';

    this.headlightMaterial = new T.MeshBasicMaterial({
      color: '#fffbe8',
      transparent: true,
      opacity: 0.9,
    });
    this.taillightMaterial = new T.MeshBasicMaterial({
      color: '#ef4444',
      transparent: true,
      opacity: 0.8,
    });
    this.beamMaterial = createHeadlightBeamMaterial();

    this.buildFleet(fleetSize);
    this.scene.add(this.group);
  }

  private buildFleet(fleetSize?: number): void {
    let routes = getTrafficRoutes();
    if (fleetSize !== undefined && fleetSize > 0) {
      if (fleetSize <= routes.length) {
        routes = routes.slice(0, fleetSize);
      } else {
        const expanded: RoadRoute[] = [];
        for (let i = 0; i < fleetSize; i++) {
          expanded.push({
            ...routes[i % routes.length],
            id: `${routes[i % routes.length].id}-${i}`,
          });
        }
        routes = expanded;
      }
    }

    for (const route of routes) {
      const { group, headlightMesh, taillightMesh, headlightBeam } = createVehicleMesh(
        route.kind,
        route.bodyColor,
        this.headlightMaterial,
        this.taillightMaterial,
        this.beamMaterial,
      );

      // Start position spaced along route
      const initialPos = route.start;
      const heading =
        route.axis === 'z'
          ? route.direction > 0
            ? Math.PI // Moving South (+Z)
            : 0 // Moving North (-Z)
          : route.direction > 0
            ? Math.PI / 2 // Moving East (+X)
            : -Math.PI / 2; // Moving West (-X)

      group.rotation.y = heading;

      const state: VehicleState = {
        route,
        pos: initialPos,
        distanceAlongRoute: initialPos,
        x: 0,
        y: 0,
        z: 0,
        heading,
        speed: route.speed,
        group,
        mesh: group,
        headlightMesh,
        taillightMesh,
        headlightBeam,
      };

      this.updateVehiclePosition(state, 0);
      this.vehicles.push(state);
      this.group.add(group);
    }
  }

  private updateVehiclePosition(v: VehicleState, dt: number): void {
    const r = v.route;
    v.pos += r.direction * v.speed * dt;
    v.distanceAlongRoute = v.pos;

    // Loop when reaching end of section line
    const minP = Math.min(r.start, r.end);
    const maxP = Math.max(r.start, r.end);

    if (r.direction > 0 && v.pos > maxP) {
      v.pos = minP;
    } else if (r.direction < 0 && v.pos < minP) {
      v.pos = maxP;
    }

    // Right-hand traffic offset from road centerline (+/- 2.2m)
    let vx = 0;
    let vz = 0;

    if (r.axis === 'z') {
      vz = v.pos;
      vx = r.fixedCoord + (r.direction > 0 ? -2.2 : 2.2);
    } else {
      vx = v.pos;
      vz = r.fixedCoord + (r.direction > 0 ? 2.2 : -2.2);
    }

    const vy = ground(vx, vz) + 0.12;

    v.x = vx;
    v.y = vy;
    v.z = vz;

    v.group.position.set(vx, vy, vz);
  }

  /**
   * Updates all vehicle positions and day/night lighting.
   */
  update(dt: number, a?: number | T.Vector3, b?: number | T.Vector3, c?: number): void {
    let nightFactor = 0;
    let aircraftPos: T.Vector3 | undefined;

    if (typeof a === 'number') {
      if (typeof b === 'number' && typeof c === 'number') {
        // update(dt, simX, simZ, nightFactor)
        aircraftPos = new T.Vector3(a, 0, b);
        nightFactor = c;
      } else {
        // update(dt, nightFactor, [aircraftPos])
        nightFactor = a;
        if (b && typeof b !== 'number') aircraftPos = b;
      }
    } else if (a && typeof a !== 'number') {
      aircraftPos = a;
      if (typeof b === 'number') nightFactor = b;
    }

    const clampedNight = Math.max(0, Math.min(1, nightFactor));

    // Update headlight ground beam opacity (only visible at dusk/night)
    this.beamMaterial.uniforms.opacity.value = clampedNight * 0.75;
    this.beamMaterial.uniforms.beamOpacity.value = clampedNight * 0.75;

    // Headlight and taillight brightness
    if (clampedNight <= 0.001) {
      this.headlightMaterial.opacity = 0.0;
      this.taillightMaterial.opacity = 0.0;
    } else {
      this.headlightMaterial.opacity = 0.5 + clampedNight * 0.5;
      this.taillightMaterial.opacity = 0.3 + clampedNight * 0.7;
    }

    for (const v of this.vehicles) {
      this.updateVehiclePosition(v, dt);

      // Distance culling: hide vehicles farther than 2,800m
      if (aircraftPos) {
        const dist = Math.hypot(v.x - aircraftPos.x, v.z - aircraftPos.z);
        v.group.visible = dist < 2800;
      }
    }
  }

  dispose(): void {
    this.scene.remove(this.group);

    this.headlightMaterial.dispose();
    this.taillightMaterial.dispose();
    this.beamMaterial.dispose();

    this.group.traverse((obj) => {
      if (obj instanceof T.Mesh) {
        obj.geometry.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
  }
}
