import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, RefreshCw, Search, UserCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";

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
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { AssignmentModal } from "./AssignmentModal";

type StatusFilter = BookingStatus | "all";
type TFn = (key: string, options?: Record<string, unknown>) => string;

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

export function ManagerBookingsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [boxId, setBoxId] = useState<number | null>(null);
  const [washerId, setWasherId] = useState<number | null>(null);
  const [assigningBooking, setAssigningBooking] = useState<Booking | null>(null);

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
  const assignMutation = useMutation({
    mutationFn: async (payload: {
      bookingId: number;
      washBox: number | null;
      washers: number[];
    }) => {
      await ensureCsrfCookie();
      return assignBooking(payload.bookingId, {
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
  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const boxes = scheduleQuery.data?.boxes ?? [];
  const washers = useMemo(
    () => uniqueWashers(scheduleQuery.data?.shifts ?? [], bookings),
    [bookings, scheduleQuery.data?.shifts],
  );
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
          <>
            <Button
              icon={<Search size={18} />}
              onClick={() => void bookingsQuery.refetch()}
              variant="secondary"
            >
              {t("common.actions.refresh")}
            </Button>
            <Button
              icon={<RefreshCw size={18} />}
              onClick={() => {
                void bookingsQuery.refetch();
                void scheduleQuery.refetch();
              }}
            >
              {t("common.actions.refresh")}
            </Button>
          </>
        }
        title={t("managerBookings.title")}
      >
        <SelectField
          disabled={stationsQuery.isLoading}
          label={t("common.fields.station")}
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
          label={t("common.fields.date")}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
        <SelectField
          label={t("common.fields.status")}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          value={status}
        >
          <option value="all">{t("managerBookings.filters.any")}</option>
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {t(`bookingStatus.${option}` as const)}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={scheduleQuery.isLoading}
          label={t("common.fields.box")}
          onChange={(event) =>
            setBoxId(event.target.value ? Number(event.target.value) : null)
          }
          value={boxId ?? ""}
        >
          <option value="">{t("managerBookings.filters.any")}</option>
          {boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={scheduleQuery.isLoading}
          label={t("common.fields.washer")}
          onChange={(event) =>
            setWasherId(event.target.value ? Number(event.target.value) : null)
          }
          value={washerId ?? ""}
        >
          <option value="">{t("managerBookings.filters.any")}</option>
          {washers.map((washer) => (
            <option key={washer.id} value={washer.id}>
              {washer.name}
            </option>
          ))}
        </SelectField>
      </Toolbar>
      {bookingsQuery.isLoading ? (
        <div className="panel state-panel">{t("managerBookings.loading")}</div>
      ) : null}
      {bookingsQuery.isError ? (
        <div className="panel state-panel">{t("managerBookings.loadFailed")}</div>
      ) : null}
      {!bookingsQuery.isLoading && bookings.length === 0 ? (
        <div className="panel state-panel">{t("booking.filterEmpty")}</div>
      ) : null}
      {bookings.length ? (
        <BookingsTable
          bookings={bookings}
          boxes={boxes}
          onAssign={(booking) => {
            assignMutation.reset();
            setAssigningBooking(booking);
          }}
          onStatusChange={(bookingId, nextStatus) =>
            statusMutation.mutate({ bookingId, status: nextStatus })
          }
          statusPending={statusMutation.isPending}
          washTypes={washTypes}
        />
      ) : null}
      <AssignmentModal
        booking={assigningBooking}
        boxes={boxes}
        error={assignError}
        onClose={closeAssignModal}
        onSubmit={(payload) => {
          if (assigningBooking) {
            assignMutation.mutate({
              bookingId: assigningBooking.id,
              ...payload,
            });
          }
        }}
        pending={assignMutation.isPending}
        washers={washers}
      />
    </section>
  );
}

function BookingsTable({
  bookings,
  boxes,
  onAssign,
  onStatusChange,
  statusPending,
  washTypes,
}: {
  bookings: Booking[];
  boxes: Array<{ id: number; name: string }>;
  onAssign: (booking: Booking) => void;
  onStatusChange: (bookingId: number, status: BookingStatus) => void;
  statusPending: boolean;
  washTypes: WashType[];
}) {
  const { t } = useTranslation();
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t("common.fields.client")}</th>
            <th>{t("common.fields.time")}</th>
            <th>{t("common.fields.service")}</th>
            <th>{t("common.fields.box")}</th>
            <th>{t("common.fields.washer")}</th>
            <th>{t("common.fields.status")}</th>
            <th>{t("common.fields.cost")}</th>
            <th>{t("common.fields.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((booking) => (
            <tr key={booking.id}>
              <td>{t("managerBookings.client", { id: booking.customer })}</td>
              <td>{formatTimeRange(booking.starts_at, booking.ends_at)}</td>
              <td>{washTypeName(washTypes, booking.wash_type, t)}</td>
              <td>{boxName(boxes, booking.wash_box, t)}</td>
              <td>{washerNames(booking, t)}</td>
              <td>
                <div className="status-control">
                  <StatusBadge status={booking.status} />
                  <select
                    aria-label={t("common.fields.status")}
                    className="inline-select"
                    disabled={statusPending}
                    onChange={(event) =>
                      onStatusChange(booking.id, event.target.value as BookingStatus)
                    }
                    value={booking.status}
                  >
                    {statusOptions.map((option) => (
                      <option key={option} value={option}>
                        {t(`bookingStatus.${option}` as const)}
                      </option>
                    ))}
                  </select>
                </div>
              </td>
              <td>{formatMoney(booking.cost)}</td>
              <td>
                <div className="table-actions">
                  <Link
                    className="button button--secondary"
                    to={`/manager/bookings/${booking.id}`}
                  >
                    <Eye size={18} />
                    <span>{t("booking.details")}</span>
                  </Link>
                  <Button
                    icon={<UserCheck size={18} />}
                    onClick={() => onAssign(booking)}
                    variant="secondary"
                  >
                    {t("managerBookings.assign")}
                  </Button>
                </div>
              </td>
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

function washTypeName(washTypes: WashType[], washTypeId: number, t: TFn) {
  return (
    washTypes.find((washType) => washType.id === washTypeId)?.name ??
    `${t("common.fields.service")} #${washTypeId}`
  );
}

function boxName(
  boxes: Array<{ id: number; name: string }>,
  boxId: number | null,
  t: TFn,
) {
  if (!boxId) {
    return t("managerBookings.boxUnassigned");
  }

  return (
    boxes.find((box) => box.id === boxId)?.name ??
    t("managerBookings.boxFallback", { id: boxId })
  );
}

function washerNames(booking: Booking, t: TFn) {
  return booking.washers.length
    ? booking.washers.map((washer) => washer.name).join(", ")
    : t("managerBookings.washersUnassigned");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
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
