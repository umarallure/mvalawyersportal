<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

import { useAuth } from '../composables/useAuth'
import { listOrdersForLawyer, type OrderRow } from '../lib/orders'
import { supabase } from '../lib/supabase'

type StageKey = 'returned_back' | 'dropped_retainers' | 'signed_retainers'

const STAGES: { key: StageKey, label: string }[] = [
  { key: 'returned_back', label: 'Returned Back' },
  { key: 'dropped_retainers', label: 'Dropped Retainers' },
  { key: 'signed_retainers', label: 'Signed Retainers' }
]

type FulfillmentOrder = {
  id: string
  date: string
  clientName: string
  phone: string
  state: string
  status: string
  stage: StageKey
  reason?: string
  signedDate?: string
}

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')

const selectedOrderId = ref<string | undefined>(undefined)
const orders = ref<OrderRow[]>([])
const leads = ref<FulfillmentOrder[]>([])

const auth = useAuth()
const router = useRouter()

const totalOrdersCount = ref(0)

const ORDER_LINK_KEYS = ['order_id', 'intake_order_id', 'assigned_order_id', 'orders_id', 'order_uuid'] as const

const normalize = (v: unknown) => String(v ?? '').trim().toLowerCase()

const toStage = (status: string) => {
  const s = normalize(status)
  if (s.includes('drop')) return 'dropped_retainers' as const
  if (s.includes('signed')) return 'signed_retainers' as const
  if (s.includes('return')) return 'returned_back' as const
  return 'returned_back' as const
}

const detectOrderLinkKey = (rows: Array<Record<string, unknown>>) => {
  for (const key of ORDER_LINK_KEYS) {
    if (rows.some(r => r[key] !== undefined && r[key] !== null)) return key
  }
  return null
}

const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    if (!userId) {
      totalOrdersCount.value = 0
      orders.value = []
      selectedOrderId.value = undefined
      leads.value = []
      return
    }

    const data = await listOrdersForLawyer({ lawyerId: userId })
    orders.value = data
    totalOrdersCount.value = data.length

    if (!selectedOrderId.value && data.length) {
      selectedOrderId.value = data[0]?.id ?? undefined
    }

    const { data: leadRows, error: leadErr } = await supabase
      .from('daily_deal_flow')
      .select('*')
      .eq('assigned_attorney_id', userId)
      .order('created_at', { ascending: false })
      .limit(1000)

    if (leadErr) throw leadErr

    const rawRows = (leadRows ?? []) as Array<Record<string, unknown>>
    const linkKey = detectOrderLinkKey(rawRows)

    const selected = selectedOrderId.value
    const filteredByOrder = selected && linkKey
      ? rawRows.filter(r => String(r[linkKey] ?? '') === selected)
      : rawRows

    leads.value = filteredByOrder.map((r) => {
      const status = String(r.status ?? '—')
      const stage = toStage(status)
      return {
        id: String(r.id ?? ''),
        date: String(r.date ?? (r.created_at ?? '')).slice(0, 10),
        clientName: String(r.insured_name ?? '—'),
        phone: String(r.client_phone_number ?? '—'),
        state: String(r.state ?? r.state_code ?? '—'),
        status,
        stage,
        reason: r.reason ? String(r.reason) : undefined,
        signedDate: r.signed_date ? String(r.signed_date).slice(0, 10) : undefined
      }
    }).filter(l => Boolean(l.id))
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {
  })
})

watch(selectedOrderId, (next, prev) => {
  if (next === prev) return
  load().catch(() => {
  })
})

const filteredOrders = computed(() => {
  const q = query.value.trim().toLowerCase()
  const stageFilter = selectedStage.value

  return leads.value.filter((l) => {
    if (stageFilter !== 'all' && l.stage !== stageFilter) return false
    if (!q) return true
    return [l.clientName, l.phone, l.id, l.status, l.state].some(v => String(v ?? '').toLowerCase().includes(q))
  })
})

const ordersByStage = computed(() => {
  const grouped = new Map<StageKey, FulfillmentOrder[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
  filteredOrders.value.forEach((o) => {
    const arr = grouped.get(o.stage) ?? []
    arr.push(o)
    grouped.set(o.stage, arr)
  })
  return grouped
})

const totalOrders = computed(() => totalOrdersCount.value)
const signedCount = computed(() => (ordersByStage.value.get('signed_retainers') ?? []).length)
const droppedCount = computed(() => (ordersByStage.value.get('dropped_retainers') ?? []).length)
const returnedCount = computed(() => (ordersByStage.value.get('returned_back') ?? []).length)

const orderOptions = computed(() => {
  return orders.value.map((o) => {
    const states = (o.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—'
    return {
      label: `${o.case_type} (${states})`,
      value: o.id
    }
  })
})

const openLead = (lead: FulfillmentOrder) => {
  router.push(`/retainers/${lead.id}`)
}
</script>

<template>
  <UDashboardPanel id="fulfillment">
    <template #header>
      <UDashboardNavbar title="Fulfillment Centers - Order Processing">
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
        <div class="mb-4 grid gap-4 sm:grid-cols-4">
          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Total Orders</p>
                <p class="text-2xl font-semibold">{{ totalOrders }}</p>
              </div>
              <UIcon name="i-lucide-package" class="size-8 text-primary" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Signed Retainers</p>
                <p class="text-2xl font-semibold">{{ signedCount }}</p>
              </div>
              <UIcon name="i-lucide-check-circle" class="size-8 text-success" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Dropped</p>
                <p class="text-2xl font-semibold">{{ droppedCount }}</p>
              </div>
              <UIcon name="i-lucide-x-circle" class="size-8 text-error" />
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-muted">Returned Back</p>
                <p class="text-2xl font-semibold">{{ returnedCount }}</p>
              </div>
              <UIcon name="i-lucide-arrow-left-circle" class="size-8 text-warning" />
            </div>
          </UCard>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <USelect
              v-model="selectedOrderId"
              :items="orderOptions"
              class="w-[28rem]"
              value-key="value"
              label-key="label"
              placeholder="Select an order"
            />

            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search leads..."
            />

            <USelect
              v-model="selectedStage"
              :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
              class="w-56"
              value-key="value"
              label-key="label"
            />
          </div>

          <UBadge variant="subtle" :label="`${filteredOrders.length} leads`" />
        </div>

        <div class="mt-4 min-h-0 flex-1 overflow-auto">
          <div class="flex min-h-0 gap-3 pr-2" style="min-width: 1400px;">
            <div
              v-for="stage in STAGES"
              :key="stage.key"
              class="flex min-h-[560px] w-[28rem] flex-col rounded-lg border border-default bg-elevated/20"
            >
              <div class="flex items-center justify-between border-b border-default px-3 py-2">
                <div class="text-sm font-semibold">{{ stage.label }}</div>
                <UBadge
                  variant="subtle"
                  :label="String(ordersByStage.get(stage.key)?.length ?? 0)"
                />
              </div>

              <div class="flex-1 space-y-2 p-2">
                <UCard
                  v-for="order in (ordersByStage.get(stage.key) ?? [])"
                  :key="order.id"
                  class="w-full"
                  :ui="{ body: '!p-2 sm:!p-2' }"
                  @click="openLead(order)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{{ order.clientName }}</div>
                      <div class="mt-0.5 text-xs text-muted">{{ order.id }} · {{ order.phone }}</div>
                    </div>
                    <UBadge variant="subtle" size="xs" :label="order.status" />
                  </div>

                  <div class="mt-2 flex items-center justify-between gap-2">
                    <UBadge variant="subtle" :label="order.state" size="xs" />
                    <div class="text-xs text-muted">{{ order.date }}</div>
                  </div>

                  <div v-if="order.reason" class="mt-2 rounded bg-muted/30 px-2 py-1 text-xs text-muted">
                    {{ order.reason }}
                  </div>

                  <div v-if="order.signedDate" class="mt-2 flex items-center gap-1 text-xs text-success">
                    <UIcon name="i-lucide-check" class="size-3" />
                    <span>Signed: {{ order.signedDate }}</span>
                  </div>
                </UCard>

                <div
                  v-if="(ordersByStage.get(stage.key)?.length ?? 0) === 0"
                  class="rounded-md border border-dashed border-default px-3 py-6 text-center text-xs text-muted"
                >
                  No Retainers
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
