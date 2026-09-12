# Skywriting MVP

The wedding contract asks a pilot to draw a heart with smoke. The reveal is from a wedding guest's standing height on the ground, looking up at the finished drawing. The flight starts at writing altitude; the existing pitch, bank, throttle and smoke controls apply.

## Player flow

- **Practice skywriting** is available immediately on the welcome screen, solo contract board and public county board. No login is needed. The solo board also offers **Practice crosswind**.
- Practice borrows the pilot's upgrades but isolates cash, progression and workshop obligations. Replaying, crashing, refilling or testing upgrades cannot alter the saved career. Exiting restores the prior career.
- Fly the gold gates in order. Hold **Space** to write; release it when correcting the route. Complete the circuit with at least **80% written** and **65% smoke accuracy**.
- **95% written and 90% accuracy** earns the contract's precision bonus. Stray smoke reduces paid-job earnings; maintenance and repairs still come out of the payout.
- **R** refills smoke and returns to the start without erasing completed strokes or paid-job costs. Retrying a job starts a fresh drawing. Pause preserves progress.
- Completion switches to the view from the ground. Practice results offer another attempt or a return to contracts.

## Occasional paid work

Local wedding commissions unlock after three completed jobs and return after eight more completions. Practice remains available during the cooldown.

Public seasons starting with season 2 reserve seven of their 60 finite jobs for weddings. Existing season 1 jobs and claims are unchanged. A public pilot needs three completed jobs to claim one. These jobs use the same exclusive claims, server-replayed controls, payouts and leaderboard as farm work, with zero farmland acres credited. Spectators receive a small recent smoke tail and accumulate a bounded local trail.

No database migration, new credential or paid service is needed.

## Local preview

Run `npm run dev -- --port 3001` in the feature worktree, then open:

- `http://localhost:3001/?skywriting=1` — gentle practice briefing.
- `http://localhost:3001/?skywriting=crosswind` — crosswind practice briefing.
- `http://localhost:3001/?skywriting=reveal` — development-only ground-view fixture. A test pilot flies through the normal simulation to generate this drawing; it does not award a saved payout.

Query previews only run in development on localhost. Production practice uses the visible buttons.

## Verification

`npx tsx --test tests/*.test.ts`, `npx tsc --noEmit`, targeted Oxlint, and `npm run check:cloudflare` cover the implementation. Skywriting tests exercise normal flight controls, reconnect replay, invalid flight paths, payout thresholds, workshop deductions, isolated practice, public claim exclusivity, smoke buffer limits and the camera's ground position and framing. Browser checks cover desktop/mobile briefing, practice selection, pause, completion, repeat and exit flows.

This feature does not deploy itself. Its source is preserved on `feature/skywriting`; integration with another agent's uncommitted work must use the feature-only delta from snapshot `d6a573e` and preserve that work.
