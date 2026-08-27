-- Helper: active librarian of a school
CREATE OR REPLACE FUNCTION public.is_librarian(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
    JOIN public.profiles p ON p.id = r.user_id
    WHERE r.user_id = auth.uid()
      AND r.role = 'librarian'
      AND r.school_id = _school_id
      AND p.school_id = _school_id
      AND p.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_school_staff(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.is_school_admin(_school_id) OR public.is_librarian(_school_id);
$$;

REVOKE ALL ON FUNCTION public.is_librarian(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_school_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_librarian(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_school_staff(uuid) TO authenticated;

-- Platform admin designates a school administrator
CREATE OR REPLACE FUNCTION public.assign_school_admin(_user_id uuid, _school_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.is_system_admin() THEN
    RAISE EXCEPTION 'Only platform administrators can assign school administrators';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.schools WHERE id = _school_id) THEN
    RAISE EXCEPTION 'School not found';
  END IF;

  INSERT INTO public.user_roles (user_id, school_id, role)
  VALUES (_user_id, _school_id, 'school_admin')
  ON CONFLICT (user_id, role, school_id) DO NOTHING;

  UPDATE public.profiles
     SET school_id = _school_id, status = 'active'
   WHERE id = _user_id;

  UPDATE public.school_join_requests
     SET status = 'active', reviewed_at = now(), reviewed_by = auth.uid()
   WHERE user_id = _user_id AND school_id = _school_id AND status = 'pending';
END; $$;

REVOKE ALL ON FUNCTION public.assign_school_admin(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_school_admin(uuid, uuid) TO authenticated;

-- Join a school using its join code (student or librarian)
CREATE OR REPLACE FUNCTION public.request_school_join(_join_code text, _role public.app_role, _full_name text DEFAULT NULL)
RETURNS TABLE (school_id uuid, school_name text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_school public.schools%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role NOT IN ('student', 'librarian') THEN
    RAISE EXCEPTION 'Invalid role for a join request';
  END IF;

  SELECT * INTO v_school FROM public.schools
   WHERE upper(join_code) = upper(trim(_join_code)) AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That join code is not recognised'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('system_admin', 'school_admin')
  ) THEN
    RAISE EXCEPTION 'Administrator accounts cannot submit join requests';
  END IF;

  UPDATE public.profiles
     SET school_id = v_school.id,
         status = 'pending',
         full_name = COALESCE(NULLIF(trim(_full_name), ''), full_name)
   WHERE id = auth.uid();

  INSERT INTO public.school_join_requests (school_id, user_id, status, requested_role, requested_at)
  VALUES (v_school.id, auth.uid(), 'pending', _role, now())
  ON CONFLICT (school_id, user_id) DO UPDATE
    SET status = 'pending', requested_role = EXCLUDED.requested_role,
        requested_at = now(), reviewed_at = NULL, reviewed_by = NULL, decision_note = NULL;

  school_id := v_school.id;
  school_name := v_school.name;
  RETURN NEXT;
END; $$;

REVOKE ALL ON FUNCTION public.request_school_join(text, public.app_role, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_school_join(text, public.app_role, text) TO authenticated;

-- School administrator approves or rejects a join request
CREATE OR REPLACE FUNCTION public.review_join_request(_request_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_req public.school_join_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req FROM public.school_join_requests WHERE id = _request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  IF NOT (public.is_school_admin(v_req.school_id) OR public.is_system_admin()) THEN
    RAISE EXCEPTION 'Only this school''s administrator can review requests';
  END IF;

  IF v_req.user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot review your own request';
  END IF;

  IF _approve THEN
    INSERT INTO public.user_roles (user_id, school_id, role)
    VALUES (v_req.user_id, v_req.school_id, v_req.requested_role)
    ON CONFLICT (user_id, role, school_id) DO NOTHING;

    UPDATE public.profiles
       SET school_id = v_req.school_id, status = 'active'
     WHERE id = v_req.user_id;

    UPDATE public.school_join_requests
       SET status = 'active', reviewed_at = now(), reviewed_by = auth.uid(), decision_note = _note
     WHERE id = _request_id;
  ELSE
    DELETE FROM public.user_roles
     WHERE user_id = v_req.user_id AND school_id = v_req.school_id AND role = v_req.requested_role;

    UPDATE public.profiles
       SET status = 'rejected'
     WHERE id = v_req.user_id AND school_id = v_req.school_id;

    UPDATE public.school_join_requests
       SET status = 'rejected', reviewed_at = now(), reviewed_by = auth.uid(), decision_note = _note
     WHERE id = _request_id;
  END IF;
END; $$;

REVOKE ALL ON FUNCTION public.review_join_request(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_join_request(uuid, boolean, text) TO authenticated;

-- Active librarians can read (not escalate) their own school's member profiles
DROP POLICY IF EXISTS "librarians read school profiles" ON public.profiles;
CREATE POLICY "librarians read school profiles" ON public.profiles
FOR SELECT TO authenticated
USING (school_id IS NOT NULL AND public.is_librarian(school_id));

DROP POLICY IF EXISTS "librarians read school join requests" ON public.school_join_requests;
CREATE POLICY "librarians read school join requests" ON public.school_join_requests
FOR SELECT TO authenticated
USING (public.is_librarian(school_id));