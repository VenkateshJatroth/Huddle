-- Indiana profiles: READ-ONLY staging preflight
-- Every statement in this file is a SELECT. Do not paste credential values
-- or sensitive function bodies into chat or commit their query results.
-- Run these checks against staging before considering the migration draft.

-- 1. Migration context, expected Supabase roles, and role memberships.
select
  current_database() as database_name,
  current_user as migration_session_role,
  pg_catalog.has_database_privilege(current_user, current_database(), 'CREATE')
    as can_create_helper_schema,
  pg_catalog.has_schema_privilege(current_user, 'public', 'CREATE')
    as can_create_profiles_table,
  pg_catalog.has_schema_privilege(current_user, 'public', 'USAGE')
    as can_use_public_schema,
  pg_catalog.has_schema_privilege(current_user, 'auth', 'USAGE')
    as can_resolve_auth_objects,
  pg_catalog.has_table_privilege(current_user, 'auth.users', 'SELECT')
    as can_backfill_auth_users,
  pg_catalog.has_table_privilege(current_user, 'auth.users', 'TRIGGER')
    as has_trigger_privilege_on_auth_users,
  pg_catalog.has_column_privilege(current_user, 'auth.users', 'id', 'REFERENCES')
    as can_reference_auth_user_id,
  pg_catalog.has_language_privilege(current_user, 'plpgsql', 'USAGE')
    as can_create_plpgsql_functions,
  case
    when pg_catalog.to_regnamespace('indiana_internal') is null then null
    else pg_catalog.has_schema_privilege(
      current_user, pg_catalog.to_regnamespace('indiana_internal'), 'USAGE'
    )
  end as can_use_existing_internal_schema,
  case
    when authenticated_role.oid is null then null
    else pg_catalog.has_schema_privilege(authenticated_role.oid, 'public', 'USAGE')
  end as authenticated_can_use_public_schema,
  pg_catalog.to_regprocedure('auth.uid()') as auth_uid_function,
  case
    when authenticated_role.oid is null then null
    when pg_catalog.to_regprocedure('auth.uid()') is null then false
    else pg_catalog.has_function_privilege(
      authenticated_role.oid, pg_catalog.to_regprocedure('auth.uid()'), 'EXECUTE'
    )
  end as authenticated_can_execute_auth_uid
from (values (1)) as singleton(dummy)
left join pg_catalog.pg_roles as authenticated_role
  on authenticated_role.rolname = 'authenticated';

select
  rolname,
  rolsuper,
  rolinherit,
  rolbypassrls,
  rolcreaterole,
  rolcreatedb
from pg_catalog.pg_roles
where rolname in (
  'postgres', 'anon', 'authenticated', 'service_role', 'authenticator',
  'supabase_auth_admin'
)
order by rolname;

-- Effective privileges for the relevant roles. NULL means the referenced
-- object does not exist; it is not evidence that the privilege is denied.
select
  role_data.rolname as role_name,
  pg_catalog.has_database_privilege(
    role_data.oid, current_database(), 'CONNECT'
  ) as can_connect_to_database,
  pg_catalog.has_schema_privilege(role_data.oid, 'public', 'USAGE')
    as public_schema_usage,
  pg_catalog.has_schema_privilege(role_data.oid, 'auth', 'USAGE')
    as auth_schema_usage,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.auth_users_oid, 'SELECT')
  end as auth_users_select,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.auth_users_oid, 'INSERT')
  end as auth_users_insert,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.auth_users_oid, 'UPDATE')
  end as auth_users_update,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.auth_users_oid, 'DELETE')
  end as auth_users_delete,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.auth_users_oid, 'TRIGGER')
  end as auth_users_trigger,
  case when objects.auth_users_oid is null then null else
    pg_catalog.has_column_privilege(
      role_data.oid, objects.auth_users_oid, 'id', 'REFERENCES'
    )
  end as auth_users_id_references,
  case when objects.auth_uid_oid is null then null else
    pg_catalog.has_function_privilege(role_data.oid, objects.auth_uid_oid, 'EXECUTE')
  end as auth_uid_execute,
  case when objects.profiles_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.profiles_oid, 'SELECT')
  end as profiles_select,
  case when objects.profiles_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.profiles_oid, 'INSERT')
  end as profiles_insert,
  case when objects.profiles_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.profiles_oid, 'UPDATE')
  end as profiles_update,
  case when objects.profiles_oid is null then null else
    pg_catalog.has_table_privilege(role_data.oid, objects.profiles_oid, 'DELETE')
  end as profiles_delete
from pg_catalog.pg_roles as role_data
cross join (
  select
    pg_catalog.to_regclass('auth.users')::oid as auth_users_oid,
    pg_catalog.to_regclass('public.profiles')::oid as profiles_oid,
    pg_catalog.to_regprocedure('auth.uid()')::oid as auth_uid_oid
) as objects
where role_data.rolname in (
  'anon', 'authenticated', 'service_role', 'authenticator', 'postgres',
  'supabase_auth_admin'
)
order by role_data.rolname;

select
  proc.oid::regprocedure as function_signature,
  pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
  proc.prosecdef as security_definer,
  proc.proconfig as function_settings,
  proc.proacl as explicit_function_acl,
  coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    as function_acl_including_defaults
from pg_catalog.pg_proc as proc
where proc.oid = pg_catalog.to_regprocedure('auth.uid()');

select
  granted.rolname as granted_role,
  member.rolname as member_role,
  grantor.rolname as grantor_role,
  membership.admin_option
from pg_catalog.pg_auth_members as membership
join pg_catalog.pg_roles as granted on granted.oid = membership.roleid
join pg_catalog.pg_roles as member on member.oid = membership.member
join pg_catalog.pg_roles as grantor on grantor.oid = membership.grantor
where granted.rolname in (
    'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_auth_admin'
  )
   or member.rolname in (
    'anon', 'authenticated', 'service_role', 'authenticator', 'supabase_auth_admin'
  )
order by granted.rolname, member.rolname;

-- Direct or transitive role memberships for each relevant subject role.
-- This complements the direct pg_auth_members rows above.
select
  member_role.rolname as subject_role,
  granted_role.rolname as effective_member_of,
  granted_role.rolsuper as target_is_superuser,
  granted_role.rolbypassrls as target_bypasses_rls
from pg_catalog.pg_roles as member_role
cross join pg_catalog.pg_roles as granted_role
where member_role.rolname in (
    'anon', 'authenticated', 'service_role', 'authenticator', 'postgres',
    'supabase_auth_admin'
  )
  and member_role.oid <> granted_role.oid
  and pg_catalog.pg_has_role(member_role.oid, granted_role.oid, 'MEMBER')
order by member_role.rolname, granted_role.rolname;

select
  api_role.rolname as api_role,
  api_role.rolsuper as is_superuser,
  api_role.rolbypassrls as bypasses_rls,
  privileged_role.rolname as inherited_privileged_role
from pg_catalog.pg_roles as api_role
left join pg_catalog.pg_roles as privileged_role
  on (privileged_role.rolsuper or privileged_role.rolbypassrls)
  and pg_catalog.pg_has_role(api_role.oid, privileged_role.oid, 'MEMBER')
where api_role.rolname in ('anon', 'authenticated', 'authenticator')
  and (
    api_role.rolsuper
    or api_role.rolbypassrls
    or privileged_role.oid is not null
  )
order by api_role.rolname, privileged_role.rolname;

-- 2. Profile-named relations/indexes and helper-schema objects across all
-- non-system schemas, including the exact objects named by the migration.
select
  namespace.nspname as schema_name,
  relation.relname as object_name,
  relation.relkind as object_kind,
  pg_catalog.pg_get_userbyid(relation.relowner) as owner_name,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname not in ('pg_catalog', 'information_schema')
  and (relation.relname ilike '%profile%'
       or namespace.nspname = 'indiana_internal')
order by namespace.nspname, relation.relname;

select
  table_namespace.nspname as table_schema,
  table_relation.relname as table_name,
  index_relation.relname as index_name,
  index_data.indisprimary as is_primary,
  index_data.indisunique as is_unique,
  index_data.indisvalid as is_valid,
  pg_catalog.pg_get_indexdef(index_relation.oid) as index_definition
from pg_catalog.pg_index as index_data
join pg_catalog.pg_class as table_relation
  on table_relation.oid = index_data.indrelid
join pg_catalog.pg_namespace as table_namespace
  on table_namespace.oid = table_relation.relnamespace
join pg_catalog.pg_class as index_relation
  on index_relation.oid = index_data.indexrelid
where table_namespace.nspname not in ('pg_catalog', 'information_schema')
  and (table_relation.relname ilike '%profile%'
       or index_relation.relname ilike '%profile%')
order by index_relation.relname;

select
  constraint_data.conname as constraint_name,
  constraint_data.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_data.oid, false) as definition,
  constraint_data.convalidated as is_validated
from pg_catalog.pg_constraint as constraint_data
join pg_catalog.pg_class as relation on relation.oid = constraint_data.conrelid
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname not in ('pg_catalog', 'information_schema')
  and relation.relname ilike '%profile%'
order by constraint_data.conname;

-- The foreign-key target must have a single-column primary-key/unique
-- constraint or a valid, non-partial unique index on auth.users(id).
select
  constraint_data.conname as constraint_name,
  constraint_data.contype as constraint_type,
  pg_catalog.pg_get_constraintdef(constraint_data.oid, false) as definition,
  constraint_data.convalidated as is_validated
from pg_catalog.pg_constraint as constraint_data
where constraint_data.conrelid = pg_catalog.to_regclass('auth.users')
  and constraint_data.contype in ('p', 'u')
order by constraint_data.conname;

select
  index_relation.relname as index_name,
  index_data.indisprimary as is_primary,
  index_data.indisunique as is_unique,
  index_data.indisvalid as is_valid,
  index_data.indisready as is_ready,
  index_data.indpred is null as is_not_partial,
  index_data.indexprs is null as has_no_expressions,
  pg_catalog.pg_get_indexdef(index_relation.oid) as index_definition
from pg_catalog.pg_index as index_data
join pg_catalog.pg_class as table_relation
  on table_relation.oid = index_data.indrelid
join pg_catalog.pg_class as index_relation
  on index_relation.oid = index_data.indexrelid
where index_data.indrelid = pg_catalog.to_regclass('auth.users')
  and index_data.indisunique
order by index_relation.relname;

select
  namespace.nspname as schema_name,
  relation.relname as table_name,
  pg_catalog.pg_get_userbyid(relation.relowner) as table_owner,
  relation.relrowsecurity as rls_enabled,
  relation.relforcerowsecurity as rls_forced,
  relation.relacl as explicit_table_acl
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname = 'auth'
  and relation.relname = 'users';

select
  column_data.table_schema,
  column_data.table_name,
  column_data.column_name,
  column_data.data_type,
  column_data.is_nullable,
  column_data.column_default,
  column_data.character_maximum_length
from information_schema.columns as column_data
where column_data.table_schema not in ('pg_catalog', 'information_schema')
  and column_data.table_name ilike '%profile%'
order by column_data.ordinal_position;

select
  namespace.nspname as schema_name,
  pg_catalog.pg_get_userbyid(namespace.nspowner) as owner_name,
  namespace.nspacl::text as explicit_acl,
  case when anon_role.oid is null then null
    else pg_catalog.has_schema_privilege(anon_role.oid, namespace.oid, 'USAGE')
  end as anon_usage,
  case when authenticated_role.oid is null then null
    else pg_catalog.has_schema_privilege(authenticated_role.oid, namespace.oid, 'USAGE')
  end as authenticated_usage,
  case when authenticator_role.oid is null then null
    else pg_catalog.has_schema_privilege(authenticator_role.oid, namespace.oid, 'USAGE')
  end as authenticator_usage,
  case when service_role.oid is null then null
    else pg_catalog.has_schema_privilege(service_role.oid, namespace.oid, 'USAGE')
  end as service_role_usage
from pg_catalog.pg_namespace as namespace
left join pg_catalog.pg_roles as anon_role on anon_role.rolname = 'anon'
left join pg_catalog.pg_roles as authenticated_role
  on authenticated_role.rolname = 'authenticated'
left join pg_catalog.pg_roles as authenticator_role
  on authenticator_role.rolname = 'authenticator'
left join pg_catalog.pg_roles as service_role on service_role.rolname = 'service_role'
where namespace.nspname not in ('pg_catalog', 'information_schema')
order by namespace.nspname;
-- A NULL explicit_acl means PostgreSQL defaults apply; has_schema_privilege
-- above reports effective rights for the API roles.

-- 3. All non-internal auth.users triggers. Review each function and its effects;
-- the proposed migration intentionally stops if any such trigger exists.
select
  trig.oid as trigger_oid,
  trig.tgname as trigger_name,
  trig.tgenabled as enabled_state,
  trig.tgtype as trigger_type_bits,
  proc.oid::regprocedure as function_signature,
  pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
  proc.prosecdef as security_definer,
  proc.proconfig as function_settings,
  proc.proacl as explicit_function_acl,
  coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    as function_acl_including_defaults
from pg_catalog.pg_trigger as trig
join pg_catalog.pg_class as relation on relation.oid = trig.tgrelid
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
join pg_catalog.pg_proc as proc on proc.oid = trig.tgfoid
where namespace.nspname = 'auth'
  and relation.relname = 'users'
  and not trig.tgisinternal
order by trig.tgname;

-- If a specific trigger needs deeper review, use its returned OID explicitly:
-- select pg_catalog.pg_get_triggerdef(<trigger_oid>::oid, false);

-- 4. DDL event triggers can run during this migration. O means enabled for
-- origin/local sessions; D means disabled; R means replica-only; A means
-- always enabled. Review all relevant triggers and command tags for effects
-- on new schemas/tables, especially grants, policies, or other objects.
select pg_catalog.current_setting('session_replication_role')
  as session_replication_role;

select
  event_trigger.evtname as event_trigger_name,
  event_trigger.evtevent as event_name,
  event_trigger.evtenabled as enabled_state,
  event_trigger.evttags as command_tags,
  pg_catalog.pg_get_userbyid(event_trigger.evtowner) as event_trigger_owner,
  pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
  proc.oid::regprocedure as function_signature,
  proc.prosecdef as security_definer,
  proc.proconfig as function_settings,
  proc.proacl as explicit_function_acl,
  coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    as function_acl_including_defaults
from pg_catalog.pg_event_trigger as event_trigger
join pg_catalog.pg_proc as proc on proc.oid = event_trigger.evtfoid
order by event_trigger.evtname;

-- Optional: run separately in the secured SQL Editor to inspect definitions
-- for all event triggers. This can reveal sensitive literals. Review locally;
-- do not share unredacted function definitions.
-- select
--   event_trigger.evtname as event_trigger_name,
--   event_trigger.evtevent as event_name,
--   event_trigger.evtenabled as enabled_state,
--   event_trigger.evttags as command_tags,
--   pg_catalog.pg_get_userbyid(event_trigger.evtowner) as event_trigger_owner,
--   pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
--   proc.oid::regprocedure as function_signature,
--   proc.prosecdef as security_definer,
--   proc.proconfig as function_settings,
--   proc.proacl as explicit_function_acl,
--   coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
--     as function_acl_including_defaults,
--   pg_catalog.pg_get_functiondef(proc.oid) as function_definition
-- from pg_catalog.pg_event_trigger as event_trigger
-- join pg_catalog.pg_proc as proc on proc.oid = event_trigger.evtfoid
-- order by event_trigger.evtname;

-- 5. Exact migration-guard function scan: function names containing "profile"
-- or function source containing "public.profiles" or "auth.users". Source is
-- searched but not returned. This does not search function names for "user"
-- or "indiana".
select
  namespace.nspname as schema_name,
  proc.oid::regprocedure as function_signature,
  pg_catalog.pg_get_userbyid(proc.proowner) as function_owner,
  proc.prosecdef as security_definer,
  proc.proconfig as function_settings,
  proc.proacl as explicit_function_acl,
  coalesce(proc.proacl, pg_catalog.acldefault('f', proc.proowner))
    as function_acl_including_defaults
from pg_catalog.pg_proc as proc
join pg_catalog.pg_namespace as namespace on namespace.oid = proc.pronamespace
where namespace.nspname not in ('pg_catalog', 'information_schema')
  and proc.prokind in ('f', 'p')
  and (
    proc.proname ilike '%profile%'
    or proc.prosrc ilike '%public.profiles%'
    or proc.prosrc ilike '%auth.users%'
  )
order by namespace.nspname, proc.proname, proc.oid::regprocedure::text;

-- If one candidate needs body review, copy its exact signature from the
-- metadata result and retrieve only that definition in the secured console:
-- select pg_catalog.pg_get_functiondef('<exact function_signature>'::regprocedure);

-- 6. Existing RLS policies on profile-named tables, including
-- permissive/restrictive mode and their row filters.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_catalog.pg_policies
where schemaname not in ('pg_catalog', 'information_schema')
  and tablename ilike '%profile%'
order by policyname;

-- 7. Existing table and column grants. Check anon, authenticated, service_role,
-- PUBLIC, and any project-specific API roles. Do not change service_role grants
-- as part of this profile migration. This returns no rows before a table exists.
select
  'table' as privilege_scope,
  table_schema as schema_name,
  table_name,
  null::text as column_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.table_privileges
where table_schema not in ('pg_catalog', 'information_schema')
  and table_name ilike '%profile%'
union all
select
  'column' as privilege_scope,
  table_schema as schema_name,
  table_name,
  column_name,
  grantee,
  privilege_type,
  is_grantable
from information_schema.column_privileges
where table_schema not in ('pg_catalog', 'information_schema')
  and table_name ilike '%profile%'
order by privilege_scope, grantee, privilege_type, column_name;

-- 8. Default grants applied to future objects. Global defaults and
-- public-schema defaults may affect table/function ACLs created by postgres.
select
  case when defaults.defaclnamespace = 0 then '(global)' else namespace.nspname end
    as schema_name,
  pg_catalog.pg_get_userbyid(defaults.defaclrole) as object_creator_role,
  defaults.defaclobjtype as object_type,
  defaults.defaclacl as default_acl
from pg_catalog.pg_default_acl as defaults
left join pg_catalog.pg_namespace as namespace
  on namespace.oid = defaults.defaclnamespace
where defaults.defaclnamespace = 0
   or namespace.nspname in ('public', 'indiana_internal')
order by schema_name, object_creator_role, object_type;

-- 9. Search visible non-system catalogs for likely migration-history objects.
-- This is only a catalog search; an external migration workflow may not store
-- history in this database.
select
  namespace.nspname as schema_name,
  relation.relname as relation_name,
  relation.relkind as relation_kind,
  pg_catalog.pg_get_userbyid(relation.relowner) as owner_name
from pg_catalog.pg_class as relation
join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
where namespace.nspname not in ('pg_catalog', 'information_schema')
  and (
    namespace.nspname ilike '%migration%'
    or relation.relname ilike '%migration%'
    or relation.relname in ('schema_migrations', 'migrations')
  )
order by namespace.nspname, relation.relname;

-- Standard Supabase migration-history presence. If the relation exists,
-- inspect it separately; if absent, that alone does not prove no workflow exists.
select pg_catalog.to_regclass('supabase_migrations.schema_migrations')
  as migration_history_relation;

-- If the preceding query confirms the relation exists, run this separately:
-- select version, name from supabase_migrations.schema_migrations order by version;
