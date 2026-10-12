# MooBee Stream → MooBee IPTV integration security, phase 1

This phase is for the active **MooBee IPTV + StreamBoss + MooBee Stream** architecture only. The separate `iptv-player` and `vidplus-movie-player` repositories are out of scope. No deployed VPS environment has been changed.

## What this PR changes

- Stream Nginx is now bound to **`127.0.0.1:8080:80`** by default in `docker-compose.yml`. This intentionally prevents direct internet access on TCP 8080. Do **not** modify or restart the working MooBee IPTV `compose.yaml` + `compose.hostnet.yaml` stack.
- Playback signing (`GET /api/v1/videos/:id/playback`), movie lookup (`GET /api/v1/movie/:tmdbId`), and episode lookup (`GET /api/v1/tv/:tmdbId/:season/:episode`) now require a dedicated `x-service-key` header.
- New read-only service endpoints `GET /api/v1/internal/videos` and `GET /api/v1/internal/videos/:id` provide sanitized catalog/status metadata. The list is paginated (up to 100 items, `nextCursor`). No file paths, upload status internals, signing secrets or raw admin API responses appear.
- The existing `x-api-key` is still required for upload/delete and owner-level status/list endpoints; it does **not** authorize playback. The service key does **not** authorize upload/delete.
- Both service and admin credentials must be distinct. Service key must be at least 32 bytes; missing/blank key fails closed. New installs using `scripts/bootstrap.sh` generate it with `openssl rand -hex 32`.
- HLS Nginx signed-path routing allows generated `master.m3u8`, rendition `index.m3u8` and worker-named `segment_#####.ts` only. It no longer accepts an arbitrary asset path after the token.
- Node security tests and CI check header isolation, short/absent key, default bind address, and HLS path restriction.

## Intentional breaking change

MooBee Stream's bundled **React iframe player is not a supported production client** in our platform. That player currently fetches playback paths directly in the browser and will receive HTTP 401 with the new service-only authorization. Do **not** put `STREAM_SERVICE_API_KEY` in JavaScript, iframe URL parameters, StreamBoss, source files, HTML, or the public browser. We have intentionally not introduced a public fallback to bypass this security restriction.

The supported experience is StreamBoss → MooBee IPTV authentication/entitlements → private service-to-service lookup → a **future** authorization-enforcing adaptive-HLS proxy/gateway. The gateway is **not implemented in this PR**; no automatic external-backed StreamBoss playback should be claimed.

Signed Stream HLS URLs are **bearer tokens** and remain usable by a holder until expiry when the origin is reachable. Binding Nginx to loopback mitigates direct external reachability but it is **not sufficient** by itself for public multiuser access. Never expose that origin, forward `/hls` publicly, or publish signed URLs in end-user APIs until the per-viewer gateway/revocation policy is complete.

## Setup in isolated staging only

Do not run the Stream Compose stack on the existing production VPS while preparing integration. Use a separate test VM or a deliberately isolated Compose project with enough disk, CPU, RAM and ports. The following steps apply to **that isolated MooBee Stream environment**, not the live IPTV service:

```bash
cd /path/to/separate/moobee-stream
git fetch origin
git switch feat/private-service-security-v0.2
# Edit .env using your secured local workflow; never print its contents.
# If STREAM_SERVICE_API_KEY is missing, generate locally:
SERVICE_KEY="$(openssl rand -hex 32)"
# Store this value securely as STREAM_SERVICE_API_KEY in the Stream .env
# and, later, in MooBee IPTV's private connector config only.
unset SERVICE_KEY
docker compose config --quiet
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8080/api/health
```

`docker compose config` **without `--quiet`** expands secrets and must not be shared. Do not copy the Stream `.env` to GitHub. Running this PR with an **existing** `.env` that lacks `STREAM_SERVICE_API_KEY` keeps the service running but denies all service routes until you explicitly set a strong key and recreate only the Stream API container.

When deployed separately:

- Public internet TCP 8080 should not reach Nginx. Verify at the firewall as well as Docker's published bindings.
- `curl -i http://127.0.0.1:8080/api/v1/videos/<uuid>/playback` without a service key must return **401**.
- `curl -i http://127.0.0.1:8080/api/v1/internal/videos` without a service key must return **401**.
- Admin `x-api-key` must **not** grant service playback; service `x-service-key` must **not** grant upload or delete.
- A valid private service key may list and look up metadata, but never include it in URLs, analytics or logs.
- The existing `/v` and `/movie` iframe routes are **not supported** for authenticated playback in this phase, as explained above.

## Nginx ↔ Fastify path mapping

Nginx's `/api/` proxy strips the prefix, so the Fastify route `/v1/internal/videos` is exposed to a trusted host at `/api/v1/internal/videos`. The same holds for `/v1/videos/:id/playback` and the movie/TV resolvers. The backend service key goes in the **HTTP header** `x-service-key`.

## Integration backlog

1. **MooBee IPTV adapter PR:** add disabled-by-default per-item UUID mapping, strict fixed upstream config, read-only paginated catalog preview, dry-run tests, no playback routes or remote URL input.
2. **Playback gateway PR:** authenticate subscriber at every manifest/segment entry; resolve Stream signed media only via trusted private connection, rewrite adaptive master/rendition manifests, safely gate redirects and expiry; test disable/revocation semantics.
3. **StreamBoss E2E:** upload a small authorized video into isolated MooBee Stream, observe FFmpeg status, map item to IPTV, play movie and episode, verify expired/disabled user denial and staging rollback.
4. **VPS release gate:** verify Caddy host-network overlay, loopback port 8000, public admin 403, unauthenticated Tailscale admin 401, and existing local HLS/EPG unchanged. Document resource budget (transcoding is CPU/disk intensive).

## Rollback

No production deployments occur in this PR. If this isolated Stream-only test breaks, stop or roll back **only that separate Compose project** and retain Stream Postgres/storage backups. Do not run `docker compose down -v`; this could delete Redis/Postgres volumes. Do not modify, recreate or restart the live MooBee IPTV Caddy or API containers.
