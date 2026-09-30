/**
 * The single place the app's own version string lives.
 *
 * It used to be a local constant in the achievements screen, which meant the
 * number was only visible in one place - and the error screen, the one screen
 * whose contents get screenshotted and sent back, could not say which build
 * produced it. A stale APK and a fixed APK look identical in a bug report.
 *
 * Keep this in step with `version` in app.json and `version` in package.json.
 */
export const APP_VERSION = '0.4.12';

export default APP_VERSION;
