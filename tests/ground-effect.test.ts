import test from 'node:test';
import assert from 'node:assert/strict';
import { Simulation, freshControls, ground } from '../lib/simulation';

void test('low-deck aerodynamic ground effect cushions descent between 3m and 6.2m AGL', () => {
  const sim = new Simulation();
  sim.phase = 'flying';
  sim.speed = 36;
  sim.throttle = 36;
  sim.pitch = -0.15; // Diving gently downward
  sim.x = 0;
  sim.z = 0;
  const gY = ground(0, 0);

  // Position at 4.0m AGL (deep inside ground effect pocket)
  sim.y = gY + 4.0;
  const initialY = sim.y;
  sim.step(0.05, freshControls());

  // High altitude comparison (50m AGL, zero ground effect)
  const highSim = new Simulation();
  highSim.phase = 'flying';
  highSim.speed = 36;
  highSim.throttle = 36;
  highSim.pitch = -0.15;
  highSim.x = 0;
  highSim.z = 0;
  highSim.y = gY + 50.0;
  const initialHighY = highSim.y;
  highSim.step(0.05, freshControls());

  const lowSink = initialY - sim.y;
  const highSink = initialHighY - highSim.y;

  // Low altitude should sink slower than high altitude due to the ground cushion
  assert.ok(
    lowSink < highSink,
    `Low-deck sink (${lowSink.toFixed(3)}) should be less than free-air sink (${highSink.toFixed(3)})`,
  );
});
