import {
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import {
  BlankSlate,
  Button,
  Corroboration,
  cx,
  FilterChip,
  IconButton,
  MeterBar,
  Toolbar,
} from "@viokit/ui";
import { useMemo, useState } from "react";
import type { RelationRow, TableMode } from "../case-columns.js";
import {
  columnsFor,
  identifierCells,
  imageColumns,
  isImageValue,
  kindTabs,
  modeKey,
  relationRows,
  rowsForMode,
} from "../case-columns.js";
import type {
  CaseFilter,
  CaseRow,
  CaseSummary,
  CurationState,
} from "../case-table.js";
import { matches } from "../case-table.js";
import type { GraphSnapshot } from "../graph-layout.js";

/**
 * The case as a table, in three states: everything, one entity kind, or the
 * relations between them.
 *
 * Narrowing to a kind is what makes per-kind columns possible. A mixed table
 * can only show what every entity has — kind, value, source — whereas a table
 * of one kind can show that kind's own fields, derived from the identifiers
 * its entities actually carry. Nothing is registered per kind; a pack decides
 * a kind's columns by choosing what it attaches (see `case-columns.ts`).
 *
 * Sorting comes from TanStack Table v9, which is headless: it owns the row
 * model, this file owns every element, class and ARIA attribute. That is the
 * same division the design system draws, so the two compose without either
 * knowing about the other.
 */

const FEATURES = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});

const entityHelper = createColumnHelper<typeof FEATURES, CaseRow>();
const relationHelper = createColumnHelper<typeof FEATURES, RelationRow>();

const FILTERS: readonly CaseFilter[] = [
  "all",
  "new",
  "kept",
  "deferred",
  "discarded",
];

/** Curation actions, in the order an analyst reaches for them. */
const ACTIONS: readonly {
  readonly icon: "check" | "clock" | "x";
  readonly label: string;
  readonly state: CurationState;
}[] = [
  { icon: "check", label: "keep", state: "kept" },
  { icon: "clock", label: "defer", state: "deferred" },
  { icon: "x", label: "discard", state: "discarded" },
];

/** Which columns read as numeric, and so right-align. */
const NUMERIC = new Set(["degree", "seenAt"]);

const ARIA_SORT: Record<string, "ascending" | "descending"> = {
  asc: "ascending",
  desc: "descending",
};

const Swatch = ({
  kind,
  slots,
}: {
  readonly kind: string;
  readonly slots: ReadonlyMap<string, number>;
}) => (
  <span
    className={`vk-legend__swatch vk-node--cat-${(slots.get(kind) ?? 0) + 1}`}
  />
);

const Sources = ({ row }: { readonly row: CaseRow }) => {
  if (row.sources.length === 0) {
    // Derived from graph state rather than acquired: I7 says record nothing
    // rather than invent an origin.
    return <span className="vk-dim">—</span>;
  }
  return (
    <>
      {row.sources[0]}
      {row.sources.length > 1 ? (
        <span className="vk-overflow-count">+{row.sources.length - 1}</span>
      ) : null}
    </>
  );
};

/**
 * A header that sorts. The control is a button inside the th rather than a
 * handler on the th, so it is focusable and announced; `aria-sort` on the th
 * is what a screen reader actually reads for sort state.
 */
// biome-ignore lint/suspicious/noExplicitAny: v9 header types are deeply generic over the feature set
const SortableHeader = ({ header }: { readonly header: any }) => {
  const sorted = header.column.getIsSorted();
  return (
    <th
      aria-sort={sorted === false ? undefined : ARIA_SORT[sorted]}
      className={cx(NUMERIC.has(header.column.id) && "vk-num")}
    >
      {header.isPlaceholder ? null : (
        <button
          className="vk-grid__sort"
          onClick={header.column.getToggleSortingHandler()}
          type="button"
        >
          {header.column.columnDef.header as string}
        </button>
      )}
    </th>
  );
};

/** The columns every entity has, whatever kind it is. */
const commonColumns = (
  slots: ReadonlyMap<string, number>,
  maxDegree: number,
  showKind: boolean
) => [
  ...(showKind
    ? [
        entityHelper.accessor("kind", {
          cell: ({ row }) => (
            <span className="kind">
              <Swatch kind={row.original.kind} slots={slots} />
              {row.original.kind}
            </span>
          ),
          header: "kind",
        }),
      ]
    : []),
  entityHelper.accessor("value", {
    cell: ({ row }) => (
      <>
        {row.original.value}
        <Corroboration
          count={row.original.corroboration}
          sources={row.original.sources}
        />
      </>
    ),
    header: "value",
  }),
  entityHelper.accessor((row) => row.sources[0] ?? "", {
    cell: ({ row }) => <Sources row={row.original} />,
    header: "source",
    id: "source",
  }),
  entityHelper.accessor("degree", {
    cell: ({ row }) => (
      <MeterBar value={maxDegree === 0 ? 0 : row.original.degree / maxDegree}>
        <span className="vk-mono">{row.original.degree}</span>
      </MeterBar>
    ),
    header: "links",
  }),
  entityHelper.accessor("seenAt", {
    cell: ({ row }) => `#${row.original.seenAt + 1}`,
    header: "step",
  }),
];

/**
 * One column per identifier kind the shown entities carry. This is the whole
 * "a kind provides its own columns" mechanism: no registry, no per-kind code —
 * a pack that attaches `{kind: "photo", value: <url>}` gets a photo column,
 * and it renders as a thumbnail because the *value* is an image.
 */
const identifierColumns = (
  columns: readonly string[],
  images: ReadonlySet<string>
) =>
  columns.map((column) =>
    entityHelper.accessor((row) => identifierCells(row)[column]?.value ?? "", {
      cell: ({ row }) => {
        const cell = identifierCells(row.original)[column];
        if (cell === undefined) {
          return <span className="vk-dim">—</span>;
        }
        return (
          <span className="idcell">
            {images.has(column) ? (
              <img
                alt=""
                className="vk-thumb"
                height={22}
                loading="lazy"
                src={cell.value}
                width={22}
              />
            ) : null}
            <span className="vk-truncate">{cell.value}</span>
            {cell.extra > 0 ? (
              <span className="vk-overflow-count">+{cell.extra}</span>
            ) : null}
          </span>
        );
      },
      header: column,
      id: `id:${column}`,
    })
  );

const RELATION_COLUMNS = relationHelper.columns([
  relationHelper.accessor("sourceValue", { header: "from" }),
  relationHelper.accessor("type", {
    cell: ({ row }) => <span className="vk-mono">{row.original.type}</span>,
    header: "relation",
  }),
  relationHelper.accessor("targetValue", { header: "to" }),
  relationHelper.accessor("targetKind", {
    cell: ({ row }) => (
      <span className="vk-mono vk-dim">{row.original.targetKind}</span>
    ),
    header: "to kind",
  }),
]);

const RelationTable = ({
  onSelect,
  rows,
  selectedId,
}: {
  readonly onSelect: (id: string | null) => void;
  readonly rows: readonly RelationRow[];
  readonly selectedId: string | null;
}) => {
  const data = useMemo(() => [...rows], [rows]);
  const table = useTable({
    columns: RELATION_COLUMNS,
    data,
    features: FEATURES,
  });
  return (
    <table className="vk-grid">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            {group.headers.map((header) => (
              <SortableHeader header={header} key={header.id} />
            ))}
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            className={cx(
              row.original.sourceId === selectedId && "is-selected",
              row.original.state === "discarded" && "is-muted"
            )}
            key={row.id}
            onClick={() => onSelect(row.original.sourceId)}
          >
            {row.getAllCells().map((cell) => (
              <td key={cell.id}>
                <table.FlexRender cell={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const Gallery = ({
  column,
  onSelect,
  rows,
  selectedId,
}: {
  readonly column: string;
  readonly onSelect: (id: string | null) => void;
  readonly rows: readonly CaseRow[];
  readonly selectedId: string | null;
}) => (
  <div className="vk-gallery">
    {rows.map((row) => {
      const cell = identifierCells(row)[column];
      return (
        <button
          className={cx(
            "vk-tile",
            row.id === selectedId && "is-selected",
            row.state === "discarded" && "vk-tile--discarded"
          )}
          key={row.id}
          onClick={() => onSelect(row.id)}
          type="button"
        >
          {cell !== undefined && isImageValue(cell.value) ? (
            <img
              alt={row.value}
              className="vk-tile__image"
              height={132}
              loading="lazy"
              src={cell.value}
              width={132}
            />
          ) : (
            <span className="vk-tile__image" />
          )}
          <span className="vk-tile__caption">
            <span className="vk-tile__label">{row.value}</span>
            <span className="vk-micro vk-dim">{row.sources[0] ?? "—"}</span>
          </span>
        </button>
      );
    })}
  </div>
);

const EntityTable = ({
  images,
  onCurate,
  onSelect,
  rows,
  selectedId,
  showKind,
  slots,
}: {
  readonly images: ReadonlySet<string>;
  readonly onCurate: (id: string, state: CurationState) => void;
  readonly onSelect: (id: string | null) => void;
  readonly rows: readonly CaseRow[];
  readonly selectedId: string | null;
  readonly showKind: boolean;
  readonly slots: ReadonlyMap<string, number>;
}) => {
  const data = useMemo(() => [...rows], [rows]);
  const maxDegree = data.reduce((most, row) => Math.max(most, row.degree), 0);
  const idColumns = useMemo(() => columnsFor(data), [data]);
  const columns = useMemo(
    () =>
      entityHelper.columns([
        ...commonColumns(slots, maxDegree, showKind),
        // A mixed table can only honestly show what every entity has; the
        // per-kind columns appear once the table is narrowed to one kind.
        ...identifierColumns(showKind ? [] : idColumns, images),
      ]),
    [idColumns, images, maxDegree, showKind, slots]
  );
  const table = useTable({ columns, data, features: FEATURES });

  return (
    <table className="vk-grid">
      <thead>
        {table.getHeaderGroups().map((group) => (
          <tr key={group.id}>
            <th className="vk-grid__col-state" />
            {group.headers.map((header) => (
              <SortableHeader header={header} key={header.id} />
            ))}
            <th className="vk-grid__col-actions" />
          </tr>
        ))}
      </thead>
      <tbody>
        {table.getRowModel().rows.map((row) => (
          <tr
            className={cx(
              row.original.id === selectedId && "is-selected",
              row.original.fresh && "is-fresh"
            )}
            key={row.id}
            onClick={() => onSelect(row.original.id)}
          >
            <td className="vk-grid__col-state">
              <i
                className={`vk-state vk-state--${row.original.state}`}
                title={row.original.state}
              />
            </td>
            {row.getAllCells().map((cell) => (
              <td
                className={cx(NUMERIC.has(cell.column.id) && "vk-num")}
                key={cell.id}
              >
                <table.FlexRender cell={cell} />
              </td>
            ))}
            <td className="vk-grid__col-actions">
              <span className="vk-grid__actions">
                {ACTIONS.map((action) => (
                  <IconButton
                    key={action.state}
                    label={
                      // Clicking the decision a row already carries undoes it,
                      // so a mis-click costs one click, not a judgement.
                      row.original.state === action.state
                        ? `undo ${action.label}`
                        : action.label
                    }
                    name={action.icon}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCurate(
                        row.original.id,
                        row.original.state === action.state
                          ? "new"
                          : action.state
                      );
                    }}
                  />
                ))}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

/** Which of the three surfaces to draw. */
const CaseBody = ({
  filter,
  gallery,
  imageColumn,
  images,
  mode,
  onCurate,
  onSelect,
  relations,
  rows,
  selectedId,
  slots,
  total,
}: {
  readonly filter: CaseFilter;
  readonly gallery: boolean;
  readonly imageColumn: string | undefined;
  readonly images: ReadonlySet<string>;
  readonly mode: TableMode;
  readonly onCurate: (id: string, state: CurationState) => void;
  readonly onSelect: (id: string | null) => void;
  readonly relations: readonly RelationRow[];
  readonly rows: readonly CaseRow[];
  readonly selectedId: string | null;
  readonly slots: ReadonlyMap<string, number>;
  readonly total: number;
}) => {
  if (mode._tag === "relations") {
    if (relations.length === 0) {
      return (
        <BlankSlate note="no relations yet — a transform that links two entities will put them here" />
      );
    }
    return (
      <RelationTable
        onSelect={onSelect}
        rows={relations}
        selectedId={selectedId}
      />
    );
  }
  if (rows.length === 0) {
    return (
      <BlankSlate
        note={
          total === 0
            ? "nothing in the case yet — expand a node to put something here"
            : `nothing here is ${filter}`
        }
      />
    );
  }
  if (gallery && imageColumn !== undefined) {
    return (
      <Gallery
        column={imageColumn}
        onSelect={onSelect}
        rows={rows}
        selectedId={selectedId}
      />
    );
  }
  return (
    <EntityTable
      images={images}
      key={modeKey(mode)}
      onCurate={onCurate}
      onSelect={onSelect}
      rows={rows}
      selectedId={selectedId}
      showKind={mode._tag === "all"}
      slots={slots}
    />
  );
};

export const CaseTable = ({
  filter,
  graph,
  onCurate,
  onFilter,
  onSelect,
  rows,
  selectedId,
  slots,
  summary,
}: {
  readonly filter: CaseFilter;
  readonly graph: GraphSnapshot;
  readonly onCurate: (id: string, state: CurationState) => void;
  readonly onFilter: (filter: CaseFilter) => void;
  readonly onSelect: (id: string | null) => void;
  readonly rows: readonly CaseRow[];
  readonly selectedId: string | null;
  readonly slots: ReadonlyMap<string, number>;
  readonly summary: CaseSummary;
}) => {
  const [mode, setMode] = useState<TableMode>({ _tag: "all" });
  const [gallery, setGallery] = useState(false);

  const tabs = useMemo(() => kindTabs(rows), [rows]);
  // A kind that no longer exists must not leave the table showing nothing.
  const live: TableMode =
    mode._tag === "kind" && !tabs.some((tab) => tab.kind === mode.kind)
      ? { _tag: "all" }
      : mode;

  const shown = useMemo(
    () => rowsForMode(rows, live).filter((row) => matches(row, filter)),
    [filter, live, rows]
  );
  const images = useMemo(
    () => new Set(imageColumns(shown, columnsFor(shown))),
    [shown]
  );
  const relations = useMemo(
    () => (live._tag === "relations" ? relationRows(graph, rows) : []),
    [graph, live, rows]
  );

  const canGallery = live._tag === "kind" && images.size > 0;
  const imageColumn = canGallery ? [...images][0] : undefined;

  return (
    <>
      <Toolbar
        right={
          live._tag === "relations"
            ? `${relations.length} relations`
            : `${shown.length} of ${summary.total} · ${summary.unreviewed} unreviewed`
        }
      >
        <FilterChip
          on={live._tag === "all"}
          onClick={() => setMode({ _tag: "all" })}
        >
          all {summary.total}
        </FilterChip>
        {tabs.map((tab) => (
          <FilterChip
            key={tab.kind}
            on={live._tag === "kind" && live.kind === tab.kind}
            onClick={() => setMode({ _tag: "kind", kind: tab.kind })}
          >
            {tab.kind} {tab.count}
          </FilterChip>
        ))}
        <FilterChip
          on={live._tag === "relations"}
          onClick={() => setMode({ _tag: "relations" })}
        >
          relations {graph.relations.length}
        </FilterChip>
      </Toolbar>

      {live._tag === "relations" ? null : (
        <Toolbar>
          {FILTERS.map((one) => (
            <FilterChip
              key={one}
              on={filter === one}
              onClick={() => onFilter(one)}
            >
              {one}
            </FilterChip>
          ))}
          {canGallery ? (
            <>
              <span className="vk-spacer" />
              <Button
                on={gallery}
                onClick={() => setGallery((was) => !was)}
                tone="quiet"
              >
                gallery
              </Button>
            </>
          ) : null}
        </Toolbar>
      )}

      <CaseBody
        filter={filter}
        gallery={gallery}
        imageColumn={imageColumn}
        images={images}
        mode={live}
        onCurate={onCurate}
        onSelect={onSelect}
        relations={relations}
        rows={shown}
        selectedId={selectedId}
        slots={slots}
        total={rows.length}
      />
    </>
  );
};
