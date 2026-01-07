/**
 * Centers Management Library
 * Direct Supabase client operations for centers CRUD
 */

import { supabase } from './supabase'

export type CenterRow = {
  id: string
  user_id: string | null
  center_name: string
  lead_vendor: string | null
  contact_email: string | null
  created_at: string
}

/**
 * List all centers
 */
export async function listCenters() {
  const { data, error } = await supabase
    .from('centers')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data as CenterRow[]
}

/**
 * Create a new center
 */
export async function createCenter(input: {
  center_name: string
  lead_vendor?: string
  contact_email?: string
}) {
  const { data, error } = await supabase
    .from('centers')
    .insert({
      center_name: input.center_name,
      lead_vendor: input.lead_vendor || null,
      contact_email: input.contact_email || null
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as CenterRow
}

/**
 * Update an existing center
 */
export async function updateCenter(
  id: string,
  input: {
    center_name?: string
    lead_vendor?: string
    contact_email?: string
  }
) {
  const updates: Record<string, unknown> = {}
  if (input.center_name !== undefined) updates.center_name = input.center_name
  if (input.lead_vendor !== undefined) updates.lead_vendor = input.lead_vendor || null
  if (input.contact_email !== undefined) updates.contact_email = input.contact_email || null

  const { data, error } = await supabase
    .from('centers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as CenterRow
}

/**
 * Delete a center
 */
export async function deleteCenter(id: string) {
  const { error } = await supabase
    .from('centers')
    .delete()
    .eq('id', id)

  if (error) throw new Error(error.message)
  return { ok: true }
}
