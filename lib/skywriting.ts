import { ground, type Career, type Contract } from './simulation';
import { LESSON_WEATHER, type Weather } from './weather';

export const SKYWRITING_PRACTICE_ID = 3;
export const SKYWRITING_UNLOCK = 3;
export const SKYWRITING_INTERVAL = 8;
export const SKY_SEGMENTS = 80;
export const SKY_SMOKE_LIMIT = 384;
export const SKY_SMOKE_LIFE = 160;
export type SkyPoint = { x: number; y: number; z: number };
export type SkySmoke = [x: number, y: number, z: number, at: number];
export type SkywritingPlan = {
  version: 1;
  shape: 'heart';
  altitude: number;
  tolerance: number;
  level: 0 | 1;
};
export type SkywritingState = {
  progress: number;
  loops: number;
  ink: number[];
  goodSmoke: number;
  straySmoke: number;
  smoke: SkySmoke[];
  last: SkyPoint | null;
  sampleDistance: number;
};

// A rounded heart, sampled at equal distances. Its turns are large enough for
// the normal 34 m/s flight controls; it does not require aerobatic mode.
const anchors = [
  [0, -70],
  [70, -150],
  [160, -145],
  [220, -65],
  [205, 35],
  [130, 125],
  [35, 205],
  [0, 215],
  [-35, 205],
  [-130, 125],
  [-205, 35],
  [-220, -65],
  [-160, -145],
  [-70, -150],
];
const curve = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 *
  (2 * p1 +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
const dense = Array.from({ length: anchors.length * 40 + 1 }, (_, i) => {
  const n = anchors.length,
    u = (i / 40) % n,
    k = Math.floor(u),
    t = u - k;
  const p = [
    anchors[(k + n - 1) % n],
    anchors[k],
    anchors[(k + 1) % n],
    anchors[(k + 2) % n],
  ];
  return {
    x: curve(p[0][0], p[1][0], p[2][0], p[3][0], t) * 1.5,
    z: curve(p[0][1], p[1][1], p[2][1], p[3][1], t) * 1.5,
  };
});
const distances = [0];
for (let i = 1; i < dense.length; i++)
  distances.push(
    distances[i - 1] +
      Math.hypot(dense[i].x - dense[i - 1].x, dense[i].z - dense[i - 1].z),
  );
export const SKY_LENGTH = distances.at(-1)!;
export const SKY_SPACING = SKY_LENGTH / SKY_SEGMENTS;
const template = Array.from({ length: SKY_SEGMENTS + 1 }, (_, i) => {
  const distance = i * SKY_SPACING;
  const end = Math.max(
    1,
    distances.findIndex((d) => d >= distance),
  );
  const t =
    (distance - distances[end - 1]) / (distances[end] - distances[end - 1]);
  return {
    x: dense[end - 1].x + (dense[end].x - dense[end - 1].x) * t,
    z: dense[end - 1].z + (dense[end].z - dense[end - 1].z) * t,
  };
});

export const isSkywriting = (job: Contract) =>
  job.kind === 'skywriting' && job.skywriting?.version === 1;
export const skywritingDueAt = (career: Career) =>
  Math.max(
    SKYWRITING_UNLOCK,
    (career.lastSkywritingFlight ?? -5) + SKYWRITING_INTERVAL,
  );
export const skywritingAvailable = (career: Career) =>
  career.flights >= skywritingDueAt(career);
export function skywritingContract<T extends Contract>(
  base: T,
  level: 0 | 1 = 0,
): T {
  // High enough for spectators beneath the route to see the complete drawing,
  // with room to correct height below the aircraft's 600 m ceiling.
  const altitude = Math.min(
    580,
    Math.ceil(
      Math.max(...template.map((p) => ground(base.x + p.x, base.z + p.z))) +
        470,
    ),
  );
  return {
    ...base,
    kind: 'skywriting',
    name: level ? 'Love on the breeze' : 'Wedding wishes',
    farmer: 'Cedar Valley wedding party',
    treatment: 'Skywriting smoke',
    acres: 0,
    pay: level ? 1800 : 1400,
    bonus: level ? 600 : 450,
    target: 80,
    bonusTarget: 95,
    difficulty: level ? 'Crosswind skywriting' : 'Gentle skywriting',
    note: 'Draw a big heart above the wedding. Follow the gates in order and leave a continuous smoke line.',
    briefing:
      'A wedding below, a blank sky above. Follow the gold gates around the heart. Hold Space to write; release it while correcting your line. Finish the full circuit, with at least 80% written and 65% smoke accuracy.',
    windStrength: 1,
    challenge: undefined,
    noSprayZones: undefined,
    skywriting: {
      version: 1,
      shape: 'heart',
      altitude,
      tolerance: level ? 30 : 38,
      level,
    },
  };
}
export function skyRoute(job: Contract): SkyPoint[] {
  return template.map((p) => ({
    x: job.x + p.x,
    y: job.skywriting!.altitude,
    z: job.z + p.z,
  }));
}
export function skyAudienceView(job: Contract, aspect: number) {
  const z = job.z + (aspect < 0.8 ? 145 : 55);
  const eye = { x: job.x, y: ground(job.x, z) + 1.7, z };
  const look = { x: job.x, y: job.skywriting!.altitude, z };
  const fov = Math.min(
    135,
    (2 * Math.atan(Math.max(460, 400 / aspect) / (look.y - eye.y)) * 180) /
      Math.PI,
  );
  return { eye, look, fov };
}
export const skyWeather = (job: Contract): Weather => ({
  ...LESSON_WEATHER,
  label: job.skywriting?.level
    ? 'Wedding crosswind'
    : 'Clear celebration skies',
  windMps: job.skywriting?.level ? 3.2 : 0.7,
  gust: job.skywriting?.level ? 0.24 : 0.06,
  cloud: 0.12,
  sunlight: 2.8,
});
export const freshSkywriting = (): SkywritingState => ({
  progress: 0,
  loops: 0,
  ink: Array(SKY_SEGMENTS).fill(0),
  goodSmoke: 0,
  straySmoke: 0,
  smoke: [],
  last: null,
  sampleDistance: 8,
});
export const skyCoverage = (state: SkywritingState) =>
  Math.min(100, (state.ink.reduce((sum, n) => sum + n, 0) / SKY_LENGTH) * 100);
export const skyAccuracy = (state: SkywritingState) => {
  const total = state.goodSmoke + state.straySmoke;
  return total > 0 ? (state.goodSmoke / total) * 100 : 100;
};
export const skyReady = (job: Contract, state: SkywritingState) =>
  state.loops > 0 &&
  skyCoverage(state) + 1e-6 >= job.target &&
  skyAccuracy(state) + 1e-6 >= 65;
export const skyPenalty = (state: SkywritingState) =>
  Math.round(state.straySmoke * 0.6);

export function stepSkywriting(
  state: SkywritingState,
  job: Contract,
  position: SkyPoint,
  writing: boolean,
  dt: number,
  speed: number,
  elapsed: number,
) {
  const previous = state.last;
  state.last = { x: position.x, y: position.y, z: position.z };
  if (!previous) return;
  const travel = Math.hypot(position.x - previous.x, position.z - previous.z);
  if (travel > Math.max(4, speed * dt * 1.8) || travel < 1e-8) return;
  const route = skyRoute(job),
    current = Math.min(
      SKY_SEGMENTS - 1,
      Math.floor(state.progress / SKY_SPACING),
    );
  let best = { distance: Infinity, progress: state.progress, forward: false };
  for (let i = current; i <= Math.min(current + 2, SKY_SEGMENTS - 1); i++) {
    const a = route[i],
      b = route[i + 1],
      dx = b.x - a.x,
      dz = b.z - a.z;
    const t = Math.max(
      0,
      Math.min(
        1,
        ((position.x - a.x) * dx + (position.z - a.z) * dz) /
          (dx * dx + dz * dz),
      ),
    );
    const distance = Math.hypot(
      position.x - a.x - dx * t,
      position.z - a.z - dz * t,
    );
    if (distance < best.distance)
      best = {
        distance,
        progress: (i + t) * SKY_SPACING,
        forward:
          (position.x - previous.x) * dx + (position.z - previous.z) * dz > 0,
      };
  }
  const onRoute =
    best.distance <= job.skywriting!.tolerance &&
    Math.abs(position.y - job.skywriting!.altitude) <= 14 &&
    best.forward;
  const old = state.progress;
  if (onRoute) state.progress = Math.max(state.progress, best.progress);
  const advanced = Math.max(0, state.progress - old);
  if (writing) {
    const ink = onRoute && advanced > 0 ? Math.min(travel, advanced) : 0;
    state.goodSmoke += ink;
    state.straySmoke += Math.max(0, travel - ink);
    if (ink > 0) {
      // Credit only the newly flown span, proportionally across crossed bins.
      for (
        let i = Math.floor(old / SKY_SPACING);
        i <=
        Math.min(SKY_SEGMENTS - 1, Math.floor(state.progress / SKY_SPACING));
        i++
      ) {
        const overlap = Math.max(
          0,
          Math.min(state.progress, (i + 1) * SKY_SPACING) -
            Math.max(old, i * SKY_SPACING),
        );
        state.ink[i] = Math.min(
          SKY_SPACING,
          state.ink[i] + (overlap * ink) / advanced,
        );
      }
    }
    state.sampleDistance += travel;
    if (state.sampleDistance >= 7) {
      state.smoke.push(
        [position.x, position.y, position.z, elapsed].map(
          (n) => Math.round(n * 10) / 10,
        ) as SkySmoke,
      );
      state.smoke = state.smoke
        .filter((p) => elapsed - p[3] < SKY_SMOKE_LIFE)
        .slice(-SKY_SMOKE_LIMIT);
      state.sampleDistance = 0;
    }
  } else state.sampleDistance = 8;
  const finish = route.at(-1)!;
  if (
    !state.loops &&
    state.progress >= SKY_LENGTH - SKY_SPACING * 0.6 &&
    Math.hypot(position.x - finish.x, position.z - finish.z) <
      job.skywriting!.tolerance
  )
    state.loops = 1;
}

export function skyGuidance(
  job: Contract,
  state: SkywritingState,
  y: number,
  tank: number,
) {
  if (skyReady(job, state))
    return 'Heart complete · Enter to collect your pay and see the reveal';
  if (tank <= 0) return 'Smoke tank empty · R to refill and line up again';
  const delta = job.skywriting!.altitude - y;
  if (Math.abs(delta) > 14)
    return delta > 0
      ? 'Climb toward the gold gate · smoke off until you are level'
      : 'Descend toward the gold gate · smoke off until you are level';
  if (state.loops)
    return 'Circuit finished · R to line up another pass and fill the gaps';
  return 'Follow the gold gates in order · hold Space to write, release to correct';
}
