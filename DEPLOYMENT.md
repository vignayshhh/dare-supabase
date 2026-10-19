# Dare deployment: fresh Supabase backend

Dare starts with a new Supabase project. Existing production data is not imported by this repository.

## Configure Supabase

1. Create a new Supabase project.
2. In SQL Editor, run the committed migration in `supabase/migrations/20261010000000_fresh_dare_schema.sql`, or run `npx supabase db push` after linking the project.
3. Configure Auth → URL Configuration:
   - Site URL: your production app URL
   - Redirect URL: `https://your-domain.example/auth/callback`
4. Enable email confirmation/reset delivery. Enable Google OAuth if that provider is retained.
5. Configure Storage and Realtime from the migration. Keep the buckets private.

## Environment

Set these in local/Vercel project settings. Never expose the secret key with `NEXT_PUBLIC_`.

```text
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_APP_URL=https://your-domain.example
```

Then run:

```text
npm install
npm run type-check
npm run build
```

For the optional Capacitor Android wrapper, run `npm run mobile:sync` after configuring the
web app. Android uses the standard Capacitor build; no additional service file is required.
Google sign-in, when enabled, is configured as a Supabase Auth provider above.

The Supabase CLI can initialize/reset a local database with `npx supabase start` and `npx supabase db reset`. Live-project RLS, email delivery, OAuth, and Storage checks require project credentials and are not run by the repository build.
