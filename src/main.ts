import './assets/css/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import { useAuth } from './composables/useAuth'
import { useAttorneyProfile } from './composables/useAttorneyProfile'

const app = createApp(App)

const router = createRouter({
  routes: [
    { path: '/', component: () => import('./pages/index.vue'), meta: { public: true } },
    { path: '/get-started', component: () => import('./pages/get-started.vue') },
    { path: '/login', component: () => import('./pages/login.vue'), meta: { public: true } },
    { path: '/dashboard', component: () => import('./pages/dashboard.vue') },
    { path: '/inbox', component: () => import('./pages/not-found.vue') },
    { path: '/intake-map', component: () => import('./pages/intake-map.vue') },
    { path: '/orders/:id', component: () => import('./pages/orders-details.vue') },
    { path: '/retainers', component: () => import('./pages/retainers.vue') },
    { path: '/retainers/:id', component: () => import('./pages/retainers-details.vue') },
    { path: '/fulfillment', component: () => import('./pages/fulfillment.vue') },
    { path: '/invoicing', component: () => import('./pages/invoicing.vue') },
    { path: '/users', component: () => import('./pages/users.vue'), meta: { requiresSuperAdmin: true } },
    { path: '/centers', component: () => import('./pages/centers.vue'), meta: { requiresSuperAdmin: true } },
    {
      path: '/settings',
      component: () => import('./pages/settings.vue'),
      children: [
        { path: '', component: () => import('./pages/settings/index.vue') },
        { path: 'attorney-profile', component: () => import('./pages/settings/attorney-profile.vue') },
        { path: 'expertise', component: () => import('./pages/settings/expertise.vue') },
        { path: 'capacity', component: () => import('./pages/settings/capacity.vue') }
      ]
    },
    { path: '/:pathMatch(.*)*', component: () => import('./pages/not-found.vue') }
  ],
  history: createWebHistory()
})

router.beforeEach(async (to, from) => {
  const auth = useAuth()
  const attorneyProfile = useAttorneyProfile()

  await auth.init()

  const isPublic = Boolean(to.meta.public)
  const isLoggedIn = Boolean(auth.state.value.user)
  const requiresSuperAdmin = Boolean(to.meta.requiresSuperAdmin)
  const isSuperAdmin = auth.state.value.profile?.role === 'super_admin'
  const role = auth.state.value.profile?.role
  const isRoleAllowed = role === 'super_admin' || role === 'admin' || role === 'lawyer'

  const userId = auth.state.value.user?.id ?? null
  const lawyerCompletion = async () => {
    if (role !== 'lawyer' || !userId) return null
    await attorneyProfile.loadProfile(userId)
    return attorneyProfile.completionPercentage.value
  }

  if (from.path === '/login' && isLoggedIn) {
    const completion = await lawyerCompletion()
    if (completion !== null && completion < 50 && !to.path.startsWith('/settings')) {
      return { path: '/settings' }
    }
  }

  if (to.path === '/login' && isLoggedIn) {
    const completion = await lawyerCompletion()
    if (completion !== null && completion < 50) {
      return { path: '/settings' }
    }
    return { path: '/dashboard' }
  }

  if (isPublic) return true

  if (isLoggedIn && !isRoleAllowed) {
    await auth.signOut()
    return { path: '/login', query: { reason: 'role_blocked' } }
  }

  if (requiresSuperAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (!isSuperAdmin) {
      return { path: '/dashboard' }
    }

    return true
  }

  if (isLoggedIn) return true

  return { path: '/login', query: { redirect: to.fullPath } }
})

app.use(router)

app.use(ui)

app.mount('#app')
