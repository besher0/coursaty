-- Offline downloads now go through the edge gateway with a device-bound
-- session token instead of a direct signed Bunny URL.
ALTER TYPE "VideoPlaybackSessionType" ADD VALUE IF NOT EXISTS 'DOWNLOAD';
