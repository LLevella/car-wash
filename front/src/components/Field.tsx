import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type FieldBaseProps = {
  error?: string;
  hint?: string;
  label: string;
};

export function InputField({
  error,
  hint,
  label,
  ...props
}: FieldBaseProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input className="field__control" {...props} />
      <FieldMeta error={error} hint={hint} />
    </label>
  );
}

export function SelectField({
  children,
  error,
  hint,
  label,
  ...props
}: FieldBaseProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    children: ReactNode;
  }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <select className="field__control" {...props}>
        {children}
      </select>
      <FieldMeta error={error} hint={hint} />
    </label>
  );
}

export function TextAreaField({
  error,
  hint,
  label,
  ...props
}: FieldBaseProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <textarea className="field__control field__control--textarea" {...props} />
      <FieldMeta error={error} hint={hint} />
    </label>
  );
}

function FieldMeta({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return <span className="field__error">{error}</span>;
  }

  if (hint) {
    return <span className="field__hint">{hint}</span>;
  }

  return null;
}
