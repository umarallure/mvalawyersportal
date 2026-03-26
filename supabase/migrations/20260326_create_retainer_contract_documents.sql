-- Create new table for multi-state retainer contract documents
CREATE TABLE IF NOT EXISTS retainer_contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  document_path TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_mime_type TEXT NOT NULL,
  document_size_bytes INTEGER NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_user_state UNIQUE (user_id, state)
);

-- Create index for faster user queries
CREATE INDEX IF NOT EXISTS idx_retainer_documents_user 
  ON retainer_contract_documents(user_id);

-- Grant access
GRANT ALL ON retainer_contract_documents TO authenticated;
GRANT ALL ON retainer_contract_documents TO anon;

-- Enable RLS
ALTER TABLE retainer_contract_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own documents
DROP POLICY IF EXISTS retainer_contract_documents_select ON retainer_contract_documents;
CREATE POLICY retainer_contract_documents_select ON retainer_contract_documents
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

-- RLS Policy: Users can insert their own documents
DROP POLICY IF EXISTS retainer_contract_documents_insert ON retainer_contract_documents;
CREATE POLICY retainer_contract_documents_insert ON retainer_contract_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

-- RLS Policy: Users can update their own documents
DROP POLICY IF EXISTS retainer_contract_documents_update ON retainer_contract_documents;
CREATE POLICY retainer_contract_documents_update ON retainer_contract_documents
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

-- RLS Policy: Users can delete their own documents
DROP POLICY IF EXISTS retainer_contract_documents_delete ON retainer_contract_documents;
CREATE POLICY retainer_contract_documents_delete ON retainer_contract_documents
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.app_users
      WHERE app_users.user_id = auth.uid()
        AND app_users.role IN ('super_admin', 'admin')
    )
  );

-- Migrate existing documents from attorney_profiles to new table
DO $$
DECLARE
  rec RECORD;
  v_user_id UUID;
  v_state TEXT;
  v_licensed_states TEXT[];
BEGIN
  FOR rec IN 
    SELECT user_id, retainer_contract_document_path, retainer_contract_document_name, 
           retainer_contract_document_mime_type, retainer_contract_document_size_bytes,
           retainer_contract_document_uploaded_at, licensed_states
    FROM public.attorney_profiles
    WHERE retainer_contract_document_path IS NOT NULL
      AND retainer_contract_document_name IS NOT NULL
  LOOP
    v_user_id := rec.user_id;
    v_licensed_states := rec.licensed_states;
    
    -- Use first licensed state if available, otherwise use 'CA' as default
    IF array_length(v_licensed_states, 1) > 0 THEN
      v_state := v_licensed_states[1];
    ELSE
      v_state := 'CA';
    END IF;
    
    -- Insert into new table
    INSERT INTO retainer_contract_documents (
      user_id,
      state,
      document_path,
      document_name,
      document_mime_type,
      document_size_bytes,
      notes,
      created_at,
      updated_at
    ) VALUES (
      v_user_id,
      v_state,
      rec.retainer_contract_document_path,
      rec.retainer_contract_document_name,
      rec.retainer_contract_document_mime_type,
      rec.retainer_contract_document_size_bytes,
      NULL,
      COALESCE(rec.retainer_contract_document_uploaded_at, NOW()),
      NOW()
    );
  END LOOP;
END $$;

-- Clear old document columns from attorney_profiles
ALTER TABLE public.attorney_profiles 
  DROP COLUMN IF EXISTS retainer_contract_document_path,
  DROP COLUMN IF EXISTS retainer_contract_document_name,
  DROP COLUMN IF EXISTS retainer_contract_document_mime_type,
  DROP COLUMN IF EXISTS retainer_contract_document_size_bytes,
  DROP COLUMN IF EXISTS retainer_contract_document_uploaded_at;

notify pgrst, 'reload schema';
