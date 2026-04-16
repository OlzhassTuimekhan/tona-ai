# JOIS — Joint Oversight & Insight System

**JOIS** is an open-source GovTech stack that turns recordings of public meetings into structured **commitment cards** (who promised what, with quotes and deadlines) and lets citizens verify, challenge, and rate local government follow-through.


## Problem statement

Public decisions in Kazakhstan and the wider region are often captured only as **audio**: promises stay on the tape, not in a checkable register. Citizens lack a simple way to say whether a commitment was met, misstated, or still open, and there is no transparent, evidence-linked **organizational rating** derived from real feedback.

## Features

- **Speech-to-text** (Soniox) plus **LLM extraction** of summaries, speakers, and commitments with quotes and deadlines  
- **Quote verification** against the full transcript to flag weak or invented citations  
- **Role-based access**: admin (users + dashboard), akim (own org’s sessions), public read-only + observations  
- **Registry & publishing** workflow: import analysis results, edit, publish to citizens  
- **Citizen observations** with optional voice check and photo evidence; **organization ratings** (traffic-light style)  
- **Docker Compose** stack: API, Celery worker, Redis, PostgreSQL, React frontend, optional HTTPS reverse proxy for microphone access on LAN  

## Repository layout

```
.
├── src/
│   ├── app/           # FastAPI backend (Python)
│   ├── web/           # React + Vite frontend (TypeScript)
│   └── scripts/       # Maintenance utilities (e.g. Redis → Postgres migration)
├── docs/              # Extra documentation, example speech text, nginx-ssl helpers
├── tests/             # Reserved for automated tests
├── assets/            # Shared static assets (placeholders for now)
├── docker-compose.yml
├── Dockerfile         # Backend image
├── requirements.txt
├── .env.example
├── LICENSE
└── README.md
```


## Installation

**Prerequisites:** Docker & Docker Compose v2+, API keys for **Soniox** and an **OpenAI-compatible LLM** (e.g. via OpenRouter).

```bash
git clone <your-fork-url> tona-ai
cd tona-ai

cp .env.example .env
# Set at minimum: SONIOX_API_KEY, LLM_API_KEY
# Optional: DATABASE_URL for PostgreSQL (see docker-compose postgres service)

docker compose up -d --build
docker compose ps
```

**HTTPS for browser microphone on a LAN IP** (optional): generate certs and use the `https-proxy` service — see comments in `docker-compose.yml` and `./docs/nginx-ssl/generate-cert.sh`.

## Usage

| Step | Action |
|------|--------|
| Web UI | Open [http://localhost:5173](http://localhost:5173) (Compose maps host **5173** → frontend container) |
| API docs | Open [http://localhost:8080/docs](http://localhost:8080/docs) (Compose maps host **8080** → API **8000** inside the container) |
| Login | Default admin: `admin` / `admin` — change via `ADMIN_USERNAME` / `ADMIN_PASSWORD` in `.env` |

**Typical flow (official):** admin creates an **akim** user tied to an organization → akim uploads meeting audio → waits for Celery job → imports result into the registry → publishes → citizens browse and leave observations on the public pages.

**API smoke test (with JWT):**

```bash
curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin"}'
# Use access_token from the response:
curl -s -X POST http://localhost:8080/api/v1/jobs/file \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@path/to/meeting.mp3" \
  -F "analysis_type=meeting"
```

**Maintenance scripts** (from repo root):

```bash
python src/scripts/test_temp_audio.py
python src/scripts/migrate_redis_to_postgres.py   # requires DATABASE_URL and Redis access
```

## Technology stack

| Layer | Technologies |
|-------|----------------|
| Backend | Python 3.12, FastAPI, Uvicorn, Celery, Pydantic Settings |
| Data / queue | Redis 7, PostgreSQL 16 (optional persistence for registry) |
| AI | Soniox (ASR), OpenAI-compatible LLM APIs |
| Frontend | React 19, TypeScript, Vite 8, Nginx for production static + `/api` proxy |
| Infra | Docker, Docker Compose |

## API overview

- **Auth:** `POST /api/v1/auth/login`, `GET /api/v1/auth/me`  
- **Jobs:** upload audio (`/api/v1/jobs/file`, `/api/v1/jobs/url`), poll status  
- **Registry:** import, list, publish sessions (akim/admin)  
- **Public:** list published sessions, post observations, ratings, stats  


## Team members
Olzhas Tuimekhan 230103030
Madi Baizhuman 230103047
Alzhazira Zhumat 230103141
Onlan Meyirlan 230103209
