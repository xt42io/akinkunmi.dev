plugins {
    id("com.android.application")
}

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
        versionCode = 1
        versionName = "0.1.0"

        buildConfigField("String", "NOW_PLAYING_API_URL", "\"https://akinkunmi.dev/api/now-playing\"")
        buildConfigField("String", "NOW_PLAYING_TOKEN", "\"replace-with-NOW_PLAYING_TOKEN\"")
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
