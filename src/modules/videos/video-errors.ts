import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";

/**
 * Stable machine-readable codes for the video security flows.
 *
 * AllExceptionsFilter copies `error` into the response `errorCode`, so the
 * mobile client matches on `errorCode` and shows `message` to the user.
 */
export const VideoErrorCode = {
  DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED:
    "VIDEO_DEVICE_LIMIT_EXCEEDED_REPLACEMENT_REQUIRED",
  DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED:
    "VIDEO_DEVICE_KEY_MISMATCH_REPLACEMENT_REQUIRED",
  DEVICE_KEY_INVALID: "VIDEO_DEVICE_KEY_INVALID",
  DEVICE_KEY_NOT_REGISTERED: "VIDEO_DEVICE_KEY_NOT_REGISTERED",
  DEVICE_SIGNATURE_REQUIRED: "VIDEO_DEVICE_SIGNATURE_REQUIRED",
  DEVICE_SIGNATURE_INVALID: "VIDEO_DEVICE_SIGNATURE_INVALID",
  DEVICE_CONCURRENT_UPDATE: "VIDEO_DEVICE_CONCURRENT_UPDATE",
  PLAYBACK_CHALLENGE_REQUIRED: "VIDEO_PLAYBACK_CHALLENGE_REQUIRED",
  PLAYBACK_CHALLENGE_INVALID: "VIDEO_PLAYBACK_CHALLENGE_INVALID",
  PLAY_INTEGRITY_FAILED: "VIDEO_PLAY_INTEGRITY_FAILED",
  PLAYBACK_SESSION_INVALID: "VIDEO_PLAYBACK_SESSION_INVALID",
  RATE_LIMITED: "VIDEO_RATE_LIMITED",
  STUDENT_REQUIRED: "VIDEO_STUDENT_REQUIRED",
  TEACHER_REQUIRED: "VIDEO_TEACHER_REQUIRED",
  ACCOUNT_INACTIVE: "VIDEO_ACCOUNT_INACTIVE",
  TEACHER_NOT_OWNER: "VIDEO_TEACHER_NOT_OWNER",
  SUBSCRIPTION_REQUIRED: "VIDEO_SUBSCRIPTION_REQUIRED",
  SUBSCRIPTION_EXPIRED: "VIDEO_SUBSCRIPTION_EXPIRED",
  COURSE_EXPIRED: "VIDEO_COURSE_EXPIRED",
  DOWNLOAD_DISABLED: "VIDEO_DOWNLOAD_DISABLED",
  GUEST_FREE_ONLY: "VIDEO_GUEST_FREE_ONLY",
  BUNNY_ID_MISSING: "VIDEO_BUNNY_ID_MISSING",
} as const;

export type VideoErrorCodeValue =
  (typeof VideoErrorCode)[keyof typeof VideoErrorCode];

function body(status: number, code: VideoErrorCodeValue, message: string) {
  return { statusCode: status, error: code, code, message };
}

export function videoForbidden(code: VideoErrorCodeValue, message: string) {
  return new ForbiddenException(body(HttpStatus.FORBIDDEN, code, message));
}

export function videoConflict(code: VideoErrorCodeValue, message: string) {
  return new ConflictException(body(HttpStatus.CONFLICT, code, message));
}

export function videoBadRequest(code: VideoErrorCodeValue, message: string) {
  return new BadRequestException(body(HttpStatus.BAD_REQUEST, code, message));
}

export function videoTooManyRequests(message: string) {
  return new HttpException(
    body(HttpStatus.TOO_MANY_REQUESTS, VideoErrorCode.RATE_LIMITED, message),
    HttpStatus.TOO_MANY_REQUESTS,
  );
}
