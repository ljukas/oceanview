import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import type { StorageEffects } from '../storage'

// Same upload-window TTL the vercelBlob adapter uses for `clientToken`.
// Browser has this long after mint to start the PUT before the URL expires.
const PUT_TTL_SECONDS = 5 * 60

function envOrThrow(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is not set; cannot use the s3 adapter.`)
  return v
}

const ENDPOINT = envOrThrow('S3_ENDPOINT')
const REGION = process.env.S3_REGION ?? 'eu-north-1'
const PUBLIC_BUCKET = envOrThrow('S3_BUCKET_PUBLIC')
const PRIVATE_BUCKET = envOrThrow('S3_BUCKET_PRIVATE')

const client = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  // Path-style addressing — required for self-hosted S3-compatible servers
  // (MinIO/RustFS/Garage/etc.) where there's no DNS for `bucket.localhost`.
  forcePathStyle: true,
  credentials: {
    accessKeyId: envOrThrow('S3_ACCESS_KEY_ID'),
    secretAccessKey: envOrThrow('S3_SECRET_ACCESS_KEY'),
  },
})

function bucketFor(access: 'public' | 'private'): string {
  return access === 'public' ? PUBLIC_BUCKET : PRIVATE_BUCKET
}

function publicReadUrl(bucket: string, pathname: string): string {
  return `${ENDPOINT.replace(/\/$/, '')}/${bucket}/${pathname}`
}

function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number } }
  if (e.name === 'NotFound' || e.name === 'NoSuchKey') return true
  return e.$metadata?.httpStatusCode === 404
}

/**
 * S3-compatible adapter for local dev (RustFS in `compose.yaml`). Two
 * buckets, one client. Public bucket is configured for anonymous read at
 * compose-init time (`mc anonymous set download`) so avatar URLs stored on
 * `user.image` stay fetchable without re-signing. Private bucket is signed
 * on every read.
 */
export const s3: StorageEffects = {
  async mintUploadToken({ access, pathname, contentType }) {
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucketFor(access),
        Key: pathname,
        ContentType: contentType,
      }),
      { expiresIn: PUT_TTL_SECONDS },
    )
    return {
      pathname,
      upload: {
        kind: 'presigned-put',
        url,
        headers: { 'Content-Type': contentType },
      },
    }
  },

  async head(access, pathname) {
    try {
      const result = await client.send(
        new HeadObjectCommand({ Bucket: bucketFor(access), Key: pathname }),
      )
      const url =
        access === 'public'
          ? publicReadUrl(bucketFor(access), pathname)
          : await getSignedUrl(
              client,
              new GetObjectCommand({ Bucket: bucketFor(access), Key: pathname }),
              { expiresIn: 60 },
            )
      return {
        url,
        contentType: result.ContentType ?? 'application/octet-stream',
        size: result.ContentLength ?? 0,
      }
    } catch (err) {
      if (isNotFound(err)) return null
      throw err
    }
  },

  async delete(access, pathname) {
    await client.send(new DeleteObjectCommand({ Bucket: bucketFor(access), Key: pathname }))
  },

  async put(access, pathname, bytes, contentType) {
    await client.send(
      new PutObjectCommand({
        Bucket: bucketFor(access),
        Key: pathname,
        Body: bytes,
        ContentType: contentType,
      }),
    )
  },

  async getReadUrl(access, pathname, ttlSeconds) {
    if (access === 'public') {
      return publicReadUrl(bucketFor(access), pathname)
    }
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: bucketFor(access), Key: pathname }),
      { expiresIn: ttlSeconds },
    )
  },
}
