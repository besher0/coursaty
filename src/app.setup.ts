import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';

/**
 * Every API route lives under /v2. The unversioned paths are retired so app
 * builds from before /v2 stop working: they get 426 with an "update the app"
 * message (see AllExceptionsFilter). Server-to-server routes that must keep
 * their path opt out with `version: VERSION_NEUTRAL`.
 */
export const API_VERSION = '2';
export const API_PATH_PREFIX = `/v${API_VERSION}/`;

export function configureApp(app: INestApplication) {
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: API_VERSION });
}

/** Unmatched request outside /v2 (and outside server-to-server routes). */
export function isRetiredApiPath(path: string) {
  return (
    !path.startsWith(API_PATH_PREFIX) &&
    path !== API_PATH_PREFIX.slice(0, -1) &&
    !path.startsWith('/internal/')
  );
}
