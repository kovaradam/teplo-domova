// Current weather at the home's location, from Open-Meteo (no API key, CC BY 4.0)
export type Location = {
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  /** Country name or ISO code, used to narrow a city lookup. */
  country?: string | null;
};

export type Weather = {
  temperature: number;
  /** WMO weather interpretation code. */
  code: number;
  /** Whether the sun is up at the location. */
  isDay: boolean;
};

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; weather: Weather | null }>();

// Rounded to ~1 km: enough for local weather without sending the exact address
const round = (n: number) => Math.round(n * 100) / 100;

async function coordinates({ latitude, longitude, city, country }: Location) {
  if (latitude != null && longitude != null)
    return { latitude: round(latitude), longitude: round(longitude) };
  if (!city) return null;
  // Open-Meteo filters by ISO 3166 code only; a country name is left out
  const code = /^[A-Za-z]{2}$/.test(country ?? "") ? `&countryCode=${country}` : "";
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}${code}`,
  );
  const place = res.ok ? (await res.json()).results?.[0] : null;
  return place
    ? { latitude: round(place.latitude), longitude: round(place.longitude) }
    : null;
}

export async function getWeather(location: Location): Promise<Weather | null> {
  const key = `${location.latitude},${location.longitude},${location.city},${location.country}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.weather;

  let weather: Weather | null = null;
  try {
    const point = await coordinates(location);
    if (point) {
      const res = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${point.latitude}&longitude=${point.longitude}&current=temperature_2m,weather_code,is_day`,
      );
      if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
      const { current } = await res.json();
      weather = {
        temperature: Math.round(current.temperature_2m),
        code: current.weather_code,
        isDay: current.is_day !== 0,
      };
    }
  } catch (e) {
    console.error("Weather unavailable:", (e as Error).message);
  }
  cache.set(key, { at: Date.now(), weather });
  return weather;
}

/** Short description for a WMO weather code. */
export function describeWeather(code: number) {
  if (code === 0) return "Clear";
  if (code <= 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if (code <= 48) return "Fog";
  if (code <= 57) return "Drizzle";
  if (code <= 67) return "Rain";
  if (code <= 77) return "Snow";
  if (code <= 82) return "Showers";
  if (code <= 86) return "Snow showers";
  return "Thunderstorm";
}
