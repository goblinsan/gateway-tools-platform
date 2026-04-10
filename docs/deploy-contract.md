# Blue/Green Deploy Contract

This document defines the contract between `gateway-tools-platform` and
`gateway-control-plane`.  The control-plane must honour this contract exactly
when deploying the service; the application expects to receive these conditions
at runtime.

---

## Published ports

| Slot  | Host port | Container port |
|-------|-----------|----------------|
| blue  | `3000`    | `3000`         |
| green | `3001`    | `3000`         |

The active slot is the one currently receiving traffic from the reverse proxy.
The standby slot is pre-warmed and health-checked before the control-plane
cuts over.

---

## Health endpoint

```
GET /api/health
```

- **Authentication**: not required – this endpoint is always public.
- **Success response**: HTTP `200 OK` with body `{ "status": "ok" }`.
- **Failure conditions**: any non-200 response or TCP connection failure.

The control-plane must poll this endpoint on the standby slot and only cut over
traffic once a 200 response is received.  The Docker Compose health-check
configuration mirrors this expectation:

```yaml
healthcheck:
  test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000/api/health"]
  interval: 30s
  timeout: 5s
  retries: 3
  start_period: 10s
```

---

## Environment file

The operator must supply an env file before starting the container. Docker
Compose loads it via:

```yaml
env_file:
  - ${APP_ENV_FILE:-.env.local}
```

See `.env.example` for the full list of recognised variables.  The minimum
required variables in production are:

| Variable          | Description                                            |
|-------------------|--------------------------------------------------------|
| `STT_SERVICE_URL` | Base URL of the internal Speech-to-Text service.       |
| `CV_SERVICE_URL`  | Base URL of the internal Computer Vision / SAM service.|

Optional but recommended:

| Variable    | Default | Description                                             |
|-------------|---------|--------------------------------------------------------|
| `DATA_ROOT` | `/data` | Absolute path inside the container for durable storage.|
| `PORT`      | `3000`  | TCP port the Node.js server listens on.                 |
| `HOSTNAME`  | `0.0.0.0` | Network interface the server binds to.               |

`CF_ACCESS_DEV_EMAIL` must **not** be set in production; it is a development
shim only.

---

## Durable storage mount

The application writes per-user session metadata and artifacts to `DATA_ROOT`
(default `/data`).  This path **must** be backed by a durable host volume so
that data survives container restarts and blue/green slot swaps.

```yaml
volumes:
  - ${DATA_ROOT_HOST:-./data}:/data
```

Both the blue and green containers must share the same host path so that
in-flight sessions remain accessible after a slot swap.

For managed gateway deploys, the recommended values are:

- `APP_ENV_FILE=/srv/apps/gateway-tools-platform/shared/.env.local`
- `DATA_ROOT_HOST=/srv/apps/gateway-tools-platform/shared/data`

See [storage.md](storage.md) for the full workspace layout and retention
guidance.

---

## Docker Compose profiles

The repository ships a `docker-compose.yml` with two profiles:

| Profile | Container name        | Host port |
|---------|-----------------------|-----------|
| `blue`  | `gateway-tools-blue`  | `3000`    |
| `green` | `gateway-tools-green` | `3001`    |

Start a specific slot:

```bash
HOST_PORT=3000 docker compose --profile blue  up -d blue
HOST_PORT=3001 docker compose --profile green up -d green
```

A default `app` service (no profile) is also provided for simple single-slot
deployments:

```bash
docker compose up -d   # binds :3000 by default
```

---

## Image

The canonical image tag is `gateway-tools-platform:latest`.  Build it from
the repository root:

```bash
docker build -t gateway-tools-platform:latest .
```

The Dockerfile uses a multi-stage build (deps → builder → runner) and produces
a minimal Node 20 Alpine image with only the Next.js standalone output.  The
container runs as a non-root `nextjs` user (UID 1001).

---

## Summary

| Property               | Value                                             |
|------------------------|---------------------------------------------------|
| Published port (blue)  | `3000`                                            |
| Published port (green) | `3001`                                            |
| Health endpoint        | `GET /api/health` → HTTP 200                      |
| Env file               | `${APP_ENV_FILE:-.env.local}`                     |
| Durable storage mount  | `${DATA_ROOT_HOST:-./data}` → `/data`             |
| Image                  | `gateway-tools-platform:latest`                   |
| Container user         | `nextjs` (UID 1001, non-root)                     |
| Node version           | 20 (Alpine)                                       |
