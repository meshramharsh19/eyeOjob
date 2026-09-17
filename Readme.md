# eyeOjob

A job-tracking application with a Node/Express + MySQL backend and a React (Vite) frontend.

## Project structure

```
client/   React + Vite frontend
server/   Express API server
docker/   Dockerfiles for client/server
db_backup/  MySQL dump(s)
docker-compose.yml
```

## Prerequisites

- Node.js 18+ and npm
- MySQL 8 (local install, XAMPP, or Docker)

## 1. Install dependencies

From the project root (this is an npm workspaces monorepo):

```bash
npm install
```

## 2. Configure environment variables

Copy the example env files and fill in the values:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

At minimum, in `server/.env` set:

- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` — your MySQL connection
- `JWT_SECRET` — any random string
- `CLIENT_URL` — usually `http://localhost:5173`

Other keys (Google OAuth, Groq/Gemini/OpenRouter API keys, mail credentials) are only required if you use those features.

## 3. Set up the database

Create the database and import the schema/data:

```bash
mysql -u root -p -e "CREATE DATABASE eyeOjob"
mysql -u root -p eyeOjob < db_backup/eyeojob_final_20260909_001926_with_sync_status.sql
```

(Adjust the filename if you're using a newer backup.)

## 4. Run the app (development)

Run each in its own terminal from the project root:

```bash
npm run dev:server   # API on http://localhost:5000
npm run dev:client   # Frontend on http://localhost:5173
```

Open http://localhost:5173 in your browser.

## Running with Docker instead

```bash
docker-compose up --build
```

This starts MySQL, the server (port 5000), and the client (port 5173). Make sure `server/.env` exists before running — it's loaded via `env_file` in `docker-compose.yml`.

## Tests

```bash
npm run test --workspace=server
```
