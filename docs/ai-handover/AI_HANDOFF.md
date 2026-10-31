# AI development handoff

This document is for a coding assistant with no access to the prior conversation. The repository, not earlier summaries, is the source of truth. Snapshot date: 2026-10-29.

## Product and current milestone

Indiana is for Indian communities across regions, languages and interests. It aims to help members discover people and connect while offering a welcoming, minimal, saffron-accented interface with light/dark themes. The app currently contains five sections: Home, Discover, Create, Connections and Profile.

Current implementation includes Supabase email/password auth; native/web session storage; auth route guards; profile read/edit/privacy UI; remote profile search and follow-request client calls; a mock feed, sample accounts and draft composer. Do not conflate a visible screen with a persistent feature. Home posts/interactions, Create, sample region/languages/interests, notifications/replies/share are previews. Profile and relationship database SQL are still docs drafts unless the operator provides current verified staging evidence.

## Stack and structure

- Expo SDK `^58.0.21`, Expo Router `~58.0.28`, React Native `0.88.0`, React `19.3.0`, TypeScript `~6.0.3`, Supabase JS `^2.118.0` (`package.json`). `package-lock.json` is present; there is no Bun lockfile.
- Routes live in `src/app/`; reusable UI/auth/services/types/data/theme live under `src/components/`, `src/auth/`, `src/lib/`, `src/data/`, `src/theme/`.
- Root provider/stack: `src/app/_layout.tsx`; auth group: `src/app/(auth)/`; native tabs: `src/app/(tabs)/_layout.tsx`; web nav: `src/app/(tabs)/_layout.web.tsx`.
- Read `PROJECT_STRUCTURE.md` and `ARCHITECTURE.md` for file-level responsibilities and data flow.

## Preserve current uncommitted work

At handover creation, `git status --short` showed pre-existing changes:

- Modified tracked: `app.json`, `src/app/_layout.tsx`, `src/app/index.tsx`, `src/components/AccountCard.tsx`, `src/components/FeedPostCard.tsx`, `src/components/ui.tsx`, `src/lib/supabase.ts`, `src/theme/colors.ts`.
- Deleted tracked legacy routes/layout: `src/app/_layout.web.tsx`, `src/app/connections.tsx`, `src/app/create.tsx`, `src/app/discover.tsx`, `src/app/profile.tsx`.
- Untracked: three `assets/images/demo-*.jpg` assets; `docs/supabase/` SQL/checklist drafts; `src/app/(auth)/`, `src/app/(tabs)/`, `src/auth/`, `src/components/auth/`, `src/components/DemoAvatar.tsx`, `src/components/RelationshipProfileCard.tsx`, `src/data/mockMedia.ts`, `src/lib/database.types.ts`, `src/lib/profiles.ts`, and `src/lib/relationships.ts`.
- This handover adds the eight files under `docs/ai-handover/`; do not treat the aggregated untracked `docs/` path as an instruction to replace existing `docs/supabase/` files.

Re-run `git status --short` before editing; these listed changes may have evolved since the snapshot. Never reset, checkout, clean, stage or overwrite unrelated files. Do not commit/push automatically.

## Important design and implementation boundaries

- Theme tokens and hydration behavior are in `src/theme/colors.ts`; use `useAppColors()` and shared UI components instead of copying colors/styles. Respect system light/dark and web SSR.
- Native navigation uses `NativeTabs`; web has its own `Slot`/`Link` implementation. Preserve native navigation when adjusting web layout.
- **Investigate root route first:** `src/app/index.tsx` and `src/app/(tabs)/index.tsx` both define Home at `/` while the root file is outside the tabs auth guard. Verify canonical routing and guard behavior on web/native before route edits. Do not casually delete/rename one.
- Auth session lifecycle belongs in `AuthProvider`; do not add another auth listener or race a separate startup `getSession()` without a demonstrated need. Platform storage is separated into `.native.ts`, `.web.ts`, and fallback; keep SQLite import native-only and browser globals SSR-guarded.
- Only public Supabase URL/publishable key are client configuration. `.env.local` is ignored; never read/print it or request its content. Never bundle a service-role/secret key.
- Profile DB draft: `public.profiles` linked to `auth.users`, generated private placeholder, normalized unique username, limited client writes, no delete. The app doesn't create a missing row; migration trigger/backfill is expected but unverified.
- Relationship DB draft adds accepted-follower read access to private profiles and exact-username discovery of masked private accounts. This is a policy/product decision; do not expand it without reviewing user-approved privacy decisions.
- No profile avatar Storage, region/language/interest columns, posts/feed tables, chat, reports, blocks or notification backend are implemented. Don't add them as incidental refactoring.
- Types in `src/lib/database.types.ts` mirror proposed SQL and are not generated introspection. SQL under `docs/supabase/` is a review artifact, not an active migration directory.

## UI and coding conventions

- Mobile-first React Native and Expo Router; all route components remain in `src/app/`, non-route components/services outside it.
- Reuse `AppScreen`, `PageHeading`, `Card`, `AppButton`, `ChoiceChip`, `Avatar`, `LocalPreviewNotice`, `Icon`, and theme tokens.
- Keep loading, missing-schema, empty, and error states explicit. Use preview labels whenever content/action is local. Avoid implying a local state change was persisted.
- Use typed services in `src/lib/` for Supabase access. Enforce authorization in DB policy/RPC, not button visibility. Maintain accessibility roles/labels/live regions and safe-area/scroll behavior.
- Do not add dependencies for convenience. For Expo API changes, follow `AGENTS.md`: read SDK major from package and the matching SDK 58 docs at `https://docs.expo.dev/versions/v58.0.0/` and verify the specific API.

## Database and security assumptions

There has been no AI-performed DB access. The user historically reported partial read-only catalog observations from a separate project named Temp; they are not current and say nothing about actual Indiana/production. Six DDL event triggers were reported `O` (origin/local enabled), with metadata summarized in `DATABASE_AND_SECURITY.md`; their function behavior was not shared here. Do not disable or alter them.

No migration has been executed by this agent; drafts have not been parsed or run against PostgreSQL. Current profile/follow tables, RLS, grants, Auth trigger, role memberships, API-exposed schemas and migration history are unknown. Use only Temp for any separately authorized staging work. First complete current read-only preflight, Dashboard checks, isolated SQL syntax validation, and review. A returned NULL/zero-row scan is scoped to that catalog query and timestamp, not universal evidence.

## Recommended next task

First perform a narrow route/auth-boundary verification for the two Home route files and signed-out `/` redirect on web and native. It is local, reversible, and has possible guard ambiguity. Inspect SDK 58 Router docs and route manifest, then propose the minimal repair before editing. Next, continue the database track with a fresh read-only Temp preflight and isolated SQL validation; do not execute either draft until the operator reviews the results and explicitly authorizes a staging trial.

## Safe workflow and validation

1. Read `AGENTS.md`, this handoff, relevant architecture/status docs, then inspect exact current route/service/SQL files and `git status`/diff.
2. Identify whether the task is code-only, documentation-only, or asks for DB access. Clarify evidence and target environment. Do not rely on stale `plan.md`.
3. Make the smallest scoped change, preserve all existing modifications, and do not change unrelated config/dependencies.
4. For code changes run `npx expo lint` and `npx tsc --noEmit`, plus requested checks. Record actual results. For SQL, local static plausibility is not parser or Supabase verification; use an approved compatible isolated validator and disposable Temp only after authorization.
5. Review diff and paths; report changed files, tests, limitations and any manual steps. Never claim physical-device/database verification without evidence.

Use `DEVELOPMENT_AND_TESTING.md` for commands and test scenarios. No automated test suite was found in this snapshot.

## Copyable continuation prompt

```text
Continue Indiana from the current repository. Read docs/ai-handover/README.md and all linked handover documents first, then inspect the current Git status and the exact relevant files because this handoff may be stale. Preserve every uncommitted change and make a minimal plan before editing. Resolve the duplicate root Home/auth-guard routing risk only after checking Expo Router SDK 58 route behavior. Treat docs/supabase SQL as unexecuted drafts unless the operator supplies current Temp evidence; never access production, change Dashboard/database state, or execute SQL without explicit authorization. Do not inspect or print .env.local or use service-role credentials in the client. Keep preview posts and sample region/language/interests separate from saved profile/relationship data. Follow AGENTS.md, avoid unnecessary dependencies and unrelated refactoring, run lint and TypeScript checks for code changes, and state exactly what you verified.
```
