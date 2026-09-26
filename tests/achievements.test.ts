import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AchievementManager,
  achievementManager,
  ACHIEVEMENTS,
  INITIAL_HALL_OF_FAME,
} from '../lib/achievements';
import {
  freshCareer,
  Simulation,
  contracts,
  fieldCellCount,
} from '../lib/simulation';

void test('all 29 achievement definitions have valid metadata and targets', () => {
  assert.equal(ACHIEVEMENTS.length, 29);
  const ids = new Set<string>();
  for (const def of ACHIEVEMENTS) {
    assert.ok(def.id.length > 0);
    assert.ok(!ids.has(def.id), `Duplicate achievement ID: ${def.id}`);
    ids.add(def.id);
    assert.ok(def.title.length > 0);
    assert.ok(def.description.length > 0);
    assert.ok(def.maxProgress > 0);
    assert.ok(def.rewardCash >= 100);
    assert.ok(['bronze', 'silver', 'gold', 'legendary'].includes(def.tier));
    assert.ok(
      [
        'precision',
        'barnstorming',
        'emergency',
        'rally',
        'skywriting',
        'career',
      ].includes(def.category)
    );
  }
});

void test('all 8 Hall of Fame records have pioneer legend benchmarks', () => {
  assert.equal(INITIAL_HALL_OF_FAME.length, 8);
  const ids = new Set<string>();
  for (const rec of INITIAL_HALL_OF_FAME) {
    assert.ok(rec.id.length > 0);
    assert.ok(!ids.has(rec.id), `Duplicate record ID: ${rec.id}`);
    ids.add(rec.id);
    assert.ok(rec.title.length > 0);
    assert.ok(rec.legendHolder.length > 0);
    assert.ok(rec.legendAircraft.length > 0);
    assert.ok(rec.legendDate.length > 0);
    assert.ok(rec.legendValue > 0);
  }
});

void test('progress accumulates, unlocks at threshold, and awards pilot career cash upon claim', () => {
  const manager = new AchievementManager();
  const career = freshCareer();
  career.cash = 500;
  career.totalEarned = 500;

  let unlockedDefTitle = '';
  let unlockedBonus = 0;
  manager.onUnlock((def, bonus) => {
    unlockedDefTitle = def.title;
    unlockedBonus = bonus;
  });

  // Test incremental progress on swath_master (target: 15)
  const cash1 = manager.addProgress('swath_master', 5);
  assert.equal(cash1, 0);
  assert.equal(manager.getState('swath_master')?.progress, 5);
  assert.equal(manager.getState('swath_master')?.unlocked, false);
  assert.equal(career.cash, 500);

  const cash2 = manager.addProgress('swath_master', 10);
  assert.equal(cash2, 100); // bronze award
  assert.equal(manager.getState('swath_master')?.unlocked, true);
  assert.equal(manager.getState('swath_master')?.claimedCash, false);
  assert.equal(unlockedDefTitle, 'Laser Straight');
  assert.equal(unlockedBonus, 100);
  assert.equal(career.cash, 500); // Unclaimed until claimReward is called!
  assert.equal(manager.unclaimedCash, 100);

  // Claim reward explicitly
  const claimed = manager.claimReward('swath_master', career);
  assert.equal(claimed, 100);
  assert.equal(career.cash, 600);
  assert.equal(career.totalEarned, 600);
  assert.equal(manager.getState('swath_master')?.claimedCash, true);
  assert.equal(manager.unclaimedCash, 0);

  // Subsequent claim does not re-award cash
  const claimedAgain = manager.claimReward('swath_master', career);
  assert.equal(claimedAgain, 0);
  assert.equal(career.cash, 600);
});

void test('Hall of Fame record submissions track personal bests and beat pioneer records', () => {
  const manager = new AchievementManager();

  let listenerRecordId = '';
  let listenerAllTime = false;
  manager.onRecord((rec, isNewAllTime) => {
    listenerRecordId = rec.id;
    listenerAllTime = isNewAllTime;
  });

  // Submit earnings lower than Mae Hansen ($3,450)
  const submitted1 = manager.submitRecord('single_flight_earnings', 2200, 'Pawnee');
  assert.equal(submitted1, true);
  assert.equal(listenerRecordId, 'single_flight_earnings');
  assert.equal(listenerAllTime, false);
  assert.equal(manager.getRecord('single_flight_earnings')?.playerValue, 2200);

  // Submit lower earnings (should NOT replace personal best)
  const submitted2 = manager.submitRecord('single_flight_earnings', 1800, 'Pawnee');
  assert.equal(submitted2, false);
  assert.equal(manager.getRecord('single_flight_earnings')?.playerValue, 2200);

  // Submit record that beats Mae Hansen ($3,450)
  const submitted3 = manager.submitRecord('single_flight_earnings', 3800, 'Ag-Cat Turbo');
  assert.equal(submitted3, true);
  assert.equal(listenerAllTime, true);
  assert.equal(manager.getRecord('single_flight_earnings')?.playerValue, 3800);

  // Submit lowest deck skim (lower is better: Dusty McCall has 3.2m)
  const submittedSkim = manager.submitRecord('lowest_deck_skim', 2.8, 'Crop Duster');
  assert.equal(submittedSkim, true);
  assert.equal(listenerAllTime, true);
  assert.equal(manager.getRecord('lowest_deck_skim')?.playerValue, 2.8);

  // Holding 2 records should advance the 'Living Legend' achievement
  assert.equal(manager.recordsHeldCount, 2);
  assert.equal(manager.getState('hall_of_famer')?.unlocked, true);
});

void test('simulation finish evaluates flight completion achievements and Hall of Fame records', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  for (let i = 0; i < fieldCellCount(sim.job); i++) sim.covered.add(i);

  assert.equal(sim.finish(), true);
  assert.equal(sim.phase, 'complete');

  // Verify first solo was unlocked and single flight haul record logged on singleton
  assert.equal(achievementManager.getState('first_solo')?.unlocked, true);
  assert.ok((achievementManager.getRecord('single_flight_earnings')?.playerValue ?? 0) >= 1000);
});

void test('storage round-trip serialization and hydration', () => {
  const store: Record<string, string> = {};
  const mockLocalStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => {
      store[key] = val;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };

  (globalThis as unknown as { window: { localStorage: typeof mockLocalStorage } }).window = {
    localStorage: mockLocalStorage,
  };

  try {
    const manager1 = new AchievementManager();
    manager1.addProgress('deck_skimmer', 20);
    manager1.submitRecord('lowest_deck_skim', 2.5, 'Stearman');

    // Rehydrate fresh manager from the populated storage
    const manager2 = new AchievementManager();
    assert.equal(manager2.getState('deck_skimmer')?.unlocked, true);
    assert.equal(manager2.getRecord('lowest_deck_skim')?.playerValue, 2.5);
    assert.equal(manager2.getRecord('lowest_deck_skim')?.playerAircraft, 'Stearman');
  } finally {
    delete (globalThis as unknown as { window?: unknown }).window;
  }
});
