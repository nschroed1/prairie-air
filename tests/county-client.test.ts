import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { CountyClient } from '../lib/county-client';
import {
  initialFlight,
  seasonAt,
  seasonJobs,
  type CountyCommand,
  type CountySnapshot,
} from '../lib/county';
import { freshControls, Simulation } from '../lib/simulation';

function setup(t: TestContext) {
  const season = seasonAt();
  let snapshot: CountySnapshot = {
    season,
    jobs: seasonJobs(season),
    pilots: [],
    standings: [],
    previousStandings: [],
    viewerId: 'test-pilot',
    player: {
      id: 'test-pilot',
      callsign: 'Test Pilot',
      revision: 0,
      activeJob: null,
      flight: initialFlight(),
    },
    capacity: 32,
    now: Date.now(),
  };
  const notices: string[] = [];
  const commands: CountyCommand[] = [];
  const requests: Array<{
    command: CountyCommand;
    respond: (status?: number, error?: string) => void;
  }> = [];
  let arrived = Promise.withResolvers<void>();
  const client = new CountyClient(
    new Simulation(),
    () => {},
    (s) => notices.push(s),
  );
  client.snapshot = snapshot;
  client.online = true;
  t.after(() => client.dispose());
  t.mock.method(
    globalThis,
    'fetch',
    async (url: string, init?: RequestInit) => {
      if (url === '/api/auth/config')
        return Response.json({
          url: 'https://test.supabase.co',
          publishableKey: 'test-key',
        });
      assert.equal(url, '/api/county');
      if (!init?.method || init.method === 'GET')
        return Response.json(snapshot);
      const command = JSON.parse(init.body as string) as CountyCommand;
      commands.push(command);
      const response = Promise.withResolvers<Response>();
      requests.push({
        command,
        respond(status = 200, error = 'Another pilot claimed that field.') {
          if (status === 200) {
            assert.equal(
              command.revision,
              snapshot.player!.revision,
              'Use the latest completed revision',
            );
            const flight = initialFlight();
            if (command.action === 'claim') flight.phase = 'flying';
            snapshot = {
              ...snapshot,
              player: {
                ...snapshot.player!,
                revision: snapshot.player!.revision + 1,
                activeJob:
                  command.action === 'claim'
                    ? command.jobId!
                    : snapshot.player!.activeJob,
                flight,
              },
            };
            response.resolve(Response.json(snapshot));
          } else response.resolve(Response.json({ error }, { status }));
        },
      });
      arrived.resolve();
      return response.promise;
    },
  );
  return {
    client,
    commands,
    notices,
    async nextRequest(this: void) {
      if (!requests.length) await arrived.promise;
      const next = requests.shift()!;
      arrived = Promise.withResolvers<void>();
      return next;
    },
  };
}

void test(
  'a claim stays available during a slow tick and takes priority with its new revision',
  { timeout: 5000 },
  async (t) => {
    const { client, nextRequest, commands } = setup(t);
    const tick = client.flush();
    const update = await nextRequest();
    assert.equal(client.pending, true);
    assert.equal(
      client.actionPending,
      false,
      'Background updates must not disable contract buttons',
    );
    const claim = client.action('claim', { jobId: 100 });
    assert.equal(
      client.actionPending,
      true,
      'A deliberate action disables buttons immediately',
    );
    assert.equal(
      await client.action('claim', { jobId: 101 }),
      false,
      'Ignore repeated clicks',
    );
    // A timer firing as the response completes must not overtake the claim.
    client.changed = () => {
      if (client.online) void client.flush();
    };
    update.respond();
    await tick;
    const reservation = await nextRequest();
    assert.equal(reservation.command.action, 'claim');
    assert.equal(reservation.command.revision, 1);
    await client.flush();
    assert.deepEqual(
      commands.map((c) => c.action),
      ['tick', 'claim'],
    );
    reservation.respond();
    assert.equal(await claim, true);
    assert.equal(client.snapshot!.player!.activeJob, 100);
    assert.equal(client.sim.phase, 'flying');
    assert.equal(client.actionPending, false);
  },
);

void test(
  'a rejected reservation restores controls and a later claim can succeed',
  { timeout: 5000 },
  async (t) => {
    const { client, nextRequest, notices } = setup(t);
    const first = client.action('claim', { jobId: 100 });
    (await nextRequest()).respond(409);
    assert.equal(await first, false);
    assert.equal(client.actionPending, false);
    assert.match(notices[0], /Another pilot/);
    const retry = client.action('claim', { jobId: 101 });
    (await nextRequest()).respond();
    assert.equal(await retry, true);
    assert.equal(client.snapshot!.player!.activeJob, 101);
    assert.equal(client.actionPending, false);
  },
);

void test(
  'switching to practice cancels a claim waiting behind an update',
  { timeout: 5000 },
  async (t) => {
    const { client, nextRequest, commands } = setup(t);
    const tick = client.flush();
    const update = await nextRequest();
    const claim = client.action('claim', { jobId: 100 });
    client.disconnect();
    update.respond();
    await tick;
    assert.equal(await claim, false);
    assert.deepEqual(
      commands.map((c) => c.action),
      ['tick'],
    );
    assert.equal(client.actionPending, false);
  },
);

void test(
  'a failed background update does not strand a queued claim',
  { timeout: 5000 },
  async (t) => {
    const { client, nextRequest } = setup(t);
    const tick = client.flush();
    const update = await nextRequest();
    const claim = client.action('claim', { jobId: 100 });
    update.respond(503, 'County temporarily unavailable');
    await tick;
    const reservation = await nextRequest();
    assert.equal(reservation.command.action, 'claim');
    reservation.respond();
    assert.equal(await claim, true);
    assert.equal(client.actionPending, false);
  },
);

void test(
  'the airfield and paused aircraft send presence heartbeats without recording flight steps',
  { timeout: 5000 },
  async (t) => {
    const { client, nextRequest } = setup(t);
    for (const phase of ['ready', 'paused'] as const) {
      client.sim.phase = phase;
      for (let i = 0; i < 120; i++) client.record(1 / 60, freshControls());
      assert.equal(client.steps.length, 0);
      assert.equal(client.online, true);
    }
    const heartbeat = client.flush();
    const request = await nextRequest();
    assert.equal(request.command.action, 'tick');
    assert.deepEqual(request.command.steps, []);
    assert.equal(client.actionPending, false);
    request.respond();
    await heartbeat;
    client.sim.phase = 'flying';
    client.record(1 / 60, freshControls());
    assert.equal(client.steps.length, 1);
  },
);
