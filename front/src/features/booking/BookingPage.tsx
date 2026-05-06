import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ensureCsrfCookie } from "../../api/auth";
import { createBooking, getAvailability, getBookings } from "../../api/bookings";
import {
  getCurrentCustomer,
  getCustomerCars,
  getStations,
  getWashTypes,
} from "../../api/dictionaries";
import type {
  Booking,
  CurrentCustomer,
  CustomerCar,
  Station,
  WashType,
} from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { useCurrentUser } from "../auth/useAuth";

type BookingPageProps = {
  view?: "form" | "bookings";
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
  const [filter, setFilter] = useState<BookingFilter>("upcoming");
  const bookingsQuery = useQuery({
    queryKey: ["bookings", "customer"],
    queryFn: getBookings,
  });
  const bookings = useMemo(
    () => filterBookings(bookingsQuery.data ?? [], filter),
    [bookingsQuery.data, filter],
  );

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => void bookingsQuery.refetch()}
            variant="secondary"
          >
            Обновить
          </Button>
        }
        title="Мои записи"
      >
        <SelectField
          label="Фильтр"
          onChange={(event) => setFilter(event.target.value as BookingFilter)}
          value={filter}
        >
          <option value="upcoming">Будущие</option>
          <option value="past">Прошедшие</option>
          <option value="cancelled">Отмененные</option>
        </SelectField>
      </Toolbar>
      <div className="booking-list">
        {bookingsQuery.isLoading ? (
          <div className="panel state-panel">Загрузка записей...</div>
        ) : null}
        {bookingsQuery.isError ? (
          <div className="panel state-panel">Не удалось загрузить записи.</div>
        ) : null}
        {!bookingsQuery.isLoading && bookings.length === 0 ? (
          <div className="panel state-panel">Записей по фильтру нет.</div>
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
                <dt>Дата</dt>
                <dd>{formatDate(booking.starts_at)}</dd>
              </div>
              <div>
                <dt>Время</dt>
                <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
              </div>
              <div>
                <dt>Стоимость</dt>
                <dd>{formatMoney(booking.cost)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
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
        throw new Error("Выберите параметры записи.");
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

  return (
    <section className="page">
      <Toolbar title="Новая запись">
        <InputField
          label="Дата"
          onChange={(event) => setDate(event.target.value)}
          type="date"
          value={date}
        />
      </Toolbar>
      <div className="booking-flow">
        <form className="panel form-grid">
          <SelectField
            disabled={loadingDictionaries}
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
          <SelectField
            disabled={loadingDictionaries}
            label="Автомобиль"
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
            label="Тип мойки"
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
            label="Телефон"
            readOnly
            value={customerPhone(customerQuery.data)}
          />
        </form>
        <section className="panel slot-panel" aria-label="Доступные слоты">
          <div className="slot-panel__header">
            <CalendarDays size={20} />
            <h2>Свободное время</h2>
          </div>
          {availabilityQuery.isFetching ? (
            <div className="state-panel">Ищем свободные интервалы...</div>
          ) : null}
          {availabilityError ? (
            <div className="state-panel">{availabilityError}</div>
          ) : null}
          {!availabilityQuery.isFetching && !availabilityError && !slots.length ? (
            <div className="state-panel">Нет свободных слотов на выбранную дату.</div>
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
                <dt>Длительность</dt>
                <dd>{selectedSlot ? `${selectedSlot.duration_minutes} мин` : "-"}</dd>
              </div>
              <div>
                <dt>Боксы</dt>
                <dd>{selectedSlot ? selectedSlot.boxes.length : "-"}</dd>
              </div>
              <div>
                <dt>Мойщики</dt>
                <dd>{selectedSlot ? selectedSlot.washers.length : "-"}</dd>
              </div>
            </dl>
            {createdBooking ? (
              <div className="booking-result">
                <strong>Запись создана</strong>
                <span>
                  {formatDate(createdBooking.starts_at)},{" "}
                  {formatTimeRange(createdBooking.starts_at, createdBooking.ends_at)}
                </span>
                <span>
                  Стоимость: {formatMoney(createdBooking.cost)}, аванс:{" "}
                  {formatMoney(createdBooking.down_payment)}
                </span>
              </div>
            ) : null}
            {createError ? <div className="field__error">{createError}</div> : null}
            <Button
              disabled={!selectedSlot || createMutation.isPending}
              icon={<Check size={18} />}
              onClick={() => createMutation.mutate()}
            >
              Создать запись
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

function carTypeId(car: CustomerCar | undefined) {
  if (!car) {
    return null;
  }

  return typeof car.car_type === "number" ? car.car_type : car.car_type.id;
}

function carTypeName(car: CustomerCar) {
  return typeof car.car_type === "number" ? `тип ${car.car_type}` : car.car_type.name;
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
