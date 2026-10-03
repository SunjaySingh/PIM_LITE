import { NextRequest, NextResponse } from 'next/server'
import { sanityClient } from '../../../../sanity/lib/client'
import { toLakeId } from '../../../../sanity/lib/gdr'

// SKU is embedded in a shell command and a filesystem path below, so it must
// be restricted to a safe, unambiguous character set before either use.
const SAFE_SKU = /^[A-Za-z0-9_-]+$/

export async function POST(request: NextRequest) {
  const body = await request.json() as { documentId: string; sku: string }
  const { sku } = body
  // Effect bindings hand us a GDR URI, not a bare lake id
  const documentId = toLakeId(body.documentId)

  // Validate the Workflows engine signature
  const secret = request.headers.get('x-sanity-workflow-secret')
  if (process.env.SANITY_WORKFLOW_SECRET && secret !== process.env.SANITY_WORKFLOW_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (typeof sku !== 'string' || !SAFE_SKU.test(sku)) {
    return NextResponse.json({ error: 'Invalid SKU' }, { status: 400 })
  }

  let videoDoc: { _id: string } | undefined

  try {
    // Fetch product data for Remotion props
    const product = await sanityClient.fetch(
      `*[_type == "product" && _id == $id][0]{
        name, sfccCategory, price,
        "bulletPoint1": amazonChannel.bulletPoint1,
        "bulletPoint2": amazonChannel.bulletPoint2,
        "bulletPoint3": amazonChannel.bulletPoint3,
        "metaTitle":    amazonChannel.metaTitle,
        "imageUrl":     amazonChannel.imageUrl
      }`,
      { id: documentId }
    )

    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    // Create/update productVideo document as rendering. Re-rendering always
    // creates a fresh document rather than reusing the previous one, so an
    // old ready video stays intact (and playable) until this render succeeds.
    videoDoc = await sanityClient.create({
      _type: 'productVideo',
      product: { _type: 'reference', _ref: documentId },
      status: 'rendering',
    })

    // Link video doc to product
    await sanityClient.patch(documentId).set({ productVideo: { _type: 'reference', _ref: videoDoc._id } }).commit()

    // Render via Remotion CLI (local demo — production uses Remotion Lambda)
    const outputDir  = process.env.REMOTION_OUTPUT_DIR ?? './public/videos'
    const outputPath = `${outputDir}/video-${sku}.mp4`
    const props = JSON.stringify({
      name:         product.name,
      category:     product.sfccCategory ?? 'default',
      price:        product.price ?? 0,
      bulletPoint1: product.bulletPoint1 ?? '',
      bulletPoint2: product.bulletPoint2 ?? '',
      bulletPoint3: product.bulletPoint3 ?? '',
      metaTitle:    product.metaTitle ?? '',
      imageUrl:     product.imageUrl ?? '',
    })

    const { execFileSync } = await import('child_process')
    const { writeFileSync, unlinkSync, mkdirSync } = await import('fs')
    const { join } = await import('path')
    const { tmpdir } = await import('os')

    mkdirSync(outputDir, { recursive: true })

    const propsFile = join(tmpdir(), `remotion-props-${sku}-${Date.now()}.json`)
    writeFileSync(propsFile, props, 'utf8')
    try {
      // execFileSync with an argv array (no shell: true) means `sku` — already
      // restricted to [A-Za-z0-9_-] above — can never be interpreted as shell
      // syntax, even though it flows into outputPath below.
      execFileSync(
        'npx',
        ['remotion', 'render', 'remotion/Root.tsx', 'ProductPromo', outputPath, `--props=${propsFile}`],
        { stdio: 'inherit' }
      )
    } finally {
      try { unlinkSync(propsFile) } catch { /* ignore cleanup errors */ }
    }

    // Build a URL the browser can reach.  Videos land in public/videos/ by
    // default so Next.js serves them at /videos/<file>. Override both sides
    // with the REMOTION_OUTPUT_DIR / NEXT_PUBLIC_VIDEO_BASE_URL env vars.
    const videoBaseUrl = process.env.NEXT_PUBLIC_VIDEO_BASE_URL ?? '/videos'
    const videoUrl = `${videoBaseUrl}/video-${sku}.mp4`

    // Update video doc as ready
    await sanityClient.patch(videoDoc._id).set({
      status: 'ready',
      videoUrl,
      renderedAt: new Date().toISOString(),
      durationSecs: 15,
      scriptUsed: props,
    }).commit()

    // No transition is fired from here by design, and the original spec's
    // `fireAction({action: 'mark-video-ready'})` is deliberately absent — there
    // is no such action in sanity.workflow.ts to fire.
    //
    // Returning 200 is the signal. The effect handler completes, the engine
    // marks `trigger-video-render` done, and the video-requested stage's
    // `video-ready` action — conditioned on
    // `$effectStatus['trigger-video-render'] == 'done'` — fires, which completes
    // the activity and cascades through `to-video-ready`. Cascade re-evaluation
    // is the engine's job; firing a transition here as well would race it.
    //
    // The corollary is that a product only reaches video-ready if this route
    // returns success. A render that exhausts the effect's retries leaves the
    // instance parked in video-requested with a failed effect on it — visible
    // and diagnosable, rather than silently advanced past a video that is not
    // there.

    return NextResponse.json({ ok: true, sku, videoDocId: videoDoc._id })
  } catch (err) {
    console.error('Remotion render error:', err)
    const errorMessage = err instanceof Error ? err.message : String(err)

    // Leave a diagnosable failed document behind instead of an instance stuck
    // in "rendering" forever. This does not fire a transition — the effect's
    // retry policy and the workflow's `$effectStatus` condition are what keep
    // the product parked in video-requested rather than cascading forward.
    if (videoDoc) {
      await sanityClient.patch(videoDoc._id).set({
        status: 'failed',
        errorMessage,
      }).commit()
    }

    return NextResponse.json({ error: 'Render failed', message: errorMessage }, { status: 500 })
  }
}
