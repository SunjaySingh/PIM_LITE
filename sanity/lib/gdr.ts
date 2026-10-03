import { parseGdr } from '@sanity/workflow-engine'

/**
 * Normalise a document identifier to a bare Content Lake `_id`.
 *
 * A hydrated subject's `_id` inside the workflow engine is stamped as a GDR
 * URI (`dataset:project:dataset:doc-id`), because a workflow reference can
 * cross resources. Effect bindings therefore hand handlers a GDR URI where the
 * API routes expect a plain `_id`, and a GROQ lookup on the URI silently
 * matches nothing.
 *
 * Accepts a GDR URI, a `drafts.`-prefixed id, or an already-bare id.
 */
export function toLakeId(id: string): string {
  const bare = id.includes(':') ? safeParse(id) : id
  return bare.replace(/^drafts\./, '')
}

function safeParse(uri: string): string {
  try {
    return parseGdr(uri).documentId
  } catch {
    // Not a GDR after all — leave it alone rather than mangle it.
    return uri
  }
}
