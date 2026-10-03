import { defineType, defineField } from 'sanity'

export const productVideo = defineType({
  name: 'productVideo',
  type: 'document',
  title: 'Product Video',
  fields: [
    defineField({ name: 'product',      type: 'reference', to: [{ type: 'product' }] }),
    defineField({ name: 'status',       type: 'string',
      options: { list: ['pending', 'rendering', 'ready', 'failed'] } }),
    defineField({ name: 'videoUrl',     type: 'url' }),
    defineField({ name: 'thumbnailUrl', type: 'url' }),
    defineField({ name: 'renderedAt',   type: 'datetime' }),
    defineField({ name: 'durationSecs', type: 'number' }),
    defineField({ name: 'scriptUsed',   type: 'text', title: 'Agent-generated script' }),
    defineField({ name: 'errorMessage', type: 'string', readOnly: true }),
  ],
})
