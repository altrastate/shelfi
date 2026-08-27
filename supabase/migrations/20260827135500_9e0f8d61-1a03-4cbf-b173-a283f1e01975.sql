CREATE OR REPLACE FUNCTION public.safe_uuid(_value text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  RETURN _value::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END; $$;

REVOKE ALL ON FUNCTION public.safe_uuid(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.safe_uuid(text) TO authenticated;

DROP POLICY IF EXISTS "staff manage own school digital objects" ON storage.objects;
CREATE POLICY "staff manage own school digital objects"
  ON storage.objects FOR ALL TO authenticated
  USING (
    bucket_id = 'digital-books'
    AND (storage.foldername(name))[1] IN ('files','covers')
    AND public.is_school_staff(public.safe_uuid((storage.foldername(name))[2]))
  )
  WITH CHECK (
    bucket_id = 'digital-books'
    AND (storage.foldername(name))[1] IN ('files','covers')
    AND public.is_school_staff(public.safe_uuid((storage.foldername(name))[2]))
  );

DROP POLICY IF EXISTS "members read own school covers" ON storage.objects;
CREATE POLICY "members read own school covers"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'digital-books'
    AND (storage.foldername(name))[1] = 'covers'
    AND public.is_active_member(public.safe_uuid((storage.foldername(name))[2]))
  );