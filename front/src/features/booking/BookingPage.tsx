import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CalendarDays,
  Car as CarIcon,
  Check,
  Eye,
  RefreshCw,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";

import { ensureCsrfCookie } from "../../api/auth";
import {
  cancelBooking,
  createBooking,
  getAvailability,
  getBookings,
  rescheduleBooking,
} from "../../api/bookings";
import {
  getCurrentCustomer,
  getCustomerCars,
  getStations,
  getWashTypes,
} from "../../api/dictionaries";
import type {
  AvailabilitySlot,
  Booking,
  CurrentCustomer,
  CustomerCar,
  Station,
  WashType,
} from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { PaymentBadge } from "../../components/PaymentBadge";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { useCurrentUser } from "../auth/useAuth";

type BookingPageProps = {
  view?: "form" | "bookings" | "details";
};

type BookingFilter = "upcoming" | "past" | "cancelled";

const today = new Date().toISOString().slice(0, 10);

export function BookingPage({ view = "form" }: BookingPageProps) {
  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
  });
  const washTypesQuery = useQuery({
    queryKey: ["dictionaries", "wash-types"],
    queryFn: getWashTypes,
  });

  if (view === "bookings") {
    return (
      <CustomerBookingsView
        stations={stationsQuery.data ?? []}
        washTypes={washTypesQuery.data ?? []}
      />
    );
  }

  if (view === "details") {
    return (
      <CustomerBookingDetailsView
        stations={stationsQuery.data ?? []}
        washTypes={washTypesQuery.data ?? []}
      />
    );
  }

  return (
    <BookingForm
      stations={stationsQuery.data ?? []}
      stationsLoading={stationsQuery.isLoading}
      washTypes={washTypesQuery.data ?? []}
      washTypesLoading={washTypesQuery.isLoading}
    />
  );
}

function CustomerBookingsView({
  stations,
  washTypes,
}: {
  stations: Station[];
  washTypes: WashType[];
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<BookingFilter>("upcoming");
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const bookingsQuery = useQuery({
    queryKey: ["bookings", "customer"],
    queryFn: getBookings,
  });
  const carsQuery = useQuery({
    queryKey: ["customers", "cars"],
    queryFn: getCustomerCars,
  });
  const cancelMutation = useMutation({
    mutationFn: async (booking: Booking) => {
      if (!canChangeBooking(booking)) {
        throw new Error(t("booking.rescheduleCantCancel"));
      }

      await ensureCsrfCookie();
      return cancelBooking(booking.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const rescheduleMutation = useMutation({
    mutationFn: async ({
      booking,
      startsAt,
    }: {
      booking: Booking;
      startsAt: string;
    }) => {
      if (!canChangeBooking(booking)) {
        throw new Error(t("booking.rescheduleCantReschedule"));
      }

      await ensureCsrfCookie();
      return rescheduleBooking(booking.id, { starts_at: startsAt });
    },
    onSuccess: () => {
      setReschedulingBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const bookings = useMemo(
    () => filterBookings(bookingsQuery.data ?? [], filter),
    [bookingsQuery.data, filter],
  );
  const cars = carsQuery.data ?? [];
  const cancelError =
    cancelMutation.error instanceof Error ? cancelMutation.error.message : null;
  const rescheduleError =
    rescheduleMutation.error instanceof Error ? rescheduleMutation.error.message : null;

  function handleCancel(booking: Booking) {
    cancelMutation.reset();

    if (!window.confirm(t("booking.cancelConfirm"))) {
      return;
    }

    cancelMutation.mutate(booking);
  }

  function openRescheduleModal(booking: Booking) {
    rescheduleMutation.reset();
    setReschedulingBooking(booking);
  }

  function closeRescheduleModal() {
    if (rescheduleMutation.isPending) {
      return;
    }

    rescheduleMutation.reset();
    setReschedulingBooking(null);
  }

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => void bookingsQuery.refetch()}
            variant="secondary"
          >
            {t("common.actions.refresh")}
          </Button>
        }
        title={t("booking.myTitle")}
      >
        <SelectField
          label={t("common.fields.filter")}
          onChange={(event) => setFilter(event.target.value as BookingFilter)}
          value={filter}
        >
          <option value="upcoming">{t("booking.filters.upcoming")}</option>
          <option value="past">{t("booking.filters.past")}</option>
          <option value="cancelled">{t("booking.filters.cancelled")}</option>
        </SelectField>
      </Toolbar>
      <div className="booking-list">
        {bookingsQuery.isLoading ? (
          <div className="panel state-panel">{t("booking.loadingBookings")}</div>
        ) : null}
        {bookingsQuery.isError ? (
          <div className="panel state-panel">{t("booking.loadFailed")}</div>
        ) : null}
        {!bookingsQuery.isLoading && bookings.length === 0 ? (
          <div className="panel state-panel">{t("booking.filterEmpty")}</div>
        ) : null}
        {bookings.map((booking) => (
          <article className="booking-card" key={booking.id}>
            <div>
              <h2>{stationName(stations, booking.wash_station)}</h2>
              <p>{washTypeName(washTypes, booking.wash_type)}</p>
            </div>
            <StatusBadge status={booking.status} />
            <dl className="booking-card__meta">
              <div>
                <dt>{t("common.fields.date")}</dt>
                <dd>{formatDate(booking.starts_at)}</dd>
              </div>
              <div>
                <dt>{t("common.fields.time")}</dt>
                <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
              </div>
              <div>
                <dt>{t("common.fields.cost")}</dt>
                <dd>{formatMoney(booking.cost)}</dd>
              </div>
            </dl>
            <div className="booking-card__actions">
              <Link
                className="button button--secondary"
                to={`/my/bookings/${booking.id}`}
              >
                <Eye size={18} />
                <span>{t("booking.details")}</span>
              </Link>
              <Button
                disabled={
                  !canChangeBooking(booking) ||
                  carsQuery.isLoading ||
                  !bookingCar(cars, booking)
                }
                icon={<CalendarClock size={18} />}
                onClick={() => openRescheduleModal(booking)}
                variant="secondary"
              >
                {t("booking.reschedule")}
              </Button>
              <Button
                disabled={
                  !canChangeBooking(booking) ||
                  (cancelMutation.isPending &&
                    cancelMutation.variables?.id === booking.id)
                }
                icon={<Ban size={18} />}
                onClick={() => handleCancel(booking)}
                variant="danger"
              >
                {t("booking.cancel")}
              </Button>
            </div>
          </article>
        ))}
        {cancelError ? <div className="panel field__error">{cancelError}</div> : null}
      </div>
      <RescheduleModal
        booking={reschedulingBooking}
        cars={cars}
        error={rescheduleError}
        onClose={closeRescheduleModal}
        onSubmit={(startsAt) => {
          if (reschedulingBooking) {
            rescheduleMutation.mutate({ booking: reschedulingBooking, startsAt });
          }
        }}
        pending={rescheduleMutation.isPending}
        stations={stations}
        washTypes={washTypes}
      />
    </section>
  );
}

function CustomerBookingDetailsView({
  stations,
  washTypes,
}: {
  stations: Station[];
  washTypes: WashType[];
}) {
  const { t } = useTranslation();
  const { bookingId } = useParams();
  const queryClient = useQueryClient();
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const bookingsQuery = useQuery({
    queryKey: ["bookings", "customer"],
    queryFn: getBookings,
  });
  const carsQuery = useQuery({
    queryKey: ["customers", "cars"],
    queryFn: getCustomerCars,
  });
  const booking = useMemo(
    () =>
      (bookingsQuery.data ?? []).find(
        (candidate) => String(candidate.id) === bookingId,
      ),
    [bookingId, bookingsQuery.data],
  );
  const cars = carsQuery.data ?? [];
  const car = booking ? bookingCar(cars, booking) : undefined;
  const cancelMutation = useMutation({
    mutationFn: async (target: Booking) => {
      if (!canChangeBooking(target)) {
        throw new Error(t("booking.rescheduleCantCancel"));
      }

      await ensureCsrfCookie();
      return cancelBooking(target.id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const rescheduleMutation = useMutation({
    mutationFn: async ({ target, startsAt }: { target: Booking; startsAt: string }) => {
      if (!canChangeBooking(target)) {
        throw new Error(t("booking.rescheduleCantReschedule"));
      }

      await ensureCsrfCookie();
      return rescheduleBooking(target.id, { starts_at: startsAt });
    },
    onSuccess: () => {
      setReschedulingBooking(null);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });
  const cancelError =
    cancelMutation.error instanceof Error ? cancelMutation.error.message : null;
  const rescheduleError =
    rescheduleMutation.error instanceof Error ? rescheduleMutation.error.message : null;

  function handleCancel() {
    if (!booking) {
      return;
    }

    cancelMutation.reset();

    if (!window.confirm(t("booking.cancelConfirm"))) {
      return;
    }

    cancelMutation.mutate(booking);
  }

  function closeRescheduleModal() {
    if (rescheduleMutation.isPending) {
      return;
    }

    rescheduleMutation.reset();
    setReschedulingBooking(null);
  }

  return (
    <section className="page">
      <Toolbar
        actions={
          <Link className="button button--secondary" to="/my/bookings">
            <ArrowLeft size={18} />
            <span>{t("common.actions.back")}</span>
          </Link>
        }
        title={
          booking
            ? t("booking.detailsTitleWithId", { id: booking.id })
            : t("booking.detailsTitle")
        }
      />
      {bookingsQuery.isLoading ? (
        <div className="panel state-panel">{t("booking.loadingBooking")}</div>
      ) : null}
      {bookingsQuery.isError ? (
        <div className="panel state-panel">{t("booking.loadFailedBooking")}</div>
      ) : null}
      {!bookingsQuery.isLoading && !bookingsQuery.isError && !booking ? (
        <div className="panel state-panel">{t("booking.notFound")}</div>
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
              <dt>{t("common.fields.date")}</dt>
              <dd>{formatDate(booking.starts_at)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.time")}</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.car")}</dt>
              <dd>
                {car
                  ? `${car.number}, ${carTypeName(car)}`
                  : t("managerBookings.carPlaceholder", { id: booking.car })}
              </dd>
            </div>
            <div>
              <dt>{t("common.fields.box")}</dt>
              <dd>{bookingBoxName(booking, t)}</dd>
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
              <dt>{t("common.fields.washers")}</dt>
              <dd>{bookingWashers(booking, t)}</dd>
            </div>
          </dl>
          {cancelError ? <div className="field__error">{cancelError}</div> : null}
          <div className="booking-detail__actions">
            <Button
              disabled={!canChangeBooking(booking) || carsQuery.isLoading || !car}
              icon={<CalendarClock size={18} />}
              onClick={() => {
                rescheduleMutation.reset();
                setReschedulingBooking(booking);
              }}
              variant="secondary"
            >
              {t("booking.reschedule")}
            </Button>
            <Button
              disabled={!canChangeBooking(booking) || cancelMutation.isPending}
              icon={<Ban size={18} />}
              onClick={handleCancel}
              variant="danger"
            >
              {t("booking.cancel")}
            </Button>
          </div>
        </article>
      ) : null}
      <RescheduleModal
        booking={reschedulingBooking}
        cars={cars}
        error={rescheduleError}
        onClose={closeRescheduleModal}
        onSubmit={(startsAt) => {
          if (reschedulingBooking) {
            rescheduleMutation.mutate({
              startsAt,
              target: reschedulingBooking,
            });
          }
        }}
        pending={rescheduleMutation.isPending}
        stations={stations}
        washTypes={washTypes}
      />
    </section>
  );
}

function RescheduleModal({
  booking,
  cars,
  error,
  onClose,
  onSubmit,
  pending,
  stations,
  washTypes,
}: {
  booking: Booking | null;
  cars: CustomerCar[];
  error: string | null;
  onClose: () => void;
  onSubmit: (startsAt: string) => void;
  pending: boolean;
  stations: Station[];
  washTypes: WashType[];
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(today);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const car = booking ? bookingCar(cars, booking) : undefined;
  const selectedCarTypeId = carTypeId(car);

  useEffect(() => {
    if (booking) {
      setDate(booking.starts_at.slice(0, 10));
      setSelectedSlotStart(null);
    }
  }, [booking]);

  const availabilityQuery = useQuery({
    queryKey: [
      "availability",
      "reschedule",
      booking?.id,
      booking?.wash_station,
      selectedCarTypeId,
      booking?.wash_type,
      date,
    ],
    queryFn: () =>
      getAvailability({
        car_type: selectedCarTypeId as number,
        date,
        station: booking?.wash_station as number,
        wash_type: booking?.wash_type as number,
      }),
    enabled:
      Boolean(booking) &&
      Boolean(selectedCarTypeId) &&
      Boolean(booking?.wash_station) &&
      Boolean(booking?.wash_type) &&
      Boolean(date),
  });
  const slots = useMemo(() => availabilityQuery.data ?? [], [availabilityQuery.data]);
  const selectedSlot = slots.find((slot) => slot.starts_at === selectedSlotStart);
  const availabilityError =
    availabilityQuery.error instanceof Error ? availabilityQuery.error.message : null;

  useEffect(() => {
    if (!slots.length) {
      setSelectedSlotStart(null);
      return;
    }

    if (!slots.some((slot) => slot.starts_at === selectedSlotStart)) {
      setSelectedSlotStart(slots[0].starts_at);
    }
  }, [selectedSlotStart, slots]);

  return (
    <Modal
      onClose={onClose}
      open={Boolean(booking)}
      title={
        booking
          ? t("booking.rescheduleTitle", { id: booking.id })
          : t("booking.rescheduleTitle", { id: "" })
      }
    >
      {booking ? (
        <div className="reschedule-form">
          <dl className="booking-card__meta">
            <div>
              <dt>{t("common.fields.station")}</dt>
              <dd>{stationName(stations, booking.wash_station)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.service")}</dt>
              <dd>{washTypeName(washTypes, booking.wash_type)}</dd>
            </div>
            <div>
              <dt>{t("booking.currentTime")}</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
          </dl>
          <InputField
            label={t("booking.newDate")}
            onChange={(event) => setDate(event.target.value)}
            type="date"
            value={date}
          />
          <section
            className="reschedule-form__slots"
            aria-label={t("booking.freeSlots")}
          >
            <div className="slot-panel__header">
              <CalendarDays size={20} />
              <h3>{t("booking.freeSlots")}</h3>
            </div>
            {!car ? (
              <div className="state-panel">{t("booking.rescheduleCantDetectCar")}</div>
            ) : null}
            {availabilityQuery.isFetching ? (
              <div className="state-panel">{t("booking.searchingSlots")}</div>
            ) : null}
            {availabilityError ? (
              <div className="state-panel">{availabilityError}</div>
            ) : null}
            {!availabilityQuery.isFetching &&
            !availabilityError &&
            car &&
            !slots.length ? (
              <div className="state-panel">{t("booking.noSlots")}</div>
            ) : null}
            {slots.length ? (
              <div className="slot-grid">
                {slots.slice(0, 24).map((slot) => (
                  <SlotButton
                    key={slot.starts_at}
                    onSelect={setSelectedSlotStart}
                    selected={slot.starts_at === selectedSlotStart}
                    slot={slot}
                  />
                ))}
              </div>
            ) : null}
          </section>
          <div className="summary">
            <dl>
              <div>
                <dt>{t("booking.newDate")}</dt>
                <dd>{selectedSlot ? formatDate(selectedSlot.starts_at) : "-"}</dd>
              </div>
              <div>
                <dt>{t("common.fields.time")}</dt>
                <dd>
                  {selectedSlot
                    ? formatTimeRange(selectedSlot.starts_at, selectedSlot.ends_at)
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>{t("common.fields.duration")}</dt>
                <dd>
                  {selectedSlot
                    ? `${selectedSlot.duration_minutes} ${t("common.minutes")}`
                    : "-"}
                </dd>
              </div>
            </dl>
            {error ? <div className="field__error">{error}</div> : null}
            <div className="modal__actions">
              <Button onClick={onClose} variant="secondary">
                {t("common.actions.close")}
              </Button>
              <Button
                disabled={!selectedSlot || pending}
                icon={<CalendarClock size={18} />}
                onClick={() => selectedSlot && onSubmit(selectedSlot.starts_at)}
              >
                {t("booking.rescheduleSubmit")}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function SlotButton({
  onSelect,
  selected,
  slot,
}: {
  onSelect: (startsAt: string) => void;
  selected: boolean;
  slot: AvailabilitySlot;
}) {
  return (
    <button
      className={selected ? "slot slot--active" : "slot"}
      onClick={() => onSelect(slot.starts_at)}
      type="button"
    >
      {formatTime(slot.starts_at)}
    </button>
  );
}

function BookingForm({
  stations,
  stationsLoading,
  washTypes,
  washTypesLoading,
}: {
  stations: Station[];
  stationsLoading: boolean;
  washTypes: WashType[];
  washTypesLoading: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = useCurrentUser();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [selectedWashTypeId, setSelectedWashTypeId] = useState<number | null>(null);
  const [selectedSlotStart, setSelectedSlotStart] = useState<string | null>(null);
  const [createdBooking, setCreatedBooking] = useState<Booking | null>(null);

  const customerQuery = useQuery({
    queryKey: ["customers", "me"],
    queryFn: getCurrentCustomer,
  });
  const carsQuery = useQuery({
    queryKey: ["customers", "cars"],
    queryFn: getCustomerCars,
  });
  const selectedCar = carsQuery.data?.find((car) => car.id === selectedCarId);
  const selectedCarTypeId = carTypeId(selectedCar);

  useEffect(() => {
    if (!selectedStationId && stations.length) {
      setSelectedStationId(stations[0].id);
    }
  }, [selectedStationId, stations]);

  useEffect(() => {
    if (!selectedCarId && carsQuery.data?.length) {
      setSelectedCarId(carsQuery.data[0].id);
    }
  }, [carsQuery.data, selectedCarId]);

  useEffect(() => {
    if (!selectedWashTypeId && washTypes.length) {
      setSelectedWashTypeId(washTypes[0].id);
    }
  }, [selectedWashTypeId, washTypes]);

  const availabilityQuery = useQuery({
    queryKey: [
      "availability",
      selectedStationId,
      selectedCarTypeId,
      selectedWashTypeId,
      date,
    ],
    queryFn: () =>
      getAvailability({
        station: selectedStationId as number,
        car_type: selectedCarTypeId as number,
        wash_type: selectedWashTypeId as number,
        date,
      }),
    enabled:
      Boolean(selectedStationId) &&
      Boolean(selectedCarTypeId) &&
      Boolean(selectedWashTypeId) &&
      Boolean(date),
  });
  const slots = useMemo(() => availabilityQuery.data ?? [], [availabilityQuery.data]);
  const selectedSlot = slots.find((slot) => slot.starts_at === selectedSlotStart);

  useEffect(() => {
    setCreatedBooking(null);
  }, [date, selectedCarId, selectedStationId, selectedWashTypeId]);

  useEffect(() => {
    if (!slots.length) {
      setSelectedSlotStart(null);
      return;
    }

    if (!slots.some((slot) => slot.starts_at === selectedSlotStart)) {
      setSelectedSlotStart(slots[0].starts_at);
    }
  }, [selectedSlotStart, slots]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (
        !session?.customer_id ||
        !selectedCarId ||
        !selectedStationId ||
        !selectedWashTypeId ||
        !selectedSlot
      ) {
        throw new Error(t("booking.selectParameters"));
      }

      await ensureCsrfCookie();
      return createBooking({
        customer: session.customer_id,
        car: selectedCarId,
        wash_station: selectedStationId,
        wash_type: selectedWashTypeId,
        starts_at: selectedSlot.starts_at,
      });
    },
    onSuccess: (booking) => {
      setCreatedBooking(booking);
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const loadingDictionaries =
    stationsLoading ||
    washTypesLoading ||
    carsQuery.isLoading ||
    customerQuery.isLoading;
  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const availabilityError =
    availabilityQuery.error instanceof Error ? availabilityQuery.error.message : null;
  const noActiveCars = !carsQuery.isLoading && (carsQuery.data ?? []).length === 0;

  return (
    <section className="page">
      <Toolbar title={t("booking.newTitle")}>
        <InputField
          label={t("common.fields.date")}
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
      </Toolbar>
      {noActiveCars ? (
        <div className="panel state-panel">
          <p>{t("booking.noCarsTitle")}</p>
          <Link className="button button--primary" to="/my/cars">
            <CarIcon size={18} />
            <span>{t("booking.goToCars")}</span>
          </Link>
        </div>
      ) : null}
      <div className="booking-flow">
        <form className="panel form-grid">
          <SelectField
            disabled={loadingDictionaries}
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
          <SelectField
            disabled={loadingDictionaries || noActiveCars}
            label={t("common.fields.car")}
            onChange={(event) => setSelectedCarId(Number(event.target.value))}
            value={selectedCarId ?? ""}
          >
            {(carsQuery.data ?? []).map((car) => (
              <option key={car.id} value={car.id}>
                {car.number}, {carTypeName(car)}
              </option>
            ))}
          </SelectField>
          <SelectField
            disabled={loadingDictionaries}
            label={t("booking.service")}
            onChange={(event) => setSelectedWashTypeId(Number(event.target.value))}
            value={selectedWashTypeId ?? ""}
          >
            {washTypes.map((washType) => (
              <option key={washType.id} value={washType.id}>
                {washType.name}
              </option>
            ))}
          </SelectField>
          <InputField
            label={t("common.fields.phone")}
            readOnly
            value={customerPhone(customerQuery.data)}
          />
        </form>
        <section className="panel slot-panel" aria-label={t("booking.freeSlots")}>
          <div className="slot-panel__header">
            <CalendarDays size={20} />
            <h2>{t("booking.freeSlots")}</h2>
          </div>
          {availabilityQuery.isFetching ? (
            <div className="state-panel">{t("booking.searchingSlots")}</div>
          ) : null}
          {availabilityError ? (
            <div className="state-panel">{availabilityError}</div>
          ) : null}
          {!availabilityQuery.isFetching && !availabilityError && !slots.length ? (
            <div className="state-panel">{t("booking.noSlots")}</div>
          ) : null}
          {slots.length ? (
            <div className="slot-grid">
              {slots.slice(0, 24).map((slot) => (
                <button
                  className={
                    slot.starts_at === selectedSlotStart ? "slot slot--active" : "slot"
                  }
                  key={slot.starts_at}
                  onClick={() => setSelectedSlotStart(slot.starts_at)}
                  type="button"
                >
                  {formatTime(slot.starts_at)}
                </button>
              ))}
            </div>
          ) : null}
          <div className="summary">
            <dl>
              <div>
                <dt>{t("common.fields.duration")}</dt>
                <dd>
                  {selectedSlot
                    ? `${selectedSlot.duration_minutes} ${t("common.minutes")}`
                    : "-"}
                </dd>
              </div>
              <div>
                <dt>{t("booking.boxes")}</dt>
                <dd>{selectedSlot ? selectedSlot.boxes.length : "-"}</dd>
              </div>
              <div>
                <dt>{t("booking.washers")}</dt>
                <dd>{selectedSlot ? selectedSlot.washers.length : "-"}</dd>
              </div>
            </dl>
            {createdBooking ? (
              <div className="booking-result">
                <strong>{t("booking.created")}</strong>
                <span>
                  {formatDate(createdBooking.starts_at)},{" "}
                  {formatTimeRange(createdBooking.starts_at, createdBooking.ends_at)}
                </span>
                <span>
                  {t("booking.summaryCost", {
                    cost: formatMoney(createdBooking.cost),
                    downPayment: formatMoney(createdBooking.down_payment),
                  })}
                </span>
              </div>
            ) : null}
            {createError ? <div className="field__error">{createError}</div> : null}
            <Button
              disabled={!selectedSlot || createMutation.isPending}
              icon={<Check size={18} />}
              onClick={() => createMutation.mutate()}
            >
              {t("booking.create")}
            </Button>
          </div>
        </section>
      </div>
    </section>
  );
}

function filterBookings(bookings: Booking[], filter: BookingFilter) {
  if (filter === "cancelled") {
    return bookings.filter((booking) => booking.status === "cancelled");
  }

  const now = Date.now();
  if (filter === "past") {
    return bookings.filter(
      (booking) =>
        booking.status !== "cancelled" && new Date(booking.ends_at).getTime() < now,
    );
  }

  return bookings.filter(
    (booking) =>
      booking.status !== "cancelled" && new Date(booking.ends_at).getTime() >= now,
  );
}

function canChangeBooking(booking: Booking) {
  return (
    (booking.status === "pending" || booking.status === "confirmed") &&
    new Date(booking.starts_at).getTime() > Date.now()
  );
}

function bookingCar(cars: CustomerCar[], booking: Booking) {
  return cars.find((car) => car.id === booking.car);
}

function bookingBoxName(
  booking: Booking,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  return booking.wash_box
    ? t("booking.boxAssigned", { box: booking.wash_box })
    : t("booking.boxUnassigned");
}

function bookingWashers(
  booking: Booking,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (!booking.washers.length) {
    return t("booking.washersUnassigned");
  }

  return booking.washers.map((washer) => washer.name).join(", ");
}

function carTypeId(car: CustomerCar | undefined) {
  if (!car) {
    return null;
  }

  return typeof car.car_type === "number" ? car.car_type : car.car_type.id;
}

function carTypeName(car: CustomerCar) {
  return typeof car.car_type === "number" ? `#${car.car_type}` : car.car_type.name;
}

function customerPhone(customer: CurrentCustomer | null | undefined) {
  return customer?.phone_number ?? "";
}

function stationLabel(station: Station) {
  return station.address ? `${station.name}, ${station.address}` : station.name;
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
