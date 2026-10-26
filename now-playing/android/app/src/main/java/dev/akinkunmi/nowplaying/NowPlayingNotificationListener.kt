package dev.akinkunmi.nowplaying

import android.content.ComponentName
import android.graphics.Bitmap
import android.media.MediaMetadata
import android.media.session.MediaController
import android.media.session.MediaSessionManager
import android.media.session.PlaybackState
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Base64
import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import java.util.concurrent.Executors

class NowPlayingNotificationListener : NotificationListenerService() {
    private val handler = Handler(Looper.getMainLooper())
    private val network = Executors.newSingleThreadExecutor()
    private var mediaSessionManager: MediaSessionManager? = null
    private var controller: MediaController? = null
    private var lastTrack: TrackPayload? = null
    private var lastSignature = ""
    private var lastPostedAt = 0L
    private var destroyed = false
    private var posting = false
    private var queuedTrack: TrackPayload? = null

    private val callback = object : MediaController.Callback() {
        override fun onMetadataChanged(metadata: MediaMetadata?) = reportController(refreshArtwork = true)
        override fun onPlaybackStateChanged(state: PlaybackState?) = reportController()
        override fun onSessionDestroyed() = bindController(null)
    }
    private val sessionsChanged = MediaSessionManager.OnActiveSessionsChangedListener { sessions ->
        selectController(sessions.orEmpty())
    }
    private val heartbeat = object : Runnable {
        override fun run() {
            readActiveSessions()
            lastTrack?.takeIf { it.isPlaying }?.let { postIfChanged(it, heartbeat = true) }
            handler.postDelayed(this, HEARTBEAT_MS)
        }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        mediaSessionManager = getSystemService(MediaSessionManager::class.java)
        val component = ComponentName(this, NowPlayingNotificationListener::class.java)
        mediaSessionManager?.removeOnActiveSessionsChangedListener(sessionsChanged)
        mediaSessionManager?.addOnActiveSessionsChangedListener(sessionsChanged, component, handler)
        handler.removeCallbacks(heartbeat)
        heartbeat.run()
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) = readActiveSessions()
    override fun onNotificationRemoved(sbn: StatusBarNotification?) = readActiveSessions()

    private fun readActiveSessions() {
        val manager = mediaSessionManager ?: return
        val component = ComponentName(this, NowPlayingNotificationListener::class.java)
        selectController(manager.getActiveSessions(component))
    }

    private fun selectController(sessions: List<MediaController>) {
        val music = sessions.filter { it.packageName == "com.google.android.apps.youtube.music" }
        bindController(music.firstOrNull { it.playbackState?.state == PlaybackState.STATE_PLAYING }
            ?: music.firstOrNull())
    }

    private fun bindController(next: MediaController?) {
        if (controller?.sessionToken == next?.sessionToken) {
            if (next != null) reportController() else reportStopped()
            return
        }
        controller?.unregisterCallback(callback)
        controller = next
        if (next == null) {
            reportStopped()
        } else {
            next.registerCallback(callback, handler)
            reportController(refreshArtwork = true)
        }
    }

    private fun reportController(refreshArtwork: Boolean = false) {
        val current = controller ?: return
        val playing = current.playbackState?.state == PlaybackState.STATE_PLAYING
        val metadata = current.metadata
        val title = metadata?.getString(MediaMetadata.METADATA_KEY_TITLE)?.trim().orEmpty()
        val artist = metadata?.getString(MediaMetadata.METADATA_KEY_ARTIST)?.trim().orEmpty()
        if (title.isBlank() || artist.isBlank()) {
            if (!playing) reportStopped()
            return
        }
        val sameSong = lastTrack?.title == title && lastTrack?.artist == artist
        val image = if (refreshArtwork || !sameSong) {
            (metadata?.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART)
                ?: metadata?.getBitmap(MediaMetadata.METADATA_KEY_ART))?.toDataUrl()
        } else lastTrack?.image
        val track = TrackPayload(
            title = title,
            artist = artist,
            album = metadata?.getString(MediaMetadata.METADATA_KEY_ALBUM)?.trim()?.ifBlank { null },
            image = image,
            isPlaying = playing,
            playedAt = Instant.now().toString()
        )
        lastTrack = track
        postIfChanged(track)
    }

    private fun reportStopped() {
        lastTrack?.copy(isPlaying = false)?.let {
            lastTrack = it
            postIfChanged(it)
        }
    }

    private fun postIfChanged(track: TrackPayload, heartbeat: Boolean = false) {
        if (posting) {
            queuedTrack = track
            return
        }
        val signature = track.signature()
        if (signature == lastSignature && (!track.isPlaying ||
                (!heartbeat && SystemClock.elapsedRealtime() - lastPostedAt < HEARTBEAT_MS))) return
        posting = true
        network.execute {
            var connection: HttpURLConnection? = null
            var succeeded = false
            try {
                connection = URL(BuildConfig.NOW_PLAYING_API_URL).openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.connectTimeout = 10_000
                connection.readTimeout = 10_000
                connection.setRequestProperty("Content-Type", "application/json")
                connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.NOW_PLAYING_TOKEN}")
                connection.doOutput = true
                connection.outputStream.use { it.write(track.toJson().toByteArray(Charsets.UTF_8)) }
                check(connection.responseCode in 200..299) { "Now Playing API returned HTTP ${connection.responseCode}" }
                connection.inputStream.use { it.readBytes() }
                succeeded = true
            } catch (error: Exception) {
                Log.w("NowPlaying", "Failed to post playback state", error)
            } finally {
                connection?.disconnect()
                handler.post {
                    if (succeeded) {
                        lastSignature = signature
                        lastPostedAt = SystemClock.elapsedRealtime()
                        Log.i("NowPlaying", "Playback state synced: ${if (track.isPlaying) "playing" else "stopped"}")
                    }
                    posting = false
                    val next = queuedTrack
                    queuedTrack = null
                    if (next != null) postIfChanged(next)
                    if (destroyed && !posting) network.shutdown()
                }
            }
        }
    }

    private fun disconnect() {
        handler.removeCallbacks(heartbeat)
        mediaSessionManager?.removeOnActiveSessionsChangedListener(sessionsChanged)
        mediaSessionManager = null
        controller?.unregisterCallback(callback)
        controller = null
        reportStopped()
    }

    override fun onListenerDisconnected() {
        disconnect()
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        destroyed = true
        disconnect()
        // Leave the executor available for the final queued pause, then shut down.
        if (!posting) network.shutdown()
        super.onDestroy()
    }

    companion object {
        private const val HEARTBEAT_MS = 30_000L
    }
}

private data class TrackPayload(
    val title: String,
    val artist: String,
    val album: String? = null,
    val image: String? = null,
    val isPlaying: Boolean,
    val playedAt: String
) {
    fun signature(): String = JSONObject().put("title", title).put("artist", artist)
        .put("album", album).put("isPlaying", isPlaying).toString()

    fun toJson(): String = JSONObject().put("title", title).put("artist", artist)
        .put("source", "android").put("playedAt", playedAt).put("isPlaying", isPlaying)
        .apply { album?.let { put("album", it) }; image?.let { put("image", it) } }.toString()
}

private fun Bitmap.toDataUrl(): String {
    val scale = minOf(1.0, 512.0 / maxOf(width, height))
    val thumbnail = if (scale < 1.0) Bitmap.createScaledBitmap(this,
        (width * scale).toInt().coerceAtLeast(1), (height * scale).toInt().coerceAtLeast(1), true) else this
    val output = ByteArrayOutputStream()
    thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, output)
    if (thumbnail !== this) thumbnail.recycle()
    return "data:image/jpeg;base64,${Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)}"
}
