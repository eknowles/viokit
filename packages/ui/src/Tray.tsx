import type { HTMLAttributes, ReactNode } from "react";
import { IconButton } from "./Button.js";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";
import { ProgressBar } from "./Indicators.js";

export interface TrayProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Header controls placed before the close button. */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  /** Dim mono meta beside the title, e.g. "2 active · 3 finished". */
  readonly meta?: ReactNode;
  readonly onClose?: () => void;
  readonly title?: ReactNode;
  /** Tray width in px. @default 376 */
  readonly width?: number;
}

/**
 * Popover list anchored under the command bar. Absolutely positioned, so it
 * needs a positioned ancestor — `AppShell`'s main column is one.
 */
export const Tray = ({
  actions,
  children,
  className,
  meta,
  onClose,
  style,
  title,
  width,
  ...rest
}: TrayProps) => (
  <div
    className={cx("vk-tray", className)}
    style={
      width === undefined
        ? style
        : ({ ...style, "--vk-tray-w": `${width}px` } as Record<string, string>)
    }
    {...rest}
  >
    <div className="vk-tray__head">
      <span className="vk-micro">{title}</span>
      {meta === undefined ? null : (
        <span className="vk-micro vk-dim">{meta}</span>
      )}
      <span className="vk-spacer" />
      {actions}
      {onClose === undefined ? null : (
        <IconButton label="Close" name="x" onClick={onClose} size={11} />
      )}
    </div>
    {children}
  </div>
);

export type TrayEmptyProps = HTMLAttributes<HTMLDivElement>;

/** Say what would put something here, not just that there is nothing. */
export const TrayEmpty = ({ className, ...rest }: TrayEmptyProps) => (
  <div
    className={cx("vk-tray__empty", "vk-micro", "vk-dim", className)}
    {...rest}
  />
);

export type JobState = "cancelled" | "done" | "failed" | "queued" | "running";

const JOB_ICON: Record<JobState, GlyphName> = {
  cancelled: "x",
  done: "check",
  failed: "triangle-alert",
  queued: "clock",
  running: "loader",
};

export interface JobItemProps extends HTMLAttributes<HTMLDivElement> {
  readonly done?: number;
  /** Transform name, e.g. "Company → officers". */
  readonly label?: ReactNode;
  /** Mono sub-line, e.g. "Companies House · 3/4 rows". */
  readonly meta?: ReactNode;
  /** Renders a cancel action while queued or running. */
  readonly onCancel?: () => void;
  /** @default "queued" */
  readonly state?: JobState;
  /** Mono clock, e.g. "07:57". */
  readonly time?: ReactNode;
  readonly total?: number;
}

/** One background job. */
export const JobItem = ({
  className,
  done = 0,
  label,
  meta,
  onCancel,
  state = "queued",
  time,
  total = 0,
  ...rest
}: JobItemProps) => {
  const active = state === "running" || state === "queued";
  return (
    <div className={cx("vk-job", `vk-job--${state}`, className)} {...rest}>
      <span className="vk-job__icon">
        <Icon name={JOB_ICON[state]} size={12} />
      </span>
      <span className="vk-job__main">
        <span className="vk-job__label">{label}</span>
        <span className="vk-job__meta vk-mono">{meta}</span>
        <ProgressBar
          done={state === "done"}
          value={total === 0 ? 0 : done / total}
        />
      </span>
      <span className="vk-job__side">
        <span className="vk-micro vk-dim">{time}</span>
        {active && onCancel !== undefined ? (
          <button
            className="vk-link-btn vk-micro"
            onClick={onCancel}
            type="button"
          >
            cancel
          </button>
        ) : (
          <span className="vk-micro vk-dim">{state}</span>
        )}
      </span>
    </div>
  );
};
