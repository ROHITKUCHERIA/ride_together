/**
 * Thin, DOM-only bootstrap for the official YouTube IFrame Player API.
 * The script is loaded from https://www.youtube.com/iframe_api — the same
 * player a viewer would see embedded on youtube.com. No media is downloaded,
 * proxied or scraped; we simply drive the official iframe player.
 */

const IFRAME_API_URL = 'https://www.youtube.com/iframe_api'
const LOAD_TIMEOUT_MS = 15_000

let apiLoadPromise: Promise<YTNamespace> | null = null

/** Loads the YouTube iframe API exactly once and resolves with the global YT. */
export function loadYouTubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('YouTube player is only available in the browser.'))
  }
  if (window.YT?.Player) return Promise.resolve(window.YT)
  if (apiLoadPromise) return apiLoadPromise

  apiLoadPromise = new Promise<YTNamespace>((resolve, reject) => {
    const previousReady = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      window.onYouTubeIframeAPIReady = previousReady
      if (window.YT) resolve(window.YT)
      else reject(new Error('The YouTube player failed to initialise.'))
    }

    const script = document.createElement('script')
    script.src = IFRAME_API_URL
    script.async = true
    script.referrerPolicy = 'origin'
    script.onerror = () => {
      window.onYouTubeIframeAPIReady = previousReady
      reject(new Error('Could not load the YouTube player script.'))
    }
    document.head.appendChild(script)

    window.setTimeout(() => {
      if (!window.YT) {
        window.onYouTubeIframeAPIReady = previousReady
        reject(new Error('The YouTube player took too long to load.'))
      }
    }, LOAD_TIMEOUT_MS)
  }).catch((err: unknown) => {
    apiLoadPromise = null
    throw err
  })

  return apiLoadPromise
}

export const YT_ERROR_CODES = {
  invalidParameter: 2,
  html5Error: 5,
  notFound: 100,
  embeddingNotAllowed: 101,
  embeddingNotAllowedAlt: 150,
} as const

/** Friendly, user-facing copy for each YouTube player onError code. */
export function ytErrorToMessage(code: number): string {
  switch (code) {
    case YT_ERROR_CODES.invalidParameter:
      return 'The video link is invalid. Try a different song.'
    case YT_ERROR_CODES.html5Error:
      return 'This video could not play in the browser. Try again.'
    case YT_ERROR_CODES.notFound:
      return 'This video is unavailable or has been removed from YouTube.'
    case YT_ERROR_CODES.embeddingNotAllowed:
    case YT_ERROR_CODES.embeddingNotAllowedAlt:
      return 'The owner of this video has disabled embedding, so it cannot play here.'
    default:
      return 'This video could not be played.'
  }
}

type AutoplayResolution = 'playing' | 'buffering' | 'blocked'

/**
 * Maps a raw YouTube player state back to what we should do next. If the
 * player is stuck (cued/ended/paused after a play request) it is blocked.
 * Plain numeric codes are used so this stays testable outside the browser.
 */
export function resolveAutoplayState(ytState: number): AutoplayResolution {
  if (ytState === 1) return 'playing'
  if (ytState === 3) return 'buffering'
  return 'blocked'
}