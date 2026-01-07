import './assets/css/main.css'

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ui from '@nuxt/ui/vue-plugin'
import App from './App.vue'
import { useAuth } from './composables/useAuth'

const app = createApp(App)

const router = createRouter({
  routes: [
    { path: '/', component: () => import('./pages/index.vue'), meta: { public: true } },
    { path: '/get-started', component: () => import('./pages/get-started.vue'), meta: { public: true } },
    { path: '/login', component: () => import('./pages/login.vue'), meta: { public: true } },
    { path: '/dashboard', component: () => import('./pages/dashboard.vue') },
    { path: '/inbox', component: () => import('./pages/inbox.vue') },
    { path: '/retainers', component: () => import('./pages/retainers.vue') },
    { path: '/retainers/:id', component: () => import('./pages/retainers-details.vue') },
    { path: '/users', component: () => import('./pages/users.vue'), meta: { requiresAdmin: true } },
    { path: '/centers', component: () => import('./pages/centers.vue'), meta: { requiresAdmin: true } },
    {
      path: '/settings',
      component: () => import('./pages/settings.vue'),
      children: [
        { path: '', component: () => import('./pages/settings/index.vue') },
        { path: 'attorney-profile', component: () => import('./pages/settings/attorney-profile.vue') },
        { path: 'expertise', component: () => import('./pages/settings/expertise.vue') },
        { path: 'capacity', component: () => import('./pages/settings/capacity.vue') }
      ]
    }
  ],
  history: createWebHistory()
})

router.beforeEach(async (to) => {
  const auth = useAuth()

  await auth.init()

  const isPublic = Boolean(to.meta.public)
  const isLoggedIn = Boolean(auth.state.value.user)
  const requiresAdmin = Boolean(to.meta.requiresAdmin)
  const isAdmin = auth.state.value.profile?.role === 'admin'

  if (to.path === '/login' && isLoggedIn) {
    return { path: '/dashboard' }
  }

  if (isPublic) return true

  if (requiresAdmin) {
    if (!isLoggedIn) {
      return { path: '/login', query: { redirect: to.fullPath } }
    }

    if (!isAdmin) {
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
