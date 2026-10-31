# Indiana profiles: staging deployment and verification checklist

**Status:** the database migration remains in preparation only. The operator reports running read-only checks in the separate `Temp` project. This pass adds app-side profile integration that tolerates a missing table. The migration was not executed, no Dashboard setting was changed, and the draft is not parser-verified or approved for production.

## Repository and access findings

- The repository has no established `supabase/` directory, versioned migration file, or database test suite. This does not establish whether the remote `Temp` project has migration history or a separate workflow. The SQL is in `docs/supabase/` as a review artifact, not an executable migration directory.
- No Supabase CLI, `psql`, database connection, or connected Supabase project tool was available in this workspace. The existing project and staging catalog could not be inspected live.
- The repository has working auth/session code and the five-tab UI. App-side profile types/data access and the Profile screen integration now exist; they do not assume the migration is applied and handle a missing table or profile row without creating data from the client.
- The worktree had uncommitted auth and route-group changes before these docs were prepared. Preserve them; do not reset, stage, or commit as part of this database review.
- `.env.local` is ignored by `.gitignore` and not tracked. Its contents were not read. No credential values belong in SQL results, screenshots, logs, or this repository.

Review artifacts:

- `profiles-staging-preflight.sql` — read-only catalog metadata inspection. It searches function source internally but does not return function bodies by default. Optional event-trigger/function-definition queries are commented out; the event-trigger query returns all definitions if run, so inspect them only in the secured console and never share them unredacted.
- `profiles-staging-migration-draft.sql` — transactional draft that aborts on selected conflicts. It has not been parsed or executed by PostgreSQL.

## Design decisions captured in the draft

- `public.profiles.id` is both the primary key and a foreign key to `auth.users(id) ON DELETE CASCADE`.
- `username` must be lowercase and match `^[a-z0-9][a-z0-9._]{1,38}[a-z0-9]$`: 3–40 characters, alphanumeric at both ends, with lowercase letters, digits, periods, or underscores in the middle. The app must trim and lowercase before saving, then use the same regex. The deterministic placeholder `member_` plus 32 UUID hex characters is 39 characters and matches this pattern. A unique index on `lower(username)` provides the case-insensitive uniqueness guarantee.
- Display name is non-empty after trimming and at most 80 characters; bio is at most 280 characters; nullable avatar URL is capped at 2,048 characters and limited to HTTPS with no whitespace. The URL check is a basic format guard, not a network/DNS validation. Avatar upload and Storage are out of scope.
- New rows default to private, with timestamps set by the database. The update trigger replaces `updated_at`; client column grants exclude both timestamps. Client inserts cannot set privacy or avatar values, so defaults apply.
- Authenticated clients get SELECT, INSERT, and limited UPDATE grants. RLS permits a user to see their own row and public rows, and permits inserts/updates only for `auth.uid()`. There is no client DELETE grant or policy. Policies remain permissive by default; the draft refuses to proceed over an existing `profiles` table rather than trying to combine with unknown policies.
- A `SECURITY DEFINER` Auth trigger function is needed because Auth inserts into `auth.users` under a restricted role while the profile table is owned by `postgres` and protected by RLS. It has an empty fixed `search_path`, uses qualified table/function references, accepts no client-controlled fields, and creates a private profile. If profile insertion fails, the Auth insert/signup transaction can fail too; signup behavior must be tested in staging.
- Both helper functions are owned by `postgres`. The migration session needs `TRIGGER` on `auth.users` and `EXECUTE` on the trigger function when it creates the trigger. PostgreSQL documents these as trigger-creation privileges. The newly created function owner has its own `EXECUTE` privilege and owns the new helper schema. The bound trigger invokes its function from PostgreSQL; the draft does not grant helper-schema usage or function execution to `supabase_auth_admin`, `authenticated`, `anon`, or `service_role`. Confirm this execution model with the staging signup test before relying on it.
- `indiana_internal` is new and isolated. The draft revokes schema access only on this new schema; it does not alter the existing `private` or other schema ACLs. The schema must not be listed under Supabase API exposed schemas.
- Backfill inserts only missing Auth IDs and uses `ON CONFLICT (id) DO NOTHING`; it does not update existing profile rows. The preflight aborts if `public.profiles`, the helper schema/index, a potentially profile-related function, or any non-internal `auth.users` trigger exists, requiring manual reconciliation.
- The draft preserves existing/default `service_role` table grants. It does not add a `service_role` postcondition that would reject retained administrative access. `service_role` is privileged and bypasses RLS; its key must stay on trusted servers and never enter this client app. A preflight guard stops if the draft's revokes could remove a `PUBLIC` default table grant or a grant inherited by `service_role` through API-role membership.

## Before staging: Dashboard and catalog checks

### Supabase Dashboard

1. Confirm the selected project is a disposable/staging project, and record its project name/ref without placing secrets in the repository.
2. Under **Project Settings → API → Exposed schemas**, confirm `public` is exposed as intended and `indiana_internal` is absent. Do not add the helper schema to exposed schemas.
3. Under **Authentication → Providers / Sign-in**, confirm email/password and email-confirmation behavior are the same as the already-tested app flow. Do not disable confirmation or change password/security settings for this migration.
4. Inspect **Authentication → Hooks** and any configured database/webhook hooks that run before or after user creation. Record whether they can reject signup or have dependencies on existing Auth triggers.
5. Confirm the staging app points only to staging using its own environment configuration. Never paste or commit the publishable key or any secret/service-role key. The client must continue to use only the publishable/anon credential.
6. Confirm a staging backup/restore point or disposable project exists, and that the operator can stop if an Auth signup error appears.

### Run the read-only preflight in the Temp SQL Editor

Use `profiles-staging-preflight.sql` against the separate `Temp` project only, as `postgres` or another catalog-visible database administrator. Review every result before any migration is considered. The SQL file contains SELECTs only; do not run the commented migration-history query until the preceding lookup confirms that relation exists.

The effective-privilege snapshot reports `NULL` for privileges on a missing relation; `NULL` is not the same as a confirmed denial. The profile-object scans are intentionally broader than the migration's exact names so similarly named objects can be reviewed.

Confirm that the unique constraints or valid, non-partial unique indexes on `auth.users` include a single-column unique key on `id`. The migration checks `REFERENCES` privilege but cannot create its foreign key unless this key exists.

Stop and reconcile manually if any of these are true:

- `public.profiles`, `indiana_internal`, or `profiles_username_lower_uidx` already exists.
- Any non-internal trigger is attached to `auth.users`. Review the returned trigger/function metadata. If needed, retrieve that trigger definition and its function body using the targeted commented queries, then inspect the enabled state, owner, `SECURITY DEFINER`, fixed `search_path`, grants, and behavior. Determine whether it creates profiles, rejects signups, or depends on trigger order. Do not drop or replace it. The draft intentionally stops for every custom Auth trigger until a human reviews compatibility.
- Any enabled DDL event trigger is not understood. In `pg_event_trigger.evtenabled`, `O` means enabled in origin/local sessions, `D` means disabled, `R` means replica-only, and `A` means always enabled. The six operator-reported `O` triggers are therefore eligible to fire in normal origin/local sessions, subject to their event and command tags and the session's `session_replication_role`. Review all six metadata rows and definitions locally in the secured SQL Editor. Do not disable or remove them. A reviewed schema-cache notification hook may be expected, but do not assume that without checking its function behavior. The migration does not automatically abort for event triggers; this is a manual stop/go review.
- A function in any non-system schema matches the exact migration scan, or an existing profile table/policy/grant needs reconciliation. The scan matches function names containing `profile` or function source containing `public.profiles` or `auth.users`; it does not match function names containing `user` or `indiana`. The default query returns metadata only. Review selected function definitions locally if needed; the migration conservatively stops for matches.
- The expected roles (`postgres`, `anon`, `authenticated`, `service_role`, `supabase_auth_admin`) are missing; `anon` or `authenticated` is superuser, has `BYPASSRLS`, or is a member (directly or transitively) of a privileged role; API-role memberships are unexpected; effective grants differ from the reviewed design; `authenticated` lacks `USAGE` on `public` or `auth` or `EXECUTE` on `auth.uid()`; or the migration role lacks database `CREATE`, `public` schema `CREATE`/`USAGE`, `auth` schema `USAGE`, `auth.users` `SELECT`/`TRIGGER`, `auth.users.id` `REFERENCES`, or `plpgsql` `USAGE`. A query showing no direct role-membership rows does not replace the effective privilege and transitive membership queries.
- Include `authenticator` in the role-flag, effective-privilege, and membership review. Reconcile its direct and inherited memberships with this project's PostgREST configuration; do not interpret an empty query that omits `authenticator` as a complete membership check. Stop if an API execution role can reach superuser or `BYPASSRLS` privileges unexpectedly.
- `auth.users.id` has no single-column primary-key/unique constraint or valid, non-partial unique index. The migration's REFERENCES privilege check alone does not establish that the foreign-key target is valid.
- Explicit schema ACLs or default ACLs suggest access changes could affect other workflows. In particular, the draft stops if the `postgres` table defaults grant to `PUBLIC`; review all global and schema-specific defaults and how API roles inherit them. Its postcheck also rolls back if a direct profile table/column ACL grants to any role other than the owner, `authenticated`, or `service_role`.
- Existing trusted service access depends on a grant that a revoke could remove. The migration must not remove or reset `service_role` privileges.
- The project has an existing migration history. Compare local and remote versions first and incorporate a reviewed, versioned migration into the established workflow rather than applying this docs artifact independently.

Inspect trigger/function bodies only inside the secured project environment. The optional event-trigger definition query returns all event function bodies and may reveal sensitive literals; review them locally and do not share them unredacted. Normally report catalog metadata and conclusions rather than definitions. Redact credentials, tokens, personal data, and sensitive literals from any excerpt shared for review.

## Staging deployment sequence (only after separate authorization)

1. Select staging and verify project identity again. Do not use production credentials or an app build connected to production.
2. Compare the repository's migration history with the staging migration history. If a migration workflow exists by then, create a versioned migration in that workflow and ensure the runner supports the transaction block. Otherwise, agree on a controlled staging-only application method first. Run as `postgres`, with the required DDL, Auth-table, and PL/pgSQL privileges shown by preflight.
3. Run the read-only catalog preflight and Dashboard checklist. Resolve every stop condition, including review of DDL event triggers; do not edit catalog objects to make the draft pass without review.
4. Read the entire SQL draft and confirm the column grants, three RLS policies, `service_role` preservation, trigger ownership, and helper schema exposure assumption.
5. Apply the reviewed migration to staging as `postgres` in one transaction-capable execution. The SQL contains `BEGIN`/`COMMIT`; use a runner that preserves transaction semantics. A database transaction protects transactional DDL/data in that transaction, but does not undo external Auth emails, webhook calls, or other outside effects. Do not run the file against production.
6. Confirm the script reaches `COMMIT`. Any raised exception before it should roll back the DDL/backfill. Record the exact error and stop; do not repeatedly retry after modifying SQL in the console.
7. Re-run the catalog inspection. Confirm `profiles` ownership/RLS, all three intended policies, helper ownership/security/search path, only owner/`authenticated`/`service_role` direct ACL grantees, no effective anon access, no client delete/timestamp/owner/avatar writes, `indiana_internal` not API exposed, and no new revoke of `service_role` table privileges. Since `profiles` is new, compare its effective `service_role` table grants with the `postgres` default ACL reviewed before the migration; do not require those grants to be absent and do not add a grant unless separately approved.
   Verify the three policy names, target role, command, permissiveness, `qual`, and `with_check` values in `pg_policies`; the migration's count-only assertion does not validate their expressions.
8. Run the behavior tests below with two staging users and separate signed-in sessions, then verify signup, email confirmation, session restoration, and sign-out still work in Expo Go and web.
9. The app-side profile integration may be implemented before this migration trial, but it must handle a missing table and only report a save after Supabase confirms it. After staging passes, test the integrated Profile screen against Temp. Keep the sample feed and mock region/language/interests distinct from database profile fields.

## Staging behavior tests and expected outcomes

Use two test users, **A** and **B**, plus a signed-out session. Exercise through the Supabase API/app where possible so grants and RLS are both tested; SQL-editor owner results alone do not prove client behavior.

| Test | Expected result |
| --- | --- |
| Anonymous SELECT/INSERT/UPDATE/DELETE on profiles | Denied by grants; no rows/data returned. |
| New signup | Exactly one profile for the Auth UUID, generated `member_<32 hex chars>` username, neutral display name, `is_private = true`, and database timestamps. If email confirmation is enabled, profile creation occurs at Auth user creation, before confirmation. |
| Auth user that existed before migration and had no profile | One backfilled private profile with placeholder username. |
| Backfill idempotency/preservation | In staging only, seed a test profile with custom values for a test Auth user, save its row, run the draft's backfill statement separately, and confirm the row is unchanged. Roll back or clean up the test data. Do not run the migration over a pre-existing `public.profiles`; its preflight intentionally stops and requires reconciliation. |
| A reads own private profile | Allowed. |
| B reads A's private profile | No row visible. |
| A changes profile to public; B reads A | Allowed. A can switch privacy back to private; B then sees no row. |
| A inserts a profile using B's ID | Rejected by grants/RLS. Direct attempts to insert `created_at`, `updated_at`, `is_private`, or `avatar_url` are rejected by column grants; omitted privacy uses `true`. |
| A updates B's row or changes owner ID | Rejected/no row updated. `id` is not client-updatable. |
| Client supplies timestamps or avatar URL on insert/update | Rejected by column grants. On an allowed update, `updated_at` changes by trigger. |
| Client deletes its own profile | Denied by missing DELETE grant and no DELETE policy. |
| Username conflicts | App normalizes input before sending; two users choosing values equal after lowercase normalization conflict. Direct uppercase database input fails the lowercase normalization check; the unique `lower(username)` index remains a second guard. |
| Invalid username/display name/bio | Send raw authenticated API payloads and confirm the database rejects leading/trailing username punctuation, <3 or >40 characters, uppercase direct DB values, spaces/other username characters, whitespace-only or >80-character display names, and >280-character bios. Also verify the app normalizes usernames before sending them. |
| Avatar URL constraint | Because clients intentionally have no `avatar_url` write grant, first confirm the client request is denied by grants. Separately, in staging only, use a short admin transaction to check that `NULL` and valid HTTPS values pass and malformed/non-HTTPS, whitespace, or >2,048-character values fail the constraint; roll the transaction back. |
| Username editing | Valid username updates succeed for owner; case-insensitive collision is rejected and UI presents a useful error. |
| Signup with Auth trigger enabled | Signup and confirmation flow succeeds; exactly one profile exists; no duplicate trigger-created/backfill profile. |
| Signup trigger forced failure | Only in a disposable isolated staging clone, with a reviewed failure-injection procedure and cleanup. Confirm the Auth insert/sign-up fails atomically and logs enough detail to diagnose; never deliberately break signup in production or shared live users. |
| Existing unrelated Auth triggers | This draft stops before deployment if any exist. After manual compatibility approval, verify each existing trigger still runs and signup side effects behave as before. |
| `service_role` | The migration does not issue a `REVOKE` or explicit `GRANT` for the new table to this role. Inspect its effective table privileges after deployment against the reviewed creator defaults. Never test by placing its key in the app or browser. |

## Recovery considerations

- The draft starts a transaction and includes postchecks before `COMMIT`. A failure before commit should roll back its transactional schema/table/function/trigger/grant/policy/backfill changes. Verify the migration runner did not auto-commit statements separately.
- After commit, do not blindly drop the table or trigger: signup may already have produced profile data. Prefer a reviewed forward repair. For a disposable staging project, restoring the pre-migration snapshot is a clean recovery option.
- Auth signup trigger failures can block account creation. If staging signup fails, stop new test registrations, inspect Auth/Postgres logs and the trigger function, then repair/restore staging before retrying.
- Transaction rollback does not undo external side effects such as delivered emails, external webhooks, or other systems that were called independently.
- No rollback SQL is supplied because dropping data-bearing profile objects would be destructive and the existing project state is unknown.

## Application-side profile integration

The first app-side profile phase is implemented in `src/lib/database.types.ts`, `src/lib/profiles.ts`, `src/lib/supabase.ts`, and `src/app/(tabs)/profile.tsx`. It only fetches and updates the signed-in user's username, display name, bio, and privacy setting. The current AuthProvider, platform storage, route guards, navigation, mock feed, and other screens were left unchanged. Avatar uploads and database-backed region/language/interests remain out of scope. Sample profile details and posts are labeled as previews.

The code can run before the staging migration: it reports a missing table/profile, never creates a profile from the client, and only reports a save after Supabase returns the updated row. Run Expo checks and staging behavior tests before any production decision.

## Checks performed in this preparation pass

- This pass added the app-side profile integration and made targeted preflight/checklist corrections. Existing uncommitted auth, routing, and screen work was preserved; nothing was committed or pushed.
- SQL was reviewed statically against PostgreSQL/Supabase documentation for privilege checks, role membership, trigger behavior, RLS, and ACLs. The operator's Temp results are not independently verified.
- No SQL parser, PostgreSQL server/client, Docker/Podman environment, Supabase CLI, or live project connection was available. The migration has **not** been parser-verified or executed, and its safety against Temp's catalog remains unproven.
- `npx expo install --check`, `npx expo lint`, `npx tsc --noEmit`, `git diff --check`, and web/Android/iOS Expo exports completed successfully. The diff check reported existing LF/CRLF notices for `app.json`, the root layout, and Home screen; no whitespace errors were reported. A separate trailing-whitespace scan covered the modified/new app and SQL/documentation files.
- Exports validate bundle generation only; no physical-device, live Supabase, or profile behavior test was performed in this pass.
