# Prairie Air

A Three.js crop-dusting game set in a shared Iowa county. Public pilots compete for a finite seasonal pool of farm contracts and appear in each other's skies and field maps.

Play: https://playprairieair.com. The Cloudflare/Supabase backend is active, and Resend SMTP is configured for signup and password-reset emails. Email delivery and callback flows still need an end-to-end test. Solo practice is available without an account.

## Public county

- One shared county, capped at 32 connected pilots in this alpha; this is an admission limit, not a load-tested capacity claim.
- Seven-day seasons, starting September 5, 2026 at 00:00 UTC. Each season has 60 jobs on distinct physical fields. Spring fertilizer, summer crop protection, and fall cover-crop seeding open in three scheduled waves of 20. No random or unlimited contract generation.
- One active field per pilot. Claims are atomic across players. Two minutes without new coverage releases a claim; completed jobs never reopen within their season.
- Server-simulated flight, coverage, upgrades, and payments. Input packets are constrained by server time. The client does not submit a trusted position, cash balance, payout, or coverage score.
- Spray outside the assigned field deducts $40 per treated acre from contract pay plus earned bonuses, capped at the payout so it never becomes negative. The full boom footprint and wind drift count, including repeated off-field passes and spraying at an ineffective height or bank. Refills preserve the deduction; restarting clears both coverage and overspray. The flight HUD shows the running deduction and projected net payment, and standings use net earnings. Solo practice follows the same rule.
- Seasonal standings rank earnings, then precision. Previous-season standings remain visible. Careers, aircraft upgrades, and cash carry over; seasonal scores reset. All upgrade levels compete together in this alpha.
- Free flight remains available when contracts are finished or awaiting their next scheduled wave.
- Supabase handles email/password accounts, email verification, and password reset. The API verifies signed access tokens, their project, audience, and role before accepting player commands. Only a hashed pilot ID and editable callsign appear publicly; account email is not exposed. The old ChatGPT-login database was empty at activation; any future legacy imports require explicit account linking.
- Solo practice starts with a guided 14-acre corn plot, followed by a 19-acre crosswind soybean contract and the full pasture contract. Practice progress and personal bests stay in this browser and never enter the public economy or rankings.

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
npx tsx --test tests/auth.test.ts tests/county-client.test.ts tests/county.test.ts tests/simulation.test.ts tests/flight-guidance.test.ts tests/weather.test.ts tests/supabase-store.test.ts
npm run build
```

The unmodified generated component catalog has existing lint errors under the scaffold configuration. Application-source lint is checked separately.

## Guided first flights

Guests can start the first job without an account. A paused briefing introduces the plot and controls before the aircraft moves. The optional flight coach and white pass line guide coverage; a ground footprint includes boom width and wind drift. Green means inside the plot, amber warns of the approaching edge or ineffective flight attitude, and red means part of the footprint is outside. The field map zooms to the assigned plot. Guidance does not alter public simulation, penalties, or payments.

The starter uses four short passes with the base aircraft and a gentle breeze; guidance adjusts to wider upgraded booms. An optional starter-only line-up aid preserves coverage, tank, overspray, and earnings. The second plot has stronger physical crosswind and a narrower working area than a full county field. All public county contracts retain their previous dimensions, coverage grid, and economy.

A completed flight shows its coverage map, itemized payment, farmer feedback, and a specific improvement tip. Practice pilots can immediately start the next job, choose an upgrade, or retry. Best practice finishes are saved locally, ordered by take-home pay, coverage, lower overspray, then shorter flight time. Public county careers start separately after account creation.

Automated flight-step tests verify that the starter guide advances through four passes, can meet the completion requirement with negligible overspray, and funds a first upgrade. Human completion time, handling feel, visual layout on target devices, and retention still need playtesting.

## Controls

- W/S or up/down: climb/descend. A/D or left/right: bank and turn.
- Hold Space: spray. Shift/Ctrl: increase/decrease throttle.
- Keep 20–98 ft above terrain, under 136 mph, and wings level to apply treatment.
- C: camera. P/Escape: pause your aircraft; the public county keeps running.
- R: refill and return to your claimed field. Enter: complete an eligible contract.
- Touch controls support steering and spraying.

## Weather and rural life

Clear skies, prairie haze, overcast conditions, and light showers change the sky, cloud cover, sunlight, visibility, rain streaks, and wind. The public county gets a deterministic forecast every 30 minutes, shared by spectators and pilots. The server includes that forecast in its flight state; pending inputs replay under their existing weather before a new forecast takes effect. Wind and gusts affect aircraft movement and spray drift in both directions, with stability upgrades reducing the effect. Old saved flights remain compatible.

Practice rolls a new forecast on each flight. The starter stays clear with its gentle west breeze, while the crosswind lesson keeps a west wind with varied skies. The HUD and preflight briefing show the forecast and wind speed.

Cows with patched coats, woolly sheep, horned goats, and farm workers populate pastures and fenced farmyard pens. Workers walk around barns and along road verges and wave at low aircraft; animals graze and move gently. Placement is deterministic across the county. Four instanced species batches draw only nearby residents, capped at 96 per species, fading beyond 300 m and above 120 m AGL and disappearing by about 420 m distance or 175 m AGL. Farm clearings keep tall crops out of the pens and yards.

## Graphics

The landscape uses a changing daytime sky with layered cumulus, distant patchwork fields, and a rippling river. Sky reflections add highlights to the water and aircraft. Instanced corn, soybeans, and pasture detail follow low flights throughout the playable county and respond to the season. Tree crowns and farm scenery provide landmarks during turns.

Static scenery and aircraft parts are combined by material to reduce draw calls. Nearby crops use a bounded moving patch and fade with distance; detail is hidden at high altitude. The scene is procedural and adds no downloaded textures or rendering dependencies. Browser frame rates and visual appearance still need playtesting on target devices.

## Architecture and limits

The shared alpha runs in the owner's Cloudflare Workers account. Supabase stores accounts, pilot careers, contract claims, and payouts. Server-only credentials protect the gameplay API. It uses four flight updates per second and interpolation for other aircraft; county jobs and standings refresh separately every four seconds. A dedicated authoritative WebSocket service is the recommended next step before increasing population or demanding tighter flight synchronization. The Supabase transaction uses a short county-wide advisory lock for the 32-pilot alpha; this is not a load-tested capacity claim.

Gameplay uses arcade flight dynamics, terrain impacts, instant free refills, and one pilot per contract. Plane-to-plane collisions, cooperative payouts, runway takeoff/landing, sophisticated anti-bot detection, and real agronomic application rates are outside this alpha. Active contract progress is lost if a claim expires, a field is released, or a contract is restarted.

The Supabase schema and transactional functions live in `supabase/migrations/`. Local/legacy D1 schema lives in `db/schema.ts`, with Drizzle migrations in `drizzle/`. Do not rewrite a migration after it is published. `lib/server/county-service.ts` owns the public economy and conditional database transactions. `lib/county-client.ts` sends input samples and reconciles local flight against server state.

WebMCP is feature-detected: public mode exposes `get_public_county` and `claim_county_contract`; solo practice exposes its own flight tools. Public tool registration was observed in the browser; tool calls remain untested. Browser account/game navigation, sign-in, joining, claiming a field, and starting flight have been checked locally and in production. Extended flight playtesting, visual review, and multiplayer load testing have not been performed. Core rules, request scheduling, SQLite transactions, types, application-source lint, and native HTTP API flows have been checked.
