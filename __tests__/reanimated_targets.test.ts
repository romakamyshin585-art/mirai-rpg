/**
 * Reanimated target guard.
 *
 * Reanimated resolves a native host instance for every `animatedProps`
 * target. A react-native-svg gradient `<Stop>` is not a view - it is a
 * property of the gradient it belongs to and never gets a view tag - so
 * attaching `animatedProps` to one makes Reanimated throw
 *
 *   [Reanimated] Cannot find host instance for this component.
 *   Maybe it renders nothing?
 *
 * on mount. That is not a race and no amount of remounting avoids it: it
 * is thrown the first time the component renders, which is how the Home
 * tab ended up behind its error boundary on every cold start (the loading
 * state mounts the crystal mark).
 *
 * The same reasoning rules out sharing one `useAnimatedProps` result
 * between several elements - the updater is bound to one view - so both
 * are checked here. The rule is about which elements are *shapes with
 * views* (`Polygon`, `Path`, `Circle`, `Rect`, `Ellipse`, `Line`,
 * `Image`, `Text`), never about paint-server children inside `<Defs>`.
 *
 * This is a source check on purpose: the failure needs a real Reanimated
 * runtime and a real device, and nothing in CI has one. Reading the source
 * is the only place the rule can be enforced before a build ships.
 */

const SRC = require('path').join(__dirname, '..', 'src', 'ui') as string;

type AnimatedTarget = { file: string; line: number; element: string; source: string };

const VIEW_BACKED_SHAPES = new Set([
  'AnimatedPath', 'AnimatedPolygon', 'AnimatedCircle', 'AnimatedEllipse',
  'AnimatedRect', 'AnimatedLine', 'AnimatedImage', 'AnimatedText', 'AnimatedTSpan',
]);

function walk(dir: string, out: string[] = []): string[] {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const fs = require('fs') as typeof import('fs');
  // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
  const path = require('path') as typeof import('path');
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

describe('Reanimated animatedProps targets', () => {
  const files = walk(SRC);

  test('the guard actually inspects files', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  test('no animatedProps is attached to a node without a host view', () => {
    const offenders: AnimatedTarget[] = [];

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const fs = require('fs') as typeof import('fs');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      lines.forEach((line, index) => {
        if (!/animatedProps=/.test(line)) return;
        // The element name is often on an earlier line:
        //   <AnimatedPath
        //     animatedProps={outerStrokeProps}
        const name =
          line.match(/<([A-Za-z0-9_.]+)/)?.[1] ??
          lines
            .slice(Math.max(0, index - 4), index)
            .reverse()
            .map(candidate => candidate.match(/<([A-Za-z0-9_.]+)/)?.[1])
            .find(Boolean) ??
          '(unknown)';
        const bare = name.replace(/^Animated/, '');
        const isViewBacked =
          VIEW_BACKED_SHAPES.has(name) ||
          // <Animated.View style={...}> and friends never take animatedProps,
          // but if one ever did it is a real view, so allow the View family.
          /^Animated(View|Text|Image|ScrollView)$/.test(name) ||
          // A plain shape is a view too; only paint-server children are not.
          (['Path', 'Polygon', 'Circle', 'Ellipse', 'Rect', 'Line', 'Image', 'Text'].includes(bare) &&
            !name.startsWith('Animated'));

        if (!isViewBacked) {
          offenders.push({
            file: file.replace(/.*[\\/]/, ''),
            line: index + 1,
            element: name,
            source: line.trim().slice(0, 90),
          });
        }
      });
    }

    expect(offenders).toEqual([]);
  });

  test('no component shares one animatedProps result between two elements', () => {
    const shared: string[] = [];

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const fs = require('fs') as typeof import('fs');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
      const usedOn = new Map<string, number>();

      lines.forEach(line => {
        const match = line.match(/animatedProps=\{(\w+)\}/);
        if (!match) return;
        usedOn.set(match[1], (usedOn.get(match[1]) ?? 0) + 1);
      });

      for (const [name, count] of usedOn) {
        if (count > 1) {
          shared.push(`${file.replace(/.*[\\/]/, '')}: ${name} is used by ${count} elements`);
        }
      }
    }

    expect(shared).toEqual([]);
  });

  /**
   * A numeric SVG prop must be animated with a number.
   *
   * `toFixed()` returns a string, and animated props are applied on the UI
   * thread straight onto the native prop setter - a numeric prop handed a
   * string raises on the JSI side, where no React error boundary exists. The
   * app then shows its window and nothing else: a blank screen, restart does
   * not help, and nothing is ever logged. 0.4.3 shipped exactly that.
   *
   * `d` and `offset` are legitimately strings, which is why this is scoped to
   * `toFixed` rather than to the whole hook: a path is text, an opacity is
   * not.
   */
  test('no animated numeric prop is returned as a formatted string', () => {
    const offenders: string[] = [];

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const fs = require('fs') as typeof import('fs');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      for (let i = 0; i < lines.length; i += 1) {
        if (!/useAnimatedProps\s*\(/.test(lines[i])) continue;
        // The body is short and self-contained; read to the closing `});`.
        for (let j = i; j < Math.min(i + 14, lines.length); j += 1) {
          if (j > i && !/return\s*\{/.test(lines[j]) && !/['"]worklet['"]/.test(lines[j])) break;
          if (/toFixed\s*\(/.test(lines[j])) {
            offenders.push(`${file.replace(/.*[\\/]/, '')}:${j + 1}  ${lines[j].trim()}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  /**
   * An animated component must not be keyed by a value that changes.
   *
   * `key={`today-xp-${xp}`}` is the tempting way to replay an entrance when a
   * number changes, but a key change is an unmount plus a mount - so the
   * outgoing instance is destroyed while its animation is still running, and
   * its UI-thread mapper keeps writing to a view tag React has already
   * dropped. Reanimated reports that as "Cannot find host instance" from the
   * UI thread, where no error boundary exists: the app keeps its window and
   * goes blank, with nothing in logcat and no recovery short of reinstalling.
   *
   * Home carried three of these, and completing one quest moved all three at
   * once, which is why Home broke and no other tab did.
   *
   * The fix belongs in the component, not the call site: `MotionNumber` now
   * depends on `value` and resets its progress to 0, so the same instance
   * replays without a remount. This test keeps the call sites from
   * reintroducing the pattern.
   */
  test('no animated component is keyed by a changing value', () => {
    const offenders: string[] = [];
    const ANIMATED = /<\s*(Motion[A-Z]\w*|Animated\.\w+|CrystalMark|RadarChart|CompletionBurst|Toast)\b/;

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const fs = require('fs') as typeof import('fs');
      const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);

      lines.forEach((line, index) => {
        if (!ANIMATED.test(line) || !/key=\{/.test(line)) return;
        offenders.push(`${file.replace(/.*[\\/]/, '')}:${index + 1}  ${line.trim().slice(0, 100)}`);
      });
    }

    expect(offenders).toEqual([]);
  });

  /**
   * Every animation started in an effect has to be cancellable on unmount.
   *
   * `CompletionBurst` got this right from the start; `MotionNumber`,
   * `Toast`, `CelebrationOverlay`, `CrystalMark`, the radar pods, the
   * calendar's selection pill, the quest pill and the archived sheet did not,
   * and those are exactly the components that appear and disappear while
   * animating.
   *
   * The check is per shared value, not per effect: a component may cancel
   * from a dedicated unmount effect (`QuestSearchField` does) and that is
   * just as good, so requiring the cleanup inside the same `useEffect` would
   * report a false positive.
   */
  test('every shared value animated in an effect is cancelled somewhere', () => {
    const offenders: string[] = [];

    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const fs = require('fs') as typeof import('fs');
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split(/\r?\n/);
      const cancelled = new Set<string>();
      for (const match of text.matchAll(/cancelAnimation\(\s*(\w+)\s*\)/g)) {
        cancelled.add(match[1]);
      }

      for (let i = 0; i < lines.length; i += 1) {
        if (!/useEffect\s*\(/.test(lines[i])) continue;
        const indent = (lines[i].match(/^[ \t]*/) as RegExpMatchArray)[0].length;
        let body = '';
        let started = false;
        for (let j = i; j < Math.min(i + 60, lines.length); j += 1) {
          if (j > i && started && new RegExp(`^[ \\t]{0,${indent}}\\}`).test(lines[j])) break;
          body += `${lines[j]}\n`;
          if (lines[j].includes('=>')) started = true;
        }

        for (const match of body.matchAll(/(\w+)\.value\s*=\s*with/g)) {
          const name = match[1];
          if (cancelled.has(name)) continue;
          offenders.push(
            `${file.replace(/.*[\\/]/, '')}:${i + 1}  \`${name}\` is animated and never cancelled`,
          );
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
