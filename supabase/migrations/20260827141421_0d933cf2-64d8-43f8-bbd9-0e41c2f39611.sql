CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  resource_id uuid NOT NULL REFERENCES public.digital_resources(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversations TO authenticated;
GRANT ALL ON public.ai_conversations TO service_role;
ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own conversations" ON public.ai_conversations
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Students create own conversations" ON public.ai_conversations
  FOR INSERT TO authenticated WITH CHECK (
    user_id = auth.uid()
    AND school_id = public.current_school_id()
    AND public.can_open_digital_resource(resource_id)
  );
CREATE POLICY "Students update own conversations" ON public.ai_conversations
  FOR UPDATE TO authenticated USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND school_id = public.current_school_id());
CREATE POLICY "Students delete own conversations" ON public.ai_conversations
  FOR DELETE TO authenticated USING (user_id = auth.uid());

CREATE INDEX idx_ai_conversations_user_resource
  ON public.ai_conversations (user_id, resource_id, updated_at DESC);

CREATE TRIGGER t_ai_conversations_updated
  BEFORE UPDATE ON public.ai_conversations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.ai_messages TO authenticated;
GRANT ALL ON public.ai_messages TO service_role;
ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own messages" ON public.ai_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Students add messages to own conversations" ON public.ai_messages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );
CREATE POLICY "Students delete own messages" ON public.ai_messages
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.ai_conversations c
            WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

CREATE INDEX idx_ai_messages_conversation ON public.ai_messages (conversation_id, created_at);

CREATE TABLE public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  resource_id uuid REFERENCES public.digital_resources(id) ON DELETE SET NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'ok',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.ai_usage_events TO authenticated;
GRANT ALL ON public.ai_usage_events TO service_role;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own usage" ON public.ai_usage_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "School staff read school usage" ON public.ai_usage_events
  FOR SELECT TO authenticated USING (public.is_school_staff(school_id));

CREATE INDEX idx_ai_usage_user_time ON public.ai_usage_events (user_id, created_at DESC);
CREATE INDEX idx_ai_usage_school_time ON public.ai_usage_events (school_id, created_at DESC);