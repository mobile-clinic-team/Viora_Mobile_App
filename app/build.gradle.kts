import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.viora.mobile"
    compileSdk = 36
    defaultConfig {
        val backendOrigin = providers.gradleProperty("vioraBackendBaseUrl").orElse(providers.environmentVariable("VIORA_BACKEND_BASE_URL")).orElse("").get()
        require(backendOrigin.isEmpty() || (backendOrigin.startsWith("https://") && backendOrigin.none { it == '"' || it == '\\' || it.isWhitespace() }))
        buildConfigField("String", "BACKEND_BASE_URL", "\"$backendOrigin\"")
        applicationId = "com.viora.mobile"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    flavorDimensions += "environment"
    productFlavors {
        create("dev") { dimension = "environment"; applicationIdSuffix = ".dev" }
        create("staging") { dimension = "environment"; applicationIdSuffix = ".staging" }
        create("prod") { dimension = "environment" }
    }
    buildTypes {
        debug { isDebuggable = true }
        release { isDebuggable = false; isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    testOptions { animationsDisabled = true }
    lint { abortOnError = true; warningsAsErrors = false }
    packaging { resources.excludes += "/META-INF/{AL2.0,LGPL2.1}" }
}
kotlin { compilerOptions { jvmTarget.set(JvmTarget.JVM_17) } }
androidComponents {
    beforeVariants { variant ->
        val flavor = variant.productFlavors.single().second
        variant.enable = (flavor == "dev" || flavor == "staging") && variant.buildType == "debug" || flavor == "prod" && variant.buildType == "release"
    }
}
dependencyLocking { lockAllConfigurations() }
dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.preview)
    implementation(libs.activity.compose)
    implementation(libs.lifecycle.compose)
    implementation(libs.lifecycle.viewmodel)
    implementation(libs.lifecycle.process)
    implementation(libs.navigation.compose)
    implementation(libs.okhttp)
    implementation(libs.serialization.json)
    implementation(libs.coroutines.android)
    implementation(libs.browser)
    debugImplementation(libs.compose.tooling)
    debugImplementation(libs.compose.test.manifest)
    testImplementation(libs.junit)
    testImplementation(libs.coroutines.test)
    testImplementation(libs.mockwebserver)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.test)
    androidTestImplementation(libs.navigation.testing)
    androidTestImplementation(libs.android.runner)
    androidTestImplementation(libs.android.junit)
}
