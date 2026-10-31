# Supabase database and security inventory

## Evidence labels

- **In source:** the application client/types or SQL draft defines an expectation.
- **Operator-reported, Temp:** the user manually ran read-only queries in a separate test project called `Temp`. The AI did not connect to that project. These are historical observations, not a current catalog snapshot.
- **Independently verified live:** none in this task. No Supabase connection, Dashboard access, SQL execution, or live database inspection was performed.
- **Unknown:** current Temp state, the actual Indiana project state, and whether any deployment workflow has run.

Never infer an active table/policy/function solely from a SQL file or `database.types.ts`.

## Client integration

The app reads `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in `src/lib/supabase.ts`. Their values were not read and do not belong in this document. `.env.local` is ignored by `.gitignore`. `EXPO_PUBLIC_` values are client-visible configuration, not secrets; a Supabase service-role/secret key must never be put in the app or browser bundle.

Client access is through `@supabase/supabase-js`: Auth methods in `AuthScreen`/Profile, table select/update methods in `profiles.ts` and `relationships.ts`, and RPC calls for relationship workflows. RLS and SQL grants—not UI visibility—must authorize data access.

## Proposed profile schema — draft only

`docs/supabase/profiles-staging-migration-draft.sql` defines a proposed `public.profiles` table:

| Column | Draft behavior |
| --- | --- |
| `id uuid` | Primary key and FK to `auth.users(id) ON DELETE CASCADE`. |
| `username text` | Required, lowercase, regex `^[a-z0-9][a-z0-9._]{1,38}[a-z0-9]$`; unique index on `lower(username)`. |
| `display_name text` | Required, defaults to `Indiana member`, non-whitespace, max 80 characters. |
| `bio text` | Required, defaults to empty string, max 280 characters. |
| `avatar_url text` | Nullable; max 2,048 chars and basic HTTPS/no-whitespace format check. No upload UI/storage. |
| `is_private boolean` | Required, defaults `true`. |
| `created_at`, `updated_at timestamptz` | Required, default `now()`; the update trigger refreshes `updated_at`. Client timestamp writes are excluded. |

The placeholder username is `member_` plus the 32 hexadecimal UUID characters (39 total), which satisfies the draft's regex. The app uses the same username regex and lowercases/trims before save. Database constraints are the authority against direct API payloads.

### Proposed profile creation, grants, and RLS

- `indiana_internal.create_profile_for_new_auth_user()` is a `SECURITY DEFINER` trigger function owned by `postgres`, with empty `search_path`, fully qualified database objects, and no client-provided fields. `on_auth_user_created_profile` inserts a private placeholder profile after an Auth user insert.
- `indiana_internal.touch_profile_updated_at()` is an invoker trigger function that sets `NEW.updated_at` with `pg_catalog.now()`.
- Backfill inserts profiles only for missing `auth.users.id` values and uses `ON CONFLICT (id) DO NOTHING`; it does not update existing profile content.
- The draft enables RLS on `public.profiles`, grants `authenticated` table SELECT and limited INSERT columns (`id`, `username`, `display_name`, `bio`) and UPDATE columns (`username`, `display_name`, `bio`, `is_private`), and grants no client DELETE. Client cannot set avatar on insert/update, ID on update, or timestamps.
- Draft policies target `authenticated` only: select owner or `not is_private`; insert only where ID equals `auth.uid()`; update only rows whose current and resulting ID equal `auth.uid()`. The migration preflight stops if an existing profiles relation, auth.users trigger, or matching helper conflicts; do not try to silently layer it onto unknown policies.
- In this initial profile draft, a private profile is readable only to its owner. The separate follow draft intentionally extends that behavior for accepted followers; see below. Neither draft is live-verified.
- The helper schema is new and explicitly revoked from PUBLIC and API/Auth roles in the draft. It must remain absent from the Dashboard's API-exposed schemas. Existing `private` schema permissions are not modified.
- The profile draft's table revoke does **not** name `service_role`. It intends to preserve default/trusted service access. Its preflight stops on reviewed default PUBLIC table grants because those could affect effective service access. The postcheck does not require service access to be absent.

Signup depends on the database trigger completing successfully. Since it runs in the Auth user insert transaction, a profile insert/constraint/privilege failure may fail signup itself. Test normal signup, email confirmation, duplicate/backfill behavior, and a carefully isolated failure case before any release.

## Proposed follow relationship schema — draft only

`docs/supabase/20261029_01_follow_relationships_migration_draft.sql` expects the profile migration already applied. It defines `public.follow_relationships` with requester/target UUID FKs to `auth.users(id) ON DELETE CASCADE`, composite primary key `(requester_id, target_id)`, status check (`pending` / `accepted`), no-self check, timestamps, and four partial status-specific indexes.

The draft grants authenticated table SELECT only with a participant policy. It provides no direct client write grant/policy. Six `public.indiana_*` `SECURITY DEFINER` RPCs owned by `postgres`, fixed to empty `search_path`, and granted EXECUTE to `authenticated` alone implement follow/request, approve, reject, remove, profile search, and relationship profile summaries. Each RPC checks `auth.uid()` and row ownership/targeting.

The draft layers two policies on profiles: a permissive accepted-follower policy and a restrictive visibility guard. It therefore intends signed-in users to read their own profile, public profiles, and private profiles they are accepted to follow. Pending requests do not unlock private content. This is **different from the first profiles draft's owner-only private visibility** and must be considered as a later, explicitly reviewed policy extension.

Private-account search deliberately allows an authenticated user who knows the exact username to discover that account's existence, username, and private flag; it masks the display label as `Private member` and omits bio/avatar until accepted. Relationship summaries reveal a username to a participant, and profile details only to public viewers or accepted followers. Confirm this identifier disclosure is still an accepted product decision before any staging trial.

The relationship draft revokes table rights from PUBLIC/anon/authenticated/authenticator/supabase_auth_admin, then grants authenticated SELECT; it does not explicitly grant or revoke `service_role`. It has preflight checks for names, policies, roles, profile schema, and PostgreSQL defaults, but remains unparsed/unexecuted. Compare resulting service-role effective privileges with the reviewed defaults; never put service credentials in a client.

## Migration files and workflow

| Artifact | Intended effect | Status |
| --- | --- | --- |
| `docs/supabase/profiles-staging-preflight.sql` | Read-only catalogs: roles/privileges/memberships, objects/indexes/constraints, Auth trigger metadata, DDL event-trigger metadata, function scan, policies/grants/default ACLs, migration-history lookup. | SQL text only. Manual Temp results were reported for selected checks; not run by the assistant, not a complete fresh preflight. |
| `docs/supabase/profiles-staging-migration-draft.sql` | Transactional profile table/index/triggers/grants/RLS/backfill and pre/post assertions. | Draft only. No parser or DB execution has verified syntax or behavior. |
| `docs/supabase/20261029_01_follow_relationships_migration_draft.sql` | Transactional follow table/index/RLS/policies/RPC and assertions. | Documentation draft, not in an active migration directory; not parser/database verified. |
| `docs/supabase/*checklist.md` | Operator review and staging behavior steps. | Guidance only. |

No `supabase/migrations/` directory or database test harness was found. A date-like filename under `docs/supabase/` is not proof that a Supabase migration runner tracks it. The preflight's `to_regclass('supabase_migrations.schema_migrations')` result was reportedly NULL in Temp at the time. This does not establish that no external/local migration workflow exists. Ask the operator to inspect Dashboard/CLI/repository workflow and compare history before deployment.

## Operator-reported Temp observations (historical)

These came from the user, not from this agent, and refer only to the separate testing project **Temp** at the time of the earlier checks:

- A migration-role privilege query run as `postgres` reported the checked DB/schema creation, Auth access, trigger and FK reference privileges true.
- Named `public.profiles`, proposed username index, `indiana_internal`, and example object lookups were absent then. No non-internal custom `auth.users` triggers were returned then. `auth.users(id)` had a primary key.
- A profile-related function scan returned no rows as reported, but the exact preflight query matches function names containing `profile` or source containing `public.profiles` / `auth.users`. A separately reported broader name search for `user`/`indiana` is not proof the exact source scan was run. The catalog is time-sensitive.
- `anon` and `authenticated` were reported as neither superuser nor RLS-bypass roles; `service_role` and `postgres` had expected bypass status; `supabase_auth_admin` was not bypass-capable. A direct role-membership query reportedly returned no rows. Direct membership absence does not replace the artifact's effective/transitive checks, including `authenticator`.
- Six event triggers were reported with `evtenabled='O'`, which means enabled in origin/local sessions (subject to event, command tags, and `session_replication_role`), not disabled. Names/events/tags reported: `issue_graphql_placeholder` (`sql_drop`, `DROP EXTENSION`); `issue_pg_cron_access`, `issue_pg_graphql_access`, `issue_pg_net_access` (`ddl_command_end`, `CREATE EXTENSION`); `pgrst_ddl_watch` (`ddl_command_end`, unrestricted tags); `pgrst_drop_watch` (`sql_drop`, unrestricted tags). Their functions were reported owned by `supabase_admin`, not security-definer, with fixed search-path settings. Their definitions were not supplied here. Do not alter or disable them; inspect behavior securely before staging DDL.
- The migration history lookup returned NULL; no conclusion about an external workflow follows.

These observations do not establish Temp's current state or any state of the actual Indiana project. No live-project claim has been independently verified.

## Main security risks and unknowns

1. **Migration execution status and live policy state are unknown.** Until current staging catalog results and behavior tests exist, the app may encounter missing tables/RPCs and cannot be considered database-secure based on draft policy text.
2. **Two SECURITY DEFINER designs need real validation.** Profile signup trigger failure can block signup; relationship RPCs have access to data under postgres ownership. Review ownership, exact grants, qualified names, fixed search paths, Supabase Auth trigger compatibility, and RLS behavior in an isolated database/Temp.
3. **Private username discovery is intentionally limited disclosure, not full invisibility.** The relationship draft returns exact username and private status on exact match to an authenticated caller.
4. **Service-role access is a trusted exception.** It bypasses RLS. SQL drafts avoid direct service-role grants/revokes on their new tables, but default ACLs and role membership need review. Never embed its key in this client.
5. **Migration/parser status:** no `psql`, `postgres`, Docker, Podman, or Supabase CLI is available in the checked environment; no SQL parser was found in local project binaries. Do not claim SQL validation. First use an already approved compatible isolated PostgreSQL environment or obtain approval before installing/downloading a validator.

For the exact operator sequence and test matrix, see `docs/supabase/profiles-staging-checklist.md` and `docs/supabase/follow-relationships-staging-checklist.md`. Do not execute either draft against the actual Indiana or production project.
