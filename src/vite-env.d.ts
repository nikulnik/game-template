/// <reference types="vite/client" />

/** Build-time constant injected by vite.config.ts. Use it to tree-shake platform-specific code paths. */
declare const __PLATFORM__: 'web' | 'crazygames' | 'yandex' | 'electron' | 'mobile';
