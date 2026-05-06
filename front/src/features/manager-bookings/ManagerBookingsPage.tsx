import { Search } from "lucide-react";

import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { managerBookings, stations } from "../../tests/fixtures";

export function ManagerBookingsPage() {
  return (
    <section className="page">
      <Toolbar
        actions={
          <Button icon={<Search size={18} />} variant="secondary">
            Найти
          </Button>
        }
        title="Заказы"
      >
        <SelectField label="Станция" value="1" onChange={() => undefined}>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </SelectField>
        <InputField label="Дата" type="date" value="2026-05-06" readOnly />
        <SelectField label="Статус" value="all" onChange={() => undefined}>
          <option value="all">Все</option>
          <option value="pending">Ожидает</option>
          <option value="confirmed">Подтверждена</option>
          <option value="in_progress">В работе</option>
        </SelectField>
      </Toolbar>
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
            {managerBookings.map((booking) => (
              <tr key={booking.id}>
                <td>{booking.customer}</td>
                <td>{booking.time}</td>
                <td>{booking.service}</td>
                <td>{booking.box}</td>
                <td>{booking.washer}</td>
                <td>
                  <StatusBadge status={booking.status} />
                </td>
                <td>{booking.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
