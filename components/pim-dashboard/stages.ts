import { colors } from '../../styles/tokens'

/**
 * One place that defines the pipeline's stage vocabulary, so the board and the
 * stats panel cannot drift from each other or from the engine.
 *
 * WORKFLOW_STAGES must stay in lockstep with the stage names in
 * sanity.workflow.ts — they are what `currentStage` on an instance holds, and
 * they are interpolated into GROQ below. A name that drifts does not error; the
 * count just silently comes back zero.
 */
export const WORKFLOW_DEFINITION = 'amazon-readiness'

export const WORKFLOW_STAGES = [
  'draft',
  'audit-pending',
  'human-review',
  'audit-passed',
  'video-requested',
  'video-ready',
  'published',
] as const

export type WorkflowStage = (typeof WORKFLOW_STAGES)[number]

/**
 * Not an engine stage: products the pipeline has never been started for have no
 * instance at all. The dashboard shows them as their own bucket, derived by
 * subtracting the instance count from the catalogue count.
 */
export const NOT_STARTED = 'not-started'

export const STAGE_ORDER = [NOT_STARTED, ...WORKFLOW_STAGES] as const

export const STAGE_META: Record<string, { label: string; color: string }> = {
  [NOT_STARTED]:      { label: 'Not Started',    color: colors.border },
  'draft':            { label: 'Draft',           color: colors.stateDraft },
  'audit-pending':    { label: 'Audit Pending',   color: colors.stateAuditPending },
  'human-review':     { label: 'Human Review',    color: colors.stateAuditPending },
  'audit-passed':     { label: 'Audit Passed',    color: colors.stateAuditPassed },
  'video-requested':  { label: 'Video Rendering', color: colors.stateVideoReq },
  'video-ready':      { label: 'Video Ready',     color: colors.stateVideoReady },
  'published':        { label: 'Published',       color: colors.statePublished },
}

/**
 * An instance addresses its subject by GDR uri (`dataset:project:dataset:docId`),
 * so the document id is everything from the fourth segment on — ids may contain
 * colons, which is why this rejoins the tail rather than taking segment three.
 */
export function docIdFromGdr(gdr: string | null | undefined): string | null {
  if (!gdr) return null
  return gdr.split(':').slice(3).join(':') || null
}
