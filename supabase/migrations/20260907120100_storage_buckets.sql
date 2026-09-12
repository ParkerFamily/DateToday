-- =============================================================================
-- date:today — storage buckets + policies
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'profile-photos',
    'profile-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic']::text[]
  ),
  (
    'profile-videos',
    'profile-videos',
    false,
    52428800,
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']::text[]
  ),
  (
    'tonight-videos',
    'tonight-videos',
    false,
    52428800,
    ARRAY['video/mp4', 'video/quicktime', 'video/webm']::text[]
  ),
  (
    'chat-media',
    'chat-media',
    false,
    10485760,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'video/mp4']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  public = EXCLUDED.public;

-- Profile photos: owner write; authenticated read
CREATE POLICY "profile_photos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-photos');

CREATE POLICY "profile_photos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_photos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Profile videos: owner write; authenticated read
CREATE POLICY "profile_videos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'profile-videos');

CREATE POLICY "profile_videos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_videos_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'profile-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "profile_videos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'profile-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Tonight videos: owner write; authenticated read (discovery via signed URLs / RPC)
CREATE POLICY "tonight_videos_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tonight-videos');

CREATE POLICY "tonight_videos_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tonight-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "tonight_videos_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tonight-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'tonight-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "tonight_videos_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tonight-videos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Chat media: owner write; members of shared conversation can read
-- Path convention: chat-media/{conversation_id}/{user_id}/{filename}
CREATE POLICY "chat_media_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.conversation_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "chat_media_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.conversation_members cm
      WHERE cm.user_id = auth.uid()
        AND cm.conversation_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "chat_media_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

CREATE POLICY "chat_media_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
