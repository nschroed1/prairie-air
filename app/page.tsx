'use client';

/* oxlint-disable next/no-html-link-for-pages -- Sites sign-in must use a top-level native anchor, not the app router. */
/* oxlint-disable react/react-compiler -- The Three.js engine is an intentionally mutable external system; HUD state is refreshed on an explicit timer, and this component opts out of compiler memoization. */

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  Plane,
  Wind,
  Sun,
  Pause,
  Play,
  Volume2,
  VolumeX,
  Expand,
  Crosshair,
  Sprout,
  MapPin,
  HelpCircle,
  RotateCcw,
  Check,
  Trophy,
  Droplets,
  Gauge,
  Wrench,
  BriefcaseBusiness,
  Globe,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  Simulation,
  freshControls,
  loadCareer,
  contracts,
  upgradePrice,
  type Contract,
} from '@/lib/simulation';
import { registerFlightTools, registerCountyTools } from '@/lib/webmcp';
import type { World } from '@/lib/world';
import { CountyClient } from '@/lib/county-client';
import { CountyPanel } from '@/components/county-panel';
import type { CountyJob, PublicPilot, Action } from '@/lib/county';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
type Panel = 'contracts' | 'hangar' | 'help' | 'county' | 'standings' | null;

export default function Home() {
  'use no memo'; // The imperative flight engine supplies a fresh HUD tick at 10 Hz.
  const mount = useRef<HTMLDivElement>(null),
    map = useRef<HTMLCanvasElement>(null),
    world = useRef<World | null>(null);
  const [sim] = useState(() => new Simulation());
  const controls = useRef(freshControls());
  const [revision, refresh] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [panel, setPanel] = useState<Panel>(null),
    [muted, setMuted] = useState(true);
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<'public' | 'practice'>('public');
  const [client] = useState(
    () =>
      new CountyClient(
        sim,
        () => refresh((v) => v + 1),
        (message) => setNotice(message),
      ),
  );
  const county = client.snapshot;
  useEffect(() => {
    void client.start();
    return () => client.dispose();
  }, [client]);
  useEffect(() => {
    world.current?.setCounty(mode === 'public' ? county : null);
  }, [county, mode, revision]);
  const onlineAction = useCallback(
    async (action: Action) => {
      Object.assign(controls.current, freshControls());
      await client.action(action);
      refresh((v) => v + 1);
    },
    [client],
  );
  const save = useCallback(() => {
    try {
      localStorage.setItem('prairie-air-career-v1', JSON.stringify(sim.career));
    } catch {
      setNotice(
        'Your browser could not save this career. You can keep flying this session.',
      );
    }
    refresh((v) => v + 1);
  }, [sim]);
  useEffect(() => {
    let disposed = false;
    import('@/lib/world')
      .then(({ World }) => {
        if (disposed || !mount.current) return;
        try {
          world.current = new World(mount.current, sim, controls.current);
          world.current.beforeStep = (dt) =>
            client.record(dt, controls.current);
          setReady(true);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'WebGL could not start');
        }
      })
      .catch(() => {
        if (!disposed)
          setError(
            'The flight engine could not load. Please reload and try again.',
          );
      });
    const timer = setInterval(() => refresh((v) => v + 1), 100);
    return () => {
      disposed = true;
      clearInterval(timer);
      world.current?.dispose();
    };
  }, [sim, client]);
  useEffect(() => {
    if (!ready) return;
    if (mode === 'public')
      return registerCountyTools(client, () => {
        setPanel(null);
        refresh((v) => v + 1);
      });
    return registerFlightTools(sim, controls.current, () => {
      setPanel(null);
      refresh((v) => v + 1);
    });
  }, [ready, sim, mode, client]);
  useEffect(() => {
    const binding: Record<string, keyof ReturnType<typeof freshControls>> = {
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      KeyW: 'up',
      ArrowUp: 'up',
      KeyS: 'down',
      ArrowDown: 'down',
      ShiftLeft: 'faster',
      ShiftRight: 'faster',
      ControlLeft: 'slower',
      ControlRight: 'slower',
      Space: 'spray',
    };
    const down = (e: KeyboardEvent) => {
      if (panel) return;
      if (binding[e.code]) {
        if (sim.phase === 'flying') {
          e.preventDefault();
          controls.current[binding[e.code]] = true;
        }
      }
      if (e.repeat) return;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (mode === 'public') {
          void onlineAction(sim.phase === 'flying' ? 'pause' : 'resume');
        } else if (sim.phase === 'flying') sim.phase = 'paused';
        else if (sim.phase === 'paused') sim.phase = 'flying';
      }
      if (e.code === 'KeyC' && world.current)
        world.current.cameraMode = 1 - world.current.cameraMode;
      if (e.code === 'KeyR' && sim.phase === 'flying') {
        if (mode === 'public') void onlineAction('refill');
        else sim.refill();
      }
      if (e.code === 'Enter' && sim.phase === 'flying') {
        if (mode === 'public') void onlineAction('finish');
        else if (sim.finish()) save();
      }
      refresh((v) => v + 1);
    };
    const up = (e: KeyboardEvent) => {
      if (binding[e.code]) controls.current[binding[e.code]] = false;
    };
    const blur = () => {
      Object.assign(controls.current, freshControls());
      if (sim.phase === 'flying') {
        if (mode === 'public' && client.online) void onlineAction('pause');
        sim.phase = 'paused';
      }
    };
    const visibility = () => {
      if (document.hidden) blur();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [panel, sim, save, mode, client, onlineAction]);
  useEffect(() => {
    drawMap(
      map.current,
      sim,
      mode === 'public' ? county?.pilots : undefined,
      county?.viewerId,
    );
  }, [revision, sim, county, mode]);
  const start = (job: Contract = sim.job) => {
    if (mode === 'public') {
      void onlineAction('retry');
      return;
    }
    sim.reset(job);
    setPanel(null);
    Object.assign(controls.current, freshControls());
    refresh((v) => v + 1);
  };
  const open = (next: Panel) => {
    if (sim.phase === 'flying') {
      if (mode === 'public') void onlineAction('pause');
      else sim.phase = 'paused';
    }
    Object.assign(controls.current, freshControls());
    setPanel(mode === 'public' && next === 'contracts' ? 'county' : next);
  };
  const pause = () => {
    if (mode === 'public') {
      void onlineAction(sim.phase === 'flying' ? 'pause' : 'resume');
      return;
    }
    sim.phase = sim.phase === 'flying' ? 'paused' : 'flying';
    Object.assign(controls.current, freshControls());
    refresh((v) => v + 1);
  };
  const finish = () => {
    if (mode === 'public') {
      void onlineAction('finish');
      return;
    }
    if (sim.finish()) save();
  };
  const joinCounty = async () => {
    setMode('public');
    if (await client.action('join')) setPanel('county');
  };
  const claim = async (job: CountyJob) => {
    if (!client.online && !(await client.action('join'))) return;
    if (await client.action('claim', { jobId: job.id })) {
      setPanel(null);
      setMode('public');
    }
  };
  const practice = () => {
    client.disconnect();
    setMode('practice');
    try {
      sim.career = loadCareer(localStorage.getItem('prairie-air-career-v1'));
    } catch {}
    sim.reset(contracts[0]);
    refresh((v) => v + 1);
  };
  const active = sim.phase !== 'ready',
    fly = sim.phase === 'flying';
  const heading =
    ((Math.round((sim.heading * 180) / Math.PI) % 360) + 360) % 360;
  const sprayMessage =
    sim.tank <= 0
      ? 'Tank empty · press R to refill'
      : sim.altitude > 30
        ? 'Descend below 98 ft to spray'
        : sim.altitude < 6
          ? 'Too low · climb above 20 ft'
          : Math.abs(sim.roll) > 0.52
            ? 'Level your wings to spray'
            : sim.speed >= 61
              ? 'Slow below 136 mph'
              : sim.spraying
                ? sim.inField
                  ? 'Good pass · applying treatment'
                  : 'Outside your field · spray is wasted'
                : 'Ready for a clean pass';
  return (
    <main className="game-shell">
      <div ref={mount} className="world-canvas" />
      <div className="screen-shade" />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Prairie Air home">
          <span className="brand-icon">
            <Plane size={24} />
          </span>
          <span>
            PRAIRIE<span className="brand-air">AIR</span>
            <small>A LITTLE CLOSER TO THE LAND</small>
          </span>
        </Link>
        <nav aria-label="Game navigation">
          <button
            className={!panel ? 'nav-active' : ''}
            onClick={() => setPanel(null)}
          >
            <Plane size={16} />
            Fly
          </button>
          <button
            className={
              panel === 'contracts' || panel === 'county' ? 'nav-active' : ''
            }
            onClick={() => open('contracts')}
          >
            <BriefcaseBusiness size={16} />
            {mode === 'public' ? 'County' : 'Contracts'}{' '}
            <span className="nav-count">
              {mode === 'public'
                ? (county?.jobs.filter((j) => j.status === 'open').length ??
                  '—')
                : 3}
            </span>
          </button>
          <button
            className={panel === 'hangar' ? 'nav-active' : ''}
            onClick={() => open('hangar')}
          >
            <Wrench size={16} />
            Hangar
          </button>
          <button
            className={panel === 'standings' ? 'nav-active' : ''}
            onClick={() => open('standings')}
          >
            <Trophy size={16} />
            Standings
          </button>
        </nav>
        <div className="wallet">
          <span className="wallet-dot" />
          <div>
            <small>YOUR EARNINGS</small>
            <strong>{money(sim.career.cash)}</strong>
          </div>
          <span className="avatar">{mode === 'public' ? 'PA' : 'SOLO'}</span>
        </div>
      </header>
      <div className="location">
        <span className="live-dot" /> BLACK HAWK COUNTY, IOWA{' '}
        <span className="location-line" /> <span>42.47° N &nbsp; 92.31° W</span>
      </div>
      <button className="county-status" onClick={() => open('county')}>
        <Globe size={13} />
        {mode === 'practice'
          ? 'SOLO PRACTICE'
          : county
            ? `SEASON ${county.season.number} · ${county.season.phase.toUpperCase()} · ${county.pilots.length} PILOTS`
            : 'CONNECTING TO COUNTY'}
        <span className="live-dot" />
      </button>
      <div className="weather">
        <Sun size={23} />
        <div>
          <strong>
            72° <span>Clear skies</span>
          </strong>
          <small>
            <Wind size={13} /> SW 6 kt <span>·</span> 8:42 AM
          </small>
        </div>
      </div>
      {active && (
        <div className="compass">
          <span>
            {
              ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
                Math.round(((heading + 270) % 360) / 45) % 8
              ]
            }
          </span>
          <i />
          <span>
            {
              ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
                Math.round(((heading + 315) % 360) / 45) % 8
              ]
            }
          </span>
          <i />
          <b>{String(heading).padStart(3, '0')}°</b>
          <i />
          <span>
            {
              ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
                Math.round(((heading + 45) % 360) / 45) % 8
              ]
            }
          </span>
          <i />
          <span>
            {
              ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][
                Math.round(((heading + 90) % 360) / 45) % 8
              ]
            }
          </span>
        </div>
      )}
      {!active && (
        <section className="welcome">
          <div className="eyebrow">
            <span /> A NEW DAY. A NEW HORIZON.
          </div>
          <h1>
            Good morning,
            <br />
            <em>pilot.</em>
          </h1>
          <p>
            Big skies. Open fields.
            <br />A good day to do a little good.
          </p>
          <button
            className="primary launch"
            onClick={() => {
              if (mode === 'public') void joinCounty();
              else start();
            }}
            disabled={!ready || (mode === 'public' && !county?.viewerId)}
          >
            {ready
              ? mode === 'public'
                ? 'Join public county'
                : 'Take flight'
              : 'Preparing your aircraft…'}
            <ArrowUpRight size={21} />
          </button>
          {mode === 'public' && county && !county.viewerId && (
            <a
              className="signin-link"
              href="/signin-with-chatgpt?return_to=/"
              target="_top"
            >
              Sign in with ChatGPT to join
            </a>
          )}
          <button className="practice-link" onClick={practice}>
            Solo practice
          </button>
          <span className="launch-note">
            {mode === 'public'
              ? 'ONE PUBLIC COUNTY. 60 CONTRACTS. EVERY ACRE COUNTS.'
              : 'PRACTICE FLIGHTS DO NOT ENTER THE LEADERBOARDS.'}
          </span>
        </section>
      )}
      <aside className={`mission-card ${active ? 'mission-active' : ''}`}>
        <div className="card-eyebrow">
          <span className="live-dot" />
          {mode === 'public'
            ? county?.player?.activeJob
              ? 'COUNTY CONTRACT'
              : 'PUBLIC COUNTY'
            : active
              ? 'CURRENT CONTRACT'
              : 'YOUR FIRST CONTRACT'}
          <span>
            {mode === 'public'
              ? `SEASON ${county?.season.number ?? 1}`
              : `0${sim.job.id + 1} / 03`}
          </span>
        </div>
        {mode === 'public' && sim.phase === 'ready' ? (
          <>
            <div className="mission-title">
              <h2>A season to remember.</h2>
              <Sprout size={24} />
            </div>
            <p className="mission-note">
              {county?.jobs.filter((j) => j.status === 'open').length ?? '—'}{' '}
              fields are ready for a pilot. The whole county shares 60 jobs this
              season.
            </p>
            <div className="mission-reward">
              <div>
                <small>COMPLETED TOGETHER</small>
                <strong>
                  {county?.jobs.filter((j) => j.status === 'complete').length ??
                    0}{' '}
                  / 60
                </strong>
              </div>
              <div>
                <small>IN THE COUNTY</small>
                <strong>{county?.pilots.length ?? 0} pilots</strong>
              </div>
            </div>
            <button className="text-button" onClick={() => open('county')}>
              Explore county contracts
              <ArrowUpRight size={15} />
            </button>
          </>
        ) : (
          <>
            {' '}
            <div className="mission-title">
              <div>
                <h2>
                  {mode === 'public' && !county?.player?.activeJob
                    ? 'The county awaits.'
                    : sim.job.name}
                </h2>
                <p>
                  <MapPin size={13} />
                  {mode === 'public' && !county?.player?.activeJob
                    ? 'Black Hawk County'
                    : sim.job.farmer}
                </p>
              </div>
              <span className="crop-icon">
                <Sprout size={24} />
              </span>
            </div>
            <div className="mission-details">
              <span>
                {sim.job.acres} acres of {sim.job.crop}
              </span>
              <span>·</span>
              <span>{sim.job.treatment}</span>
            </div>
            {active ? (
              <>
                <div className="coverage-label">
                  <span>Field coverage</span>
                  <strong>
                    {sim.coverage.toFixed(1)}
                    <small>%</small>
                  </strong>
                </div>
                <div className="coverage-track">
                  <Progress value={sim.coverage} aria-label="Field coverage" />
                  <span
                    className="target-mark"
                    style={{ left: `${sim.job.target}%` }}
                  />
                </div>
                <div className="targets">
                  <span>{sim.job.target}% to complete</span>
                  <span>{sim.job.bonusTarget}% for bonus</span>
                </div>
              </>
            ) : (
              <p className="mission-note">
                A little care goes a long way.
                <br />
                Give the Millers’ corn a healthy start.
              </p>
            )}
            <div className="mission-reward">
              <div>
                <small>CONTRACT PAY</small>
                <strong>{money(sim.job.pay)}</strong>
              </div>
              <div>
                <small>PRECISION BONUS</small>
                <strong className="bonus">+{money(sim.job.bonus)}</strong>
              </div>
            </div>
            {active && sim.coverage >= sim.job.target && fly && (
              <button className="primary claim" onClick={finish}>
                Complete contract
                <Check size={17} />
              </button>
            )}
            {!active && (
              <button className="text-button" onClick={() => open('contracts')}>
                View all contracts
                <ArrowUpRight size={15} />
              </button>
            )}
          </>
        )}
      </aside>
      {!active && (
        <div className="scene-label">
          <span className="scene-dot" />
          <div>
            <strong>THE HEARTLAND</strong>
            <small>Summer in Cedar Valley</small>
          </div>
        </div>
      )}
      {active && (
        <>
          <div
            className={`flight-message ${sim.spraying && sim.validSpray && sim.inField ? 'spray-good' : ''}`}
          >
            <span className="live-dot" />
            {mode === 'public' && !county?.player?.activeJob
              ? 'Free flight · choose a county contract to earn'
              : sim.message || sprayMessage}
          </div>
          <div className="reticle">
            <span />
            <i />
            <span />
          </div>
        </>
      )}
      <div className="bottom-hud">
        <div className="controls-hint">
          <span>
            <kbd>W</kbd>
            <kbd>S</kbd> Pitch
          </span>
          <span>
            <kbd>A</kbd>
            <kbd>D</kbd> Bank
          </span>
          <span>
            <kbd>SPACE</kbd> Spray
          </span>
          <button onClick={() => open('help')} title="Flight controls">
            <HelpCircle size={17} />
          </button>
        </div>
        {active && (
          <div className="instruments">
            <div>
              <small>AIRSPEED</small>
              <strong>
                {Math.round(sim.speed * 2.237)}
                <span>mph</span>
              </strong>
            </div>
            <div className="altitude">
              <small>ALTITUDE AGL</small>
              <strong
                className={
                  sim.altitude < 6 || sim.altitude > 30 ? 'warning' : ''
                }
              >
                {Math.round(sim.altitude * 3.281)}
                <span>ft</span>
              </strong>
              <span className="altitude-hint">SWEET SPOT 20–98 FT</span>
            </div>
            <div>
              <small>SPRAY TANK</small>
              <strong>
                {Math.round((sim.tank / sim.tankCapacity) * 100)}
                <span>%</span>
              </strong>
              <Progress
                value={(sim.tank / sim.tankCapacity) * 100}
                aria-label="Spray tank"
              />
            </div>
            <button
              className={`spray-button ${sim.spraying ? 'spraying' : ''}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                controls.current.spray = true;
              }}
              onPointerUp={() => (controls.current.spray = false)}
              onPointerCancel={() => (controls.current.spray = false)}
            >
              <Droplets size={19} />
              <span>{sim.spraying ? 'SPRAYING' : 'HOLD TO SPRAY'}</span>
              <kbd>SPACE</kbd>
            </button>
          </div>
        )}
        <div className="view-controls">
          {active && (
            <button
              onClick={pause}
              title={fly ? 'Pause flight' : 'Resume flight'}
            >
              {fly ? <Pause size={17} /> : <Play size={17} />}
            </button>
          )}
          <button
            onClick={() => {
              if (world.current)
                world.current.cameraMode = 1 - world.current.cameraMode;
            }}
            title="Change camera (C)"
          >
            <Crosshair size={17} />
          </button>
          <button
            onClick={() => setMuted(!muted)}
            title={muted ? 'Enable engine sound' : 'Mute engine sound'}
          >
            {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
          </button>
          <button
            onClick={() => {
              if (!document.fullscreenElement)
                document.documentElement
                  .requestFullscreen?.()
                  .catch(() =>
                    setNotice('Fullscreen is not available in this browser.'),
                  );
              else void document.exitFullscreen?.();
            }}
            title="Fullscreen"
          >
            <Expand size={17} />
          </button>
        </div>
      </div>
      <aside className="minimap">
        <div>
          <span>
            <span className="live-dot" /> FIELD MAP
          </span>
          <b>N ↑</b>
        </div>
        <canvas
          ref={map}
          width={340}
          height={240}
          aria-label="Map showing your aircraft and assigned field"
        />
        <footer>
          <span className="map-key" /> Your field{' '}
          <span className="map-plane">✦</span> You
        </footer>
      </aside>
      {active && (
        <div className="touch-controls">
          {(['left', 'up', 'down', 'right'] as const).map((key, i) => (
            <button
              key={key}
              aria-label={key}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                controls.current[key] = true;
              }}
              onPointerUp={() => (controls.current[key] = false)}
              onPointerCancel={() => (controls.current[key] = false)}
            >
              {['←', '↑', '↓', '→'][i]}
            </button>
          ))}
        </div>
      )}
      {sim.phase === 'paused' && !panel && (
        <div className="state-overlay">
          <div className="state-card">
            <Pause size={28} />
            <span className="eyebrow">TAKE A BREATHER</span>
            <h2>Holding your place.</h2>
            <p>
              {mode === 'public'
                ? 'The county keeps flying. Your claim expires after two minutes without new coverage.'
                : 'The fields will be right here.'}
            </p>
            {mode === 'public' && !client.online && (
              <button className="primary" onClick={() => void joinCounty()}>
                Reconnect to county
              </button>
            )}
            <button className="primary" onClick={pause}>
              Resume flight
              <Play size={17} />
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (mode === 'public') void onlineAction('refill');
                else sim.refill();
                refresh((v) => v + 1);
              }}
            >
              Return to field & refill
            </button>
          </div>
        </div>
      )}
      {sim.phase === 'crashed' && (
        <div className="state-overlay">
          <div className="state-card">
            <RotateCcw size={30} />
            <span className="eyebrow">A ROUGH LANDING</span>
            <h2>A little too close.</h2>
            <p>
              Keep at least 20 ft above the ground. Try a gentler approach on
              your next pass.
            </p>
            <button className="primary" onClick={() => start()}>
              Try this contract again
              <ArrowUpRight size={17} />
            </button>
          </div>
        </div>
      )}
      {sim.phase === 'complete' && (
        <div className="state-overlay">
          <div className="state-card success">
            <Trophy size={38} />
            <span className="eyebrow">A JOB WELL DONE</span>
            <h2>
              {sim.result.bonus ? 'Above and beyond.' : 'The fields thank you.'}
            </h2>
            <p>
              {sim.result.coverage.toFixed(1)}% covered for {sim.job.farmer}.
            </p>
            <strong className="result-pay">
              +{money(sim.result.pay + sim.result.bonus)}
            </strong>
            {sim.result.bonus > 0 && (
              <p className="bonus">
                Includes {money(sim.result.bonus)} precision bonus
              </p>
            )}
            <button
              className="primary"
              onClick={() => {
                sim.phase = 'paused';
                open('contracts');
              }}
            >
              Find your next job
              <ArrowUpRight size={17} />
            </button>
            <button
              className="secondary"
              onClick={() => {
                sim.phase = 'paused';
                open('hangar');
              }}
            >
              Visit the hangar
              <Wrench size={16} />
            </button>
          </div>
        </div>
      )}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent className="game-dialog">
          <DialogTitle>
            {panel === 'county' || panel === 'standings'
              ? 'The heartland, together.'
              : panel === 'contracts'
                ? 'Good work, waiting for you.'
                : panel === 'hangar'
                  ? 'Make this bird your own.'
                  : 'A feel for the flying.'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'county' || panel === 'standings'
              ? 'A shared sky. A finite season. Your name on the board.'
              : panel === 'contracts'
                ? 'Three local farms. A whole lot of possibility.'
                : panel === 'hangar'
                  ? `Your crop duster · ${money(sim.career.cash)} available`
                  : 'A few simple controls. Plenty of room to get better.'}
          </DialogDescription>
          {(panel === 'county' || panel === 'standings') &&
            (county ? (
              <CountyPanel
                key={panel}
                county={county}
                initialTab={panel === 'standings' ? 'standings' : 'fields'}
                claim={(job) => void claim(job)}
                rename={(name) => {
                  void client.action('rename', { callsign: name });
                }}
                freeFlight={() => {
                  void (async () => {
                    setMode('public');
                    if (!client.online && !(await client.action('join')))
                      return;
                    if (await client.action('resume')) setPanel(null);
                  })();
                }}
                release={() => {
                  void client.action('release');
                }}
                pending={client.pending}
              />
            ) : (
              <div className="county-empty">
                <p>{client.status}</p>
                <button
                  className="secondary"
                  onClick={() => void client.poll()}
                >
                  Reconnect
                </button>
              </div>
            ))}
          {panel === 'contracts' && (
            <div className="contract-list">
              {contracts.map((job, i) => (
                <article className="contract-row" key={job.id}>
                  <div className="contract-number">0{i + 1}</div>
                  <div className="contract-info">
                    <small>
                      {job.farmer}{' '}
                      {sim.career.completed.includes(job.id) && (
                        <Check size={14} />
                      )}
                    </small>
                    <h3>{job.name}</h3>
                    <p>{job.note}</p>
                    <div className="tags">
                      <span>{job.crop}</span>
                      <span>{job.treatment}</span>
                      <span>{job.target}% coverage</span>
                    </div>
                  </div>
                  <div className="contract-action">
                    <strong>{money(job.pay)}</strong>
                    <small>+{money(job.bonus)} bonus</small>
                    <button className="primary" onClick={() => start(job)}>
                      Fly contract
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {panel === 'hangar' && (
            <div className="upgrade-list">
              {(
                [
                  {
                    key: 'tank',
                    name: 'A little more in the tank',
                    description:
                      '40% more capacity per level. Spend longer over the field before refilling.',
                    Icon: Droplets,
                  },
                  {
                    key: 'boom',
                    name: 'Make every pass count',
                    description:
                      '18 m more spray width per level. Cover more ground in fewer passes.',
                    Icon: Sprout,
                  },
                  {
                    key: 'stability',
                    name: 'Steady as she goes',
                    description:
                      'Reduce wind drift and keep a cleaner line across your field.',
                    Icon: Gauge,
                  },
                ] as const
              ).map(({ key, name, description, Icon }) => (
                <article className="upgrade-row" key={key}>
                  <span className="upgrade-icon">
                    <Icon size={25} />
                  </span>
                  <div>
                    <small>LEVEL {sim.career.upgrades[key]} / 3</small>
                    <h3>{name}</h3>
                    <p>{description}</p>
                  </div>
                  <button
                    className="secondary"
                    disabled={
                      sim.career.upgrades[key] >= 3 ||
                      sim.career.cash <
                        upgradePrice(key, sim.career.upgrades[key])
                    }
                    onClick={() => {
                      if (mode === 'public') {
                        void client.action('upgrade', { upgrade: key });
                      } else if (sim.buy(key)) save();
                    }}
                  >
                    {sim.career.upgrades[key] >= 3
                      ? 'Fully upgraded'
                      : money(upgradePrice(key, sim.career.upgrades[key]))}
                  </button>
                </article>
              ))}
              <p className="save-note">
                {mode === 'public'
                  ? 'Your career and upgrades are saved to your signed-in pilot. Earn your first upgrade by completing a county contract.'
                  : 'Practice career is saved only in this browser.'}
              </p>
            </div>
          )}
          {panel === 'help' && (
            <div className="help-content">
              <div className="key-grid">
                {[
                  ['W / ↑', 'Climb'],
                  ['S / ↓', 'Descend'],
                  ['A / D', 'Bank & turn'],
                  ['SPACE', 'Hold to spray'],
                  ['SHIFT / CTRL', 'Faster / slower'],
                  ['C', 'Change camera'],
                  ['P / ESC', 'Pause'],
                  ['R', 'Refill & return to field'],
                  ['ENTER', 'Claim completed contract'],
                ].map(([key, label]) => (
                  <div key={key}>
                    <kbd>{key}</kbd>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
              <div className="help-tip">
                <Sprout size={23} />
                <p>
                  Stay <b>20–98 ft</b> above the ground, below <b>136 mph</b>,
                  with level wings. Spray straight parallel strips inside the
                  marked field. Release the spray during turns. Covered ground
                  turns light green on your map.
                </p>
              </div>
              <p className="save-note">
                Refills are free in this MVP and keep your coverage. A crash
                restarts the contract. Fly on for the bonus, then claim your
                payment.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {error && (
        <div className="state-overlay">
          <div className="state-card">
            <h2>We couldn’t start the engine.</h2>
            <p>
              This game needs a browser with WebGL 2 and hardware acceleration
              enabled.
            </p>
            <p className="error-detail">{error}</p>
            <button className="primary" onClick={() => location.reload()}>
              Try again
            </button>
          </div>
        </div>
      )}
      {notice && (
        <button className="notice" onClick={() => setNotice('')}>
          {notice} <Check size={16} />
        </button>
      )}
      <EngineSound sim={sim} muted={muted} />
    </main>
  );
}

function drawMap(
  canvas: HTMLCanvasElement | null,
  sim: Simulation,
  pilots: PublicPilot[] = [],
  viewerId?: string | null,
) {
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas) return;
  const w = canvas.width,
    h = canvas.height,
    scale = 0.13,
    cx = sim.job.x,
    cz = sim.job.z;
  const px = (x: number) => (x - cx) * scale + w / 2,
    pz = (z: number) => (z - cz) * scale + h / 2;
  ctx.fillStyle = '#354e37';
  ctx.fillRect(0, 0, w, h);
  for (let x = -3; x <= 3; x++)
    for (let z = -3; z <= 3; z++) {
      ctx.fillStyle =
        (x + z) % 3 === 0
          ? '#61783a'
          : (x - z) % 3 === 0
            ? '#3e633c'
            : '#4e6c3e';
      ctx.fillRect(
        px(cx + x * 510 - 230),
        pz(cz + z * 510 - 228),
        460 * scale,
        456 * scale,
      );
    }
  ctx.strokeStyle = '#96a17e';
  ctx.lineWidth = 2;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(px(cx + i * 510 + 255), 0);
    ctx.lineTo(px(cx + i * 510 + 255), h);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pz(cz + i * 510 + 255));
    ctx.lineTo(w, pz(cz + i * 510 + 255));
    ctx.stroke();
  }
  ctx.strokeStyle = '#6fa0a3';
  ctx.lineWidth = 12;
  ctx.beginPath();
  for (let z = cz - 1200; z < cz + 1200; z += 30) {
    const x = 980 + Math.sin(z * 0.0017) * 260 + Math.sin(z * 0.0033) * 65;
    ctx.lineTo(px(x), pz(z));
  }
  ctx.stroke();
  ctx.fillStyle = '#c5dd6540';
  ctx.fillRect(
    px(sim.job.x - 228),
    pz(sim.job.z - 228),
    456 * scale,
    456 * scale,
  );
  ctx.fillStyle = '#c4ee88';
  sim.covered.forEach((n) =>
    ctx.fillRect(
      px(sim.job.x - 228 + (n % 38) * 12),
      pz(sim.job.z - 228 + Math.floor(n / 38) * 12),
      12 * scale + 0.1,
      12 * scale + 0.1,
    ),
  );
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d1e795';
  ctx.strokeRect(
    px(sim.job.x - 228),
    pz(sim.job.z - 228),
    456 * scale,
    456 * scale,
  );
  ctx.setLineDash([]);
  const xx = Math.max(10, Math.min(w - 10, px(sim.x))),
    zz = Math.max(10, Math.min(h - 10, pz(sim.z)));
  ctx.save();
  ctx.translate(xx, zz);
  ctx.rotate(sim.heading);
  ctx.shadowColor = '#fff4ae';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#fff6cb';
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.lineTo(6, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-6, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  for (const pilot of pilots) {
    if (pilot.id === viewerId || pilot.phase !== 'flying') continue;
    ctx.save();
    ctx.translate(px(pilot.x), pz(pilot.z));
    ctx.rotate(pilot.heading);
    ctx.fillStyle = '#92ddff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 4);
    ctx.lineTo(0, 2);
    ctx.lineTo(-4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

function EngineSound({ sim, muted }: { sim: Simulation; muted: boolean }) {
  useEffect(() => {
    if (muted) return;
    const AudioCtx = window.AudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const gain = ctx.createGain();
    gain.gain.value = 0.022;
    gain.connect(ctx.destination);
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 65;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    osc.connect(filter);
    filter.connect(gain);
    osc.start();
    ctx.resume().catch(() => {});
    const timer = setInterval(() => {
      osc.frequency.setTargetAtTime(35 + sim.speed, ctx.currentTime, 0.2);
      gain.gain.setTargetAtTime(
        sim.phase === 'flying' ? 0.024 : 0.008,
        ctx.currentTime,
        0.2,
      );
    }, 200);
    return () => {
      clearInterval(timer);
      osc.stop();
      void ctx.close();
    };
  }, [muted, sim]);
  return null;
}
