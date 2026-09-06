import type { SVGProps } from "react";
import { GLYPHS, type GlyphName } from "./glyphs.js";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Lucide slug. */
  readonly name: GlyphName;
  /** @default 20 */
  readonly size?: number;
  /** @default 2 */
  readonly strokeWidth?: number;
}

/**
 * Lucide glyph drawn in currentColor. A slug with no glyph renders a dashed
 * box rather than nothing: an empty icon column reads as a bug, and a bug you
 * can see is worth more than one you cannot.
 */
export const Icon = ({
  name,
  size = 20,
  strokeWidth = 2,
  style,
  ...rest
}: IconProps) => {
  const glyph = GLYPHS[name];
  if (glyph === undefined) {
    return (
      <span
        aria-hidden="true"
        style={{
          border: "1px dashed currentColor",
          display: "inline-block",
          flex: "0 0 auto",
          height: size,
          opacity: 0.5,
          width: size,
          ...style,
        }}
      />
    );
  }
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      style={{ display: "inline-block", flex: "0 0 auto", ...style }}
      viewBox="0 0 24 24"
      width={size}
      {...rest}
    >
      {glyph}
    </svg>
  );
};
