# Wasp Buddy Reference Lab

Experimental interface branch based on the supplied Wasp Buddy phone designs.
It is intended for a separate Vercel preview and does not replace the main app.

A mobile-friendly app for children and their grown-ups, with on-device insect photo checks, a five-second buzzing-pattern checker, spoken guidance, large buttons, and sound controls. It opens on the original **Talk to Buzz** screen, with safety questions, optional voice questions, camera, and sound-checker buttons.

## Use it

1. Open camera → **Use device camera** (or **Turn camera on**). Allow camera access. This opens a webcam on a computer or the device camera on a phone. Stop camera releases it.
2. **Choose a photo** opens existing image files. It is separate from the live-camera button.
3. Tap **CHECK** to check one captured frame or selected photo. The first check downloads two models and the needed browser runtime assets from this same website. Subsequent checks reuse them, including offline after a completed first download.
4. A whole photo can show **Possible wasp** or **Possible bee** only when the general insect model and species model independently agree. Rejected portraits and objects say **No wasp result**. Use **Focus on one insect** when a busy photo remains uncertain, and keep a grown-up nearby.
5. Tap either **Listen** button, then **Start listening**, to analyze five seconds of microphone frequencies and waveform loudness on the device. A live microphone-level percentage confirms that sound is reaching the selected input. The detector can notice quieter speaker recordings and changing harmonics, but a steady buzz can come from an insect, fan, toy, or many other things; audio never confirms a wasp.
6. The speaker button mutes/unmutes sound with audible confirmation tones. **Grown-ups → Test sound** plays three notes and requests Buzz's voice.

If a photo contains a collage or screen borders, use **Focus on one insect**
from the photo preview or result. Tap one insect in the stored photo, adjust
**Box size**, choose **Use selected area**, then tap **Check**. Position controls
also work with a keyboard. Cancel keeps the original photo. This only crops the
local photo; it does not bypass the image models or upload it. It is a workaround
for framing problems, not reliable automatic recognition of every collage.

## What recognition means

Photo identification is experimental and uses two local models. A general-image
MobileNet model must put strong evidence on insect classes before the separate
iNaturalist species model can return **Possible wasp** or **Possible bee**.
If the whole photo is uncertain, Buzz checks a bounded set of broad and smaller
overlapping detail crops. The smaller views help with photographed posters,
guides, and screens where an insect occupies only one panel. A crop
must pass both models and agree with another crop or the whole-photo species
guess; conflicting wasp/bee crop guesses remain uncertain. Otherwise, the result
explains **No wasp result** or an uncertain species match. A portrait is not a suitable insect photo; the app does not identify people.

This replaces the previous unconditional “I’m not sure” fallback without trusting
an insect-only model on every image. Both models can still be wrong. This is not
a validated insect-presence detector, a proximity alarm, or a safety assessment.
Never move closer to an insect to improve a photo. No distance or all-clear claim
is supported.

The fixed browser regression set currently identifies 2 of 3 wasp photos and both
bee photos, rejects the cat and portrait, and leaves the dragonfly unidentified.
The framed-photo regressions also identify the clear wasp and bee inside a
simulated phone screen, identify a photographed guide containing several clear
wasp panels, and reject the framed portrait and cat. These are
regression checks, not an estimate of real-world accuracy. Reliable
field detection still needs a larger, independent validation dataset.

A mint radar overlays the preview when the camera is starting or a photo is ready.
It says **Ready to check** until Check is tapped, then brightens and sweeps faster
while the models download or analyze the image. It is a progress indicator, not
continuous insect detection. Leaving the camera, hiding the app, or completing a
check stops the busy state. Reduced-motion mode keeps a still glow and text.

## Sound and camera

The real-camera button uses `getUserMedia` after a tap. Live video requires HTTPS or localhost, permission, and an available camera. Open the app directly in a browser rather than an embedded web preview. If permission was denied, change it in the browser's site settings. Image selection remains available when the camera is unavailable.

Audio is initialized during a button tap before asynchronous photo analysis. Muting stops active tones and speech, and the preference persists. Speech depends on the device/browser's available English voices; the chime does not require speech synthesis. A silent output device cannot be diagnosed remotely. Automated tests measure generated Web Audio signals, not physical speaker output.

The sound checker requests the microphone after Start is tapped, ignores the button tone, samples frequency spectra and time-domain loudness for five seconds, and stops/releases the microphone on completion, cancellation, navigation, or app hiding. It can notice a sustained buzzing pattern and related harmonics but cannot distinguish a wasp from a bee, fan, toy, speech, or other noise. It never provides an all-clear or distance claim.

Voice questions: tap the large microphone and ask in English. That explicit tap starts the browser’s permission flow. Buzz stops playback while listening, adds the recognized question and answer to the chat, and invites another question. Listening times out after 15 seconds and stops on navigation. If speech recognition is unavailable, **Type** opens the same safety chat. The chat shows a short thinking state, remembers the current safety topic for simple follow-up questions, and keeps the conversation on the page. The browser’s speech service may need internet access.

## Privacy

Default photo recognition stays on the device. Camera frames and selected photos are not uploaded, recorded, or included in history. The camera stops on leaving its screen or hiding the app. Only up to 20 result labels/timestamps and preferences are kept in local storage, which can be cleared. The website downloads the model and runtime when first needed. The service worker caches assets, never camera images or API responses.

The buzzing checker analyzes frequency snapshots in memory on the device. It does not save or upload microphone audio. Optional voice questions start only after the microphone is tapped and use the browser's speech service, which may send audio to its provider. Typed questions and the conversation history stay in the page and disappear on reload. Buzz uses a small reviewed wasp-safety guide with simple contextual follow-ups; it is not unrestricted AI. No analytics or external fonts are loaded.

## Run locally

Requires Node.js 20.11 or newer:

```sh
npm ci
npm run build
npm start
```

The launcher opens the local browser on port 3000; `PORT` overrides it. It binds to loopback on the same computer. Pass `--no-open` to `node start-local.mjs` for internal validation. An HTTP LAN address usually cannot use a phone camera; this launcher does not serve HTTPS to other devices.

The prepared local ZIP includes browser runtime assets. Windows can launch `start-local.cmd`; macOS can launch `start-local.command`. Keep the terminal window open. A single downloaded HTML file supports the basic camera UI but cannot load the recognition runtime from a file origin; use the website or local server for recognition.

## Build and deploy

```sh
npm run build:pages
npm run deploy:pages
```

`build` and `build:pages` copy the pinned MediaPipe runtime from npm dependencies, verify model SHA-256 hashes, and generate `dist/web/`. Scripts and styles receive content-versioned URLs to avoid stale mobile caches. `dist/Wasp-Buddy.html` is the basic standalone browser file.

GitHub Pages currently publishes the **gh-pages** branch at its root. `deploy:pages` builds and pushes a new static publishing commit using an alternate Git index, preserving the source checkout and deployment history. Commit source changes first. It requires Git write access and never force-pushes. The main-branch workflow checks the app; it does not change repository Pages settings or publish over the branch deployment.

Vercel can also serve `dist/web/` using the included configuration. No public Vercel deployment was performed here. Publishing a cloud development environment is separate from deploying this website.

The optional older server recognizer remains available via `/api/scan`. To deliberately use it, configure `recognition: 'server'` in runtime-config and set `WASP_VISION_API_KEY` securely on the server (or reuse an existing `OPENAI_API_KEY`). That mode sends photos to OpenAI only after separate adult photo-upload consent and an explicit Check. It is not used by the default app and has no configured key here. Public server deployments require access protection and durable authenticated rate limits.

## Validation and model sources

```sh
npm run check
CHROMIUM_PATH=/usr/bin/chromium npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:pages
```

Install Playwright Chromium if no local browser is available (`npx playwright install chromium`). Tests need curl for one-time downloads of pinned public image fixtures. Fixtures are SHA-256 checked in `.test-fixtures/`, ignored by Git, and never copied to the website. Fixture source URLs and hashes are in `tests/model-fixtures.json`; wasp/bee sample images are from johnSMUpark/bees, and neutral fixtures are from Google Coral.

Unit/backend checks cover class grouping, uncertainty, image restrictions, missing credentials, provider failure, consent, origin checks, and request limits. Browser checks cover both camera controls, actual generated audio and mute behavior, real model inference on fixed photographs, offline inference, and honest failure without fake results. The server-provider tests use a stub; the on-device model tests execute the real model.

See `public/THIRD-PARTY.md` and `public/models/provenance.json` for the unmodified model's pinned source, license, and hashes. Dependencies have lockfile integrity checks. Do not disable hash or TLS verification to work around an installation failure.
