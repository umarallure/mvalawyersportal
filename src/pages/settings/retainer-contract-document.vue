<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { onBeforeRouteLeave, useRouter } from 'vue-router'

import { useAuth } from '../../composables/useAuth'
import UnsavedChangesModal from '../../components/settings/UnsavedChangesModal.vue'
import {
  formatDocumentFileSize,
  getRetainerContractDocumentKind,
  getMultiStateDocumentSignedUrl,
  RETAINER_CONTRACT_DOCUMENT_ACCEPT,
  RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES,
  validateRetainerContractDocument,
  uploadMultiStateDocument,
  getUserDocuments,
  deleteMultiStateDocument,
  updateDocumentNotes,
  US_STATES_OPTIONS,
  getStateName,
  type RetainerContractDocument
} from '../../lib/attorney-profile'

const auth = useAuth()
const toast = useToast()
const router = useRouter()

const userId = computed(() => auth.state.value.user?.id ?? '')

const documents = ref<RetainerContractDocument[]>([])
const loading = ref(false)
const saving = ref(false)
const openingDocument = ref(false)

const showAddForm = ref(false)
const newDocument = ref({
  state: '',
  file: null as File | null,
  notes: ''
})
const fileInput = ref<HTMLInputElement | null>(null)

const editingNotesId = ref<string | null>(null)
const editingNotesValue = ref('')

const usedStates = computed(() => new Set(documents.value.map(d => d.state)))
const availableStates = computed(() => 
  US_STATES_OPTIONS.filter(opt => !usedStates.value.has(opt.value))
)
const canAddMore = computed(() => availableStates.value.length > 0)

const maxFileSizeLabel = `${Math.round(RETAINER_CONTRACT_DOCUMENT_MAX_SIZE_BYTES / (1024 * 1024))}MB`

const formatUploadedAt = (value?: string) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date)
}

const resetNewDocument = () => {
  newDocument.value = { state: '', file: null, notes: '' }
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const openFilePicker = () => {
  fileInput.value?.click()
}

const handleFileSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  const validationError = validateRetainerContractDocument(file)
  if (validationError) {
    toast.add({
      title: 'Invalid document',
      description: validationError,
      icon: 'i-lucide-file-warning',
      color: 'error'
    })
    input.value = ''
    return
  }

  newDocument.value.file = file
}

const clearSelectedFile = () => {
  newDocument.value.file = null
  if (fileInput.value) {
    fileInput.value.value = ''
  }
}

const startAddDocument = () => {
  resetNewDocument()
  showAddForm.value = true
}

const cancelAddDocument = () => {
  resetNewDocument()
  showAddForm.value = false
}

const saveNewDocument = async () => {
  if (!userId.value) return
  if (!newDocument.value.state || !newDocument.value.file) {
    toast.add({
      title: 'Missing information',
      description: 'Please select a state and upload a document.',
      icon: 'i-lucide-alert-circle',
      color: 'warning'
    })
    return
  }

  saving.value = true
  try {
    const doc = await uploadMultiStateDocument(
      userId.value,
      newDocument.value.state,
      newDocument.value.file,
      newDocument.value.notes || undefined
    )
    documents.value.unshift(doc)
    showAddForm.value = false
    resetNewDocument()
    toast.add({
      title: 'Success',
      description: 'Document uploaded successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to upload document'
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

const openDocument = async (doc: RetainerContractDocument) => {
  openingDocument.value = true
  try {
    const signedUrl = await getMultiStateDocumentSignedUrl(doc.document_path)
    const previewWindow = window.open(signedUrl, '_blank', 'noopener,noreferrer')
    if (!previewWindow) {
      toast.add({
        title: 'Preview blocked',
        description: 'Please allow pop-ups for this site to open the document.',
        icon: 'i-lucide-file-search',
        color: 'warning'
      })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to open document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    openingDocument.value = false
  }
}

const removeDocument = async (doc: RetainerContractDocument) => {
  if (!confirm(`Are you sure you want to delete the document for ${getStateName(doc.state)}?`)) {
    return
  }

  try {
    await deleteMultiStateDocument(doc.id)
    documents.value = documents.value.filter(d => d.id !== doc.id)
    toast.add({
      title: 'Success',
      description: 'Document deleted successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete document'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  }
}

const startEditNotes = (doc: RetainerContractDocument) => {
  editingNotesId.value = doc.id
  editingNotesValue.value = doc.notes || ''
}

const cancelEditNotes = () => {
  editingNotesId.value = null
  editingNotesValue.value = ''
}

const saveNotes = async (doc: RetainerContractDocument) => {
  try {
    const updated = await updateDocumentNotes(doc.id, editingNotesValue.value)
    const index = documents.value.findIndex(d => d.id === doc.id)
    if (index !== -1) {
      documents.value[index] = updated
    }
    editingNotesId.value = null
    editingNotesValue.value = ''
    toast.add({
      title: 'Success',
      description: 'Notes updated successfully.',
      icon: 'i-lucide-check',
      color: 'success'
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update notes'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  }
}

const goToNextStep = () => {
  router.push('/settings/expertise')
}

const goToPreviousStep = () => {
  router.push('/settings/billing')
}

const loadDocuments = async () => {
  if (!userId.value) return
  loading.value = true
  try {
    documents.value = await getUserDocuments(userId.value)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to load documents'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (userId.value) {
    await loadDocuments()
  }
})

const unsavedOpen = ref(false)
const pendingNav = ref<null | (() => void)>(null)

const handleConfirmDiscard = () => {
  unsavedOpen.value = false
  const go = pendingNav.value
  pendingNav.value = null
  go?.()
}

const handleStay = () => {
  unsavedOpen.value = false
  pendingNav.value = null
}

onBeforeRouteLeave((_to, _from, next) => {
  if (showAddForm.value && (newDocument.value.state || newDocument.value.file)) {
    pendingNav.value = () => next()
    unsavedOpen.value = true
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

  <form class="space-y-6" @submit.prevent>
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
        </div>
        <div>
          <h2 class="text-base font-semibold text-highlighted">
            Retainer Contract Documents
          </h2>
          <p class="text-xs text-muted">
            Upload retainer agreement documents for different states.
          </p>
        </div>
      </div>

      <div class="flex items-center gap-2">
        <UButton
          v-if="canAddMore && !showAddForm"
          label="Add Document"
          icon="i-lucide-plus"
          class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
          @click="startAddDocument"
        />
      </div>
    </div>

    <!-- Add Document Form -->
    <div v-if="showAddForm" class="overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-plus-circle" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">Add New Document</span>
        </div>
      </div>

      <div class="space-y-4 px-5 py-4">
        <div class="grid gap-4 md:grid-cols-2">
          <div>
            <label class="block text-sm font-medium text-highlighted mb-1">
              State <span class="text-red-400">*</span>
            </label>
            <USelect
              v-model="newDocument.state"
              :items="availableStates"
              placeholder="Select a state"
              class="w-full"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-highlighted mb-1">
              Document <span class="text-red-400">*</span>
            </label>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              :accept="RETAINER_CONTRACT_DOCUMENT_ACCEPT"
              @change="handleFileSelected"
            >
            <div v-if="newDocument.file" class="flex items-center gap-2">
              <UButton
                type="button"
                :label="newDocument.file.name"
                color="neutral"
                variant="outline"
                class="flex-1 justify-start truncate"
                @click="openDocument"
              />
              <UButton
                type="button"
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                @click="clearSelectedFile"
              />
            </div>
            <UButton
              v-else
              type="button"
              label="Upload Document"
              icon="i-lucide-upload"
              variant="outline"
              class="w-full"
              @click="openFilePicker"
            />
            <p class="mt-1 text-xs text-muted">
              Accepted: PDF, DOC, DOCX. Max: {{ maxFileSizeLabel }}
            </p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-highlighted mb-1">
            Notes (Optional)
          </label>
          <UTextarea
            v-model="newDocument.notes"
            placeholder="Add any notes about this document..."
            rows="3"
            class="w-full"
          />
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <UButton
            type="button"
            label="Cancel"
            color="neutral"
            variant="ghost"
            class="rounded-lg"
            @click="cancelAddDocument"
          />
          <UButton
            type="button"
            label="Save Document"
            icon="i-lucide-check"
            :loading="saving"
            class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
            :disabled="!newDocument.state || !newDocument.file"
            @click="saveNewDocument"
          />
        </div>
      </div>
    </div>

    <!-- Documents List -->
    <div class="overflow-hidden rounded-2xl border border-[var(--ap-card-border)] bg-[var(--ap-card-bg)]">
      <div class="border-b border-[var(--ap-card-border)] px-5 py-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-folder-open" class="text-sm text-muted" />
          <span class="text-xs font-semibold uppercase tracking-wider text-muted">
            Uploaded Documents ({{ documents.length }})
          </span>
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-10">
        <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-muted" />
      </div>

      <div v-else-if="documents.length === 0 && !showAddForm" class="px-5 py-10 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--ap-accent)]/10">
          <UIcon name="i-lucide-file-plus-2" class="text-xl text-[var(--ap-accent)]" />
        </div>
        <p class="text-sm font-medium text-highlighted">
          No documents uploaded
        </p>
        <p class="mt-1 text-xs text-muted">
          Add your firm's retainer agreement documents for different states.
        </p>
      </div>

      <div v-else class="divide-y divide-[var(--ap-card-border)]">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="px-5 py-4"
        >
          <div class="flex items-start justify-between gap-4">
            <div class="flex min-w-0 items-start gap-3">
              <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--ap-accent)]/10">
                <UIcon name="i-lucide-file-text" class="text-lg text-[var(--ap-accent)]" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                  <UBadge color="neutral" variant="subtle">
                    {{ getStateName(doc.state) }} ({{ doc.state }})
                  </UBadge>
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ doc.document_name }}
                  </p>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    {{ getRetainerContractDocumentKind(doc.document_mime_type, doc.document_name)?.toUpperCase() }}
                  </UBadge>
                </div>
                <p class="mt-1 text-xs text-muted">
                  {{ formatDocumentFileSize(doc.document_size_bytes) }} | Uploaded {{ formatUploadedAt(doc.created_at) }}
                </p>
                
                <!-- Notes Section -->
                <div v-if="editingNotesId === doc.id" class="mt-2">
                  <UTextarea
                    v-model="editingNotesValue"
                    placeholder="Add notes..."
                    rows="2"
                    class="w-full"
                  />
                  <div class="mt-2 flex gap-2">
                    <UButton
                      type="button"
                      label="Save"
                      size="xs"
                      class="rounded-lg"
                      @click="saveNotes(doc)"
                    />
                    <UButton
                      type="button"
                      label="Cancel"
                      size="xs"
                      color="neutral"
                      variant="ghost"
                      class="rounded-lg"
                      @click="cancelEditNotes"
                    />
                  </div>
                </div>
                <div v-else-if="doc.notes" class="mt-2 text-xs text-muted">
                  <span class="font-medium">Notes:</span> {{ doc.notes }}
                </div>
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <UButton
                type="button"
                icon="i-lucide-eye"
                variant="ghost"
                size="sm"
                :loading="openingDocument"
                title="View Document"
                @click="openDocument(doc)"
              />
              <UButton
                type="button"
                icon="i-lucide-pencil"
                variant="ghost"
                size="sm"
                title="Edit Notes"
                @click="startEditNotes(doc)"
              />
              <UButton
                type="button"
                icon="i-lucide-trash-2"
                variant="ghost"
                size="sm"
                class="text-red-400 hover:text-red-300"
                title="Delete Document"
                @click="removeDocument(doc)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <div class="flex justify-between pt-4">
      <UButton
        type="button"
        label="Back"
        icon="i-lucide-arrow-left"
        color="neutral"
        variant="outline"
        class="rounded-lg"
        @click="goToPreviousStep"
      />
      <UButton
        type="button"
        label="Next"
        icon="i-lucide-arrow-right"
        class="rounded-lg bg-[var(--ap-accent)] text-white hover:bg-[var(--ap-accent)]/90"
        @click="goToNextStep"
      />
    </div>
  </form>
</template>
