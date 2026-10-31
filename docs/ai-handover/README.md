# Indiana project handover

**Repository snapshot:** 2026-10-29. This guide describes the checked-out source as it existed on that date, including substantial uncommitted work. Re-check the working tree before changing anything.

Indiana is a cross-platform social discovery and community app for Indian communities across regions, languages, and interests. The current product foundation is a five-section mobile app with a web layout, Supabase email/password authentication, editable account profiles, profile discovery, and follow-request flows. The feed and post composition remain previews; the follow/profile database contracts are represented by unexecuted SQL drafts.

## Current implementation at a glance

- **Stack:** Expo SDK 58, React Native 0.88, TypeScript 6, Expo Router 58, React 19, Supabase JS 2.118. Package versions are in `package.json`; do not use the older versions in `plan.md` as the checked-out baseline.
- **Navigation:** Native Expo Router tabs on Android/iOS and a custom web tab bar. Root/auth layouts and route guards are under `src/app/` and `src/components/auth/`.
- **Authentication:** Supabase email/password sign-up and sign-in, confirmation messaging, local sign-out, one auth-state subscription, and native/web session storage adapters.
- **Profile/social data:** Profile and follow services call Supabase from the client. Their database contract is documented in `docs/supabase/`; neither SQL draft is evidence of an applied migration.
- **Preview content:** Home posts, post interactions, sample suggestions, and profile region/language/interests are local mock content. A sample feed is not a live user feed.
- **Theme:** System light/dark theme with shared tokens. Web server rendering starts from a light snapshot and applies the system preference after hydration.

## Read in this order

1. [Project structure](./PROJECT_STRUCTURE.md) — where the actual routes, services, components, configuration, and drafts live.
2. [Architecture](./ARCHITECTURE.md) — route, auth, storage, and profile/relationship data flows.
3. [Database and security](./DATABASE_AND_SECURITY.md) — what the SQL proposes, what has only been reported, and what remains unknown.
4. [Feature status](./FEATURE_STATUS.md) — exact implemented, partial, and preview boundaries.
5. [Development and testing](./DEVELOPMENT_AND_TESTING.md) — setup, checks, recorded results, and safe manual tests.
6. [Roadmap and known issues](./ROADMAP_AND_KNOWN_ISSUES.md) — prioritized work and acceptance conditions.
7. [AI handoff](./AI_HANDOFF.md) — preservation rules and the continuation prompt.

## Working safely

The project currently has pre-existing modified, deleted, and untracked files. They include authentication, grouped routes, profile and relationship integration, demo media, and Supabase SQL documentation. They are not clean-up candidates. Run `git status --short` and inspect the relevant diff before any work. Do not reset, revert, stage, commit, or push unless the user explicitly asks. Never read or print `.env.local`; it is ignored and contains local configuration.

The root `README.md` is still the create-expo-app starter, and `plan.md` describes an older Clerk/Convex product direction that does not match the current Supabase implementation. Use this handover and current source as the implementation record; treat `plan.md` as stale planning history pending a product decision.

### Copyable starter prompt

```text
Continue development of Indiana, an Expo SDK 58 / React Native / TypeScript / Expo Router app using Supabase email/password authentication. First read docs/ai-handover/README.md, then the linked architecture, database/security, feature-status, development/testing, roadmap, and AI-handoff documents. Inspect the current Git status and relevant source before proposing a minimal plan. Preserve existing uncommitted work. Treat docs/supabase SQL as unexecuted drafts unless the operator provides current staging evidence. Do not access or print .env.local, use service-role credentials in the client, change database security, add dependencies, or perform destructive Git actions without explicit authorization. Keep mock feed/posts clearly separate from persisted profiles/relationships. Run lint and TypeScript checks for code changes and report what was actually verified.
```
