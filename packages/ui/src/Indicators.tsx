import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

/** What an analyst has decided about a candidate. */
export type CurationState = "deferred" | "discarded" | "kept" | "new";

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const percent = (value: number): string => `${clamp(value) * 100}%`;

export interface StateStripeProps extends HTMLAttributes<HTMLElement> {
  /** @default "new" */
  readonly state?: CurationState;
}

/** 2px curation stripe down a row's leading edge. */
export const StateStripe = ({
  className,
  state = "new",
  ...rest
}: StateStripeProps) => (
  <i
    className={cx("vk-state", `vk-state--${state}`, className)}
    title={state}
    {...rest}
  />
);

export type MeterTone = "accent" | "danger" | "fill" | "ok";

export interface MeterBarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Readout shown beside the bar — conventionally the number itself. */
  readonly children?: ReactNode;
  /** @default "fill" */
  readonly tone?: MeterTone;
  /** 0–1, clamped. */
  readonly value: number;
  /** Track width in px, or a CSS length. @default 44 */
  readonly width?: number | string;
}

/** Inline meter for a ranked score. Static: it is a value, not a movement. */
export const MeterBar = ({
  children,
  className,
  style,
  tone = "fill",
  value,
  width,
  ...rest
}: MeterBarProps) => (
  <span
    className={cx(
      "vk-meter",
      tone !== "fill" && `vk-meter--${tone}`,
      className
    )}
    style={
      width === undefined
        ? style
        : ({
            ...style,
            "--vk-meter-w": typeof width === "number" ? `${width}px` : width,
          } as Record<string, string>)
    }
    {...rest}
  >
    <span className="vk-meter__track">
      <span className="vk-meter__fill" style={{ width: percent(value) }} />
    </span>
    {children}
  </span>
);

export interface ProgressBarProps extends HTMLAttributes<HTMLSpanElement> {
  /** Turns the fill neutral once there is nothing left to wait for. */
  readonly done?: boolean;
  /** 0–1, clamped. */
  readonly value: number;
}

/** Full-width progress. Animated, unlike the meter: it reports movement. */
export const ProgressBar = ({
  className,
  done = false,
  value,
  ...rest
}: ProgressBarProps) => (
  <span
    aria-valuemax={100}
    aria-valuemin={0}
    aria-valuenow={Math.round(clamp(value) * 100)}
    className={cx("vk-progress", done && "vk-progress--done", className)}
    role="progressbar"
    {...rest}
  >
    <span className="vk-progress__fill" style={{ width: percent(value) }} />
  </span>
);

export type ConfidenceLevel = "high" | "low" | "medium";

export interface ConfidenceProps extends HTMLAttributes<HTMLSpanElement> {
  readonly level: ConfidenceLevel;
}

/** Confidence tier, coloured by how much weight it will carry. */
export const Confidence = ({ className, level, ...rest }: ConfidenceProps) => (
  <span
    className={cx("vk-mono", `vk-confidence--${level}`, className)}
    {...rest}
  >
    {level}
  </span>
);

export interface CorroborationProps extends HTMLAttributes<HTMLSpanElement> {
  /** Number of independent returns. Renders nothing below 2. */
  readonly count: number;
  /** The sources that corroborated, for the tooltip. */
  readonly sources?: readonly string[];
}

/**
 * `×N` badge for an entity more than one source returned. Hidden at 1, because
 * a badge on every row says nothing.
 */
export const Corroboration = ({
  className,
  count,
  sources,
  ...rest
}: CorroborationProps) => {
  if (count < 2) {
    return null;
  }
  return (
    <span
      className={cx("vk-corroboration", className)}
      title={sources?.join(" · ")}
      {...rest}
    >
      ×{count}
    </span>
  );
};
