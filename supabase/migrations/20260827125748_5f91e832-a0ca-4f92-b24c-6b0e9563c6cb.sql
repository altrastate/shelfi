-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('system_admin', 'school_admin', 'student');
CREATE TYPE public.resource_source AS ENUM ('school', 'shelfi_catalogue');
CREATE TYPE public.borrow_status AS ENUM ('borrowed', 'returned', 'overdue', 'lost');
CREATE TYPE public.copy_status AS ENUM ('available', 'borrowed', 'reserved', 'damaged', 'lost', 'retired');
CREATE TYPE public.membership_status AS ENUM ('pending', 'active', 'suspended');

-- ============ SHARED HELPERS ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ SCHOOLS (TENANTS) ============
CREATE TABLE public.schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  contact_email text,
  city text,
  country text,
  join_code text UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE SET NULL,
  full_name text NOT NULL DEFAULT '',
  avatar_url text,
  year_group text,
  status public.membership_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ USER ROLES ============
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role, school_id)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_system_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'system_admin');
$$;

CREATE OR REPLACE FUNCTION public.current_school_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_school_admin(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'school_admin' AND school_id = _school_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_active_member(_school_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND school_id = _school_id AND status = 'active'
  );
$$;

-- profile auto-creation on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ POLICIES: schools / profiles / roles ============
CREATE POLICY "system admins manage schools" ON public.schools FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());
CREATE POLICY "members read own school" ON public.schools FOR SELECT TO authenticated
  USING (id = public.current_school_id());
CREATE POLICY "school admins update own school" ON public.schools FOR UPDATE TO authenticated
  USING (public.is_school_admin(id)) WITH CHECK (public.is_school_admin(id));

CREATE POLICY "users read own profile" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY "school admins read school profiles" ON public.profiles FOR SELECT TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id));
CREATE POLICY "school admins manage school profiles" ON public.profiles FOR UPDATE TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id))
  WITH CHECK (school_id IS NOT NULL AND public.is_school_admin(school_id));
CREATE POLICY "system admins read all profiles" ON public.profiles FOR SELECT TO authenticated
  USING (public.is_system_admin());
CREATE POLICY "system admins manage all profiles" ON public.profiles FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "school admins read school roles" ON public.user_roles FOR SELECT TO authenticated
  USING (school_id IS NOT NULL AND public.is_school_admin(school_id));
CREATE POLICY "system admins read all roles" ON public.user_roles FOR SELECT TO authenticated
  USING (public.is_system_admin());

-- ============ JOIN REQUESTS (school-controlled student onboarding) ============
CREATE TABLE public.school_join_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.membership_status NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (school_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_join_requests TO authenticated;
GRANT ALL ON public.school_join_requests TO service_role;
ALTER TABLE public.school_join_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own join requests" ON public.school_join_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY "users create own join requests" ON public.school_join_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "school admins manage join requests" ON public.school_join_requests FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage join requests" ON public.school_join_requests FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ============ PHYSICAL LIBRARY ============
CREATE TABLE public.authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  bio text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.publishers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  website text,
  contact_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  subtitle text,
  isbn text,
  author_id uuid REFERENCES public.authors(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL,
  description text,
  cover_url text,
  language text,
  published_year int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.physical_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  barcode text,
  shelf_location text,
  status public.copy_status NOT NULL DEFAULT 'available',
  acquired_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, barcode)
);

CREATE TABLE public.borrowings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  copy_id uuid NOT NULL REFERENCES public.physical_copies(id) ON DELETE CASCADE,
  borrower_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  borrowed_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz NOT NULL,
  returned_at timestamptz,
  status public.borrow_status NOT NULL DEFAULT 'borrowed',
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============ DIGITAL LIBRARY ============
CREATE TABLE public.digital_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type public.resource_source NOT NULL,
  school_id uuid REFERENCES public.schools(id) ON DELETE CASCADE,
  publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL,
  title text NOT NULL,
  subtitle text,
  author_name text,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  description text,
  cover_url text,
  file_url text,
  format text,
  language text,
  page_count int,
  published_year int,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT digital_resource_source_scope CHECK (
    (source_type = 'school' AND school_id IS NOT NULL)
    OR (source_type = 'shelfi_catalogue' AND school_id IS NULL)
  )
);

CREATE TABLE public.resource_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.digital_resources(id) ON DELETE CASCADE,
  seats int,
  starts_on date NOT NULL DEFAULT current_date,
  expires_on date,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, resource_id)
);

CREATE TABLE public.reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.digital_resources(id) ON DELETE CASCADE,
  current_page int NOT NULL DEFAULT 0,
  percent_complete numeric(5,2) NOT NULL DEFAULT 0,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, resource_id)
);

CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.digital_resources(id) ON DELETE CASCADE,
  page int,
  label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.shelf_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.digital_resources(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  added_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shelf_item_target CHECK (num_nonnulls(resource_id, book_id) = 1)
);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authors, public.categories, public.publishers,
  public.books, public.physical_copies, public.borrowings, public.digital_resources,
  public.resource_licences, public.reading_progress, public.bookmarks, public.shelf_items TO authenticated;
GRANT ALL ON public.authors, public.categories, public.publishers,
  public.books, public.physical_copies, public.borrowings, public.digital_resources,
  public.resource_licences, public.reading_progress, public.bookmarks, public.shelf_items TO service_role;

ALTER TABLE public.authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.publishers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.physical_copies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.borrowings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.digital_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resource_licences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shelf_items ENABLE ROW LEVEL SECURITY;

-- ============ POLICIES: shared taxonomy ============
CREATE POLICY "read school or global authors" ON public.authors FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.is_active_member(school_id) OR public.is_school_admin(school_id) OR public.is_system_admin());
CREATE POLICY "school admins manage authors" ON public.authors FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage authors" ON public.authors FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "read school or global categories" ON public.categories FOR SELECT TO authenticated
  USING (school_id IS NULL OR public.is_active_member(school_id) OR public.is_school_admin(school_id) OR public.is_system_admin());
CREATE POLICY "school admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "authenticated read publishers" ON public.publishers FOR SELECT TO authenticated USING (true);
CREATE POLICY "system admins manage publishers" ON public.publishers FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ============ POLICIES: physical library ============
CREATE POLICY "members read school books" ON public.books FOR SELECT TO authenticated
  USING (public.is_active_member(school_id) OR public.is_school_admin(school_id) OR public.is_system_admin());
CREATE POLICY "school admins manage books" ON public.books FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage books" ON public.books FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "members read school copies" ON public.physical_copies FOR SELECT TO authenticated
  USING (public.is_active_member(school_id) OR public.is_school_admin(school_id) OR public.is_system_admin());
CREATE POLICY "school admins manage copies" ON public.physical_copies FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage copies" ON public.physical_copies FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "borrowers read own borrowings" ON public.borrowings FOR SELECT TO authenticated
  USING (borrower_id = auth.uid());
CREATE POLICY "school admins manage borrowings" ON public.borrowings FOR ALL TO authenticated
  USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));
CREATE POLICY "system admins manage borrowings" ON public.borrowings FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

-- ============ POLICIES: digital library ============
CREATE POLICY "members read school resources" ON public.digital_resources FOR SELECT TO authenticated
  USING (
    source_type = 'school'
      AND (public.is_active_member(school_id) OR public.is_school_admin(school_id))
  );
CREATE POLICY "members read licensed catalogue" ON public.digital_resources FOR SELECT TO authenticated
  USING (
    source_type = 'shelfi_catalogue' AND EXISTS (
      SELECT 1 FROM public.resource_licences l
      WHERE l.resource_id = digital_resources.id
        AND l.is_active
        AND (public.is_active_member(l.school_id) OR public.is_school_admin(l.school_id))
    )
  );
CREATE POLICY "school admins manage school resources" ON public.digital_resources FOR ALL TO authenticated
  USING (source_type = 'school' AND public.is_school_admin(school_id))
  WITH CHECK (source_type = 'school' AND public.is_school_admin(school_id));
CREATE POLICY "system admins manage resources" ON public.digital_resources FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "members read school licences" ON public.resource_licences FOR SELECT TO authenticated
  USING (public.is_active_member(school_id) OR public.is_school_admin(school_id) OR public.is_system_admin());
CREATE POLICY "system admins manage licences" ON public.resource_licences FOR ALL TO authenticated
  USING (public.is_system_admin()) WITH CHECK (public.is_system_admin());

CREATE POLICY "users manage own reading progress" ON public.reading_progress FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());
CREATE POLICY "school admins read reading progress" ON public.reading_progress FOR SELECT TO authenticated
  USING (public.is_school_admin(school_id));

CREATE POLICY "users manage own bookmarks" ON public.bookmarks FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());

CREATE POLICY "users manage own shelf" ON public.shelf_items FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());

-- ============ INDEXES ============
CREATE INDEX idx_profiles_school ON public.profiles(school_id);
CREATE INDEX idx_user_roles_user ON public.user_roles(user_id);
CREATE INDEX idx_books_school ON public.books(school_id);
CREATE INDEX idx_copies_book ON public.physical_copies(book_id);
CREATE INDEX idx_borrowings_school ON public.borrowings(school_id);
CREATE INDEX idx_borrowings_borrower ON public.borrowings(borrower_id);
CREATE INDEX idx_resources_school ON public.digital_resources(school_id);
CREATE INDEX idx_resources_source ON public.digital_resources(source_type);
CREATE INDEX idx_licences_school ON public.resource_licences(school_id);
CREATE INDEX idx_progress_user ON public.reading_progress(user_id);
CREATE INDEX idx_shelf_user ON public.shelf_items(user_id);

-- ============ UPDATED_AT TRIGGERS ============
CREATE TRIGGER t_schools_updated BEFORE UPDATE ON public.schools FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_books_updated BEFORE UPDATE ON public.books FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_copies_updated BEFORE UPDATE ON public.physical_copies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_borrowings_updated BEFORE UPDATE ON public.borrowings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_resources_updated BEFORE UPDATE ON public.digital_resources FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_licences_updated BEFORE UPDATE ON public.resource_licences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER t_progress_updated BEFORE UPDATE ON public.reading_progress FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();