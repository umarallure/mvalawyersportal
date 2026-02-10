<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const expertiseSchema = z.object({
  licensedStates: z.array(z.string()).min(1, 'At least one state is required'),
  primaryCity: z.string().min(2, 'Primary physical location is required'),
  countiesCovered: z.array(z.string()).optional(),
  federalCourts: z.string().optional(),
  primaryPracticeFocus: z.string().min(1, 'Practice focus is required'),
  injuryCategories: z.array(z.string()).min(1, 'At least one injury category is required'),
  exclusionaryCriteria: z.array(z.string()).optional(),
  minimumCaseValue: z.number().min(0).optional().or(z.literal(''))
})

type ExpertiseSchema = z.output<typeof expertiseSchema>

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as { value: Partial<ExpertiseSchema> }

const stateOptions = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
]

const practiceFocusOptions = [
  'Personal Injury',
  'Medical Malpractice',
  'Workers Compensation',
  'Product Liability',
  'Wrongful Death',
  'Mass Torts',
  'Class Actions'
]

const injuryCategoryOptions = [
  'Auto Accidents',
  'Truck Accidents',
  'Motorcycle Accidents',
  'Pedestrian Accidents',
  'Slip and Fall',
  'Medical Malpractice',
  'Nursing Home Abuse',
  'Birth Injuries',
  'Workplace Injuries',
  'Construction Accidents',
  'Dog Bites',
  'Defective Products',
  'Toxic Exposure',
  'Brain Injuries',
  'Spinal Cord Injuries',
  'Burn Injuries',
  'Wrongful Death'
]

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
  }

  if (attorneyProfile.isEditing.value && !attorneyProfile.isDirty.value) {
    attorneyProfile.cancelEditing()
  }
})

async function onSubmit(event: FormSubmitEvent<ExpertiseSchema>) {
  if (!userId.value) return

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'licensedStates',
      'primaryCity',
      'countiesCovered',
      'federalCourts',
      'primaryPracticeFocus',
      'injuryCategories',
      'exclusionaryCriteria',
      'minimumCaseValue'
    ])
    
    toast.add({
      title: 'Success',
      description: 'Your expertise and jurisdiction settings have been updated.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to update profile'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}

const disabled = computed(() => !attorneyProfile.isEditing.value)

const isEditing = computed(() => attorneyProfile.isEditing.value)

const cancelEditing = () => {
  attorneyProfile.cancelEditing()
}

const startEditing = () => {
  attorneyProfile.startEditing()
}

const unsavedOpen = ref(false)
const pendingNav = ref<null | (() => void)>(null)

const confirmLeave = () => {
  unsavedOpen.value = true
}

const handleConfirmDiscard = () => {
  attorneyProfile.cancelEditing()
  unsavedOpen.value = false
  const go = pendingNav.value
  pendingNav.value = null
  go?.()
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((to, from, next) => {
  if (attorneyProfile.isEditing.value && attorneyProfile.isDirty.value) {
    pendingNav.value = () => next()
    confirmLeave()
    next(false)
    return
  }

  next()
})
</script>

<template>
  <UnsavedChangesModal
    :open="unsavedOpen"
    @update:open="(v) => { unsavedOpen = v }"
    @confirm="handleConfirmDiscard"
    @cancel="handleStay"
  />

  <UForm
    id="expertise"
    :schema="expertiseSchema"
    :state="profile"
    @submit="onSubmit"
    class="space-y-6"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-map-pin" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">Expertise & Jurisdiction</h2>
          <p class="text-xs text-muted">Define your practice areas and geographic coverage for case matching.</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          v-if="!isEditing"
          label="Edit"
          color="neutral"
          variant="outline"
          icon="i-lucide-pencil"
          class="rounded-lg"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            form="expertise"
            label="Save changes"
            type="submit"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelEditing"
          />
        </template>
      </div>
    </div>

    <!-- Geographic Coverage -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-globe" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Geographic Coverage</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Licensed States <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Select all states where you are licensed to practice</p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu v-model="profile.licensedStates" :items="stateOptions" multiple searchable creatable placeholder="Select or type states" :disabled="disabled" />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Primary Physical Location <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your main office location</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput v-model="profile.primaryCity" placeholder="Los Angeles, CA" autocomplete="off" :disabled="disabled" size="md" />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Counties/Regions Covered</label>
            <p class="mt-0.5 text-xs text-muted">Specific counties or regions (leave empty for statewide)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput v-model="profile.countiesCovered" placeholder="Enter counties separated by commas" autocomplete="off" :disabled="disabled" size="md" />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Federal Court Admissions</label>
            <p class="mt-0.5 text-xs text-muted">List any federal court admissions (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UTextarea v-model="profile.federalCourts" :rows="3" placeholder="e.g., Central District of California, 9th Circuit Court of Appeals" autocomplete="off" :disabled="disabled" />
          </div>
        </div>
      </div>
    </div>

    <!-- Case Specialization -->
    <div class="rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)] overflow-hidden">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-scale" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Case Specialization</span>
        </div>
      </div>

      <div class="divide-y divide-[var(--ap-card-divide)]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Primary Practice Focus <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Your main area of legal practice</p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu v-model="profile.primaryPracticeFocus" :items="practiceFocusOptions" searchable creatable placeholder="Select or type practice focus" :disabled="disabled" />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Specific Injury Categories <span class="text-red-400">*</span></label>
            <p class="mt-0.5 text-xs text-muted">Select all types of cases you handle</p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu v-model="profile.injuryCategories" :items="injuryCategoryOptions" multiple searchable creatable placeholder="Select or type categories" :disabled="disabled" />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">Exclusionary Criteria</label>
            <p class="mt-0.5 text-xs text-muted">Case types you do NOT handle (optional)</p>
          </div>
          <div class="w-full sm:w-72">
            <UInput v-model="profile.exclusionaryCriteria" placeholder="e.g., Medical Malpractice, Class Actions" autocomplete="off" :disabled="disabled" size="md" />
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
