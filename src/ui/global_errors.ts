/**
 * Last-resort error capture.
 *
 * An error boundary only sees errors thrown while React renders. Three
 * things in this app sit outside that: a worklet failing on the UI thread, a
 * native module call rejecting, and anything thrown from a timer or a
 * promise. In a release build those have no red screen - the window stays up
 * and the interface simply stops, which is reported as "the app is just the
 * background now, restart does not help".
 *
 * This does not fix anything. It makes those failures *legible*: the previous
 * handler is always called (so the platform still does its own reporting), and
 * the message is echoed with a prefix the CI log scan greps for. A blank
 * screen with no searchable line in logcat is the worst kind of bug report to
 * receive; this is what turns it into a line.
 */

const PREFIX = '[MiraiRPG] UNCAUGHT';

type ErrorUtilsShape = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/** The most recent uncaught error, for the error screen to show if it can. */
export let lastUncaught: string | null = null;

export function installGlobalErrorHandler(): void {
  const utils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (!utils?.setGlobalHandler) return;

  const previous = utils.getGlobalHandler?.();

  utils.setGlobalHandler((error: unknown, isFatal?: boolean) => {
    lastUncaught = describe(error);
    console.error(`${PREFIX} ${isFatal ? 'fatal: ' : ''}${lastUncaught}`);
    if (error instanceof Error && error.stack) console.error(`${PREFIX} ${error.stack}`);

    // Never swallow: React Native's own handler is what turns this into a
    // crash report and, in dev, a red box.
    previous?.(error, isFatal);
  });
}

export { PREFIX as UNCAUGHT_PREFIX };
