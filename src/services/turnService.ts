import { supabase } from "../lib/supabase";

/**
 * TURN & ICE Configuration Service.
 *
 * Implements secure ephemeral TURN credential acquisition with:
 * - RFC 5766 time-limited credential exchange via Supabase Edge Function
 * - Support for UDP, TCP, and TLS (TURNS) protocols
 * - Relay-only connection mode (`iceTransportPolicy: 'relay'`) for IP privacy
 * - High-availability fallback STUN servers
 * - In-memory credential caching based on TTL
 */

export type RTCIceServerConfig = {
  urls: string | string[];
  username?: string;
  credential?: string;
};

export type IceConfigurationResult = {
  iceServers: RTCIceServerConfig[];
  iceTransportPolicy: "all" | "relay";
  iceCandidatePoolSize: number;
  isRelayedOnly: boolean;
};

// In-memory cache for short-lived TURN credentials
let cachedTurnConfig: {
  servers: RTCIceServerConfig[];
  expiresAt: number;
} | null = null;

// Baseline high-reliability STUN servers (always available without credentials)
const BASELINE_STUN_SERVERS: RTCIceServerConfig[] = [
  {
    urls: [
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
      "stun:stun2.l.google.com:19302",
      "stun:stun.cloudflare.com:3478",
    ],
  },
];

/**
 * Fetches short-lived TURN credentials from the Supabase Edge Function `get-turn-credentials`.
 * If the function is not yet deployed or fails, it falls back to configured environment variables
 * or baseline STUN servers, ensuring calls do not crash.
 */
export async function fetchEphemeralTurnServers(): Promise<RTCIceServerConfig[]> {
  const now = Date.now();

  // 1. Return valid cached credentials (with 60-second safety buffer before expiry)
  if (cachedTurnConfig && cachedTurnConfig.expiresAt > now + 60000) {
    return cachedTurnConfig.servers;
  }

  // 2. Try fetching from Supabase Edge Function: get-turn-credentials
  try {
    const { data, error } = await supabase.functions.invoke("get-turn-credentials", {
      method: "POST",
    });

    if (!error && data?.iceServers && Array.isArray(data.iceServers)) {
      const servers: RTCIceServerConfig[] = data.iceServers;
      const ttlSeconds = typeof data.ttl === "number" ? data.ttl : 600; // Default 10 min
      cachedTurnConfig = {
        servers,
        expiresAt: now + ttlSeconds * 1000,
      };
      return servers;
    }
  } catch (edgeFnErr) {
    // Edge function not yet deployed or network unreachable - continue to fallbacks
    console.warn("get-turn-credentials Edge Function unavailable, checking fallbacks:", edgeFnErr);
  }

  // 3. Fallback to custom TURN credentials configured in environment variables (if any)
  const envTurnUrl = process.env.EXPO_PUBLIC_TURN_URL;
  const envTurnUsername = process.env.EXPO_PUBLIC_TURN_USERNAME;
  const envTurnCredential = process.env.EXPO_PUBLIC_TURN_CREDENTIAL;

  if (envTurnUrl && envTurnUsername && envTurnCredential) {
    const customServers: RTCIceServerConfig[] = [
      ...BASELINE_STUN_SERVERS,
      {
        urls: envTurnUrl.split(",").map((u) => u.trim()),
        username: envTurnUsername,
        credential: envTurnCredential,
      },
    ];
    return customServers;
  }

  // 4. Fallback to baseline STUN servers
  return BASELINE_STUN_SERVERS;
}

/**
 * Builds the full WebRTC configuration with STUN/TURN servers and transport policy.
 *
 * @param options.relayOnly When true, enforces `iceTransportPolicy: 'relay'`,
 * preventing any direct peer-to-peer IP exposure for privacy-sensitive calls.
 */
export async function getWebRTCConfiguration(options?: {
  relayOnly?: boolean;
}): Promise<IceConfigurationResult> {
  const relayOnly = Boolean(options?.relayOnly);
  const servers = await fetchEphemeralTurnServers();

  return {
    iceServers: servers,
    iceTransportPolicy: relayOnly ? "relay" : "all",
    iceCandidatePoolSize: 10,
    isRelayedOnly: relayOnly,
  };
}

