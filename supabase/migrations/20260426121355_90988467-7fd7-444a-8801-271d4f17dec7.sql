-- Student favorites: students can favorite projects and portfolios (other students)
CREATE TABLE public.student_favorites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  kind TEXT NOT NULL,
  target_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (student_id, kind, target_id)
);

CREATE OR REPLACE FUNCTION public.validate_student_favorite_kind()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.kind NOT IN ('project','portfolio') THEN
    RAISE EXCEPTION 'Invalid favorite kind: %', NEW.kind;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER student_favorites_validate_kind
BEFORE INSERT OR UPDATE ON public.student_favorites
FOR EACH ROW EXECUTE FUNCTION public.validate_student_favorite_kind();

ALTER TABLE public.student_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sf_owner_all" ON public.student_favorites
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));

CREATE POLICY "sf_admin_all" ON public.student_favorites
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Completed internships: stored separately so we can mock "completed" without altering applications
CREATE TABLE public.completed_internships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL,
  company_name TEXT NOT NULL,
  title TEXT NOT NULL,
  duration TEXT,
  completed_on DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.completed_internships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ci_select_all" ON public.completed_internships
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ci_owner_modify" ON public.completed_internships
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());

CREATE POLICY "ci_admin_all" ON public.completed_internships
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));