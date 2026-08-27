
ALTER TABLE public.parent_student_relationships
  ADD CONSTRAINT psr_parent_profile_fkey FOREIGN KEY (parent_user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT psr_student_profile_fkey FOREIGN KEY (student_user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE;
