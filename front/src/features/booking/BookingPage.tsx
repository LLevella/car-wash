import { CalendarDays, Check, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { customerBookings, stations, washTypes } from "../../tests/fixtures";

type BookingPageProps = {
  view?: "form" | "bookings";
};

export function BookingPage({ view = "form" }: BookingPageProps) {
  const [selectedSlot, setSelectedSlot] = useState("10:30");
  const [date, setDate] = useState("2026-05-06");
  const slots = useMemo(() => ["09:00", "10:30", "12:00", "14:30", "16:00"], []);

  if (view === "bookings") {
    return (
      <section className="page">
        <Toolbar
          actions={
            <Button icon={<RefreshCw size={18} />} variant="secondary">
              Обновить
            </Button>
          }
          title="Мои записи"
        >
          <SelectField label="Фильтр" value="upcoming" onChange={() => undefined}>
            <option value="upcoming">Будущие</option>
            <option value="past">Прошедшие</option>
            <option value="cancelled">Отмененные</option>
          </SelectField>
        </Toolbar>
        <div className="booking-list">
          {customerBookings.map((booking) => (
            <article className="booking-card" key={booking.id}>
              <div>
                <h2>{booking.stationName}</h2>
                <p>{booking.serviceName}</p>
              </div>
              <StatusBadge status={booking.status} />
              <dl className="booking-card__meta">
                <div>
                  <dt>Дата</dt>
                  <dd>{booking.date}</dd>
                </div>
                <div>
                  <dt>Время</dt>
                  <dd>{booking.time}</dd>
                </div>
                <div>
                  <dt>Стоимость</dt>
                  <dd>{booking.cost}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
    );
  }

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
          <SelectField label="Станция" value="1" onChange={() => undefined}>
            {stations.map((station) => (
              <option key={station.id} value={station.id}>
                {station.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Автомобиль" value="1" onChange={() => undefined}>
            <option value="1">A123BC, седан</option>
            <option value="2">B456DE, кроссовер</option>
          </SelectField>
          <SelectField label="Тип мойки" value="1" onChange={() => undefined}>
            {washTypes.map((washType) => (
              <option key={washType.id} value={washType.id}>
                {washType.name}
              </option>
            ))}
          </SelectField>
          <InputField label="Телефон" value="+7 900 000-00-00" readOnly />
        </form>
        <section className="panel slot-panel" aria-label="Доступные слоты">
          <div className="slot-panel__header">
            <CalendarDays size={20} />
            <h2>Свободное время</h2>
          </div>
          <div className="slot-grid">
            {slots.map((slot) => (
              <button
                className={slot === selectedSlot ? "slot slot--active" : "slot"}
                key={slot}
                onClick={() => setSelectedSlot(slot)}
                type="button"
              >
                {slot}
              </button>
            ))}
          </div>
          <div className="summary">
            <dl>
              <div>
                <dt>Стоимость</dt>
                <dd>2 400 ₽</dd>
              </div>
              <div>
                <dt>Аванс</dt>
                <dd>720 ₽</dd>
              </div>
              <div>
                <dt>Остаток</dt>
                <dd>1 680 ₽</dd>
              </div>
            </dl>
            <Button icon={<Check size={18} />}>Создать запись</Button>
          </div>
        </section>
      </div>
    </section>
  );
}
