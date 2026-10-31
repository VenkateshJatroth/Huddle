-- Indiana follow relationships: VERSIONED STAGING DRAFT
--
-- This review artifact is not an active Supabase migration and has not been
-- parsed or executed against PostgreSQL. Use only in the disposable Temp
-- project after the reviewed profiles migration has been applied and tested.
-- Never run against the actual Indiana project or production.
--
-- The migration adds no Auth trigger and does not change profile columns or
-- existing Auth configuration. It expects public.profiles with the contract
-- documented in profiles-staging-migration-draft.sql.
--
-- Privacy decision: public profiles can be found by name/username by signed-in
-- members. A private profile can be found only by its exact username, and the
-- search RPC returns only its username, privacy flag, and the label
-- "Private member". It never returns a private bio/avatar/display name before
-- an accepted follow. Confirm this limited identifier visibility is acceptable
-- before staging deployment.
--
-- A follow to a public profile is accepted immediately; a follow to a private
-- profile is pending. If that profile becomes public while the request is
-- pending, the request stays pending until its owner approves it or the
-- requester cancels it. A public follow that later becomes private remains
-- accepted; the follower can still see the private profile until unfollowing.

begin;

do $preflight$
declare
  v_profiles_oid oid := pg_catalog.to_regclass('public.profiles');
  v_auth_users_oid oid := pg_catalog.to_regclass('auth.users');
  v_auth_id_attnum smallint;
  v_authenticated_oid oid;
  v_anon_oid oid;
begin
  if current_user <> 'postgres' then
    raise exception 'Apply this draft as postgres; current role is %.', current_user;
  end if;

  if v_profiles_oid is null then
    raise exception 'public.profiles is missing. Apply and test the reviewed profile migration in Temp first.';
  end if;

  if v_auth_users_oid is null then
    raise exception 'auth.users is missing; inspect the Supabase Auth schema before proceeding.';
  end if;

  if not pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
     or not pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
     or not pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
     or not pg_catalog.has_column_privilege(current_user, 'auth.users', 'id', 'REFERENCES') then
    raise exception 'The migration role lacks a required public/auth schema or auth.users REFERENCES privilege.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class as profile_table
    join pg_catalog.pg_namespace as profile_schema on profile_schema.oid = profile_table.relnamespace
    where profile_table.oid = v_profiles_oid
      and profile_schema.nspname = 'public'
      and profile_table.relkind = 'r'
      and profile_table.relrowsecurity
      and pg_catalog.pg_get_userbyid(profile_table.relowner) = 'postgres'
  ) then
    raise exception 'public.profiles must be the reviewed postgres-owned table with RLS enabled.';
  end if;

  if exists (
    select expected.column_name
    from (values
      ('id', 'uuid'),
      ('username', 'text'),
      ('display_name', 'text'),
      ('bio', 'text'),
      ('avatar_url', 'text'),
      ('is_private', 'boolean')
    ) as expected(column_name, expected_type)
    left join pg_catalog.pg_attribute as actual
      on actual.attrelid = v_profiles_oid
      and actual.attname = expected.column_name
      and actual.attnum > 0
      and not actual.attisdropped
    where actual.attnum is null
       or pg_catalog.format_type(actual.atttypid, actual.atttypmod) <> expected.expected_type
  ) then
    raise exception 'public.profiles has missing or incompatible columns; reconcile the actual schema manually.';
  end if;

  select auth_id.attnum
    into v_auth_id_attnum
  from pg_catalog.pg_attribute as auth_id
  where auth_id.attrelid = v_auth_users_oid
    and auth_id.attname = 'id'
    and auth_id.attnum > 0
    and not auth_id.attisdropped;

  if v_auth_id_attnum is null or not exists (
    select 1
    from pg_catalog.pg_index as auth_unique_index
    where auth_unique_index.indrelid = v_auth_users_oid
      and auth_unique_index.indisunique
      and auth_unique_index.indisvalid
      and auth_unique_index.indisready
      and auth_unique_index.indislive
      and auth_unique_index.indpred is null
      and auth_unique_index.indexprs is null
      and auth_unique_index.indnkeyatts = 1
      and auth_unique_index.indkey[0] = v_auth_id_attnum
  ) then
    raise exception 'auth.users.id lacks a valid single-column unique key required by the relationship foreign keys.';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as profile_fk
    join pg_catalog.pg_attribute as profile_id
      on profile_id.attrelid = profile_fk.conrelid
      and profile_id.attname = 'id'
      and profile_id.attnum = profile_fk.conkey[1]
    join pg_catalog.pg_attribute as auth_id
      on auth_id.attrelid = profile_fk.confrelid
      and auth_id.attname = 'id'
      and auth_id.attnum = profile_fk.confkey[1]
    where profile_fk.conrelid = v_profiles_oid
      and profile_fk.confrelid = v_auth_users_oid
      and profile_fk.contype = 'f'
      and profile_fk.convalidated
      and pg_catalog.cardinality(profile_fk.conkey) = 1
      and pg_catalog.cardinality(profile_fk.confkey) = 1
  ) then
    raise exception 'public.profiles.id is not confirmed as a validated foreign key to auth.users.id.';
  end if;

  select role_data.oid into v_authenticated_oid
  from pg_catalog.pg_roles as role_data where role_data.rolname = 'authenticated';
  select role_data.oid into v_anon_oid
  from pg_catalog.pg_roles as role_data where role_data.rolname = 'anon';

  if v_authenticated_oid is null or v_anon_oid is null
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticator')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    raise exception 'Expected Supabase database roles are missing; inspect this project before proceeding.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles as api_role
    cross join pg_catalog.pg_roles as privileged_role
    where api_role.rolname in ('anon', 'authenticated')
      and (
        api_role.rolsuper
        or api_role.rolbypassrls
        or (
          (privileged_role.rolsuper or privileged_role.rolbypassrls)
          and pg_catalog.pg_has_role(api_role.oid, privileged_role.oid, 'MEMBER')
        )
      )
  ) then
    raise exception 'anon/authenticated has direct or inherited superuser/BYPASSRLS capability.';
  end if;

  if pg_catalog.pg_has_role('anon', 'authenticated', 'MEMBER')
     or pg_catalog.pg_has_role('authenticated', 'anon', 'MEMBER') then
    raise exception 'anon/authenticated role membership is unexpected and could change API privilege or policy evaluation.';
  end if;

  -- The migration removes grants from these roles on its new table/functions.
  -- Do not proceed if service_role inherits one of those grants through role
  -- membership; its existing trusted service access must remain intact.
  if pg_catalog.pg_has_role('service_role', 'anon', 'MEMBER')
     or pg_catalog.pg_has_role('service_role', 'authenticated', 'MEMBER')
     or pg_catalog.pg_has_role('service_role', 'authenticator', 'MEMBER')
     or pg_catalog.pg_has_role('service_role', 'supabase_auth_admin', 'MEMBER') then
    raise exception 'service_role inherits a role whose new-object privileges this draft revokes; review access before proceeding.';
  end if;

  if not pg_catalog.has_schema_privilege(v_authenticated_oid, 'public', 'USAGE')
     or not pg_catalog.has_schema_privilege(v_authenticated_oid, 'auth', 'USAGE')
     or pg_catalog.to_regprocedure('auth.uid()') is null
     or not pg_catalog.has_function_privilege(
       v_authenticated_oid, pg_catalog.to_regprocedure('auth.uid()'), 'EXECUTE'
     ) then
    raise exception 'authenticated requires public/auth schema usage and auth.uid() execution for the RPCs and policies.';
  end if;

  if pg_catalog.has_table_privilege(v_anon_oid, v_profiles_oid, 'SELECT') then
    raise exception 'anon can select profiles; reconcile profile grants before adding relationship policies.';
  end if;

  if not pg_catalog.has_table_privilege(v_authenticated_oid, v_profiles_oid, 'SELECT') then
    raise exception 'authenticated cannot select profiles; reconcile the existing profile grant before proceeding.';
  end if;

  -- The expected baseline is the policy from the reviewed profile migration.
  -- The relationship migration adds one permissive accepted-follower policy
  -- plus a restrictive visibility guard, so other broad permissive policies
  -- cannot widen authenticated profile visibility.
  if not exists (
    select 1
    from pg_catalog.pg_policy as baseline
    where baseline.polrelid = v_profiles_oid
      and baseline.polname = 'profiles_select_visible'
      and baseline.polcmd = 'r'
      and baseline.polpermissive
      and pg_catalog.cardinality(baseline.polroles) = 1
      and baseline.polroles[1] = v_authenticated_oid
      and baseline.polqual is not null
  ) then
    raise exception 'The expected profiles_select_visible policy is missing or has unexpected metadata; inspect pg_policies manually.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as profile_policy
    where profile_policy.polrelid = v_profiles_oid
      and profile_policy.polcmd in ('r', '*')
      and (0::oid = any(profile_policy.polroles) or v_anon_oid = any(profile_policy.polroles))
  ) then
    raise exception 'A PUBLIC/anon profile read policy exists; reconcile it before proceeding.';
  end if;

  if pg_catalog.to_regclass('public.follow_relationships') is not null
     or pg_catalog.to_regclass('public.follow_relationships_incoming_pending_idx') is not null
     or pg_catalog.to_regclass('public.follow_relationships_outgoing_pending_idx') is not null
     or pg_catalog.to_regclass('public.follow_relationships_incoming_accepted_idx') is not null
     or pg_catalog.to_regclass('public.follow_relationships_outgoing_accepted_idx') is not null then
    raise exception 'A proposed relationship table or index already exists; inspect and reconcile it instead of replacing it.';
  end if;

  if exists (
    select 1
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
  ) then
    raise exception 'A proposed Indiana relationship RPC name already exists in public; inspect overloads before proceeding.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy as profile_policy
    where profile_policy.polrelid = v_profiles_oid
      and profile_policy.polname in (
        'profiles_select_accepted_followers',
        'profiles_select_relationship_visibility_guard'
      )
  ) then
    raise exception 'A proposed relationship profile policy name is already in use.';
  end if;

  -- Removing PUBLIC table defaults can also remove privileges from service_role.
  -- Abort rather than changing that potentially intentional access.
  if exists (
    select 1
    from pg_catalog.pg_default_acl as defaults
    cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as acl
    left join pg_catalog.pg_namespace as namespace on namespace.oid = defaults.defaclnamespace
    where (defaults.defaclnamespace = 0 or namespace.nspname = 'public')
      and defaults.defaclrole = (
        select owner_role.oid from pg_catalog.pg_roles as owner_role where owner_role.rolname = 'postgres'
      )
      and defaults.defaclobjtype = 'r'
      and acl.grantee = 0
  ) then
    raise exception 'postgres has PUBLIC default table grants; review service_role access before changing new-table ACLs.';
  end if;
end;
$preflight$;

create table public.follow_relationships (
  requester_id uuid not null
    references auth.users (id) on delete cascade,
  target_id uuid not null
    references auth.users (id) on delete cascade,
  status text not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  constraint follow_relationships_pkey primary key (requester_id, target_id),
  constraint follow_relationships_status_check check (status in ('pending', 'accepted')),
  constraint follow_relationships_not_self_check check (requester_id <> target_id)
);

create index follow_relationships_incoming_pending_idx
  on public.follow_relationships (target_id, created_at desc)
  where status = 'pending';
create index follow_relationships_outgoing_pending_idx
  on public.follow_relationships (requester_id, created_at desc)
  where status = 'pending';
create index follow_relationships_incoming_accepted_idx
  on public.follow_relationships (target_id, created_at desc)
  where status = 'accepted';
create index follow_relationships_outgoing_accepted_idx
  on public.follow_relationships (requester_id, created_at desc)
  where status = 'accepted';

alter table public.follow_relationships enable row level security;

-- This table is new. Clear app/default grants on this table only; leave
-- service_role and every existing table/schema ACL untouched. The preflight
-- refuses PUBLIC defaults that could otherwise be inherited by service_role.
revoke all on table public.follow_relationships
  from public, anon, authenticated, authenticator, supabase_auth_admin;
grant select on table public.follow_relationships to authenticated;

create policy follow_relationships_select_participants
on public.follow_relationships
for select
to authenticated
using (
  requester_id = (select auth.uid())
  or target_id = (select auth.uid())
);
-- There are no client INSERT, UPDATE, or DELETE policies or grants. RPCs below
-- perform all state transitions after checking auth.uid() and row ownership.

-- RLS policies are permissive by default and combine with OR. The accepted
-- policy enables a follower to read the followed private profile. The
-- restrictive guard caps all authenticated profile reads at owner, public, or
-- accepted-follower visibility even if another permissive policy is added.
create policy profiles_select_accepted_followers
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.follow_relationships as relationship
    where relationship.requester_id = (select auth.uid())
      and relationship.target_id = profiles.id
      and relationship.status = 'accepted'
  )
);

create policy profiles_select_relationship_visibility_guard
on public.profiles
as restrictive
for select
to authenticated
using (
  profiles.id = (select auth.uid())
  or not profiles.is_private
  or exists (
    select 1
    from public.follow_relationships as relationship
    where relationship.requester_id = (select auth.uid())
      and relationship.target_id = profiles.id
      and relationship.status = 'accepted'
  )
);

-- Public/private is read from the locked profile row inside this function,
-- never accepted from the client. The profile row lock serializes the privacy
-- check with a simultaneous profile privacy update.
create function public.indiana_follow_profile(p_target_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requester_id uuid := auth.uid();
  v_target_is_private boolean;
  v_status text;
begin
  if v_requester_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'A target profile is required.';
  end if;
  if p_target_id = v_requester_id then
    raise exception using errcode = '22023', message = 'You cannot follow your own profile.';
  end if;

  select profile.is_private
    into v_target_is_private
  from public.profiles as profile
  where profile.id = p_target_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'The target profile is unavailable.';
  end if;

  insert into public.follow_relationships (requester_id, target_id, status)
  values (
    v_requester_id,
    p_target_id,
    case when v_target_is_private then 'pending' else 'accepted' end
  )
  on conflict (requester_id, target_id) do nothing;

  select relationship.status
    into v_status
  from public.follow_relationships as relationship
  where relationship.requester_id = v_requester_id
    and relationship.target_id = p_target_id;

  return v_status;
end;
$function$;

create function public.indiana_approve_follow_request(p_requester_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_id uuid := auth.uid();
begin
  if v_target_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if p_requester_id is null then
    raise exception using errcode = '22023', message = 'A requesting profile is required.';
  end if;

  update public.follow_relationships as relationship
  set status = 'accepted', updated_at = pg_catalog.now()
  where relationship.requester_id = p_requester_id
    and relationship.target_id = v_target_id
    and relationship.status = 'pending';

  if found then
    return true;
  end if;

  -- Retrying approval after a successful response is idempotent.
  return exists (
    select 1
    from public.follow_relationships as relationship
    where relationship.requester_id = p_requester_id
      and relationship.target_id = v_target_id
      and relationship.status = 'accepted'
  );
end;
$function$;

create function public.indiana_reject_follow_request(p_requester_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_target_id uuid := auth.uid();
begin
  if v_target_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if p_requester_id is null then
    raise exception using errcode = '22023', message = 'A requesting profile is required.';
  end if;

  delete from public.follow_relationships as relationship
  where relationship.requester_id = p_requester_id
    and relationship.target_id = v_target_id
    and relationship.status = 'pending';

  return found;
end;
$function$;

create function public.indiana_remove_follow_relationship(p_target_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requester_id uuid := auth.uid();
begin
  if v_requester_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if p_target_id is null then
    raise exception using errcode = '22023', message = 'A target profile is required.';
  end if;

  delete from public.follow_relationships as relationship
  where relationship.requester_id = v_requester_id
    and relationship.target_id = p_target_id;

  return found;
end;
$function$;

-- Public accounts can be searched by name or username. A private account is
-- discoverable only by exact username, and only a masked identity is returned.
create function public.indiana_search_profiles(p_query text, p_limit integer default 20)
returns table (
  profile_id uuid,
  profile_username text,
  profile_display_name text,
  profile_is_private boolean,
  outgoing_status text,
  follows_you boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_viewer_id uuid := auth.uid();
  v_query text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_query, '')));
begin
  if v_viewer_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if p_limit is null or p_limit < 1 or p_limit > 30 then
    raise exception using errcode = '22023', message = 'Search limit must be between 1 and 30.';
  end if;
  if pg_catalog.char_length(v_query) < 2 then
    return;
  end if;

  return query
  select
    candidate.id,
    candidate.username,
    case
      when candidate.is_private and outgoing.status is distinct from 'accepted' then 'Private member'
      else candidate.display_name
    end,
    candidate.is_private,
    outgoing.status,
    exists (
      select 1
      from public.follow_relationships as inbound
      where inbound.requester_id = candidate.id
        and inbound.target_id = v_viewer_id
        and inbound.status = 'accepted'
    )
  from public.profiles as candidate
  left join public.follow_relationships as outgoing
    on outgoing.requester_id = v_viewer_id
    and outgoing.target_id = candidate.id
  where candidate.id <> v_viewer_id
    and (
      (
        not candidate.is_private
        and (
          pg_catalog.strpos(pg_catalog.lower(candidate.username), v_query) > 0
          or pg_catalog.strpos(pg_catalog.lower(candidate.display_name), v_query) > 0
        )
      )
      or (
        candidate.is_private
        and pg_catalog.lower(candidate.username) = v_query
      )
    )
  order by candidate.username
  limit p_limit;
end;
$function$;

-- Relationship participants can see the other member's handle. Names, bio,
-- and avatar are returned for public profiles or when the caller is an
-- accepted follower of that private profile. Pending relationships reveal
-- none of those fields.
create function public.indiana_relationship_profile_summaries(p_profile_ids uuid[])
returns table (
  profile_id uuid,
  profile_username text,
  profile_display_name text,
  profile_is_private boolean,
  profile_bio text,
  profile_avatar_url text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_viewer_id uuid := auth.uid();
begin
  if v_viewer_id is null then
    raise exception using errcode = '42501', message = 'A signed-in user is required.';
  end if;
  if pg_catalog.cardinality(coalesce(p_profile_ids, array[]::uuid[])) > 100 then
    raise exception using errcode = '22023', message = 'At most 100 relationship profiles can be loaded at once.';
  end if;

  return query
  select
    profile.id,
    profile.username,
    case when not profile.is_private or can_view_private_content.allowed
      then profile.display_name else 'Private member' end,
    profile.is_private,
    case when not profile.is_private or can_view_private_content.allowed
      then profile.bio else null end,
    case when not profile.is_private or can_view_private_content.allowed
      then profile.avatar_url else null end
  from public.profiles as profile
  cross join lateral (
    select exists (
      select 1
      from public.follow_relationships as accepted
      where accepted.requester_id = v_viewer_id
        and accepted.target_id = profile.id
        and accepted.status = 'accepted'
    ) as allowed
  ) as can_view_private_content
  where profile.id <> v_viewer_id
    and profile.id = any(coalesce(p_profile_ids, array[]::uuid[]))
    and exists (
      select 1
      from public.follow_relationships as participant
      where (participant.requester_id = v_viewer_id and participant.target_id = profile.id)
         or (participant.target_id = v_viewer_id and participant.requester_id = profile.id)
    );
end;
$function$;

-- The RPCs are the only mutation path. Revoke PostgreSQL's default PUBLIC
-- execute permission (and any owner-specific defaults) before granting the
-- authenticated API role alone.
revoke all on function public.indiana_follow_profile(uuid)
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;
revoke all on function public.indiana_approve_follow_request(uuid)
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;
revoke all on function public.indiana_reject_follow_request(uuid)
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;
revoke all on function public.indiana_remove_follow_relationship(uuid)
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;
revoke all on function public.indiana_search_profiles(text, integer)
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;
revoke all on function public.indiana_relationship_profile_summaries(uuid[])
  from public, anon, authenticated, service_role, authenticator, supabase_auth_admin;

grant execute on function public.indiana_follow_profile(uuid) to authenticated;
grant execute on function public.indiana_approve_follow_request(uuid) to authenticated;
grant execute on function public.indiana_reject_follow_request(uuid) to authenticated;
grant execute on function public.indiana_remove_follow_relationship(uuid) to authenticated;
grant execute on function public.indiana_search_profiles(text, integer) to authenticated;
grant execute on function public.indiana_relationship_profile_summaries(uuid[]) to authenticated;

do $postcheck$
declare
  v_relationship_oid oid := pg_catalog.to_regclass('public.follow_relationships');
  v_profiles_oid oid := pg_catalog.to_regclass('public.profiles');
  v_authenticated_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'authenticated');
  v_anon_oid oid := (select oid from pg_catalog.pg_roles where rolname = 'anon');
  v_policy_count integer;
begin
  if v_relationship_oid is null or v_profiles_oid is null then
    raise exception 'The relationship table or required profile table was not created.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_class as relation
    where relation.oid = v_relationship_oid and relation.relrowsecurity
      and not relation.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
  ) then
    raise exception 'follow_relationships must be postgres-owned with RLS enabled and not forced.';
  end if;

  if not pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'SELECT')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'INSERT')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'UPDATE')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'DELETE')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'TRUNCATE')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'REFERENCES')
     or pg_catalog.has_table_privilege(v_authenticated_oid, v_relationship_oid, 'TRIGGER') then
    raise exception 'authenticated must have table SELECT only; all relationship writes must use the RPCs.';
  end if;

  if pg_catalog.has_table_privilege(v_anon_oid, v_relationship_oid, 'SELECT')
     or pg_catalog.has_table_privilege(v_anon_oid, v_relationship_oid, 'INSERT')
     or pg_catalog.has_table_privilege(v_anon_oid, v_relationship_oid, 'UPDATE')
     or pg_catalog.has_table_privilege(v_anon_oid, v_relationship_oid, 'DELETE') then
    raise exception 'anon has effective follow_relationships privileges.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class as relation
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) as acl
    left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where relation.oid = v_relationship_oid
      and acl.grantee <> relation.relowner
      and (
        acl.grantee = 0
        or grantee.rolname is null
        or grantee.rolname not in ('authenticated', 'service_role')
      )
  ) then
    raise exception 'Unexpected direct table ACL grantee on follow_relationships; inspect owner defaults.';
  end if;

  select pg_catalog.count(*) into v_policy_count
  from pg_catalog.pg_policy as policy
  where policy.polrelid = v_relationship_oid;
  if v_policy_count <> 1 or not exists (
    select 1 from pg_catalog.pg_policy as policy
    where policy.polrelid = v_relationship_oid
      and policy.polname = 'follow_relationships_select_participants'
      and policy.polcmd = 'r'
      and policy.polpermissive
      and pg_catalog.cardinality(policy.polroles) = 1
      and policy.polroles[1] = v_authenticated_oid
  ) then
    raise exception 'follow_relationships must have only its authenticated participant SELECT policy.';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_policy as policy
    where policy.polrelid = v_profiles_oid
      and policy.polname = 'profiles_select_accepted_followers'
      and policy.polcmd = 'r'
      and policy.polpermissive
      and pg_catalog.cardinality(policy.polroles) = 1
      and policy.polroles[1] = v_authenticated_oid
  ) or not exists (
    select 1 from pg_catalog.pg_policy as policy
    where policy.polrelid = v_profiles_oid
      and policy.polname = 'profiles_select_relationship_visibility_guard'
      and policy.polcmd = 'r'
      and not policy.polpermissive
      and pg_catalog.cardinality(policy.polroles) = 1
      and policy.polroles[1] = v_authenticated_oid
  ) then
    raise exception 'The accepted-follower and restrictive profile visibility policies are missing or malformed.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    ) as acl
    left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where proc.oid in (
      'public.indiana_follow_profile(uuid)'::regprocedure,
      'public.indiana_approve_follow_request(uuid)'::regprocedure,
      'public.indiana_reject_follow_request(uuid)'::regprocedure,
      'public.indiana_remove_follow_relationship(uuid)'::regprocedure,
      'public.indiana_search_profiles(text,integer)'::regprocedure,
      'public.indiana_relationship_profile_summaries(uuid[])'::regprocedure
    )
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> proc.proowner
      and (acl.grantee = 0 or grantee.rolname is distinct from 'authenticated')
  ) then
    raise exception 'A role other than authenticated can execute a relationship RPC.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid in (
      'public.indiana_follow_profile(uuid)'::regprocedure,
      'public.indiana_approve_follow_request(uuid)'::regprocedure,
      'public.indiana_reject_follow_request(uuid)'::regprocedure,
      'public.indiana_remove_follow_relationship(uuid)'::regprocedure,
      'public.indiana_search_profiles(text,integer)'::regprocedure,
      'public.indiana_relationship_profile_summaries(uuid[])'::regprocedure
    )
      and (
        pg_catalog.pg_get_userbyid(proc.proowner) <> 'postgres'
        or not proc.prosecdef
        or not coalesce(proc.proconfig @> array['search_path=""']::text[], false)
      )
  ) then
    raise exception 'A relationship RPC has unexpected ownership, security mode, or search_path.';
  end if;

  if not pg_catalog.has_function_privilege(
    v_authenticated_oid, 'public.indiana_follow_profile(uuid)', 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    v_anon_oid, 'public.indiana_follow_profile(uuid)', 'EXECUTE'
  ) then
    raise exception 'The follow RPC is not restricted to authenticated users.';
  end if;

  -- This draft does not grant or revoke service_role table privileges. The
  -- preflight checks membership/default ACL assumptions; compare its effective
  -- new-table access with the reviewed postgres default ACL after staging.
end;
$postcheck$;

commit;
