import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";

export interface RailItem {
  /** Keyboard shortcut, shown in the tooltip. Teaching it is the point. */
  readonly hint?: string;
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

/**
 * 44px vertical icon rail; the active item inverts to ink.
 *
 * The rail shows glyphs only, so every item carries a tooltip that appears on
 * hover *and on keyboard focus* — a `title` attribute does neither usefully:
 * it waits about a second, never fires for a keyboard user, and cannot show a
 * shortcut. Six unlabelled glyphs is a lot to ask someone to memorise, so the
 * rail teaches its own shortcuts rather than hiding them in documentation.
 */
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
        // The accessible name lives here rather than in the tooltip, so the
        // tooltip is free to be decoration and the button is named either way.
        aria-label={
          item.hint === undefined ? item.label : `${item.label} (${item.hint})`
        }
        className={cx("vk-rail__btn", value === item.id && "is-on")}
        key={item.id}
        onClick={() => onChange?.(item.id)}
        type="button"
      >
        <Icon name={item.icon} size={15} />
        <span aria-hidden="true" className="vk-rail__tip">
          {item.label}
          {item.hint === undefined ? null : (
            <kbd className="vk-rail__key">{item.hint}</kbd>
          )}
        </span>
      </button>
    ))}
  </nav>
);
