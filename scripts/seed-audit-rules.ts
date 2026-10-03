/**
 * Seed declarative audit rules into Sanity.
 * Run: pnpm tsx scripts/seed-audit-rules.ts
 *
 * Conditional/cross-field rules (R013, R019, R020, R023, R024) are intentionally
 * absent — they require logic that depends on other field values and live in code.
 */

import { sanityClient } from '../sanity/lib/client'

/**
 * Mirrors the auditRule schema. Declared explicitly because a bare array
 * literal infers its element type from the first entry — which has no
 * threshold fields — and every later rule that sets minLength or pattern then
 * fails to match it.
 */
interface SeedRule {
  ruleId: string
  field: string
  checkType: 'required' | 'minLength' | 'maxLength' | 'lengthRange' | 'maxBytes' | 'regex' | 'positive'
  severity: 'suppressible' | 'optimisation' | 'info'
  message: string
  description?: string
  minLength?: number
  maxLength?: number
  maxBytes?: number
  pattern?: string
  patternShouldMatch?: boolean
}

const RULES: SeedRule[] = [
  {
    ruleId: 'R001', field: 'amazonChannel.gtin', checkType: 'required', severity: 'suppressible',
    message: 'GTIN/UPC/EAN is missing',
    description: 'Amazon requires a unique product identifier. All listings must have a GTIN.',
  },
  {
    ruleId: 'R002', field: 'amazonChannel.brand', checkType: 'required', severity: 'suppressible',
    message: 'Brand is missing',
    description: 'Brand is a mandatory Amazon field.',
  },
  {
    ruleId: 'R003', field: 'name', checkType: 'lengthRange', severity: 'suppressible',
    message: 'Name must be 10–200 chars',
    minLength: 10, maxLength: 200,
    description: 'Amazon rejects product titles outside this range.',
  },
  {
    ruleId: 'R004', field: 'name', checkType: 'maxLength', severity: 'optimisation',
    message: 'Name exceeds 80 chars (mobile truncation risk)',
    maxLength: 80,
    description: 'Titles over 80 chars are truncated on mobile search results.',
  },
  {
    ruleId: 'R005', field: 'name', checkType: 'regex', severity: 'suppressible',
    message: 'Name contains banned chars (!$?_)',
    pattern: '[!$?_]', patternShouldMatch: false,
    description: 'Amazon suppresses listings with these characters in the title.',
  },
  {
    ruleId: 'R006', field: 'longDescription', checkType: 'minLength', severity: 'suppressible',
    message: 'Description too short (min 150 chars)',
    minLength: 150,
    description: 'Amazon requires a minimum description length for indexing.',
  },
  {
    ruleId: 'R007', field: 'longDescription', checkType: 'minLength', severity: 'optimisation',
    message: 'Description under 300 chars (quality threshold)',
    minLength: 300,
    description: 'Descriptions under 300 chars score lower in Amazon quality checks.',
  },
  {
    ruleId: 'R008', field: 'longDescription', checkType: 'regex', severity: 'suppressible',
    message: 'Description may be truncated (no terminal punctuation)',
    pattern: '[.!?]$', patternShouldMatch: true,
    description: 'Descriptions not ending with sentence punctuation may have been truncated in the source system.',
  },
  {
    ruleId: 'R009', field: 'amazonChannel.bulletPoint1', checkType: 'required', severity: 'suppressible',
    message: 'At least 1 bullet point required',
    description: 'Amazon requires at least one bullet point on every listing.',
  },
  {
    ruleId: 'R010', field: 'amazonChannel.bulletPoint3', checkType: 'required', severity: 'optimisation',
    message: 'At least 3 bullet points recommended',
    description: 'Listings with 3+ bullets perform significantly better in A9 ranking.',
  },
  {
    ruleId: 'R011', field: 'amazonChannel.imageUrl', checkType: 'required', severity: 'optimisation',
    message: 'Main image URL is missing',
    description: 'Amazon will not list a product without a main image. Downgraded from suppressible: the SFCC feed carries no image column, so this is sourced separately rather than being a data-quality defect.',
  },
  {
    ruleId: 'R012', field: 'price', checkType: 'positive', severity: 'suppressible',
    message: 'Price must be present and > 0',
    description: 'Products without a valid price cannot be listed.',
  },
  {
    ruleId: 'R014', field: 'amazonChannel.condition', checkType: 'required', severity: 'suppressible',
    message: 'Condition is required',
    description: 'Amazon requires condition to be specified (New, Used, Refurbished, Collectible).',
  },
  {
    ruleId: 'R015', field: 'amazonChannel.amazonCategory', checkType: 'required', severity: 'suppressible',
    message: 'Amazon product type is missing',
    description: 'Products must be mapped to an Amazon product type / browse node.',
  },
  {
    ruleId: 'R016', field: 'amazonChannel.metaTitle', checkType: 'maxLength', severity: 'optimisation',
    message: 'Meta title missing or over 60 chars',
    maxLength: 60,
    description: 'Search engine meta titles should be ≤60 chars for full display in SERPs.',
  },
  {
    ruleId: 'R017', field: 'amazonChannel.metaDescription', checkType: 'maxLength', severity: 'optimisation',
    message: 'Meta description missing or over 160 chars',
    maxLength: 160,
    description: 'Meta descriptions over 160 chars are truncated in search results.',
  },
  {
    ruleId: 'R018', field: 'amazonChannel.backendSearchTerms', checkType: 'maxBytes', severity: 'optimisation',
    message: 'Backend search terms missing or over 250 bytes',
    maxBytes: 250,
    description: 'Amazon backend search terms must be ≤250 bytes or they are silently truncated by the platform.',
  },
  {
    ruleId: 'R021', field: 'amazonChannel.safetyCertNumber', checkType: 'required', severity: 'info',
    message: 'Safety cert number missing (2026 requirement)',
    description: 'New 2026 Amazon compliance: products in certain categories require a safety certification number.',
  },
  {
    ruleId: 'R022', field: 'amazonChannel.sustainabilityAttrs', checkType: 'required', severity: 'info',
    message: 'Sustainability attributes missing (2026 requirement)',
    description: 'New 2026 Amazon sustainability initiative: sellers are encouraged to declare sustainability attributes.',
  },
]

async function seed() {
  console.log(`Seeding ${RULES.length} audit rules…`)

  for (const rule of RULES) {
    const doc = {
      _type: 'auditRule',
      _id: `auditRule-${rule.ruleId}`,
      enabled: true,
      ...rule,
    }
    await sanityClient.createOrReplace(doc)
    console.log(`  ✓ ${rule.ruleId} — ${rule.field} (${rule.checkType})`)
  }

  console.log('Done.')
}

seed().catch(console.error)
