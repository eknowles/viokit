import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export interface AppShellProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  /** The icon rail. Omit for a shell with no rail. */
  readonly rail?: ReactNode;
}

/**
 * The docking frame: icon rail beside a command bar and a work area. Fills its
 * container, so the host must give the shell somewhere to fill — put
 * `class="vk-viewport"` on <html> and `.vk-fill` on the mount node.
 */
export const AppShell = ({
  children,
  className,
  rail,
  ...rest
}: AppShellProps) => (
  <div
    className={cx("vk-app", rail === undefined && "vk-app--no-rail", className)}
    {...rest}
  >
    {rail}
    <div className="vk-app__main">{children}</div>
  </div>
);

export interface WorkspaceProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  /** Drop the aside column and let the work area span the full width. */
  readonly wide?: boolean;
}

/** Work area + aside, hairline-separated. Children are panes. */
export const Workspace = ({
  children,
  className,
  wide = false,
  ...rest
}: WorkspaceProps) => (
  <div
    className={cx("vk-workspace", wide && "vk-workspace--wide", className)}
    {...rest}
  >
    {children}
  </div>
);

export interface PaneStackProps extends HTMLAttributes<HTMLDivElement> {
  readonly children?: ReactNode;
  /**
   * Grid rows for the stack, e.g. `"minmax(0, 2fr) minmax(0, 1fr)"`. Always
   * use minmax(0, …): a grid track's default min-content floor is what makes a
   * dense table push its container wider instead of scrolling inside it.
   */
  readonly rows?: string;
}

/** Vertically stacked panes sharing hairlines — no gaps, no radius. */
export const PaneStack = ({
  children,
  className,
  rows,
  style,
  ...rest
}: PaneStackProps) => (
  <div
    className={cx("vk-pane-stack", className)}
    style={
      rows === undefined
        ? style
        : ({ ...style, "--vk-stack-rows": rows } as Record<string, string>)
    }
    {...rest}
  >
    {children}
  </div>
);
