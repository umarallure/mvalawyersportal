<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'

type DailyDealFlow = Record<string, unknown> & {
  id: string
  submission_id: string
  created_at?: string | null
  updated_at?: string | null
}

const route = useRoute()
const router = useRouter()

const id = computed(() => route.params.id as string)

const loading = ref(false)
const error = ref<string | null>(null)
const row = ref<DailyDealFlow | null>(null)

const load = async () => {
  loading.value = true
  error.value = null

  try {
    const { data, error: supaError } = await supabase
      .from('daily_deal_flow')
      .select('*')
      .eq('id', id.value)
      .maybeSingle()

    if (supaError) throw supaError
    if (!data) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    row.value = data as DailyDealFlow
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load lead'
    error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)

const orderedEntries = computed(() => {
  if (!row.value) return [] as Array<[string, unknown]>

  const preferred = [
    'submission_id',
    'insured_name',
    'client_phone_number',
    'lead_vendor',
    'status',
    'agent',
    'carrier',
    'product_type',
    'policy_number',
    'monthly_premium',
    'face_amount',
    'notes',
    'date',
    'created_at',
    'updated_at'
  ]

  const entries = Object.entries(row.value)

  const preferredEntries = preferred
    .filter((k) => entries.some(([key]) => key === k))
    .map((k) => [k, (row.value as any)[k]] as [string, unknown])

  const rest = entries
    .filter(([key]) => !preferred.includes(key))
    .sort(([a], [b]) => a.localeCompare(b))

  return [...preferredEntries, ...rest]
})

function labelize(key: string) {
  return key
    .split('_').join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}
</script>

<template>
  <UDashboardPanel id="retainer-details">
    <template #header>
      <UDashboardNavbar :title="row?.submission_id ? `Lead ${row.submission_id}` : 'Lead details'">
        <template #leading>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="router.push('/retainers')"
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
        title="Unable to load lead"
        :description="error"
      />

      <div v-else-if="loading" class="flex h-full min-h-64 items-center justify-center">
        <UIcon name="i-lucide-loader-circle" class="size-8 animate-spin text-dimmed" />
      </div>

      <div v-else-if="row" class="space-y-4">
        <UCard>
          <template #header>
            <div class="flex flex-col gap-1">
              <div class="text-sm text-muted">Submission ID</div>
              <div class="text-lg font-semibold text-highlighted">{{ row.submission_id }}</div>
            </div>
          </template>

          <div class="grid gap-4 md:grid-cols-2">
            <div
              v-for="[key, value] in orderedEntries"
              :key="key"
              class="rounded-lg border border-default bg-elevated/20 p-3"
            >
              <div class="text-xs uppercase tracking-wide text-muted">
                {{ labelize(key) }}
              </div>
              <div class="mt-1 text-sm text-highlighted break-words">
                {{ formatValue(value) }}
              </div>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
