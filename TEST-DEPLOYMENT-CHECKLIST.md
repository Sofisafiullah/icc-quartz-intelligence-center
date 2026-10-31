# Test deployment checklist

- [ ] Create a NEW private GitHub repository named `icc-quartz-intelligence-center-test`.
- [ ] Upload the contents of this folder to that repository (not to the production repository).
- [ ] Create a NEW Vercel project from that repository (not the existing production Vercel project).
- [ ] Create a NEW PostgreSQL database named `icc_quartz_test`.
- [ ] Add `APP_ENV=testing` to the new Vercel project's environment variables.
- [ ] Add `QUARTZ_TEST_DATABASE_URL` pointing only to `icc_quartz_test`.
- [ ] Add a unique `CRON_SECRET`; optionally add `CENSUS_API_KEY`.
- [ ] Do NOT add or reuse the production `DATABASE_URL` or production database credentials.
- [ ] Deploy and confirm `/api/health` reports `database_configured: true`.
- [ ] Only after confirming the database is the test database, run the CBP and Census sync actions.

The application refuses to connect unless `APP_ENV=testing` is set and the database name includes `test`, `testing`, or `sandbox`. Initialization does not delete historical rows. Nevertheless, use a brand-new database and keep production credentials out of this project.
