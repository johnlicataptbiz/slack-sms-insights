/// <reference types="vite/client" />

declare module '*.css';

interface ImportMetaEnv {
  readonly VITE_UI_VERSION?: 'legacy' | 'v2';
  readonly VITE_ENABLE_REALTIME?: '0' | '1';
}
