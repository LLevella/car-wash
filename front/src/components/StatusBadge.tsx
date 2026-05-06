import type { BookingStatus } from "../api/types";

const statusLabels: Record<BookingStatus, string> = {
  draft: "Черновик",
  pending: "Ожидает",
  confirmed: "Подтверждена",
  in_progress: "В работе",
  completed: "Завершена",
  cancelled: "Отменена",
  no_show: "Не приехал",
};

export function StatusBadge({ status }: { status: BookingStatus }) {
  return (
    <span className={`status status--${status}`} data-testid="status-badge">
      {statusLabels[status]}
    </span>
  );
}
