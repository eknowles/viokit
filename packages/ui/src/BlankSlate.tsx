import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";

export interface BlankSlateProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly icon?: GlyphName;
  /**
   * Why the pane is empty. Fill this in: an empty pane with no explanation is
   * indistinguishable from a broken one.
   */
  readonly note?: ReactNode;
  readonly title?: ReactNode;
}

export const BlankSlate = ({
  className,
  icon,
  note,
  title,
  ...rest
}: BlankSlateProps) => (
  <div className={cx("vk-blank-slate", className)} {...rest}>
    {icon === undefined ? null : <Icon name={icon} size={20} />}
    {title === undefined ? null : (
      <p className="vk-blank-slate__title">{title}</p>
    )}
    {note === undefined ? null : (
      <span className="vk-blank-slate__note vk-micro vk-dim">{note}</span>
    )}
  </div>
);
