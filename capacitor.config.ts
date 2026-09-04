import type { CapacitorConfig } from '@capacitor/cli'

/**
 * iOS wrapper for RIDE TOGETHER. The web app (Vite → `dist`) is bundled into a
 * thin WKWebView app so the Jam's music keeps playing in the background with
 * the screen locked. The native side (ios/App/App/AppDelegate.swift +
 * Info.plist) enables `audio` background mode and an AVAudioSession .playback
 * category — the only way to keep YouTube iframe audio alive on iPhone.
 *
 * The backend is baked in at build time via VITE_API_URL (see .env.ios) because
 * WKWebView runs from `capacitor://localhost`, not the deployed origin.
 */
const config: CapacitorConfig = {
  appId: 'com.ridetogether.ios',
  appName: 'RideTogether',
  webDir: 'dist',
  ios: {
    // Keep native scroll bounce so long drawers feel like a real app.
    scrollEnabled: true,
  },
}

export default config