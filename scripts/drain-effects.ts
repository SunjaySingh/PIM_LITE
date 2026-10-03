/**
 * Drain pending workflow effects for every in-flight instance.
 *
 * `selfHosted` effects are not pushed anywhere by Sanity — they sit on the
 * instance until an engine claims them. The Studio drains the instance you are
 * looking at; this drains all of them, which is what you want for a batch run
 * or when nobody has the dashboard open.
 *
 * Requires the Next.js app to be running, because the handlers post to its API
 * routes (those hold the Sanity write token).
 *
 *   pnpm dev              # in one terminal
 *   pnpm workflow:drain   # in another
 *   pnpm workflow:drain --watch
 */

import { createClient } from '@sanity/client'
import {
  createEngine,
  type EffectHandler,
  type WorkflowClient,
  type WorkflowResource,
} from '@sanity/workflow-engine'

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? 'dkhhaxxy'
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET ?? 'production'
const token = process.env.SANITY_API_TOKEN
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

if (!token) throw new Error('SANITY_API_TOKEN is required to drain effects.')

const TAG = 'prod'
const workflowResource: WorkflowResource = { type: 'dataset', id: `${projectId}.${dataset}` }

const client = createClient({ projectId, dataset, apiVersion: '2026-09-18', useCdn: false, token })

function postJson(path: string): EffectHandler {
  return async (params: Record<string, unknown>) => {
    const res = await fetch(`${appUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentId: params.documentId, sku: params.sku }),
    })
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(`${path} failed: ${body.error ?? res.statusText}`)
    }
    // void — completes the effect with no outputs; see effectHandlers.ts
  }
}

// See the note in scripts/start-workflow.ts — generics variance only.
const engine = createEngine({
  client: client as unknown as WorkflowClient,
  workflowResource,
  tag: TAG,
  effects: {
    handlers: {
      'trigger-enrich': postJson('/api/agent/enrich'),
      'trigger-audit': postJson('/api/agent/audit'),
      'trigger-video-render': postJson('/api/remotion/render'),
    },
  },
})

async function drainOnce(): Promise<number> {
  const instances: { _id: string; currentStage: string }[] = await client.fetch(
    `*[_type == "sanity.workflow.instance" && tag == $tag]{_id, currentStage}`,
    { tag: TAG },
  )

  let total = 0
  for (const instance of instances) {
    try {
      const result = await engine.drainEffects({ instanceId: instance._id })
      total += result.drained.length
      if (result.drained.length || result.failed.length) {
        console.log(
          `  ${instance._id} [${instance.currentStage}] ` +
            `drained=${result.drained.length} failed=${result.failed.length} skipped=${result.skipped.length}`,
        )
        for (const f of result.failed) console.log(`      ✗ ${JSON.stringify(f)}`)
      }
    } catch (err) {
      console.error(`  ✗ ${instance._id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return total
}

async function main() {
  const watch = process.argv.includes('--watch')
  console.log(`Draining effects for tag "${TAG}" via ${appUrl}${watch ? ' (watching)' : ''}…`)

  do {
    const drained = await drainOnce()
    if (!watch) {
      console.log(drained > 0 ? `\nDrained ${drained} effect(s).` : '\nNothing pending.')
      return
    }
    await new Promise(r => setTimeout(r, 4000))
    // eslint-disable-next-line no-constant-condition
  } while (true)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
