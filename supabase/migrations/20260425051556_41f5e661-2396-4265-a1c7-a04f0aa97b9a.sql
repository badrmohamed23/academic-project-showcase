-- Internships
CREATE TABLE public.internships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  details TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  programming_languages TEXT[] NOT NULL DEFAULT '{}',
  duration TEXT,
  deadline DATE,
  hiring_status TEXT NOT NULL DEFAULT 'hiring',
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_internship_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.hiring_status NOT IN ('hiring','filled') THEN
    RAISE EXCEPTION 'Invalid hiring_status: %', NEW.hiring_status;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_internship_status
BEFORE INSERT OR UPDATE ON public.internships
FOR EACH ROW EXECUTE FUNCTION public.validate_internship_status();

CREATE TRIGGER trg_internships_updated_at
BEFORE UPDATE ON public.internships
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.internships ENABLE ROW LEVEL SECURITY;

CREATE POLICY internships_select_all ON public.internships FOR SELECT TO authenticated USING (true);
CREATE POLICY internships_employer_insert ON public.internships FOR INSERT TO authenticated
  WITH CHECK (employer_id = auth.uid() AND has_role(auth.uid(),'employer'));
CREATE POLICY internships_employer_update ON public.internships FOR UPDATE TO authenticated
  USING (employer_id = auth.uid()) WITH CHECK (employer_id = auth.uid());
CREATE POLICY internships_employer_delete ON public.internships FOR DELETE TO authenticated
  USING (employer_id = auth.uid());
CREATE POLICY internships_admin_all ON public.internships FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Student profiles (extra info: major, skills)
CREATE TABLE public.student_profiles (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  major TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}',
  contributor_score INTEGER NOT NULL DEFAULT 0,
  is_mock BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_student_profiles_updated_at
BEFORE UPDATE ON public.student_profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_select_all ON public.student_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY sp_self_upsert ON public.student_profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY sp_self_update ON public.student_profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY sp_admin_all ON public.student_profiles FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Applications
CREATE TABLE public.applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  internship_id UUID NOT NULL REFERENCES public.internships(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_letter TEXT,
  status TEXT NOT NULL DEFAULT 'applied',
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (internship_id, student_id)
);

CREATE OR REPLACE FUNCTION public.validate_application_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('applied','accepted','rejected') THEN
    RAISE EXCEPTION 'Invalid application status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_validate_application_status
BEFORE INSERT OR UPDATE ON public.applications
FOR EACH ROW EXECUTE FUNCTION public.validate_application_status();

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Employer who owns the internship can see/update; the student can see their own application
CREATE POLICY apps_select ON public.applications FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.internships i WHERE i.id = internship_id AND i.employer_id = auth.uid())
    OR has_role(auth.uid(),'admin')
  );
CREATE POLICY apps_student_insert ON public.applications FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND has_role(auth.uid(),'student'));
CREATE POLICY apps_employer_update ON public.applications FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.internships i WHERE i.id = internship_id AND i.employer_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.internships i WHERE i.id = internship_id AND i.employer_id = auth.uid()));
CREATE POLICY apps_admin_all ON public.applications FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

-- Favorites (employer favoriting a student)
CREATE TABLE public.favorites (
  employer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employer_id, student_id)
);
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY fav_employer_all ON public.favorites FOR ALL TO authenticated
  USING (employer_id = auth.uid()) WITH CHECK (employer_id = auth.uid() AND has_role(auth.uid(),'employer'));
CREATE POLICY fav_admin_all ON public.favorites FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE INDEX idx_internships_employer ON public.internships(employer_id);
CREATE INDEX idx_apps_internship ON public.applications(internship_id);
CREATE INDEX idx_apps_student ON public.applications(student_id);
CREATE INDEX idx_fav_employer ON public.favorites(employer_id);