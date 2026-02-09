import { ref, readonly, computed, watch } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import { getAttorneyProfile, patchAttorneyProfile, saveAttorneyProfile, type AttorneyProfileData } from '../lib/attorney-profile'

export interface AttorneyProfileState {
  // Tab 1: General Information
  profilePhoto?: string
  fullName?: string
  firmName?: string
  barNumber?: string
  bio?: string
  yearsExperience?: number
  languages?: string[]
  primaryEmail?: string
  directPhone?: string
  officeAddress?: string
  websiteUrl?: string
  preferredContact?: 'email' | 'phone' | 'text'
  assistantName?: string
  assistantEmail?: string
  blockedStates?: string[]
  
  // Tab 2: Expertise & Jurisdiction
  licensedStates?: string[]
  primaryCity?: string
  countiesCovered?: string[]
  federalCourts?: string
  primaryPracticeFocus?: string
  injuryCategories?: string[]
  exclusionaryCriteria?: string[]
  minimumCaseValue?: number
  
  // Tab 3: Capacity & Performance
  availabilityStatus?: 'accepting' | 'at_capacity' | 'on_leave'
  firmSize?: 'solo' | 'small' | 'medium' | 'large'
  caseManagementSoftware?: string
  insuranceCarriers?: string[]
  litigationStyle?: number
  largestSettlement?: number
  avgTimeToClose?: string
}

const _useAttorneyProfile = () => {
  const state = ref<AttorneyProfileState>({})
  const draft = ref<AttorneyProfileState>({})
  const loading = ref(false)
  const loaded = ref(false)
  const hasRow = ref(false)

  const isEditing = ref(false)
  const isDirty = ref(false)
  const baseline = ref<string>('')

  const clone = <T>(v: T): T => {
    return JSON.parse(JSON.stringify(v)) as T
  }

  const toDbPatch = (data: Partial<AttorneyProfileState>): Partial<AttorneyProfileData> => {
    const out: Partial<AttorneyProfileData> = {}

    if ('profilePhoto' in data) out.profile_photo_url = data.profilePhoto ? data.profilePhoto : null
    if ('fullName' in data) out.full_name = data.fullName ?? ''
    if ('firmName' in data) out.firm_name = data.firmName ?? ''
    if ('barNumber' in data) out.bar_association_number = data.barNumber ?? ''
    if ('bio' in data) out.professional_bio = data.bio ? data.bio : null
    if ('yearsExperience' in data) out.years_experience = data.yearsExperience ?? null
    if ('languages' in data) out.languages_spoken = data.languages ?? []
    if ('primaryEmail' in data) out.primary_email = data.primaryEmail ?? ''
    if ('directPhone' in data) out.direct_phone = data.directPhone ?? ''
    if ('officeAddress' in data) out.office_address = data.officeAddress ?? ''
    if ('websiteUrl' in data) out.website_url = data.websiteUrl ? data.websiteUrl : null
    if ('preferredContact' in data) out.preferred_contact_method = data.preferredContact ?? null
    if ('assistantName' in data) out.assistant_name = data.assistantName ? data.assistantName : null
    if ('assistantEmail' in data) out.assistant_email = data.assistantEmail ? data.assistantEmail : null
    if ('blockedStates' in data) out.blocked_states = data.blockedStates ?? []

    if ('licensedStates' in data) out.licensed_states = data.licensedStates ?? []
    if ('primaryCity' in data) out.primary_city = data.primaryCity ?? ''
    if ('countiesCovered' in data) out.counties_covered = data.countiesCovered ?? []
    if ('federalCourts' in data) out.federal_court_admissions = data.federalCourts ? data.federalCourts : null

    if ('primaryPracticeFocus' in data) out.primary_practice_focus = data.primaryPracticeFocus ?? ''
    if ('injuryCategories' in data) out.injury_categories = data.injuryCategories ?? []
    if ('exclusionaryCriteria' in data) out.exclusionary_criteria = data.exclusionaryCriteria ?? []
    if ('minimumCaseValue' in data) out.minimum_case_value = data.minimumCaseValue ?? null

    if ('availabilityStatus' in data) out.availability_status = data.availabilityStatus ?? null
    if ('firmSize' in data) out.firm_size = data.firmSize ?? null
    if ('caseManagementSoftware' in data) out.case_management_software = data.caseManagementSoftware ? data.caseManagementSoftware : null
    if ('insuranceCarriers' in data) out.insurance_carriers_handled = data.insuranceCarriers ?? []
    if ('litigationStyle' in data) out.litigation_style = data.litigationStyle ?? null
    if ('largestSettlement' in data) out.largest_settlement_amount = data.largestSettlement ?? null
    if ('avgTimeToClose' in data) out.avg_time_to_close = data.avgTimeToClose ? data.avgTimeToClose : null

    return out
  }

  const mapDatabaseToState = (dbProfile: any): AttorneyProfileState => {
    return {
      profilePhoto: dbProfile.profile_photo_url || '',
      fullName: dbProfile.full_name || '',
      firmName: dbProfile.firm_name || '',
      barNumber: dbProfile.bar_association_number || '',
      bio: dbProfile.professional_bio || '',
      yearsExperience: dbProfile.years_experience || undefined,
      languages: dbProfile.languages_spoken || [],
      primaryEmail: dbProfile.primary_email || '',
      directPhone: dbProfile.direct_phone || '',
      officeAddress: dbProfile.office_address || '',
      websiteUrl: dbProfile.website_url || '',
      preferredContact: dbProfile.preferred_contact_method || 'email',
      assistantName: dbProfile.assistant_name || '',
      assistantEmail: dbProfile.assistant_email || '',
      blockedStates: dbProfile.blocked_states || [],
      licensedStates: dbProfile.licensed_states || [],
      primaryCity: dbProfile.primary_city || '',
      countiesCovered: dbProfile.counties_covered || [],
      federalCourts: dbProfile.federal_court_admissions || '',
      primaryPracticeFocus: dbProfile.primary_practice_focus || '',
      injuryCategories: dbProfile.injury_categories || [],
      exclusionaryCriteria: dbProfile.exclusionary_criteria || [],
      minimumCaseValue: dbProfile.minimum_case_value || undefined,
      availabilityStatus: dbProfile.availability_status || undefined,
      firmSize: dbProfile.firm_size || undefined,
      caseManagementSoftware: dbProfile.case_management_software || '',
      insuranceCarriers: dbProfile.insurance_carriers_handled || [],
      litigationStyle: dbProfile.litigation_style || 3,
      largestSettlement: dbProfile.largest_settlement_amount || undefined,
      avgTimeToClose: dbProfile.avg_time_to_close || ''
    }
  }

  const loadProfile = async (userId: string) => {
    if (loaded.value) return

    loading.value = true
    try {
      const profile = await getAttorneyProfile(userId)
      if (profile) {
        state.value = mapDatabaseToState(profile)
        hasRow.value = true
      } else {
        hasRow.value = false
      }

      if (!isEditing.value) {
        draft.value = clone(state.value)
        baseline.value = JSON.stringify(draft.value)
        isDirty.value = false
      }

      loaded.value = true
    } catch (error) {
      console.error('Failed to load attorney profile:', error)
    } finally {
      loading.value = false
    }
  }

  const saveProfile = async (userId: string, data: Partial<AttorneyProfileState>) => {
    loading.value = true
    try {
      // Merge with existing state
      const mergedData = { ...state.value, ...data }
      
      // Map frontend fields to database fields
      const dbData: Partial<AttorneyProfileData> = {
        profile_photo_url: mergedData.profilePhoto || null,
        full_name: mergedData.fullName!,
        firm_name: mergedData.firmName!,
        bar_association_number: mergedData.barNumber!,
        professional_bio: mergedData.bio || null,
        years_experience: mergedData.yearsExperience || null,
        languages_spoken: mergedData.languages || [],
        primary_email: mergedData.primaryEmail!,
        direct_phone: mergedData.directPhone!,
        office_address: mergedData.officeAddress!,
        website_url: mergedData.websiteUrl || null,
        preferred_contact_method: mergedData.preferredContact || null,
        assistant_name: mergedData.assistantName || null,
        assistant_email: mergedData.assistantEmail || null,
        licensed_states: mergedData.licensedStates || [],
        primary_city: mergedData.primaryCity!,
        counties_covered: mergedData.countiesCovered || [],
        federal_court_admissions: mergedData.federalCourts || null,
        primary_practice_focus: mergedData.primaryPracticeFocus!,
        injury_categories: mergedData.injuryCategories || [],
        exclusionary_criteria: mergedData.exclusionaryCriteria || [],
        minimum_case_value: mergedData.minimumCaseValue || null,
        availability_status: mergedData.availabilityStatus || null,
        firm_size: mergedData.firmSize || null,
        case_management_software: mergedData.caseManagementSoftware || null,
        insurance_carriers_handled: mergedData.insuranceCarriers || [],
        litigation_style: mergedData.litigationStyle || null,
        largest_settlement_amount: mergedData.largestSettlement || null,
        avg_time_to_close: mergedData.avgTimeToClose || null
      }

      const profile = await saveAttorneyProfile(userId, dbData)
      if (profile) {
        state.value = mapDatabaseToState(profile)
        draft.value = clone(state.value)
        baseline.value = JSON.stringify(draft.value)
        isDirty.value = false
        loaded.value = true
      }
      return profile
    } finally {
      loading.value = false
    }
  }

  const startEditing = () => {
    if (isEditing.value) return
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
    isEditing.value = true
  }

  const cancelEditing = () => {
    draft.value = clone(state.value)
    baseline.value = JSON.stringify(draft.value)
    isDirty.value = false
    isEditing.value = false
  }

  const commitEditing = async (userId: string, fields?: Array<keyof AttorneyProfileState>) => {
    const selected = fields ?? []
    const partial: Partial<AttorneyProfileState> = {}
    for (const key of selected) {
      ;(partial as any)[key] = (draft.value as any)[key]
    }

    loading.value = true
    try {
      const result = hasRow.value
        ? await patchAttorneyProfile(userId, toDbPatch(partial))
        : await saveAttorneyProfile(userId, toDbPatch(partial))

      state.value = mapDatabaseToState(result)
      draft.value = clone(state.value)
      baseline.value = JSON.stringify(draft.value)
      isDirty.value = false
      isEditing.value = false
      hasRow.value = true
      return result
    } finally {
      loading.value = false
    }
  }

  watch(
    draft,
    () => {
      if (!isEditing.value) return
      isDirty.value = JSON.stringify(draft.value) !== baseline.value
    },
    { deep: true }
  )

  const resetProfile = () => {
    state.value = {}
    loaded.value = false
    hasRow.value = false
  }

  const completionPercentage = computed(() => {
    const requiredFields = [
      'fullName', 'firmName', 'barNumber', 'languages', 'directPhone',
      'officeAddress', 'licensedStates', 'primaryCity', 'primaryPracticeFocus',
      'injuryCategories'
    ]

    const optionalFields = [
      'bio', 'yearsExperience', 'websiteUrl', 'preferredContact',
      'assistantName', 'assistantEmail', 'countiesCovered', 'federalCourts',
      'exclusionaryCriteria', 'minimumCaseValue', 'availabilityStatus', 'firmSize',
      'caseManagementSoftware', 'insuranceCarriers', 'litigationStyle',
      'largestSettlement', 'avgTimeToClose'
    ]

    let filledRequired = 0
    let filledOptional = 0

    requiredFields.forEach(field => {
      const value = state.value[field as keyof AttorneyProfileState]
      if (value !== undefined && value !== null && value !== '' &&
          (!Array.isArray(value) || value.length > 0)) {
        filledRequired++
      }
    })

    optionalFields.forEach(field => {
      const value = state.value[field as keyof AttorneyProfileState]
      if (value !== undefined && value !== null && value !== '' &&
          (!Array.isArray(value) || value.length > 0)) {
        filledOptional++
      }
    })

    const requiredWeight = 0.7
    const optionalWeight = 0.3

    const requiredScore = (filledRequired / requiredFields.length) * requiredWeight
    const optionalScore = (filledOptional / optionalFields.length) * optionalWeight

    return Math.round((requiredScore + optionalScore) * 100)
  })

  return {
    state: readonly(state),
    draft,
    loading: readonly(loading),
    loaded: readonly(loaded),
    isEditing: readonly(isEditing),
    isDirty: readonly(isDirty),
    completionPercentage,
    loadProfile,
    saveProfile,
    startEditing,
    cancelEditing,
    commitEditing,
    resetProfile
  }
}

export const useAttorneyProfile = createSharedComposable(_useAttorneyProfile)
