import { Plus, RefreshCw } from "lucide-react";

import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { StatusBadge } from "../../components/StatusBadge";
import { Toolbar } from "../../components/Toolbar";
import { scheduleBlocks, scheduleRows, stations } from "../../tests/fixtures";

export function ManagerSchedulePage() {
  return (
    <section className="page">
      <Toolbar
        actions={
          <>
            <Button icon={<Plus size={18} />} variant="secondary">
              Смена
            </Button>
            <Button icon={<RefreshCw size={18} />}>Обновить</Button>
          </>
        }
        title="Расписание"
      >
        <SelectField label="Станция" value="1" onChange={() => undefined}>
          {stations.map((station) => (
            <option key={station.id} value={station.id}>
              {station.name}
            </option>
          ))}
        </SelectField>
        <InputField label="Дата" type="date" value="2026-05-06" readOnly />
      </Toolbar>
      <div className="schedule-wrap">
        <div className="schedule-grid" role="table" aria-label="Расписание боксов">
          <div className="schedule-grid__head" role="row">
            <div role="columnheader">Бокс</div>
            <div role="columnheader">09:00</div>
            <div role="columnheader">10:00</div>
            <div role="columnheader">11:00</div>
            <div role="columnheader">12:00</div>
            <div role="columnheader">13:00</div>
            <div role="columnheader">14:00</div>
            <div role="columnheader">15:00</div>
            <div role="columnheader">16:00</div>
          </div>
          {scheduleRows.map((row) => (
            <div className="schedule-grid__row" key={row.box} role="row">
              <div className="schedule-grid__box" role="rowheader">
                {row.box}
              </div>
              {row.cells.map((cell, index) => (
                <div className="schedule-cell" key={`${row.box}-${index}`} role="cell">
                  {cell ? (
                    <article className="schedule-card">
                      <strong>{cell.customer}</strong>
                      <span>{cell.service}</span>
                      <small>{cell.washer}</small>
                      <StatusBadge status={cell.status} />
                    </article>
                  ) : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <section className="resource-strip" aria-label="Блокировки">
        {scheduleBlocks.map((block) => (
          <article className="resource-strip__item" key={block.id}>
            <strong>{block.title}</strong>
            <span>{block.interval}</span>
          </article>
        ))}
      </section>
    </section>
  );
}
