-- Indiana profile system: STAGING MIGRATION DRAFT
--
-- This is a review artifact, not an instruction to run against production.
-- Before staging: review docs/supabase/profiles-staging-preflight.sql, compare
-- remote migration history, confirm indiana_internal is not API-exposed, and
-- inspect all Auth triggers/hooks and enabled DDL event triggers. The preflight
-- intentionally aborts for selected object conflicts but does not auto-abort
-- for event triggers; their behavior requires manual review.
--
-- Run only in a disposable/staging project as postgres after the preflight.
-- PostgreSQL DDL is transactional here; external Auth emails/hooks and other
-- effects outside this transaction are not rolled back by this transaction.

begin;

do $preflight$
begin
  if current_user <> 'postgres' then
    raise exception 'Apply this draft as postgres; current role is %.', current_user;
  end if;

  if not pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE') then
    raise exception 'The migration role cannot create the helper schema in this database.';
  end if;

  if not pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE') then
    raise exception 'The migration role cannot create public.profiles.';
  end if;

  if not pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE') then
    raise exception 'The migration role lacks USAGE on public to address the new table.';
  end if;

  if not pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE') then
    raise exception 'The migration role cannot resolve auth.users or auth.uid().';
  end if;

  if not pg_catalog.has_table_privilege(current_user, 'auth.users', 'SELECT') then
    raise exception 'The migration role cannot read auth.users for the backfill.';
  end if;

  if not pg_catalog.has_column_privilege(current_user, 'auth.users', 'id', 'REFERENCES') then
    raise exception 'The migration role cannot create the profiles.id foreign key.';
  end if;

  if not pg_catalog.has_language_privilege(current_user, 'plpgsql', 'USAGE') then
    raise exception 'The migration role cannot create PL/pgSQL trigger functions.';
  end if;

  if pg_catalog.to_regclass('public.profiles') is not null then
    raise exception 'public.profiles already exists; inspect its data, columns, grants, indexes, and policies before reconciling.';
  end if;

  if pg_catalog.to_regnamespace('indiana_internal') is not null then
    raise exception 'indiana_internal already exists; inspect its objects and permissions. This draft will not alter it.';
  end if;

  if pg_catalog.to_regclass('public.profiles_username_lower_uidx') is not null then
    raise exception 'The proposed username index name is already in use.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as trig
    join pg_catalog.pg_class as relation on relation.oid = trig.tgrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'auth'
      and relation.relname = 'users'
      and not trig.tgisinternal
  ) then
    raise exception 'auth.users has a custom trigger; inspect its function and signup behavior before adding another.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
    where proc.prokind in ('f', 'p')
      and namespace.nspname not in ('pg_catalog', 'information_schema')
      and (
        proc.proname ilike '%profile%'
        or proc.prosrc ilike '%public.profiles%'
        or proc.prosrc ilike '%auth.users%'
      )
  ) then
    raise exception 'A potentially profile-related function already exists; inspect it before proceeding.';
  end if;

  if not pg_catalog.has_table_privilege(current_user, 'auth.users', 'TRIGGER') then
    raise exception 'The migration role lacks TRIGGER privilege on auth.users.';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'supabase_auth_admin') then
    raise exception 'Expected Supabase API roles are missing; inspect this project before proceeding.';
  end if;

  if not pg_catalog.has_schema_privilege('authenticated', 'public', 'USAGE') then
    raise exception 'authenticated lacks USAGE on public; review existing schema grants instead of changing them here.';
  end if;

  if not pg_catalog.has_schema_privilege('authenticated', 'auth', 'USAGE') then
    raise exception 'authenticated lacks USAGE on auth, required for auth.uid() RLS policies.';
  end if;

  if pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception 'auth.uid() is missing; inspect Supabase Auth schema before proceeding.';
  end if;

  if not pg_catalog.has_function_privilege(
    'authenticated', pg_catalog.to_regprocedure('auth.uid()'), 'EXECUTE'
  ) then
    raise exception 'authenticated cannot execute auth.uid(), required by the RLS policies.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_roles as api_role
    where api_role.rolname in ('anon', 'authenticated')
      and (
        api_role.rolsuper
        or api_role.rolbypassrls
        or exists (
          select 1
          from pg_catalog.pg_roles as privileged_role
          where (privileged_role.rolsuper or privileged_role.rolbypassrls)
            and pg_catalog.pg_has_role(
              api_role.oid, privileged_role.oid, 'MEMBER'
            )
        )
      )
  ) then
    raise exception 'An API role is superuser or inherits a superuser/BYPASSRLS role; profile privacy policies would not be reliable.';
  end if;

  -- Revoking a grant from PUBLIC, anon, or authenticated could otherwise
  -- remove privileges inherited by service_role through a custom role setup.
  if pg_catalog.pg_has_role('service_role', 'anon', 'MEMBER')
     or pg_catalog.pg_has_role('service_role', 'authenticated', 'MEMBER')
     or pg_catalog.pg_has_role('anon', 'authenticated', 'MEMBER')
     or pg_catalog.pg_has_role('authenticated', 'anon', 'MEMBER') then
    raise exception 'Unexpected API-role membership could change effective access; inspect role membership first.';
  end if;

  -- Revoke PUBLIC table defaults only when doing so cannot remove a custom
  -- PUBLIC default grant that service_role might inherit on the new table.
  if exists (
    select 1
    from pg_catalog.pg_default_acl as defaults
    cross join lateral pg_catalog.aclexplode(defaults.defaclacl) as acl
    left join pg_catalog.pg_namespace as namespace
      on namespace.oid = defaults.defaclnamespace
    where defaults.defaclrole = (
        select owner_role.oid
        from pg_catalog.pg_roles as owner_role
        where owner_role.rolname = 'postgres'
      )
      and defaults.defaclobjtype = 'r'
      and (defaults.defaclnamespace = 0 or namespace.nspname = 'public')
      and acl.grantee = 0
  ) then
    raise exception 'PUBLIC has default table privileges; review effective service_role access before changing grants.';
  end if;
end;
$preflight$;

-- Create only a new, dedicated helper schema. The existing `private` schema and
-- all other existing schemas/permissions remain untouched. Keep this schema
-- absent from Supabase Dashboard > Project Settings > API > Exposed schemas.
create schema indiana_internal authorization postgres;
revoke all on schema indiana_internal
  from public, anon, authenticated, service_role, supabase_auth_admin;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null,
  display_name text not null default 'Indiana member',
  bio text not null default '',
  avatar_url text,
  is_private boolean not null default true,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint profiles_username_normalized
    check (username = pg_catalog.lower(username)),
  constraint profiles_username_format
    check (username ~ '^[a-z0-9][a-z0-9._]{1,38}[a-z0-9]$'),
  constraint profiles_display_name_length
    check (
      pg_catalog.char_length(display_name) <= 80
      and display_name ~ '[^[:space:]]'
    ),
  constraint profiles_bio_length
    check (pg_catalog.char_length(bio) <= 280),
  constraint profiles_avatar_url_format
    check (
      avatar_url is null
      or (
        pg_catalog.char_length(avatar_url) <= 2048
        and avatar_url ~* '^https://[^/?#[:space:]]+([/?#][^[:space:]]*)?$'
      )
    )
);

create unique index profiles_username_lower_uidx
  on public.profiles (pg_catalog.lower(username));

-- The function is SECURITY INVOKER. Its trigger body only updates NEW and
-- calls pg_catalog.now(); it does not need elevated table privileges.
create function indiana_internal.touch_profile_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$function$;

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function indiana_internal.touch_profile_updated_at();

-- Supabase Auth creates auth.users rows as its restricted Auth role. This
-- definer function runs as its trusted owner (postgres), which owns the new
-- profiles table and can insert despite client RLS. It accepts no client input.
create function indiana_internal.create_profile_for_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    'member_' || pg_catalog.replace(new.id::text, '-', ''),
    'Indiana member'
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function indiana_internal.create_profile_for_new_auth_user();

-- PostgreSQL checks schema usage and function EXECUTE for the migration role
-- when CREATE TRIGGER binds each function. The installed database triggers
-- invoke their bound functions; they are not client RPCs. Do not grant runtime
-- schema/function access to anon, authenticated, or supabase_auth_admin.
-- Revoke the default PUBLIC and Supabase function defaults on these new helpers.
revoke all on function indiana_internal.touch_profile_updated_at()
  from public, anon, authenticated, service_role, supabase_auth_admin;
revoke all on function indiana_internal.create_profile_for_new_auth_user()
  from public, anon, authenticated, service_role, supabase_auth_admin;

-- Enable RLS and grant only the client operations needed for the profile UI.
alter table public.profiles enable row level security;
-- public/auth schema USAGE is checked above; leave existing schema ACLs intact.

-- Preserve existing/default service_role table access. service_role is a
-- trusted server-side exception that bypasses RLS; never use its key in the app.
revoke all on table public.profiles from public, anon, authenticated;

grant select on table public.profiles to authenticated;
-- Privacy and avatar fields are not client-writable at creation: database
-- defaults create private profiles with a null avatar URL.
grant insert (id, username, display_name, bio)
  on table public.profiles to authenticated;
grant update (username, display_name, bio, is_private)
  on table public.profiles to authenticated;
-- No client DELETE grant. Timestamp and owner columns are not client-writable.

create policy profiles_select_visible
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or not is_private);

create policy profiles_insert_own
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()));

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Backfill missing Auth users without replacing an existing profile row.
insert into public.profiles (id, username, display_name)
select
  users.id,
  'member_' || pg_catalog.replace(users.id::text, '-', ''),
  'Indiana member'
from auth.users as users
where not exists (
  select 1 from public.profiles as profile where profile.id = users.id
)
on conflict (id) do nothing;

-- Post-deployment assertions catch unexpected grants/policies before COMMIT.
do $postcheck$
declare
  policy_count integer;
begin
  if not exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'profiles'
      and relation.relrowsecurity
      and not relation.relforcerowsecurity
      and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
  ) then
    raise exception 'profiles ownership or RLS state differs from the reviewed design.';
  end if;

  if pg_catalog.has_schema_privilege('anon', 'indiana_internal', 'USAGE')
     or pg_catalog.has_schema_privilege('authenticated', 'indiana_internal', 'USAGE')
     or pg_catalog.has_schema_privilege('service_role', 'indiana_internal', 'USAGE')
     or pg_catalog.has_schema_privilege('supabase_auth_admin', 'indiana_internal', 'USAGE') then
    raise exception 'An API/Auth role has USAGE on the internal helper schema.';
  end if;

  select pg_catalog.count(*) into policy_count
  from pg_catalog.pg_policies
  where schemaname = 'public' and tablename = 'profiles';

  if policy_count <> 3 then
    raise exception 'Expected exactly three profiles policies; found %.', policy_count;
  end if;

  -- Keep direct table/column ACL grantees limited to the owner, the app role,
  -- and service_role. The latter is deliberately allowed and is never revoked.
  if exists (
    select 1
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(
      coalesce(relation.relacl, pg_catalog.acldefault('r', relation.relowner))
    ) as acl
    left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname = 'profiles'
      and acl.grantee <> relation.relowner
      and (
        acl.grantee = 0
        or grantee.rolname is null
        or grantee.rolname not in ('authenticated', 'service_role')
      )
  ) then
    raise exception 'Unexpected direct table ACL grantee on profiles; review default privileges.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    join pg_catalog.pg_class as relation on relation.oid = attribute.attrelid
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    cross join lateral pg_catalog.aclexplode(attribute.attacl) as acl
    left join pg_catalog.pg_roles as grantee on grantee.oid = acl.grantee
    where namespace.nspname = 'public'
      and relation.relname = 'profiles'
      and attribute.attnum > 0
      and not attribute.attisdropped
      and attribute.attacl is not null
      and acl.grantee <> relation.relowner
      and (
        acl.grantee = 0
        or grantee.rolname is null
        or grantee.rolname not in ('authenticated', 'service_role')
      )
  ) then
    raise exception 'Unexpected direct column ACL grantee on profiles; review default privileges.';
  end if;

  if pg_catalog.has_table_privilege('anon', 'public.profiles', 'SELECT')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'INSERT')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'UPDATE')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'DELETE')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'TRUNCATE')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'REFERENCES')
     or pg_catalog.has_table_privilege('anon', 'public.profiles', 'TRIGGER') then
    raise exception 'anon has profile-table access; review grants and role membership.';
  end if;

  if pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'DELETE')
     or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'TRUNCATE')
     or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'REFERENCES')
     or pg_catalog.has_table_privilege('authenticated', 'public.profiles', 'TRIGGER')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'created_at', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'INSERT')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'UPDATE')
     or pg_catalog.has_column_privilege('authenticated', 'public.profiles', 'is_private', 'INSERT') then
    raise exception 'authenticated has an unintended profile write privilege.';
  end if;

  -- Default EXECUTE grants can be customized per owner. Keep these internal
  -- helpers executable only by their owner; roll back on unexpected grantees.
  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    cross join lateral pg_catalog.aclexplode(
      coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    ) as acl
    where proc.oid in (
      'indiana_internal.touch_profile_updated_at()'::regprocedure,
      'indiana_internal.create_profile_for_new_auth_user()'::regprocedure
    )
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee <> proc.proowner
  ) then
    raise exception 'A role other than the function owner can execute an internal helper; review function defaults.';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as proc
    where proc.oid in (
      'indiana_internal.touch_profile_updated_at()'::regprocedure,
      'indiana_internal.create_profile_for_new_auth_user()'::regprocedure
    )
      and (
        pg_catalog.pg_get_userbyid(proc.proowner) <> 'postgres'
        or (
          proc.proname = 'create_profile_for_new_auth_user'
          and not proc.prosecdef
        )
        or (
          proc.proname = 'touch_profile_updated_at'
          and proc.prosecdef
        )
        or not coalesce(
          proc.proconfig @> array['search_path=""']::text[],
          false
        )
      )
  ) then
    raise exception 'An internal helper has unexpected owner, security mode, or search_path.';
  end if;

  -- This assertion intentionally excludes service_role: the migration must
  -- preserve its pre-existing trusted server/admin table privileges.
end;
$postcheck$;

commit;
