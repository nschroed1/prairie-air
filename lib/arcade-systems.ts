import type { Simulation } from './simulation';
import { fieldSize, fieldCells } from './field-geometry';
import { flightPasses } from './flight-guidance';

export type ArcadeEvent =
  | { type: 'clean_pass'; streak: number; bonus: number }
  | { type: 'flow_tick'; streak: number; bonus: number }
  | { type: 'deck_skim'; bonus: number }
  | { type: 'swath_lock'; locked: boolean }
  | { type: 'ag_turn'; name: string; bonus: number };

export class ArcadeTracker {
  // Clean pass streak: 1 to 5
  passStreak = 1;

  // Swath lock state (+-1.5m alignment)
  locked = false;
  get swathLocked(): boolean {
    return this.locked;
  }

  // Deck skimmer state (6.1m - 9.8m altitude pocket)
  isDeckSkimming = false;

  // Timers
  private flowTimer = 0;
  private deckSkimTimer = 0;
  private oversprayTimer = 0;

  // State transitions
  private wasSpraying = false;
  private wasInField = false;

  // Strip & pass tracking
  private passActive = false;
  private passStartOverspray = 0;
  private passMaxRoll = 0;
  private passStartCovered = new Set<number>();
  private passAddedCells = new Set<number>();

  // Acrobatic turn tracking
  private trackingTurn = false;
  private turnStartTime = 0;
  private turnStartY = 0;
  private turnStartAlt = 0;
  private turnStartHeading = 0;
  private turnApexClimb = 0;
  private turnApexY = 0;
  private turnMaxRoll = 0;
  private turnDive = false;

  // A public flight is replayed across many server requests. Keep the timers
  // and partial maneuvers so request boundaries cannot change its rewards.
  snapshot() {
    return {
      passStreak: this.passStreak,
      locked: this.locked,
      isDeckSkimming: this.isDeckSkimming,
      flowTimer: this.flowTimer,
      deckSkimTimer: this.deckSkimTimer,
      oversprayTimer: this.oversprayTimer,
      wasSpraying: this.wasSpraying,
      wasInField: this.wasInField,
      passActive: this.passActive,
      passStartOverspray: this.passStartOverspray,
      passMaxRoll: this.passMaxRoll,
      passStartCovered: [...this.passStartCovered],
      passAddedCells: [...this.passAddedCells],
      trackingTurn: this.trackingTurn,
      turnStartTime: this.turnStartTime,
      turnStartY: this.turnStartY,
      turnStartAlt: this.turnStartAlt,
      turnStartHeading: this.turnStartHeading,
      turnApexClimb: this.turnApexClimb,
      turnApexY: this.turnApexY,
      turnMaxRoll: this.turnMaxRoll,
      turnDive: this.turnDive,
    };
  }

  restore(state?: ReturnType<ArcadeTracker['snapshot']>) {
    this.reset();
    if (!state) return;
    const { passStartCovered, passAddedCells, ...values } = state;
    Object.assign(this, values);
    this.passStartCovered = new Set(passStartCovered);
    this.passAddedCells = new Set(passAddedCells);
  }

  reset() {
    this.passStreak = 1;
    this.locked = false;
    this.isDeckSkimming = false;
    this.flowTimer = 0;
    this.deckSkimTimer = 0;
    this.oversprayTimer = 0;
    this.wasSpraying = false;
    this.wasInField = false;
    this.passActive = false;
    this.passStartOverspray = 0;
    this.passMaxRoll = 0;
    this.passStartCovered.clear();
    this.passAddedCells.clear();
    this.trackingTurn = false;
    this.turnStartTime = 0;
    this.turnStartY = 0;
    this.turnStartAlt = 0;
    this.turnStartHeading = 0;
    this.turnApexClimb = 0;
    this.turnApexY = 0;
    this.turnMaxRoll = 0;
    this.turnDive = false;
  }

  update(dt: number, sim: Simulation): ArcadeEvent[] {
    const events: ArcadeEvent[] = [];
    const isOverspraying =
      sim.spraying && (!sim.inField || (sim.offTargetFraction ?? 0) > 0);

    // 1. Overspray Streak Penalty (> 0.25s outside field)
    if (isOverspraying) {
      this.oversprayTimer += dt;
      if (this.oversprayTimer > 0.25) {
        if (this.passStreak > 1) {
          this.passStreak = 1;
        }
        // Invalidate ongoing pass
        this.passActive = false;
      }
    } else {
      this.oversprayTimer = 0;
    }

    // 2. Swath Lock Alignment (+-1.5m of any pass line)
    let nearPassLine = false;
    try {
      const passes = flightPasses(sim);
      for (const pass of passes) {
        if (Math.abs(sim.x - pass.x) <= 1.5) {
          if (sim.z >= pass.minZ - 25 && sim.z <= pass.maxZ + 25) {
            nearPassLine = true;
            break;
          }
        }
      }
    } catch {
      nearPassLine = false;
    }

    if (nearPassLine !== this.locked) {
      this.locked = nearPassLine;
      events.push({ type: 'swath_lock', locked: this.locked });
    }

    // Precision rewards count newly treated cells, never time over old coverage.
    const isValidFlow =
      sim.spraying && sim.validSpray && sim.inField && !isOverspraying;
    const freshCells = isValidFlow ? Math.max(0, sim.newCellsAdded) : 0;
    if (isValidFlow) {
      this.flowTimer += freshCells;
      while (this.flowTimer >= 6) {
        this.flowTimer -= 6;
        events.push({
          type: 'flow_tick',
          streak: this.passStreak,
          bonus: 2 * this.passStreak,
        });
      }
    } else this.flowTimer = 0;

    this.isDeckSkimming =
      isValidFlow && sim.altitude >= 6.1 && sim.altitude <= 9.8;
    if (this.isDeckSkimming) {
      this.deckSkimTimer += freshCells;
      while (this.deckSkimTimer >= 8) {
        this.deckSkimTimer -= 8;
        events.push({ type: 'deck_skim', bonus: 1 });
      }
    } else this.deckSkimTimer = 0;

    // 5. Clean Pass Streaks (x1 to x5)
    // Starts when spraying in-field
    if (sim.spraying && sim.inField) {
      if (!this.passActive) {
        this.passActive = true;
        this.passStartOverspray = sim.oversprayAcres;
        this.passMaxRoll = Math.abs(sim.roll);
        this.passStartCovered = new Set(
          [...sim.covered].slice(
            0,
            Math.max(0, sim.covered.size - sim.newCellsAdded),
          ),
        );
        this.passAddedCells.clear();
      } else {
        this.passMaxRoll = Math.max(this.passMaxRoll, Math.abs(sim.roll));
        for (const cellId of sim.covered) {
          if (!this.passStartCovered.has(cellId)) {
            this.passAddedCells.add(cellId);
          }
        }
      }
    }

    // Strip completion happens when spray is cut or aircraft leaves field
    const passEnded =
      this.passActive &&
      ((this.wasSpraying && !sim.spraying) ||
        (this.wasInField && !sim.inField));

    if (passEnded) {
      for (const cellId of sim.covered) {
        if (!this.passStartCovered.has(cellId)) {
          this.passAddedCells.add(cellId);
        }
      }

      // Check added coverage on strip (added coverage >= 70%)
      const { width } = fieldSize(sim.job);
      const count = Math.max(1, Math.ceil(width / (sim.swath - 8)));
      const valid = fieldCells(sim.job);
      const stripTotal = Array.from({ length: count }, () => 0);
      const stripAdded = Array.from({ length: count }, () => 0);

      for (let row = 0; row < 38; row++) {
        for (let col = 0; col < 38; col++) {
          const cellId = row * 38 + col;
          if (!valid.has(cellId)) continue;
          const x = sim.job.x - 228 + col * 12 + 6;
          const stripIdx = Math.max(
            0,
            Math.min(
              count - 1,
              Math.floor((x - sim.job.x + width / 2) / (width / count)),
            ),
          );
          stripTotal[stripIdx]++;
          if (this.passAddedCells.has(cellId)) {
            stripAdded[stripIdx]++;
          }
        }
      }

      let qualifiedStrip = false;
      for (let i = 0; i < count; i++) {
        if (stripTotal[i] > 0 && stripAdded[i] / stripTotal[i] >= 0.699) {
          qualifiedStrip = true;
          break;
        }
      }
      if (!qualifiedStrip && this.passAddedCells.size > 0) {
        const avgStripCells = valid.size / count;
        if (
          avgStripCells > 0 &&
          this.passAddedCells.size / avgStripCells >= 0.699
        ) {
          qualifiedStrip = true;
        }
      }

      const passOverspray = sim.oversprayAcres - this.passStartOverspray;
      const rollWithinLimits = this.passMaxRoll <= 0.52;

      if (qualifiedStrip && passOverspray < 0.04 && rollWithinLimits) {
        const bonus = 25 * this.passStreak;
        events.push({ type: 'clean_pass', streak: this.passStreak, bonus });
        this.passStreak = Math.min(5, this.passStreak + 1);
      }

      this.passActive = false;
    }

    // 6. Acrobatic Ag-Turn Detection
    // Tracks climb, roll, and heading change when spray is cut at edge
    const sprayCutAtEdge =
      this.passAddedCells.size >= 6 &&
      sim.oversprayAcres - this.passStartOverspray < 0.04 &&
      this.wasSpraying &&
      !sim.spraying &&
      (sim.inField ||
        this.wasInField ||
        Math.hypot(sim.x - sim.job.x, sim.z - sim.job.z) <
          Math.max(sim.job.width ?? 300, sim.job.depth ?? 300) * 0.9);

    if (sprayCutAtEdge) {
      this.trackingTurn = true;
      this.turnStartTime = sim.elapsed;
      this.turnStartY = sim.y;
      this.turnStartAlt = sim.altitude;
      this.turnStartHeading = sim.heading;
      this.turnApexClimb = 0;
      this.turnApexY = sim.y;
      this.turnMaxRoll = Math.abs(sim.roll);
      this.turnDive = false;
    } else if (this.trackingTurn) {
      const turnDuration = sim.elapsed - this.turnStartTime;
      if (turnDuration > 10.0) {
        this.trackingTurn = false;
      } else {
        const climb = Math.max(0, sim.y - this.turnStartY);
        if (climb > this.turnApexClimb) {
          this.turnApexClimb = climb;
          this.turnApexY = sim.y;
        }
        this.turnMaxRoll = Math.max(this.turnMaxRoll, Math.abs(sim.roll));

        // Check dive: after apex climb >= 18m, aircraft descends or dives
        if (
          this.turnApexClimb >= 18 &&
          (this.turnApexY - sim.y >= 4 || sim.pitch < -0.1)
        ) {
          this.turnDive = true;
        }

        const headingDiff = Math.abs(
          Math.atan2(
            Math.sin(sim.heading - this.turnStartHeading),
            Math.cos(sim.heading - this.turnStartHeading),
          ),
        );

        const turnedSprayOn = !this.wasSpraying && sim.spraying;
        const leveledOut =
          headingDiff >= 2.5 &&
          Math.abs(sim.roll) < 0.35 &&
          sim.altitude <= this.turnStartAlt + 8;

        if (headingDiff >= 2.2 && (turnedSprayOn || leveledOut)) {
          const reversalBank = (40 * Math.PI) / 180;
          const wingoverBank = (35 * Math.PI) / 180;

          let turnEvent: ArcadeEvent | null = null;
          if (
            this.turnApexClimb >= 18 &&
            this.turnMaxRoll > reversalBank &&
            this.turnDive
          ) {
            turnEvent = {
              type: 'ag_turn',
              name: 'CLIMBING REVERSAL',
              bonus: 125,
            };
          } else if (
            this.turnApexClimb >= 12 &&
            this.turnMaxRoll > wingoverBank &&
            turnDuration <= 12
          ) {
            turnEvent = {
              type: 'ag_turn',
              name: 'WIZARD WINGOVER',
              bonus: 75,
            };
          } else if (turnDuration <= 8) {
            turnEvent = { type: 'ag_turn', name: 'SNAP AG-TURN', bonus: 40 };
          }

          if (turnEvent) {
            events.push(turnEvent);
          }
          this.trackingTurn = false;
        }
      }
    }

    this.wasSpraying = sim.spraying;
    this.wasInField = sim.inField;
    return events;
  }
}
