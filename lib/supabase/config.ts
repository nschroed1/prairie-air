export type SupabaseConfig = { url: string; publishableKey: string };

export function parseSupabaseConfig(
  values: Record<string, unknown>,
): SupabaseConfig | null {
  const url = values.SUPABASE_URL;
  const publishableKey = values.SUPABASE_PUBLISHABLE_KEY;
  if (typeof url !== 'string' || typeof publishableKey !== 'string')
    return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname.endsWith('.supabase.co') ||
      parsed.pathname !== '/' ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    )
      return null;
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishableKey)) return null;
    return { url: parsed.origin, publishableKey };
  } catch {
    return null;
  }
}
