/**
 * AI enrichment — the language half of closing an Amazon readiness gap.
 *
 * Everything derivable without a model (GTIN, brand, condition, image) is
 * handled in enrich.ts. What is left is genuine copywriting: expanding a thin
 * SFCC description into Amazon-ready marketing text, bullet points and SEO
 * fields.
 *
 * The audit rules impose hard limits — meta title 60 chars, meta description
 * 160, backend terms 250 *bytes*, description at least 300 chars ending in
 * terminal punctuation. Models routinely miss numeric limits like these, so
 * every field is clamped and repaired in code after generation rather than
 * trusted. The model supplies the words; this module guarantees the shape.
 *
 * Fills gaps only, like the deterministic step — an existing value is never
 * overwritten.
 */

import { Agent } from '@mastra/core/agent'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { sanityClient } from '../sanity/lib/client'

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
})

/** Mirrors the thresholds enforced by audit rules R006–R018. */
export const LIMITS = {
  descriptionMin: 300,
  descriptionTarget: 480,
  metaTitleMax: 60,
  metaDescriptionMax: 160,
  backendTermsMaxBytes: 250,
  bulletCount: 5,
} as const

const CopySchema = z.object({
  longDescription: z
    .string()
    .describe(`Amazon-ready product description, ${LIMITS.descriptionTarget} characters, ending in a full stop.`),
  bulletPoints: z
    .array(z.string())
    .describe(`Exactly ${LIMITS.bulletCount} benefit-led bullet points, 60-160 characters each.`),
  metaTitle: z.string().describe(`SEO title, at most ${LIMITS.metaTitleMax} characters.`),
  metaDescription: z.string().describe(`SEO description, at most ${LIMITS.metaDescriptionMax} characters.`),
  backendSearchTerms: z
    .string()
    .describe(`Space-separated search keywords, at most ${LIMITS.backendTermsMaxBytes} bytes. No commas, no repetition of the title.`),
})

export type GeneratedCopy = z.infer<typeof CopySchema>

export const copywriterAgent = new Agent({
  id: 'pim-copywriter-agent',
  name: 'PIM Copywriter Agent',
  instructions: `You write Amazon marketplace listing copy for a fashion and beauty retailer whose house brand is "Lolly".

Rules:
- Work only from the supplied product data. Never invent materials, measurements, certifications, ingredients, or country of origin.
- Never describe packaging, containers, bottles, applicators or what is included in the box. None of that is in the source data.
- If the source description is thin, expand on what is genuinely implied by the product name and category. Stay generic rather than fabricating specifics.
- No superlatives that imply verified claims ("best", "#1", "clinically proven").
- No promotional language Amazon prohibits ("free shipping", "sale", "discount", "guarantee").
- Avoid the characters ! $ ? _ entirely.
- The description must read as continuous prose and end with a full stop.
- Bullet points must be benefit-led and must not repeat each other.`,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: openrouter('openai/gpt-oss-120b') as any,
})

// ─── Repair helpers ──────────────────────────────────────────────────────────

/** Words that read as truncation damage if a clamp leaves them at the end. */
const DANGLING_WORDS =
  /\s+(a|an|the|and|or|but|with|for|to|of|in|on|at|by|from|that|this|its|their)$/i

/** Trim to `max` characters, preferring a word boundary. */
export function clampChars(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text

  const cut = text.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  // Only honour the word boundary if it does not cost most of the budget.
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trim()
}

/**
 * Clamp prose that a human will read, such as a meta description. Prefers to
 * end on a sentence boundary; failing that, trims any dangling article or
 * conjunction so the text does not end mid-clause.
 */
export function clampProse(value: string, max: number): string {
  const text = value.trim()
  if (text.length <= max) return text

  const cut = text.slice(0, max)
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
  // A sentence boundary is only worth it if it keeps most of the budget.
  if (lastStop > max * 0.6) return cut.slice(0, lastStop + 1).trim()

  return clampChars(text, max)
    .replace(DANGLING_WORDS, '')
    .replace(/[\s,;:–—-]+$/, '')
    .trim()
}

/** Trim to `max` bytes in UTF-8, on a word boundary. */
export function clampBytes(value: string, max: number): string {
  let text = value.trim()
  if (Buffer.byteLength(text) <= max) return text

  while (Buffer.byteLength(text) > max) {
    const lastSpace = text.lastIndexOf(' ')
    text = lastSpace > 0 ? text.slice(0, lastSpace) : text.slice(0, -1)
  }
  return text.trim()
}

/** Guarantee the terminal punctuation R008 looks for. */
export function ensureTerminalPunctuation(value: string): string {
  const text = value.trim()
  if (!text) return text
  return /[.!?]$/.test(text) ? text : `${text}.`
}

/** Strip characters R005 bans, so generated copy cannot introduce them. */
function stripBannedChars(value: string): string {
  return value.replace(/[!$?_]/g, '').replace(/\s{2,}/g, ' ').trim()
}

/**
 * Force generated copy to satisfy every audit rule, regardless of what the
 * model returned. Returns fields keyed by their Sanity dotted path.
 */
export function repairCopy(copy: GeneratedCopy): Record<string, string> {
  const out: Record<string, string> = {}

  const description = ensureTerminalPunctuation(stripBannedChars(copy.longDescription))
  if (description) out.longDescription = description

  const metaTitle = clampProse(stripBannedChars(copy.metaTitle), LIMITS.metaTitleMax)
  if (metaTitle) out['amazonChannel.metaTitle'] = metaTitle

  const metaDescription = clampProse(
    stripBannedChars(copy.metaDescription),
    LIMITS.metaDescriptionMax,
  )
  if (metaDescription) out['amazonChannel.metaDescription'] = metaDescription

  const backendTerms = clampBytes(
    stripBannedChars(copy.backendSearchTerms),
    LIMITS.backendTermsMaxBytes,
  )
  if (backendTerms) out['amazonChannel.backendSearchTerms'] = backendTerms

  copy.bulletPoints
    .map(b => stripBannedChars(b))
    .filter(Boolean)
    .slice(0, LIMITS.bulletCount)
    .forEach((bullet, i) => {
      out[`amazonChannel.bulletPoint${i + 1}`] = clampChars(bullet, 200)
    })

  return out
}

// ─── Generation ──────────────────────────────────────────────────────────────

export interface ProductCopyInput {
  _id?: string
  name?: string
  longDescription?: string
  sfccCategory?: string
  colorDisplay?: string
  sizeDisplay?: string
  price?: number
}

function buildPrompt(product: ProductCopyInput): string {
  const facts = [
    `Product name: ${product.name ?? '(unknown)'}`,
    `Category: ${product.sfccCategory ?? '(unknown)'}`,
    product.colorDisplay ? `Colour: ${product.colorDisplay}` : null,
    product.sizeDisplay ? `Size: ${product.sizeDisplay}` : null,
    typeof product.price === 'number' ? `Price: USD ${product.price.toFixed(2)}` : null,
    `Existing description: ${product.longDescription?.trim() || '(none)'}`,
  ]
    .filter(Boolean)
    .join('\n')

  return `Write Amazon listing copy for this product.\n\n${facts}\n\nThe description must be at least ${LIMITS.descriptionMin} characters and read as natural prose.`
}

async function callModel(prompt: string, product: ProductCopyInput): Promise<GeneratedCopy> {
  const result = await copywriterAgent.generate(prompt, {
    structuredOutput: { schema: CopySchema },
  })
  const copy = result.object as GeneratedCopy | undefined
  if (!copy) throw new Error(`Model returned no structured output for ${product._id ?? product.name}`)
  return copy
}

/**
 * Last-resort description, used only if the model twice fails to produce one
 * of usable length. Composes prose from the copy it *did* return, so R006
 * cannot fail silently and leave the product stuck below the video threshold.
 */
function composeDescription(product: ProductCopyInput, copy: GeneratedCopy): string {
  const opening = copy.longDescription?.trim() || product.longDescription?.trim() || ''
  const body = copy.bulletPoints
    .map(b => ensureTerminalPunctuation(b.trim()))
    .join(' ')
  return [opening, body].filter(Boolean).join(' ').trim()
}

/** Call the model and return copy already repaired to satisfy the audit rules. */
export async function generateCopy(product: ProductCopyInput): Promise<Record<string, string>> {
  let copy = await callModel(buildPrompt(product), product)

  // Models routinely ignore a minimum length. Give one corrective retry that
  // names the failure explicitly before falling back to composing the text.
  if ((copy.longDescription ?? '').trim().length < LIMITS.descriptionMin) {
    const retryPrompt =
      `${buildPrompt(product)}\n\n` +
      `IMPORTANT: your previous longDescription was only ${copy.longDescription?.trim().length ?? 0} characters. ` +
      `It must be at least ${LIMITS.descriptionMin} characters of flowing prose — several full sentences, ` +
      `not a title or a single line. Expand on fit, use, care and occasion without inventing specifics.`
    copy = await callModel(retryPrompt, product)
  }

  if ((copy.longDescription ?? '').trim().length < LIMITS.descriptionMin) {
    copy = { ...copy, longDescription: composeDescription(product, copy) }
  }

  return repairCopy(copy)
}

/**
 * Generate and write AI copy for a product, filling only empty fields.
 * Returns the fields written.
 */
export async function enrichProductWithAI(productId: string): Promise<Record<string, string>> {
  const product = await sanityClient.fetch<
    (ProductCopyInput & { amazonChannel?: Record<string, unknown> }) | null
  >(
    `*[_id == $id][0]{ _id, name, longDescription, sfccCategory, colorDisplay, sizeDisplay, price, amazonChannel }`,
    { id: productId },
  )
  if (!product) throw new Error(`Product not found: ${productId}`)

  const generated = await generateCopy(product)
  const channel = product.amazonChannel ?? {}

  // Drop anything the product already has — enrichment fills gaps only.
  const patch: Record<string, string> = {}
  for (const [path, value] of Object.entries(generated)) {
    const existing = path.startsWith('amazonChannel.')
      ? channel[path.slice('amazonChannel.'.length)]
      : (product as Record<string, unknown>)[path]

    const blank =
      existing === undefined || existing === null || (typeof existing === 'string' && !existing.trim())

    // The source description is usually present but too short to pass R006,
    // so it is the one field we replace rather than skip.
    const isShortDescription =
      path === 'longDescription' && typeof existing === 'string' && existing.trim().length < LIMITS.descriptionMin

    if (blank || isShortDescription) patch[path] = value
  }

  if (Object.keys(patch).length > 0) {
    await sanityClient.patch(productId).set(patch).commit()
  }
  return patch
}
