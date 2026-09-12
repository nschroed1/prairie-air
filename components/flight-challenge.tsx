'use client';
import { ShieldAlert, Wrench, Wind } from 'lucide-react';
import { challengeStages, challengeTier, fieldFront } from '@/lib/challenge';
import type { Contract, Simulation } from '@/lib/simulation';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
export function ChallengeBrief({ job }: { job: Contract }) {
  if (!job.challenge) return null;
  const plan = job.challenge,
    stage = challengeStages[plan.tier];
  const lesson = [
    'Practice: finish one straight strip, release spray, then line up the next. Fresh coverage builds your bonus.',
    'Practice: make a dry pass over the barn first. Keep the striped yard clean before attempting the doors.',
    'Practice: spot the moving flock before the pass. Climb above 150 ft or give it room.',
    'Practice: route around the swarm. Watch boom condition; a service stop restores your full swath.',
    'Practice: choose an escape direction before the front arrives. Leave the funnel at least 220 m of room.',
  ][plan.tier];
  return (
    <div className="challenge-brief">
      <strong>
        <Wind size={16} /> {stage.name}{' '}
        <span>
          {plan.dangerPay
            ? `+${money(plan.dangerPay)} danger pay included`
            : 'Gentle introduction'}
        </span>
      </strong>
      <p>
        {stage.description}{' '}
        {plan.tornado
          ? 'Tornado watch on this contract. Listen for the warning before touchdown.'
          : 'Every front builds, passes through, then clears.'}
      </p>
      <p className="challenge-lesson">{lesson}</p>
      <small>
        Striped yards are no-spray areas and do not count toward coverage.
        Maintenance and repairs come out before take-home pay.
      </small>
    </div>
  );
}
export function ChallengeHUD({ sim }: { sim: Simulation }) {
  'use no memo';
  const plan = sim.job.challenge;
  if (!plan) return null;
  const front = fieldFront(sim.job, sim.elapsed),
    warning = sim.warning;
  return (
    <section
      className={`challenge-hud ${warning.danger ? 'challenge-alert' : ''}`}
      aria-label="Aircraft condition and field forecast"
    >
      <div className="challenge-title">
        <ShieldAlert size={15} />
        <b>{challengeStages[plan.tier].name}</b>
        <span>{plan.dangerPay ? `+${money(plan.dangerPay)}` : 'Rookie'}</span>
      </div>
      <p>{warning.text}</p>
      <div
        className="front-stages"
        aria-label={`${front.label}, ${front.remaining} seconds to the next stage`}
      >
        {['Clear', 'Building', 'Storm', 'Clearing'].map((name, i) => (
          <span key={name} className={i === front.stage ? 'current' : ''}>
            {name}
          </span>
        ))}
      </div>
      <div className="aircraft-condition">
        <span>
          Airframe <b>{Math.ceil(sim.integrity)}%</b>
        </span>
        <span>
          Boom <b>{Math.floor(100 - sim.clog)}%</b>
        </span>
      </div>
      <div className="workshop-estimate">
        <Wrench size={14} />
        <span>
          Service estimate <b>{money(sim.serviceDue)}</b>
        </span>
      </div>
      <small>R · refill, repair &amp; return. Bills paid from earnings.</small>
      <div className="flight-bonus-ledger">
        <span>
          Flight bonuses <b>{money(sim.pendingSkillBonus)}</b>
        </span>
        <small>
          Paid on completion ·{' '}
          {money(Math.max(0, sim.skillBonusLimit - sim.result.stuntBonus))} left
          to earn
        </small>
        <small>
          Finish: {sim.cleanBonus ? '$150 clean' : 'clean bonus lost'} ·{' '}
          {sim.speedBonus
            ? `$100 pace (${Math.max(0, Math.ceil(sim.parTime - sim.elapsed))}s)`
            : 'pace window closed'}
        </small>
      </div>
    </section>
  );
}
export function NextChallenge({ flights }: { flights: number }) {
  const tier = challengeTier(flights),
    stage = challengeStages[tier];
  const unlocked = tier > 0 && stage.at === flights;
  return (
    <div className="challenge-unlock">
      <strong>
        {unlocked ? 'New challenge unlocked' : 'Your flying career'} ·{' '}
        {stage.name}
      </strong>
      <p>{unlocked ? stage.description : stage.next}</p>
    </div>
  );
}
