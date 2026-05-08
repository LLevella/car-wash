import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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

const schema = z.object({
  number: z.string().min(1, "Укажите номер автомобиля"),
  car_type: z.coerce.number().int().positive("Выберите тип автомобиля"),
});

type CarFormValues = z.infer<typeof schema>;

type EditingState = { mode: "create" } | { mode: "edit"; car: CustomerCar } | null;

export function MyCarsPage() {
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
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось удалить автомобиль.",
      );
    },
    onSettled: () => {
      setPendingDeleteId(null);
      void queryClient.invalidateQueries({ queryKey: ["customers", "cars"] });
      void queryClient.invalidateQueries({ queryKey: ["customers", "me"] });
    },
  });

  function handleDelete(car: CustomerCar) {
    if (!window.confirm(`Удалить автомобиль ${car.number}?`)) {
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
            Обновить
          </Button>
        }
        title="Мои автомобили"
      >
        <Button
          icon={<Plus size={18} />}
          onClick={() => setEditing({ mode: "create" })}
        >
          Добавить автомобиль
        </Button>
      </Toolbar>
      {carsQuery.isLoading ? (
        <div className="panel state-panel">Загрузка автомобилей...</div>
      ) : null}
      {carsQuery.isError ? (
        <div className="panel state-panel">
          Не удалось загрузить список автомобилей.
        </div>
      ) : null}
      {!carsQuery.isLoading && !carsQuery.isError && cars.length === 0 ? (
        <div className="panel state-panel">
          У вас пока нет автомобилей. Добавьте первый, чтобы создавать записи.
        </div>
      ) : null}
      {cars.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Номер</th>
                <th>Тип</th>
                <th>Статус</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {cars.map((car) => (
                <tr key={car.id}>
                  <td>{car.number}</td>
                  <td>{carTypeLabel(car)}</td>
                  <td>{car.is_active === false ? "Удалён" : "Активен"}</td>
                  <td className="data-table__actions">
                    <Button
                      aria-label={`Редактировать ${car.number}`}
                      icon={<Pencil size={16} />}
                      onClick={() => setEditing({ mode: "edit", car })}
                      variant="ghost"
                    />
                    <Button
                      aria-label={`Удалить ${car.number}`}
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
  const open = editing !== null;
  const fallbackCarTypeId = carTypes[0]?.id ?? 0;
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
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    reset,
    setError,
  } = useForm<CarFormValues>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

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
        message: error instanceof Error ? error.message : "Не удалось сохранить.",
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
      title={editing?.mode === "edit" ? "Редактировать автомобиль" : "Новый автомобиль"}
    >
      <form className="form-grid" onSubmit={handleSubmit(onSubmit)}>
        <InputField
          autoFocus
          error={errors.number?.message}
          label="Номер"
          {...register("number")}
        />
        <SelectField
          error={errors.car_type?.message}
          label="Тип"
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
            Отмена
          </Button>
          <Button disabled={isSubmitting || saveMutation.isPending} type="submit">
            Сохранить
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function carTypeLabel(car: CustomerCar) {
  if (typeof car.car_type === "number") {
    return `Тип ${car.car_type}`;
  }

  return car.car_type.name;
}
