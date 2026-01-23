<script setup lang="ts">
import * as z from 'zod'
import { computed, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter, type RouteLocationRaw } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import { useAttorneyProfile } from '../../composables/useAttorneyProfile'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'

const generalInfoSchema = z.object({
  profilePhoto: z.string().url().optional().or(z.literal('')),
  fullName: z.string().min(2, 'Full name is required'),
  firmName: z.string().min(2, 'Firm name is required'),
  barNumber: z.string().min(3, 'Bar association number is required'),
  bio: z.string().optional(),
  yearsExperience: z.number().min(0).optional().or(z.literal('')),
  languages: z.array(z.string()).min(1, 'At least one language is required'),
  primaryEmail: z.string().email('Invalid email'),
  directPhone: z.string().min(10, 'Phone number is required'),
  officeAddress: z.string().min(5, 'Office address is required'),
  websiteUrl: z.string().url().optional().or(z.literal('')),
  preferredContact: z.enum(['email', 'phone', 'text']).optional(),
  assistantName: z.string().optional(),
  assistantEmail: z.string().email().optional().or(z.literal(''))
})

type GeneralInfoSchema = z.output<typeof generalInfoSchema>

const auth = useAuth()
const attorneyProfile = useAttorneyProfile()
const saving = ref(false)
const toast = useToast()

const languageOptions = [
  'English',
  'Spanish',
  'French',
  'Mandarin',
  'Arabic',
  'Portuguese',
  'Russian',
  'German',
  'Japanese',
  'Korean'
]

const contactMethodOptions = [
  { label: 'Email', value: 'email' },
  { label: 'Phone', value: 'phone' },
  { label: 'Text', value: 'text' }
]

const userId = computed(() => auth.state.value.user?.id ?? '')

const profile = attorneyProfile.draft as unknown as { value: Partial<GeneralInfoSchema> }

const router = useRouter()

const hydrateFromAuth = () => {
  const p = auth.state.value.profile
  const email = p?.email ?? auth.state.value.user?.email ?? ''

  attorneyProfile.draft.value.primaryEmail = email

  if (!attorneyProfile.draft.value.fullName) {
    attorneyProfile.draft.value.fullName = p?.display_name ?? ''
  }
}

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await attorneyProfile.loadProfile(userId.value)
  }
  hydrateFromAuth()

  if (attorneyProfile.isEditing.value && !attorneyProfile.isDirty.value) {
    attorneyProfile.cancelEditing()
  }
})

watch(
  () => auth.state.value.profile,
  () => {
    hydrateFromAuth()
  }
)

async function onSubmit() {
  if (!userId.value) return

  saving.value = true
  try {
    await attorneyProfile.commitEditing(userId.value, [
      'profilePhoto',
      'fullName',
      'firmName',
      'barNumber',
      'bio',
      'yearsExperience',
      'languages',
      'primaryEmail',
      'directPhone',
      'officeAddress',
      'websiteUrl',
      'preferredContact',
      'assistantName',
      'assistantEmail'
    ])
    
    toast.add({
      title: 'Success',
      description: 'Your attorney profile has been updated.',
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
const pendingNav = ref<RouteLocationRaw | null>(null)

const confirmLeave = () => {
  unsavedOpen.value = true
}

const handleConfirmDiscard = () => {
  attorneyProfile.cancelEditing()
  unsavedOpen.value = false
  const target = pendingNav.value
  pendingNav.value = null
  if (target) {
    router.push(target)
  }
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((to) => {
  if (attorneyProfile.isEditing.value && attorneyProfile.isDirty.value) {
    pendingNav.value = to
    confirmLeave()
    return false
  }

  return true
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
    id="attorney-profile"
    :schema="generalInfoSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <UPageCard
      title="Attorney Profile"
      description="Manage your public profile, practice areas, and case availability."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex items-center gap-2 w-fit lg:ms-auto">
        <UButton
          v-if="!isEditing"
          label="Edit"
          color="neutral"
          variant="outline"
          class="w-fit"
          @click="startEditing"
        />
        <template v-else>
          <UButton
            form="attorney-profile"
            label="Save changes"
            color="neutral"
            type="submit"
            :loading="saving"
            class="w-fit"
          />
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="w-fit"
            @click="cancelEditing"
          />
        </template>
      </div>
    </UPageCard>

    <UPageCard variant="subtle" class="mb-6">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            Core Identity
          </h3>
        </div>

        <UFormField
          name="profilePhoto"
          label="Profile Photo"
          description="Upload a professional headshot (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.profilePhoto"
            placeholder="https://example.com/photo.jpg"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="fullName"
          label="Full Name"
          description="Your complete legal name"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.fullName"
            placeholder="John Doe"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="firmName"
          label="Firm Name"
          description="Name of your law firm or practice"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.firmName"
            placeholder="Doe & Associates Law Firm"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="barNumber"
          label="Bar Association Number"
          description="Your state bar registration number"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.barNumber"
            placeholder="BAR123456"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="bio"
          label="Professional Bio"
          description="Brief description of your practice and experience (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UTextarea
            v-model="profile.bio"
            :rows="4"
            placeholder="Experienced attorney specializing in..."
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="yearsExperience"
          label="Years of Experience"
          description="Total years practicing law (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model.number="profile.yearsExperience"
            type="number"
            min="0"
            placeholder="10"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="languages"
          label="Languages Spoken"
          description="Select all languages you can communicate in"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInputMenu
            v-model="profile.languages"
            :items="languageOptions"
            multiple
            searchable
            creatable
            placeholder="Select or type languages"
            :disabled="disabled"
          />
        </UFormField>
      </div>
    </UPageCard>

    <UPageCard variant="subtle" class="mb-6">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            Contact Details
          </h3>
        </div>

        <UFormField
          name="primaryEmail"
          label="Primary Email"
          description="Used for client communications and notifications"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.primaryEmail"
            type="email"
            autocomplete="off"
            disabled
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="directPhone"
          label="Direct Phone"
          description="Your direct contact number"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.directPhone"
            type="tel"
            placeholder="+1 (555) 123-4567"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="officeAddress"
          label="Primary Physical Location"
          description="Your main office address where you practice law"
          required
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UTextarea
            v-model="profile.officeAddress"
            :rows="3"
            placeholder="123 Main Street, Suite 100, City, State, ZIP"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="websiteUrl"
          label="Website URL"
          description="Your firm's website (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.websiteUrl"
            type="url"
            placeholder="https://www.yourfirm.com"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="preferredContact"
          label="Preferred Contact Method"
          description="How you prefer to be contacted (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <URadioGroup
            v-model="profile.preferredContact"
            :options="contactMethodOptions"
            :disabled="disabled"
          />
        </UFormField>
      </div>
    </UPageCard>

    <UPageCard variant="subtle">
      <div class="space-y-6">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-semibold">
            Support Staff
          </h3>
        </div>

        <UFormField
          name="assistantName"
          label="Assistant/Paralegal Name"
          description="Name of your assistant or paralegal (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.assistantName"
            placeholder="Jane Smith"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>

        <USeparator />

        <UFormField
          name="assistantEmail"
          label="Assistant/Paralegal Email"
          description="Email address for your assistant (optional)"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="profile.assistantEmail"
            type="email"
            placeholder="assistant@yourfirm.com"
            autocomplete="off"
            :disabled="disabled"
          />
        </UFormField>
      </div>
    </UPageCard>
  </UForm>
</template>
