import { UserCheck } from "lucide-react";
import { useEffect, useState } from "react";

import type { Booking } from "../../api/types";
import { Button } from "../../components/Button";
import { SelectField } from "../../components/Field";
import { Modal } from "../../components/Modal";

type ResourceOption = {
  id: number;
  name: string;
};

export type AssignmentPayload = {
  washBox: number | null;
  washers: number[];
};

type AssignmentModalProps = {
  booking: Booking | null;
  boxes: ResourceOption[];
  error: string | null;
  onClose: () => void;
  onSubmit: (payload: AssignmentPayload) => void;
  pending: boolean;
  washers: ResourceOption[];
};

export function AssignmentModal({
  booking,
  boxes,
  error,
  onClose,
  onSubmit,
  pending,
  washers,
}: AssignmentModalProps) {
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(null);
  const [selectedWasherIds, setSelectedWasherIds] = useState<number[]>([]);

  useEffect(() => {
    if (booking) {
      setSelectedBoxId(booking.wash_box);
      setSelectedWasherIds(booking.washers.map((washer) => washer.id));
    }
  }, [booking]);

  function toggleWasher(washerId: number) {
    setSelectedWasherIds((current) =>
      current.includes(washerId)
        ? current.filter((id) => id !== washerId)
        : [...current, washerId],
    );
  }

  return (
    <Modal
      onClose={onClose}
      open={Boolean(booking)}
      title={booking ? `Назначение заказа #${booking.id}` : "Назначение заказа"}
    >
      {booking ? (
        <div className="assignment-form">
          <dl className="booking-card__meta">
            <div>
              <dt>Время</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div>
              <dt>Текущий бокс</dt>
              <dd>{boxName(boxes, booking.wash_box)}</dd>
            </div>
            <div>
              <dt>Мойщики</dt>
              <dd>{washerNames(booking)}</dd>
            </div>
          </dl>
          <SelectField
            label="Бокс"
            onChange={(event) =>
              setSelectedBoxId(event.target.value ? Number(event.target.value) : null)
            }
            value={selectedBoxId ?? ""}
          >
            <option value="">Авто-подбор</option>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.name}
              </option>
            ))}
          </SelectField>
          <fieldset className="checkbox-group">
            <legend>Мойщики</legend>
            <div className="checkbox-list">
              {washers.map((washer) => (
                <label className="checkbox-row" key={washer.id}>
                  <input
                    checked={selectedWasherIds.includes(washer.id)}
                    onChange={() => toggleWasher(washer.id)}
                    type="checkbox"
                  />
                  <span>{washer.name}</span>
                </label>
              ))}
              {!washers.length ? (
                <div className="state-panel">
                  Нет смен на выбранную дату. Можно оставить авто-подбор.
                </div>
              ) : null}
            </div>
          </fieldset>
          <p className="field__hint">
            Если не выбрать бокс или мойщика, backend подберет свободный ресурс.
          </p>
          {error ? <div className="field__error">{error}</div> : null}
          <div className="modal__actions">
            <Button onClick={onClose} variant="secondary">
              Закрыть
            </Button>
            <Button
              disabled={pending}
              icon={<UserCheck size={18} />}
              onClick={() =>
                onSubmit({
                  washBox: selectedBoxId,
                  washers: selectedWasherIds,
                })
              }
            >
              Сохранить назначение
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function boxName(boxes: ResourceOption[], boxId: number | null) {
  if (!boxId) {
    return "Не назначен";
  }

  return boxes.find((box) => box.id === boxId)?.name ?? `Бокс ${boxId}`;
}

function washerNames(booking: Booking) {
  return booking.washers.length
    ? booking.washers.map((washer) => washer.name).join(", ")
    : "Не назначен";
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
