import { defineType, defineField } from 'sanity'

export const auditRule = defineType({
  name: 'auditRule',
  type: 'document',
  title: 'Audit Rule',
  fields: [
    defineField({ name: 'ruleId',    type: 'string', title: 'Rule ID',    validation: r => r.required() }),
    defineField({ name: 'field',     type: 'string', title: 'Field Path', validation: r => r.required() }),
    defineField({
      name: 'checkType',
      type: 'string',
      title: 'Check Type',
      options: { list: ['required', 'minLength', 'maxLength', 'lengthRange', 'maxBytes', 'regex', 'positive'] },
      validation: r => r.required(),
    }),
    defineField({
      name: 'severity',
      type: 'string',
      title: 'Severity',
      options: { list: ['suppressible', 'optimisation', 'info'] },
      validation: r => r.required(),
    }),
    defineField({ name: 'message',           type: 'string',  title: 'Issue Message',       validation: r => r.required() }),
    defineField({ name: 'description',       type: 'text',    title: 'Description / Rationale' }),
    defineField({ name: 'enabled',           type: 'boolean', title: 'Enabled',             initialValue: true }),
    // Threshold fields — populate only the ones relevant to checkType
    defineField({ name: 'minLength',         type: 'number',  title: 'Min Length (chars)' }),
    defineField({ name: 'maxLength',         type: 'number',  title: 'Max Length (chars)' }),
    defineField({ name: 'maxBytes',          type: 'number',  title: 'Max Bytes' }),
    defineField({ name: 'pattern',           type: 'string',  title: 'Regex Pattern' }),
    defineField({ name: 'patternShouldMatch',type: 'boolean', title: 'Pattern Should Match',
      description: 'True = flag when pattern does NOT match. False = flag when pattern DOES match.',
      initialValue: true,
    }),
  ],
  orderings: [
    { title: 'Rule ID', name: 'ruleIdAsc', by: [{ field: 'ruleId', direction: 'asc' }] },
  ],
  preview: {
    select: { title: 'ruleId', subtitle: 'field', severity: 'severity', enabled: 'enabled' },
    prepare({ title, subtitle, severity, enabled }) {
      const icon = enabled === false ? '⏸' : severity === 'suppressible' ? '🔴' : severity === 'optimisation' ? '🟡' : '🔵'
      return { title: `${icon} ${title}`, subtitle }
    },
  },
})
