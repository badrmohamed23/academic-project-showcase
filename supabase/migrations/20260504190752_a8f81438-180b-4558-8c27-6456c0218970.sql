-- Task status enum and deadline
DO $$ BEGIN
  CREATE TYPE public.task_status AS ENUM ('pending','postponed','completed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS status public.task_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS due_date date;

-- Backfill from is_completed
UPDATE public.project_tasks SET status = 'completed' WHERE is_completed = TRUE AND status = 'pending';

-- Keep is_completed in sync with status
CREATE OR REPLACE FUNCTION public.sync_task_completed()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.is_completed := (NEW.status = 'completed');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_task_completed ON public.project_tasks;
CREATE TRIGGER trg_sync_task_completed
BEFORE INSERT OR UPDATE OF status ON public.project_tasks
FOR EACH ROW EXECUTE FUNCTION public.sync_task_completed();

CREATE OR REPLACE FUNCTION public.project_task_update_status_only(
  _id uuid,
  _status public.task_status,
  _is_completed boolean,
  _assignee_id uuid,
  _project_id uuid,
  _student_id uuid,
  _title text,
  _description text,
  _priority text,
  _position integer,
  _due_date date,
  _created_at timestamptz
) RETURNS boolean LANGUAGE plpgsql STABLE AS $$
DECLARE
  old_row public.project_tasks%ROWTYPE;
BEGIN
  SELECT * INTO old_row FROM public.project_tasks WHERE id = _id;
  IF old_row IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN old_row.assignee_id = _assignee_id
    AND old_row.project_id = _project_id
    AND old_row.student_id = _student_id
    AND old_row.title = _title
    AND old_row.description = _description
    AND old_row.priority = _priority
    AND old_row.position = _position
    AND old_row.due_date = _due_date
    AND old_row.created_at = _created_at;
END $$;

-- Allow assigned collaborators to update ONLY the status of their task
DROP POLICY IF EXISTS tasks_assignee_update_status ON public.project_tasks;
CREATE POLICY tasks_assignee_update_status
ON public.project_tasks FOR UPDATE
TO authenticated
USING (assignee_id = auth.uid() AND public.is_project_collaborator(project_id, auth.uid()))
WITH CHECK (
  assignee_id = auth.uid()
  AND public.is_project_collaborator(project_id, auth.uid())
  AND public.project_task_update_status_only(id, status, is_completed, assignee_id, project_id, student_id, title, description, priority, position, due_date, created_at)
);

-- Allow collaborators to read tasks of projects they collaborate on (already exists tasks_collab_select; ensure ok)
