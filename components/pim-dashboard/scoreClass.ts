/**
 * Picks the score colour class from whichever stylesheet the caller is using —
 * each panel defines its own scoreHigh/scoreMid/scoreLow.
 *
 * The parameter is typed as a bare class-name map because that is what a CSS
 * module import actually is: Next declares `*.module.css` as
 * `{readonly [key: string]: string}`, so naming the three keys here made the
 * type unsatisfiable and every call site a type error.
 */
export function scoreClass(
  score: number | null | undefined,
  styles: { readonly [key: string]: string },
): string {
  if (score == null) return ''
  return score >= 80 ? styles.scoreHigh : score >= 50 ? styles.scoreMid : styles.scoreLow
}
