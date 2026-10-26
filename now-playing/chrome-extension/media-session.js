(function () {
  const EVENT_NAME = "now-playing:media-session";

  function emit(metadata) {
    if (!metadata) return;

    window.postMessage(
      {
        type: EVENT_NAME,
        isPlaying: (() => {
          const media = document.querySelector("video, audio");
          return media ? !media.paused && !media.ended : navigator.mediaSession?.playbackState === "playing";
        })(),
        title: metadata.title || "",
        artist: metadata.artist || "",
        album: metadata.album || "",
        artwork: Array.isArray(metadata.artwork) ? metadata.artwork : []
      },
      window.location.origin
    );
  }

  function readCurrent() {
    try {
      emit(navigator.mediaSession?.metadata);
    } catch {
      // Ignore browsers/pages that do not expose readable metadata.
    }
  }

  function patchMediaMetadata() {
    if (!("MediaMetadata" in window)) return;

    const NativeMediaMetadata = window.MediaMetadata;

    window.MediaMetadata = function MediaMetadata(init) {
      const metadata = new NativeMediaMetadata(init);
      queueMicrotask(() => emit(metadata));
      return metadata;
    };

    window.MediaMetadata.prototype = NativeMediaMetadata.prototype;
  }

  function patchMediaSessionSetter() {
    const mediaSession = navigator.mediaSession;
    if (!mediaSession) return;

    let prototype = Object.getPrototypeOf(mediaSession);
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "metadata");

      if (descriptor?.set && descriptor?.get) {
        Object.defineProperty(mediaSession, "metadata", {
          configurable: true,
          enumerable: true,
          get() {
            return descriptor.get.call(mediaSession);
          },
          set(value) {
            descriptor.set.call(mediaSession, value);
            emit(value);
          }
        });
        return;
      }

      prototype = Object.getPrototypeOf(prototype);
    }
  }

  patchMediaMetadata();
  patchMediaSessionSetter();
  readCurrent();
  window.setInterval(readCurrent, 3000);
  for (const event of ["play", "pause", "ended", "emptied"]) {
    document.addEventListener(event, readCurrent, true);
  }
})();
