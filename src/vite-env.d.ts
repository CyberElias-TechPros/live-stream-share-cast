/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the I'm Live Worker API. Empty = same-origin. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
