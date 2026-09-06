# Prairie Air Supabase setup

Project: `jyclvsljxzszxjhpmsab` at `https://jyclvsljxzszxjhpmsab.supabase.co`.

## Active Cloudflare deployment

- Game: https://playprairieair.com (the original Workers address remains available).
- Worker: `prairie-air` in the owner's Cloudflare account.
- Deployment version: `1be5c32e-058f-45e9-97ac-e77ad25ec6f0`.
- `COUNTY_STORAGE=supabase` is active. The Worker has no D1 binding.
- Both supplied keys were verified without printing them. They are stored in Cloudflare Worker secrets and ignored local `.dev.vars` (mode 0600). The server secret is absent from compiled code, browser assets, and the deployment configuration. `/api/auth/config` intentionally returns only the project URL and publishable key.
- Email/password sign-in and email confirmation are enabled. The project uses ES256 signing keys.
- Supabase Site URL is `https://playprairieair.com`. Exactly eight allowed redirects are configured: `/auth` and `/auth?view=reset` on the custom domain, the original Workers origin, the old `https://prairie-air.nschroed1.chatgpt.site` origin, and `http://localhost:3000`.
- `migrations/202609050001_prairie_county.sql` was applied using the signed-in project SQL editor. All three tables have RLS enabled; browser roles cannot access them or invoke transaction functions directly. This migration is immutable; append new migrations for changes.

## Data transition

Immediately before Cloudflare activation, all three live Sites/D1 tables (`pilots`, `field_claims`, `payouts`) and the corresponding Supabase tables contained zero rows. There were no saved careers, claims, or payouts to migrate or link. The initial read-only D1 snapshot is retained locally under ignored `.wrangler/backups/d1-before-cloudflare.json`.

The old Sites deployment is still available with its separate D1 database and ChatGPT login. It has not been redirected or changed. Share the Cloudflare URL for the Supabase county. If records are later imported from the old host, use an explicit account-linking process and prevent duplicate payouts; do not match accounts by unverified email.

## Email delivery

The user created a Resend account and registered `playprairieair.com`. Its Cloudflare zone is active, expires September 5, 2027, and auto-renew is off. The Resend domain ID is `c443de07-d813-42a7-994d-58011270f80a`. DKIM, SPF, bounce MX, and DMARC records were imported from Resend's exact values; their public DNS responses were verified. Resend reports the domain as **Verified** and ready to send.

The user authorized Resend's Supabase integration for `Game Org`. The integration is connected to the existing project and domain and created its `Supabase Integration` sending key. Custom SMTP is enabled in Supabase with host `smtp.resend.com`, port `465`, and sender `Prairie Air <pilots@playprairieair.com>`. The corrected sender address was saved and verified after reloading the Supabase dashboard. The integration manages the SMTP credential; it was not copied into the game or repository. Email/password signup remains enabled and email confirmation remains required, verified through the public Auth settings endpoint after SMTP setup.

Hosting, password authentication, gameplay storage, and email-provider configuration are active. No signup or reset emails have been sent or tested. Before inviting testers, test signup, confirmation, and password recovery in the browser, including the PKCE same-browser return flow, and confirm delivery in Resend's logs.

## Validation

- Reproduced a production Vinext client-router error that left account-to-county links stuck. Account and game links now use native navigation, matching the existing successful password-sign-in redirect. After deployment, browser checks verified `/auth` → `/` → `/auth`, with the county and Three.js scene loading and no new navigation errors. The signed-in return link uses the same native navigation; a full email callback and recovery test remains outstanding.
- Cloudflare production build and Wrangler deployment dry run passed; deployment completed successfully.
- Native HTTP checks returned 200 for `/`, `/auth`, `/api/auth/config`, and `/api/county`. The county returned all 60 contracts. Missing or forged authentication returns 401 for game writes.
- Two temporary, email-confirmed QA users were created through the admin API without sending email. Both signed in with email/password, joined the same live county, and appeared in shared presence. Simultaneous claims produced one success and one 409 conflict, with a single visible owner. An incomplete contract could not earn a payout. Both users signed out and all their auth and gameplay records were deleted afterward.
- Anonymous and authenticated clients were denied direct access to private pilot records. Only server-mediated commands can update gameplay data.
- The existing 24 unit/integration checks cover simulation, D1 transactions, signed/tampered JWTs, and Postgres migration/functions using PGlite. PGlite serializes queries and does not replace production load testing. The live two-user test additionally exercised real concurrent Supabase transactions.
- Local play remains available at http://localhost:3000/. Its default county storage remains local D1 unless explicitly changed; solo practice stays device-local. Browser gameplay/visual testing and email delivery remain unverified.
