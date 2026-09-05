import { authConfig } from '@/lib/server/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  const config = authConfig();
  return Response.json(
    config ?? { error: 'Player accounts are not configured yet.' },
    {
      status: config ? 200 : 503,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
