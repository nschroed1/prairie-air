# Prairie Air audio

The menu theme is **Morning Over Iowa**, generated with Suno v5.5 in the owner's Pro account on September 6, 2026. The selected song is [4deb0718-f5af-4dcd-af32-cf2ebb5c00bc](https://suno.com/song/4deb0718-f5af-4dcd-af32-cf2ebb5c00bc). Both generation and the WAV unlock/download occurred after the account showed **Current Plan: Pro Plan**. Suno's download dialog subsequently confirmed that this song was unlocked and could be downloaded again.

The commercial-use basis is Suno's [paid-subscription guidance](https://help.suno.com/en/articles/9601665) and [September 3 download policy](https://suno.com/blog/suno-updates-tos), checked September 6. No artist recordings, voices, or reference audio were uploaded. The two earlier free-plan previews are not included in the game.

## Included asset

- `public/audio/morning-over-iowa.mp3`: 44.1 kHz stereo MP3, approximately 66 seconds / 1.2 MB.
- Source WAV: 48 kHz stereo, 67.152 seconds, retained in the ignored `.wrangler/audio-source/` directory.
- Preparation: join the last and first 1.2 seconds with equal-power cosine/sine fades, append that join after the middle of the original recording, reduce gain by 3.44 dB, encode with LAME quality 3. This makes the end connect back to the beginning without a hard cut. The decoded loop is 65.952 seconds; its boundary sample step is below 0.01 full scale on both channels, with peaks below 0.61.
- Metadata identifies the track as Suno-generated and retains its source song ID. The song URL and provider are provenance; the browser loads the asset from our own origin. No Suno account credentials, signed download URLs, or API keys are required at runtime.

Prompt: “Prairie Air — Morning Over Iowa. Instrumental landing-page theme for a beautiful crop-dusting flight game. Warm cinematic Americana, fingerpicked acoustic guitar, tasteful pedal steel, soft piano, rounded bass, brushed drums, airy strings. 94 BPM, relaxed forward motion, golden morning light over sweeping cornfields, big open skies, quietly adventurous, hopeful and inviting. Memorable gentle four-note guitar motif established within the first five seconds. Spacious polished organic mix, restrained dynamics, subtle lift in the middle, about two minutes. Soft intro and clean gentle ending for a background menu loop. Strictly instrumental: no vocals, no lyrics, no humming, no narration, no trailer booms.”

## Runtime

`lib/game-audio.ts` builds one Web Audio graph after the player explicitly enables sound. The menu recording is downloaded and decoded only then. It plays on the landing screen, briefing, hangar, and debrief, and fades out during flight. Music and effects volumes are saved locally; every new page starts muted. The audio context suspends when the document is hidden, and its graph is closed on unmount.

Flight effects are synthesized locally: layered propeller/motor tones, wind with gust-responsive filtering and stereo direction, spray hiss and valve cues, and rain. Brief cues mark low tank, overspray, target and bonus coverage, completion, refill, crash, upgrades, and passing a tracked rival. Warning and achievement tracking avoids repeated cues on background updates and server corrections. Free flight does not announce assignment milestones or overspray penalties. The server's rules, payouts, weather, and flight state are unchanged.

Sound controls are available in the bottom toolbar and on the pause screen. Keyboard input focused on buttons, sliders, or other form controls does not also steer the plane or trigger spray.

## Verification

Automated tests cover milestone deduplication, public completion releasing its assignment, warning cooldowns, low-tank rearming after refill, pause/resume, saved volume validation, and wind direction. Browser QA uses the real Web Audio graph in an isolated fixture with synthetic flight state and no backend writes. Measured sound increases with throttle and strong weather; mute, zero effects, and hidden-state mixing reach zero; music fades during flight. The real local game loads the track and mixer without browser errors. Desktop and 390-pixel layout checks cover the new controls. Listening tests on headphones, phone speakers, and multiple browsers remain useful before a wider release.

Published to https://playprairieair.com on September 6, 2026, Cloudflare version `5a79b2dc-d7d2-41cc-9cb6-e7fe957a87b3`. The production MP3 and audio-bearing JavaScript bundle match the validated local build byte for byte. The live page loaded the theme successfully and displayed the separate music/effects controls without browser errors. Sound starts when the player clicks “Listen to the prairie” or enables sound in the toolbar.
