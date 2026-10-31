'use client';

/* oxlint-disable next/no-html-link-for-pages -- Native account navigation avoids the deployed Vinext router failure. */
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The SVG is a live field diagram with an accessible image description. */

import { ChallengeBrief, NextChallenge } from './flight-challenge';
import { useId, type ReactNode } from 'react';
import { fieldOutline } from '@/lib/field-geometry';
import { upgradeGoal } from '@/lib/progression';
import {
  ArrowUpRight,
  Check,
  Crosshair,
  Flag,
  Wind,
  Wrench,
  Trophy,
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
  const clipId = useId();
  const { width, depth } = fieldSize(job);
  const left = 228 - width / 2,
    top = 228 - depth / 2;
  const outline = fieldOutline(job)
    .map((p) => `${p.x + 228},${p.z + 228}`)
    .join(' ');
  return (
    <svg
      className="field-plot"
      viewBox="-28 -28 512 512"
      role="img"
      aria-label={label}
    >
      <rect x="-28" y="-28" width="512" height="512" fill="#29473d" />
      <defs>
        <clipPath id={clipId}>
          <polygon points={outline} />
        </clipPath>
      </defs>
      <polygon points={outline} fill="#486441" />
      <g clipPath={`url(#${clipId})`}>
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
            x={(n % 38) * 12 + 0.4}
            y={Math.floor(n / 38) * 12 + 0.4}
            width="11.2"
            height="11.2"
            fill="#8fe33b"
            fillOpacity="0.76"
            stroke="rgba(255, 255, 255, 0.42)"
            strokeWidth="0.8"
            rx="0.5"
          />
        ))}
      </g>
      {(job.noSprayZones ?? []).map((zone, i) => {
        const kind = (zone as { kind?: string }).kind ?? 'yard';
        const zx = 228 + zone.x;
        const zz = 228 + zone.z;
        return (
          <g key={i}>
            <rect
              x={zx - zone.width / 2}
              y={zz - zone.depth / 2}
              width={zone.width}
              height={zone.depth}
              fill="#4a392d"
              stroke="#ffcf83"
              strokeWidth="3"
              strokeDasharray="5 4"
            />
            {kind === 'barn' ? (
              <g>
                <rect
                  x={zx - 13}
                  y={zz - 8}
                  width="26"
                  height="16"
                  fill="#9e2b1b"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  rx="1"
                />
                <polygon
                  points={`${zx - 15},${zz - 8} ${zx},${zz - 17} ${zx + 15},${zz - 8}`}
                  fill="#dad2be"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                />
                <rect
                  x={zx - 5}
                  y={zz - 4}
                  width="10"
                  height="12"
                  fill="#2a1f18"
                  stroke="#ffffff"
                  strokeWidth="1"
                />
                <line
                  x1={zx - 5}
                  y1={zz - 4}
                  x2={zx + 5}
                  y2={zz + 8}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
                <line
                  x1={zx + 5}
                  y1={zz - 4}
                  x2={zx - 5}
                  y2={zz + 8}
                  stroke="#ffffff"
                  strokeWidth="1"
                />
              </g>
            ) : kind === 'silo' ? (
              <g>
                <rect
                  x={zx - 7}
                  y={zz - 9}
                  width="14"
                  height="18"
                  fill="#8c989c"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                  rx="2"
                />
                <path
                  d={`M ${zx - 7} ${zz - 9} A 7 7 0 0 1 ${zx + 7} ${zz - 9} Z`}
                  fill="#cad6da"
                  stroke="#ffffff"
                  strokeWidth="1.2"
                />
              </g>
            ) : (
              <text
                x={zx}
                y={zz + 5}
                textAnchor="middle"
                fontSize="17"
                fill="#ffe9b1"
              >
                ×
              </text>
            )}
          </g>
        );
      })}
      <polygon
        points={outline}
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
  sessionOnly = false,
}: {
  job: Contract;
  weather?: Weather | null;
  sessionOnly?: boolean;
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
        <ChallengeBrief job={job} />
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
          {sessionOnly
            ? 'Preview progress lasts for this session. '
            : 'Practice pay and upgrades stay in this browser. '}
          Off-field spray costs $40/ac.
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
      {coach.recovery && (
        <div
          className="coach-bearing"
          aria-label={`Approach bearing ${Math.round(coach.recovery.bearing)} degrees, ${Math.round(coach.recovery.distance)} meters away`}
        >
          <span
            className="bearing-arrow"
            style={{ transform: `rotate(${coach.recovery.relative}deg)` }}
            aria-hidden="true"
          >
            ↑
          </span>
          <b>
            {String(Math.round(coach.recovery.bearing) % 360).padStart(3, '0')}°
          </b>
          <span>
            {coach.recovery.distance >= 1000
              ? `${(coach.recovery.distance / 1000).toFixed(1)} km`
              : `${Math.round(coach.recovery.distance / 10) * 10} m`}{' '}
            to approach
          </span>
        </div>
      )}
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
  onHallOfFame,
  progression,
}: {
  sim: Simulation;
  practice: boolean;
  newBest: boolean;
  previousBest?: PracticeBest;
  nextJob?: Contract;
  onNext: () => void;
  onHangar: () => void;
  onReplay: () => void;
  onHallOfFame?: () => void;
  progression?: ReactNode;
}) {
  'use no memo';
  const result = sim.result;
  const isRally = sim.isRally && Boolean(sim.rallyState);
  const isFirefighting = sim.isFirefighting && Boolean(sim.firefightingState);
  const isDustOff = sim.isDustOff;
  const isTandem = sim.isTandem;

  const hotspotsDoused = sim.firefightingState
    ? sim.firefightingState.hotspots.filter((h) => h.intensity <= 0.06).length
    : 0;
  const totalHotspots = sim.firefightingState?.hotspots.length ?? 6;
  const containmentPct = Math.round(
    (sim.firefightingState?.containedFraction ?? 1) * 100,
  );
  const rallyGatesCleared = sim.rallyState?.gateIndex ?? 10;
  const rallyMedal = (sim.rallyState?.medal ?? 'bronze').toUpperCase();
  const rallyTime = sim.rallyState?.finalTime || sim.elapsed;
  const tandemCombined = Math.min(100, result.coverage + sim.partnerCoverage);
  const formationSecs = Math.round(
    (sim as Simulation & { formationBonusSeconds?: number })
      .formationBonusSeconds ?? 0,
  );

  const modeTip = isRally
    ? `You cleared ${rallyGatesCleared}/10 rally gates in ${ rallyTime.toFixed(1) }s (${rallyMedal} medal). Thread the barn breezeway or inverted gates to shave extra stunt seconds off your time.`
    : isFirefighting
      ? `You doused ${hotspotsDoused}/${totalHotspots} timber hotspots (${containmentPct}% containment) in ${duration(sim.elapsed)}. Skim Cedar Dip Basin below 26 ft AGL for rapid Phos-Chek slurry refills.`
      : isDustOff
        ? `Final turf split: You ${result.coverage.toFixed(1)}% vs Rival ${sim.rivalCoverage.toFixed(1)}%. Lock onto adjacent swaths early and bank tight wingovers at field edges to outpace the rival duster.`
        : isTandem
          ? `Combined coverage reached ${tandemCombined.toFixed(1)}% (${result.coverage.toFixed(1)}% you + ${sim.partnerCoverage.toFixed(1)}% Bennett). Stay within 25m–50m echelon formation to draft slipstream bonus pay.`
          : debriefTip(sim);

  return (
    <div className="state-overlay debrief-overlay">
      <section className="flight-debrief" aria-label="Flight debrief">
        <div className="debrief-heading">
          <span className="lesson-kicker">
            <Flag size={17} />{' '}
            {isRally
              ? `BARNSTORMER RALLY · ${rallyMedal} MEDAL`
              : isFirefighting
                ? 'WILDFIRE DISPATCH COMPLETE'
                : isDustOff
                  ? 'DUST-OFF 1v1 COMPLETE'
                  : isTandem
                    ? 'TANDEM CO-OP COMPLETE'
                    : 'CONTRACT COMPLETE'}
          </span>
          <span>{duration(sim.elapsed)} in the air</span>
        </div>
        <h2>
          {isRally
            ? `${rallyMedal} Medal Finish!`
            : isFirefighting
              ? 'Timber Ridge fire contained.'
              : isDustOff
                ? result.coverage >= sim.rivalCoverage
                  ? 'You took the turf crown!'
                  : 'Hard-fought 1v1 race.'
                : isTandem
                  ? 'Seamless formation sortie.'
                  : result.bonus
                    ? 'That’s a beautiful finish.'
                    : 'Good work, pilot.'}
        </h2>
        <p className="farmer-response">
          {sim.job.farmer}: “
          {isRally
            ? `What a show through all ${rallyGatesCleared} gates! The county fairgrounds crowd could hear that radial engine roaring across the valley.`
            : isFirefighting
              ? `You knocked down ${hotspotsDoused} of ${totalHotspots} brushfire hotspots before the embers reached the timberline. Cedar Valley owes you one.`
              : isDustOff
                ? `You covered ${result.coverage.toFixed(1)}% against your rival’s ${sim.rivalCoverage.toFixed(1)}%. Fast passes and sharp turns!`
                : isTandem
                  ? `Flying wing-to-wing with Bennett got ${tandemCombined.toFixed(1)}% of our acreage treated in record time.`
                  : result.penalty > 0
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
              {isRally ? (
                <>
                  <strong>{rallyTime.toFixed(1)}s</strong>
                  <span>
                    {rallyGatesCleared} / 10 gates · {rallyMedal} MEDAL
                  </span>
                </>
              ) : isFirefighting ? (
                <>
                  <strong>{containmentPct}%</strong>
                  <span>
                    contained · {hotspotsDoused} / {totalHotspots} hotspots
                    doused
                  </span>
                </>
              ) : isDustOff ? (
                <>
                  <strong>
                    {result.coverage.toFixed(1)}% vs{' '}
                    {sim.rivalCoverage.toFixed(1)}%
                  </strong>
                  <span>player vs rival coverage split</span>
                </>
              ) : isTandem ? (
                <>
                  <strong>{tandemCombined.toFixed(1)}%</strong>
                  <span>
                    combined ({result.coverage.toFixed(1)}% you ·{' '}
                    {sim.partnerCoverage.toFixed(1)}% partner)
                  </span>
                </>
              ) : (
                <>
                  <strong>{result.coverage.toFixed(1)}%</strong>
                  <span>of the plot covered</span>
                </>
              )}
            </div>
            <dl className="debrief-receipt">
              <div>
                <dt>Contract pay</dt>
                <dd>{money(result.pay)}</dd>
              </div>
              <div>
                <dt>
                  {isRally
                    ? `Medal bonus (${rallyMedal})`
                    : isFirefighting
                      ? 'Containment bonus'
                      : isTandem
                        ? 'Co-op & formation bonus'
                        : 'Precision bonus'}
                </dt>
                <dd>+{money(result.bonus)}</dd>
              </div>
              {isRally && (
                <div>
                  <dt>Course time · {rallyGatesCleared}/10 gates</dt>
                  <dd>{duration(rallyTime)}</dd>
                </div>
              )}
              {isFirefighting && (
                <div>
                  <dt>Containment time · {hotspotsDoused}/{totalHotspots} doused</dt>
                  <dd>{duration(sim.elapsed)}</dd>
                </div>
              )}
              {isDustOff && (
                <div>
                  <dt>Turf race margin</dt>
                  <dd>
                    {result.coverage >= sim.rivalCoverage ? '+' : ''}
                    {(result.coverage - sim.rivalCoverage).toFixed(1)}%
                  </dd>
                </div>
              )}
              {isTandem && (
                <div>
                  <dt>Echelon slipstream time</dt>
                  <dd>{formationSecs}s</dd>
                </div>
              )}
              {Boolean(sim.pendingSkillBonus) && (
                <div className="stunt-bonus">
                  <dt>Flight skill &amp; token bonuses</dt>
                  <dd>+{money(sim.pendingSkillBonus)}</dd>
                </div>
              )}
              {Boolean(result.cleanBonus) && (
                <div className="stunt-bonus">
                  <dt>Clean finish bonus</dt>
                  <dd>+{money(result.cleanBonus)}</dd>
                </div>
              )}
              {Boolean(result.speedBonus) && (
                <div className="stunt-bonus">
                  <dt>Under-par bonus</dt>
                  <dd>+{money(result.speedBonus)}</dd>
                </div>
              )}
              {!isRally && !isFirefighting && (
                <div className={result.penalty ? 'deduction' : ''}>
                  <dt>Overspray · {result.oversprayAcres.toFixed(2)} ac</dt>
                  <dd>−{money(result.penalty)}</dd>
                </div>
              )}
              <div className="deduction">
                <dt>Maintenance</dt>
                <dd>−{money(result.maintenance ?? 0)}</dd>
              </div>
              <div className="deduction">
                <dt>Repairs &amp; boom service</dt>
                <dd>−{money(result.repairs ?? 0)}</dd>
              </div>
              <div className="receipt-total">
                <dt>{practice ? 'Practice earnings' : 'Take-home pay'}</dt>
                <dd>{money(result.total)}</dd>
              </div>
            </dl>
            {sim.bankedStuntBonus > 0 && (
              <p className="lesson-fine">
                Previously banked flight bonuses: {money(sim.bankedStuntBonus)}.
                Already in your wallet; excluded from this deposit.
              </p>
            )}
            {Boolean(result.debt) && (
              <p className="workshop-tab">
                Workshop credit remaining: <b>{money(result.debt)}</b>. Paid
                from future jobs; you can keep flying.
              </p>
            )}
            {Boolean(sim.job.challenge?.dangerPay) && (
              <p className="lesson-fine">
                Contract pay includes {money(sim.job.challenge!.dangerPay)}{' '}
                danger pay.
              </p>
            )}
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
            {modeTip}
          </span>
        </p>
        <NextChallenge flights={sim.career.flights} />
        {progression}
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
            {upgradeGoal(sim.career)?.remaining === 0
              ? 'Choose an upgrade'
              : 'Visit the hangar'}
          </button>
          {onHallOfFame && (
            <button className="secondary" onClick={onHallOfFame}>
              <Trophy size={16} />
              Hall of Fame &amp; Badges
            </button>
          )}
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
