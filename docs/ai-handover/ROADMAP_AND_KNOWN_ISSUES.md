# Roadmap and known issues

Priority reflects risk in the checked-out implementation, not approval to make database or product changes. Database steps target the disposable `Temp` project only after separate operator review. Never use the actual Indiana/production project for draft SQL.

## 1. Blockers and security-critical fixes

| Task | Why / current status | Files and prerequisites | Acceptance criteria / risks |
| --- | --- | --- | --- |
| Verify canonical Home route and auth boundary | **Unresolved source-level risk.** Both `src/app/index.tsx` and `src/app/(tabs)/index.tsx` define a path that omits the route-group name. Root Home is outside the tab guard; group Home is protected. Expo Router route selection and signed-out `/` behavior have not been verified in this handover. | `src/app/_layout.tsx`, both index files, auth guards and native/web tab layouts. Read SDK 58 Router docs first; inspect route manifest and run direct-route tests. | Exactly one documented canonical Home behavior on each platform; signed-out direct access cannot reach protected content; intended redirects are loop-free; preserve feed UI and uncommitted work. Do not delete a route before confirming current references/group navigation. |
| Complete isolated SQL syntax/behavior validation | **Blocked/unknown.** Profile and relationship SQL are drafts; no local parser/server/container/CLI was available. | Three SQL drafts, checklists, compatible PostgreSQL/Supabase staging access. Obtain approval before installing tools; do not use production. | Full scripts parse in a compatible transaction-capable environment; catalog preflight and all behavior/RLS tests pass in disposable Temp. Parser success alone is not proof of Supabase Auth/PostgREST behavior. |
| Re-run full read-only Temp preflight and review enabled event triggers | **Not current.** Earlier operator results are historical and partial; six `O` event triggers were reported. | Profile preflight/checklist; relationship checklist; secure Temp SQL Editor; Dashboard role/exposure/Auth checks. | Current catalog and event-trigger behavior reconciled; all stops resolved manually; no event trigger modified; migration workflow identified. Do not run migration until reviewed/authorized. |
| Resolve migration tracking and live status | **Unknown.** No active `supabase/migrations/` directory found; profile migration history lookup was NULL in a reported Temp snapshot. | SQL artifacts and operator's actual Supabase CLI/Dashboard workflow. | Determine if applied migrations are tracked elsewhere; compare local/remote history; convert only after review into project's actual workflow. Date-like docs filename is not a migration deployment record. |
| Verify effective client authorization | **Unknown until Temp API tests.** Policy text is not active policy evidence. | Profile/relationship drafts, two test users and anonymous session. | Anonymous profile/relationship reads/writes denied; authenticated public/private/accepted-follow cases match approved policy; cross-user writes denied; check effective privileges, transitive memberships, `auth.uid()` and role bypass. |

## 2. Complete the existing MVP

| Task | Why / current status | Files and prerequisites | Acceptance criteria / risks |
| --- | --- | --- | --- |
| Test Profile screen against verified staging schema | Profile UI/service exists but falls back to samples when schema/row unavailable. | `profile.tsx`, `profiles.ts`, profile SQL draft; first stage/test profile migration in Temp. | Own row creation/backfill/edit, private default, validation and error states work only after DB confirms; sample fields remain clearly separate; no client row creation or misleading “saved” state. |
| Test real Discover and Connections flows | RPC calls are wired, but draft schema unverified. | `discover.tsx`, `connections.tsx`, `relationships.ts`, relationship SQL/checklist. | Two-account tested flow and failure/loading states pass on web/native. Confirm exact private username disclosure decision and accepted-follower behavior before release. |
| Consolidate stale documentation after product approval | Root README is template; `plan.md` says Clerk/Convex and old scope; emulator note contains old SDK patch. | `README.md`, `plan.md`, `ANDROID_EMULATOR_SETUP.md`. | Update only after user approves canonical product plan; don't rewrite unrelated docs during feature tasks. |

## 3. Persistent social features

| Task | Why / current status | Files and prerequisites | Acceptance criteria / risks |
| --- | --- | --- | --- |
| Persistent post model/feed/composer | Feed and Create are entirely local previews. | Home/Create, `mockData.ts`, future reviewed schema/migration, RLS and media decisions. | Server-backed create/read and audience rules with tests; feed labels and empty/offline/error behavior accurate; do not reuse mock content as rows. Requires a reviewed database design first. |
| Avatar upload | `avatar_url` is a proposed nullable DB field, but no storage integration. | Profile screen, `profiles.ts`, new Storage design/policy only after authorization. | Authenticated user can upload/update only own avatar; URL/content type/size validated; deletes and public access reviewed. No Storage bucket/policy exists by evidence here. |
| Notifications, chat, reports, blocking | No complete backend implementation found; some UI is placeholder. | No current service/schema. Define privacy, moderation, retention, abuse/rate limits and push requirements before coding. | Database/server authorization and negative tests precede UI claims. Do not infer features from installed Expo notification dependency. |

## 4. Quality, testing, release

- Add an agreed automated test approach (none found) for auth guard routing, username validation, profile error states and relationship presentation; avoid adding dependencies without need.
- Run Expo SDK 58 dependency, lint, TypeScript and platform export checks. Exercise route/auth/privacy behavior in web and Android/iOS environments, and record actual device/browser evidence.
- Audit keyboard/safe-area behavior, contrast in both themes, accessibility labels/focus/announcements, performance and responsive layout.
- Prepare separate development/staging/release configuration, privacy/terms and account deletion/data-retention policy before release. No production release pipeline or legal documents were verified here.

## 5. Longer-term product possibilities

`plan.md` mentions groups, location, multiple login providers, age gating, blocking, reports, and push notifications, but it is stale and contradicts the Supabase code. Treat all such items as **unapproved/planned**, not committed requirements. Reconfirm product scope before implementing them. Region/languages/interests are explicitly sample fields at present, not stored profile data.

## Known unresolved issues

1. Root Home source collision and auth guard selection at `/`.
2. Current Temp and actual Indiana DB state, applied migration status, and migration workflow are unverified.
3. No parser/database test environment or automated app test suite was available in the inspected workspace.
4. Six Temp event triggers were historically reported enabled for origin/local sessions (`O`); their behavior must be understood locally before DDL. Do not alter them.
5. Relationship draft permits accepted followers to read private profiles and discloses exact username for exact search; make sure this matches approved privacy requirements.
6. `plan.md`, starter README, and SDK patch in `ANDROID_EMULATOR_SETUP.md` are stale/inconsistent with `package.json` and code.
7. User-reported successful mobile/web operation is not a substitute for fresh test evidence after the current uncommitted source changes.
