import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as tus from 'tus-js-client';

type UploadMode = 'uploads' | 'lecture' | 'course';

type CliOptions = {
  filePath: string;
  token: string;
  baseUrl: string;
  mode: UploadMode;
  lectureId?: string;
  courseId?: string;
  title?: string;
  description?: string;
  isFree?: boolean;
  preferredResolution?: string;
  expiresInSeconds: number;
  chunkSizeMb: number;
  resetSession: boolean;
};

type InitUploadResponse = {
  upload: {
    videoId: string;
    endpoint: string;
    headers: Record<string, string>;
  };
};

type StoredSession = {
  videoId: string;
  endpoint: string;
  headers: Record<string, string>;
  authorizationExpire: number;
  mode: UploadMode;
  initUrl: string;
  refreshUrl: string;
  completeUrl: string;
  filePath: string;
  lectureId?: string;
  courseId?: string;
  createdAt: string;
};

type SessionStore = Record<string, StoredSession>;

const SESSION_STORAGE_PATH = path.resolve(process.cwd(), '.tus-upload-sessions.json');
const URL_STORAGE_PATH = path.resolve(process.cwd(), '.tus-url-storage.json');

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;

    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      out[key] = true;
      continue;
    }

    out[key] = next;
    i += 1;
  }

  return out;
}

function toBoolean(value: string | boolean | undefined, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
  return fallback;
}

function toNumber(value: string | boolean | undefined, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function requiredString(value: string | undefined, field: string): string {
  if (!value || !value.trim()) {
    throw new Error(`Missing required argument: --${field}`);
  }
  return value.trim();
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.mkv') return 'video/x-matroska';
  if (ext === '.avi') return 'video/x-msvideo';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function normalizeHeaders(headers: Record<string, string>): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers || {})) {
    normalized[String(k)] = String(v);
  }
  return normalized;
}

function parseCliOptions(): CliOptions {
  const args = parseArgs(process.argv.slice(2));

  const filePath = requiredString((args.file as string) || process.env.UPLOAD_FILE_PATH, 'file');
  const token = requiredString((args.token as string) || process.env.UPLOAD_JWT_TOKEN, 'token');
  const baseUrl = ((args.baseUrl as string) || process.env.UPLOAD_API_BASE_URL || 'http://localhost:4000').trim();
  const modeRaw = ((args.mode as string) || process.env.UPLOAD_MODE || 'uploads').trim().toLowerCase();
  const allowedModes: UploadMode[] = ['uploads', 'lecture', 'course'];
  if (!allowedModes.includes(modeRaw as UploadMode)) {
    throw new Error(`Invalid --mode value "${modeRaw}". Use one of: uploads, lecture, course`);
  }

  return {
    filePath,
    token,
    baseUrl,
    mode: modeRaw as UploadMode,
    lectureId: ((args.lectureId as string) || process.env.UPLOAD_LECTURE_ID || '').trim() || undefined,
    courseId: ((args.courseId as string) || process.env.UPLOAD_COURSE_ID || '').trim() || undefined,
    title: ((args.title as string) || process.env.UPLOAD_TITLE || '').trim() || undefined,
    description: ((args.description as string) || process.env.UPLOAD_DESCRIPTION || '').trim() || undefined,
    isFree: toBoolean((args.isFree as string | boolean) ?? process.env.UPLOAD_IS_FREE, false),
    preferredResolution:
      ((args.preferredResolution as string) || process.env.UPLOAD_PREFERRED_RESOLUTION || '').trim() || undefined,
    expiresInSeconds: toNumber((args.expiresInSeconds as string) ?? process.env.UPLOAD_EXPIRES_IN_SECONDS, 7200),
    chunkSizeMb: toNumber((args.chunkSizeMb as string) ?? process.env.UPLOAD_CHUNK_SIZE_MB, 8),
    resetSession: toBoolean((args.resetSession as string | boolean) ?? process.env.UPLOAD_RESET_SESSION, false),
  };
}

function buildPaths(options: CliOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);

  if (options.mode === 'uploads') {
    return {
      initUrl: `${baseUrl}/uploads/videos/tus/init`,
      refreshUrl: `${baseUrl}/uploads/videos/tus/refresh`,
      completeUrl: `${baseUrl}/uploads/videos/tus/complete`,
    };
  }

  if (options.mode === 'lecture') {
    const lectureId = requiredString(options.lectureId, 'lectureId');
    return {
      initUrl: `${baseUrl}/lectures/${lectureId}/videos/tus/init`,
      refreshUrl: `${baseUrl}/lectures/${lectureId}/videos/tus/refresh`,
      completeUrl: `${baseUrl}/lectures/${lectureId}/videos/tus/complete`,
    };
  }

  const lectureId = requiredString(options.lectureId, 'lectureId');
  const courseId = requiredString(options.courseId, 'courseId');
  return {
    initUrl: `${baseUrl}/courses/${courseId}/lectures/${lectureId}/videos/tus/init`,
    refreshUrl: `${baseUrl}/courses/${courseId}/lectures/${lectureId}/videos/tus/refresh`,
    completeUrl: `${baseUrl}/courses/${courseId}/lectures/${lectureId}/videos/tus/complete`,
  };
}

function getSessionKey(options: CliOptions) {
  const absoluteFilePath = path.resolve(options.filePath);
  return [
    normalizeBaseUrl(options.baseUrl),
    options.mode,
    absoluteFilePath,
    options.lectureId || '',
    options.courseId || '',
  ].join('|');
}

function loadSessionStore(): SessionStore {
  if (!fs.existsSync(SESSION_STORAGE_PATH)) {
    return {};
  }

  try {
    const raw = fs.readFileSync(SESSION_STORAGE_PATH, 'utf8').trim();
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SessionStore;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveSessionStore(store: SessionStore) {
  fs.writeFileSync(SESSION_STORAGE_PATH, JSON.stringify(store, null, 2), 'utf8');
}

function isSessionMatchingContext(
  session: StoredSession | undefined,
  options: CliOptions,
  initUrl: string,
  refreshUrl: string,
  completeUrl: string,
): session is StoredSession {
  if (!session) return false;
  if (session.mode !== options.mode) return false;
  if (session.initUrl !== initUrl) return false;
  if (session.refreshUrl !== refreshUrl) return false;
  if (session.completeUrl !== completeUrl) return false;
  if (session.filePath !== path.resolve(options.filePath)) return false;
  if ((session.lectureId || '') !== (options.lectureId || '')) return false;
  if ((session.courseId || '') !== (options.courseId || '')) return false;
  return true;
}

function isSessionReusable(session: StoredSession | undefined): session is StoredSession {
  if (!session) return false;
  const now = Math.floor(Date.now() / 1000);
  return session.authorizationExpire > now + 90;
}

async function initTusUpload(options: CliOptions, initUrl: string): Promise<InitUploadResponse> {
  const authHeaders = {
    Authorization: `Bearer ${options.token}`,
  };

  if (options.mode === 'uploads') {
    const payload = {
      title: options.title,
      expiresInSeconds: options.expiresInSeconds,
    };
    const res = await axios.post(initUrl, payload, { headers: authHeaders });
    return res.data;
  }

  const payload = {
    videoName: options.title,
    expiresInSeconds: options.expiresInSeconds,
  };
  const res = await axios.post(initUrl, payload, { headers: authHeaders });
  return res.data;
}

async function resolveUploadSession(
  options: CliOptions,
  initUrl: string,
  refreshUrl: string,
  completeUrl: string,
): Promise<{ initData: InitUploadResponse; sessionKey: string }> {
  const sessionKey = getSessionKey(options);
  const sessionStore = loadSessionStore();

  if (options.resetSession && sessionStore[sessionKey]) {
    delete sessionStore[sessionKey];
    saveSessionStore(sessionStore);
    console.log('Existing local session cleared due to --resetSession flag.');
  }

  const existingRaw = sessionStore[sessionKey];
  const existing = isSessionMatchingContext(existingRaw, options, initUrl, refreshUrl, completeUrl)
    ? existingRaw
    : undefined;

  if (existing && isSessionReusable(existing)) {
    console.log(`Using existing resumable session: ${existing.videoId}`);
    return {
      initData: {
        upload: {
          videoId: existing.videoId,
          endpoint: existing.endpoint,
          headers: existing.headers,
        },
      },
      sessionKey,
    };
  }

  if (existing) {
    console.log(`Stored session expired. Refreshing signature for existing videoId: ${existing.videoId}`);
    const refreshedData = await refreshTusUpload(options, refreshUrl, existing.videoId);
    const refreshedHeaders = normalizeHeaders(refreshedData.upload.headers || {});
    const refreshedAuthorizationExpire = Number(refreshedHeaders.AuthorizationExpire || 0);

    sessionStore[sessionKey] = {
      ...existing,
      endpoint: String(refreshedData.upload.endpoint),
      headers: refreshedHeaders,
      authorizationExpire: Number.isFinite(refreshedAuthorizationExpire) ? refreshedAuthorizationExpire : 0,
      createdAt: new Date().toISOString(),
    };
    saveSessionStore(sessionStore);

    return {
      initData: {
        upload: {
          videoId: existing.videoId,
          endpoint: sessionStore[sessionKey].endpoint,
          headers: sessionStore[sessionKey].headers,
        },
      },
      sessionKey,
    };
  }

  if (existingRaw) {
    console.log('Stored session mismatched with current inputs. Creating new upload session.');
    delete sessionStore[sessionKey];
    saveSessionStore(sessionStore);
  }

  const initData = await initTusUpload(options, initUrl);
  const headers = normalizeHeaders(initData.upload.headers || {});
  const authorizationExpire = Number(headers.AuthorizationExpire || 0);

  sessionStore[sessionKey] = {
    videoId: String(initData.upload.videoId),
    endpoint: String(initData.upload.endpoint),
    headers,
    authorizationExpire: Number.isFinite(authorizationExpire) ? authorizationExpire : 0,
    mode: options.mode,
    initUrl,
    refreshUrl,
    completeUrl,
    filePath: path.resolve(options.filePath),
    lectureId: options.lectureId,
    courseId: options.courseId,
    createdAt: new Date().toISOString(),
  };
  saveSessionStore(sessionStore);

  return { initData: { upload: { ...initData.upload, headers } }, sessionKey };
}

async function refreshTusUpload(
  options: CliOptions,
  refreshUrl: string,
  videoId: string,
): Promise<InitUploadResponse> {
  const authHeaders = {
    Authorization: `Bearer ${options.token}`,
  };
  const payload = {
    videoId,
    expiresInSeconds: options.expiresInSeconds,
  };
  const res = await axios.post(refreshUrl, payload, { headers: authHeaders });
  return res.data;
}

function removeStoredSession(sessionKey: string) {
  const sessionStore = loadSessionStore();
  if (!sessionStore[sessionKey]) return;
  delete sessionStore[sessionKey];
  saveSessionStore(sessionStore);
}

function getUploadMetadataVideoId(metadata: Record<string, string> | undefined): string | null {
  if (!metadata) return null;
  return metadata.videoid || metadata.videoId || metadata.VideoId || null;
}

async function runTusUpload(options: CliOptions, initData: InitUploadResponse): Promise<void> {
  const absoluteFilePath = path.resolve(options.filePath);
  const fileStat = fs.statSync(absoluteFilePath);
  if (!fileStat.isFile()) {
    throw new Error(`Path is not a file: ${absoluteFilePath}`);
  }

  const fileStream = fs.createReadStream(absoluteFilePath);
  const TusFileUrlStorage = (tus as any).FileUrlStorage;
  const urlStorage = TusFileUrlStorage ? new TusFileUrlStorage(URL_STORAGE_PATH) : undefined;
  const chunkSize = Math.max(1, Math.floor(options.chunkSizeMb)) * 1024 * 1024;
  const uploadVideoId = String(initData.upload.videoId);

  const upload = new tus.Upload(fileStream, {
    endpoint: initData.upload.endpoint,
    headers: initData.upload.headers,
    uploadSize: fileStat.size,
    chunkSize,
    retryDelays: [0, 1000, 3000, 5000, 10000, 20000, 30000],
    urlStorage,
    metadata: {
      filename: path.basename(absoluteFilePath),
      filetype: getMimeType(absoluteFilePath),
      title: options.title || path.basename(absoluteFilePath),
      videoid: uploadVideoId,
    },
    onError: (error) => {
      console.error('Upload failed:', error.message || error);
    },
    onProgress: (uploadedBytes, totalBytes) => {
      const percentage = ((uploadedBytes / totalBytes) * 100).toFixed(2);
      process.stdout.write(`\rUploading: ${percentage}% (${uploadedBytes}/${totalBytes} bytes)`);
    },
    onSuccess: () => {
      process.stdout.write('\n');
      console.log('Upload finished to Bunny TUS endpoint.');
    },
  });

  const previousUploads = await upload.findPreviousUploads();
  const matchingPrevious = previousUploads.find((previous) => {
    return getUploadMetadataVideoId(previous.metadata as Record<string, string>) === uploadVideoId;
  });

  if (matchingPrevious) {
    upload.resumeFromPreviousUpload(matchingPrevious);
    console.log('Resuming previous interrupted upload session...');
  } else {
    console.log('Starting new upload session...');
  }

  await new Promise<void>((resolve, reject) => {
    upload.options.onError = (error) => reject(error);
    upload.options.onSuccess = () => resolve();
    upload.start();
  });
}

async function completeTusUpload(options: CliOptions, completeUrl: string, videoId: string) {
  const authHeaders = {
    Authorization: `Bearer ${options.token}`,
  };

  if (options.mode === 'uploads') {
    const payload = {
      videoId,
      title: options.title,
      preferredResolution: options.preferredResolution,
    };
    const res = await axios.post(completeUrl, payload, { headers: authHeaders });
    return res.data;
  }

  const payload = {
    videoId,
    videoName: options.title,
    description: options.description,
    isFree: options.isFree,
    preferredResolution: options.preferredResolution,
  };
  const res = await axios.post(completeUrl, payload, { headers: authHeaders });
  return res.data;
}

function printUsage() {
  console.log('Usage:');
  console.log(
    'npm run upload:video:auto -- --file "C:\\\\video.mp4" --token "<JWT>" --baseUrl "http://localhost:4000" --mode uploads --title "My Video"',
  );
  console.log(
    'npm run upload:video:auto -- --file "C:\\\\video.mp4" --token "<JWT>" --mode lecture --lectureId "<UUID>" --title "Lesson 1" --description "..." --isFree false',
  );
  console.log(
    'npm run upload:video:auto -- --file "C:\\\\video.mp4" --token "<JWT>" --mode course --courseId "<UUID>" --lectureId "<UUID>" --title "Lesson 1"',
  );
  console.log('Optional: add --resetSession true to force creating a new upload session.');
}

async function main() {
  try {
    const options = parseCliOptions();
    const { initUrl, refreshUrl, completeUrl } = buildPaths(options);

    console.log(`Mode: ${options.mode}`);
    console.log(`File: ${path.resolve(options.filePath)}`);
    console.log(`Init URL: ${initUrl}`);

    const { initData, sessionKey } = await resolveUploadSession(options, initUrl, refreshUrl, completeUrl);
    const videoId = initData.upload.videoId;
    if (!videoId) {
      throw new Error('Init endpoint did not return upload.videoId');
    }
    console.log(`Video ID: ${videoId}`);

    await runTusUpload(options, initData);
    const result = await completeTusUpload(options, completeUrl, videoId);

    removeStoredSession(sessionKey);
    console.log('Complete response:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('Auto upload failed.');
    console.error(error?.response?.data || error?.message || error);
    printUsage();
    process.exit(1);
  }
}

main();
