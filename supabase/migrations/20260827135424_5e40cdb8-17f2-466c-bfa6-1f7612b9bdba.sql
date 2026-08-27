ALTER TABLE public.digital_resources
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS level text,
  ADD COLUMN IF NOT EXISTS isbn text,
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

ALTER TABLE public.digital_resources
  DROP CONSTRAINT IF EXISTS digital_resources_status_check;
ALTER TABLE public.digital_resources
  ADD CONSTRAINT digital_resources_status_check
  CHECK (status IN ('draft','published','archived'));

UPDATE public.digital_resources SET status = CASE WHEN is_active THEN 'published' ELSE 'archived' END;

CREATE INDEX IF NOT EXISTS idx_digital_resources_school_status
  ON public.digital_resources (school_id, status);
CREATE INDEX IF NOT EXISTS idx_digital_resources_title
  ON public.digital_resources (title);

-- Reads: members only see PUBLISHED school resources
DROP POLICY IF EXISTS "members read school resources" ON public.digital_resources;
CREATE POLICY "members read published school resources"
  ON public.digital_resources FOR SELECT TO authenticated
  USING (
    source_type = 'school'::resource_source
    AND status = 'published'
    AND is_active_member(school_id)
  );

DROP POLICY IF EXISTS "members read licensed catalogue" ON public.digital_resources;
CREATE POLICY "members read licensed catalogue"
  ON public.digital_resources FOR SELECT TO authenticated
  USING (
    source_type = 'shelfi_catalogue'::resource_source
    AND status = 'published'
    AND EXISTS (
      SELECT 1 FROM public.resource_licences l
      WHERE l.resource_id = digital_resources.id
        AND l.is_active
        AND (is_active_member(l.school_id) OR is_school_admin(l.school_id))
    )
  );

-- Staff (school admin + approved librarian) manage their own school's resources
DROP POLICY IF EXISTS "school admins manage school resources" ON public.digital_resources;
CREATE POLICY "school staff manage school resources"
  ON public.digital_resources FOR ALL TO authenticated
  USING (source_type = 'school'::resource_source AND is_school_staff(school_id))
  WITH CHECK (source_type = 'school'::resource_source AND is_school_staff(school_id));

-- Authorization helper for opening a digital book file
CREATE OR REPLACE FUNCTION public.can_open_digital_resource(_resource_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.digital_resources r
    WHERE r.id = _resource_id
      AND r.storage_path IS NOT NULL
      AND (
        -- staff of the owning school may open drafts/archived too
        (r.source_type = 'school' AND public.is_school_staff(r.school_id))
        OR (r.source_type = 'school' AND r.status = 'published' AND public.is_active_member(r.school_id))
        OR (
          r.source_type = 'shelfi_catalogue' AND r.status = 'published'
          AND EXISTS (
            SELECT 1 FROM public.resource_licences l
            WHERE l.resource_id = r.id AND l.is_active
              AND public.is_active_member(l.school_id)
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_open_digital_resource(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_open_digital_resource(uuid) TO authenticated;