import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './config';

let clientPromise: Promise<SupabaseClient> | null = null;
export function browserAuth() {
  if (!clientPromise) {
    clientPromise = fetch('/api/auth/config', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            'Player accounts are being configured. Please try again shortly.',
          );
        const config = (await response.json()) as SupabaseConfig;
        return createClient(config.url, config.publishableKey, {
          auth: {
            flowType: 'pkce',
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
            storageKey: 'prairie-air-auth',
          },
        });
      })
      .catch((error) => {
        clientPromise = null;
        throw error;
      });
  }
  return clientPromise;
}

export async function playerHeaders(): Promise<Record<string, string>> {
  const client = await browserAuth();
  const { data, error } = await client.auth.getSession();
  if (error)
    throw new Error('Your sign-in expired. Sign in again to continue.');
  return data.session
    ? { Authorization: `Bearer ${data.session.access_token}` }
    : {};
}
