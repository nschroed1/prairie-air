import { freshControls, type Simulation } from './simulation';
import { skyRoute, SKY_SPACING } from './skywriting';

/** Local-development reveal fixture, flown through the real controls and scorer. */
export function previewSkywritingReveal(sim: Simulation) {
  const route = skyRoute(sim.job);
  for (
    let i = 0;
    i < 7500 && !sim.completionReady && sim.phase === 'flying';
    i++
  ) {
    const next =
      route[
        Math.min(80, Math.floor(sim.skywriting.progress / SKY_SPACING) + 2)
      ];
    const heading = Math.atan2(next.x - sim.x, -(next.z - sim.z));
    const delta = Math.atan2(
      Math.sin(heading - sim.heading),
      Math.cos(heading - sim.heading),
    );
    sim.step(0.02, {
      ...freshControls(),
      left: delta < -0.04,
      right: delta > 0.04,
      up: sim.y < next.y - 1,
      down: sim.y > next.y + 1,
      spray: sim.skywriting.progress > 0,
    });
  }
  return sim.finish();
}
