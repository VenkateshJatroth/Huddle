-- Migration: Storage bucket for voice intros and profile handle improvements
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-intros',
  'voice-intros',
  true,
  10485760,
  ARRAY['audio/m4a', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/wav', 'audio/webm', 'audio/ogg', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET public = true;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access for Voice Intros'
  ) THEN
    CREATE POLICY "Public Access for Voice Intros"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'voice-intros');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated users can upload voice intros'
  ) THEN
    CREATE POLICY "Authenticated users can upload voice intros"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'voice-intros');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can update their voice intros'
  ) THEN
    CREATE POLICY "Users can update their voice intros"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (bucket_id = 'voice-intros');
  END IF;
END $$;

