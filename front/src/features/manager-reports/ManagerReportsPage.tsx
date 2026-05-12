import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getStations } from "../../api/dictionaries";
import { getManagerReports } from "../../api/manager";
import type { ManagerReports, Station } from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import { dateInputValue, formatMoney } from "../../i18n/format";

type TFn = (key: string, options?: Record<string, unknown>) => string;

const today = dateInputValue();

export function ManagerReportsPage() {
  const { t } = useTranslation();
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
            {t("common.actions.refresh")}
          </Button>
        }
        title={t("managerReports.title")}
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
          label={t("managerReports.fromDate")}
          onChange={(event) => setDateFrom(event.target.value)}
          type="date"
          value={dateFrom}
        />
        <InputField
          label={t("managerReports.toDate")}
          onChange={(event) => setDateTo(event.target.value)}
          type="date"
          value={dateTo}
        />
      </Toolbar>
      {reportsQuery.isLoading ? (
        <div className="panel state-panel">{t("managerReports.loading")}</div>
      ) : null}
      {error ? <div className="panel state-panel">{error}</div> : null}
      {reports ? <ReportsView reports={reports} t={t} /> : null}
    </section>
  );
}

function ReportsView({ reports, t }: { reports: ManagerReports; t: TFn }) {
  return (
    <div className="reports-grid">
      <article className="panel reports-card" aria-label={t("managerReports.summary")}>
        <h2>{t("managerReports.summary")}</h2>
        <dl>
          <div>
            <dt>{t("managerReports.period")}</dt>
            <dd>
              {reports.date_from}
              {reports.date_to !== reports.date_from ? ` – ${reports.date_to}` : null}
            </dd>
          </div>
          <div>
            <dt>{t("managerReports.totalBookings")}</dt>
            <dd>{reports.bookings_total}</dd>
          </div>
          <div>
            <dt>{t("managerReports.revenuePaid")}</dt>
            <dd>{formatMoney(reports.revenue_paid)}</dd>
          </div>
        </dl>
      </article>
      <article className="panel reports-card" aria-label={t("managerReports.byStatus")}>
        <h2>{t("managerReports.byStatus")}</h2>
        {reports.bookings_by_status.length === 0 ? (
          <p>{t("managerReports.noBookings")}</p>
        ) : (
          <ul>
            {reports.bookings_by_status.map((row) => (
              <li key={row.status}>
                <span>{t(`bookingStatus.${row.status}` as const)}</span>
                <strong>{row.count}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
      <article className="panel reports-card" aria-label={t("managerReports.boxUtil")}>
        <h2>{t("managerReports.boxUtil")}</h2>
        {reports.box_utilization.length === 0 ? (
          <p>{t("managerReports.noBoxes")}</p>
        ) : (
          <ul>
            {reports.box_utilization.map((row) => (
              <li key={row.wash_box}>
                <span>{t("managerReports.boxLabel", { id: row.wash_box })}</span>
                <strong>{formatMinutes(row.minutes, t)}</strong>
              </li>
            ))}
          </ul>
        )}
      </article>
      <article
        className="panel reports-card"
        aria-label={t("managerReports.washerUtil")}
      >
        <h2>{t("managerReports.washerUtil")}</h2>
        {reports.washer_utilization.length === 0 ? (
          <p>{t("managerReports.noWashers")}</p>
        ) : (
          <ul>
            {reports.washer_utilization.map((row) => (
              <li key={row.washer}>
                <span>{t("managerReports.washerLabel", { id: row.washer })}</span>
                <strong>{formatMinutes(row.minutes, t)}</strong>
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

function formatMinutes(minutes: number, t: TFn) {
  if (!minutes) {
    return `0 ${t("common.minutes")}`;
  }
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) {
    return `${minutes} ${t("common.minutes")}`;
  }
  if (!remainder) {
    return `${hours} ${t("common.hours")}`;
  }
  return `${hours} ${t("common.hours")} ${remainder} ${t("common.minutes")}`;
}
