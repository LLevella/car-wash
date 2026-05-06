import type { ReactNode } from "react";
import { X } from "lucide-react";

import { Button } from "./Button";

type ModalProps = {
  children: ReactNode;
  onClose: () => void;
  open: boolean;
  title: string;
};

export function Modal({ children, onClose, open, title }: ModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div
      className="modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button className="modal__backdrop" type="button" onClick={onClose} />
      <section className="modal__panel">
        <header className="modal__header">
          <h2 id="modal-title">{title}</h2>
          <Button
            aria-label="Закрыть"
            icon={<X size={18} />}
            onClick={onClose}
            variant="ghost"
          />
        </header>
        {children}
      </section>
    </div>
  );
}
