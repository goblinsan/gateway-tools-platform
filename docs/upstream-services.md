# Upstream Services Integration Contract

This document describes the internal services consumed by
`gateway-tools-platform` and the request/response contracts the application
relies on.  Internal host names and port numbers are represented as
placeholders; the operator fills in real values via environment variables —
**no private network details are committed to this repository**.

---

## Service discovery

All upstream URLs are supplied at runtime through environment variables loaded
from `.env.local`.  The Next.js API routes act as an authenticated broker:
every upstream call is made server-side, so internal addresses are **never
exposed to the browser**.

| Variable          | Placeholder            | Description                         |
|-------------------|------------------------|-------------------------------------|
| `STT_SERVICE_URL` | `http://<stt-host>:<port>` | Base URL of the Speech-to-Text service. |
| `CV_SERVICE_URL`  | `http://<cv-host>:<port>`  | Base URL of the Computer Vision / SAM service. |

Both variables are **required** in production.  The application throws an
error at request time if either is missing.

---

## Speech-to-Text (STT) service

### Request

```
POST {STT_SERVICE_URL}/transcribe
Content-Type: multipart/form-data
```

| Field      | Type   | Required | Description                                           |
|------------|--------|----------|-------------------------------------------------------|
| `audio`    | file   | Yes      | Audio file to transcribe.                             |
| `diarize`  | string | No       | Send `"true"` to enable speaker diarization.          |
| `language` | string | No       | BCP-47 language hint (e.g. `"en-US"`). Auto-detected when omitted. |

**Accepted audio formats**: `audio/mpeg`, `audio/mp3`, `audio/wav`,
`audio/wave`, `audio/x-wav`, `audio/mp4`, `audio/m4a`, `audio/x-m4a`,
`audio/ogg`, `audio/webm`, `audio/flac`, `audio/x-flac`.

**Maximum file size**: 100 MiB (enforced by the broker before forwarding).

### Response

```
HTTP 200 OK
Content-Type: application/json
```

```jsonc
{
  "transcript": "<full transcription text>",
  // present only when diarize=true was requested:
  "segments": [
    {
      "speaker": "<speaker label>",
      "text": "<segment text>",
      "start": 0.0,   // seconds from start of audio
      "end": 3.5
    }
  ]
}
```

`segments` is omitted (or an empty array) when diarization was not requested.

### Error responses

The broker maps upstream errors as follows:

| Upstream status | Broker behaviour                                              |
|-----------------|---------------------------------------------------------------|
| 4xx             | Propagated as-is with the upstream body forwarded as the error message. |
| 5xx             | Propagated as-is.                                             |
| Network failure | Returns HTTP 502 to the browser client.                       |

### Timeout expectations

The STT service processes audio files and can take **up to 60 seconds** for
large files.  The operator should ensure that:

- The upstream service does not impose a shorter timeout.
- Any reverse proxy sitting in front of the platform (e.g. nginx) has a
  `proxy_read_timeout` of at least `120s` for the `/api/tools/stt` route.

---

## Computer Vision / SAM service

### Request

```
POST {CV_SERVICE_URL}/<operation>
Content-Type: multipart/form-data
```

`<operation>` is one of:

| Operation  | Description                                                  |
|------------|--------------------------------------------------------------|
| `segment`  | Identify and mask distinct objects using SAM.                |
| `analyze`  | Describe scene content and detected objects (returns JSON).  |
| `palette`  | Extract the dominant colour palette (returns JSON).          |

| Field   | Type | Required | Description             |
|---------|------|----------|-------------------------|
| `image` | file | Yes      | Image file to process.  |

**Accepted image formats**: `image/jpeg`, `image/png`, `image/webp`,
`image/tiff`, `image/bmp`.

**Maximum file size**: 10 MiB (enforced by the broker before forwarding).

### Response

```
HTTP 200 OK
Content-Type: <varies by operation>
```

| Operation | Response `Content-Type` | Body description                                |
|-----------|-------------------------|-------------------------------------------------|
| `segment` | `image/png`             | Segmentation mask overlaid on the source image. |
| `analyze` | `application/json`      | Scene description and object list.              |
| `palette` | `application/json`      | Dominant colour palette as hex codes.           |

The broker reads the `Content-Type` response header to determine how to store
the result artifact and derives a file extension accordingly (`.png`, `.jpg`,
`.json`, or `.bin` as a fallback).

### Error responses

Error handling follows the same pattern as the STT service (see above).

### Timeout expectations

SAM-based segmentation can be compute-intensive.  The operator should allow at
least **120 seconds** on the reverse proxy for the `/api/tools/cv` route.

---

## Authentication between broker and upstream

The upstream services are on a private internal network that is not reachable
from the public internet.  **No additional authentication** is performed
between the broker and the upstream services; network isolation is the sole
access control layer.

If the operator deploys the upstream services on a shared host or network
segment where additional authentication is desirable, the service URLs can
include credentials in the standard HTTP basic-auth form:

```
STT_SERVICE_URL=http://user:password@<stt-host>:<port>
```

---

## Summary

| Property                  | STT                          | CV (segment/analyze/palette)     |
|---------------------------|------------------------------|----------------------------------|
| Endpoint pattern          | `POST /transcribe`           | `POST /<operation>`              |
| Request format            | `multipart/form-data`        | `multipart/form-data`            |
| Max input size            | 100 MiB                      | 10 MiB                           |
| Response format           | `application/json`           | Varies (image/json)              |
| Suggested proxy timeout   | 120 s                        | 120 s                            |
| Auth between broker & svc | Network isolation (no token) | Network isolation (no token)     |
