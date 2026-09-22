# API reference

All administrative endpoints require the `x-api-key` header. Public playback resolution endpoints intentionally do not expose filesystem paths.

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

## Playback

`GET /api/v1/videos/:id/playback`

Returns a short-lived signed HLS path only when the video is `ready`.

## Resolve movie

`GET /api/v1/movie/:tmdbId`

## Resolve TV episode

`GET /api/v1/tv/:tmdbId/:season/:episode`

## Delete video

`DELETE /api/v1/admin/videos/:id`

Requires `x-api-key` and removes database metadata, transcoded HLS output, and the original uploaded source.
