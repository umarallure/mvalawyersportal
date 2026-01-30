<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import type { OrderRow } from '../lib/orders'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const id = computed(() => route.params.id as string)

const loading = ref(false)
const error = ref<string | null>(null)
const order = ref<OrderRow | null>(null)

const quotaTotal = computed(() => Number(order.value?.quota_total ?? 0))
const quotaFilled = computed(() => Number(order.value?.quota_filled ?? 0))
const progressPercent = computed(() => {
  const total = quotaTotal.value
  const filled = quotaFilled.value
  if (!Number.isFinite(total) || total <= 0) return 0
  if (!Number.isFinite(filled) || filled <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((filled / total) * 100)))
})

const statusColor = computed(() => {
  const s = order.value?.status ?? null
  if (s === 'OPEN') return 'success'
  if (s === 'FULFILLED') return 'primary'
  if (s === 'EXPIRED') return 'error'
  return 'neutral'
})

const criteria = computed(() => {
  const raw = order.value?.criteria ?? null
  if (!raw || typeof raw !== 'object') return null
  return raw as Record<string, unknown>
})

const toStringArray = (v: unknown) => {
  if (Array.isArray(v)) return v.map(x => String(x)).filter(Boolean)
  if (typeof v === 'string' && v.trim()) return [v.trim()]
  return [] as string[]
}

const criteriaLanguages = computed(() => toStringArray(criteria.value?.languages))
const criteriaInjurySeverities = computed(() => toStringArray(criteria.value?.injury_severity))
const criteriaLiability = computed(() => {
  const v = criteria.value?.liability_status
  return v ? String(v) : null
})
const criteriaInsurance = computed(() => {
  const v = criteria.value?.insurance_status
  return v ? String(v) : null
})
const criteriaMedical = computed(() => {
  const v = criteria.value?.medical_treatment
  return v ? String(v) : null
})
const criteriaNoPriorAttorney = computed(() => {
  const v = criteria.value?.no_prior_attorney
  if (typeof v === 'boolean') return v
  if (typeof v === 'string') return v.toLowerCase() === 'true'
  return null
})

const headerTitle = computed(() => {
  if (!order.value) return 'Order details'
  const states = (order.value.target_states || []).map(s => String(s || '').toUpperCase()).join(', ') || '—'
  return `Order (${states})`
})

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.user?.id ?? null
    const role = auth.state.value.profile?.role ?? null

    let qb = supabase
      .from('orders')
      .select('id,lawyer_id,target_states,case_type,case_subtype,criteria,quota_total,quota_filled,status,expires_at,created_at')
      .eq('id', id.value)

    if (role === 'lawyer' && userId) {
      qb = qb.eq('lawyer_id', userId)
    }

    const { data, error: supaError } = await qb.maybeSingle()
    if (supaError) throw supaError

    if (!data) {
      error.value = 'Order not found'
      order.value = null
      return
    }

    order.value = data as OrderRow
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load order'
    error.value = msg
    order.value = null
  } finally {
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <UDashboardPanel id="order-details">
    <template #header>
      <UDashboardNavbar :title="headerTitle">
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="router.push('/intake-map')"
          >
            Back
          </UButton>
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
      <UAlert
        v-if="error"
        color="error"
        variant="subtle"
        title="Unable to load order"
        :description="error"
      />

      <div v-else-if="loading" class="flex h-full min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <div v-else-if="order" class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-3">
          <UCard class="lg:col-span-2">
            <div class="flex flex-wrap items-start justify-between gap-4">
              <div class="min-w-0">
                <div class="text-sm text-muted">
                  Case
                </div>
                <div class="mt-1 text-xl font-semibold">
                  {{ order.case_type }}
                  <span v-if="order.case_subtype" class="text-muted">— {{ order.case_subtype }}</span>
                </div>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <UBadge :color="statusColor" variant="subtle" :label="order.status" />
                  <UBadge color="neutral" variant="subtle" :label="`Expires ${String(order.expires_at || '').slice(0, 10)}`" />
                  <UBadge color="neutral" variant="subtle" :label="`Created ${String(order.created_at || '').slice(0, 10)}`" />
                </div>
              </div>

              <div class="min-w-[240px]">
                <div class="text-sm text-muted">
                  Target states
                </div>
                <div class="mt-1 flex flex-wrap gap-2">
                  <UBadge
                    v-for="s in (order.target_states || []).map(x => String(x || '').toUpperCase()).filter(Boolean)"
                    :key="s"
                    color="primary"
                    variant="subtle"
                    :label="s"
                  />
                  <span v-if="(order.target_states || []).length === 0" class="text-sm text-muted">—</span>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="space-y-3">
              <div class="text-sm font-medium">
                Order summary
              </div>

              <div class="grid gap-3">
                <div class="flex items-center justify-between">
                  <div class="text-xs text-muted">
                    Quota
                  </div>
                  <div class="text-sm font-semibold tabular-nums">
                    {{ quotaFilled }}/{{ quotaTotal }}
                  </div>
                </div>

                <div class="h-2 w-full overflow-hidden rounded bg-muted/70 ring-1 ring-inset ring-default">
                  <div
                    class="h-full rounded bg-primary transition-all"
                    :style="{ width: `${progressPercent}%` }"
                  />
                </div>

                <div class="flex items-center justify-between">
                  <div class="text-xs text-muted">
                    Progress
                  </div>
                  <div class="text-sm font-semibold tabular-nums">
                    {{ progressPercent }}%
                  </div>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UCard>
          <div class="flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-medium">
                Criteria
              </div>
              <div class="mt-1 text-xs text-muted">
                Requirements used to qualify leads for this order.
              </div>
            </div>
          </div>

          <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Languages
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge
                  v-for="l in criteriaLanguages"
                  :key="l"
                  color="primary"
                  variant="subtle"
                  :label="l"
                />
                <span v-if="criteriaLanguages.length === 0" class="text-sm text-muted">—</span>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Injury severity
              </div>
              <div class="mt-2 flex flex-wrap gap-2">
                <UBadge
                  v-for="s in criteriaInjurySeverities"
                  :key="s"
                  color="warning"
                  variant="subtle"
                  :label="s"
                />
                <span v-if="criteriaInjurySeverities.length === 0" class="text-sm text-muted">—</span>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Liability status
              </div>
              <div class="mt-2">
                <UBadge
                  v-if="criteriaLiability"
                  color="neutral"
                  variant="subtle"
                  :label="criteriaLiability"
                />
                <span v-else class="text-sm text-muted">—</span>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Insurance status
              </div>
              <div class="mt-2">
                <UBadge
                  v-if="criteriaInsurance"
                  color="neutral"
                  variant="subtle"
                  :label="criteriaInsurance"
                />
                <span v-else class="text-sm text-muted">—</span>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Medical treatment
              </div>
              <div class="mt-2">
                <UBadge
                  v-if="criteriaMedical"
                  color="neutral"
                  variant="subtle"
                  :label="criteriaMedical"
                />
                <span v-else class="text-sm text-muted">—</span>
              </div>
            </div>

            <div class="rounded-lg border border-default bg-elevated p-3">
              <div class="text-xs text-muted">
                Client requirements
              </div>
              <div class="mt-2">
                <UBadge
                  v-if="criteriaNoPriorAttorney !== null"
                  :color="criteriaNoPriorAttorney ? 'success' : 'neutral'"
                  variant="subtle"
                  :label="criteriaNoPriorAttorney ? 'No prior attorney' : 'Prior attorney allowed'"
                />
                <span v-else class="text-sm text-muted">—</span>
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
