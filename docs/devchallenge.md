# The Build That Wouldn't Start: Migrating PIM-Lite off StyleX

Part of the PIM-Lite submission for the dev.to Sanity Challenge (Path Two).

Somewhere in the middle of building this thing, the app stopped running. Not a
failing test, not a broken component — `pnpm dev` refused to serve a single
route, and `pnpm build` died before it produced anything. Here's what went
wrong, why, and what we changed.

---

## The symptom

Both commands failed the same way, instantly:

```
▲ Next.js 16.3.5 (Turbopack)
✓ Running next.config.ts took 3.0s

⨯ ERROR: This build is using Turbopack, with a `webpack` config and no `turbopack` config.
   This may be a mistake.

   As of Next.js 16 Turbopack is enabled by default and
   custom webpack configurations may need to be migrated to Turbopack.

   NOTE: your `webpack` config may have been added by a configuration plugin.

> Build error occurred
Error: Call retries were exceeded { type: 'WorkerError' }
```

Nothing compiled. The Studio at `/studio`, the dashboard, the API routes — all
unreachable, because the bundler never got as far as reading our source.

That last note in the error message is the tell: *your `webpack` config may have
been added by a configuration plugin.* We never wrote a `webpack` key.

## The root cause

Our `next.config.ts` looked like this:

```ts
const stylexPlugin = require('@stylexjs/nextjs-plugin')

const nextConfig: NextConfig = {
  transpilePackages: ['sanity', 'next-sanity'],
}

export default stylexPlugin({ rootDir: __dirname })(nextConfig)
```

We were using [StyleX](https://stylexjs.com/) for the PIM dashboard's styling.
Reading the plugin's source made the problem obvious — injecting a `webpack`
key is the *entire* job of `@stylexjs/nextjs-plugin`:

```js
module.exports = ({ rootDir, filename = 'stylex-bundle.css', ...opts }) =>
  (nextConfig = {}) => {
    return {
      ...nextConfig,
      webpack(config, options) {
        // ...push the StyleX webpack plugin
      },
    }
  }
```

Next.js 16 runs **Turbopack by default**. It sees a `webpack` key with no
`turbopack` key, concludes you have an unmigrated webpack config, and refuses
to continue.

This isn't a misconfiguration we could fix with a flag. The plugin's own
`package.json` declares:

```json
"peerDependencies": { "next": ">=14.0.1 || >=15.0.0 || 15.0.0-rc.0" }
```

It predates Turbopack-by-default and has no Turbopack code path at all.

### A second problem hiding behind the first

You can force the old bundler with `next build --webpack`. We tried it, and hit
a version split:

```
@stylexjs/nextjs-plugin  0.11.1  →  pins @stylexjs/babel-plugin 0.11.1  (the compiler)
app code imports         @stylexjs/stylex 0.19.1                        (the runtime)
```

StyleX's compiler and runtime are a matched pair — a 0.11 compiler emits code
for a 0.11 runtime. Both versions were genuinely installed side by side. So
`--webpack` would have gotten us a build, but not necessarily working styles.

## Weighing the options

Three ways out:

| Option | Cost |
| --- | --- |
| Stay on webpack, align StyleX versions | Smallest diff, but gives up Turbopack and leaves us on a plugin unmaintained against Next 16 |
| Keep StyleX, wire it through a Turbopack-supported path | Uncertain, and we're on a deadline |
| Drop StyleX for CSS Modules | Touches four components, but both bundlers support CSS Modules natively with zero config |

We went with **CSS Modules**. The deciding factor was scope: StyleX was confined
to four dashboard components plus one token file. That's a small enough surface
that a migration was less risky than betting on an unmaintained build plugin
three weeks from a submission deadline.

## The interesting part: where do the tokens live?

The obvious CSS Modules translation is mechanical — `stylex.create({...})`
becomes a `.module.css` file. The design tokens were the part that needed real
thought.

StyleX's `defineVars` compiles each token to a `var(--hash)` string, which meant
we'd been using tokens in two different ways:

```tsx
// (1) inside style definitions
backgroundColor: colors.surface

// (2) as plain JS strings, in data objects and inline styles
const BUCKET_META = {
  'not-audited': { label: 'Not Audited', color: colors.stateDraft },
}
// ...
<span style={{ backgroundColor: meta.color }} />
```

Use (2) rules out a pure-CSS solution. We need the token available as a JS
string *and* as something CSS can resolve.

The normal answer is CSS custom properties on `:root` in a global stylesheet.
That doesn't work here, because **the dashboard renders under two different
bundlers**:

- Next.js (Turbopack) at `/studio`, via `next-sanity`'s `NextStudio`
- The standalone Sanity CLI Studio, which is Vite

Only the first has a root layout where a global stylesheet can be imported. So
we declared the tokens on a **class** instead of `:root`:

```css
/* styles/tokens.module.css */
.tokens {
  --pim-score-high: #22c55e;
  --pim-state-draft: #94a3b8;
  --pim-surface: #ffffff;
  --pim-space-md: 16px;
  --pim-font-sans: Inter, system-ui, sans-serif;
  /* ... */
}
```

`PimDashboard` applies it to its root element, and the variables cascade to
every descendant — including the inline styles from use case (2):

```tsx
<div className={cx(tokens.tokens, styles.layout)} style={{ gridTemplateColumns: gridCols }}>
```

A small `styles/tokens.ts` mirrors the same names for the JS side:

```ts
export const colors = {
  scoreHigh: 'var(--pim-score-high)',
  stateDraft: 'var(--pim-state-draft)',
  // ...
} as const
```

The payoff: one mechanism that works identically under Turbopack and Vite, with
no build configuration in either. The tradeoff is two files to keep in sync,
which we noted in the README.

## The gotcha we nearly shipped

This one is worth knowing if you ever make the same migration.

StyleX merges atomic styles so that **the last argument wins**, deterministically:

```tsx
// btnPrimary's background reliably beats btn's
<button {...stylex.props(styles.btn, styles.btnPrimary)} />
```

CSS Modules don't work that way. `class="btn btnPrimary"` resolves by
**stylesheet source order**, not by the order you list the classes. Write the
modifier above the base class in your `.module.css` and the modifier silently
loses.

So every `.module.css` in this migration orders base classes before their
modifiers, with a comment where it matters:

```css
.card { border: 1px solid var(--pim-border); }

.card:hover { border-color: var(--pim-state-audit-pending); }

/* Must follow .card — overrides its border and background. */
.cardSelected {
  border-color: var(--pim-state-audit-pending);
  background-color: #fffbeb;
}
```

We verified it in the compiled output rather than trusting the source:

```
.KanbanBoard-module__kO08ka__card{...}
.KanbanBoard-module__kO08ka__card:hover{border-color:var(--pim-state-audit-pending)}
.KanbanBoard-module__kO08ka__cardSelected{...}
```

Base before modifier. Same visual result as the StyleX version.

## Two bugs it flushed out

Removing the StyleX packages collapsed some pnpm hoisting and exposed a latent
problem: `@sanity/vision` and `@sanity/icons` were **imported by
`sanity.config.ts` but never declared in `package.json`**. They'd been resolving
by accident. Any teammate doing a clean install would have hit this. Both are
now explicit dependencies.

Declaring `@sanity/icons` at the version Sanity itself uses (`^5.2.2`) surfaced
one more: v5 moved every icon to its own subpath export, so the root import no
longer resolves.

```ts
// before — works in v4, fails in v5
import { BarChartIcon } from '@sanity/icons'

// after
import { BarChartIcon } from '@sanity/icons/BarChart'
```

## Where we landed

```
✓ Compiled successfully in 12.7s
```

`next dev` starts, `/studio` serves, the dashboard renders with its styles
intact, and the project is on the default bundler with no custom build config
at all.

**What we removed:** `@stylexjs/stylex`, `@stylexjs/babel-plugin`,
`@stylexjs/nextjs-plugin`, `vite-plugin-babel`, the StyleX Babel block in
`sanity.cli.ts`, and the webpack plugin wrapper in `next.config.ts`.

**What replaced it:** four `.module.css` files, `styles/tokens.module.css`,
`styles/tokens.ts`, and a three-line `cx()` helper in place of `stylex.props()`.

### Takeaways

1. **"As of Next.js 16, Turbopack is enabled by default" has teeth.** Any
   ecosystem plugin whose whole contract is mutating the webpack config is a
   liability now, and it will fail closed at startup rather than degrading.
2. **Check the peer-dependency range before you debug.** `">=14.0.1 ||
   >=15.0.0"` told us in one line that no amount of configuration would fix
   this.
3. **Read the plugin source.** `@stylexjs/nextjs-plugin` is about 60 lines. Five
   minutes there turned an opaque `WorkerError` into an obvious architectural
   mismatch.
4. **Styling-library migrations are cascade migrations.** The CSS is the easy
   part; the merge semantics are where the silent bugs live.

---

*PIM-Lite — Sanity Challenge, Path Two: Vibe-Code Something Strange.*
