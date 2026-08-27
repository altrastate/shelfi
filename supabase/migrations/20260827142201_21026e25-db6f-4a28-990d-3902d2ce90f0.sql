
REVOKE EXECUTE ON FUNCTION public.is_active_guardian_of(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_my_guardian(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.ensure_guardian_code() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.request_parent_link(text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.review_parent_link(uuid, boolean, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.revoke_parent_link(uuid, text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_active_guardian_of(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_my_guardian(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_guardian_code() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_parent_link(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_parent_link(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_parent_link(uuid, text) TO authenticated;
