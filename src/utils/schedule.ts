/** Minutes in a day. */
export const DAY = 1440;
/** Editing step in minutes. */
export const STEP = 15;
/** Comfort periods a heater stores per day. */
export const MAX_PERIODS = 3;
export const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

/** `"06:30"` → 390. An end of `"00:00"` is midnight at the end of the day. */
export const toMinutes = (time: string, isEnd = false) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m || (isEnd ? DAY : 0);
};

/** 390 → `"06:30"`; the end of the day is `"00:00"`, as the heater stores it. */
export const toTime = (minutes: number) => {
  const m = minutes % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/**
 * Detail of the `schedule-edit` event the week schedule dispatches on a tap,
 * which opens the drawer. Times are minutes from midnight; `low` and `high`
 * are the neighbouring periods' edges the period may not cross.
 */
export type ScheduleEditRequest = {
  day: string;
  start: number;
  end: number;
  low: number;
  high: number;
  save: (start: number, end: number) => void;
  remove: () => void;
};
