# Prairie Air

A playable Three.js crop-dusting MVP set in the Iowa heartland. The scene is built from procedural meshes and shaders, without external game assets.

## Run

Requires Node 22.13+.

```sh
npm install
npm run dev
```

Open the local URL printed by the server. `npm run build` creates a Cloudflare-compatible production build. `npx tsc --noEmit` checks types. `npx tsx --test tests/simulation.test.ts` exercises the game rules.

## Fly

- W/S or up/down: climb/descend; A/D or left/right: bank and turn.
- Hold Space: spray. Shift/Ctrl: increase/decrease throttle.
- Keep 20–98 ft above the ground, under 136 mph, and your wings level.
- C: chase/forward camera. P or Escape: pause.
- R: return to the field and refill, retaining current coverage.
- Enter: complete an eligible contract and claim the payout.
- Touch devices have steering and spray controls.

Three contracts require 80%, 85%, or 90% coverage, with separate precision bonuses at 95%, 96%, and 98%. Covered cells count once. Spray outside the target field, at excessive altitude/speed, or while banking uses fluid without gaining coverage. Crashing loses that contract's progress. Spend earnings on tank capacity, boom width, and wind stability. Career data is local to the browser and saved after payouts and purchases.

## MVP scope

Arcade flight dynamics, terrain impact, a finite county, free return/refill, repeatable contracts, and procedural engine audio. Building/tree collisions, runway takeoff/landing, realistic pesticide simulation, multiplayer, and server career sync are outside this MVP. Graphics require WebGL 2 with hardware acceleration. Engine sound is opt-in.

The page feature-detects WebMCP and registers `get_flight_status` and `start_flight_contract`. No supported live WebMCP validation context was available during implementation; registration and interaction remain unverified in a WebMCP-enabled browser. Browser visual and interaction QA was not performed.

Validation: seven simulation tests, TypeScript, and production build pass. Application-source lint passes; the unmodified generated component catalog has existing lint errors under the scaffold configuration.
