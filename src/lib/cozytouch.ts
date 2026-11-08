// Cozytouch client: Atlantic (Magellan) API, plus Overkiz for legacy devices
import { MAX_PERIODS, toMinutes } from "@/utils/schedule.ts";
import type { Location } from "@/lib/weather.ts";

const ATLANTIC_API = "https://apis.groupe-atlantic.com";
const ATLANTIC_CLIENT =
  "Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh";
const OVERKIZ_API = "https://ha110-1.overkiz.com/enduser-mobile-web/enduserAPI";

export type Mode = "off" | "manual" | "program";
export type Command = { name: string; parameters: unknown[] };
export type Period = { start: string; end: string };

export type Device = {
  name: string;
  id: string;
  target: number | null;
  measured: number | null;
  adjustable?: boolean;
  min?: number | null;
  max?: number | null;
  modes?: Mode[];
  mode?: Mode | null;
  /** 7 days, Monday first, of comfort periods. */
  schedule?: Period[][] | null;
  /** Accepts schedule changes. */
  schedulable?: boolean;
  eco?: number | null;
  ecoAdjustable?: boolean;
};

export type Session = {
  token: string;
  overkizCookie: string | null;
  /** Account holder's name, when the token carries one. */
  name: string | null;
  /** Home location for the weather, once the device list has loaded. */
  location?: Location | null;
  /** Commands per mode for each Overkiz device, picked when the list was loaded. */
  modes: Map<string, Partial<Record<Mode, Command[]>>>;
  /** Command names each Overkiz device accepts. */
  commands: Map<string, Set<string>>;
};

/** Temperature settings and the command that sets each. */
export const SETTINGS = {
  target: "setTargetTemperature",
  eco: "setSetpointLoweringTemperatureInProgMode",
} as const;
export type Setting = keyof typeof SETTINGS;

export class UpstreamError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

// Throws (and logs upstream status + body) when the response is not ok
async function check(res: Response, step: string) {
  if (res.ok) return res;
  const body = await res.text();
  console.error(`${step} failed: ${res.status} ${body}`);
  throw new UpstreamError(`${step} failed (${res.status})`, res.status);
}

export async function login(email: string, password: string): Promise<Session> {
  const res = await fetch(`${ATLANTIC_API}/users/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${ATLANTIC_CLIENT}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "password",
      scope: "openid",
      username: `GA-PRIVATEPERSON/${email}`,
      password,
    }),
  });
  if (res.status === 400) {
    console.error(`Atlantic token failed: ${res.status} ${await res.text()}`);
    throw new UpstreamError("Invalid email or password", 401);
  }
  await check(res, "Atlantic token");
  const tokens = (await res.json()) as {
    access_token: string;
    id_token?: string;
  };
  const token: string = tokens.access_token;
  const name = nameFromTokens(tokens);
  if (!name)
    console.info("No user name in the Cozytouch token; showing 'Menu'");
  return {
    token,
    overkizCookie: await overkizLogin(token),
    name,
    modes: new Map(),
    commands: new Map(),
  };
}

// We ask for scope=openid, so the response may include an id_token whose claims name the user.
// The access token is tried too, in case it is a JWT with the same claims.
function nameFromTokens(tokens: { id_token?: string; access_token?: string }) {
  for (const jwt of [tokens.id_token, tokens.access_token]) {
    const payload = jwt?.split(".")[1];
    if (!payload) continue;
    try {
      const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const claims = JSON.parse(new TextDecoder().decode(bytes));
      const name: string =
        claims.name ||
        [claims.given_name, claims.family_name].filter(Boolean).join(" ");
      if (name && !name.includes("@")) return name;
    } catch {
      // Not a JWT
    }
  }
  return null;
}

// Legacy devices live on Overkiz; accounts without them fail here, which is fine
async function overkizLogin(token: string) {
  try {
    const jwtRes = await check(
      await fetch(`${ATLANTIC_API}/magellan/accounts/jwt`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      "Atlantic JWT",
    );
    const jwt = (await jwtRes.text()).replace(/"/g, "");
    const loginRes = await check(
      await fetch(`${OVERKIZ_API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ jwt }),
      }),
      "Overkiz login",
    );
    return (
      loginRes.headers
        .getSetCookie()
        .map((c) => c.split(";")[0])
        .join("; ") || null
    );
  } catch (e) {
    console.error(
      "Overkiz unavailable, listing Magellan devices only:",
      (e as Error).message,
    );
    return null;
  }
}

// Magellan user-given name: assigned room (zone), customName (unless it's a ROOM_0/THZONE_0 placeholder), room name in capability 154
function magellanName(d: any, zoneNames: Map<string, string>, all: any[]) {
  // Sub-devices take the room of the master that lists them in its iothubChildrenIds tag
  const master = all.find((m) =>
    m.tags?.some(
      (t: any) => t.label === "iothubChildrenIds" && t.value === d.name,
    ),
  );
  const zoneId = master ? master.zoneId : d.zoneId;
  if (zoneNames.get(String(zoneId))) return zoneNames.get(String(zoneId))!;
  if (d.customName && !/^(ROOM|THZONE)_\d+$/.test(d.customName))
    return d.customName;
  const room = d.capabilities?.find((c: any) => c.capabilityId === 154)?.value;
  return room || d.customName || d.name;
}

export async function listDevices(session: Session): Promise<Device[]> {
  const { token, overkizCookie } = session;
  const res = await check(
    await fetch(`${ATLANTIC_API}/magellan/cozytouch/setupviewv2`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
    "Magellan setup",
  );
  const setup = (await res.json()) as any[];
  // The Cozytouch profile's address lives in Magellan; Overkiz has its own, possibly a default
  const profileLocation = locationOf(setup[0]?.address);
  let overkizLocation: Location | null = null;

  // Room names: from the setup view if it has them, otherwise from the zones endpoint
  let zones = setup[0]?.zones;
  if (!Array.isArray(zones) || !zones.some((z: any) => z.name)) {
    try {
      const zr = await check(
        await fetch(`${ATLANTIC_API}/magellan/zones`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        "Magellan zones",
      );
      zones = await zr.json();
    } catch {
      zones = [];
    }
  }
  const zoneNames = new Map<string, string>(
    (Array.isArray(zones) ? zones : []).map((z: any) => [String(z.id), z.name]),
  );

  const all: any[] = setup[0]?.devices ?? [];
  // Gateways are the parent (masterDeviceId) of other devices, even when they report their installation's family
  const gatewayIds = new Set(all.map((d) => d.masterDeviceId).filter(Boolean));
  const devices: Device[] = all
    .filter(
      (d) => HEATING_FAMILIES.has(d.modelFamily) && !gatewayIds.has(d.deviceId),
    )
    .map((d) => {
      const cap = (id: number) =>
        d.capabilities?.find((c: any) => c.capabilityId === id)?.value;
      const heatPump = /Heat_Pump/.test(d.modelFamily);
      return {
        name: magellanName(d, zoneNames, all),
        id: String(d.deviceId),
        target: toNumber(cap(heatPump ? 17 : 40)),
        // 103150 = "0" means the device says its room reading is not valid right now
        measured: cap(103150) === "0" ? null : toNumber(cap(117)),
      };
    });

  if (overkizCookie) {
    const r = await check(
      await fetch(`${OVERKIZ_API}/setup`, {
        headers: { Cookie: overkizCookie },
      }),
      "Overkiz setup",
    );
    const { devices: all, rootPlace, location } = (await r.json()) as any;
    overkizLocation = locationOf(location);
    session.modes = new Map();
    session.commands = new Map();

    // Room names: places form a tree under rootPlace (the home itself, so it's skipped)
    const placeNames = new Map<string, string>();
    const walk = (p: any) =>
      p?.subPlaces?.forEach((s: any) => {
        placeNames.set(s.oid, s.label);
        walk(s);
      });
    walk(rootPlace);

    for (const d of all.filter(
      (d: any) => d.definition?.uiClass === "HeatingSystem",
    )) {
      // Measured temperature is often on a sibling sensor device (same URL, different #n)
      const base = d.deviceURL.split("#")[0];
      const sensor = all.find(
        (s: any) =>
          s.definition?.uiClass === "TemperatureSensor" &&
          s.deviceURL.split("#")[0] === base,
      );
      const modes = modesOf(d);
      session.modes.set(d.deviceURL, modes.commands);
      const commands = new Set<string>(
        d.definition?.commands?.map((c: any) => c.commandName),
      );
      session.commands.set(d.deviceURL, commands);
      devices.push({
        name:
          placeNames.get(d.placeOID) ??
          placeNames.get(sensor?.placeOID) ??
          d.label,
        id: d.deviceURL,
        target: toNumber(state(d, "core:TargetTemperatureState")),
        adjustable: commands.has(SETTINGS.target),
        min: toNumber(state(d, "core:MinimumHeatingTargetTemperatureState")),
        max: toNumber(state(d, "core:MaximumHeatingTargetTemperatureState")),
        modes: Object.keys(modes.commands) as Mode[],
        mode: modes.current,
        schedule: scheduleOf(d),
        schedulable: DAYS.every((day) => commands.has(dayCommand(day))),
        eco: toNumber(
          state(d, "modbuslink:SetpointLoweringTemperatureInProgModeState"),
        ),
        ecoAdjustable: commands.has(SETTINGS.eco),
        measured: toNumber(
          state(d, "core:TemperatureState") ??
            state(sensor, "core:TemperatureState"),
        ),
      });
    }
  }
  session.location = profileLocation ?? overkizLocation;
  return devices;
}

// Reads coordinates, city and country from an address, whichever field names it uses
function locationOf(address: any): Location | null {
  if (!address || typeof address !== "object") return null;
  const pick = (...keys: string[]) =>
    keys.map((key) => address[key]).find((v) => v != null && v !== "");
  const latitude = toNumber(pick("latitude", "lat"));
  const longitude = toNumber(pick("longitude", "lon", "lng"));
  const city = pick("city", "town", "locality") ?? null;
  const country = pick("countryCode", "country_code", "country") ?? null;
  if ((latitude == null || longitude == null) && !city) return null;
  return { latitude, longitude, city, country };
}

const state = (d: any, name: string) =>
  d?.states?.find((s: any) => s.name === name)?.value;

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

const capitalize = (s: string) => s[0].toUpperCase() + s.slice(1);
const dayCommand = (day: string) => `set${capitalize(day)}TimeProgram`;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// One day's program as the heater takes it: { monday: [3 slots] }, unused slots "00:00"-"00:00".
// Periods must be sorted, non-overlapping and non-empty.
export function scheduleCommand(day: unknown, periods: unknown): Command {
  const invalid = new UpstreamError("Invalid schedule", 400);
  if (typeof day !== "number" || !DAYS[day]) throw invalid;
  if (!Array.isArray(periods) || periods.length > MAX_PERIODS) throw invalid;
  let previousEnd = 0;
  for (const p of periods) {
    if (!TIME.test(p?.start) || !TIME.test(p?.end)) throw invalid;
    const start = toMinutes(p.start);
    const end = toMinutes(p.end, true);
    if (start < previousEnd || end <= start || p.start === p.end) throw invalid;
    previousEnd = end;
  }
  const slots: Period[] = periods.map(({ start, end }) => ({ start, end }));
  while (slots.length < MAX_PERIODS)
    slots.push({ start: "00:00", end: "00:00" });
  return { name: dayCommand(DAYS[day]), parameters: [{ [DAYS[day]]: slots }] };
}

// Weekly program: 7 days (Monday first) of comfort periods [{ start: "06:00", end: "08:00" }].
// Each day state is { monday: [3 slots] }; unused slots are "00:00"-"00:00". Null if the device has none.
function scheduleOf(d: any): Period[][] | null {
  const days = DAYS.map((day) => {
    const name = `core:${capitalize(day)}TimeProgramState`;
    return state(d, name)?.[day];
  });
  if (!days.every(Array.isArray)) return null;
  return days.map((slots: Period[]) =>
    slots
      .filter((s) => s.start !== s.end)
      .sort((a, b) => a.start.localeCompare(b.start)),
  );
}

// Off / manual / program: the Overkiz commands for each mode the device supports, plus the current mode
function modesOf(d: any) {
  const power = powerOf(d);
  const hasOperatingMode = d.definition?.commands?.some(
    (c: any) => c.commandName === "setOperatingMode",
  );
  const commands: Partial<Record<Mode, Command[]>> = {};
  if (power) commands.off = [power.off];
  if (hasOperatingMode) {
    // Turn on first in case it's off; setOperatingMode alone doesn't switch it on
    const on = power ? [power.on] : [];
    commands.manual = [
      ...on,
      { name: "setOperatingMode", parameters: ["manual"] },
    ];
    commands.program = [
      ...on,
      { name: "setOperatingMode", parameters: ["prog"] },
    ];
  }
  const operatingMode = ({ manual: "manual", prog: "program" } as const)[
    state(d, "core:OperatingModeState") as "manual" | "prog"
  ];
  const current: Mode | null =
    power?.isOn === false ? "off" : (operatingMode ?? null);
  return { commands, current };
}

// On/off differs per heater model, so pick the first scheme the device definition supports.
// Returns the Overkiz commands to send for on and off, plus the current state.
function powerOf(d: any) {
  const has = (name: string) =>
    d.definition?.commands?.some((c: any) => c.commandName === name);
  // Allowed values of a discrete state, e.g. core:OperatingModeState -> ["manual", "prog", "auto"]
  const values = (name: string): string[] =>
    d.definition?.states?.find((s: any) => s.qualifiedName === name)?.values ??
    [];
  const onOff = state(d, "core:OnOffState");
  const isOn = (v: unknown, offValues: unknown[]) =>
    v == null ? null : !offValues.includes(v);

  if (has("setOnOff"))
    return {
      on: { name: "setOnOff", parameters: ["on"] },
      off: { name: "setOnOff", parameters: ["off"] },
      isOn: isOn(onOff, ["off"]),
    };
  if (has("on") && has("off"))
    return {
      on: { name: "on", parameters: [] },
      off: { name: "off", parameters: [] },
      isOn: isOn(onOff, ["off"]),
    };
  if (has("setHeatingLevel")) {
    const level = onOff ?? state(d, "io:TargetHeatingLevelState");
    return {
      on: { name: "setHeatingLevel", parameters: ["comfort"] },
      off: { name: "setHeatingLevel", parameters: ["off"] },
      isOn: isOn(level, ["off"]),
    };
  }
  // Only some models accept standby here (others take just manual/prog/auto)
  if (
    has("setOperatingMode") &&
    values("core:OperatingModeState").includes("standby")
  ) {
    const mode = state(d, "core:OperatingModeState") ?? onOff;
    return {
      on: { name: "setOperatingMode", parameters: ["basic"] },
      off: { name: "setOperatingMode", parameters: ["standby"] },
      isOn: isOn(mode, ["standby", "off"]),
    };
  }
  return null;
}

// Sends commands to one device; Overkiz runs them in order
export async function exec(
  { overkizCookie }: Session,
  deviceURL: string,
  commands: Command[],
) {
  if (!overkizCookie) throw new UpstreamError("Overkiz not available", 400);
  await check(
    await fetch(`${OVERKIZ_API}/exec/apply`, {
      method: "POST",
      headers: { Cookie: overkizCookie, "Content-Type": "application/json" },
      body: JSON.stringify({
        label: "Teplo domova",
        actions: [{ deviceURL, commands }],
      }),
    }),
    `Overkiz ${commands.map((c) => c.name).join(", ")}`,
  );
}

// Model families that heat (Atlantic's ModelFamily enum, minus water heaters, AC and hubs)
const HEATING_FAMILIES = new Set([
  "Boiler",
  "Heat_Pump",
  "Hybrid_Heat_Pump",
  "Radiator",
  "Thermostat",
  "Towel_Dryer",
  "Underfloor_Heater",
]);

function toNumber(v: unknown) {
  const n = parseFloat(v as string);
  return Number.isFinite(n) ? n : null;
}
