import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import logger from './logger';

// AWS_ENDPOINT_URL lets this point at any S3-compatible store (e.g.
// Cloudflare R2) instead of real AWS. R2 needs path-style addressing and
// doesn't support SSE-KMS (it encrypts at rest by default anyway), so both
// are gated on whether a custom endpoint is configured.
const customEndpoint = process.env.AWS_ENDPOINT_URL;

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'af-south-1',
  ...(customEndpoint ? { endpoint: customEndpoint, forcePathStyle: true } : {}),
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!
  }
});

const BUCKET = process.env.S3_BUCKET_NAME!;

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ...(customEndpoint ? {} : { ServerSideEncryption: 'aws:kms' })
    })
  );
  logger.info('S3 upload complete', { key });
}

export async function downloadFromS3(key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}

export async function generatePresignedUrl(
  key: string,
  expiresIn = 300
): Promise<string> {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
