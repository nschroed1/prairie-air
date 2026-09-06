# Deploying Prairie Air to the owner's Cloudflare account

The Cloudflare deployment uses Workers for the game and API, and the existing Supabase project for authentication and county storage. The Sites deployment and local D1 practice setup remain available through the normal build/dev commands.

Live URL: https://playprairieair.com

The original https://prairie-air.extremecode-767.workers.dev address remains available. The custom domain is declared in `wrangler.cloudflare.jsonc`, so future deployments preserve it.

The first deployment is complete. Password authentication and shared contracts passed live API checks. Public signup/reset email delivery still requires custom SMTP; see `supabase/SETUP.md` for current status.

## Build and inspect

```sh
npm run check:cloudflare
```

The `cloudflare` build mode uses `wrangler.cloudflare.jsonc`, omits the Sites hosting middleware, and emits the deployable Worker configuration at `dist/server/wrangler.json`. It intentionally has no Sites-managed D1 binding. Every Cloudflare deployment must start with this build mode; the ordinary build targets Sites.

## Deployment procedure

1. Authenticate with `npx wrangler login`, then verify the intended account with `npx wrangler whoami`. Select the account explicitly if the login belongs to more than one account.
2. Check the current prerequisites in `supabase/SETUP.md`. At initial activation both databases were empty, so no import was needed. Email delivery is required before opening registration to general public users. Existing Sites/D1 data is in a different hosting account and does not move automatically.
3. Add `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY` to the `prairie-air` Worker through Cloudflare's secure secrets configuration. Supply values via stdin or the dashboard, never command arguments or committed configuration. The secret key must begin with `sb_secret_` and is server-only.
4. Build with `npm run check:cloudflare` and deploy the generated configuration using `npx wrangler deploy --config dist/server/wrangler.json`. This command publishes publicly on the configured custom domain and the account's `workers.dev` subdomain.
5. Add the exact resulting `/auth` and `/auth?view=reset` URLs to Supabase's allowed redirects and make the chosen production origin its Site URL. Both callbacks on `https://playprairieair.com` are configured. Preserve the old origins' redirects during the transition.
6. Verify the public auth configuration exposes only the publishable key, unauthenticated game writes return 401, signup/reset emails arrive, and two signed-in players share exclusive contract claims and standings.

`COUNTY_STORAGE=supabase` deliberately fails when server credentials are missing rather than creating a separate county economy. No real credentials belong in this file or the Wrangler configuration.
