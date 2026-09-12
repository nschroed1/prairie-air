import { ground, riverX, type Simulation } from './simulation';
import { FARMSTEADS, farmRotation } from './landmark-data';
export type Point3 = { x: number; y: number; z: number };
export type StuntType = 'wire-skimmer' | 'trestle-runner' | 'near-miss';

export interface StuntEvent {
  type: StuntType;
  name: string;
  bonus: number;
  message: string;
  clearance?: number;
  targetName?: string;
  intensity?: number;
}

export interface WireSpan<P = Point3> {
  id: string;
  roadName: string;
  p1: P;
  p2: P;
  ground1: number;
  ground2: number;
  midpoint: P;
  length: number;
  wireDipY: number; // Mid-span lowest wire Y AGL (7.5m)
  lastTriggeredTime: number;
}

export interface StuntObstacle {
  id: string;
  kind: 'silo' | 'windmill' | 'barn';
  x: number;
  z: number;
  baseY: number;
  height: number;
  radius?: number; // Cylinder radius for silo and windmill
  width?: number; // Box width for barn
  depth?: number; // Box depth for barn
  rotationY?: number;
  lastTriggeredTime: number;
}

export interface TrestleBridge {
  z: number;
  riverX: number;
  spanWidth: number;
  deckY: number;
  waterY: number;
  lastTriggeredTime: number;
}

export const WATER_SURFACE_Y = 9.2;
export const WIRE_POLE_HEIGHT = 10.0;
export const WIRE_DIP_AGL = 7.5;
export const WIRE_MIN_AGL = 3.0;
export const WIRE_MAX_AGL = 7.2;
export const WIRE_MIN_SPEED = 30.0;
export const WIRE_BONUS = 50;

export const TRESTLE_Z = 150.0;
export const TRESTLE_DECK_Y = 24.0;
export const TRESTLE_MIN_ABOVE_WATER = 3.0;
export const TRESTLE_MAX_ABOVE_WATER = 7.0;
export const TRESTLE_BONUS = 200;

export const NEAR_MISS_MIN_CLEARANCE = 0.8;
export const NEAR_MISS_MAX_CLEARANCE = 3.8;
export const NEAR_MISS_MIN_SPEED = 32.0;
export const NEAR_MISS_MIN_CASH = 25;
export const NEAR_MISS_MAX_CASH = 100;

export const roadConfigs = [
  {
    axis: 'x' as const,
    fixed: 255 + 8,
    start: -1200,
    end: 750,
    step: 60,
    name: 'North Section Road',
  },
  {
    axis: 'x' as const,
    fixed: -255 - 8,
    start: -1200,
    end: 750,
    step: 60,
    name: 'South Section Road',
  },
  {
    axis: 'z' as const,
    fixed: 255 + 8,
    start: -1100,
    end: 1100,
    step: 60,
    name: 'East Section Line',
  },
  {
    axis: 'z' as const,
    fixed: -255 - 8,
    start: -1100,
    end: 1100,
    step: 60,
    name: 'West Section Line',
  },
];
export const windmillLocations = [
  { x: -335, z: -215, name: 'South Farm Windmill' },
  { x: -705, z: 120, name: 'River Pasture Windmill' },
  { x: 475, z: -740, name: 'East Bluff Windmill' },
  { x: 1655, z: 200, name: 'Prairie View Windmill' },
];

export function trestleSite(): TrestleBridge {
  const x = riverX(TRESTLE_Z),
    width = 58 * (1 + Math.sin(TRESTLE_Z * 0.008) * 0.07);
  // Match the elevated, terrain-following river ribbon used by the renderer.
  const waterY =
    (ground(x - width, TRESTLE_Z) + ground(x + width, TRESTLE_Z)) / 2 + 1.17;
  return {
    z: TRESTLE_Z,
    riverX: x,
    spanWidth: 110,
    waterY,
    deckY: waterY + TRESTLE_DECK_Y - WATER_SURFACE_Y,
    lastTriggeredTime: -Infinity,
  };
}

/** Deterministic stunt rules shared by browser prediction and server replay. */
export class StuntTracker {
  wireSpans: WireSpan[] = [];
  obstacles: StuntObstacle[] = [];
  trestleBridge: TrestleBridge;
  protected contractNearMissTimes = new Map<string, number>();
  private previous: Point3 | null = null;
  constructor(includeWorld = true) {
    this.trestleBridge = trestleSite();
    if (!includeWorld) return;
    let id = 0;
    for (const road of roadConfigs) {
      const poles: { pos: Point3; groundY: number }[] = [];
      for (let s = road.start; s <= road.end; s += road.step) {
        const x = road.axis === 'x' ? s : road.fixed;
        const z = road.axis === 'x' ? road.fixed : s;
        if (Math.abs(x - riverX(z)) < 55) continue;
        const groundY = ground(x, z);
        poles.push({
          pos: { x, y: groundY + WIRE_POLE_HEIGHT - 0.15, z },
          groundY,
        });
      }
      for (let i = 1; i < poles.length; i++) {
        const a = poles[i - 1],
          b = poles[i];
        const length = Math.hypot(
          b.pos.x - a.pos.x,
          b.pos.y - a.pos.y,
          b.pos.z - a.pos.z,
        );
        if (length > road.step * 1.6) continue;
        this.wireSpans.push({
          id: `wire_span_${id++}`,
          roadName: road.name,
          p1: a.pos,
          p2: b.pos,
          ground1: a.groundY,
          ground2: b.groundY,
          length,
          wireDipY: WIRE_DIP_AGL,
          midpoint: {
            x: (a.pos.x + b.pos.x) / 2,
            y: (a.groundY + b.groundY) / 2 + WIRE_DIP_AGL,
            z: (a.pos.z + b.pos.z) / 2,
          },
          lastTriggeredTime: -Infinity,
        });
      }
    }
    for (const [index, loc] of windmillLocations.entries())
      this.obstacles.push({
        id: `windmill_${index}`,
        kind: 'windmill',
        x: loc.x,
        z: loc.z,
        baseY: ground(loc.x, loc.z),
        height: 19,
        radius: 2.6,
        lastTriggeredTime: -Infinity,
      });
    this.registerFarmsteadObstacles();
  }
  snapshot() {
    return {
      previous: this.previous && { ...this.previous },
      times: [...this.wireSpans, ...this.obstacles]
        .filter((o) => Number.isFinite(o.lastTriggeredTime))
        .map((o) => [o.id, o.lastTriggeredTime] as const),
      trestle: Number.isFinite(this.trestleBridge.lastTriggeredTime)
        ? this.trestleBridge.lastTriggeredTime
        : null,
      contractTimes: [...this.contractNearMissTimes],
    };
  }
  restore(state?: ReturnType<StuntTracker['snapshot']>) {
    this.previous = state?.previous ? { ...state.previous } : null;
    const times = new Map(state?.times);
    for (const o of [...this.wireSpans, ...this.obstacles])
      o.lastTriggeredTime = times.get(o.id) ?? -Infinity;
    this.trestleBridge.lastTriggeredTime = state?.trestle ?? -Infinity;
    this.contractNearMissTimes = new Map(state?.contractTimes);
  }
  resetPosition() {
    this.previous = null;
  }
  update(_dt: number, sim: Simulation, time = sim.elapsed): StuntEvent[] {
    if (sim.phase !== 'flying') {
      this.previous = null;
      return [];
    }
    const current = { x: sim.x, y: sim.y, z: sim.z };
    const previous = this.previous;
    this.previous = current;
    if (
      !previous ||
      Math.hypot(
        current.x - previous.x,
        current.y - previous.y,
        current.z - previous.z,
      ) > Math.max(8, sim.speed * _dt * 2)
    )
      return [];
    const wire = this.checkUnderWire(
      previous,
      current,
      sim.speed,
      sim.altitude,
      time,
    );
    const trestle = this.checkTrestle(
      previous.z,
      current.z,
      sim.x,
      sim.y,
      sim.speed,
      time,
    );
    return [
      ...(wire ? [wire] : []),
      ...(trestle ? [trestle] : []),
      ...this.checkNearMiss(sim, time),
    ];
  }
  protected registerFarmsteadObstacles(): void {
    let fIdx = 0;
    for (const [fx, fz] of FARMSTEADS) {
      const gy = ground(fx, fz);
      const isBig = fIdx % 2 === 0;
      const barnScale = isBig ? 1.28 : 0.88;
      const angle = farmRotation(fIdx);

      // Farmstead Barn
      this.obstacles.push({
        id: `farmstead_barn_${fIdx}`,
        kind: 'barn',
        x: fx,
        z: fz,
        baseY: gy,
        height: 26.0 * barnScale,
        rotationY: angle,
        width: 28.0 * barnScale,
        depth: 44.0 * barnScale,
        lastTriggeredTime: -Infinity,
      });

      // Farmstead Silo (offset from farmstead origin at x = 32 * scale, z = -8)
      const offsetX = 32 * (isBig ? 1.15 : 0.95);
      const siloX = fx + offsetX * Math.cos(angle) - 8 * Math.sin(angle);
      const siloZ = fz - offsetX * Math.sin(angle) - 8 * Math.cos(angle);
      const siloGroundY = gy;

      this.obstacles.push({
        id: `farmstead_silo_${fIdx}`,
        kind: 'silo',
        x: siloX,
        z: siloZ,
        baseY: siloGroundY,
        height: 31.0,
        radius: 8.0,
        lastTriggeredTime: -Infinity,
      });

      fIdx++;
    }
  }

  /**
   * Calculates minimum clearance between aircraft position and an obstacle.
   */
  calculateClearance(
    px: number,
    py: number,
    pz: number,
    obs: StuntObstacle,
  ): number {
    if (obs.kind === 'silo' || obs.kind === 'windmill') {
      const radius = obs.radius ?? 6.5;
      const dx = px - obs.x;
      const dz = pz - obs.z;
      const horizontalDist = Math.hypot(dx, dz);
      const horizontalClearance = Math.max(0, horizontalDist - radius);

      const topY = obs.baseY + obs.height;
      let verticalClearance = 0;
      if (py > topY) {
        verticalClearance = py - topY;
      } else if (py < obs.baseY) {
        verticalClearance = obs.baseY - py;
      }

      if (horizontalClearance === 0 && verticalClearance === 0) {
        return 0; // Inside obstacle
      }
      if (verticalClearance === 0) {
        return horizontalClearance;
      }
      if (horizontalClearance === 0) {
        return verticalClearance;
      }
      return Math.hypot(horizontalClearance, verticalClearance);
    } else {
      // Barn box clearance
      const halfW = (obs.width ?? 32.0) / 2;
      const halfD = (obs.depth ?? 36.0) / 2;

      let dx = px - obs.x;
      let dz = pz - obs.z;

      if (obs.rotationY) {
        const cos = Math.cos(obs.rotationY);
        const sin = Math.sin(obs.rotationY);
        const rx = dx * cos - dz * sin;
        const rz = dx * sin + dz * cos;
        dx = rx;
        dz = rz;
      }

      const deltaX = Math.max(0, Math.abs(dx) - halfW);
      const deltaZ = Math.max(0, Math.abs(dz) - halfD);
      const horizontalClearance = Math.hypot(deltaX, deltaZ);

      const topY = obs.baseY + obs.height;
      let verticalClearance = 0;
      if (py > topY) {
        verticalClearance = py - topY;
      } else if (py < obs.baseY) {
        verticalClearance = obs.baseY - py;
      }

      if (horizontalClearance === 0 && verticalClearance === 0) {
        return 0; // Inside barn
      }
      if (verticalClearance === 0) {
        return horizontalClearance;
      }
      if (horizontalClearance === 0) {
        return verticalClearance;
      }
      return Math.hypot(horizontalClearance, verticalClearance);
    }
  }

  /**
   * Calculates proximity-scaled cash bonus for near-miss ($25 to $100).
   */
  calculateNearMissBonus(clearance: number): number {
    const clamped = Math.max(
      NEAR_MISS_MIN_CLEARANCE,
      Math.min(NEAR_MISS_MAX_CLEARANCE, clearance),
    );
    const t =
      (NEAR_MISS_MAX_CLEARANCE - clamped) /
      (NEAR_MISS_MAX_CLEARANCE - NEAR_MISS_MIN_CLEARANCE);
    return Math.round(
      NEAR_MISS_MIN_CASH + (NEAR_MISS_MAX_CASH - NEAR_MISS_MIN_CASH) * t,
    );
  }

  /**
   * Checks if aircraft crossed underneath a telephone wire span during the frame.
   */
  checkUnderWire(
    prevPos: Point3,
    currPos: Point3,
    speed: number,
    altitude: number,
    time = 0,
  ): StuntEvent | null {
    if (speed < WIRE_MIN_SPEED) return null;
    if (altitude < WIRE_MIN_AGL || altitude > WIRE_MAX_AGL) return null;

    const p1x = prevPos.x;
    const p1z = prevPos.z;
    const p2x = currPos.x;
    const p2z = currPos.z;

    for (const span of this.wireSpans) {
      if (time - span.lastTriggeredTime < 8.0) continue; // Cooldown per span

      const p3x = span.p1.x;
      const p3z = span.p1.z;
      const p4x = span.p2.x;
      const p4z = span.p2.z;

      // 2D segment-segment intersection test
      const denom = (p2x - p1x) * (p4z - p3z) - (p2z - p1z) * (p4x - p3x);
      let hit = false;

      if (Math.abs(denom) > 1e-6) {
        const t =
          ((p3x - p1x) * (p4z - p3z) - (p3z - p1z) * (p4x - p3x)) / denom;
        const u =
          ((p3x - p1x) * (p2z - p1z) - (p3z - p1z) * (p2x - p1x)) / denom;
        if (t >= -0.05 && t <= 1.05 && u >= 0.0 && u <= 1.0) {
          hit = true;
        }
      } else {
        // Parallel or small motion: check point-to-segment distance
        const dx = p4x - p3x;
        const dz = p4z - p3z;
        const segLen2 = dx * dx + dz * dz;
        if (segLen2 > 0) {
          const u = Math.max(
            0,
            Math.min(
              1,
              ((currPos.x - p3x) * dx + (currPos.z - p3z) * dz) / segLen2,
            ),
          );
          const projX = p3x + u * dx;
          const projZ = p3z + u * dz;
          if (Math.hypot(currPos.x - projX, currPos.z - projZ) < 3.2) {
            hit = true;
          }
        }
      }

      if (hit) {
        span.lastTriggeredTime = time;
        return {
          type: 'wire-skimmer',
          name: 'Wire Skimmer',
          bonus: WIRE_BONUS,
          message: '★ WIRE SKIMMER! Under the wire (+$50)',
          targetName: span.id,
          intensity: 0.65,
        };
      }
    }

    return null;
  }

  /**
   * Checks if aircraft flew through the timber bent arches of the railroad trestle bridge.
   */
  checkTrestle(
    prevZ: number,
    currZ: number,
    x: number,
    y: number,
    speed: number,
    time = 0,
  ): StuntEvent | null {
    if (speed < 18.0) return null;
    const b = this.trestleBridge;
    if (time - b.lastTriggeredTime < 6.0) return null;

    // Check if flight crossed z = 150m (or is right at the bridge)
    const crossedZ =
      (prevZ - b.z) * (currZ - b.z) <= 0 || Math.abs(currZ - b.z) <= 2.8;

    if (!crossedZ) return null;

    // Check if within the river gorge bridge opening
    const gorgeDist = Math.abs(x - b.riverX);
    if (gorgeDist > b.spanWidth / 2 - 4.0) return null;

    // Check height above water: 3m to 7m above water
    const heightAboveWater = y - b.waterY;
    if (
      heightAboveWater < TRESTLE_MIN_ABOVE_WATER ||
      heightAboveWater > TRESTLE_MAX_ABOVE_WATER
    ) {
      return null;
    }

    b.lastTriggeredTime = time;
    return {
      type: 'trestle-runner',
      name: 'Trestle Runner',
      bonus: TRESTLE_BONUS,
      message: '★ TRESTLE RUNNER! Cedar Gorge Bridge (+$200)',
      targetName: 'trestle_bridge',
      intensity: 0.85,
    };
  }

  /**
   * Checks near-miss close flybys (0.8m to 3.8m clearance, speed >= 32 m/s).
   */
  checkNearMiss(sim: Simulation, time = 0): StuntEvent[] {
    if (sim.speed < NEAR_MISS_MIN_SPEED || sim.phase !== 'flying') return [];

    const events: StuntEvent[] = [];

    // Combine static obstacles and active contract challenge obstacles
    const allObs = [...this.obstacles];
    if (sim.job.challenge?.obstacles) {
      for (const [idx, cObs] of sim.job.challenge.obstacles.entries()) {
        const ox = sim.job.x + cObs.x;
        const oz = sim.job.z + cObs.z;
        const gy = ground(ox, oz);
        if (cObs.kind === 'silo') {
          allObs.push({
            id: `contract_silo_${idx}`,
            kind: 'silo',
            x: ox,
            z: oz,
            baseY: gy,
            height: cObs.height,
            radius: 6.5,
            lastTriggeredTime: -Infinity,
          });
        } else if (cObs.kind === 'barn') {
          allObs.push({
            id: `contract_barn_${idx}`,
            kind: 'barn',
            x: ox,
            z: oz,
            baseY: gy,
            height: cObs.height,
            width: cObs.bodyWidth,
            depth: cObs.bodyDepth,
            lastTriggeredTime: -Infinity,
          });
        }
      }
    }

    for (const obs of allObs) {
      // Skip if inside barn corridor (barnstorming pass, not outside flyby)
      if (obs.kind === 'barn' && sim.inBarn) continue;

      // Quick bounding distance check
      const roughDist = Math.hypot(sim.x - obs.x, sim.z - obs.z);
      if (roughDist > 55) continue;

      // Contract obstacles above are rebuilt each frame. Their cooldown must
      // outlive those temporary objects, just like the static farm obstacles.
      const contractKey = obs.id.startsWith('contract_')
        ? `${sim.job.id}:${obs.id}:${obs.x}:${obs.z}`
        : null;
      const lastTriggered = contractKey
        ? (this.contractNearMissTimes.get(contractKey) ?? -Infinity)
        : obs.lastTriggeredTime;
      if (time - lastTriggered < 4.0) continue;

      const clearance = this.calculateClearance(sim.x, sim.y, sim.z, obs);

      if (
        clearance >= NEAR_MISS_MIN_CLEARANCE &&
        clearance <= NEAR_MISS_MAX_CLEARANCE
      ) {
        obs.lastTriggeredTime = time;
        if (contractKey) this.contractNearMissTimes.set(contractKey, time);
        const bonus = this.calculateNearMissBonus(clearance);
        const t =
          (NEAR_MISS_MAX_CLEARANCE - clearance) /
          (NEAR_MISS_MAX_CLEARANCE - NEAR_MISS_MIN_CLEARANCE);

        events.push({
          type: 'near-miss',
          name: `Near Miss: ${obs.kind}`,
          bonus,
          clearance: Math.round(clearance * 10) / 10,
          targetName: obs.id,
          message: `★ NEAR MISS! ${obs.kind.toUpperCase()} (${clearance.toFixed(1)}m) +$${bonus}`,
          intensity: 0.5 + 0.5 * t,
        });
      }
    }

    return events;
  }
}
