
-- 1. Relationship status
DO $$ BEGIN
  CREATE TYPE public.parent_link_status AS ENUM ('pending','active','rejected','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Guardian code on student profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS guardian_code text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_guardian_code_key
  ON public.profiles (guardian_code) WHERE guardian_code IS NOT NULL;

-- 3. Relationship table
CREATE TABLE IF NOT EXISTS public.parent_student_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  status public.parent_link_status NOT NULL DEFAULT 'pending',
  relationship_type text NOT NULL DEFAULT 'guardian',
  decision_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  CONSTRAINT parent_student_unique UNIQUE (parent_user_id, student_user_id),
  CONSTRAINT parent_not_student CHECK (parent_user_id <> student_user_id)
);

CREATE INDEX IF NOT EXISTS psr_parent_idx ON public.parent_student_relationships (parent_user_id, status);
CREATE INDEX IF NOT EXISTS psr_student_idx ON public.parent_student_relationships (student_user_id, status);
CREATE INDEX IF NOT EXISTS psr_school_idx ON public.parent_student_relationships (school_id, status);

GRANT SELECT ON public.parent_student_relationships TO authenticated;
GRANT ALL ON public.parent_student_relationships TO service_role;

ALTER TABLE public.parent_student_relationships ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS t_psr_updated ON public.parent_student_relationships;
CREATE TRIGGER t_psr_updated BEFORE UPDATE ON public.parent_student_relationships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Authorization helpers
CREATE OR REPLACE FUNCTION public.is_active_guardian_of(_student_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.parent_student_relationships r
    JOIN public.profiles sp ON sp.id = r.student_user_id
    JOIN public.profiles pp ON pp.id = r.parent_user_id
    WHERE r.parent_user_id = auth.uid()
      AND r.student_user_id = _student_id
      AND r.status = 'active'
      AND sp.school_id = r.school_id
      AND pp.school_id = r.school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_guardian(_parent_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parent_student_relationships r
    WHERE r.student_user_id = auth.uid()
      AND r.parent_user_id = _parent_id
      AND r.status IN ('pending','active')
  );
$$;

-- 5. Relationship table policies (mutations go through security definer RPCs only)
DROP POLICY IF EXISTS "parents read own links" ON public.parent_student_relationships;
CREATE POLICY "parents read own links" ON public.parent_student_relationships
  FOR SELECT TO authenticated USING (parent_user_id = auth.uid());

DROP POLICY IF EXISTS "students read own links" ON public.parent_student_relationships;
CREATE POLICY "students read own links" ON public.parent_student_relationships
  FOR SELECT TO authenticated USING (student_user_id = auth.uid());

DROP POLICY IF EXISTS "school staff read school links" ON public.parent_student_relationships;
CREATE POLICY "school staff read school links" ON public.parent_student_relationships
  FOR SELECT TO authenticated USING (public.is_school_staff(school_id));

DROP POLICY IF EXISTS "system admins read all links" ON public.parent_student_relationships;
CREATE POLICY "system admins read all links" ON public.parent_student_relationships
  FOR SELECT TO authenticated USING (public.is_system_admin());

-- 6. Read-only guardian visibility over existing records
DROP POLICY IF EXISTS "guardians read child profile" ON public.profiles;
CREATE POLICY "guardians read child profile" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_active_guardian_of(id));

DROP POLICY IF EXISTS "students read own guardians" ON public.profiles;
CREATE POLICY "students read own guardians" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_my_guardian(id));

DROP POLICY IF EXISTS "guardians read child reading progress" ON public.reading_progress;
CREATE POLICY "guardians read child reading progress" ON public.reading_progress
  FOR SELECT TO authenticated USING (public.is_active_guardian_of(user_id));

DROP POLICY IF EXISTS "guardians read child shelf" ON public.shelf_items;
CREATE POLICY "guardians read child shelf" ON public.shelf_items
  FOR SELECT TO authenticated USING (public.is_active_guardian_of(user_id));

DROP POLICY IF EXISTS "guardians read child borrowings" ON public.borrowings;
CREATE POLICY "guardians read child borrowings" ON public.borrowings
  FOR SELECT TO authenticated USING (public.is_active_guardian_of(borrower_id));

-- 7. Student-issued guardian code
CREATE OR REPLACE FUNCTION public.ensure_guardian_code()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_code text; v_existing text; i int := 0;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT guardian_code INTO v_existing FROM public.profiles WHERE id = auth.uid();
  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;

  LOOP
    i := i + 1;
    v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    BEGIN
      UPDATE public.profiles SET guardian_code = v_code WHERE id = auth.uid();
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF i > 5 THEN RAISE EXCEPTION 'Could not generate a guardian code'; END IF;
    END;
  END LOOP;
END; $$;

-- 8. Parent requests a connection using school join code + child's guardian code
CREATE OR REPLACE FUNCTION public.request_parent_link(
  _join_code text, _guardian_code text, _relationship_type text DEFAULT 'guardian', _full_name text DEFAULT NULL
) RETURNS TABLE(school_name text, student_first_name text, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
         status = CASE WHEN status = 'active' THEN status ELSE 'pending'::membership_status END,
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

  school_name := v_school.name;
  student_first_name := split_part(trim(v_student.full_name), ' ', 1);
  status := 'pending';
  RETURN NEXT;
END; $$;

-- 9. Staff review / revoke
CREATE OR REPLACE FUNCTION public.review_parent_link(_relationship_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rel public.parent_student_relationships%ROWTYPE;
BEGIN
  SELECT * INTO v_rel FROM public.parent_student_relationships WHERE id = _relationship_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF NOT (public.is_school_staff(v_rel.school_id) OR public.is_system_admin()) THEN
    RAISE EXCEPTION 'Only this school''s staff can review guardian connections';
  END IF;
  IF v_rel.parent_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot review your own request';
  END IF;

  IF _approve THEN
    UPDATE public.parent_student_relationships
       SET status = 'active', approved_at = now(), approved_by = auth.uid(), decision_note = _note
     WHERE id = _relationship_id;
    UPDATE public.profiles SET status = 'active'
     WHERE id = v_rel.parent_user_id AND school_id = v_rel.school_id;
  ELSE
    UPDATE public.parent_student_relationships
       SET status = 'rejected', approved_at = now(), approved_by = auth.uid(), decision_note = _note
     WHERE id = _relationship_id;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.revoke_parent_link(_relationship_id uuid, _note text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_rel public.parent_student_relationships%ROWTYPE;
BEGIN
  SELECT * INTO v_rel FROM public.parent_student_relationships WHERE id = _relationship_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Connection not found'; END IF;
  IF NOT (public.is_school_staff(v_rel.school_id) OR public.is_system_admin()) THEN
    RAISE EXCEPTION 'Only this school''s staff can revoke guardian connections';
  END IF;
  UPDATE public.parent_student_relationships
     SET status = 'revoked', decision_note = _note
   WHERE id = _relationship_id;
END; $$;
