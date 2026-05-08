import { useTranslation } from "react-i18next";

import type { PaymentStatus } from "../api/types";

const tones: Record<PaymentStatus, string> = {
  awaiting: "warning",
  paid: "success",
  refunded: "info",
  unpaid: "muted",
};

export function PaymentBadge({ status }: { status: PaymentStatus | undefined }) {
  const { t } = useTranslation();
  if (!status) {
    return null;
  }

  return (
    <span
      className={`payment-badge payment-badge--${tones[status]}`}
      data-testid="payment-badge"
    >
      {t(`paymentStatus.${status}` as const)}
    </span>
  );
}
