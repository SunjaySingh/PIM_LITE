import type { EffectHandler } from '@sanity/workflow-engine'
import { API_BASE } from './apiBase'

/**
 * Handlers for the workflow's `selfHosted` effects.
 *
 * "Self-hosted" means exactly that: Sanity does not call a webhook and has no
 * endpoint of ours registered anywhere. A pending effect sits on the instance
 * until something holding an engine calls `drainEffects`, which claims the
 * entry and dispatches it to the handler registered under its name.
 *
 * These handlers run wherever the engine lives — in our case the browser, under
 * the Studio session — so they cannot touch the Sanity write token. Each one
 * therefore posts to the API route that does the real work server-side, and
 * translates a failed response into a throw so the engine records the failure
 * and applies the effect's retry policy.
 */

function postJson(path: string) {
  return async (params: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        documentId: params.documentId,
        sku: params.sku,
      }),
    })

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string }
      throw new Error(`${path} failed: ${body.error ?? res.statusText}`)
    }

    // Returning void completes the effect with no outputs. The work's result
    // is already in the Content Lake, and the conditions that advance the
    // workflow read the product document rather than effect outputs.
  }
}

/** Keyed by the effect `name` declared in sanity.workflow.ts. */
export const effectHandlers: Record<string, EffectHandler> = {
  'trigger-enrich': postJson('/api/agent/enrich'),
  'trigger-audit': postJson('/api/agent/audit'),
  'trigger-video-render': postJson('/api/remotion/render'),
}
