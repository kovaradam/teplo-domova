# Teplo domova

Web UI for controlling heaters as a substitute for the Cozytouch app: log in with your Cozytouch account,
see your heaters, switch them between Program, Manual and Off, set the
temperature and edit the weekly schedule.

Built with [Astro](https://astro.build), [Tailwind CSS](https://tailwindcss.com)
and [shadcn/ui](https://ui.shadcn.com) components (rendered on the server, no
client-side React). The Astro server talks to the Atlantic
(Magellan) and Overkiz APIs, since those can't be called from the browser.

## Running

It runs on Cloudflare Workers, with sessions in a D1 database.

```sh
npm install
npm run db:migrate   # creates the sessions table in the local D1 database
npm run dev          # http://localhost:4321, served by workerd like production
```

Open it via `localhost`, not `127.0.0.1`: Astro rejects form posts whose origin
doesn't match the host it serves.

## Deploying

```sh
npx wrangler login
npm run deploy       # build, deploy, then apply D1 migrations remotely
```

The first deploy creates the `teplo-domova` D1 database and writes its `database_id`
into `wrangler.jsonc`; commit that change. The app is then served on
`https://teplo-domova.<your-subdomain>.workers.dev`, which also makes it installable as an app.

Sessions last 7 days from the last visit and survive deploys. `wrangler types` runs before
`dev`, `check` and `build` to regenerate `worker-configuration.d.ts` (the binding types).

## Installing as an app

The site is a PWA: in Chrome or Edge use _Install app_, on iOS Safari _Share → Add to
Home Screen_. Browsers only allow this (and the service worker) on `https://` or on
`localhost`: the deployed `workers.dev` address works on a phone, while a local
`http://192.168.…` address works as a website but won't install.

The service worker (`public/sw.js`) caches only the build assets and icons; pages, API calls
and device data always come from the network, and an offline page is shown without a
connection. Bump `VERSION` in it to drop old caches.
