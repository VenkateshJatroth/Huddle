-- Database Cleanup Migration
-- Cleans up orphaned test records, legacy temporary data, and maintains database integrity.

-- 1. Remove orphaned follow relationships if either participant no longer exists
DELETE FROM public.follow_relationships
WHERE follower_id NOT IN (SELECT id FROM auth.users)
   OR following_id NOT IN (SELECT id FROM auth.users);

-- 2. Remove orphaned notifications where user_id does not exist in auth.users
DELETE FROM public.notifications
WHERE user_id NOT IN (SELECT id::text FROM auth.users);

-- 3. Remove orphaned posts and replies where author no longer exists
DELETE FROM public.post_replies
WHERE author_id NOT IN (SELECT id FROM auth.users);

DELETE FROM public.posts
WHERE author_id NOT IN (SELECT id FROM auth.users);

-- 4. Remove orphaned direct messages
DELETE FROM public.direct_messages
WHERE sender_id NOT IN (SELECT id FROM auth.users)
   OR (receiver_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' AND receiver_id::uuid NOT IN (SELECT id FROM auth.users));

-- 5. Clean legacy messages table if obsolete
TRUNCATE TABLE public.messages;

