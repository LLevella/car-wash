import type { PaymentStatus } from "../api/types";

const labels: Record<PaymentStatus, string> = {
  awaiting: "Ожидает оплаты",
  paid: "Оплачено",
  refunded: "Возврат",
  unpaid: "Не оплачено",
};

const tones: Record<PaymentStatus, string> = {
  awaiting: "warning",
  paid: "success",
  refunded: "info",
  unpaid: "muted",
};

export function PaymentBadge({ status }: { status: PaymentStatus | undefined }) {
  if (!status) {
    return null;
  }

  return (
    <span
      className={`payment-badge payment-badge--${tones[status]}`}
      data-testid="payment-badge"
    >
      {labels[status]}
    </span>
  );
}
