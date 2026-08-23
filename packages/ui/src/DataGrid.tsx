import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";
import { type CurationState, StateStripe } from "./Indicators.js";

/** The minimum a grid needs to key, stripe and flash a row. */
export interface DataGridRow {
  /** One-off arrival flash — set when the row has just streamed in. */
  readonly fresh?: boolean;
  readonly id: string;
  readonly state?: CurationState;
}

export interface DataGridColumn<Row extends DataGridRow> {
  /** Right-align numerics. @default "left" */
  readonly align?: "left" | "right";
  /** Dim tier. */
  readonly dim?: boolean;
  readonly key: string;
  /** Lower-case header; rendered uppercase. */
  readonly label?: ReactNode;
  /** Tabular mono. */
  readonly mono?: boolean;
  /** Cell renderer; defaults to the row's own value at `key`. */
  readonly render?: (row: Row) => ReactNode;
  /** 500 weight — the row's identifying value. */
  readonly strong?: boolean;
  readonly width?: number | string;
}

/**
 * Fallback cell content when a column has no renderer. Only primitives are
 * rendered: anything else is a shape the caller meant to format, and printing
 * "[object Object]" into a table helps nobody.
 */
const fallbackCell = (row: DataGridRow, key: string): ReactNode => {
  const value = (row as unknown as Record<string, unknown>)[key];
  if (typeof value === "string" || typeof value === "number") {
    return value;
  }
  return null;
};

export interface DataGridProps<Row extends DataGridRow>
  extends Omit<HTMLAttributes<HTMLTableElement>, "onSelect"> {
  /** Trailing action cell, revealed on hover, selection or focus. */
  readonly actions?: (row: Row) => ReactNode;
  readonly columns: readonly DataGridColumn<Row>[];
  readonly onSelect?: (id: string) => void;
  readonly rows: readonly Row[];
  readonly selectedId?: string | null;
  /** Leading curation stripe column. */
  readonly stripe?: boolean;
}

/** 24px sticky header, 28px rows, tabular numerals, hairline rules, no zebra. */
export const DataGrid = <Row extends DataGridRow>({
  actions,
  className,
  columns,
  onSelect,
  rows,
  selectedId = null,
  stripe = false,
  ...rest
}: DataGridProps<Row>) => (
  <table className={cx("vk-grid", className)} {...rest}>
    <thead>
      <tr>
        {stripe ? <th className="vk-grid__col-state" /> : null}
        {columns.map((column) => (
          <th
            className={cx(column.align === "right" && "vk-num")}
            key={column.key}
            style={
              column.width === undefined ? undefined : { width: column.width }
            }
          >
            {column.label ?? column.key}
          </th>
        ))}
        {actions === undefined ? null : <th className="vk-grid__col-actions" />}
      </tr>
    </thead>
    <tbody>
      {rows.map((row) => (
        <tr
          className={cx(
            selectedId === row.id && "is-selected",
            row.fresh === true && "is-fresh"
          )}
          key={row.id}
          onClick={onSelect === undefined ? undefined : () => onSelect(row.id)}
        >
          {stripe ? (
            <td className="vk-grid__col-state">
              <StateStripe state={row.state ?? "new"} />
            </td>
          ) : null}
          {columns.map((column) => (
            <td
              className={cx(
                column.align === "right" && "vk-num",
                column.mono === true && "vk-mono",
                column.strong === true && "vk-val",
                column.dim === true && "vk-dim"
              )}
              key={column.key}
            >
              {column.render === undefined
                ? fallbackCell(row, column.key)
                : column.render(row)}
            </td>
          ))}
          {actions === undefined ? null : (
            <td className="vk-grid__col-actions">
              <span className="vk-grid__actions">{actions(row)}</span>
            </td>
          )}
        </tr>
      ))}
    </tbody>
  </table>
);
