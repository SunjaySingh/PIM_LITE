import {
  defineWorkflow,
  defineStage,
  defineTransition,
  defineEffect,
  defineAction,
  defineActivity,
  defineField,
  defineWorkflowConfig,
} from '@sanity/workflow-engine/define'

// This file must live at the project root under exactly this name: the
// Workflows CLI resolves its config by filename against `cwd` only and does
// not search subdirectories. A definition in a subdirectory is never deployed.

// Effects are queued by the engine onto the instance and stay there until an
// engine holding handlers calls `drainEffects`. Sanity never calls out to us —
// "selfHosted" means we own the dispatch. Two things drain: the Studio
// dashboard (components/pim-dashboard/effectHandlers.ts) for the instance on
// screen, and `pnpm workflow:drain` for every instance headlessly.
//
// An effect's `name` is the key those handler registries are keyed by, and its
// `bindings` are the params the handler receives. Renaming either half here
// breaks the pipeline silently at run time.
//
// Bindings and conditions read the subject as `$fields.subject`. There is no
// `$subject` variable — see CONDITION_VARS. A singular `subject` field
// dereferences into the hydrated document, so `$fields.subject._id` and
// `$fields.subject.sku` are the product's own lake fields. Getting this wrong
// is silent: GROQ resolves the unknown path to null, the effect still queues,
// and the handler is dispatched with null params.

const triggerEnrich = defineEffect({
  name: 'trigger-enrich',
  title: 'Fill Missing Amazon Fields',
  bindings: {
    documentId: '$fields.subject._id',
    sku: '$fields.subject.sku',
  },
  runtime: { kind: 'selfHosted' },
  retry: { attempts: 2, backoff: { kind: 'fixed', delayMs: 3000 } },
})

const triggerAudit = defineEffect({
  name: 'trigger-audit',
  title: 'Trigger AI Audit Agent',
  bindings: {
    documentId: '$fields.subject._id',
    sku: '$fields.subject.sku',
  },
  runtime: { kind: 'selfHosted' },
  retry: { attempts: 3, backoff: { kind: 'fixed', delayMs: 5000 } },
})

const triggerVideoRender = defineEffect({
  name: 'trigger-video-render',
  title: 'Trigger Remotion Render',
  bindings: {
    documentId: '$fields.subject._id',
    sku: '$fields.subject.sku',
  },
  runtime: { kind: 'selfHosted' },
  retry: { attempts: 2, backoff: { kind: 'fixed', delayMs: 10000 } },
})

export const amazonReadinessWorkflow = defineWorkflow({
  name: 'amazon-readiness',
  title: 'Amazon Readiness Pipeline',
  initialStage: 'draft',

  // Declare the workflow subject: the product document this instance tracks.
  //
  // `initialValue: {type: 'input'}` is what makes the subject caller-suppliable
  // at startInstance. Without it the field is working-memory-sourced and the
  // engine rejects the subject row with "not caller-input-sourced", so no
  // instance can ever be started for a product.
  fields: [
    defineField({
      type: 'subject',
      name: 'subject',
      title: 'Product',
      types: ['product'],
      initialValue: { type: 'input' },
    }),
  ],

  start: {
    filter: '_type == "product"',
  },

  stages: [
    defineStage({
      name: 'draft',
      title: 'Draft',
      activities: [
        defineActivity({
          name: 'enrich-product',
          title: 'Enrich Product Data',
          actions: [
            // Fills gtin, brand, condition and imageUrl — the factual fields no
            // copy suggestion can supply, and without which a product's score
            // is capped below the pass threshold no matter how good its copy.
            // `when: 'true'` fires this on stage entry, the same way queue-audit
            // does. Enrichment only fills blanks, so re-entering draft after a
            // failed audit re-runs it harmlessly.
            defineAction({
              name: 'enrich',
              title: 'Fill Missing Fields',
              when: 'true',
              effects: [triggerEnrich],
            }),
            // Blocked until enrichment has landed, so an audit never scores a
            // product whose factual fields are still being filled in.
            defineAction({
              name: 'submit-for-audit',
              title: 'Submit for Audit',
              when: "$effectStatus['trigger-enrich'] == 'done'",
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({ name: 'to-audit-pending', to: 'audit-pending' }),
      ],
    }),

    defineStage({
      name: 'audit-pending',
      title: 'Audit Pending',
      activities: [
        defineActivity({
          name: 'ai-audit',
          title: 'AI Audit Running',
          actions: [
            // Fires immediately on stage entry — queues the Mastra audit agent
            defineAction({
              name: 'queue-audit',
              title: 'Queue Audit Agent',
              when: 'true',
              effects: [triggerAudit],
            }),
            // Fires once the audit agent writes readinessScore back to the product
            // Gate on THIS stage entry's effect, not on the score existing.
            // `defined(readinessScore)` was true the instant the stage opened
            // for any previously-audited product, so the activity completed and
            // the score-gated transition fired against the stale score while
            // the new audit was still running.
            defineAction({
              name: 'audit-complete',
              title: 'Audit Complete',
              when: "$effectStatus['trigger-audit'] == 'done'",
              status: 'done',
            }),
          ],
        }),
      ],
      // Evaluated in order — first match wins once $allActivitiesDone
      transitions: [
        defineTransition({
          name: 'to-audit-passed',
          to: 'audit-passed',
          when: '$allActivitiesDone && $fields.subject.amazonChannel.readinessScore >= 50',
        }),
        defineTransition({
          name: 'to-human-review',
          to: 'human-review',
          when: '$allActivitiesDone && $fields.subject.amazonChannel.readinessScore >= 45 && $fields.subject.amazonChannel.readinessScore < 50',
        }),
        defineTransition({
          name: 'back-to-draft-low-score',
          to: 'draft',
          when: '$allActivitiesDone && $fields.subject.amazonChannel.readinessScore < 45',
        }),
      ],
    }),

    // Borderline 45–49 zone: human decides whether to override or return to draft
    defineStage({
      name: 'human-review',
      title: 'Human Review',
      activities: [
        defineActivity({
          name: 'review-recommendations',
          title: 'Review AI Recommendations',
          actions: [
            defineAction({
              name: 'override-approve',
              title: 'Override & Approve',
              status: 'done',
            }),
            defineAction({
              name: 'return-to-draft',
              title: 'Return to Draft',
              status: 'skipped',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'from-review-approved',
          to: 'audit-passed',
          when: '$allActivitiesDone && count(activities[status == "done"]) > 0',
        }),
        defineTransition({
          name: 'from-review-rejected',
          to: 'draft',
          when: '$allActivitiesDone && count(activities[status == "skipped"]) > 0',
        }),
      ],
    }),

    defineStage({
      name: 'audit-passed',
      title: 'Audit Passed',
      activities: [
        defineActivity({
          name: 'request-video',
          title: 'Request Promo Video',
          actions: [
            defineAction({
              name: 'generate-video',
              title: 'Generate Video',
              status: 'done',
              effects: [triggerVideoRender],
            }),
          ],
        }),
      ],
      // Only one way out. A `when: 'true'` fallback used to sit below this and
      // was a trap: transitions evaluate in order, `to-video-requested` waits on
      // $allActivitiesDone, so on stage entry the unconditional fallback always
      // won and bounced the product straight back to draft. The stage could
      // never be rested in, so its Generate Video action was unreachable.
      transitions: [
        defineTransition({ name: 'to-video-requested', to: 'video-requested' }),
      ],
    }),

    defineStage({
      name: 'video-requested',
      title: 'Video Requested',
      activities: [
        defineActivity({
          name: 'video-rendering',
          title: 'Rendering Video',
          actions: [
            // Cascade-fires once Remotion writes productVideo reference onto the product
            // Same reasoning as audit-complete: a product that already has a
            // video would satisfy `defined(productVideo._ref)` on entry.
            defineAction({
              name: 'video-ready',
              title: 'Video Ready',
              when: "$effectStatus['trigger-video-render'] == 'done'",
              status: 'done',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({ name: 'to-video-ready', to: 'video-ready' }),
      ],
    }),

    defineStage({
      name: 'video-ready',
      title: 'Video Ready',
      activities: [
        defineActivity({
          name: 'human-approval',
          title: 'Human Approval',
          actions: [
            defineAction({
              name: 'approve-publish',
              title: 'Approve & Publish',
              status: 'done',
            }),
            defineAction({
              name: 're-render',
              title: 'Re-render Video',
              status: 'skipped',
            }),
          ],
        }),
      ],
      transitions: [
        defineTransition({
          name: 'to-published',
          to: 'published',
          when: '$allActivitiesDone && count(activities[status == "done"]) > 0',
        }),
        defineTransition({
          name: 'back-to-video-requested',
          to: 'video-requested',
          when: '$allActivitiesDone && count(activities[status == "skipped"]) > 0',
        }),
      ],
    }),

    defineStage({
      name: 'published',
      title: 'Published',
      activities: [],
      transitions: [],
    }),
  ],
})

// The Workflows CLI does not read .env files — it has no dotenv dependency and
// reads process.env directly. Unless the deploy script loads the env file, a
// bare process.env lookup here is undefined and the resource id silently
// becomes "undefined.undefined". Fall back to literals so a missing env var
// cannot deploy to a nonexistent dataset. Mirrors sanity/sanity.config.ts.
const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ??
  process.env.SANITY_STUDIO_PROJECT_ID ??
  'dkhhaxxy'

const dataset =
  process.env.NEXT_PUBLIC_SANITY_DATASET ??
  process.env.SANITY_STUDIO_DATASET ??
  'production'

const datasetResource = { type: 'dataset', id: `${projectId}.${dataset}` } as const

// Deployment config — run: pnpm workflow:deploy
export default defineWorkflowConfig({
  deployments: [
    {
      name: 'amazon-readiness-prod',
      tag: 'prod',
      // Every runtime sharing this resource is on the 0.34.0 stack, whose data
      // model is version 10 (valid reader range is 4–10). Declaring 10 says we
      // have verified that floor; declaring lower would fail submission if the
      // definition's conditional transitions require a newer reader.
      expectedMinReaderModel: 10,
      // Default hosting for this deployment's workflows. Omitted, it defaults
      // to 'function', which expects Sanity-hosted Functions. We dispatch
      // effects ourselves instead — see the note on effects above.
      runtime: { kind: 'selfHosted' },
      // Where workflow instance documents live
      workflowResource: datasetResource,
      // The subject alias resolves to the same dataset, where product docs live
      resourceAliases: [{ name: 'subject', resource: datasetResource }],
      definitions: [amazonReadinessWorkflow],
    },
  ],
})
