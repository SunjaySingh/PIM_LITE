import { NextRequest, NextResponse } from 'next/server'
import { sanityClient } from '../../../../sanity/lib/client'
import { toLakeId } from '../../../../sanity/lib/gdr'

/**
 * Copy an audit report's AI suggestions onto the product it audited.
 *
 * This runs server-side with the API token rather than through the App SDK's
 * client-side edit hook, for the same reason the audit route does: the write
 * must land on the published document that the rule engine reads back when it
 * re-audits. A client-side edit produces a draft, so the re-audit would score
 * the unchanged published document and the score would never move.
 */
export async function POST(request: NextRequest) {
  let body: { documentId?: string; reportId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { documentId, reportId } = body
  if (!documentId) {
    return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
  }

  const publishedId = toLakeId(documentId)

  try {
    const report = reportId
      ? await sanityClient.fetch(`*[_id == $reportId][0]`, { reportId })
      : await sanityClient.fetch(
          `*[_type == "auditReport" && references($id)] | order(auditedAt desc)[0]`,
          { id: publishedId },
        )

    if (!report) {
      return NextResponse.json({ error: 'No audit report found for this product' }, { status: 404 })
    }

    const patch: Record<string, string> = {}
    if (report.suggestedMetaTitle)       patch['amazonChannel.metaTitle']         = report.suggestedMetaTitle
    if (report.suggestedMetaDescription) patch['amazonChannel.metaDescription']   = report.suggestedMetaDescription
    if (report.suggestedBackendTerms)    patch['amazonChannel.backendSearchTerms'] = report.suggestedBackendTerms

    const bullets: string[] = Array.isArray(report.suggestedBulletPoints) ? report.suggestedBulletPoints : []
    bullets.slice(0, 5).forEach((bp, i) => {
      if (bp) patch[`amazonChannel.bulletPoint${i + 1}`] = bp
    })

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'That audit report has no suggestions to apply' }, { status: 422 })
    }

    await sanityClient.patch(publishedId).set(patch).commit()

    return NextResponse.json({
      ok: true,
      documentId: publishedId,
      reportId: report._id,
      applied: Object.keys(patch),
    })
  } catch (err) {
    console.error('[apply-suggestions] failed:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
