# Copilot Instructions

This repository is a public-facing gateway for internal tool services running
behind Cloudflare Access. Treat it as a broker and user workspace app, not as
the place where STT or CV inference logic lives.

## Architecture contract

- This app is deployed as a standalone Next.js service behind Cloudflare Access.
- Browser clients must only talk to this app's own `/api/*` routes.
- Internal service URLs stay server-side:
  - `STT_SERVICE_URL`
  - `CV_SERVICE_URL`
- Never expose raw internal hostnames or LAN IPs to the browser bundle.

## Auth and identity

- All non-public routes depend on Cloudflare-authenticated identity headers.
- Keep user segregation server-owned:
  - derive user identity from Cloudflare headers
  - store sessions and artifacts under per-user workspaces
  - never trust browser-provided user IDs for storage paths

## Upstream service contracts

- `stt-service` current upstream endpoints:
  - `POST /api/transcribe`
  - `GET /api/health`
  - `GET /api/info`
- `cv-sam-service` current upstream endpoints:
  - `POST /api/segment`
  - `POST /api/analyze`
  - `POST /api/extract-palette`
  - `GET /api/health`
  - `GET /api/info`
- Do not invent simplified aliases like `/transcribe` or `/palette` unless the
  upstream service actually implements them.
- When upstream contracts change, update:
  - broker clients in `src/lib/services/*`
  - the browser forms if they expose those capabilities
  - tests that assert endpoint paths or supported MIME types

## Frontend expectations

- Keep the UI TypeScript-based.
- The browser flows should stay usable for real operator testing:
  - upload file
  - submit request
  - see result
  - download artifact
- If a plan says a tool is available in the UI, do not stop at static nav links
  or placeholder pages.

## Validation

Before considering a task complete, prefer verifying:

- `npm run build`
- `npm test`
- health and tool route changes remain aligned with the actual upstream repos
