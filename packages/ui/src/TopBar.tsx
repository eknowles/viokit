import type { HTMLAttributes, ReactNode } from "react";
import { Button } from "./Button.js";
import { cx } from "./cx.js";
import { Icon } from "./Icon.js";
import { useTheme } from "./theme.js";

export interface TopBarProps
  extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  /** Pushed to the right-hand end, after the status line. */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  /** Mono identifier shown beside the title, e.g. a case id. */
  readonly subtitle?: ReactNode;
  readonly title?: ReactNode;
}

/** 38px command bar: identity left, derived status centre, actions right. */
export const TopBar = ({
  actions,
  children,
  className,
  subtitle,
  title,
  ...rest
}: TopBarProps) => (
  <header className={cx("vk-topbar", className)} {...rest}>
    {title === undefined ? null : (
      <span className="vk-topbar__title">{title}</span>
    )}
    {subtitle === undefined ? null : (
      <span className="vk-micro vk-dim vk-nowrap">{subtitle}</span>
    )}
    {children}
    <span className="vk-spacer" />
    {actions}
  </header>
);

export interface StatusLineProps extends HTMLAttributes<HTMLSpanElement> {
  /** Pulses when true; the dot goes still and grey when false. */
  readonly busy?: boolean;
  readonly children?: ReactNode;
}

/**
 * System readout. Say what is actually happening — a status line that reads
 * the same busy and idle is worse than none, because it teaches people to
 * ignore it.
 */
export const StatusLine = ({
  busy = false,
  children,
  className,
  ...rest
}: StatusLineProps) => (
  <span
    aria-live="polite"
    className={cx("vk-status-line", !busy && "is-idle", className)}
    {...rest}
  >
    <i className="vk-status-line__dot" />
    <span className="vk-status-line__text">{children}</span>
  </span>
);

/** Light/dark toggle wired to <html data-theme> and localStorage. */
export const ThemeToggle = () => {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <Button
      onClick={toggle}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
      tone="quiet"
    >
      <Icon name={dark ? "sun" : "moon"} size={12} />
      {dark ? "Light" : "Dark"}
    </Button>
  );
};
