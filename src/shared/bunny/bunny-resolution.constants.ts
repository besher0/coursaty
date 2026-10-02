export const BUNNY_STREAM_RESOLUTIONS = [
  '240p',
  '360p',
  '480p',
  '720p',
  '1080p',
  '1440p',
  '2160p',
] as const;

export type BunnyStreamResolution = (typeof BUNNY_STREAM_RESOLUTIONS)[number];
