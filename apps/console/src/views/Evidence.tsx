import { Button, TextField } from "@viokit/ui";
import { useState } from "react";
import type { Client } from "../client.js";
import { OperationFailure } from "../client.js";

interface Stored {
  readonly acquisitionPath: { readonly _tag: string; readonly by?: string };
  readonly id: string;
}

const toBase64 = (value: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(value)));

/**
 * Submit an artifact retrieved by hand. This is how a login-walled or
 * browser-only source gets used at all: a person fetches it, and the bytes
 * enter the evidence store recorded as manually acquired, with a retriever
 * (I9). The returned id is what a step is attributed to (I2).
 */
export const EvidenceView = ({ client }: { readonly client: Client }) => {
  const [by, setBy] = useState("");
  const [ref, setRef] = useState("");
  const [contentType, setContentType] = useState("text/plain");
  const [content, setContent] = useState("");
  const [stored, setStored] = useState<Stored | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const submit = () => {
    setPending(true);
    setError(null);
    setStored(null);
    client
      .call("ingest", {
        by,
        content: toBase64(content),
        contentType,
        ...(ref === "" ? {} : { ref }),
      })
      .then((result) => setStored(result as Stored))
      .catch((cause: unknown) =>
        setError(
          cause instanceof OperationFailure ? cause.message : String(cause)
        )
      )
      .finally(() => setPending(false));
  };

  return (
    <div className="form">
      <p className="hint">
        For sources the engine cannot fetch. Retrieve the artifact yourself and
        submit it here; it is stored as manually acquired, attributed to you.
      </p>
      <TextField
        density="compact"
        hint="required — the person who fetched it"
        id="by"
        label="retrieved by"
        onChange={(e) => setBy(e.target.value)}
        value={by}
      />
      <TextField
        density="compact"
        id="ref"
        label="origin"
        onChange={(e) => setRef(e.target.value)}
        placeholder="https://…"
        value={ref}
      />
      <TextField
        density="compact"
        id="content-type"
        label="content type"
        onChange={(e) => setContentType(e.target.value)}
        value={contentType}
      />
      <label htmlFor="content">
        <span className="label">content</span>
        <textarea
          id="content"
          onChange={(e) => setContent(e.target.value)}
          rows={8}
          value={content}
        />
      </label>
      <Button
        disabled={pending || by === "" || content === ""}
        onClick={submit}
        tone="ink"
      >
        {pending ? "Submitting…" : "Submit as evidence"}
      </Button>
      {error === null ? null : <p className="error">{error}</p>}
      {stored === null ? null : (
        <p className="ok">
          Stored <code>{stored.id}</code> — {stored.acquisitionPath._tag}, by{" "}
          {stored.acquisitionPath.by}. Attribute steps to this id.
        </p>
      )}
    </div>
  );
};
