/** Formats a temperature as `21 °C`, or `–` when unknown. */
export const formatTemperature = (t: number | null | undefined) =>
  t == null ? "–" : `${t} °C`;
