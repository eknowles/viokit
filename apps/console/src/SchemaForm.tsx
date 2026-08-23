import { useState } from "react";
import type { Field, FormShape } from "./form.js";
import { valuesToArgs } from "./form.js";

/**
 * Renders a derived form, or raw JSON entry when the contract could not be
 * derived (TDR-008). Custom components register by transform id and take
 * precedence — the escape hatch for inputs that want a map picker or a date
 * range rather than a text field.
 */

export type CustomForm = (props: {
  readonly onSubmit: (args: Record<string, unknown>) => void;
  readonly pending: boolean;
}) => React.ReactNode;

const customForms = new Map<string, CustomForm>();

export const registerCustomForm = (transformId: string, form: CustomForm) => {
  customForms.set(transformId, form);
};

const FieldInput = ({
  field,
  onChange,
  value,
}: {
  readonly field: Field;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) => {
  if (field.kind === "enum") {
    return (
      <select onChange={(e) => onChange(e.target.value)} value={value}>
        <option value="">—</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "boolean") {
    return (
      <select onChange={(e) => onChange(e.target.value)} value={value}>
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }
  return (
    <input
      onChange={(e) => onChange(e.target.value)}
      type={field.kind === "number" ? "number" : "text"}
      value={value}
    />
  );
};

export const SchemaForm = ({
  onSubmit,
  pending,
  shape,
  transformId,
}: {
  readonly onSubmit: (args: Record<string, unknown>) => void;
  readonly pending: boolean;
  readonly shape: FormShape;
  readonly transformId: string;
}) => {
  const [values, setValues] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("{}");
  const [rawError, setRawError] = useState<string | null>(null);

  const custom = customForms.get(transformId);
  if (custom !== undefined) {
    return <>{custom({ onSubmit, pending })}</>;
  }

  if (shape._tag === "raw") {
    return (
      <div className="form">
        <p className="hint">
          No field-level form for this contract ({shape.reason}). Enter the
          input directly.
        </p>
        <textarea
          onChange={(e) => setRaw(e.target.value)}
          rows={6}
          value={raw}
        />
        {rawError === null ? null : <p className="error">{rawError}</p>}
        <button
          disabled={pending}
          onClick={() => {
            try {
              const parsed: unknown = JSON.parse(raw);
              setRawError(null);
              onSubmit(
                typeof parsed === "object" && parsed !== null
                  ? (parsed as Record<string, unknown>)
                  : {}
              );
            } catch (cause) {
              setRawError(
                cause instanceof Error ? cause.message : String(cause)
              );
            }
          }}
          type="button"
        >
          {pending ? "Running…" : "Run"}
        </button>
      </div>
    );
  }

  return (
    <div className="form">
      {shape.fields.map((field) => (
        <label htmlFor={`field-${field.name}`} key={field.name}>
          <span className="label">
            {field.name}
            {field.required ? <em className="required"> required</em> : null}
          </span>
          <FieldInput
            field={field}
            onChange={(next) =>
              setValues((current) => ({ ...current, [field.name]: next }))
            }
            value={values[field.name] ?? ""}
          />
          {field.description === undefined ? null : (
            <span className="hint">{field.description}</span>
          )}
        </label>
      ))}
      <button
        disabled={pending}
        onClick={() => onSubmit(valuesToArgs(shape.fields, values))}
        type="button"
      >
        {pending ? "Running…" : "Run"}
      </button>
    </div>
  );
};
