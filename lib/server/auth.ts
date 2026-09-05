import { env } from 'cloudflare:workers';
import { parseSupabaseConfig } from '../supabase/config';
import { createPlayerVerifier } from '../supabase/verify';

export function authConfig() {
  return parseSupabaseConfig(env as unknown as Record<string, unknown>);
}
let cached: {
  key: string;
  verify: ReturnType<typeof createPlayerVerifier>;
} | null = null;
export async function verifiedPlayer(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  const config = authConfig();
  if (!config) return null;
  const key = `${config.url}:${config.publishableKey}`;
  if (!cached || cached.key !== key)
    cached = { key, verify: createPlayerVerifier(config) };
  return cached.verify(authorization);
}
