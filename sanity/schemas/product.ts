import { defineType, defineField } from 'sanity'

export const product = defineType({
  name: 'product',
  type: 'document',
  title: 'Product',
  fields: [
    // Source fields (from SFCC CSV)
    defineField({ name: 'sku',             type: 'string',   title: 'SKU',            validation: r => r.required() }),
    defineField({ name: 'sfccId',          type: 'string',   title: 'SFCC ID' }),
    defineField({ name: 'name',            type: 'string',   title: 'Product Name',   validation: r => r.required() }),
    defineField({ name: 'longDescription', type: 'text',     title: 'Long Description' }),
    defineField({ name: 'sfccCategory',    type: 'string',   title: 'SFCC Category' }),
    defineField({ name: 'price',           type: 'number',   title: 'Price (USD)' }),
    defineField({ name: 'onlineFlag',      type: 'boolean',  title: 'Online' }),
    defineField({ name: 'productKind',     type: 'string',   title: 'Product Kind',
      options: { list: ['master', 'variant'] } }),
    defineField({ name: 'lastModified',    type: 'datetime', title: 'Last Modified' }),

    // Variant fields
    defineField({ name: 'color',        type: 'string', title: 'Color Code (SFCC)' }),
    defineField({ name: 'colorDisplay', type: 'string', title: 'Color (Display)' }),
    defineField({ name: 'size',         type: 'string', title: 'Size Code (SFCC)' }),
    defineField({ name: 'sizeDisplay',  type: 'string', title: 'Size (Display)' }),

    // Amazon channel
    defineField({
      name: 'amazonChannel',
      type: 'object',
      title: 'Amazon Channel',
      fields: [
        defineField({ name: 'gtin',               type: 'string', title: 'GTIN / UPC / EAN' }),
        defineField({ name: 'brand',              type: 'string', title: 'Brand' }),
        defineField({ name: 'amazonCategory',     type: 'string', title: 'Amazon Product Type' }),
        defineField({ name: 'condition',          type: 'string', title: 'Condition',
          options: { list: ['New', 'Used', 'Refurbished', 'Collectible'] } }),
        defineField({ name: 'bulletPoint1',       type: 'string', title: 'Bullet Point 1' }),
        defineField({ name: 'bulletPoint2',       type: 'string', title: 'Bullet Point 2' }),
        defineField({ name: 'bulletPoint3',       type: 'string', title: 'Bullet Point 3' }),
        defineField({ name: 'bulletPoint4',       type: 'string', title: 'Bullet Point 4' }),
        defineField({ name: 'bulletPoint5',       type: 'string', title: 'Bullet Point 5' }),
        defineField({ name: 'metaTitle',          type: 'string', title: 'Meta Title (≤60 chars)' }),
        defineField({ name: 'metaDescription',    type: 'text',   title: 'Meta Description (≤160 chars)' }),
        defineField({ name: 'backendSearchTerms', type: 'string', title: 'Backend Search Terms (≤250 bytes)' }),
        defineField({ name: 'materialType',       type: 'string', title: 'Material Type' }),
        defineField({ name: 'department',         type: 'string', title: 'Department',
          options: { list: ['Womens', 'Mens', 'Unisex', 'Girls', 'Boys', 'Baby'] } }),
        defineField({ name: 'imageUrl',           type: 'url',    title: 'Main Image URL' }),
        defineField({ name: 'safetyCertNumber',   type: 'string', title: 'Safety Cert No. (2026)' }),
        defineField({ name: 'sustainabilityAttrs',type: 'string', title: 'Sustainability Attributes (2026)' }),
        defineField({ name: 'readinessScore',     type: 'number',   title: 'Amazon Readiness Score (0–100)', readOnly: true }),
        defineField({ name: 'approvedAt',         type: 'datetime', title: 'Human Approved At',             readOnly: true }),
      ],
    }),

    // Workflow stage is deliberately NOT a field here.
    //
    // The workflow instance in sanity.workflow.ts is the only record of where a
    // product sits in the pipeline. A mirrored string field is a second state
    // machine: it drifted from the engine's vocabulary (underscores here versus
    // hyphens there) and let the dashboard fake a stage change by patching the
    // product instead of firing a transition. Read the stage from the instance.
    defineField({ name: 'publishedAt', type: 'datetime', title: 'Published At', readOnly: true }),

    // References
    defineField({ name: 'auditReport',  type: 'reference', to: [{ type: 'auditReport' }],  title: 'Latest Audit' }),
    defineField({ name: 'productVideo', type: 'reference', to: [{ type: 'productVideo' }], title: 'Generated Video' }),
  ],
  preview: {
    select: { title: 'name', subtitle: 'sfccCategory', score: 'amazonChannel.readinessScore' },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prepare({ title, subtitle, score }: Record<string, any>) {
      const emoji = score >= 80 ? '🟢' : score >= 50 ? '🟡' : '🔴'
      return { title: `${emoji} ${title}`, subtitle: `${subtitle} · Score: ${score ?? '—'}` }
    },
  },
})
