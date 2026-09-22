import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import Hls from 'hls.js';
import './styles.css';

type Playback = {
  id: string;
  slug: string;
  title: string;
  stream: string;
  expiresAt: number;
  poster: string | null;
};

function getRoute(): { kind: 'video' | 'movie' | 'tv'; values: string[] } | null {
  const values = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  if (values[0] === 'v' && values[1]) return { kind: 'video', values: [values[1]] };
  if (values[0] === 'movie' && values[1]) return { kind: 'movie', values: [values[1]] };
  if (values[0] === 'tv' && values[1] && values[2] && values[3]) return { kind: 'tv', values: [values[1], values[2], values[3]] };
  return null;
}

async function resolveVideoId(): Promise<string> {
  const route = getRoute();
  if (!route) throw new Error('Use /v/:id, /movie/:tmdbId, or /tv/:tmdbId/:season/:episode');
  if (route.kind === 'video') return route.values[0];
  const endpoint = route.kind === 'movie'
    ? `/api/v1/movie/${encodeURIComponent(route.values[0])}`
    : `/api/v1/tv/${route.values.map(encodeURIComponent).join('/')}`;
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Media is not available');
  const data = await response.json() as { videoId: string };
  return data.videoId;
}

function Player() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const [error, setError] = useState('');
  const params = useMemo(() => new URLSearchParams(location.search), []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const id = await resolveVideoId();
        const response = await fetch(`/api/v1/videos/${encodeURIComponent(id)}/playback`);
        if (!response.ok) throw new Error('Video is unavailable or still processing');
        const data = await response.json() as Playback;
        if (alive) setPlayback(data);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playback) return;
    const autoplay = params.get('autoplay') === 'true' || params.get('autoPlay') === 'true';
    const muted = params.get('muted') === 'true' || autoplay;
    const start = Math.max(0, Number(params.get('start') ?? 0) || 0);
    video.muted = muted;

    const onLoaded = () => {
      if (start > 0 && Number.isFinite(video.duration) && start < video.duration) video.currentTime = start;
      if (autoplay) void video.play().catch(() => undefined);
    };
    video.addEventListener('loadedmetadata', onLoaded);

    let hls: Hls | null = null;
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = playback.stream;
    } else if (Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hls.loadSource(playback.stream);
      hls.attachMedia(video);
    } else {
      setError('HLS playback is not supported by this browser');
    }

    return () => {
      video.removeEventListener('loadedmetadata', onLoaded);
      hls?.destroy();
    };
  }, [playback, params]);

  if (error) return <div className="state"><strong>Playback error</strong><span>{error}</span></div>;
  if (!playback) return <div className="state"><span>Loading video…</span></div>;

  return (
    <main className="player-shell">
      <video
        ref={videoRef}
        className="video"
        controls={params.get('controls') !== 'false'}
        playsInline
        preload="metadata"
        poster={playback.poster ?? undefined}
        title={playback.title}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Player /></React.StrictMode>
);
