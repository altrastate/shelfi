-- 1. Ask Shelfi usage tracking: own rows only, own school, no client-chosen identity.
CREATE POLICY "Students log own usage"
  ON public.ai_usage_events FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());

-- 2. Least privilege: no policy targets anon, so these grants are dead weight.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 3. Preserve historical library transactions: prefer archival over deletion.
ALTER TABLE public.borrowings DROP CONSTRAINT borrowings_copy_id_fkey;
ALTER TABLE public.borrowings
  ADD CONSTRAINT borrowings_copy_id_fkey FOREIGN KEY (copy_id)
  REFERENCES public.physical_copies(id) ON DELETE RESTRICT;

ALTER TABLE public.physical_copies DROP CONSTRAINT physical_copies_book_id_fkey;
ALTER TABLE public.physical_copies
  ADD CONSTRAINT physical_copies_book_id_fkey FOREIGN KEY (book_id)
  REFERENCES public.books(id) ON DELETE RESTRICT;