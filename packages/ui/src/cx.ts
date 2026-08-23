/** Join class names, dropping anything falsy. */
export const cx = (
  ...parts: readonly (false | string | null | undefined)[]
): string => parts.filter(Boolean).join(" ");
