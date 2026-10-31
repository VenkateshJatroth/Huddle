# Indiana follow relationships: staging review checklist

This checklist accompanies [`20261029_01_follow_relationships_migration_draft.sql`](./20261029_01_follow_relationships_migration_draft.sql). The SQL is a documentation draft only. It has not been applied or verified against a live database. Use the separate disposable **Temp** project only after the profile migration has been applied and tested there. Never use the actual Indiana project or production.

## Scope and privacy behavior

- One directed row represents one account following another. `requester_id` is the follower; `target_id` is the followed account. The pair is unique and self-following is rejected.
- Public profiles produce `accepted` relationships. Private profiles produce `pending` requests. A pending request does not grant access to private profile content.
- The target alone can approve or reject an incoming pending request. The requester alone can cancel a request or unfollow.
- Rejecting deletes the pending row, so the requester may request again later. Cancel/unfollow deletes the request or accepted edge. Repeating a follow action returns the existing status and cannot duplicate the row.
- If a private account becomes public while a request is pending, the request remains pending until the target approves it or the requester cancels and follows again. If an accepted public follow later becomes private, the existing follower remains accepted until they unfollow.
- The authenticated member search deliberately reveals the existence and exact username of a private account to a signed-in Indiana member who enters that exact username. It returns the label `Private member` and the privacy flag, but never the private display name, bio, or avatar. Public profiles can be searched by name or username. Confirm this limited identifier visibility is acceptable as a product decision before staging.
- Relationship summaries reveal a peer's username to a relationship participant. They reveal a private display name, bio, and avatar only when the caller is that profile's accepted follower. The schema does not add fields to `profiles`.

## Before any staging execution

1. Verify the SQL Editor project identity is the disposable **Temp** project. Record its project ref separately; do not paste keys, tokens, or connection strings into chat or source control.
2. Confirm the reviewed profile migration has already been applied to Temp, its postchecks passed, and its signup/profile behavior tests passed. This draft aborts if `public.profiles` is absent or does not have the expected owner, RLS, columns, and Auth foreign key.
3. Confirm the API exposes `public`, where the client RPCs are defined. Keep `indiana_internal` out of exposed schemas. Do not expose new schemas to make the RPCs work.
4. Re-run the relevant read-only preflight from `profiles-staging-preflight.sql`. Review roles, transitive memberships, the `auth.uid()` privileges, Auth key, default ACLs, event triggers, migration history, and profile grants/policies. The earlier Temp observations were manual snapshots and are not evidence about the current database state.
5. In the SQL Editor, inspect the profile policy expressions and grants. The expected profile migration has `profiles_select_visible` for `authenticated` and no `PUBLIC`/`anon` profile SELECT policy. Confirm no extra read policy, broad grant, or role membership can widen access. The relationship migration adds an accepted-follower permissive policy and a restrictive visibility guard, but it does not rewrite existing policies.
6. Confirm the following named table, index, policy, and function names are unused. The migration checks them and aborts on conflicts:
   - `public.follow_relationships`
   - `follow_relationships_incoming_pending_idx`, `follow_relationships_outgoing_pending_idx`, `follow_relationships_incoming_accepted_idx`, `follow_relationships_outgoing_accepted_idx`
   - `profiles_select_accepted_followers`, `profiles_select_relationship_visibility_guard`, `follow_relationships_select_participants`
   - `indiana_follow_profile`, `indiana_approve_follow_request`, `indiana_reject_follow_request`, `indiana_remove_follow_relationship`, `indiana_search_profiles`, `indiana_relationship_profile_summaries`
7. Review the PostgreSQL table defaults for owner `postgres`. This draft stops if a `PUBLIC` table default grant exists because removing it could reduce effective `service_role` access. It does not grant or revoke `service_role` on the new table. Compare any resulting service access with the reviewed defaults; never put its key in the app.
8. Inspect enabled event-trigger metadata and function behavior locally in the secured Temp SQL Editor. `evtenabled = 'O'` means enabled for origin/local sessions. Do not disable or modify event triggers. Do not share unredacted function bodies.
9. Check the project's actual migration workflow. The repository has no active Supabase migration directory in this task, and a missing `migration_history` relation does not prove that no migration workflow exists. If Temp has a migration history, prepare this reviewed SQL in that versioned workflow and follow its transaction handling. Do not paste the docs draft as an ad hoc migration if that would bypass the project's recorded workflow.
10. Use a compatible PostgreSQL parser or isolated PostgreSQL staging clone to validate the full SQL before applying it. Local validation does not prove Supabase role, API schema, PostgREST, or event-trigger behavior. This artifact is not parser-verified by its author.
11. Obtain explicit review/authorization of the exact migration and target **Temp** project. No step above authorizes execution.

## Useful read-only catalog queries

Run as a catalog-visible administrator in Temp. These queries inspect metadata only; do not run SQL from this section against production.

### Profile visibility policies

```sql
select
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and tablename = 'profiles'
order by policyname;
```

Expected before this migration: the reviewed own/public visibility policy is present for `authenticated`, alongside the profile insert/update policies. Stop if a `PUBLIC`/`anon` read policy or any unexpected permissive profile-read policy exists; review policy expressions rather than relying on names alone.

### Existing named relationship objects

```sql
select namespace.nspname as schema_name, relation.relname as relation_name, relation.relkind
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'public'
  and relation.relname in (
    'follow_relationships',
    'follow_relationships_incoming_pending_idx',
    'follow_relationships_outgoing_pending_idx',
    'follow_relationships_incoming_accepted_idx',
    'follow_relationships_outgoing_accepted_idx'
  )
order by relation.relname;

select namespace.nspname as schema_name, proc.proname, pg_catalog.pg_get_function_identity_arguments(proc.oid) as arguments
from pg_catalog.pg_proc as proc
join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
where namespace.nspname = 'public'
  and proc.proname in (
    'indiana_follow_profile',
    'indiana_approve_follow_request',
    'indiana_reject_follow_request',
    'indiana_remove_follow_relationship',
    'indiana_search_profiles',
    'indiana_relationship_profile_summaries'
  )
order by proc.proname, arguments;
```

Expected before deployment: zero rows. Any result requires manual reconciliation; do not replace an existing object.

### Existing policy-name conflicts

```sql
select policyname, tablename, roles, cmd, permissive, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
  and policyname in (
    'profiles_select_accepted_followers',
    'profiles_select_relationship_visibility_guard',
    'follow_relationships_select_participants'
  )
order by tablename, policyname;
```

Expected before deployment: zero rows. Do not drop or rename a conflicting policy without reviewing its purpose.

### Relevant grants and role memberships

```sql
select
  role_name,
  pg_catalog.has_table_privilege(role_name, 'public.profiles', 'SELECT') as profiles_select,
  pg_catalog.has_table_privilege(role_name, 'auth.users', 'SELECT') as auth_users_select,
  pg_catalog.has_function_privilege(role_name, 'auth.uid()', 'EXECUTE') as auth_uid_execute
from (values ('anon'), ('authenticated'), ('service_role'), ('authenticator'), ('supabase_auth_admin'), ('postgres')) as roles(role_name)
order by role_name;

select
  member_role.rolname as subject_role,
  granted_role.rolname as effective_member_of,
  granted_role.rolsuper,
  granted_role.rolbypassrls
from pg_catalog.pg_roles as member_role
cross join pg_catalog.pg_roles as granted_role
where member_role.rolname in ('anon', 'authenticated', 'service_role', 'authenticator', 'supabase_auth_admin')
  and member_role.oid <> granted_role.oid
  and pg_catalog.pg_has_role(member_role.oid, granted_role.oid, 'MEMBER')
order by member_role.rolname, granted_role.rolname;
```

Expected: `authenticated` can select profiles and execute `auth.uid()`; `anon` cannot select profiles; API roles must not inherit superuser or `BYPASSRLS`; and `service_role` must not inherit the app roles whose new-object grants this draft revokes. Review all direct and transitive memberships, not only an empty direct-membership result.

### PostgreSQL default table ACLs

```sql
select
  pg_catalog.pg_get_userbyid(defaults.defaclrole) as owner_role,
  namespace.nspname as schema_name,
  defaults.defaclobjtype,
  acl.grantee,
  acl.privilege_type,
  acl.is_grantable
from pg_catalog.pg_default_acl as defaults
cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as acl
left join pg_catalog.pg_namespace as namespace on namespace.oid = defaults.defaclnamespace
where pg_catalog.pg_get_userbyid(defaults.defaclrole) = 'postgres'
  and defaults.defaclobjtype = 'r'
  and (defaults.defaclnamespace = 0 or namespace.nspname = 'public')
order by schema_name nulls first, acl.grantee, acl.privilege_type;
```

Stop if `PUBLIC` receives table defaults; this draft intentionally aborts rather than risking a change to `service_role`'s inherited access. Review any other unexpected role defaults. `service_role` privileges are not explicitly modified by this migration.

## Expected database design

- `public.follow_relationships` has a composite primary key `(requester_id, target_id)`, two cascading foreign keys to `auth.users(id)`, a `pending`/`accepted` check, a no-self check, and database timestamps.
- RLS is enabled. `authenticated` has SELECT only and can see relationship rows only when it is requester or target. It receives no direct table mutation grant or policy.
- Authenticated-only security-definer RPCs have owner `postgres`, `search_path = ''`, qualified database references, and no execute grant to `PUBLIC`, `anon`, `service_role`, `authenticator`, or `supabase_auth_admin`. `authenticated` is the only API role with execute permission.
- Follow status is determined by the database's locked current profile row. Approval is restricted to the target; rejection and requester removal are restricted by `auth.uid()` and endpoint columns.
- The profile SELECT policies combine the baseline own/public visibility with accepted-follow access. A restrictive policy caps authenticated profile reads at own, public, or accepted-followed profiles. Pending requests do not satisfy the guard.
- No profile table columns, profile insert/update grants, Auth triggers, schema ACLs, unrelated policies, or unrelated object privileges are changed. `service_role` is not granted or revoked explicitly.

## Staging behavior test plan

Use two disposable confirmed test accounts, **A** and **B**, and the Supabase API/app with separate authenticated sessions. Do not use a service-role key in a client or browser.

1. **Public follow:** Make B public. As A, find B by username/name and follow. Expect an `accepted` row `(A,B)`, button state `Following`, and B's public profile content readable by authenticated A.
2. **Private request:** Make B private. As A, search B by exact username. Expect only `Private member`, username, and private status in the search result; bio/avatar/display name are absent. Follow creates one `pending` row and the UI displays `Requested`/`Cancel request`.
3. **Pending content isolation:** Before approval, as A select B's profile. Expect no private row/content. Confirm the summary for B does not include private display name, bio, or avatar.
4. **Approve:** As B, approve A's incoming request. Expect the row status to become `accepted`, B's private profile row to become readable by A, and both the Connections and Profile counts to refresh from Supabase.
5. **Reject:** With a second request, reject it as B. Expect the pending row deleted, no profile access granted, and the requester able to request again later.
6. **Cancel:** As A, cancel an outgoing pending request. Expect deletion and no private-profile access.
7. **Unfollow:** As A, remove an accepted follow to private B. Expect row deletion and private-profile access revoked on the next read. A public B remains readable because it is public, but is no longer in A's following state.
8. **Privacy changes while pending:** Keep a request pending, switch B to public, and reload. Expect it to remain pending until B explicitly approves it or A cancels and follows again; do not silently convert it.
9. **Privacy changes after accepted:** Accept A, then switch B to private. Expect A to retain access until A unfollows; verify the policy and UI state. This is the documented retained-follower behavior.
10. **Idempotency and self-follow:** Repeat follow, approval, rejection, cancellation, and unfollow calls. Expect no duplicate rows and no privilege expansion. Attempt self-follow; expect a validation error and no row.
11. **Cross-user actions:** As C or A, attempt to approve a request addressed to B or reject one addressed to B. Expect false/no change. Direct API INSERT/UPDATE/DELETE of relationship rows must fail for `authenticated`; anonymous SELECT/RPC execution must fail.
12. **Relationship privacy:** As unrelated C, query A/B relationship IDs and profile content. Expect no unrelated relationship rows and no private profile content. As the target of an incoming request, verify only the limited request summary is returned.
13. **Persistence:** Reload the app, sign out/in, and verify pending and accepted states are loaded from the database. No relationship state should come from mock component state.
14. **Deleted account:** Delete a disposable test Auth user only through the approved staging process. Confirm the cascading relationship cleanup and that stale summaries disappear without crashing the screen.
15. **Web and native UI:** Test search, follow/request, cancel, approve/reject, following state, empty states, error/loading/disabled actions, scrolling, and safe areas in web and Expo Go Android/iOS. Verify the existing feed and five-tab navigation remain unchanged.

## Recovery and limits

- The migration uses `BEGIN`/`COMMIT` and postchecks. Apply it only with a runner confirmed to preserve one transaction. A failure before commit should roll back its transactional changes; external systems are outside the transaction.
- Stop on any preflight exception, unexpected role/object/policy result, or failed signup/profile behavior. Do not repeatedly edit and rerun in the SQL Editor without review.
- After commit, prefer a reviewed forward repair or restoring the disposable Temp snapshot. Do not blindly drop the relationship table or policies after users have created rows.
- This staging checklist does not establish production readiness. The SQL remains unparsed/unexecuted until run through an approved validator and Temp staging trial. Application exports and static checks cannot verify RLS, RPC grants, event triggers, or live Supabase behavior.
