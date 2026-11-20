-- 1. Add programming_languages to projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS programming_languages text[] NOT NULL DEFAULT '{}';

-- 2. Improve collaboration accepted/rejected notif to include the responder's name
CREATE OR REPLACE FUNCTION public.on_collab_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid; v_proj_title text; v_responder_name text;
BEGIN
  SELECT student_id, title INTO v_owner, v_proj_title FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.invitee_id, 'collab_invite',
      'You were invited to collaborate', 'Project: ' || v_proj_title,
      '/dashboard/invitations');
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status IN ('accepted','rejected') AND v_owner IS NOT NULL THEN
      SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')),''),
                      company_name, email, 'Someone')
        INTO v_responder_name FROM public.profiles WHERE id = NEW.invitee_id;
      PERFORM public.notify_user(v_owner, 'collab_response',
        'Collaboration ' || NEW.status || ' by ' || v_responder_name,
        'Project: ' || v_proj_title,
        '/dashboard/projects');
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 3. Notify student when their internship application is accepted/rejected
CREATE OR REPLACE FUNCTION public.on_application_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_title text; v_company text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('accepted','rejected') THEN
    SELECT i.title, COALESCE(p.company_name, p.email, 'a company')
      INTO v_title, v_company
      FROM public.internships i
      LEFT JOIN public.profiles p ON p.id = i.employer_id
      WHERE i.id = NEW.internship_id;
    PERFORM public.notify_user(NEW.student_id, 'application_status',
      'Application ' || NEW.status,
      'Your application to "' || COALESCE(v_title,'an internship') || '" at ' || v_company || ' was ' || NEW.status || '.',
      '/dashboard/internships');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_on_application_status_change ON public.applications;
CREATE TRIGGER trg_on_application_status_change
  AFTER UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.on_application_status_change();