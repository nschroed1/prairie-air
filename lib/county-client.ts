import {
  type Action,
  type CountyCommand,
  type CountySnapshot,
  type Step,
  hydrate,
} from './county';
import { Simulation, type Controls } from './simulation';
import { browserAuth, playerHeaders } from './supabase/client';

export class CountyClient {
  snapshot: CountySnapshot | null = null;
  online = false;
  status = 'Connecting to county…';
  pending = false;
  actionPending = false;
  private requestFinished: Promise<void> = Promise.resolve();
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
  unsubscribeAuth: (() => void) | null = null;
  authUser: string | null = null;
  async start() {
    this.disposed = false;
    const generation = ++this.generation;
    try {
      const auth = await browserAuth();
      if (this.disposed || generation !== this.generation) return;
      const { data } = auth.auth.onAuthStateChange((_event, session) => {
        const id = session?.user.id ?? null;
        if (id === this.authUser) return;
        this.authUser = id;
        this.disconnect();
        this.snapshot = null;
        // Do not re-enter the Auth client while its change callback holds a lock.
        setTimeout(() => {
          if (!this.disposed) void this.poll();
        }, 0);
      });
      this.unsubscribeAuth = () => data.subscription.unsubscribe();
    } catch {
      /* Public spectating can still load while account setup is unavailable. */
    }
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
    const generation = this.flightGeneration;
    try {
      let headers = {};
      try {
        headers = await playerHeaders();
      } catch {
        /* Remain a spectator. */
      }
      if (this.disposed || generation !== this.flightGeneration) return;
      const r = await fetch('/api/county', { cache: 'no-store', headers });
      if (!r.ok) throw new Error();
      const snapshot = (await r.json()) as CountySnapshot;
      if (this.disposed || generation !== this.flightGeneration || this.pending)
        return;
      if (
        snapshot.viewerId === this.snapshot?.viewerId &&
        (snapshot.player?.revision ?? -1) <
          (this.snapshot?.player?.revision ?? -1)
      )
        return;
      this.snapshot = snapshot;
      this.status = 'County connected';
      this.changed();
    } catch {
      this.status = 'County offline · solo practice available';
      this.changed();
    }
  }
  record(dt: number, input: Controls) {
    if (!this.online || this.sim.phase !== 'flying') return;
    if (this.steps.length < 100) this.steps.push({ dt, input: { ...input } });
    else {
      this.online = false;
      this.sim.phase = 'paused';
      this.status = 'Connection lost · reconnect to continue';
      this.notify(this.status);
    }
  }
  async action(action: Action, extra: Partial<CountyCommand> = {}) {
    if (this.actionPending || this.disposed) return false;
    this.actionPending = true;
    this.changed();
    const generation = this.flightGeneration;
    try {
      // Reserve the next request before waiting so background ticks cannot
      // overtake a pilot's click. Use the completed response's revision.
      await this.requestFinished;
      if (this.disposed || generation !== this.flightGeneration) return false;
      if (!this.online) await this.poll();
      if (this.disposed || generation !== this.flightGeneration) return false;
      if (!this.snapshot?.viewerId) {
        this.notify(
          'Sign in to your pilot account to fly in the public county.',
        );
        return false;
      }
      return await this.send(action, extra);
    } finally {
      this.actionPending = false;
      this.changed();
    }
  }
  async flush() {
    if (this.pending || this.actionPending || !this.online || this.disposed)
      return;
    if (!this.steps.length && Date.now() - this.lastPoll < 3000) return;
    await this.send('tick');
  }
  async send(action: Action, extra: Partial<CountyCommand> = {}) {
    if (this.pending || this.disposed) return false;
    this.pending = true;
    let finishRequest!: () => void;
    this.requestFinished = new Promise<void>((resolve) => {
      finishRequest = resolve;
    });
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
      const headers = await playerHeaders();
      if (this.disposed || generation !== this.flightGeneration) return false;
      const response = await fetch('/api/county', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      const data = (await response.json()) as CountySnapshot & {
        error?: string;
      };
      if (this.disposed || generation !== this.flightGeneration) return false;
      if (!response.ok) {
        if (response.status === 409 && action === 'claim') {
          this.notify(
            data.error ||
              'Another pilot claimed that field. Choose an open contract.',
          );
          void this.poll();
          return false;
        }
        throw new Error(data.error || 'Flight update failed.');
      }
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
      finishRequest();
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
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = null;
    if (this.timer) clearInterval(this.timer);
  }
}
