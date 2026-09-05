import { database } from '@/lib/server/database';
import { CountyService, CountyError } from '@/lib/server/county-service';
import { validateCommand } from '@/lib/county';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
async function viewer(request: Request) {
  // Sites dispatch supplies this identity and strips visitor-supplied values.
  const identity = request.headers.get('oai-authenticated-user-id');
  if (!identity) return null;
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`prairie-air:${identity}`),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function GET(request: Request) {
  try {
    return Response.json(
      await new CountyService(database()).snapshot(await viewer(request)),
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
  const id = await viewer(request);
  if (!id)
    return Response.json(
      { error: 'Sign in with ChatGPT to join this county.' },
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
      await new CountyService(database()).command(id, command),
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
