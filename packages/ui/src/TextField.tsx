import type { InputHTMLAttributes, ReactNode } from "react";
import { cx } from "./cx.js";

/** `compact` is the console density: 28px, square, micro mono label. */
export type FieldDensity = "comfortable" | "compact";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className"> {
  /** Wrapper class; the input itself is always `.vk-field__control`. */
  readonly className?: string;
  /** @default "comfortable" */
  readonly density?: FieldDensity;
  /** Shown in place of the hint, in danger red, and marks the control invalid. */
  readonly error?: ReactNode;
  /** Constraint or format note, e.g. "integer · schema 1–4". */
  readonly hint?: ReactNode;
  /** Required — a field with no label is a field nobody can describe. */
  readonly id: string;
  readonly label?: ReactNode;
}

/**
 * Labelled text input. Focus, disabled and invalid are CSS state rules rather
 * than React state, so the browser applies them and they survive being
 * rendered without JavaScript.
 */
export const TextField = ({
  className,
  density = "comfortable",
  error,
  hint,
  id,
  label,
  ...rest
}: TextFieldProps) => {
  const note = error ?? hint;
  const noteId = note === undefined ? undefined : `${id}-note`;
  return (
    <div
      className={cx(
        "vk-field",
        density === "compact" && "vk-field--compact",
        error !== undefined && "is-invalid",
        className
      )}
    >
      {label === undefined ? null : (
        <label className="vk-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      <input
        aria-describedby={noteId}
        aria-invalid={error === undefined ? undefined : true}
        className="vk-field__control"
        id={id}
        type="text"
        {...rest}
      />
      {note === undefined ? null : (
        <span className="vk-field__note" id={noteId}>
          {note}
        </span>
      )}
    </div>
  );
};
