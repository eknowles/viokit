import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export interface ToolbarProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  /**
   * Right-aligned mono summary, e.g. "13 candidates · sorted by relatedness".
   * Worth filling in: it is what stops a filtered table from quietly implying
   * it is showing everything.
   */
  readonly right?: ReactNode;
}

/** 30px control strip under a pane header — chips left, a count right. */
export const Toolbar = ({
  children,
  className,
  right,
  ...rest
}: ToolbarProps) => (
  <div className={cx("vk-toolbar", className)} {...rest}>
    {children}
    <span className="vk-spacer" />
    {right === undefined ? null : (
      <span className="vk-micro vk-dim">{right}</span>
    )}
  </div>
);

export interface FilterChipProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
  readonly on?: boolean;
}

export const FilterChip = ({
  className,
  on = false,
  type = "button",
  ...rest
}: FilterChipProps) => (
  <button
    aria-pressed={on}
    className={cx("vk-chip", on && "is-on", className)}
    type={type}
    {...rest}
  />
);
