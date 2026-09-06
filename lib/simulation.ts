export const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export const ground = (x: number, z: number) =>
  7 +
  Math.sin(x * 0.0017) * 8 +
  Math.cos(z * 0.0014) * 7 +
  Math.sin((x + z) * 0.003) * 3;
export const riverX = (z: number) =>
  980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65;
export type Field = {
  id: number;
  x: number;
  z: number;
  w: number;
  d: number;
  crop: 'corn' | 'soybeans' | 'pasture';
};
export const fields: Field[] = [];
for (let z = -6; z <= 6; z++)
  for (let x = -6; x <= 6; x++) {
    const xx = x * 510,
      zz = z * 510;
    if (Math.abs(xx - riverX(zz)) < 390) continue;
    fields.push({
      id: fields.length,
      x: xx,
      z: zz,
      w: 456,
      d: 452,
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
    acres: 51,
    pay: 1200,
    bonus: 450,
    target: 80,
    bonusTarget: 95,
    note: 'Our corn could use a little lift. Nice, even passes will do the trick.',
    difficulty: 'Easy going',
  },
  {
    id: 1,
    name: 'A greener tomorrow',
    farmer: 'Willow Creek Acres',
    crop: 'soybeans',
    treatment: 'Pesticide',
    x: -510,
    z: -510,
    acres: 51,
    pay: 1650,
    bonus: 600,
    target: 85,
    bonusTarget: 96,
    note: 'Keep the bugs off our beans. Mind the breeze and keep your wings level.',
    difficulty: 'Steady hands',
  },
  {
    id: 2,
    name: 'Room to grow',
    farmer: 'Cedar Valley Ranch',
    crop: 'pasture',
    treatment: 'Fertilizer',
    x: -1020,
    z: 510,
    acres: 51,
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
  cash: number;
  completed: number[];
  upgrades: Upgrades;
  totalEarned: number;
  flights: number;
};
export const freshCareer = (): Career => ({
  cash: 0,
  completed: [],
  upgrades: { tank: 0, boom: 0, stability: 0 },
  totalEarned: 0,
  flights: 0,
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
};
export const freshControls = (): Controls => ({
  left: false,
  right: false,
  up: false,
  down: false,
  faster: false,
  slower: false,
  spray: false,
});
export const OVERSPRAY_PENALTY_PER_ACRE = 40;
const SQUARE_METERS_PER_ACRE = 4046.8564224;
export class Simulation {
  phase: Phase = 'ready';
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
  };
  message = '';
  get altitude() {
    return this.y - ground(this.x, this.z);
  }
  get coverage() {
    return (this.covered.size / (38 * 38)) * 100;
  }
  get tankCapacity() {
    return 100 + this.career.upgrades.tank * 40;
  }
  get swath() {
    return 58 + this.career.upgrades.boom * 18;
  }
  get earnedBonus() {
    return this.coverage >= this.job.bonusTarget ? this.job.bonus : 0;
  }
  get oversprayPenalty() {
    return Math.min(
      this.job.pay + this.earnedBonus,
      Math.round(this.oversprayAcres * OVERSPRAY_PENALTY_PER_ACRE),
    );
  }
  get projectedPay() {
    return this.job.pay + this.earnedBonus - this.oversprayPenalty;
  }
  get overspraying() {
    return this.spraying && this.offTargetFraction > 0;
  }
  get inField() {
    return (
      Math.abs(this.x - this.job.x) < 228 && Math.abs(this.z - this.job.z) < 226
    );
  }
  get validSpray() {
    return (
      this.altitude >= 6 &&
      this.altitude <= 30 &&
      Math.abs(this.roll) < 0.52 &&
      this.speed < 61
    );
  }
  reset(job = this.job) {
    this.job = job;
    this.x = job.x - 190;
    this.z = job.z + 330;
    this.y = ground(this.x, this.z) + 19;
    this.heading = 0;
    this.roll = 0;
    this.pitch = 0;
    this.speed = 42;
    this.throttle = 42;
    this.tank = this.tankCapacity;
    this.covered.clear();
    this.coverageVersion++;
    this.elapsed = 0;
    this.oversprayAcres = 0;
    this.offTargetFraction = 0;
    this.result = {
      pay: 0,
      bonus: 0,
      coverage: 0,
      penalty: 0,
      total: 0,
      oversprayAcres: 0,
    };
    this.phase = 'flying';
    this.spraying = false;
  }
  refill() {
    this.tank = this.tankCapacity;
    this.x = this.job.x - 190;
    this.z = this.job.z + 330;
    this.y = ground(this.x, this.z) + 19;
    this.heading = this.roll = this.pitch = 0;
    this.speed = this.throttle = 42;
    this.phase = 'flying';
    this.spraying = false;
    this.offTargetFraction = 0;
  }
  finish() {
    if (this.phase !== 'flying' || this.coverage < this.job.target)
      return false;
    this.result = {
      pay: this.job.pay,
      bonus: this.earnedBonus,
      coverage: this.coverage,
      penalty: this.oversprayPenalty,
      total: this.projectedPay,
      oversprayAcres: this.oversprayAcres,
    };
    this.career.cash += this.result.total;
    this.career.totalEarned += this.result.total;
    this.career.flights++;
    if (!this.career.completed.includes(this.job.id))
      this.career.completed.push(this.job.id);
    this.phase = 'complete';
    this.spraying = false;
    return true;
  }
  buy(key: keyof Upgrades) {
    const price = upgradePrice(key, this.career.upgrades[key]);
    if (this.career.upgrades[key] >= 3 || this.career.cash < price)
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
    const smooth = 1 - Math.exp(-dt * 3.5);
    this.roll +=
      ((Number(input.left) - Number(input.right)) * 0.75 - this.roll) * smooth;
    this.pitch +=
      ((Number(input.up) - Number(input.down)) * 0.38 - this.pitch) * smooth;
    this.throttle = clamp(
      this.throttle + (Number(input.faster) - Number(input.slower)) * dt * 16,
      29,
      76,
    );
    this.speed += (this.throttle - this.speed) * dt * 1.8;
    this.heading -= this.roll * dt * 0.9;
    const wind =
      (Math.sin(this.elapsed * 0.8) * 0.32 + 0.65) /
      (1 + this.career.upgrades.stability * 0.6);
    this.x += (Math.sin(this.heading) * this.speed + wind) * dt;
    this.z -= Math.cos(this.heading) * this.speed * dt;
    this.y += Math.sin(this.pitch) * this.speed * dt;
    this.y = Math.min(this.y, 600);
    if (
      this.altitude < 3 ||
      (Math.abs(this.x - riverX(this.z)) < 40 && this.y < 10)
    ) {
      this.phase = 'crashed';
      this.spraying = false;
      return;
    }
    if (Math.abs(this.x) > 3100 || Math.abs(this.z) > 3100) {
      this.heading = Math.atan2(-this.x, this.z);
      this.message = 'County boundary · turning you toward home';
    } else this.message = '';
    this.spraying = input.spray && this.tank > 0;
    if (!this.spraying) return;
    const sprayDt = Math.min(dt, this.tank / 0.67);
    this.tank = Math.max(0, this.tank - sprayDt * 0.67);
    // Off-field discharge still counts when height, speed, or bank prevents
    // useful treatment. Drift and the whole boom footprint affect the penalty.
    this.paint(
      this.x + wind * this.altitude * 0.16,
      this.z,
      sprayDt,
      this.validSpray,
    );
  }
  paint(x: number, z: number, dt: number, applyCoverage = true) {
    const size = 12,
      half = this.swath / 2,
      depth = this.speed * dt + 9;
    let changed = false;
    let samples = 0;
    let outside = 0;
    for (let a = -half; a <= half; a += 4) {
      for (let b = -depth; b <= depth; b += 5) {
        const px = x + Math.cos(this.heading) * a + Math.sin(this.heading) * b;
        const pz = z + Math.sin(this.heading) * a - Math.cos(this.heading) * b;
        samples++;
        if (
          Math.abs(px - this.job.x) >= 228 ||
          Math.abs(pz - this.job.z) >= 226
        ) {
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
        if (!this.covered.has(n)) {
          this.covered.add(n);
          changed = true;
        }
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
        (x: unknown) => typeof x === 'number' && x >= 0 && x < contracts.length,
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
      flights: Math.max(0, Number(data.flights) || 0),
    };
  } catch {
    return freshCareer();
  }
}
