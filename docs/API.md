# API reference

Administrative upload, delete and raw-status endpoints require the `x-api-key` header. Internal catalog, signed playback, movie and TV resolution routes **require a separate `x-service-key` header** (minimum 32 bytes), configured privately through `STREAM_SERVICE_API_KEY`. Missing or incorrect keys return 401. Never expose the service key in StreamBoss, browsers, URLs, or logs. The only unauthenticated route below is health, served over loopback by default. The legacy iframe player is not functional under this new private playback policy.

## Health

`GET /api/health`

## Upload

`POST /api/v1/admin/videos` using `multipart/form-data`.

Fields:

- `file` — video file, required
- `title` — required
- `slug` — optional public alias
- `mediaType` — `video`, `movie`, or `tv`
- `tmdbId` — optional; recommended for movies/TV
- `imdbId` — optional
- `season` — required for `tv`
- `episode` — required for `tv`

Example:

```bash
curl -H "x-api-key: $ADMIN_API_KEY" \
  -F 'title=Example Movie' \
  -F 'mediaType=movie' \
  -F 'tmdbId=550' \
  -F 'file=@./movie.mp4' \
  http://localhost:8080/api/v1/admin/videos
```

## List videos

`GET /api/v1/videos`

Requires `x-api-key`.

## Video status

`GET /api/v1/videos/:id`

Requires `x-api-key`.

## Playback — internal, service-authenticated

`GET /api/v1/videos/:id/playback`

Requires `x-service-key`. Returns a short-lived bearer signed HLS path only when the video is `ready`. This path alone does not enforce subscriber entitlements; the IPTV-side gateway must enforce them. Do not proxy `/hls` publicly.

## Resolve movie — internal, `x-service-key`

`GET /api/v1/movie/:tmdbId`

## Resolve TV episode — internal, `x-service-key`

`GET /api/v1/tv/:tmdbId/:season/:episode`

## Delete video

`DELETE /api/v1/admin/videos/:id`

Requires `x-api-key` and removes database metadata, transcoded HLS output, and the original uploaded source.

## Paginated, sanitized catalog — internal

`GET /api/v1/internal/videos?cursor=<last UUID>` returns up to 100 normalized records, with `nextCursor` (UUID or null) for paging. Omit `cursor` for the first page. `GET /api/v1/internal/videos/:uuid` returns one normalized record. Both require `x-service-key` and exclude source filesystem paths and upload error details. Never silently treat a page as a complete catalog unless `nextCursor` is null.

See [Private integration](PRIVATE_INTEGRATION.md) for staged deployment requirements.
