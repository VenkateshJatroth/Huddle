# Project structure

This is a selective map of the checked-out project, not a generated tree of dependencies or build artifacts. Route paths in `src/app/` are Expo Router routes; reusable code belongs outside that directory.

```text
.
├── assets/images/                 app icons plus local demo avatar/post images
├── docs/
│   ├── ai-handover/               this documentation package
│   └── supabase/                  read-only preflight and unexecuted migration drafts
├── src/
│   ├── app/
│   │   ├── _layout.tsx            root providers and stack
│   │   ├── index.tsx              legacy/root Home route (duplicates grouped Home path)
│   │   ├── (auth)/                sign-in/sign-up routes and guest guard
│   │   └── (tabs)/                five authenticated sections and platform layouts
│   ├── auth/                      shared auth state provider
│   ├── components/                reusable screen, card, avatar, icon, auth UI
│   ├── data/                      local sample records and demo media mapping
│   ├── lib/                       Supabase client, auth health check, profile/relationship services and types
│   └── theme/                     shared theme tokens/provider
├── AGENTS.md                      repository instructions for coding agents
├── ANDROID_EMULATOR_SETUP.md      machine setup notes; contains a stale version number
├── app.json                       Expo app/platform/plugin configuration
├── package.json / package-lock.json
├── plan.md                        older, conflicting Clerk/Convex product plan
└── README.md                      unmodified create-expo-app starter text
```

## Routes and layouts

| File | Responsibility and dependencies | Classification / platform notes |
| --- | --- | --- |
| `src/app/_layout.tsx` | Wraps the router stack in `AppThemeProvider` and `AuthProvider`; selects status-bar contrast from theme colors. | Application route layout, shared across platforms. |
| `src/app/(auth)/_layout.tsx` | Uses `GuestRouteGuard` and a headerless stack for sign-in/sign-up. | Route layout. |
| `src/app/(auth)/sign-in.tsx`, `sign-up.tsx` | Thin wrappers selecting `AuthScreen` mode. | Route screens. |
| `src/app/(tabs)/_layout.tsx` | Protects the authenticated group and declares Home, Discover, Create, Connections, Profile with Expo Router `NativeTabs`. Uses SF Symbols/Material icon identifiers and `navigationColors`. | Native-specific through router platform resolution; intended for Android/iOS. |
| `src/app/(tabs)/_layout.web.tsx` | Protects the same group and renders `Slot` plus custom `Link`/`Pressable` tab navigation with active-page accessibility. The nav sits after route content in layout flow. | Web-specific layout; no fixed overlay. |
| `src/app/(tabs)/index.tsx` | Main tab Home: local sample feed/filter/like states, composer navigation, preview notification, and temporary Auth health check. | Main Home screen. Health check proves Auth endpoint reachability only. |
| `src/app/(tabs)/discover.tsx` | Local demo filters and sample suggestions; for search strings of at least two characters, debounced Supabase directory RPC and follow/cancel actions. | Mixed preview and remote profile/relationship UI. |
| `src/app/(tabs)/create.tsx` | Local draft, mock photo-attachment preview, audience selection, and local preview toggle. | Preview only; no post mutation or storage call. |
| `src/app/(tabs)/connections.tsx` | Loads relationship overview and offers approve/reject/cancel/follow actions through relationship services. Handles missing migration, loading, empty, and error states. | Remote behavior depends on unverified relationship SQL objects. |
| `src/app/(tabs)/profile.tsx` | Loads/edits the signed-in profile, validates fields, toggles privacy, signs out, loads relationship counts, and explicitly labels sample content. | Mixed remote profile UI and local sample sections. |
| `src/app/index.tsx` | Another Home implementation at the root route; current file differs from grouped Home and lacks its temporary connection-check control. | Existing modified file. Together with `(tabs)/index.tsx`, it creates two source files for the canonical `/` path. Verify route selection and guard behavior before changing either. |

## Shared code

| File | Responsibility and dependencies | Classification / platform notes |
| --- | --- | --- |
| `src/auth/AuthProvider.tsx` | Exposes `useAuth()` with `session`, `user`, `isLoading`; listens once to Supabase `INITIAL_SESSION`/auth events. Native `AppState` starts/stops token auto-refresh; web only unsubscribes. | Shared state provider. |
| `src/components/auth/AuthRouteGuard.tsx` | `AuthenticatedRouteGuard` sends signed-out users to `/sign-in`; `GuestRouteGuard` sends signed-in users to `/`; both wait for session restore. | Shared routing gates; root path ambiguity makes their actual canonical destination important to test. |
| `src/components/auth/AuthScreen.tsx` | Email/password forms, validation, loading, confirmation copy, and friendly error mapping using `supabase.auth`. | Shared auth UI; no OAuth/phone flow. |
| `src/components/ui.tsx` | `AppScreen`, `PageHeading`, `SectionHeading`, `Card`, `Avatar`, `AppButton`, `ChoiceChip`, notices, text, and row styles. `AppScreen` uses safe area plus a scroll view with a 640px content maximum. | Shared, responsive building blocks; images use `expo-image`. |
| `src/components/Icon.tsx` | `AppIconName` and platform symbol mappings via `expo-symbols`. | Shared API, native SF/Material mappings and web symbol mappings. |
| `src/components/DemoAvatar.tsx` | Selects a tile from the local avatar sheet and delegates fallback/error display to `Avatar`. | Demo content. |
| `src/components/FeedPostCard.tsx` | Reusable post card, media, local like callback, and preview-only reply/share/menu actions. | Shared UI; does not persist posts or interactions. |
| `src/components/AccountCard.tsx` | Read-only local suggested-account card. | Demo content. |
| `src/components/RelationshipProfileCard.tsx` | Renders remote `RelationshipProfileSummary` with caller-provided action controls. | Remote relationship UI; data contract relies on the relationship RPC draft. |
| `src/data/mockData.ts` | `CommunityPost`, `SuggestedAccount`, feed/profile posts, sample requests, sample accounts, and filter options. | All content is local mock data. |
| `src/data/mockMedia.ts` | Requires demo images and maps avatar IDs and profile post IDs to image sources/labels. | Local assets only. |
| `src/theme/colors.ts` | Light/dark color constants, `navigationColors`, `AppThemeProvider`, and `useAppColors`. Web server/initial client use a light hydration snapshot then follow system color scheme. | Shared theme; `app.json` also sets automatic UI style. |

## Supabase and configuration

| File | Responsibility | Classification / platform notes |
| --- | --- | --- |
| `src/lib/supabase.ts` | Typed Supabase client, public env configuration, URL polyfill, and auth storage injection. Missing configuration throws a development-useful message; only public publishable configuration belongs in the client. | Shared client. |
| `src/lib/supabase-storage.native.ts` | Installs `expo-sqlite/localStorage/install` and returns global `localStorage`. | Native persistent auth storage; SQLite is intentionally retained. |
| `src/lib/supabase-storage.web.ts` | Returns browser `localStorage` only when `window` exists and catches restricted-storage errors. | Web/SSR-safe; avoids SQLite WASM import. |
| `src/lib/supabase-storage.ts` | Server/non-platform fallback returns undefined. | Safe fallback. |
| `src/lib/test-supabase.ts` | `testSupabaseConnection()` GETs `/auth/v1/health` with publishable key and timeout. | Temporary test utility; not database/table verification. |
| `src/lib/profiles.ts` | Profile types, username normalization/validation, own-profile read/update, visible username lookup, and missing-table/error classification. | Client service; relies on profile schema, grants and RLS. |
| `src/lib/relationships.ts` | Relationship/directory types, queries and RPC wrappers, pagination/counts, and missing-schema errors. | Client service; relies on proposed table and functions. |
| `src/lib/database.types.ts` | Hand-maintained client type contract for profiles, relationships, and RPCs. | Mirrors SQL drafts; not generated from or proof of a live DB schema. |

## Database documentation and build config

- `docs/supabase/profiles-staging-preflight.sql` — read-only catalog checks; optional queries are clearly conditional, and function bodies must not be shared unredacted.
- `docs/supabase/profiles-staging-migration-draft.sql` and `profiles-staging-checklist.md` — proposed profile objects, policies, signup trigger, and staging plan; not a deployed migration.
- `docs/supabase/20261029_01_follow_relationships_migration_draft.sql` and `follow-relationships-staging-checklist.md` — proposed follow relationship schema/RPC/RLS behavior; not an active migration workflow.
- `package.json` — exact dependency versions and `start`, `web`, `android`, `ios`, `lint` scripts. `package-lock.json` is present; no Bun lockfile or test script was found.
- `app.json` — Expo SDK app metadata, automatic interface style, server web output, Router and Expo module plugins, typed routes and React Compiler experiments.
- `tsconfig.json` — strict TypeScript, Expo base config, `@/*` alias for `src/*`, and `@/assets/*` alias.
- `.gitignore` — ignores `.env*.local`, generated Expo output, generated native folders, and `android-log.txt`.
- `AGENTS.md` — mandatory local guidance. Before Expo/React Native API changes, future agents must read the SDK major and matching docs at `https://docs.expo.dev/versions/v58.0.0/` and follow its links.
