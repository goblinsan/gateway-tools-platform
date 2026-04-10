import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { normalizeAudioUpload } from "@/lib/services/stt";

const DEFAULT_EXPIRY_SECONDS = 15 * 60;
const STT_UPLOAD_PREFIX = "stt";

export interface PresignedUploadTarget {
  uploadKey: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  filename: string;
  contentType: string;
}

interface ObjectStoreConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
}

let client: S3Client | null = null;

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} environment variable is not set`);
  }
  return value;
}

function getObjectStoreConfig(): ObjectStoreConfig {
  return {
    bucket: requireEnv("OBJECT_STORE_BUCKET"),
    region: process.env.OBJECT_STORE_REGION?.trim() || "auto",
    endpoint: process.env.OBJECT_STORE_ENDPOINT?.trim() || undefined,
    accessKeyId: requireEnv("OBJECT_STORE_ACCESS_KEY_ID"),
    secretAccessKey: requireEnv("OBJECT_STORE_SECRET_ACCESS_KEY"),
    forcePathStyle: (process.env.OBJECT_STORE_FORCE_PATH_STYLE?.trim() ?? "false").toLowerCase() === "true",
  };
}

export function isObjectStoreConfigured(): boolean {
  return Boolean(
    process.env.OBJECT_STORE_BUCKET &&
      process.env.OBJECT_STORE_ACCESS_KEY_ID &&
      process.env.OBJECT_STORE_SECRET_ACCESS_KEY,
  );
}

function getClient(): S3Client {
  if (client) {
    return client;
  }
  const config = getObjectStoreConfig();
  client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: config.forcePathStyle,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return client;
}

function buildUploadKey(userId: string, filename: string): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${STT_UPLOAD_PREFIX}/${userId}/${stamp}-${crypto.randomUUID()}-${filename}`;
}

export function assertSttUploadOwnership(userId: string, uploadKey: string): void {
  const expectedPrefix = `${STT_UPLOAD_PREFIX}/${userId}/`;
  if (!uploadKey.startsWith(expectedPrefix)) {
    throw new Error("Upload key does not belong to the authenticated user");
  }
}

export async function createPresignedSttUpload(
  userId: string,
  filename: string,
  contentType?: string | null,
): Promise<PresignedUploadTarget> {
  const normalized = normalizeAudioUpload(filename, contentType);
  const config = getObjectStoreConfig();
  const uploadKey = buildUploadKey(userId, normalized.filename);
  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: uploadKey,
    ContentType: normalized.contentType,
  });
  const uploadUrl = await getSignedUrl(getClient(), command, {
    expiresIn: DEFAULT_EXPIRY_SECONDS,
  });

  return {
    uploadKey,
    uploadUrl,
    headers: { "Content-Type": normalized.contentType },
    expiresInSeconds: DEFAULT_EXPIRY_SECONDS,
    filename: normalized.filename,
    contentType: normalized.contentType,
  };
}

export async function assertUploadedObjectExists(
  userId: string,
  uploadKey: string,
): Promise<void> {
  assertSttUploadOwnership(userId, uploadKey);
  const config = getObjectStoreConfig();
  await getClient().send(
    new HeadObjectCommand({
      Bucket: config.bucket,
      Key: uploadKey,
    }),
  );
}

export async function createPresignedSttDownloadUrl(
  userId: string,
  uploadKey: string,
): Promise<string> {
  assertSttUploadOwnership(userId, uploadKey);
  const config = getObjectStoreConfig();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: uploadKey,
  });
  return getSignedUrl(getClient(), command, {
    expiresIn: DEFAULT_EXPIRY_SECONDS,
  });
}
