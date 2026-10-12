# MooBee Stream

> **MooBee platform scope:** This is the transcoding/HLS service behind **MooBee IPTV**; **StreamBoss** is the only supported playback client for the integrated platform. The bundled React iframe player is not a production auth path. See [private integration and migration notes](docs/PRIVATE_INTEGRATION.md).
>
> **Security phase:** Default Compose binds port 8080 on host loopback only. The playback resolver and movie/TV lookups now require a private `x-service-key` header, not a public browser call. This deliberately breaks public unauthenticated iframe embeds. Do **not** expose the key in browsers or modify the live MooBee IPTV Caddy/Tailscale configuration.

Self-hosted video ingest, FFmpeg transcoding, HLS delivery, signed stream URLs, and a responsive iframe player for Ubuntu/VPS deployments.

> Use this software only for video you own or are authorized to host and distribute.

## What it provides

MooBee Stream is designed as the video-serving layer behind a movie/catalog application. It keeps content management and playback infrastructure separate from your frontend.

- Multipart video uploads protected by an admin API key
- PostgreSQL media catalog
- Redis + BullMQ processing queue
- Background FFmpeg/FFprobe worker
- Adaptive HLS output
- Automatic poster extraction
- Short-lived signed HLS URLs using Nginx `secure_link`
- React + hls.js iframe player
- Direct video embeds: `/v/:id`
- TMDB-style movie embeds: `/movie/:tmdbId`
- TV embeds: `/tv/:tmdbId/:season/:episode`
- Docker Compose deployment
- Health check and CI workflow
- Local filesystem today; object storage/CDN can be added later

## Architecture

```text
Host website
    |
    | <iframe>
    v
+-------------------------------+
| Nginx                         |
| :8080 / HTTPS in production   |
+-----+--------------+----------+
      |              |
      |              +------------------------+
      v                                       v
React player                              Signed HLS
      |                                       |
      v                                       v
Fastify API                            storage/videos
      |
      +---------- PostgreSQL
      |
      +---------- Redis/BullMQ ---------- FFmpeg worker
                                             |
                                             +-- FFprobe metadata
                                             +-- poster.webp
                                             +-- 1080p / 720p / 480p HLS
                                             +-- master.m3u8
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for more detail.

## URL design

Direct video:

```text
https://embed.example.com/v/<video-id>
```

Movie by TMDB ID:

```text
https://embed.example.com/movie/550
```

TV episode:

```text
https://embed.example.com/tv/1399/1/1
```

Player query parameters currently supported:

```text
autoplay=true
muted=true
controls=false
start=120
```

Example:

```html
<iframe
  src="https://embed.example.com/movie/550?autoplay=true&muted=true"
  width="100%"
  height="100%"
  frameborder="0"
  allow="autoplay; fullscreen; picture-in-picture"
  allowfullscreen>
</iframe>
```

## Ubuntu VPS quick start

### 1. Install Docker

Install Docker Engine and the Docker Compose plugin using Docker's current Ubuntu instructions.

Verify:

```bash
docker --version
docker compose version
```

### 2. Clone

```bash
git clone https://github.com/migtam628/moobee-stream.git
cd moobee-stream
```

### 3. Bootstrap

```bash
./scripts/bootstrap.sh
```

The script creates `.env` from `.env.example`, generates random local secrets, builds the containers, and starts the stack.

### 4. Verify

```bash
curl http://localhost:8080/api/health
```

Expected:

```json
{"ok":true,"service":"moobee-stream-api"}
```

### 5. Upload a test video

```bash
./scripts/upload-example.sh ./sample.mp4 "Sample video"
```

The API returns a UUID. Watch processing:

```bash
source .env
curl -H "x-api-key: $ADMIN_API_KEY" \
  http://localhost:8080/api/v1/videos/<UUID>
```

When `status` becomes `ready`, review private playback metadata using the future MooBee IPTV adapter. The standalone public iframe path is **not operational** with service-only auth. The old URL shape was:

```text
http://YOUR_SERVER:8080/v/<UUID>
```

## Movie upload example

```bash
source .env
curl --fail-with-body \
  -H "x-api-key: $ADMIN_API_KEY" \
  -F 'title=Example Movie' \
  -F 'mediaType=movie' \
  -F 'tmdbId=550' \
  -F 'imdbId=tt0137523' \
  -F 'file=@./example.mp4' \
  http://localhost:8080/api/v1/admin/videos
```

After transcoding finishes, media remains private; the following old iframe route is not a supported way to play without a gateway:

```text
http://localhost:8080/movie/550
```

## TV upload example

```bash
source .env
curl --fail-with-body \
  -H "x-api-key: $ADMIN_API_KEY" \
  -F 'title=Example Show S01E01' \
  -F 'mediaType=tv' \
  -F 'tmdbId=1399' \
  -F 'season=1' \
  -F 'episode=1' \
  -F 'file=@./s01e01.mp4' \
  http://localhost:8080/api/v1/admin/videos
```

Former standalone iframe route (requires future gateway support):

```text
http://localhost:8080/tv/1399/1/1
```

## API

Endpoints (health remains unauthenticated on **loopback only**; playback/resolvers require `x-service-key`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/v1/videos/:id/playback` | Private service-authenticated signed playback path |
| `GET` | `/api/v1/movie/:tmdbId` | Resolve a movie |
| `GET` | `/api/v1/tv/:tmdbId/:season/:episode` | Resolve a TV episode |

Admin endpoints require:

```http
x-api-key: YOUR_ADMIN_API_KEY
```

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/admin/videos` | Upload and enqueue video |
| `GET` | `/api/v1/videos` | List videos |
| `GET` | `/api/v1/videos/:id` | Get processing/status metadata |
| `DELETE` | `/api/v1/admin/videos/:id` | Remove video and files |

Service metadata endpoints require a distinct `x-service-key` (at least 32 bytes), not the upload/delete admin key. They include paginated `GET /api/v1/internal/videos` and `GET /api/v1/internal/videos/:uuid`. See [docs/API.md](docs/API.md).

## Processing states

```text
uploaded -> queued -> processing -> ready
                             \
                              -> failed
```

The worker writes progress and stage information to PostgreSQL so an admin UI can poll the same API later.

## HLS output

A processed video is stored under:

```text
storage/videos/<video-id>/
├── master.m3u8
├── 1080p/
│   ├── index.m3u8
│   └── segment_*.ts
├── 720p/
│   ├── index.m3u8
│   └── segment_*.ts
└── 480p/
    ├── index.m3u8
    └── segment_*.ts
```

Only renditions at or below the source resolution are created. Low-resolution sources receive a source-sized rendition rather than being unnecessarily upscaled.

## Signed playback

The browser does not receive the physical file path. The API returns a URL shaped like:

```text
/hls/<video-id>/<expiry>/<signature>/master.m3u8
```

The signature is an URL-safe MD5 digest compatible with Nginx `secure_link`, calculated from the expiry, video ID, and a private server secret. Nginx validates the same values before serving the playlist or segment.

Because rendition and segment paths are relative inside the playlists, they remain beneath the signed URL prefix.

## Storage

Development/small VPS deployments use:

```text
storage/
├── uploads/
├── videos/
└── posters/
```

`uploads/` contains original source files and is never publicly mounted through Nginx.

For larger deployments, plan to move generated HLS to S3-compatible object storage such as Cloudflare R2, Backblaze B2, Wasabi, AWS S3, or MinIO, and place a CDN in front of playback.

## Production deployment

Before exposing this publicly:

1. Set strong `POSTGRES_PASSWORD`, `ADMIN_API_KEY`, and `STREAM_SIGNING_SECRET` values.
2. Set `PUBLIC_EMBED_BASE_URL` to your real HTTPS embed domain.
3. Change `CORS_ORIGIN=*` to the allowed frontend origin(s).
4. Put TLS in front of port 8080 using your preferred reverse proxy or change the included Nginx deployment to terminate TLS directly.
5. Keep upload, service metadata, signed HLS and playback private. Never expose Stream 8080 publicly until a subscriber-aware gateway exists.
6. Set DNS for the embed domain.
7. Monitor disk space and CPU usage.
8. Back up PostgreSQL.

### Suggested domains

```text
moobee.tv             main application
embed.moobee.tv       this project / iframe player
api.moobee.tv         optional dedicated API hostname
stream.moobee.tv      optional CDN/stream hostname later
```

For the first VPS deployment, a single `embed.moobee.tv` hostname can serve the player, API, and HLS paths.

## Reverse proxy / TLS

A simple production topology is:

```text
Internet
   |
Cloudflare / firewall
   |
HTTPS reverse proxy :443
   |
127.0.0.1:8080
   |
MooBee Stream Nginx
```

The Compose stack now **defaults** to host loopback; it uses:

```yaml
ports:
  - "127.0.0.1:8080:80"
```

Do not proxy this origin publicly without implementing the subscriber authorization gateway.

## Useful commands

Start/build:

```bash
docker compose up -d --build
```

Status:

```bash
docker compose ps
```

API logs:

```bash
docker compose logs -f api
```

Transcoder logs:

```bash
docker compose logs -f transcoder
```

All logs:

```bash
docker compose logs -f
```

Restart:

```bash
docker compose restart
```

Stop:

```bash
docker compose down
```

Do not use `docker compose down -v` unless you deliberately want to delete the PostgreSQL and Redis volumes.

## Local development without Docker

Run PostgreSQL and Redis yourself and provide the environment variables in `.env`.

API:

```bash
cd apps/api
npm install
npm run dev
```

Worker — requires `ffmpeg` and `ffprobe` on your PATH:

```bash
cd services/transcoder
npm install
npm run dev
```

Player:

```bash
cd apps/player
npm install
npm run dev
```

The included Compose/Nginx setup is the supported integrated development path because it provides the same routing and signed-stream behavior used in deployment.

## Security

Important points:

- Originals are private and never exposed through Nginx.
- Internal playback authorization uses a distinct service key, and signed paths are not subscriber-scoped by themselves.
- Admin actions require a separate API key.
- Do not commit `.env`.
- Rate-limit and firewall upload routes before public use.
- A future remote URL ingest feature must include strict SSRF defenses.
- Signed URLs reduce casual hotlinking; they are not DRM.

Read [docs/SECURITY.md](docs/SECURITY.md) before public deployment.

## Roadmap

Good next additions:

- Admin web dashboard
- Upload progress and resumable uploads
- Subtitle upload and WebVTT tracks
- Multiple audio tracks
- Quality selector UI
- Domain/referrer allowlists
- Per-user/API-key quotas
- Rate limiting
- Webhooks after processing
- TMDB metadata sync
- S3/R2 storage driver
- CDN signed URLs/cookies
- Hardware accelerated FFmpeg profiles (NVENC / VAAPI / Quick Sync)
- Remote worker nodes
- Prometheus metrics
- Automated database migrations

## Repository layout

```text
moobee-stream/
├── apps/
│   ├── api/             Fastify control/playback API
│   └── player/          React + hls.js iframe player
├── services/
│   └── transcoder/      BullMQ + FFmpeg worker
├── db/
│   └── init.sql         Initial PostgreSQL schema
├── nginx/
│   └── templates/       Reverse proxy + signed HLS serving
├── scripts/             Bootstrap and upload helpers
├── docs/                Architecture/API/security notes
├── storage/             Runtime media directories (ignored)
├── docker-compose.yml
└── .env.example
```

## Scope

MooBee Stream is infrastructure for hosting and embedding media you control. It intentionally does not include scraping, third-party stream extraction, DRM bypass, or unauthorized redistribution features.
