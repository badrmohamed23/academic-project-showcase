-- Update application status default from 'nominated' to 'applied'
ALTER TABLE public.applications ALTER COLUMN status SET DEFAULT 'applied';

-- Update the validation function to include 'applied' status
CREATE OR REPLACE FUNCTION public.validate_application_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('applied','accepted','rejected') THEN
    RAISE EXCEPTION 'Invalid application status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;