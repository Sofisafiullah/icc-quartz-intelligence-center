# ICC Quartz Intelligence Center — Isolated Testing Build

**TEST / DEVELOPMENT ENVIRONMENT ONLY.** This repository is intended for a separate GitHub repository, a separate Vercel project, and a brand-new test PostgreSQL database. It is not a replacement for the existing production Quartz Quota Command Center.

## What this build tracks

- CBP Quartz quota/license `99034530QTZ01` with weekly source-verified snapshots and the existing custom four-quarter safeguard calendar.
- U.S. Imports for Consumption of covered quartz by origin: Cambodia (Census country code `5550`), Philippines (`5650`), and South Korea (`5800`).
- HTS codes `6810990020` and `6810990040`; monthly quantities and calendar-quarter rollups in M².
- Monthly and quarterly origin summaries are calculated from the monthly Census quantities. The quarter rollup uses **calendar quarters**, while the safeguard quota cards use the **custom safeguard quarters** shown in the tariff module. These are different calendars and are labelled separately.

## Data isolation — read before deployment

1. Create a **new private GitHub repository** for this project. Do not push this folder to the production repository.
2. Create a **new Vercel project** connected only to the new repository. Do not import or change the production Vercel project.
3. Create a **brand-new PostgreSQL database** for testing. Do not use the production database host/database or copy the production connection string.
4. In the new Vercel project, set `APP_ENV=testing` and `QUARTZ_TEST_DATABASE_URL` to the new test database connection string. Name the database `icc_quartz_test` (or include `test`, `testing`, or `sandbox` in its database name); the application blocks connections whose database name does not clearly identify it as a test database. This build deliberately ignores `DATABASE_URL`; it will not connect unless both test-specific settings are present.
5. Add `CRON_SECRET` and optionally `CENSUS_API_KEY` as server-side environment variables. Never put secrets in frontend files or commit `.env` files.
6. Keep the test database credentials separate from production. Do not enable shared production environment variables for this project.

### Historical data protection

- This build has no connection to the production database by default.
- Database initialization creates tables but **does not delete existing quota history**. The destructive legacy-row cleanup from the source package has been removed.
- CBP snapshots are inserted only after parser validation. If an already archived report date returns different values, the sync fails closed rather than overwriting that snapshot.
- Origin-import rows are upserted by month/country/HTS in the **test database only**.
- The seed snapshot is used only as a test database bootstrap when no quota history exists.

> **Important:** The code-level guard is an additional safeguard, not a substitute for using a separate test database. Verify the host and database name of `QUARTZ_TEST_DATABASE_URL` before the first refresh.

## Stack

- Static HTML/CSS/JavaScript frontend
- Vercel serverless functions in `/api`
- PostgreSQL via `QUARTZ_TEST_DATABASE_URL` (requires `APP_ENV=testing`)
- Weekly Vercel Cron: Monday 13:30 UTC
- CBP Commodity Status Report source
- U.S. Census Bureau International Trade API for origin imports

## Deploy to the new test project

1. Extract this ZIP. Upload the **contents** of `quartz-quota-command-center-main` to the new private GitHub repository.
2. Import that new repository as a new Vercel project. Use Framework Preset **Other**.
3. Provision a new PostgreSQL database for testing (for example, `icc_quartz_test`).
4. Add `APP_ENV=testing`, `QUARTZ_TEST_DATABASE_URL`, and `CRON_SECRET` in the new Vercel project. Add `CENSUS_API_KEY` if available.
5. Redeploy, then verify `/api/health` reports `database_configured: true`.
6. Verify the Vercel database URL is the test database before using any Sync button.

## API endpoints

- `GET /api/health`
- `GET /api/summary`
- `GET /api/history`
- `GET /api/logs`
- `POST /api/refresh` — scan and archive CBP reports
- `POST /api/backfill` — explicit historical CBP sync
- `GET /api/origin-imports` — monthly and calendar-quarter origin-import summaries
- `POST /api/origin-refresh` — synchronize one completed month per request (JSON body: `{\"month\":\"YYYY-MM\"}`)
- `/api/cron` — weekly CBP and Census sync

## Origin country codes

The Census Bureau's official country-code list identifies Cambodia as `5550`, Philippines as `5650`, and South Korea as `5800`. Source: https://www2.census.gov/programs-surveys/trade/schedules/c/countrycode.html


## Screenshot-recovered CBP history (TEST only)
The one-time `POST /api/restore-cbp-screenshot-history` endpoint restores the 11 report rows transcribed from the user's Oct. 31, 2026 screenshot. It requires `Authorization: Bearer <CRON_SECRET>`, inserts only missing report dates, and never updates an existing row. Restored rows are tagged `source_type=SCREENSHOT` and `validation_status=RECOVERED FROM SCREENSHOT`; the dashboard labels their source accordingly. Normal CBP PDF rows remain tagged `CBP_PDF`.

After the one-time restoration is complete, remove `api/restore-cbp-screenshot-history.js` from the TEST repository in a follow-up commit.


## v1.3 — Reliable monthly Census synchronization
- Census sync now processes one completed month per Vercel request instead of requesting every month in one long-running function.
- The dashboard shows month-by-month progress and always resets the Sync button when a request finishes or fails.
- Complete historical months are skipped; incomplete months are retried, and the latest available month is rechecked for Census revisions.
- The current, incomplete calendar month is not queried. The weekly cron checks only the two most recent completed months; manual sync fills older missing months.
- Each Census request has a short timeout; a slow or unavailable Census response is reported as skipped/error rather than leaving the UI waiting indefinitely.
- Origin-import rows continue to upsert only in the isolated test database. CBP weekly history is untouched.
