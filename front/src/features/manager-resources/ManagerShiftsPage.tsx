import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ensureCsrfCookie } from "../../api/auth";
import { getStations } from "../../api/dictionaries";
import { createManagerShift, getManagerShifts } from "../../api/manager";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { Toolbar } from "../../components/Toolbar";
import {
  buildDateTime,
  formatDate,
  formatTimeRange,
  stationLabel,
  today,
  uniqueShiftWashers,
  validateTimeRange,
} from "./resourceHelpers";

export function ManagerShiftsPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [washerId, setWasherId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState("09:00");
  const [endsAt, setEndsAt] = useState("18:00");
  const [isActive, setIsActive] = useState(true);

  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
  });

  useEffect(() => {
    if (!selectedStationId && stationsQuery.data?.length) {
      setSelectedStationId(stationsQuery.data[0].id);
    }
  }, [selectedStationId, stationsQuery.data]);

  const shiftsQuery = useQuery({
    queryKey: ["manager", "shifts", selectedStationId, date],
    queryFn: () =>
      getManagerShifts({
        date,
        station: selectedStationId ?? undefined,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });
  const washerSourceQuery = useQuery({
    queryKey: ["manager", "shift-washers", selectedStationId],
    queryFn: () => getManagerShifts({ station: selectedStationId ?? undefined }),
    enabled: Boolean(selectedStationId),
  });

  const washers = useMemo(
    () => uniqueShiftWashers(washerSourceQuery.data ?? []),
    [washerSourceQuery.data],
  );

  useEffect(() => {
    if (!washerId && washers.length) {
      setWasherId(washers[0].id);
    }
  }, [washerId, washers]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStationId || !washerId) {
        throw new Error("Выберите станцию и мойщика.");
      }

      const timeError = validateTimeRange(startsAt, endsAt);
      if (timeError) {
        throw new Error(timeError);
      }

      await ensureCsrfCookie();
      return createManagerShift({
        ends_at: buildDateTime(date, endsAt),
        is_active: isActive,
        starts_at: buildDateTime(date, startsAt),
        wash_station: selectedStationId,
        washer: washerId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["manager", "shifts"] });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
    },
  });

  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const timeError = validateTimeRange(startsAt, endsAt);
  const shifts = shiftsQuery.data ?? [];
  const stations = stationsQuery.data ?? [];

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => void shiftsQuery.refetch()}
          >
            Обновить
          </Button>
        }
        title="Смены"
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
      <section className="panel form-grid">
        <SelectField
          disabled={!washers.length}
          label="Мойщик"
          onChange={(event) => setWasherId(Number(event.target.value))}
          value={washerId ?? ""}
        >
          {washers.map((washer) => (
            <option key={washer.id} value={washer.id}>
              {washer.name}
            </option>
          ))}
        </SelectField>
        <InputField
          label="Начало"
          onChange={(event) => setStartsAt(event.target.value)}
          type="time"
          value={startsAt}
        />
        <InputField
          label="Окончание"
          onChange={(event) => setEndsAt(event.target.value)}
          type="time"
          value={endsAt}
        />
        <label className="checkbox-row">
          <input
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
            type="checkbox"
          />
          <span>Активная смена</span>
        </label>
        <div className="form-actions">
          <Button
            disabled={!washerId || createMutation.isPending || Boolean(timeError)}
            icon={<Plus size={18} />}
            onClick={() => createMutation.mutate()}
          >
            Создать смену
          </Button>
        </div>
        {timeError ? <div className="field__error">{timeError}</div> : null}
        {createError ? <div className="field__error">{createError}</div> : null}
      </section>
      {shiftsQuery.isLoading ? (
        <div className="panel state-panel">Загрузка смен...</div>
      ) : null}
      {!shiftsQuery.isLoading && shifts.length === 0 ? (
        <div className="panel state-panel">Смен на выбранную дату нет.</div>
      ) : null}
      {shifts.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Мойщик</th>
                <th>Дата</th>
                <th>Время</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((shift) => (
                <tr key={shift.id}>
                  <td>{shift.washer_name}</td>
                  <td>{formatDate(shift.starts_at)}</td>
                  <td>{formatTimeRange(shift.starts_at, shift.ends_at)}</td>
                  <td>{shift.is_active ? "Активна" : "Отключена"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
