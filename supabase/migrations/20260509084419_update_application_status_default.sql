-- Update application status default from 'nominated' to 'applied'
-- and update the validation function to include 'applied' status

-- First, update the validation function to accept 'applied' status
CREATE OR REPLACE FUNCTION public.validate_application_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('applied','accepted','rejected') THEN
    RAISE EXCEPTION 'Invalid application status: %', NEW.status;
  END IF;
  RETURN NEW;
END; $$;

-- Update the default status for the applications table
ALTER TABLE public.applications
  ALTER COLUMN status SET DEFAULT 'applied';

-- Update any existing 'nominated' statuses to 'applied'
UPDATE public.applications
  SET status = 'applied'
  WHERE status = 'nominated';