import {
  containsPoint,
  fieldOutline,
  fieldSize,
  type NoSprayZone,
} from './field-geometry';
import type { Contract } from './simulation';
import { LESSON_WEATHER, type Weather } from './weather';

export const challengeStages = [
  {
    at: 0,
    name: 'Open skies',
    description: 'Room to learn. Gentle fronts and open fields.',
    next: 'Farm obstacles after 2 jobs',
  },
  {
    at: 2,
    name: 'Working country',
    description:
      'Barns, silos and hay stacks. Lift over the marked yards with spray off.',
    next: 'Bird flocks after 4 jobs',
  },
  {
    at: 4,
    name: 'Busy skies',
    description:
      'Birds cross your passes. Bank around flocks to protect the aircraft.',
    next: 'Locust swarms after 7 jobs',
  },
  {
    at: 7,
    name: 'Pest season',
    description:
      'Locust clouds clog the boom. Climb above 150 ft or go around.',
    next: 'Severe fronts after 12 jobs',
  },
  {
    at: 12,
    name: 'Storm country',
    description:
      'Strong fronts and occasional tornadoes. Leave the funnel a wide berth.',
    next: 'Keep the plane clean. Keep more of the pay.',
  },
] as const;
export const challengeTier = (flights: number) =>
  flights >= 12
    ? 4
    : flights >= 7
      ? 3
      : flights >= 4
        ? 2
        : flights >= 2
          ? 1
          : 0;
export type Obstacle = NoSprayZone & {
  kind: 'barn' | 'silo' | 'hay';
  height: number;
  bodyWidth: number;
  bodyDepth: number;
};
export type ChallengePlan = {
  version: 1;
  tier: number;
  seed: number;
  basePay: number;
  dangerPay: number;
  tornado: boolean;
  obstacles: Obstacle[];
};
const unit = (n: number) =>
  ((Math.imul(n ^ (n >>> 16), 0x45d9f3b) >>> 0) % 10000) / 10000;
const snap = (n: number) => Math.round(n / 12) * 12;

/** Frozen when a contract is accepted. Retrying cannot reroll hazards or compound pay. */
export function prepareContract(job: Contract, flights: number): Contract {
  if (job.kind === 'skywriting') return job;
  if (job.challenge) return job;
  const tier = challengeTier(flights),
    seed = (Math.imul(job.id + 79, 7919) + Math.floor(flights) * 104729) >>> 0;
  const { width, depth } = fieldSize(job),
    outline = fieldOutline(job);
  const obstacles: Obstacle[] = [];
  const isBigBarn = job.id % 2 === 0;
  const candidates = [
    {
      x: snap(width * 0.15),
      z: snap(-depth * 0.13),
      kind: 'barn' as const,
      height: isBigBarn ? 18 : 15,
      bodyWidth: isBigBarn ? 32 : 26,
      bodyDepth: isBigBarn ? 36 : 28,
      width: 48,
      depth: 60,
    },
    {
      x: snap(-width * 0.16),
      z: snap(depth * 0.23),
      kind: 'silo' as const,
      height: 27,
      bodyWidth: 13,
      bodyDepth: 13,
      width: 36,
      depth: 36,
    },
    {
      x: snap(width * 0.23),
      z: snap(depth * 0.27),
      kind: 'hay' as const,
      height: 6,
      bodyWidth: 20,
      bodyDepth: 12,
      width: 48,
      depth: 36,
    },
  ];
  if (tier > 0)
    for (const item of candidates.slice(
      0,
      tier === 1 ? 1 : tier === 2 ? 2 : 3,
    )) {
      // Yard edges align with the saved 12 m coverage grid, including odd cell spans.
      const zone = {
        ...item,
        x: item.x + ((item.width / 12) % 2 ? 6 : 0),
        z: item.z + ((item.depth / 12) % 2 ? 6 : 0),
      };
      if (
        [-1, 1].every((dx) =>
          [-1, 1].every((dz) =>
            containsPoint(
              outline,
              zone.x + (dx * zone.width) / 2,
              zone.z + (dz * zone.depth) / 2,
            ),
          ),
        )
      )
        obstacles.push(zone);
    }
  const dangerPay = Math.round(job.pay * [0, 0.1, 0.2, 0.3, 0.45][tier]);
  return {
    ...job,
    pay: job.pay + dangerPay,
    windStrength: tier === 0 && job.id === 0 ? 0.35 : 1,
    noSprayZones: obstacles,
    challenge: {
      version: 1,
      tier,
      seed,
      basePay: job.pay,
      dangerPay,
      tornado: tier === 4 && unit(seed + 67) < 0.22,
      obstacles,
    },
  };
}

export const frontStageSeconds = (tier: number) => [90, 80, 70, 65, 60][tier];
export function fieldFront(job: Contract, elapsed: number) {
  const tier = job.challenge?.tier ?? 0,
    length = frontStageSeconds(tier);
  const clock = Math.max(0, elapsed) % (length * 4),
    stage = Math.floor(clock / length);
  return {
    stage,
    remaining: Math.ceil(length - (clock % length)),
    length,
    clock,
    label: [
      'Clear window',
      'Front building',
      tier === 0 ? 'Passing showers' : 'Storm window',
      'Skies clearing',
    ][stage],
  };
}
export function challengeWeather(job: Contract, elapsed: number): Weather {
  const plan = job.challenge!;
  const front = fieldFront(job, elapsed),
    tier = plan.tier;
  const t = (front.clock % front.length) / front.length,
    blend = t * t * (3 - 2 * t);
  const peaks = [1.1, 2.6, 4.3, 6, 8];
  const values = [0, 0.45, 1, 0.3, 0],
    power =
      values[front.stage] +
      (values[front.stage + 1] - values[front.stage]) * blend;
  const rain = tier === 0 ? 0.18 : 0.4 + tier * 0.15;
  return {
    ...LESSON_WEATHER,
    id: plan.seed * 4 + front.stage,
    label: front.label,
    kind: front.stage === 2 ? 'rain' : front.stage === 1 ? 'overcast' : 'clear',
    temperature: Math.round(75 - power * 12),
    windMps: 0.65 + (peaks[tier] - 0.65) * power,
    windFrom: tier === 0 ? 270 : 225 + Math.round(unit(plan.seed) * 2) * 45,
    gust: 0.12 + power * (0.15 + tier * 0.09),
    cloud: 0.08 + power * 0.9,
    fog: 0.00008 + power * 0.0003,
    sunlight: 3.15 - power * 2.45,
    rain: (Math.max(0, power - 0.45) / 0.55) * rain,
    front:
      tier === 0
        ? undefined
        : front.stage < 2
          ? 'Building'
          : front.stage === 2
            ? 'Peak winds'
            : 'Easing',
    severity: tier < 2 ? 'Gentle' : tier < 4 ? 'Challenging' : 'Demanding',
  };
}

export type HazardPoint = { x: number; z: number; altitude: number };
/** One crossing per 46 seconds. Rendering and authoritative collision use this exact path. */
export function birdFlock(job: Contract, elapsed: number): HazardPoint | null {
  if (!job.challenge || job.challenge.tier < 2) return null;
  const { width, depth } = fieldSize(job),
    cycle = Math.floor(elapsed / 46),
    t = elapsed % 46;
  const direction = cycle % 2 ? -1 : 1;
  return {
    x: job.x + direction * (-width / 2 - 110 + (t * (width + 220)) / 46),
    z: job.z + Math.sin(cycle * 2.3 + job.challenge.seed) * depth * 0.28,
    altitude: 19 + Math.sin(t * 0.2) * 4,
  };
}
export function locustSwarm(
  job: Contract,
  elapsed: number,
): HazardPoint | null {
  if (!job.challenge || job.challenge.tier < 3) return null;
  const { width, depth } = fieldSize(job);
  return {
    x: job.x + Math.sin(elapsed * 0.021 + job.challenge.seed) * width * 0.28,
    z: job.z + Math.cos(elapsed * 0.026) * depth * 0.25,
    altitude: 23,
  };
}
export function tornadoState(job: Contract, elapsed: number) {
  if (!job.challenge?.tornado) return null;
  const front = fieldFront(job, elapsed),
    warningAt = front.length * 2 - 20,
    startsAt = front.length * 2 + 10,
    endsAt = front.length * 3 + 15;
  if (front.clock < warningAt || front.clock > endsAt) return null;
  const progress = Math.max(0, (front.clock - startsAt) / (endsAt - startsAt));
  return {
    x: job.x + 350 - progress * 600,
    z: job.z - 90 + Math.sin(progress * Math.PI) * 180,
    active: front.clock >= startsAt,
    seconds: Math.max(0, Math.ceil(startsAt - front.clock)),
    progress,
  };
}

export function hazardWarning(
  job: Contract,
  elapsed: number,
  x: number,
  z: number,
  altitude: number,
) {
  const tornado = tornadoState(job, elapsed);
  if (tornado)
    return {
      danger: true,
      text: tornado.active
        ? `Tornado · ${Math.round(Math.hypot(x - tornado.x, z - tornado.z))} m · keep 220 m clear`
        : `Tornado warning · touchdown in ${tornado.seconds}s · leave room to escape`,
    };
  const obstacle = job.challenge?.obstacles.find(
    (o) =>
      Math.hypot(x - job.x - o.x, z - job.z - o.z) < 110 &&
      altitude < o.height + 18,
  );
  if (obstacle)
    return {
      danger: true,
      text: `${obstacle.kind === 'silo' ? 'Silo' : obstacle.kind === 'barn' ? 'Barn' : 'Hay stacks'} nearby · climb, spray off over the striped yard`,
    };
  const birds = birdFlock(job, elapsed);
  if (birds && Math.hypot(x - birds.x, z - birds.z) < 160 && altitude < 45)
    return {
      danger: true,
      text: 'Bird flock crossing · bank around or climb above 150 ft',
    };
  const swarm = locustSwarm(job, elapsed);
  if (swarm && Math.hypot(x - swarm.x, z - swarm.z) < 125 && altitude < 45)
    return {
      danger: true,
      text: 'Locust swarm nearby · climb above 150 ft to protect the boom',
    };
  const front = fieldFront(job, elapsed);
  return {
    danger: false,
    text: `${front.label} · ${front.remaining}s to ${['building winds', 'showers', 'clearing skies', 'the next clear window'][front.stage]}`,
  };
}
