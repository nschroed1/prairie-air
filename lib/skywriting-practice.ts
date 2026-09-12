import type { Simulation, Career } from './simulation';

/** A practice flight borrows upgrades but never changes the player's career. */
export class SkywritingPractice {
  private saved: {
    career: Career;
    wear: number;
    clog: number;
    integrity: number;
    weatherLocked: boolean;
  } | null = null;
  get active() {
    return this.saved !== null;
  }
  get savedCash() {
    return this.saved?.career.cash;
  }
  begin(sim: Simulation) {
    if (!this.saved)
      this.saved = {
        career: structuredClone(sim.career),
        wear: sim.wear,
        clog: sim.clog,
        integrity: sim.integrity,
        weatherLocked: sim.weatherLocked,
      };
    sim.career = {
      ...structuredClone(this.saved.career),
      maintenanceDebt: 0,
      repairDebt: 0,
    };
    sim.wear = sim.clog = 0;
    sim.integrity = 100;
    sim.weatherLocked = false;
  }
  end(sim: Simulation) {
    if (!this.saved) return;
    Object.assign(sim, this.saved);
    this.saved = null;
  }
}
