import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";

export interface RailItem {
  readonly icon: GlyphName;
  readonly id: string;
  /** Tooltip and accessible name — the rail shows glyphs only. */
  readonly label: string;
}

export interface RailProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange"> {
  readonly items: readonly RailItem[];
  readonly onChange?: (id: string) => void;
  /** Slot above the items — conventionally a brand mark. */
  readonly top?: ReactNode;
  /** Active item id. */
  readonly value?: string;
}

/** 44px vertical icon rail; the active item inverts to ink. */
export const Rail = ({
  className,
  items,
  onChange,
  top,
  value,
  ...rest
}: RailProps) => (
  <nav className={cx("vk-rail", className)} {...rest}>
    {top === undefined ? null : <span className="vk-rail__mark">{top}</span>}
    {items.map((item) => (
      <button
        aria-current={value === item.id ? "page" : undefined}
        className={cx("vk-rail__btn", value === item.id && "is-on")}
        key={item.id}
        onClick={() => onChange?.(item.id)}
        title={item.label}
        type="button"
      >
        <Icon name={item.icon} size={15} />
        <span className="vk-sr-only">{item.label}</span>
      </button>
    ))}
  </nav>
);
