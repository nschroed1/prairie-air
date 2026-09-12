'use client';

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Music2, SlidersHorizontal, Volume2, VolumeX } from 'lucide-react';
import {
  GameAudio,
  audioFrame,
  readAudioMix,
  type AudioCue,
  type AudioMix,
} from '@/lib/game-audio';
import type { Simulation } from '@/lib/simulation';
import { SOUNDTRACK } from '@/lib/soundtrack';

const STORAGE = 'prairie-air-audio-v1';
let sessionMix: string | null = null;
const storedMix = () => {
  try {
    return localStorage.getItem(STORAGE) ?? sessionMix;
  } catch {
    return sessionMix;
  }
};
const serverMix = () => null;
const subscribeMix = (listener: () => void) => {
  window.addEventListener('storage', listener);
  window.addEventListener(STORAGE, listener);
  return () => {
    window.removeEventListener('storage', listener);
    window.removeEventListener(STORAGE, listener);
  };
};

export function useGameAudio(
  sim: Simulation,
  scene: { menu: boolean; assigned: boolean; scope: string },
) {
  const { menu, assigned, scope } = scene;
  const engine = useRef<GameAudio | null>(null);
  const [enabled, setEnabled] = useState(false);
  const rawMix = useSyncExternalStore(subscribeMix, storedMix, serverMix);
  const mix = useMemo(() => readAudioMix(rawMix), [rawMix]);
  const [error, setError] = useState('');
  const [musicState, setMusicState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const current = useRef({ sim, ...scene, enabled, mix });
  const mounted = useRef(false);

  useEffect(() => {
    current.current = { sim, menu, assigned, scope, enabled, mix };
  }, [sim, menu, assigned, scope, enabled, mix]);
  useEffect(() => {
    engine.current?.resetCues();
  }, [scope]);
  useEffect(() => {
    mounted.current = true;
    const tick = () => {
      const state = current.current;
      engine.current?.update(
        audioFrame(state.sim, state.assigned),
        state.mix,
        state.enabled,
        state.menu,
        document.hidden,
      );
    };
    const timer = setInterval(tick, 50);
    const visibility = () => {
      tick();
      if (!engine.current) return;
      if (document.hidden)
        void engine.current.context.suspend().catch(() => {});
      else if (current.current.enabled)
        void engine.current.unlock().catch(() => {
          setEnabled(false);
          setError('Tap Enable sound to resume audio.');
        });
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibility);
      engine.current?.dispose();
      engine.current = null;
    };
  }, []);

  const loadMusic = useCallback(() => {
    if (!engine.current || !SOUNDTRACK.src) return;
    setMusicState('loading');
    void engine.current
      .loadMusic(SOUNDTRACK.src)
      .then(() => {
        if (mounted.current) setMusicState('ready');
      })
      .catch(() => {
        if (mounted.current) {
          setMusicState('error');
          setError(
            'Music could not load. Flight sounds are still available; toggle sound to retry.',
          );
        }
      });
  }, []);

  const toggle = useCallback(() => {
    if (current.current.enabled) {
      current.current.enabled = false;
      setEnabled(false);
      return;
    }
    setError('');
    try {
      if (!window.AudioContext)
        throw new Error('Audio is not supported in this browser.');
      if (!engine.current) engine.current = new GameAudio();
      // Call resume directly from the click, before any network requests.
      void engine.current
        .unlock()
        .then(() => {
          if (!mounted.current) return;
          current.current.enabled = true;
          setEnabled(true);
        })
        .catch(() => {
          if (mounted.current) {
            setEnabled(false);
            setError(
              'Your browser paused audio. Tap Enable sound to try again.',
            );
          }
        });
      loadMusic();
    } catch {
      setError('Sound could not start in this browser. You can still fly.');
    }
  }, [loadMusic]);

  const volume = useCallback((channel: keyof AudioMix, value: number) => {
    const next = {
      ...current.current.mix,
      [channel]: Math.max(0, Math.min(1, value)),
    };
    current.current.mix = next;
    sessionMix = JSON.stringify(next);
    try {
      localStorage.setItem(STORAGE, sessionMix);
    } catch {}
    window.dispatchEvent(new Event(STORAGE));
  }, []);
  const cue = useCallback((name: AudioCue) => {
    engine.current?.play(name);
  }, []);
  const updateRemoteProximity = useCallback(
    (dist: number, speed: number, pan: number) => {
      engine.current?.updateRemoteProximity(dist, speed, pan);
    },
    [],
  );
  return {
    enabled,
    mix,
    error,
    musicState,
    toggle,
    volume,
    cue,
    updateRemoteProximity,
    hasMusic: Boolean(SOUNDTRACK.src),
  };
}

type AudioControls = ReturnType<typeof useGameAudio>;

export function WelcomeAudio({ sound }: { sound: AudioControls }) {
  return (
    <button
      className={`welcome-audio ${sound.enabled ? 'is-playing' : ''}`}
      onClick={sound.toggle}
      aria-pressed={sound.enabled}
    >
      {sound.enabled ? (
        <Volume2 size={15} />
      ) : sound.hasMusic ? (
        <Music2 size={15} />
      ) : (
        <VolumeX size={15} />
      )}
      {sound.enabled
        ? sound.musicState === 'loading'
          ? 'Tuning in…'
          : sound.hasMusic
            ? 'Prairie radio is on'
            : 'Flight audio is on'
        : sound.hasMusic
          ? 'Listen to the prairie'
          : 'Enable flight audio'}
      <span>{sound.enabled ? 'Sound on' : 'Sound off'}</span>
    </button>
  );
}

export function SoundControls({ sound }: { sound: AudioControls }) {
  const id = useId();
  return (
    <div className="sound-controls">
      <button
        onClick={sound.toggle}
        title={sound.enabled ? 'Mute all sound' : 'Enable sound'}
        aria-label={sound.enabled ? 'Mute all sound' : 'Enable sound'}
        aria-pressed={sound.enabled}
      >
        {sound.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
      </button>
      <details className="sound-settings">
        <summary aria-label="Sound settings" title="Sound settings">
          <SlidersHorizontal size={15} />
        </summary>
        <div className="sound-settings-card">
          <strong>Prairie radio</strong>
          <p>
            {sound.enabled
              ? sound.hasMusic
                ? SOUNDTRACK.title
                : 'Your cockpit. Your mix.'
              : 'Enable sound to hear your mix.'}
          </p>
          {sound.hasMusic && (
            <label htmlFor={`${id}-music-volume`}>
              <span>
                Menu music <output>{Math.round(sound.mix.music * 100)}%</output>
              </span>
              <input
                id={`${id}-music-volume`}
                type="range"
                min="0"
                max="100"
                value={Math.round(sound.mix.music * 100)}
                onChange={(e) =>
                  sound.volume('music', Number(e.target.value) / 100)
                }
              />
            </label>
          )}
          <label htmlFor={`${id}-effects-volume`}>
            <span>
              Flight & effects{' '}
              <output>{Math.round(sound.mix.effects * 100)}%</output>
            </span>
            <input
              id={`${id}-effects-volume`}
              type="range"
              min="0"
              max="100"
              value={Math.round(sound.mix.effects * 100)}
              onChange={(e) =>
                sound.volume('effects', Number(e.target.value) / 100)
              }
            />
          </label>
          <small>
            {sound.hasMusic ? 'Music fades out in flight. ' : ''}Audio rests
            when this tab is hidden.
          </small>
        </div>
      </details>
      {sound.error && <output className="audio-error">{sound.error}</output>}
    </div>
  );
}
