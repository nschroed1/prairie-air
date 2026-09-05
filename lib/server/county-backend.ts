import { env } from 'cloudflare:workers';
import { database } from './database';
import { D1CountyStore, type CountyStore } from './county-store';
import { SupabaseCountyStore } from './supabase-county-store';
import { authConfig } from './auth';

let supabaseStore: { key: string; store: SupabaseCountyStore } | null = null;
export function countyBackend(): CountyStore {
  const values = env as unknown as Record<string, unknown>;
  if (values.COUNTY_STORAGE === undefined || values.COUNTY_STORAGE === 'd1')
    return new D1CountyStore(database());
  if (values.COUNTY_STORAGE !== 'supabase')
    throw new Error('Unknown county storage configuration.');
  const config = authConfig();
  const secret = values.SUPABASE_SECRET_KEY;
  if (!config || typeof secret !== 'string' || !secret.startsWith('sb_secret_'))
    throw new Error('Supabase county storage is not configured.');
  const key = `${config.url}:${secret}`;
  if (!supabaseStore || supabaseStore.key !== key)
    supabaseStore = { key, store: new SupabaseCountyStore(config.url, secret) };
  return supabaseStore.store;
}
