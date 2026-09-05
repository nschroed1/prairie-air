import { createClient } from '@supabase/supabase-js';
import type { SupabaseConfig } from './config';

export function createPlayerVerifier(
  config: SupabaseConfig,
  fetcher: typeof fetch = fetch,
) {
  const client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: fetcher },
  });
  return async (authorization: string | null): Promise<string | null> => {
    if (!authorization?.startsWith('Bearer ')) return null;
    const token = authorization.slice(7);
    if (!token || token.length > 8192 || /\s/.test(token)) return null;
    try {
      const { data, error } = await client.auth.getClaims(token);
      if (error || !data?.claims) return null;
      const claims = data.claims;
      if (typeof claims.nbf === 'number' && claims.nbf > Date.now() / 1000)
        return null;
      if (
        claims.iss !== `${config.url}/auth/v1` ||
        claims.role !== 'authenticated' ||
        claims.is_anonymous === true
      )
        return null;
      if (
        claims.aud !== 'authenticated' &&
        !(Array.isArray(claims.aud) && claims.aud.includes('authenticated'))
      )
        return null;
      if (
        typeof claims.sub !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          claims.sub,
        )
      )
        return null;
      // Hash the verified identity so public pilot data does not expose Auth user IDs.
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(`prairie-air:${config.url}:${claims.sub}`),
      );
      return Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
    } catch {
      return null;
    }
  };
}
