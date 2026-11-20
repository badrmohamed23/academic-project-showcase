
-- 1. Add columns to projects table
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'course',
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS video_path TEXT;

-- Validate kind via trigger (avoid CHECK)
CREATE OR REPLACE FUNCTION public.validate_project_kind()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind NOT IN ('course','bachelor') THEN
    RAISE EXCEPTION 'Invalid project kind: %', NEW.kind;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS validate_project_kind_trigger ON public.projects;
CREATE TRIGGER validate_project_kind_trigger
  BEFORE INSERT OR UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_kind();

-- 2. Thesis drafts table
CREATE TABLE IF NOT EXISTS public.thesis_drafts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  file_path TEXT NOT NULL,
  label TEXT,
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.thesis_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "thesis_owner_all" ON public.thesis_drafts
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));

CREATE POLICY "thesis_admin_all" ON public.thesis_drafts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Allow others to view ONLY the final thesis draft if the parent project is public
CREATE POLICY "thesis_final_public_select" ON public.thesis_drafts
  FOR SELECT TO authenticated
  USING (
    is_final = TRUE
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = thesis_drafts.project_id
        AND p.is_active = TRUE
    )
  );

CREATE INDEX IF NOT EXISTS idx_thesis_drafts_project ON public.thesis_drafts(project_id);

-- 3. student_profiles additions
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS semester INTEGER,
  ADD COLUMN IF NOT EXISTS graduating_year INTEGER,
  ADD COLUMN IF NOT EXISTS linkedin_url TEXT;

-- 4. Storage buckets for project files / videos / thesis drafts
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-files', 'project-files', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('project-videos', 'project-videos', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('thesis-drafts', 'thesis-drafts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: project-files (public read, owner write)
CREATE POLICY "project_files_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-files');

CREATE POLICY "project_files_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_files_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_files_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-files' AND auth.uid()::text = (storage.foldername(name))[1]);

-- project-videos (public read, owner write)
CREATE POLICY "project_videos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-videos');

CREATE POLICY "project_videos_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'project-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_videos_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'project-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "project_videos_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'project-videos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- thesis-drafts (private; owner read/write; admin read)
CREATE POLICY "thesis_drafts_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'thesis-drafts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "thesis_drafts_admin_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'thesis-drafts' AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "thesis_drafts_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'thesis-drafts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "thesis_drafts_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'thesis-drafts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "thesis_drafts_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'thesis-drafts' AND auth.uid()::text = (storage.foldername(name))[1]);
