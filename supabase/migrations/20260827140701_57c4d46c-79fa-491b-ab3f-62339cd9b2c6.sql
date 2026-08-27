-- Data API access (these tables had no grants at all)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shelf_items TO authenticated;
GRANT ALL ON public.shelf_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reading_progress TO authenticated;
GRANT ALL ON public.reading_progress TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;

-- Integrity
DELETE FROM public.shelf_items a USING public.shelf_items b
 WHERE a.ctid > b.ctid AND a.user_id = b.user_id
   AND a.resource_id IS NOT DISTINCT FROM b.resource_id
   AND a.book_id IS NOT DISTINCT FROM b.book_id;

CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_user_resource_uniq
  ON public.shelf_items (user_id, resource_id) WHERE resource_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS shelf_items_user_book_uniq
  ON public.shelf_items (user_id, book_id) WHERE book_id IS NOT NULL;

DELETE FROM public.bookmarks a USING public.bookmarks b
 WHERE a.ctid > b.ctid AND a.user_id = b.user_id
   AND a.resource_id = b.resource_id AND a.page IS NOT DISTINCT FROM b.page;

CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_user_resource_page_uniq
  ON public.bookmarks (user_id, resource_id, page) WHERE page IS NOT NULL;

CREATE INDEX IF NOT EXISTS shelf_items_user_added_idx ON public.shelf_items (user_id, added_at DESC);
CREATE INDEX IF NOT EXISTS reading_progress_user_read_idx ON public.reading_progress (user_id, last_read_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_user_resource_idx ON public.bookmarks (user_id, resource_id, page);

-- Authorisation: a personal record may only point at a digital book the caller may open.
DROP POLICY IF EXISTS "users manage own shelf" ON public.shelf_items;
CREATE POLICY "users manage own shelf" ON public.shelf_items
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
    AND (resource_id IS NULL OR public.can_open_digital_resource(resource_id))
  );

DROP POLICY IF EXISTS "users manage own reading progress" ON public.reading_progress;
CREATE POLICY "users manage own reading progress" ON public.reading_progress
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
    AND public.can_open_digital_resource(resource_id)
  );

DROP POLICY IF EXISTS "users manage own bookmarks" ON public.bookmarks;
CREATE POLICY "users manage own bookmarks" ON public.bookmarks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
    AND public.can_open_digital_resource(resource_id)
  );