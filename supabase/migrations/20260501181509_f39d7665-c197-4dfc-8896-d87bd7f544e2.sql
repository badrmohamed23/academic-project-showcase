-- Add in_portfolio to projects (default false; existing public projects keep showing in My Projects, but only those toggled in_portfolio appear in the My Portfolio tab and on public portfolio)
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS in_portfolio boolean NOT NULL DEFAULT false;

-- Add assignee for tasks (only one collaborator can hold a task)
ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS assignee_id uuid;
CREATE INDEX IF NOT EXISTS idx_project_tasks_assignee ON public.project_tasks(assignee_id);

-- Allow project owner OR accepted collaborators to view tasks of projects they collaborate on
DROP POLICY IF EXISTS tasks_collab_select ON public.project_tasks;
CREATE POLICY tasks_collab_select ON public.project_tasks
  FOR SELECT TO authenticated
  USING (
    student_id = auth.uid()
    OR is_project_collaborator(project_id, auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
  );
