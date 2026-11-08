# Teplo domova

Web UI for controlling heaters as a substitute for the Cozytouch app: log in with your Cozytouch account,
see your heaters, switch them between Program, Manual and Off, set the
temperature and edit the weekly schedule.

Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com)
and [shadcn/ui](https://ui.shadcn.com) components (rendered on the server, no
client-side React). The Astro server talks to the Atlantic
(Magellan) and Overkiz APIs, since those can't be called from the browser.

## Running

```sh
npm install
npm run dev        # http://localhost:4321
```

Production:

```sh
npm run build
node dist/server/entry.mjs   # HOST and PORT env vars, default localhost:4321
```

Open it via `localhost`, not `127.0.0.1`: Astro rejects form posts whose origin
doesn't match the host it serves.

## Installing as an app

The site is a PWA: in Chrome or Edge use _Install app_, on iOS Safari _Share → Add to
Home Screen_. Browsers only allow this (and the service worker) on `https://` or on
`localhost`, so to install it on a phone, serve it over HTTPS, e.g. behind a reverse proxy
or a tunnel. A plain `http://192.168.…` address works as a website but won't install.

The service worker (`public/sw.js`) caches only the build assets and icons; pages, API calls
and device data always come from the network, and an offline page is shown without a
connection. Bump `VERSION` in it to drop old caches.

## Where things are

- `src/lib/cozytouch.ts`: Cozytouch login, device list and commands
- `src/lib/session.ts`: in-memory sessions (a restart logs you out)
- `src/pages/api/`: mode, temperature and logout endpoints
- `src/components/`: heater card, temperature box, week schedule, login form
- `src/components/ui/`: shadcn components (add more with `npx shadcn@4.22.1 add <name>`)
- `src/styles/global.css`: Tailwind setup and shadcn's default (neutral) theme
- `src/lib/weather.ts`: outside weather for the header, from [Open-Meteo](https://open-meteo.com)
  (free, no key, data under CC BY 4.0). Uses the home location from the Overkiz setup, rounded
  to ~1 km, cached for 10 minutes
- `public/manifest.webmanifest`, `public/icons/`: app name, colours and icons
