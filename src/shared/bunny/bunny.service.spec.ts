import { BadGatewayException } from '@nestjs/common';
import { BunnyService } from './bunny.service';

describe('BunnyService CDN token authentication', () => {
  const videoId = '11111111-1111-4111-8111-111111111111';
  const playlistUrl = `https://vz-test.b-cdn.net/${videoId}/playlist.m3u8`;
  const tokenKey = 'cdn-token-secret';

  function createService(env: Record<string, string> = {}) {
    return new BunnyService({
      get: jest.fn((key: string) => env[key]),
    } as any);
  }

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns deterministic output for the same URL, key and expiration', () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey });

    const first = service.signStreamPlaybackUrl(playlistUrl, videoId, 3600);
    const second = service.signStreamPlaybackUrl(playlistUrl, videoId, 3600);

    expect(first).toBe(second);
  });

  it('changes the token when expiration changes', () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey });

    const oneHour = service.signStreamPlaybackUrl(playlistUrl, videoId, 3600);
    const twoHours = service.signStreamPlaybackUrl(playlistUrl, videoId, 7200);

    expect(oneHour).not.toBe(twoHours);
  });

  it('changes the token when the key changes', () => {
    const first = createService({ BUNNY_CDN_TOKEN_KEY: 'first-key' }).signStreamPlaybackUrl(
      playlistUrl,
      videoId,
      3600,
    );
    const second = createService({ BUNNY_CDN_TOKEN_KEY: 'second-key' }).signStreamPlaybackUrl(
      playlistUrl,
      videoId,
      3600,
    );

    expect(first).not.toBe(second);
  });

  it('uses Bunny directory token format for HLS output', () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey });

    const signed = service.signStreamPlaybackUrl(playlistUrl, videoId, 3600);

    expect(signed).toContain('/bcdn_token=HS256-');
    expect(signed).toContain('&expires=1700003600');
    expect(signed).toContain(`token_path=%2F${videoId}%2F`);
    expect(new URL(signed).pathname).toMatch(
      new RegExp(`^/bcdn_token=HS256-[^/]+/${videoId}/playlist\\.m3u8$`),
    );
  });

  it('does not leak the token authentication key in signed output', () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey });

    const signed = service.signStreamPlaybackUrl(playlistUrl, videoId, 3600);

    expect(signed).not.toContain(tokenKey);
  });

  it('creates a signed HLS playback URL with a matching expiration date', async () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey }) as any;
    jest.spyOn(service, 'getVideoPlayData').mockResolvedValue({
      videoId,
      playlistUrl,
      isPlayable: true,
      isPlaylistPlayable: true,
    });

    const result = await service.createSignedHlsPlaybackUrl(videoId, 3600);

    expect(result.url).toContain('/bcdn_token=HS256-');
    expect(result.url).toContain('&expires=1700003600');
    expect(result.expiresAt.toISOString()).toBe('2023-11-14T23:13:20.000Z');
    expect(result.url).not.toContain(tokenKey);
  });

  it('does not modify non-Bunny URLs', () => {
    const service = createService();
    const url = `https://cdn.example.com/${videoId}/playlist.m3u8`;

    expect(service.signStreamPlaybackUrl(url, videoId, 3600)).toBe(url);
  });

  it('does not sign Bunny management API URLs', () => {
    const service = createService({ BUNNY_CDN_TOKEN_KEY: tokenKey });
    const managementUrl = `https://video.bunnycdn.com/library/123/videos/${videoId}/play`;

    expect(service.signStreamPlaybackUrl(managementUrl, videoId, 3600)).toBe(managementUrl);
  });

  it('throws a clear config error when a Bunny media URL needs signing without a token key', () => {
    const service = createService();

    expect(() => service.signStreamPlaybackUrl(playlistUrl, videoId, 3600)).toThrow(
      BadGatewayException,
    );
    expect(() => service.signStreamPlaybackUrl(playlistUrl, videoId, 3600)).toThrow(
      'Missing BUNNY_CDN_TOKEN_KEY for Bunny Stream CDN token authentication',
    );
  });

  it('extracts legacy Bunny Stream video IDs from known URL formats', () => {
    const service = createService();

    expect(service.extractBunnyVideoId(`https://video.bunnycdn.com/play/123/${videoId}`)).toBe(videoId);
    expect(service.extractBunnyVideoId(`https://player.mediadelivery.net/embed/123/${videoId}`)).toBe(videoId);
    expect(service.extractBunnyVideoId(`https://vz-test.b-cdn.net/${videoId}/720p/video.m3u8`)).toBe(videoId);
  });
});
