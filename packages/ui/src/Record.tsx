import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

export interface EntityRecordProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /** Curation controls, right-aligned in the header. */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  /** Mono type/kind shown beside the title. */
  readonly kind?: ReactNode;
  readonly title?: ReactNode;
}

/** Entity detail: header with curation actions, then fields and evidence. */
export const EntityRecord = ({
  actions,
  children,
  className,
  kind,
  title,
  ...rest
}: EntityRecordProps) => (
  <div className={cx("vk-record", className)} {...rest}>
    <div className="vk-record__head">
      <span className="vk-record__title">{title}</span>
      {kind === undefined ? null : (
        <span className="vk-micro vk-dim">{kind}</span>
      )}
      <span className="vk-spacer" />
      {actions}
    </div>
    {children}
  </div>
);

export interface FieldListProps extends HTMLAttributes<HTMLDListElement> {
  /** [label, value] pairs. Labels render as micro mono. */
  readonly fields: readonly (readonly [ReactNode, ReactNode])[];
  /** Label column width in px. @default 104 */
  readonly labelWidth?: number;
}

/** Key/value record rows, 24px each, hairline-separated. */
export const FieldList = ({
  className,
  fields,
  labelWidth,
  style,
  ...rest
}: FieldListProps) => (
  <dl
    className={cx("vk-fields", className)}
    style={
      labelWidth === undefined
        ? style
        : ({
            ...style,
            "--vk-fields-label-w": `${labelWidth}px`,
          } as Record<string, string>)
    }
    {...rest}
  >
    {fields.map(([label, value], index) => (
      // display:contents on the wrapper, so the dt/dd still land directly in
      // the two-column grid. A <div> around a dt/dd pair is valid inside <dl>,
      // and labels are ReactNode, so the index is the only key always available.
      <div className="vk-fields__pair" key={index}>
        <dt className="vk-micro vk-dim">{label}</dt>
        <dd>{value}</dd>
      </div>
    ))}
  </dl>
);

export interface EvidenceBlockProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly children?: ReactNode;
  /** The stored-artifact line, e.g. "artifact stored · hash 8812f0…c4a1". */
  readonly seal?: ReactNode;
  /** @default "evidence chain" */
  readonly title?: ReactNode;
}

/**
 * Where a claim came from. Bordered rather than inline because provenance is
 * the thing the whole product rests on and should not read as a footnote.
 */
export const EvidenceBlock = ({
  children,
  className,
  seal,
  title = "evidence chain",
  ...rest
}: EvidenceBlockProps) => (
  <div className={cx("vk-evidence", className)} {...rest}>
    <span className="vk-micro vk-dim">{title}</span>
    <p className="vk-evidence__body">{children}</p>
    {seal === undefined ? null : (
      <span className="vk-evidence__seal vk-micro">{seal}</span>
    )}
  </div>
);
