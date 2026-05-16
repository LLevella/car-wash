import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { ensureCsrfCookie } from "../../api/auth";
import { ApiError } from "../../api/client";
import {
  createCustomerCar,
  deleteCustomerCar,
  getCarTypes,
  getCustomerCars,
  updateCustomerCar,
} from "../../api/dictionaries";
import type { CustomerCar } from "../../api/types";
import { Button } from "../../components/Button";
import { InputField, SelectField } from "../../components/Field";
import { Modal } from "../../components/Modal";
import { Toolbar } from "../../components/Toolbar";

type CarFormValues = {
  number: string;
  car_type: number;
};

type EditingState = { mode: "create" } | { mode: "edit"; car: CustomerCar } | null;

export function MyCarsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditingState>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const carsQuery = useQuery({
    queryKey: ["customers", "cars"],
    queryFn: getCustomerCars,
  });
  const carTypesQuery = useQuery({
    queryKey: ["dictionaries", "car-types"],
    queryFn: getCarTypes,
  });

  const cars = carsQuery.data ?? [];
  const carTypes = carTypesQuery.data ?? [];

  const deleteMutation = useMutation({
    mutationFn: async (car: CustomerCar) => {
      await ensureCsrfCookie();
      return deleteCustomerCar(car.id);
    },
    onMutate: (car) => {
      setPendingDeleteId(car.id);
      setDeleteError(null);
    },
    onError: (error) => {
      setDeleteError(error instanceof Error ? error.message : t("myCars.deleteFailed"));
    },
    onSettled: () => {
      setPendingDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: ["customers", "cars"] });
      void queryClient.invalidateQueries({ queryKey: ["customers", "me"] });
    },
  });

  function handleDelete(car: CustomerCar) {
    if (!window.confirm(t("myCars.deleteConfirm", { plate: car.number }))) {
      return;
    }

    deleteMutation.mutate(car);
  }

  return (
    <section className="page">
      <Toolbar
        actions={
          <Button
            icon={<RefreshCw size={18} />}
            onClick={() => void carsQuery.refetch()}
            variant="secondary"
          >
            {t("common.actions.refresh")}
          </Button>
        }
        title={t("myCars.title")}
      >
        <Button
          icon={<Plus size={18} />}
          onClick={() => setEditing({ mode: "create" })}
        >
          {t("myCars.addCar")}
        </Button>
      </Toolbar>
      {carsQuery.isLoading ? (
        <div className="panel state-panel">{t("myCars.loading")}</div>
      ) : null}
      {carsQuery.isError ? (
        <div className="panel state-panel">{t("myCars.loadFailed")}</div>
      ) : null}
      {!carsQuery.isLoading && !carsQuery.isError && cars.length === 0 ? (
        <div className="panel state-panel">{t("myCars.empty")}</div>
      ) : null}
      {cars.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("common.fields.number")}</th>
                <th>{t("common.fields.type")}</th>
                <th>{t("common.fields.status")}</th>
                <th>{t("common.fields.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <tr key={car.id}>
                  <td>{car.number}</td>
                  <td>{carTypeLabel(car)}</td>
                  <td>
                    {car.is_active === false ? t("myCars.deleted") : t("myCars.active")}
                  </td>
                  <td className="data-table__actions">
                    <Button
                      aria-label={t("myCars.editAria", { plate: car.number })}
                      icon={<Pencil size={16} />}
                      onClick={() => setEditing({ mode: "edit", car })}
                      variant="ghost"
                    />
                    <Button
                      aria-label={t("myCars.deleteAria", { plate: car.number })}
                      disabled={
                        car.is_active === false ||
                        (deleteMutation.isPending && pendingDeleteId === car.id)
                      }
                      icon={<Trash2 size={16} />}
                      onClick={() => handleDelete(car)}
                      variant="danger"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {deleteError ? <div className="panel field__error">{deleteError}</div> : null}
      <CarFormModal
        carTypes={carTypes}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void queryClient.invalidateQueries({ queryKey: ["customers", "cars"] });
          void queryClient.invalidateQueries({ queryKey: ["customers", "me"] });
        }}
      />
    </section>
  );
}

function CarFormModal({
  carTypes,
  editing,
  onClose,
  onSaved,
}: {
  carTypes: { id: number; name: string }[];
  editing: EditingState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { i18n, t } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const open = editing !== null;
  const fallbackCarTypeId = carTypes[0]?.id ?? 0;
  const schema = useMemo(
    () =>
      z.object({
        number: z.string().min(1, t("myCars.errors.numberRequired")),
        car_type: z.coerce.number().int().positive(t("myCars.errors.carTypeRequired")),
      }),
    [t],
  );
  const defaultValues = useMemo<CarFormValues>(() => {
    if (editing?.mode === "edit") {
      return {
        number: editing.car.number,
        car_type:
          typeof editing.car.car_type === "number"
            ? editing.car.car_type
            : editing.car.car_type.id,
      };
    }

    return {
      number: "",
      car_type: fallbackCarTypeId,
    };
  }, [editing, fallbackCarTypeId]);
  const {
    formState: { errors, isSubmitted, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
    trigger,
  } = useForm<CarFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  useEffect(() => {
    if (open && isSubmitted) {
      void trigger();
    }
  }, [isSubmitted, language, open, trigger]);

  const saveMutation = useMutation({
    mutationFn: async (values: CarFormValues) => {
      await ensureCsrfCookie();
      if (editing?.mode === "edit") {
        return updateCustomerCar(editing.car.id, values);
      }

      return createCustomerCar(values);
    },
    onSuccess: () => {
      onSaved();
    },
  });

  async function onSubmit(values: CarFormValues) {
    try {
      await saveMutation.mutateAsync(values);
    } catch (error) {
      if (error instanceof ApiError && error.body?.field_errors) {
        for (const [field, messages] of Object.entries(error.body.field_errors)) {
          if (field === "number" || field === "car_type") {
            setError(field, { message: messages.join(" ") });
          }
        }
      }
      setError("root", {
        message: error instanceof Error ? error.message : t("common.states.saveFailed"),
      });
    }
  }

  return (
    <Modal
      onClose={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
      open={open}
      title={
        editing?.mode === "edit" ? t("myCars.editCarTitle") : t("myCars.newCarTitle")
      }
    >
      <form className="form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoFocus
          error={errors.number?.message}
          label={t("common.fields.number")}
          {...register("number")}
        />
        <SelectField
          error={errors.car_type?.message}
          label={t("common.fields.type")}
          {...register("car_type")}
        >
          {carTypes.map((carType) => (
            <option key={carType.id} value={carType.id}>
              {carType.name}
            </option>
          ))}
        </SelectField>
        {errors.root?.message ? (
          <div className="field__error">{errors.root.message}</div>
        ) : null}
        <div className="modal__actions">
          <Button onClick={onClose} variant="secondary">
            {t("common.actions.cancel")}
          </Button>
          <Button disabled={isSubmitting || saveMutation.isPending} type="submit">
            {t("common.actions.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function carTypeLabel(car: CustomerCar) {
  if (typeof car.car_type === "number") {
    return `#${car.car_type}`;
  }

  return car.car_type.name;
}
