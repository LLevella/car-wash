import { apiRequest } from "./client";
import type { CarType, CurrentCustomer, CustomerCar, Station, WashType } from "./types";

export type CustomerCarPayload = {
  number: string;
  car_type: number;
};

export function getStations() {
  return apiRequest<Station[]>("/api/personal/stations/");
}

export function getCarTypes() {
  return apiRequest<CarType[]>("/api/cars/types/");
}

export function getCustomerCars() {
  return apiRequest<CustomerCar[]>("/api/customers/cars/");
}

export function createCustomerCar(payload: CustomerCarPayload) {
  return apiRequest<CustomerCar>("/api/customers/cars/", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCustomerCar(id: number, payload: Partial<CustomerCarPayload>) {
  return apiRequest<CustomerCar>(`/api/customers/cars/${id}/`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteCustomerCar(id: number) {
  return apiRequest<CustomerCar>(`/api/customers/cars/${id}/`, {
    method: "DELETE",
  });
}

export function getCurrentCustomer() {
  return apiRequest<CurrentCustomer | null>("/api/customers/me/");
}

export function getWashTypes() {
  return apiRequest<WashType[]>("/api/car-wash/wash-types/");
}
