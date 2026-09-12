import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  freshCareer,
  Simulation,
  contracts,
  fieldCellCount,
} from '../lib/simulation';
import { rivalRace, upgradeGoal, upgradeStat } from '../lib/progression';
import type { Standing } from '../lib/county';

const pilot = (id: string, earnings: number, precision = 95): Standing => ({
  pilot: id,
  callsign: id,
  earnings,
  precision,
  jobs: 1,
  acres: 51,
});

void test('a clean contract funds real equipment; buying does not erase career earnings', () => {
  const sim = new Simulation();
  sim.reset(contracts[0]);
  for (let i = 0; i < fieldCellCount(sim.job); i++) sim.covered.add(i);
  assert.equal(upgradeGoal(sim.career)?.remaining, 600);
  assert.equal(sim.finish(), true);
  assert.equal(sim.result.total, 1250);
  assert.equal(upgradeGoal(sim.career, 'boom')?.remaining, 0);
  assert.equal(sim.buy('boom'), true);
  assert.equal(sim.swath, 76);
  assert.equal(sim.career.cash, 300);
  assert.equal(sim.career.totalEarned, 1250);
  assert.equal(upgradeGoal(sim.career, 'boom')?.remaining, 1600);
});

void test('goals respect selected builds, max levels, affordability, and actual aircraft stats', () => {
  const career = freshCareer();
  career.cash = 750;
  assert.equal(upgradeGoal(career, 'stability')?.remaining, 0);
  career.upgrades.stability = 3;
  assert.equal(upgradeGoal(career, 'stability')?.key, 'tank');
  const sim = new Simulation();
  for (let level = 0; level <= 3; level++) {
    sim.career.upgrades = { tank: level, boom: level, stability: level };
    assert.equal(upgradeStat('tank', level), `${sim.tankCapacity} units`);
    assert.equal(upgradeStat('boom', level), `${sim.swath} m swath`);
  }
  career.upgrades = { tank: 3, boom: 3, stability: 3 };
  assert.equal(upgradeGoal(career), null);
});

void test('rivals preserve official ties, rank, and a pinned friend when the player overtakes them', () => {
  const rows = [
    pilot('leader', 3000),
    pilot('friend', 2100, 96),
    pilot('me', 2100, 94),
  ];
  const race = rivalRace(rows, 'me');
  assert.equal(race?.rival.pilot, 'friend');
  assert.equal(race?.rank, 3);
  assert.equal(race?.ahead, false);
  assert.equal(race?.toPass, 1);
  const passed = rivalRace(
    [rows[0], pilot('me', 2900), rows[1]],
    'me',
    'friend',
  );
  assert.equal(passed?.rival.pilot, 'friend');
  assert.equal(passed?.gap, -800);
  assert.equal(passed?.ahead, true);
  assert.equal(rivalRace(rows, 'leader')?.rival.pilot, 'friend');
});

void test('missing friends and unranked pilots never get invented standings or misleading cash gaps', () => {
  const rows = [pilot('friend', 999.5)];
  assert.equal(rivalRace(rows, 'me')?.rank, null);
  assert.equal(rivalRace(rows, 'me')?.toPass, 1000);
  assert.equal(rivalRace(rows, null), null);
  assert.equal(rivalRace([], 'me'), null);
  assert.equal(rivalRace(rows, 'me', 'missing-friend'), null);
  assert.equal(rivalRace([pilot('me', 10)], 'me', 'me'), null);
  const fullBoard = Array.from({ length: 50 }, (_, i) =>
    pilot(`pilot${i}`, 10000 - i * 50),
  );
  assert.equal(rivalRace(fullBoard, 'outside-top-50')?.toPass, null);
});
