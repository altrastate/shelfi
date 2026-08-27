CREATE OR REPLACE FUNCTION public.request_school_join(_join_code text, _role app_role, _full_name text DEFAULT NULL::text)
 RETURNS TABLE(school_id uuid, school_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
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

  RETURN QUERY SELECT v_school.id, v_school.name;
END; $function$;

CREATE OR REPLACE FUNCTION public.request_parent_link(_join_code text, _guardian_code text, _relationship_type text DEFAULT 'guardian'::text, _full_name text DEFAULT NULL::text)
 RETURNS TABLE(school_name text, student_first_name text, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_school public.schools%ROWTYPE;
  v_student public.profiles%ROWTYPE;
  v_type text;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = auth.uid() AND role IN ('system_admin','school_admin','librarian','student')
  ) THEN
    RAISE EXCEPTION 'This account already has a school role and cannot become a guardian';
  END IF;

  SELECT * INTO v_school FROM public.schools
   WHERE upper(join_code) = upper(trim(_join_code)) AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'That join code is not recognised'; END IF;

  SELECT * INTO v_student FROM public.profiles
   WHERE guardian_code IS NOT NULL
     AND upper(guardian_code) = upper(trim(_guardian_code))
     AND school_id = v_school.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'That guardian code is not recognised for this school'; END IF;

  v_type := COALESCE(NULLIF(trim(_relationship_type), ''), 'guardian');
  IF v_type NOT IN ('mother','father','guardian','other') THEN v_type := 'guardian'; END IF;

  UPDATE public.profiles
     SET school_id = v_school.id,
         status = CASE WHEN profiles.status = 'active' THEN profiles.status ELSE 'pending'::membership_status END,
         full_name = COALESCE(NULLIF(trim(_full_name), ''), full_name)
   WHERE id = auth.uid();

  INSERT INTO public.user_roles (user_id, school_id, role)
  VALUES (auth.uid(), v_school.id, 'parent')
  ON CONFLICT (user_id, role, school_id) DO NOTHING;

  INSERT INTO public.parent_student_relationships
    (parent_user_id, student_user_id, school_id, status, relationship_type)
  VALUES (auth.uid(), v_student.id, v_school.id, 'pending', v_type)
  ON CONFLICT (parent_user_id, student_user_id) DO UPDATE
    SET status = CASE WHEN public.parent_student_relationships.status = 'active'
                      THEN 'active'::parent_link_status ELSE 'pending'::parent_link_status END,
        relationship_type = EXCLUDED.relationship_type,
        school_id = EXCLUDED.school_id,
        decision_note = NULL,
        created_at = now();

  RETURN QUERY SELECT v_school.name, split_part(trim(v_student.full_name), ' ', 1), 'pending'::text;
END; $function$;