'use client';

import { useSyncExternalStore } from 'react';
import {
  ArrowUpRight,
  Check,
  Crosshair,
  Droplets,
  Sprout,
  Wind,
  Wrench,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { availableCash, upgradePrice, type Career } from '@/lib/simulation';
import {
  upgradeGoal,
  upgradeKeys,
  upgradeNames,
  upgradeStat,
  type RivalRace,
  type UpgradeKey,
} from '@/lib/progression';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
type Preferences = { goal: UpgradeKey | null; rival: string | null };
const volatilePreferences = new Map<string, string>();
const preferenceEvent = 'prairie-air-goals-changed';
const subscribePreferences = (notify: () => void) => {
  window.addEventListener('storage', notify);
  window.addEventListener(preferenceEvent, notify);
  return () => {
    window.removeEventListener('storage', notify);
    window.removeEventListener(preferenceEvent, notify);
  };
};
const emptyPreferences = () => '{}';
export function useCareerPreferences(scope: string) {
  const key = `prairie-air-goals-v1:${scope}`;
  const raw = useSyncExternalStore(
    subscribePreferences,
    () => {
      if (volatilePreferences.has(key)) return volatilePreferences.get(key)!;
      try {
        return localStorage.getItem(key) ?? '{}';
      } catch {
        return '{}';
      }
    },
    emptyPreferences,
  );
  let value: Partial<Preferences> = {};
  try {
    value = JSON.parse(raw) ?? {};
  } catch {
    /* Invalid saved preferences use the default goals. */
  }
  const current: Preferences = {
    goal: upgradeKeys.includes(value.goal as UpgradeKey) ? value.goal! : null,
    rival: typeof value.rival === 'string' ? value.rival : null,
  };
  const update = (patch: Partial<Preferences>) => {
    const next = JSON.stringify({ ...current, ...patch });
    try {
      localStorage.setItem(key, next);
      volatilePreferences.delete(key);
    } catch {
      volatilePreferences.set(key, next);
    }
    window.dispatchEvent(new Event(preferenceEvent));
  };
  return {
    ...current,
    setGoal: (goal: UpgradeKey) => update({ goal }),
    setRival: (rival: string | null) => update({ rival }),
  };
}

export function UpgradeGoal({
  career,
  preferred,
  onHangar,
  payout = 0,
  compact = false,
}: {
  career: Career;
  preferred: UpgradeKey | null;
  onHangar: () => void;
  payout?: number;
  compact?: boolean;
}) {
  const goal = upgradeGoal(career, preferred);
  if (!goal)
    return (
      <div className="career-maxed">
        <Check size={15} /> Aircraft fully upgraded. Fly for precision and
        county rank.
      </div>
    );
  return (
    <button
      className={`career-goal ${compact ? 'goal-compact' : ''}`}
      onClick={onHangar}
    >
      <span className="goal-heading">
        <Wrench size={14} /> {goal.remaining ? 'NEXT UPGRADE' : 'UPGRADE READY'}{' '}
        <ArrowUpRight size={14} />
      </span>
      <strong>
        {goal.name} <span>Lv {goal.level + 1}</span>
      </strong>
      {!compact && (
        <span className="goal-stat">
          {goal.current} → {goal.next}
        </span>
      )}
      <Progress value={goal.progress} aria-label={`${goal.name} savings`} />
      <span>
        {goal.remaining === 0
          ? `Install for ${money(goal.price)}`
          : payout >= goal.remaining
            ? 'This finish can fund it · keep the spray clean'
            : `${money(goal.remaining)} to go${payout > 0 ? ` · ${money(Math.max(0, goal.remaining - payout))} after this finish` : ''}`}
      </span>
    </button>
  );
}

export function RivalGoal({
  race,
  onStandings,
  payout = 0,
  compact = false,
}: {
  race: RivalRace;
  onStandings: () => void;
  payout?: number;
  compact?: boolean;
}) {
  return (
    <button
      className={`rival-goal ${compact ? 'goal-compact' : ''}`}
      onClick={onStandings}
    >
      <span className="goal-heading">
        <Crosshair size={14} />{' '}
        {race?.ahead ? 'DEFEND YOUR LEAD' : 'PILOT TO BEAT'}{' '}
        <ArrowUpRight size={14} />
      </span>
      {race ? (
        <>
          <strong>
            {race.rival.callsign} <span>#{race.rivalRank}</span>
          </strong>
          <span>
            {race.gap === null
              ? 'Your pilot is outside the current top 50'
              : race.ahead
                ? race.gap === 0
                  ? 'Earnings tied · you hold the higher rank'
                  : `You lead by ${money(-race.gap)}`
                : race.gap === 0
                  ? `Earnings tied · earn $1 more to pass`
                  : `${money(race.toPass ?? 0)} to overtake`}
          </span>
          {!compact && (
            <small>
              {race.rank
                ? `Your county rank: #${race.rank}. `
                : 'Finish a job to get ranked. '}
              {!race.ahead && race.toPass !== null && payout >= race.toPass
                ? 'This contract can put you ahead if their score holds.'
                : 'Earnings stay on the board when you buy upgrades.'}
            </small>
          )}
        </>
      ) : (
        <>
          <strong>Choose a rival</strong>
          <span>Find a friend’s callsign on the county board.</span>
        </>
      )}
    </button>
  );
}

export function Hangar({
  career,
  preferred,
  select,
  buy,
  pending,
  publicCareer,
  canBuy,
  sessionOnly = false,
  forecastTier = 0,
}: {
  career: Career;
  preferred: UpgradeKey | null;
  select: (key: UpgradeKey) => void;
  buy: (key: UpgradeKey) => void;
  pending: boolean;
  publicCareer: boolean;
  canBuy: boolean;
  sessionOnly?: boolean;
  forecastTier?: number;
}) {
  const selected = upgradeGoal(career, preferred);
  const funds = availableCash(career);
  const reserved = career.cash - funds;
  const icons = { tank: Droplets, boom: Sprout, stability: Wind };
  return (
    <div className="career-hangar">
      <p className="hangar-strategy">
        Build for the way you fly. A wider boom earns faster coverage, but needs
        more room at field edges. Stabilizers make the later season’s gusts
        easier to handle.
      </p>
      <p className="hangar-strategy">
        {forecastTier >= 2
          ? 'Next-pass pick: a wind stabilizer helps with the stronger fronts and bird-strike recovery at this career stage.'
          : 'Next-pass pick: a wider boom shortens clean jobs; a larger tank leaves more room to practice your approach.'}
      </p>
      <p className="workshop-tab">
        Maintenance and repairs are deducted from contract pay.{' '}
        {reserved > 0
          ? `${money(reserved)} of your cash is reserved for the workshop. `
          : ''}
        <b>{money(funds)}</b> available for upgrades. Emergency repairs go on
        the tab so you can keep working.
      </p>
      <div className="hangar-upgrades">
        {upgradeKeys.map((key) => {
          const level = career.upgrades[key],
            price = upgradePrice(key, level),
            maxed = level >= 3;
          const Icon = icons[key];
          return (
            <article
              className={`hangar-upgrade ${selected?.key === key ? 'upgrade-selected' : ''}`}
              key={key}
            >
              <div className="upgrade-heading">
                <Icon size={23} />
                <span>LEVEL {level} / 3</span>
                {maxed && <Check size={17} />}
              </div>
              <h3>{upgradeNames[key]}</h3>
              <div className="upgrade-stats">
                <span>{upgradeStat(key, level)}</span>
                {!maxed && (
                  <>
                    <ArrowUpRight size={15} />
                    <strong>{upgradeStat(key, level + 1)}</strong>
                  </>
                )}
              </div>
              <p>
                {key === 'tank'
                  ? '40 extra units each level. Longer runs between refills.'
                  : key === 'boom'
                    ? '18 m wider each level. Fewer passes; watch your outer tips.'
                    : 'Reduces gust buffeting, crosswind drift, bird-strike kick and tornado pull. It does not make the aircraft storm-proof.'}
              </p>
              {!maxed && (
                <>
                  <Progress
                    value={Math.min(100, (funds / price) * 100)}
                    aria-label={`${upgradeNames[key]} savings`}
                  />
                  <small>
                    {funds >= price
                      ? `${money(funds - price)} left after installing`
                      : `${money(price - funds)} more to unlock`}
                  </small>
                </>
              )}
              <button
                className="primary"
                disabled={maxed || pending || !canBuy || funds < price}
                onClick={() => buy(key)}
              >
                {maxed ? 'Fully upgraded' : `Install · ${money(price)}`}
                {!maxed && <Wrench size={14} />}
              </button>
              {!maxed && (
                <button
                  className="goal-select"
                  aria-pressed={selected?.key === key}
                  onClick={() => select(key)}
                >
                  {selected?.key === key ? (
                    <>
                      <Check size={13} /> Your next goal
                    </>
                  ) : (
                    'Set as next goal'
                  )}
                </button>
              )}
            </article>
          );
        })}
      </div>
      <p className="save-note">
        {sessionOnly
          ? 'Preview upgrades and progress last for this session only.'
          : publicCareer
            ? 'Purchases use career cash. Your season earnings and rank never decrease when you upgrade. Gear carries into the next season.'
            : 'Practice upgrades and goals are saved in this browser, separately from your public pilot.'}
        {!canBuy && publicCareer
          ? ' Join the county with your pilot to install upgrades.'
          : ''}
      </p>
    </div>
  );
}
