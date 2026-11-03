import { Platform } from "react-native";
import { supabase } from "./supabase";

export type VoiceIntroSaveResult = {
  voice_intro_url: string;
  voice_duration_sec: number;
};

/**
 * Uploads a recorded audio file to Supabase Storage and updates the user's profile record.
 */
export async function uploadAndSaveVoiceIntro(
  userId: string,
  localAudioUri: string,
  durationSec: number = 15,
): Promise<VoiceIntroSaveResult> {
  if (!userId) {
    throw new Error("Missing user ID to save voice intro.");
  }

  const safeDuration = Math.min(60, Math.max(2, Math.round(durationSec)));
  const fileName = `${userId}/intro_${Date.now()}.m4a`;

  let uploadedPublicUrl: string | null = null;

  try {
    let fileBlob: Blob | null = null;

    if (Platform.OS === "web") {
      const resp = await fetch(localAudioUri);
      fileBlob = await resp.blob();
    } else {
      // React Native fetch on file:// or content:// URI resolves to Blob
      const resp = await fetch(localAudioUri);
      fileBlob = await resp.blob();
    }

    if (fileBlob) {
      // Primary: try voice-intros bucket
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("voice-intros")
        .upload(fileName, fileBlob, {
          contentType: "audio/m4a",
          upsert: true,
        });

      if (!uploadError && uploadData) {
        const { data: publicUrlData } = supabase.storage
          .from("voice-intros")
          .getPublicUrl(uploadData.path);
        uploadedPublicUrl = publicUrlData.publicUrl;
      } else {
        // Fallback: try gallery bucket
        const { data: fallbackData, error: fallbackError } = await supabase.storage
          .from("gallery")
          .upload(`voice_${fileName}`, fileBlob, {
            contentType: "audio/m4a",
            upsert: true,
          });

        if (!fallbackError && fallbackData) {
          const { data: publicUrlData } = supabase.storage
            .from("gallery")
            .getPublicUrl(fallbackData.path);
          uploadedPublicUrl = publicUrlData.publicUrl;
        }
      }
    }
  } catch (storageErr) {
    console.warn("Storage upload failed, falling back to direct URI:", storageErr);
  }

  // If storage upload succeeded, use the public URL; otherwise store the audio URI
  const finalVoiceUrl = uploadedPublicUrl || localAudioUri;

  // Update Supabase profile table
  const { error: profileError } = await (supabase as any)
    .from("profiles")
    .update({
      voice_intro_url: finalVoiceUrl,
      voice_duration_sec: safeDuration,
    })
    .eq("id", userId);

  if (profileError) {
    console.warn("Failed to update profile record for voice intro:", profileError);
  }

  return {
    voice_intro_url: finalVoiceUrl,
    voice_duration_sec: safeDuration,
  };
}

/**
 * Removes the voice intro from the user's profile.
 */
export async function removeVoiceIntro(userId: string): Promise<void> {
  if (!userId) return;

  await (supabase as any)
    .from("profiles")
    .update({
      voice_intro_url: null,
      voice_duration_sec: null,
    })
    .eq("id", userId);
}

