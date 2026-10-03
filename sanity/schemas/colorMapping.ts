import { defineType, defineField } from 'sanity'

export const colorMapping = defineType({
  name: 'colorMapping',
  type: 'document',
  title: 'Color Mapping',
  fields: [
    defineField({ name: 'sfccCode',    type: 'string', title: 'SFCC Code (e.g. JJI15XX)' }),
    defineField({ name: 'displayName', type: 'string', title: 'Display Name (e.g. Navy)' }),
    defineField({ name: 'amazonEnum',  type: 'string', title: 'Amazon Enum (e.g. Navy Blue)' }),
    defineField({ name: 'hexValue',    type: 'string', title: 'Hex' }),
  ],
  preview: {
    select: { title: 'sfccCode', subtitle: 'displayName' },
  },
})
