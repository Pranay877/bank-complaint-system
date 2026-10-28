# Banking & UPI Complaint Tracking System — Supabase deployment

This package adapts the supplied project from local MySQL to Supabase PostgreSQL while keeping the existing HTML/CSS/JS frontend and Node.js API structure.

## 1. Create the Supabase database
1. Create a new project at https://supabase.com/.
2. Open SQL Editor -> New query.
3. Paste and run `database/schema.sql`.
4. In Project Settings / Connect, copy a PostgreSQL connection string. Prefer the Supabase pooler connection string for hosted app connections when the direct database host is not reachable from the host.

## 2. Push the project to GitHub
Upload the project folder contents to a repository. Do not upload `.env` files, database passwords, or real secrets. `node_modules` is intentionally excluded.

## 3. Deploy on Render
1. Create a Render Web Service connected to the GitHub repository.
2. If using `render.yaml`, allow Render to create the service from the Blueprint. Otherwise leave Root Directory blank (repository root) so the `frontend` folder is available to the backend, and set:
   - Build command: `cd backend && npm install`
   - Start command: `cd backend && npm start`
3. Add environment variables:
   - `DATABASE_URL`: the Supabase PostgreSQL connection string
   - `JWT_SECRET`: a long random secret (Render can generate one)
   - `NODE_ENV`: `production`
4. Deploy. The backend serves the frontend too, so one Render URL serves both the pages and `/api/...` routes.
5. Test `https://YOUR-RENDER-SERVICE.onrender.com/health` and `/api/categories`.

## 4. Register and test
- Open the deployed root URL.
- Register a new customer through the site.
- Log in and create a test complaint.
- Check that it appears in the dashboard and in Supabase Table Editor.
- The SQL setup creates categories only, not a demo employee. Employee accounts should be created by a trusted administrator with a bcrypt password hash and role `employee`.

## Important changes made
- Replaced `mysql2` with `pg`.
- Converted database access to PostgreSQL, including parameter placeholders and transaction handling.
- Updated PostgreSQL-specific aggregate queries and identity inserts.
- Changed server port to `process.env.PORT` for hosting.
- Moved JWT secret to `JWT_SECRET` environment variable.
- Added `/health` for host health checks.

## Security notes
This is still a college demonstration project, not a production banking service. Do not collect real financial credentials, UPI PINs, OTPs, or actual customer financial data. Before any real deployment, review authentication, authorization, rate limiting, audit logging, backups, and Supabase Row Level Security/privileged database access. Keep the database URL server-side only.
