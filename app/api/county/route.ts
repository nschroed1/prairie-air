import { countyBackend } from '@/lib/server/county-backend';
import { CountyService, CountyError } from '@/lib/server/county-service';
import { validateCommand } from '@/lib/county';
import { verifiedPlayer } from '@/lib/server/auth';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
export async function GET(request: Request) {
  try {
    return Response.json(
      await new CountyService(countyBackend()).snapshot(
        await verifiedPlayer(request),
      ),
      { headers },
    );
  } catch {
    return Response.json(
      { error: 'The county is unavailable. Please try again shortly.' },
      { status: 503, headers },
    );
  }
}
export async function POST(request: Request) {
  const origin = request.headers.get('origin');
  if (
    request.headers.get('sec-fetch-site') === 'cross-site' ||
    (origin && origin !== new URL(request.url).origin)
  )
    return Response.json(
      { error: 'Use the game page to send flight commands.' },
      { status: 403, headers },
    );
  const id = await verifiedPlayer(request);
  if (!id)
    return Response.json(
      { error: 'Sign in to your pilot account to join this county.' },
      { status: 401, headers },
    );
  if (!request.headers.get('content-type')?.includes('application/json'))
    return Response.json(
      { error: 'Expected a flight command.' },
      { status: 415, headers },
    );
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new CountyError('Empty flight command.');
    const decoder = new TextDecoder();
    let body = '',
      bytes = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 40000) {
        await reader.cancel();
        throw new CountyError('Flight packet too large.', 413);
      }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    let command;
    try {
      command = validateCommand(JSON.parse(body));
    } catch (e) {
      throw new CountyError(
        e instanceof Error ? e.message : 'Invalid command.',
      );
    }
    return Response.json(
      await new CountyService(countyBackend()).command(id, command),
      { headers },
    );
  } catch (e) {
    return Response.json(
      {
        error:
          e instanceof CountyError
            ? e.message
            : 'The county is unavailable. Please reconnect.',
      },
      { status: e instanceof CountyError ? e.status : 503, headers },
    );
  }
}
