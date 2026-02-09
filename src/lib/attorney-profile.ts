import { supabase } from './supabase'

export interface AttorneyProfileData {
  // Tab 1: General Information
  profile_photo_url?: string | null
  full_name: string
  firm_name: string
  bar_association_number: string
  professional_bio?: string | null
  years_experience?: number | null
  languages_spoken: string[]
  primary_email: string
  direct_phone: string
  office_address: string
  website_url?: string | null
  preferred_contact_method?: 'email' | 'phone' | 'text' | null
  assistant_name?: string | null
  assistant_email?: string | null
  blocked_states?: string[] | null
  
  // Tab 2: Expertise & Jurisdiction
  licensed_states: string[]
  primary_city: string
  counties_covered?: string[]
  federal_court_admissions?: string | null
  primary_practice_focus: string
  injury_categories: string[]
  exclusionary_criteria?: string[]
  minimum_case_value?: number | null
  
  // Tab 3: Capacity & Performance
  availability_status?: 'accepting' | 'at_capacity' | 'on_leave' | null
  firm_size?: 'solo' | 'small' | 'medium' | 'large' | null
  case_management_software?: string | null
  insurance_carriers_handled?: string[]
  litigation_style?: number | null
  largest_settlement_amount?: number | null
  avg_time_to_close?: string | null
}

/**
 * Save or update attorney profile using Supabase client
 */
export async function saveAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .upsert({
      user_id: userId,
      ...data
    }, {
      onConflict: 'user_id'
    })
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to save attorney profile')
  }

  return profile
}

/**
 * Partially update attorney profile without touching other columns.
 * This is important for per-tab saves so we don't overwrite other tab fields.
 */
export async function patchAttorneyProfile(
  userId: string,
  data: Partial<AttorneyProfileData>
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update(data)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update attorney profile')
  }

  return profile
}

/**
 * Get attorney profile for current user
 */
export async function getAttorneyProfile(userId: string) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new Error(error.message || 'Failed to fetch attorney profile')
  }

  return profile
}

/**
 * Update only availability status (quick toggle)
 */
export async function updateAvailabilityStatus(
  userId: string,
  status: 'accepting' | 'at_capacity' | 'on_leave'
) {
  const { data: profile, error } = await supabase
    .from('attorney_profiles')
    .update({ availability_status: status })
    .eq('user_id', userId)
    .select()
    .single()

  if (error) {
    throw new Error(error.message || 'Failed to update availability status')
  }

  return profile
}

export async function getAttorneyNameMapByUserIds(userIds: string[]) {
  const ids = Array.from(new Set(userIds.map(v => String(v)).filter(Boolean)))
  if (!ids.length) return {} as Record<string, string>

  const { data: profiles, error: profileErr } = await supabase
    .from('attorney_profiles')
    .select('user_id,full_name')
    .in('user_id', ids)

  if (profileErr) {
    throw new Error(profileErr.message || 'Failed to fetch attorney profiles')
  }

  const profileNameById: Record<string, string> = {}
  const profileNameRawById: Record<string, string | null> = {}
  for (const p of (profiles ?? []) as Array<{ user_id: string; full_name: string | null }>) {
    profileNameRawById[p.user_id] = p.full_name
    const name = (p.full_name ?? '').trim()
    if (name) profileNameById[p.user_id] = name
  }

  const missingIds = ids.filter((id) => {
    const raw = profileNameRawById[id]
    return !raw || !raw.trim()
  })

  if (!missingIds.length) return profileNameById

  const { data: users, error: userErr } = await supabase
    .from('app_users')
    .select('user_id,display_name')
    .in('user_id', missingIds)

  if (userErr) {
    throw new Error(userErr.message || 'Failed to fetch app user display names')
  }

  for (const u of (users ?? []) as Array<{ user_id: string; display_name: string | null }>) {
    const name = (u.display_name ?? '').trim()
    if (name) profileNameById[u.user_id] = name
  }

  return profileNameById
}
