export interface Env {
  DB: D1Database;
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  RECORDINGS?: R2Bucket;
  ALLOWED_ORIGINS: string;
  PUBLIC_URL: string;
  TURN_URL: string;
  TURN_USERNAME: string;
  TURN_CREDENTIAL: string;
}
