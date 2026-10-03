/*
 * JS mirror of the custom properties declared in tokens.module.css.
 *
 * Most styling should reference the variables directly from a .module.css
 * file. These exports exist for the cases that genuinely need a token as a
 * string in JS — inline `style` props and plain data objects that carry a
 * colour alongside their label.
 *
 * Any element using these must be inside the subtree carrying the `.tokens`
 * class, otherwise the variables will not resolve.
 */

export const colors = {
  // Status colours
  scoreHigh: 'var(--pim-score-high)',
  scoreMid: 'var(--pim-score-mid)',
  scoreLow: 'var(--pim-score-low)',
  // Workflow state colours
  stateDraft: 'var(--pim-state-draft)',
  stateAuditPending: 'var(--pim-state-audit-pending)',
  stateAuditPassed: 'var(--pim-state-audit-passed)',
  stateVideoReq: 'var(--pim-state-video-req)',
  stateVideoReady: 'var(--pim-state-video-ready)',
  statePublished: 'var(--pim-state-published)',
  // Surface
  surface: 'var(--pim-surface)',
  surfaceAlt: 'var(--pim-surface-alt)',
  border: 'var(--pim-border)',
  text: 'var(--pim-text)',
  textMuted: 'var(--pim-text-muted)',
} as const

export const spacing = {
  xs: 'var(--pim-space-xs)',
  sm: 'var(--pim-space-sm)',
  md: 'var(--pim-space-md)',
  lg: 'var(--pim-space-lg)',
  xl: 'var(--pim-space-xl)',
} as const

export const typography = {
  fontMono: 'var(--pim-font-mono)',
  fontSans: 'var(--pim-font-sans)',
} as const
