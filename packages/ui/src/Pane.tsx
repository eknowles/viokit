import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export interface PaneProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Style applied to the scrolling body, not the frame. */
  readonly bodyStyle?: CSSProperties;
  readonly children?: ReactNode;
  /** Drop the outer border when the pane sits inside an already-ruled dock. */
  readonly flush?: boolean;
  /** Right-aligned header meta, e.g. "2 kept · 1 discarded". */
  readonly right?: ReactNode;
  /** Lower-case header text, e.g. "results workbench · table". */
  readonly title?: ReactNode;
}

/**
 * Framed pane: 26px mono header, scrolling body, radius 0. Panes inside a
 * `PaneStack` or `Workspace` are ruled by the dock, so they lose their own
 * border automatically and do not need `flush`.
 */
export const Pane = ({
  bodyStyle,
  children,
  className,
  flush = false,
  right,
  title,
  ...rest
}: PaneProps) => (
  <section
    className={cx("vk-pane", flush && "vk-pane--flush", className)}
    {...rest}
  >
    {title === undefined && right === undefined ? null : (
      <div className="vk-pane__head">
        <span className="vk-micro">{title}</span>
        <span className="vk-pane__head-right vk-micro vk-dim">{right}</span>
      </div>
    )}
    <div className="vk-pane__body" style={bodyStyle}>
      {children}
    </div>
  </section>
);
