<script setup lang="ts">
import { ref, watch } from 'vue'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../composables/useAuth'
import type { Period, Range, Stat } from '../../types'

const props = defineProps<{
  period: Period
  range: Range
}>()

const auth = useAuth()

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  })
}

const baseStats = [{
  title: 'Retainers',
  icon: 'i-lucide-briefcase',
  minValue: 400,
  maxValue: 1000,
  minVariation: -15,
  maxVariation: 25
}, {
  title: 'Conversions',
  icon: 'i-lucide-chart-pie',
  minValue: 1000,
  maxValue: 2000,
  minVariation: -10,
  maxVariation: 20
}, {
  title: 'Revenue',
  icon: 'i-lucide-circle-dollar-sign',
  minValue: 200000,
  maxValue: 500000,
  minVariation: -20,
  maxVariation: 30,
  formatter: formatCurrency
}, {
  title: 'Orders',
  icon: 'i-lucide-shopping-cart',
  minValue: 100,
  maxValue: 300,
  minVariation: -5,
  maxVariation: 15
}]

const stats = ref<Stat[]>([])

const PENDING_APPROVAL = 'Pending Approval'

const fetchRetainerCountForLawyer = async (lawyerId: string) => {
  const { count: ddfCount, error: ddfError } = await supabase
    .from('daily_deal_flow')
    .select('id', { count: 'exact', head: true })
    .eq('status', PENDING_APPROVAL)
    .eq('assigned_attorney_id', lawyerId)

  if (ddfError) throw new Error(ddfError.message)

  const { count: leadsCount, error: leadsError } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_attorney_id', lawyerId)

  if (leadsError) throw new Error(leadsError.message)

  return (ddfCount ?? 0) + (leadsCount ?? 0)
}

const fetchOrderCountForLawyer = async (lawyerId: string) => {
  const { count, error } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('lawyer_id', lawyerId)

  if (error) throw new Error(error.message)
  return count ?? 0
}

watch([() => props.period, () => props.range], async () => {
  await auth.init()

  const userId = auth.state.value.user?.id ?? null
  const role = auth.state.value.profile?.role ?? null

  let retainerCount = 0
  let orderCount = 0

  if (role === 'lawyer' && userId) {
    try {
      retainerCount = await fetchRetainerCountForLawyer(userId)
      orderCount = await fetchOrderCountForLawyer(userId)
    } catch {
      retainerCount = 0
      orderCount = 0
    }
  }

  stats.value = baseStats.map((stat) => {
    let value = 0
    if (stat.title === 'Retainers') value = retainerCount
    if (stat.title === 'Orders') value = orderCount

    const variation = 0

    return {
      title: stat.title,
      icon: stat.icon,
      value: stat.formatter ? stat.formatter(value) : value,
      variation
    }
  })
}, { immediate: true })
</script>

<template>
  <UPageGrid class="lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-px">
    <UPageCard
      v-for="(stat, index) in stats"
      :key="index"
      :icon="stat.icon"
      :title="stat.title"
      to="/retainers"
      variant="subtle"
      :ui="{
        container: 'gap-y-1.5',
        wrapper: 'items-start',
        leading: 'p-2.5 rounded-full bg-primary/10 ring ring-inset ring-primary/25',
        title: 'font-normal text-muted text-xs uppercase'
      }"
      class="lg:rounded-none first:rounded-l-lg last:rounded-r-lg hover:z-1"
    >
      <div class="flex items-center gap-2">
        <span class="text-2xl font-semibold text-highlighted">
          {{ stat.value }}
        </span>

        <UBadge
          :color="stat.variation > 0 ? 'success' : 'error'"
          variant="subtle"
          class="text-xs"
        >
          {{ stat.variation > 0 ? '+' : '' }}{{ stat.variation }}%
        </UBadge>
      </div>
    </UPageCard>
  </UPageGrid>
</template>
