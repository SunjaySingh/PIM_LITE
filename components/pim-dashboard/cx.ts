/** Join CSS Module class names, dropping conditional ones that are falsy. */
export function cx(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ')
}
