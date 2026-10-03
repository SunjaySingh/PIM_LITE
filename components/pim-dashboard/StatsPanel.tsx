'use client'

import styles from './StatsPanel.module.css'
import { cx } from './cx'
import { useQuery } from '@sanity/sdk-react'
import { useMemo } from 'react'
import { scoreClass } from './scoreClass'
import {
  NOT_STARTED,
  STAGE_META,
  STAGE_ORDER,
  WORKFLOW_DEFINITION,
  WORKFLOW_STAGES,
} from './stages'

interface StatsData {
  total: number
  /** null when nothing in the catalogue has been audited yet. */
  avgScore: number | null
}

// Averaged and counted in GROQ rather than by pulling every audited product
// down and reducing here — the catalogue is ~1k master products and this panel
// only ever renders the two resulting numbers.
const QUERY = `{
  "total": count(*[_type == "product" && productKind == "master"]),
  "avgScore": math::avg(*[_type == "product" && productKind == "master" && defined(amazonChannel.readinessScore)].amazonChannel.readinessScore)
}`

/**
 * Restricts an instance to one whose subject is a master product.
 *
 * Without this the panel mixes two populations: `total` counts masters, but the
 * dataset has instances pointing at variants too, so `total - withInstance`
 * subtracted a product that was never in `total` to begin with and the stage
 * rows did not add up to the catalogue.
 *
 * Segment 3 of the subject's GDR uri (`dataset:project:dataset:docId`) is the
 * document id. Splitting in GROQ rather than matching a hand-built prefix keeps
 * the project and dataset names out of the query.
 */
const MASTER_SUBJECT = `string::split(fields[_type == "subject"][0].value.id, ":")[3] in *[_type == "product" && productKind == "master"]._id`

const INSTANCE = `_type == "sanity.workflow.instance" && definition == "${WORKFLOW_DEFINITION}" && ${MASTER_SUBJECT}`

/**
 * Live stage counts, straight off the workflow instances. One `count()` per
 * stage rather than fetching the instances and tallying them client-side, so
 * the numbers are exact however large the catalogue grows.
 *
 * `not-started` is not an engine stage and so has no row here — it is derived
 * from `total - withInstance` below, the same bucket the board uses for
 * products the pipeline was never started for.
 */
const STAGE_QUERY = `{
  "withInstance": count(*[${INSTANCE}]),
  ${WORKFLOW_STAGES.map(
    stage => `"${stage}": count(*[${INSTANCE} && currentStage == "${stage}"])`,
  ).join(',\n  ')}
}`

/**
 * Issue stats read each product's *current* audit report — the one its
 * `auditReport` reference points at — not the whole report history.
 *
 * This was previously `*[_type == "auditReport"][0...100]`, which was wrong
 * twice over: the slice silently dropped every report past the hundredth, and
 * re-auditing a product added its issues to the tally again for each run, so a
 * product audited six times counted six times.
 *
 * `blockedProducts` counts products, not issue rows: one product with four
 * suppressible issues is one product blocked from listing, which is what the
 * number is meant to answer.
 */
const ISSUE_QUERY = `{
  "ruleIds": *[_type == "product" && productKind == "master" && defined(auditReport)].auditReport->issues[].ruleId,
  "blockedProducts": count(*[_type == "product" && productKind == "master" && count(auditReport->issues[severity == "suppressible"]) > 0])
}`

interface IssueStats {
  ruleIds: string[]
  blockedProducts: number
}

type StageCounts = { withInstance: number } & Record<string, number>

const EMPTY_STATS: StatsData = { total: 0, avgScore: null }
const EMPTY_ISSUES: IssueStats = { ruleIds: [], blockedProducts: 0 }

interface Props {
  onRunAudit: () => void
}

export function StatsPanel({ onRunAudit }: Props) {
  const { data: raw } = useQuery<StatsData>({ query: QUERY })
  const data = raw ?? EMPTY_STATS

  const { data: rawStages } = useQuery<StageCounts>({ query: STAGE_QUERY })
  const { data: rawIssues } = useQuery<IssueStats>({ query: ISSUE_QUERY })
  const issueStats = rawIssues ?? EMPTY_ISSUES

  const avgScore = data.avgScore != null ? Math.round(data.avgScore) : null

  const stageCounts = useMemo((): Record<string, number> => {
    const counts: Record<string, number> = Object.fromEntries(
      STAGE_ORDER.map(stage => [stage, 0]),
    )
    if (!rawStages) return counts

    for (const stage of WORKFLOW_STAGES) {
      counts[stage] = rawStages[stage] ?? 0
    }
    counts[NOT_STARTED] = Math.max(0, data.total - (rawStages.withInstance ?? 0))
    return counts
  }, [rawStages, data.total])

  const top5IssueTypes = useMemo((): { ruleId: string; count: number }[] => {
    const freq = new Map<string, number>()
    for (const ruleId of issueStats.ruleIds ?? []) {
      if (!ruleId) continue
      freq.set(ruleId, (freq.get(ruleId) ?? 0) + 1)
    }
    return Array.from(freq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([ruleId, count]) => ({ ruleId, count }))
  }, [issueStats.ruleIds])

  return (
    <div className={styles.panel}>
      <div className={styles.section}>
        <div className={styles.title}>Product Catalog</div>
        <div className={styles.bigStat}>{data.total.toLocaleString()}</div>
        <div className={styles.statLabel}>master products</div>
      </div>

      <div className={styles.section}>
        <div className={styles.title}>Avg Readiness Score</div>
        {avgScore !== null ? (
          <div className={cx(styles.scoreDisplay, scoreClass(avgScore, styles))}>
            {avgScore}
          </div>
        ) : (
          <div className={cx(styles.scoreDisplay, styles.scoreLow)}>—</div>
        )}
        <div className={styles.statLabel}>across all audited</div>
      </div>

      <div className={styles.section}>
        <div className={styles.title}>Products by Stage</div>
        {STAGE_ORDER.map(stage => (
          <div key={stage} className={styles.row}>
            <span className={styles.rowLabel}>
              <span
                className={styles.dot}
                style={{ backgroundColor: STAGE_META[stage].color }}
              />
              {STAGE_META[stage].label}
            </span>
            <span className={styles.rowValue}>{stageCounts[stage] ?? 0}</span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.title}>Top Issue Types</div>
        {top5IssueTypes.length === 0 ? (
          <div className={styles.row}>
            <span className={styles.rowLabel}>—</span>
          </div>
        ) : top5IssueTypes.map(({ ruleId, count }) => (
          <div key={ruleId} className={styles.row}>
            <span className={styles.rowLabel}>{ruleId}</span>
            <span className={styles.rowValue}>{count}</span>
          </div>
        ))}
      </div>

      <div className={styles.section}>
        <div className={styles.title}>Suppressible Issues</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Products Blocked</span>
          <span className={styles.rowValue}>{issueStats.blockedProducts ?? 0}</span>
        </div>
      </div>

      <button className={styles.startBtn} onClick={onRunAudit}>
        + Run Audit by SKU
      </button>
    </div>
  )
}
