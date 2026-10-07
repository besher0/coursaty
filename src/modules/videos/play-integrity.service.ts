import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { GoogleAuth } from "google-auth-library";

type IntegrityVerdict = {
  ok: boolean;
  enforced: boolean;
  reason?: string;
  appVerdict?: string;
  deviceVerdicts?: string[];
  requestHash?: string;
  packageName?: string;
  timestampMillis?: string;
};

@Injectable()
export class PlayIntegrityService {
  private readonly logger = new Logger(PlayIntegrityService.name);

  constructor(private readonly config: ConfigService) {}

  async verify(input: {
    token?: string | null;
    expectedRequestHash: string;
    expectedPackageName: string;
  }): Promise<IntegrityVerdict> {
    const enforced = this.readBoolean("VIDEO_PLAY_INTEGRITY_ENFORCE", false);
    const configured = this.hasGoogleConfig();

    if (!input.token) {
      return this.finish({ ok: !enforced, enforced, reason: "missing_token" });
    }
    if (!configured) {
      return this.finish({
        ok: !enforced,
        enforced,
        reason: "google_config_missing",
      });
    }

    try {
      const payload = await this.decode(input.token, input.expectedPackageName);
      const requestDetails =
        payload?.tokenPayloadExternal?.requestDetails ??
        payload?.requestDetails ??
        {};
      const appIntegrity =
        payload?.tokenPayloadExternal?.appIntegrity ??
        payload?.appIntegrity ??
        {};
      const deviceIntegrity =
        payload?.tokenPayloadExternal?.deviceIntegrity ??
        payload?.deviceIntegrity ??
        {};

      const requestHash = String(requestDetails.requestHash ?? "");
      const packageName = String(requestDetails.requestPackageName ?? "");
      const timestampMillis = String(requestDetails.timestampMillis ?? "");
      const appVerdict = String(appIntegrity.appRecognitionVerdict ?? "");
      const deviceVerdicts = Array.isArray(
        deviceIntegrity.deviceRecognitionVerdict,
      )
        ? deviceIntegrity.deviceRecognitionVerdict.map(String)
        : [];

      const maxAgeMs = this.readPositiveInteger(
        "VIDEO_PLAY_INTEGRITY_MAX_AGE_MS",
        120_000,
      );
      const tokenAge = Date.now() - Number(timestampMillis);
      const fresh =
        Number.isFinite(tokenAge) &&
        tokenAge >= -30_000 &&
        tokenAge <= maxAgeMs;
      const requireDeviceVerdict =
        this.readEnv("VIDEO_PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT") ||
        "MEETS_DEVICE_INTEGRITY";
      const ok =
        packageName === input.expectedPackageName &&
        requestHash === input.expectedRequestHash &&
        appVerdict === "PLAY_RECOGNIZED" &&
        deviceVerdicts.includes(requireDeviceVerdict) &&
        fresh;

      return this.finish({
        ok: ok || !enforced,
        enforced,
        reason: ok ? undefined : "verdict_failed",
        appVerdict,
        deviceVerdicts,
        requestHash,
        packageName,
        timestampMillis,
      });
    } catch (error) {
      this.logger.warn(
        `Play Integrity decode failed: ${error instanceof Error ? error.message : "unknown_error"}`,
      );
      return this.finish({ ok: !enforced, enforced, reason: "decode_failed" });
    }
  }

  private async decode(token: string, packageName: string) {
    const auth = new GoogleAuth({
      keyFile:
        this.readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH") || undefined,
      scopes: ["https://www.googleapis.com/auth/playintegrity"],
    });
    const client = await auth.getClient();
    const headers = await client.getRequestHeaders();
    const response = await axios.post(
      `https://playintegrity.googleapis.com/v1/${packageName}:decodeIntegrityToken`,
      { integrityToken: token },
      { headers },
    );
    return response.data;
  }

  private finish(verdict: IntegrityVerdict) {
    this.logger.log(
      `integrity=${verdict.appVerdict ?? verdict.reason ?? "unknown"} deviceIntegrity=${verdict.deviceVerdicts?.includes("MEETS_DEVICE_INTEGRITY") ?? false} enforced=${verdict.enforced}`,
    );
    return verdict;
  }

  private hasGoogleConfig() {
    return Boolean(
      this.readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_PATH") &&
      this.readEnv("GOOGLE_PLAY_PACKAGE_NAME"),
    );
  }

  private readEnv(key: string) {
    return (this.config.get<string>(key) ?? "").trim();
  }

  private readBoolean(key: string, defaultValue: boolean) {
    const value = this.readEnv(key).toLowerCase();
    if (!value) return defaultValue;
    return ["1", "true", "yes", "on"].includes(value);
  }

  private readPositiveInteger(key: string, defaultValue: number) {
    const parsed = Number(this.readEnv(key));
    return Number.isFinite(parsed) && parsed > 0
      ? Math.floor(parsed)
      : defaultValue;
  }
}
