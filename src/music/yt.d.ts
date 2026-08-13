// Minimal typings for the official YouTube IFrame Player API.
// The API is loaded at runtime from https://www.youtube.com/iframe_api; it is
// never bundled or proxied. Only the surfaces used by this codebase are typed.

export {}

declare global {
  interface YTPlayerEvents {
    onReady?: (event: { target: YTPlayer }) => void
    onStateChange?: (event: { data: number }) => void
    onError?: (event: { data: number }) => void
    onPlaybackQualityChange?: (event: { data: string }) => void
  }

  interface YTPlayerOptions {
    videoId?: string
    width?: string | number
    height?: string | number
    playerVars?: {
      autoplay?: 0 | 1
      controls?: 0 | 1
      disablekb?: 0 | 1
      modestbranding?: 0 | 1
      origin?: string
      playsinline?: 0 | 1
      rel?: 0 | 1
    }
    events?: YTPlayerEvents
  }

  interface YTLoadOptions {
    videoId: string
    startSeconds?: number
    endSeconds?: number
    suggestedQuality?: string
  }

  interface YTPlayer {
    loadVideoById(
      options: YTLoadOptions | string,
      startSeconds?: number,
      suggestedQuality?: string,
    ): void | Promise<void>
    cueVideoById(
      options: YTLoadOptions | string,
      startSeconds?: number,
      suggestedQuality?: string,
    ): void | Promise<void>
    playVideo(): void | Promise<void>
    pauseVideo(): void | Promise<void>
    seekTo(seconds: number, allowSeekAhead: boolean): void
    getPlayerState(): number
    getCurrentTime(): number
    getDuration(): number
    setVolume(volume: number): void
    mute(): void
    unMute(): void
    isMuted(): boolean
    destroy(): void
  }

  interface YTNamespace {
    Player: new (elementOrId: string | HTMLElement, options: YTPlayerOptions) => YTPlayer
    PlayerState: {
      UNSTARTED: -1
      ENDED: 0
      PLAYING: 1
      PAUSED: 2
      BUFFERING: 3
      CUED: 5
    }
  }

  var YT: YTNamespace

  interface Window {
    YT?: YTNamespace
    onYouTubeIframeAPIReady?: () => void
  }
}