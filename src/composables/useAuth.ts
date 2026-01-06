import { ref, readonly } from 'vue'
import { createSharedComposable } from '@vueuse/core'
import type { Session, User } from '@supabase/supabase-js'

import { supabase } from '../lib/supabase'

type AuthState = {
  ready: boolean
  loading: boolean
  user: User | null
  session: Session | null
}

const _useAuth = () => {
  const state = ref<AuthState>({
    ready: false,
    loading: true,
    user: null,
    session: null
  })

  const init = async () => {
    if (state.value.ready) return

    state.value.loading = true
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error

    state.value.session = data.session
    state.value.user = data.session?.user ?? null
    state.value.ready = true
    state.value.loading = false

    supabase.auth.onAuthStateChange((_event, session) => {
      state.value.session = session
      state.value.user = session?.user ?? null
      state.value.ready = true
      state.value.loading = false
    })
  }

  const signInWithPassword = async (email: string, password: string) => {
    state.value.loading = true
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    state.value.loading = false

    if (error) throw error

    state.value.session = data.session
    state.value.user = data.user
    state.value.ready = true
  }

  const signOut = async () => {
    state.value.loading = true
    const { error } = await supabase.auth.signOut()
    state.value.loading = false
    if (error) throw error
    state.value.session = null
    state.value.user = null
  }

  return {
    state: readonly(state),
    init,
    signInWithPassword,
    signOut
  }
}

export const useAuth = createSharedComposable(_useAuth)
