-- 1. Metadata additions -------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS edition text,
  ADD COLUMN IF NOT EXISTS subject text,
  ADD COLUMN IF NOT EXISTS shelf_location text;

ALTER TYPE copy_status ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE public.physical_copies
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'good',
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE public.physical_copies
  DROP CONSTRAINT IF EXISTS physical_copies_condition_check;
ALTER TABLE public.physical_copies
  ADD CONSTRAINT physical_copies_condition_check
  CHECK (condition IN ('new', 'good', 'fair', 'poor'));

-- 2. One active loan per copy -------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS borrowings_one_active_per_copy
  ON public.borrowings (copy_id) WHERE returned_at IS NULL;

CREATE INDEX IF NOT EXISTS borrowings_school_active_idx
  ON public.borrowings (school_id, returned_at, due_at);
CREATE INDEX IF NOT EXISTS borrowings_borrower_idx
  ON public.borrowings (borrower_id, borrowed_at DESC);
CREATE INDEX IF NOT EXISTS physical_copies_book_idx
  ON public.physical_copies (book_id, status);
CREATE INDEX IF NOT EXISTS books_school_title_idx
  ON public.books (school_id, title);

-- 3. Librarian access ----------------------------------------------------
DROP POLICY IF EXISTS "librarians manage books" ON public.books;
CREATE POLICY "librarians manage books" ON public.books
  FOR ALL TO authenticated
  USING (public.is_school_staff(school_id))
  WITH CHECK (public.is_school_staff(school_id));

DROP POLICY IF EXISTS "librarians manage copies" ON public.physical_copies;
CREATE POLICY "librarians manage copies" ON public.physical_copies
  FOR ALL TO authenticated
  USING (public.is_school_staff(school_id))
  WITH CHECK (public.is_school_staff(school_id));

DROP POLICY IF EXISTS "librarians read borrowings" ON public.borrowings;
CREATE POLICY "librarians read borrowings" ON public.borrowings
  FOR SELECT TO authenticated
  USING (public.is_school_staff(school_id));

DROP POLICY IF EXISTS "librarians manage authors" ON public.authors;
CREATE POLICY "librarians manage authors" ON public.authors
  FOR ALL TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_staff(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_staff(school_id));

DROP POLICY IF EXISTS "librarians manage categories" ON public.categories;
CREATE POLICY "librarians manage categories" ON public.categories
  FOR ALL TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_staff(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_staff(school_id));

-- Librarians must also read school copies/books even before they are members
DROP POLICY IF EXISTS "staff read school books" ON public.books;
CREATE POLICY "staff read school books" ON public.books
  FOR SELECT TO authenticated USING (public.is_school_staff(school_id));

DROP POLICY IF EXISTS "staff read school copies" ON public.physical_copies;
CREATE POLICY "staff read school copies" ON public.physical_copies
  FOR SELECT TO authenticated USING (public.is_school_staff(school_id));

-- 4. Circulation operations ---------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_copy(
  _copy_id uuid,
  _borrower_id uuid,
  _due_at timestamptz,
  _notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_copy public.physical_copies%ROWTYPE;
  v_borrower public.profiles%ROWTYPE;
  v_id uuid;
BEGIN
  SELECT * INTO v_copy FROM public.physical_copies WHERE id = _copy_id FOR UPDATE;
  IF v_copy.id IS NULL THEN RAISE EXCEPTION 'Copy not found'; END IF;

  IF NOT public.is_school_staff(v_copy.school_id) THEN
    RAISE EXCEPTION 'Not authorised for this school library';
  END IF;

  IF v_copy.status <> 'available' THEN
    RAISE EXCEPTION 'This copy is % and cannot be issued', v_copy.status;
  END IF;

  SELECT * INTO v_borrower FROM public.profiles WHERE id = _borrower_id;
  IF v_borrower.id IS NULL OR v_borrower.school_id IS DISTINCT FROM v_copy.school_id THEN
    RAISE EXCEPTION 'Borrower is not a member of this school';
  END IF;
  IF v_borrower.status <> 'active' THEN
    RAISE EXCEPTION 'Borrower account is not active';
  END IF;

  IF _due_at IS NULL OR _due_at <= now() THEN
    RAISE EXCEPTION 'Due date must be in the future';
  END IF;

  INSERT INTO public.borrowings (school_id, copy_id, borrower_id, due_at, status, issued_by, notes)
  VALUES (v_copy.school_id, _copy_id, _borrower_id, _due_at, 'borrowed', auth.uid(), _notes)
  RETURNING id INTO v_id;

  UPDATE public.physical_copies SET status = 'borrowed' WHERE id = _copy_id;
  RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.return_copy(
  _copy_id uuid,
  _outcome text DEFAULT 'returned',
  _note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_copy public.physical_copies%ROWTYPE;
  v_loan public.borrowings%ROWTYPE;
BEGIN
  IF _outcome NOT IN ('returned', 'lost', 'damaged') THEN
    RAISE EXCEPTION 'Invalid return outcome';
  END IF;

  SELECT * INTO v_copy FROM public.physical_copies WHERE id = _copy_id FOR UPDATE;
  IF v_copy.id IS NULL THEN RAISE EXCEPTION 'Copy not found'; END IF;
  IF NOT public.is_school_staff(v_copy.school_id) THEN
    RAISE EXCEPTION 'Not authorised for this school library';
  END IF;

  SELECT * INTO v_loan FROM public.borrowings
   WHERE copy_id = _copy_id AND returned_at IS NULL FOR UPDATE;
  IF v_loan.id IS NULL THEN
    RAISE EXCEPTION 'This copy has no active loan';
  END IF;

  UPDATE public.borrowings
     SET returned_at = now(),
         status = CASE WHEN _outcome = 'lost' THEN 'lost'::borrow_status ELSE 'returned'::borrow_status END,
         notes = COALESCE(_note, notes)
   WHERE id = v_loan.id;

  UPDATE public.physical_copies
     SET status = CASE _outcome
           WHEN 'lost' THEN 'lost'::copy_status
           WHEN 'damaged' THEN 'damaged'::copy_status
           ELSE 'available'::copy_status END,
         notes = COALESCE(_note, notes)
   WHERE id = _copy_id;

  RETURN v_loan.id;
END; $$;

CREATE OR REPLACE FUNCTION public.set_copy_status(
  _copy_id uuid,
  _status copy_status,
  _note text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_copy public.physical_copies%ROWTYPE;
  v_active uuid;
BEGIN
  IF _status NOT IN ('available', 'lost', 'damaged', 'archived', 'reserved') THEN
    RAISE EXCEPTION 'This status is set by circulation, not manually';
  END IF;

  SELECT * INTO v_copy FROM public.physical_copies WHERE id = _copy_id FOR UPDATE;
  IF v_copy.id IS NULL THEN RAISE EXCEPTION 'Copy not found'; END IF;
  IF NOT public.is_school_staff(v_copy.school_id) THEN
    RAISE EXCEPTION 'Not authorised for this school library';
  END IF;

  SELECT id INTO v_active FROM public.borrowings
   WHERE copy_id = _copy_id AND returned_at IS NULL FOR UPDATE;

  IF v_active IS NOT NULL THEN
    IF _status = 'available' THEN
      RAISE EXCEPTION 'This copy is on loan — return it first';
    END IF;
    UPDATE public.borrowings
       SET returned_at = now(),
           status = CASE WHEN _status = 'lost' THEN 'lost'::borrow_status ELSE 'returned'::borrow_status END,
           notes = COALESCE(_note, notes)
     WHERE id = v_active;
  END IF;

  UPDATE public.physical_copies
     SET status = _status, notes = COALESCE(_note, notes)
   WHERE id = _copy_id;
END; $$;

REVOKE ALL ON FUNCTION public.issue_copy(uuid, uuid, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.return_copy(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_copy_status(uuid, copy_status, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_copy(uuid, uuid, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_copy(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_copy_status(uuid, copy_status, text) TO authenticated;
