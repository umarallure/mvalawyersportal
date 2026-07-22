-- Classify the purpose of rows in the shared lawyer_lead_notes table.
-- Existing lawyer-onboarding clients omit note_type, so their notes remain
-- backward compatible and default to internal.

ALTER TABLE public.lawyer_lead_notes
  ADD COLUMN IF NOT EXISTS note_type text;

UPDATE public.lawyer_lead_notes
SET note_type = 'internal'
WHERE note_type IS NULL;

ALTER TABLE public.lawyer_lead_notes
  ALTER COLUMN note_type SET DEFAULT 'internal',
  ALTER COLUMN note_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lawyer_lead_notes_note_type_valid'
      AND conrelid = 'public.lawyer_lead_notes'::regclass
  ) THEN
    ALTER TABLE public.lawyer_lead_notes
      ADD CONSTRAINT lawyer_lead_notes_note_type_valid
      CHECK (note_type IN ('internal', 'lawyer_rejection'));
  END IF;
END $$;

COMMENT ON COLUMN public.lawyer_lead_notes.note_type IS
  'Note purpose. internal is used by onboarding/contact workflows; lawyer_rejection is an attorney rejection reason.';

CREATE INDEX IF NOT EXISTS lawyer_lead_notes_rejection_lookup_idx
  ON public.lawyer_lead_notes (lead_id, created_at DESC)
  WHERE note_type = 'lawyer_rejection';

-- The historical lawyer-portal rejection flow always created an
-- other_document Drop Letter immediately before its note. Reclassify only
-- those high-confidence matches, leaving ambiguous onboarding notes internal.
WITH candidates AS (
  SELECT
    n.id,
    row_number() OVER (
      PARTITION BY n.id
      ORDER BY abs(extract(epoch FROM (d.uploaded_at - n.created_at))), d.id
    ) AS note_match_rank,
    row_number() OVER (
      PARTITION BY d.id
      ORDER BY abs(extract(epoch FROM (d.uploaded_at - n.created_at))), n.id
    ) AS document_match_rank
  FROM public.lawyer_lead_notes n
  JOIN public.leads l ON l.id = n.lead_id
  JOIN public.lead_documents d
    ON d.submission_id = l.submission_id
   AND d.category IN ('other_document', 'drop_letter')
   AND d.uploaded_by = n.created_by
   AND abs(extract(epoch FROM (d.uploaded_at - n.created_at))) <= 5
  WHERE n.note_type = 'internal'
    AND nullif(btrim(n.note), '') IS NOT NULL
    AND n.created_by IS NOT NULL
), matches AS (
  SELECT id
  FROM candidates
  WHERE note_match_rank = 1
    AND document_match_rank = 1
)
UPDATE public.lawyer_lead_notes n
SET note_type = 'lawyer_rejection'
FROM matches m
WHERE n.id = m.id;

-- Browser clients can keep inserting ordinary internal notes. Rejection notes
-- have a different security meaning and may only be written by the trusted RPC
-- below, even if a client tries to spoof note_type.
CREATE OR REPLACE FUNCTION public.guard_lawyer_rejection_note_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('app.lawyer_rejection_note_write', true) = 'on' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.note_type = 'lawyer_rejection' THEN
      RAISE EXCEPTION 'Lawyer rejection notes are immutable' USING errcode = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF NEW.note_type = 'lawyer_rejection'
    OR (TG_OP = 'UPDATE' AND OLD.note_type = 'lawyer_rejection')
  THEN
    RAISE EXCEPTION 'Lawyer rejection notes must be written through the rejection workflow'
      USING errcode = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_lawyer_rejection_note_write ON public.lawyer_lead_notes;
CREATE TRIGGER trg_guard_lawyer_rejection_note_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.lawyer_lead_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_lawyer_rejection_note_write();

-- Complete the database part of a lawyer rejection atomically. The Drop Letter
-- is uploaded first, then its lead_documents row is bound to this request.
CREATE OR REPLACE FUNCTION public.reject_lawyer_lead(
  p_lead_id uuid,
  p_reason text,
  p_document_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role text;
  v_lead record;
  v_note public.lawyer_lead_notes%rowtype;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING errcode = '42501';
  END IF;

  IF char_length(v_reason) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'Rejection reason must contain between 1 and 4000 characters'
      USING errcode = '22023';
  END IF;

  SELECT
    l.id,
    l.submission_id,
    l.status,
    l.assigned_attorney_id
  INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id
  FOR UPDATE;

  IF v_lead.id IS NULL THEN
    RAISE EXCEPTION 'Lead not found' USING errcode = 'P0002';
  END IF;

  SELECT au.role INTO v_actor_role
  FROM public.app_users au
  WHERE au.user_id = v_actor_id;

  IF v_lead.assigned_attorney_id IS DISTINCT FROM v_actor_id
    AND coalesce(v_actor_role, '') NOT IN ('admin', 'super_admin', 'accounts')
  THEN
    RAISE EXCEPTION 'Only the assigned lawyer or an administrator may reject this lead'
      USING errcode = '42501';
  END IF;

  SELECT n.* INTO v_note
  FROM public.lawyer_lead_notes n
  WHERE n.lead_id = p_lead_id
    AND n.note_type = 'lawyer_rejection'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  IF v_lead.status = 'attorney_rejected' AND v_note.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'lead_id', p_lead_id,
      'note_id', v_note.id,
      'rejected_at', v_note.created_at
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.lead_documents d
    WHERE d.id = p_document_id
      AND d.submission_id = v_lead.submission_id
      AND d.category IN ('other_document', 'drop_letter')
      AND d.uploaded_by = v_actor_id
      AND d.status = 'uploaded'
  ) THEN
    RAISE EXCEPTION 'A valid Drop Letter uploaded by the current user is required'
      USING errcode = '22023';
  END IF;

  SELECT coalesce(
    nullif(btrim(au.display_name), ''),
    nullif(btrim(ap.full_name), ''),
    auth.jwt() ->> 'email'
  )
  INTO v_actor_name
  FROM (SELECT 1) seed
  LEFT JOIN public.app_users au ON au.user_id = v_actor_id
  LEFT JOIN public.attorney_profiles ap ON ap.user_id = v_actor_id;

  PERFORM set_config('app.lawyer_rejection_note_write', 'on', true);

  INSERT INTO public.lawyer_lead_notes (
    lead_id,
    note,
    created_by,
    created_by_name,
    note_type
  )
  VALUES (
    p_lead_id,
    v_reason,
    v_actor_id,
    v_actor_name,
    'lawyer_rejection'
  )
  RETURNING * INTO v_note;

  UPDATE public.leads
  SET status = 'attorney_rejected'
  WHERE id = p_lead_id;

  RETURN jsonb_build_object(
    'lead_id', p_lead_id,
    'note_id', v_note.id,
    'rejected_at', v_note.created_at
  );
END;
$$;

-- Rejected detail is deliberately a sanitized RPC. It mirrors the portal's
-- existing lawyer, staff, and center access rules and never returns PII.
CREATE OR REPLACE FUNCTION public.get_lawyer_rejected_lead_detail(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_lead_vendor text;
  v_lead record;
  v_note public.lawyer_lead_notes%rowtype;
  v_recipient_name text;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Authentication is required' USING errcode = '42501';
  END IF;

  SELECT au.role, c.lead_vendor
  INTO v_actor_role, v_actor_lead_vendor
  FROM public.app_users au
  LEFT JOIN public.centers c ON c.id = au.center_id
  WHERE au.user_id = v_actor_id;

  SELECT
    l.id,
    l.submission_id,
    l.status,
    l.assigned_attorney_id,
    l.lead_vendor
  INTO v_lead
  FROM public.leads l
  WHERE l.id = p_lead_id;

  IF v_lead.id IS NULL OR v_lead.status <> 'attorney_rejected' THEN
    RETURN NULL;
  END IF;

  IF NOT (
    (v_actor_role = 'lawyer' AND v_lead.assigned_attorney_id = v_actor_id)
    OR (v_actor_role IS NOT NULL AND v_actor_role <> 'lawyer')
    OR (v_actor_role IS NULL AND v_actor_lead_vendor IS NOT NULL AND v_actor_lead_vendor = v_lead.lead_vendor)
  ) THEN
    -- A rejected record must never fall through to the ordinary PII query.
    RAISE EXCEPTION 'Rejected lead not found' USING errcode = '42501';
  END IF;

  SELECT n.* INTO v_note
  FROM public.lawyer_lead_notes n
  WHERE n.lead_id = p_lead_id
    AND n.note_type = 'lawyer_rejection'
  ORDER BY n.created_at DESC, n.id DESC
  LIMIT 1;

  SELECT coalesce(ap.full_name, v_note.created_by_name) INTO v_recipient_name
  FROM (SELECT 1) seed
  LEFT JOIN public.attorney_profiles ap ON ap.user_id = v_lead.assigned_attorney_id;

  RETURN jsonb_build_object(
    'lead_id', v_lead.id,
    'submission_id', v_lead.submission_id,
    'status', v_lead.status,
    'assigned_attorney_id', v_lead.assigned_attorney_id,
    'assigned_attorney_name', v_recipient_name,
    'rejection_note', CASE WHEN v_note.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_note.id,
      'note', v_note.note,
      'created_at', v_note.created_at,
      'created_by', v_note.created_by,
      'created_by_name', v_note.created_by_name
    ) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.guard_lawyer_rejection_note_write() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_lawyer_lead(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_lawyer_rejected_lead_detail(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.reject_lawyer_lead(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_lawyer_rejected_lead_detail(uuid) TO authenticated;

COMMENT ON FUNCTION public.reject_lawyer_lead(uuid, text, uuid) IS
  'Atomically stores a classified lawyer rejection note and marks its lead rejected after validating access and the Drop Letter.';

COMMENT ON FUNCTION public.get_lawyer_rejected_lead_detail(uuid) IS
  'Returns a classified rejection reason and non-PII identifiers for an authorized rejected lead.';
