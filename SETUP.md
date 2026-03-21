# GitVital (RepoPulse) Setup Guide

This guide covers everything you need to get the GitVital (formerly RepoPulse) mono-repo up and running on your local machine.

---

## 1. Prerequisites

Before securely running the dual-stack architecture (Express API, BullMQ Worker, Next.js Frontend), ensure you have:
- **Node.js**: v20+ recommended
- **PostgreSQL Database**: Free-tier cloud instances like [Neon.tech](https://neon.tech/) work perfectly
- **Redis Instance**: Free-tier cloud instances like [Upstash](https://upstash.com/) work perfectly
- **GitHub OAuth App**: Create one in your GitHub Developer Settings (`http://localhost:8080/auth/github/callback`)
- **Google Gemini API Key**: For the AI advice layer

---

## 2. Installation

Clone the repository and install dependencies for both sides of the mono-repo.

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

---

## 3. Database Initialization

The PostgreSQL schema is managed manually during this phase via strict SQL scripts. 

Connect your Postgres client (e.g., `psql`, pgAdmin, DBeaver) to your database and execute the bootstrap script located at:
- `backend/sql/001_refined_schema.sql`

*(Note: The `002_maintenance.sql` script is for weekly cron optimizations, not initial bootstrap).*

---

## 4. Environment Variables

Create your environment configuration by copying the provided template:

```bash
cd backend
cp .env.example .env
```
Open `backend/.env` and replace the placeholder values with your actual database strings, API keys, and 64-character hex security secrets.

---

## 5. Starting the Application

This architecture is robust because it detaches the heavy GraphQL polling from the main REST server. To run the application, you need **three** separate terminal windows.

### Terminal 1: Backend API Server
Serves all `/api/*` REST endpoints and handles OAuth.
```bash
cd backend
npm run dev
```

### Terminal 2: BullMQ Worker Engine
Continuously consumes the Redis queue, executing complex repository and contributor metric mathematics in the background.
```bash
cd backend
# Starts src/workers/repoAnalyzer.ts automatically
npm run worker 
```
*(If you have a dedicated `userAnalyzer.ts` script in your `package.json`, you may need a fourth terminal for `npm run worker:user` if applicable to your config).*

### Terminal 3: Frontend Client
Serves the Next.js static and dynamic UI layers.
```bash
cd frontend
npm run dev
```

---

## 6. Verification

- Open your browser to `http://localhost:3000` (Frontend).
- Verify the backend is listening on `http://localhost:8080`.
- Terminal 2 (BullMQ Worker) should log `✅ Redis connected` and `✅ Redis memory policy set: maxmemory=100mb` gracefully upon boot.

Congratulations — the local environment is functional and strictly within free-tier limits!
