import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Env } from '../types'
export function getR2Client(env: Env) {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  })
}

export async function getSignedMediaUrl(
  env: Env,
  key: string,
  expiresInSeconds = 3600
): Promise<string> {
  const client = getR2Client(env)
  const command = new GetObjectCommand({
    Bucket: env.R2_BUCKET_NAME ?? 'pteprep-media',
    Key: key,
  })
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds })
}