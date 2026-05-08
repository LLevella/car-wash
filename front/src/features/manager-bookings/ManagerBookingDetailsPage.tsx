import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ensureCsrfCookie } from "../../api/auth";
import { getStations, getWashTypes } from "../../api/dictionaries";
import {
  assignBooking,
  getManagerBookings,
  getManagerSchedule,
  updateManagerBookingStatus,
} from "../../api/manager";
import type { Booking, BookingStatus, Station, WashType } from "../../api/types";
import { Button } from "../../components/Button";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { AssignmentModal } from "./AssignmentModal";

const statusOptions: BookingStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

const statusLabels: Record<BookingStatus, string> = {
  cancelled: "Отменена",
  completed: "Завершена",
  confirmed: "Подтверждена",
  draft: "Черновик",
  in_progress: "В работе",
  no_show: "Не приехал",
  pending: "Ожидает",
};

export function ManagerBookingDetailsPage() {
  const { bookingId } = useParams();
  const queryClient = useQueryClient();
  const [assigningBooking, setAssigningBooking] = useState<Booking | null>(null);

  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
  });
  const washTypesQuery = useQuery({
    queryKey: ["dictionaries", "wash-types"],
    queryFn: getWashTypes,
  });
  const bookingsQuery = useQuery({
    queryKey: ["manager", "bookings", "details"],
    queryFn: () => getManagerBookings(),
  });
  const booking = useMemo(
    () =>
      (bookingsQuery.data ?? []).find(
        (candidate) => String(candidate.id) === bookingId,
      ),
    [bookingId, bookingsQuery.data],
  );
  const scheduleDate = booking?.starts_at.slice(0, 10);
  const scheduleQuery = useQuery({
    queryKey: ["manager", "schedule", booking?.wash_station, scheduleDate],
    queryFn: () =>
      getManagerSchedule({
        date: scheduleDate as string,
        station: booking?.wash_station as number,
      }),
    enabled: Boolean(booking?.wash_station) && Boolean(scheduleDate),
  });

  const statusMutation = useMutation({
    mutationFn: async (nextStatus: BookingStatus) => {
      if (!booking) {
        throw new Error("Заказ не найден.");
      }

      await ensureCsrfCookie();
      return updateManagerBookingStatus(booking.id, nextStatus);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["manager", "bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
  const assignMutation = useMutation({
    mutationFn: async (payload: { washBox: number | null; washers: number[] }) => {
      if (!booking) {
        throw new Error("Заказ не найден.");
      }

      await ensureCsrfCookie();
      return assignBooking(booking.id, {
        wash_box: payload.washBox,
        washers: payload.washers,
      });
    },
    onSuccess: () => {
      setAssigningBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["manager", "bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const stations = stationsQuery.data ?? [];
  const washTypes = washTypesQuery.data ?? [];
  const boxes = scheduleQuery.data?.boxes ?? [];
  const washers = useMemo(
    () => uniqueWashers(scheduleQuery.data?.shifts ?? [], booking ? [booking] : []),
    [booking, scheduleQuery.data?.shifts],
  );
  const statusError =
    statusMutation.error instanceof Error ? statusMutation.error.message : null;
  const assignError =
    assignMutation.error instanceof Error ? assignMutation.error.message : null;

  function closeAssignModal() {
    if (assignMutation.isPending) {
      return;
    }

    assignMutation.reset();
    setAssigningBooking(null);
  }

  return (
    <section className="page">
      <Toolbar
        actions={
          <Link className="button button--secondary" to="/manager/bookings">
            <ArrowLeft size={18} />
            <span>К заказам</span>
          </Link>
        }
        title={booking ? `Заказ #${booking.id}` : "Детали заказа"}
      />
      {bookingsQuery.isLoading ? (
        <div className="panel state-panel">Загрузка заказа...</div>
      ) : null}
      {bookingsQuery.isError ? (
        <div className="panel state-panel">Не удалось загрузить заказ.</div>
      ) : null}
      {!bookingsQuery.isLoading && !bookingsQuery.isError && !booking ? (
        <div className="panel state-panel">Заказ не найден.</div>
      ) : null}
      {booking ? (
        <article className="panel booking-detail">
          <div className="booking-detail__header">
            <div>
              <h2>{stationName(stations, booking.wash_station)}</h2>
              <p>{washTypeName(washTypes, booking.wash_type)}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="booking-detail__grid">
            <div>
              <dt>Клиент</dt>
              <dd>Клиент #{booking.customer}</dd>
            </div>
            <div>
              <dt>Автомобиль</dt>
              <dd>Авто #{booking.car}</dd>
            </div>
            <div>
              <dt>Дата</dt>
              <dd>{formatDate(booking.starts_at)}</dd>
            </div>
            <div>
              <dt>Время</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div>
              <dt>Бокс</dt>
              <dd>{boxName(boxes, booking.wash_box)}</dd>
            </div>
            <div>
              <dt>Мойщики</dt>
              <dd>{washerNames(booking)}</dd>
            </div>
            <div>
              <dt>Стоимость</dt>
              <dd>{formatMoney(booking.cost)}</dd>
            </div>
            <div>
              <dt>Аванс</dt>
              <dd>{formatMoney(booking.down_payment)}</dd>
            </div>
            <div>
              <dt>Остаток</dt>
              <dd>{formatMoney(booking.residual)}</dd>
            </div>
            <div>
              <dt>Статус</dt>
              <dd>
                <select
                  className="inline-select"
                  disabled={statusMutation.isPending}
                  onChange={(event) =>
                    statusMutation.mutate(event.target.value as BookingStatus)
                  }
                  value={booking.status}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {statusLabels[status]}
                    </option>
                  ))}
                </select>
              </dd>
            </div>
          </dl>
          {statusError ? <div className="field__error">{statusError}</div> : null}
          <div className="booking-detail__actions">
            <Button
              icon={<UserCheck size={18} />}
              onClick={() => {
                assignMutation.reset();
                setAssigningBooking(booking);
              }}
              variant="secondary"
            >
              Назначить
            </Button>
          </div>
        </article>
      ) : null}
      <AssignmentModal
        booking={assigningBooking}
        boxes={boxes}
        error={assignError}
        onClose={closeAssignModal}
        onSubmit={(payload) => assignMutation.mutate(payload)}
        pending={assignMutation.isPending}
        washers={washers}
      />
    </section>
  );
}

function uniqueWashers(
  shifts: Array<{ washer: number; washer_name: string }>,
  bookings: Booking[],
) {
  const washers = new Map<number, string>();

  for (const shift of shifts) {
    washers.set(shift.washer, shift.washer_name);
  }

  for (const booking of bookings) {
    for (const washer of booking.washers) {
      washers.set(washer.id, washer.name);
    }
  }

  return Array.from(washers, ([id, name]) => ({ id, name })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
}

function stationName(stations: Station[], stationId: number) {
  return (
    stations.find((station) => station.id === stationId)?.name ?? `Станция ${stationId}`
  );
}

function washTypeName(washTypes: WashType[], washTypeId: number) {
  return (
    washTypes.find((washType) => washType.id === washTypeId)?.name ??
    `Услуга ${washTypeId}`
  );
}

function boxName(boxes: Array<{ id: number; name: string }>, boxId: number | null) {
  if (!boxId) {
    return "Не назначен";
  }

  return boxes.find((box) => box.id === boxId)?.name ?? `Бокс ${boxId}`;
}

function washerNames(booking: Booking) {
  return booking.washers.length
    ? booking.washers.map((washer) => washer.name).join(", ")
    : "Не назначен";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)}-${formatTime(endsAt)}`;
}

function formatMoney(value: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return value;
  }

  return new Intl.NumberFormat("ru-RU", {
    currency: "RUB",
    style: "currency",
  }).format(amount);
}
