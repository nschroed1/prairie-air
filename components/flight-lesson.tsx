'use client';

/* oxlint-disable next/no-html-link-for-pages -- Native account navigation avoids the deployed Vinext router failure. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The SVG is a live field diagram with an accessible image description. */

import {
  ArrowUpRight,
  Check,
  Crosshair,
  Flag,
  Wind,
  Wrench,
} from 'lucide-react';
import { fieldSize, type Contract, type Simulation } from '@/lib/simulation';
import {
  coachMessage,
  debriefTip,
  nextPass,
  type PracticeBest,
} from '@/lib/flight-guidance';

import { windLabel, type Weather } from '@/lib/weather';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function FieldPlot({
  job,
  covered = [],
  label = 'Contract field preview',
}: {
  job: Contract;
  covered?: number[];
  label?: string;
}) {
  const { width, depth } = fieldSize(job);
  const left = 228 - width / 2,
    top = 228 - depth / 2;
  return (
    <svg
      className="field-plot"
      viewBox="-28 -28 512 512"
      role="img"
      aria-label={label}
    >
      <rect x="-28" y="-28" width="512" height="512" fill="#29473d" />
      <rect x={left} y={top} width={width} height={depth} fill="#486441" />
      {Array.from({ length: 38 }, (_, n) => (
        <path
          key={`row${n}`}
          d={`M${left} ${top + (n * depth) / 38}h${width}`}
          stroke="#718561"
          strokeOpacity=".32"
        />
      ))}
      {covered.map((n) => (
        <rect
          key={n}
          x={(n % 38) * 12}
          y={Math.floor(n / 38) * 12}
          width="12"
          height="12"
          fill="#d7ed94"
        />
      ))}
      <rect
        x={left}
        y={top}
        width={width}
        height={depth}
        fill="none"
        stroke="#f3f9d5"
        strokeWidth="3"
        strokeDasharray="7 5"
      />
      <text x="444" y="5" textAnchor="end" fill="#edf4db" fontSize="23">
        N ↑
      </text>
      <text x="228" y="477" textAnchor="middle" fill="#edf4db" fontSize="23">
        {job.acres} acres · {width} × {depth} m
      </text>
    </svg>
  );
}

export function FlightBriefing({
  job,
  onFly,
  weather,
}: {
  job: Contract;
  weather?: Weather | null;
  onFly: () => void;
}) {
  return (
    <div className="lesson-briefing">
      <FieldPlot job={job} />
      <div>
        <span className="lesson-kicker">
          <Wind size={15} />{' '}
          {weather
            ? `${weather.label} · ${windLabel(weather, job.windStrength ?? 1)}`
            : job.id === 0
              ? 'Gentle breeze · about 3 minutes'
              : job.id === 1
                ? 'Strong west wind · about 4 minutes'
                : job.difficulty}
        </span>
        <p>{job.briefing ?? job.note}</p>
        <ol className="lesson-steps">
          <li>
            <b>1</b>
            <span>
              <strong>Line up</strong>A/D to bank. W/S to climb or descend.
            </span>
          </li>
          <li>
            <b>2</b>
            <span>
              <strong>Spray the green footprint</strong>Hold Space. Aim for
              20–98 ft with level wings.
            </span>
          </li>
          <li>
            <b>3</b>
            <span>
              <strong>Release, then turn</strong>Amber means the edge is coming.
              Red means spray off.
            </span>
          </li>
        </ol>
        <div className="briefing-pay">
          <span>
            {job.target}% coverage <b>{money(job.pay)}</b>
          </span>
          <span>
            {job.bonusTarget}% coverage <b>+{money(job.bonus)}</b>
          </span>
        </div>
        <p className="lesson-fine">
          Practice pay and upgrades stay in this browser. Off-field spray costs
          $40/ac.
        </p>
        <button className="primary" onClick={onFly}>
          Start this flight <ArrowUpRight size={18} />
        </button>
      </div>
    </div>
  );
}

export function FlightCoach({
  sim,
  onLineUp,
}: {
  sim: Simulation;
  onLineUp?: () => void;
}) {
  'use no memo';
  const coach = coachMessage(sim),
    pass = nextPass(sim);
  return (
    <aside
      className={`flight-coach coach-step-${coach.step}`}
      aria-label="Flight coach"
    >
      <div className="coach-heading">
        <Crosshair size={16} />
        <span>FLIGHT COACH</span>
        <b>
          {pass.index + 1}/{pass.total}
        </b>
      </div>
      <strong>{coach.title}</strong>
      <p>{coach.detail}</p>
      <div
        className="coach-progress"
        aria-label={`Lesson step ${coach.step + 1} of 4`}
      >
        {['Line up', 'Spray', 'Turn', 'Collect'].map((name, i) => (
          <span className={i === coach.step ? 'current' : ''} key={name}>
            {name}
          </span>
        ))}
      </div>
      {onLineUp && coach.step === 2 && (
        <button className="coach-assist" onClick={onLineUp}>
          Help me line up this strip <ArrowUpRight size={14} />
        </button>
      )}
    </aside>
  );
}

export function FlightDebrief({
  sim,
  practice,
  newBest,
  previousBest,
  nextJob,
  onNext,
  onHangar,
  onReplay,
}: {
  sim: Simulation;
  practice: boolean;
  newBest: boolean;
  previousBest?: PracticeBest;
  nextJob?: Contract;
  onNext: () => void;
  onHangar: () => void;
  onReplay: () => void;
}) {
  'use no memo';
  const result = sim.result;
  return (
    <div className="state-overlay">
      <section className="flight-debrief" aria-label="Flight debrief">
        <div className="debrief-heading">
          <span className="lesson-kicker">
            <Flag size={17} /> CONTRACT COMPLETE
          </span>
          <span>{duration(sim.elapsed)} in the air</span>
        </div>
        <h2>
          {result.bonus ? 'That’s a beautiful finish.' : 'Good work, pilot.'}
        </h2>
        <p className="farmer-response">
          {sim.job.farmer}: “
          {result.penalty > 0
            ? 'Thanks for the coverage. Keep the spray inside our flags next time.'
            : result.bonus
              ? 'Every strip cared for. You’ve earned that extra.'
              : 'That’s the coverage we needed. Thank you.'}
          ”
        </p>
        <div className="debrief-body">
          <div>
            <FieldPlot
              job={sim.job}
              covered={[...sim.covered]}
              label={`Completed field: ${result.coverage.toFixed(1)} percent treated. Light strips are covered; dark strips still need treatment.`}
            />
            <div className="plot-legend">
              <span>● Treated</span>
              <span>○ Untreated</span>
            </div>
          </div>
          <div>
            <div className="debrief-coverage">
              <strong>{result.coverage.toFixed(1)}%</strong>
              <span>of the plot covered</span>
            </div>
            <dl className="debrief-receipt">
              <div>
                <dt>Contract pay</dt>
                <dd>{money(result.pay)}</dd>
              </div>
              <div>
                <dt>Precision bonus</dt>
                <dd>+{money(result.bonus)}</dd>
              </div>
              <div className={result.penalty ? 'deduction' : ''}>
                <dt>Overspray · {result.oversprayAcres.toFixed(2)} ac</dt>
                <dd>−{money(result.penalty)}</dd>
              </div>
              <div className="receipt-total">
                <dt>{practice ? 'Practice earnings' : 'Take-home pay'}</dt>
                <dd>{money(result.total)}</dd>
              </div>
            </dl>
            {practice && (
              <p className="personal-best">
                <Check size={16} />
                {newBest
                  ? previousBest
                    ? 'New personal best for this field'
                    : 'Your first finish on this field'
                  : `Best take-home here: ${money(previousBest?.total ?? result.total)}`}
              </p>
            )}
          </div>
        </div>
        <p className="debrief-tip">
          <Crosshair size={18} />
          <span>
            <b>For your next pass</b>
            {debriefTip(sim)}
          </span>
        </p>
        {nextJob && (
          <div className="next-contract">
            <div>
              <span className="lesson-kicker">
                UP NEXT · {nextJob.difficulty}
              </span>
              <strong>{nextJob.name}</strong>
              <p>
                {nextJob.acres} acres of {nextJob.crop} · {money(nextJob.pay)} +{' '}
                {money(nextJob.bonus)} bonus
              </p>
            </div>
            <button className="primary" onClick={onNext}>
              Fly next job <ArrowUpRight size={18} />
            </button>
          </div>
        )}
        <div className="debrief-actions">
          {!nextJob && (
            <button className="primary" onClick={onNext}>
              Find your next job <ArrowUpRight size={16} />
            </button>
          )}
          <button className="secondary" onClick={onHangar}>
            <Wrench size={16} />
            {sim.career.cash >= 600 ? 'Choose an upgrade' : 'Visit the hangar'}
          </button>
          {practice && (
            <button className="text-button" onClick={onReplay}>
              Try for a cleaner finish
            </button>
          )}
          {practice && (
            <a href="/auth" className="signin-link">
              Create a pilot for the public county
            </a>
          )}
        </div>
        {practice && (
          <p className="lesson-fine">
            Your practice career is saved on this device. Public county earnings
            start separately.
          </p>
        )}
      </section>
    </div>
  );
}
