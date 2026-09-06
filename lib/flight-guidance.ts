import { fieldSize, ground, insideField, type Simulation } from './simulation';

export type PassGuide = {
  x: number;
  heading: number;
  index: number;
  total: number;
  coverage: number;
};
const passCache = new WeakMap<
  Simulation,
  { key: string; passes: PassGuide[] }
>();

export function flightPasses(sim: Simulation): PassGuide[] {
  const key = `${sim.job.id}:${sim.coverageVersion}:${sim.swath}`;
  const cached = passCache.get(sim);
  if (cached?.key === key) return cached.passes;
  const { width, depth } = fieldSize(sim.job);
  const count = Math.ceil(width / (sim.swath - 8));
  const passes = Array.from({ length: count }, (_, index) => ({
    x:
      sim.job.x +
      (count === 1
        ? 0
        : (index / (count - 1) - 0.5) * Math.max(0, width - sim.swath - 6)),
    heading: index % 2 ? Math.PI : 0,
    index,
    total: count,
    coverage: 0,
  }));
  const cells = Array.from({ length: count }, () => 0);
  for (let row = 0; row < 38; row++)
    for (let col = 0; col < 38; col++) {
      const x = sim.job.x - 228 + col * 12 + 6;
      const z = sim.job.z - 228 + row * 12 + 6;
      if (
        Math.abs(x - sim.job.x) >= width / 2 ||
        Math.abs(z - sim.job.z) >= depth / 2
      )
        continue;
      const index = Math.min(
        count - 1,
        Math.floor((x - sim.job.x + width / 2) / (width / count)),
      );
      cells[index]++;
      if (sim.covered.has(row * 38 + col)) passes[index].coverage++;
    }
  passes.forEach((pass, index) => {
    pass.coverage = cells[index] ? pass.coverage / cells[index] : 1;
  });
  passCache.set(sim, { key, passes });
  return passes;
}

export function nextPass(sim: Simulation): PassGuide {
  const passes = flightPasses(sim);
  return (
    passes.find((pass) => pass.coverage < 0.94) ??
    passes.reduce((best, pass) => (pass.coverage < best.coverage ? pass : best))
  );
}

export function lineUpLesson(sim: Simulation) {
  if (sim.job.id !== 0 || sim.phase !== 'flying') return false;
  const pass = nextPass(sim),
    { depth } = fieldSize(sim.job);
  sim.x = pass.x;
  sim.z = sim.job.z + (pass.heading === 0 ? 1 : -1) * (depth / 2 + 70);
  sim.y = ground(sim.x, sim.z) + 19;
  sim.x -= sim.sprayDrift;
  sim.y = ground(sim.x, sim.z) + 19;
  sim.heading = pass.heading;
  sim.roll = sim.pitch = 0;
  sim.speed = sim.throttle = 34;
  sim.spraying = false;
  sim.offTargetFraction = 0;
  // A training aid only: no refill, new coverage, refund, or payout.
  return true;
}

// The same heading, width, drift and longitudinal margin as the spray model.
// This is a conservative preview; it never changes treatment or payment.
export function sprayFootprint(sim: Simulation, ahead = 0) {
  const x = sim.x + sim.sprayDrift + Math.sin(sim.heading) * sim.speed * ahead;
  const z = sim.z - Math.cos(sim.heading) * sim.speed * ahead;
  const half = sim.swath / 2;
  const depth = sim.speed * 0.05 + 9;
  return [
    [-half, -depth],
    [half, -depth],
    [half, depth],
    [-half, depth],
  ].map(([a, b]) => ({
    x: x + Math.cos(sim.heading) * a + Math.sin(sim.heading) * b,
    z: z + Math.sin(sim.heading) * a - Math.cos(sim.heading) * b,
  }));
}

export function spraySafety(sim: Simulation): 'outside' | 'edge' | 'safe' {
  if (!sprayFootprint(sim).every((p) => insideField(sim.job, p.x, p.z)))
    return 'outside';
  return sprayFootprint(sim, 0.5).every((p) => insideField(sim.job, p.x, p.z))
    ? 'safe'
    : 'edge';
}

export function coachMessage(sim: Simulation) {
  const pass = nextPass(sim);
  const safety = spraySafety(sim);
  if (sim.coverage >= sim.job.bonusTarget)
    return {
      title: 'Precision bonus earned',
      detail: 'Release the spray. Collect your pay, or finish the last strips.',
      step: 3,
    };
  if (sim.coverage >= sim.job.target)
    return {
      title: 'Your contract is ready to collect',
      detail: `Bank your pay now, or aim for ${sim.job.bonusTarget}% coverage to earn the bonus.`,
      step: 3,
    };
  if (!sim.validSpray)
    return {
      title: 'Settle the aircraft',
      detail:
        sim.altitude < 6
          ? 'Climb with W. Stay above 20 ft.'
          : sim.altitude > 30
            ? 'Descend with S. Aim for 20–98 ft.'
            : Math.abs(sim.roll) >= 0.52
              ? 'Release A/D to level the wings before spraying.'
              : 'Hold Ctrl to slow below 136 mph.',
      step: 0,
    };
  if (safety === 'edge')
    return {
      title: 'Field edge ahead — spray off',
      detail:
        'Release Space before the amber footprint leaves your plot. Then make a wide turn.',
      step: 2,
    };
  if (safety === 'outside')
    return {
      title:
        sim.coverage > 2
          ? 'Spray off · line up the next strip'
          : 'Follow the white approach line',
      detail: `Use A/D to bank toward strip ${pass.index + 1}. Hold Space only when the footprint is green.`,
      step: sim.coverage > 2 ? 2 : 0,
    };
  return {
    title: sim.spraying
      ? 'Good pass · keep it steady'
      : 'Green footprint — hold Space',
    detail: `Strip ${pass.index + 1} of ${pass.total}. Release A/D for level wings; watch for amber at the far edge.`,
    step: 1,
  };
}

export type PracticeBest = {
  total: number;
  coverage: number;
  oversprayAcres: number;
  elapsed: number;
};
export type PracticeBests = Record<string, PracticeBest>;
export function loadPracticeBests(raw: string | null): PracticeBests {
  try {
    const value = JSON.parse(raw ?? '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(([id, row]) => {
        if (!['0', '1', '2'].includes(id) || !row || typeof row !== 'object')
          return false;
        const best = row as PracticeBest;
        return (
          [best.total, best.coverage, best.oversprayAcres, best.elapsed].every(
            (n) => Number.isFinite(n) && n >= 0,
          ) && best.coverage <= 100
        );
      }),
    ) as PracticeBests;
  } catch {
    return {};
  }
}
export function isPersonalBest(current: PracticeBest, previous?: PracticeBest) {
  if (!previous) return true;
  if (current.total !== previous.total) return current.total > previous.total;
  if (current.coverage !== previous.coverage)
    return current.coverage > previous.coverage;
  if (current.oversprayAcres !== previous.oversprayAcres)
    return current.oversprayAcres < previous.oversprayAcres;
  return current.elapsed < previous.elapsed;
}

export function debriefTip(sim: Simulation) {
  if (sim.result.penalty > 0)
    return 'Release the spray while the footprint is amber. A wider turn gives you time to line up without spraying outside the flags.';
  if (!sim.result.bonus)
    return 'Use the dark strips on your field map to find untreated ground. A small overlap between passes helps you reach the precision bonus.';
  return sim.job.id === 0
    ? 'Clean work. Try Willow Creek next: a stronger crosswind will push the spray to the east.'
    : 'Keep that rhythm: line up, level the wings, spray, then release before the turn.';
}
