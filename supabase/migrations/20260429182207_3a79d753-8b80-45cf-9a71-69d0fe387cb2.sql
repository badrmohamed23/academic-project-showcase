
-- Allow employers to read profile rows of students who applied to their internships
CREATE POLICY profiles_employer_read_applicants
ON public.profiles FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.applications a
    JOIN public.internships i ON i.id = a.internship_id
    WHERE a.student_id = profiles.id AND i.employer_id = auth.uid()
  )
);

-- Allow any authenticated user to discover other users for messaging (basic identity only).
-- Profiles already exposes only name/email/company; sensitive data lives in other tables.
CREATE POLICY profiles_authenticated_directory
ON public.profiles FOR SELECT
TO authenticated
USING (true);

-- Drop the old narrow policy now that the directory policy supersedes it
DROP POLICY IF EXISTS profiles_self_or_admin_select ON public.profiles;
