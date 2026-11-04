// Supabase Edge Function: get-turn-credentials
// Implements secure, ephemeral RFC 5766 time-limited TURN credential generation.
// Supports Coturn, Twilio Network Traversal, or Cloudflare Calls TURN servers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generates RFC 5766 time-limited HMAC-SHA1 credentials for Coturn or compatible servers
async function generateHmacCredentials(username: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(username));
  const hashArray = Array.from(new Uint8Array(signature));
  // Convert binary to Base64
  return btoa(String.fromCharCode(...hashArray));
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Authenticate the caller using Authorization Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Read TURN Infrastructure Environment Variables
    // COTURN_AUTH_SECRET is primary; COTURN_STATIC_AUTH_SECRET supported as configuration alias
    const turnSecret = Deno.env.get("COTURN_AUTH_SECRET") || Deno.env.get("COTURN_STATIC_AUTH_SECRET");
    const turnDomain = Deno.env.get("COTURN_DOMAIN") || "turn.joinhuddl.me";
    const twilioAccountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const twilioAuthToken = Deno.env.get("TWILIO_AUTH_TOKEN");

    const ttlSeconds = 3600; // 1 hour validity
    const expireTimestamp = Math.floor(Date.now() / 1000) + ttlSeconds;

    // Case A: Twilio Network Traversal API integration (if configured)
    if (twilioAccountSid && twilioAuthToken) {
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioAccountSid}/Tokens.json`;
      const basicAuth = btoa(`${twilioAccountSid}:${twilioAuthToken}`);
      const twilioRes = await fetch(twilioUrl, {
        method: "POST",
        headers: { Authorization: `Basic ${basicAuth}` },
      });

      if (twilioRes.ok) {
        const twilioData = await twilioRes.json();
        return new Response(
          JSON.stringify({
            iceServers: twilioData.ice_servers,
            ttl: ttlSeconds,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // Case B: RFC 5766 Coturn time-limited HMAC credentials
    if (turnSecret) {
      const username = `${expireTimestamp}:${user.id}`;
      const credential = await generateHmacCredentials(username, turnSecret);

      const iceServers = [
        // Google & Cloudflare STUN
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun.cloudflare.com:3478",
          ],
        },
        // Coturn UDP & TCP on standard port 3478 and HTTP bypass port 80
        {
          urls: [
            `turn:${turnDomain}:3478?transport=udp`,
            `turn:${turnDomain}:80?transport=udp`,
            `turn:${turnDomain}:3478?transport=tcp`,
            `turn:${turnDomain}:80?transport=tcp`,
          ],
          username,
          credential,
        },
        // Coturn Secure TURNS/TLS on port 5349 and HTTPS bypass port 443
        {
          urls: [
            `turns:${turnDomain}:5349?transport=tcp`,
            `turns:${turnDomain}:443?transport=tcp`,
          ],
          username,
          credential,
        },
      ];

      return new Response(
        JSON.stringify({ iceServers, ttl: ttlSeconds }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Case C: Fallback to baseline STUN servers if TURN secret is not configured
    const baselineIceServers = [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun.cloudflare.com:3478",
        ],
      },
    ];

    return new Response(
      JSON.stringify({
        iceServers: baselineIceServers,
        ttl: ttlSeconds,
        warning: "Neither COTURN_AUTH_SECRET nor COTURN_STATIC_AUTH_SECRET is set; falling back to STUN only.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Failed to generate TURN credentials" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

