ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'librarian';
ALTER TYPE public.membership_status ADD VALUE IF NOT EXISTS 'rejected';

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_identifier text;
ALTER TABLE public.school_join_requests ADD COLUMN IF NOT EXISTS requested_role public.app_role NOT NULL DEFAULT 'student';
ALTER TABLE public.school_join_requests ADD COLUMN IF NOT EXISTS decision_note text;