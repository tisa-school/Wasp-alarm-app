# Standalone skills installation

Installed 21 repository-level skills. No plugins, MCP servers, global CLI installs or upstream installation scripts were executed. Sources are pinned in sources.json.

| Skill | Source | Purpose | Scope | Status |
|---|---|---|---|---|
| vercel-react-best-practices | [upstream](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/react-best-practices) | react-best-practices | Web | Installed |
| vercel-composition-patterns | [upstream](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/composition-patterns) | composition-patterns | Web | Installed |
| web-design-guidelines | [upstream](https://github.com/vercel-labs/agent-skills/tree/1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62/skills/web-design-guidelines) | web-design-guidelines | Web | Installed |
| frontend-design | [upstream](https://github.com/anthropics/skills/tree/ca45fc496a3436251f191354091d557da31c15b5/skills/frontend-design) | frontend-design | Web | Installed |
| accessibility | [upstream](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/accessibility) | accessibility | Web | Installed |
| seo | [upstream](https://github.com/addyosmani/web-quality-skills/tree/afa8da942115f2961fdbfa80807ea0b232ff6c00/skills/seo) | seo | Web | Installed |
| supabase-postgres-best-practices | [upstream](https://github.com/supabase/agent-skills/tree/c9be0e931b7930f7d02126d04774d904c381e7d7/skills/supabase-postgres-best-practices) | supabase-postgres-best-practices | Web | Installed |
| expo-overview | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-overview) | expo-overview | Mobile | Installed |
| expo-project-structure | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-project-structure) | expo-project-structure | Mobile | Installed |
| expo-router | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-router) | expo-router | Mobile | Installed |
| expo-native-ui | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-native-ui) | expo-native-ui | Mobile | Installed |
| expo-ui | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-ui) | expo-ui | Mobile | Installed |
| expo-animation | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-animation) | expo-animation | Mobile | Installed |
| expo-data-fetching | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-data-fetching) | expo-data-fetching | Mobile | Installed |
| expo-module | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-module) | expo-module | Mobile | Installed |
| expo-upgrade | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/expo-upgrade) | expo-upgrade | Mobile | Installed |
| eas-app-stores | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/eas-app-stores) | eas-app-stores | Mobile | Installed |
| eas-workflows | [upstream](https://github.com/expo/skills/tree/05754e71d02abe0d2d7a2fb5259ccac41f5ea59c/plugins/expo/skills/eas-workflows) | eas-workflows | Mobile | Installed |
| react-native-best-practices | [upstream](https://github.com/callstackincubator/agent-skills/tree/59e9d17446a248b21d86f078fcd0bd2d36db1ca4/skills/react-native-best-practices) | react-native-best-practices | Mobile | Installed |
| react-native-testing | [upstream](https://github.com/callstack/react-native-testing-library/tree/0ecb9c9c0cef163e01abdeae1b4b7c82af40d0b1/skills/react-native-testing) | react-native-testing | Mobile | Installed |
| frontend-testing-debugging | [upstream](https://github.com/openai/plugins/tree/0722921d5542fc593105c27bd52630babd8b8c2a/plugins/build-web-apps/skills/frontend-testing-debugging) | frontend-testing-debugging | Web | Installed |

## Evaluation and compatibility

Selection favors framework/vendor owners, established maintainers, focused descriptions and substantial supporting references. Commit IDs establish provenance, not a guarantee of correctness. No comparative adoption ranking or install counts were verified.

OpenAI/openai-skills is deprecated: its current README points to openai/plugins. The selected current OpenAI frontend testing skill supports standalone Playwright when Browser is absent. No plugin was installed. Vercel React and composition skills serve different purposes. Callstack supplies native performance instead of installing the overlapping Vercel native guide.

Next-best-practices and next-upgrade no longer ship as skills in vercel-labs/next-skills. Next.js now uses bundled version-matched documentation; current specialized Next.js skills have newer runtime/tool prerequisites and were deferred. Better Auth was inspected but not installed: no auth provider is selected in this project and no repository license was declared. Authentication standards remain in AGENTS.md; select a provider-specific skill when that choice is made.

Expo skills were copied directly from standalone skill directories rather than installing their recommended plugin. Automatic feedback submission sections were removed because installing skills does not authorize external messages. Relative links to uninstalled sibling resources were converted to pinned upstream URLs; bundled support directories remain intact. Optional companion skills mentioned by name are not automatically installed. Some Expo APIs require recent SDKs; detect the actual version before use.

TypeScript, API design, dependency review, security, offline synchronization, push notifications, CI/CD, documentation and code review have repository standards in AGENTS.md, not a claim of dedicated specialist coverage. This is not a comprehensive security audit suite. Store release skills do not provide credentials, memberships, macOS/Xcode, emulators, paid resources or store approval.

Discovery: all installed entries are under .agents/skills/<name>/SKILL.md with unique name and nonempty description. This is repository-local configuration, not an account-wide Codex Web install. The current session catalog may require a fresh task/turn to refresh; automatic UI discovery has not been observed. AGENTS.md explicitly routes tasks to these files.

Maintenance: review upstream changes before updating pinned copies; preserve local compatibility edits, rerun validation and project tests. Add provider-specific authentication and native-device automation only when the project needs them.

## Files

Added AGENTS.md, .agents/skills/**, docs/skills/sources.json and this report. Application sources and dependency manifests are unchanged.
