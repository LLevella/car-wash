import type { BookingStatus } from "../api/types";

export const stations = [
  { id: 1, name: "Центральная, Абая 12" },
  { id: 2, name: "Северная, Толе би 44" },
];

export const washTypes = [
  { id: 1, name: "Кузов + салон" },
  { id: 2, name: "Детейлинг" },
  { id: 3, name: "Экспресс" },
];

export const customerBookings: Array<{
  cost: string;
  date: string;
  id: number;
  serviceName: string;
  stationName: string;
  status: BookingStatus;
  time: string;
}> = [
  {
    id: 1,
    stationName: "Центральная, Абая 12",
    serviceName: "Кузов + салон",
    date: "06.05.2026",
    time: "10:30",
    status: "confirmed",
    cost: "2 400 ₽",
  },
  {
    id: 2,
    stationName: "Северная, Толе би 44",
    serviceName: "Экспресс",
    date: "09.05.2026",
    time: "14:00",
    status: "pending",
    cost: "1 600 ₽",
  },
];

type ScheduleCell = {
  customer: string;
  service: string;
  status: BookingStatus;
  washer: string;
};

export const scheduleRows: Array<{
  box: string;
  cells: Array<ScheduleCell | null>;
}> = [
  {
    box: "Бокс 1",
    cells: [
      null,
      {
        customer: "Айдана",
        service: "Кузов + салон",
        washer: "Марат",
        status: "confirmed",
      },
      null,
      null,
      {
        customer: "Сергей",
        service: "Детейлинг",
        washer: "Илья",
        status: "in_progress",
      },
      null,
      null,
      null,
    ],
  },
  {
    box: "Бокс 2",
    cells: [
      {
        customer: "Данияр",
        service: "Экспресс",
        washer: "Нурлан",
        status: "completed",
      },
      null,
      null,
      {
        customer: "Ольга",
        service: "Кузов",
        washer: "Антон",
        status: "pending",
      },
      null,
      null,
      null,
      null,
    ],
  },
];

export const scheduleBlocks = [
  { id: 1, title: "Бокс 3: обслуживание", interval: "12:00-13:00" },
  { id: 2, title: "Марат: перерыв", interval: "15:00-15:30" },
];

export const managerBookings: Array<{
  box: string;
  cost: string;
  customer: string;
  id: number;
  service: string;
  status: BookingStatus;
  time: string;
  washer: string;
}> = [
  {
    id: 1,
    customer: "Айдана",
    time: "10:00-11:00",
    service: "Кузов + салон",
    box: "Бокс 1",
    washer: "Марат",
    status: "confirmed",
    cost: "2 400 ₽",
  },
  {
    id: 2,
    customer: "Сергей",
    time: "13:00-15:00",
    service: "Детейлинг",
    box: "Бокс 1",
    washer: "Илья",
    status: "in_progress",
    cost: "4 800 ₽",
  },
  {
    id: 3,
    customer: "Ольга",
    time: "12:00-13:00",
    service: "Кузов",
    box: "Бокс 2",
    washer: "Антон",
    status: "pending",
    cost: "1 900 ₽",
  },
];
