import {
  availableCash,
  upgradePrice,
  type Career,
  type Upgrades,
} from './simulation';
import type { Standing } from './county';

export type UpgradeKey = keyof Upgrades;
export const upgradeKeys: UpgradeKey[] = ['tank', 'boom', 'stability'];
export const upgradeNames = {
  tank: 'Long-range tank',
  boom: 'Wide spray boom',
  stability: 'Wind stabilizer',
};

export function upgradeStat(key: UpgradeKey, level: number) {
  if (key === 'tank') return `${100 + level * 40} units`;
  if (key === 'boom') return `${58 + level * 18} m swath`;
  return `${Math.round((1 - 1 / (1 + level * 0.6)) * 100)}% less drift`;
}

export function upgradeGoal(career: Career, preferred?: UpgradeKey | null) {
  const key =
    preferred && career.upgrades[preferred] < 3
      ? preferred
      : upgradeKeys
          .filter((k) => career.upgrades[k] < 3)
          .sort(
            (a, b) =>
              upgradePrice(a, career.upgrades[a]) -
              upgradePrice(b, career.upgrades[b]),
          )[0];
  if (!key) return null;
  const level = career.upgrades[key];
  const price = upgradePrice(key, level);
  return {
    key,
    level,
    price,
    name: upgradeNames[key],
    remaining: Math.max(0, price - availableCash(career)),
    progress: Math.min(100, Math.max(0, (availableCash(career) / price) * 100)),
    current: upgradeStat(key, level),
    next: upgradeStat(key, level + 1),
  };
}

/** Preserve the server's earnings / precision / pilot-id ordering, including ties. */
export function rivalRace(
  rows: Standing[],
  viewerId: string | null,
  pinned?: string | null,
  playerEarnings?: number,
) {
  if (!viewerId) return null;
  const meIndex = rows.findIndex((row) => row.pilot === viewerId);
  const me = rows[meIndex];
  const pinnedRow = rows.find(
    (row) => row.pilot === pinned && row.pilot !== viewerId,
  );
  const rival =
    pinnedRow ??
    (pinned
      ? null
      : meIndex > 0
        ? rows[meIndex - 1]
        : meIndex === 0
          ? rows.find((row) => row.pilot !== viewerId)
          : rows[rows.length - 1]);
  if (!rival) return null;
  const rivalRank = rows.indexOf(rival) + 1;
  const earnings = me?.earnings ?? (playerEarnings !== undefined ? playerEarnings : rows.length < 50 ? 0 : null);
  const gap = earnings === null ? null : rival.earnings - earnings;
  const ahead = Boolean(me && meIndex < rivalRank - 1);
  return {
    rival,
    rank: me ? meIndex + 1 : null,
    rivalRank,
    earnings,
    gap,
    ahead,
    // Whole dollars beat an earnings tie regardless of the precision tiebreaker.
    toPass: ahead ? 0 : gap === null ? null : Math.max(0, Math.floor(gap) + 1),
    pinned: Boolean(pinnedRow),
  };
}
export type RivalRace = ReturnType<typeof rivalRace>;
