import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseImportDraft, buildActivitiesFromParsed } from '../src/lib/importCatalog'
import { activityToSheet } from '../src/services/mappers'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_URL = 'https://script.google.com/macros/s/AKfycbwP0uhG6nsbdIKbx-M6kQjQAV5tIyJcxR0tcgpiZqu4QFDtMOALfN3gMFW8PiXt2Tr6/exec'
const ACCESS_KEY = '1234'

async function post(body: Record<string, unknown>) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ ...body, key: ACCESS_KEY })
  })
  return res.json()
}

async function main() {
  const jsonPath = path.resolve(__dirname, '../catalogo_autosol_actividades_borrador.json')
  const content = fs.readFileSync(jsonPath, 'utf-8')
  const parsed = parseImportDraft(content, '2026-10-16')
  const chosen = parsed.filter(i => !i.isExcluded)
  const { toInsert } = buildActivitiesFromParsed(chosen, [], 'RAC')
  
  console.log(`Parsed ${toInsert.length} activities to insert.`)
  const sheetsPayload = toInsert.map(activityToSheet)

  console.log('Attempting batchUpsertActivities...')
  const batchRes = await post({
    action: 'batchUpsertActivities',
    data: sheetsPayload
  })
  console.log('batchUpsertActivities response:', JSON.stringify(batchRes))

  if (!batchRes.success) {
    console.log('batchUpsertActivities not supported by current deployment, falling back to individual upsertActivity calls...')
    for (let i = 0; i < sheetsPayload.length; i++) {
      const act = sheetsPayload[i]
      const r = await post({
        action: 'upsertActivity',
        id: act.ID,
        data: act
      })
      console.log(`[${i + 1}/${sheetsPayload.length}] ${act.ID} - ${act.NOMBRE}: ${r.success ? 'OK' : r.error}`)
    }
  }

  // Verify
  const verifyRes = await fetch(`${API_URL}?action=getPlanner&key=${ACCESS_KEY}`).then(r => r.json())
  console.log('Verification result - activities count in Sheet:', verifyRes.data?.activities?.length)
}

main().catch(console.error)

