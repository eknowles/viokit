import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export interface LogEntryProps extends HTMLAttributes<HTMLLIElement> {
  readonly children?: ReactNode;
  /** Mono sub-line: what was run, against what, under whose credentials. */
  readonly meta?: ReactNode;
  /** Green confirmation line, e.g. "✓ independently corroborated". */
  readonly ok?: ReactNode;
  /** Mono clock in the leading column. */
  readonly time?: ReactNode;
}

export const LogEntry = ({
  children,
  className,
  meta,
  ok,
  time,
  ...rest
}: LogEntryProps) => (
  <li className={className} {...rest}>
    <span className="vk-mono vk-log__time">{time}</span>
    <span className="vk-log__body">
      {children}
      {meta === undefined ? null : <span className="vk-log__meta">{meta}</span>}
      {ok === undefined ? null : <span className="vk-log__ok">{ok}</span>}
    </span>
  </li>
);

export type LogListProps = HTMLAttributes<HTMLOListElement>;

/** Ordered investigation log. Children are `LogEntry`. */
export const LogList = ({ className, ...rest }: LogListProps) => (
  <ol className={cx("vk-log", className)} {...rest} />
);
