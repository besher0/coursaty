import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { createHash, createHmac, randomUUID } from 'crypto';
import { BUNNY_STREAM_RESOLUTIONS, BunnyStreamResolution } from './bunny-resolution.constants';

type BunnyResolutionPath = {
  resolution: string;
  path: string;
  sizeBytes?: number | null;
};

type BunnyVideoResolutionsResponse = {
  data?: {
    availableResolutions?: string[];
    playlistResolutions?: BunnyResolutionPath[];
    mp4Resolutions?: BunnyResolutionPath[];
  };
};

@Injectable()
export class BunnyService {
  private static readonly TUS_UPLOAD_ENDPOINT = 'https://video.bunnycdn.com/tusupload';
  private static readonly DEFAULT_CDN_TOKEN_TTL_SECONDS = 10800;
  private static readonly UUID_PATTERN =
    /([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})/;
  private readonly streamLibraryId: string;
  private readonly apiKey: string;
  private readonly coreApiKey: string;
  private readonly storageZone: string;
  private readonly storageHost: string;
  private readonly storageApiKey: string;
  private readonly storagePublicHost: string;
  private readonly cdnTokenKey: string;
  private readonly cdnTokenTtlSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.streamLibraryId = this.readEnv('BUNNY_STREAM_LIBRARY_ID');
    this.apiKey = this.readEnv('BUNNY_API_KEY');
    this.coreApiKey = this.readEnv('BUNNY_CORE_API_KEY') || this.apiKey;
    this.storageZone = this.readEnv('BUNNY_STORAGE_ZONE');
    this.storageHost = this.readEnv('BUNNY_STORAGE_HOST') || 'storage.bunnycdn.com';
    this.storageApiKey = this.readEnv('BUNNY_STORAGE_API_KEY');

    // Support both the current key and the legacy `CDN_Hostname` used in some env files.
    const configuredPublicHost =
      this.readEnv('BUNNY_STORAGE_PUBLIC_HOST') || this.readEnv('CDN_Hostname');
    this.storagePublicHost = configuredPublicHost || `${this.storageZone}.b-cdn.net`;
    this.cdnTokenKey = this.readEnv('BUNNY_CDN_TOKEN_KEY');
    this.cdnTokenTtlSeconds = this.readPositiveIntegerEnv(
      'BUNNY_CDN_TOKEN_TTL_SECONDS',
      BunnyService.DEFAULT_CDN_TOKEN_TTL_SECONDS,
    );
  }

  async createStreamVideo(title: string): Promise<{ guid: string; title: string }> {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos`;
    const response = await axios.post(
      url,
      { title: title || `video-${randomUUID()}` },
      { headers: { AccessKey: this.apiKey } },
    );
    return { guid: response.data.guid, title: response.data.title };
  }

  async uploadStreamVideo(guid: string, file: any): Promise<void> {
    this.assertStreamConfigured();
    const fileBuffer = this.getFileBuffer(file, 'stream video upload');
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${guid}`;
    await this.putWithRetry(
      url,
      fileBuffer,
      {
        headers: {
          AccessKey: this.apiKey,
          'Content-Type': 'application/octet-stream',
          'Content-Length': fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      },
      'Bunny Stream upload',
    );
  }

  getStreamPlayUrl(guid: string): string {
    return `https://video.bunnycdn.com/play/${this.streamLibraryId}/${guid}`;
  }

  getStreamEmbedUrl(guid: string): string {
    return `https://player.mediadelivery.net/embed/${this.streamLibraryId}/${guid}`;
  }

  getTusUploadEndpoint(): string {
    return BunnyService.TUS_UPLOAD_ENDPOINT;
  }

  async createTusUploadSession(title: string, expiresInSeconds = 3600) {
    const { guid } = await this.createStreamVideo(title);
    const signedUpload = this.signTusUpload(guid, expiresInSeconds);

    return {
      videoId: guid,
      ...signedUpload,
    };
  }

  signTusUpload(videoId: string, expiresInSeconds = 3600) {
    this.assertStreamConfigured();

    const ttlSeconds = this.clampTusTtl(expiresInSeconds);
    const authorizationExpire = Math.floor(Date.now() / 1000) + ttlSeconds;
    const signaturePayload = `${this.streamLibraryId}${this.apiKey}${authorizationExpire}${videoId}`;
    const authorizationSignature = createHash('sha256').update(signaturePayload).digest('hex');
    const libraryId = this.streamLibraryId;

    return {
      tusEndpoint: this.getTusUploadEndpoint(),
      libraryId,
      authorizationExpire,
      authorizationSignature,
      headers: {
        AuthorizationSignature: authorizationSignature,
        AuthorizationExpire: String(authorizationExpire),
        VideoId: videoId,
        LibraryId: libraryId,
      },
    };
  }

  async updateLibraryResolutionSettings(options: {
    enabledResolutions: BunnyStreamResolution[];
    enableMp4Fallback?: boolean;
    allowDirectPlay?: boolean;
  }) {
    this.assertStreamConfigured();
    this.assertCoreApiConfigured();

    const uniqueResolutions = Array.from(new Set(options.enabledResolutions));
    if (!uniqueResolutions.length) {
      throw new BadGatewayException('At least one resolution is required');
    }

    const invalid = uniqueResolutions.filter((resolution) => !BUNNY_STREAM_RESOLUTIONS.includes(resolution));
    if (invalid.length) {
      throw new BadGatewayException(`Unsupported resolutions: ${invalid.join(', ')}`);
    }

    const url = `https://api.bunny.net/videolibrary/${this.streamLibraryId}`;
    const response = await axios.post(
      url,
      {
        EnabledResolutions: uniqueResolutions.join(','),
        EnableMP4Fallback: options.enableMp4Fallback ?? true,
        AllowDirectPlay: options.allowDirectPlay ?? true,
      },
      {
        headers: {
          AccessKey: this.coreApiKey,
          'Content-Type': 'application/json',
        },
      },
    );

    return {
      libraryId: response.data?.Id ?? Number(this.streamLibraryId),
      enabledResolutions: response.data?.EnabledResolutions ?? uniqueResolutions.join(','),
      enableMp4Fallback: response.data?.EnableMP4Fallback ?? options.enableMp4Fallback ?? true,
      allowDirectPlay: response.data?.AllowDirectPlay ?? options.allowDirectPlay ?? true,
    };
  }

  async getVideoResolutions(
    videoId: string,
    playData?: { playlistUrl?: string | null; fallbackUrl?: string | null } | null,
  ) {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${videoId}/resolutions`;
    const response = await axios.get<BunnyVideoResolutionsResponse>(url, {
      headers: { AccessKey: this.apiKey },
    });

    const payload = response.data?.data;
    const resolvedPlayData =
      playData === undefined ? await this.getVideoPlayData(videoId).catch((): null => null) : playData;
    const playlistBaseUrl = resolvedPlayData?.playlistUrl ?? undefined;
    const mp4BaseUrl = resolvedPlayData?.fallbackUrl ?? this.getStreamPlayBaseUrl(videoId);
    const playlistResolutions = await this.attachPlaylistResolutionSizes(
      payload?.playlistResolutions ?? [],
      playlistBaseUrl,
    );
    const mp4Resolutions = await this.attachResolutionSizes(payload?.mp4Resolutions ?? [], mp4BaseUrl);
    return {
      videoId,
      availableResolutions: payload?.availableResolutions ?? [],
      playlistResolutions: this.signResolutionPaths(playlistResolutions, videoId) ?? [],
      mp4Resolutions: this.signResolutionPaths(mp4Resolutions, videoId) ?? [],
    };
  }

  async getVideoPlayData(videoId: string) {
    this.assertStreamConfigured();
    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos/${videoId}/play`;
    const response = await axios.get(url, {
      headers: { AccessKey: this.apiKey },
    });

    return {
      videoId,
      libraryId: this.streamLibraryId,
      directPlayUrl: this.getStreamPlayUrl(videoId),
      embedUrl: this.getStreamEmbedUrl(videoId),
      playlistUrl: response.data?.videoPlaylistUrl ?? null,
      fallbackUrl: response.data?.fallbackUrl ?? null,
      availableResolutions: response.data?.video?.availableResolutions ?? null,
      isPlayable: response.data?.isPlayable ?? null,
      isPlaylistPlayable: response.data?.isPlaylistPlayable ?? null,
    };
  }

  async getStreamPlaybackPayload(videoId: string, preferredResolution?: string) {
    const playData = await this.getVideoPlayData(videoId).catch((): null => null);
    const resolutions = await this.getVideoResolutions(videoId, playData ?? undefined).catch((): null => null);

    const streamMasterPlaylistUrl = this.signNullableStreamUrl(playData?.playlistUrl, videoId);
    const streamFallbackUrl = this.signNullableStreamUrl(playData?.fallbackUrl, videoId);
    const playlistResolutions = this.signResolutionPaths(resolutions?.playlistResolutions ?? null, videoId);
    const mp4Resolutions = this.signResolutionPaths(resolutions?.mp4Resolutions ?? null, videoId);

    const preferredPlaylistResolutionUrl = this.resolveResolutionPath(
      preferredResolution,
      playlistResolutions ?? [],
    );
    const preferredResolutionUrl = this.resolveResolutionPath(preferredResolution, mp4Resolutions ?? []);

    return {
      streamVideoId: videoId,
      streamEmbedUrl: this.getStreamEmbedUrl(videoId),
      streamPlayUrl: this.getStreamPlayUrl(videoId),
      streamMasterPlaylistUrl,
      streamPlaylistUrl: preferredPlaylistResolutionUrl ?? streamMasterPlaylistUrl,
      streamFallbackUrl,
      availableResolutions: resolutions?.availableResolutions ?? null,
      playlistResolutions,
      mp4Resolutions,
      preferredResolution: preferredResolution ?? null,
      preferredPlaylistResolutionUrl,
      preferredResolutionUrl,
      isPlayable: playData?.isPlayable ?? null,
      isPlaylistPlayable: playData?.isPlaylistPlayable ?? null,
    };
  }

  async resolveSignedStoredStreamUrl(url?: string | null): Promise<string | null> {
    if (!url) return null;

    const videoId = this.extractBunnyVideoId(url);
    if (!videoId) return url;

    if (this.isBunnyStreamMediaUrl(url, videoId)) {
      return this.signStreamPlaybackUrl(url, videoId);
    }

    if (!this.isBunnyStreamStablePlaybackUrl(url, videoId)) return url;

    const playback = await this.getStreamPlaybackPayload(videoId);
    return playback.streamPlaylistUrl ?? playback.streamMasterPlaylistUrl ?? playback.streamFallbackUrl ?? url;
  }

  signStreamPlaybackUrl(url: string, videoId: string, expiresInSeconds?: number): string {
    if (!this.isBunnyStreamMediaUrl(url, videoId)) return url;
    this.assertCdnTokenConfigured();

    const parsed = this.parseUrl(url);
    if (!parsed) return url;

    const unsignedUrl = this.removeExistingCdnToken(parsed);
    const expires = this.getPlaybackExpiration(expiresInSeconds);
    const videoDirectory = this.getVideoDirectoryPath(videoId);

    return this.signBunnyStreamMediaUrl(unsignedUrl, expires, videoDirectory);
  }

  isBunnyStreamMediaUrl(url?: string | null, videoId?: string | null): boolean {
    const parsed = this.parseUrl(url);
    if (!parsed) return false;

    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname;
    const normalizedVideoId = String(videoId || this.extractBunnyVideoId(url) || '').trim();

    if (!normalizedVideoId || !this.pathContainsVideoId(pathname, normalizedVideoId)) return false;
    if (this.isConfiguredStorageHost(hostname)) return false;
    if (this.isBunnyManagementUrl(parsed)) return false;
    if (this.isBunnyStreamStablePlaybackParsedUrl(parsed, normalizedVideoId)) return false;

    return (
      hostname === 'video.bunnycdn.com' ||
      hostname.endsWith('.bunnycdn.com') ||
      hostname === 'b-cdn.net' ||
      hostname.endsWith('.b-cdn.net') ||
      hostname === 'mediadelivery.net' ||
      hostname.endsWith('.mediadelivery.net')
    );
  }

  extractBunnyVideoId(url?: string | null): string | null {
    if (!url) return null;

    const playMatch = url.match(/\/play\/[^/]+\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
    if (playMatch?.[1]) return playMatch[1];

    const embedMatch = url.match(/\/embed\/[^/]+\/([0-9a-fA-F-]{36})(?:[/?#]|$)/);
    if (embedMatch?.[1]) return embedMatch[1];

    try {
      const pathname = new URL(url).pathname;
      const segments = pathname.split('/').filter(Boolean);
      for (const segment of segments) {
        if (segment.startsWith('bcdn_token=')) continue;
        const segmentMatch = segment.match(BunnyService.UUID_PATTERN);
        if (segmentMatch?.[1]) return segmentMatch[1];
      }
    } catch {
      // Non-URL inputs are handled by the generic regex fallback below.
    }

    const genericMatch = url.match(BunnyService.UUID_PATTERN);
    if (genericMatch?.[1]) return genericMatch[1];

    return null;
  }

  getPlaybackExpiration(expiresInSeconds?: number): number {
    const ttl = this.clampPlaybackTtl(expiresInSeconds ?? this.cdnTokenTtlSeconds);
    return Math.floor(Date.now() / 1000) + ttl;
  }

  private resolveResolutionPath(preferredResolution: string | undefined, resolutions: BunnyResolutionPath[]): string | null {
    const normalizedPreferred = this.normalizeResolutionLabel(preferredResolution);
    if (!normalizedPreferred || !resolutions.length) return null;

    const match = resolutions.find(
      (item: BunnyResolutionPath) => this.normalizeResolutionLabel(item.resolution) === normalizedPreferred,
    );
    return match?.path ?? null;
  }

  private normalizeResolutionLabel(resolution?: string | null): string | null {
    if (!resolution) return null;
    const normalized = String(resolution).trim().toLowerCase();
    if (!normalized) return null;

    const digits = normalized.match(/\d+/)?.[0];
    return digits ? `${digits}p` : normalized;
  }

  private async attachResolutionSizes(
    resolutions: BunnyResolutionPath[],
    baseUrl?: string,
  ): Promise<BunnyResolutionPath[]> {
    if (!resolutions.length) return resolutions;

    const withSizes = await Promise.all(
      resolutions.map(async (item) => {
        const normalizedPath = this.normalizeResolutionUrl(item.path, baseUrl) ?? item.path;
        return {
          ...item,
          path: normalizedPath,
          sizeBytes: await this.tryResolveContentLength(item.path, baseUrl),
        };
      }),
    );

    return withSizes;
  }

  private async attachPlaylistResolutionSizes(
    resolutions: BunnyResolutionPath[],
    baseUrl?: string,
  ): Promise<BunnyResolutionPath[]> {
    if (!resolutions.length) return resolutions;

    const withSizes = await Promise.all(
      resolutions.map(async (item) => {
        const normalizedPath = this.normalizeResolutionUrl(item.path, baseUrl) ?? item.path;
        return {
          ...item,
          path: normalizedPath,
          sizeBytes: await this.getPlaylistSizeBytes(item.path, baseUrl),
        };
      }),
    );

    return withSizes;
  }

  private async getPlaylistSizeBytes(playlistPath: string, baseUrl?: string): Promise<number | null> {
    const playlistUrl = this.normalizeResolutionUrl(playlistPath, baseUrl);
    if (!playlistUrl) return null;

    const playlistCandidates = this.buildPlaylistCandidates(playlistUrl);
    for (const candidateUrl of playlistCandidates) {
      const playlistBody = await this.tryFetchPlaylistBody(candidateUrl);
      if (!playlistBody) continue;

      const segmentLines = playlistBody
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
      if (!segmentLines.length) continue;

      const segmentUrls = segmentLines
        .map((line) => this.resolvePlaylistItemUrl(candidateUrl, line))
        .filter((line): line is string => Boolean(line));
      if (!segmentUrls.length) continue;

      const total = await this.sumContentLengths(segmentUrls, 8);
      if (total !== null) return total;
    }

    return null;
  }

  private buildPlaylistCandidates(playlistUrl: string): string[] {
    const urls = [playlistUrl];
    const lower = playlistUrl.toLowerCase();
    if (!lower.includes('.m3u8')) {
      const base = playlistUrl.endsWith('/') ? playlistUrl : `${playlistUrl}/`;
      urls.push(`${base}playlist.m3u8`);
    }

    return Array.from(new Set(urls));
  }

  private async tryFetchPlaylistBody(url: string): Promise<string | null> {
    const requestUrl = this.signUrlForServerMediaRequest(url);
    try {
      const response = await axios.get(requestUrl, {
        timeout: 20000,
        responseType: 'text',
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400,
      });
      return typeof response.data === 'string' ? response.data : '';
    } catch {
      return null;
    }
  }

  private async sumContentLengths(urls: string[], batchSize = 8): Promise<number | null> {
    if (!urls.length) return null;

    let total = 0;
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      const sizes = await Promise.all(batch.map((url) => this.tryResolveContentLength(url)));
      if (sizes.some((size) => size === null)) return null;
      total += sizes.reduce((sum, size) => sum + (size ?? 0), 0);
    }

    return total;
  }

  private resolvePlaylistItemUrl(playlistUrl: string, itemPath: string): string | null {
    const trimmed = String(itemPath || '').trim();
    if (!trimmed) return null;

    try {
      const resolved = new URL(trimmed, playlistUrl);
      return resolved.toString();
    } catch {
      return null;
    }
  }

  private async tryResolveContentLength(path: string, baseUrl?: string): Promise<number | null> {
    const url = this.normalizeResolutionUrl(path, baseUrl);
    if (!url) return null;
    const requestUrl = this.signUrlForServerMediaRequest(url);

    try {
      const response = await axios.head(requestUrl, {
        timeout: 20000,
        maxRedirects: 3,
        validateStatus: (status) => status >= 200 && status < 400,
      });

      const length = response.headers?.['content-length'];
      const parsed = length !== undefined ? Number(length) : Number.NaN;
      return Number.isFinite(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private normalizeResolutionUrl(path: string, baseUrl?: string): string | null {
    const trimmed = String(path || '').trim();
    if (!trimmed) return null;

    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (trimmed.startsWith('//')) return `https:${trimmed}`;
    if (baseUrl) {
      try {
        return new URL(trimmed, baseUrl).toString();
      } catch {
        return null;
      }
    }
    if (trimmed.startsWith('/')) return `https://video.bunnycdn.com${trimmed}`;
    return `https://video.bunnycdn.com/${trimmed}`;
  }

  private getStreamPlayBaseUrl(videoId: string): string {
    const base = this.getStreamPlayUrl(videoId);
    return base.endsWith('/') ? base : `${base}/`;
  }

  private signResolutionPaths(
    resolutions: BunnyResolutionPath[] | null,
    videoId: string,
  ): BunnyResolutionPath[] | null {
    if (!resolutions) return null;
    return resolutions.map((item) => ({
      ...item,
      path: this.signStreamPlaybackUrl(item.path, videoId),
    }));
  }

  private signNullableStreamUrl(url: string | null | undefined, videoId: string): string | null {
    if (!url) return null;
    return this.signStreamPlaybackUrl(url, videoId);
  }

  private signUrlForServerMediaRequest(url: string): string {
    const videoId = this.extractBunnyVideoId(url);
    if (!videoId || !this.isBunnyStreamMediaUrl(url, videoId)) return url;
    return this.signStreamPlaybackUrl(url, videoId);
  }

  private signBunnyStreamMediaUrl(parsed: URL, expires: number, pathAllowed: string): string {
    const parameters: Record<string, string> = {};
    for (const [key, value] of parsed.searchParams) {
      if (key === 'token' || key === 'expires' || key === 'bcdn_token') continue;
      if (Object.prototype.hasOwnProperty.call(parameters, key)) {
        throw new BadGatewayException(`Duplicate Bunny CDN token parameter "${key}" is not supported`);
      }
      parameters[key] = value;
    }
    parameters.token_path = pathAllowed;

    const sortedEntries = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b));
    const signingData = sortedEntries.map(([key, value]) => `${key}=${value}`).join('&');
    const urlData = sortedEntries
      .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
      .join('&');

    const hmac = createHmac('sha256', this.cdnTokenKey);
    hmac.update(pathAllowed);
    hmac.update(String(expires));
    hmac.update(signingData);

    const token = `HS256-${hmac
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')}`;

    const base = `${parsed.protocol}//${parsed.host}`;
    const tail = urlData ? `&${urlData}` : '';
    return `${base}/bcdn_token=${token}${tail}&expires=${expires}${parsed.pathname}`;
  }

  private removeExistingCdnToken(parsed: URL): URL {
    const unsigned = new URL(parsed.toString());
    const segments = unsigned.pathname.split('/').filter(Boolean);
    if (segments[0]?.startsWith('bcdn_token=')) {
      unsigned.pathname = `/${segments.slice(1).join('/')}`;
    }
    unsigned.searchParams.delete('token');
    unsigned.searchParams.delete('expires');
    unsigned.searchParams.delete('bcdn_token');
    return unsigned;
  }

  private isBunnyStreamStablePlaybackUrl(url?: string | null, videoId?: string | null): boolean {
    const parsed = this.parseUrl(url);
    return parsed ? this.isBunnyStreamStablePlaybackParsedUrl(parsed, videoId) : false;
  }

  private isBunnyStreamStablePlaybackParsedUrl(parsed: URL, videoId?: string | null): boolean {
    const normalizedVideoId = String(videoId || '').trim();
    const path = parsed.pathname;
    const escapedVideoId = this.escapeRegex(normalizedVideoId);
    if (parsed.hostname.toLowerCase() === 'video.bunnycdn.com') {
      return new RegExp(`^/play/[^/]+/${escapedVideoId}(?:/)?$`, 'i').test(path);
    }

    if (parsed.hostname.toLowerCase() === 'player.mediadelivery.net') {
      return new RegExp(`^/embed/[^/]+/${escapedVideoId}(?:/)?$`, 'i').test(path);
    }

    return false;
  }

  private isBunnyManagementUrl(parsed: URL): boolean {
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();
    if (hostname === 'api.bunny.net') return true;
    if (hostname === 'video.bunnycdn.com' && pathname.startsWith('/library/')) return true;
    if (hostname === 'video.bunnycdn.com' && pathname.startsWith('/tusupload')) return true;
    return false;
  }

  private isConfiguredStorageHost(hostname: string): boolean {
    const configuredHosts = [this.storagePublicHost, this.storageHost]
      .map((host) => this.normalizeHostname(host))
      .filter(Boolean);
    return configuredHosts.includes(this.normalizeHostname(hostname));
  }

  private pathContainsVideoId(pathname: string, videoId: string): boolean {
    return pathname.split('/').some((segment) => segment.toLowerCase() === videoId.toLowerCase());
  }

  private getVideoDirectoryPath(videoId: string): string {
    const normalized = String(videoId || '').trim().replace(/^\/+|\/+$/g, '');
    return `/${normalized}/`;
  }

  private assertCdnTokenConfigured() {
    if (!this.cdnTokenKey) {
      throw new BadGatewayException('Missing BUNNY_CDN_TOKEN_KEY for Bunny Stream CDN token authentication');
    }
  }

  private clampPlaybackTtl(expiresInSeconds: number): number {
    const MIN_TTL = 60;
    const MAX_TTL = 86400;

    if (!Number.isFinite(expiresInSeconds)) return BunnyService.DEFAULT_CDN_TOKEN_TTL_SECONDS;
    const rounded = Math.floor(expiresInSeconds);
    return Math.min(MAX_TTL, Math.max(MIN_TTL, rounded));
  }

  private parseUrl(url?: string | null): URL | null {
    if (!url) return null;
    try {
      const parsed = new URL(String(url).trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private normalizeHostname(host?: string | null): string {
    return String(host || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .toLowerCase();
  }

  private escapeRegex(value: string): string {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  describeError(error: any, operationLabel: string): string {
    const status = error?.response?.status;
    const code = error?.code ? ` (${error.code})` : '';
    const responseData = error?.response?.data;
    const responseMessage =
      typeof responseData === 'string'
        ? responseData
        : responseData?.message || responseData?.error || responseData?.title;
    const message = responseMessage || error?.message || 'Unknown error';

    return `${operationLabel} failed${code}${status ? `/${status}` : ''}: ${message}`;
  }

  async uploadImage(path: string, file: any): Promise<string> {
    const fileBuffer = this.getFileBuffer(file, 'storage upload');
    const key = this.storageApiKey;
    const url = `https://${this.storageHost}/${this.storageZone}/${path}`;
    await this.putWithRetry(
      url,
      fileBuffer,
      {
        headers: {
          AccessKey: key,
          'Content-Type': file.mimetype || 'application/octet-stream',
          'Content-Length': fileBuffer.length,
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 300000,
      },
      'Bunny Storage upload',
    );
    return `https://${this.storagePublicHost}/${path}`;
  }

  async deleteStorageFile(path: string): Promise<void> {
    const normalizedPath = String(path || '').replace(/^\/+/, '');
    if (!normalizedPath) return;

    const url = `https://${this.storageHost}/${this.storageZone}/${normalizedPath}`;
    await axios.delete(url, {
      headers: {
        AccessKey: this.storageApiKey,
      },
      timeout: 30000,
    });
  }

  async verifyStorageCredentials() {
    if (!this.storageZone || !this.storageHost || !this.storageApiKey) {
      throw new BadGatewayException('Missing Bunny Storage config (BUNNY_STORAGE_ZONE/BUNNY_STORAGE_HOST/BUNNY_STORAGE_API_KEY)');
    }

    const probePath = `healthchecks/bunny-storage-${randomUUID()}.txt`;
    const payload = Buffer.from(`probe:${new Date().toISOString()}`, 'utf8');
    const url = `https://${this.storageHost}/${this.storageZone}/${probePath}`;
    const startedAt = Date.now();

    try {
      await axios.put(url, payload, {
        headers: {
          AccessKey: this.storageApiKey,
          'Content-Type': 'text/plain',
          'Content-Length': payload.length,
        },
        timeout: 30000,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      await axios.delete(url, {
        headers: {
          AccessKey: this.storageApiKey,
        },
        timeout: 30000,
      });

      return {
        ok: true,
        host: this.storageHost,
        zone: this.storageZone,
        publicHost: this.storagePublicHost,
        probePath,
        elapsedMs: Date.now() - startedAt,
        storageKeyMask: this.maskSecret(this.storageApiKey),
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const code = error?.code || 'UNKNOWN';
      const message = error?.message || 'Unknown error';
      throw new BadGatewayException(
        `Bunny Storage verification failed (${code}${status ? `/${status}` : ''}): ${message}. Check BUNNY_STORAGE_HOST region endpoint and BUNNY_STORAGE_API_KEY.`,
      );
    }
  }

  async verifyStreamCredentials() {
    this.assertStreamConfigured();

    const url = `https://video.bunnycdn.com/library/${this.streamLibraryId}/videos?page=1&itemsPerPage=1`;
    const startedAt = Date.now();

    try {
      await axios.get(url, {
        headers: {
          AccessKey: this.apiKey,
        },
        timeout: 30000,
      });

      return {
        ok: true,
        libraryId: this.streamLibraryId,
        elapsedMs: Date.now() - startedAt,
        streamKeyMask: this.maskSecret(this.apiKey),
      };
    } catch (error: any) {
      const status = error?.response?.status;
      const code = error?.code || 'UNKNOWN';
      const message = error?.message || 'Unknown error';
      throw new BadGatewayException(
        `Bunny Stream verification failed (${code}${status ? `/${status}` : ''}): ${message}. Check BUNNY_STREAM_LIBRARY_ID and BUNNY_API_KEY.`,
      );
    }
  }

  private assertStreamConfigured() {
    if (!this.streamLibraryId || !this.apiKey) {
      throw new BadGatewayException('Missing Bunny Stream config (BUNNY_STREAM_LIBRARY_ID/BUNNY_API_KEY)');
    }
  }

  private assertCoreApiConfigured() {
    if (!this.coreApiKey) {
      throw new BadGatewayException('Missing BUNNY_CORE_API_KEY for updating video library settings');
    }
  }

  private getFileBuffer(file: any, operation: string): Buffer {
    if (!file?.buffer || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
      throw new BadGatewayException(`Invalid file buffer for ${operation}`);
    }
    return file.buffer;
  }

  private async putWithRetry(
    url: string,
    payload: Buffer,
    config: {
      headers: Record<string, string | number>;
      maxContentLength: number;
      maxBodyLength: number;
      timeout: number;
    },
    operationLabel: string,
  ) {
    const attempts = 3;
    const startedAt = Date.now();

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        await axios.put(url, payload, config);
        return;
      } catch (error: any) {
        const canRetry = this.shouldRetryAxiosError(error) && attempt < attempts;
        if (canRetry) {
          await this.sleep(350 * attempt);
          continue;
        }

        const code = error?.code ? ` (${error.code})` : '';
        const message = error?.message || 'Unknown error';
        const elapsedMs = Date.now() - startedAt;
        throw new BadGatewayException(
          `${operationLabel} failed${code}: ${message}. Size=${payload.length} bytes, elapsed=${elapsedMs}ms, attempts=${attempts}. Verify BUNNY_STORAGE_HOST region endpoint and storage key.`,
        );
      }
    }
  }

  private shouldRetryAxiosError(error: any): boolean {
    const networkCodes = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED', 'EAI_AGAIN', 'ENOTFOUND']);
    if (networkCodes.has(error?.code)) return true;

    const message = String(error?.message || '').toLowerCase();
    if (message.includes('socket hang up')) return true;

    const status = error?.response?.status;
    return typeof status === 'number' && status >= 500;
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private clampTusTtl(expiresInSeconds: number): number {
    const DEFAULT_TTL = 3600;
    const MIN_TTL = 60;
    const MAX_TTL = 86400;

    if (!Number.isFinite(expiresInSeconds)) return DEFAULT_TTL;
    const rounded = Math.floor(expiresInSeconds);
    return Math.min(MAX_TTL, Math.max(MIN_TTL, rounded));
  }

  private maskSecret(secret: string): string {
    const value = String(secret || '').trim();
    if (!value) return '';
    if (value.length <= 8) return '*'.repeat(value.length);
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private readEnv(key: string): string {
    return (this.configService.get<string>(key) ?? '').trim();
  }

  private readPositiveIntegerEnv(key: string, defaultValue: number): number {
    const raw = this.readEnv(key);
    if (!raw) return defaultValue;

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
    return Math.floor(parsed);
  }
}
