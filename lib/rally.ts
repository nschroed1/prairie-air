import { ground, riverX } from './terrain-math';
import type { Contract } from './simulation';

export type RallyStunt = 'inverted-barn' | 'trestle' | 'wire-skim' | 'water-kiss';

export interface RallyGate {
  id: number;
  name: string;
  subtitle: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  targetHeading: number; // expected approach heading in radians
  maxAltAGL?: number;
  stuntBonusSeconds?: number;
  stuntType?: RallyStunt;
}

export interface RallyState {
  gateIndex: number; // 0 to RALLY_GATES.length
  splits: number[]; // timestamp for each gate passed
  stuntsEarned: { name: string; seconds: number }[];
  penaltySeconds: number;
  bonusSeconds: number;
  startTime: number;
  elapsed: number;
  completed: boolean;
  finalTime: number;
  medal: 'gold' | 'silver' | 'bronze' | 'participant' | null;
}

// 10 real O'Brien County landmarks forming an exhilarating, flow-balanced circuit
export function getRallyGates(): RallyGate[] {
  const riverTrestleX = riverX(150);
  const riverBendX = riverX(-100);
  return [
    {
      id: 1,
      name: 'Airstrip Departure',
      subtitle: 'Full throttle acceleration',
      x: -170,
      y: ground(-170, 250) + 10,
      z: 250,
      radius: 22,
      targetHeading: Math.PI, // heading south
      maxAltAGL: 20,
    },
    {
      id: 2,
      name: 'Hartley Co-Op Silos',
      subtitle: 'Tight bank between concrete silos',
      x: 250,
      y: ground(250, -350) + 16,
      z: -350,
      radius: 24,
      targetHeading: -0.8, // heading north-northeast
    },
    {
      id: 3,
      name: 'Yew Avenue Wires',
      subtitle: 'Low skim under telephone wires',
      x: 263,
      y: ground(263, 50) + 5.5,
      z: 50,
      radius: 18,
      targetHeading: Math.PI / 2, // heading east
      maxAltAGL: 7.2,
      stuntType: 'wire-skim',
      stuntBonusSeconds: 1.5,
    },
    {
      id: 4,
      name: 'Cedar Gorge Descent',
      subtitle: 'Dive into the river canyon',
      x: -450,
      y: ground(-450, 350) + 14,
      z: 350,
      radius: 24,
      targetHeading: -2.4, // heading south-southwest
    },
    {
      id: 5,
      name: 'River Trestle Runner',
      subtitle: 'Dive under the timber railroad bridge',
      x: riverTrestleX,
      y: ground(riverTrestleX, 150) + 5.0,
      z: 150,
      radius: 18,
      targetHeading: 0, // heading north along river
      maxAltAGL: 12.0,
      stuntType: 'trestle',
      stuntBonusSeconds: 2.0,
    },
    {
      id: 6,
      name: 'Cedar Water Kiss',
      subtitle: 'Low high-speed river skimming',
      x: riverBendX,
      y: ground(riverBendX, -100) + 4.0,
      z: -100,
      radius: 20,
      targetHeading: -0.2, // heading north
      maxAltAGL: 6.0,
      stuntType: 'water-kiss',
      stuntBonusSeconds: 1.0,
    },
    {
      id: 7,
      name: 'The Red Barn Breezeway',
      subtitle: 'Thread the barn · inverted gives -3.0s!',
      x: -315,
      y: ground(-315, -195) + 6.0,
      z: -195,
      radius: 15,
      targetHeading: Math.PI / 2, // heading east through breezeway
      maxAltAGL: 9.0,
      stuntType: 'inverted-barn',
      stuntBonusSeconds: 3.0,
    },
    {
      id: 8,
      name: 'North Windbreak Chute',
      subtitle: 'Low run through mature spruce corridor',
      x: -680,
      y: ground(-680, 140) + 12,
      z: 140,
      radius: 20,
      targetHeading: 2.2, // heading southeast
    },
    {
      id: 9,
      name: '100th Avenue Crossing',
      subtitle: 'Dive under roadside powerlines',
      x: 0,
      y: ground(0, 520) + 6.5,
      z: 520,
      radius: 18,
      targetHeading: 1.57, // heading east
      maxAltAGL: 8.0,
      stuntType: 'wire-skim',
      stuntBonusSeconds: 1.5,
    },
    {
      id: 10,
      name: 'Airstrip Checkered Flag',
      subtitle: 'Touchdown over runway threshold',
      x: -170,
      y: ground(-170, 420) + 5.0,
      z: 420,
      radius: 20,
      targetHeading: Math.PI, // heading south
      maxAltAGL: 8.0,
    },
  ];
}

export const RALLY_GATES = getRallyGates();

export const RALLY_PAR_TIMES = {
  gold: 68.0, // Under 1m 08s
  silver: 78.0, // Under 1m 18s
  bronze: 92.0, // Under 1m 32s
};

export const freshRallyState = (): RallyState => ({
  gateIndex: 0,
  splits: [],
  stuntsEarned: [],
  penaltySeconds: 0,
  bonusSeconds: 0,
  startTime: 0,
  elapsed: 0,
  completed: false,
  finalTime: 0,
  medal: null,
});

export function stepRally(
  state: RallyState,
  pos: { x: number; y: number; z: number },
  heading: number,
  roll: number,
  speed: number,
  dt: number,
  elapsed: number,
): { gatePassed: RallyGate | null; stuntEarned?: { name: string; seconds: number } } {
  if (state.completed) return { gatePassed: null };

  state.elapsed = elapsed;
  if (state.gateIndex === 0 && state.startTime === 0) {
    state.startTime = elapsed;
  }

  const currentGate = RALLY_GATES[state.gateIndex];
  if (!currentGate) return { gatePassed: null };

  const dx = pos.x - currentGate.x;
  const dy = pos.y - currentGate.y;
  const dz = pos.z - currentGate.z;
  const dist = Math.hypot(dx, dy, dz);

  // Check if aircraft penetrated the gate sphere
  if (dist <= currentGate.radius) {
    // Altitude constraint check
    const altAGL = pos.y - ground(pos.x, pos.z);
    if (currentGate.maxAltAGL && altAGL > currentGate.maxAltAGL + 2) {
      // Too high above gate
      return { gatePassed: null };
    }

    // Check stunt opportunities
    let stuntEarned: { name: string; seconds: number } | undefined;
    if (currentGate.stuntType) {
      if (currentGate.stuntType === 'inverted-barn') {
        const isInverted = Math.abs(roll) > 2.6; // Inverted flight (> ~150 degrees bank)
        if (isInverted) {
          stuntEarned = {
            name: 'Inverted Barnstormer!',
            seconds: currentGate.stuntBonusSeconds ?? 3.0,
          };
        }
      } else if (currentGate.stuntType === 'trestle') {
        if (speed >= 30 && altAGL <= 7.0 && altAGL >= 2.5) {
          stuntEarned = {
            name: 'Trestle Runner Precision!',
            seconds: currentGate.stuntBonusSeconds ?? 2.0,
          };
        }
      } else if (currentGate.stuntType === 'wire-skim') {
        if (speed >= 30 && altAGL <= 7.0) {
          stuntEarned = {
            name: 'Wire Skimmer Razor!',
            seconds: currentGate.stuntBonusSeconds ?? 1.5,
          };
        }
      } else if (currentGate.stuntType === 'water-kiss') {
        if (altAGL <= 5.0) {
          stuntEarned = {
            name: 'Cedar River Wave Kiss!',
            seconds: currentGate.stuntBonusSeconds ?? 1.0,
          };
        }
      }
    }

    if (stuntEarned) {
      state.stuntsEarned.push(stuntEarned);
      state.bonusSeconds += stuntEarned.seconds;
    }

    state.splits.push(elapsed - state.startTime);
    state.gateIndex++;

    if (state.gateIndex >= RALLY_GATES.length) {
      state.completed = true;
      const rawTime = elapsed - state.startTime;
      state.finalTime = Math.max(1, rawTime + state.penaltySeconds - state.bonusSeconds);

      if (state.finalTime <= RALLY_PAR_TIMES.gold) state.medal = 'gold';
      else if (state.finalTime <= RALLY_PAR_TIMES.silver) state.medal = 'silver';
      else if (state.finalTime <= RALLY_PAR_TIMES.bronze) state.medal = 'bronze';
      else state.medal = 'participant';
    }

    return { gatePassed: currentGate, stuntEarned };
  }

  return { gatePassed: null };
}

export function rallyContract<T extends Contract>(base: T): T {
  return {
    ...base,
    kind: 'rally' as any,
    name: "O'Brien County Barnstormer Rally",
    farmer: 'O\'Brien County Aviation Club',
    treatment: 'Pylon Race',
    acres: 0,
    pay: 1500,
    bonus: 600,
    target: 100, // 100% of 10 gates
    bonusTarget: 100,
    difficulty: 'Precision aerobatic time trial',
    note: 'Fly all 10 low-altitude landmark gates in order. Inverted barn and wire skims deduct penalty seconds!',
    briefing:
      'The county fair rally is on! Thread 10 landmark gates from Hartley to the Cedar River trestle. Fly through the green gates in sequence. Invert your wings in the barn breezeway for a -3.0s time bonus. Beat 68 seconds for Gold!',
    windStrength: 0.5,
  };
}
