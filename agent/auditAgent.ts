/**
 * Mastra audit agent — checks products against Amazon channel readiness rules.
 *
 * Usage:
 *   pnpm tsx agent/auditAgent.ts --mode=batch
 *   pnpm tsx agent/auditAgent.ts --mode=single --sku=008884303989M
 *
 * Also called via POST /api/agent/audit
 */

import { randomBytes } from 'crypto'
import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})
import { createTool } from '@mastra/core/tools'
import { z } from 'zod'
import { sanityClient } from '../sanity/lib/client'

// ─── Scoring constants ───────────────────────────────────────────────────────

const SEVERITY_DEDUCTION: Record<string, number> = {
  suppressible: 15,
  optimisation: 5,
  info: 2,
}

// ─── Tools ───────────────────────────────────────────────────────────────────

const fetchProduct = createTool({
  id: 'fetchProduct',
  description: 'Fetch a single product from Sanity by SKU',
  inputSchema: z.object({ sku: z.string() }),
  outputSchema: z.object({ product: z.any() }),
  execute: async ({ sku }) => {
    const product = await sanityClient.fetch(
      `*[_type == "product" && sku == $sku][0]`,
      { sku }
    )
    return { product }
  },
})

const writeAuditReport = createTool({
  id: 'writeAuditReport',
  description: 'Write audit report back to Sanity and update readiness score on the product',
  inputSchema: z.object({
    productId: z.string(),
    sku: z.string(),
    overallScore: z.number(),
    issues: z.array(z.object({
      ruleId: z.string(),
      field: z.string(),
      severity: z.string(),
      message: z.string(),
    })),
    suggestedMetaTitle: z.string().optional(),
    suggestedMetaDescription: z.string().optional(),
    suggestedBulletPoints: z.array(z.string()).optional(),
    suggestedBackendTerms: z.string().optional(),
    agentNotes: z.string().optional(),
  }),
  outputSchema: z.object({ reportId: z.string() }),
  execute: async ({ productId, sku: _sku, overallScore, issues, suggestedMetaTitle, suggestedMetaDescription, suggestedBulletPoints, suggestedBackendTerms, agentNotes }) => {
    const reportDoc = {
      _type: 'auditReport',
      product: { _type: 'reference', _ref: productId },
      auditedAt: new Date().toISOString(),
      overallScore,
      issues: issues.map(i => ({ ...i, _key: randomBytes(6).toString('hex') })),
      suggestedMetaTitle,
      suggestedMetaDescription,
      suggestedBulletPoints,
      suggestedBackendTerms,
      agentNotes,
    }

    const result = await sanityClient.create(reportDoc)

    await sanityClient
      .patch(productId)
      .set({
        'amazonChannel.readinessScore': overallScore,
        auditReport: { _type: 'reference', _ref: result._id },
      })
      .commit()

    return { reportId: result._id }
  },
})

// ─── Audit rules ─────────────────────────────────────────────────────────────

interface Issue {
  ruleId: string
  field: string
  severity: 'suppressible' | 'optimisation' | 'info'
  message: string
}

interface AuditRuleDoc {
  ruleId: string
  field: string
  checkType: 'required' | 'minLength' | 'maxLength' | 'lengthRange' | 'maxBytes' | 'regex' | 'positive'
  severity: 'suppressible' | 'optimisation' | 'info'
  message: string
  enabled: boolean
  minLength?: number
  maxLength?: number
  maxBytes?: number
  pattern?: string
  patternShouldMatch?: boolean
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getField(product: any, path: string): unknown {
  return path.split('.').reduce((obj, key) => obj?.[key], product)
}

function evaluateRule(rule: AuditRuleDoc, product: unknown): boolean {
  const value = getField(product, rule.field)

  switch (rule.checkType) {
    case 'required':
      return !value

    case 'minLength': {
      const str = (value as string) ?? ''
      return str.trim().length < (rule.minLength ?? 0)
    }

    case 'maxLength': {
      if (!value) return true
      return (value as string).length > (rule.maxLength ?? Infinity)
    }

    case 'lengthRange': {
      const len = ((value as string) ?? '').length
      return len < (rule.minLength ?? 0) || len > (rule.maxLength ?? Infinity)
    }

    case 'maxBytes': {
      if (!value) return true
      return Buffer.byteLength(value as string) > (rule.maxBytes ?? Infinity)
    }

    case 'regex': {
      const str = ((value as string) ?? '').trim()
      const matches = new RegExp(rule.pattern ?? '').test(str)
      return rule.patternShouldMatch ? !matches : matches
    }

    case 'positive': {
      const num = value as number
      return !num || num <= 0
    }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runRules(product: any): Promise<Issue[]> {
  const rules: AuditRuleDoc[] = await sanityClient.fetch(
    `*[_type == "auditRule" && enabled == true] | order(ruleId asc)`
  )

  const issues: Issue[] = []

  for (const rule of rules) {
    if (evaluateRule(rule, product)) {
      issues.push({ ruleId: rule.ruleId, field: rule.field, severity: rule.severity, message: rule.message })
    }
  }

  // Conditional rules — cross-field logic that cannot be expressed declaratively
  const ch = product.amazonChannel ?? {}
  const flag = (ruleId: string, field: string, severity: Issue['severity'], message: string) =>
    issues.push({ ruleId, field, severity, message })

  if (product.price > 10000 && !['jewelry', 'watches'].includes((product.sfccCategory ?? '').toLowerCase()))
    flag('R013', 'price', 'info', 'Price over $10,000 in non-luxury category — possible normalisation issue')

  if (product.color && !product.colorDisplay)
    flag('R019', 'colorDisplay', 'optimisation', 'Color display name not resolved from SFCC code')

  if (product.size && !product.sizeDisplay)
    flag('R020', 'sizeDisplay', 'optimisation', 'Size display name not resolved from SFCC code')

  const cat = (product.sfccCategory ?? '').toLowerCase()
  if (['shirt', 'suit'].includes(cat)) {
    if (!ch.materialType) flag('R023', 'amazonChannel.materialType', 'suppressible', 'Apparel requires material type')
    if (!ch.department)   flag('R024', 'amazonChannel.department',   'suppressible', 'Apparel requires department')
  }

  return issues
}

function calcScore(issues: Issue[]): number {
  const deduction = issues.reduce((sum, i) => sum + (SEVERITY_DEDUCTION[i.severity] ?? 0), 0)
  return Math.max(0, 100 - deduction)
}

// ─── Agent ───────────────────────────────────────────────────────────────────

const auditAgent = new Agent({
  id: 'pim-audit-agent',
  name: 'PIM Audit Agent',
  instructions: `You audit product data against Amazon channel readiness rules.
For each product: run the rules, calculate the score, and write an audit report to Sanity.
For products scoring below 70 or missing SEO fields, use the LLM to generate:
- suggestedMetaTitle (Amazon-optimised, brand-first, ≤60 chars)
- suggestedMetaDescription (≤160 chars)
- suggestedBulletPoints (3–5 benefit-led bullets)
- suggestedBackendTerms (synonyms + search terms, ≤250 bytes)
Always write the report via the writeAuditReport tool.`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: openrouter('openai/gpt-oss-120b') as any,
  tools: { fetchProduct, writeAuditReport },
})

// ─── Batch population ────────────────────────────────────────────────────────

const WORKFLOW_DEFINITION = 'amazon-readiness'

const PRODUCT_PROJECTION = `{
  _id, sku, name, sfccCategory, longDescription, price,
  color, colorDisplay, size, sizeDisplay, amazonChannel
}`

/**
 * The products batch mode audits: the ones the workflow has actually parked in
 * `audit-pending`, because batch mode is what the stage's `trigger-audit`
 * effect drives.
 *
 * It is deliberately *not* "anything with a low score or missing SEO fields" —
 * that is the population the single-product LLM path cares about, and using it
 * here re-audited products sitting in draft, human-review or published, none of
 * which the engine is waiting on. It also skipped audit-pending products that
 * happened to score well on a previous run, which are exactly the ones whose
 * stage cannot advance until a fresh audit completes.
 *
 * Instances address their subject by GDR uri, so the document id is everything
 * from the fourth colon-separated segment on (ids may themselves contain colons).
 */
async function fetchAuditPendingProducts() {
  const instances: { gdr: string | null }[] = await sanityClient.fetch(
    `*[_type == "sanity.workflow.instance"
        && definition == $definition
        && currentStage == "audit-pending"]{
      "gdr": fields[_type == "subject"][0].value.id
    }`,
    { definition: WORKFLOW_DEFINITION }
  )

  const ids = Array.from(
    new Set(
      instances
        .map(i => i.gdr?.split(':').slice(3).join(':'))
        .filter((id): id is string => Boolean(id))
    )
  )

  if (!ids.length) return []

  return sanityClient.fetch(
    `*[_type == "product" && _id in $ids]${PRODUCT_PROJECTION}`,
    { ids }
  )
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => a.replace('--', '').split('=') as [string, string])
  )
  const mode = args.mode ?? 'single'
  const sku = args.sku

  if (mode === 'single' && !sku) {
    console.error('--sku is required for mode=single')
    process.exit(1)
  }

  if (mode === 'single') {
    const product = await sanityClient.fetch(`*[_type == "product" && sku == $sku][0]`, { sku })
    if (!product) { console.error(`Product not found: ${sku}`); process.exit(1) }
    const issues = await runRules(product)
    const score  = calcScore(issues)
    console.log(`${sku}: score=${score}, issues=${issues.length}`)
    await auditAgent.generate(`Audit product ${sku} (id: ${product._id}). Score: ${score}. Issues: ${JSON.stringify(issues)}. Write the report.`)
  } else {
    const products = await fetchAuditPendingProducts()
    console.log(`Auditing ${products.length} products in the audit-pending stage…`)
    for (const product of products) {
      const issues = await runRules(product)
      const score  = calcScore(issues)
      await auditAgent.generate(`Audit product ${product.sku} (id: ${product._id}). Score: ${score}. Issues: ${JSON.stringify(issues)}. Write the report.`)
      console.log(`✓ ${product.sku}: ${score}`)
    }
  }
}

if (process.argv[1] === import.meta.url.replace('file://', '')) {
  main().catch(console.error)
}

export { runRules, calcScore, auditAgent }
