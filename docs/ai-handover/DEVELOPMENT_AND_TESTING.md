# Development and testing

## Prerequisites and local setup

- Node.js/npm compatible with the installed Expo SDK 58 toolchain. `package-lock.json` exists; no Bun lockfile is present, so repository guidance uses `npx`.
- Install from the lockfile: `npm ci`.
- Configure local `.env.local` with the two names read by `src/lib/supabase.ts`: `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Use only the project's public publishable/anon client credential. Never paste file contents into a chat or add service-role/secret credentials to `EXPO_PUBLIC_*` variables. Restart Metro after changing local env.
- `.env.local` is ignored by `.gitignore`. No example env file was found. Do not create an example containing real project values.
- No install step was performed for this handover. Do not upgrade dependencies casually; use `npx expo install <package>` for any authorized Expo package addition and first read the SDK 58 docs required by `AGENTS.md`.

## Run commands

From the repository root:

```sh
npx expo start
npx expo start --web
npx expo start --android
npx expo start --ios
```

The package scripts `npm run start`, `npm run web`, `npm run android`, and `npm run ios` map to the corresponding Expo start commands. Android/iOS may open Expo Go or an available emulator/simulator. Follow `AGENTS.md`: generated `android/` and `ios/` directories are ignored/generated and must not be hand-edited. If a newly added module is not in Expo Go, use an authorized development build.

## Checks available

```sh
npx expo install --check
npx expo lint
npx tsc --noEmit
git diff --check
```

Web/platform export can be used to catch bundling/module-resolution issues, for example `npx expo export --platform web` (or the desired native platform). A successful export validates bundle generation only; it does not prove authentication, RLS, route guards, app interactions, physical-device rendering, database connectivity, or release signing.

No `test` script, unit-test framework, or app test files were found. `src/lib/test-supabase.ts` is a manual Auth-health request, not an automated suite and not a database test. In this checked environment, `psql`, `postgres`, Docker, Podman, Supabase CLI and an SQL parser were not available in PATH/project binaries. No SQL parser/database execution was performed. Check availability again before relying on this statement in a later handoff.

## Recorded verification and evidence

- **User-reported:** Indiana previously ran in Expo Go on a physical phone. The user also reported web registration, sign-in after confirmation, session persistence after reload, and sign-out passed. These reports were not repeated or independently observed in this documentation pass; no claim is made about iOS hardware.
- **Prior implementation turn report (2026-10-29):** `npx expo install --check`, `npx expo lint`, `npx tsc --noEmit`, `git diff --check`, and Expo exports for web, Android, and iOS were reported successful. This handover did not rerun platform exports.
- **This documentation pass:** see final report for the commands actually rerun. SQL drafts remain unparsed and unexecuted, and no Supabase project was accessed.

## Manual app test plan

Run against a non-production configuration and use test accounts. Do not place service credentials in the app.

1. **Auth:** sign up with a test email, confirm according to current Dashboard settings, sign in, reload web, background/foreground Expo Go, sign out, and confirm guards route correctly. Test invalid credentials and no-network feedback. Do not disable confirmation to simplify tests.
2. **Routing:** directly open `/`, `/sign-in`, `/sign-up`, `/discover`, `/create`, `/connections`, and `/profile`; exercise as signed-out and signed-in users on web and native. Pay special attention to the duplicate root Home source and whether it bypasses/duplicates the tab guard.
3. **Theme/navigation:** test light and dark system modes; inspect web hydration console; check desktop/mobile widths, top headings, tab active state, safe areas, scroll, keyboard, labels and focus order. Native should keep system `NativeTabs`; web should use the custom tab bar.
4. **Profile (only after reviewed profile migration on disposable Temp):** verify loading, own row, edit/save/cancel, malformed and conflicting username, confirmation of success only after response, public/private toggle and database rejects unauthorized writes. Confirm missing table/row falls back to labeled sample and does not create data.
5. **Relationships (only after separately reviewed relationship migration on disposable Temp):** use two test users and API sessions to test public follow, private request, approve, reject, cancel, unfollow, exact username behavior, cross-user actions, stale/missing profile behavior, reload persistence and counts. Test anonymous access and direct mutation denial. Never use service-role credential from the client.
6. **Demo boundary:** verify Home likes/filter, sample Discover filters, Create preview, profile sample posts and notifications do not claim server persistence.
7. **Platform:** web/Android/iOS export or launch checks are separate from real runtime testing. Record device/OS/browser and errors; do not describe a bundle export as physical-device verification.

## Existing notes and known setup pitfalls

- `ANDROID_EMULATOR_SETUP.md` records an Android 37.2 Pixel 10 AVD and an Expo Go bundle, but labels the project Expo `58.0.17`, which conflicts with current `package.json` (`^58.0.21`). Treat SDK value as stale. It also records an unresolved System UI prompt; recheck rather than assume emulator health.
- If a `wa-sqlite.wasm` module error recurs on web, keep `expo-sqlite/localStorage/install` behind `.native.ts`; web must resolve `supabase-storage.web.ts` with guarded `window.localStorage`. Do not add WASM configuration without tracing the import.
- If a web hydration mismatch recurs, inspect `AppThemeProvider` server/first-client snapshots and platform layout; do not suppress warnings or remove accessibility attributes.
- If Supabase data operations fail with missing schema/function errors, use the explicit migration-unavailable UI and inspect staging state. Do not treat a missing-table response as successful connectivity.
