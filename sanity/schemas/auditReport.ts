import { defineType, defineField } from 'sanity'

export const auditReport = defineType({
  name: 'auditReport',
  type: 'document',
  title: 'Audit Report',
  fields: [
    defineField({ name: 'product',      type: 'reference', to: [{ type: 'product' }], validation: r => r.required() }),
    defineField({ name: 'auditedAt',    type: 'datetime' }),
    defineField({ name: 'overallScore', type: 'number' }),
    defineField({
      name: 'issues',
      type: 'array',
      of: [{ type: 'object', fields: [
        defineField({ name: 'ruleId',    type: 'string' }),
        defineField({ name: 'field',     type: 'string' }),
        defineField({ name: 'severity',  type: 'string',
          options: { list: ['suppressible', 'optimisation', 'info'] } }),
        defineField({ name: 'message',   type: 'text' }),
      ]}],
    }),
    defineField({ name: 'suggestedMetaTitle',       type: 'string' }),
    defineField({ name: 'suggestedMetaDescription', type: 'text' }),
    defineField({ name: 'suggestedBulletPoints',    type: 'array', of: [{ type: 'string' }] }),
    defineField({ name: 'suggestedBackendTerms',    type: 'string' }),
    defineField({ name: 'agentNotes',               type: 'text' }),
  ],
  preview: {
    select: { title: 'product.name', score: 'overallScore', auditedAt: 'auditedAt' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepare({ title, score, auditedAt }: Record<string, any>) {
      return { title: `Audit: ${title}`, subtitle: `Score: ${score ?? '—'} · ${auditedAt ? new Date(auditedAt).toLocaleDateString() : 'pending'}` }
    },
  },
})
