# Spec: One Real Workflow, Driven From an App SDK Dashboard

Status: ready-for-agent
Target: PIM-Lite — Sanity Challenge, Path Two submission (due 2026-10-04)

## Problem Statement

A merchandiser using PIM-Lite cannot actually move a product through the Amazon
readiness pipeline, and cannot tell what state a product is really in.

The dashboard shows a stage badge that reads from the real workflow instance,
but every button that claims to advance a product writes a plain string field on
the product document instead of asking the workflow engine to move. The result
is two disagreeing accounts of the same product: the merchandiser clicks
"Approve & Generate Video", the product's own field says `video_requested`, and
the badge beside it still says the instance is in `draft` — because nothing in
the product ever fires a transition. Neither account is trustworthy, so the
merchandiser has no way to answer "where is this product, and what happens next?"

Underneath that, the pipeline has never run end to end. Two workflow
definitions exist; the Workflows CLI only resolves the one at the project root,
which is the weaker of the two and whose effect names and binding keys do not
match what the effect handler expects. So when the engine queues the AI audit,
the handler rejects it as an unknown effect, or receives no usable document
reference, fails, exhausts its retries, and leaves the instance stranded. The
richer definition — the one with the borderline human-review stage and the
score-gated transitions — is never deployed at all.

Separately, the dashboard reads its data through Studio's own client with
hand-rolled listeners. That ties it to running inside the Studio and makes it a
read-only view of content rather than an application built on top of it.

## Solution

There is exactly one workflow definition, it is the one that deploys, and its
effect contract matches the handler that drains it. The product document no
longer carries a stage field at all — the workflow instance is the single source
of truth for where a product is.

Every stage change, whether initiated by the AI audit agent or by a human
merchandiser, happens by firing an action on that same instance. The agent
moves a draft forward by completing its audit action; a person approves it by
firing an approval action on the same instance, through the same transitions.
The dashboard's buttons are bound to the actions the engine says are currently
available, so a button is enabled precisely when the engine would accept it, and
the badge beside it can never disagree with what the button does.

The dashboard itself reads and writes through the App SDK rather than Studio's
client, which makes it host-agnostic. It is mounted twice: as the custom tool
inside the Studio, and as a standalone application route with its own
authentication — a real application over the content, not another read-only
frontend.

## User Stories

### Operating the pipeline

1. As a merchandiser, I want a single stage badge on a product, so that I never have to reconcile two conflicting accounts of where that product is.
2. As a merchandiser, I want the stage badge to reflect the live workflow instance, so that I can trust it without refreshing.
3. As a merchandiser, I want to submit a draft product for audit, so that the AI audit agent picks it up without me running a script.
4. As a merchandiser, I want the audit to start automatically when a product enters the audit-pending stage, so that I do not have to trigger it as a second manual step.
5. As a merchandiser, I want to see that an audit is in progress, so that I know the system is working and I should wait.
6. As a merchandiser, I want a product whose readiness score clears the pass threshold to advance automatically, so that healthy products need no attention from me.
7. As a merchandiser, I want a product whose readiness score falls below the review threshold to return to draft, so that I can see it needs real remediation.
8. As a merchandiser, I want a product whose score lands in the borderline band to stop and wait for a human, so that judgment calls reach me instead of being auto-decided.
9. As a merchandiser reviewing a borderline product, I want to override and approve it, so that I can use my own knowledge of the catalog where the score is inconclusive.
10. As a merchandiser reviewing a borderline product, I want to send it back to draft, so that I can reject it without inventing a workaround.
11. As a merchandiser, I want the approve action to be unavailable when the engine would not accept it, so that I cannot put a product into an impossible state.
12. As a merchandiser, I want to know *why* an action is unavailable, so that I know what to fix rather than guessing.
13. As a merchandiser, I want approving a product to trigger the promo video render, so that approval is the only step I perform.
14. As a merchandiser, I want to see the video's render status, so that I know whether to wait, retry, or publish.
15. As a merchandiser, I want to request a re-render of a video I am unhappy with, so that I am not forced to publish the first result.
16. As a merchandiser, I want to publish only once the video is ready, so that I never publish an incomplete product.
17. As a merchandiser, I want the record of who approved a product and when to survive, so that the approval is auditable after the fact.

### Working with audit results

18. As a merchandiser, I want to see the specific rule violations behind a score, so that I know what to fix rather than just seeing a number.
19. As a merchandiser, I want violations grouped by how much they cost me, so that I fix the expensive problems first.
20. As a merchandiser, I want to see the agent's suggested copy, so that I can evaluate the fix before accepting it.
21. As a merchandiser, I want to apply the agent's suggestions in one action and have the product re-audited, so that I can see immediately whether the score improved.
22. As a merchandiser, I want re-auditing to move the product through the same transitions as the first audit, so that the pipeline behaves consistently however many times I loop.
23. As a catalog manager, I want to change audit rules as content, so that I can retune scoring without waiting for a deployment.
24. As a catalog manager, I want to disable a rule, so that I can suppress a check that does not apply to our catalog.

### Seeing the catalog

25. As a merchandiser, I want products grouped by readiness on a board, so that I can see the shape of the backlog at a glance.
26. As a merchandiser, I want the board to update as audits complete, so that I can watch a batch progress without reloading.
27. As a merchandiser, I want catalog-wide statistics, so that I can report on overall channel readiness.
28. As a merchandiser, I want to select a product from the board and see its full detail beside it, so that I can work without losing my place.
29. As a merchandiser, I want to run an audit on a specific SKU directly, so that I can check one product without hunting for it on the board.

### Where the application runs

30. As a merchandiser, I want to use the PIM dashboard without opening the Studio, so that my day-to-day work is not wrapped in a content-editing tool.
31. As a content editor, I want the same dashboard available inside the Studio, so that I can move between structured editing and pipeline work in one place.
32. As a merchandiser, I want the standalone dashboard to authenticate me, so that catalog data is not exposed to anyone with the URL.
33. As a visitor to the application root, I want to arrive somewhere that explains what this is and links to the dashboard and the Studio, so that I am not dropped onto a framework template.

### Operating and debugging

34. As a developer, I want deploying the workflow to fail loudly if the definition and the effect handler disagree, so that a mismatch never reaches a running instance.
35. As a developer, I want the effect handler to reject unauthenticated calls, so that the endpoint that writes to my dataset is not open.
36. As a developer, I want a failed effect to retry under the declared policy and then surface as a visible failure, so that a stuck product is diagnosable rather than silently stalled.
37. As a developer, I want one place that defines the stage vocabulary, so that stage names cannot drift between the schema, the engine, and the interface.
38. As a hackathon judge, I want the workflow packages to be genuinely exercised rather than merely installed, so that I can see the feature was actually used.

## Implementation Decisions

### One workflow configuration, at the location the CLI resolves

The Workflows CLI resolves its configuration by filename against the project
root only — it does not search subdirectories. The project currently has two
definitions; the one the CLI loads is the weaker one. The richer definition,
currently in a subdirectory and therefore dead, becomes the only definition and
moves to the root filename the CLI resolves. The duplicate is deleted outright
rather than kept as a reference copy, so that there is no second definition to
drift.

The surviving definition is the one that already carries the borderline
human-review stage, the score-gated conditional transitions, the retry policies,
and the effect bindings that match the effect handler.

### The effect contract is explicit and enforced

An effect's `name` and its `bindings` keys form the contract between the
workflow definition and the effect handler that drains it. The current failure
is a silent breach of both halves: the deployed definition emits names the
handler does not recognise, and binding keys the handler does not read.

The decision is that this contract is enforced at build time rather than
discovered at runtime (see Testing Decisions). The handler dispatches on effect
name and reads binding keys; both sets are derived from the deployed definition
rather than duplicated by hand.

Bindings resolve the workflow subject to something the handler can act on: the
subject document's identifier and its SKU. The handler must be able to locate
the product from bindings alone, without inferring it from request context.

### The workflow instance is the only record of stage

The product document's stage field is removed from the schema. It is a second
state machine, it is the one the interface currently writes to, and it is
already drifting from the engine's vocabulary — the schema's list uses
underscore-separated values while the workflow definition uses hyphenated ones.
Deleting the field resolves the divergence rather than reconciling it.

Anything that needs a product's stage reads it from the workflow instance.
Per-document instance discovery is the supported path for going from a product
to its instance; the interface must not hand-roll a GROQ query against the
instance document shape, because that shape is engine-owned and pre-release.

Fields that record *facts* rather than *state* — the approval timestamp, the
published timestamp, the readiness score, the audit report reference — stay on
the product. The distinction is that these remain meaningful independent of
where the instance currently sits.

### Human and agent advance the workflow through the same mechanism

Every dashboard control that changes a product's position in the pipeline fires
an action on the workflow instance. None of them patch the product document to
simulate a stage change. This is the central decision of the spec: the AI audit
agent completes its action to move a draft forward, and a person fires an
approval action on the same instance, through the same transitions.

An action is addressed by both its activity and its own name —
`fireAction({activity, action})` — not by action name alone. Controls are
therefore rendered from the evaluation's activity list rather than from a
hand-written list of action names.

Direct document patches remain correct for editing *content* — applying the
agent's suggested copy to a product is a patch, because it changes the product,
not its position.

### Action availability comes from the engine, not from the client

The dashboard currently decides whether Approve is enabled by comparing the
score to thresholds in component code. Those thresholds are a third copy of
logic that already exists in the workflow definition's transition conditions.

Buttons are instead bound to the actions the engine's current evaluation
reports as available, along with its guard state. A control is enabled when the
engine would accept it and disabled with an explanation when it would not. The
thresholds live only in the workflow definition.

The stage machine, which the transition conditions encode, is:

| Stage | Advances when | Goes to |
| --- | --- | --- |
| `draft` | submitted for audit | `audit-pending` |
| `audit-pending` | audit done, score ≥ pass threshold | `audit-passed` |
| `audit-pending` | audit done, score in borderline band | `human-review` |
| `audit-pending` | audit done, score below borderline | `draft` |
| `human-review` | human overrides and approves | `audit-passed` |
| `human-review` | human returns it | `draft` |
| `audit-passed` | video render requested | `video-requested` |
| `video-requested` | render writes a video reference onto the subject | `video-ready` |
| `video-ready` | human approves | `published` |
| `video-ready` | human asks for a re-render | `video-requested` |

The audit-pending completion condition keys off the readiness score being
defined on the subject; the video-requested completion condition keys off the
video reference being defined on the subject. Both are already expressed this
way in the surviving definition and should not be reimplemented as handler-side
transition calls.

### The video render closes its own loop by writing to the subject

The render handler already writes the video reference onto the product, which is
exactly what the `video-requested` stage's completion condition observes. The
handler therefore does not need to fire a transition itself, and the outstanding
note suggesting it should is resolved by deletion. Cascade re-evaluation is the
engine's job.

### The dashboard's data layer moves to the App SDK

The board, the statistics panel, and the detail panel currently use Studio's
client with manual listeners that refetch the entire query on any change. They
move to App SDK data hooks — query, document, projection, and edit — which
removes the subscription bookkeeping and, more importantly, removes the
dependency on Studio source context.

Workflow reads and writes go through the Studio-side workflow adapter's session
and instance hooks, which route their observation through the same App SDK
store.

### The dashboard mounts in two hosts

Once the components no longer depend on Studio context, they mount unchanged in
two places: the existing custom tool inside the Studio, and a standalone
application route that establishes its own App SDK context and authentication.
The components themselves take no position on which host they are in.

The data layer ports cleanly, but the **workflow engine does not**. The Studio
adapter's engine hook reads Studio source context and cannot run standalone; the
App SDK path requires assembling an engine explicitly, with its own
per-resource client routing. The engine is therefore supplied to the components
through a context that each host fills in its own way, and components that need
one render a degraded state when the host provides none. Building the standalone
engine is deferred, and the standalone host ships without stage controls until
it exists.

The standalone route is also **client-only**: the App SDK store has no server
snapshot, so server-rendering the route fails outright. It must be loaded with
server rendering disabled, which in turn requires a thin client wrapper between
the route's server component and the application.

The application's root route, currently a framework template, becomes a landing
page linking to the standalone dashboard and the Studio.

### The effect handler authenticates

The render handler validates a shared secret; the effect-drain handler does not,
despite being the endpoint that writes audit reports and scores into the
dataset. Both validate the same secret, by the same mechanism.

## Testing Decisions

### What makes a good test here

A test asserts externally observable behaviour: given an input at a seam, the
right thing lands in the Content Lake or comes back in the response. Tests do
not assert that a particular internal function was called, do not reach into
component internals, and do not assert on the engine's private document shapes
— that shape is engine-owned, pre-release, and will move.

### Prior art

There is none. This repository currently has no tests, no test runner, and no
test script. This spec introduces the first two. A runner must be chosen as part
of the work; it needs TypeScript support and ESM, both of which the project
already relies on elsewhere in its tooling.

Because there is no prior art, the implementing agent should establish the
convention deliberately and keep it small — these two seams, and no speculative
scaffolding for seams this spec does not ask for.

### Seam 1 — the effect contract, between workflow definition and effect handler

The highest-value test in the repository, and the one that would have caught the
bug that is currently live. It loads the deployed workflow configuration and
asserts, without a network call or a dataset:

- every effect name declared anywhere in the configuration is dispatched by the
  effect handler
- every binding key the handler reads is produced by the declaring effect
- the configuration resolves at all from the project root

This is a pure contract test over two artifacts. It is fast, it has no external
dependencies, and it fails at build time when someone renames an effect. It is
the seam that makes the "one definition" decision enforceable rather than
merely stated.

### Seam 2 — the effect-drain route, end to end

The highest seam that covers the agent-to-Content-Lake round trip. The test
posts an effect payload to the route as the engine would, against a dedicated
test dataset, and asserts on what is observable afterwards:

- an audit report document exists, referencing the product
- the readiness score is patched onto the product
- the product references the new audit report
- an unrecognised effect name is rejected
- a payload whose bindings identify no product fails rather than silently
  succeeding
- an unauthenticated request is rejected

The route is exercised over HTTP, not by importing its handler, so that request
parsing and authentication are inside the seam rather than beside it.

The AI agent call inside the handler is the one thing stubbed, because it is
non-deterministic and costs money per run. The handler already has a
deterministic fallback path for agent failure; tests drive that path, which also
means the fallback itself is covered.

### Deliberately not tested

Component-level tests for the dashboard are not part of this spec. The behaviour
that matters — that approval fires an action rather than patching a document —
is better evidenced by the stage field being absent from the schema entirely,
which makes the wrong implementation impossible to write rather than merely
detectable.

## Out of Scope

- **Production readiness.** This is a hackathon build. No load testing, no error
  budget, no observability stack, no deployment pipeline.
- **Remotion Lambda.** Rendering stays local CLI for the demo.
- **Uploading rendered video as a Sanity file asset.** The video reference is
  what the workflow observes, and that already works. Storing the asset properly
  would make the video playable in the dashboard and is a strong follow-up, but
  it is not required by any of the three issues this spec addresses.
- **Product images as Sanity assets.** Currently URL strings; migrating them is
  separate work.
- **Additional Studio customisation** — custom desk structure, document actions,
  score badges, character-counter inputs. All are valuable for the submission's
  feature-coverage goal and should be their own spec; none are required to make
  the workflow real.
- **Schema validation rules.** The schema documents character limits in field
  titles without enforcing them. Worth fixing, unrelated to these three issues.
- **The written submission itself.** The landing page is in scope because it is
  the application's front door; the article is not.
- **Backfilling instances for already-imported products.** How existing catalog
  products acquire workflow instances is a migration question this spec does not
  answer.

## Further Notes

- **The submission deadline is 2026-10-04.** Sequencing matters: the single
  workflow configuration unblocks everything else, the action-firing work
  depends on it, and the App SDK migration touches the same components as the
  action-firing work — so those two should be done together rather than as
  separate passes over the same files.
- **The Workflows packages are pre-release (0.34.0).** Their APIs may move.
  This is an argument for keeping engine-shaped knowledge behind the adapter's
  hooks rather than querying instance documents directly, which the interface
  currently does in one place.
- **The dependency override the workflow adapter's packaging notes call for is
  already satisfied** — the required Mutate version resolves correctly in the
  current lockfile. No action needed, but do not remove it if it is added.
- **A stale project-id fallback exists in the Studio CLI configuration** and
  points at a different project than the real one. It will silently target the
  wrong project if the environment variable is ever missing. Trivial to fix
  while in the area.
- **This repository is not under version control.** For a challenge judged on
  the build as much as the result, commit history is evidence. Initialising it
  before this work begins means the work itself becomes part of that evidence.
- **On judging alignment:** the two features this spec makes real are the two
  the challenge names explicitly. The strongest existing material — audit rules
  modelled as content, so the scoring engine is retunable by an editor with no
  deployment — is untouched by this work and should anchor the written
  submission.
