ALTER TABLE public.student_profiles DROP CONSTRAINT student_profiles_id_fkey;
ALTER TABLE public.student_profiles
  ADD COLUMN first_name TEXT,
  ADD COLUMN last_name TEXT,
  ADD COLUMN email TEXT;