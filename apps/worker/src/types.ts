export interface Env {
  SUPABASE_URL:              string
  SUPABASE_SERVICE_ROLE_KEY: string
  R2_ACCOUNT_ID:             string
  R2_ACCESS_KEY_ID:          string
  R2_SECRET_ACCESS_KEY:      string
  R2_BUCKET_NAME:            string
  ADMIN_API_KEY:             string
  ENVIRONMENT:               string
  PTEPREP_MEDIA:             R2Bucket
  SCORING_QUEUE:             Queue
  RATE_LIMITER:              RateLimit
}
