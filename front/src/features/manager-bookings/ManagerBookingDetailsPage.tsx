import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { ensureCsrfCookie } from "../../api/auth";
import { getStations, getWashTypes } from "../../api/dictionaries";
import {
  assignBooking,
  getManagerBooking,
  getManagerBookingAudit,
  getManagerSchedule,
  updateManagerBookingStatus,
} from "../../api/manager";
import type {
  AuditAction,
  AuditEvent,
  Booking,
  BookingStatus,
  Station,
  WashType,
} from "../../api/types";
import { Button } from "../../components/Button";
import { PaymentBadge } from "../../components/PaymentBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { AssignmentModal } from "./AssignmentModal";

type TFn = (key: string, options?: Record<string, unknown>) => string;

const statusOptions: BookingStatus[] = [
  "draft",
  "pending",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
];

const auditActionOptions: Array<AuditAction | "all"> = [
  "all",
  "booking_created",
  "booking_rescheduled",
  "booking_cancelled",
  "booking_status_changed",
  "booking_assigned",
];

export function ManagerBookingDetailsPage() {
  const { t } = useTranslation();
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
  const numericBookingId = bookingId ? Number(bookingId) : null;
  const bookingQuery = useQuery({
    queryKey: ["manager", "booking", numericBookingId],
    queryFn: () => getManagerBooking(numericBookingId as number),
    enabled: typeof numericBookingId === "number" && !Number.isNaN(numericBookingId),
  });
  const booking = bookingQuery.data;
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
        throw new Error(t("managerBookings.notFound"));
      }

      await ensureCsrfCookie();
      return updateManagerBookingStatus(booking.id, nextStatus);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["manager", "booking"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
    },
  });
  const assignMutation = useMutation({
    mutationFn: async (payload: { washBox: number | null; washers: number[] }) => {
      if (!booking) {
        throw new Error(t("managerBookings.notFound"));
      }

      await ensureCsrfCookie();
      return assignBooking(booking.id, {
        wash_box: payload.washBox,
        washers: payload.washers,
      });
    },
    onSuccess: () => {
      setAssigningBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["manager", "booking"] });
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
            <span>{t("managerBookings.backToList")}</span>
          </Link>
        }
        title={
          booking
            ? t("managerBookings.orderTitle", { id: booking.id })
            : t("managerBookings.detailsFallback")
        }
      />
      {bookingQuery.isLoading ? (
        <div className="panel state-panel">{t("managerBookings.loading")}</div>
      ) : null}
      {bookingQuery.isError ? (
        <div className="panel state-panel">{t("managerBookings.loadFailed")}</div>
      ) : null}
      {!bookingQuery.isLoading && !bookingQuery.isError && !booking ? (
        <div className="panel state-panel">{t("managerBookings.notFound")}</div>
      ) : null}
      {booking ? (
        <article className="panel booking-detail">
          <div className="booking-detail__header">
            <div>
              <h2>{stationName(stations, booking.wash_station, t)}</h2>
              <p>{washTypeName(washTypes, booking.wash_type, t)}</p>
            </div>
            <StatusBadge status={booking.status} />
          </div>
          <dl className="booking-detail__grid">
            <div>
              <dt>{t("common.fields.client")}</dt>
              <dd>{t("managerBookings.client", { id: booking.customer })}</dd>
            </div>
            <div>
              <dt>{t("common.fields.car")}</dt>
              <dd>{t("managerBookings.carPlaceholder", { id: booking.car })}</dd>
            </div>
            <div>
              <dt>{t("common.fields.date")}</dt>
              <dd>{formatDate(booking.starts_at)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.time")}</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.box")}</dt>
              <dd>{boxName(boxes, booking.wash_box, t)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.washers")}</dt>
              <dd>{washerNames(booking, t)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.cost")}</dt>
              <dd>{formatMoney(booking.cost)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.downPayment")}</dt>
              <dd>
                {formatMoney(booking.down_payment)}{" "}
                <PaymentBadge status={booking.payment_status} />
              </dd>
            </div>
            <div>
              <dt>{t("common.fields.residual")}</dt>
              <dd>{formatMoney(booking.residual)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.status")}</dt>
              <dd>
                <select
                  aria-label={t("common.fields.status")}
                  className="inline-select"
                  disabled={statusMutation.isPending}
                  onChange={(event) =>
                    statusMutation.mutate(event.target.value as BookingStatus)
                  }
                  value={booking.status}
                >
                  {statusOptions.map((status) => (
                    <option key={status} value={status}>
                      {t(`bookingStatus.${status}` as const)}
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
              {t("managerBookings.assign")}
            </Button>
          </div>
        </article>
      ) : null}
      {booking ? <AuditHistoryPanel bookingId={booking.id} /> : null}
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

function AuditHistoryPanel({ bookingId }: { bookingId: number }) {
  const { t } = useTranslation();
  const [actionFilter, setActionFilter] = useState<AuditAction | "all">("all");
  const auditQuery = useQuery({
    queryKey: ["manager", "booking-audit", bookingId],
    queryFn: () => getManagerBookingAudit(bookingId),
  });

  const events = useMemo(() => {
    const list = auditQuery.data ?? [];
    if (actionFilter === "all") {
      return list;
    }

    return list.filter((event) => event.action === actionFilter);
  }, [auditQuery.data, actionFilter]);

  return (
    <section
      aria-label={t("managerBookings.audit.title")}
      className="panel audit-history"
    >
      <header className="audit-history__header">
        <h3>{t("managerBookings.audit.title")}</h3>
        <label className="audit-history__filter">
          <span>{t("managerBookings.audit.filterLabel")}</span>
          <select
            onChange={(event) =>
              setActionFilter(event.target.value as AuditAction | "all")
            }
            value={actionFilter}
          >
            {auditActionOptions.map((option) => (
              <option key={option} value={option}>
                {t(`auditAction.${option}` as const)}
              </option>
            ))}
          </select>
        </label>
      </header>
      {auditQuery.isLoading ? (
        <div className="state-panel">{t("managerBookings.audit.loading")}</div>
      ) : null}
      {auditQuery.isError ? (
        <div className="state-panel">{t("managerBookings.audit.loadFailed")}</div>
      ) : null}
      {!auditQuery.isLoading && events.length === 0 ? (
        <div className="state-panel">{t("managerBookings.audit.empty")}</div>
      ) : null}
      {events.length ? (
        <ol className="audit-history__list">
          {events.map((event) => (
            <li className="audit-history__item" key={event.id}>
              <header>
                <strong>{t(`auditAction.${event.action}` as const)}</strong>
                <time dateTime={event.created_at}>
                  {formatDateTime(event.created_at)}
                </time>
              </header>
              <small>
                {event.actor_username
                  ? t("managerBookings.audit.actorLabel", {
                      name: event.actor_username,
                    })
                  : t("managerBookings.audit.actorSystem")}
              </small>
              <ContextSummary event={event} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function ContextSummary({ event }: { event: AuditEvent }) {
  const { t } = useTranslation();
  if (!event.context || Object.keys(event.context).length === 0) {
    return null;
  }

  if (
    event.action === "booking_status_changed" &&
    typeof event.context.previous_status === "string" &&
    typeof event.context.status === "string"
  ) {
    return (
      <span>
        {t(`bookingStatus.${event.context.previous_status as BookingStatus}` as const)}{" "}
        → {t(`bookingStatus.${event.context.status as BookingStatus}` as const)}
      </span>
    );
  }

  if (
    event.action === "booking_rescheduled" &&
    typeof event.context.previous_starts_at === "string" &&
    typeof event.context.starts_at === "string"
  ) {
    return (
      <span>
        {formatDateTime(event.context.previous_starts_at as string)} →{" "}
        {formatDateTime(event.context.starts_at as string)}
      </span>
    );
  }

  return null;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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

function stationName(stations: Station[], stationId: number, t: TFn) {
  return (
    stations.find((station) => station.id === stationId)?.name ??
    `${t("common.fields.station")} #${stationId}`
  );
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
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
