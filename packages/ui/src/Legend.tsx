import type { HTMLAttributes } from "react";
import { cx } from "./cx.js";

export interface LegendItem {
  /** Categorical slot, 1–6. Matches `.vk-node--cat-N` on the canvas. */
  readonly cat: number;
  readonly count?: number;
  readonly label: string;
}

export interface LegendProps extends HTMLAttributes<HTMLDivElement> {
  readonly items: readonly LegendItem[];
}

/**
 * Decodes a canvas's colour encoding. Not optional chrome: a colour nobody can
 * decode is decoration, and a graph that paints six entity kinds without
 * saying which is which is harder to read than one painted in a single colour.
 */
export const Legend = ({ className, items, ...rest }: LegendProps) => (
  <div className={cx("vk-legend", className)} {...rest}>
    {items.map((item) => (
      <span className="vk-legend__item vk-micro" key={item.label}>
        <span className={cx("vk-legend__swatch", `vk-node--cat-${item.cat}`)} />
        {item.label}
        {item.count === undefined ? null : (
          <span className="vk-dim">{item.count}</span>
        )}
      </span>
    ))}
  </div>
);
