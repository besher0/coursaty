import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Students may sign in from a single device: the one the account was created
 * on (accounts created before device binding are bound by their first login).
 * Teachers and admins are not affected.
 *
 * The bound id is `User.loginDeviceId`; student tokens carry it as `did` and
 * are only accepted while it still matches. The app also sends it on every
 * request in LOGIN_DEVICE_HEADER, which lets a session from before device
 * binding bind the first device that uses it (see JwtStrategy).
 */
export const LOGIN_DEVICE_HEADER = 'x-coursaty-device';

export const StudentDeviceErrorCode = {
  DEVICE_LOCKED: 'AUTH_STUDENT_DEVICE_LOCKED',
  DEVICE_ID_REQUIRED: 'AUTH_DEVICE_ID_REQUIRED',
  SESSION_DEVICE_MISMATCH: 'AUTH_SESSION_DEVICE_MISMATCH',
} as const;

/** On unless STUDENT_SINGLE_DEVICE_ENFORCE is explicitly false/0/off/no. */
export function isStudentDeviceLockEnforced(config?: ConfigService) {
  const raw = String(config?.get('STUDENT_SINGLE_DEVICE_ENFORCE') ?? '')
    .trim()
    .toLowerCase();
  return !['false', '0', 'off', 'no'].includes(raw);
}

export function normalizeLoginDeviceId(value?: unknown) {
  const deviceId = typeof value === 'string' ? value.trim() : '';
  return deviceId.length > 0 ? deviceId : null;
}

export function studentDeviceLocked() {
  return new ForbiddenException({
    statusCode: 403,
    error: StudentDeviceErrorCode.DEVICE_LOCKED,
    code: StudentDeviceErrorCode.DEVICE_LOCKED,
    message:
      'هذا الحساب مسجّل على جهاز آخر. لا يمكن تسجيل الدخول إلا من الجهاز الذي أُنشئ عليه الحساب',
  });
}

export function studentDeviceIdRequired() {
  return new ForbiddenException({
    statusCode: 403,
    error: StudentDeviceErrorCode.DEVICE_ID_REQUIRED,
    code: StudentDeviceErrorCode.DEVICE_ID_REQUIRED,
    message: 'يرجى تحديث التطبيق إلى آخر إصدار لتتمكن من تسجيل الدخول',
  });
}

export function studentSessionDeviceMismatch() {
  return new UnauthorizedException({
    statusCode: 401,
    error: StudentDeviceErrorCode.SESSION_DEVICE_MISMATCH,
    code: StudentDeviceErrorCode.SESSION_DEVICE_MISMATCH,
    message: 'انتهت جلستك على هذا الجهاز، سجّل الدخول مجدداً',
  });
}
