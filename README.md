# NSB Reader

High-school National Science Bowl practice with solo tossups, bonuses, paired questions, private multiplayer rooms, and reader-led in-person practice. The interface and reading controls use [QBReader](https://github.com/qbreader/website).

## Run locally

1. Install Node.js 22 or newer and run `npm ci`.
2. Create a PostgreSQL database, or start local Supabase with `supabase start`.
3. Apply the SQL files in `supabase/migrations/` in filename order. With Supabase, use `supabase db reset` for a fresh local database.
4. Copy `.env.example` to `.env` and set the database URL.
5. Import questions using the [question importer](tools/import/README.md).
6. Run `npm run build`, then `npm start`. Open http://localhost:3000.

Run `npm test` for behavior and parser checks. Run `npm run lint` for JavaScript formatting.

[Product specification](SPEC.md) · [Contributing](.github/CONTRIBUTING.md)

## In-person rooms

Open `/play/in-person/` to create a reader room or join with a six-digit code. The reader controls question selection, timers, judgments, team assignments, and scores. Player devices get a buzzer and generated username. Reader credentials and player reconnect identities stay in their respective browsers; room state and performance statistics stay in server memory for the session. Use the same server address on all devices.

## Storage

The server connects directly to PostgreSQL. Supabase supplies managed PostgreSQL; the browser does not require a Supabase key. Questions and question reports are stored in the database. Stars and preferences stay in the browser, and multiplayer statistics last for the room session.

Production requires `SECRET_KEY_1` and `SECRET_KEY_2` for signed session cookies, plus a PostgreSQL connection URL. Keep credentials in environment variables.
