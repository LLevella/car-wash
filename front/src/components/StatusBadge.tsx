import { useTranslation } from "react-i18next";

import type { BookingStatus } from "../api/types";

export function StatusBadge({ status }: { status: BookingStatus }) {
  const { t } = useTranslation();
  return (
    <span className={`status status--${status}`} data-testid="status-badge">
      {t(`bookingStatus.${status}` as const)}
    </span>
  );
}
