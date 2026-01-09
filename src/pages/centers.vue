<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { useAuth } from '../composables/useAuth'
import {
  listCenters,
  createCenter,
  updateCenter,
  deleteCenter,
  type CenterRow
} from '../lib/centers'
import CenterModal from '../components/centers/CenterModal.vue'
import DeleteCenterConfirmModal from '../components/centers/DeleteCenterConfirmModal.vue'

const auth = useAuth()
const router = useRouter()
const toast = useToast()

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')

const centers = ref<CenterRow[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)

const query = ref('')

const isCreateOpen = ref(false)

const editing = ref<CenterRow | null>(null)

const centerModalOpen = computed({
  get: () => isCreateOpen.value,
  set: (value: boolean) => {
    isCreateOpen.value = value
  }
})

const isBusy = computed(() => loading.value)

const filteredCenters = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return centers.value

  return centers.value.filter((c) => {
    const haystack = [
      c.center_name,
      c.lead_vendor ?? '',
      c.contact_email ?? ''
    ].join(' ').toLowerCase()

    return haystack.includes(q)
  })
})

const columns: TableColumn<CenterRow>[] = [
  { accessorKey: 'center_name', header: 'Center name' },
  { accessorKey: 'lead_vendor', header: 'Lead vendor' },
  { accessorKey: 'contact_email', header: 'Contact email' },
  { accessorKey: 'actions', header: '' }
]

const deleteConfirmOpen = ref(false)
const deleteTarget = ref<CenterRow | null>(null)

const loadCenters = async () => {
  loading.value = true
  errorMessage.value = null

  try {
    centers.value = await listCenters()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to load centers'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

const openCreate = () => {
  deleteConfirmOpen.value = false
  deleteTarget.value = null
  editing.value = null
  isCreateOpen.value = true
}

const handleCenterSubmit = async (
  payload:
    | { mode: 'create'; center_name: string; lead_vendor: string; contact_email: string }
    | { mode: 'edit'; id: string; center_name: string; lead_vendor: string; contact_email: string }
) => {
  loading.value = true
  errorMessage.value = null

  try {
    if (payload.mode === 'create') {
      await createCenter({
        center_name: payload.center_name,
        lead_vendor: payload.lead_vendor,
        contact_email: payload.contact_email
      })

      isCreateOpen.value = false
      toast.add({
        title: 'Center created',
        color: 'success'
      })
      await loadCenters()
      return
    }

    await updateCenter(payload.id, {
      center_name: payload.center_name,
      lead_vendor: payload.lead_vendor,
      contact_email: payload.contact_email
    })

    isCreateOpen.value = false
    toast.add({
      title: 'Center updated',
      color: 'success'
    })
    await loadCenters()
  } catch (err) {
    const msg = err instanceof Error
      ? err.message
      : payload.mode === 'create'
        ? 'Unable to create center'
        : 'Unable to update center'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

const startEdit = (row: CenterRow) => {
  isCreateOpen.value = false
  deleteConfirmOpen.value = false
  deleteTarget.value = null
  editing.value = row
  isCreateOpen.value = true
}

const requestDelete = (row: CenterRow) => {
  isCreateOpen.value = false
  editing.value = null
  deleteTarget.value = row
  deleteConfirmOpen.value = true
}

const confirmDelete = async () => {
  if (!deleteTarget.value) return

  loading.value = true
  errorMessage.value = null

  try {
    await deleteCenter(deleteTarget.value.id)

    deleteConfirmOpen.value = false
    deleteTarget.value = null

    toast.add({
      title: 'Center deleted',
      color: 'success'
    })

    await loadCenters()
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unable to delete center'
    errorMessage.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  await auth.init()
  if (!isSuperAdmin.value) {
    await router.replace('/dashboard')
    return
  }

  await loadCenters()
})
</script>

<template>
  <UDashboardPanel id="centers">
    <template #header>
      <UDashboardNavbar title="Centers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="flex w-full flex-wrap items-center justify-between gap-3">
          <div class="flex flex-1 flex-wrap items-center gap-3">
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search by name, vendor, email..."
            />
            <UBadge
              variant="subtle"
              :label="`${filteredCenters.length} centers`"
            />
          </div>

          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="isBusy"
            @click="loadCenters"
          >
            Refresh
          </UButton>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-black dark:text-white/70">
          Manage centers and their information. Add, edit, or remove centers as needed.
        </p>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Something went wrong"
          :description="errorMessage"
        />

        <UPageCard variant="subtle">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-base font-semibold text-white">Centers</h3>
                <p class="text-sm text-black dark:text-white/70">View and manage all centers.</p>
              </div>
              <UButton
                label="Add center"
                icon="i-lucide-plus"
                class="rounded-full"
                :disabled="isBusy"
                @click="openCreate"
              />
            </div>
          </template>
          <UTable
            class="mt-0"
            :data="filteredCenters"
            :loading="isBusy"
            :columns="columns"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
              td: 'border-b border-default'
            }"
          >
            <template #center_name-cell="{ row }">
              <div class="flex flex-col">
                <span class="text-sm font-medium text-black dark:text-white/90">{{ row.original.center_name }}</span>
              </div>
            </template>

            <template #lead_vendor-cell="{ row }">
              <span class="text-sm text-black dark:text-white/80">{{ row.original.lead_vendor || '—' }}</span>
            </template>

            <template #contact_email-cell="{ row }">
              <span class="text-sm text-black dark:text-white/80">{{ row.original.contact_email || '—' }}</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-pencil"
                  :disabled="isBusy"
                  @click="startEdit(row.original)"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-trash"
                  :disabled="isBusy"
                  @click="requestDelete(row.original)"
                />
              </div>
            </template>
          </UTable>

          <div v-if="!isBusy && filteredCenters.length === 0" class="p-6 text-center text-sm text-black dark:text-white/70">
            No centers found.
          </div>
        </UPageCard>

        <CenterModal
          v-model:open="centerModalOpen"
          :center="editing"
          :loading="isBusy"
          @submit="handleCenterSubmit"
          @after:leave="editing = null"
        />

        <DeleteCenterConfirmModal
          v-model:open="deleteConfirmOpen"
          :center="deleteTarget"
          :loading="isBusy"
          @confirm="confirmDelete"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
