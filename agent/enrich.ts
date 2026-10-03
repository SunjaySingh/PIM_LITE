/**
 * Deterministic enrichment — the non-AI half of closing an Amazon readiness gap.
 *
 * The SFCC feed has no brand, GTIN, condition or image column, so every product
 * fails those rules on import. None of those four needs a language model:
 *
 *   gtin       derived from the SKU (see gtin.ts)
 *   brand      a constant — this is a single retailer's own catalogue
 *   condition  a constant — everything in the feed is new stock
 *   imageUrl   one of two demo images, chosen by category
 *
 * Keeping these out of the LLM call makes enrichment cheaper, instant, and
 * reproducible, and draws a clear line between values that are *derived* and
 * values that are *written*. The language work — descriptions, bullet points,
 * SEO copy — is the AI step and lives elsewhere.
 *
 * Fills gaps only: a field that already has a value is never overwritten, so
 * running this repeatedly is safe and will not clobber curated data.
 */

import { generateGtin12 } from './gtin'
import { sanityClient } from '../sanity/lib/client'

/**
 * The catalogue is one retailer's own-brand goods, so a single house brand is
 * the honest answer. Inventing a different brand per product would be
 * fabricating a business fact the source data has no signal for.
 */
export const HOUSE_BRAND = 'Lolly'

/** Everything in an SFCC product export is new stock. */
// Must match a value in the product schema's condition list, or the Studio
// dropdown shows the field as empty even though the audit counts it as present.
export const DEFAULT_CONDITION = 'New'

/** SFCC categories that should get the beauty image rather than the apparel one. */
const BEAUTY_CATEGORIES = new Set(['beauty', 'skincare', 'perfume', 'perfurme', 'fragrance'])

/** Filenames seeded by scripts/seed-images.ts. */
const IMAGE_FILENAMES = {
  apparel: 'lolly-apparel.jpg',
  beauty: 'lolly-beauty.jpg',
} as const

export interface ProductLike {
  _id?: string
  sku?: string
  sfccCategory?: string
  amazonChannel?: Record<string, unknown>
}

/** Patch keys are dotted paths, ready to hand to `client.patch().set()`. */
export type EnrichmentPatch = Record<string, string>

let imageUrlCache: Promise<Record<keyof typeof IMAGE_FILENAMES, string | null>> | null = null

/**
 * Resolve the demo image URLs from Sanity by filename rather than hardcoding
 * asset IDs, so re-seeding the images does not leave stale URLs behind.
 */
function loadImageUrls() {
  imageUrlCache ??= (async () => {
    const [apparel, beauty] = await Promise.all(
      (['apparel', 'beauty'] as const).map(key =>
        sanityClient.fetch<string | null>(
          `*[_type == "sanity.imageAsset" && originalFilename == $filename][0].url`,
          { filename: IMAGE_FILENAMES[key] },
        ),
      ),
    )
    return { apparel, beauty }
  })()
  return imageUrlCache
}

/** Discard the memoised image URLs. Only needed in tests. */
export function resetImageUrlCache(): void {
  imageUrlCache = null
}

function imageKeyFor(product: ProductLike): keyof typeof IMAGE_FILENAMES {
  return BEAUTY_CATEGORIES.has((product.sfccCategory ?? '').toLowerCase()) ? 'beauty' : 'apparel'
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
}

/**
 * Build the set of deterministic field updates a product is missing.
 * Returns an empty object when nothing needs filling.
 */
export async function buildDeterministicPatch(product: ProductLike): Promise<EnrichmentPatch> {
  const channel = product.amazonChannel ?? {}
  const patch: EnrichmentPatch = {}

  if (isBlank(channel.gtin)) {
    if (!product.sku) throw new Error(`Cannot derive GTIN: product ${product._id} has no SKU`)
    patch['amazonChannel.gtin'] = generateGtin12(product.sku)
  }

  if (isBlank(channel.brand)) patch['amazonChannel.brand'] = HOUSE_BRAND
  if (isBlank(channel.condition)) patch['amazonChannel.condition'] = DEFAULT_CONDITION

  if (isBlank(channel.imageUrl)) {
    const urls = await loadImageUrls()
    const url = urls[imageKeyFor(product)]
    // Absent images are not fatal — R011 is only an optimisation. Skipping the
    // field is better than writing a URL that resolves to nothing.
    if (url) patch['amazonChannel.imageUrl'] = url
  }

  return patch
}

/**
 * Apply the deterministic patch to a product in Sanity.
 * Returns the fields written, or an empty object if there was nothing to do.
 */
export async function enrichProduct(productId: string): Promise<EnrichmentPatch> {
  const product = await sanityClient.fetch<ProductLike | null>(
    `*[_id == $id][0]{ _id, sku, sfccCategory, amazonChannel }`,
    { id: productId },
  )
  if (!product) throw new Error(`Product not found: ${productId}`)

  const patch = await buildDeterministicPatch(product)
  if (Object.keys(patch).length === 0) return patch

  await sanityClient.patch(productId).set(patch).commit()
  return patch
}
