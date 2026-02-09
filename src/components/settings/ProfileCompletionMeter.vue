<script setup lang="ts">
import { computed } from 'vue'

interface ProfileData {
  // Tab 1: General Information
  fullName?: string
  firmName?: string
  barNumber?: string
  bio?: string
  yearsExperience?: number | string
  languages?: string[]
  directPhone?: string
  officeAddress?: string
  websiteUrl?: string
  preferredContact?: string
  assistantName?: string
  assistantEmail?: string
  
  // Tab 2: Expertise & Jurisdiction
  licensedStates?: string[]
  primaryCity?: string
  countiesCovered?: string[]
  federalCourts?: string
  primaryPracticeFocus?: string
  injuryCategories?: string[]
  exclusionaryCriteria?: string[]
  minimumCaseValue?: number | string
  
  // Tab 3: Capacity & Performance
  availabilityStatus?: string
  firmSize?: string
  caseManagementSoftware?: string
  insuranceCarriers?: string[]
  litigationStyle?: number
  largestSettlement?: number | string
  avgTimeToClose?: string
}

const props = defineProps<{
  profileData?: ProfileData
}>()

const requiredFields = [
  'fullName',
  'firmName',
  'barNumber',
  'languages',
  'directPhone',
  'officeAddress',
  'licensedStates',
  'primaryCity',
  'primaryPracticeFocus',
  'injuryCategories',
  'availabilityStatus'
]

const optionalFields = [
  'bio',
  'yearsExperience',
  'websiteUrl',
  'preferredContact',
  'assistantName',
  'assistantEmail',
  'countiesCovered',
  'federalCourts',
  'exclusionaryCriteria',
  'minimumCaseValue',
  'firmSize',
  'caseManagementSoftware',
  'insuranceCarriers',
  'litigationStyle',
  'largestSettlement',
  'avgTimeToClose'
]

const completionPercentage = computed(() => {
  if (!props.profileData) return 0
  
  let filledRequired = 0
  let filledOptional = 0
  
  requiredFields.forEach(field => {
    const value = props.profileData?.[field as keyof ProfileData]
    if (value !== undefined && value !== null && value !== '' && 
        (!Array.isArray(value) || value.length > 0)) {
      filledRequired++
    }
  })
  
  optionalFields.forEach(field => {
    const value = props.profileData?.[field as keyof ProfileData]
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

const completionColor = computed(() => {
  const pct = completionPercentage.value
  if (pct >= 80) return 'success'
  if (pct >= 50) return 'warning'
  return 'error'
})

const completionMessage = computed(() => {
  const pct = completionPercentage.value
  if (pct === 100) return 'Your profile is complete!'
  if (pct >= 80) return 'Almost there! Just a few more details.'
  if (pct >= 50) return 'Good progress. Keep going!'
  return 'Let\'s complete your profile to maximize case opportunities.'
})
</script>

<template>
  <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-shield-check" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-highlighted">
            Profile Completion
          </h3>
          <p class="text-xs text-muted mt-0.5">
            {{ completionMessage }}
          </p>
        </div>
      </div>
      <span
        class="text-2xl font-bold"
        :class="{
          'text-green-400': completionColor === 'success',
          'text-amber-400': completionColor === 'warning',
          'text-red-400': completionColor === 'error'
        }"
      >
        {{ completionPercentage }}%
      </span>
    </div>

    <div class="h-2 w-full overflow-hidden rounded-full bg-white/[0.06]">
      <div
        class="h-full rounded-full transition-all duration-500"
        :class="{
          'bg-green-400': completionColor === 'success',
          'bg-amber-400': completionColor === 'warning',
          'bg-red-400': completionColor === 'error'
        }"
        :style="{ width: `${completionPercentage}%` }"
      />
    </div>

    <div class="mt-3 flex items-center gap-5 text-xs text-muted">
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-check-circle" class="size-3.5 text-green-400/70" />
        <span>{{ requiredFields.filter(f => {
          const value = profileData?.[f as keyof ProfileData]
          return value !== undefined && value !== null && value !== '' &&
                 (!Array.isArray(value) || value.length > 0)
        }).length }} / {{ requiredFields.length }} Required</span>
      </div>
      <div class="flex items-center gap-1.5">
        <UIcon name="i-lucide-star" class="size-3.5 text-amber-400/70" />
        <span>{{ optionalFields.filter(f => {
          const value = profileData?.[f as keyof ProfileData]
          return value !== undefined && value !== null && value !== '' &&
                 (!Array.isArray(value) || value.length > 0)
        }).length }} / {{ optionalFields.length }} Optional</span>
      </div>
    </div>
  </div>
</template>
