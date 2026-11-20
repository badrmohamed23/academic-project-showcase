-- Allow authenticated users to read role rows (needed for instructor directory & collaborator search)
DROP POLICY IF EXISTS user_roles_self_select ON public.user_roles;
CREATE POLICY user_roles_authenticated_select
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

-- Add FK so PostgREST can embed profiles in instructor_link_requests
ALTER TABLE public.instructor_link_requests
  ADD CONSTRAINT instructor_link_requests_instructor_profile_fkey
  FOREIGN KEY (instructor_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
