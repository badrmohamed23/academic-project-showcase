-- Add verification + location + avatar fields
ALTER TABLE public.employer_profiles
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_address TEXT,
  ADD COLUMN IF NOT EXISTS tax_document_path TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

-- Constrain status values via trigger (avoid CHECK for flexibility)
CREATE OR REPLACE FUNCTION public.validate_employer_verification_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.verification_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'Invalid verification_status: %', NEW.verification_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_employer_verification ON public.employer_profiles;
CREATE TRIGGER trg_validate_employer_verification
BEFORE INSERT OR UPDATE ON public.employer_profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_employer_verification_status();

-- Avatar URL on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Helper: is employer approved?
CREATE OR REPLACE FUNCTION public.is_employer_approved(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT verification_status = 'approved' FROM public.employer_profiles WHERE id = _user_id),
    FALSE
  );
$$;

-- Allow admins to view/update employer profiles for verification
DROP POLICY IF EXISTS employer_profiles_admin_all ON public.employer_profiles;
CREATE POLICY employer_profiles_admin_all ON public.employer_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Notify employer when approved/rejected
CREATE OR REPLACE FUNCTION public.on_employer_verification_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NEW.verification_status IN ('approved','rejected') THEN
    INSERT INTO public.notifications (user_id, type, title, body, link_url)
    VALUES (
      NEW.id,
      'employer_verification',
      CASE WHEN NEW.verification_status = 'approved'
           THEN 'Your company was approved'
           ELSE 'Your company verification was rejected' END,
      COALESCE(NEW.verification_notes, ''),
      '/dashboard/company'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employer_verification_change ON public.employer_profiles;
CREATE TRIGGER trg_employer_verification_change
AFTER UPDATE ON public.employer_profiles
FOR EACH ROW EXECUTE FUNCTION public.on_employer_verification_change();

-- Notify admins when a new employer registers / submits docs
CREATE OR REPLACE FUNCTION public.on_employer_profile_created()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link_url)
  SELECT ur.user_id, 'employer_pending', 'New employer pending verification',
         'A new employer submitted documents for review.', '/dashboard/employer-verification'
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employer_profile_created ON public.employer_profiles;
CREATE TRIGGER trg_employer_profile_created
AFTER INSERT ON public.employer_profiles
FOR EACH ROW EXECUTE FUNCTION public.on_employer_profile_created();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('employer-documents', 'employer-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Avatars: public read, owner write under their uid folder
DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
CREATE POLICY "avatars_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "avatars_owner_insert" ON storage.objects;
CREATE POLICY "avatars_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_owner_update" ON storage.objects;
CREATE POLICY "avatars_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "avatars_owner_delete" ON storage.objects;
CREATE POLICY "avatars_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Employer documents: owner + admin read; owner upload
DROP POLICY IF EXISTS "empdocs_owner_read" ON storage.objects;
CREATE POLICY "empdocs_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'employer-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );

DROP POLICY IF EXISTS "empdocs_owner_insert" ON storage.objects;
CREATE POLICY "empdocs_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'employer-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "empdocs_owner_update" ON storage.objects;
CREATE POLICY "empdocs_owner_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'employer-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "empdocs_admin_delete" ON storage.objects;
CREATE POLICY "empdocs_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'employer-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
    )
  );