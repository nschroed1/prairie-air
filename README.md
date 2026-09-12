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
- Solo practice starts with a guided 14-acre corn plot, followed by an 18-acre soybean contract with a clipped northeast corner and an irregular pasture contract. Practice progress and personal bests stay in this browser and never enter the public economy or rankings.

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
node --import tsx --test tests/*.test.ts
npm run build
```

The unmodified generated component catalog has existing lint errors under the scaffold configuration. Application-source lint is checked separately.

## Guided first flights

Guests can start the first job without an account. A paused briefing introduces the plot and controls before the aircraft moves. The optional flight coach and white pass line guide coverage; a ground footprint includes boom width and wind drift. Green means inside the plot, amber warns of the approaching edge or ineffective flight attitude, and red means part of the footprint is outside. The field map zooms to the assigned plot. Guidance does not alter public simulation, penalties, or payments.

The starter uses four short passes with the base aircraft and a gentle breeze; guidance adjusts to wider upgraded booms. An optional starter-only line-up aid preserves coverage, tank, overspray, and earnings. The second plot has stronger physical crosswind and a narrower working area than a full county field. Public contracts retain their parcel boundaries and saved coverage grid; new claims include career-based hazards and danger pay.

A completed flight shows its coverage map, itemized payment, farmer feedback, and a specific improvement tip. Practice pilots can immediately start the next job, choose an upgrade, or retry. Best practice finishes are saved locally, ordered by take-home pay, coverage, lower overspray, then shorter flight time. Public county careers start separately after account creation.

Automated flight-step tests verify that the starter guide advances through four passes, can meet the completion requirement with negligible overspray, and funds a first upgrade. Human completion time, handling feel, visual layout on target devices, and retention still need playtesting.

## Controls

Flight skill and token bonuses are pending until contract completion. They share a per-job cap and environmental targets pay once per job. Coverage rewards require fresh treatment. A clean finish adds $150 and beating par adds $100; the final deposit deducts overspray, maintenance, and repairs. Service keeps pending rewards, while restarting forfeits them. Legacy saves retain already banked rewards without double payment.

- W/S or up/down: climb/descend (supports optional inverted flight-stick pitch via the toolbar button). A/D or left/right: bank and turn.
- Hold Space: spray. Shift/Ctrl: increase/decrease throttle.
- Hold Q and use A/D for aerobatic rolls; keep Q held to maintain bank, release Q to level. Gamepad left trigger provides the same hold mode. Normal steering keeps its gentle bank limit.
- Flight controls includes a reduced camera-motion setting; it also respects the system's reduced-motion preference on first use.
- Keep 20–98 ft above terrain, under 136 mph, and wings level to apply treatment.
- C: camera. The chase camera leans dynamically into banking turns. P/Escape: pause your aircraft; the public county keeps running.
- R: repair, clear the boom, refill and return to your claimed field. Service costs are billed against earnings. Enter: complete an eligible contract.
- Touch controls support steering and spraying.

## Weather and rural life

The landscape now has rolling ridges and river valleys, with gentle terrain retained around the introductory corn plot. Crop surfaces, roads, field flags, guidance ribbons, animals and altitude-above-ground checks use the same terrain height function. Saved flights from before this change preserve their ground clearance when first resumed.

County parcels vary in width, depth and outline: rectangles, tapered plots, angled strips and clipped corners. The same convex polygons drive crop geometry, flags, maps, pass lengths, acreage, coverage and overspray. Treatment stays on the existing 12 m grid, with edge cells clipped to the actual field. Legacy contracts without a polygon remain rectangular. This terrain pass was published to https://playprairieair.com on September 6, 2026.

Clear skies, prairie haze, overcast conditions, and light showers change the sky, cloud cover, sunlight, visibility, rain streaks, and wind. The public county shares deterministic 12-minute weather fronts with four-minute building, peak, and easing stages. Spring starts gentler; summer increases crosswinds; fall brings the strongest gusts and more showers. The next stage and its gusts are shown before it arrives, including at seasonal boundaries. The server includes that forecast in its flight state; pending inputs replay under their existing weather before a new forecast takes effect. Wind and gusts affect aircraft movement and spray drift in both directions. Shared fronts also buffet bank and pitch; stability upgrades reduce all of these effects. Old saved flights remain compatible.

New contracts use a deterministic field front tied to the flight clock: a clear window, building wind, rain, and clearing skies. The first two completed jobs keep gentle winds; later career stages increase the peak from 1.1 to 8 m/s. A full cycle takes 6 minutes for beginners and 4 minutes for veterans. Sky, rain, drift, turbulence, countdowns and authoritative server replay use the same front. Pausing freezes the field clock, servicing preserves it, and retrying resets both the clock and coverage. The lobby/free-flight county forecast remains shared. Existing in-progress contracts keep their previous weather behavior until the next claim.

## Career challenge and aircraft upkeep

Challenge grows with lifetime completed jobs; failures do not advance it. A plan is frozen when a job starts, so retrying cannot reroll hazards or multiply danger pay.

| Completed jobs | New challenge                                              | Danger pay added to base contract |
| -------------- | ---------------------------------------------------------- | --------------------------------- |
| 0–1            | Open fields, gentle fronts                                 | 0%                                |
| 2–3            | Barn and protected yard                                    | 10%                               |
| 4–6            | Silo and crossing bird flocks                              | 20%                               |
| 7–11           | Hay stacks and moving locust swarms                        | 30%                               |
| 12+            | Severe fronts; about 22% of contracts have a tornado watch | 45%                               |

Marked farmyards exclude whole 12 m cells from required coverage. Spraying a yard is overspray, and low collisions with its structures disable the aircraft. However, the farm barn features an open drive-through breezeway: pilots can perform a classic barnstorming stunt by threading the needle through the open doors with level wings under 27 ft AGL, earning a $250 stunt bonus and audio fanfare. Map markers, ground markings, broken guide lines and cockpit warnings show the hazard. Birds deal 18 airframe damage ($90 in repairs), with a five-second strike cooldown. Locusts clog the boom, reducing effective width by up to 40%; climb above 150 ft or fly around them. A clogged boom costs $15 to flush. Late tornadoes give 30 seconds of warning before touchdown, with outflow inside 220 m and rapid damage inside 65 m. Stabilizers reduce gusts, bird-strike kick and tornado pull, but do not prevent damage.

Maintenance accrues in flight at roughly $15–20/minute, higher in rain. Repairs cost $5 per point of airframe damage; a disabled plane costs $500. R services the aircraft and adds the bill to the workshop tab while preserving coverage, overspray and weather time. Retry also books damage/wear before restarting; releasing a public claim or changing seasons cannot erase bills. Contract receipts deduct overspray, maintenance and repairs before take-home earnings, which feed the leaderboard. Unpaid bills carry forward on interest-free workshop credit, so a broke pilot can still repair and work. Cash reserved for bills cannot buy upgrades.

Development-only previews: `http://localhost:3000/?challenge=2`, `?challenge=4`, `?challenge=7`, or `?challenge=12`. These open an isolated practice briefing with the corresponding completed-job count; the final preview guarantees a tornado watch. They do not connect to the public county or save over the local practice career. The veteran preview warns at 1:40 flight time, with touchdown at 2:10. Return to `/` for the normal game. Human playtesting is still needed to tune hazard frequency, handling and cost balance.

For a repeatable local storm flight, run the development server and open `http://localhost:3000/?weather=storm`. It opens the soybean practice briefing in heavy showers with a southwest wind of 14 kt, gusting 21 kt, and active aircraft buffeting. Retries keep the storm; progress lasts only for the session. This preset is enabled only in development on a loopback host, skips the county connection, and does not change the public forecast. Open `/` without the query to return to the normal local game.

Cows with patched coats, woolly sheep, horned goats, and farm workers populate pastures and fenced farmyard pens. Workers walk around barns and along road verges and wave at low aircraft; animals graze and move gently. Placement is deterministic across the county. Four instanced species batches draw only nearby residents, capped at 96 per species, fading beyond 300 m and above 120 m AGL and disappearing by about 420 m distance or 175 m AGL. Farm clearings keep tall crops out of the pens and yards.

## Graphics

The landscape uses a changing daytime sky with layered cumulus, distant patchwork fields, and a rippling river. Sky reflections add highlights to the water and aircraft. Instanced corn, soybeans, and pasture detail follow low flights throughout the playable county and respond to the season. Tree crowns and farm scenery provide landmarks during turns.

Static scenery and aircraft parts are combined by material to reduce draw calls. Nearby crops use a bounded moving patch and fade with distance; detail is hidden at high altitude. The scene is procedural and adds no downloaded textures or rendering dependencies. Browser frame rates and visual appearance still need playtesting on target devices.

## Sound

Choose **Listen to the prairie** on the landing screen to enable the Suno-generated “Morning Over Iowa” theme. It loops in menus and fades out in flight. The flight soundscape layers propeller and engine tones with wind, spray, and rain; short cues mark warnings, completed work, upgrades, and rival overtakes. The bottom toolbar and pause screen offer a master mute and separate music/effects volumes. Audio starts only after a click, volume preferences stay on this device, and hidden tabs suspend audio. See `AUDIO.md` for the soundtrack's provenance and validation.

## Architecture and limits

The shared alpha runs in the owner's Cloudflare Workers account. Supabase stores accounts, pilot careers, contract claims, and payouts. Server-only credentials protect the gameplay API. It uses four flight updates per second and interpolation for other aircraft; county jobs and standings refresh separately every four seconds. A dedicated authoritative WebSocket service is the recommended next step before increasing population or demanding tighter flight synchronization. The Supabase transaction uses a short county-wide advisory lock for the 32-pilot alpha; this is not a load-tested capacity claim.

Gameplay uses arcade flight dynamics, terrain impacts, instant free refills, and one pilot per contract. Plane-to-plane collisions, cooperative payouts, runway takeoff/landing, sophisticated anti-bot detection, and real agronomic application rates are outside this alpha. Active contract progress is lost if a claim expires, a field is released, or a contract is restarted.

The Supabase schema and transactional functions live in `supabase/migrations/`. Local/legacy D1 schema lives in `db/schema.ts`, with Drizzle migrations in `drizzle/`. Do not rewrite a migration after it is published. `lib/server/county-service.ts` owns the public economy and conditional database transactions. `lib/county-client.ts` sends input samples and reconciles local flight against server state.

WebMCP is feature-detected: public mode exposes `get_public_county` and `claim_county_contract`; solo practice exposes its own flight tools. Public tool registration was observed in the browser; tool calls remain untested. Browser account/game navigation, sign-in, joining, claiming a field, and starting flight have been checked locally and in production. Extended flight playtesting, visual review, and multiplayer load testing have not been performed. Core rules, request scheduling, SQLite transactions, types, application-source lint, and native HTTP API flows have been checked.

## Career goals and rivals

The hangar shows current and next aircraft stats, savings progress, and the balance after each purchase. Pilots can choose a tank, boom, or stabilizer goal; the HUD and debrief connect contract pay to that goal. A fully upgraded goal advances to the cheapest remaining upgrade. Tank capacity increases by 40 units per level, boom width by 18 meters, and stabilizers reduce wind effects by 38%, 55%, and 64% relative to the base aircraft. Purchases spend cash without reducing career or seasonal earnings.

Standings let pilots search callsigns and pin a real rival. Without a pin, the next ranked pilot ahead is selected (or the nearest challenger for first place). The HUD tracks the earnings gap; the county board highlights an available contract whose clean bonus payout could close it. Pinned rivals remain selected after an overtake, and the debrief shows the updated rank and lead. Rankings follow server earnings, precision, and tie ordering. Search preserves official rank; pilots outside the top 50 do not get an invented earnings gap.

Upgrade goals and rival selections are preferences stored on this device, separated by public pilot and solo practice. Actual upgrades, contract claims, earnings, and standings remain server-controlled. This adds callsign-based rival tracking; it does not add social friend requests or private multiplayer rooms.
