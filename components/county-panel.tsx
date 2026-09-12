'use client';
/* oxlint-disable jsx-a11y/prefer-tag-over-role -- The SVG provides a data-driven field locator with an accessible image description. */
/* oxlint-disable next/no-html-link-for-pages -- Native account navigation avoids the deployed Vinext router failure. */
import {
  prepareContract,
  challengeStages,
  challengeTier,
} from '@/lib/challenge';
import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  ArrowUpRight,
  Check,
  Lock,
  Plane,
  Sprout,
  Trophy,
  Clock,
  MapPin,
} from 'lucide-react';
import type { CountySnapshot, CountyJob, Standing } from '@/lib/county';
import {
  OVERSPRAY_PENALTY_PER_ACRE,
  fieldSize,
  riverX,
} from '@/lib/simulation';
import { rivalRace } from '@/lib/progression';
import { RivalGoal } from '@/components/career-goals';
import { CountyForecast } from '@/components/county-forecast';
import { fieldOutline } from '@/lib/field-geometry';
import { SkyPatternPlot } from '@/components/skywriting';
import { isSkywriting, SKYWRITING_UNLOCK } from '@/lib/skywriting';
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export function CountyPanel({
  county,
  claim,
  rename,
  freeFlight,
  release,
  practiceSkywriting,
  initialTab = 'fields',
  pending,
  rivalId,
  selectRival,
}: {
  county: CountySnapshot;
  claim: (job: CountyJob) => void;
  rename: (name: string) => void;
  freeFlight: () => void;
  release: () => void;
  practiceSkywriting?: () => void;
  initialTab?: string;
  pending: boolean;
  rivalId: string | null;
  selectRival: (id: string | null) => void;
}) {
  const [filter, setFilter] = useState('available'),
    [name, setName] = useState(county.player?.callsign ?? '');
  const [tab, setTab] = useState(initialTab);
  const [search, setSearch] = useState('');
  const flights = county.player?.flight.career.flights ?? 0;
  const race = rivalRace(
    county.standings,
    county.viewerId,
    rivalId,
    county.player?.flight.career.totalEarned ?? 0,
  );
  const toPass = race?.toPass;
  const opportunity =
    !race?.ahead && toPass != null
      ? county.jobs
          .filter((j) => j.status === 'open')
          .map((j) => {
            const p = prepareContract(j, flights);
            return { id: j.id, value: p.pay + p.bonus };
          })
          .filter((j) => j.value >= toPass)
          .sort((a, b) => a.value - b.value)[0]?.id
      : null;
  const done = county.jobs.filter((j) => j.status === 'complete').length;
  const open = county.jobs.filter((j) => j.status === 'open').length;
  const remaining = Math.max(0, county.season.endsAt - county.now),
    days = Math.floor(remaining / 86400000),
    hours = Math.floor(remaining / 3600000) % 24;
  const jobs = county.jobs
    .map((j) => ({
      ...j,
      ...prepareContract(j, county.player?.flight.career.flights ?? 0),
    }))
    .filter((j) =>
      filter === 'available'
        ? j.status === 'open' ||
          (j.owner === county.viewerId && j.status === 'claimed')
        : filter === 'working'
          ? j.status === 'claimed'
          : filter === 'done'
            ? j.status === 'complete'
            : j.status === 'scheduled',
    );
  return (
    <div className="county-panel">
      <div className="county-season">
        <div>
          <span className="eyebrow">
            SEASON {String(county.season.number).padStart(2, '0')} ·{' '}
            {county.season.phase.toUpperCase()}
          </span>
          <h3>{open} contracts ready to fly</h3>
          <p>
            {done} / {county.jobs.length} complete ·{' '}
            {county.jobs.filter((j) => j.status === 'claimed').length} being
            flown · {county.pilots.length}/{county.capacity} pilots online
          </p>
        </div>
        <div className="season-clock">
          <Clock size={15} />
          {days}d {hours}h left
        </div>
      </div>
      <Progress
        value={(done / 60) * 100}
        aria-label="County season completed"
      />
      <div className="season-waves">
        {['Spring · Fertilize', 'Summer · Protect', 'Fall · Seed'].map(
          (phase, i) => (
            <span
              key={phase}
              className={i === county.season.phaseIndex ? 'current-wave' : ''}
            >
              {i < county.season.phaseIndex ? (
                <Check size={13} />
              ) : (
                <span className="wave-dot" />
              )}
              {phase}
            </span>
          ),
        )}
      </div>
      {county.viewerId && (
        <div className="county-rival-summary">
          <RivalGoal race={race} onStandings={() => setTab('standings')} />
          {rivalId && (
            <button className="goal-select" onClick={() => selectRival(null)}>
              Auto-match next pilot
            </button>
          )}
          {rivalId && !race && (
            <small>
              Your chosen pilot has not reached this season’s top 50 yet. They
              will appear here when ranked.
            </small>
          )}
        </div>
      )}
      <div className="county-flight-actions">
        {practiceSkywriting && (
          <button
            className="secondary"
            onClick={practiceSkywriting}
            disabled={pending}
          >
            Practice skywriting
          </button>
        )}
        <button className="secondary" onClick={freeFlight} disabled={pending}>
          {county.player?.activeJob ? 'Resume my contract' : 'Free flight'}
          <Plane size={14} />
        </button>
        {county.player?.activeJob && (
          <button className="secondary" onClick={release} disabled={pending}>
            Release my claim
          </button>
        )}
        {!county.viewerId && (
          <a href="/auth" className="signin-link">
            Sign in to fly
          </a>
        )}
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="county-tabs">
          <TabsTrigger value="fields">
            <Sprout size={15} />
            Contracts
          </TabsTrigger>
          <TabsTrigger value="standings">
            <Trophy size={15} />
            Standings
          </TabsTrigger>
          <TabsTrigger value="pilots">
            <Plane size={15} />
            Pilots
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fields">
          <div className="field-filters">
            {[
              ['available', 'Available'],
              ['working', 'In progress'],
              ['done', 'Completed'],
              ['scheduled', 'Upcoming'],
            ].map(([value, label]) => (
              <button
                className={filter === value ? 'selected' : ''}
                key={value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {county.weather && (
            <CountyForecast
              weather={county.weather}
              next={county.nextWeather}
              now={county.now}
              stability={county.player?.flight.career.upgrades.stability}
            />
          )}
          <div className="county-jobs">
            {jobs.length === 0 ? (
              <div className="county-empty">
                <Sprout size={28} />
                <h3>
                  {filter === 'available'
                    ? 'The fields are in good hands.'
                    : 'Nothing here just yet.'}
                </h3>
                <p>
                  {filter === 'available'
                    ? `Check the next scheduled wave or enjoy a free flight. More work opens ${new Date(county.season.nextWaveAt).toLocaleString()}.`
                    : 'This board updates as pilots fly the season.'}
                </p>
              </div>
            ) : (
              jobs.map((job) => (
                <article
                  className={`county-job ${job.id === opportunity ? 'rival-opportunity' : ''}`}
                  key={job.id}
                >
                  <>
                    {isSkywriting(job) ? (
                      <div className="county-field-preview">
                        <SkyPatternPlot job={job} />
                      </div>
                    ) : (
                      <CountyFieldPreview job={job} />
                    )}
                  </>
                  <div className="field-description">
                    <small>
                      {isSkywriting(job)
                        ? 'SKYWRITING · HEART'
                        : `FIELD ${(job.id % 1000) - 99} · ${job.crop.toUpperCase()}`}
                    </small>
                    <h4>{job.farmer}</h4>
                    <p>
                      {job.treatment} ·{' '}
                      {isSkywriting(job)
                        ? 'A wedding celebration'
                        : `${job.acres} acres`}
                    </p>
                    <p className="field-requirements">
                      {isSkywriting(job)
                        ? 'Full circuit · 80% written · 65% accuracy'
                        : `${job.target}% to complete · ${job.bonusTarget}% for bonus`}
                    </p>
                    {job.id === opportunity && race && (
                      <p className="rival-opportunity-label">
                        A clean bonus finish could put you ahead of{' '}
                        {race.rival.callsign}.
                      </p>
                    )}
                    <p className="field-dimensions">
                      {isSkywriting(job)
                        ? 'Follow the gold gates · '
                        : `${fieldSize(job).width} × ${fieldSize(job).depth} m · `}
                      {job.difficulty}
                    </p>
                    <span className="field-location">
                      <MapPin size={12} /> {fieldLocation(job)}
                    </span>
                    {job.status === 'claimed' && (
                      <span className="field-owner">
                        {job.pilot} · {job.coverage.toFixed(1)}% covered
                      </span>
                    )}
                    {job.status === 'complete' && (
                      <span className="field-owner">
                        Completed by {job.pilot} · {job.coverage.toFixed(1)}%
                      </span>
                    )}
                    {job.status === 'scheduled' && (
                      <span className="field-owner">
                        Opens {new Date(job.opensAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <p className="field-risk">
                    {isSkywriting(job)
                      ? job.difficulty
                      : challengeStages[job.challenge?.tier ?? 0].name}
                    {job.challenge?.dangerPay
                      ? ` · ${money(job.challenge.dangerPay)} danger pay included`
                      : ''}
                    {job.challenge?.tornado ? ' · Tornado watch' : ''}
                  </p>
                  <div className="field-payment">
                    <strong>{money(job.pay)}</strong>
                    <small>+{money(job.bonus)} precision</small>
                    <button
                      className="primary"
                      disabled={
                        pending ||
                        job.status !== 'open' ||
                        (isSkywriting(job) &&
                          (county.player?.flight.career.flights ?? 0) <
                            SKYWRITING_UNLOCK)
                      }
                      onClick={() => claim(job)}
                    >
                      {job.status === 'open'
                        ? isSkywriting(job)
                          ? (county.player?.flight.career.flights ?? 0) <
                            SKYWRITING_UNLOCK
                            ? 'Unlock after 3 jobs'
                            : 'Claim skywriting job'
                          : 'Claim field'
                        : job.status === 'complete'
                          ? 'Complete'
                          : job.status === 'scheduled'
                            ? 'Scheduled'
                            : 'Reserved'}
                      {job.status === 'open' ? (
                        <ArrowUpRight size={14} />
                      ) : job.status === 'complete' ? (
                        <Check size={14} />
                      ) : (
                        <Lock size={13} />
                      )}
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          <p className="save-note">
            60 finite jobs per season. Completed fields stay completed. One
            active claim per pilot; claims expire after two minutes without new
            coverage. Off-field spray deducts{' '}
            {money(OVERSPRAY_PENALTY_PER_ACRE)}
            /ac from payment. Maintenance and repairs reduce take-home pay.{' '}
            {
              challengeStages[
                challengeTier(county.player?.flight.career.flights ?? 0)
              ].next
            }
            . Careers carry over to the next season.
          </p>
        </TabsContent>
        <TabsContent value="standings">
          <label className="rival-search" htmlFor="find-pilot">
            Find a friend’s callsign
            <Input
              id="find-pilot"
              type="search"
              placeholder="Search pilots on the board…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <Standings
            rows={county.standings}
            title="This season · top 50"
            viewerId={county.viewerId}
            search={search}
            rivalId={race?.rival.pilot}
            selectRival={county.viewerId ? selectRival : undefined}
          />
          {county.season.id > 0 && (
            <Standings
              rows={county.previousStandings}
              title="Previous season"
              search={search}
              viewerId={county.viewerId}
            />
          )}
          <p className="save-note">
            Ranked by contract earnings, then coverage precision. The server
            calculates every flight and payment. All aircraft upgrade levels
            compete together in this alpha.
          </p>
        </TabsContent>
        <TabsContent value="pilots">
          <div className="pilot-roster">
            {county.pilots.map((p) => (
              <div key={p.id}>
                <Plane size={17} />
                <strong>{p.callsign}</strong>
                <span>
                  {p.id === county.viewerId
                    ? 'You'
                    : p.phase === 'flying'
                      ? 'In the air'
                      : 'At the airfield'}
                </span>
                {county.viewerId && p.id !== county.viewerId && (
                  <button
                    className="rival-pick"
                    aria-pressed={rivalId === p.id}
                    onClick={() => selectRival(p.id)}
                  >
                    {rivalId === p.id ? 'Tracking' : 'Track rival'}
                  </button>
                )}
              </div>
            ))}
          </div>
          {county.player && (
            <form
              className="callsign-form"
              onSubmit={(e) => {
                e.preventDefault();
                rename(name);
              }}
            >
              <label htmlFor="pilot-callsign">Your public callsign</label>
              <div>
                <Input
                  id="pilot-callsign"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  minLength={3}
                  maxLength={20}
                  pattern="[a-zA-Z0-9 _-]+"
                  required
                />
                <button className="secondary" disabled={pending}>
                  Save
                </button>
              </div>
            </form>
          )}
          <p className="save-note">
            Everyone shares the same county and finite contract board. Other
            pilots appear in the sky and on your field map. The first alpha
            supports 32 connected pilots.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
function fieldLocation(job: CountyJob) {
  const east = `${(Math.abs(job.x) / 1000).toFixed(1)} km ${job.x < 0 ? 'W' : 'E'}`;
  const north = `${(Math.abs(job.z) / 1000).toFixed(1)} km ${job.z < 0 ? 'N' : 'S'}`;
  return `${east} · ${north} of county center`;
}
const countyRiver = Array.from({ length: 31 }, (_, i) => {
  const z = -3000 + i * 200;
  return `${i ? 'L' : 'M'}${riverX(z)},${z}`;
}).join(' ');
function CountyFieldPreview({ job }: { job: CountyJob }) {
  const { width, depth } = fieldSize(job);
  return (
    <div className="county-field-preview">
      <svg
        viewBox="-3100 -3100 6200 6200"
        role="img"
        aria-label={`Field location: ${fieldLocation(job)}. ${width} by ${depth} meters; north is up.`}
      >
        <rect x="-3100" y="-3100" width="6200" height="6200" fill="#224a3c" />
        {[-2550, -1530, -510, 510, 1530, 2550].map((p) => (
          <path
            key={p}
            d={`M${p},-3100 V3100 M-3100,${p} H3100`}
            stroke="#54735b"
            strokeWidth="30"
          />
        ))}
        <path d={countyRiver} stroke="#699caa" strokeWidth="160" fill="none" />
        <circle cx="0" cy="0" r="75" fill="#d2dcc2" />
        <polygon
          points={fieldOutline(job)
            .map((p) => `${job.x + p.x},${job.z + p.z}`)
            .join(' ')}
          fill="#e4ef99"
          stroke="#f6ffd5"
          strokeWidth="50"
        />
      </svg>
      <span>N ↑ · COUNTY</span>
    </div>
  );
}
function Standings({
  rows,
  title,
  viewerId,
  search = '',
  rivalId,
  selectRival,
}: {
  rows: Standing[];
  title: string;
  viewerId: string | null;
  search?: string;
  rivalId?: string;
  selectRival?: (id: string) => void;
}) {
  const matches = rows
    .map((row, i) => ({ row, rank: i + 1 }))
    .filter(({ row }) =>
      row.callsign.toLowerCase().includes(search.trim().toLowerCase()),
    );
  return (
    <section className="standings">
      <h3>{title}</h3>
      {!rows.length ? (
        <div className="county-empty">
          <Trophy size={28} />
          <h3>The first place is waiting.</h3>
          <p>Complete a county contract to put your callsign on the board.</p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Pilot</th>
              <th scope="col">Jobs</th>
              <th scope="col">Precision</th>
              <th scope="col">Earned</th>
              {selectRival && <th scope="col">Rival</th>}
            </tr>
          </thead>
          <tbody>
            {matches.map(({ row, rank }) => (
              <tr
                key={row.pilot}
                className={
                  row.pilot === viewerId
                    ? 'your-rank'
                    : row.pilot === rivalId
                      ? 'rival-rank'
                      : ''
                }
              >
                <td>{String(rank).padStart(2, '0')}</td>
                <td>
                  {row.callsign}
                  {row.pilot === viewerId ? ' · You' : ''}
                </td>
                <td>{row.jobs}</td>
                <td>{row.precision.toFixed(1)}%</td>
                <td>{money(row.earnings)}</td>
                {selectRival && (
                  <td>
                    {row.pilot !== viewerId && (
                      <button
                        className="rival-pick"
                        aria-label={`Track ${row.callsign} as your rival`}
                        aria-pressed={row.pilot === rivalId}
                        onClick={() => selectRival(row.pilot)}
                      >
                        {row.pilot === rivalId ? 'Tracking' : 'Track'}
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
            {!matches.length && (
              <tr>
                <td colSpan={selectRival ? 6 : 5}>
                  No matching pilots on this board. Try the Pilots tab for
                  friends who are still flying their first job.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </section>
  );
}
