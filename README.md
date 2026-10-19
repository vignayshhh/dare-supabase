# Dare

Dare is a Next.js social app backed by Supabase. Authentication, Postgres data, Storage, and
Realtime use the Supabase project configured through environment variables.

See [DEPLOYMENT.md](DEPLOYMENT.md) for project setup, Auth redirects, Storage, Realtime, and
production deployment instructions.

## Getting started

Copy an environment template to `.env.local`, fill in the Supabase values, then run:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

Useful checks:

```bash
npm run type-check
npm test -- --runInBand
npm run build
```

Optional Capacitor mobile wrappers:

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
```

Configure the web environment first. Deployment uses the Next.js/Vercel workflow described above.
