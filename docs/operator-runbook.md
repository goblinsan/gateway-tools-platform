# Operator Runbook

This document is addressed to the **local operator** responsible for
deploying `gateway-tools-platform` on the gateway host.  It supplements the
public documentation with step-by-step instructions that reference
private-infrastructure specifics by **placeholder only** — fill in real
values locally; never commit them.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Docker Engine ≥ 24 and Docker Compose v2 | `docker compose version` must succeed. |
| Git access to this repository | Needed to pull the image source. |
| Access to the gateway host | SSH or equivalent. |
| Cloudflare Access application configured | See [Step 3](#step-3-wire-cloudflare-access-at-the-reverse-proxy). |
| Internal STT and CV services reachable from the gateway host | Confirm with `curl http://<stt-host>:<port>/transcribe` (expects a non-404). |

---

## Step 1 — Clone and build the image

```bash
git clone https://github.com/goblinsan/gateway-tools-platform.git
cd gateway-tools-platform
docker build -t gateway-tools-platform:latest .
```

Alternatively, pull a pre-built image from your private registry if one is
available.

---

## Step 2 — Provision the environment file

Copy the example file and fill in real values:

```bash
cp .env.example .env.local
```

Minimum required values for production:

```
STT_SERVICE_URL=http://<stt-host>:<port>
CV_SERVICE_URL=http://<cv-host>:<port>
DATA_ROOT=/data
DATA_ROOT_HOST=/var/lib/gateway-tools/data
```

Do **not** set `CF_ACCESS_DEV_EMAIL` in production.

See `.env.example` for all recognised variables and their descriptions.

---

## Step 3 — Wire Cloudflare Access at the reverse proxy

The application trusts the `Cf-Access-Authenticated-User-Email` header
injected by Cloudflare Access.  The reverse proxy (nginx, Caddy, etc.) that
sits in front of the container **must**:

1. **Terminate Cloudflare Access JWT validation** before passing requests to
   the container.  Cloudflare's OIDC/JWT verification should happen at the
   edge or at the reverse proxy using the Cloudflare Access service token
   feature.

2. **Strip any client-supplied `Cf-Access-Authenticated-User-Email` header**
   before forwarding to the origin, to prevent impersonation.  Example nginx
   directive:

   ```nginx
   proxy_set_header Cf-Access-Authenticated-User-Email "";
   ```

   Cloudflare will re-add the correct value after its own authentication check.

3. **Forward the header** from Cloudflare to the origin container:

   ```nginx
   # Cloudflare injects this; ensure it reaches the Next.js app.
   proxy_pass_header Cf-Access-Authenticated-User-Email;
   ```

4. **Set appropriate proxy timeouts** for tool endpoints:

   ```nginx
   # Routes that proxy to the STT or CV service need longer timeouts.
   location ~ ^/api/tools/ {
       proxy_read_timeout 120s;
       proxy_send_timeout 120s;
       proxy_pass http://localhost:3000;
   }

   location / {
       proxy_read_timeout 30s;
       proxy_pass http://localhost:3000;
   }
   ```

5. **Expose the health endpoint without authentication** so that
   `gateway-control-plane` can poll it:

   ```nginx
   location = /api/health {
       proxy_pass http://localhost:3000;
       # Do not require Cloudflare Access JWT on this path.
   }
   ```

---

## Step 4 — Choose and prepare durable storage

Pick a persistent host path that survives reboots:

```bash
mkdir -p /var/lib/gateway-tools/data
```

Set `DATA_ROOT_HOST` in `.env.local` so docker compose mounts the persistent
host path into the container:

```yaml
volumes:
  - ${DATA_ROOT_HOST:-./data}:/data
```

Both blue and green slots must mount the **same host path** so that session
data is available regardless of which slot is active.

For gateway-control-plane managed blue/green deploys, keep the env file and
data path outside the slot checkout:

```bash
mkdir -p /srv/apps/gateway-tools-platform/shared/data
cat >/srv/apps/gateway-tools-platform/shared/.env.local <<'EOF'
STT_SERVICE_URL=http://<stt-host>:<port>
CV_SERVICE_URL=http://<cv-host>:<port>
DATA_ROOT=/data
DATA_ROOT_HOST=/srv/apps/gateway-tools-platform/shared/data
EOF
```

---

## Step 5 — Register the app in gateway-control-plane

In your local `gateway-control-plane` configuration (not committed here), add
an entry for this service.  The exact schema depends on your control-plane
version; the following properties are required:

| Property         | Value                                               |
|------------------|-----------------------------------------------------|
| `name`           | `gateway-tools-platform`                            |
| `blue.port`      | `3000`                                              |
| `green.port`     | `3001`                                              |
| `healthPath`     | `/api/health`                                       |
| `healthTimeout`  | `5s`                                                |
| `composeFile`    | Absolute path to `docker-compose.yml` in this repo  |
| `workDir`        | Absolute path to the repository root on the host    |

Example (adapt to your control-plane config format):

```yaml
services:
  gateway-tools-platform:
    blue:
      port: 3000
      containerName: gateway-tools-blue
    green:
      port: 3001
      containerName: gateway-tools-green
    healthPath: /api/health
    healthTimeout: 5s
    composeFile: /opt/gateway-tools-platform/docker-compose.yml
    workDir: /opt/gateway-tools-platform
```

---

## Step 6 — Initial deployment

Start the blue slot:

```bash
cd /opt/gateway-tools-platform   # wherever you cloned/installed the repo
docker compose --profile blue up -d
```

Verify the health endpoint:

```bash
curl -sf http://localhost:3000/api/health
# expected: {"status":"ok"}
```

Once healthy, point the reverse proxy at `:3000`.

---

## Step 7 — Subsequent deploys (blue/green swap)

1. Pull or build the new image:

   ```bash
   docker build -t gateway-tools-platform:latest .
   ```

2. Start the standby slot (e.g. green if blue is active):

   ```bash
   docker compose --profile green up -d
   ```

3. Wait for green to pass its health check:

   ```bash
   curl -sf http://localhost:3001/api/health
   ```

4. Update the reverse proxy upstream to `:3001`.

5. Stop the old blue slot:

   ```bash
   docker compose --profile blue down
   ```

`gateway-control-plane` can automate steps 2–5 if configured to do so (see
Step 5 above).

---

## Routine maintenance

### Log access

```bash
docker logs gateway-tools-blue   # or gateway-tools-green
```

### Data retention / cleanup

Run the cleanup script periodically (daily cron recommended) against the data
volume.  See [storage.md](storage.md) for a ready-to-use Node.js snippet
and guidance on right-to-erasure requests.

### Updating the image

Repeat the blue/green swap procedure in Step 7.

---

## Troubleshooting

| Symptom | Likely cause | Resolution |
|---------|--------------|------------|
| All requests redirect to `/unauthorized` | `Cf-Access-Authenticated-User-Email` header not reaching the container | Check reverse proxy config (Step 3). |
| `STT_SERVICE_URL environment variable is not set` in logs | `.env.local` not present or missing the variable | Check Step 2. |
| Health check fails immediately | Container still starting | Increase `start_period` in the health-check config; check `docker logs`. |
| Data missing after blue/green swap | Both slots not sharing the same host volume path | Verify both profiles mount the same host path (Step 4). |
| 502 errors on `/api/tools/stt` or `/api/tools/cv` | Upstream service unreachable or timed out | Check `STT_SERVICE_URL` / `CV_SERVICE_URL` values and reverse proxy timeouts (Step 3). |
