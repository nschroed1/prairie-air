import type { Weather } from './weather';
import { polygonArea } from './field-geometry';
import {
  freshSkywriting,
  skywritingContract,
  type SkywritingState,
  type SkySmoke,
} from './skywriting';
import {
  fields,
  Simulation,
  ground,
  legacyGround,
  contracts,
  type Contract,
  type Controls,
  type Career,
  type Phase,
} from './simulation';

export const SEASON_EPOCH = Date.UTC(2026, 8, 5);
export const SEASON_MS = 7 * 86400000;
export const LEASE_MS = 120000;
export const JOBS_PER_SEASON = 60;
export const MAX_PILOTS = 32;
export type SeasonPhase = 'Spring' | 'Summer' | 'Fall';
export function seasonAt(now = Date.now()) {
  const id = Math.max(0, Math.floor((now - SEASON_EPOCH) / SEASON_MS));
  const startsAt = SEASON_EPOCH + id * SEASON_MS;
  const phaseIndex = Math.min(
    2,
    Math.max(0, Math.floor(((now - startsAt) / SEASON_MS) * 3)),
  );
  return {
    id,
    number: id + 1,
    startsAt,
    endsAt: startsAt + SEASON_MS,
    phaseIndex,
    phase: (['Spring', 'Summer', 'Fall'] as const)[phaseIndex],
    nextWaveAt:
      phaseIndex < 2
        ? startsAt + ((phaseIndex + 1) * SEASON_MS) / 3
        : startsAt + SEASON_MS,
  };
}
export type Season = ReturnType<typeof seasonAt>;
export type CountyJob = Contract & {
  season: number;
  wave: number;
  opensAt: number;
  status: 'open' | 'claimed' | 'complete' | 'scheduled';
  owner: string | null;
  leaseUntil: number;
  coverage: number;
  pilot: string | null;
};
const names = [
  'Miller',
  'Bennett',
  'Hansen',
  'Larson',
  'Reed',
  'Walker',
  'Jensen',
  'Nelson',
  'Cooper',
  'Walsh',
  'Hayes',
  'Anderson',
  'Brooks',
  'Palmer',
  'Larsen',
  'Foster',
  'Ellis',
  'Parker',
  'Morgan',
  'Carter',
];
export function seasonJobs(season: Season): CountyJob[] {
  // A coprime stride walks distinct physical fields; there is no random job spawner.
  const eligible = fields.filter(
    (f) => Math.abs(f.x) < 2700 && Math.abs(f.z) < 2700,
  );
  return Array.from({ length: JOBS_PER_SEASON }, (_, i) => {
    const f = eligible[(i + season.id * 17) % eligible.length],
      wave = Math.floor(i / 20);
    const treatment =
      wave === 0
        ? 'Fertilizer'
        : wave === 1
          ? f.crop === 'pasture'
            ? 'Weed control'
            : 'Pesticide'
          : 'Cover-crop seed';
    const job: CountyJob = {
      id: season.id * 1000 + i + 100,
      season: season.id,
      wave,
      opensAt: season.startsAt + (wave * SEASON_MS) / 3,
      name:
        wave === 0
          ? 'A strong start'
          : wave === 1
            ? 'Protect the growing season'
            : 'Seed the next chapter',
      farmer: `${names[i % names.length]} ${i % 3 === 0 ? 'Family Farm' : i % 3 === 1 ? 'Acres' : 'Ranch'}`,
      crop: f.crop,
      treatment,
      x: f.x,
      z: f.z,
      width: f.width,
      depth: f.depth,
      boundary: f.boundary,
      acres: Math.round(polygonArea(f.boundary) / 4046.8564224),
      pay: 1200 + wave * 350 + (i % 4) * 100,
      bonus: 450 + wave * 150,
      target: 80 + wave * 5,
      bonusTarget: 95 + wave,
      note: `Field ${i + 1} · ${['Spring nourishment', 'Summer crop care', 'Fall cover-crop seeding'][wave]}. One contract for the whole county.`,
      difficulty: ['Easy going', 'Steady hands', 'Precision work'][wave],
      status: wave <= season.phaseIndex ? 'open' : 'scheduled',
      owner: null,
      leaseUntil: 0,
      coverage: 0,
      pilot: null,
    };
    // The live first season keeps its original 60 contracts. Later seasons
    // reserve seven of those finite slots for occasional skywriting work.
    return season.id > 0 && i % 8 === 7
      ? skywritingContract(job, wave > 0 ? 1 : 0)
      : job;
  });
}
export type FlightState = {
  skywriting?: SkywritingState;
  terrainVersion?: number;
  rewardVersion?: number;
  bankedStuntBonus?: number;
  rewardSequence?: number;
  rewards?: Simulation['rewards'];
  rewardKeys?: string[];
  stunts?: ReturnType<Simulation['stunts']['snapshot']>;
  weather?: Weather | null;
  integrity?: number;
  clog?: number;
  wear?: number;
  birdHits?: number;
  lastBirdHit?: number;
  hazardEvent?: string;
  hazardEventUntil?: number;
  crashReason?: string;
  barnstormed?: boolean;
  invertedBarnstormed?: boolean;
  inBarn?: boolean;
  inBarnInverted?: boolean;
  barnstormCount?: number;
  collectibles?: Simulation['collectibles'];
  turnaroundCombo?: number;
  lastSprayExitTime?: number;
  lastSprayExitHeading?: number;
  arcade?: ReturnType<Simulation['arcade']['snapshot']>;
  x: number;
  y: number;
  z: number;
  heading: number;
  roll: number;
  pitch: number;
  speed: number;
  throttle: number;
  tank: number;
  elapsed: number;
  phase: Phase;
  covered: number[];
  career: Career;
  job: Contract;
  result: Simulation['result'];
  spraying: boolean;
  oversprayAcres?: number;
  offTargetFraction?: number;
};
export function serialize(sim: Simulation): FlightState {
  return {
    terrainVersion: 2,
    ...(sim.isSkywriting
      ? { skywriting: structuredClone(sim.skywriting) }
      : {}),
    rewardVersion: 2,
    bankedStuntBonus: sim.bankedStuntBonus,
    rewardSequence: sim.rewardSequence,
    rewards: sim.rewards.map((r) => ({ ...r })),
    rewardKeys: [...sim.rewardKeys],
    stunts: sim.stunts.snapshot(),
    weather: sim.weather,
    integrity: sim.integrity,
    clog: sim.clog,
    wear: sim.wear,
    birdHits: sim.birdHits,
    lastBirdHit: sim.lastBirdHit,
    hazardEvent: sim.hazardEvent,
    hazardEventUntil: sim.hazardEventUntil,
    crashReason: sim.crashReason,
    barnstormed: sim.barnstormed,
    invertedBarnstormed: sim.invertedBarnstormed,
    inBarn: sim.inBarn,
    inBarnInverted: sim.inBarnInverted,
    barnstormCount: sim.barnstormCount,
    collectibles: sim.collectibles.map((item) => ({ ...item })),
    turnaroundCombo: sim.turnaroundCombo,
    lastSprayExitTime: sim.lastSprayExitTime,
    lastSprayExitHeading: sim.lastSprayExitHeading,
    arcade: sim.arcade.snapshot(),
    x: sim.x,
    y: sim.y,
    z: sim.z,
    heading: sim.heading,
    roll: sim.roll,
    pitch: sim.pitch,
    speed: sim.speed,
    throttle: sim.throttle,
    tank: sim.tank,
    elapsed: sim.elapsed,
    phase: sim.phase,
    covered: [...sim.covered],
    career: sim.career,
    job: sim.job,
    result: sim.result,
    spraying: sim.spraying,
    oversprayAcres: sim.oversprayAcres,
    offTargetFraction: sim.offTargetFraction,
  };
}
export function hydrate(state: FlightState) {
  const sim = new Simulation();
  const { arcade, collectibles, stunts, rewardKeys, skywriting, ...flight } =
    state;
  Object.assign(sim, flight);
  sim.skywriting = skywriting ? structuredClone(skywriting) : freshSkywriting();
  sim.arcade.restore(arcade);
  sim.stunts.restore(stunts);
  sim.rewardKeys = new Set(rewardKeys);
  sim.rewards = (state.rewards ?? []).map((r) => ({ ...r }));
  // Old builds credited stunt cash immediately. Never pay it again at settlement.
  sim.bankedStuntBonus =
    state.rewardVersion === 2
      ? (state.bankedStuntBonus ?? 0)
      : (state.result.stuntBonus ?? 0);
  // Legacy flights have no pickup ledger; start spawning on their next job
  // rather than grant a second set of potentially already collected rewards.
  sim.collectibles = (collectibles ?? []).map((item) => ({ ...item }));
  // Retain altitude above ground when resuming a pre-hills saved flight.
  if ((state.terrainVersion ?? 1) < 2)
    sim.y += ground(state.x, state.z) - legacyGround(state.x, state.z);
  // Saved flights from before overspray penalties start with no deduction.
  sim.oversprayAcres = Math.max(0, state.oversprayAcres ?? 0);
  sim.offTargetFraction = state.offTargetFraction ?? 0;
  sim.barnstormed = Boolean(state.barnstormed);
  sim.invertedBarnstormed = Boolean(state.invertedBarnstormed);
  sim.result = {
    ...state.result,
    maintenance: state.result.maintenance ?? 0,
    repairs: state.result.repairs ?? 0,
    debt: state.result.debt ?? 0,
    penalty: state.result.penalty ?? 0,
    total: state.result.total ?? state.result.pay + state.result.bonus,
    oversprayAcres: state.result.oversprayAcres ?? 0,
    stuntBonus: state.result.stuntBonus ?? 0,
    cleanBonus:
      state.rewardVersion !== 2 && state.phase === 'complete'
        ? 0
        : (state.result.cleanBonus ?? 0),
    speedBonus:
      state.rewardVersion !== 2 && state.phase === 'complete'
        ? 0
        : (state.result.speedBonus ?? 0),
  };
  sim.covered = new Set(state.covered);
  return sim;
}
export type Step = { dt: number; input: Controls };
export type Action =
  | 'join'
  | 'tick'
  | 'claim'
  | 'finish'
  | 'pause'
  | 'resume'
  | 'refill'
  | 'retry'
  | 'release'
  | 'upgrade'
  | 'rename';
export type CountyCommand = {
  requestId: string;
  revision: number;
  action: Action;
  steps: Step[];
  jobId?: number;
  upgrade?: 'tank' | 'boom' | 'stability';
  callsign?: string;
  refreshCounty?: boolean;
};
const keys = [
  'left',
  'right',
  'up',
  'down',
  'faster',
  'slower',
  'spray',
] as const;
export function validateCommand(value: unknown): CountyCommand {
  if (!value || typeof value !== 'object')
    throw new Error('Invalid flight command.');
  const data = value as CountyCommand;
  if (
    !/^[a-zA-Z0-9-]{8,64}$/.test(data.requestId) ||
    !Number.isSafeInteger(data.revision) ||
    data.revision < 0
  )
    throw new Error('Invalid flight revision.');
  if (
    ![
      'join',
      'tick',
      'claim',
      'finish',
      'pause',
      'resume',
      'refill',
      'retry',
      'release',
      'upgrade',
      'rename',
    ].includes(data.action)
  )
    throw new Error('Unknown flight command.');
  if (!Array.isArray(data.steps) || data.steps.length > 120)
    throw new Error('Flight packet too large.');
  let duration = 0;
  for (const step of data.steps) {
    if (
      !step ||
      !Number.isFinite(step.dt) ||
      step.dt <= 0 ||
      step.dt > 0.05 ||
      !step.input ||
      (step.input.acro !== undefined && typeof step.input.acro !== 'boolean') ||
      keys.some((k) => typeof step.input[k] !== 'boolean')
    )
      throw new Error('Invalid flight controls.');
    duration += step.dt;
  }
  if (duration > 2) throw new Error('Flight packet spans too much time.');
  if (data.action === 'claim' && !Number.isSafeInteger(data.jobId))
    throw new Error('Choose a field.');
  if (
    data.action === 'upgrade' &&
    !['tank', 'boom', 'stability'].includes(data.upgrade ?? '')
  )
    throw new Error('Choose an upgrade.');
  if (
    data.action === 'rename' &&
    (typeof data.callsign !== 'string' ||
      !/^[a-zA-Z0-9 _-]{3,20}$/.test(data.callsign))
  )
    throw new Error('Use 3–20 letters, numbers, spaces, or dashes.');
  return data;
}
export function runFlight(
  state: FlightState,
  steps: Step[],
  availableTime: number,
) {
  const duration = steps.reduce((sum, s) => sum + s.dt, 0);
  if (duration > availableTime + 0.001)
    throw new Error('Flight clock is ahead of the server.');
  const sim = hydrate(state);
  for (const step of steps) sim.step(step.dt, step.input);
  return { sim, remaining: Math.max(0, availableTime - duration) };
}
export type PublicPilot = {
  skywriting?: { jobId: number; elapsed: number; smoke: SkySmoke[] };
  id: string;
  callsign: string;
  x: number;
  y: number;
  z: number;
  heading: number;
  roll: number;
  pitch: number;
  speed: number;
  spraying: boolean;
  phase: Phase;
  seenAt: number;
};
export type Standing = {
  pilot: string;
  callsign: string;
  earnings: number;
  jobs: number;
  acres: number;
  precision: number;
};
export type CountySnapshot = {
  weather?: Weather;
  nextWeather?: Weather;
  compact?: boolean;
  season: Season;
  jobs: CountyJob[];
  pilots: PublicPilot[];
  standings: Standing[];
  previousStandings: Standing[];
  viewerId: string | null;
  player: null | {
    id: string;
    callsign: string;
    revision: number;
    activeJob: number | null;
    flight: FlightState;
  };
  capacity: number;
  now: number;
};
export function initialFlight() {
  return serialize(new Simulation());
}
export function practiceContract() {
  return contracts[0];
}
