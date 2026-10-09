import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from "class-validator";
import {
  BUNNY_STREAM_RESOLUTIONS,
  BunnyStreamResolution,
} from "@/shared/bunny/bunny-resolution.constants";

export class VideoSessionDto {
  @ApiProperty({ description: "Stable app-generated device identifier" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiPropertyOptional({
    description:
      "Previous app/device identifier, when the client can still read it during installation-id migration.",
  })
  @IsOptional()
  @IsString()
  legacyDeviceId?: string;

  @ApiPropertyOptional({
    enum: BUNNY_STREAM_RESOLUTIONS,
    description: "Preferred HLS resolution when available.",
  })
  @IsOptional()
  @IsIn(BUNNY_STREAM_RESOLUTIONS)
  preferredResolution?: BunnyStreamResolution;

  @ApiPropertyOptional({
    description:
      "One-time playback challenge id returned by playback-challenge.",
  })
  @IsOptional()
  @IsString()
  challengeId?: string;

  @ApiPropertyOptional({
    description: "Challenge creation timestamp in unix milliseconds.",
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  challengeTimestamp?: number;

  @ApiPropertyOptional({ description: "Play Integrity Standard API token." })
  @IsOptional()
  @IsString()
  integrityToken?: string;

  @ApiPropertyOptional({
    description:
      "base64url DER ECDSA P-256/SHA-256 signature, made with the registered device key, over the UTF-8 canonical proof: " +
      "lines `action=<video_playback|video_download>`, `videoId=`, `deviceId=`, `timestamp=<challengeTimestamp>`, `challenge=` joined by \\n.",
  })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  deviceSignature?: string;
}

export class PlaybackChallengeDto {
  @ApiProperty({ description: "Stable app-generated device identifier" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;
}

export class VideoDeviceKeyDto {
  @ApiProperty({ description: "Stable app-generated device identifier" })
  @IsString()
  @IsNotEmpty()
  deviceId: string;

  @ApiProperty({
    description: "EC P-256 public key as X.509 SubjectPublicKeyInfo DER, base64url encoded.",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  publicKey: string;

  @ApiProperty({ enum: ["ECDSA_P256_SHA256"] })
  @IsString()
  @IsIn(["ECDSA_P256_SHA256"])
  algorithm: "ECDSA_P256_SHA256";
}

export class ReplaceVideoDeviceKeyDto extends VideoDeviceKeyDto {}
