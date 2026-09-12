import { type Contract, fieldCellCount } from './simulation';

export interface TandemState {
  myCoverage: number;
  partnerCoverage: number;
  combinedCoverage: number;
  target: number;
  inFormation: boolean;
  formationSeconds: number;
  formationBonus: number;
  partnerDistance: number;
  partnerName: string;
}

export function tandemContract<T extends Contract>(
  base: T,
  partnerName = 'Bennett (Lead Pilot)',
): T {
  return {
    ...base,
    kind: 'tandem' as any,
    name: `Tandem Co-Op: ${base.name}`,
    farmer: `${base.farmer} (Commercial Mega-Field)`,
    treatment: base.treatment,
    acres: Math.max(120, (base.acres || 60) * 2),
    pay: base.pay + 900,
    bonus: base.bonus + 500,
    target: 88,
    bonusTarget: 95,
    difficulty: '2-Pilot Formation Dusting',
    note: `Fly formation with ${partnerName}. Stay within 25–50m parallel spacing for echelon slipstream bonuses!`,
    briefing:
      `Team up with ${partnerName} to treat this commercial mega-field! Both pilots' swaths pool together toward the 88% target. Keep tight parallel echelon formation (25m–50m lateral separation) to trigger slipstream drag reduction and earn the +$500 Precision Agronomy Team Multiplier!`,
  };
}

export function getTandemState(sim: any, partnerName = 'Bennett (Lead Pilot)'): TandemState {
  const total = Math.max(1, fieldCellCount(sim.job));
  const myCells = sim.covered?.size ?? 0;
  const partnerCells = sim.partnerCovered?.size ?? 0;
  const combined = new Set([...(sim.covered ?? []), ...(sim.partnerCovered ?? [])]);
  const combinedCoverage = (combined.size / total) * 100;
  const myCoverage = (myCells / total) * 100;
  const partnerCoverage = (partnerCells / total) * 100;

  return {
    myCoverage,
    partnerCoverage,
    combinedCoverage,
    target: sim.job.target || 88,
    inFormation: Boolean(sim.inFormation),
    formationSeconds: sim.formationSeconds ?? 0,
    formationBonus: Math.round((sim.formationSeconds ?? 0) * 15),
    partnerDistance: sim.partnerDistance ?? 40,
    partnerName,
  };
}

export class TandemAiPartner {
  x: number;
  y: number;
  z: number;
  heading = 0;
  roll = 0;
  pitch = 0;
  speed = 35;
  spraying = false;
  passIndex = 0;
  passProgress = 0;
  private passes: { start: { x: number; z: number }; end: { x: number; z: number } }[] = [];

  constructor(public job: Contract) {
    const halfW = Math.min(job.width ?? 400, 400) / 2;
    const halfD = Math.min(job.depth ?? 400, 400) / 2;
    const swathStep = 32;
    const count = Math.max(4, Math.floor((halfW * 2) / swathStep));

    // Partner takes the East half of the field
    const halfCount = Math.floor(count / 2);
    for (let i = halfCount; i < count; i++) {
      const offsetX = -halfW + i * swathStep + swathStep / 2;
      const northToSouth = (i - halfCount) % 2 === 1;
      const zStart = northToSouth ? -halfD + 12 : halfD - 12;
      const zEnd = northToSouth ? halfD - 12 : -halfD + 12;
      this.passes.push({
        start: { x: job.x + offsetX, z: job.z + zStart },
        end: { x: job.x + offsetX, z: job.z + zEnd },
      });
    }

    this.x = this.passes[0]?.start.x ?? job.x + 60;
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
    this.spraying = this.passProgress >= 0.05 && this.passProgress <= 0.95;

    if (this.passProgress >= 1.0) {
      this.passIndex++;
      this.passProgress = 0;
      this.spraying = false;
    } else {
      this.x = pass.start.x + dx * this.passProgress;
      this.z = pass.start.z + dz * this.passProgress;
      this.y = sim.y ?? 480;
    }

    // Formation proximity check
    const distToPlayer = Math.hypot(this.x - sim.x, this.z - sim.z);
    sim.partnerDistance = distToPlayer;
    sim.inFormation = distToPlayer >= 22 && distToPlayer <= 55 && Math.abs(this.y - sim.y) < 12;
    if (sim.inFormation) {
      sim.formationSeconds = (sim.formationSeconds ?? 0) + dt;
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
          if (!sim.partnerCovered.has(n)) {
            sim.partnerCovered.add(n);
            sim.coverageVersion++;
          }
        }
      }
    }
  }
}
