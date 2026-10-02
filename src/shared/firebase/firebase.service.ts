import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';

@Injectable()
export class FirebaseService {
  private readonly logger = new Logger(FirebaseService.name);
  private initialized = false;

  constructor(private readonly configService: ConfigService) {
    this.init();
  }

  private init() {
    if (this.initialized) return;
    const serviceAccountPath = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_PATH');
    const serviceAccount = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT_JSON');

    if (serviceAccountPath) {
      try {
        const absolutePath = path.resolve(serviceAccountPath);
        const fileContents = fs.readFileSync(absolutePath, 'utf-8');
        const credentials = JSON.parse(fileContents);
        admin.initializeApp({
          credential: admin.credential.cert(credentials),
        });
        this.initialized = true;
        return;
      } catch (err) {
        this.logger.error('Failed to load FIREBASE_SERVICE_ACCOUNT_PATH', err as Error);
      }
    }

    if (serviceAccount) {
      const credentials = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(credentials),
      });
      this.initialized = true;
      return;
    }

    admin.initializeApp({ credential: admin.credential.applicationDefault() });
    this.initialized = true;
  }

  async sendPush(token: string, title: string, body: string) {
    if (!token) return;
    try {
      await admin.messaging().send({ notification: { title, body }, token });
    } catch (err) {
      this.logger.error('FCM send failed', err as Error);
    }
  }
}
