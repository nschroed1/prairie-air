import type { Simulation, Career } from './simulation';

export type BadgeTier = 'bronze' | 'silver' | 'gold' | 'legendary';

export type BadgeCategory =
  | 'precision'
  | 'barnstorming'
  | 'emergency'
  | 'rally'
  | 'skywriting'
  | 'career';

export interface AchievementDef {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  category: BadgeCategory;
  tier: BadgeTier;
  icon: string;
  maxProgress: number;
  rewardCash: number;
  secret?: boolean;
}

export interface AchievementState {
  id: string;
  progress: number;
  unlocked: boolean;
  unlockedAt?: string;
  claimedCash?: boolean;
}

export interface HallOfFameRecord {
  id: string;
  title: string;
  metric: string;
  unit: string;
  icon: string;
  description: string;
  // Historic Iowa Pioneer Legend Record to beat
  legendHolder: string;
  legendValue: number;
  legendAircraft: string;
  legendDate: string;
  // Player best record
  playerValue?: number;
  playerDate?: string;
  playerAircraft?: string;
  higherIsBetter: boolean;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  // 1. Precision & Crop Care
  {
    id: 'first_solo',
    title: 'First Solo',
    subtitle: 'Student Pilot License',
    description: 'Complete your first flight contract or practice sortie.',
    category: 'precision',
    tier: 'bronze',
    icon: 'Plane',
    maxProgress: 1,
    rewardCash: 100,
  },
  {
    id: 'swath_master',
    title: 'Laser Straight',
    subtitle: 'Precision Guidance',
    description: 'Accumulate 15 seconds of steady Swath Lock alignment (±1.5m).',
    category: 'precision',
    tier: 'bronze',
    icon: 'Crosshair',
    maxProgress: 15,
    rewardCash: 100,
  },
  {
    id: 'clean_streak_5',
    title: 'Five-Star Pass',
    subtitle: 'Rhythm of the Rows',
    description: 'Build up a maximum x5 Clean Pass streak in a single contract.',
    category: 'precision',
    tier: 'silver',
    icon: 'CheckCircle2',
    maxProgress: 5,
    rewardCash: 250,
  },
  {
    id: 'deck_skimmer',
    title: 'Crop Shaver',
    subtitle: 'Deck Skim Specialist',
    description: 'Sustain deck skimming altitude (6.1m to 9.8m) for 20 cumulative seconds.',
    category: 'precision',
    tier: 'bronze',
    icon: 'ArrowDown',
    maxProgress: 20,
    rewardCash: 100,
  },
  {
    id: 'zero_drift',
    title: 'Surgical Swath',
    subtitle: 'Pristine Spray Stewardship',
    description: 'Complete a spray contract with exactly $0 in overspray drift penalties.',
    category: 'precision',
    tier: 'gold',
    icon: 'ShieldCheck',
    maxProgress: 1,
    rewardCash: 500,
  },

  // 2. Barnstorming & Aerobatics
  {
    id: 'wire_skimmer',
    title: 'High Voltage',
    subtitle: 'Rural Electrification Wire Skim',
    description: 'Skim under 7.2m AGL along a power wire run at over 30 m/s airspeed.',
    category: 'barnstorming',
    tier: 'bronze',
    icon: 'Zap',
    maxProgress: 1,
    rewardCash: 100,
  },
  {
    id: 'trestle_runner',
    title: 'River Rat',
    subtitle: 'Cedar Trestle Bridge Run',
    description: 'Fly cleanly beneath the Cedar River railroad trestle bridge span.',
    category: 'barnstorming',
    tier: 'silver',
    icon: 'Anchor',
    maxProgress: 1,
    rewardCash: 250,
  },
  {
    id: 'silo_grazer',
    title: 'Barnyard Whisker',
    subtitle: 'Obstacle Proximity Flight',
    description: 'Perform 5 near-miss passes with farmstead silos or barn roofs.',
    category: 'barnstorming',
    tier: 'silver',
    icon: 'Building2',
    maxProgress: 5,
    rewardCash: 250,
  },
  {
    id: 'reversal_ace',
    title: 'Gravity Defier',
    subtitle: 'Climbing Reversal Ag-Turn',
    description: 'Execute 3 acrobatic Climbing Reversal ag-turns across your career.',
    category: 'barnstorming',
    tier: 'silver',
    icon: 'RotateCcw',
    maxProgress: 3,
    rewardCash: 250,
  },
  {
    id: 'stunt_master',
    title: 'Barnstormer King',
    subtitle: 'County Fair Crowd Pleaser',
    description: 'Bank $400 or more in stunt and arcade skill bonuses in a single sortie.',
    category: 'barnstorming',
    tier: 'gold',
    icon: 'Sparkles',
    maxProgress: 400,
    rewardCash: 500,
  },

  // 3. Emergency & Hazard Ops
  {
    id: 'wildfire_first',
    title: 'First Responder',
    subtitle: 'Smokejumper Certification',
    description: 'Complete an Aerial Firefighting emergency contract at the Cedar River.',
    category: 'emergency',
    tier: 'silver',
    icon: 'Flame',
    maxProgress: 1,
    rewardCash: 250,
  },
  {
    id: 'river_scooper',
    title: 'Water Bomber',
    subtitle: 'Cedar River Low Skim',
    description: 'Scoop water from the Cedar River 3 times to replenish your retardant tank.',
    category: 'emergency',
    tier: 'gold',
    icon: 'Droplets',
    maxProgress: 3,
    rewardCash: 500,
  },
  {
    id: 'blaze_speedrun',
    title: 'Flash Flood',
    subtitle: 'Rapid Wildfire Suppression',
    description: 'Achieve 100% containment on the Cedar Valley Timber Blaze in under 2 minutes.',
    category: 'emergency',
    tier: 'legendary',
    icon: 'Zap',
    maxProgress: 1,
    rewardCash: 1000,
  },
  {
    id: 'storm_chaser',
    title: 'Gale Force Navigator',
    subtitle: 'Severe Weather Sortie',
    description: 'Successfully complete a contract in heavy crosswinds or rain storms.',
    category: 'emergency',
    tier: 'gold',
    icon: 'CloudLightning',
    maxProgress: 1,
    rewardCash: 500,
  },
  {
    id: 'night_owl',
    title: 'Midnight Hopper',
    subtitle: 'Night Flight Qualification',
    description: 'Complete a contract or practice sortie under moonlight and starry skies.',
    category: 'emergency',
    tier: 'bronze',
    icon: 'Moon',
    maxProgress: 1,
    rewardCash: 100,
  },

  // 4. Rally & Formation
  {
    id: 'rally_demon',
    title: 'County Pylon Ace',
    subtitle: 'Cedar Valley Air Rally',
    description: 'Complete the 10-gate Air Rally course without missing a single gate.',
    category: 'rally',
    tier: 'silver',
    icon: 'Flag',
    maxProgress: 1,
    rewardCash: 250,
  },
  {
    id: 'tandem_wingman',
    title: 'Velcro Wingman',
    subtitle: 'Tight Formation Flying',
    description: 'Maintain close formation flying with your AI partner for 25 seconds.',
    category: 'rally',
    tier: 'silver',
    icon: 'Users',
    maxProgress: 25,
    rewardCash: 250,
  },
  {
    id: 'dust_off_champ',
    title: 'Head-to-Head Victor',
    subtitle: 'Sprayer Duel Mastery',
    description: 'Out-spray and defeat the rival AI pilot in a Dust-Off field match.',
    category: 'rally',
    tier: 'silver',
    icon: 'Award',
    maxProgress: 1,
    rewardCash: 250,
  },

  // 5. Skywriting & Artistry
  {
    id: 'skywriter_artist',
    title: 'Penman of the Plains',
    subtitle: 'Aerial Calligraphy',
    description: 'Score 92% or higher accuracy on a Skywriting demonstration contract.',
    category: 'skywriting',
    tier: 'silver',
    icon: 'PenTool',
    maxProgress: 1,
    rewardCash: 250,
  },

  // 6. Career & Airframe Mastery
  {
    id: 'ground_effect_glide',
    title: 'Ground Cushion',
    subtitle: 'Wing-in-Ground Skimmer',
    description: 'Ride the low-deck ground effect cushion (<6.2m AGL) for 10 cumulative seconds.',
    category: 'career',
    tier: 'bronze',
    icon: 'Wind',
    maxProgress: 10,
    rewardCash: 100,
  },
  {
    id: 'sound_barrier',
    title: 'Terminal Dive',
    subtitle: 'Maximum Airspeed Velocity',
    description: 'Exceed 48 m/s (107 mph) in a steep power dive.',
    category: 'career',
    tier: 'bronze',
    icon: 'Gauge',
    maxProgress: 1,
    rewardCash: 100,
  },
  {
    id: 'recorder_reel',
    title: 'Hollywood Pilot',
    subtitle: 'Flight Recorder Director',
    description: 'Record a flight video clip using the in-game HD video recorder.',
    category: 'career',
    tier: 'bronze',
    icon: 'Video',
    maxProgress: 1,
    rewardCash: 100,
  },
  {
    id: 'camera_connoisseur',
    title: 'All Angles',
    subtitle: 'Avionics & External Perspectives',
    description: 'Cycle through all 4 flight camera perspectives (Chase, Cockpit, Wingtip, Flyby).',
    category: 'career',
    tier: 'bronze',
    icon: 'Camera',
    maxProgress: 4,
    rewardCash: 100,
  },
  {
    id: 'fleet_upgraded',
    title: 'Tuned Airframe',
    subtitle: 'Aviation Mechanics Guild',
    description: 'Purchase any Level 3 upgrade for your aircraft in the Hangar.',
    category: 'career',
    tier: 'gold',
    icon: 'Wrench',
    maxProgress: 1,
    rewardCash: 500,
  },
  {
    id: 'three_upgrades_max',
    title: 'Top Tier Ag-Cat',
    subtitle: 'Maximized Specifications',
    description: 'Fully upgrade Tank, Boom, and Stability to Level 3 in the Hangar.',
    category: 'career',
    tier: 'legendary',
    icon: 'Crown',
    maxProgress: 3,
    rewardCash: 1000,
  },
  {
    id: 'ten_contracts',
    title: 'County Veteran',
    subtitle: 'Seasoned Agricultural Aviator',
    description: 'Successfully complete 10 flight contracts.',
    category: 'career',
    tier: 'silver',
    icon: 'Medal',
    maxProgress: 10,
    rewardCash: 250,
  },
  {
    id: 'century_club',
    title: 'Centurion Aviator',
    subtitle: 'Logbook Milestone',
    description: 'Log 25 total sorties in your career logbook.',
    category: 'career',
    tier: 'gold',
    icon: 'BookOpen',
    maxProgress: 25,
    rewardCash: 500,
  },
  {
    id: 'prairie_millionaire',
    title: 'High Roller',
    subtitle: 'Commercial Ag Tycoon',
    description: 'Accumulate $5,000 in total career earnings.',
    category: 'career',
    tier: 'legendary',
    icon: 'DollarSign',
    maxProgress: 5000,
    rewardCash: 1000,
  },
  {
    id: 'hall_of_famer',
    title: 'Living Legend',
    subtitle: 'Prairie Aviation Hall of Fame',
    description: 'Hold the #1 all-time record in at least 2 Hall of Fame categories simultaneously.',
    category: 'career',
    tier: 'legendary',
    icon: 'Trophy',
    maxProgress: 2,
    rewardCash: 1500,
  },
] as const;

export const INITIAL_HALL_OF_FAME: readonly HallOfFameRecord[] = [
  {
    id: 'single_flight_earnings',
    title: 'Single Sortie Haul',
    metric: 'Max Earnings',
    unit: '$',
    icon: 'DollarSign',
    description: 'Highest total payout earned from a single completed contract including all bonuses.',
    legendHolder: 'Mae "Crosswind" Hansen',
    legendValue: 3450,
    legendAircraft: '1976 Piper Pawnee 235',
    legendDate: 'August 14, 1982',
    higherIsBetter: true,
  },
  {
    id: 'lowest_deck_skim',
    title: 'Grass-Cutter Altitude',
    metric: 'Lowest Deck Skim',
    unit: 'm AGL',
    icon: 'ArrowDown',
    description: 'Lowest sustained crop skimming altitude flown above ground level without a strike.',
    legendHolder: 'Dusty "Low-Pass" McCall',
    legendValue: 3.2,
    legendAircraft: '1968 Cessna 188 AgWagon',
    legendDate: 'July 22, 1974',
    higherIsBetter: false,
  },
  {
    id: 'highest_precision',
    title: 'Surgical Field Precision',
    metric: 'Coverage Accuracy',
    unit: '%',
    icon: 'ShieldCheck',
    description: 'Highest percentage of target field spray coverage with minimal overspray.',
    legendHolder: 'Doc Eldon Vance',
    legendValue: 99.4,
    legendAircraft: '1979 Grumman Ag-Cat B',
    legendDate: 'June 5, 1988',
    higherIsBetter: true,
  },
  {
    id: 'wildfire_containment_speed',
    title: 'Cedar Timber Blaze Speed',
    metric: 'Containment Time',
    unit: 's',
    icon: 'Flame',
    description: 'Fastest clock time to reach 100% wildfire containment in Aerial Firefighting.',
    legendHolder: 'Cap\'n Red O\'Leary',
    legendValue: 118,
    legendAircraft: 'Air Tractor AT-802F Fire Boss',
    legendDate: 'September 3, 1994',
    higherIsBetter: false,
  },
  {
    id: 'rally_pylon_speed',
    title: 'Cedar Valley Rally Lap',
    metric: 'Course Time',
    unit: 's',
    icon: 'Flag',
    description: 'Fastest elapsed time to navigate the 10-gate County Air Rally course.',
    legendHolder: 'Jimmy "Streak" Calhoun',
    legendValue: 74,
    legendAircraft: 'Pitts S-2B Special',
    legendDate: 'October 11, 2001',
    higherIsBetter: false,
  },
  {
    id: 'sortie_stunt_chain',
    title: 'Barnstormer Sortie Chain',
    metric: 'Stunts in One Flight',
    unit: 'stunts',
    icon: 'Sparkles',
    description: 'Most near misses, wire skims, bridge runs, and acrobatic ag-turns landed in one sortie.',
    legendHolder: 'Hap Lindley',
    legendValue: 8,
    legendAircraft: '1942 Boeing-Stearman Model 75',
    legendDate: 'July 4, 1969',
    higherIsBetter: true,
  },
  {
    id: 'skywriting_accuracy',
    title: 'Aerial Calligraphy Score',
    metric: 'Skywriting Quality',
    unit: '%',
    icon: 'PenTool',
    description: 'Highest evaluated letter glyph accuracy and smoke continuity in skywriting.',
    legendHolder: 'Clara "Sky-Pen" Lind',
    legendValue: 96.8,
    legendAircraft: 'Super Decathlon 8KCAB',
    legendDate: 'September 18, 1985',
    higherIsBetter: true,
  },
  {
    id: 'endurance_sortie',
    title: 'Cross-County Endurance',
    metric: 'Continuous Airborne Time',
    unit: 'min',
    icon: 'Clock',
    description: 'Longest continuous airborne sortie completed without crashing or running dry.',
    legendHolder: 'Otis "Iron-Tank" Miller',
    legendValue: 12.5,
    legendAircraft: 'Piper PA-25-260 Pawnee',
    legendDate: 'May 29, 1978',
    higherIsBetter: true,
  },
] as const;

export type UnlockListener = (achievement: AchievementDef, bonusCash: number) => void;
export type RecordListener = (record: HallOfFameRecord, isNewAllTime: boolean) => void;

export class AchievementManager {
  private states = new Map<string, AchievementState>();
  private records = new Map<string, HallOfFameRecord>();
  private unlockListeners = new Set<UnlockListener>();
  private recordListeners = new Set<RecordListener>();
  private camerasVisited = new Set<number>();

  constructor() {
    this.initialize();
  }

  private initialize() {
    for (const def of ACHIEVEMENTS) {
      this.states.set(def.id, {
        id: def.id,
        progress: 0,
        unlocked: false,
      });
    }
    for (const rec of INITIAL_HALL_OF_FAME) {
      this.records.set(rec.id, { ...rec });
    }
    this.loadFromStorage();
  }

  onUnlock(listener: UnlockListener): () => void {
    this.unlockListeners.add(listener);
    return () => this.unlockListeners.delete(listener);
  }

  onRecord(listener: RecordListener): () => void {
    this.recordListeners.add(listener);
    return () => this.recordListeners.delete(listener);
  }

  getState(id: string): AchievementState | undefined {
    return this.states.get(id);
  }

  getAllStates(): AchievementState[] {
    return Array.from(this.states.values());
  }

  getDef(id: string): AchievementDef | undefined {
    return ACHIEVEMENTS.find((a) => a.id === id);
  }

  getAllDefs(): readonly AchievementDef[] {
    return ACHIEVEMENTS;
  }

  getAllRecords(): HallOfFameRecord[] {
    return Array.from(this.records.values());
  }

  getRecord(id: string): HallOfFameRecord | undefined {
    return this.records.get(id);
  }

  get unlockedCount(): number {
    let count = 0;
    for (const s of this.states.values()) {
      if (s.unlocked) count++;
    }
    return count;
  }

  get totalCashClaimed(): number {
    let sum = 0;
    for (const s of this.states.values()) {
      if (s.unlocked && s.claimedCash) {
        const def = this.getDef(s.id);
        if (def) sum += def.rewardCash;
      }
    }
    return sum;
  }

  get recordsHeldCount(): number {
    let count = 0;
    for (const r of this.records.values()) {
      if (r.playerValue !== undefined) {
        const beats = r.higherIsBetter
          ? r.playerValue > r.legendValue
          : r.playerValue < r.legendValue;
        if (beats) count++;
      }
    }
    return count;
  }

  /**
   * Add progress to an achievement and unlock it if target reached.
   * Returns potential cash reward if newly unlocked.
   */
  addProgress(id: string, amount: number): number {
    const def = this.getDef(id);
    const state = this.states.get(id);
    if (!def || !state || state.unlocked) return 0;

    state.progress = Math.min(def.maxProgress, state.progress + amount);
    if (state.progress >= def.maxProgress) {
      return this.unlock(id);
    }
    this.saveToStorage();
    return 0;
  }

  /**
   * Set absolute progress value on an achievement (e.g. max earnings).
   */
  setProgress(id: string, value: number): number {
    const def = this.getDef(id);
    const state = this.states.get(id);
    if (!def || !state || state.unlocked) return 0;

    state.progress = Math.max(state.progress, Math.min(def.maxProgress, value));
    if (state.progress >= def.maxProgress) {
      return this.unlock(id);
    }
    this.saveToStorage();
    return 0;
  }

  /**
   * Immediately unlock an achievement and trigger listeners.
   */
  unlock(id: string): number {
    const def = this.getDef(id);
    const state = this.states.get(id);
    if (!def || !state || state.unlocked) return 0;

    state.unlocked = true;
    state.progress = def.maxProgress;
    state.unlockedAt = new Date().toISOString();
    state.claimedCash = false;

    this.saveToStorage();
    for (const listener of this.unlockListeners) {
      try {
        listener(def, def.rewardCash);
      } catch (err) {
        console.error('Error in achievement unlock listener:', err);
      }
    }

    // Check meta-achievement "Living Legend"
    if (id !== 'hall_of_famer') {
      this.setProgress('hall_of_famer', this.recordsHeldCount);
    }

    return def.rewardCash;
  }

  get unclaimedCash(): number {
    let sum = 0;
    for (const s of this.states.values()) {
      if (s.unlocked && !s.claimedCash) {
        const def = this.getDef(s.id);
        if (def) sum += def.rewardCash;
      }
    }
    return sum;
  }

  claimReward(id: string, career?: Career): number {
    const def = this.getDef(id);
    const state = this.states.get(id);
    if (!def || !state || !state.unlocked || state.claimedCash) return 0;

    state.claimedCash = true;
    if (career) {
      career.cash += def.rewardCash;
      career.totalEarned += def.rewardCash;
    }
    this.saveToStorage();
    return def.rewardCash;
  }

  claimAllRewards(career?: Career): number {
    let total = 0;
    for (const state of this.states.values()) {
      if (state.unlocked && !state.claimedCash) {
        const def = this.getDef(state.id);
        if (def) {
          state.claimedCash = true;
          total += def.rewardCash;
          if (career) {
            career.cash += def.rewardCash;
            career.totalEarned += def.rewardCash;
          }
        }
      }
    }
    if (total > 0) {
      this.saveToStorage();
    }
    return total;
  }

  recordCameraVisit(mode: number) {
    this.camerasVisited.add(mode);
    this.setProgress('camera_connoisseur', this.camerasVisited.size);
  }

  /**
   * Evaluates candidate value for a Hall of Fame record.
   * Updates personal best and all-time record, notifying listeners if an all-time record is set.
   */
  submitRecord(
    recordId: string,
    value: number,
    aircraft = 'Standard Ag-Cat'
  ): boolean {
    const rec = this.records.get(recordId);
    if (!rec) return false;

    const isNewPersonalBest =
      rec.playerValue === undefined ||
      (rec.higherIsBetter ? value > rec.playerValue : value < rec.playerValue);

    if (!isNewPersonalBest) return false;

    const isNewAllTime = rec.higherIsBetter
      ? value > rec.legendValue
      : value < rec.legendValue;

    rec.playerValue = Number(value.toFixed(1));
    rec.playerDate = new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    rec.playerAircraft = aircraft;

    this.saveToStorage();

    for (const listener of this.recordListeners) {
      try {
        listener(rec, isNewAllTime);
      } catch (err) {
        console.error('Error in Hall of Fame listener:', err);
      }
    }

    // Update Hall of Famer meta achievement
    this.setProgress('hall_of_famer', this.recordsHeldCount);
    return true;
  }

  /**
   * Evaluate simulation state at the end of a completed or crashed flight.
   */
  evaluateFlightEnd(sim: Simulation): number {
    let totalCashAwarded = 0;
    const career = sim.career;
    const isCompleted = sim.phase === 'complete';

    if (isCompleted) {
      totalCashAwarded += this.unlock('first_solo');
      totalCashAwarded += this.setProgress('ten_contracts', career.completed.length);
      totalCashAwarded += this.setProgress('century_club', career.flights);
      totalCashAwarded += this.setProgress('prairie_millionaire', career.totalEarned);

      // Check Zero Drift
      if (sim.job.kind === 'spray' || !sim.job.kind) {
        if (sim.result.penalty === 0 && sim.result.coverage >= sim.job.target) {
          totalCashAwarded += this.unlock('zero_drift');
        }
      }

      // Check Stunt Master
      const totalStunts = (sim.result.stuntBonus ?? 0) + (sim.bankedStuntBonus ?? 0);
      if (totalStunts >= 400) {
        totalCashAwarded += this.setProgress('stunt_master', totalStunts);
      }

      // Check Single Flight Hall of Fame
      if (sim.result.total > 0) {
        this.submitRecord('single_flight_earnings', sim.result.total, 'Ag-Cat Sprayer');
      }

      // Check Precision Hall of Fame
      if (sim.result.coverage > 0) {
        this.submitRecord('highest_precision', sim.result.coverage, 'Ag-Cat Sprayer');
      }

      // Check Weather / Night
      if ((sim.weather?.windMps ?? 0) > 6 || (sim.weather?.rain ?? 0) > 0.4) {
        totalCashAwarded += this.unlock('storm_chaser');
      }
      if ((sim.weather?.sunlight ?? 3) < 0.6 || (sim.weather?.label?.toLowerCase().includes('night') ?? false)) {
        totalCashAwarded += this.unlock('night_owl');
      }

      // Check Skywriting
      if (sim.isSkywriting && sim.coverage >= 92) {
        totalCashAwarded += this.unlock('skywriter_artist');
        this.submitRecord('skywriting_accuracy', sim.coverage, 'Skywriter Decathlon');
      }

      // Check Rally
      if (sim.isRally && sim.rallyState?.completed) {
        totalCashAwarded += this.unlock('rally_demon');
        const lapTime = sim.rallyState.finalTime || sim.rallyState.elapsed;
        if (lapTime > 0) {
          this.submitRecord('rally_pylon_speed', lapTime, 'Rally Racer');
        }
      }

      // Check Dust-Off
      if (sim.isDustOff && (sim.result.bonus ?? 0) > 0) {
        totalCashAwarded += this.unlock('dust_off_champ');
      }

      // Check Firefighting
      if (sim.isFirefighting && sim.firefightingState?.completed) {
        totalCashAwarded += this.unlock('wildfire_first');
        const containmentTime = sim.firefightingState.elapsed;
        if (containmentTime <= 120) {
          totalCashAwarded += this.unlock('blaze_speedrun');
        }
        if (containmentTime > 0) {
          this.submitRecord('wildfire_containment_speed', containmentTime, 'AT-802F Air Tanker');
        }
      }

      // Check Flight Endurance
      const flightMinutes = sim.elapsed / 60;
      if (flightMinutes >= 1.0) {
        this.submitRecord('endurance_sortie', flightMinutes, 'Ag-Cat Sprayer');
      }
    }

    return totalCashAwarded;
  }

  evaluateUpgrades(career: Career): number {
    let totalCashAwarded = 0;
    const { tank, boom, stability } = career.upgrades;
    if (tank >= 3 || boom >= 3 || stability >= 3) {
      totalCashAwarded += this.unlock('fleet_upgraded');
    }
    const maxedCount = (tank === 3 ? 1 : 0) + (boom === 3 ? 1 : 0) + (stability === 3 ? 1 : 0);
    totalCashAwarded += this.setProgress('three_upgrades_max', maxedCount);
    return totalCashAwarded;
  }

  loadFromStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const savedAchievements = window.localStorage.getItem('prairie-air-achievements-v1');
      if (savedAchievements) {
        const parsed: Record<string, AchievementState> = JSON.parse(savedAchievements);
        for (const [id, state] of Object.entries(parsed)) {
          const current = this.states.get(id);
          if (current) {
            current.progress = state.progress;
            current.unlocked = state.unlocked;
            current.unlockedAt = state.unlockedAt;
            current.claimedCash = state.claimedCash;
          }
        }
      }

      const savedRecords = window.localStorage.getItem('prairie-air-hall-of-fame-v1');
      if (savedRecords) {
        const parsed: Record<string, Partial<HallOfFameRecord>> = JSON.parse(savedRecords);
        for (const [id, data] of Object.entries(parsed)) {
          const rec = this.records.get(id);
          if (rec) {
            if (data.playerValue !== undefined) rec.playerValue = data.playerValue;
            if (data.playerDate !== undefined) rec.playerDate = data.playerDate;
            if (data.playerAircraft !== undefined) rec.playerAircraft = data.playerAircraft;
          }
        }
      }
    } catch (err) {
      console.warn('Failed to parse saved achievements / Hall of Fame:', err);
    }
  }

  saveToStorage() {
    if (typeof window === 'undefined' || !window.localStorage) return;

    try {
      const achObj: Record<string, AchievementState> = {};
      for (const [id, state] of this.states.entries()) {
        achObj[id] = state;
      }
      window.localStorage.setItem('prairie-air-achievements-v1', JSON.stringify(achObj));

      const recObj: Record<string, Partial<HallOfFameRecord>> = {};
      for (const [id, rec] of this.records.entries()) {
        if (rec.playerValue !== undefined) {
          recObj[id] = {
            playerValue: rec.playerValue,
            playerDate: rec.playerDate,
            playerAircraft: rec.playerAircraft,
          };
        }
      }
      window.localStorage.setItem('prairie-air-hall-of-fame-v1', JSON.stringify(recObj));
    } catch (err) {
      console.warn('Failed to save achievements / Hall of Fame:', err);
    }
  }
}

// Global singleton instance for easy cross-module access
export const achievementManager = new AchievementManager();
