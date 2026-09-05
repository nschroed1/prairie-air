# Prairie Air

A Three.js crop-dusting game set in a shared Iowa county. Public pilots compete for a finite seasonal pool of farm contracts and appear in each other's skies and field maps.

Play: https://prairie-air.extremecode-767.workers.dev. The Cloudflare/Supabase backend is active; public signup and password-reset emails still need custom SMTP configuration. Solo practice is available without an account.

## Public county

- One shared county, capped at 32 connected pilots in this alpha; this is an admission limit, not a load-tested capacity claim.
- Seven-day seasons, starting September 5, 2026 at 00:00 UTC. Each season has 60 jobs on distinct physical fields. Spring fertilizer, summer crop protection, and fall cover-crop seeding open in three scheduled waves of 20. No random or unlimited contract generation.
- One active field per pilot. Claims are atomic across players. Two minutes without new coverage releases a claim; completed jobs never reopen within their season.
- Server-simulated flight, coverage, upgrades, and payments. Input packets are constrained by server time. The client does not submit a trusted position, cash balance, payout, or coverage score.
- Seasonal standings rank earnings, then precision. Previous-season standings remain visible. Careers, aircraft upgrades, and cash carry over; seasonal scores reset. All upgrade levels compete together in this alpha.
- Free flight remains available when contracts are finished or awaiting their next scheduled wave.
- Supabase handles email/password accounts, email verification, and password reset. The API verifies signed access tokens, their project, audience, and role before accepting player commands. Only a hashed pilot ID and editable callsign appear publicly; account email is not exposed. The old ChatGPT-login database was empty at activation; any future legacy imports require explicit account linking.
- Solo practice retains the original three repeatable contracts and device-local career. Practice progress never enters the public economy or rankings.

## Run locally

Requires Node 22.13+ (Node 24 was used for validation).

```sh
npm install
npx wrangler d1 execute DB --local --config wrangler.local.json --file drizzle/0000_nasty_darkhawk.sql
npm run dev
```

Apply the initial local migration once to an empty database. Additional migrations must be applied in order. Copy `.env.example` to the ignored `.dev.vars` file and enter the project's publishable key. Supabase owns accounts; the scaffold's simulated ChatGPT identity does not authenticate county commands. Local county storage defaults to D1; setting `COUNTY_STORAGE=supabase` with a server secret connects it to the live county. See `supabase/SETUP.md` for current deployment status and `CLOUDFLARE.md` for deployment commands.

```sh
npx tsc --noEmit
npx oxlint app lib db components/county-panel.tsx tests/county.test.ts
npx tsx --test tests/auth.test.ts tests/county.test.ts tests/simulation.test.ts tests/supabase-store.test.ts
npm run build
```

The unmodified generated component catalog has existing lint errors under the scaffold configuration. Application-source lint is checked separately.

## Controls

- W/S or up/down: climb/descend. A/D or left/right: bank and turn.
- Hold Space: spray. Shift/Ctrl: increase/decrease throttle.
- Keep 20–98 ft above terrain, under 136 mph, and wings level to apply treatment.
- C: camera. P/Escape: pause your aircraft; the public county keeps running.
- R: refill and return to your claimed field. Enter: complete an eligible contract.
- Touch controls support steering and spraying.

## Graphics

The landscape uses a warm afternoon sky with layered cumulus, distant patchwork fields, and a rippling river. Sky reflections add highlights to the water and aircraft. Instanced corn, soybeans, and pasture detail follow low flights throughout the playable county and respond to the season. Tree crowns and farm scenery provide landmarks during turns.

Static scenery and aircraft parts are combined by material to reduce draw calls. Nearby crops use a bounded moving patch and fade with distance; detail is hidden at high altitude. The scene is procedural and adds no downloaded textures or rendering dependencies. Browser frame rates and visual appearance still need playtesting on target devices.

## Architecture and limits

The shared alpha runs in the owner's Cloudflare Workers account. Supabase stores accounts, pilot careers, contract claims, and payouts. Server-only credentials protect the gameplay API. It uses four flight updates per second and interpolation for other aircraft; county jobs and standings refresh separately every four seconds. A dedicated authoritative WebSocket service is the recommended next step before increasing population or demanding tighter flight synchronization. The Supabase transaction uses a short county-wide advisory lock for the 32-pilot alpha; this is not a load-tested capacity claim.

Gameplay uses arcade flight dynamics, terrain impacts, instant free refills, and one pilot per contract. Plane-to-plane collisions, cooperative payouts, runway takeoff/landing, sophisticated anti-bot detection, and real agronomic application rates are outside this alpha. Active contract progress is lost if a claim expires, a field is released, or a contract is restarted.

The Supabase schema and transactional functions live in `supabase/migrations/`. Local/legacy D1 schema lives in `db/schema.ts`, with Drizzle migrations in `drizzle/`. Do not rewrite a migration after it is published. `lib/server/county-service.ts` owns the public economy and conditional database transactions. `lib/county-client.ts` sends input samples and reconciles local flight against server state.

WebMCP is feature-detected: public mode exposes `get_public_county` and `claim_county_contract`; solo practice exposes its own flight tools. No supported live WebMCP validation context was available, so these registrations remain unverified in a WebMCP-enabled browser. Browser visual/interaction testing and multiplayer load testing have not been performed. Core rules, SQLite transactions, types, application-source lint, and native HTTP API flows have been checked.
