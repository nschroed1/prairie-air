import {
  type Action,
  type CountyCommand,
  type CountySnapshot,
  type Step,
  hydrate,
} from './county';
import { Simulation, type Controls } from './simulation';

export class CountyClient {
  snapshot: CountySnapshot | null = null;
  online = false;
  status = 'Connecting to county…';
  pending = false;
  steps: Step[] = [];
  disposed = false;
  timer: ReturnType<typeof setInterval> | null = null;
  lastPoll = 0;
  lastFull = 0;
  constructor(
    public sim: Simulation,
    public changed: () => void,
    public notify: (message: string) => void,
  ) {}
  generation = 0;
  flightGeneration = 0;
  async start() {
    this.disposed = false;
    const generation = ++this.generation;
    await this.poll();
    if (!this.disposed && generation === this.generation)
      this.timer = setInterval(() => {
        if (this.online) void this.flush();
        else if (Date.now() - this.lastPoll > 5000) void this.poll();
      }, 250);
  }
  async poll() {
    if (this.pending || this.disposed) return;
    this.lastPoll = Date.now();
    try {
      const r = await fetch('/api/county', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      this.snapshot = await r.json();
      this.status = 'County connected';
      this.changed();
    } catch {
      this.status = 'County offline · solo practice available';
      this.changed();
    }
  }
  record(dt: number, input: Controls) {
    if (!this.online) return;
    if (this.steps.length < 100) this.steps.push({ dt, input: { ...input } });
    else {
      this.online = false;
      this.sim.phase = 'paused';
      this.status = 'Connection lost · reconnect to continue';
      this.notify(this.status);
    }
  }
  async action(action: Action, extra: Partial<CountyCommand> = {}) {
    const deadline = Date.now() + 11000;
    while (this.pending && Date.now() < deadline && !this.disposed)
      await new Promise((resolve) => setTimeout(resolve, 40));
    if (this.pending || this.disposed) return false;
    if (!this.online) await this.poll();
    if (!this.snapshot?.viewerId) {
      this.notify('Sign in with ChatGPT to fly in the public county.');
      return false;
    }
    return this.send(action, extra);
  }
  async flush() {
    if (this.pending || !this.online || this.disposed) return;
    if (!this.steps.length && Date.now() - this.lastPoll < 3000) return;
    await this.send('tick');
  }
  async send(action: Action, extra: Partial<CountyCommand> = {}) {
    if (this.pending || this.disposed) return false;
    this.pending = true;
    const generation = this.flightGeneration;
    const sent = this.steps.splice(0);
    const body = {
      ...extra,
      action,
      requestId: crypto.randomUUID(),
      revision: this.snapshot?.player?.revision ?? 0,
      steps: sent,
      refreshCounty: Date.now() - this.lastFull > 4000,
    };
    try {
      const response = await fetch('/api/county', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await response.json()) as CountySnapshot & {
        error?: string;
      };
      if (this.disposed || generation !== this.flightGeneration) return false;
      if (!response.ok) throw new Error(data.error || 'Flight update failed.');
      this.snapshot =
        data.compact && this.snapshot
          ? {
              ...data,
              jobs: this.snapshot.jobs,
              standings: this.snapshot.standings,
              previousStandings: this.snapshot.previousStandings,
            }
          : data;
      this.lastPoll = Date.now();
      if (!data.compact) this.lastFull = Date.now();
      if (data.player) {
        const authoritative = hydrate(data.player.flight);
        const replay = this.steps.slice();
        if (action !== 'tick') {
          this.steps = [];
        } else
          for (const step of replay) authoritative.step(step.dt, step.input);
        const version = this.sim.coverageVersion;
        Object.assign(this.sim, authoritative);
        this.sim.coverageVersion = version + 1;
      }
      this.online = true;
      this.status = 'Flying in public county';
      this.changed();
      return true;
    } catch (e) {
      if (this.disposed || generation !== this.flightGeneration) return false;
      this.online = false;
      this.sim.phase = 'paused';
      this.steps = [];
      this.status = 'Reconnect to county';
      this.notify(
        e instanceof Error
          ? e.message
          : 'Connection interrupted. Reconnect to restore your flight.',
      );
      return false;
    } finally {
      this.pending = false;
      this.changed();
    }
  }
  disconnect() {
    this.flightGeneration++;
    this.online = false;
    this.steps = [];
    this.sim.phase = 'ready';
    this.status = 'Solo practice';
  }
  dispose() {
    this.disposed = true;
    this.generation++;
    if (this.timer) clearInterval(this.timer);
  }
}
