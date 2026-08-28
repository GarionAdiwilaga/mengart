# Mengart Production Deployment & Operations Runbook

**Target Architecture:** Next.js 16 (React 19 / Turbopack), PostgreSQL 16, Redis 7, BullMQ Worker, Nginx / Cloudflare Edge TLS.

---

## 1. Production Prerequisites

### Server Specifications (Minimum)
- **CPU:** 2 vCPU
- **RAM:** 4 GB
- **Disk:** 50 GB SSD (or mounted persistent object storage)
- **OS:** Ubuntu 22.04 LTS or Debian 12
- **Docker Engine:** v24.0+ & Docker Compose v2.20+

---

## 2. Environment Configuration (`.env.production`)

```bash
# Server Environment
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Database
DATABASE_URL=postgresql://mengart:<STRONG_PASSWORD>@postgres:5432/mengart_db

# Redis & Background Workers
REDIS_URL=redis://redis:6379

# Authentication (NextAuth / Auth.js)
AUTH_SECRET=<GENERATE_WITH_OPENSSL_RAND_BASE64_32>
NEXTAUTH_URL=https://mengart.yourdomain.com

# OAuth Providers
GOOGLE_CLIENT_ID=<YOUR_GOOGLE_CLIENT_ID>
GOOGLE_CLIENT_SECRET=<YOUR_GOOGLE_CLIENT_SECRET>

# Email / SMTP Delivery
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASSWORD=<YOUR_API_KEY>
EMAIL_FROM="Mengart Atelier <noreply@mengart.yourdomain.com>"

# Storage Path (Persistent volume mounted)
STORAGE_ROOT_DIR=/app/storage
```

---

## 3. Deployment Topology

```text
Internet
   │
   ▼
[Cloudflare Edge / Nginx Reverse Proxy (HTTPS :443)]
   │
   ├──▶ [mengart_web :3000] (Next.js Standalone Runner)
   │        │
   │        ├──▶ [mengart_postgres :5432] (PostgreSQL 16)
   │        └──▶ [mengart_redis :6379] (Redis 7 AOF)
   │
   └──▶ [mengart_media_worker] (BullMQ Media Processing Worker)
            │
            └──▶ [/app/storage] (Shared Media Volume)
```

---

## 4. First-Time Setup & Deployment

### Step 1: Clone Repository & Create Environment File
```bash
git clone https://github.com/YourOrg/Mengart.git /opt/mengart
cd /opt/mengart
cp .env.example .env.production
```

### Step 2: Database Migration & Seeding
```bash
# Start database and redis
docker compose up -d postgres redis

# Run database schema migrations
npm run db:push
# or npm run db:migrate

# Optional: Seed initial admin user
npx tsx src/db/seed.ts
```

### Step 3: Launch All Services
```bash
docker compose -f docker-compose.yml up -d --build
```

### Step 4: Verify Health Probes
```bash
curl -I http://localhost:3000/api/health/liveness
# Expected: HTTP/1.1 200 OK

curl -I http://localhost:3000/api/health/readiness
# Expected: HTTP/1.1 200 OK
```

---

## 5. Nginx Reverse Proxy Configuration Template

`/etc/nginx/sites-available/mengart.conf`:

```nginx
server {
    listen 80;
    server_name mengart.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name mengart.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/mengart.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mengart.yourdomain.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Client body limit for high-resolution master artwork uploads (60MB)
    client_max_body_size 60M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Range request acceleration for public media streaming
    location /api/media/public/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_force_ranges on;
        proxy_cache_valid 200 206 30d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
```

---

## 6. Automated Backup & Disaster Recovery

### Configure Nightly Cron Job
Run `crontab -e` and append:
```bash
# Nightly backup at 02:00 WITA (UTC+8)
0 18 * * * /opt/mengart/scripts/backup.sh >> /var/log/mengart_backup.log 2>&1
```

### Restore from Backup
```bash
/opt/mengart/scripts/restore.sh <TIMESTAMP_OR_MANIFEST>
# Example: /opt/mengart/scripts/restore.sh 20260828_120000
```

---

## 7. Rollback Procedure

If a deployed release encounters a critical runtime regression:
```bash
# 1. Stop web and worker services
docker compose stop web worker

# 2. Checkout previous known-stable commit / tag
git checkout <PREVIOUS_RELEASE_TAG>

# 3. Rebuild and launch
docker compose up -d --build web worker

# 4. Verify readiness probe
curl -f http://localhost:3000/api/health/readiness
```

---

## 8. Challenge Lifecycle Scheduler & Automated State Materializer

Challenge status transitions (`scheduled -> submission_open` and `submission_open -> submission_locked`) run on an authoritative, concurrency-idempotent scheduler. Production supports two invocation modes:

### Option A: Local / Server Crontab (CLI Runner)
Run `crontab -e` on the host server or worker container:
```bash
# Execute scheduler every minute
* * * * * cd /opt/mengart && npm run cron:materialize >> /var/log/mengart_cron.log 2>&1
```

### Option B: Cloud Scheduler / Vercel Cron (HTTP Endpoint)
Configure an external scheduler or cloud cron trigger to invoke the protected endpoint:
- **URL:** `https://mengart.yourdomain.com/api/cron/materialize-challenges`
- **Method:** `GET` or `POST`
- **Header:** `Authorization: Bearer <CRON_SECRET>` (configured in `.env.production`)
- **Frequency:** Every 1–5 minutes.

All executions utilize conditional database status updates to ensure complete concurrency idempotency with zero duplicate audit log entries.
