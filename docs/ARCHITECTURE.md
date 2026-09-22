# Architecture

```text
Browser / host site
       |
       | iframe
       v
     Nginx
   /   |    \
  /    |     \
Player API   signed /hls/*
       |           |
       |           v
       |      local storage
       |
 Postgres <---- API
       ^          |
       |          v
       |        Redis
       |          |
       +----- Transcoder worker
                  |
                FFmpeg
```

The public player never receives the source upload path. Uploads are queued in Redis. The transcoder reads the source, probes it with FFprobe, creates a poster, generates adaptive HLS renditions, writes a master playlist, and marks the database record ready.

The API signs a stream URL using the same secret used by Nginx `secure_link`. The signed path carries the video ID, expiration timestamp, and signature. Relative HLS playlist references remain under that signed URL path so rendition playlists and segments continue to be validated.

For a multi-server deployment, replace the bind-mounted storage directory with object storage and move HLS delivery behind a CDN. The API and player URL shape can remain stable.
