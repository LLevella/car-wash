import { UserCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

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

type TFn = (key: string, options?: Record<string, unknown>) => string;

export function AssignmentModal({
  booking,
  boxes,
  error,
  onClose,
  onSubmit,
  pending,
  washers,
}: AssignmentModalProps) {
  const { t } = useTranslation();
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
      title={
        booking
          ? t("managerBookings.assignDialogTitle", { id: booking.id })
          : t("managerBookings.assignDialogFallback")
      }
    >
      {booking ? (
        <div className="assignment-form">
          <dl className="booking-card__meta">
            <div>
              <dt>{t("common.fields.time")}</dt>
              <dd>{formatTimeRange(booking.starts_at, booking.ends_at)}</dd>
            </div>
            <div>
              <dt>{t("managerBookings.currentBox")}</dt>
              <dd>{boxName(boxes, booking.wash_box, t)}</dd>
            </div>
            <div>
              <dt>{t("common.fields.washers")}</dt>
              <dd>{washerNames(booking, t)}</dd>
            </div>
          </dl>
          <SelectField
            label={t("common.fields.box")}
            onChange={(event) =>
              setSelectedBoxId(event.target.value ? Number(event.target.value) : null)
            }
            value={selectedBoxId ?? ""}
          >
            <option value="">{t("managerBookings.autoBox")}</option>
            {boxes.map((box) => (
              <option key={box.id} value={box.id}>
                {box.name}
              </option>
            ))}
          </SelectField>
          <fieldset className="checkbox-group">
            <legend>{t("common.fields.washers")}</legend>
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
                <div className="state-panel">{t("managerBookings.noShiftsHint")}</div>
              ) : null}
            </div>
          </fieldset>
          <p className="field__hint">{t("managerBookings.autoPickHint")}</p>
          {error ? <div className="field__error">{error}</div> : null}
          <div className="modal__actions">
            <Button onClick={onClose} variant="secondary">
              {t("common.actions.close")}
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
              {t("managerBookings.saveAssignment")}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function boxName(boxes: ResourceOption[], boxId: number | null, t: TFn) {
  if (!boxId) {
    return t("managerBookings.boxUnassigned");
  }

  return (
    boxes.find((box) => box.id === boxId)?.name ??
    t("managerBookings.boxFallback", { id: boxId })
  );
}

function washerNames(booking: Booking, t: TFn) {
  return booking.washers.length
    ? booking.washers.map((washer) => washer.name).join(", ")
    : t("managerBookings.washersUnassigned");
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatTimeRange(startsAt: string, endsAt: string) {
  return `${formatTime(startsAt)}-${formatTime(endsAt)}`;
}
