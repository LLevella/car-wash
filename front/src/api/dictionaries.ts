import { apiRequest } from "./client";
import type { CarType, CustomerCar, Station, WashType } from "./types";

export function getStations() {
  return apiRequest<Station[]>("/api/personal/stations/");
}

export function getCarTypes() {
  return apiRequest<CarType[]>("/api/cars/types/");
}

export function getCustomerCars() {
  return apiRequest<CustomerCar[]>("/api/customers/cars/");
}

export function getWashTypes() {
  return apiRequest<WashType[]>("/api/car-wash/wash-types/");
}
