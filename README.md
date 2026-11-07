# TripleA

Car wash at the parking bay for Ministry of Commerce and Industry employees, with an operations dashboard.
English by default, Arabic (right to left) on request.

- **Employees** sign up or sign in with their mobile number, order a wash, follow it live and see the car inspection.
- **Staff** use the dashboard at `/admin` (Supabase sign in) to run the queue, inspect cars, manage passes and clients, see Insights and print the employee QR code.

Built with Next.js 16 (App Router), React 19, Tailwind CSS 4 and Supabase. Read `AGENTS.md` before changing code: this Next.js version differs from older ones.

## Run it

```bash
npm install
npm run dev
```

Without any environment variables the app runs in local demo mode (data kept in the browser and a local file). To use the real database, create `.env.local` (it is git-ignored) with:

| Variable | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public (anon) key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase secret key. Server only, never in the browser |
| `SESSION_SECRET` | A long random string that signs employee sessions |
| `ADMIN_EMAILS` | Comma separated emails allowed into the dashboard |
| `NEXT_PUBLIC_SITE_URL` | The final public address, for example `https://example.com`. The QR code is built from it |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP`, `NEXT_PUBLIC_SUPPORT_CALL` | Optional. Support numbers, digits only with the country code |

Never commit real keys.

## Database

Run these in the Supabase SQL editor, in this order, when setting up a new project:

1. `supabase/schema.sql`
2. `supabase/migration_v2_dashboard.sql`
3. `supabase/migration_numeric_bays.sql`
4. `supabase/migration_v3_inspection.sql`
5. `supabase/migration_v2_lockdown.sql` once everything works. It closes the tables to the public key, so only the server reads and writes them.

Create the admin user in Supabase Auth and give them the admin role (the end of `migration_v2_lockdown.sql` explains how).

## Tests and checks

```bash
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test tests/*.test.mts
npm run build
```

## Notes

- Days in Insights and the QR statistics follow Doha time (UTC+3).
- Photos and videos are private files in Supabase Storage, shown through signed links.
- The employee QR code points to `/qr`, a fixed address that counts the scan and sends the person to the app, so a printed code never needs to change.
