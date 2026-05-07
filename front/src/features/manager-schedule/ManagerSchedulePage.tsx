import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ensureCsrfCookie } from "../../api/auth";
import { getWashTypes, getStations } from "../../api/dictionaries";
import { getManagerSchedule, updateManagerBookingStatus } from "../../api/manager";
import type {
  Booking,
  BookingStatus,
  ManagerScheduleDay,
  ResourceBlock,
  Station,
  WasherShift,
  WashType,
} from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";

const today = new Date().toISOString().slice(0, 10);
const scheduleHours = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
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

export function ManagerSchedulePage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
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

  const scheduleQuery = useQuery({
    queryKey: ["manager", "schedule", selectedStationId, date],
    queryFn: () =>
      getManagerSchedule({
        station: selectedStationId as number,
        date,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });

  const statusMutation = useMutation({
    mutationFn: async (payload: { bookingId: number; status: BookingStatus }) => {
      await ensureCsrfCookie();
      return updateManagerBookingStatus(payload.bookingId, payload.status);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });

  const schedule = scheduleQuery.data;
  const stations = stationsQuery.data ?? [];
  const washTypes = washTypesQuery.data ?? [];
  const hasSchedule = Boolean(schedule);

  return (
    <section className="page">
      <Toolbar
        actions={
          <>
            <Button icon={<Plus size={18} />} variant="secondary">
              Смена
            </Button>
            <Button
              icon={<RefreshCw size={18} />}
              onClick={() => void scheduleQuery.refetch()}
            >
              Обновить
            </Button>
          </>
        }
        title="Расписание"
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
      </Toolbar>
      {scheduleQuery.isLoading ? (
        <div className="panel state-panel">Загрузка расписания...</div>
      ) : null}
      {scheduleQuery.isError ? (
        <div className="panel state-panel">Не удалось загрузить расписание.</div>
      ) : null}
      {hasSchedule ? (
        <>
          <ScheduleGrid
            onStatusChange={(bookingId, status) =>
              statusMutation.mutate({ bookingId, status })
            }
            schedule={schedule as ManagerScheduleDay}
            statusPending={statusMutation.isPending}
            washTypes={washTypes}
          />
          <ScheduleResources
            blocks={(schedule as ManagerScheduleDay).resource_blocks}
            shifts={(schedule as ManagerScheduleDay).shifts}
          />
        </>
      ) : null}
    </section>
  );
}

function ScheduleGrid({
  onStatusChange,
  schedule,
  statusPending,
  washTypes,
}: {
  onStatusChange: (bookingId: number, status: BookingStatus) => void;
  schedule: ManagerScheduleDay;
  statusPending: boolean;
  washTypes: WashType[];
}) {
  const bookingsByBoxAndHour = useMemo(
    () => groupBookingsByBoxAndHour(schedule.bookings),
    [schedule.bookings],
  );

  return (
    <div className="schedule-wrap">
      <div className="schedule-grid" role="table" aria-label="Расписание боксов">
        <div className="schedule-grid__head" role="row">
          <div role="columnheader">Бокс</div>
          {scheduleHours.map((hour) => (
            <div key={hour} role="columnheader">
              {hour.toString().padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {schedule.boxes.map((box) => (
          <div className="schedule-grid__row" key={box.id} role="row">
            <div className="schedule-grid__box" role="rowheader">
              {box.name}
            </div>
            {scheduleHours.map((hour) => {
              const cellBookings =
                bookingsByBoxAndHour.get(cellKey(box.id, hour)) ?? [];

              return (
                <div className="schedule-cell" key={`${box.id}-${hour}`} role="cell">
                  {cellBookings.map((booking) => (
                    <article className="schedule-card" key={booking.id}>
                      <strong>Клиент #{booking.customer}</strong>
                      <span>{washTypeName(washTypes, booking.wash_type)}</span>
                      <small>
                        {formatTimeRange(booking.starts_at, booking.ends_at)}
                      </small>
                      <small>{washerNames(booking)}</small>
                      <StatusBadge status={booking.status} />
                      <select
                        className="inline-select"
                        disabled={statusPending}
                        onChange={(event) =>
                          onStatusChange(
                            booking.id,
                            event.target.value as BookingStatus,
                          )
                        }
                        value={booking.status}
                      >
                        {statusOptions.map((status) => (
                          <option key={status} value={status}>
                            {statusLabels[status]}
                          </option>
                        ))}
                      </select>
                    </article>
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ScheduleResources({
  blocks,
  shifts,
}: {
  blocks: ResourceBlock[];
  shifts: WasherShift[];
}) {
  return (
    <section className="resource-strip" aria-label="Смены и блокировки">
      {shifts.map((shift) => (
        <article className="resource-strip__item" key={`shift-${shift.id}`}>
          <strong>{shift.washer_name}</strong>
          <span>{formatTimeRange(shift.starts_at, shift.ends_at)}</span>
        </article>
      ))}
      {blocks.map((block) => (
        <article className="resource-strip__item" key={`block-${block.id}`}>
          <strong>{block.reason || "Блокировка ресурса"}</strong>
          <span>{formatTimeRange(block.starts_at, block.ends_at)}</span>
        </article>
      ))}
      {!shifts.length && !blocks.length ? (
        <article className="resource-strip__item">
          <strong>Нет смен и блокировок</strong>
          <span>Для выбранной даты ресурсы не заведены.</span>
        </article>
      ) : null}
    </section>
  );
}

function groupBookingsByBoxAndHour(bookings: Booking[]) {
  const grouped = new Map<string, Booking[]>();

  for (const booking of bookings) {
    if (!booking.wash_box) {
      continue;
    }

    const hour = new Date(booking.starts_at).getHours();
    const key = cellKey(booking.wash_box, hour);
    grouped.set(key, [...(grouped.get(key) ?? []), booking]);
  }

  return grouped;
}

function cellKey(boxId: number, hour: number) {
  return `${boxId}:${hour}`;
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

function washerNames(booking: Booking) {
  return booking.washers.length
    ? booking.washers.map((washer) => washer.name).join(", ")
    : "Мойщик не назначен";
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
