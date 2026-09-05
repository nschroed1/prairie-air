import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  initialFlight,
  MAX_PILOTS,
  LEASE_MS,
  serialize,
  type Standing,
} from '../county';
import type {
  CountyStore,
  CountyWrite,
  PilotRow,
  ClaimRow,
} from './county-store';

// Only instantiate on the server, using SUPABASE_SECRET_KEY after migration.
export class SupabaseCountyStore implements CountyStore {
  client: SupabaseClient;
  constructor(url: string, secret: string) {
    if (!secret.startsWith('sb_secret_'))
      throw new Error('A server-only Supabase secret key is required.');
    this.client = createClient(url, secret, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  async pilot(id: string): Promise<PilotRow | null> {
    const { data, error } = await this.client
      .from('prairie_pilots')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async standings(season: number): Promise<Standing[]> {
    const { data, error } = await this.client.rpc('prairie_standings', {
      p_season: season,
    });
    if (error) throw error;
    return data ?? [];
  }
  async claims(season: number): Promise<ClaimRow[]> {
    const { data, error } = await this.client.rpc('prairie_claims', {
      p_season: season,
    });
    if (error) throw error;
    return data ?? [];
  }
  async nearby(since: number): Promise<PilotRow[]> {
    const { data, error } = await this.client
      .from('prairie_pilots')
      .select('id,callsign,state,seen_at')
      .gt('seen_at', since)
      .order('seen_at', { ascending: false })
      .limit(MAX_PILOTS);
    if (error) throw error;
    return data as PilotRow[];
  }
  async claim(id: number): Promise<ClaimRow | null> {
    const { data, error } = await this.client
      .from('prairie_field_claims')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async createPilot(id: string, season: number, now: number) {
    const { error } = await this.client.rpc('prairie_join', {
      p_id: id,
      p_season: season,
      p_now: now,
      p_state: JSON.stringify(initialFlight()),
    });
    if (error) throw error;
  }
  async commit(write: CountyWrite) {
    const {
      id,
      command,
      now,
      season,
      oldActive,
      claim,
      p,
      sim,
      active,
      selected,
      finished,
      callsign,
      credit,
    } = write;
    const expectedClaim =
      command.action !== 'claim' &&
      command.action !== 'release' &&
      oldActive !== null &&
      claim?.owner === id &&
      claim.lease_until > now &&
      !claim.completed_at
        ? oldActive
        : null;
    const { data, error } = await this.client.rpc('prairie_commit', {
      payload: {
        id,
        revision: p.revision,
        request_id: command.requestId,
        action: command.action,
        now,
        season: season.id,
        state: JSON.stringify(serialize(sim)),
        callsign,
        credit,
        active_job: active,
        selected: selected?.id ?? null,
        old_active: oldActive,
        expected_claim: expectedClaim,
        finished,
        coverage: sim.coverage,
        lease_until: now + LEASE_MS,
        renew: sim.coverage > (claim?.coverage ?? 0),
        payout:
          finished === null
            ? null
            : {
                earnings: sim.result.pay + sim.result.bonus,
                acres: (sim.job.acres * sim.coverage) / 100,
                elapsed: sim.elapsed,
              },
      },
    });
    if (error) throw error;
    return data === true;
  }
}
