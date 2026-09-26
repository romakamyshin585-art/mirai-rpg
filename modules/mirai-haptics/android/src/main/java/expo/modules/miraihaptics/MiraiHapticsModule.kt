package expo.modules.miraihaptics

import android.content.Context
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android 10+ predefined haptics.
 *
 * Why this module exists: `expo-haptics` on Android builds every effect as
 * `VibrationEffect.createWaveform(timings, amplitudes, -1)` — a raw pattern
 * with amplitudes of 30/50/70 out of 255. The X-axis linear motor in the
 * Xiaomi Mi 10 is tuned through the `EFFECT_*` constants, which the vendor
 * HAL maps to per-device waveforms. Feeding it a raw pattern bypasses that
 * tuning, which is why "tap", "success" and "level up" all feel like the
 * same faint buzz.
 *
 * `VibrationEffect.createPredefined()` (API 29) sends the intent instead of
 * the waveform and lets the HAL decide. That is the whole module.
 *
 * Design rules:
 *  - Android only by construction (`"platforms": ["android"]`), so the JS
 *    side keeps using `expo-haptics` on iOS, where the Taptic Engine has its
 *    own semantics;
 *  - never throws: a device without a vibrator, an unknown effect name, or a
 *    permission problem degrades to silence, because haptics are never worth
 *    a crash;
 *  - pre-29 falls back to a one-shot with an amplitude chosen to match the
 *    intended intensity, so the *relative* feel survives even without the
 *    constants.
 */
class MiraiHapticsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val vibrator: Vibrator
    get() = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
      manager.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }

  override fun definition() = ModuleDefinition {
    Name("MiraiHaptics")

    /** True when the platform can actually play the predefined effects. */
    Function("isPredefinedSupported") {
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
    }

    AsyncFunction("play") { effect: String ->
      try {
        if (!vibrator.hasVibrator()) return@AsyncFunction
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          val predefined = when (effect) {
            "tick" -> VibrationEffect.EFFECT_TICK
            "click" -> VibrationEffect.EFFECT_CLICK
            "doubleClick" -> VibrationEffect.EFFECT_DOUBLE_CLICK
            "heavyClick" -> VibrationEffect.EFFECT_HEAVY_CLICK
            else -> return@AsyncFunction
          }
          vibrator.vibrate(VibrationEffect.createPredefined(predefined))
        } else {
          val duration: Long
          val amplitude: Int
          when (effect) {
            "tick" -> { duration = 12; amplitude = 40 }
            "click" -> { duration = 18; amplitude = 90 }
            "doubleClick" -> { duration = 40; amplitude = 110 }
            "heavyClick" -> { duration = 45; amplitude = 200 }
            else -> return@AsyncFunction
          }
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vibrator.vibrate(VibrationEffect.createOneShot(duration, amplitude))
          } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(duration)
          }
        }
      } catch (error: Throwable) {
        // Haptics are decorative. A vendor HAL that rejects an effect must
        // not be able to take the app down, and a rejected promise here
        // would surface as an unhandled rejection on the JS side.
        error.printStackTrace()
      }
    }
  }
}
