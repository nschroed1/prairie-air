import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSupabaseConfig } from '../lib/supabase/config';
import { createPlayerVerifier } from '../lib/supabase/verify';

const config = {
  url: 'https://prairie-auth-test.supabase.co',
  publishableKey: 'sb_publishable_fixture',
};
const pair = await crypto.subtle.generateKey(
  { name: 'ECDSA', namedCurve: 'P-256' },
  true,
  ['sign', 'verify'],
);
const jwk = {
  ...(await crypto.subtle.exportKey('jwk', pair.publicKey)),
  kid: 'test-signing-key',
  alg: 'ES256',
  use: 'sig',
};
const fixtureFetch: typeof fetch = async (input) => {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  if (url.includes('.well-known/jwks.json'))
    return Response.json({ keys: [jwk] });
  return Response.json({ message: 'Invalid token' }, { status: 401 });
};
const verify = createPlayerVerifier(config, fixtureFetch);
const encode = (value: unknown) =>
  Buffer.from(JSON.stringify(value)).toString('base64url');
async function token(overrides: Record<string, unknown> = {}) {
  const header = encode({ alg: 'ES256', kid: jwk.kid, typ: 'JWT' });
  const body = encode({
    sub: '12345678-1234-1234-1234-123456789abc',
    iss: `${config.url}/auth/v1`,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + 300,
    iat: Math.floor(Date.now() / 1000),
    is_anonymous: false,
    ...overrides,
  });
  const value = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    pair.privateKey,
    new TextEncoder().encode(value),
  );
  return `${value}.${Buffer.from(signature).toString('base64url')}`;
}
void test('configuration only accepts a project HTTPS URL and a publishable browser key', () => {
  assert.deepEqual(
    parseSupabaseConfig({
      SUPABASE_URL: config.url,
      SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
    }),
    config,
  );
  for (const url of [
    'https://evil.test',
    `${config.url}/path`,
    'http://project.supabase.co',
    'https://user:pass@project.supabase.co',
  ])
    assert.equal(
      parseSupabaseConfig({
        SUPABASE_URL: url,
        SUPABASE_PUBLISHABLE_KEY: config.publishableKey,
      }),
      null,
    );
  assert.equal(
    parseSupabaseConfig({
      SUPABASE_URL: config.url,
      SUPABASE_PUBLISHABLE_KEY: 'sb_secret_never_public',
    }),
    null,
  );
});
void test('a signed Supabase player token maps consistently to a private public-facing ID', async () => {
  const jwt = await token();
  const id = await verify(`Bearer ${jwt}`);
  assert.match(id!, /^[a-f0-9]{64}$/);
  assert.equal(await verify(`Bearer ${jwt}`), id);
  assert.notEqual(
    await verify(
      `Bearer ${await token({ sub: 'abcdefab-1234-1234-1234-123456789abc' })}`,
    ),
    id,
  );
});
void test('tampered JWT payloads cannot impersonate another pilot', async () => {
  const jwt = await token();
  const [header, body, signature] = jwt.split('.');
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  claims.sub = 'abcdefab-1234-1234-1234-123456789abc';
  assert.equal(
    await verify(`Bearer ${header}.${encode(claims)}.${signature}`),
    null,
  );
});
void test('expired, future, wrong-project, wrong-audience, anonymous and elevated tokens are rejected', async () => {
  for (const claims of [
    { exp: 1 },
    { nbf: Date.now() / 1000 + 300 },
    { iss: 'https://another.supabase.co/auth/v1' },
    { aud: 'service_role' },
    { role: 'service_role' },
    { is_anonymous: true },
    { sub: 'not-a-user-id' },
  ])
    assert.equal(await verify(`Bearer ${await token(claims)}`), null);
});
void test('missing credentials, malformed tokens and oversized tokens remain unauthenticated', async () => {
  for (const header of [
    null,
    '',
    'Basic test',
    'Bearer invalid',
    `Bearer ${'a'.repeat(9000)}`,
    'Bearer token with spaces',
  ])
    assert.equal(await verify(header), null);
});
