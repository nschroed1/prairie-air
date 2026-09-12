import {
  clamp,
  type Phase,
  type Simulation,
  type FlightReward,
} from './simulation';
import type { ArcadeEvent } from './arcade-systems';

export type AudioCue =
  | 'launch'
  | 'spray-on'
  | 'spray-off'
  | 'overspray'
  | 'low-tank'
  | 'target'
  | 'bonus'
  | 'complete'
  | 'crash'
  | 'refill'
  | 'upgrade'
  | 'rival'
  | 'bird-strike'
  | 'hazard'
  | 'barnstormer'
  | 'inverted-barnstormer'
  | 'coin'
  | 'powerup'
  | 'spray-pop'
  | 'streak-chord'
  | 'cash-register'
  | 'near-miss'
  | 'clean-pass'
  | 'ag-turn'
  | 'flow-tick'
  | 'deck-skim'
  | 'wire-skimmer'
  | 'trestle-runner';
export type AudioFrame = {
  job: number;
  phase: Phase;
  elapsed: number;
  speed: number;
  throttle: number;
  altitude: number;
  spraying: boolean;
  overspraying: boolean;
  tank: number;
  capacity: number;
  coverage: number;
  target: number;
  bonusTarget: number;
  wind: number;
  pan: number;
  rain: number;
  assigned: boolean;
  birdHits?: number;
  hazard?: boolean;
  barnstormed?: boolean;
  invertedBarnstormed?: boolean;
  collectedCue?: 'coin' | 'powerup' | null;
  stuntCue?: AudioCue | null;
  arcadeEvents?: ArcadeEvent[];
  sprayPop?: boolean;
  passStreak?: number;
  deckSkimming?: boolean;
  nearMiss?: boolean;
  rewards?: FlightReward[];
};

export function audioFrame(sim: Simulation, assigned = true): AudioFrame {
  const wind = sim.windVector;
  return {
    job: sim.job.id,
    phase: sim.phase,
    elapsed: sim.elapsed,
    speed: sim.speed,
    throttle: sim.throttle,
    altitude: sim.altitude,
    spraying: sim.spraying,
    overspraying: sim.overspraying,
    tank: sim.tank,
    capacity: sim.tankCapacity,
    coverage: sim.coverage,
    target: sim.job.target,
    bonusTarget: sim.job.bonusTarget,
    wind: Math.hypot(wind.x, wind.z),
    pan: clamp(
      (wind.x * Math.cos(sim.heading) + wind.z * Math.sin(sim.heading)) / 8,
      -0.7,
      0.7,
    ),
    rain: sim.weather?.rain ?? 0,
    assigned,
    birdHits: sim.birdHits,
    hazard: Boolean(sim.job.challenge && sim.warning.danger),
    barnstormed: sim.barnstormed,
    invertedBarnstormed: sim.invertedBarnstormed,
    rewards: sim.rewards,
    collectedCue: sim.lastCollectedCue,
    stuntCue: (sim.lastStuntCue as AudioCue) ?? null,
    arcadeEvents: sim.lastArcadeEvents,
    sprayPop: (sim.newCellsAdded ?? 0) > 0,
    passStreak: sim.arcade?.passStreak ?? 1,
    deckSkimming: sim.arcade?.isDeckSkimming ?? false,
  };
}

// Track milestones independently of rendering and server corrections. Enabling
// audio starts from the current frame rather than replaying old achievements.
export class AudioCueTracker {
  private previous: AudioFrame | null = null;
  private targetHeard = false;
  private bonusHeard = false;
  private lowTankHeard = false;
  private barnstormedHeard = false;
  private invertedBarnstormedHeard = false;
  private lastStuntCue: AudioCue | null = null;
  private lastWarning = -Infinity;
  private lastValve = -Infinity;
  lastStreak = 1;
  private lastRewardId = 0;
  private pendingReward: FlightReward | null = null;

  reset(frame: AudioFrame | null = null) {
    this.previous = frame;
    this.targetHeard = Boolean(frame && frame.coverage >= frame.target);
    this.bonusHeard = Boolean(frame && frame.coverage >= frame.bonusTarget);
    this.lowTankHeard = Boolean(frame && frame.tank / frame.capacity <= 0.15);
    this.barnstormedHeard = Boolean(frame && frame.barnstormed);
    this.invertedBarnstormedHeard = Boolean(frame && frame.invertedBarnstormed);
    this.lastStuntCue = null;
    this.pendingReward = null;
    this.lastWarning = this.lastValve = -Infinity;
    this.lastStreak = frame?.passStreak ?? 1;
    this.lastRewardId = frame?.rewards?.at(-1)?.id ?? 0;
  }

  update(frame: AudioFrame, seconds: number): AudioCue[] {
    const previous = this.previous;
    this.previous = frame;
    if (!previous) {
      this.reset(frame);
      return [];
    }
    // Public completion releases the assignment in the same server snapshot.
    if (
      frame.phase === 'complete' &&
      previous.phase !== 'complete' &&
      previous.assigned
    )
      return ['complete'];
    if (previous.job !== frame.job || previous.assigned !== frame.assigned) {
      this.reset(frame);
      return frame.phase === 'flying' && frame.elapsed < 0.5 ? ['launch'] : [];
    }
    const newFlight = frame.elapsed < 0.25 && previous.elapsed > 0.75;
    if (newFlight) this.reset(frame);
    if (frame.phase !== previous.phase) {
      if (frame.phase === 'crashed') return ['crash'];
      if (frame.phase === 'flying' && frame.elapsed < 0.5) return ['launch'];
    }
    if (frame.phase !== 'flying') return [];
    const cues: AudioCue[] = [];
    if (frame.passStreak) this.lastStreak = frame.passStreak;
    if (frame.rewards) {
      const unseen = frame.rewards.filter((r) => r.id > this.lastRewardId);
      if (unseen.length) this.lastRewardId = unseen[unseen.length - 1].id;
      const reward = [...unseen].reverse().find((r) => r.cue !== 'spray-pop');
      if (reward) this.pendingReward = reward;
      if (this.pendingReward && frame.elapsed - this.pendingReward.at > 5)
        this.pendingReward = null;
      if (this.pendingReward && !frame.hazard) {
        cues.push(this.pendingReward.cue as AudioCue);
        this.pendingReward = null;
      }
    } else if (frame.collectedCue) cues.push(frame.collectedCue);
    if (
      frame.sprayPop &&
      (!previous.sprayPop || frame.elapsed !== previous.elapsed)
    ) {
      cues.push('spray-pop');
    }
    if (frame.nearMiss && !previous.nearMiss) {
      cues.push('near-miss');
    }
    if (
      !frame.rewards &&
      frame.arcadeEvents?.length &&
      (frame.elapsed !== previous.elapsed ||
        frame.arcadeEvents !== previous.arcadeEvents)
    ) {
      for (const event of frame.arcadeEvents) {
        if (event.type === 'clean_pass') {
          this.lastStreak = event.streak;
          cues.push('streak-chord');
        } else if (event.type === 'ag_turn') {
          cues.push('cash-register');
        } else if (event.type === 'flow_tick') {
          cues.push('spray-pop');
        } else if (event.type === 'deck_skim') {
          cues.push('coin');
        }
      }
    }
    if ((frame.birdHits ?? 0) > (previous.birdHits ?? 0))
      return [...cues, 'bird-strike'];
    if (frame.hazard && !previous.hazard && seconds - this.lastWarning > 8) {
      this.lastWarning = seconds;
      return [...cues, 'hazard'];
    }
    if (
      frame.assigned &&
      !this.bonusHeard &&
      frame.coverage >= frame.bonusTarget
    ) {
      this.bonusHeard = this.targetHeard = true;
      return [...cues, 'bonus'];
    }
    if (frame.assigned && !this.targetHeard && frame.coverage >= frame.target) {
      this.targetHeard = true;
      return [...cues, 'target'];
    }
    if (
      frame.overspraying &&
      frame.assigned &&
      seconds - this.lastWarning > 5
    ) {
      this.lastWarning = seconds;
      return [...cues, 'overspray'];
    }
    if (!this.lowTankHeard && frame.tank / frame.capacity <= 0.15) {
      this.lowTankHeard = true;
      return [...cues, 'low-tank'];
    }
    if (
      !newFlight &&
      frame.capacity === previous.capacity &&
      frame.tank - previous.tank > 20
    ) {
      this.lowTankHeard = false;
      return [...cues, 'refill'];
    }
    if (
      !frame.rewards &&
      frame.invertedBarnstormed &&
      !this.invertedBarnstormedHeard
    ) {
      this.invertedBarnstormedHeard = true;
      this.barnstormedHeard = true;
      return [...cues, 'inverted-barnstormer'];
    }
    if (!frame.rewards && frame.barnstormed && !this.barnstormedHeard) {
      this.barnstormedHeard = true;
      return [...cues, 'barnstormer'];
    }
    if (
      !frame.rewards &&
      frame.stuntCue &&
      frame.stuntCue !== this.lastStuntCue
    ) {
      this.lastStuntCue = frame.stuntCue;
      cues.push(frame.stuntCue);
    }
    if (
      frame.spraying !== previous.spraying &&
      seconds - this.lastValve > 0.25
    ) {
      this.lastValve = seconds;
      return [...cues, frame.spraying ? 'spray-on' : 'spray-off'];
    }
    return cues;
  }
}

export type AudioMix = { music: number; effects: number };
export const DEFAULT_AUDIO_MIX: AudioMix = { music: 0.35, effects: 0.6 };
export function readAudioMix(raw: string | null): AudioMix {
  try {
    const value = JSON.parse(raw ?? '{}');
    const volume = (v: unknown, fallback: number) =>
      typeof v === 'number' && Number.isFinite(v) ? clamp(v, 0, 1) : fallback;
    return {
      music: volume(value?.music, 0.35),
      effects: volume(value?.effects, 0.6),
    };
  } catch {
    return { ...DEFAULT_AUDIO_MIX };
  }
}

type Layer = {
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: StereoPannerNode;
};
type Tone = { osc: OscillatorNode; gain: GainNode };

// One audio graph per page. All sources are quiet until an explicit user
// gesture unlocks the context; volumes ramp to avoid clicks on pause/mute.
export class GameAudio {
  readonly context: AudioContext;
  private master: GainNode;
  private effects: GainNode;
  private music: GainNode;
  private prop: Tone;
  private motor: Tone;
  private propFilter: BiquadFilterNode;
  private wind: Layer;
  private spray: Layer;
  private rain: Layer;
  private sources: AudioScheduledSourceNode[] = [];
  private musicSource: AudioBufferSourceNode | null = null;
  private musicRequest: Promise<void> | null = null;
  private musicAbort = new AbortController();
  private disposed = false;
  private tracker = new AudioCueTracker();
  private audible = false;
  private effectsAudible = false;
  private sprayPopPoolSize = 8;
  private sprayPopPoolIndex = 0;
  private sprayPopGains: GainNode[] = [];
  private deckHumFilter: BiquadFilterNode;
  private deckHumGain: GainNode;
  private deckHumOsc: OscillatorNode;
  private remoteEngineFilter: BiquadFilterNode;
  private remoteEngineGain: GainNode;
  private remoteEngineOsc: OscillatorNode;
  private remoteEnginePan?: StereoPannerNode;

  constructor() {
    this.context = new AudioContext();
    const ctx = this.context;
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -12;
    compressor.knee.value = 12;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.2;
    this.master.connect(compressor).connect(ctx.destination);
    this.effects = ctx.createGain();
    this.effects.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = 0;
    this.music.connect(this.master);

    this.deckHumFilter = ctx.createBiquadFilter();
    this.deckHumFilter.type = 'bandpass';
    this.deckHumFilter.frequency.value = 120;
    this.deckHumFilter.Q.value = 2.4;
    this.deckHumGain = ctx.createGain();
    this.deckHumGain.gain.value = 0;
    this.deckHumOsc = ctx.createOscillator();
    this.deckHumOsc.type = 'triangle';
    this.deckHumOsc.frequency.value = 120;
    this.deckHumOsc
      .connect(this.deckHumFilter)
      .connect(this.deckHumGain)
      .connect(this.effects);
    this.deckHumOsc.start();
    this.sources.push(this.deckHumOsc);

    this.remoteEngineFilter = ctx.createBiquadFilter();
    this.remoteEngineFilter.type = 'lowpass';
    this.remoteEngineFilter.frequency.value = 420;
    this.remoteEngineGain = ctx.createGain();
    this.remoteEngineGain.gain.value = 0;
    if (typeof ctx.createStereoPanner === 'function') {
      this.remoteEnginePan = ctx.createStereoPanner();
      this.remoteEngineFilter
        .connect(this.remoteEngineGain)
        .connect(this.remoteEnginePan)
        .connect(this.effects);
    } else {
      this.remoteEngineFilter
        .connect(this.remoteEngineGain)
        .connect(this.effects);
    }
    this.remoteEngineOsc = ctx.createOscillator();
    this.remoteEngineOsc.type = 'sawtooth';
    this.remoteEngineOsc.frequency.value = 95;
    this.remoteEngineOsc.connect(this.remoteEngineFilter);
    this.remoteEngineOsc.start();
    this.sources.push(this.remoteEngineOsc);

    for (let i = 0; i < this.sprayPopPoolSize; i++) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(this.effects);
      this.sprayPopGains.push(g);
    }

    this.propFilter = ctx.createBiquadFilter();
    this.propFilter.type = 'lowpass';
    this.propFilter.frequency.value = 360;
    this.prop = this.tone('sine', this.propFilter);
    this.prop.osc.setPeriodicWave(
      ctx.createPeriodicWave(
        new Float32Array(8),
        new Float32Array([0, 1, 0.32, 0.48, 0.13, 0.2, 0.08, 0.1]),
      ),
    );
    this.propFilter.connect(this.effects);
    const motorFilter = ctx.createBiquadFilter();
    motorFilter.type = 'lowpass';
    motorFilter.frequency.value = 650;
    this.motor = this.tone('triangle', motorFilter);
    motorFilter.connect(this.effects);
    const pulse = ctx.createOscillator();
    const pulseDepth = ctx.createGain();
    pulse.frequency.value = 8;
    pulseDepth.gain.value = 5;
    pulse.connect(pulseDepth).connect(this.prop.osc.detune);
    pulse.start();
    this.sources.push(pulse);

    // Different offsets into a shared noise buffer avoid correlated layers.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const samples = noise.getChannelData(0);
    let smooth = 0;
    for (let i = 0; i < samples.length; i++) {
      const white = Math.random() * 2 - 1;
      smooth = (smooth + 0.035 * white) / 1.035;
      samples[i] = smooth * 3 + white * 0.35;
    }
    this.wind = this.noise(noise, 'lowpass', 650, 0);
    this.spray = this.noise(noise, 'bandpass', 2200, 1.3);
    this.spray.filter.Q.value = 0.6;
    this.rain = this.noise(noise, 'highpass', 1500, 2.7);
  }

  private tone(type: OscillatorType, destination: AudioNode): Tone {
    const osc = this.context.createOscillator();
    osc.type = type;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(destination);
    osc.start();
    this.sources.push(osc);
    return { osc, gain };
  }

  private noise(
    buffer: AudioBuffer,
    type: BiquadFilterType,
    frequency: number,
    offset: number,
  ): Layer {
    const ctx = this.context;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const pan = ctx.createStereoPanner();
    source.connect(filter).connect(gain).connect(pan).connect(this.effects);
    source.start(0, offset);
    this.sources.push(source);
    return { filter, gain, pan };
  }

  async unlock() {
    if (this.disposed) return;
    await this.context.resume();
    if (this.context.state !== 'running')
      throw new Error(
        'Audio is paused by your browser. Tap Enable sound to try again.',
      );
  }

  resetCues() {
    this.tracker.reset();
  }

  loadMusic(src: string) {
    if (this.musicRequest) return this.musicRequest;
    this.musicRequest = (async () => {
      const response = await fetch(src, { signal: this.musicAbort.signal });
      if (!response.ok)
        throw new Error(
          'The soundtrack could not load. Flight sounds are still available.',
        );
      const buffer = await this.context.decodeAudioData(
        await response.arrayBuffer(),
      );
      if (this.disposed) return;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.music);
      source.start();
      this.musicSource = source;
    })().catch((error: unknown) => {
      this.musicRequest = null;
      throw error;
    });
    return this.musicRequest;
  }

  update(
    frame: AudioFrame,
    mix: AudioMix,
    enabled: boolean,
    menu: boolean,
    hidden: boolean,
  ) {
    if (this.disposed) return;
    const ctx = this.context;
    const on = enabled && !hidden && ctx.state === 'running';
    const effectsOn = on && mix.effects > 0;
    if (this.audible !== on || this.effectsAudible !== effectsOn || !effectsOn)
      this.tracker.reset(frame);
    this.audible = on;
    this.effectsAudible = effectsOn;
    const ramp = (param: AudioParam, value: number, time = 0.15) =>
      param.setTargetAtTime(value, ctx.currentTime, time);
    ramp(this.master.gain, on ? 0.85 : 0, hidden ? 0.01 : 0.08);
    ramp(this.effects.gain, mix.effects);
    ramp(this.music.gain, on && menu ? mix.music * 0.65 : 0, 0.45);
    const flying = frame.phase === 'flying';
    const idle = frame.phase === 'paused' && !menu;
    const rpm = clamp((frame.throttle - 29) / 47, 0, 1);
    ramp(this.prop.osc.frequency, 42 + rpm * 39);
    ramp(this.motor.osc.frequency, 86 + rpm * 82);
    ramp(this.propFilter.frequency, 250 + rpm * 470);
    ramp(this.prop.gain.gain, flying ? 0.105 + rpm * 0.045 : idle ? 0.025 : 0);
    ramp(this.motor.gain.gain, flying ? 0.026 + rpm * 0.02 : 0);
    const gust = clamp(frame.wind / 9, 0, 1);
    ramp(
      this.wind.gain.gain,
      flying ? 0.035 + frame.speed / 800 + gust * 0.12 : 0,
    );
    ramp(this.wind.filter.frequency, 450 + frame.speed * 9 + gust * 1300);
    ramp(this.wind.pan.pan, frame.pan, 0.6);
    ramp(this.spray.gain.gain, flying && frame.spraying ? 0.17 : 0, 0.035);
    ramp(this.rain.gain.gain, flying ? clamp(frame.rain, 0, 1) * 0.17 : 0, 0.5);
    if (effectsOn) {
      this.playDeckHum(flying && Boolean(frame.deckSkimming));
      for (const cue of this.tracker.update(frame, ctx.currentTime))
        this.play(cue);
    } else {
      this.playDeckHum(false);
    }
  }

  playSprayPop() {
    if (this.disposed || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;
    const gain = this.sprayPopGains[this.sprayPopPoolIndex];
    this.sprayPopPoolIndex =
      (this.sprayPopPoolIndex + 1) % this.sprayPopPoolSize;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1250, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + 0.018);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018);

    osc.connect(gain);
    osc.start(now);
    osc.stop(now + 0.02);
    osc.onended = () => {
      osc.disconnect();
    };
  }

  playStreakChord(streak: number) {
    if (this.disposed || this.context.state !== 'running') return;
    const ctx = this.context;
    // Ascending Heartland D Major Pentatonic arpeggios (D4, F#4, A4, B4, D5)
    const notes = [293.66, 369.99, 440.0, 493.88, 587.33];
    const count = clamp(Math.floor(streak), 1, 5);
    const stepInterval = 0.055;
    const now = ctx.currentTime;
    const duration = 0.45;

    for (let i = 0; i < count; i++) {
      const start = now + i * stepInterval;
      const freq = notes[i];

      if (count === 5) {
        // Glorious 5-note rapid arpeggio with chorus!
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        gain.connect(this.effects);

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(freq, start);
        osc2.frequency.setValueAtTime(freq, start);
        osc1.detune.setValueAtTime(-9, start);
        osc2.detune.setValueAtTime(9, start);

        osc1.connect(gain);
        osc2.connect(gain);
        osc1.start(start);
        osc2.start(start);
        osc1.stop(start + duration + 0.03);
        osc2.stop(start + duration + 0.03);
        osc1.onended = () => {
          osc1.disconnect();
          osc2.disconnect();
          gain.disconnect();
        };
      } else {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.11, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        gain.connect(this.effects);

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        osc.connect(gain);
        osc.start(start);
        osc.stop(start + duration + 0.03);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
      }
    }
  }

  playCashRegister() {
    if (this.disposed || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;

    // Metallic latch transient
    const latchGain = ctx.createGain();
    latchGain.gain.setValueAtTime(0.12, now);
    latchGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    latchGain.connect(this.effects);

    const latchOsc = ctx.createOscillator();
    latchOsc.type = 'triangle';
    latchOsc.frequency.setValueAtTime(860, now);
    latchOsc.frequency.exponentialRampToValueAtTime(220, now + 0.025);
    latchOsc.connect(latchGain);
    latchOsc.start(now);
    latchOsc.stop(now + 0.03);
    latchOsc.onended = () => {
      latchOsc.disconnect();
      latchGain.disconnect();
    };

    // Dual bell harmonics (1975.5 Hz + 2637 Hz, 45ms delay)
    const bell1Start = now + 0.012;
    const bell2Start = bell1Start + 0.045;

    const bells = [
      { freq: 1975.5, start: bell1Start, dur: 0.5, gainVal: 0.14 },
      { freq: 2637.0, start: bell2Start, dur: 0.65, gainVal: 0.16 },
    ];

    for (const bell of bells) {
      const bGain = ctx.createGain();
      bGain.gain.setValueAtTime(0, bell.start);
      bGain.gain.linearRampToValueAtTime(bell.gainVal, bell.start + 0.004);
      bGain.gain.exponentialRampToValueAtTime(0.0001, bell.start + bell.dur);
      bGain.connect(this.effects);

      const bOsc = ctx.createOscillator();
      bOsc.type = 'sine';
      bOsc.frequency.setValueAtTime(bell.freq, bell.start);
      bOsc.connect(bGain);
      bOsc.start(bell.start);
      bOsc.stop(bell.start + bell.dur + 0.02);
      bOsc.onended = () => {
        bOsc.disconnect();
        bGain.disconnect();
      };
    }
  }

  playDeckHum(active: boolean) {
    if (this.disposed || this.context.state !== 'running') return;
    const now = this.context.currentTime;
    this.deckHumGain.gain.setTargetAtTime(
      active ? 0.08 : 0,
      now,
      active ? 0.06 : 0.12,
    );
  }

  playNearMissWhoosh() {
    if (this.disposed || this.context.state !== 'running') return;
    const ctx = this.context;
    const now = ctx.currentTime;

    // Quick compressor/gain duck
    const currentGain = this.effects.gain.value;
    this.effects.gain.setValueAtTime(currentGain, now);
    this.effects.gain.linearRampToValueAtTime(0.2 * currentGain, now + 0.035);
    this.effects.gain.linearRampToValueAtTime(currentGain, now + 0.35);

    // 60 Hz sub-bass air displacement whoosh
    const whooshGain = ctx.createGain();
    whooshGain.gain.setValueAtTime(0, now);
    whooshGain.gain.linearRampToValueAtTime(0.24, now + 0.045);
    whooshGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);
    whooshGain.connect(this.master);

    const subOsc = ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(75, now);
    subOsc.frequency.exponentialRampToValueAtTime(50, now + 0.38);
    subOsc.connect(whooshGain);

    subOsc.start(now);
    subOsc.stop(now + 0.4);
    subOsc.onended = () => {
      subOsc.disconnect();
      whooshGain.disconnect();
    };
  }

  updateRemoteProximity(dist: number, relSpeed: number, pan: number) {
    if (
      this.disposed ||
      this.context.state !== 'running' ||
      !this.audible ||
      !this.effectsAudible
    ) {
      if (this.remoteEngineGain) this.remoteEngineGain.gain.value = 0;
      return;
    }
    const now = this.context.currentTime;
    if (dist < 150) {
      const proximity = Math.max(0, 1 - (dist - 15) / 135);
      const targetGain = proximity * proximity * 0.16;
      this.remoteEngineGain.gain.setTargetAtTime(targetGain, now, 0.08);

      const freq = Math.max(
        68,
        Math.min(124, 92 + Math.max(-24, Math.min(28, relSpeed * 0.45))),
      );
      this.remoteEngineOsc.frequency.setTargetAtTime(freq, now, 0.06);

      if (this.remoteEnginePan) {
        this.remoteEnginePan.pan.setTargetAtTime(
          Math.max(-0.9, Math.min(0.9, pan)),
          now,
          0.06,
        );
      }
    } else {
      this.remoteEngineGain.gain.setTargetAtTime(0, now, 0.12);
    }
  }

  play(cue: AudioCue) {
    if (
      this.disposed ||
      !this.audible ||
      !this.effectsAudible ||
      this.context.state !== 'running'
    )
      return;

    if (cue === 'spray-pop' || cue === 'flow-tick') {
      this.playSprayPop();
      return;
    }
    if (cue === 'streak-chord' || cue === 'clean-pass') {
      this.playStreakChord(this.tracker.lastStreak);
      return;
    }
    if (cue === 'cash-register' || cue === 'ag-turn') {
      this.playCashRegister();
      return;
    }
    if (cue === 'near-miss') {
      this.playNearMissWhoosh();
      return;
    }
    if (cue === 'deck-skim') {
      this.play('coin');
      return;
    }
    const notes: Record<AudioCue, number[]> = {
      launch: [147, 220],
      'spray-on': [210],
      'spray-off': [145],
      overspray: [330, 247],
      'low-tank': [440, 440],
      target: [392, 494, 587],
      bonus: [494, 587, 784, 988],
      complete: [262, 330, 392, 523],
      crash: [68],
      refill: [196, 262, 330],
      upgrade: [330, 440, 554, 660],
      rival: [392, 523, 659],
      'bird-strike': [95, 62],
      hazard: [392, 294, 392],
      barnstormer: [330, 440, 554, 659, 880],
      coin: [784, 1046],
      powerup: [440, 554, 784],
      'spray-pop': [523, 659],
      'streak-chord': [392, 494, 587, 784],
      'cash-register': [784, 988, 1175],
      'near-miss': [180, 240],
      'clean-pass': [523, 659, 784],
      'ag-turn': [440, 554, 659],
      'flow-tick': [880],
      'deck-skim': [330, 392],
      'inverted-barnstormer': [440, 554, 659, 880, 1108],
      'wire-skimmer': [587, 880],
      'trestle-runner': [294, 440, 587],
    };
    const valve = cue === 'spray-on' || cue === 'spray-off';
    const warning =
      cue === 'overspray' ||
      cue === 'low-tank' ||
      cue === 'hazard' ||
      cue === 'bird-strike';
    const duration =
      cue === 'crash'
        ? 0.65
        : valve
          ? 0.075
          : warning
            ? 0.13
            : cue === 'coin'
              ? 0.22
              : cue === 'powerup'
                ? 0.26
                : 0.3;
    notes[cue].forEach((frequency, index) => {
      const ctx = this.context;
      const stepInterval = cue === 'coin' ? 0.075 : warning ? 0.2 : 0.105;
      const start = ctx.currentTime + index * stepInterval;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = warning || valve ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(frequency, start);
      if (cue === 'crash')
        osc.frequency.exponentialRampToValueAtTime(25, start + duration);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(
        valve
          ? 0.045
          : cue === 'crash'
            ? 0.22
            : cue === 'coin'
              ? 0.14
              : cue === 'powerup'
                ? 0.15
                : 0.105,
        start + 0.012,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      osc.connect(gain).connect(this.effects);
      osc.start(start);
      osc.stop(start + duration + 0.03);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  }

  dispose() {
    this.disposed = true;
    this.musicAbort.abort();
    this.musicSource?.stop();
    for (const source of this.sources) source.stop();
    void this.context.close().catch(() => {});
  }
}
