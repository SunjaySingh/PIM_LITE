import { NextRequest, NextResponse } from 'next/server'
import { enrichProduct } from '../../../../agent/enrich'
import { sanityClient } from '../../../../sanity/lib/client'
import { toLakeId } from '../../../../sanity/lib/gdr'

/**
 * Fill the factual Amazon fields a product is missing.
 *
 * This is the work behind the workflow's `enrich-product` activity. It is
 * deliberately separate from the audit: enrichment writes deterministic values
 * (a derived GTIN, the house brand, condition, a catalogue image), while the
 * audit only scores what it finds.
 *
 * Without this step a product's score is capped by fields no copy suggestion
 * can supply, and it can never reach the pass threshold.
 */
export async function POST(request: NextRequest) {
  let body: { documentId?: string; sku?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { documentId, sku } = body

  try {
    const publishedId = documentId ? toLakeId(documentId) : undefined
    const product = publishedId
      ? await sanityClient.fetch(`*[_id == $id][0]{_id}`, { id: publishedId })
      : await sanityClient.fetch(`*[_type == "product" && sku == $sku][0]{_id}`, { sku })

    if (!product) {
      return NextResponse.json(
        { error: `Product not found (documentId=${documentId}, sku=${sku})` },
        { status: 404 },
      )
    }

    const written = await enrichProduct(product._id)

    return NextResponse.json({
      ok: true,
      documentId: product._id,
      written: Object.keys(written),
    })
  } catch (err) {
    console.error('[agent/enrich] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
