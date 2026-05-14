<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

import { supabase } from '../lib/supabase'

type DocumentCategory =
  | 'police_report'
  | 'insurance_document'
  | 'medical_report'
  | 'retainer_document'

type LeadDocumentRequest = {
  id: string
  submission_id: string
  police_report_required: boolean | null
  insurance_document_required: boolean | null
  medical_report_required: boolean | null
  status: string | null
  expires_at: string | null
  email_sent_at: string | null
  email_sent_to: string | null
  updated_at: string | null
}

type LeadDocument = {
  id: string
  submission_id: string
  request_id: string | null
  category: DocumentCategory
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  bucket_name: string | null
  uploaded_at: string | null
  status: string | null
}

type StorageListFile = {
  id?: string | null
  name: string
  created_at?: string | null
  updated_at?: string | null
  metadata?: {
    size?: number
    mimetype?: string
  } | null
}

type DocumentTypeConfig = {
  key: DocumentCategory
  label: string
  description: string
  requestFlag?: keyof Pick<
    LeadDocumentRequest,
    'police_report_required' | 'insurance_document_required' | 'medical_report_required'
  >
}

const props = withDefaults(defineProps<{
  submissionId: string
  allowDocumentUpload?: boolean
  allowRetainerUpload?: boolean
}>(), {
  allowDocumentUpload: false,
  allowRetainerUpload: false
})

const BUCKET_NAME = 'lead-documents'
const RETAINER_DOCUMENT_CATEGORY: DocumentCategory = 'retainer_document'
const MAX_DOCUMENT_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024
const ACCEPTED_DOCUMENT_UPLOAD_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png'
]
const DOCUMENT_UPLOAD_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png'
const FILE_EXTENSION_TO_MIME_TYPE: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png'
}

const documentTypeConfig: DocumentTypeConfig[] = [
  {
    key: 'police_report',
    label: 'Police Report',
    requestFlag: 'police_report_required',
    description: 'Crash reports, incident reports, and law-enforcement records.'
  },
  {
    key: 'insurance_document',
    label: 'Insurance Document',
    requestFlag: 'insurance_document_required',
    description: 'Insurance cards, declarations, claim paperwork, and carrier files.'
  },
  {
    key: 'medical_report',
    label: 'Medical Report',
    requestFlag: 'medical_report_required',
    description: 'Medical records, discharge paperwork, bills, and treatment documents.'
  },
  {
    key: RETAINER_DOCUMENT_CATEGORY,
    label: 'Retainer Document',
    description: 'Signed retainers, engagement files, and related retainer paperwork.'
  }
]

const documentCategoryByFolder: Record<string, DocumentCategory> = {
  police_report: 'police_report',
  police_reports: 'police_report',
  insurance_document: 'insurance_document',
  insurance_documents: 'insurance_document',
  medical_report: 'medical_report',
  medical_reports: 'medical_report',
  retainer_document: 'retainer_document',
  retainer_documents: 'retainer_document'
}

const toast = useToast()

const loading = ref(false)
const request = ref<LeadDocumentRequest | null>(null)
const documents = ref<LeadDocument[]>([])
const signedUrlById = ref<Record<string, string>>({})
const documentFileInput = ref<HTMLInputElement | null>(null)
const activeUploadCategory = ref<DocumentCategory | null>(null)
const selectedDocumentFiles = ref<File[]>([])
const uploadingDocuments = ref(false)

const canUploadDocuments = computed(() => props.allowDocumentUpload || props.allowRetainerUpload)

const formatFileSize = (bytes: number) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let size = bytes
  let unitIndex = 0
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024
    unitIndex += 1
  }
  const decimals = size >= 10 || unitIndex === 0 ? 0 : 1
  return `${size.toFixed(decimals)} ${units[unitIndex]}`
}

const inferCategoryFromPath = (path: string): DocumentCategory => {
  const normalized = path.toLowerCase()

  const fromSegments = normalized
    .split('/')
    .map((segment) => documentCategoryByFolder[segment])
    .find(Boolean)

  if (fromSegments) return fromSegments

  if (normalized.includes('police')) return 'police_report'
  if (normalized.includes('medical')) return 'medical_report'
  if (normalized.includes('retainer')) return 'retainer_document'
  if (normalized.includes('insurance')) return 'insurance_document'

  return 'insurance_document'
}

const sanitizeFileName = (fileName: string) => {
  return fileName
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '')
}

const resolveUploadMimeType = (file: File) => {
  if (file.type) return file.type

  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  return FILE_EXTENSION_TO_MIME_TYPE[extension] || ''
}

const getDocumentCategoryLabel = (category: DocumentCategory) => {
  return documentTypeConfig.find((cfg) => cfg.key === category)?.label ?? 'Document'
}

const decodeFileName = (fileName: string) => {
  try {
    return decodeURIComponent(fileName)
  } catch {
    return fileName
  }
}

const formatDocumentName = (fileName: string) => {
  const decoded = decodeFileName(fileName)
  const withoutUploadId = decoded
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, '')
    .replace(/^\d{10,}-[a-z0-9]{4,}-/i, '')

  const extensionIndex = withoutUploadId.lastIndexOf('.')
  const baseName = extensionIndex > 0 ? withoutUploadId.slice(0, extensionIndex) : withoutUploadId
  const extension = extensionIndex > 0 ? withoutUploadId.slice(extensionIndex) : ''
  const readableBaseName = baseName
    .replace(/-{3,}/g, ' | ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s*\|\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim()

  return `${readableBaseName || baseName}${extension}`
}

const buildDocumentStoragePath = (file: File, category: DocumentCategory) => {
  const safeName = sanitizeFileName(file.name) || `${category}-${Date.now()}`
  const uniqueId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return `${props.submissionId}/${category}/${uniqueId}-${safeName}`
}

const validateDocumentFile = (file: File) => {
  const mimeType = resolveUploadMimeType(file)

  if (!ACCEPTED_DOCUMENT_UPLOAD_TYPES.includes(mimeType)) {
    return `${file.name} is not a supported file type.`
  }

  if (file.size > MAX_DOCUMENT_UPLOAD_SIZE_BYTES) {
    return `${file.name} is larger than ${formatFileSize(MAX_DOCUMENT_UPLOAD_SIZE_BYTES)}.`
  }

  return null
}

const openDocumentFilePicker = (category: DocumentCategory) => {
  if (!canUploadDocuments.value) return

  if (activeUploadCategory.value !== category) {
    selectedDocumentFiles.value = []
  }

  activeUploadCategory.value = category
  documentFileInput.value?.click()
}

const handleDocumentFilesSelected = (event: Event) => {
  const input = event.target as HTMLInputElement
  selectedDocumentFiles.value = Array.from(input.files || [])
}

const clearDocumentFiles = () => {
  selectedDocumentFiles.value = []
  if (documentFileInput.value) {
    documentFileInput.value.value = ''
  }
}

const cancelDocumentUpload = () => {
  clearDocumentFiles()
  activeUploadCategory.value = null
}

const uploadDocuments = async () => {
  const category = activeUploadCategory.value
  if (!canUploadDocuments.value || !category || selectedDocumentFiles.value.length === 0) return

  const invalidMessage = selectedDocumentFiles.value
    .map(validateDocumentFile)
    .find((message): message is string => Boolean(message))

  if (invalidMessage) {
    toast.add({
      title: 'Unsupported file',
      description: invalidMessage,
      icon: 'i-lucide-x-circle',
      color: 'error'
    })
    return
  }

  uploadingDocuments.value = true

  try {
    const timestamp = new Date().toISOString()
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData.user?.id ?? null

    await Promise.all(
      selectedDocumentFiles.value.map(async (file) => {
        const mimeType = resolveUploadMimeType(file)
        const storagePath = buildDocumentStoragePath(file, category)

        const { error: uploadError } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(storagePath, file, {
            upsert: false,
            contentType: mimeType
          })

        if (uploadError) throw uploadError

        const { error: insertError } = await supabase
          .from('lead_documents')
          .insert({
            submission_id: props.submissionId,
            request_id: request.value?.id ?? null,
            category,
            file_name: file.name,
            file_size: file.size,
            file_type: mimeType,
            storage_path: storagePath,
            bucket_name: BUCKET_NAME,
            uploaded_at: timestamp,
            uploaded_by: userId,
            status: 'uploaded'
          })

        if (insertError) {
          await supabase.storage.from(BUCKET_NAME).remove([storagePath])
          throw insertError
        }
      })
    )

    const count = selectedDocumentFiles.value.length
    const categoryLabel = getDocumentCategoryLabel(category)
    cancelDocumentUpload()
    await load()

    toast.add({
      title: `${categoryLabel} uploaded`,
      description: count === 1 ? 'The document was added.' : `${count} documents were added.`,
      icon: 'i-lucide-check-circle-2',
      color: 'success'
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to upload document'
    toast.add({
      title: 'Upload failed',
      description: msg,
      icon: 'i-lucide-x-circle',
      color: 'error'
    })
  } finally {
    uploadingDocuments.value = false
  }
}

const fetchStorageDocuments = async (): Promise<LeadDocument[]> => {
  const visited = new Set<string>()
  const submissionId = props.submissionId

  const rootPaths = [
    submissionId,
    `${submissionId}/police_report`,
    `${submissionId}/police_reports`,
    `${submissionId}/insurance_document`,
    `${submissionId}/insurance_documents`,
    `${submissionId}/medical_report`,
    `${submissionId}/medical_reports`,
    `${submissionId}/retainer_document`,
    `${submissionId}/retainer_documents`,
    `police_report/${submissionId}`,
    `police_reports/${submissionId}`,
    `insurance_document/${submissionId}`,
    `insurance_documents/${submissionId}`,
    `medical_report/${submissionId}`,
    `medical_reports/${submissionId}`,
    `retainer_document/${submissionId}`,
    `retainer_documents/${submissionId}`
  ]

  const collectFiles = async (path: string, depth = 0): Promise<LeadDocument[]> => {
    if (depth > 4 || visited.has(path)) return []
    visited.add(path)

    const { data, error } = await supabase.storage.from(BUCKET_NAME).list(path, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' }
    })

    if (error || !data) return []

    const nested = await Promise.all(
      data.map(async (item) => {
        const file = item as StorageListFile
        if (!file.name || file.name === '.emptyFolderPlaceholder') return [] as LeadDocument[]

        const itemPath = `${path}/${file.name}`.replace(/\/+/g, '/')
        const looksLikeFile = Boolean(file.metadata?.mimetype) || typeof file.metadata?.size === 'number' || file.name.includes('.')

        if (!looksLikeFile) {
          return collectFiles(itemPath, depth + 1)
        }

        const category = inferCategoryFromPath(itemPath)

        return [
          {
            id: file.id || itemPath,
            submission_id: submissionId,
            request_id: null,
            category,
            file_name: file.name,
            file_size: file.metadata?.size || 0,
            file_type: file.metadata?.mimetype || '',
            storage_path: itemPath,
            bucket_name: BUCKET_NAME,
            uploaded_at: file.created_at || file.updated_at || null,
            status: 'uploaded'
          }
        ]
      })
    )

    return nested.flat()
  }

  const rootResults = await Promise.all(Array.from(new Set(rootPaths)).map((p) => collectFiles(p)))
  const deduped = new Map<string, LeadDocument>()

  rootResults.flat().forEach((doc) => {
    deduped.set(`${doc.bucket_name || BUCKET_NAME}:${doc.storage_path}`, doc)
  })

  return Array.from(deduped.values())
}

const loadSignedUrls = async (docs: LeadDocument[]) => {
  const pairs = await Promise.all(
    docs.map(async (d) => {
      const bucket = d.bucket_name || BUCKET_NAME
      const { data, error } = await supabase.storage.from(bucket).createSignedUrl(d.storage_path, 60 * 60)
      if (error || !data?.signedUrl) return [d.id, ''] as const
      return [d.id, data.signedUrl] as const
    })
  )

  signedUrlById.value = Object.fromEntries(pairs.filter(([, url]) => Boolean(url)))
}

const load = async () => {
  loading.value = true
  try {
    const submissionId = props.submissionId

    const [requestRes, documentRes, storageDocs] = await Promise.all([
      supabase
        .from('lead_document_requests')
        .select('id,submission_id,police_report_required,insurance_document_required,medical_report_required,status,expires_at,email_sent_at,email_sent_to,updated_at')
        .eq('submission_id', submissionId)
        .maybeSingle(),
      supabase
        .from('lead_documents')
        .select('id,submission_id,request_id,category,file_name,file_size,file_type,storage_path,bucket_name,uploaded_at,status')
        .eq('submission_id', submissionId)
        .order('uploaded_at', { ascending: false }),
      fetchStorageDocuments()
    ])

    if (requestRes.error) throw requestRes.error
    if (documentRes.error) throw documentRes.error

    request.value = requestRes.data ?? null

    const databaseDocs = (documentRes.data ?? []) as LeadDocument[]
    const merged = [...databaseDocs]
    const existingKeys = new Set(databaseDocs.map((d) => `${d.bucket_name || BUCKET_NAME}:${d.storage_path}`))

    storageDocs.forEach((d) => {
      const key = `${d.bucket_name || BUCKET_NAME}:${d.storage_path}`
      if (!existingKeys.has(key)) {
        merged.push(d)
        existingKeys.add(key)
      }
    })

    merged.sort((a, b) => {
      const aTime = a.uploaded_at ? new Date(a.uploaded_at).getTime() : 0
      const bTime = b.uploaded_at ? new Date(b.uploaded_at).getTime() : 0
      return bTime - aTime
    })

    documents.value = merged

    await loadSignedUrls(merged)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load documents'
    toast.add({
      title: 'Error',
      description: msg,
      icon: 'i-lucide-x-circle',
      color: 'error'
    })
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {})
})

watch(
  () => props.submissionId,
  () => {
    cancelDocumentUpload()
    load().catch(() => {})
  }
)

const documentsByCategory = computed(() => {
  return documentTypeConfig.map((cfg) => {
    const categoryDocs = documents.value.filter(d => d.category === cfg.key)
    return { ...cfg, documents: categoryDocs }
  })
})

const totalRequested = computed(() => {
  if (!request.value) return 0
  return documentTypeConfig.filter(cfg => cfg.requestFlag && Boolean(request.value?.[cfg.requestFlag])).length
})

const requestableDocumentTypeCount = computed(() => {
  return documentTypeConfig.filter(cfg => cfg.requestFlag).length
})

const totalUploadedRequested = computed(() => {
  if (!request.value) return 0
  return documentsByCategory.value.filter(cfg => cfg.requestFlag && Boolean(request.value?.[cfg.requestFlag]) && cfg.documents.length > 0).length
})
</script>

<template>
  <UCard>
    <input
      v-if="canUploadDocuments"
      ref="documentFileInput"
      type="file"
      class="hidden"
      :accept="DOCUMENT_UPLOAD_ACCEPT"
      multiple
      @change="handleDocumentFilesSelected"
    >

    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-folder-open" class="size-5 text-muted" />
          <div class="text-sm font-semibold">Documents</div>
        </div>
        <div class="mt-1 text-xs text-muted">
          Browse documents available for this submission.
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UBadge color="neutral" variant="soft">
          {{ documents.length }} file{{ documents.length === 1 ? '' : 's' }}
        </UBadge>
        <UBadge color="neutral" variant="soft">
          {{ totalUploadedRequested }}/{{ totalRequested || requestableDocumentTypeCount }} requested uploaded
        </UBadge>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-refresh-cw"
          size="sm"
          :loading="loading"
          @click="load"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <div class="mt-4 grid gap-3 md:grid-cols-4">
      <div
        v-for="cat in documentsByCategory"
        :key="cat.key"
        class="rounded-lg border border-default bg-elevated/20 p-4"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-highlighted">{{ cat.label }}</div>
            <div class="mt-1 text-xs text-muted">{{ cat.description }}</div>
          </div>
          <UIcon
            v-if="cat.documents.length"
            name="i-lucide-check-circle-2"
            class="size-5 text-emerald-400"
          />
        </div>

        <div class="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <UBadge color="neutral" variant="soft">
            {{ cat.documents.length }} file{{ cat.documents.length === 1 ? '' : 's' }}
          </UBadge>
          <UBadge
            v-if="request && cat.requestFlag"
            :color="request[cat.requestFlag] ? 'warning' : 'neutral'"
            variant="soft"
          >
            {{ request[cat.requestFlag] ? 'Required' : 'Optional' }}
          </UBadge>
        </div>
      </div>
    </div>

    <div class="mt-6 space-y-4">
      <div
        v-for="cat in documentsByCategory"
        :key="`${cat.key}-list`"
        class="rounded-lg border border-default"
      >
        <div class="flex items-center justify-between gap-3 border-b border-default px-4 py-3">
          <div class="min-w-0">
            <div class="text-sm font-semibold text-highlighted">{{ cat.label }}</div>
            <div class="text-xs text-muted">
              {{ cat.documents.length ? `${cat.documents.length} document${cat.documents.length === 1 ? '' : 's'}` : 'No documents' }}
            </div>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <UButton
              v-if="canUploadDocuments && cat.key === RETAINER_DOCUMENT_CATEGORY"
              color="primary"
              variant="soft"
              icon="i-lucide-upload"
              size="xs"
              :disabled="uploadingDocuments"
              @click="openDocumentFilePicker(cat.key)"
            >
              Add
            </UButton>
            <UBadge color="neutral" variant="soft">{{ cat.documents.length }}</UBadge>
          </div>
        </div>

        <div v-if="loading" class="p-4 text-sm text-muted">
          Loading...
        </div>

        <div
          v-if="!loading && canUploadDocuments && cat.key === RETAINER_DOCUMENT_CATEGORY && activeUploadCategory === cat.key"
          class="border-b border-default p-4"
        >
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div class="min-w-0">
              <div class="text-sm font-medium text-highlighted">Upload to {{ cat.label }}</div>
              <div class="mt-1 text-xs text-muted">
                PDF, DOC, DOCX, JPG, PNG / Max {{ formatFileSize(MAX_DOCUMENT_UPLOAD_SIZE_BYTES) }}
              </div>
            </div>

            <div class="flex shrink-0 flex-wrap items-center gap-2">
              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-folder-open"
                size="sm"
                :disabled="uploadingDocuments"
                @click="openDocumentFilePicker(cat.key)"
              >
                Select
              </UButton>
              <UButton
                color="primary"
                icon="i-lucide-upload"
                size="sm"
                :loading="uploadingDocuments"
                :disabled="selectedDocumentFiles.length === 0"
                @click="uploadDocuments"
              >
                Upload
              </UButton>
            </div>
          </div>

          <div
            v-if="selectedDocumentFiles.length"
            class="mt-3 space-y-2"
          >
            <div
              v-for="file in selectedDocumentFiles"
              :key="`${file.name}-${file.size}-${file.lastModified}`"
              class="flex items-center justify-between gap-3 rounded-lg border border-default bg-elevated/20 px-3 py-2"
            >
              <div class="min-w-0">
                <div class="truncate text-xs font-medium text-highlighted">{{ file.name }}</div>
                <div class="text-[11px] text-muted">{{ formatFileSize(file.size) }}</div>
              </div>
            </div>

            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="xs"
              :disabled="uploadingDocuments"
              @click="cancelDocumentUpload"
            >
              Clear
            </UButton>
          </div>
        </div>

        <div v-if="!loading && cat.documents.length === 0" class="p-4 text-sm text-muted">
          No documents uploaded in this category.
        </div>

        <div v-else-if="!loading" class="divide-y divide-[var(--ap-card-divide)]">
          <div
            v-for="doc in cat.documents"
            :key="doc.id"
            class="flex items-start justify-between gap-4 p-4"
          >
            <div class="min-w-0">
              <div class="truncate text-sm font-medium text-highlighted">{{ formatDocumentName(doc.file_name) }}</div>
              <div class="mt-1 text-xs text-muted">
                {{ formatFileSize(doc.file_size) }}
                <span v-if="doc.uploaded_at"> · {{ new Date(doc.uploaded_at).toLocaleString() }}</span>
              </div>
              <div class="mt-1 text-[11px] text-muted">
                {{ getDocumentCategoryLabel(doc.category) }}
              </div>
            </div>

            <div class="flex shrink-0 items-center gap-2">
              <UBadge color="neutral" variant="soft">{{ doc.status || 'uploaded' }}</UBadge>
              <UButton
                v-if="signedUrlById[doc.id]"
                color="neutral"
                variant="outline"
                icon="i-lucide-external-link"
                size="xs"
                :to="signedUrlById[doc.id]"
                target="_blank"
              >
                Open
              </UButton>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!loading && documents.length === 0" class="rounded-lg border border-dashed border-default p-8 text-center text-sm text-muted">
        No documents were found for this submission.
      </div>
    </div>
  </UCard>
</template>
