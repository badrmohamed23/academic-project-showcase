-- ============= 1. INSTRUCTOR PROFILES =============
CREATE TABLE public.instructor_profiles (
  id uuid PRIMARY KEY,
  bio text,
  research_interests text[] NOT NULL DEFAULT '{}',
  education jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.instructor_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY ip_select_all ON public.instructor_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY ip_self_upsert ON public.instructor_profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY ip_self_update ON public.instructor_profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY ip_self_delete ON public.instructor_profiles FOR DELETE TO authenticated USING (id = auth.uid());
CREATE POLICY ip_admin_all ON public.instructor_profiles FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_ip_set_updated_at BEFORE UPDATE ON public.instructor_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= 2. NOTIFICATION PREFERENCES =============
CREATE TABLE public.notification_preferences (
  user_id uuid PRIMARY KEY,
  notifications_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY np_self_select ON public.notification_preferences FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY np_self_upsert ON public.notification_preferences FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY np_self_update ON public.notification_preferences FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Allow users to mark notifications as unread (need to extend; existing policy already allows update)
-- Allow users to delete their own notifications (optional but useful)
CREATE POLICY notifications_self_delete ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Helper: insert a notification iff user has them enabled
CREATE OR REPLACE FUNCTION public.notify_user(
  _user_id uuid, _type text, _title text, _body text DEFAULT NULL, _link text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_id uuid;
BEGIN
  SELECT notifications_enabled INTO v_enabled FROM public.notification_preferences WHERE user_id = _user_id;
  IF v_enabled IS NULL THEN v_enabled := true; END IF;
  IF NOT v_enabled THEN RETURN NULL; END IF;
  INSERT INTO public.notifications (user_id, type, title, body, link_url)
  VALUES (_user_id, _type, _title, _body, _link)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ============= 3. PROJECT COLLABORATORS =============
CREATE TABLE public.project_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  invitee_id uuid NOT NULL,
  invitee_role app_role NOT NULL,
  invited_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|cancelled
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (project_id, invitee_id)
);
ALTER TABLE public.project_collaborators ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_project_owner(_project uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id = _project AND student_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.validate_collab_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('pending','accepted','rejected','cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', NEW.status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_collab_status BEFORE INSERT OR UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.validate_collab_status();

-- Owner manages invitations
CREATE POLICY pc_owner_insert ON public.project_collaborators FOR INSERT TO authenticated
  WITH CHECK (invited_by = auth.uid() AND public.is_project_owner(project_id, auth.uid()));
CREATE POLICY pc_owner_update ON public.project_collaborators FOR UPDATE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()))
  WITH CHECK (public.is_project_owner(project_id, auth.uid()));
CREATE POLICY pc_owner_delete ON public.project_collaborators FOR DELETE TO authenticated
  USING (public.is_project_owner(project_id, auth.uid()));
-- Invitee responds (update own row to accepted/rejected)
CREATE POLICY pc_invitee_update ON public.project_collaborators FOR UPDATE TO authenticated
  USING (invitee_id = auth.uid()) WITH CHECK (invitee_id = auth.uid());
-- Visibility: owner, invitee, admin
CREATE POLICY pc_select ON public.project_collaborators FOR SELECT TO authenticated
  USING (
    invitee_id = auth.uid()
    OR public.is_project_owner(project_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );
CREATE POLICY pc_admin_all ON public.project_collaborators FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_pc_invitee ON public.project_collaborators(invitee_id);
CREATE INDEX idx_pc_project ON public.project_collaborators(project_id);

-- Helper: is user accepted collaborator on project
CREATE OR REPLACE FUNCTION public.is_project_collaborator(_project uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.project_collaborators
                 WHERE project_id = _project AND invitee_id = _user AND status = 'accepted');
$$;

-- Helper: is instructor linked to the project's course (or it's a bachelor project)
CREATE OR REPLACE FUNCTION public.is_linked_instructor(_project uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    LEFT JOIN public.instructor_courses ic ON ic.course_id = p.course_id AND ic.instructor_id = _user
    WHERE p.id = _project
      AND public.has_role(_user, 'instructor')
      AND (
        ic.id IS NOT NULL
        OR (p.kind = 'bachelor')  -- All instructors auto-linked to Bachelor projects
      )
  );
$$;

-- Trigger: notify invitee + record notification on cancel/accept/reject
CREATE OR REPLACE FUNCTION public.on_collab_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_title text; v_owner uuid; v_proj_title text;
BEGIN
  SELECT student_id, title INTO v_owner, v_proj_title FROM public.projects WHERE id = NEW.project_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.notify_user(NEW.invitee_id, 'collab_invite',
      'You were invited to collaborate', 'Project: ' || v_proj_title,
      '/dashboard/invitations');
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status IN ('accepted','rejected') AND v_owner IS NOT NULL THEN
      PERFORM public.notify_user(v_owner, 'collab_response',
        'Collaboration ' || NEW.status, 'Project: ' || v_proj_title,
        '/dashboard/projects');
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_collab_change
  AFTER INSERT OR UPDATE ON public.project_collaborators
  FOR EACH ROW EXECUTE FUNCTION public.on_collab_change();

-- ============= 4. PROJECT COMMENTS =============
CREATE TABLE public.project_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  task_id uuid,        -- nullable: when set, comment is on a task
  thesis_id uuid,      -- nullable: when set, comment is on a thesis draft
  author_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.project_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_pcomm_project ON public.project_comments(project_id);
CREATE INDEX idx_pcomm_task ON public.project_comments(task_id);
CREATE INDEX idx_pcomm_thesis ON public.project_comments(thesis_id);

CREATE TRIGGER trg_pcomm_updated BEFORE UPDATE ON public.project_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Only linked instructors may insert
CREATE POLICY pcomm_instructor_insert ON public.project_comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid() AND public.is_linked_instructor(project_id, auth.uid()));
-- Author may edit/delete their own
CREATE POLICY pcomm_author_update ON public.project_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid()) WITH CHECK (author_id = auth.uid());
CREATE POLICY pcomm_author_delete ON public.project_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());
-- Visibility: project creator, accepted collaborators, linked instructors, admins
CREATE POLICY pcomm_select ON public.project_comments FOR SELECT TO authenticated
  USING (
    public.is_project_owner(project_id, auth.uid())
    OR public.is_project_collaborator(project_id, auth.uid())
    OR public.is_linked_instructor(project_id, auth.uid())
    OR public.has_role(auth.uid(), 'admin')
  );

-- Notify owner & collaborators on comment add/edit/delete
CREATE OR REPLACE FUNCTION public.on_comment_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_proj_title text; v_pid uuid; v_action text;
  v_collab uuid;
BEGIN
  v_pid := COALESCE(NEW.project_id, OLD.project_id);
  SELECT student_id, title INTO v_owner, v_proj_title FROM public.projects WHERE id = v_pid;
  v_action := CASE TG_OP WHEN 'INSERT' THEN 'added' WHEN 'UPDATE' THEN 'edited' ELSE 'removed' END;
  IF v_owner IS NOT NULL THEN
    PERFORM public.notify_user(v_owner, 'project_comment',
      'Instructor ' || v_action || ' a comment',
      'Project: ' || v_proj_title, '/dashboard/projects');
  END IF;
  FOR v_collab IN SELECT invitee_id FROM public.project_collaborators
    WHERE project_id = v_pid AND status = 'accepted'
  LOOP
    PERFORM public.notify_user(v_collab, 'project_comment',
      'Instructor ' || v_action || ' a comment',
      'Project: ' || v_proj_title, '/dashboard/projects');
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_pcomm_change
  AFTER INSERT OR UPDATE OR DELETE ON public.project_comments
  FOR EACH ROW EXECUTE FUNCTION public.on_comment_change();

-- ============= 5. PROJECT RATINGS =============
CREATE TABLE public.project_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  instructor_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, instructor_id)
);
ALTER TABLE public.project_ratings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON public.project_ratings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY pr_select_all ON public.project_ratings FOR SELECT TO authenticated USING (true); -- public visible
CREATE POLICY pr_instructor_insert ON public.project_ratings FOR INSERT TO authenticated
  WITH CHECK (instructor_id = auth.uid() AND public.is_linked_instructor(project_id, auth.uid()));
CREATE POLICY pr_author_update ON public.project_ratings FOR UPDATE TO authenticated
  USING (instructor_id = auth.uid()) WITH CHECK (instructor_id = auth.uid());
CREATE POLICY pr_author_delete ON public.project_ratings FOR DELETE TO authenticated
  USING (instructor_id = auth.uid());

CREATE OR REPLACE FUNCTION public.on_rating_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid; v_proj_title text; v_pid uuid; v_action text;
BEGIN
  v_pid := COALESCE(NEW.project_id, OLD.project_id);
  SELECT student_id, title INTO v_owner, v_proj_title FROM public.projects WHERE id = v_pid;
  v_action := CASE TG_OP WHEN 'INSERT' THEN 'added' WHEN 'UPDATE' THEN 'updated' ELSE 'removed' END;
  IF v_owner IS NOT NULL THEN
    PERFORM public.notify_user(v_owner, 'project_rating',
      'Instructor ' || v_action || ' a rating',
      'Project: ' || v_proj_title, '/dashboard/projects');
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_pr_change
  AFTER INSERT OR UPDATE OR DELETE ON public.project_ratings
  FOR EACH ROW EXECUTE FUNCTION public.on_rating_change();

-- ============= 6. CONVERSATIONS & MESSAGES =============
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_a < user_b),
  UNIQUE (user_a, user_b)
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_conversation_participant(_conv uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.conversations
                 WHERE id = _conv AND (_user = user_a OR _user = user_b));
$$;

CREATE POLICY conv_select ON public.conversations FOR SELECT TO authenticated
  USING (auth.uid() IN (user_a, user_b) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY conv_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IN (user_a, user_b));
CREATE POLICY conv_update ON public.conversations FOR UPDATE TO authenticated
  USING (auth.uid() IN (user_a, user_b)) WITH CHECK (auth.uid() IN (user_a, user_b));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_msg_conv ON public.messages(conversation_id, created_at);

CREATE POLICY msg_select ON public.messages FOR SELECT TO authenticated
  USING (public.is_conversation_participant(conversation_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY msg_insert ON public.messages FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_conversation_participant(conversation_id, auth.uid()));

-- Bump last_message_at and notify other participant
CREATE OR REPLACE FUNCTION public.on_message_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_other uuid; v_a uuid; v_b uuid; v_sender_name text;
BEGIN
  UPDATE public.conversations SET last_message_at = NEW.created_at WHERE id = NEW.conversation_id
    RETURNING user_a, user_b INTO v_a, v_b;
  v_other := CASE WHEN NEW.sender_id = v_a THEN v_b ELSE v_a END;
  SELECT COALESCE(NULLIF(TRIM(COALESCE(first_name,'') || ' ' || COALESCE(last_name,'')),''),
                  company_name, email, 'Someone')
    INTO v_sender_name FROM public.profiles WHERE id = NEW.sender_id;
  PERFORM public.notify_user(v_other, 'new_message',
    'New message from ' || v_sender_name,
    LEFT(NEW.body, 120),
    '/dashboard/messages');
  RETURN NEW;
END $$;
CREATE TRIGGER trg_message_insert AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.on_message_insert();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;