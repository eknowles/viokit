import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";

/**
 * `ink` for the one action a bar exists for, `line` for the rest, `quiet` for
 * toggles that spend most of their life off. Three tones is the whole set —
 * the accent colour is reserved for state, never for chrome.
 */
export type ButtonTone = "ink" | "line" | "quiet";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Full-width, 28px — the submit control at the foot of a form. */
  readonly block?: boolean;
  readonly children?: ReactNode;
  /** Marks a `quiet` toggle as currently on. */
  readonly on?: boolean;
  /** @default "line" */
  readonly tone?: ButtonTone;
}

export const Button = ({
  block = false,
  children,
  className,
  on = false,
  tone = "line",
  type = "button",
  ...rest
}: ButtonProps) => (
  <button
    aria-pressed={tone === "quiet" ? on : undefined}
    className={cx(
      "vk-btn",
      `vk-btn--${tone}`,
      block && "vk-btn--block",
      on && "is-on",
      className
    )}
    type={type}
    {...rest}
  >
    {children}
  </button>
);

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: a glyph-only control has no other accessible name. */
  readonly label: string;
  readonly name: GlyphName;
  /** @default 12 */
  readonly size?: number;
}

/** Square glyph-only control — close, dismiss, per-row curation. */
export const IconButton = ({
  className,
  label,
  name,
  size = 12,
  type = "button",
  ...rest
}: IconButtonProps) => (
  <button
    aria-label={label}
    className={cx("vk-icon-btn", className)}
    title={label}
    type={type}
    {...rest}
  >
    <Icon name={name} size={size} />
  </button>
);

export type LinkButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/** Text action inside dense chrome — a tray's "clear", a job's "cancel". */
export const LinkButton = ({
  className,
  type = "button",
  ...rest
}: LinkButtonProps) => (
  <button
    className={cx("vk-link-btn", "vk-micro", className)}
    type={type}
    {...rest}
  />
);
