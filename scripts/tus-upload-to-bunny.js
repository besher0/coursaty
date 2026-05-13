const fs = require('fs');
const path = require('path');
const axios = require('axios');
const crypto = require('crypto');
const tus = require('tus-js-client');

function loadEnv(envPath) {
  const text = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    env[key] = val;
  }
  return env;
}

(async () => {
  try {
    const env = loadEnv(path.join(process.cwd(), '.env'));
    const filePath = process.env.TUS_TEST_FILE || path.join(process.cwd(), '..', 'splash.mp4');
    // Fallback to desktop file
    const desktopPath = path.join(process.env.HOME || process.env.USERPROFILE || 'C:\\Users\\USER', 'Desktop', 'splash.mp4');
    const resolvedFile = fs.existsSync(filePath) ? filePath : fs.existsSync(desktopPath) ? desktopPath : null;
    if (!resolvedFile) throw new Error('Video file not found; set TUS_TEST_FILE env or place splash.mp4 on Desktop');

    const libraryId = env.BUNNY_STREAM_LIBRARY_ID;
    const apiKey = env.BUNNY_API_KEY;
    if (!libraryId || !apiKey) throw new Error('Missing BUNNY_STREAM_LIBRARY_ID or BUNNY_API_KEY in .env');

    const title = 'tus-upload-' + Date.now();
    console.log('Creating video on Bunny Stream...');
    const createResp = await axios.post(`https://video.bunnycdn.com/library/${libraryId}/videos`, { title }, { headers: { AccessKey: apiKey } });
    const videoId = createResp.data.guid;
    console.log('Created videoId:', videoId);

    // sign TUS signature (same logic as server)
    const expiresInSeconds = Number(process.env.TUS_TTL_SECONDS || 3600);
    const ttl = Math.max(60, Math.min(86400, Math.floor(expiresInSeconds)));
    const authorizationExpire = Math.floor(Date.now() / 1000) + ttl;
    const signaturePayload = `${libraryId}${apiKey}${authorizationExpire}${videoId}`;
    const authorizationSignature = crypto.createHash('sha256').update(signaturePayload).digest('hex');

    const headers = {
      AuthorizationSignature: authorizationSignature,
      AuthorizationExpire: String(authorizationExpire),
      VideoId: videoId,
      LibraryId: libraryId,
    };

    console.log('TUS headers to send:', headers);

    const fileSize = fs.statSync(resolvedFile).size;
    const fileStream = fs.createReadStream(resolvedFile);

    console.log('Starting tus upload to https://video.bunnycdn.com/tusupload ...');

    const upload = new tus.Upload(fileStream, {
      endpoint: 'https://video.bunnycdn.com/tusupload',
      retryDelays: [0, 1000, 3000, 5000],
      metadata: {
        filename: path.basename(resolvedFile),
        filetype: 'video/mp4',
      },
      uploadSize: fileSize,
      headers,
      onError: function (err) {
        console.error('TUS upload failed:', err);
      },
      onProgress: function (bytesUploaded, bytesTotal) {
        const percentage = ((bytesUploaded / bytesTotal) * 100).toFixed(2);
        console.log(bytesUploaded, bytesTotal, `${percentage}%`);
      },
      onSuccess: async function () {
        console.log('TUS upload finished. VideoId:', videoId);
        try {
          const playResp = await axios.get(`https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}/play`, { headers: { AccessKey: apiKey } });
          console.log('Play data:', playResp.data);
        } catch (e) {
          console.error('Could not fetch play data after upload:', e.response?.data || e.message);
        }
      },
    });

    // In Node, tus-js-client expects a File or Blob; for streams we provide the size and a stream
    upload.start();
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  }
})();
