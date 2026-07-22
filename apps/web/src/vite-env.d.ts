/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый адрес API. Пусто = тот же origin. Задаётся при сборке. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
