-- Add admin-level active state to projects.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_admin_active BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE public.projects
  SET is_admin_active = TRUE
  WHERE is_admin_active IS NULL;

-- Ensure flagged projects are deactivated at the admin level as well.
CREATE OR REPLACE FUNCTION public.on_project_flagged()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_student UUID;
BEGIN
  UPDATE public.projects
    SET is_flagged = TRUE,
        is_active = FALSE,
        is_admin_active = FALSE
    WHERE id = NEW.project_id
    RETURNING student_id INTO v_student;

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
