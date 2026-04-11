import { S3Client, CreateBucketCommand, HeadBucketCommand } from '@aws-sdk/client-s3'

const REGION = process.env.S3_REGION || 'auto'
const ENDPOINT = process.env.S3_ENDPOINT || 'http://localhost:9000'
const ACCESS_KEY = process.env.S3_ACCESS_KEY || 'minioadmin'
const SECRET_KEY = process.env.S3_SECRET_KEY || 'minioadmin'
const BUCKET = process.env.S3_BUCKET || 'velvet-media'

const s3 = new S3Client({
  region: REGION,
  endpoint: ENDPOINT,
  credentials: {
    accessKeyId: ACCESS_KEY,
    secretAccessKey: SECRET_KEY,
  },
  forcePathStyle: true,
})

async function init() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BUCKET }))
    console.log(`Bucket ${BUCKET} already exists.`)
  } catch (err: any) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`Creating bucket ${BUCKET}...`)
      await s3.send(new CreateBucketCommand({ Bucket: BUCKET }))
      console.log(`Bucket ${BUCKET} created.`)
    } else {
      throw err
    }
  }
}

init().catch(console.error)
