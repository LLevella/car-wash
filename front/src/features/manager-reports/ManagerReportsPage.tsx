import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { getStations } from "../../api/dictionaries";
import { getManagerReports } from "../../api/manager";
import type { BookingStatus, ManagerReports, Station } from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";

const today = new Date().toISOString().slice(0, 10);

const statusLabels: Record<BookingStatus, string> = {
  cancelled: "Отменена",
  completed: "Завершена",
  confirmed: "Подтверждена",
  draft: "Черновик",
  in_progress: "В работе",
  no_show: "Не приехал",
  pending: "Ожидает",
};

export function ManagerReportsPage() {
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [dateFrom, setDateFrom] = useState(today);
  const [dateTo, setDateTo] = useState(today);

  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
  });

  useEffect(() => {
    if (!selectedStationId && stationsQuery.data?.length) {
      setSelectedStationId(stationsQuery.data[0].id);
    }
  }, [selectedStationId, stationsQuery.data]);

  const reportsQuery = useQuery({
    queryKey: ["manager", "reports", selectedStationId, dateFrom, dateTo],
    queryFn: () =>
      getManagerReports({
        date_from: dateFrom,
        date_to: dateTo,
        station: selectedStationId ?? undefined,
      }),
    enabled: Boolean(dateFrom),
  });

  const stations = stationsQuery.data ?? [];
  const reports = reportsQuery.data;
  const error = reportsQuery.error instanceof Error ? reportsQuery.error.message : null;

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => void reportsQuery.refetch()}
          >
            Обновить
          </Button>
        }
        title="Отчёты"
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
          label="С"
          onChange={(event) => setDateFrom(event.target.value)}
          type="date"
          value={dateFrom}
        />
        <InputField
          label="По"
          onChange={(event) => setDateTo(event.target.value)}
          type="date"
          value={dateTo}
        />
      </Toolbar>
      {reportsQuery.isLoading ? (
        <div className="panel state-panel">Загрузка отчёта...</div>
      ) : null}
      {error ? <div className="panel state-panel">{error}</div> : null}
      {reports ? <ReportsView reports={reports} /> : null}
    </section>
  );
}

function ReportsView({ reports }: { reports: ManagerReports }) {
  return (
    <div className="reports-grid">
      <article className="panel reports-card" aria-label="Сводка">
        <h2>Сводка</h2>
        <dl>
          <div>
            <dt>Период</dt>
            <dd>
              {reports.date_from}
              {reports.date_to !== reports.date_from ? ` – ${reports.date_to}` : null}
            </dd>
          </div>
          <div>
            <dt>Записей</dt>
            <dd>{reports.bookings_total}</dd>
          </div>
          <div>
            <dt>Оплачено</dt>
            <dd>{formatMoney(reports.revenue_paid)}</dd>
          </div>
        </dl>
      </article>
      <article className="panel reports-card" aria-label="По статусам">
        <h2>По статусам</h2>
        {reports.bookings_by_status.length === 0 ? (
          <p>Нет записей за период.</p>
        ) : (
          <ul>
            {reports.bookings_by_status.map((row) => (
              <li key={row.status}>
                <span>{statusLabels[row.status] ?? row.status}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
      <article className="panel reports-card" aria-label="Загрузка боксов">
        <h2>Загрузка боксов</h2>
        {reports.box_utilization.length === 0 ? (
          <p>Нет загруженных боксов за период.</p>
        ) : (
          <ul>
            {reports.box_utilization.map((row) => (
              <li key={row.wash_box}>
                <span>Бокс #{row.wash_box}</span>
                <strong>{formatMinutes(row.minutes)}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
      <article className="panel reports-card" aria-label="Загрузка мойщиков">
        <h2>Загрузка мойщиков</h2>
        {reports.washer_utilization.length === 0 ? (
          <p>Нет назначений за период.</p>
        ) : (
          <ul>
            {reports.washer_utilization.map((row) => (
              <li key={row.washer}>
                <span>Мойщик #{row.washer}</span>
                <strong>{formatMinutes(row.minutes)}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
    </div>
  );
}

function stationLabel(station: Station) {
  return station.address ? `${station.name}, ${station.address}` : station.name;
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

function formatMinutes(minutes: number) {
  if (!minutes) {
    return "0 мин";
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${minutes} мин`;
  }
  if (!remainder) {
    return `${hours} ч`;
  }
  return `${hours} ч ${remainder} мин`;
}
