'use client';
/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in requires top-level native navigation. */
import { useState } from 'react';
import Link from 'next/link';
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
} from 'lucide-react';
import type { CountySnapshot, CountyJob, Standing } from '@/lib/county';
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export function CountyPanel({
  county,
  claim,
  rename,
  freeFlight,
  release,
  initialTab = 'fields',
  pending,
}: {
  county: CountySnapshot;
  claim: (job: CountyJob) => void;
  rename: (name: string) => void;
  freeFlight: () => void;
  release: () => void;
  initialTab?: string;
  pending: boolean;
}) {
  const [filter, setFilter] = useState('available'),
    [name, setName] = useState(county.player?.callsign ?? '');
  const done = county.jobs.filter((j) => j.status === 'complete').length;
  const open = county.jobs.filter((j) => j.status === 'open').length;
  const remaining = Math.max(0, county.season.endsAt - county.now),
    days = Math.floor(remaining / 86400000),
    hours = Math.floor(remaining / 3600000) % 24;
  const jobs = county.jobs.filter((j) =>
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
          <h3>One county. Every acre counts.</h3>
          <p>{done} / 60 contracts completed together</p>
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
      <div className="county-totals">
        <div>
          <strong>{open}</strong>
          <span>OPEN CONTRACTS</span>
        </div>
        <div>
          <strong>
            {county.jobs.filter((j) => j.status === 'claimed').length}
          </strong>
          <span>BEING FLOWN</span>
        </div>
        <div>
          <strong>
            {county.pilots.length}
            <small> / {county.capacity}</small>
          </strong>
          <span>PILOTS ONLINE</span>
        </div>
      </div>
      <div className="county-flight-actions">
        <button className="secondary" onClick={freeFlight}>
          {county.player?.activeJob ? 'Resume my contract' : 'Free flight'}
          <Plane size={14} />
        </button>
        {county.player?.activeJob && (
          <button className="secondary" onClick={release}>
            Release my claim
          </button>
        )}
        {!county.viewerId && (
          <Link href="/auth" className="signin-link">
            Sign in to fly
          </Link>
        )}
      </div>
      <Tabs defaultValue={initialTab}>
        <TabsList className="county-tabs">
          <TabsTrigger value="fields">
            <Sprout size={15} />
            Fields
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
                <article className="county-job" key={job.id}>
                  <div>
                    <small>
                      FIELD {(job.id % 1000) - 99} · {job.crop.toUpperCase()}
                    </small>
                    <h4>{job.farmer}</h4>
                    <p>
                      {job.treatment} · {job.acres} acres · {job.target}%
                      required
                    </p>
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
                  <div className="field-payment">
                    <strong>{money(job.pay)}</strong>
                    <small>+{money(job.bonus)} precision</small>
                    <button
                      className="primary"
                      disabled={pending || job.status !== 'open'}
                      onClick={() => claim(job)}
                    >
                      {job.status === 'open'
                        ? 'Claim field'
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
            coverage. Careers carry over to the next season.
          </p>
        </TabsContent>
        <TabsContent value="standings">
          <Standings
            rows={county.standings}
            title="This season"
            viewerId={county.viewerId}
          />
          {county.season.id > 0 && (
            <Standings
              rows={county.previousStandings}
              title="Previous season"
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
function Standings({
  rows,
  title,
  viewerId,
}: {
  rows: Standing[];
  title: string;
  viewerId: string | null;
}) {
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
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.pilot}
                className={row.pilot === viewerId ? 'your-rank' : ''}
              >
                <td>{String(i + 1).padStart(2, '0')}</td>
                <td>
                  {row.callsign}
                  {row.pilot === viewerId ? ' · You' : ''}
                </td>
                <td>{row.jobs}</td>
                <td>{row.precision.toFixed(1)}%</td>
                <td>{money(row.earnings)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
