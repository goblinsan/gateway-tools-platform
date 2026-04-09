# gateway-tools-platform

A public authenticated tools UI that runs on the gateway host as a blue/green
service.  Authentication is handled entirely by **Cloudflare Access** – the
app trusts the identity headers injected by the upstream reverse proxy and
derives a stable per-user identity from them.

## Stack

| Layer | Choice |
|-------|--------|
| Framework | [Next.js 16](https://nextjs.org/) (App Router, TypeScript) |
| Styling | [Tailwind CSS 4](https://tailwindcss.com/) |
| Runtime | Node 20 |
| Container | Docker (multi-stage, standalone output) |
| Auth | Cloudflare Access (header trust, no local credentials) |

---

## Authentication contract

All routes (except `/unauthorized` and Next.js internal paths) require the
`Cf-Access-Authenticated-User-Email` header to be present and non-empty.

| Header | Direction | Description |
|--------|-----------|-------------|
| `Cf-Access-Authenticated-User-Email` | Proxy → Origin | Email of the authenticated user. Injected by Cloudflare Access; stripped from any client-supplied copy before it reaches the origin. |
| `x-user-email` | Proxy layer → App | Forwarded downstream by `src/proxy.ts` after validation. |
| `x-user-id` | Proxy layer → App | Stable, opaque per-user ID (first 32 hex chars of SHA-256 of the lower-cased email). Forwarded by `src/proxy.ts`. |

When the header is absent the proxy layer redirects the browser to
`/unauthorized`.  Sign-in and sign-out flows are fully managed by Cloudflare
Access; this app contains no local credential system.

---

## API routes

| Route | Auth required | Description |
|-------|---------------|-------------|
| `GET /api/auth/me` | Yes | Returns `{ email, id }` for the current user. |
| `GET /api/health` | No | Liveness probe. Returns `{ status: "ok" }`. |

---

## Local development

```bash
# 1. Install dependencies
npm install

# 2. Copy and edit environment variables (see .env.example)
cp .env.example .env.local

# 3. Start the development server
npm run dev
```

Because the Cloudflare Access header is only injected in production, set it
manually in `.env.local` or supply it via a local proxy when developing
locally:

```
# .env.local (development only – never commit real credentials)
CF_ACCESS_DEV_EMAIL=you@example.com
```

> **Tip:** You can simulate an authenticated session in dev by adding a
> browser extension or local nginx rule that injects the
> `Cf-Access-Authenticated-User-Email` header on every request.

---

## Testing

```bash
npm test        # run all tests once (Vitest)
```

---

## Docker

```bash
# Build the image
docker build -t gateway-tools-platform:latest .

# Run a single instance
docker compose up -d

# Blue/green deployment
docker compose --profile blue  up -d   # binds :3000
docker compose --profile green up -d   # binds :3001
```

The health endpoint `GET /api/health` is used by the Docker compose
health-check and by the gateway-control-plane before traffic is cut over.

---

## Storage

Per-user artifacts and session metadata are stored under a durable data root
(default `/data`, configurable via `DATA_ROOT`).  Each user's files are
isolated in a subdirectory named by the derived user ID.

See [docs/storage.md](docs/storage.md) for the full workspace layout, retention
policy, and privacy boundaries.

---

## Blue/green deploy contract

See [docs/deploy-contract.md](docs/deploy-contract.md) (to be added) for the
full contract expected by `gateway-control-plane`.

| Property | Value |
|----------|-------|
| Published port (blue) | `3000` |
| Published port (green) | `3001` |
| Health endpoint | `GET /api/health` → HTTP 200 |
| Env file | `.env.local` (mounted by operator) |
| Durable storage | `./data` host directory mounted at `/data` (see [docs/storage.md](docs/storage.md)) |
