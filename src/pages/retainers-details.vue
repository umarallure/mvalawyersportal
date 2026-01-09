<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { supabase } from '../lib/supabase'
import { useAuth } from '../composables/useAuth'
import { getAttorneyNameMapByUserIds } from '../lib/attorney-profile'

type DailyDealFlow = Record<string, unknown> & {
  id: string
  submission_id: string
  insured_name?: string | null
  client_phone_number?: string | null
  created_at?: string | null
  updated_at?: string | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const id = computed(() => route.params.id as string)

const loading = ref(false)
const error = ref<string | null>(null)
const row = ref<DailyDealFlow | null>(null)
const assignedAttorneyName = ref<string>('—')

const activeTab = ref('basic')

const tabs = [
  { label: 'Basic Information', icon: 'i-lucide-user', value: 'basic' },
  { label: 'Accident Details', icon: 'i-lucide-car', value: 'accident' },
  { label: 'Insurance & Policy', icon: 'i-lucide-shield', value: 'insurance' },
  { label: 'Additional Info', icon: 'i-lucide-info', value: 'additional' }
]

const headerTitle = computed(() => {
  if (!row.value) return 'Lead details'
  const name = row.value.insured_name || 'Unknown'
  const phone = row.value.client_phone_number || 'N/A'
  return `${name} - ${phone}`
})

const load = async () => {
  loading.value = true
  error.value = null

  try {
    await auth.init()

    const userId = auth.state.value.user?.id
    const userRole = auth.state.value.profile?.role

    let queryBuilder = supabase
      .from('daily_deal_flow')
      .select('*')
      .eq('id', id.value)

    // If user is a lawyer, only allow leads assigned to them
    if (userRole === 'lawyer' && userId) {
      queryBuilder = queryBuilder.eq('assigned_attorney_id', userId)
    } else if (!userRole) {
      // If no role, filter by lead vendor matching user's center
      const { data: userData, error: userErr } = await supabase
        .from('app_users')
        .select('center_id')
        .eq('user_id', userId || '')
        .maybeSingle()

      if (userErr) throw userErr

      if (userData?.center_id) {
        const { data: centerData, error: centerErr } = await supabase
          .from('centers')
          .select('lead_vendor')
          .eq('id', userData.center_id)
          .maybeSingle()

        if (centerErr) throw centerErr

        if (centerData?.lead_vendor) {
          queryBuilder = queryBuilder.eq('lead_vendor', centerData.lead_vendor)
        } else {
          error.value = 'Lead not found'
          row.value = null
          return
        }
      } else {
        error.value = 'Lead not found'
        row.value = null
        return
      }
    }
    // Admin and agent roles can view all leads (no filter)

    const { data, error: supaError } = await queryBuilder.maybeSingle()

    if (supaError) throw supaError
    if (!data) {
      error.value = 'Lead not found'
      row.value = null
      return
    }

    row.value = data as DailyDealFlow

    const assignedId = (data as any)?.assigned_attorney_id as string | null | undefined
    if (assignedId) {
      const map = await getAttorneyNameMapByUserIds([assignedId])
      assignedAttorneyName.value = map[assignedId] ?? '—'
    } else {
      assignedAttorneyName.value = '—'
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to load lead'
    error.value = msg
  } finally {
    loading.value = false
  }
}

onMounted(load)

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function formatDateOnly(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  })
}

function formatFieldValue(key: string, value: unknown) {
  if (key === 'created_at' || key === 'updated_at' || key.endsWith('_at')) {
    return formatDateTime(typeof value === 'string' ? value : null)
  }

  if (key === 'date' || key.endsWith('_date')) {
    return formatDateOnly(typeof value === 'string' ? value : null)
  }

  return formatValue(value)
}

const basicInfoFields = computed(() => {
  if (!row.value) return []
  return [
    ['insured_name', 'Customer Name'],
    ['client_phone_number', 'Phone Number'],
    ['contact_name', 'Contact Name'],
    ['contact_number', 'Contact Number'],
    ['contact_address', 'Contact Address'],
    ['status', 'Status'],
    ['lead_vendor', 'Lead Vendor'],
    ['assigned_attorney', 'Assigned Attorney'],
    ['date', 'Date']
  ].map(([key, label]) => {
    if (key === 'assigned_attorney') {
      return { key, label, value: assignedAttorneyName.value }
    }

    return { key, label, value: (row.value as any)[key] }
  })
})

const accidentDetailsFields = computed(() => {
  if (!row.value) return []
  return [
    ['accident_date', 'Accident Date'],
    ['accident_location', 'Accident Location'],
    ['accident_scenario', 'Accident Scenario'],
    ['prior_attorney_involved', 'Prior Attorney Involved'],
    ['prior_attorney_details', 'Prior Attorney Details'],
    ['medical_attention', 'Medical Attention'],
    ['police_attended', 'Police Attended'],
    ['injuries', 'Injuries'],
    ['other_party_admit_fault', 'Other Party Admit Fault'],
    ['passengers_count', 'Passengers Count']
  ].map(([key, label]) => ({ key, label, value: (row.value as any)[key] }))
})

const insurancePolicyFields = computed(() => {
  if (!row.value) return []
  return [
    ['insured', 'Insured'],
    ['insurance_company', 'Insurance Company'],
    ['vehicle_registration', 'Vehicle Registration'],
    ['third_party_vehicle_registration', 'Third Party Vehicle Registration'],
    ['carrier', 'Carrier'],
    ['carrier_attempted_1', 'Carrier Attempted 1'],
    ['carrier_attempted_2', 'Carrier Attempted 2'],
    ['carrier_attempted_3', 'Carrier Attempted 3'],
    ['product_type', 'Product Type'],
    ['policy_number', 'Policy Number'],
    ['monthly_premium', 'Monthly Premium'],
    ['face_amount', 'Face Amount'],
    ['placement_status', 'Placement Status']
  ].map(([key, label]) => ({ key, label, value: (row.value as any)[key] }))
})

const additionalInfoFields = computed(() => {
  if (!row.value) return []
  return [
    ['buffer_agent', 'Buffer Agent'],
    ['licensed_agent_account', 'Licensed Agent Account'],
    ['call_result', 'Call Result'],
    ['draft_date', 'Draft Date'],
    ['from_callback', 'From Callback'],
    ['is_callback', 'Is Callback'],
    ['is_retention_call', 'Is Retention Call'],
    ['carrier_audit', 'Carrier Audit'],
    ['product_type_carrier', 'Product Type Carrier'],
    ['level_or_gi', 'Level or GI'],
    ['notes', 'Notes'],
    ['ghl_location_id', 'GHL Location ID'],
    ['ghl_opportunity_id', 'GHL Opportunity ID'],
    ['ghlcontactid', 'GHL Contact ID'],
    ['sync_status', 'Sync Status'],
    ['created_at', 'Created At'],
    ['updated_at', 'Updated At']
  ].map(([key, label]) => ({ key, label, value: (row.value as any)[key] }))
})
</script>

<template>
  <UDashboardPanel id="retainer-details">
    <template #header>
      <UDashboardNavbar :title="headerTitle">
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
        <UTabs v-model="activeTab" :items="tabs">
          <template #content="{ item }">
            <UCard v-if="item.value === 'basic'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in basicInfoFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'accident'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in accidentDetailsFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'insurance'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in insurancePolicyFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>

            <UCard v-else-if="item.value === 'additional'">
              <div class="grid gap-4 md:grid-cols-2">
                <div
                  v-for="field in additionalInfoFields"
                  :key="field.key"
                  class="rounded-lg border border-default bg-elevated/20 p-3"
                >
                  <div class="text-xs uppercase tracking-wide text-muted">
                    {{ field.label }}
                  </div>
                  <div class="mt-1 text-sm text-highlighted wrap-break-word">
                    {{ formatFieldValue(field.key, field.value) }}
                  </div>
                </div>
              </div>
            </UCard>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>
</template>
