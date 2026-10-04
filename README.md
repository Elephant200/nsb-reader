# NSB Reader

High-school National Science Bowl practice with solo tossups, bonuses, paired questions, private multiplayer rooms, and reader-led in-person practice. The interface and reading controls use [QBReader](https://github.com/qbreader/website).

## Run locally

Install Node.js 22 or newer, then:

```sh
npm ci
npm run build:cloudflare
npx wrangler d1 migrations apply nsb-reader --local
npx wrangler d1 execute nsb-reader --local --file .cloudflare/seed.sql
npm run dev:cloudflare
```

Open http://localhost:8787. This uses local D1 and Durable Object emulators; no Supabase connection or Cloudflare login is needed. Keep an empty `.dev.vars` file if a PostgreSQL `.env` is also present, so Wrangler does not load those unrelated credentials.

The Express development server is also available with `npm start`. It requires PostgreSQL, the migrations in `supabase/migrations/`, `.env.example` configuration, and the [question importer](tools/import/README.md).

Run `npm test` for behavior and parser checks. Run `npm run lint` for JavaScript formatting.

[Product specification](SPEC.md) · [Contributing](.github/CONTRIBUTING.md)

## In-person rooms

Open `/play/in-person/` to create a reader room or join with a six-digit code. The reader controls question selection, timers, judgments, team assignments, and scores. Player devices get a buzzer and generated username. Reader credentials and player reconnect identities stay in their respective browsers. Use the same site address on all devices.

## Storage

Cloudflare D1 stores questions and reports. A SQLite-backed Durable Object coordinates each reader room, saves its state after actions, and keeps its WebSocket connections through hibernation. Reader rooms expire one hour after everyone disconnects. End disconnects everyone immediately. Stars and preferences stay in the browser; there is no cross-session player history.

Individual multiplayer uses the existing word-reading engine inside a separate Durable Object for each room. Its open WebSockets keep the engine active; a deployment can end those sessions. Both transports enforce per-IP connection limits and 10 KB incoming message limits. The frontend, shared rules, and wire protocols are common to both hosting runtimes.

## Cloudflare hosting

`wrangler.jsonc` binds the Worker to D1, Durable Objects, and compiled static assets. HTML includes are expanded during the build. The deterministic corpus import preserves question IDs across imports. Random practice selects from a compact category/year index and fetches only selected rows. Search uses a static text index inside a Durable Object, avoiding full D1 table scans; regular expressions use RE2JS for bounded matching rather than backtracking.

Authenticate with `npx wrangler login`. For a new Cloudflare account, create the D1 database with `npx wrangler d1 create nsb-reader` and update its ID in `wrangler.jsonc`. Apply the schema and import the corpus once:

```sh
npm run build:cloudflare
npx wrangler d1 migrations apply nsb-reader --remote
npx wrangler d1 execute nsb-reader --remote --file .cloudflare/seed.sql
npx wrangler deploy
```

For code-only updates, use `npm run deploy:cloudflare`; do not reimport unchanged questions. The import writes about 73,000 rows including indexes, within D1's free daily 100,000-write allowance. Repeated imports consume that allowance again. Cloudflare credentials remain in Wrangler's local configuration, outside the repository.

The app uses resources available on Workers Free. Free quotas are finite: the regular individual multiplayer engine consumes active Durable Object duration while a room is connected, whereas reader rooms hibernate between events. Review [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), and [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/) usage in the Cloudflare dashboard. No paid subscription is required by the configuration.
