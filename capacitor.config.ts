import type { CapacitorConfig } from '@capacitor/cli';

// TEMPLATE: appId and appName are what the stores identify the game by. Change both before the
// first `cap add`, since renaming an app id afterwards means regenerating the native projects.
const config: CapacitorConfig = {
  appId: 'com.example.game',
  appName: 'Game',
  webDir: 'dist/mobile',
};

export default config;
