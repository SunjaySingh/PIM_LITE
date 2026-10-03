import { NextRequest, NextResponse } from 'next/server'
import { sanityClient } from '../../../../sanity/lib/client'
import { toLakeId } from '../../../../sanity/lib/gdr'
import { runRules, calcScore, auditAgent } from '../../../../agent/auditAgent'

export async function POST(request: NextRequest) {
  const secret = request.headers.get('x-sanity-workflow-secret')
  if (process.env.SANITY_WORKFLOW_SECRET && secret !== process.env.SANITY_WORKFLOW_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json() as { sku?: string; documentId?: string; mode?: 'single' | 'batch' }
  const { sku, documentId, mode = 'single' } = body

  console.log('[audit] received:', { sku, documentId, mode })

  if (mode === 'single' && !sku && !documentId) {
    return NextResponse.json({ error: 'sku or documentId required for single mode' }, { status: 400 })
  }

  try {
    if (mode === 'single') {
      // Prefer lookup by documentId (strips drafts. prefix to find published doc)
      const publishedId = documentId ? toLakeId(documentId) : undefined
      const product = publishedId
        ? await sanityClient.fetch(
            `*[_id in [$id, "drafts." + $id]][0]`,
            { id: publishedId }
          )
        : await sanityClient.fetch(
            `*[_type == "product" && sku == $sku][0]`,
            { sku }
          )

      console.log('[audit] product found:', product?._id ?? 'null', 'sku:', product?.sku)
      if (!product) return NextResponse.json({ error: `Product not found (sku="${sku}", documentId="${documentId}")` }, { status: 404 })

      const issues = await runRules(product)
      const score  = calcScore(issues)

      console.log('[audit] rules complete, score:', score, 'issues:', issues.length, '— invoking Mastra agent for AI recommendations')

      // Invoke the Mastra agent — it generates AI suggestions and writes the full report
      // via its writeAuditReport tool. Falls back to a direct write if the agent fails.
      try {
        await auditAgent.generate(
          `You are auditing product ${product.sku} (Sanity id: ${product._id}).
The rules have already been run. Here are the results:
- Score: ${score}/100
- Issues: ${JSON.stringify(issues)}
- Product name: ${product.name ?? 'unknown'}
- Long description: ${product.longDescription ?? 'none'}
- Amazon category: ${product.amazonChannel?.amazonCategory ?? 'none'}
- Meta title: ${product.amazonChannel?.metaTitle ?? 'none'}
- Meta description: ${product.amazonChannel?.metaDescription ?? 'none'}

Generate AI recommendations (suggestedMetaTitle ≤60 chars, suggestedMetaDescription ≤160 chars, 3-5 suggestedBulletPoints, suggestedBackendTerms ≤250 bytes) and write the complete audit report via the writeAuditReport tool. Include a brief agentNotes summary of the key issues.`
        )
        console.log('[audit] Mastra agent finished — report written by agent')
      } catch (agentErr) {
        console.warn('[audit] Mastra agent failed, falling back to direct write:', agentErr)
        const report = await sanityClient.create({
          _type: 'auditReport',
          product: { _type: 'reference', _ref: product._id },
          auditedAt: new Date().toISOString(),
          overallScore: score,
          issues,
        })
        await sanityClient
          .patch(product._id)
          .set({ 'amazonChannel.readinessScore': score, auditReport: { _type: 'reference', _ref: report._id } })
          .commit()
      }

      // Find the report the agent just created
      const latestReport = await sanityClient.fetch(
        `*[_type == "auditReport" && references($id)] | order(auditedAt desc)[0]{ _id, overallScore }`,
        { id: product._id }
      )

      return NextResponse.json({ ok: true, sku, score, issueCount: issues.length, reportId: latestReport?._id })
    }

    // Batch mode — queue for background processing
    return NextResponse.json({ ok: true, message: 'Batch audit queued — run pnpm tsx agent/auditAgent.ts --mode=batch' })
  } catch (err) {
    console.error('Audit route error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
