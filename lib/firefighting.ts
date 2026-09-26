import { ground, riverX } from './terrain-math';
import type { Contract, Simulation } from './simulation';

export interface FireHotspot {
  id: number;
  x: number;
  z: number;
  y: number;
  radius: number;
  intensity: number; // 1.0 (burning strong) to 0.0 (extinguished)
  initialIntensity: number;
}

export interface FirefightingState {
  hotspots: FireHotspot[];
  waterTank: number;
  waterCapacity: number;
  isScooping: boolean;
  containedFraction: number; // 0 to 1
  completed: boolean;
  startTime: number;
  elapsed: number;
}

export function getFireHotspots(): FireHotspot[] {
  const centers = [
    { id: 1, x: -380, z: 280, radius: 24 },
    { id: 2, x: -330, z: 210, radius: 22 },
    { id: 3, x: -440, z: 350, radius: 26 },
    { id: 4, x: -280, z: 160, radius: 20 },
    { id: 5, x: -360, z: 90, radius: 25 },
    { id: 6, x: -410, z: 180, radius: 22 },
  ];

  return centers.map((c) => ({
    ...c,
    y: ground(c.x, c.z) + 1.2,
    intensity: 1.0,
    initialIntensity: 1.0,
  }));
}

export function freshFirefightingState(): FirefightingState {
  return {
    hotspots: getFireHotspots(),
    waterTank: 100,
    waterCapacity: 100,
    isScooping: false,
    containedFraction: 0,
    completed: false,
    startTime: 0,
    elapsed: 0,
  };
}

export function firefightingContract(base: Contract): Contract {
  return {
    ...base,
    id: 9904,
    kind: 'firefighting',
    name: 'Cedar Valley Timber Blaze',
    farmer: 'Iowa DNR & Heartland Fire Rescue',
    crop: 'pasture',
    treatment: 'Phos-Chek Red Slurry & River Water',
    note: 'Drop red fire-retardant payload on brushfire clusters. Skim Cedar River below 4.5m AGL to scoop water refills.',
    difficulty: 'Air Tanker Ops',
    acres: 36,
    pay: 950,
    bonus: 350,
    target: 95,
    bonusTarget: 100,
    briefing:
      'Dry winds ignited a fast-moving brushfire on the Cedar Valley timber ridge. Fly low through the smoke to lay down your retardant swath. When your tank runs dry, swoop down to skim the Cedar River (<4.5m AGL) or touch down at the grass strip to scoop a refill.',
  };
}

export function stepFirefighting(
  state: FirefightingState,
  sim: Simulation,
  dt: number,
): { scooped: boolean; extinguishedAny: boolean } {
  state.elapsed += dt;
  let scooped = false;
  let extinguishedAny = false;

  // 1. Water Scooping: check if flying low over the Cedar River
  const rX = riverX(sim.z);
  const distToRiver = Math.abs(sim.x - rX);
  const isOverRiver = distToRiver < 60;
  const isScoopAltitude = sim.altitude > 2.8 && sim.altitude < 4.8;
  const isNearRunway =
    Math.hypot(sim.x - -170, sim.z - 250) < 65 && sim.altitude < 5;

  if ((isOverRiver && isScoopAltitude) || isNearRunway) {
    if (state.waterTank < state.waterCapacity) {
      state.waterTank = Math.min(
        state.waterCapacity,
        state.waterTank + dt * 40,
      );
      state.isScooping = true;
      scooped = true;
    }
  } else {
    state.isScooping = false;
  }

  // 2. Retardant Drop: when spraying and water tank has payload
  if (sim.spraying && state.waterTank > 0) {
    state.waterTank = Math.max(0, state.waterTank - dt * 28);

    for (const spot of state.hotspots) {
      if (spot.intensity <= 0) continue;
      const d = Math.hypot(sim.x - spot.x, sim.z - spot.z);
      if (d < spot.radius + 14 && sim.altitude < 32) {
        const cooling = dt * 0.55;
        spot.intensity = Math.max(0, spot.intensity - cooling);
        extinguishedAny = true;
      }
    }
  }

  // 3. Containment calculation
  const total = state.hotspots.length;
  const remaining = state.hotspots.reduce((sum, h) => sum + h.intensity, 0);
  state.containedFraction = Math.max(0, Math.min(1, (total - remaining) / total));

  if (state.containedFraction >= 0.95 && !state.completed) {
    state.completed = true;
  }

  return { scooped, extinguishedAny };
}
