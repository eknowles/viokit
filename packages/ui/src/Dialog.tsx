import {
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type ReactNode,
  useEffect,
} from "react";
import { IconButton } from "./Button.js";
import { cx } from "./cx.js";
import type { GlyphName } from "./glyphs.js";
import { Icon } from "./Icon.js";

export interface DialogProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  readonly children?: ReactNode;
  /** Dim mono note beside the title. */
  readonly meta?: ReactNode;
  /** Fires on scrim click, the close control and Escape. */
  readonly onClose?: () => void;
  /** @default true */
  readonly open?: boolean;
  readonly title?: ReactNode;
  /** Dialog width in px. @default 600 */
  readonly width?: number;
}

/** Modal over an ink scrim — square, hairline, 32px mono header. */
export const Dialog = ({
  children,
  className,
  meta,
  onClose,
  open = true,
  style,
  title,
  width,
  ...rest
}: DialogProps) => {
  // Escape is bound to the document, not to the dialog: a modal that only
  // closes when something inside it happens to hold focus is a trap.
  useEffect(() => {
    if (!open || onClose === undefined) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  if (!open) {
    return null;
  }
  return (
    <div className="vk-scrim">
      {/* The click-away target is a real button rather than a handler on the
          scrim div, so it is announced, focusable and keyboard-operable. */}
      {onClose === undefined ? null : (
        <button
          aria-label="Close"
          className="vk-scrim__dismiss"
          onClick={onClose}
          tabIndex={-1}
          type="button"
        />
      )}
      <div
        aria-modal="true"
        className={cx("vk-dialog", className)}
        role="dialog"
        style={
          width === undefined
            ? style
            : ({ ...style, "--vk-dialog-w": `${width}px` } as Record<
                string,
                string
              >)
        }
        {...rest}
      >
        <div className="vk-dialog__head">
          <span className="vk-micro">{title}</span>
          {meta === undefined ? null : (
            <span className="vk-micro vk-dim">{meta}</span>
          )}
          <span className="vk-spacer" />
          {onClose === undefined ? null : (
            <IconButton label="Close" name="x" onClick={onClose} />
          )}
        </div>
        {children}
      </div>
    </div>
  );
};

export type DialogBodyProps = HTMLAttributes<HTMLDivElement>;

/** Two-column dialog body: a picker on the left, a form on the right. */
export const DialogBody = ({ className, ...rest }: DialogBodyProps) => (
  <div className={cx("vk-dialog__body", className)} {...rest} />
);

export type DialogFormProps = HTMLAttributes<HTMLDivElement>;

export const DialogForm = ({ className, ...rest }: DialogFormProps) => (
  <div className={cx("vk-dialog__form", className)} {...rest} />
);

export type PickerProps = HTMLAttributes<HTMLDivElement>;

/** Vertical list of things to pick one of — transforms, sources, presets. */
export const Picker = ({ className, ...rest }: PickerProps) => (
  <div className={cx("vk-picker", className)} {...rest} />
);

export interface PickerItemProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly children?: ReactNode;
  readonly icon?: GlyphName;
  readonly on?: boolean;
}

export const PickerItem = ({
  children,
  className,
  icon,
  on = false,
  type = "button",
  ...rest
}: PickerItemProps) => (
  <button
    aria-pressed={on}
    className={cx("vk-picker__item", on && "is-on", className)}
    type={type}
    {...rest}
  >
    {icon === undefined ? null : <Icon name={icon} size={13} />}
    {children}
  </button>
);
