<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useStorage } from '@vueuse/core'
import type { NavigationMenuItem } from '@nuxt/ui'

import { useAuth } from './composables/useAuth'

const toast = useToast()
const route = useRoute()
const auth = useAuth()

const open = ref(false)

onMounted(() => {
  auth.init().catch(() => {
  })
})

const links = computed(() => [[{
  label: 'Dashboard',
  icon: 'i-lucide-house',
  to: '/dashboard',
  onSelect: () => {
    open.value = false
  }
}, /* {
  label: 'Inbox',
  icon: 'i-lucide-inbox',
  to: '/inbox',
  badge: '4',
  onSelect: () => {
    open.value = false
  }
}, */ {
  label: 'Intake Map',
  icon: 'i-lucide-map',
  to: '/intake-map',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Retainers',
  icon: 'i-lucide-briefcase',
  to: '/retainers',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Fulfillment',
  icon: 'i-lucide-package',
  to: '/fulfillment',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Invoicing',
  icon: 'i-lucide-receipt',
  to: '/invoicing',
  onSelect: () => {
    open.value = false
  }
},
...(auth.state.value.profile?.role === 'super_admin' ? [ {
  label: 'Users',
  icon: 'i-lucide-users',
  to: '/users',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Centers',
  icon: 'i-lucide-building-2',
  to: '/centers',
  onSelect: () => {
    open.value = false
  }
}] : []), {
  label: 'Settings',
  to: '/settings',
  icon: 'i-lucide-settings',
  defaultOpen: route.path.startsWith('/settings'),
  type: 'trigger',
  children: [{
    label: 'General',
    to: '/settings',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Attorney Profile',
    to: '/settings/attorney-profile',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Expertise & Jurisdiction',
    to: '/settings/expertise',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }, {
    label: 'Capacity & Performance',
    to: '/settings/capacity',
    exact: true,
    onSelect: () => {
      open.value = false
    }
  }]
}]] satisfies NavigationMenuItem[][])

const isPublicPage = computed(() => ['/login', '/', '/get-started'].includes(route.path))

const groups = computed(() => [{
  id: 'links',
  label: 'Go to',
  items: links.value.flat()
}])

const cookie = useStorage('cookie-consent', 'pending')
if (cookie.value !== 'accepted') {
  toast.add({
    title: 'We use first-party cookies to enhance your experience on our website.',
    duration: 0,
    close: false,
    actions: [{
      label: 'Accept',
      color: 'neutral',
      variant: 'outline',
      onClick: () => {
        cookie.value = 'accepted'
      }
    }, {
      label: 'Opt out',
      color: 'neutral',
      variant: 'ghost'
    }]
  })
}
</script>

<template>
  <Suspense>
    <UApp>
      <template v-if="isPublicPage">
        <RouterView />
      </template>

      <UDashboardGroup
        v-else
        unit="rem"
        storage="local"
      >
        <UDashboardSidebar
          id="default"
          v-model:open="open"
          collapsible
          resizable
          class="bg-elevated/25"
          :ui="{ header: 'px-0', footer: 'lg:border-t lg:border-default' }"
        >
          <template #header="{ collapsed }">
            <TeamsMenu :collapsed="collapsed" />
          </template>

          <template #default="{ collapsed }">
            <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[0]"
              orientation="vertical"
              tooltip
              popover
            />

            <UNavigationMenu
              :collapsed="collapsed"
              :items="links[1]"
              orientation="vertical"
              tooltip
              class="mt-auto"
            />
          </template>

          <template #footer="{ collapsed }">
            <UserMenu :collapsed="collapsed" />
          </template>
        </UDashboardSidebar>

        <UDashboardSearch :groups="groups" />

        <RouterView />

        <NotificationsSlideover />
      </UDashboardGroup>
    </UApp>
  </Suspense>
</template>
