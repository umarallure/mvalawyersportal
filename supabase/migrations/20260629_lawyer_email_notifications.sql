-- Lawyer email notifications and delivery queue.
--
-- The notifications table is shared by broker, lawyer, and publisher portals.
-- Keep this migration additive and role-neutral: do not change category values,
-- do not drop existing policies, and keep lawyer-specific idempotency in a
-- lawyer email sidecar table instead of adding portal-specific columns to notifications.

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created_at
  ON public.notifications(recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications(recipient_id, is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_lead_id
  ON public.notifications(lead_id)
  WHERE lead_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_invoice_id
  ON public.notifications(invoice_id)
  WHERE invoice_id IS NOT NULL;

-- Add recipient-only policies in an idempotent way. This migration intentionally
-- does not enable RLS on the shared notifications table; enabling it should be
-- done in a coordinated shared-portal hardening migration after broker and
-- publisher access paths are audited.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_recipient_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY notifications_recipient_select
        ON public.notifications FOR SELECT TO authenticated
        USING (recipient_id = auth.uid())
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_recipient_update_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY notifications_recipient_update_read
        ON public.notifications FOR UPDATE TO authenticated
        USING (recipient_id = auth.uid())
        WITH CHECK (
          recipient_id = auth.uid()
          AND is_read = true
        )
    $policy$;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notifications'
      AND policyname = 'notifications_recipient_delete'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY notifications_recipient_delete
        ON public.notifications FOR DELETE TO authenticated
        USING (recipient_id = auth.uid())
    $policy$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.lawyer_email_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  event_key text NOT NULL,
  lead_id uuid NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  attorney_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_id uuid NULL REFERENCES public.notifications(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lawyer_email_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT lawyer_email_notifications_event_key_key UNIQUE (attorney_id, notification_type, event_key),
  CONSTRAINT lawyer_email_notifications_type_not_blank CHECK (btrim(notification_type) <> ''),
  CONSTRAINT lawyer_email_notifications_event_key_not_blank CHECK (btrim(event_key) <> '')
);

CREATE INDEX IF NOT EXISTS idx_lawyer_email_notifications_attorney
  ON public.lawyer_email_notifications(attorney_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lawyer_email_notifications_type
  ON public.lawyer_email_notifications(notification_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lawyer_email_notifications_notification
  ON public.lawyer_email_notifications(notification_id)
  WHERE notification_id IS NOT NULL;

ALTER TABLE public.lawyer_email_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'lawyer_email_notifications'
      AND policyname = 'lawyer_email_notifications_attorney_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY lawyer_email_notifications_attorney_select
        ON public.lawyer_email_notifications FOR SELECT TO authenticated
        USING (attorney_id = auth.uid())
    $policy$;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'email',
  to_address text NULL,
  status text NOT NULL DEFAULT 'pending',
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz NULL,
  locked_by text NULL,
  sent_at timestamptz NULL,
  provider_message_id text NULL,
  last_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
  CONSTRAINT notification_deliveries_channel_check CHECK (channel = 'email'),
  CONSTRAINT notification_deliveries_status_check CHECK (
    status = ANY (ARRAY['pending', 'processing', 'sent', 'retry', 'failed', 'skipped']::text[])
  ),
  CONSTRAINT notification_deliveries_attempt_count_check CHECK (attempt_count >= 0),
  CONSTRAINT notification_deliveries_max_attempts_check CHECK (max_attempts >= 1),
  CONSTRAINT notification_deliveries_notification_channel_key UNIQUE (notification_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_status_next_attempt
  ON public.notification_deliveries(status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'retry', 'processing');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_recipient_created_at
  ON public.notification_deliveries(recipient_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_notification_deliveries_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'notification_deliveries_updated_at'
      AND tgrelid = 'public.notification_deliveries'::regclass
  ) THEN
    CREATE TRIGGER notification_deliveries_updated_at
      BEFORE UPDATE ON public.notification_deliveries
      FOR EACH ROW
      EXECUTE FUNCTION public.update_notification_deliveries_updated_at();
  END IF;
END $$;

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'notification_deliveries'
      AND policyname = 'notification_deliveries_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY notification_deliveries_select
        ON public.notification_deliveries FOR SELECT TO authenticated
        USING (recipient_id = auth.uid())
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_lawyer_case_assigned()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id uuid;
  v_notification_id uuid;
  v_lead_name text;
  v_to_address text;
BEGIN
  IF NEW.assigned_attorney_id IS NULL
    OR (
      TG_OP = 'UPDATE'
      AND OLD.assigned_attorney_id IS NOT DISTINCT FROM NEW.assigned_attorney_id
    )
  THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.app_users au
    WHERE au.user_id = NEW.assigned_attorney_id
      AND au.role = 'lawyer'
      AND (au.account_status IS NULL OR lower(au.account_status) NOT IN ('disabled', 'inactive', 'suspended'))
  ) THEN
    RETURN NEW;
  END IF;

  v_lead_name := nullif(btrim(coalesce(NEW.customer_full_name, NEW.submission_id, '')), '');

  INSERT INTO public.lawyer_email_notifications (
    notification_type,
    event_key,
    lead_id,
    attorney_id
  )
  VALUES (
    'case_assignment',
    NEW.id::text,
    NEW.id,
    NEW.assigned_attorney_id
  )
  ON CONFLICT ON CONSTRAINT lawyer_email_notifications_event_key_key DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (
    recipient_id,
    actor_id,
    category,
    title,
    description,
    redirect_url,
    lead_id,
    lead_name
  )
  VALUES (
    NEW.assigned_attorney_id,
    auth.uid(),
    'new_lead',
    'New case assigned',
    'A new case for ' || coalesce(v_lead_name, 'Unknown Client') || ' is ready in My Cases.',
    '/retainers/' || NEW.id,
    NEW.id,
    v_lead_name
  )
  RETURNING id INTO v_notification_id;

  UPDATE public.lawyer_email_notifications
  SET notification_id = v_notification_id
  WHERE id = v_event_id;

  SELECT nullif(lower(btrim(primary_email)), '')
  INTO v_to_address
  FROM public.attorney_profiles
  WHERE user_id = NEW.assigned_attorney_id
  LIMIT 1;

  INSERT INTO public.notification_deliveries (
    notification_id,
    recipient_id,
    channel,
    to_address,
    status,
    next_attempt_at,
    last_error
  )
  VALUES (
    v_notification_id,
    NEW.assigned_attorney_id,
    'email',
    v_to_address,
    CASE WHEN v_to_address IS NULL THEN 'skipped' ELSE 'pending' END,
    now(),
    CASE WHEN v_to_address IS NULL THEN 'Missing attorney primary_email' ELSE NULL END
  )
  ON CONFLICT (notification_id, channel) DO NOTHING;

  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_notify_lawyer_case_assigned'
      AND tgrelid = 'public.leads'::regclass
  ) THEN
    CREATE TRIGGER trg_notify_lawyer_case_assigned
      AFTER INSERT OR UPDATE OF assigned_attorney_id
      ON public.leads
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_lawyer_case_assigned();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.claim_pending_notification_email_deliveries(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT NULL
)
RETURNS TABLE (
  delivery_id uuid,
  notification_id uuid,
  recipient_id uuid,
  to_address text,
  attempt_count integer,
  max_attempts integer,
  title text,
  description text,
  redirect_url text,
  lead_id uuid,
  lead_name text,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT nd.id
    FROM public.notification_deliveries nd
    WHERE nd.channel = 'email'
      AND nd.to_address IS NOT NULL
      AND nd.attempt_count < nd.max_attempts
      AND (
        (nd.status IN ('pending', 'retry') AND nd.next_attempt_at <= now())
        OR (nd.status = 'processing' AND nd.locked_at < now() - interval '15 minutes')
      )
    ORDER BY nd.next_attempt_at ASC, nd.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT least(greatest(coalesce(p_limit, 10), 1), 50)
  ),
  claimed AS (
    UPDATE public.notification_deliveries nd
    SET
      status = 'processing',
      locked_at = now(),
      locked_by = coalesce(nullif(btrim(p_worker_id), ''), 'notification-email-worker'),
      attempt_count = nd.attempt_count + 1
    FROM candidates
    WHERE nd.id = candidates.id
    RETURNING
      nd.id,
      nd.notification_id,
      nd.recipient_id,
      nd.to_address,
      nd.attempt_count,
      nd.max_attempts
  )
  SELECT
    claimed.id,
    claimed.notification_id,
    claimed.recipient_id,
    claimed.to_address,
    claimed.attempt_count,
    claimed.max_attempts,
    n.title::text,
    n.description,
    n.redirect_url::text,
    n.lead_id,
    n.lead_name,
    n.created_at
  FROM claimed
  JOIN public.notifications n ON n.id = claimed.notification_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_notification_email_deliveries(integer, text) TO service_role;

NOTIFY pgrst, 'reload schema';
