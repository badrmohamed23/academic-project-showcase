
DROP POLICY IF EXISTS "project_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "project_videos_public_read" ON storage.objects;

CREATE POLICY "project_files_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-files');

CREATE POLICY "project_videos_auth_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'project-videos');
