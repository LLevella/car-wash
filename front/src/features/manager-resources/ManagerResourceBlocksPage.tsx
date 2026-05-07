import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { ensureCsrfCookie } from "../../api/auth";
import { getStations } from "../../api/dictionaries";
import {
  createManagerResourceBlock,
  getManagerResourceBlocks,
  getManagerSchedule,
} from "../../api/manager";
import type { ResourceBlock } from "../../api/types";
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
} from "./resourceHelpers";

type ResourceTarget = "station" | "box" | "washer";

export function ManagerResourceBlocksPage() {
  const queryClient = useQueryClient();
  const [date, setDate] = useState(today);
  const [selectedStationId, setSelectedStationId] = useState<number | null>(null);
  const [target, setTarget] = useState<ResourceTarget>("station");
  const [boxId, setBoxId] = useState<number | null>(null);
  const [washerId, setWasherId] = useState<number | null>(null);
  const [startsAt, setStartsAt] = useState("12:00");
  const [endsAt, setEndsAt] = useState("13:00");
  const [reason, setReason] = useState("Технический перерыв");

  const stationsQuery = useQuery({
    queryKey: ["dictionaries", "stations"],
    queryFn: getStations,
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
        date,
        station: selectedStationId as number,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });
  const blocksQuery = useQuery({
    queryKey: ["manager", "resource-blocks", selectedStationId, date],
    queryFn: () =>
      getManagerResourceBlocks({
        date,
        station: selectedStationId ?? undefined,
      }),
    enabled: Boolean(selectedStationId) && Boolean(date),
  });

  const boxes = useMemo(
    () => scheduleQuery.data?.boxes ?? [],
    [scheduleQuery.data?.boxes],
  );
  const washers = useMemo(
    () => uniqueShiftWashers(scheduleQuery.data?.shifts ?? []),
    [scheduleQuery.data?.shifts],
  );

  useEffect(() => {
    if (!boxId && boxes.length) {
      setBoxId(boxes[0].id);
    }
  }, [boxId, boxes]);

  useEffect(() => {
    if (!washerId && washers.length) {
      setWasherId(washers[0].id);
    }
  }, [washerId, washers]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStationId) {
        throw new Error("Выберите станцию.");
      }

      await ensureCsrfCookie();
      return createManagerResourceBlock({
        ends_at: buildDateTime(date, endsAt),
        reason,
        starts_at: buildDateTime(date, startsAt),
        wash_box: target === "box" ? boxId : null,
        wash_station: selectedStationId,
        washer: target === "washer" ? washerId : null,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["manager", "resource-blocks"],
      });
      void queryClient.invalidateQueries({ queryKey: ["manager", "schedule"] });
      void queryClient.invalidateQueries({ queryKey: ["availability"] });
    },
  });

  const createError =
    createMutation.error instanceof Error ? createMutation.error.message : null;
  const blocks = blocksQuery.data ?? [];
  const stations = stationsQuery.data ?? [];
  const createDisabled =
    createMutation.isPending ||
    (target === "box" && !boxId) ||
    (target === "washer" && !washerId);

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => {
              void blocksQuery.refetch();
              void scheduleQuery.refetch();
            }}
          >
            Обновить
          </Button>
        }
        title="Блокировки"
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
          label="Ресурс"
          onChange={(event) => setTarget(event.target.value as ResourceTarget)}
          value={target}
        >
          <option value="station">Станция целиком</option>
          <option value="box">Бокс</option>
          <option value="washer">Мойщик</option>
        </SelectField>
        <SelectField
          disabled={target !== "box" || !boxes.length}
          label="Бокс"
          onChange={(event) => setBoxId(Number(event.target.value))}
          value={boxId ?? ""}
        >
          {boxes.map((box) => (
            <option key={box.id} value={box.id}>
              {box.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={target !== "washer" || !washers.length}
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
        <InputField
          label="Причина"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
        <div className="form-actions">
          <Button
            disabled={createDisabled}
            icon={<Plus size={18} />}
            onClick={() => createMutation.mutate()}
          >
            Создать блокировку
          </Button>
        </div>
        {createError ? <div className="field__error">{createError}</div> : null}
      </section>
      {blocksQuery.isLoading ? (
        <div className="panel state-panel">Загрузка блокировок...</div>
      ) : null}
      {!blocksQuery.isLoading && blocks.length === 0 ? (
        <div className="panel state-panel">Блокировок на выбранную дату нет.</div>
      ) : null}
      {blocks.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Ресурс</th>
                <th>Дата</th>
                <th>Время</th>
                <th>Причина</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id}>
                  <td>{blockTarget(block, boxes, washers)}</td>
                  <td>{formatDate(block.starts_at)}</td>
                  <td>{formatTimeRange(block.starts_at, block.ends_at)}</td>
                  <td>{block.reason || "Без причины"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

function blockTarget(
  block: ResourceBlock,
  boxes: Array<{ id: number; name: string }>,
  washers: Array<{ id: number; name: string }>,
) {
  if (block.wash_box) {
    return (
      boxes.find((box) => box.id === block.wash_box)?.name ?? `Бокс ${block.wash_box}`
    );
  }

  if (block.washer) {
    return (
      washers.find((washer) => washer.id === block.washer)?.name ??
      `Мойщик ${block.washer}`
    );
  }

  return "Станция целиком";
}
