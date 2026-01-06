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
    {
      path: '/settings',
      component: () => import('./pages/settings.vue'),
      children: [
        { path: '', component: () => import('./pages/settings/index.vue') },
        { path: 'members', component: () => import('./pages/settings/members.vue') },
        { path: 'notifications', component: () => import('./pages/settings/notifications.vue') },
        { path: 'security', component: () => import('./pages/settings/security.vue') }
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

  if (to.path === '/login' && isLoggedIn) {
    return { path: '/dashboard' }
  }

  if (isPublic) return true
  if (isLoggedIn) return true

  return { path: '/login', query: { redirect: to.fullPath } }
})

app.use(router)

app.use(ui)

app.mount('#app')
