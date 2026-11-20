-- Create project_tasks table
CREATE TABLE public.project_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Validate priority via trigger (immutable-safe)
CREATE OR REPLACE FUNCTION public.validate_task_priority()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.priority NOT IN ('low','medium','high','urgent') THEN
    RAISE EXCEPTION 'Invalid priority: %', NEW.priority;
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_validate_task_priority
BEFORE INSERT OR UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.validate_task_priority();

CREATE TRIGGER trg_project_tasks_updated_at
BEFORE UPDATE ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_project_tasks_project ON public.project_tasks(project_id);
CREATE INDEX idx_project_tasks_student ON public.project_tasks(student_id);

-- RLS
ALTER TABLE public.project_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tasks_admin_all ON public.project_tasks
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY tasks_owner_all ON public.project_tasks
  FOR ALL TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (student_id = auth.uid() AND has_role(auth.uid(), 'student'::app_role));
