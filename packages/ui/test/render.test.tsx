import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AppShell,
  BlankSlate,
  Button,
  Corroboration,
  DataGrid,
  type DataGridColumn,
  Dialog,
  Icon,
  IconButton,
  JobItem,
  MeterBar,
  Pane,
  Rail,
  StatusLine,
  TextField,
  Toolbar,
  TopBar,
  Workspace,
} from "../src/index.js";

/**
 * These render the components to static markup and assert the class names they
 * emit. That is the whole contract: the styling lives in CSS, so what a
 * component owes its caller is the right classes on the right elements. A
 * snapshot of computed styles would test the browser, not this package.
 */

interface Row {
  readonly fresh?: boolean;
  readonly id: string;
  readonly rel: number;
  readonly state?: "deferred" | "discarded" | "kept" | "new";
  readonly value: string;
}

const ROWS: readonly Row[] = [
  { id: "c1", rel: 0.92, state: "kept", value: "Acme Intelligence Ltd" },
  { fresh: true, id: "c2", rel: 0.4, state: "new", value: "12 Bell Yard" },
];

const COLUMNS: readonly DataGridColumn<Row>[] = [
  { key: "value", label: "value", strong: true },
  {
    align: "right",
    key: "rel",
    label: "rel",
    render: (row) => row.rel.toFixed(2),
  },
];

describe("chrome", () => {
  it("nests the main column inside the shell so the tray has an anchor", () => {
    const html = renderToStaticMarkup(
      <AppShell
        rail={
          <Rail items={[{ icon: "map", id: "a", label: "Map" }]} value="a" />
        }
      >
        <TopBar title="viokit" />
      </AppShell>
    );
    expect(html).toContain('class="vk-app"');
    expect(html).toContain('class="vk-app__main"');
    expect(html).toContain('class="vk-rail__btn is-on"');
    // The rail is glyphs only, so each button needs a name beyond its tooltip.
    expect(html).toContain('class="vk-sr-only"');
  });

  it("drops the rail column when no rail is given", () => {
    const html = renderToStaticMarkup(<AppShell />);
    expect(html).toContain("vk-app--no-rail");
  });

  it("marks the status line idle when nothing is running", () => {
    expect(renderToStaticMarkup(<StatusLine>7 sources</StatusLine>)).toContain(
      "is-idle"
    );
    expect(
      renderToStaticMarkup(<StatusLine busy>2 running</StatusLine>)
    ).not.toContain("is-idle");
  });

  it("renders a pane head only when there is something to put in it", () => {
    expect(renderToStaticMarkup(<Pane title="log">x</Pane>)).toContain(
      "vk-pane__head"
    );
    expect(renderToStaticMarkup(<Pane>x</Pane>)).not.toContain("vk-pane__head");
  });

  it("lays the workspace out wide when the aside is dropped", () => {
    expect(renderToStaticMarkup(<Workspace wide />)).toContain(
      "vk-workspace--wide"
    );
  });
});

describe("data grid", () => {
  it("emits a stripe cell and an actions cell only when asked for them", () => {
    const plain = renderToStaticMarkup(
      <DataGrid columns={COLUMNS} rows={ROWS} />
    );
    expect(plain).not.toContain("vk-grid__col-state");
    expect(plain).not.toContain("vk-grid__col-actions");

    const full = renderToStaticMarkup(
      <DataGrid
        actions={() => <IconButton label="keep" name="check" />}
        columns={COLUMNS}
        rows={ROWS}
        selectedId="c1"
        stripe
      />
    );
    // One header cell plus one per row, for both the stripe and the actions.
    expect(full.split("vk-grid__col-state").length - 1).toBe(3);
    expect(full.split("vk-grid__col-actions").length - 1).toBe(3);
    expect(full).toContain("vk-state--kept");
    expect(full).toContain("is-selected");
    expect(full).toContain("is-fresh");
  });

  it("renders cell tiers from the column spec", () => {
    const html = renderToStaticMarkup(
      <DataGrid columns={COLUMNS} rows={ROWS} />
    );
    expect(html).toContain('class="vk-val"');
    expect(html).toContain('class="vk-num"');
    expect(html).toContain("0.92");
  });

  it("falls back to the row's own value when a column has no renderer", () => {
    const html = renderToStaticMarkup(
      <DataGrid columns={[{ key: "value" }]} rows={ROWS} />
    );
    expect(html).toContain("Acme Intelligence Ltd");
  });
});

describe("indicators", () => {
  it("clamps a meter to its track", () => {
    expect(renderToStaticMarkup(<MeterBar value={2} />)).toContain(
      "width:100%"
    );
    expect(renderToStaticMarkup(<MeterBar value={-1} />)).toContain("width:0%");
  });

  it("hides the corroboration badge below two independent returns", () => {
    expect(renderToStaticMarkup(<Corroboration count={1} />)).toBe("");
    expect(renderToStaticMarkup(<Corroboration count={3} />)).toContain("×3");
  });

  it("offers cancel only while a job can still be stopped", () => {
    const running = renderToStaticMarkup(
      <JobItem done={1} onCancel={() => undefined} state="running" total={4} />
    );
    expect(running).toContain("cancel");
    expect(running).toContain("vk-job--running");

    const done = renderToStaticMarkup(
      <JobItem done={4} onCancel={() => undefined} state="done" total={4} />
    );
    expect(done).not.toContain(">cancel<");
    expect(done).toContain("vk-progress--done");
  });
});

describe("controls", () => {
  it("defaults buttons to the line tone and marks quiet toggles pressed", () => {
    expect(renderToStaticMarkup(<Button>Run</Button>)).toContain(
      "vk-btn--line"
    );
    const toggle = renderToStaticMarkup(
      <Button on tone="quiet">
        Jobs
      </Button>
    );
    expect(toggle).toContain("vk-btn--quiet");
    expect(toggle).toContain("is-on");
    expect(toggle).toContain('aria-pressed="true"');
  });

  it("gives a glyph-only button an accessible name", () => {
    const html = renderToStaticMarkup(<IconButton label="Close" name="x" />);
    expect(html).toContain('aria-label="Close"');
  });

  it("wires a field's note to its input and marks it invalid on error", () => {
    const ok = renderToStaticMarkup(
      <TextField hint="integer · schema 1–4" id="depth" label="Max depth" />
    );
    expect(ok).toContain('aria-describedby="depth-note"');
    expect(ok).not.toContain("is-invalid");

    const bad = renderToStaticMarkup(
      <TextField error="must be 1–4" id="depth" label="Max depth" />
    );
    expect(bad).toContain("is-invalid");
    expect(bad).toContain('aria-invalid="true"');
    expect(bad).toContain("must be 1–4");
  });

  it("applies the console density as a modifier, not a different component", () => {
    expect(
      renderToStaticMarkup(
        <TextField density="compact" id="t" label="Target" />
      )
    ).toContain("vk-field--compact");
  });

  it("puts a summary on the right of a toolbar", () => {
    const html = renderToStaticMarkup(<Toolbar right="13 candidates" />);
    expect(html).toContain("vk-spacer");
    expect(html).toContain("13 candidates");
  });
});

describe("overlays and empty states", () => {
  it("renders nothing when closed and a real dismiss button when open", () => {
    expect(renderToStaticMarkup(<Dialog open={false} title="run" />)).toBe("");
    const html = renderToStaticMarkup(
      <Dialog onClose={() => undefined} title="run a transform" width={520} />
    );
    expect(html).toContain("vk-scrim__dismiss");
    expect(html).toContain('role="dialog"');
    expect(html).toContain("--vk-dialog-w:520px");
  });

  it("keeps the blank slate's note, because why it is empty is the content", () => {
    const html = renderToStaticMarkup(
      <BlankSlate icon="map" note="no map design exists upstream" title="Map" />
    );
    expect(html).toContain("vk-blank-slate__note");
    expect(html).toContain("no map design exists upstream");
  });

  it("renders a visible placeholder for an unknown glyph", () => {
    // Cast: the point of the test is what happens when a slug arrives from
    // data rather than from the literal union.
    const html = renderToStaticMarkup(<Icon name={"not-a-glyph" as "check"} />);
    expect(html).toContain("dashed");
    expect(html).not.toContain("<svg");
  });
});
