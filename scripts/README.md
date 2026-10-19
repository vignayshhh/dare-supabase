# Scripts Directory

Operational scripts use the Supabase environment variables documented in
`DEPLOYMENT.md`. They must not contain credentials, import old user data, or
connect to a retired backend.

Load testing uses `LOAD_TEST_SUPABASE_ACCESS_TOKEN` or
`LOAD_TEST_SUPABASE_ACCESS_TOKENS` and sends requests to the active Next.js
API routes.
