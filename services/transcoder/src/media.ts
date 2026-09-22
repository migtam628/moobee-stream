import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export type ProbeResult = {
  width: number;
  height: number;
  durationSeconds: number;
};

type Rendition = {
  name: string;
  height: number;
  bandwidth: number;
  maxrate: string;
  bufsize: string;
};

const DEFAULT_RENDITIONS: Rendition[] = [
  { name: '1080p', height: 1080, bandwidth: 6000000, maxrate: '5350k', bufsize: '7500k' },
  { name: '720p', height: 720, bandwidth: 3200000, maxrate: '2996k', bufsize: '4200k' },
  { name: '480p', height: 480, bandwidth: 1500000, maxrate: '1498k', bufsize: '2100k' }
];

function run(command: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-4000)}`));
    });
  });
}

export async function probeVideo(inputPath: string): Promise<ProbeResult> {
  const raw = await run('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height:format=duration',
    '-of', 'json',
    inputPath
  ]);
  const parsed = JSON.parse(raw) as { streams?: Array<{ width?: number; height?: number }>; format?: { duration?: string } };
  const stream = parsed.streams?.[0];
  if (!stream?.width || !stream?.height) throw new Error('Could not determine source video dimensions');
  return {
    width: stream.width,
    height: stream.height,
    durationSeconds: Number(parsed.format?.duration ?? 0)
  };
}

export async function extractPoster(inputPath: string, posterPath: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(posterPath), { recursive: true });
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-ss', '00:00:03',
    '-i', inputPath,
    '-frames:v', '1',
    '-vf', 'scale=1280:-2:force_original_aspect_ratio=decrease',
    '-quality', '85',
    posterPath
  ]);
}

export async function transcodeToHls(
  inputPath: string,
  outputRoot: string,
  sourceHeight: number,
  onProgress: (completed: number, total: number, stage: string) => Promise<void>
): Promise<void> {
  const renditions = DEFAULT_RENDITIONS.filter(r => r.height <= sourceHeight + 16);
  if (renditions.length === 0) {
    renditions.push({
      name: `${sourceHeight}p`,
      height: Math.max(2, sourceHeight - (sourceHeight % 2)),
      bandwidth: 1200000,
      maxrate: '1200k',
      bufsize: '1800k'
    });
  }

  await fs.promises.rm(outputRoot, { recursive: true, force: true });
  await fs.promises.mkdir(outputRoot, { recursive: true });

  for (let i = 0; i < renditions.length; i += 1) {
    const rendition = renditions[i];
    const outDir = path.join(outputRoot, rendition.name);
    await fs.promises.mkdir(outDir, { recursive: true });
    await onProgress(i, renditions.length, `transcoding:${rendition.name}`);

    await run('ffmpeg', [
      '-hide_banner', '-loglevel', 'warning', '-y',
      '-i', inputPath,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=-2:${rendition.height}:force_original_aspect_ratio=decrease`,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '21',
      '-maxrate', rendition.maxrate,
      '-bufsize', rendition.bufsize,
      '-sc_threshold', '0',
      '-force_key_frames', 'expr:gte(t,n_forced*6)',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-ac', '2',
      '-ar', '48000',
      '-f', 'hls',
      '-hls_time', '6',
      '-hls_playlist_type', 'vod',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', path.join(outDir, 'segment_%05d.ts'),
      path.join(outDir, 'index.m3u8')
    ]);
  }

  const masterLines = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-INDEPENDENT-SEGMENTS'
  ];
  for (const rendition of renditions) {
    masterLines.push(`#EXT-X-STREAM-INF:BANDWIDTH=${rendition.bandwidth}`);
    masterLines.push(`${rendition.name}/index.m3u8`);
  }
  await fs.promises.writeFile(path.join(outputRoot, 'master.m3u8'), `${masterLines.join('\n')}\n`, 'utf8');
  await onProgress(renditions.length, renditions.length, 'finalizing');
}
