import { manipulateAsync, SaveFormat, type Action } from "expo-image-manipulator";

export type ImageCompressionType = "avatar" | "feed" | "gallery" | "story";

export type CompressImageOptions = {
  maxWidth?: number;
  quality?: number;
  type?: ImageCompressionType;
};

/**
 * Resizes and compresses an image URI on-device before uploading to Supabase Storage.
 *
 * Rules:
 * - Avatars: capped to max 800px width/dimension, 0.75 JPEG quality.
 * - Feed posts & stories: capped to max 1200px width/dimension, 0.75 JPEG quality.
 * - Always outputs clean JPEG format ('image/jpeg') preserving aspect ratio.
 * - Graceful fallback: returns original URI if manipulation fails on unsupported format.
 */
export async function compressImage(
  uri: string,
  options?: CompressImageOptions,
): Promise<{ uri: string; width?: number; height?: number }> {
  if (!uri) {
    return { uri: "" };
  }

  // Already a remote HTTP/HTTPS URL
  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    return { uri };
  }

  const type = options?.type ?? "feed";
  const defaultMaxWidth = type === "avatar" ? 800 : 1200;
  const maxWidth = options?.maxWidth ?? defaultMaxWidth;
  const quality = options?.quality ?? 0.75;

  try {
    const actions: Action[] = [
      {
        resize: { width: maxWidth },
      },
    ];

    const result = await manipulateAsync(uri, actions, {
      compress: quality,
      format: SaveFormat.JPEG,
    });

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
    };
  } catch (err) {
    console.warn("[imageCompression] Compression fallback to original URI:", err);
    return { uri };
  }
}
