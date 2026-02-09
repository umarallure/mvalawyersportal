<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import type { FormSubmitEvent } from '@nuxt/ui'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const capacitySchema = z.object({
  availabilityStatus: z.enum(['accepting', 'at_capacity', 'on_leave']).optional(),
  firmSize: z.enum(['solo', 'small', 'medium', 'large']).optional(),
  caseManagementSoftware: z.string().optional(),
  insuranceCarriers: z.array(z.string()).optional(),
  litigationStyle: z.number().min(1).max(5).optional(),
  largestSettlement: z.number().min(0).optional().or(z.literal('')),
  avgTimeToClose: z.string().optional()
})

type CapacitySchema = z.output<typeof capacitySchema>

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as { value: Partial<CapacitySchema> }

const firmSizeOptions = [
  'Solo',
  'Small (2-10)',
  'Medium (11-50)',
  'Large (50+)'
]

const caseManagementOptions = [
  'Clio',
  'MyCase',
  'PracticePanther',
  'Smokeball',
  'CASEpeer',
  'Filevine',
  'LawRuler',
  'Other',
  'None'
]

const insuranceCarrierOptions = [
  'State Farm',
  'GEICO',
  'Progressive',
  'Allstate',
  'USAA',
  'Liberty Mutual',
  'Farmers',
  'Nationwide',
  'Travelers',
  'American Family'
]

const timeToCloseOptions = [
  'Less than 6 months',
  '6-12 months',
  '12-18 months',
  '18-24 months',
  'Over 24 months'
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

async function onSubmit(event: FormSubmitEvent<CapacitySchema>) {
  if (!userId.value) return

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'availabilityStatus',
      'firmSize',
      'caseManagementSoftware',
      'insuranceCarriers',
      'litigationStyle',
      'largestSettlement',
      'avgTimeToClose'
    ])
    
    toast.add({
      title: 'Success',
      description: 'Your capacity and performance settings have been updated.',
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
    id="capacity"
    class="space-y-6"
    :schema="capacitySchema"
    :state="profile"
    @submit="onSubmit"
  >
    <!-- Page Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-activity" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Capacity & Performance
          </h2>
          <p class="text-xs text-muted">
            Manage your availability status and performance metrics.
          </p>
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
            form="capacity"
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

    <!-- Real-Time Status -->
    <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div class="border-b border-white/[0.06] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-signal" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Real-Time Status</span>
        </div>
      </div>

      <div class="divide-y divide-white/[0.04]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Firm Size
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Size of your law firm (optional)
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu
              v-model="profile.firmSize"
              :items="firmSizeOptions"
              searchable
              creatable
              placeholder="Select or type firm size"
              :disabled="disabled"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Case Management Software
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Software you use to manage cases (optional)
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu
              v-model="profile.caseManagementSoftware"
              :items="caseManagementOptions"
              searchable
              creatable
              placeholder="Select or type software"
              :disabled="disabled"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Performance Metrics -->
    <div class="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden">
      <div class="flex items-center justify-between border-b border-white/[0.06] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bar-chart-3" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Performance Metrics</span>
        </div>
        <span class="text-[11px] text-muted">Self-Reported</span>
      </div>

      <div class="divide-y divide-white/[0.04]">
        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Insurance Carriers Handled
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Select carriers you have experience with (optional)
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu
              v-model="profile.insuranceCarriers"
              :items="insuranceCarrierOptions"
              multiple
              searchable
              creatable
              placeholder="Select or type carriers"
              :disabled="disabled"
            />
          </div>
        </div>

        <div class="flex max-sm:flex-col items-start justify-between gap-4 px-5 py-4">
          <div class="min-w-0 flex-1">
            <label class="text-sm font-medium text-highlighted">
              Average Time to Close
            </label>
            <p class="mt-0.5 text-xs text-muted">
              Typical duration from intake to resolution (optional)
            </p>
          </div>
          <div class="w-full sm:w-72">
            <UInputMenu
              v-model="profile.avgTimeToClose"
              :items="timeToCloseOptions"
              searchable
              creatable
              placeholder="Select or type time"
              :disabled="disabled"
            />
          </div>
        </div>
      </div>
    </div>
  </UForm>
</template>
