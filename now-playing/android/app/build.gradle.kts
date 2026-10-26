import java.util.Properties

plugins {
    id("com.android.application")
}

val localClientConfig = Properties().apply {
    rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use { load(it) }
}
val nowPlayingApiUrl = providers.environmentVariable("NOW_PLAYING_API_URL")
    .orElse(localClientConfig.getProperty("nowPlaying.apiUrl", "https://akinkunmi.dev/api/now-playing"))
    .get()
val nowPlayingToken = providers.environmentVariable("NOW_PLAYING_TOKEN")
    .orElse(localClientConfig.getProperty("nowPlaying.token", ""))
    .get()
require(nowPlayingToken.isNotBlank() && nowPlayingToken != "replace-with-NOW_PLAYING_TOKEN") {
    "Now Playing token is missing. Run npm run now-playing:build from the repository root."
}
fun configString(value: String) = "\"" + value.replace("\\", "\\\\")
    .replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r") + "\""

android {
    namespace = "dev.akinkunmi.nowplaying"
    compileSdk = 35

    buildFeatures {
        buildConfig = true
    }

    defaultConfig {
        applicationId = "dev.akinkunmi.nowplaying"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "0.1.2"

        buildConfigField("String", "NOW_PLAYING_API_URL", configString(nowPlayingApiUrl))
        buildConfigField("String", "NOW_PLAYING_TOKEN", configString(nowPlayingToken))
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
