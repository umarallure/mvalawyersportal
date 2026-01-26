<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { useAuth } from '../composables/useAuth'
import { listOrdersForLawyer } from '../lib/orders'

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
  caseValue: number
  stage: StageKey
  reason?: string
  signedDate?: string
}

const loading = ref(false)
const query = ref('')
const selectedStage = ref<'all' | StageKey>('all')

const auth = useAuth()

const totalOrdersCount = ref(0)

const load = async () => {
  loading.value = true
  try {
    await auth.init()
    const userId = auth.state.value.user?.id ?? null
    if (!userId) {
      totalOrdersCount.value = 0
      return
    }

    const data = await listOrdersForLawyer({ lawyerId: userId })
    totalOrdersCount.value = data.length
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load().catch(() => {
  })
})

const filteredOrders = computed(() => {
  return [] as FulfillmentOrder[]
})

const ordersByStage = computed(() => {
  const grouped = new Map<StageKey, FulfillmentOrder[]>()
  STAGES.forEach((s) => grouped.set(s.key, []))
  return grouped
})

const totalOrders = computed(() => totalOrdersCount.value)
const signedCount = computed(() => 0)
const droppedCount = computed(() => 0)
const returnedCount = computed(() => 0)

const formatMoney = (n: number) => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
  } catch {
    return `$${n}`
  }
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
            <UInput
              v-model="query"
              class="max-w-md"
              icon="i-lucide-search"
              placeholder="Search orders..."
            />

            <USelect
              v-model="selectedStage"
              :items="[{ label: 'All Stages', value: 'all' }, ...STAGES.map(s => ({ label: s.label, value: s.key }))]"
              class="w-56"
              value-key="value"
              label-key="label"
            />
          </div>

          <UBadge variant="subtle" :label="`${filteredOrders.length} orders`" />
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
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="truncate text-sm font-semibold">{{ order.clientName }}</div>
                      <div class="mt-0.5 text-xs text-muted">{{ order.id }} · {{ order.phone }}</div>
                    </div>
                    <div class="shrink-0 text-sm font-semibold">{{ formatMoney(order.caseValue) }}</div>
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
