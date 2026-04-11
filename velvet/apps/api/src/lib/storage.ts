import { S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'

const REGION = process.env.S3_REGION || 'auto'
const ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'
const ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin'
const SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin'
const BUCKET = process.env.S3_BUCKET || 'velvet-media'

export const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
  forcePathStyle: true, // Required for MinIO
})

export async function getUploadUrl(fileName: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: fileName,
    ContentType: contentType,
  })

  return getSignedUrl(s3, command, { expiresIn: 3600 })
}

export function getPublicUrl(fileName: string) {
  // For local development with MinIO
  if (ENDPOINT.includes('localhost')) {
    return `${ENDPOINT}/${BUCKET}/${fileName}`
  }
  
  // For R2 or other S3 with custom domain
  const publicDomain = process.env.S3_PUBLIC_DOMAIN || ENDPOINT
  return `${publicDomain}/${BUCKET}/${fileName}`
}
