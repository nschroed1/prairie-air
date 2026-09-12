import { freshControls, type Simulation } from '../../lib/simulation';
import { skyRoute, SKY_SPACING } from '../../lib/skywriting';
import type { Step } from '../../lib/county';

// A test pilot uses only the normal keyboard controls. No position, score,
// progress, or time is injected into the simulation.
export function skyInput(sim: Simulation) {
  const route = skyRoute(sim.job);
  const next =
    route[Math.min(80, Math.floor(sim.skywriting.progress / SKY_SPACING) + 2)];
  const heading = Math.atan2(next.x - sim.x, -(next.z - sim.z));
  const delta = Math.atan2(
    Math.sin(heading - sim.heading),
    Math.cos(heading - sim.heading),
  );
  return {
    ...freshControls(),
    left: delta < -0.04,
    right: delta > 0.04,
    up: sim.y < next.y - 1,
    down: sim.y > next.y + 1,
    spray: true,
  };
}
export function flyHeart(sim: Simulation, limit = 7500) {
  const steps: Step[] = [];
  for (
    let i = 0;
    i < limit && !sim.completionReady && sim.phase === 'flying';
    i++
  ) {
    const step = { dt: 0.02, input: skyInput(sim) };
    steps.push(step);
    sim.step(step.dt, step.input);
  }
  return steps;
}
