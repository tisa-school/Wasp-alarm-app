# Wasp Buddy

[Open the app](https://tisa-school.github.io/Wasp-alarm-app/)

A mobile-friendly camera app for children and their grown-ups, with on-device insect photo checks, spoken guidance, large buttons, a sound test, and separately labelled practice screens.

## Use it

1. Open camera → **Use device camera** (or **Turn camera on**). Allow camera access. This opens a webcam on a computer or the device camera on a phone. Stop camera releases it.
2. **Choose a photo** opens existing image files. It is separate from the live-camera button.
3. Tap **SCAN** to check one captured frame or selected photo. The first scan downloads about 18 MB of model/runtime assets from this same website. Subsequent scans reuse them, including offline after a completed first download.
4. Possible wasp and bee matches show an alert and sound when enabled. Other or weak results say **I'm not sure**. Keep a grown-up nearby.
5. The speaker button mutes/unmutes sound; unmuting plays a confirmation chime. **Grown-ups → Test sound** plays three notes and requests Buzz's voice. Check device volume, silent mode, and browser sound settings if silent.

## What recognition means

The local model only distinguishes insect species. It can confidently mistake a
person or another unfamiliar object for a wasp. Its scores do not verify that an
insect is present. Local scans therefore return “I’m not sure” and do not trigger
wasp/bee alerts. Species inference remains available internally, but automatic
alerts need an independently validated insect-presence detector before they can
be enabled again. This is a mitigation, not a working person detector or a
proximity alarm. No one-metre distance or all-clear claim is supported.

## Sound and camera

The real-camera button uses `getUserMedia` after a tap. Live video requires HTTPS or localhost, permission, and an available camera. Open the app directly in a browser rather than an embedded web preview. If permission was denied, change it in the browser's site settings. Image selection remains available when the camera is unavailable.

Audio is initialized during a button tap before asynchronous photo analysis. Muting stops active tones and speech, and the preference persists. Speech depends on the device/browser's available English voices; the chime does not require speech synthesis. A silent output device cannot be diagnosed remotely. Automated tests measure generated Web Audio signals, not physical speaker output.

## Privacy

Default photo recognition stays on the device. Camera frames and selected photos are not uploaded, recorded, or included in history. The camera stops on leaving its screen or hiding the app. Only up to 20 result labels/timestamps and preferences are kept in local storage, which can be cleared. The website downloads the model and runtime when first needed. The service worker caches assets, never camera images or API responses.

Optional voice questions require grown-up opt-in and use the browser's speech service, which may send audio to its provider. Buzz answers a fixed set of safety topics, not unrestricted AI questions. Picture questions work without microphone access. No analytics or external fonts are loaded.

## Run locally

Requires Node.js 20.11 or newer:

```sh
npm ci
npm run build
npm start
```

The launcher opens the local browser on port 3000; `PORT` overrides it. It binds to loopback on the same computer. Pass `--no-open` to `node start-local.mjs` for internal validation. An HTTP LAN address usually cannot use a phone camera; this launcher does not serve HTTPS to other devices.

The prepared local ZIP includes browser runtime assets. Windows can launch `start-local.cmd`; macOS can launch `start-local.command`. Keep the terminal window open. A single downloaded HTML file supports the basic UI and practice screens but cannot load the recognition runtime from a file origin; use the website or local server for recognition.

## Build and deploy

```sh
npm run build:pages
npm run deploy:pages
```

`build` and `build:pages` copy the pinned MediaPipe runtime from npm dependencies, verify model SHA-256 hashes, and generate `dist/web/`. Scripts and styles receive content-versioned URLs to avoid stale mobile caches. `dist/Wasp-Buddy.html` is the basic standalone browser file.

GitHub Pages currently publishes the **gh-pages** branch at its root. `deploy:pages` builds and pushes a new static publishing commit using an alternate Git index, preserving the source checkout and deployment history. Commit source changes first. It requires Git write access and never force-pushes. The main-branch workflow checks the app; it does not change repository Pages settings or publish over the branch deployment.

Vercel can also serve `dist/web/` using the included configuration. No public Vercel deployment was performed here. Publishing a cloud development environment is separate from deploying this website.

The optional older server recognizer remains available via `/api/scan`. To deliberately use it, configure `recognition: 'server'` in runtime-config and set `WASP_VISION_API_KEY` securely on the server (or reuse an existing `OPENAI_API_KEY`). That mode sends photos to OpenAI only after separate adult photo-upload consent and explicit Scan. It is not used by the default app and has no configured key here. Public server deployments require access protection and durable authenticated rate limits.

## Validation and model sources

```sh
npm run check
CHROMIUM_PATH=/usr/bin/chromium npm test
CHROMIUM_PATH=/usr/bin/chromium npm run test:pages
```

Install Playwright Chromium if no local browser is available (`npx playwright install chromium`). Tests need curl for one-time downloads of pinned public image fixtures. Fixtures are SHA-256 checked in `.test-fixtures/`, ignored by Git, and never copied to the website. Fixture source URLs and hashes are in `tests/model-fixtures.json`; wasp/bee sample images are from johnSMUpark/bees, and neutral fixtures are from Google Coral.

Unit/backend checks cover class grouping, uncertainty, image restrictions, missing credentials, provider failure, consent, origin checks, and request limits. Browser checks cover both camera controls, actual generated audio and mute behavior, real model inference on fixed photographs, offline inference, and honest failure without fake results. The server-provider tests use a stub; the on-device model tests execute the real model.

See `public/THIRD-PARTY.md` and `public/models/provenance.json` for the unmodified model's pinned source, license, and hashes. Dependencies have lockfile integrity checks. Do not disable hash or TLS verification to work around an installation failure.
