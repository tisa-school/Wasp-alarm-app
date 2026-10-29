# Development standards

Preserve this repository's Node.js, plain JavaScript, PWA, local image inference,
package lockfile, tests, and GitHub Pages deployment. Skills do not authorize a
framework migration, a new service, a paid build, or publishing changes.

## Skill selection

Read only the relevant `.agents/skills/<name>/SKILL.md` and its needed references.
Use frontend-design for visual creation, web-design-guidelines or accessibility
for UI review, vercel-react-best-practices for React/Next.js performance and
vercel-composition-patterns for React architecture. Use shadcn's version-matched
upstream documentation when that library is actually present.
For Expo/EAS work start with expo-overview, then select the installed leaf skill.
Use react-native-best-practices for measured native performance and
react-native-testing for component tests. Use supabase-postgres-best-practices
for Postgres schema, queries, access policies and migrations. Use
frontend-testing-debugging for rendered browser verification; the Browser plugin
is optional and existing Playwright tests are the fallback.
Never assume a skill named by another skill is installed. Check first; use the
verified source catalog in docs/skills/sources.json. Upstream tool names are
conceptual: use available equivalent tools, never fabricate tool availability.
Do not submit feedback or telemetry to upstream projects without explicit user
instruction. Skill installation alone does not authorize executing its scripts.

## Architecture and types

Keep domain logic, UI, persistence and external integrations separate. Prefer
small cohesive modules and reusable components over speculative abstractions.
Preserve existing file conventions. For new TypeScript projects enable strict
mode; validate unknown inputs at boundaries and avoid implicit any, unsafe casts
and non-null assertions. Do not convert this JavaScript app merely to comply.

## Interfaces

Build responsive layouts with semantic HTML, visible focus, accessible names,
keyboard support, sufficient contrast and reduced-motion support. Target WCAG
2.2 AA. Native apps must support large text, screen readers, safe areas and
platform navigation. Preserve existing styling systems; choose Tailwind and
shadcn only for projects using them or an authorized new project.
Represent loading, empty, error and success states truthfully. Preserve drafts
on failed saves. Clean up camera, microphone, subscriptions and audio resources.
Never present model guesses as safety guarantees or claim metre-level distance.

## APIs, data and security

Validate and bound input; return consistent errors without secrets or stack
traces. Apply timeouts, cancellation and bounded retries; retry writes only with
idempotency protection. Authenticate sessions on the server and authorize every
resource operation, including tenant ownership. Use maintained auth libraries;
never invent cryptography. Keep CSRF/origin protections and secure session
cookies appropriate to the environment. Use parameterized queries, constraints,
indexes and reviewed migrations. Test cross-user denial and rollback behavior.
Never place secrets in client bundles or NEXT_PUBLIC_/EXPO_PUBLIC_ variables.
Use platform secret bindings, ignored local env files and placeholder examples.
Never log tokens, private photos or sensitive payloads. Mobile secrets belong in
Keychain/Keystore-backed storage, not ordinary offline caches.
Offline writes need explicit queue, retry, conflict and schema-version policies.
Push notifications require contextual permission, token lifecycle handling and
real-device validation; check SDK-version documentation before implementing.

## Delivery and verification

Reproduce bugs, identify the cause, make a focused change and rerun the failing
flow. Review correctness, security, accessibility and maintainability before
completion. Add meaningful tests for changed behavior and failure cases; avoid
tests that merely repeat implementation. Preserve existing package scripts.
Run npm run check and relevant tests; use CHROMIUM_PATH=/usr/bin/chromium for
browser suites here. npm test and npm run test:pages cover the current app.
Do not claim iOS, Android, hardware or store acceptance from browser tests.
Pin dependencies and commit lockfiles; review lifecycle scripts and upgrades.
CI should use least privilege and separate validation from deployment.
For releases verify environment configuration, privacy disclosures, migrations,
observability and recovery. Use existing deployment scripts when authorized.
Update documentation with setup, changed behavior and known limitations.
For public web pages verify titles, descriptions, canonical URLs, crawl controls
and structured data where appropriate; never promise search rankings.
