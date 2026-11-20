
-- =========================================
-- ENUM: app_role
-- =========================================
CREATE TYPE public.app_role AS ENUM ('student', 'instructor', 'employer', 'admin');

CREATE TYPE public.link_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE public.link_action AS ENUM ('link', 'unlink');
CREATE TYPE public.appeal_status AS ENUM ('pending', 'approved', 'rejected');

-- =========================================
-- profiles
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  first_name TEXT,
  last_name TEXT,
  company_name TEXT,
  email TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- user_roles (security: separate table)
-- =========================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- =========================================
-- has_role function (security definer to avoid RLS recursion)
-- =========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_user(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_active FROM public.profiles WHERE id = _user_id), TRUE);
$$;

-- =========================================
-- handle_new_user trigger -> creates profile + role
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  meta_role TEXT;
  resolved_role public.app_role;
BEGIN
  meta_role := COALESCE(NEW.raw_user_meta_data->>'role', 'student');

  BEGIN
    resolved_role := meta_role::public.app_role;
  EXCEPTION WHEN OTHERS THEN
    resolved_role := 'student';
  END;

  INSERT INTO public.profiles (id, email, first_name, last_name, company_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    NEW.raw_user_meta_data->>'company_name'
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, resolved_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- updated_at helper
-- =========================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- courses
-- =========================================
CREATE TABLE public.courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER courses_updated_at BEFORE UPDATE ON public.courses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- instructor_courses (active links)
-- =========================================
CREATE TABLE public.instructor_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (instructor_id, course_id)
);
ALTER TABLE public.instructor_courses ENABLE ROW LEVEL SECURITY;

-- =========================================
-- instructor_link_requests
-- =========================================
CREATE TABLE public.instructor_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instructor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  action public.link_action NOT NULL,
  status public.link_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE public.instructor_link_requests ENABLE ROW LEVEL SECURITY;

-- =========================================
-- employer_profiles
-- =========================================
CREATE TABLE public.employer_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  bio TEXT,
  address TEXT,
  contact_info TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.employer_profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER employer_profiles_updated_at BEFORE UPDATE ON public.employer_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- projects
-- =========================================
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================
-- project_flags
-- =========================================
CREATE TABLE public.project_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  flagged_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE
);
ALTER TABLE public.project_flags ENABLE ROW LEVEL SECURITY;

-- Auto-deactivate the project when flagged
CREATE OR REPLACE FUNCTION public.on_project_flagged()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID;
BEGIN
  UPDATE public.projects
    SET is_flagged = TRUE, is_active = FALSE
    WHERE id = NEW.project_id
    RETURNING student_id INTO v_student;

  -- Notify student
  INSERT INTO public.notifications (user_id, type, title, body, link_url)
  VALUES (
    v_student,
    'project_flagged',
    'Your project was flagged',
    'Reason: ' || NEW.reason,
    '/dashboard/projects'
  );

  RETURN NEW;
END;
$$;

-- =========================================
-- project_appeals
-- =========================================
CREATE TABLE public.project_appeals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  flag_id UUID REFERENCES public.project_flags(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  status public.appeal_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);
ALTER TABLE public.project_appeals ENABLE ROW LEVEL SECURITY;

-- =========================================
-- notifications
-- =========================================
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX notifications_user_idx ON public.notifications(user_id, is_read, created_at DESC);

-- Trigger after flag insert
CREATE TRIGGER trg_on_project_flagged
AFTER INSERT ON public.project_flags
FOR EACH ROW EXECUTE FUNCTION public.on_project_flagged();

-- Notify all admins on instructor link request
CREATE OR REPLACE FUNCTION public.on_link_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link_url)
  SELECT ur.user_id, 'link_request', 'New instructor course link request',
         'Action: ' || NEW.action::TEXT, '/dashboard/link-requests'
  FROM public.user_roles ur WHERE ur.role = 'admin';
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_on_link_request
AFTER INSERT ON public.instructor_link_requests
FOR EACH ROW EXECUTE FUNCTION public.on_link_request();

-- =========================================
-- RLS POLICIES
-- =========================================

-- profiles
CREATE POLICY "profiles_self_or_admin_select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_admin_update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- user_roles
CREATE POLICY "user_roles_self_select" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- courses
CREATE POLICY "courses_authenticated_select" ON public.courses
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "courses_admin_all" ON public.courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- instructor_courses
CREATE POLICY "instructor_courses_select" ON public.instructor_courses
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "instructor_courses_admin_all" ON public.instructor_courses
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- instructor_link_requests
CREATE POLICY "ilr_self_select" ON public.instructor_link_requests
  FOR SELECT TO authenticated
  USING (instructor_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "ilr_instructor_insert" ON public.instructor_link_requests
  FOR INSERT TO authenticated
  WITH CHECK (instructor_id = auth.uid() AND public.has_role(auth.uid(), 'instructor'));
CREATE POLICY "ilr_admin_update" ON public.instructor_link_requests
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- employer_profiles
CREATE POLICY "employer_profiles_public_select" ON public.employer_profiles
  FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "employer_profiles_self_all" ON public.employer_profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND public.has_role(auth.uid(), 'employer'));

-- projects
CREATE POLICY "projects_select_active_or_owner_or_admin" ON public.projects
  FOR SELECT TO authenticated
  USING (
    is_active = TRUE
    OR student_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'instructor')
    OR public.is_project_collaborator(id, auth.uid())
  );
CREATE POLICY "projects_student_insert" ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));
CREATE POLICY "projects_student_update_own" ON public.projects
  FOR UPDATE TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid());
CREATE POLICY "projects_collaborator_update_limited" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.is_project_collaborator(id, auth.uid()))
  WITH CHECK (
    title = OLD.title
    AND link = OLD.link
    AND course_id = OLD.course_id
    AND kind = OLD.kind
    AND programming_languages = OLD.programming_languages
    AND student_id = OLD.student_id
    AND is_active = OLD.is_active
    AND is_flagged = OLD.is_flagged
    AND in_portfolio = OLD.in_portfolio
    AND created_at = OLD.created_at
  );
CREATE POLICY "projects_admin_update" ON public.projects
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "projects_student_delete" ON public.projects
  FOR DELETE TO authenticated USING (student_id = auth.uid());

-- project_flags
CREATE POLICY "flags_select" ON public.project_flags
  FOR SELECT TO authenticated
  USING (
    flagged_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.projects p WHERE p.id = project_id AND p.student_id = auth.uid())
  );
CREATE POLICY "flags_insert" ON public.project_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    flagged_by = auth.uid()
    AND (public.has_role(auth.uid(), 'instructor') OR public.has_role(auth.uid(), 'admin'))
  );

-- project_appeals
CREATE POLICY "appeals_select" ON public.project_appeals
  FOR SELECT TO authenticated
  USING (student_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "appeals_student_insert" ON public.project_appeals
  FOR INSERT TO authenticated
  WITH CHECK (student_id = auth.uid() AND public.has_role(auth.uid(), 'student'));
CREATE POLICY "appeals_admin_update" ON public.project_appeals
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- notifications
CREATE POLICY "notifications_self_select" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notifications_self_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
