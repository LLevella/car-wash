import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { forwardRef } from "react";

type FieldBaseProps = {
  error?: string;
  hint?: string;
  label: string;
};

export const InputField = forwardRef<
  HTMLInputElement,
  FieldBaseProps & InputHTMLAttributes<HTMLInputElement>
>(function InputField({ error, hint, label, ...props }, ref) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__control" ref={ref} {...props} />
      <FieldMeta error={error} hint={hint} />
    </label>
  );
});

export const SelectField = forwardRef<
  HTMLSelectElement,
  FieldBaseProps &
    SelectHTMLAttributes<HTMLSelectElement> & {
      children: ReactNode;
    }
>(function SelectField({ children, error, hint, label, ...props }, ref) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="field__control" ref={ref} {...props}>
        {children}
      </select>
      <FieldMeta error={error} hint={hint} />
    </label>
  );
});

export const TextAreaField = forwardRef<
  HTMLTextAreaElement,
  FieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextAreaField({ error, hint, label, ...props }, ref) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea
        className="field__control field__control--textarea"
        ref={ref}
        {...props}
      />
      <FieldMeta error={error} hint={hint} />
    </label>
  );
});

function FieldMeta({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return <span className="field__error">{error}</span>;
  }

  if (hint) {
    return <span className="field__hint">{hint}</span>;
  }

  return null;
}
