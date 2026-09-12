import { type Contract, fieldCellCount } from './simulation';

export interface DustOffState {
  myCells: number;
  rivalCells: number;
  totalCells: number;
  myCoverage: number;
  rivalCoverage: number;
  leadCells: number; // positive = player leading, negative = rival leading
  leadAcres: number;
  winner: 'player' | 'rival' | null;
  rivalName: string;
}

export function dustOffContract<T extends Contract>(
  base: T,
  rivalName = 'Miller (County Champ)',
): T {
  return {
    ...base,
    kind: 'dust_off' as any,
    name: `Dust-Off 1v1: ${base.name}`,
    farmer: `${base.farmer} (Match Sprint)`,
    treatment: base.treatment,
    acres: base.acres,
    pay: base.pay + 500,
    bonus: base.bonus + 350,
    target: 50, // 50% of the field claimed for instant knockout victory
    bonusTarget: 55,
    difficulty: '1v1 Swath Battle',
    note: `Head-to-head sprint vs ${rivalName}. First to spray a row claims it in their color. Spraying over your rival earns $0!`,
    briefing:
      `Going wing-to-wing with ${rivalName}! Every row is first-come, first-served. Once claimed, that swath turns your rival's color and cannot be stolen. Claim 50% of the field or hold the lead when 90% of the crop is treated to claim the purse!`,
  };
}

export function getDustOffState(sim: any, rivalName = 'Miller (County Champ)'): DustOffState {
  const total = Math.max(1, fieldCellCount(sim.job));
  const myCells = sim.covered?.size ?? 0;
  const rivalCells = sim.rivalCovered?.size ?? 0;
  const myCoverage = (myCells / total) * 100;
  const rivalCoverage = (rivalCells / total) * 100;
  const leadCells = myCells - rivalCells;
  const acresPerCell = (sim.job.acres || 80) / total;
  const leadAcres = leadCells * acresPerCell;

  let winner: 'player' | 'rival' | null = null;
  if (myCoverage >= 50) winner = 'player';
  else if (rivalCoverage >= 50) winner = 'rival';
  else if (myCoverage + rivalCoverage >= 90) {
    winner = myCells >= rivalCells ? 'player' : 'rival';
  }

  return {
    myCells,
    rivalCells,
    totalCells: total,
    myCoverage,
    rivalCoverage,
    leadCells,
    leadAcres,
    winner,
    rivalName,
  };
}

export class DustOffAiPilot {
  x: number;
  y: number;
  z: number;
  heading = 0;
  roll = 0;
  pitch = 0;
  speed = 36;
  spraying = false;
  passIndex = 0;
  passProgress = 0;
  private passes: { start: { x: number; z: number }; end: { x: number; z: number } }[] = [];

  constructor(public job: Contract) {
    const halfW = Math.min(job.width ?? 360, 360) / 2;
    const halfD = Math.min(job.depth ?? 360, 360) / 2;
    const swathStep = 32;
    const count = Math.max(3, Math.floor((halfW * 2) / swathStep));

    // AI sprays in the opposite direction (East to West) so flights cross dynamically!
    for (let i = count - 1; i >= 0; i--) {
      const offsetX = -halfW + i * swathStep + swathStep / 2;
      const northToSouth = i % 2 === 1;
      const zStart = northToSouth ? -halfD + 12 : halfD - 12;
      const zEnd = northToSouth ? halfD - 12 : -halfD + 12;
      this.passes.push({
        start: { x: job.x + offsetX, z: job.z + zStart },
        end: { x: job.x + offsetX, z: job.z + zEnd },
      });
    }

    this.x = this.passes[0]?.start.x ?? job.x;
    this.z = this.passes[0]?.start.z ?? job.z;
    this.y = 480;
  }

  update(dt: number, sim: any) {
    if (this.passIndex >= this.passes.length) {
      this.spraying = false;
      return;
    }

    const pass = this.passes[this.passIndex];
    const dx = pass.end.x - pass.start.x;
    const dz = pass.end.z - pass.start.z;
    const passLen = Math.max(1, Math.hypot(dx, dz));
    this.heading = Math.atan2(dx, -dz);

    const stepDist = this.speed * dt;
    this.passProgress += stepDist / passLen;
    this.spraying = this.passProgress >= 0.04 && this.passProgress <= 0.96;

    if (this.passProgress >= 1.0) {
      this.passIndex++;
      this.passProgress = 0;
      this.spraying = false;
    } else {
      this.x = pass.start.x + dx * this.passProgress;
      this.z = pass.start.z + dz * this.passProgress;
      this.y = sim.y ?? 480;
    }

    if (this.spraying) {
      const size = 12;
      for (let offset = -16; offset <= 16; offset += 8) {
        const px = this.x + Math.cos(this.heading) * offset;
        const pz = this.z + Math.sin(this.heading) * offset;
        const col = Math.floor((px - this.job.x + 228) / size);
        const row = Math.floor((pz - this.job.z + 228) / size);
        if (col >= 0 && col < 38 && row >= 0 && row < 38) {
          const n = row * 38 + col;
          // Swath claiming: only paint if player hasn't already claimed it
          if (!sim.covered.has(n) && !sim.rivalCovered.has(n)) {
            sim.rivalCovered.add(n);
            sim.coverageVersion++;
          }
        }
      }
    }
  }
}
