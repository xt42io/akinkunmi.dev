import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";

type Track = {
  title: string;
  artist: string;
  album?: string;
  image?: string;
  source: "desktop" | "android";
  url?: string;
  playedAt: string;
};

type ApiResponse = {
  track: Track | null;
};

type NowPlayingProps = {
  apiUrl?: string;
};

type PostHogWindow = Window &
  typeof globalThis & {
    posthog?: {
      capture?: (event: string, properties?: Record<string, unknown>) => void;
    };
  };

const defaultApiUrl =
  import.meta.env.PUBLIC_NOW_PLAYING_API_URL ?? "/api/now-playing";

function captureNowPlayingEvent(
  event: string,
  track: Track,
  properties: Record<string, unknown> = {}
) {
  if (typeof window === "undefined") return;

  (window as PostHogWindow).posthog?.capture?.(event, {
    title: track.title,
    artist: track.artist,
    album: track.album,
    source: track.source,
    has_image: Boolean(track.image),
    played_at: track.playedAt,
    ...properties
  });
}

export default function NowPlaying({ apiUrl = defaultApiUrl }: NowPlayingProps) {
  const [track, setTrack] = useState<Track | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchTrack() {
      try {
        const response = await fetch(apiUrl);
        const data = (await response.json()) as ApiResponse;

        if (!cancelled) {
          setTrack(data.track ?? null);
          setLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setTrack(null);
          setLoaded(true);
        }
      }
    }

    fetchTrack();
    const interval = window.setInterval(fetchTrack, 10_000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [apiUrl]);

  useEffect(() => {
    if (!isOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (track) {
          captureNowPlayingEvent("now_playing_modal_closed", track, {
            close_method: "escape"
          });
        }
        setIsOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, track]);

  if (!loaded) {
    return null;
  }

  if (!track) {
    return (
      <section className="flex items-center gap-3 rounded-md border border-hairline bg-white/5 p-4 text-sm text-muted">
        <span>Not listening to anything right now.</span>
      </section>
    );
  }

  return (
    <>
      <div className="group flex w-full items-center gap-3 rounded-md border border-hairline bg-white/5 p-4 transition-colors hover:bg-white/[0.07]">
        <button
          type="button"
          onClick={() => {
            captureNowPlayingEvent("now_playing_modal_opened", track);
            setIsOpen(true);
          }}
          className="flex min-w-0 flex-1 items-center gap-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          <AlbumCover image={track.image} size="small" />

          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm text-muted">
                I&apos;m currently listening to
              </p>
              <p className="truncate text-base font-medium text-off-white">
                {track.title} <span className="text-muted">-</span> {track.artist}
              </p>
              <p className="mt-1 text-xs capitalize text-muted-faint">
                {track.source}
              </p>
            </div>
            <AudioWave className="hidden sm:flex" />
          </div>
        </button>

        <MusicLinks track={track} compact />
      </div>

      <AnimatePresence>
        {isOpen ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-5 py-8"
          >
            <motion.button
              type="button"
              aria-label="Close now playing"
              className="absolute inset-0 bg-black-001/85"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
              onClick={() => {
                captureNowPlayingEvent("now_playing_modal_closed", track, {
                  close_method: "backdrop"
                });
                setIsOpen(false);
              }}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={`Now playing: ${track.title} by ${track.artist}`}
              className="relative w-full max-w-sm overflow-hidden rounded-md border border-hairline bg-black-001 p-5 shadow-[0_28px_90px_rgba(0,0,0,0.55)] will-change-transform [transform:translateZ(0)]"
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              {track.image ? (
                <div
                  className="absolute inset-[-24px] bg-cover bg-center opacity-[0.08] blur-2xl saturate-125"
                  style={{ backgroundImage: `url(${track.image})` }}
                  aria-hidden="true"
                />
              ) : null}

              <button
                type="button"
                onClick={() => {
                  captureNowPlayingEvent("now_playing_modal_closed", track, {
                    close_method: "button"
                  });
                  setIsOpen(false);
                }}
                className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-black/35 text-lg leading-none text-muted transition-colors hover:text-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
                aria-label="Close"
              >
                x
              </button>

              <div className="relative">
                <AlbumCover image={track.image} size="large" />

                <div className="mt-5 min-w-0">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-muted">
                      I&apos;m currently listening to
                    </p>
                    <AudioWave />
                  </div>
                  <h2 className="mt-2 text-2xl font-medium leading-tight text-off-white">
                    {track.title}
                  </h2>
                  <p className="mt-1 text-base text-muted">{track.artist}</p>
                  {track.album ? (
                    <p className="mt-3 text-sm text-muted-faint">{track.album}</p>
                  ) : null}
                  <p className="mt-5 inline-flex rounded-full border border-white/10 px-3 py-1 text-xs capitalize text-muted">
                    {track.source}
                  </p>
                  <MusicLinks track={track} />
                </div>
              </div>
            </motion.div>
          </div>
        ) : null}
      </AnimatePresence>
    </>
  );
}

function MusicLinks({
  track,
  compact = false
}: {
  track: Track;
  compact?: boolean;
}) {
  const query = encodeURIComponent(`${track.title} ${track.artist}`);
  const links = [
    {
      label: "YouTube Music",
      platform: "youtube_music",
      href: track.url?.includes("music.youtube.com")
        ? track.url
        : `https://music.youtube.com/search?q=${query}`,
      icon: <YouTubeMusicIcon />
    },
    {
      label: "Spotify",
      platform: "spotify",
      href: `https://open.spotify.com/search/${query}`,
      icon: <SpotifyIcon />
    },
    {
      label: "Apple Music",
      platform: "apple_music",
      href: `https://music.apple.com/search?term=${query}`,
      icon: <AppleMusicIcon />
    }
  ];

  return (
    <div
      className={
        compact
          ? "flex shrink-0 items-center gap-1"
          : "mt-6 grid grid-cols-3 gap-2"
      }
    >
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          title={`Play on ${link.label}`}
          aria-label={`Play ${track.title} on ${link.label}`}
          onClick={() => {
            captureNowPlayingEvent("now_playing_platform_clicked", track, {
              platform: link.platform,
              placement: compact ? "card" : "modal",
              destination_url: link.href
            });
          }}
          className={
            compact
              ? "grid h-8 w-8 place-items-center rounded-full border border-white/10 bg-white/[0.04] text-muted transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              : "flex h-10 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 text-xs text-muted transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-off-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          }
        >
          <span className="h-4 w-4 shrink-0">{link.icon}</span>
          {compact ? null : <span className="truncate">{link.label}</span>}
        </a>
      ))}
    </div>
  );
}

function AudioWave({ className = "" }: { className?: string }) {
  const bars = [
    "h-2 animate-[now-playing-wave_900ms_ease-in-out_infinite]",
    "h-4 animate-[now-playing-wave_760ms_ease-in-out_120ms_infinite]",
    "h-3 animate-[now-playing-wave_980ms_ease-in-out_80ms_infinite]",
    "h-5 animate-[now-playing-wave_820ms_ease-in-out_200ms_infinite]",
    "h-2 animate-[now-playing-wave_880ms_ease-in-out_160ms_infinite]"
  ];

  return (
    <div
      className={`items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-2 ${className}`}
      aria-hidden="true"
    >
      {bars.map((bar, index) => (
        <span
          key={index}
          className={`block w-1 rounded-full bg-accent/80 ${bar}`}
        />
      ))}
    </div>
  );
}

function AlbumCover({
  image,
  size
}: {
  image?: string;
  size: "small" | "large";
}) {
  if (!image) return null;

  const dimensions = size === "large" ? "h-72 w-full" : "h-14 w-14";

  return (
    <div className={`relative shrink-0 ${dimensions}`}>
      <div
        className="absolute inset-0 rounded-md bg-cover bg-center opacity-45 blur-xl saturate-150 transition-opacity duration-500 group-hover:opacity-75"
        style={{ backgroundImage: `url(${image})` }}
        aria-hidden="true"
      />
      <div className="absolute inset-[-1px] rounded-md bg-gradient-to-br from-white/25 via-white/5 to-black/30 opacity-80" />
      <img
        src={image}
        alt=""
        className="relative h-full w-full rounded-md border border-white/10 object-cover shadow-[0_12px_30px_rgba(0,0,0,0.32)] transition-transform duration-500 group-hover:-rotate-1 group-hover:scale-[1.03]"
        loading="lazy"
      />
    </div>
  );
}

function YouTubeMusicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <circle cx="12" cy="12" r="10" fill="#FF0000" />
      <circle cx="12" cy="12" r="5.8" fill="none" stroke="white" strokeWidth="1.4" />
      <path d="M10.3 8.9v6.2l5.3-3.1-5.3-3.1Z" fill="white" />
    </svg>
  );
}

function SpotifyIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <circle cx="12" cy="12" r="10" fill="#1ED760" />
      <path
        d="M7.2 9.3c3.3-1 6.9-.7 9.7 1 .4.2.9.1 1.1-.3.2-.4.1-.9-.3-1.1-3.2-1.9-7.2-2.3-11-1.1-.4.1-.7.6-.5 1 .1.4.6.7 1 .5Zm.4 3.2c2.8-.8 5.4-.5 7.7.9.4.2.8.1 1-.2.2-.4.1-.8-.2-1-2.7-1.6-5.7-2-8.9-1-.4.1-.6.5-.5.9.1.3.5.6.9.4Zm.5 2.9c2-.6 4-.4 5.7.6.3.2.7.1.9-.2.2-.3.1-.7-.2-.9-2-1.2-4.4-1.5-6.8-.8-.3.1-.5.5-.4.8.1.4.4.6.8.5Z"
        fill="#111"
      />
    </svg>
  );
}

function AppleMusicIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-full w-full">
      <defs>
        <linearGradient id="apple-music-gradient" x1="5" x2="19" y1="3" y2="21">
          <stop stopColor="#FB5C74" />
          <stop offset="1" stopColor="#FA243C" />
        </linearGradient>
      </defs>
      <rect width="20" height="20" x="2" y="2" rx="5" fill="url(#apple-music-gradient)" />
      <path
        d="M16.8 6.1v8.7c0 1.3-1 2.2-2.4 2.2-1.1 0-2-.6-2-1.5 0-1 1-1.7 2.2-1.7.3 0 .6 0 .8.1V8.6l-5.9 1.2v6.3c0 1.3-1 2.2-2.4 2.2-1.1 0-2-.6-2-1.5 0-1 1-1.7 2.2-1.7.3 0 .6 0 .8.1V8.7l8.7-1.8Z"
        fill="white"
      />
    </svg>
  );
}
