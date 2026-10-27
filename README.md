# Wasp Buddy

A mobile-friendly camera app with large controls, a friendly Buzz character, photo-check integration, spoken guidance, and separately labelled practice screens.

## Open on GitHub

The repository includes `.github/workflows/pages.yml` to publish the camera app with GitHub Pages.

1. Open this repository on GitHub → **Settings → Pages**.
2. Choose **GitHub Actions** as the build source.
3. Under **Actions**, run **Open Wasp Buddy on GitHub Pages**, or push to `main`.
4. When deployment finishes, use the website link in the workflow's deployment environment.

The Pages build uses `npm run build:pages` and supports the repository subpath. It enables real camera preview and photo capture with browser permission on HTTPS. GitHub Pages cannot run the image-recognition server: the app explicitly displays camera-only mode and never uploads photos or invents a recognition result. Use the Node or Vercel server version to enable photo checks. Never put a recognition key in GitHub Pages JavaScript.

## Run locally

Requires Node.js 20.11 or newer. No production dependencies or npm installation are needed to start the app.

- **Windows:** double-click `start-local.cmd`.
- **macOS:** open `start-local.command`; if needed, use Open from its right-click menu.
- **Linux or any terminal:** run `node start-local.mjs` in this folder.

The launcher binds to your computer's loopback interface, opens the browser, and keeps running until Ctrl+C. `PORT` changes the default port 3000. Pass `--no-open` to start without opening a browser. The app is intended to run in a browser on that same computer. Running this in a remote cloud workspace does not start a server on your own phone or computer.

Tap **Open camera**, then **Turn camera on**, and allow camera access. The live preview uses the actual browser camera API. **Use phone camera** opens the device camera/photo chooser where supported; a computer usually offers a file picker. This also provides a fallback when live camera access is blocked. Camera capture itself requires no recognition key.

Live video needs HTTPS or localhost, browser permission, and an available camera. Opening a web preview inside another page can block camera access. Open the app directly in Safari, Chrome, Firefox, or Edge. If permission was previously denied, allow it in the browser's site settings. An HTTP LAN address usually cannot use live video; this local launcher does not serve HTTPS to phones.

## Real photo checks

SCAN captures one JPEG from the live camera or uses the chosen photo. With grown-up permission, it sends that photo to this app's backend, which calls the OpenAI image model. The provider key stays on the server.

Set **WASP_VISION_API_KEY** in the server's environment before starting it. An existing `OPENAI_API_KEY` binding is also supported. Optional `WASP_VISION_MODEL` selects a compatible model; the default is `gpt-4.1-mini`. No key is included. Enter credentials through secure environment settings, not chat or frontend source. Restart the server after configuring its environment.

In the app, an adult must enable photo uploads under **Grown-ups**. Each explicit Scan sends just one photo. Results are **Possible wasp**, **Not spotted**, or **I'm not sure**. Poor image quality forces uncertainty. Missing credentials, offline operation, provider failure, and invalid replies produce an error; they never produce a simulated detection or an “all clear”. The key is absent in the current development environment, so live recognition accuracy has not been validated.

**Recognition can miss wasps or identify them incorrectly. It cannot measure one metre, continuously monitor the surroundings, or confirm that an area is safe. Keep supervising children.** The model examines a single snapshot; a nearby insect outside the frame, a tiny insect, or motion blur can be missed. This is not a validated child-safety detector.

The camera and server run locally; recognition currently uses an online service. No offline wasp model is bundled. Provider use may incur charges. The app has bounded requests and in-memory limits (six per minute per connection address and 100 per hour per process). For public hosting, use deployment access protection and durable authenticated rate limits; serverless instances do not share counters.

## Downloads and offline use

`npm run build` produces:

- `dist/Wasp-Buddy.html`: a self-contained browser file with the camera UI, picture questions, and practice screens. Photo recognition needs the hosted backend, so a standalone downloaded file cannot analyse images. Some mobile file viewers do not run HTML scripts.
- `dist/web/`: static web assets, including the manifest and offline service worker. A backend is still required for real photo checks.

The hosted UI works offline after its first complete load. Photo scans always require the online backend and are never cached or replayed. The app can be added to the phone home screen from Safari's Share menu or Chrome's Install/Add to Home Screen menu when hosted on HTTPS. This is a web app, not a native Android/iOS package.

## Optional Vercel hosting

`vercel.json` configures the build and static output; `api/scan.mjs` and `api/status.mjs` provide Node functions. Use the repository root as the Vercel project root, set **WASP_VISION_API_KEY** in Vercel's Environment Variables, and redeploy. Cloud development-environment secrets are separate from Vercel secrets. No Vercel deployment has been performed or inspected in this task. Publishing a Codex environment does not deploy the website.

## Privacy and accessibility

Camera preview and chosen photos stay on this device until Scan is tapped with adult consent. This app does not save photos to disk or history. Images are sent to OpenAI only for a requested photo check; provider data policies apply. Avoid including faces or personal information. The camera stops when leaving the camera screen or hiding the app. Only result labels and timestamps (up to 20) are stored locally and can be cleared.

Voice questions require separate adult opt-in and use the browser's speech service, which may send audio to its provider. Picture questions and device speech playback remain available without microphone access. Buzz responds to a small fixed set of topics, not unrestricted AI chat. No analytics or external fonts are loaded. Buttons have large touch targets, labelled controls, keyboard focus, and reduced-motion support.

## Development checks

```sh
npm ci
npm run check
npm test
```

The browser checks need Playwright Chromium (`npx playwright install chromium`), or use an existing installation:

```sh
CHROMIUM_PATH=/usr/bin/chromium npm test
```

Backend checks verify image restrictions, absent credentials, structured provider handling, uncertainty for poor images, same-origin requests, consent, and request limits. Browser checks cover Buzz, sound, consent, camera streams with a simulated device, permission denial, photo capture/selection, actual JPEG upload, result rendering with a stubbed provider, persistence, phone layouts, offline UI, and honest scan failure.

The cloud browser blocks file navigation, so the standalone bundle check loads its exact bytes into a blank offline document. Physical-phone camera capture, real-model accuracy, and Vercel deployment remain unverified. Tests do not call the paid provider.
