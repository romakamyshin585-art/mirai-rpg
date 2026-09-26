/**
 * Local config plugin: Android build tuning.
 *
 * Two things the SDK 52 template cannot express through gradle.properties
 * and that therefore have to be patched into the generated
 * `android/app/build.gradle`:
 *
 *  1. **ABI split.** The Mi 10 is arm64-v8a, and a per-ABI APK is roughly
 *     half the size of a universal one, so install and cold start both get
 *     faster. Splitting is opt-out via the `mirai.arm64Only` property: set
 *     it to false when building for someone else's hardware.
 *  2. **`android:extractNativeLibs="false"`.** Stated explicitly rather than
 *     left to whatever AGP infers — uncompressed native libs in the APK,
 *     which is the documented way to get a faster install and start on
 *     modern Android.
 *
 * Everything else the device brief asks for is already satisfied by the
 * template and is asserted instead of patched:
 *   - `newArchEnabled=true` and `hermesEnabled=true` come from
 *     expo-build-properties;
 *   - R8 minification and resource shrinking are property-driven by the
 *     template and enabled through expo-build-properties;
 *   - `useLegacyPackaging` already defaults to false, which is what makes
 *     AGP emit extractNativeLibs=false; the manifest patch keeps it explicit.
 */

const { withAppBuildGradle, withAndroidManifest } = require('expo/config-plugins');

const ABI_SPLIT_MARKER = '// mirai:arm64-split';

function arm64Split() {
  return `
    // ${ABI_SPLIT_MARKER}
    // arm64-v8a covers the target device (Snapdragon 865). Disable with
    // -Pmirai.arm64Only=false when a universal APK is needed.
    splits {
        abi {
            enable (project.findProperty('mirai.arm64Only')?.toBoolean() ?: true)
            reset()
            include 'arm64-v8a'
            universal (project.findProperty('mirai.arm64Universal')?.toBoolean() ?: false)
        }
    }
`;
}

function withArm64Split(config) {
  return withAppBuildGradle(config, gradle => {
    if (gradle.modResults.language !== 'groovy') return gradle;
    if (gradle.modResults.contents.includes(ABI_SPLIT_MARKER)) return gradle;
    // `splits` is an android extension, so it has to go inside the
    // `android { }` block. Anchor on `packagingOptions {`, which the
    // template always emits and which is inside that block.
    const anchor = '    packagingOptions {';
    if (!gradle.modResults.contents.includes(anchor)) {
      throw new Error('withArm64Split: could not find `packagingOptions {` in app/build.gradle');
    }
    gradle.modResults.contents = gradle.modResults.contents.replace(anchor, `${arm64Split()}\n${anchor}`);
    return gradle;
  });
}

function withExtractNativeLibs(config) {
  return withAndroidManifest(config, manifest => {
    const application = manifest.modResults.manifest.application?.[0];
    if (!application) return manifest;
    if (application.$['android:extractNativeLibs'] === 'false') return manifest;
    application.$['android:extractNativeLibs'] = 'false';
    return manifest;
  });
}

module.exports = function withAndroidBuildTuning(config) {
  return withExtractNativeLibs(withArm64Split(config));
};
