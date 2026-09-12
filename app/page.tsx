'use client';

/* oxlint-disable next/no-html-link-for-pages -- Native navigation keeps account and game links working around the deployed Vinext router failure. */
/* oxlint-disable react/react-compiler -- The Three.js engine is an intentionally mutable external system; HUD state is refreshed on an explicit timer, and this component opts out of compiler memoization. */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Plane,
  ArrowDown,
  Sun,
  Cloud,
  CloudRain,
  Haze,
  Pause,
  Play,
  Expand,
  Crosshair,
  Sprout,
  MapPin,
  HelpCircle,
  RotateCcw,
  Check,
  Trophy,
  Droplets,
  Wrench,
  BriefcaseBusiness,
  Globe,
  ArrowUpDown,
  Wind,
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
  freshCareer,
  OVERSPRAY_PENALTY_PER_ACRE,
  fieldSize,
  fields,
  type Contract,
} from '@/lib/simulation';
import { fieldOutline } from '@/lib/field-geometry';
import { registerFlightTools, registerCountyTools } from '@/lib/webmcp';
import type { World } from '@/lib/world';
import { LESSON_WEATHER, practiceWeather, windLabel } from '@/lib/weather';
import { isLocalStorm, LOCAL_STORM, stormContract } from '@/lib/local-storm';
import { CountyClient } from '@/lib/county-client';
import { CountyPanel } from '@/components/county-panel';
import {
  Hangar,
  UpgradeGoal,
  RivalGoal,
  useCareerPreferences,
} from '@/components/career-goals';
import { ChallengeHUD } from '@/components/flight-challenge';
import {
  birdFlock,
  locustSwarm,
  tornadoState,
  prepareContract,
} from '@/lib/challenge';
import { CountyForecast } from '@/components/county-forecast';
import {
  useGameAudio,
  SoundControls,
  WelcomeAudio,
} from '@/components/game-audio';
import {
  rivalRace,
  upgradeGoal,
  upgradeNames,
  upgradeStat,
  type UpgradeKey,
} from '@/lib/progression';
import {
  FlightBriefing,
  FlightCoach,
  FlightDebrief,
  FieldPlot,
} from '@/components/flight-lesson';
import {
  nextPass,
  lineUpLesson,
  spraySafety,
  sprayFootprint,
  loadPracticeBests,
  isPersonalBest,
  type PracticeBests,
  type PracticeBest,
} from '@/lib/flight-guidance';
import type { CountyJob, PublicPilot, Action } from '@/lib/county';
import {
  SkyBriefing,
  SkyMission,
  SkyDebrief,
  SkyJobOffer,
  drawSkyMap,
} from '@/components/skywriting';
import {
  skywritingContract,
  skywritingAvailable,
  skyGuidance,
  SKYWRITING_PRACTICE_ID,
} from '@/lib/skywriting';
import { SkywritingPractice } from '@/lib/skywriting-practice';

const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
type Panel =
  | 'briefing'
  | 'contracts'
  | 'hangar'
  | 'help'
  | 'county'
  | 'standings'
  | null;

export default function Home() {
  'use no memo'; // The imperative flight engine supplies a fresh HUD tick at 10 Hz.
  const mount = useRef<HTMLDivElement>(null),
    map = useRef<HTMLCanvasElement>(null),
    world = useRef<World | null>(null);
  const [sim] = useState(() => new Simulation());
  const skyPractice = useRef(new SkywritingPractice());
  const controls = useRef(freshControls());
  const manualControls = useRef(freshControls());
  const [reducedMotion, setReducedMotion] = useState(false);
  const reducedMotionRef = useRef(false);
  const invertPitchRef = useRef(false);
  const briefingTitle = useRef<HTMLHeadingElement>(null);
  const [revision, refresh] = useState(0),
    [ready, setReady] = useState(false),
    [error, setError] = useState(''),
    [panel, setPanel] = useState<Panel>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(''), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [guideEnabled, setGuideEnabled] = useState(true);
  const [invertPitch, setInvertPitch] = useState(false);
  const [mapZoom, setMapZoom] = useState<'field' | 'sector' | 'county'>(
    'field',
  );
  const [trackUp, setTrackUp] = useState(false);

  useEffect(() => {
    try {
      setReducedMotion(
        localStorage.getItem('prairie-air-motion') === 'reduced' ||
          (localStorage.getItem('prairie-air-motion') === null &&
            matchMedia('(prefers-reduced-motion: reduce)').matches),
      );
      if (localStorage.getItem('prairie-air-invert-pitch') === '1') {
        setInvertPitch(true);
      }
      const saved = localStorage.getItem('prairie-air-map-zoom');
      if (saved === 'sector' || saved === 'county') {
        setMapZoom(saved);
      }
    } catch {}
  }, []);
  useEffect(() => {
    reducedMotionRef.current = reducedMotion;
    if (world.current) world.current.reducedMotion = reducedMotion;
  }, [reducedMotion, ready]);
  useEffect(() => {
    invertPitchRef.current = invertPitch;
    if (world.current) world.current.invertPitch = invertPitch;
  }, [invertPitch, ready]);
  const toggleMapZoom = useCallback(() => {
    setMapZoom((prev) => {
      const next =
        prev === 'field' ? 'sector' : prev === 'sector' ? 'county' : 'field';
      try {
        localStorage.setItem('prairie-air-map-zoom', next);
      } catch {}
      return next;
    });
  }, []);
  const [gamepadConnected, setGamepadConnected] = useState(false);
  const prevGamepadButtons = useRef<Record<number, boolean>>({});
  const [labField, setLabField] = useState(0);
  const [labWeather, setLabWeather] = useState<
    'calm' | 'breeze' | 'gale' | 'storm'
  >('breeze');
  const [labHazard, setLabHazard] = useState(1);

  useEffect(() => {
    const onConnect = () => setGamepadConnected(true);
    const onDisconnect = () => setGamepadConnected(false);
    window.addEventListener('gamepadconnected', onConnect);
    window.addEventListener('gamepaddisconnected', onDisconnect);
    return () => {
      window.removeEventListener('gamepadconnected', onConnect);
      window.removeEventListener('gamepaddisconnected', onDisconnect);
    };
  }, []);
  const bests = useRef<PracticeBests>({});
  const [bestResult, setBestResult] = useState<{
    isBest: boolean;
    previous?: PracticeBest;
  }>({ isBest: false });
  const [mode, setMode] = useState<'public' | 'practice'>('public');
  const [localStorm, setLocalStorm] = useState(false);
  const [localChallenge, setLocalChallenge] = useState(false);
  const [client] = useState(
    () =>
      new CountyClient(
        sim,
        () => refresh((v) => v + 1),
        (message) => setNotice(message),
      ),
  );
  const county = client.snapshot;
  const sound = useGameAudio(sim, {
    menu:
      sim.phase === 'ready' ||
      sim.phase === 'complete' ||
      panel === 'hangar' ||
      panel === 'briefing',
    assigned: mode === 'practice' || Boolean(county?.player?.activeJob),
    scope: `${mode}:${county?.viewerId ?? 'guest'}`,
  });
  const soundRef = useRef(sound);
  useEffect(() => {
    soundRef.current = sound;
  }, [sound]);
  const { cue: playSound } = sound;
  const publicPreferences = useCareerPreferences(
    `pilot:${county?.viewerId ?? 'guest'}`,
  );
  const practicePreferences = useCareerPreferences('practice');
  const preferences =
    mode === 'practice' ? practicePreferences : publicPreferences;
  const sourceCareer =
    mode === 'public'
      ? (county?.player?.flight.career ?? freshCareer())
      : sim.career;
  const career = {
    ...sourceCareer,
    upgrades: { ...sourceCareer.upgrades },
    maintenanceDebt: sim.maintenanceDue,
    repairDebt: sim.repairsDue,
  };
  const goal = upgradeGoal(career, preferences.goal);
  const race =
    mode === 'public'
      ? rivalRace(
          county?.standings ?? [],
          county?.viewerId ?? null,
          preferences.rival,
        )
      : null;
  const rivalCallsignRef = useRef(race?.rival?.callsign ?? null);
  const rivalPilotIdRef = useRef(race?.rival?.pilot ?? null);
  useEffect(() => {
    rivalCallsignRef.current = race?.rival?.callsign ?? null;
    rivalPilotIdRef.current = race?.rival?.pilot ?? null;
  }, [race?.rival?.callsign, race?.rival?.pilot]);
  const previousRace = useRef<{ key: string; ahead: boolean } | null>(null);
  useEffect(() => {
    if (!race || !county || !client.online || mode !== 'public') {
      previousRace.current = null;
      return;
    }
    const key = `${county.viewerId}:${county.season.id}:${race.rival.pilot}`;
    const previous = previousRace.current;
    if (previous?.key === key && previous.ahead !== race.ahead) {
      if (race.ahead) playSound('rival');
      setNotice(
        race.ahead
          ? `You passed ${race.rival.callsign}. County rank #${race.rank}!`
          : `${race.rival.callsign} moved ahead. Open Standings to plan your comeback.`,
      );
    }
    previousRace.current = { key, ahead: race.ahead };
  }, [county, race, client, mode, playSound]);
  const previousJobs = useRef<Map<number, CountyJob>>(new Map());
  const previousFlyingPilots = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!county || mode !== 'public' || !client.online) return;
    const prev = previousJobs.current;
    if (prev.size > 0) {
      for (const job of county.jobs) {
        const old = prev.get(job.id);
        if (
          old &&
          old.status !== 'complete' &&
          job.status === 'complete' &&
          job.pilot &&
          job.owner !== county.viewerId
        ) {
          const col = Math.round((job.x + 2295) / 510) + 1;
          const row = Math.round((job.z + 2295) / 510) + 1;
          setNotice(
            `✈ Pilot ${job.pilot} completed Sector ${col}-${row}! (+${money(job.pay)})`,
          );
          playSound('target');
        }
      }
    }
    previousJobs.current = new Map(county.jobs.map((j) => [j.id, j]));

    const prevFlying = previousFlyingPilots.current;
    const currentFlying = new Set(
      county.pilots
        .filter((p) => p.phase === 'flying' && p.id !== county.viewerId)
        .map((p) => p.callsign),
    );
    if (prevFlying.size > 0) {
      for (const callsign of currentFlying) {
        if (!prevFlying.has(callsign)) {
          setNotice(`✈ Pilot ${callsign} is airborne in the county.`);
        }
      }
    }
    previousFlyingPilots.current = currentFlying;
  }, [county, mode, client.online, playSound]);
  useEffect(() => {
    if (
      process.env.NODE_ENV === 'development' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    ) {
      const skyPreview = new URLSearchParams(window.location.search).get(
        'skywriting',
      );
      if (skyPreview) {
        client.disconnect();
        skyPractice.current.begin(sim);
        sim.reset(
          skywritingContract(
            { ...contracts[0], id: SKYWRITING_PRACTICE_ID },
            skyPreview === 'crosswind' ? 1 : 0,
          ),
        );
        sim.phase = 'paused';
        setMode('practice');
        setPanel('briefing');
        if (skyPreview === 'reveal') {
          let live = true;
          void import('@/lib/skywriting-preview').then(
            ({ previewSkywritingReveal }) => {
              if (!live) return;
              sim.phase = 'flying';
              if (previewSkywritingReveal(sim)) setPanel(null);
              refresh((v) => v + 1);
            },
          );
          return () => {
            live = false;
            client.dispose();
          };
        }
        return () => client.dispose();
      }
      const preview = Number(
        new URLSearchParams(window.location.search).get('challenge'),
      );
      if ([2, 4, 7, 12].includes(preview)) {
        client.disconnect();
        sim.career = { ...freshCareer(), flights: preview };
        const job = prepareContract(contracts[2], preview);
        if (preview === 12 && job.challenge) job.challenge.tornado = true;
        sim.reset(job);
        sim.phase = 'paused';
        setLocalChallenge(true);
        setMode('practice');
        setPanel('briefing');
        return () => client.dispose();
      }
    }
    if (
      process.env.NODE_ENV === 'development' &&
      isLocalStorm(window.location)
    ) {
      client.disconnect();
      sim.weatherLocked = true;
      sim.weather = { ...LOCAL_STORM };
      sim.reset(stormContract());
      sim.phase = 'paused';
      setLocalStorm(true);
      setMode('practice');
      setPanel('briefing');
      return () => client.dispose();
    }
    void client.start();
    return () => client.dispose();
  }, [client, sim]);
  useEffect(() => {
    if (world.current) {
      world.current.rivalCallsign = race?.rival?.callsign ?? null;
      world.current.rivalPilotId = race?.rival?.pilot ?? null;
      world.current.setCounty(mode === 'public' ? county : null);
    }
  }, [county, mode, revision, race?.rival?.callsign, race?.rival?.pilot]);
  useEffect(() => {
    if (world.current) world.current.guidesEnabled = guideEnabled;
  }, [guideEnabled, ready]);
  const onlineAction = useCallback(
    async (action: Action) => {
      Object.assign(controls.current, freshControls());
      Object.assign(manualControls.current, freshControls());
      await client.action(action);
      refresh((v) => v + 1);
    },
    [client],
  );
  const save = useCallback(() => {
    if (localStorm || localChallenge || skyPractice.current.active) {
      refresh((v) => v + 1);
      return;
    }
    try {
      localStorage.setItem('prairie-air-career-v1', JSON.stringify(sim.career));
    } catch {
      setNotice(
        'Your browser could not save this career. You can keep flying this session.',
      );
    }
    refresh((v) => v + 1);
  }, [sim, localStorm, localChallenge]);
  const completePractice = useCallback(() => {
    if (!sim.finish()) return;
    const previous = bests.current[String(sim.job.id)];
    const current = {
      total: sim.result.total,
      coverage: sim.result.coverage,
      oversprayAcres: sim.result.oversprayAcres,
      elapsed: sim.elapsed,
    };
    const isBest = isPersonalBest(current, previous);
    setBestResult({ isBest, previous });
    if (
      isBest &&
      !localStorm &&
      !localChallenge &&
      !skyPractice.current.active
    ) {
      bests.current[String(sim.job.id)] = current;
      try {
        localStorage.setItem(
          'prairie-air-practice-bests-v1',
          JSON.stringify(bests.current),
        );
      } catch {
        setNotice('Your best finish could not be saved on this device.');
      }
    }
    save();
  }, [sim, save, localStorm, localChallenge]);
  useEffect(() => {
    let disposed = false;
    import('@/lib/world')
      .then(({ World }) => {
        if (disposed || !mount.current) return;
        try {
          world.current = new World(mount.current, sim, controls.current);
          world.current.reducedMotion = reducedMotionRef.current;
          world.current.invertPitch = invertPitchRef.current;
          world.current.rivalCallsign = rivalCallsignRef.current;
          world.current.rivalPilotId = rivalPilotIdRef.current;
          world.current.onRemoteProximity = (dist, speed, pan) => {
            soundRef.current.updateRemoteProximity(dist, speed, pan);
          };
          world.current.beforeStep = (dt) => {
            Object.assign(controls.current, manualControls.current);
            if (typeof navigator !== 'undefined' && navigator.getGamepads) {
              const gamepads = navigator.getGamepads();
              const gp = gamepads[0] || gamepads[1];
              if (gp) {
                const deadzone = 0.22;
                const stickX = gp.axes[0] ?? 0;
                const stickY = gp.axes[1] ?? 0;
                if (stickX < -deadzone || gp.buttons[14]?.pressed) {
                  controls.current.left = true;
                } else if (stickX > deadzone || gp.buttons[15]?.pressed) {
                  controls.current.right = true;
                }

                if (Math.abs(stickY) > deadzone) {
                  if (invertPitchRef.current) {
                    if (stickY < -deadzone) controls.current.down = true;
                    else if (stickY > deadzone) controls.current.up = true;
                  } else {
                    if (stickY < -deadzone) controls.current.up = true;
                    else if (stickY > deadzone) controls.current.down = true;
                  }
                } else {
                  if (gp.buttons[12]?.pressed) controls.current.up = true;
                  if (gp.buttons[13]?.pressed) controls.current.down = true;
                }

                if (gp.buttons[6]?.pressed) controls.current.acro = true;
                if (gp.buttons[4]?.pressed) controls.current.slower = true;
                if (gp.buttons[5]?.pressed) controls.current.faster = true;

                const rTrigger =
                  (gp.buttons[7]?.value ?? 0) > 0.2 || gp.buttons[7]?.pressed;
                const aButton = gp.buttons[0]?.pressed;
                if (rTrigger || aButton) controls.current.spray = true;

                if (gp.buttons[3]?.pressed && !prevGamepadButtons.current[3]) {
                  if (mode === 'public')
                    void onlineAction(
                      sim.phase === 'flying' ? 'pause' : 'resume',
                    );
                  else sim.phase = sim.phase === 'flying' ? 'paused' : 'flying';
                }
                if (
                  gp.buttons[2]?.pressed &&
                  !prevGamepadButtons.current[2] &&
                  world.current
                ) {
                  world.current.cameraMode = 1 - world.current.cameraMode;
                }
                if (
                  gp.buttons[1]?.pressed &&
                  !prevGamepadButtons.current[1] &&
                  sim.phase === 'flying'
                ) {
                  if (mode === 'public') void onlineAction('refill');
                  else {
                    sim.refill();
                    save();
                  }
                }
                prevGamepadButtons.current[0] = Boolean(gp.buttons[0]?.pressed);
                prevGamepadButtons.current[1] = Boolean(gp.buttons[1]?.pressed);
                prevGamepadButtons.current[2] = Boolean(gp.buttons[2]?.pressed);
                prevGamepadButtons.current[3] = Boolean(gp.buttons[3]?.pressed);
              }
            }
            client.record(dt, controls.current);
          };
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
  }, [sim, client, mode, onlineAction, save]);
  useEffect(() => {
    if (!ready) return;
    if (mode === 'public')
      return registerCountyTools(client, () => {
        setPanel(null);
        refresh((v) => v + 1);
      });
    return registerFlightTools(sim, manualControls.current, () => {
      setPanel(null);
      refresh((v) => v + 1);
    });
  }, [ready, sim, mode, client]);
  useEffect(() => {
    const binding: Record<string, keyof ReturnType<typeof freshControls>> = {
      KeyQ: 'acro',
      KeyZ: 'rudderLeft',
      KeyX: 'rudderRight',
      KeyA: 'left',
      ArrowLeft: 'left',
      KeyD: 'right',
      ArrowRight: 'right',
      KeyW: invertPitch ? 'down' : 'up',
      ArrowUp: invertPitch ? 'down' : 'up',
      KeyS: invertPitch ? 'up' : 'down',
      ArrowDown: invertPitch ? 'up' : 'down',
      ShiftLeft: 'faster',
      ShiftRight: 'faster',
      ControlLeft: 'slower',
      ControlRight: 'slower',
      Space: 'spray',
    };
    const down = (e: KeyboardEvent) => {
      if (
        e.target instanceof Element &&
        e.target.closest(
          'input, textarea, select, button, summary, [contenteditable="true"]',
        )
      )
        return;
      if (panel) return;
      if (binding[e.code]) {
        if (sim.phase === 'flying') {
          e.preventDefault();
          manualControls.current[binding[e.code]] = true;
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
        else {
          sim.refill();
          save();
        }
      }
      if (e.code === 'KeyM') {
        toggleMapZoom();
      }
      if (e.code === 'Enter' && sim.phase === 'flying') {
        if (mode === 'public') void onlineAction('finish');
        else completePractice();
      }
      refresh((v) => v + 1);
    };
    const up = (e: KeyboardEvent) => {
      if (binding[e.code]) manualControls.current[binding[e.code]] = false;
    };
    const blur = () => {
      Object.assign(controls.current, freshControls());
      Object.assign(manualControls.current, freshControls());
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
  }, [
    panel,
    sim,
    completePractice,
    mode,
    client,
    onlineAction,
    save,
    invertPitch,
    toggleMapZoom,
  ]);
  useEffect(() => {
    drawMap(
      map.current,
      sim,
      mode === 'public' ? county?.pilots : undefined,
      county?.viewerId,
      guideEnabled,
      mapZoom,
      race?.rival?.callsign,
      race?.rival?.pilot,
      trackUp,
    );
  }, [
    revision,
    sim,
    county,
    mode,
    guideEnabled,
    mapZoom,
    race?.rival?.callsign,
    race?.rival?.pilot,
    trackUp,
  ]);
  const start = (job: Contract = sim.job) => {
    if (mode === 'public') {
      void onlineAction('retry');
      return;
    }
    if (skyPractice.current.active && job.kind === 'skywriting')
      skyPractice.current.begin(sim);
    else if (skyPractice.current.active) {
      skyPractice.current.end(sim);
      setLocalChallenge(false);
      setLocalStorm(false);
      sim.weatherLocked = false;
    }
    if (
      job.kind === 'skywriting' &&
      !skyPractice.current.active &&
      !skywritingAvailable(sim.career)
    ) {
      setNotice(
        'Another wedding commission will open after a few more farm jobs. Practice is always available.',
      );
      return;
    }
    sim.weather = localStorm
      ? { ...LOCAL_STORM }
      : practiceWeather(job.id, Math.floor(Math.random() * 0xffffffff));
    sim.reset(localStorm ? stormContract(job) : job);
    save();
    sim.phase = 'paused';
    setPanel('briefing');
    Object.assign(controls.current, freshControls());
    Object.assign(manualControls.current, freshControls());
    refresh((v) => v + 1);
  };
  const open = (next: Panel) => {
    if (sim.phase === 'flying') {
      if (mode === 'public') void onlineAction('pause');
      else sim.phase = 'paused';
    }
    Object.assign(controls.current, freshControls());
    Object.assign(manualControls.current, freshControls());
    setPanel(mode === 'public' && next === 'contracts' ? 'county' : next);
  };
  const pause = () => {
    if (mode === 'public') {
      void onlineAction(sim.phase === 'flying' ? 'pause' : 'resume');
      return;
    }
    sim.phase = sim.phase === 'flying' ? 'paused' : 'flying';
    Object.assign(controls.current, freshControls());
    Object.assign(manualControls.current, freshControls());
    refresh((v) => v + 1);
  };
  const finish = () => {
    if (mode === 'public') {
      void onlineAction('finish');
      return;
    }
    completePractice();
  };
  const joinCounty = async () => {
    skyPractice.current.end(sim);
    sim.weatherLocked = false;
    if (localStorm || localChallenge) {
      setLocalStorm(false);
      setLocalChallenge(false);
      await client.start();
    }
    setMode('public');
    if (await client.action('join')) setPanel('county');
  };
  const claim = async (job: CountyJob) => {
    if (!client.online && !(await client.action('join'))) return;
    if (await client.action('claim', { jobId: job.id })) {
      if (job.kind === 'skywriting') await client.action('pause');
      setPanel(job.kind === 'skywriting' ? 'briefing' : null);
      setMode('public');
    }
  };
  const practice = () => {
    skyPractice.current.end(sim);
    client.disconnect();
    setMode('practice');
    if (!localStorm && !localChallenge) {
      if (mode === 'public') {
        sim.wear = sim.clog = 0;
        sim.integrity = 100;
      }
      try {
        sim.career = loadCareer(localStorage.getItem('prairie-air-career-v1'));
        bests.current = loadPracticeBests(
          localStorage.getItem('prairie-air-practice-bests-v1'),
        );
      } catch {}
    }
    sim.weather = localStorm ? { ...LOCAL_STORM } : practiceWeather(0, 0);
    sim.reset(
      localStorm ? stormContract() : localChallenge ? sim.job : contracts[0],
    );
    sim.phase = 'paused';
    setGuideEnabled(true);
    setPanel('briefing');
    refresh((v) => v + 1);
  };
  const practiceSkywriting = (level: 0 | 1 = 0) => {
    client.disconnect();
    if (mode === 'public' && !skyPractice.current.active) {
      try {
        sim.career = loadCareer(localStorage.getItem('prairie-air-career-v1'));
      } catch {}
      sim.wear = sim.clog = 0;
      sim.integrity = 100;
    }
    skyPractice.current.begin(sim);
    sim.reset(
      skywritingContract(
        { ...contracts[0], id: SKYWRITING_PRACTICE_ID },
        level,
      ),
    );
    sim.phase = 'paused';
    setLocalStorm(false);
    setLocalChallenge(false);
    setMode('practice');
    setGuideEnabled(true);
    setPanel('briefing');
    Object.assign(controls.current, freshControls());
    Object.assign(manualControls.current, freshControls());
    refresh((v) => v + 1);
  };
  const endSkyPractice = () => {
    skyPractice.current.end(sim);
    sim.weatherLocked = false;
    sim.reset(contracts[0]);
    sim.phase = 'paused';
    setPanel('contracts');
    refresh((v) => v + 1);
  };
  const lineUpPractice = () => {
    if (mode !== 'practice' || sim.job.id !== 0) return;
    if (!lineUpLesson(sim)) return;
    Object.assign(controls.current, freshControls());
    Object.assign(manualControls.current, freshControls());
    refresh((v) => v + 1);
  };
  const buyUpgrade = async (key: UpgradeKey) => {
    const level = career.upgrades[key];
    const bought =
      mode === 'public'
        ? await client.action('upgrade', { upgrade: key })
        : sim.buy(key);
    if (!bought) {
      setNotice(
        `Keep ${money(sim.serviceDue)} reserved for maintenance and repairs before upgrading.`,
      );
      return;
    }
    sound.cue('upgrade');
    if (mode === 'practice') save();
    setNotice(
      `${upgradeNames[key]} installed · level ${level + 1} · ${upgradeStat(key, level + 1)}. ${key === 'boom' ? 'Your spray footprint is wider; leave more room at the edges.' : key === 'stability' ? 'You will feel less drift and buffeting on your next pass.' : 'Your tank now holds 40 more units for longer runs.'}`,
    );
    refresh((v) => v + 1);
  };
  const active = sim.phase !== 'ready',
    fly = sim.phase === 'flying';
  const heading =
    ((Math.round((sim.heading * 180) / Math.PI) % 360) + 360) % 360;
  const weather =
    ((sim.job.challenge || sim.isSkywriting) &&
    (mode === 'practice' || county?.player?.activeJob)
      ? sim.weather
      : mode === 'public'
        ? county?.weather
        : sim.weather) ?? LESSON_WEATHER;
  const WeatherIcon =
    weather.kind === 'rain'
      ? CloudRain
      : weather.kind === 'overcast'
        ? Cloud
        : weather.kind === 'haze'
          ? Haze
          : Sun;
  const safety = spraySafety(sim);
  const hasAssignment =
    mode === 'practice' || Boolean(county?.player?.activeJob);
  const sprayMessage = !hasAssignment
    ? sim.tank <= 0
      ? 'Tank empty · press R to refill'
      : sim.spraying
        ? 'Free flight · claim a field from County board to treat crops'
        : 'Free flight · explore the county or claim a contract'
    : sim.isSkywriting
      ? skyGuidance(sim.job, sim.skywriting, sim.y, sim.tank)
    : sim.overspraying
      ? 'Overspray · release spray to stop the penalty'
      : sim.tank <= 0
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
                    : 'Outside your field · keep spray off'
                  : safety === 'outside'
                    ? 'Outside spray footprint · keep spray off'
                    : safety === 'edge'
                      ? 'Field edge ahead · release Space'
                      : 'Green footprint · ready to spray';
  return (
    <main
      className={`game-shell ${reducedMotion ? 'reduced-motion' : ''} ${active ? 'flight-active' : ''} ${sim.isSkywriting ? 'skywriting-active' : ''} ${sim.isSkywriting && sim.phase === 'complete' ? 'skywriting-reveal' : ''}`}
    >
      <div ref={mount} className="world-canvas" />
      <div className="screen-shade" />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Prairie Air home">
          <span className="brand-icon">
            <Plane size={24} />
          </span>
          <span>
            PRAIRIE<span className="brand-air">AIR</span>
            <small>A LITTLE CLOSER TO THE LAND</small>
          </span>
        </a>
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
            Hangar{' '}
            {goal?.remaining === 0 && (
              <span
                className="upgrade-ready-dot"
                aria-label="Upgrade affordable"
              />
            )}
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
            <small>
              {skyPractice.current.active
                ? 'CAREER CASH · PRACTICE'
                : 'AVAILABLE CASH'}
            </small>
            <strong>
              {money(skyPractice.current.savedCash ?? career.cash)}
            </strong>
          </div>
          <a className="avatar" href="/auth" aria-label="Manage pilot account">
            {mode === 'public' ? 'PA' : 'SOLO'}
          </a>
        </div>
      </header>
      <div className="location">
        <span className="live-dot" /> BLACK HAWK COUNTY, IOWA{' '}
        <span className="location-line" /> <span>42.47° N &nbsp; 92.31° W</span>
      </div>
      <button
        className="county-status"
        onClick={() => open(localStorm ? 'contracts' : 'county')}
      >
        <Globe size={13} />
        {mode === 'practice'
          ? localStorm
            ? 'STORM PRACTICE · LOCAL'
            : 'SOLO PRACTICE'
          : county
            ? `SEASON ${county.season.number} · ${county.season.phase.toUpperCase()} · ${county.pilots.length} PILOTS`
            : 'CONNECTING TO COUNTY'}
        <span className="live-dot" />
      </button>
      <div
        className="weather"
        title={
          mode === 'public'
            ? 'Shared weather fronts build, peak, and ease; stronger winds arrive later in the season'
            : localStorm
              ? 'Heavy showers · southwest 14 kt, gusting 21 kt · fixed local practice weather'
              : 'Field fronts cycle from clear skies to bad weather, then ease. Harder fronts unlock as jobs are completed.'
        }
      >
        <WeatherIcon size={23} />
        <div>
          <strong>
            {weather.temperature}° <span>{weather.label}</span>
          </strong>
          <small>
            <ArrowDown
              className="wind-direction"
              size={17}
              style={{ transform: `rotate(${weather.windFrom}deg)` }}
              aria-hidden="true"
            />{' '}
            From{' '}
            {windLabel(
              weather,
              mode === 'practice' ? (sim.job.windStrength ?? 1) : 1,
            )}{' '}
            <span className="forecast-origin">
              ·{' '}
              {hasAssignment && sim.job.challenge
                ? 'Field forecast'
                : mode === 'public'
                  ? 'County forecast'
                  : 'Practice forecast'}
            </span>
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
              if (county?.viewerId) void joinCounty();
              else practice();
            }}
            disabled={
              !ready || (Boolean(county?.viewerId) && client.actionPending)
            }
          >
            {ready
              ? county?.viewerId
                ? 'Join public county'
                : 'Fly your first job'
              : 'Preparing your aircraft…'}
            <ArrowUpRight size={21} />
          </button>
          {mode === 'public' && county && !county.viewerId && (
            <a className="signin-link" href="/auth">
              Sign in to the public county
            </a>
          )}
          {county?.viewerId && (
            <button className="practice-link" onClick={practice}>
              Practice with the flight coach
            </button>
          )}
          <button
            className="practice-link sky-practice-link"
            disabled={!ready}
            onClick={() => practiceSkywriting()}
          >
            Practice skywriting
          </button>
          {!county?.viewerId && (
            <span className="guest-flight-note">
              No account needed · guided practice · about 3 minutes
            </span>
          )}
          {county?.viewerId && (
            <a href="/auth" className="signin-link">
              Manage pilot account
            </a>
          )}
          <span className="launch-note">
            {mode === 'public'
              ? 'ONE PUBLIC COUNTY. 60 CONTRACTS. EVERY ACRE COUNTS.'
              : 'PRACTICE FLIGHTS DO NOT ENTER THE LEADERBOARDS.'}
          </span>
          <WelcomeAudio sound={sound} />
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
              : sim.isSkywriting
                ? skyPractice.current.active
                  ? 'PRACTICE'
                  : 'SPECIAL JOB'
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
        ) : sim.isSkywriting ? (
          <SkyMission
            sim={sim}
            training={skyPractice.current.active}
            onFinish={finish}
          />
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
            {active &&
              (mode === 'practice' ||
                county?.player?.activeJob ||
                sim.phase === 'complete') && (
                <div
                  className={`overspray-summary ${sim.oversprayPenalty > 0 ? 'has-penalty' : ''}`}
                >
                  <div>
                    <span>Overspray · {sim.oversprayAcres.toFixed(2)} ac</span>
                    <strong>−{money(sim.oversprayPenalty)}</strong>
                  </div>
                  <div>
                    <span>Net at completion</span>
                    <strong>{money(sim.projectedPay)}</strong>
                  </div>
                  <small>
                    {money(OVERSPRAY_PENALTY_PER_ACRE)}/ac outside your field
                  </small>
                </div>
              )}
            {active && sim.completionReady && fly && (
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
        {active && sim.phase !== 'complete' && (
          <div className="mission-goals">
            <UpgradeGoal
              career={career}
              preferred={preferences.goal}
              onHangar={() => open('hangar')}
              payout={hasAssignment ? sim.projectedPay : 0}
              compact
            />
            {mode === 'public' && race && (
              <button
                className="mission-rival"
                onClick={() => open('standings')}
              >
                <Crosshair size={13} />
                <span>
                  {race.rival.callsign} ·{' '}
                  {race.ahead
                    ? 'you lead'
                    : race.toPass === null
                      ? 'rival tracked'
                      : `${money(race.toPass)} to pass`}
                </span>
              </button>
            )}
          </div>
        )}
      </aside>
      {mode === 'public' && county?.weather && active && !hasAssignment && (
        <div className="flight-forecast">
          <CountyForecast
            weather={county.weather}
            next={county.nextWeather}
            now={county.now}
            compact
          />
        </div>
      )}
      {!active && (
        <div className="scene-label">
          <span className="scene-dot" />
          <div>
            <strong>THE HEARTLAND</strong>
            <small>Summer in Cedar Valley</small>
          </div>
        </div>
      )}
      {active && hasAssignment && (
        <div className="guidance-panel">
          <button
            className="guide-toggle"
            aria-pressed={guideEnabled}
            onClick={() => setGuideEnabled((v) => !v)}
          >
            <Crosshair size={15} />
            Flight guide {guideEnabled ? 'on' : 'off'}
          </button>
          {sim.phase !== 'complete' && <ChallengeHUD sim={sim} />}
          {!panel &&
            sim.phase === 'flying' &&
            guideEnabled &&
            !sim.isSkywriting &&
            sim.career.flights < 2 && (
              <FlightCoach
                sim={sim}
                onLineUp={
                  mode === 'practice' && sim.job.id === 0
                    ? lineUpPractice
                    : undefined
                }
              />
            )}
        </div>
      )}
      {active && (
        <>
          <div
            className={`flight-message ${mode === 'public' && !county?.player?.activeJob ? '' : sim.hazardEvent && sim.hazardEvent.includes('BARNSTORMER') && sim.elapsed < sim.hazardEventUntil ? 'spray-stunt' : sim.overspraying ? 'spray-bad' : sim.spraying && sim.validSpray && sim.inField ? 'spray-good' : ''}`}
          >
            <span className="live-dot" />
            {mode === 'public' && !county?.player?.activeJob
              ? 'Free flight · choose a county contract to earn'
              : sim.job.challenge && sim.warning.danger
                ? sim.warning.text
                : sim.message || sprayMessage}
          </div>
          {/* Agricultural GPS Lightbar (CDI) */}
          {!sim.isSkywriting && sim.phase === 'flying' && (() => {
            const isLocked = world.current?.arcadeFx?.isSwathLocked() ?? false;
            const offset = world.current?.arcadeFx?.getSwathOffset() ?? Infinity;
            const signed = world.current?.arcadeFx?.getSignedSwathOffset() ?? 0;
            const hasFix = Number.isFinite(offset) && offset < 50;
            if (!hasFix) return null;
            const pips = [-4, -3, -2, -1, 0, 1, 2, 3, 4];
            return (
              <div
                className={`cdi-lightbar ${isLocked ? 'locked' : ''}`}
                role="status"
                aria-label={`GPS Lightbar: ${isLocked ? 'Locked on swath' : `${offset.toFixed(1)}m ${signed > 0 ? 'right' : 'left'}`}`}
              >
                <span className={`cdi-arrow cdi-arrow-left ${signed > 0.8 ? 'active' : ''}`}>◀</span>
                <div className="cdi-pips">
                  {pips.map((p) => {
                    const isCenter = p === 0;
                    let active = false;
                    if (isCenter) {
                      active = isLocked;
                    } else if (p < 0) {
                      const thresh = p === -1 ? 1.5 : p === -2 ? 3.0 : p === -3 ? 5.5 : 9.0;
                      active = signed >= thresh;
                    } else {
                      const thresh = p === 1 ? -1.5 : p === 2 ? -3.0 : p === 3 ? -5.5 : -9.0;
                      active = signed <= thresh;
                    }
                    return (
                      <span
                        key={p}
                        className={`cdi-pip ${isCenter ? 'pip-center' : ''} ${active ? 'active' : ''}`}
                      />
                    );
                  })}
                </div>
                <span className={`cdi-arrow cdi-arrow-right ${signed < -0.8 ? 'active' : ''}`}>▶</span>
                <span className="cdi-label">
                  {isLocked ? 'LOCKED' : `${offset.toFixed(1)}m ${signed > 0 ? 'R' : 'L'}`}
                </span>
              </div>
            );
          })()}
          <div
            className={`reticle ${
              world.current?.arcadeFx?.isSwathLocked()
                ? 'swath-locked swath-pulse'
                : ''
            }`}
          >
            <span />
            <i />
            <span />
          </div>
          {/* In-flight floating score badges */}
          <div className="arcade-floating-container">
            {(sim.warning.danger
              ? []
              : world.current?.arcadeFx?.getActiveBadges()
            )?.map((badge) => (
              <div
                key={badge.id}
                className="arcade-floating-badge"
                style={{
                  left: '50%',
                  top: '24%',
                  color: badge.color,
                  borderColor: badge.color,
                }}
              >
                {badge.text}
              </div>
            ))}
          </div>
        </>
      )}
      <div className="bottom-hud">
        <div className="controls-hint">
          <span>
            <kbd>W</kbd>
            <kbd>S</kbd> {invertPitch ? 'Dive/Climb' : 'Pitch'}
          </span>
          <span>
            <kbd>A</kbd>
            <kbd>D</kbd> Bank
          </span>
          <span>
            <kbd>SPACE</kbd> {sim.isSkywriting ? 'Smoke' : 'Spray'}
          </span>
          <button onClick={() => open('help')} title="Flight controls">
            <HelpCircle size={17} />
          </button>
        </div>
        {active && (
          <div className="instruments">
            {/* Streak Multiplier HUD Gauge */}
            <div
              className={`streak-multiplier-gauge tier-${Math.min(
                5,
                Math.max(1, sim.arcade?.passStreak ?? 1),
              )}`}
              title="Pass Streak Multiplier"
            >
              <div className="streak-badge">
                <span className="streak-label">STREAK</span>
                <span className="streak-value">
                  x{Math.min(5, Math.max(1, sim.arcade?.passStreak ?? 1))}
                </span>
              </div>
              <div className="streak-meter">
                {[1, 2, 3, 4, 5].map((tier) => (
                  <span
                    key={tier}
                    className={`meter-segment seg-${tier} ${
                      (sim.arcade?.passStreak ?? 1) >= tier ? 'active' : ''
                    }`}
                  >
                    x{tier}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <small>AIRSPEED</small>
              <strong>
                {Math.round(sim.speed * 2.237)}
                <span>mph</span>
              </strong>
            </div>
            <div className="altitude">
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 6,
                }}
              >
                <small>ALTITUDE AGL</small>
                <span
                  className={`deck-hugger-indicator ${
                    sim.altitude * 3.281 >= 20 && sim.altitude * 3.281 <= 32
                      ? 'in-pocket'
                      : ''
                  }`}
                  title="Deck Hugger Pocket: 20–32 ft"
                >
                  {sim.arcade.isDeckSkimming ? 'DECK SKIM' : 'DECK 20–32 FT'}
                </span>
              </div>
              <strong
                className={
                  (
                    sim.isSkywriting
                      ? Math.abs(sim.y - sim.job.skywriting!.altitude) > 14
                      : sim.altitude < 6 || sim.altitude > 30
                  )
                    ? 'warning'
                    : ''
                }
              >
                {Math.round(sim.altitude * 3.281)}
                <span>ft</span>
              </strong>
              <span className="altitude-hint">
                {sim.isSkywriting
                  ? `GATE ${Math.round(Math.abs(sim.job.skywriting!.altitude - sim.y) * 3.281)} FT ${sim.job.skywriting!.altitude >= sim.y ? 'ABOVE' : 'BELOW'}`
                  : 'SWEET SPOT 20–98 FT'}
              </span>
            </div>
            <div>
              <small>{sim.isSkywriting ? 'SMOKE TANK' : 'SPRAY TANK'}</small>
              <strong>
                {Math.round((sim.tank / sim.tankCapacity) * 100)}
                <span>%</span>
              </strong>
              <Progress
                value={(sim.tank / sim.tankCapacity) * 100}
                aria-label={sim.isSkywriting ? 'Smoke tank' : 'Spray tank'}
              />
              {sim.tank < sim.tankCapacity && (
                <button
                  type="button"
                  className="hud-refill-btn"
                  title="Refill chemical tank (R)"
                  onClick={() => {
                    if (mode === 'public') void onlineAction('refill');
                    else sim.refill();
                  }}
                  disabled={client.pending}
                >
                  Refill (R)
                </button>
              )}
            </div>
            <button
              className={`spray-button ${sim.spraying ? 'spraying' : ''}`}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                manualControls.current.spray = true;
              }}
              onPointerUp={() => (manualControls.current.spray = false)}
              onPointerCancel={() => (manualControls.current.spray = false)}
            >
              <Droplets size={19} />
              <span>
                {sim.isSkywriting
                  ? sim.spraying
                    ? 'WRITING'
                    : 'HOLD TO WRITE'
                  : sim.spraying
                    ? 'SPRAYING'
                    : 'HOLD TO SPRAY'}
              </span>
              <kbd>SPACE</kbd>
            </button>
          </div>
        )}
        <div className="view-controls">
          {gamepadConnected && (
            <span
              className="gamepad-indicator"
              title="Gamepad controller active"
            >
              🎮 Gamepad
            </span>
          )}
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
            onClick={() => {
              setInvertPitch((v) => {
                const next = !v;
                try {
                  localStorage.setItem(
                    'prairie-air-invert-pitch',
                    next ? '1' : '0',
                  );
                } catch {}
                setNotice(
                  next
                    ? 'Pitch inverted · W dives, S climbs (Flight stick style)'
                    : 'Pitch standard · W climbs, S dives (Arcade style)',
                );
                return next;
              });
            }}
            title={
              invertPitch
                ? 'Pitch: Inverted (W dives, S climbs) · Click to switch'
                : 'Pitch: Standard (W climbs, S dives) · Click to switch'
            }
            aria-pressed={invertPitch}
          >
            <ArrowUpDown size={17} />
          </button>
          <SoundControls sound={sound} />
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
      <aside className={`minimap ${!active ? 'map-idle' : 'map-active'}`}>
        <div>
          <span>
            <span className="live-dot" />{' '}
            {sim.isSkywriting ? 'HEART ROUTE' : `${mapZoom.toUpperCase()} MAP`}
          </span>
          <button
            type="button"
            className="map-zoom-btn"
            onClick={toggleMapZoom}
            title="Toggle map zoom (M)"
            hidden={sim.isSkywriting}
          >
            {mapZoom === 'field'
              ? '1x'
              : mapZoom === 'sector'
                ? '0.5x'
                : 'County'}{' '}
            (M)
          </button>
          <button
            type="button"
            className="map-zoom-btn"
            onClick={() => setTrackUp((t) => !t)}
            title="Toggle map orientation: North-Up vs Track-Up"
          >
            {trackUp ? 'TRK ↑' : 'N ↑'}
          </button>
        </div>
        <canvas
          ref={map}
          width={340}
          height={240}
          onClick={toggleMapZoom}
          title={
            sim.isSkywriting
              ? 'Follow the gold dot around the heart'
              : 'Click or press M to toggle map zoom'
          }
          aria-label={
            sim.isSkywriting
              ? 'Heart route showing your aircraft, written strokes and next gate'
              : 'Map showing your aircraft and assigned field'
          }
        />
        <footer>
          <span className="map-key" /> {sim.isSkywriting ? 'Heart' : 'Field'}{' '}
          <span className="map-plane">✦</span> You{' '}
          <span style={{ color: '#ffd166', marginLeft: 6 }}>●</span>{' '}
          {sim.isSkywriting ? 'Next gate' : 'Token'}
        </footer>
      </aside>
      {active && (
        <div className="touch-controls">
          {(
            [
              { key: 'rudderLeft', label: '◂', title: 'Rudder Left (Z)' },
              { key: 'left', label: '←', title: 'Bank Left (A)' },
              {
                key: 'up',
                label: '↑',
                title: invertPitch ? 'Climb (S)' : 'Pitch Up (W)',
              },
              {
                key: 'down',
                label: '↓',
                title: invertPitch ? 'Dive (W)' : 'Pitch Down (S)',
              },
              { key: 'right', label: '→', title: 'Bank Right (D)' },
              { key: 'rudderRight', label: '▸', title: 'Rudder Right (X)' },
              { key: 'faster', label: '+', title: 'Throttle Up (E)' },
              { key: 'slower', label: '−', title: 'Throttle Down (C)' },
            ] as const
          ).map((btn) => (
            <button
              key={btn.key}
              aria-label={btn.title}
              title={btn.title}
              onPointerDown={(e) => {
                e.currentTarget.setPointerCapture(e.pointerId);
                manualControls.current[btn.key] = true;
              }}
              onPointerUp={() => (manualControls.current[btn.key] = false)}
              onPointerCancel={() => (manualControls.current[btn.key] = false)}
            >
              {btn.label}
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
                : sim.isSkywriting
                  ? 'Your smoke and progress will be right here.'
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
            <div className="pause-destinations">
              <button onClick={() => open('hangar')}>
                <Wrench size={14} /> Visit hangar
              </button>
              <button
                onClick={() =>
                  open(mode === 'public' ? 'standings' : 'contracts')
                }
              >
                <Trophy size={14} />{' '}
                {mode === 'public' ? 'Check rivals' : 'Choose contract'}
              </button>
            </div>
            <button
              className="secondary"
              onClick={() => {
                if (mode === 'public') void onlineAction('refill');
                else {
                  sim.refill();
                  save();
                }
                refresh((v) => v + 1);
              }}
            >
              {skyPractice.current.active
                ? 'Refill smoke & line up · free practice'
                : `Repair, refill & return · ${money(sim.serviceDue)} workshop tab`}
            </button>
            <SoundControls sound={sound} />
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
              {sim.crashReason ||
                'Keep at least 20 ft above the ground. Try a gentler approach on your next pass.'}
            </p>
            <p>
              {skyPractice.current.active
                ? 'Practice flight · no repair bill. Try again whenever you are ready.'
                : `Repair estimate: ${money(sim.repairsDue)}. The workshop bills future earnings if needed.`}
            </p>
            <button className="primary" onClick={() => start()}>
              {skyPractice.current.active
                ? 'Retry skywriting practice'
                : 'Repair & retry this contract'}
              <ArrowUpRight size={17} />
            </button>
          </div>
        </div>
      )}
      {sim.phase === 'complete' &&
        !panel &&
        (sim.isSkywriting ? (
          <SkyDebrief
            sim={sim}
            training={skyPractice.current.active}
            onReplay={() => start(sim.job)}
            onNext={() =>
              skyPractice.current.active ? endSkyPractice() : open('contracts')
            }
          />
        ) : (
          <FlightDebrief
            sim={sim}
            practice={mode === 'practice'}
            newBest={bestResult.isBest}
            previousBest={bestResult.previous}
            nextJob={
              mode === 'practice' ? contracts[sim.job.id + 1] : undefined
            }
            onNext={() => {
              if (mode === 'practice' && contracts[sim.job.id + 1])
                start(contracts[sim.job.id + 1]);
              else open('contracts');
            }}
            onHangar={() => open('hangar')}
            onReplay={() => start(sim.job)}
            progression={
              <div className="debrief-goals">
                <UpgradeGoal
                  career={career}
                  preferred={preferences.goal}
                  onHangar={() => open('hangar')}
                />
                {mode === 'public' && (
                  <RivalGoal
                    race={race}
                    onStandings={() => open('standings')}
                  />
                )}
              </div>
            }
          />
        ))}
      <Dialog
        open={panel !== null}
        onOpenChange={(open) => {
          if (!open) setPanel(null);
        }}
      >
        <DialogContent
          className="game-dialog"
          initialFocus={panel === 'briefing' ? briefingTitle : undefined}
        >
          <DialogTitle
            ref={briefingTitle}
            tabIndex={panel === 'briefing' ? -1 : undefined}
          >
            {panel === 'briefing'
              ? sim.job.name
              : panel === 'county' || panel === 'standings'
                ? 'The heartland, together.'
                : panel === 'contracts'
                  ? 'Good work, waiting for you.'
                  : panel === 'hangar'
                    ? 'Make this bird your own.'
                    : 'A feel for the flying.'}
          </DialogTitle>
          <DialogDescription>
            {panel === 'briefing'
              ? `${sim.job.farmer} · ${sim.isSkywriting ? 'Skywriting' : `${sim.job.crop} · ${sim.job.treatment}`}`
              : panel === 'county' || panel === 'standings'
                ? 'A shared sky. A finite season. Your name on the board.'
                : panel === 'contracts'
                  ? 'Local farms, flight practice, and an occasional celebration.'
                  : panel === 'hangar'
                    ? `Your crop duster · ${money(career.cash)} available`
                    : 'A few simple controls. Plenty of room to get better.'}
          </DialogDescription>
          {panel === 'briefing' &&
            (sim.isSkywriting ? (
              <SkyBriefing
                job={sim.job}
                training={skyPractice.current.active}
                onFly={() => {
                  Object.assign(controls.current, freshControls());
                  Object.assign(manualControls.current, freshControls());
                  if (mode === 'public') void onlineAction('resume');
                  else sim.phase = 'flying';
                  setPanel(null);
                  refresh((v) => v + 1);
                }}
              />
            ) : (
              <FlightBriefing
                job={sim.job}
                weather={sim.weather}
                sessionOnly={
                  localStorm || localChallenge || skyPractice.current.active
                }
                onFly={() => {
                  Object.assign(controls.current, freshControls());
                  Object.assign(manualControls.current, freshControls());
                  sim.phase = 'flying';
                  setPanel(null);
                  refresh((v) => v + 1);
                }}
              />
            ))}
          {(panel === 'county' || panel === 'standings') &&
            (county ? (
              <CountyPanel
                key={panel}
                county={county}
                rivalId={publicPreferences.rival}
                selectRival={publicPreferences.setRival}
                initialTab={panel === 'standings' ? 'standings' : 'fields'}
                claim={(job) => void claim(job)}
                practiceSkywriting={() => practiceSkywriting()}
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
                pending={client.actionPending}
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
              <div className="flight-school-card">
                <h3>
                  <Wind size={16} /> Solo Flight School &amp; Stunt Lab
                </h3>
                <div className="flight-school-grid">
                  <div className="flight-school-field">
                    <label htmlFor="lab-field">Field Parcel</label>
                    <select
                      id="lab-field"
                      value={labField}
                      onChange={(e) => setLabField(Number(e.target.value))}
                    >
                      {contracts.map((c, i) => (
                        <option key={c.id} value={i}>
                          {c.name} ({c.crop}, {c.acres} ac)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flight-school-field">
                    <label htmlFor="lab-weather">Atmosphere &amp; Wind</label>
                    <select
                      id="lab-weather"
                      value={labWeather}
                      onChange={(e) =>
                        setLabWeather(
                          e.target.value as
                            | 'calm'
                            | 'breeze'
                            | 'gale'
                            | 'storm',
                        )
                      }
                    >
                      <option value="calm">Calm Clear (0 mph wind)</option>
                      <option value="breeze">West Breeze (12 mph wind)</option>
                      <option value="gale">Frontal Gale (24 mph wind)</option>
                      <option value="storm">
                        Severe Squall &amp; Rain (35 mph)
                      </option>
                    </select>
                  </div>
                  <div className="flight-school-field">
                    <label htmlFor="lab-hazard">Hazards &amp; Stunts</label>
                    <select
                      id="lab-hazard"
                      value={labHazard}
                      onChange={(e) => setLabHazard(Number(e.target.value))}
                    >
                      <option value={0}>
                        Tier 0 · Open Field (No hazards)
                      </option>
                      <option value={1}>
                        Tier 1 · Barn Breezeway &amp; Silos
                      </option>
                      <option value={2}>Tier 2 · Barn + Migrating Birds</option>
                      <option value={3}>
                        Tier 3 · Swarming Locusts &amp; Birds
                      </option>
                      <option value={4}>
                        Tier 4 · Supercell Tornado Outflow
                      </option>
                    </select>
                  </div>
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'flex-end',
                    marginTop: 4,
                  }}
                >
                  <button
                    className="primary"
                    onClick={() => {
                      skyPractice.current.end(sim);
                      client.disconnect();
                      const baseJob = contracts[labField] || contracts[0];
                      const job = prepareContract(baseJob, labHazard);
                      if (labHazard >= 4 && job.challenge) {
                        job.challenge.tornado = true;
                      }
                      sim.weatherLocked = true;
                      if (labWeather === 'calm') {
                        sim.weather = {
                          ...LESSON_WEATHER,
                          windMps: 0,
                          gust: 0,
                        };
                      } else if (labWeather === 'breeze') {
                        sim.weather = {
                          ...LESSON_WEATHER,
                          windMps: 4.5,
                          windFrom: 270,
                          gust: 0.35,
                        };
                      } else if (labWeather === 'gale') {
                        sim.weather = {
                          ...LESSON_WEATHER,
                          kind: 'overcast',
                          label: 'Frontal Gale',
                          windMps: 9.5,
                          windFrom: 315,
                          gust: 0.6,
                        };
                      } else {
                        sim.weather = { ...LOCAL_STORM };
                      }
                      sim.reset(job);
                      sim.phase = 'paused';
                      setLocalChallenge(true);
                      setMode('practice');
                      setPanel('briefing');
                      Object.assign(controls.current, freshControls());
                      Object.assign(manualControls.current, freshControls());
                      refresh((v) => v + 1);
                    }}
                  >
                    Launch Lab Flight <ArrowUpRight size={16} />
                  </button>
                </div>
              </div>
              <SkyJobOffer
                job={skywritingContract(
                  { ...contracts[0], id: SKYWRITING_PRACTICE_ID },
                  career.flights >= 12 ? 1 : 0,
                )}
                career={career}
                training={skyPractice.current.active}
                onPractice={practiceSkywriting}
                onContract={() =>
                  start(
                    skywritingContract(
                      { ...contracts[0], id: SKYWRITING_PRACTICE_ID },
                      career.flights >= 12 ? 1 : 0,
                    ),
                  )
                }
              />
              {skyPractice.current.active && (
                <button className="secondary" onClick={endSkyPractice}>
                  Exit skywriting practice
                </button>
              )}
              {contracts.map((job, i) => (
                <article className="contract-row" key={job.id}>
                  <div className="contract-preview">
                    <FieldPlot job={job} />
                    <span>0{i + 1}</span>
                  </div>
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
            <Hangar
              career={career}
              preferred={preferences.goal}
              select={preferences.setGoal}
              buy={(key) => void buyUpgrade(key)}
              pending={client.actionPending}
              publicCareer={mode === 'public'}
              sessionOnly={
                localStorm || localChallenge || skyPractice.current.active
              }
              forecastTier={sim.job.challenge?.tier ?? 0}
              canBuy={
                mode === 'practice' || Boolean(county?.player && client.online)
              }
            />
          )}
          {panel === 'help' && (
            <div className="help-content">
              <div className="key-grid">
                {[
                  ['W / ↑', 'Climb'],
                  ['S / ↓', 'Descend'],
                  ['A / D', 'Bank & turn'],
                  [
                    'Hold Q + A / D',
                    'Roll freely; hold Q to keep bank, release Q to level',
                  ],
                  [
                    'SPACE',
                    sim.isSkywriting ? 'Hold to write smoke' : 'Hold to spray',
                  ],
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
              <button
                className="secondary"
                aria-pressed={reducedMotion}
                onClick={() => {
                  const next = !reducedMotion;
                  setReducedMotion(next);
                  try {
                    localStorage.setItem(
                      'prairie-air-motion',
                      next ? 'reduced' : 'full',
                    );
                  } catch {}
                }}
              >
                Camera motion: {reducedMotion ? 'Reduced' : 'Full'}
              </button>
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
                Off-field spray costs {money(OVERSPRAY_PENALTY_PER_ACRE)} per
                acre and reduces your final payment, down to $0. Watch the full
                boom and wind drift at field edges. Refills keep your coverage
                and overspray deduction. Restarting a contract clears both.
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
      {notice && sim.phase !== 'complete' && (
        <button className="notice" onClick={() => setNotice('')}>
          {notice} <Check size={16} />
        </button>
      )}
    </main>
  );
}

function drawMap(
  canvas: HTMLCanvasElement | null,
  sim: Simulation,
  pilots: PublicPilot[] = [],
  viewerId?: string | null,
  guideEnabled = true,
  mapZoom: 'field' | 'sector' | 'county' = 'field',
  rivalCallsign?: string | null,
  rivalPilotId?: string | null,
  trackUp = false,
) {
  const ctx = canvas?.getContext('2d');
  if (!ctx || !canvas) return;
  const w = canvas.width,
    h = canvas.height;
  if (sim.isSkywriting && sim.phase !== 'ready') {
    drawSkyMap(ctx, w, h, sim, guideEnabled);
    return;
  }
  const tacticalScale = Math.min(
    w / (fieldSize(sim.job).width + 150),
    h / (fieldSize(sim.job).depth + 150),
  );
  const scale =
    sim.phase === 'ready'
      ? 0.13
      : mapZoom === 'county'
        ? 0.052
        : mapZoom === 'sector'
          ? tacticalScale * 0.44
          : tacticalScale;
  const cx = sim.job.x,
    cz = sim.job.z;
  const px = (x: number) => (x - cx) * scale + w / 2,
    pz = (z: number) => (z - cz) * scale + h / 2;
  ctx.fillStyle = '#354e37';
  ctx.fillRect(0, 0, w, h);

  const shouldRotate =
    trackUp && (sim.phase === 'flying' || sim.phase === 'paused');
  if (shouldRotate) {
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-sim.heading);
    ctx.translate(-w / 2, -h / 2);
  }
  const polygonPath = (job: {
    x: number;
    z: number;
    boundary?: readonly { x: number; z: number }[];
    width?: number;
    depth?: number;
  }) => {
    ctx.beginPath();
    fieldOutline(job).forEach((p, i) => {
      if (i === 0) ctx.moveTo(px(job.x + p.x), pz(job.z + p.z));
      else ctx.lineTo(px(job.x + p.x), pz(job.z + p.z));
    });
    ctx.closePath();
  };
  for (const field of fields) {
    ctx.fillStyle =
      field.crop === 'corn'
        ? '#61783a'
        : field.crop === 'soybeans'
          ? '#3e633c'
          : '#4e6c3e';
    polygonPath(field);
    ctx.fill();
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
  polygonPath(sim.job);
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(138, 226, 68, 0.72)';
  const boxDim = 12 * scale;
  sim.covered.forEach((n) =>
    ctx.fillRect(
      px(sim.job.x - 228 + (n % 38) * 12),
      pz(sim.job.z - 228 + Math.floor(n / 38) * 12),
      boxDim,
      boxDim,
    ),
  );
  if (boxDim >= 2.2) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.38)';
    ctx.lineWidth = Math.min(1, Math.max(0.5, boxDim * 0.1));
    sim.covered.forEach((n) =>
      ctx.strokeRect(
        px(sim.job.x - 228 + (n % 38) * 12) + 0.5,
        pz(sim.job.z - 228 + Math.floor(n / 38) * 12) + 0.5,
        Math.max(1, boxDim - 1),
        Math.max(1, boxDim - 1),
      ),
    );
  }
  ctx.restore();
  for (const zone of sim.job.noSprayZones ?? []) {
    ctx.fillStyle = '#583c2d';
    ctx.strokeStyle = '#ffd28a';
    ctx.lineWidth = 1.5;
    const x = px(sim.job.x + zone.x - zone.width / 2),
      z = pz(sim.job.z + zone.z - zone.depth / 2);
    ctx.fillRect(x, z, zone.width * scale, zone.depth * scale);
    ctx.strokeRect(x, z, zone.width * scale, zone.depth * scale);
    const kind = (zone as { kind?: string }).kind;
    const cx = px(sim.job.x + zone.x),
      cz = pz(sim.job.z + zone.z);
    if (kind === 'barn') {
      const bw = Math.max(8, 18 * scale),
        bh = Math.max(6, 13 * scale);
      ctx.fillStyle = '#9e2b1b';
      ctx.fillRect(cx - bw / 2, cz - bh / 2, bw, bh);
      ctx.fillStyle = '#eae3d2';
      ctx.beginPath();
      ctx.moveTo(cx - bw / 2 - 1, cz - bh / 2);
      ctx.lineTo(cx, cz - bh / 2 - Math.max(3, 5 * scale));
      ctx.lineTo(cx + bw / 2 + 1, cz - bh / 2);
      ctx.closePath();
      ctx.fill();
    }
  }
  const bird = birdFlock(sim.job, sim.elapsed),
    swarm = locustSwarm(sim.job, sim.elapsed),
    tornado = tornadoState(sim.job, sim.elapsed);
  for (const [point, radius, color] of [
    [bird, 18, '#fff2c6'],
    [swarm, 58, '#cbda63'],
    [tornado, 220, '#ff9b67'],
  ] as const) {
    if (!point) continue;
    ctx.strokeStyle = color;
    ctx.fillStyle = color + '33';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(
      px(point.x),
      pz(point.z),
      Math.max(3, radius * scale),
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.stroke();
  }
  ctx.setLineDash([4, 3]);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#d1e795';
  polygonPath(sim.job);
  ctx.stroke();
  ctx.setLineDash([]);
  if (guideEnabled && (sim.phase === 'flying' || sim.phase === 'paused')) {
    const pass = nextPass(sim);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const guideX = pass.x - sim.sprayDrift;
    let drawing = false;
    for (let z = pass.maxZ; z >= pass.minZ; z -= 4) {
      const protectedYard = sim.job.noSprayZones?.some(
        (zone) =>
          Math.abs(guideX - sim.job.x - zone.x) <= zone.width / 2 &&
          Math.abs(z - sim.job.z - zone.z) <= zone.depth / 2,
      );
      if (protectedYard) {
        drawing = false;
        continue;
      }
      if (!drawing) ctx.moveTo(px(guideX), pz(z));
      else ctx.lineTo(px(guideX), pz(z));
      drawing = true;
    }
    ctx.stroke();
    const footprint = sprayFootprint(sim),
      safety = spraySafety(sim);
    ctx.strokeStyle =
      safety === 'outside'
        ? '#ff8870'
        : safety === 'edge'
          ? '#ffc75e'
          : '#b9ff7a';
    ctx.beginPath();
    footprint.forEach((point, i) => {
      if (i === 0) ctx.moveTo(px(point.x), pz(point.z));
      else ctx.lineTo(px(point.x), pz(point.z));
    });
    ctx.closePath();
    ctx.stroke();
  }
  // Draw uncollected tokens
  for (const c of sim.collectibles) {
    if (c.collected) continue;
    const cxPos = px(c.x),
      czPos = pz(c.z);
    if (cxPos < -10 || cxPos > w + 10 || czPos < -10 || czPos > h + 10)
      continue;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cxPos, czPos, c.kind === 'cash' ? 3.5 : 4, 0, Math.PI * 2);
    ctx.fillStyle = c.kind === 'cash' ? '#ffd166' : '#38bdf8';
    ctx.shadowColor = c.kind === 'cash' ? '#fb8500' : '#0284c7';
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.restore();
  }

  const planeScreenX = px(sim.x);
  const planeScreenZ = pz(sim.z);
  const isOffScreen =
    planeScreenX < 12 ||
    planeScreenX > w - 12 ||
    planeScreenZ < 12 ||
    planeScreenZ > h - 12;

  if (!isOffScreen) {
    ctx.save();
    ctx.translate(planeScreenX, planeScreenZ);
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
  } else {
    // Off-screen needle indicator
    const distMeters = Math.round(Math.hypot(sim.x - cx, sim.z - cz));
    const edgeX = Math.max(14, Math.min(w - 14, planeScreenX));
    const edgeZ = Math.max(14, Math.min(h - 14, planeScreenZ));
    const angleToPlane = Math.atan2(planeScreenZ - h / 2, planeScreenX - w / 2);

    ctx.save();
    ctx.translate(edgeX, edgeZ);
    ctx.rotate(angleToPlane + Math.PI / 2);
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#fb8500';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-6, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Distance badge
    ctx.save();
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#000000';
    ctx.shadowBlur = 4;
    const text = `${distMeters}m`;
    const textWidth = ctx.measureText(text).width;
    const badgeX = Math.max(
      textWidth / 2 + 4,
      Math.min(w - textWidth / 2 - 4, edgeX),
    );
    const badgeZ = edgeZ > h / 2 ? edgeZ - 11 : edgeZ + 15;
    ctx.fillText(text, badgeX - textWidth / 2, badgeZ);
    ctx.restore();
  }
  for (const pilot of pilots) {
    if (pilot.id === viewerId || pilot.phase !== 'flying') continue;
    const screenX = px(pilot.x);
    const screenZ = pz(pilot.z);
    const isRival = Boolean(
      (rivalPilotId && pilot.id === rivalPilotId) ||
      (rivalCallsign && pilot.callsign === rivalCallsign),
    );
    const onScreen =
      screenX >= 8 && screenX <= w - 8 && screenZ >= 8 && screenZ <= h - 8;

    if (onScreen) {
      ctx.save();
      ctx.translate(screenX, screenZ);
      ctx.rotate(pilot.heading);

      // Spray swath tail if spraying
      if (pilot.spraying) {
        ctx.strokeStyle = '#84cc16';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 4);
        ctx.lineTo(0, 12);
        ctx.stroke();
      }

      ctx.fillStyle = isRival ? '#fbbf24' : '#38bdf8';
      ctx.strokeStyle = '#0f172a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(5, 5);
      ctx.lineTo(0, 2);
      ctx.lineTo(-5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Callsign tag
      ctx.save();
      ctx.font = 'bold 9px sans-serif';
      const tag = isRival ? `★ ${pilot.callsign}` : pilot.callsign;
      ctx.fillStyle = isRival ? '#fef08a' : '#e0f2fe';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 3;
      ctx.fillText(tag, screenX + 7, screenZ + 3);
      ctx.restore();
    } else {
      // Off-screen radar pip on border (pointing from player's aircraft position)
      const angle = Math.atan2(pilot.z - sim.z, pilot.x - sim.x);
      const edgeX = Math.max(
        12,
        Math.min(w - 12, w / 2 + Math.cos(angle) * (w / 2 - 14)),
      );
      const edgeZ = Math.max(
        12,
        Math.min(h - 12, h / 2 + Math.sin(angle) * (h / 2 - 14)),
      );
      const distM = Math.round(Math.hypot(pilot.x - sim.x, pilot.z - sim.z));
      const distText =
        distM < 1000 ? `${distM}m` : `${(distM / 1000).toFixed(1)}k`;

      ctx.save();
      ctx.translate(edgeX, edgeZ);
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = isRival ? '#fbbf24' : '#38bdf8';
      ctx.beginPath();
      ctx.moveTo(0, -5);
      ctx.lineTo(3, 3);
      ctx.lineTo(0, 1);
      ctx.lineTo(-3, 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Small distance text near pip
      ctx.save();
      ctx.font = '8px sans-serif';
      ctx.fillStyle = isRival ? '#fef08a' : '#93c5fd';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 3;
      const textX = Math.max(14, Math.min(w - 28, edgeX - 8));
      const textZ = edgeZ > h / 2 ? edgeZ - 6 : edgeZ + 12;
      ctx.fillText(distText, textX, textZ);
      ctx.restore();
    }
  }
  if (shouldRotate) {
    ctx.restore();
  }
}
