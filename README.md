
## What I Built
<!-- Tell us about the app you prompted into existence. What does it do and who is it for? -->

### PIM-Lite

PIM usually means Product Information Management. In our case, PIM also means Product Intelligence Management: bringing intelligence into product creation and helping small and medium-sized retailers get their products onto larger marketplaces such as Amazon.

What started as a small product information manager for pushing a Salesforce Commerce Cloud catalogue
to Amazon, built on Sanity, then morphed into a bigger question: why could Sanity itself not become the
source of truth for products? We initially imported around 10,000 products into Sanity; the current demo
dataset contains approximately 4,500 sample products. For now, we have chosen one channel—Amazon—because
it is the largest marketplace.

An AI agent audits each product against Amazon channel rules **that live in
Sanity as content**, a Sanity Workflow moves the product through review, and an
approved product renders its own promo video. Fixing a product's issues
re-audits it, which advances the workflow, which re-renders the video.

Built for the dev.to Sanity Challenge, Path Two — *Vibe-Code Something Strange*.

![Sequence diagram showing the product import, audit, video rendering, and publishing workflow](image.png)

#### What is actually interesting here

***Audit rules are content, not code.*** `auditRule` is a document type. The
scoring engine fetches enabled rules at run time:

A merchandiser can add a check, retune a severity, or disable a rule from the
Studio, and the next audit picks it up—no deploy and no code change. Some rules
genuinely require cross-field logic and belong in code rather than content—for
example, preventing luxury items from falling below a price threshold or
flagging products priced above $10,000 outside a luxury category. These act as
guardrails around the agent.

**The workflow calls out to an agent.** Entering the `audit-pending` stage
queues an effect, runs a Mastra agent through OpenRouter, and writes the report
back as a document. The stage does not advance on a timer
or external callback. It advances after the audit effect completes and the
agent has written `readinessScore` onto the product.


**A person and an agent advance the pipeline the same way.** There is no
"workflow stage" field on the product. The workflow instance is the only record
of where a product is, and every control in the dashboard fires an action on
that instance rather than patching a document to fake a move.

**Approval renders a video.** Clearing review triggers a Remotion render whose
copy comes from the audited product. The finished video writes a reference back
onto the product, which is what advances the workflow again. Currently, this is
a local render. I would have liked to test rendering directly into Sanity's
Media Library, but that was outside the scope of this build. One learning: AI
has no taste. It still needs a lot of babysitting to produce a genuinely good
video. The current result is rough, but—heck—we are video producers now!

## The pipeline

```
draft → audit-pending → audit-passed → video-requested → video-ready → published
  │           │
  │           └── human-review     (score 45–49: a person decides)
  │
  └── on entry: enrich-product fills gtin, brand, condition, image
```

Entering `draft` queues enrichment, because a product's score is otherwise
capped by factual fields no copy suggestion can supply — a product with perfect
marketing copy and no GTIN still cannot pass.

Transitions out of `audit-pending` are gated on the readiness score:

- 50 or above passes.
- 45–49 stops for human review.
- Below 45 returns to draft.

Those thresholds live in `sanity.workflow.ts` and nowhere else.

## Demo
Include a video

## Code
https://github.com/SunjaySingh/PIM_LITE


## My Build Process
This is the build process I followed. First, I stuck to VS Code with the Claude
plugin and GitHub Copilot (GHCP). On the left was Claude in chat mode; on the
right was GHCP.

I started with the contest prompt, then added the real use case of developing a
PIM Lite solution and turned it into a specification with our architectural
needs. I already had a CSV export of the previous Sanity product catalogue. I
told Claude about it, and it automatically created the import and generated the
schema from the CSV. I started with Sonnet 4.6 on low. It created the UI and
Sanity document list, with all the CTAs wired up.

Then the back-and-forth with Claude began. It behaved exactly like a junior
developer. While testing, I saw that the workflow was not working and told it
so. Claude replied, "Hey, you did not tell me to deploy. Here is what I have
coded and ready." The first version was a Next.js app, but I checked it and
pointed out that the App SDK was not being used. Then the frustrating run began.

I had read about StyleX and asked it to use it. That did not go the way I
wanted, so I took the safe route and asked it to use CSS Modules. The
`pim-lite-spec.md` file therefore mentions StyleX, while the code uses CSS
Modules. I also asked Claude to replay the StyleX challenge and document what
happened.

The next challenge was Workflows and the App SDK. The workflow was not
triggering or working end to end. I had made one rule for myself: I would not
look up the code; I would prompt my way out of hell! I asked Claude, "Can you
give me the three most important issues we need to fix?" It gave me a
wonderfully deep technical brief, which admittedly went over my head. I had
heard about effects but had never ventured into them. These were the three big
issues:

- The workflow engine is wired to nothing; fix the configuration.
- Human approval bypasses the workflow entirely.
- The App SDK is installed but mostly unused.

Then it was back to skills and the specification. Claude created
`spec-real-workflow-transitions.md`, and just like that, the whole application
changed. Everything was wired up and almost working. A few small niggles
remained, which I worked through with more prompts. I also asked it to run an
end-to-end test, and it tested the application using curl and a Bash script. It
said Playwright and the Chromium CLI were not available. I installed
Playwright, but did not manage to get a full end-to-end Playwright test running.

The next challenge was the Remotion video. It was not working as expected
because of the workflow and some bad wiring. Of course, this was not originally
planned. The idea came after around two days of work: why not create a product
video from the product title and whatever image was available? Again, nothing
was planned or prescribed for the video; I let the agent give me what it wanted.
This was more of a learning experience for me—to see when and how to guide the
agent.

I used Mastra agents to build the audit and enrichment agents. This was the
really interesting part: it almost one-shotted the entire agent implementation.
My reasoning is that I had previously been learning how to write agents the hard
way. I have a set of 12 agents that I am building by hand, so I think it found
that prior art, saw a whole subset of previously created agents, and used those
patterns. The skills for looking up documentation also existed globally.

One key mistake was not telling the agent—or updating `AGENTS.md`—to always
look up the documentation. Since Workflows had only just been released, it went
all over the place. Another idea, *Pencil Down*, was popular during the build,
and I took it literally. However, I now firmly believe in the philosophy, with
one adjustment: it should be pencils and paper during the planning phase.

I did not plan the workflow phases or the interaction flow, and that really
puts you to the test. Yes, the cost of code is now insignificant. I think the
total cost was less than $20; previously, building just an SFCC sync engine took
one full-time engineer almost three weeks. Agents do not have taste or
finesse—that is what still needs pencils and paper. No question about it.

This was a totally vibe-coded solution: I did not look at the code. I only
looked at the CSS files, the Mastra agent file, and the product schema. After
that, I never looked at the code.


## Architecture

| Piece | What it does |
| --- | --- |
| `sanity.workflow.ts` | The one workflow definition. Must be at the repo root — the Workflows CLI resolves its config by filename against the root only. |
| `components/pim-dashboard/effectHandlers.ts` | Handlers the engine dispatches queued effects to, keyed by effect name. |
| `agent/enrich.ts` | Deterministic enrichment — derived GTIN, house brand, condition, catalogue image. |
| `agent/auditAgent.ts` | Rule engine (`runRules`, `calcScore`) plus a Mastra agent with `fetchProduct` and `writeAuditReport` tools. |
| `components/pim-dashboard/` | The dashboard. Reads and writes through the Sanity App SDK, so it runs in either host. |
| `remotion/` | A 15-second, 1920×1080 promo composition, rendered locally for the demo. |
| `sanity/schemas/` | `product`, `auditRule`, `auditReport`, `productVideo`, `colorMapping`, `sizeMapping`. |

### Architecture diagram
![PIM-Lite architecture across the Next.js application, automation services, and Sanity platform](image-1.png)

### The dashboard mounts twice

The same components run in two hosts:

- **`/dashboard`** — a standalone App SDK application with its own login
  boundary. Client-only: the App SDK store has no server snapshot, so the route
  loads it with `ssr: false`.
- **Inside the Studio** — registered as a custom tool, where `SanityApp` derives
  its config from the workspace.

Workflow controls currently require the Studio host.
`@sanity/workflow-studio`'s `useWorkflowEngine` reads Studio source context; the
App SDK equivalent needs an engine assembled with `createEngine` and its own
per-resource client routing, which is not built yet. The standalone host renders
everything else and shows a clear no-engine state for the stage controls.

## Running it - Sanity Project Details

Requires Node ≥ 20.9 (see `.nvmrc`); the Workflows CLI and several scripts use
flags that do not exist on older runtimes.

```bash
nvm use
pnpm install
```

Create `.env.local`:

```bash
NEXT_PUBLIC_SANITY_PROJECT_ID=dkhhaxxy
NEXT_PUBLIC_SANITY_DATASET=production
SANITY_API_TOKEN=...              # Editor role — the agent writes back
SANITY_WORKFLOW_SECRET=...        # shared secret for the effect endpoints
GOOGLE_GENERATIVE_AI_API_KEY=...
OPENROUTER_API_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

Then:

```bash
pnpm dev                 # app at :3000, Studio at /studio, dashboard at /dashboard
pnpm studio              # standalone Studio at :3333

pnpm import              # import the SFCC CSV
pnpm seed                # colour + size mappings
pnpm seed:rules          # the audit rules

pnpm workflow:check      # validate the workflow definition
pnpm workflow:deploy     # deploy it

pnpm workflow:start --sku=SKU123   # put a product into the pipeline
pnpm workflow:start --limit=10     # …or a batch
pnpm workflow:drain --watch        # run queued effects headlessly

pnpm audit:batch         # audit the catalogue from the CLI
pnpm remotion:studio     # preview the promo composition
```

`workflow:deploy` and `workflow:check` source `.env.local` themselves and map
`SANITY_API_TOKEN` onto `SANITY_AUTH_TOKEN`, which is the name the Workflows CLI
actually reads.

## Styling

Styling was an adventure. After reading the Twitterverse and watching videos,
StyleX was the choice. But after spending two days on it, I gave up. The agents
were not able to get it working, so I moved to trusted CSS Modules. I asked
Claude to summarize everything it tried and explain the issue in
`docs/devchallenge.md`.

The dashboard uses CSS Modules. Design tokens live in
`styles/tokens.module.css` as custom properties on a `.tokens` class, applied at
the dashboard root, with `styles/tokens.ts` mirroring the same names as
`var(...)` strings for inline styles and data objects. They are declared on a
class rather than `:root` because the standalone Studio has no root layout in
which to import a global stylesheet. **Update both files together.**

Base classes are ordered before their modifiers in every `.module.css`: CSS
Modules resolve by stylesheet source order, not by the order classes are listed
on the element. `docs/devchallenge.md` is the full write-up of that migration.

## Known gaps

This is a challenge submission, not a production system.

- **Video storage is local-POC only.** Rendered MP4s are written to
  `public/videos/` on the machine running `next dev` (or whatever server
  process handles the effect route) and served back as a plain `/videos/<file>`
  URL — the binary itself never touches Sanity's Media Library, only the
  `productVideo` document's `videoUrl` string does. That means the video is
  only reachable as long as that filesystem and that Next.js server are the
  ones serving requests. **This does not work on serverless deployments**
  (Vercel, Lambda, or any platform with an ephemeral/read-only filesystem or
  multiple instances): a render on one invocation writes to storage that the
  next request, or a different instance, will not see, and the file will not
  survive a redeploy or a cold start. Shipping this beyond a local demo needs
  real object storage (Sanity assets, S3, etc.) behind `videoUrl` — which is
  deliberately out of scope here.
- Product images are URL strings rather than Sanity image assets.
- Remotion renders via the local CLI; production would use Lambda.
- Existing catalogue products do not automatically get workflow instances.
