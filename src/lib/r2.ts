import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

function env(name: string) {
  return process.env[name]?.trim() ?? "";
}

function requiredEnv(name: string) {
  const value = env(name);

  if (!value) {
    throw new Error(`Missing required R2 configuration: ${name}`);
  }

  return value;
}

export function isR2Configured() {
  return Boolean(
    env("R2_ACCOUNT_ID") &&
      env("R2_ACCESS_KEY_ID") &&
      env("R2_SECRET_ACCESS_KEY") &&
      env("R2_BUCKET_NAME") &&
      env("R2_ENDPOINT")
  );
}

function createR2Client() {
  return new S3Client({
    region: env("R2_REGION") || "auto",
    endpoint: requiredEnv("R2_ENDPOINT"),
    credentials: {
      accessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

export function buildPrivateObjectUrl(storageKey: string) {
  return `/api/files/r2/${storageKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function sanitizeFileName(fileName: string) {
  const cleaned = fileName
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return cleaned || "file.bin";
}

export async function uploadToR2({
  body,
  contentType,
  fileName,
  prefix,
}: {
  prefix: string;
  fileName: string;
  contentType: string;
  body: Uint8Array | Buffer | string;
}) {
  if (!isR2Configured()) {
    return null;
  }

  const storageKey = `${prefix}/${randomUUID()}-${sanitizeFileName(fileName)}`;
  const client = createR2Client();

  await client.send(
    new PutObjectCommand({
      Bucket: requiredEnv("R2_BUCKET_NAME"),
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    })
  );

  return {
    storageKey,
    url: buildPrivateObjectUrl(storageKey),
  };
}

export async function getR2Object(storageKey: string) {
  if (!isR2Configured()) {
    return null;
  }

  const client = createR2Client();
  const result = await client.send(
    new GetObjectCommand({
      Bucket: requiredEnv("R2_BUCKET_NAME"),
      Key: storageKey,
    })
  );

  if (!result.Body) {
    return null;
  }

  const body = await result.Body.transformToByteArray();

  return {
    body,
    contentType: result.ContentType ?? "application/octet-stream",
    contentLength: result.ContentLength ?? body.byteLength,
    cacheControl: result.CacheControl ?? "private, max-age=60",
    fileName: fileNameFromKey(storageKey),
  };
}

export function fileNameFromKey(storageKey: string) {
  return storageKey.split("/").pop() ?? "file.bin";
}
