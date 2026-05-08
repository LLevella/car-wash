export type UserRole = "customer" | "manager" | "admin";

export type CurrentUser = {
  is_authenticated: boolean;
  user: UserProfile | null;
  roles: UserRole[];
  customer_id: number | null;
};

export type UserProfile = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
};

export type Station = {
  id: number;
  name: string;
  city?: NamedEntity;
  district?: NamedEntity;
  address?: string;
};

export type NamedEntity = {
  id: number;
  name: string;
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
  car_type: number | CarType;
  customer?: number | null;
  is_active?: boolean;
};

export type CurrentCustomer = {
  id: number;
  name: string;
  phone_number: string;
  user_id: number | null;
  car: CustomerCar;
};

export type WashType = {
  id: number;
  name: string;
  description?: string;
};

export type ResourceOption = {
  id: number;
  name: string;
};

export type AvailabilitySlot = {
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  boxes: ResourceOption[];
  washers: ResourceOption[];
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

export type ManagerScheduleSummary = {
  total_bookings: number;
  active_bookings: number;
  busy_box_minutes: { wash_box: number; minutes: number }[];
  busy_washer_minutes: { washer: number; minutes: number }[];
};

export type ManagerScheduleDay = {
  station: number;
  date: string;
  day_starts_at?: string;
  day_ends_at?: string;
  step_minutes?: number;
  boxes: WashBox[];
  shifts: WasherShift[];
  resource_blocks: ResourceBlock[];
  bookings: Booking[];
  summary?: ManagerScheduleSummary;
};
