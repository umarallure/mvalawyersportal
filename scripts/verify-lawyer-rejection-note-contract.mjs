import { readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFile(join(repository, path), 'utf8')
const failures = []
const assert = (condition, message) => { if (!condition) failures.push(message) }

const [migration, board, detail] = await Promise.all([
  read('supabase/migrations/20260722050000_classify_lawyer_lead_notes.sql'),
  read('src/pages/retainers.vue'),
  read('src/pages/retainers-details.vue')
])

assert(migration.includes('ADD COLUMN IF NOT EXISTS note_type text'), 'Missing note_type column')
assert(migration.includes("ALTER COLUMN note_type SET DEFAULT 'internal'"), 'Onboarding notes do not default to internal')
assert(migration.includes("CHECK (note_type IN ('internal', 'lawyer_rejection'))"), 'Missing note_type constraint')
assert(migration.includes("'lawyer_rejection'\n  )\n  RETURNING * INTO v_note"), 'Rejection RPC does not insert a classified note')
assert(migration.includes("current_setting('app.lawyer_rejection_note_write', true)"), 'Classified writes are not guarded')
assert(migration.includes('SECURITY DEFINER\nSET search_path = public'), 'RPC search paths are not fixed')

const disqualifyStart = board.indexOf('const confirmDisqualify = async () =>')
const disqualifyEnd = board.indexOf('const stageIcon =', disqualifyStart)
const disqualifyFlow = board.slice(disqualifyStart, disqualifyEnd)
assert(disqualifyFlow.includes("supabase.rpc('reject_lawyer_lead'"), 'Disqualification does not use the atomic rejection RPC')
assert(!disqualifyFlow.includes(".from('lawyer_lead_notes')"), 'The board still writes rejection notes directly')
assert(!disqualifyFlow.includes(".from('leads')"), 'The board still updates rejection status separately')

const rejectedPreflight = detail.indexOf("'get_lawyer_rejected_lead_detail'")
const piiFetch = detail.indexOf(".from('leads')")
assert(rejectedPreflight >= 0 && piiFetch > rejectedPreflight, 'Rejected detail preflight does not precede lead PII access')
assert(detail.slice(rejectedPreflight, piiFetch).includes('return'), 'Rejected detail does not return before lead PII access')
assert(detail.includes('Its personal information was not loaded.'), 'Rejected detail does not communicate the PII boundary')
assert(detail.includes('rejectedLead.rejection_note?.note'), 'Rejected detail does not render the classified note')

if (failures.length) {
  for (const failure of failures) process.stderr.write(`FAIL: ${failure}\n`)
  process.exitCode = 1
} else {
  process.stdout.write('Lawyer rejection note contract verified on main\n')
}
