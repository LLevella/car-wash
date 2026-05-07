import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ensureCsrfCookie } from "../../api/auth";
import { getStations, getWashTypes } from "../../api/dictionaries";
import {
  getManagerBookings,
  getManagerSchedule,
  updateManagerBookingStatus,
} from "../../api/manager";
import type { Booking, BookingStatus, Station, WashType } from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";

type StatusFilter = BookingStatus | "all";

const today = new Date().toISOString().slice(0, 10);
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

export function ManagerBookingsPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [boxId, setBoxId] = useState<number | null>(null);
  const [washerId, setWasherId] = useState<number | null>(null);

  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
  });
  const washTypesQuery = useQuery({
    queryKey: ["dictionaries", "wash-types"],
    queryFn: getWashTypes,
  });

  useEffect(() => {
    if (!selectedStationId && stationsQuery.data?.length) {
      setSelectedStationId(stationsQuery.data[0].id);
    }
  }, [selectedStationId, stationsQuery.data]);

  useEffect(() => {
    setBoxId(null);
    setWasherId(null);
  }, [date, selectedStationId]);

  const scheduleQuery = useQuery({
    queryKey: ["manager", "schedule", selectedStationId, date],
    queryFn: () =>
      getManagerSchedule({
        station: selectedStationId as number,
        date,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });

  const bookingsQuery = useQuery({
    queryKey: ["manager", "bookings", selectedStationId, date, status, boxId, washerId],
    queryFn: () =>
      getManagerBookings({
        box: boxId ?? undefined,
        date,
        station: selectedStationId ?? undefined,
        status: status === "all" ? undefined : status,
        washer: washerId ?? undefined,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { bookingId: number; status: BookingStatus }) => {
      await ensureCsrfCookie();
      return updateManagerBookingStatus(payload.bookingId, payload.status);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["manager", "bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const stations = stationsQuery.data ?? [];
  const washTypes = washTypesQuery.data ?? [];
  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const boxes = scheduleQuery.data?.boxes ?? [];
  const washers = useMemo(
    () => uniqueWashers(scheduleQuery.data?.shifts ?? [], bookings),
    [bookings, scheduleQuery.data?.shifts],
  );

  return (
    <section className="page">
      <Toolbar
        actions={
          <>
            <Button
              icon={<Search size={18} />}
              onClick={() => void bookingsQuery.refetch()}
              variant="secondary"
            >
              Найти
            </Button>
            <Button
              icon={<RefreshCw size={18} />}
              onClick={() => {
                void bookingsQuery.refetch();
                void scheduleQuery.refetch();
              }}
            >
              Обновить
            </Button>
          </>
        }
        title="Заказы"
      >
        <SelectField
          disabled={stationsQuery.isLoading}
          label="Станция"
          onChange={(event) => setSelectedStationId(Number(event.target.value))}
          value={selectedStationId ?? ""}
        >
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {stationLabel(station)}
            </option>
          ))}
        </SelectField>
        <InputField
          label="Дата"
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
        <SelectField
          label="Статус"
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          value={status}
        >
          <option value="all">Все</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {statusLabels[option]}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={scheduleQuery.isLoading}
          label="Бокс"
          onChange={(event) =>
            setBoxId(event.target.value ? Number(event.target.value) : null)
          }
          value={boxId ?? ""}
        >
          <option value="">Все</option>
          {boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={scheduleQuery.isLoading}
          label="Мойщик"
          onChange={(event) =>
            setWasherId(event.target.value ? Number(event.target.value) : null)
          }
          value={washerId ?? ""}
        >
          <option value="">Все</option>
          {washers.map((washer) => (
            <option key={washer.id} value={washer.id}>
              {washer.name}
            </option>
          ))}
        </SelectField>
      </Toolbar>
      {bookingsQuery.isLoading ? (
        <div className="panel state-panel">Загрузка заказов...</div>
      ) : null}
      {bookingsQuery.isError ? (
        <div className="panel state-panel">Не удалось загрузить заказы.</div>
      ) : null}
      {!bookingsQuery.isLoading && bookings.length === 0 ? (
        <div className="panel state-panel">Заказов по фильтрам нет.</div>
      ) : null}
      {bookings.length ? (
        <BookingsTable
          bookings={bookings}
          boxes={boxes}
          onStatusChange={(bookingId, nextStatus) =>
            statusMutation.mutate({ bookingId, status: nextStatus })
          }
          statusPending={statusMutation.isPending}
          washTypes={washTypes}
        />
      ) : null}
    </section>
  );
}

function BookingsTable({
  bookings,
  boxes,
  onStatusChange,
  statusPending,
  washTypes,
}: {
  bookings: Booking[];
  boxes: Array<{ id: number; name: string }>;
  onStatusChange: (bookingId: number, status: BookingStatus) => void;
  statusPending: boolean;
  washTypes: WashType[];
}) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>Клиент</th>
            <th>Время</th>
            <th>Услуга</th>
            <th>Бокс</th>
            <th>Мойщик</th>
            <th>Статус</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>Клиент #{booking.customer}</td>
              <td>{formatTimeRange(booking.starts_at, booking.ends_at)}</td>
              <td>{washTypeName(washTypes, booking.wash_type)}</td>
              <td>{boxName(boxes, booking.wash_box)}</td>
              <td>{washerNames(booking)}</td>
              <td>
                <div className="status-control">
                  <StatusBadge status={booking.status} />
                  <select
                    className="inline-select"
                    disabled={statusPending}
                    onChange={(event) =>
                      onStatusChange(booking.id, event.target.value as BookingStatus)
                    }
                    value={booking.status}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {statusLabels[option]}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
              <td>{formatMoney(booking.cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function stationLabel(station: Station) {
  return station.address ? `${station.name}, ${station.address}` : station.name;
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
