# Coverage Planner — Setup

Greenhill School internal class-coverage app. Next.js 16 (App Router) + Supabase + Drizzle, deployed on Vercel.

## 1. Supabase project

1. Sign in to [supabase.com](https://supabase.com) and create a new project. Pick a strong database password and a region close to you (US East is fine).
2. Once provisioned, go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` `public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` `secret` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this server-only)
3. Go to **Project Settings → Database → Connection string**, choose the **Transaction** pooler tab, and copy the URL into `DATABASE_URL` (replace `[YOUR-PASSWORD]` with the real password).

## 2. Local environment

```bash
cp .env.example .env.local
# Then fill in the values from step 1.
npm install        # already done if you cloned with deps
npm run db:push    # creates the schema in your Supabase Postgres
npm run dev        # http://localhost:3000
```

Visit `/login`, request a magic link, and confirm sign-in works end to end.

## 3. Resend (transactional email for day-before reminders) — **disabled at launch**

The day-before reminder feature is fully wired but the Vercel cron is currently
**disabled** in `vercel.json` (empty `crons` array). The route still works for
manual testing — see below. To enable in production:

1. Sign up at [resend.com](https://resend.com) and verify a sending domain you own (a subdomain like `mail.greenhill.org` is the simplest). Until a domain is verified, Resend will only deliver to the email you signed up with.
2. Create an API key → `RESEND_API_KEY`. Set `EMAIL_FROM` to a verified address (e.g. `coverage@mail.greenhill.org`).
3. Generate a `CRON_SECRET` (any random ≥8 char string) and set it locally and in Vercel's env settings.
4. Re-enable the cron by editing `vercel.json`:
   ```json
   {
     "crons": [
       { "path": "/api/cron/reminders", "schedule": "0 22 * * *" }
     ]
   }
   ```
5. Redeploy on Vercel for the cron change to take effect.

The cron handler at `/api/cron/reminders`:
- Finds every claimed slot scheduled for tomorrow
- Groups by coverer
- Sends one consolidated email per coverer with a list of all their blocks
- Idempotent — re-runs in the same day will skip already-reminded slots

To test the cron locally (cron itself doesn't need to be enabled for this):
```bash
curl "http://localhost:3000/api/cron/reminders?secret=$CRON_SECRET"
```

> Supabase still sends magic-link sign-in emails via its own SMTP. Resend is only used by the reminder cron.

## 4. Vercel

1. Push this folder to a new GitHub repo.
2. In Vercel → **Add New → Project**, import the repo. Framework auto-detects Next.js.
3. Add the environment variables from `.env.local` (set `APP_URL` to the Vercel URL once known, e.g. `https://coverage-planner.vercel.app`).
4. After the first deploy, in **Supabase → Authentication → URL Configuration**, add the deployed origin to **Site URL** and add `https://<your-vercel-url>/auth/callback` to **Redirect URLs**.

## 5. Schema migrations

- Edits to `src/lib/db/schema.ts` → `npm run db:generate` to create a SQL migration → `npm run db:migrate` (or `npm run db:push` for quick iteration in dev).
- Inspect data with `npm run db:studio`.
