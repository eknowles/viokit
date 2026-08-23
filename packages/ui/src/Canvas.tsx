import type { ChangeEvent, HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export type CanvasProps = HTMLAttributes<HTMLDivElement>;

/**
 * Canvas surface with a time rail pinned under it. The scrubber is part of the
 * component rather than optional chrome, because a graph with no time axis
 * silently implies every edge on it is current.
 */
export const Canvas = ({ className, ...rest }: CanvasProps) => (
  <div className={cx("vk-canvas", className)} {...rest} />
);

export interface ScrubberProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  /** @default "time" */
  readonly label?: ReactNode;
  /** @default 100 */
  readonly max?: number;
  /** @default 0 */
  readonly min?: number;
  readonly onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  /** Mono value shown at the right, e.g. "2026-05-01". */
  readonly readout?: ReactNode;
  readonly value: number;
}

/** 28px time rail. */
export const Scrubber = ({
  className,
  label = "time",
  max = 100,
  min = 0,
  onChange,
  readout,
  value,
  ...rest
}: ScrubberProps) => (
  <div className={cx("vk-scrubber", className)} {...rest}>
    <span className="vk-micro vk-dim">{label}</span>
    <input
      aria-label={typeof label === "string" ? label : "time"}
      max={max}
      min={min}
      onChange={onChange}
      type="range"
      value={value}
    />
    {readout === undefined ? null : <span className="vk-micro">{readout}</span>}
  </div>
);
