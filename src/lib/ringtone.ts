import { Platform, Vibration } from "react-native";

let activePlayer: any = null;
let webAudioInterval: any = null;
let isRinging = false;

// Public royalty-free telephone ringtone MP3
const RINGTONE_URL = "https://assets.mixkit.co/active_storage/sfx/2874/2874-preview.mp3";

/**
 * Starts continuous ringtone audio & vibration pattern for incoming VoIP calls.
 */
export async function startRingtone(): Promise<void> {
  if (isRinging) return;
  isRinging = true;

  // 1. Start continuous vibration pattern [wait 0ms, vibrate 1000ms, pause 1000ms, ...]
  try {
    Vibration.vibrate([0, 1000, 1000, 1000], true);
  } catch {
    // Non-blocking on unsupported devices
  }

  // 2. Play audible ringtone via expo-audio (native) or Web Audio API (web)
  if (Platform.OS === "web") {
    try {
      if (typeof window !== "undefined" && (window.AudioContext || (window as any).webkitAudioContext)) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioCtx();

        const playTone = () => {
          if (!isRinging || ctx.state === "closed") return;
          try {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.frequency.value = 440;
            osc2.frequency.value = 480;
            gain.gain.setValueAtTime(0.15, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start();
            osc2.start();
            osc1.stop(ctx.currentTime + 1.8);
            osc2.stop(ctx.currentTime + 1.8);
          } catch {
            // Web Audio error guard
          }
        };

        playTone();
        webAudioInterval = setInterval(playTone, 3000);
      }
    } catch {
      // Non-blocking
    }
    return;
  }

  // Native (Android / iOS) using expo-audio
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createAudioPlayer, setAudioModeAsync } = require("expo-audio");
    if (setAudioModeAsync) {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
      });
    }

    if (createAudioPlayer) {
      const player = createAudioPlayer(RINGTONE_URL, {
        updateInterval: 1000,
      });
      player.loop = true;
      player.volume = 1.0;
      player.play();
      activePlayer = player;
    }
  } catch (err) {
    console.warn("Ringtone playback initialization:", err);
  }
}

/**
 * Stops ringtone audio playback and cancels vibration immediately.
 */
export function stopRingtone(): void {
  isRinging = false;

  // 1. Cancel vibration
  try {
    Vibration.cancel();
  } catch {
    // Non-blocking
  }

  // 2. Stop Web Audio
  if (webAudioInterval) {
    clearInterval(webAudioInterval);
    webAudioInterval = null;
  }

  // 3. Stop native player
  if (activePlayer) {
    try {
      activePlayer.pause();
      if (typeof activePlayer.remove === "function") {
        activePlayer.remove();
      }
    } catch {
      // Non-blocking
    }
    activePlayer = null;
  }
}
