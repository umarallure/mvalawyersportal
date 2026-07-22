-- Run after 20260722050000_classify_lawyer_lead_notes.sql against a
-- disposable/staging database:
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/lawyer_lead_note_classification_contract.sql

BEGIN;

DO $$
DECLARE
  v_note_type text;
  v_function regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lawyer_lead_notes'
      AND column_name = 'note_type'
      AND is_nullable = 'NO'
      AND column_default = '''internal''::text'
  ) THEN
    RAISE EXCEPTION 'lawyer_lead_notes.note_type is missing or not backward compatible';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lawyer_lead_notes_note_type_valid'
      AND conrelid = 'public.lawyer_lead_notes'::regclass
  ) THEN
    RAISE EXCEPTION 'lawyer_lead_notes.note_type is not constrained';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'lawyer_lead_notes'
      AND indexname = 'lawyer_lead_notes_rejection_lookup_idx'
  ) THEN
    RAISE EXCEPTION 'Classified rejection-note lookup index is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.lawyer_lead_notes'::regclass
      AND tgname = 'trg_guard_lawyer_rejection_note_write'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Classified lawyer rejection notes are not guarded';
  END IF;

  FOREACH v_function IN ARRAY ARRAY[
    'public.reject_lawyer_lead(uuid,text,uuid)'::regprocedure,
    'public.get_lawyer_rejected_lead_detail(uuid)'::regprocedure
  ] LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_proc p
      WHERE p.oid = v_function
        AND p.prosecdef
        AND EXISTS (
          SELECT 1
          FROM unnest(coalesce(p.proconfig, ARRAY[]::text[])) setting
          WHERE setting LIKE 'search_path=%'
        )
    ) THEN
      RAISE EXCEPTION 'RPC % is not SECURITY DEFINER with a fixed search_path', v_function;
    END IF;
  END LOOP;

  INSERT INTO public.lawyer_lead_notes (lead_id, note)
  VALUES (gen_random_uuid(), 'onboarding-compatible internal note')
  RETURNING note_type INTO v_note_type;

  IF v_note_type IS DISTINCT FROM 'internal' THEN
    RAISE EXCEPTION 'Unclassified onboarding notes do not default to internal';
  END IF;

  BEGIN
    INSERT INTO public.lawyer_lead_notes (lead_id, note, note_type)
    VALUES (gen_random_uuid(), 'must be rejected', 'lawyer_rejection');
    RAISE EXCEPTION 'Direct lawyer_rejection insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      NULL;
  END;
END $$;

ROLLBACK;

