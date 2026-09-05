# Prairie Air Supabase setup

Project: `jyclvsljxzszxjhpmsab` at `https://jyclvsljxzszxjhpmsab.supabase.co`.

## Configured September 5, 2026

- The supplied publishable key was verified without printing it. It is stored in ignored local `.dev.vars` and in Sites runtime configuration, outside source control.
- Email/password sign-in and email confirmation are enabled. The project uses ES256 signing keys.
- Site URL: `https://prairie-air.nschroed1.chatgpt.site`.
- Allowed redirects: `https://prairie-air.nschroed1.chatgpt.site/auth` and `https://prairie-air.nschroed1.chatgpt.site/auth?view=reset`.
- `migrations/202609050001_prairie_county.sql` was applied using the signed-in project SQL editor. All three tables have RLS enabled, and browser roles cannot write them. This migration is now immutable; append new migrations for changes.
- Account screens, server JWT verification, and a Supabase storage adapter are implemented in the source. This source has not yet replaced the live ChatGPT-login build.

## Required before activation

1. Configure custom SMTP under Authentication → Emails → SMTP Settings. Supabase's default test sender cannot deliver general public signup/reset emails. Use a verified sender domain and enter SMTP credentials directly in Supabase. Keep email confirmation enabled.
2. Supply a server-only `sb_secret_…` key through secure local/server configuration. It belongs only in `SUPABASE_SECRET_KEY`, never the browser configuration route or a `NEXT_PUBLIC_` variable. No admin secret has been obtained or stored yet.
3. Export and retain the existing D1 pilot, claim, and payout records. Import them in that order into the corresponding `prairie_*` tables, verify row counts and financial totals, and arrange explicit linking of existing ChatGPT pilot records to verified Supabase accounts. Do not match accounts by unverified email or award duplicate starting balances.
4. During a short pause in county writes, repeat/verify the final import, then set `COUNTY_STORAGE=supabase` and deploy the validated saved source. Failures must not silently fall back to a separate D1 economy.
5. Test a real signup, confirmation, sign-in, password reset, sign-out, and two-player contract claim. No emails or production test accounts have been created by the agent. Browser auth and email delivery remain unverified.

The current live build and D1 data have not been changed. The new Supabase tables are empty. Until activation, `COUNTY_STORAGE=d1` is set in Sites runtime configuration. The public key and URL are intentionally returned by `/api/auth/config`; the secret key is never returned.

## Validation

`tests/auth.test.ts` verifies real signed and tampered JWTs against a local fixture JWKS, including project/audience/role/expiry checks. `tests/supabase-store.test.ts` runs the migration and transaction functions in PGlite (Postgres), checking permissions, claims, leases, stale revisions, once-only payouts, and admission limits. PGlite serializes queries and does not replace multi-connection production load testing. Existing D1 and simulation tests continue to pass.
