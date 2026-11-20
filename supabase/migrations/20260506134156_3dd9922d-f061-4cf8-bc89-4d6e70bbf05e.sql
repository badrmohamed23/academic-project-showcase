-- Allow employers to use student_favorites too (rename intent: user_favorites)
DROP POLICY IF EXISTS sf_owner_all ON public.student_favorites;
CREATE POLICY sf_owner_all
  ON public.student_favorites
  FOR ALL
  TO authenticated
  USING (student_id = auth.uid())
  WITH CHECK (
    student_id = auth.uid()
    AND (has_role(auth.uid(), 'student'::app_role) OR has_role(auth.uid(), 'employer'::app_role))
  );