'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The SVG is a data-driven flight route with an accessible description. */
import { Heart, ArrowUpRight, RotateCcw, Check, Wind } from 'lucide-react';
import type { Career, Contract, Simulation } from '@/lib/simulation';
import {
  skyRoute,
  skyAccuracy,
  SKY_LENGTH,
  SKY_SPACING,
  skywritingAvailable,
  skywritingDueAt,
} from '@/lib/skywriting';
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

export function SkyPatternPlot({
  job,
  sim,
}: {
  job: Contract;
  sim?: Simulation;
}) {
  const route = skyRoute(job);
  const point = (p: { x: number; z: number }) =>
    `${p.x - job.x},${p.z - job.z}`;
  return (
    <svg
      className="sky-pattern"
      viewBox="-380 -270 760 670"
      role="img"
      aria-label="Heart flight route; begin at the notch and follow clockwise"
    >
      <polyline
        points={route.map(point).join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeDasharray="7 9"
        opacity=".35"
      />
      {sim &&
        route
          .slice(0, -1)
          .map(
            (p, i) =>
              sim.skywriting.ink[i] > SKY_SPACING * 0.3 && (
                <line
                  key={i}
                  x1={p.x - job.x}
                  y1={p.z - job.z}
                  x2={route[i + 1].x - job.x}
                  y2={route[i + 1].z - job.z}
                  stroke="#fff5d4"
                  strokeWidth="10"
                  strokeLinecap="round"
                />
              ),
          )}
      <circle
        cx={route[0].x - job.x}
        cy={route[0].z - job.z}
        r="13"
        fill="#ffcf72"
      />
      <text
        x="0"
        y="-170"
        textAnchor="middle"
        fill="currentColor"
        fontSize="29"
      >
        START →
      </text>
      {sim && (
        <g
          transform={`translate(${sim.x - job.x} ${sim.z - job.z}) rotate(${(sim.heading * 180) / Math.PI})`}
        >
          <path
            d="M0 -20 L12 15 L0 9 L-12 15 Z"
            fill="#fff"
            stroke="#254454"
            strokeWidth="3"
          />
        </g>
      )}
    </svg>
  );
}
export function SkyBriefing({
  job,
  training,
  onFly,
}: {
  job: Contract;
  training: boolean;
  onFly: () => void;
}) {
  return (
    <div className="sky-briefing">
      <div className="sky-route-card">
        <SkyPatternPlot job={job} />
        <span>ONE HEART. A WHOLE COUNTY WATCHING.</span>
      </div>
      <div className="sky-briefing-copy">
        <span className="eyebrow">
          <Heart size={14} />{' '}
          {training ? 'SKYWRITING PRACTICE' : 'A CELEBRATION IN THE SKY'}
        </span>
        <h3>Leave a little love up there.</h3>
        <p>
          Follow the gold gates around the heart. Bank gently and keep your
          height level with the rings.
        </p>
        <ol>
          <li>
            <kbd>SPACE</kbd> Hold to write. Release while correcting your line.
          </li>
          <li>
            Fly the full circuit. Write <strong>80%</strong> with{' '}
            <strong>65% accuracy</strong> to finish.
          </li>
          <li>
            <strong>95% written + 90% accuracy</strong> earns the precision
            bonus.
          </li>
        </ol>
        <p className="sky-practice-note">
          <kbd>R</kbd> Refills smoke and returns you to the start. Completed
          strokes stay.{' '}
          {training
            ? 'Unlimited retries; no money, repairs or career progress at stake.'
            : 'Stray smoke reduces pay. Maintenance still applies.'}
        </p>
        <div className="sky-briefing-footer">
          <span>
            <Wind size={15} />{' '}
            {job.skywriting?.level ? 'Crosswind challenge' : 'Gentle wind'} ·
            about a minute
          </span>
          <button className="primary" onClick={onFly}>
            {training ? 'Start skywriting practice' : 'Fly the celebration'}
            <ArrowUpRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
export function SkyMission({
  sim,
  training,
  onFinish,
}: {
  sim: Simulation;
  training: boolean;
  onFinish: () => void;
}) {
  const accuracy = skyAccuracy(sim.skywriting);
  return (
    <div className="sky-mission">
      <div className="mission-title">
        <div>
          <h2>{training ? 'Skywriting practice' : sim.job.name}</h2>
          <p>
            {training ? 'Free retries · career unaffected' : sim.job.farmer}
          </p>
        </div>
        <Heart size={23} />
      </div>
      <div className="sky-score">
        <div>
          <small>HEART WRITTEN</small>
          <strong>
            {sim.coverage.toFixed(1)}
            <em>%</em>
          </strong>
        </div>
        <div>
          <small>SMOKE ACCURACY</small>
          <strong className={accuracy < 65 ? 'warning' : ''}>
            {accuracy.toFixed(0)}
            <em>%</em>
          </strong>
        </div>
      </div>
      <progress value={sim.coverage} max={100} aria-label="Heart written" />
      <p className="sky-targets">80% written · 65% accuracy to finish</p>
      <div className="sky-circuit">
        <span>
          {sim.skywriting.loops ? '✓ Circuit flown' : 'Follow gates in order'}
        </span>
        <strong>
          {Math.min(100, (sim.skywriting.progress / SKY_LENGTH) * 100).toFixed(
            0,
          )}
          %
        </strong>
      </div>
      <p className="sky-targets">Bonus: 95% written + 90% accuracy</p>
      {!training && (
        <div className="overspray-summary">
          <div>
            <span>Stray smoke</span>
            <strong>−{money(sim.oversprayPenalty)}</strong>
          </div>
          <div>
            <span>Estimated take-home</span>
            <strong>{money(sim.projectedPay)}</strong>
          </div>
        </div>
      )}
      {sim.completionReady && sim.phase === 'flying' && (
        <button className="primary claim" onClick={onFinish}>
          {training ? 'See your heart' : 'Finish & reveal'}
          <Check size={17} />
        </button>
      )}
    </div>
  );
}
export function SkyDebrief({
  sim,
  training,
  onReplay,
  onNext,
}: {
  sim: Simulation;
  training: boolean;
  onReplay: () => void;
  onNext: () => void;
}) {
  return (
    <section className="sky-reveal-card" aria-label="Skywriting result">
      <div>
        <span className="eyebrow">
          {training
            ? 'PRACTICE COMPLETE · VIEW FROM THE GROUND'
            : 'THE WEDDING GUESTS’ VIEW'}
        </span>
        <h2>
          {sim.earnedBonus
            ? 'A heart worth looking up for.'
            : 'You made their day.'}
        </h2>
        <p>
          {sim.coverage.toFixed(1)}% written ·{' '}
          {skyAccuracy(sim.skywriting).toFixed(1)}% accuracy ·{' '}
          {Math.round(sim.elapsed)}s
        </p>
      </div>
      <div className="sky-reveal-pay">
        {training ? (
          <>
            <strong>Nicely flown.</strong>
            <small>Practice only · career unchanged</small>
          </>
        ) : (
          <>
            <strong>{money(sim.result.total)} earned</strong>
            <small>
              Base {money(sim.result.pay)} + bonuses{' '}
              {money(
                sim.result.bonus +
                  sim.result.cleanBonus +
                  sim.result.speedBonus,
              )}
            </small>
            <small>
              Stray smoke −{money(sim.result.penalty)} · workshop −
              {money(sim.result.maintenance + sim.result.repairs)}
              {sim.result.debt > 0
                ? ` · ${money(sim.result.debt)} still owed`
                : ''}
            </small>
          </>
        )}
      </div>
      <div className="sky-reveal-actions">
        {training && (
          <button className="secondary" onClick={onReplay}>
            <RotateCcw size={15} /> Practice again
          </button>
        )}
        <button className="primary" onClick={onNext}>
          {training ? 'Back to contracts' : 'Find the next job'}
          <ArrowUpRight size={16} />
        </button>
      </div>
    </section>
  );
}
export function SkyJobOffer({
  job,
  career,
  training,
  onPractice,
  onContract,
}: {
  job: Contract;
  career: Career;
  training: boolean;
  onPractice: (level: 0 | 1) => void;
  onContract: () => void;
}) {
  const available = skywritingAvailable(career);
  return (
    <article className="sky-offer">
      <SkyPatternPlot job={job} />
      <div>
        <span className="eyebrow">SKYWRITING · OCCASIONAL JOB</span>
        <h3>A heart above Cedar Valley.</h3>
        <p>
          Learn the turns, time your smoke, then fly a wedding commission when
          one opens.
        </p>
        <div className="sky-offer-actions">
          <button className="secondary" onClick={() => onPractice(0)}>
            Practice skywriting
          </button>
          <button className="secondary" onClick={() => onPractice(1)}>
            Practice crosswind
          </button>
        </div>
        <p className="sky-practice-note">
          Practice anytime. No fees or career changes.
        </p>
        {!training &&
          (available ? (
            <button className="primary" onClick={onContract}>
              Fly wedding job · {money(job.pay)}
              <ArrowUpRight size={15} />
            </button>
          ) : (
            <p className="sky-targets">
              Next local wedding job after{' '}
              {skywritingDueAt(career) - career.flights} more completed jobs.
            </p>
          ))}
      </div>
    </article>
  );
}

export function drawSkyMap(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sim: Simulation,
  guides: boolean,
) {
  const route = skyRoute(sim.job),
    scale = Math.min(width / 820, height / 760);
  const x = (v: number) => (v - sim.job.x) * scale + width / 2,
    z = (v: number) => (v - sim.job.z - 35) * scale + height / 2;
  ctx.fillStyle = '#294552';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < route.length - 1; i++) {
    if (!guides && sim.skywriting.ink[i] < 1) continue;
    ctx.beginPath();
    ctx.moveTo(x(route[i].x), z(route[i].z));
    ctx.lineTo(x(route[i + 1].x), z(route[i + 1].z));
    ctx.strokeStyle =
      sim.skywriting.ink[i] > SKY_SPACING * 0.3 ? '#fff2cd' : '#68818b';
    ctx.lineWidth = sim.skywriting.ink[i] > SKY_SPACING * 0.3 ? 3 : 1;
    ctx.stroke();
  }
  if (guides) {
    const next =
      route[Math.min(80, Math.ceil(sim.skywriting.progress / SKY_SPACING))];
    ctx.beginPath();
    ctx.arc(x(next.x), z(next.z), 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffcf72';
    ctx.fill();
  }
  ctx.save();
  ctx.translate(x(sim.x), z(sim.z));
  ctx.rotate(sim.heading);
  ctx.beginPath();
  ctx.moveTo(0, -7);
  ctx.lineTo(5, 5);
  ctx.lineTo(0, 2);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();
}
