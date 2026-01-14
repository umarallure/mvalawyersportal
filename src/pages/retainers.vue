<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { TableColumn } from '@nuxt/ui'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'

type DailyDealFlow = {
  id: string
  submission_id: string
  insured_name: string | null
  client_phone_number: string | null
  lead_vendor: string | null
  date: string | null
  status: string | null
  assigned_attorney_id?: string | null
  assigned_attorney_name?: string | null
  agent: string | null
  carrier: string | null
  created_at: string | null
}

const router = useRouter()
const auth = useAuth()

const isSuperAdmin = computed(() => auth.state.value.profile?.role === 'super_admin')
const isAdmin = computed(() => auth.state.value.profile?.role === 'admin')
const canSeeAssignments = computed(() => isSuperAdmin.value || isAdmin.value)

const PENDING_APPROVAL = 'Pending Approval'

const loading = ref(false)
const error = ref<string | null>(null)
const query = ref('')

const leadVendorFilter = ref('All')
const statusFilter = ref(PENDING_APPROVAL)

const pageSize = 25
const currentPage = ref(1)

const totalCount = ref(0)
const availableLeadVendors = ref<string[]>([])
const availableStatuses = ref<string[]>([])

const rows = ref<DailyDealFlow[]>([])

const leadVendorOptions = computed(() => {
  return ['All', ...availableLeadVendors.value]
})

const statusOptions = computed(() => {
  return [PENDING_APPROVAL]
})

const pageCount = computed(() => Math.max(1, Math.ceil(totalCount.value / pageSize)))

const displayPage = computed(() => Math.min(Math.max(1, currentPage.value), pageCount.value))

const pagedRows = computed(() => rows.value)

const canPrev = computed(() => currentPage.value > 1)
const canNext = computed(() => currentPage.value < pageCount.value)

const goPrev = () => {
  if (!canPrev.value) return
  currentPage.value -= 1
}

const goNext = () => {
  if (!canNext.value) return
  currentPage.value += 1
}

const resetPagination = () => {
  currentPage.value = 1
}

const normalizeFilterValue = (value: string | null | undefined) => {
  const v = String(value ?? '').trim()
  return v.length ? v : '—'
}

const columns = computed(() => {
  const cols: TableColumn<DailyDealFlow>[] = [
    {
      accessorKey: 'date',
      header: 'Date'
    },
    {
      accessorKey: 'insured_name',
      header: 'Customer Name'
    },
    {
      accessorKey: 'client_phone_number',
      header: 'Phone Number'
    }
  ]

  if (isSuperAdmin.value) {
    cols.push({
      accessorKey: 'lead_vendor',
      header: 'Lead vendor'
    })
  }

  if (canSeeAssignments.value) {
    cols.push({
      accessorKey: 'assigned_attorney_name',
      header: 'Assigned Attorney'
    })
  }

  cols.push(
    {
      accessorKey: 'status',
      header: 'Status'
    },
    {
      accessorKey: 'actions',
      header: 'Actions'
    }
  )

  return cols
})

const formatDate = (value: string | null) => {
  if (!value) return '—'
  // Prefer YYYY-MM-DD display like the UI screenshot
  return value.length >= 10 ? value.slice(0, 10) : value
}

const statusColor = (value: string | null) => {
  const normalized = (value ?? '').toLowerCase()
  if (normalized.includes('pending')) return 'warning' as const
  if (normalized.includes('approved') || normalized.includes('paid') || normalized.includes('complete')) return 'success' as const
  if (normalized.includes('rejected') || normalized.includes('failed') || normalized.includes('cancel')) return 'error' as const
  return 'neutral' as const
}

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.user?.id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    const q = query.value.trim()
    const from = (displayPage.value - 1) * pageSize
    const to = from + pageSize - 1

    let queryBuilder = supabase
      .from('daily_deal_flow')
      .select('id,submission_id,insured_name,client_phone_number,lead_vendor,date,status,assigned_attorney_id,agent,carrier,created_at', { count: 'exact' })

    queryBuilder = queryBuilder.eq('status', PENDING_APPROVAL)

    if (userRole === 'lawyer' && userId) {
      queryBuilder = queryBuilder.eq('assigned_attorney_id', userId)
    } else if (!userRole && userId) {
      const { data: userData } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (userData?.center_id) {
        const { data: centerData } = await supabase
          .from('centers')
          .select('lead_vendor')
          .eq('id', userData.center_id)
          .maybeSingle()

        if (centerData?.lead_vendor) {
          queryBuilder = queryBuilder.eq('lead_vendor', centerData.lead_vendor)
        } else {
          rows.value = []
          totalCount.value = 0
          return
        }
      } else {
        rows.value = []
        totalCount.value = 0
        return
      }
    }

    if (isSuperAdmin.value && leadVendorFilter.value !== 'All') {
      const v = normalizeFilterValue(leadVendorFilter.value)
      queryBuilder = v === '—'
        ? queryBuilder.is('lead_vendor', null)
        : queryBuilder.eq('lead_vendor', v)
    }

    statusFilter.value = PENDING_APPROVAL

    if (q) {
      const pattern = `%${q.replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
      queryBuilder = queryBuilder.or([
        `submission_id.ilike.${pattern}`,
        `insured_name.ilike.${pattern}`,
        `client_phone_number.ilike.${pattern}`,
        `lead_vendor.ilike.${pattern}`,
        `status.ilike.${pattern}`,
        `agent.ilike.${pattern}`,
        `carrier.ilike.${pattern}`
      ].join(','))
    }

    const { data, count, error: supaError } = await queryBuilder
      .order('created_at', { ascending: false })
      .range(from, to)

    if (supaError) throw supaError

    const dealFlows = (data ?? []) as DailyDealFlow[]

    if (canSeeAssignments.value) {
      const attorneyIds = [...new Set(dealFlows
        .map(d => d.assigned_attorney_id)
        .filter((id): id is string => Boolean(id))
      )]

      if (attorneyIds.length) {
        const { data: attorneys, error: attorneysError } = await supabase
          .from('attorney_profiles')
          .select('user_id,full_name')
          .in('user_id', attorneyIds)

        if (attorneysError) throw attorneysError

        const attorneyNameByUserId = new Map(
          (attorneys ?? []).map((a: any) => [String(a.user_id), String(a.full_name ?? '').trim()])
        )

        dealFlows.forEach((flow) => {
          const id = flow.assigned_attorney_id ?? null
          if (!id) return
          const name = attorneyNameByUserId.get(id) ?? ''
          flow.assigned_attorney_name = name.length ? name : null
        })
      }
    }

    rows.value = dealFlows
    totalCount.value = count ?? 0
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load retainers'
    error.value = msg
  } finally {
    loading.value = false
  }
}

const loadFilterOptions = async () => {
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    const userRole = auth.state.value.profile?.role ?? null

    if (userRole !== 'super_admin') {
      availableLeadVendors.value = []
      leadVendorFilter.value = 'All'
    }

    availableStatuses.value = [PENDING_APPROVAL]
    statusFilter.value = PENDING_APPROVAL

    let qb = supabase
      .from('daily_deal_flow')
      .select('lead_vendor,status')
      .order('created_at', { ascending: false })
      .limit(1000)

    qb = qb.eq('status', PENDING_APPROVAL)

    if (userRole === 'lawyer' && userId) {
      qb = qb.eq('assigned_attorney_id', userId)
    } else if (!userRole && userId) {
      const { data: userData } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (userData?.center_id) {
        const { data: centerData } = await supabase
          .from('centers')
          .select('lead_vendor')
          .eq('id', userData.center_id)
          .maybeSingle()

        if (centerData?.lead_vendor) {
          qb = qb.eq('lead_vendor', centerData.lead_vendor)
        } else {
          availableLeadVendors.value = ['—']
          availableStatuses.value = ['—']
          return
        }
      } else {
        availableLeadVendors.value = ['—']
        availableStatuses.value = ['—']
        return
      }
    }

    const { data, error: optErr } = await qb
    if (optErr) throw optErr

    const vendorSet = new Set<string>()
    const statusSet = new Set<string>()
    for (const r of (data ?? []) as Array<{ lead_vendor: string | null; status: string | null }>) {
      vendorSet.add(normalizeFilterValue(r.lead_vendor))
      statusSet.add(normalizeFilterValue(r.status))
    }

    const vendors = Array.from(vendorSet)
    const statuses = Array.from(statusSet)
    vendors.sort((a, b) => a.localeCompare(b))
    statuses.sort((a, b) => a.localeCompare(b))

    if (userRole === 'super_admin') {
      availableLeadVendors.value = vendors
    }
    availableStatuses.value = [PENDING_APPROVAL]
  } catch {
  }
}

onMounted(async () => {
  await loadFilterOptions()
  await load()
})

watch([query, leadVendorFilter, statusFilter], () => {
  if (currentPage.value !== 1) {
    resetPagination()
    return
  }
  load().catch(() => {
  })
})

watch(currentPage, () => {
  load().catch(() => {
  })
})

watch(pageCount, () => {
  if (currentPage.value > pageCount.value) currentPage.value = pageCount.value
})

const openRow = (row: DailyDealFlow) => {
  router.push(`/retainers/${row.id}`)
}

const dropOpen = ref(false)
const dropTarget = ref<DailyDealFlow | null>(null)
const dropBusy = ref(false)

const openDrop = (row: DailyDealFlow) => {
  dropTarget.value = row
  dropOpen.value = true
}

const handleDropOpenUpdate = (v: boolean) => {
  dropOpen.value = v
  if (!v) {
    dropTarget.value = null
    dropBusy.value = false
  }
}

const confirmDrop = async () => {
  const target = dropTarget.value
  if (!target?.id) return

  dropBusy.value = true
  try {
    const { error: updateErr } = await supabase
      .from('daily_deal_flow')
      .update({ status: 'Dropped' })
      .eq('id', target.id)

    if (updateErr) throw updateErr

    await load()
    dropOpen.value = false
    dropTarget.value = null
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to drop retainer'
    error.value = msg
  } finally {
    dropBusy.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="retainers">
    <template #header>
      <UDashboardNavbar title="Retainers">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="load"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col">
      <UModal
        :open="dropOpen"
        title="Drop retainer"
        :dismissible="false"
        @update:open="handleDropOpenUpdate"
      >
        <template #body="{ close }">
          <div class="space-y-4">
            <div class="text-sm text-muted">
              Are you sure you want to drop this retainer/client? This action will mark the retainer as dropped.
            </div>

            <div class="rounded-md border border-default bg-elevated/30 p-3 text-sm">
              <div class="font-semibold">{{ dropTarget?.insured_name ?? '—' }}</div>
              <div class="mt-1 text-xs text-muted">
                {{ dropTarget?.client_phone_number ?? '—' }} · {{ dropTarget?.submission_id ?? '—' }}
              </div>
            </div>

            <div class="flex items-center justify-end gap-2">
              <UButton
                color="neutral"
                variant="outline"
                :disabled="dropBusy"
                @click="() => { close() }"
              >
                Cancel
              </UButton>
              <UButton
                color="error"
                variant="solid"
                :loading="dropBusy"
                @click="confirmDrop"
              >
                Drop retainer
              </UButton>
            </div>
          </div>
        </template>
      </UModal>

      <div class="flex w-full flex-wrap items-center justify-between gap-3">
        <div class="flex flex-1 flex-wrap items-center gap-3">
          <UInput
            v-model="query"
            class="max-w-md"
            icon="i-lucide-search"
            placeholder="Search by name, phone..."
          />

          <USelect
            v-if="isSuperAdmin"
            v-model="leadVendorFilter"
            :items="leadVendorOptions"
            class="w-56"
          />

          <USelect
            v-model="statusFilter"
            :items="statusOptions"
            class="w-56"
          />
        </div>

        <UBadge
          variant="subtle"
          :label="`${totalCount} leads`"
        />
      </div>

      <UAlert
        v-if="error"
        class="mt-4"
        color="error"
        variant="subtle"
        title="Unable to load retainers"
        :description="error"
      />

      <UPageCard variant="subtle" class="relative mt-4 flex flex-1 min-h-0 flex-col p-0!">
        <div class="flex-1 min-h-0 overflow-y-auto p-4 pb-16">
        <UTable
          class="mt-0"
          :loading="loading"
          :data="pagedRows"
          :columns="columns"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/50 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default'
          }"
        >
          <template #date-cell="{ row }">
            <span class="text-sm text-black dark:text-white/80">{{ formatDate(row.original.date) }}</span>
          </template>

          <template #insured_name-cell="{ row }">
            <span class="text-sm text-black dark:text-white/90">{{ row.original.insured_name ?? '—' }}</span>
          </template>

          <template #client_phone_number-cell="{ row }">
            <span class="text-sm text-black dark:text-white/80">{{ row.original.client_phone_number ?? '—' }}</span>
          </template>

          <template #lead_vendor-cell="{ row }">
            <span class="text-sm text-black dark:text-white/80">{{ row.original.lead_vendor ?? '—' }}</span>
          </template>

          <template #status-cell="{ row }">
            <UBadge
              variant="subtle"
              :color="statusColor(row.original.status)"
              class="text-xs"
            >
              {{ row.original.status ?? '—' }}
            </UBadge>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-2">
              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide-eye"
                label="View"
                @click="openRow(row.original)"
              />

              <UButton
                size="xs"
                color="neutral"
                variant="outline"
                icon="i-lucide-ban"
                label="Drop"
                @click="openDrop(row.original)"
              />
            </div>
          </template>
        </UTable>
        </div>

        <div class="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-default bg-elevated/50 px-4 py-2">
          <span class="text-xs text-dimmed">Page {{ displayPage }} of {{ pageCount }}</span>

          <div class="flex items-center justify-end gap-2">
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="!canPrev"
            @click="goPrev"
          >
            Previous
          </UButton>

          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            :disabled="!canNext"
            @click="goNext"
          >
            Next
          </UButton>
          </div>
        </div>
      </UPageCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
