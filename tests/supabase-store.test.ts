import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { initialFlight } from '../lib/county';

async function setup() {
  const db = new PGlite();
  try {
    await db.exec(
      'CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;',
    );
    await db.exec(
      readFileSync(
        new URL(
          '../supabase/migrations/202609050001_prairie_county.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
  } catch (error) {
    await db.close();
    throw error;
  }
  const state = JSON.stringify(initialFlight());
  const join = (id: string, now = 1000) =>
    db.query('SELECT public.prairie_join($1,0,$2,$3)', [id, now, state]);
  const command = async (
    id: string,
    revision: number,
    extra: Record<string, unknown> = {},
  ) => {
    const payload = {
      id,
      revision,
      request_id: `request-${id}-${revision}`,
      action: 'tick',
      now: 1000,
      season: 0,
      state,
      callsign: `Pilot ${id}`,
      credit: 0.15,
      active_job: null,
      selected: null,
      expected_claim: null,
      finished: null,
      old_active: null,
      coverage: 0,
      lease_until: 121000,
      renew: false,
      ...extra,
    };
    const result = await db.query<{ ok: boolean }>(
      'SELECT public.prairie_commit($1::jsonb) AS ok',
      [JSON.stringify(payload)],
    );
    return result.rows[0].ok;
  };
  return { db, join, command };
}
void test('Postgres schema denies browser table access and privileged game commands', async () => {
  const { db } = await setup();
  try {
    const result = await db.query<{
      readable: boolean;
      writable: boolean;
      callable: boolean;
      server_callable: boolean;
    }>(
      `SELECT has_table_privilege('anon','public.prairie_pilots','SELECT') AS readable, has_table_privilege('authenticated','public.prairie_payouts','INSERT') AS writable, has_function_privilege('authenticated','public.prairie_commit(jsonb)','EXECUTE') AS callable, has_function_privilege('service_role','public.prairie_commit(jsonb)','EXECUTE') AS server_callable`,
    );
    assert.deepEqual(result.rows[0], {
      readable: false,
      writable: false,
      callable: false,
      server_callable: true,
    });
    const tables = await db.query<{ relrowsecurity: boolean }>(
      "SELECT relrowsecurity FROM pg_class WHERE relname IN ('prairie_pilots','prairie_field_claims','prairie_payouts')",
    );
    assert.equal(tables.rows.length, 3);
    assert.ok(tables.rows.every((row) => row.relrowsecurity));
  } finally {
    await db.close();
  }
});
void test('Postgres serializes claims, expires leases, rejects stale ownership and awards a payout once', async () => {
  const { db, join, command } = await setup();
  try {
    await join('alice');
    await join('bob');
    const results = await Promise.all(
      ['alice', 'bob'].map((id) =>
        command(id, 0, { action: 'claim', selected: 100, active_job: 100 }),
      ),
    );
    assert.deepEqual(results, [true, false]);
    assert.equal(
      await command('alice', 1, {
        active_job: 100,
        old_active: 100,
        expected_claim: 100,
        now: 5000,
        coverage: 20,
        renew: true,
        lease_until: 125000,
      }),
      true,
    );
    assert.equal(
      await command('alice', 2, {
        active_job: 100,
        old_active: 100,
        expected_claim: 100,
        now: 8000,
        coverage: 20,
        renew: false,
        lease_until: 128000,
      }),
      true,
    );
    const lease = await db.query<{ lease_until: number }>(
      'SELECT lease_until FROM public.prairie_field_claims WHERE id=100',
    );
    assert.equal(Number(lease.rows[0].lease_until), 125000);
    assert.equal(
      await command('bob', 0, {
        action: 'claim',
        selected: 100,
        active_job: 100,
        now: 126000,
        lease_until: 246000,
      }),
      true,
    );
    assert.equal(
      await command('alice', 3, {
        active_job: 100,
        old_active: 100,
        expected_claim: 100,
        now: 126010,
        coverage: 40,
      }),
      false,
    );
    const finish = {
      action: 'finish',
      active_job: null,
      old_active: 100,
      expected_claim: 100,
      finished: 100,
      now: 126100,
      coverage: 96,
      payout: { earnings: 1650, acres: 49.1, elapsed: 90 },
    };
    assert.equal(await command('bob', 1, finish), true);
    assert.equal(await command('bob', 1, finish), false);
    assert.equal(
      await command('alice', 3, {
        action: 'claim',
        selected: 100,
        active_job: 100,
        now: 250000,
      }),
      false,
    );
    const payouts = await db.query<{ count: number; earnings: number }>(
      'SELECT COUNT(*) AS count,SUM(earnings) AS earnings FROM public.prairie_payouts',
    );
    assert.equal(Number(payouts.rows[0].count), 1);
    assert.equal(Number(payouts.rows[0].earnings), 1650);
  } finally {
    await db.close();
  }
});
void test('Postgres admissions respect the shared 32-pilot limit', async () => {
  const { db, join } = await setup();
  try {
    for (let i = 0; i < 33; i++) await join(`pilot-${i}`);
    const count = await db.query<{ count: number }>(
      'SELECT COUNT(*) AS count FROM public.prairie_pilots',
    );
    assert.equal(Number(count.rows[0].count), 32);
  } finally {
    await db.close();
  }
});
