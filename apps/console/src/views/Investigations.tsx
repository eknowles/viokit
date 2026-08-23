import { useCallback, useEffect, useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";

/**
 * The case the console is working in (TDR-025).
 *
 * Lives in the header rather than in a view, because it is not something you
 * look at — it is the scope everything else is answering under, and an
 * investigator who cannot see which case they are in at a glance will
 * eventually record work in the wrong one.
 */

export interface Investigation {
  readonly forkedAt?: number;
  readonly id: string;
  readonly name: string;
  readonly parent?: string;
  readonly status: "open" | "discarded";
}

const describe = (investigation: Investigation): string =>
  investigation.parent === undefined
    ? investigation.name
    : `${investigation.name} (branch)`;

export const InvestigationBar = ({
  client,
  onChange,
}: {
  readonly client: Client;
  /** Raised after the open case changes, so views re-read under the new scope. */
  readonly onChange: () => void;
}) => {
  const [all, setAll] = useState<readonly Investigation[]>([]);
  const [open, setOpen] = useState<Investigation | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Naming happens inline rather than in a browser dialog: a modal prompt
  // interrupts, and the name of a case is worth a moment's thought.
  const [naming, setNaming] = useState<"new" | "branch" | null>(null);
  const [draft, setDraft] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [list, current] = await Promise.all([
        client.call("investigations") as Promise<readonly Investigation[]>,
        client.call("current_investigation") as Promise<Investigation>,
      ]);
      setAll(list);
      setOpen(current);
      setProblem(null);
    } catch (cause) {
      setProblem(
        cause instanceof OperationFailure ? cause.message : String(cause)
      );
    }
  }, [client]);

  useEffect(() => {
    refresh().catch(() => undefined);
  }, [refresh]);

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await refresh();
      onChange();
      setProblem(null);
    } catch (cause) {
      setProblem(
        cause instanceof OperationFailure ? cause.message : String(cause)
      );
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (id: string) =>
    act(() => client.call("open_investigation", { id }));

  const startNaming = (mode: "new" | "branch") => {
    setNaming(mode);
    setDraft(
      mode === "branch" && open !== null ? `${open.name} — hypothesis` : ""
    );
  };

  const submitName = () => {
    const name = draft.trim();
    if (name === "" || open === null) {
      return;
    }
    setNaming(null);
    const made =
      naming === "branch"
        ? () => client.call("fork_investigation", { from: open.id, name })
        : () => client.call("create_investigation", { name });
    act(async () => {
      const investigation = (await made()) as Investigation;
      // Creating and opening are separate acts on the engine; from here they
      // are one gesture, because nobody names a case in order not to use it.
      await client.call("open_investigation", { id: investigation.id });
    }).catch(() => undefined);
  };

  return (
    <div className="investigations">
      <label htmlFor="investigation">Case</label>
      <select
        disabled={busy || open === null}
        id="investigation"
        onChange={(event) => {
          switchTo(event.target.value).catch(() => undefined);
        }}
        value={open?.id ?? ""}
      >
        {all
          .filter((one) => one.status === "open" || one.id === open?.id)
          .map((one) => (
            <option key={one.id} value={one.id}>
              {describe(one)}
              {one.status === "discarded" ? " · discarded" : ""}
            </option>
          ))}
      </select>
      {naming === null ? (
        <>
          <button
            disabled={busy}
            onClick={() => startNaming("new")}
            type="button"
          >
            New
          </button>
          <button
            disabled={busy || open === null}
            onClick={() => startNaming("branch")}
            title="Work a hypothesis without disturbing this case"
            type="button"
          >
            Branch
          </button>
        </>
      ) : (
        <>
          <input
            aria-label={naming === "branch" ? "Branch name" : "Case name"}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                submitName();
              }
              if (event.key === "Escape") {
                setNaming(null);
              }
            }}
            placeholder={naming === "branch" ? "branch name" : "case name"}
            value={draft}
          />
          <button disabled={busy} onClick={submitName} type="button">
            {naming === "branch" ? "Branch" : "Create"}
          </button>
          <button onClick={() => setNaming(null)} type="button">
            Cancel
          </button>
        </>
      )}
      {problem === null ? null : <span className="error">{problem}</span>}
    </div>
  );
};
