import { defineType, defineField } from 'sanity'

export const sizeMapping = defineType({
  name: 'sizeMapping',
  type: 'document',
  title: 'Size Mapping',
  fields: [
    defineField({ name: 'sfccCode',    type: 'string', title: 'SFCC Code (e.g. 9LG)' }),
    defineField({ name: 'displayName', type: 'string', title: 'Display Name (e.g. Large)' }),
    defineField({ name: 'amazonEnum',  type: 'string', title: 'Amazon Enum (e.g. L)' }),
  ],
  preview: {
    select: { title: 'sfccCode', subtitle: 'displayName' },
  },
})
