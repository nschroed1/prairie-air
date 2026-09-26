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

export interface SteamPuff {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  scale: number;
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
  smokeExposure: number; // 0.0 (clear air) to 1.0 (dense smoke hazard)
  thermalLift: number; // Convective vertical climb velocity boost (m/s)
  turbulence: number; // Buffeting stick shake intensity (0 to 1)
  proximityToFire: number; // Proximity to nearest active flame (0 to 1)
  steamPuffs: SteamPuff[];
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
    smokeExposure: 0,
    thermalLift: 0,
    turbulence: 0,
    proximityToFire: 0,
    steamPuffs: [],
  };
}

export function firefightingContract(base: Contract): Contract {
  return {
    ...base,
    id: 9904,
    kind: 'firefighting',
    name: 'Cedar Valley Timber Blaze',
    farmer: 'Iowa DNR & Heartland Fire Rescue',
    x: -360,
    z: 220,
    width: 240,
    depth: 300,
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

  // Advance and clean up existing steam puffs
  if (state.steamPuffs && state.steamPuffs.length > 0) {
    state.steamPuffs = state.steamPuffs.filter((puff) => {
      puff.life += dt;
      puff.x += puff.vx * dt;
      puff.y += puff.vy * dt;
      puff.z += puff.vz * dt;
      puff.scale += dt * 3.5;
      return puff.life < puff.maxLife;
    });
  } else {
    state.steamPuffs = [];
  }

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

        // Spawn billowing steam puffs when retardant drops hit active flames
        if (state.steamPuffs.length < 32 && Math.random() < dt * 18) {
          state.steamPuffs.push({
            x: spot.x + (Math.random() - 0.5) * spot.radius * 0.8,
            y: spot.y + 1.2 + Math.random() * 2,
            z: spot.z + (Math.random() - 0.5) * spot.radius * 0.8,
            vx: (Math.random() - 0.5) * 3 + sim.windVector.x * 0.35,
            vy: 6.5 + Math.random() * 5.0,
            vz: (Math.random() - 0.5) * 3 + sim.windVector.z * 0.35,
            life: 0,
            maxLife: 2.2 + Math.random() * 1.2,
            scale: 3.5,
          });
        }
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

  // 4. Calculate Smoke Exposure, Downwind Drift Cone, and Thermal Updrafts
  const wind = sim.windVector;
  const windSpeed = Math.hypot(wind.x, wind.z);
  const wDirX = windSpeed > 0.1 ? wind.x / windSpeed : 0;
  const wDirZ = windSpeed > 0.1 ? wind.z / windSpeed : -1;

  let maxSmokeExposure = 0;
  let maxThermalLift = 0;
  let maxProximity = 0;

  for (const spot of state.hotspots) {
    if (spot.intensity <= 0.02) continue;

    const dx = sim.x - spot.x;
    const dz = sim.z - spot.z;
    const distXZ = Math.hypot(dx, dz);
    const dy = sim.y - spot.y;

    // Proximity to flames (within 130m horizontal, 65m vertical)
    if (distXZ < 130 && dy > -5 && dy < 65) {
      const prox = (1 - distXZ / 130) * (1 - Math.max(0, dy) / 65) * spot.intensity;
      if (prox > maxProximity) maxProximity = prox;
    }

    // Direct smoke column exposure (within fire radius + 22m, up to 140m altitude)
    if (distXZ < spot.radius + 22 && dy > 0 && dy < 140) {
      const columnExp =
        (1 - distXZ / (spot.radius + 22)) *
        (1 - dy / 140) *
        spot.intensity *
        1.0;
      if (columnExp > maxSmokeExposure) maxSmokeExposure = columnExp;
    }

    // Downwind smoke plume cone:
    // Smoke trails downwind along wind vector up to ~290 meters
    const downwindDist = dx * wDirX + dz * wDirZ;
    if (downwindDist > 0 && downwindDist < 290 && dy > 0 && dy < 150) {
      // Perpendicular crosswind distance from plume centerline
      const crosswindDist = Math.abs(dx * -wDirZ + dz * wDirX);
      const plumeRadius = spot.radius + downwindDist * 0.4;
      if (crosswindDist < plumeRadius) {
        const lateralFactor = 1 - crosswindDist / plumeRadius;
        const downwindFactor = 1 - downwindDist / 290;
        const vertFactor = 1 - dy / 150;
        const plumeExp =
          lateralFactor * downwindFactor * vertFactor * spot.intensity * 0.95;
        if (plumeExp > maxSmokeExposure) maxSmokeExposure = plumeExp;
      }
    }

    // Convective Thermal Updrafts right above blazing hotspot
    if (distXZ < spot.radius + 18 && dy > 0 && dy < 90) {
      const horiz = 1 - distXZ / (spot.radius + 18);
      const vert = 1 - dy / 90;
      const lift = horiz * vert * spot.intensity * 4.6;
      if (lift > maxThermalLift) maxThermalLift = lift;
    }
  }

  // Smooth blending of smoke exposure to avoid sudden pops
  const targetExposure = Math.min(1, Math.max(0, maxSmokeExposure));
  state.smokeExposure = Math.max(
    0,
    Math.min(1, (state.smokeExposure ?? 0) + (targetExposure - (state.smokeExposure ?? 0)) * Math.min(1, dt * 3.2)),
  );
  state.thermalLift = maxThermalLift;
  state.proximityToFire = maxProximity;
  state.turbulence = Math.min(
    1,
    (maxThermalLift / 4.6) * 0.85 + (state.smokeExposure > 0.25 ? 0.35 : 0),
  );

  return { scooped, extinguishedAny };
}
