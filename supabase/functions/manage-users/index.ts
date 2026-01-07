/// <reference lib="deno.ns" />

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.56.0'

type Role = 'admin' | 'lawyer' | 'agent'

type AppUserRow = {
  user_id: string
  email: string
  display_name: string | null
  role: Role | null
  center_id: string | null
  created_at: string
  updated_at: string
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS'
}

const json = (status: number, body: unknown) => {
  console.log('[manage-users] response', status)
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const getEnv = (key: string) => {
  const v = Deno.env.get(key)
  if (!v) throw new Error(`Missing env var: ${key}`)
  return v
}

const getBearerToken = (req: Request) => {
  const auth = req.headers.get('authorization') ?? ''
  const [type, token] = auth.split(' ')
  if (type?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const validateRole = (role: unknown): role is Role =>
  role === 'admin' || role === 'lawyer' || role === 'agent'

const requireAdmin = async (req: Request) => {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const anonKey = getEnv('SUPABASE_ANON_KEY')
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')

  const token = getBearerToken(req)
  if (!token) return { ok: false as const, res: json(401, { error: 'Missing Authorization header' }) }

  console.log('[manage-users] checking auth user')
  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  const { data: userData, error: userErr } = await authClient.auth.getUser()
  if (userErr || !userData.user) {
    console.log('[manage-users] invalid session', userErr?.message)
    return { ok: false as const, res: json(401, { error: 'Invalid session' }) }
  }

  const adminClient = createClient(supabaseUrl, serviceKey)

  console.log('[manage-users] checking admin role for', userData.user.id)
  const { data: roleRow, error: roleErr } = await adminClient
    .from('app_users')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle()

  if (roleErr) {
    console.log('[manage-users] role lookup failed', roleErr.message)
    return { ok: false as const, res: json(500, { error: roleErr.message }) }
  }

  if (!roleRow || roleRow.role !== 'admin') {
    console.log('[manage-users] forbidden for non-admin', userData.user.email)
    return { ok: false as const, res: json(403, { error: 'Admin access required' }) }
  }

  return { ok: true as const, adminClient }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    console.log('[manage-users] request', req.method, new URL(req.url).pathname)

    const ctx = await requireAdmin(req)
    if (!ctx.ok) return ctx.res
    const supabaseAdmin = ctx.adminClient

    if (req.method === 'GET') {
      console.log('[manage-users] listing users')
      const { data, error } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) return json(500, { error: error.message })
      return json(200, { users: data as AppUserRow[] })
    }

    if (req.method === 'POST') {
      const body = await req.json().catch(() => ({}))
      console.log('[manage-users] create body', body)

      const email = String(body?.email ?? '').trim().toLowerCase()
      const password = String(body?.password ?? '')
      const role = body?.role === undefined || body?.role === null ? null : String(body.role)
      const centerId = body?.center_id === undefined || body?.center_id === null ? null : String(body.center_id)

      if (!email) return json(400, { error: 'email is required' })
      if (!password) return json(400, { error: 'password is required' })
      if (role !== null && !validateRole(role)) return json(400, { error: 'invalid role' })

      const created = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true
      })

      if (created.error || !created.data.user) {
        return json(500, { error: created.error?.message ?? 'Unable to create user' })
      }

      const userId = created.data.user.id

      const { error: upsertErr } = await supabaseAdmin
        .from('app_users')
        .upsert({
          user_id: userId,
          email,
          display_name: null,
          role: role as Role | null,
          center_id: centerId
        })

      if (upsertErr) return json(500, { error: upsertErr.message })

      const { data: row, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(500, { error: rowErr.message })
      return json(201, { user: row as AppUserRow })
    }

    if (req.method === 'PATCH') {
      const body = await req.json().catch(() => ({}))
      console.log('[manage-users] patch body', body)

      const userId = String(body?.user_id ?? '').trim()
      const role = body?.role === undefined || body?.role === null ? null : String(body.role)
      const centerId = body?.center_id === undefined ? undefined : (body?.center_id === null ? null : String(body.center_id))

      if (!userId) return json(400, { error: 'user_id is required' })
      if (role !== null && !validateRole(role)) return json(400, { error: 'invalid role' })

      const patch: Record<string, unknown> = {}
      if (role !== undefined) patch.role = role as Role | null
      if (centerId !== undefined) patch.center_id = centerId

      const { error: updateErr } = await supabaseAdmin
        .from('app_users')
        .update(patch)
        .eq('user_id', userId)

      if (updateErr) return json(500, { error: updateErr.message })

      const { data, error: rowErr } = await supabaseAdmin
        .from('app_users')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (rowErr) return json(500, { error: rowErr.message })
      return json(200, { user: data as AppUserRow })
    }

    if (req.method === 'DELETE') {
      const body = await req.json().catch(() => ({}))
      console.log('[manage-users] delete body', body)

      const userId = String(body?.user_id ?? '').trim()
      if (!userId) return json(400, { error: 'user_id is required' })

      const del = await supabaseAdmin.auth.admin.deleteUser(userId)
      if (del.error) return json(500, { error: del.error.message })

      await supabaseAdmin.from('app_users').delete().eq('user_id', userId)
      return json(200, { ok: true })
    }

    return json(405, { error: 'Method not allowed' })
  } catch (e) {
    console.log('[manage-users] unhandled error', e)
    const msg = e instanceof Error ? e.message : 'Unexpected error'
    return json(500, { error: msg })
  }
})
