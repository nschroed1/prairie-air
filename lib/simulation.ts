import {
  prepareContract,
  challengeWeather,
  birdFlock,
  locustSwarm,
  tornadoState,
  hazardWarning,
  type ChallengePlan,
} from './challenge';
import { buffeting, windVector, type Weather } from './weather';
import { ArcadeTracker, type ArcadeEvent } from './arcade-systems';
import { StuntTracker } from './stunts';
import {
  freshSkywriting,
  isSkywriting,
  skyAccuracy,
  skyCoverage,
  skyGuidance,
  skyPenalty,
  skyReady,
  skyRoute,
  skyWeather,
  stepSkywriting,
  SKYWRITING_PRACTICE_ID,
  type SkywritingPlan,
} from './skywriting';
import {
  fieldOutline,
  insideField,
  parcelShape,
  polygonArea,
  type FieldPoint,
  type NoSprayZone,
} from './field-geometry';
import { fieldCellCount, fieldCells } from './field-geometry';
export { fieldSize, insideField, fieldCellCount } from './field-geometry';

export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const legacyGround = (x: number, z: number) =>
  7 +
  Math.sin(x * 0.0017) * 8 +
  Math.cos(z * 0.0014) * 7 +
  Math.sin((x + z) * 0.003) * 3;
export const ground = (x: number, z: number) => {
  const base = legacyGround(x, z);
  const t = clamp((Math.hypot(x, z) - 430) / 900, 0, 1);
  const trainingBlend = t * t * (3 - 2 * t);
  const riverDistance = Math.abs(
    x - (980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65),
  );
  const valley = 1 - Math.exp(-Math.pow(riverDistance / 420, 2));
  const rolls =
    24 +
    18 * Math.sin(x * 0.0021 + z * 0.0009) +
    15 * Math.cos(z * 0.0026 - x * 0.0007);
  const ridge =
    100 *
    Math.exp(-Math.pow((x + 1600) / 1400, 2) - Math.pow((z - 1400) / 2100, 2));
  const eastHills =
    76 *
    Math.exp(-Math.pow((x - 2600) / 1100, 2) - Math.pow((z + 1700) / 1600, 2));
  return base + trainingBlend * valley * (rolls + ridge + eastHills);
};
export const riverX = (z: number) =>
  980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65;
export type Field = {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  width: number;
  depth: number;
  boundary: readonly FieldPoint[];
  crop: 'corn' | 'soybeans' | 'pasture';
};
export const fields: Field[] = [];
for (let z = -6; z <= 6; z++)
  for (let x = -6; x <= 6; x++) {
    const xx = x * 510,
      zz = z * 510;
    if (Math.abs(xx - riverX(zz)) < 390) continue;
    const shape =
      (x === 0 && z === 0) || (x === -1 && z === -1)
        ? { width: 456, depth: 452, boundary: fieldOutline({}) }
        : parcelShape(x, z);
    fields.push({
      id: fields.length,
      x: xx,
      z: zz,
      w: shape.width,
      d: shape.depth,
      ...shape,
      crop:
        x === -1 && z === -1
          ? 'soybeans'
          : (x + z) % 3 === 0
            ? 'corn'
            : (x - z) % 3 === 0
              ? 'pasture'
              : 'soybeans',
    });
  }
export type Contract = {
  kind?: 'spray' | 'skywriting';
  skywriting?: SkywritingPlan;
  id: number;
  name: string;
  farmer: string;
  crop: Field['crop'];
  treatment: string;
  x: number;
  z: number;
  acres: number;
  pay: number;
  bonus: number;
  target: number;
  bonusTarget: number;
  note: string;
  difficulty: string;
  width?: number;
  depth?: number;
  windStrength?: number;
  briefing?: string;
  boundary?: readonly FieldPoint[];
  noSprayZones?: readonly NoSprayZone[];
  challenge?: ChallengePlan;
  [key: string]: unknown;
};
export const contracts: readonly Contract[] = [
  {
    id: 0,
    name: 'The first pass',
    farmer: 'Miller Family Farm',
    crop: 'corn',
    treatment: 'Fertilizer',
    x: 0,
    z: 0,
    acres: 14,
    width: 192,
    depth: 288,
    windStrength: 0.35,
    briefing:
      'A small corn plot. Follow the white line, hold Space over the marked corn, then release before turning. Take your time lining up the next strip.',
    pay: 750,
    bonus: 250,
    target: 80,
    bonusTarget: 95,
    note: 'Our corn could use a little lift. Nice, even passes will do the trick.',
    difficulty: 'Easy going',
  },
  {
    id: 1,
    name: 'The crosswind run',
    farmer: 'Willow Creek Acres',
    crop: 'soybeans',
    treatment: 'Pesticide',
    x: -510,
    z: -510,
    acres: 18,
    width: 216,
    depth: 360,
    boundary: [
      { x: -108, z: -180 },
      { x: 25, z: -180 },
      { x: 108, z: -90 },
      { x: 108, z: 180 },
      { x: -108, z: 180 },
    ],
    windStrength: 3.5,
    briefing:
      'A soybean plot with a clipped northeast corner and a stronger west wind. Aim upwind, shorten the eastern passes, and keep the whole spray footprint inside the flags.',
    pay: 1650,
    bonus: 600,
    target: 85,
    bonusTarget: 96,
    note: 'The breeze is up. Keep your spray inside our soybean plot for a clean finish.',
    difficulty: 'Crosswind precision',
  },
  {
    id: 2,
    name: 'Room to grow',
    farmer: 'Cedar Valley Ranch',
    crop: 'pasture',
    treatment: 'Fertilizer',
    x: -1020,
    z: 510,
    ...parcelShape(-2, 1),
    acres: Math.round(polygonArea(parcelShape(-2, 1).boundary) / 4046.8564224),
    pay: 2100,
    bonus: 850,
    target: 90,
    bonusTarget: 98,
    note: 'Give our pasture some care. We pay extra for a beautifully even finish.',
    difficulty: 'Precision work',
  },
] as const;
export type Upgrades = { tank: number; boom: number; stability: number };
export type Career = {
  lastSkywritingFlight?: number;
  cash: number;
  completed: number[];
  upgrades: Upgrades;
  totalEarned: number;
  flights: number;
  maintenanceDebt?: number;
  repairDebt?: number;
};
export const freshCareer = (): Career => ({
  cash: 0,
  completed: [],
  upgrades: { tank: 0, boom: 0, stability: 0 },
  totalEarned: 0,
  flights: 0,
  maintenanceDebt: 0,
  repairDebt: 0,
});
export type Phase = 'ready' | 'flying' | 'paused' | 'crashed' | 'complete';
export type Controls = {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  faster: boolean;
  slower: boolean;
  spray: boolean;
  acro?: boolean;
  rudderLeft?: boolean;
  rudderRight?: boolean;
};
export const freshControls = (): Controls => ({
  left: false,
  right: false,
  up: false,
  down: false,
  faster: false,
  slower: false,
  spray: false,
  acro: false,
  rudderLeft: false,
  rudderRight: false,
});
export const OVERSPRAY_PENALTY_PER_ACRE = 40;
const SQUARE_METERS_PER_ACRE = 4046.8564224;

export type Collectible = {
  id: number;
  kind: 'cash' | 'refill' | 'boost';
  x: number;
  y: number;
  z: number;
  value: number;
  label: string;
  collected: boolean;
};

export function spawnCollectibles(job: Contract): Collectible[] {
  const items: Collectible[] = [];
  const width = job.width ?? 380;
  const depth = job.depth ?? 380;
  // 1. River token (floating over the winding river near the field)
  const rz = job.z;
  const rx = riverX(rz);
  items.push({
    id: 1,
    kind: 'cash',
    x: rx,
    y: ground(rx, rz) + 6,
    z: rz,
    value: 75,
    label: '★ River Run Token (+$75)',
    collected: false,
  });
  // 2. Ridge Token (floating along the western hill crest)
  const hx = job.x - width * 0.45;
  const hz = job.z + depth * 0.35;
  items.push({
    id: 2,
    kind: 'cash',
    x: hx,
    y: ground(hx, hz) + 7,
    z: hz,
    value: 50,
    label: '★ Ridge Glide Token (+$50)',
    collected: false,
  });
  // 3. Quick-Refill Canister (perched along the field perimeter)
  const fx = job.x + width * 0.48;
  const fz = job.z - depth * 0.4;
  items.push({
    id: 3,
    kind: 'refill',
    x: fx,
    y: ground(fx, fz) + 8,
    z: fz,
    value: 35,
    label: '✦ Quick-Refill Canister (+35 Gal)',
    collected: false,
  });
  // 4. Barn Token if a barn obstacle exists
  const barn = job.challenge?.obstacles.find((o) => o.kind === 'barn');
  if (barn) {
    const bx = job.x + barn.x;
    const bz = job.z + barn.z;
    items.push({
      id: 4,
      kind: 'cash',
      x: bx,
      y: ground(bx, bz) + 5.5,
      z: bz,
      value: 100,
      label: '★ Barn Breezeway Token (+$100)',
      collected: false,
    });
  }
  return items;
}

export type FlightReward = {
  id: number;
  at: number;
  title: string;
  amount: number;
  cue: string;
};

export class Simulation {
  phase: Phase = 'ready';
  weather: Weather | null = null;
  career: Career = freshCareer();
  job: Contract = contracts[0];
  x = -170;
  z = 400;
  y = ground(-170, 400) + 42;
  heading = 0;
  roll = 0;
  pitch = 0;
  speed = 44;
  throttle = 44;
  tank = 100;
  elapsed = 0;
  integrity = 100;
  clog = 0;
  wear = 0;
  birdHits = 0;
  lastBirdHit = -100;
  hazardEvent = '';
  hazardEventUntil = 0;
  crashReason = '';
  barnstormed = false;
  invertedBarnstormed = false;
  inBarn = false;
  inBarnInverted = false;
  barnstormCount = 0;
  collectibles: Collectible[] = [];
  lastCollectedCue: 'coin' | 'powerup' | null = null;
  lastStuntCue: string | null = null;
  turnaroundCombo = 0;
  lastSprayExitTime = -100;
  lastSprayExitHeading = 0;
  weatherLocked = false;
  arcade: ArcadeTracker = new ArcadeTracker();
  stunts = new StuntTracker();
  skywriting = freshSkywriting();
  bankedStuntBonus = 0;
  rewardSequence = 0;
  rewards: FlightReward[] = [];
  rewardKeys = new Set<string>();
  lastArcadeEvents: ArcadeEvent[] = [];
  newCellsAdded = 0;
  spraying = false;
  oversprayAcres = 0;
  offTargetFraction = 0;
  covered = new Set<number>();
  coverageVersion = 0;
  result = {
    pay: 0,
    bonus: 0,
    coverage: 0,
    penalty: 0,
    total: 0,
    oversprayAcres: 0,
    maintenance: 0,
    repairs: 0,
    debt: 0,
    stuntBonus: 0,
    cleanBonus: 0,
    speedBonus: 0,
  };
  message = '';
  get altitude() {
    return this.y - ground(this.x, this.z);
  }
  get coverage() {
    if (this.isSkywriting) return skyCoverage(this.skywriting);
    return Math.min(100, (this.covered.size / fieldCellCount(this.job)) * 100);
  }
  get isSkywriting() {
    return isSkywriting(this.job);
  }
  get completionReady() {
    return this.isSkywriting
      ? skyReady(this.job, this.skywriting)
      : this.coverage >= this.job.target;
  }
  get tankCapacity() {
    return 100 + this.career.upgrades.tank * 40;
  }
  get swath() {
    // A clogged boom leaves narrower strips; servicing restores its full reach.
    return (58 + this.career.upgrades.boom * 18) * (1 - this.clog * 0.004);
  }
  get maintenanceDue() {
    return Math.ceil((this.career.maintenanceDebt ?? 0) + this.wear);
  }
  get repairsDue() {
    return Math.ceil(
      (this.career.repairDebt ?? 0) +
        (100 - this.integrity) * 5 +
        (this.clog > 5 ? 15 : 0),
    );
  }
  get serviceDue() {
    return this.maintenanceDue + this.repairsDue;
  }
  get warning() {
    if (this.isSkywriting)
      return {
        danger: false,
        text: skyGuidance(this.job, this.skywriting, this.y, this.tank),
      };
    const forecast = hazardWarning(
      this.job,
      this.elapsed,
      this.x,
      this.z,
      this.altitude,
    );
    if (forecast.danger) return forecast;
    if (
      this.elapsed < this.hazardEventUntil &&
      !this.hazardEvent.startsWith('★') &&
      !this.hazardEvent.startsWith('✦')
    )
      return { danger: true, text: this.hazardEvent };
    if (this.integrity < 40)
      return {
        danger: true,
        text: 'Aircraft damaged · R to repair and return · costs come from earnings',
      };
    if (this.clog > 35)
      return {
        danger: true,
        text: `Boom ${Math.round(this.clog)}% clogged · narrower coverage · R to service`,
      };
    return forecast;
  }
  service() {
    // Workshop credit never blocks play; unpaid bills follow the career, not the contract.
    this.career.maintenanceDebt = this.maintenanceDue;
    this.career.repairDebt = this.repairsDue;
    this.integrity = 100;
    this.clog = this.wear = 0;
  }
  crash(reason: string) {
    this.integrity = 0;
    this.crashReason = reason;
    this.phase = 'crashed';
    this.spraying = false;
  }
  get earnedBonus() {
    return this.coverage >= this.job.bonusTarget &&
      (!this.isSkywriting || skyAccuracy(this.skywriting) >= 90)
      ? this.job.bonus
      : 0;
  }
  get oversprayPenalty() {
    return Math.min(
      this.job.pay +
        this.earnedBonus +
        this.cleanBonus +
        this.speedBonus +
        this.pendingSkillBonus,
      this.isSkywriting
        ? skyPenalty(this.skywriting)
        : Math.round(this.oversprayAcres * OVERSPRAY_PENALTY_PER_ACRE),
    );
  }
  get cleanBonus() {
    if (this.isSkywriting) return skyAccuracy(this.skywriting) >= 95 ? 150 : 0;
    if (this.oversprayAcres < 0.01) return 150;
    if (this.oversprayAcres < 0.04) return 100;
    if (this.oversprayAcres < 0.08) return 50;
    return 0;
  }
  get parTime() {
    if (this.isSkywriting) return 110;
    return Math.max(110, this.job.acres * 8);
  }
  get speedBonus() {
    return this.elapsed <= this.parTime ? 100 : 0;
  }
  get skillBonusLimit() {
    return Math.max(1200, Math.round(this.job.pay * 0.8));
  }
  get pendingSkillBonus() {
    return Math.max(0, this.result.stuntBonus - this.bankedStuntBonus);
  }
  get projectedPay() {
    if (this.phase === 'complete') return this.result.total;
    return Math.max(
      0,
      this.job.pay +
        this.earnedBonus +
        this.cleanBonus +
        this.speedBonus +
        this.pendingSkillBonus -
        this.oversprayPenalty -
        this.serviceDue,
    );
  }
  awardReward(
    title: string,
    amount: number,
    cue = 'cash-register',
    key?: string,
  ) {
    if (key && this.rewardKeys.has(key)) return 0;
    if (key) this.rewardKeys.add(key);
    const earned = Math.max(
      0,
      Math.min(
        Math.round(amount),
        this.skillBonusLimit - this.result.stuntBonus,
      ),
    );
    if (!earned) return 0;
    this.result.stuntBonus += earned;
    this.rewards.push({
      id: ++this.rewardSequence,
      at: this.elapsed,
      title,
      amount: earned,
      cue,
    });
    this.rewards = this.rewards.slice(-8);
    return earned;
  }
  lineUp() {
    if (this.isSkywriting) {
      const route = skyRoute(this.job),
        a = route[0],
        b = route[1];
      this.heading = Math.atan2(b.x - a.x, -(b.z - a.z));
      this.x = a.x - Math.sin(this.heading) * 55;
      this.z = a.z + Math.cos(this.heading) * 55;
      this.y = a.y;
      this.roll = this.pitch = 0;
      this.speed = this.throttle = 34;
      this.skywriting.progress = 0;
      this.skywriting.last = null;
      this.skywriting.sampleDistance = 8;
      this.stunts.resetPosition();
      return;
    }
    this.x =
      this.job.x -
      (this.job.width
        ? Math.max(0, (this.job.width - this.swath - 6) / 2)
        : 190);
    this.z = this.job.z + (this.job.depth ? this.job.depth / 2 + 70 : 330);
    // Clear the approach and the chase camera of farm buildings. Start farther
    // back when a farmstead occupies the usual line-up point.
    for (let attempt = 0; attempt < 16; attempt++) {
      const y = ground(this.x, this.z) + 19;
      const blocked = this.stunts.obstacles.some(
        (o) =>
          Math.abs(this.x - o.x) < (o.width ?? (o.radius ?? 3) * 2) / 2 + 26 &&
          this.z + 40 > o.z - (o.depth ?? (o.radius ?? 3) * 2) / 2 - 18 &&
          this.z - 100 < o.z + (o.depth ?? (o.radius ?? 3) * 2) / 2 + 18 &&
          y < o.baseY + o.height + 15,
      );
      if (!blocked) break;
      this.z += 35;
    }
    this.y = ground(this.x, this.z) + 19;
    for (const o of this.stunts.obstacles) {
      if (
        Math.abs(this.x - o.x) <
          Math.max(o.width ?? 0, o.depth ?? 0, (o.radius ?? 3) * 2) / 2 + 12 &&
        o.z < this.z + 40 &&
        o.z > this.z - 220
      )
        this.y = Math.max(this.y, o.baseY + o.height + 10);
    }
    this.heading = this.roll = this.pitch = 0;
    this.speed = this.throttle = this.job.width ? 34 : 42;
    this.stunts.resetPosition();
  }
  get overspraying() {
    return this.spraying && this.offTargetFraction > 0;
  }
  get inField() {
    return insideField(this.job, this.x, this.z);
  }
  get validSpray() {
    if (this.isSkywriting)
      return Math.abs(this.y - this.job.skywriting!.altitude) <= 14;
    return (
      this.altitude >= 6 &&
      this.altitude <= 30 &&
      Math.abs(this.roll) < 0.52 &&
      this.speed < 61
    );
  }
  get windVector() {
    if (this.weather)
      return windVector(
        this.weather,
        this.elapsed,
        this.job.windStrength ?? 1,
        this.career.upgrades.stability,
      );
    return {
      x:
        ((Math.sin(this.elapsed * 0.8) * 0.32 + 0.65) *
          (this.job.windStrength ?? 1)) /
        (1 + this.career.upgrades.stability * 0.6),
      z: 0,
    };
  }
  get wind() {
    return this.windVector.x;
  }
  get sprayDriftZ() {
    return this.windVector.z * this.altitude * 0.16;
  }
  get sprayDrift() {
    return this.wind * this.altitude * 0.16;
  }
  reset(job = this.job) {
    this.service();
    if (this.phase === 'complete' && job.challenge) {
      job = {
        ...job,
        pay: job.challenge.basePay,
        challenge: undefined,
        noSprayZones: undefined,
      };
    }
    job = isSkywriting(job) ? job : prepareContract(job, this.career.flights);
    this.job = job;
    this.skywriting = freshSkywriting();
    this.lineUp();
    this.tank = this.tankCapacity;
    this.covered.clear();
    this.coverageVersion++;
    this.elapsed = 0;
    this.birdHits = 0;
    this.lastBirdHit = -100;
    this.hazardEvent = this.crashReason = '';
    this.hazardEventUntil = 0;
    if (!this.weatherLocked)
      this.weather = this.isSkywriting
        ? skyWeather(job)
        : challengeWeather(job, 0);
    this.oversprayAcres = 0;
    this.offTargetFraction = 0;
    this.barnstormed = false;
    this.invertedBarnstormed = false;
    this.inBarn = false;
    this.inBarnInverted = false;
    this.collectibles = this.isSkywriting ? [] : spawnCollectibles(this.job);
    this.lastCollectedCue = null;
    this.lastStuntCue = null;
    this.turnaroundCombo = 0;
    this.lastSprayExitTime = -100;
    this.lastSprayExitHeading = 0;
    this.arcade.reset();
    this.stunts.restore();
    this.bankedStuntBonus = 0;
    this.rewardKeys.clear();
    this.rewards = [];
    this.lastArcadeEvents = [];
    this.newCellsAdded = 0;
    this.result = {
      pay: 0,
      bonus: 0,
      coverage: 0,
      penalty: 0,
      total: 0,
      oversprayAcres: 0,
      maintenance: 0,
      repairs: 0,
      debt: 0,
      stuntBonus: 0,
      cleanBonus: 0,
      speedBonus: 0,
    };
    this.phase = 'flying';
    this.spraying = false;
  }
  refill() {
    this.service();
    this.crashReason = '';
    this.inBarn = this.inBarnInverted = false;
    this.arcade.reset();
    this.tank = this.tankCapacity;
    this.lineUp();
    this.phase = 'flying';
    this.spraying = false;
    this.offTargetFraction = 0;
  }
  finish() {
    if (this.phase !== 'flying' || !this.completionReady) return false;
    this.service();
    const stunt = this.result.stuntBonus ?? 0;
    const clean = this.cleanBonus;
    const speed = this.speedBonus;
    const gross = Math.max(
      0,
      this.job.pay +
        this.earnedBonus +
        clean +
        speed +
        this.pendingSkillBonus -
        this.oversprayPenalty,
    );
    const maintenance = Math.min(gross, this.career.maintenanceDebt ?? 0);
    const repairs = Math.min(gross - maintenance, this.career.repairDebt ?? 0);
    this.career.maintenanceDebt = Math.max(
      0,
      (this.career.maintenanceDebt ?? 0) - maintenance,
    );
    this.career.repairDebt = Math.max(
      0,
      (this.career.repairDebt ?? 0) - repairs,
    );
    this.result = {
      pay: this.job.pay,
      bonus: this.earnedBonus,
      coverage: this.coverage,
      penalty: this.oversprayPenalty,
      total: gross - maintenance - repairs,
      maintenance,
      repairs,
      debt: this.serviceDue,
      oversprayAcres: this.oversprayAcres,
      stuntBonus: stunt,
      cleanBonus: clean,
      speedBonus: speed,
    };
    this.career.cash += this.result.total;
    this.career.totalEarned += this.result.total;
    this.career.flights++;
    if (this.isSkywriting)
      this.career.lastSkywritingFlight = this.career.flights;
    if (!this.career.completed.includes(this.job.id))
      this.career.completed.push(this.job.id);
    this.phase = 'complete';
    this.spraying = false;
    return true;
  }
  buy(key: keyof Upgrades) {
    const price = upgradePrice(key, this.career.upgrades[key]);
    if (
      this.career.upgrades[key] >= 3 ||
      this.career.cash < price + this.serviceDue
    )
      return false;
    this.career.cash -= price;
    this.career.upgrades[key]++;
    if (key === 'tank') this.tank += 40;
    return true;
  }
  step(dt: number, input: Controls) {
    this.offTargetFraction = 0;
    if (this.phase !== 'flying') {
      this.spraying = false;
      return;
    }
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    if (this.job.challenge && !this.weatherLocked)
      this.weather = challengeWeather(this.job, this.elapsed);
    if (this.job.challenge || this.isSkywriting)
      this.wear +=
        dt * (0.22 + this.speed / 2000 + (this.weather?.rain ?? 0) * 0.08);
    const smooth = 1 - Math.exp(-dt * 3.5);
    const gust = buffeting(
      this.weather,
      this.elapsed,
      this.job.windStrength ?? 1,
      this.career.upgrades.stability,
    );
    if (input.acro) {
      this.roll += (Number(input.left) - Number(input.right)) * dt * 1.85;
      this.roll = Math.atan2(Math.sin(this.roll), Math.cos(this.roll));
      this.pitch += (Number(input.up) - Number(input.down)) * dt * 1.4;
      this.pitch = Math.atan2(Math.sin(this.pitch), Math.cos(this.pitch));
    } else {
      this.roll +=
        ((Number(input.left) - Number(input.right)) * 0.75 +
          gust.roll -
          this.roll) *
        smooth;
      this.pitch +=
        ((Number(input.up) - Number(input.down)) * 0.38 +
          gust.pitch -
          this.pitch) *
        smooth;
    }
    this.throttle = clamp(
      this.throttle + (Number(input.faster) - Number(input.slower)) * dt * 16,
      29,
      76,
    );
    // Aerodynamic energy exchange: climb bleeds speed, dive adds speed
    const pitchFactor = Math.sin(this.pitch);
    const gravityAccel = -pitchFactor * 9.81 * 0.6;
    this.speed += (this.throttle - this.speed) * dt * 1.8 + gravityAccel * dt;
    this.speed = Math.max(22, this.speed);

    // Low-speed stall physics below 25 m/s (~50 kt)
    const stallSpeed = 25.0;
    let stallSink = 0;
    if (this.speed < stallSpeed) {
      const severity = (stallSpeed - this.speed) / (stallSpeed - 22);
      stallSink = severity * 6.0 * dt;
      if (!input.acro) {
        this.pitch -= severity * 0.35 * dt;
      }
    }

    const rudder =
      (Number(input.rudderLeft ?? false) - Number(input.rudderRight ?? false)) *
      0.45;
    this.heading -=
      ((input.acro ? Math.sin(this.roll) : this.roll) * 0.9 + rudder) * dt;
    const wind = this.windVector;
    this.x += (Math.sin(this.heading) * this.speed + wind.x) * dt;
    this.z += (-Math.cos(this.heading) * this.speed + wind.z) * dt;
    this.y += Math.sin(this.pitch) * this.speed * dt - stallSink;
    this.y = Math.min(this.y, 600);
    if (
      this.altitude < 3 ||
      (Math.abs(this.x - riverX(this.z)) < 40 && this.y < 10)
    ) {
      this.crash('Terrain strike · climb early over hills and riverbanks.');
      return;
    }
    this.stepHazards(dt);
    if (this.phase !== 'flying') return;
    this.lastCollectedCue = null;
    for (const c of this.collectibles) {
      if (c.collected) continue;
      if (
        Math.hypot(this.x - c.x, this.z - c.z) < 8.5 &&
        Math.abs(this.y - c.y) < 6
      ) {
        c.collected = true;
        if (c.kind === 'cash') {
          this.awardReward(
            c.label.replace(/^[★✦]\s*|\s*\(.*\)$/g, ''),
            c.value,
            'coin',
            `pickup:${c.id}`,
          );
          this.lastCollectedCue = 'coin';
        } else if (c.kind === 'refill') {
          this.tank = Math.min(this.tankCapacity, this.tank + c.value);
          this.lastCollectedCue = 'powerup';
        }
        if (c.kind === 'refill') {
          this.rewards.push({
            id: ++this.rewardSequence,
            at: this.elapsed,
            title: 'Quick refill · +35 units',
            amount: 0,
            cue: 'powerup',
          });
          this.rewards = this.rewards.slice(-8);
        }
      }
    }
    if (Math.abs(this.x) > 3100 || Math.abs(this.z) > 3100) {
      this.heading = Math.atan2(-this.x, this.z);
      this.message = 'County boundary · turning you toward home';
    } else this.message = '';
    this.spraying = input.spray && this.tank > 0;
    if (this.isSkywriting) {
      const smokeDt = this.spraying ? Math.min(dt, this.tank) : 0;
      this.tank = Math.max(0, this.tank - smokeDt);
      stepSkywriting(
        this.skywriting,
        this.job,
        this,
        smokeDt >= dt - 1e-8,
        dt,
        this.speed,
        this.elapsed,
      );
      this.newCellsAdded = 0;
      this.lastArcadeEvents = [];
      return;
    }
    const beforeCovered = this.covered.size;
    if (this.spraying) {
      const sprayDt = Math.min(dt, this.tank / 0.67);
      this.tank = Math.max(0, this.tank - sprayDt * 0.67);
      // Off-field discharge still counts when height, speed, or bank prevents
      // useful treatment. Drift and the whole boom footprint affect the penalty.
      this.paint(
        this.x + wind.x * this.altitude * 0.16,
        this.z + wind.z * this.altitude * 0.16,
        sprayDt,
        this.validSpray,
      );
    }
    this.newCellsAdded = this.covered.size - beforeCovered;

    const arcadeEvents = this.arcade.update(dt, this);
    this.lastArcadeEvents = arcadeEvents;
    for (const ev of arcadeEvents) {
      if (!('bonus' in ev)) continue;
      const title =
        ev.type === 'clean_pass'
          ? `Clean pass ×${ev.streak}`
          : ev.type === 'ag_turn'
            ? ev.name
            : ev.type === 'deck_skim'
              ? 'Deck skim'
              : `Fresh coverage ×${this.arcade.passStreak}`;
      const cue =
        ev.type === 'clean_pass'
          ? 'streak-chord'
          : ev.type === 'flow_tick'
            ? 'spray-pop'
            : 'cash-register';
      this.awardReward(title, ev.bonus, cue);
    }
    for (const stunt of this.stunts.update(dt, this)) {
      this.awardReward(
        stunt.name,
        stunt.bonus,
        stunt.type,
        `stunt:${stunt.type}:${stunt.targetName}`,
      );
    }
  }

  stepHazards(dt: number) {
    // 1. Trestle Bridge Physical Collision Check
    const bridge = this.stunts.trestleBridge;
    if (Math.abs(this.z - bridge.z) < 3.2) {
      const gorgeDist = Math.abs(this.x - bridge.riverX);
      if (gorgeDist < bridge.spanWidth / 2 - 2.0) {
        const heightAboveWater = this.y - bridge.waterY;
        if (heightAboveWater > 7.2 && this.y <= bridge.deckY + 2.5) {
          this.crash(
            'Trestle bridge strike · thread between 10 and 23 ft above water.',
          );
          return;
        }
      }
    }

    // 2. Telephone Wire Physical Strike Check
    if (this.altitude >= 7.3 && this.altitude <= 10.8) {
      for (const span of this.stunts.wireSpans) {
        const dx = span.p2.x - span.p1.x;
        const dz = span.p2.z - span.p1.z;
        const segLen2 = dx * dx + dz * dz;
        if (segLen2 > 0) {
          const u = Math.max(
            0,
            Math.min(
              1,
              ((this.x - span.p1.x) * dx + (this.z - span.p1.z) * dz) /
                segLen2,
            ),
          );
          const projX = span.p1.x + u * dx;
          const projZ = span.p1.z + u * dz;
          if (Math.hypot(this.x - projX, this.z - projZ) < 3.0) {
            if (this.speed < 32) {
              this.crash(
                'Power wire strike · fly under telephone lines or climb over poles.',
              );
              return;
            } else {
              this.integrity = Math.max(0, this.integrity - 28);
              this.roll += 0.35;
              this.hazardEvent =
                'Wire snag · airframe damaged · level out, then R to repair';
              this.hazardEventUntil = this.elapsed + 4;
              break;
            }
          }
        }
      }
    }

    const plan = this.job.challenge;
    if (!plan) return;
    let inAnyBarn = false;
    for (const obstacle of plan.obstacles) {
      const x = this.job.x + obstacle.x,
        z = this.job.z + obstacle.z;
      const dx = this.x - x,
        dz = this.z - z;
      if (obstacle.kind === 'barn') {
        const inBarnZ = Math.abs(dz) < obstacle.bodyDepth / 2 + 4;
        const inBarnX = Math.abs(dx) < obstacle.bodyWidth / 2 + 6;
        const inBarnY = this.y < ground(x, z) + obstacle.height + 3;
        if (inBarnZ && inBarnX && inBarnY) {
          const maxAlt = Math.min(9.6, obstacle.height * 0.53);
          const clearWidth = obstacle.bodyWidth - 4.2;
          const maxCorridorOffset = Math.max(
            2.6,
            (clearWidth - 20.0) / 2 + 1.5,
          );
          const aligned = Math.abs(Math.sin(this.heading)) < 0.38;
          const centered = Math.abs(dx) < maxCorridorOffset;
          const wingsLevel = Math.abs(this.roll) < 0.28;
          const inverted = Math.abs(this.roll) > 2.6;
          const attitudeOk = wingsLevel || inverted;
          const heightOk = this.altitude >= 2.0 && this.altitude <= maxAlt;
          if (aligned && centered && attitudeOk && heightOk) {
            inAnyBarn = true;
            this.inBarn = true;
            if (inverted) {
              this.inBarnInverted = true;
            }
          } else {
            if (this.altitude > maxAlt) {
              this.crash(
                `Hayloft strike · stay below ${Math.round(maxAlt * 3.28)} ft when threading the barn.`,
              );
            } else if (!attitudeOk || !centered) {
              this.crash(
                'Barn wall strike · keep wings level and centered through the doors.',
              );
            } else {
              this.crash(
                'Barn strike · enter through the open doors, not the walls.',
              );
            }
            return;
          }
        }
      } else {
        if (
          Math.abs(dx) < obstacle.bodyWidth / 2 + 7 &&
          Math.abs(dz) < obstacle.bodyDepth / 2 + 4 &&
          this.y < ground(x, z) + obstacle.height + 3
        ) {
          this.crash(
            `${obstacle.kind === 'silo' ? 'Silo' : 'Hay stack'} strike · climb over the marked yard with the spray off.`,
          );
          return;
        }
      }
    }
    if (this.inBarn && !inAnyBarn && this.phase === 'flying') {
      this.inBarn = false;
      this.barnstormCount++;
      const wasInverted = this.inBarnInverted;
      this.inBarnInverted = false;
      if (wasInverted) {
        if (!this.invertedBarnstormed) {
          this.invertedBarnstormed = true;
          this.barnstormed = true;
          const stunt = 750;
          this.awardReward(
            'Inverted barnstormer',
            stunt,
            'inverted-barnstormer',
            'barn:inverted',
          );
          this.lastStuntCue = 'inverted-barnstormer';
        }
      } else if (!this.barnstormed) {
        this.barnstormed = true;
        const stunt = 250;
        this.awardReward('Barnstormer', stunt, 'barnstormer', 'barn:level');
        this.lastStuntCue = 'barnstormer';
      }
    }
    const birds = birdFlock(this.job, this.elapsed);
    if (
      birds &&
      this.elapsed - this.lastBirdHit > 5 &&
      Math.hypot(this.x - birds.x, this.z - birds.z) < 18 &&
      Math.abs(this.y - ground(birds.x, birds.z) - birds.altitude) < 7
    ) {
      this.lastBirdHit = this.elapsed;
      this.birdHits++;
      this.integrity = Math.max(0, this.integrity - 18);
      this.roll +=
        (this.birdHits % 2 ? 0.22 : -0.22) /
        (1 + this.career.upgrades.stability * 0.4);
      this.hazardEvent =
        'Bird strike · airframe damaged · level out, then R to repair';
      this.hazardEventUntil = this.elapsed + 4;
    }
    const swarm = locustSwarm(this.job, this.elapsed);
    const inSwarm =
      swarm &&
      Math.hypot(this.x - swarm.x, this.z - swarm.z) < 58 &&
      Math.abs(this.y - ground(swarm.x, swarm.z) - swarm.altitude) < 16;
    if (inSwarm) this.clog = Math.min(100, this.clog + dt * 13);
    const tornado = tornadoState(this.job, this.elapsed);
    if (tornado?.active) {
      const dx = tornado.x - this.x,
        dz = tornado.z - this.z,
        distance = Math.hypot(dx, dz);
      if (distance < 220 && this.altitude < 190) {
        const power =
          (1 - distance / 220) / (1 + this.career.upgrades.stability * 0.35);
        const divisor = Math.max(1, distance);
        this.x += ((dx + dz * 1.7) / divisor) * power * dt * 34;
        this.z += ((dz - dx * 1.7) / divisor) * power * dt * 34;
        this.y += Math.sin(this.elapsed * 4) * power * dt * 12;
        this.roll += Math.sin(this.elapsed * 7) * power * dt * 2;
        if (distance < 65)
          this.integrity = Math.max(
            0,
            this.integrity - dt * 32 * (1 - distance / 65),
          );
      }
    }
    if (this.integrity <= 0)
      this.crash('Aircraft disabled · give birds and tornadoes more room.');
  }
  paint(x: number, z: number, dt: number, applyCoverage = true) {
    const size = 12,
      half = this.swath / 2,
      depth = this.speed * dt + 9;
    let changed = false;
    let samples = 0;
    let outside = 0;
    const cells =
      this.job.boundary || this.job.noSprayZones?.length
        ? fieldCells(this.job)
        : null;
    for (let a = -half; a <= half; a += 4) {
      for (let b = -depth; b <= depth; b += 5) {
        const px = x + Math.cos(this.heading) * a + Math.sin(this.heading) * b;
        const pz = z + Math.sin(this.heading) * a - Math.cos(this.heading) * b;
        samples++;
        if (!insideField(this.job, px, pz)) {
          outside++;
          continue;
        }
        if (!applyCoverage) continue;
        const col = Math.floor((px - this.job.x + 228) / size);
        // Preserve the saved 12 m coverage grid; the bounds check above clips
        // treatment to the actual field without shifting existing map cells.
        const row = Math.floor((pz - this.job.z + 228) / size);
        if (col < 0 || col >= 38 || row < 0 || row >= 38) continue;
        const n = row * 38 + col;
        if (cells && !cells.has(n)) continue;
        if (!this.covered.has(n)) {
          this.covered.add(n);
          changed = true;
        }
      }
    }
    // The sample lattice can straddle a tiny clipped corner. Include the real
    // footprint centre so those edge cells remain reachable with a precise pass.
    if (applyCoverage && insideField(this.job, x, z)) {
      const col = Math.floor((x - this.job.x + 228) / size);
      const row = Math.floor((z - this.job.z + 228) / size);
      const n = row * 38 + col;
      if (
        col >= 0 &&
        col < 38 &&
        row >= 0 &&
        row < 38 &&
        (!cells || cells.has(n)) &&
        !this.covered.has(n)
      ) {
        this.covered.add(n);
        changed = true;
      }
    }
    this.offTargetFraction = samples ? outside / samples : 0;
    // Integrate treated area over time, including repeated off-field passes.
    // Counting paint samples as acres would make penalties depend on frame rate.
    this.oversprayAcres +=
      (this.offTargetFraction * this.swath * this.speed * dt) /
      SQUARE_METERS_PER_ACRE;
    if (changed) this.coverageVersion++;
  }
}
export const upgradePrice = (key: keyof Upgrades, level: number) =>
  ({ tank: 600, boom: 950, stability: 750 })[key] * (level + 1);
export function loadCareer(raw: string | null): Career {
  if (!raw) return freshCareer();
  try {
    const data = JSON.parse(raw);
    if (
      !Number.isFinite(data.cash) ||
      data.cash < 0 ||
      !data.upgrades ||
      !Array.isArray(data.completed)
    )
      return freshCareer();
    return {
      cash: data.cash,
      completed: data.completed.filter(
        (x: unknown) =>
          typeof x === 'number' &&
          x >= 0 &&
          (x < contracts.length || x === SKYWRITING_PRACTICE_ID),
      ),
      upgrades: {
        tank: clamp(Math.floor(Number(data.upgrades.tank) || 0), 0, 3),
        boom: clamp(Math.floor(Number(data.upgrades.boom) || 0), 0, 3),
        stability: clamp(
          Math.floor(Number(data.upgrades.stability) || 0),
          0,
          3,
        ),
      },
      totalEarned: Math.max(0, Number(data.totalEarned) || 0),
      flights: Math.max(0, Math.floor(Number(data.flights) || 0)),
      ...(Number.isFinite(data.lastSkywritingFlight) &&
      data.lastSkywritingFlight >= 0
        ? { lastSkywritingFlight: Math.floor(data.lastSkywritingFlight) }
        : {}),
      maintenanceDebt: Math.max(0, Number(data.maintenanceDebt) || 0),
      repairDebt: Math.max(0, Number(data.repairDebt) || 0),
    };
  } catch {
    return freshCareer();
  }
}

export const availableCash = (career: Career) =>
  Math.max(
    0,
    career.cash - (career.maintenanceDebt ?? 0) - (career.repairDebt ?? 0),
  );
