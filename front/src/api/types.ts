export type UserRole = "customer" | "manager" | "admin";

export type CurrentUser = {
  id: number;
  username: string;
  roles: UserRole[];
  customer_id: number | null;
};

export type Station = {
  id: number;
  name: string;
  city?: string;
  district?: string;
  address?: string;
};

export type WashBox = {
  id: number;
  name: string;
  is_active: boolean;
};

export type Washer = {
  id: number;
  name: string;
};

export type CarType = {
  id: number;
  name: string;
  description?: string;
};

export type CustomerCar = {
  id: number;
  number: string;
  car_type: number;
};

export type WashType = {
  id: number;
  name: string;
  description?: string;
};

export type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
  wash_box: number;
  wash_box_name: string;
  cost: string;
  down_payment: string;
  residual: string;
};

export type BookingStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export type BookingAssignment = {
  id: number;
  name: string;
  role: "main" | "assistant";
};

export type Booking = {
  id: number;
  customer: number;
  car: number;
  wash_station: number;
  wash_box: number | null;
  wash_type: number;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  cost: string;
  down_payment: string;
  residual: string;
  washers: BookingAssignment[];
};

export type WasherShift = {
  id: number;
  washer: number;
  washer_name: string;
  wash_station: number;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
};

export type ResourceBlock = {
  id: number;
  wash_station: number;
  wash_box: number | null;
  washer: number | null;
  starts_at: string;
  ends_at: string;
  reason: string;
};

export type ManagerScheduleDay = {
  station: number;
  date: string;
  boxes: WashBox[];
  shifts: WasherShift[];
  resource_blocks: ResourceBlock[];
  bookings: Booking[];
};
