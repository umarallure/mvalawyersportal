-- Belief Marketing broker retainer assignment email notifications.
--
-- This queues a special email only for David Wiley / Belief Marketing Inc.
-- when a lead is sent to one of his broker attorneys. The generic broker
-- in-app notification trigger remains unchanged.

ALTER TABLE public.notification_deliveries
  ADD COLUMN IF NOT EXISTS template_key text NOT NULL DEFAULT 'standard_notification_email',
  ADD COLUMN IF NOT EXISTS payload jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.notification_deliveries
  DROP CONSTRAINT IF EXISTS notification_deliveries_template_key_not_blank;

ALTER TABLE public.notification_deliveries
  ADD CONSTRAINT notification_deliveries_template_key_not_blank
  CHECK (btrim(template_key) <> '');

CREATE INDEX IF NOT EXISTS idx_notification_deliveries_template_key
  ON public.notification_deliveries(template_key, created_at DESC);

CREATE TABLE IF NOT EXISTS public.belief_broker_retainer_email_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  notification_type text NOT NULL,
  event_key text NOT NULL,
  broker_id uuid NOT NULL REFERENCES public.broker_profiles(user_id) ON DELETE CASCADE,
  broker_attorney_id uuid NOT NULL REFERENCES public.broker_attorneys(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  notification_id uuid NULL REFERENCES public.notifications(id) ON DELETE SET NULL,
  delivery_id uuid NULL REFERENCES public.notification_deliveries(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT belief_broker_retainer_email_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT belief_broker_retainer_email_notifications_event_key_key UNIQUE (
    broker_id,
    notification_type,
    event_key
  ),
  CONSTRAINT belief_broker_retainer_email_notifications_type_not_blank CHECK (btrim(notification_type) <> ''),
  CONSTRAINT belief_broker_retainer_email_notifications_event_key_not_blank CHECK (btrim(event_key) <> '')
);

CREATE INDEX IF NOT EXISTS idx_belief_broker_retainer_email_notifications_broker
  ON public.belief_broker_retainer_email_notifications(broker_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_belief_broker_retainer_email_notifications_lead
  ON public.belief_broker_retainer_email_notifications(lead_id);

CREATE INDEX IF NOT EXISTS idx_belief_broker_retainer_email_notifications_delivery
  ON public.belief_broker_retainer_email_notifications(delivery_id)
  WHERE delivery_id IS NOT NULL;

ALTER TABLE public.belief_broker_retainer_email_notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'belief_broker_retainer_email_notifications'
      AND policyname = 'belief_broker_retainer_email_notifications_broker_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY belief_broker_retainer_email_notifications_broker_select
        ON public.belief_broker_retainer_email_notifications
        FOR SELECT TO authenticated
        USING (broker_id = auth.uid())
    $policy$;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.notify_belief_broker_retainer_assignment_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_broker_id constant uuid := '1f66203d-b014-4bc4-9405-74072e32aca7';
  v_broker_id uuid;
  v_broker_attorney_id uuid;
  v_event_id uuid;
  v_notification_id uuid;
  v_delivery_id uuid;
  v_lead_name text;
  v_to_address text;
BEGIN
  IF NEW.assigned_broker_attorney_id IS NULL
    OR NEW.status IS DISTINCT FROM 'attorney_review'
    OR NEW.is_active IS DISTINCT FROM true
    OR (
      TG_OP = 'UPDATE'
      AND OLD.assigned_broker_attorney_id IS NOT DISTINCT FROM NEW.assigned_broker_attorney_id
      AND OLD.status IS NOT DISTINCT FROM NEW.status
    )
  THEN
    RETURN NEW;
  END IF;

  SELECT ba.broker_id, ba.id
  INTO v_broker_id, v_broker_attorney_id
  FROM public.broker_attorneys ba
  WHERE ba.id = NEW.assigned_broker_attorney_id
    AND ba.broker_id = v_target_broker_id
  LIMIT 1;

  IF v_broker_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(lower(btrim(bp.primary_email)), '')
  INTO v_to_address
  FROM public.broker_profiles bp
  WHERE bp.user_id = v_target_broker_id
  LIMIT 1;

  v_lead_name := nullif(btrim(coalesce(NEW.customer_full_name, NEW.submission_id, '')), '');

  INSERT INTO public.belief_broker_retainer_email_notifications (
    notification_type,
    event_key,
    broker_id,
    broker_attorney_id,
    lead_id
  )
  VALUES (
    'retainer_assignment',
    NEW.id::text,
    v_target_broker_id,
    v_broker_attorney_id,
    NEW.id
  )
  ON CONFLICT ON CONSTRAINT belief_broker_retainer_email_notifications_event_key_key DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT n.id
  INTO v_notification_id
  FROM public.notifications n
  WHERE n.recipient_id = v_target_broker_id
    AND n.category = 'new_lead'
    AND n.lead_id = NEW.id
  ORDER BY n.created_at ASC
  LIMIT 1;

  IF v_notification_id IS NULL THEN
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
      v_target_broker_id,
      auth.uid(),
      'new_lead',
      'New retainer sent',
      'A new retainer for ' || coalesce(v_lead_name, 'Unknown Client') || ' is ready in My Cases.',
      '/retainers/' || NEW.id,
      NEW.id,
      v_lead_name
    )
    RETURNING id INTO v_notification_id;
  END IF;

  UPDATE public.belief_broker_retainer_email_notifications
  SET notification_id = v_notification_id
  WHERE id = v_event_id;

  INSERT INTO public.notification_deliveries AS nd (
    notification_id,
    recipient_id,
    channel,
    to_address,
    status,
    max_attempts,
    next_attempt_at,
    last_error,
    template_key,
    payload
  )
  VALUES (
    v_notification_id,
    v_target_broker_id,
    'email',
    v_to_address,
    CASE WHEN v_to_address IS NULL THEN 'skipped' ELSE 'pending' END,
    30,
    now(),
    CASE WHEN v_to_address IS NULL THEN 'Missing Belief Marketing broker primary_email' ELSE NULL END,
    'belief_broker_retainer_assignment',
    jsonb_build_object(
      'broker_id', v_target_broker_id,
      'broker_attorney_id', v_broker_attorney_id,
      'lead_id', NEW.id
    )
  )
  ON CONFLICT (notification_id, channel) DO UPDATE
  SET
    to_address = EXCLUDED.to_address,
    template_key = EXCLUDED.template_key,
    payload = EXCLUDED.payload,
    max_attempts = greatest(nd.max_attempts, EXCLUDED.max_attempts),
    last_error = CASE
      WHEN EXCLUDED.to_address IS NULL THEN EXCLUDED.last_error
      ELSE nd.last_error
    END,
    status = CASE
      WHEN EXCLUDED.to_address IS NULL THEN 'skipped'
      WHEN nd.status = 'skipped' THEN 'pending'
      ELSE nd.status
    END,
    next_attempt_at = CASE
      WHEN EXCLUDED.to_address IS NOT NULL
       AND nd.status = 'skipped'
      THEN now()
      ELSE nd.next_attempt_at
    END
  RETURNING id INTO v_delivery_id;

  UPDATE public.belief_broker_retainer_email_notifications
  SET delivery_id = v_delivery_id
  WHERE id = v_event_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_z_belief_broker_retainer_email ON public.leads;

CREATE TRIGGER trg_notify_z_belief_broker_retainer_email
  AFTER INSERT OR UPDATE OF assigned_broker_attorney_id, status
  ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_belief_broker_retainer_assignment_email();

DROP FUNCTION IF EXISTS public.claim_pending_notification_email_deliveries(integer, text);

CREATE FUNCTION public.claim_pending_notification_email_deliveries(
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
  template_key text,
  payload jsonb,
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
      nd.max_attempts,
      nd.template_key,
      nd.payload
  )
  SELECT
    claimed.id,
    claimed.notification_id,
    claimed.recipient_id,
    claimed.to_address,
    claimed.attempt_count,
    claimed.max_attempts,
    claimed.template_key,
    claimed.payload,
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
