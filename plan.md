# Gormati — Project Plan & Architecture Status

## 1. Product Overview

**Gormati** is an Android-first social discovery and cultural connection app for India and the Indian diaspora. It is designed around an exclusive, minimalist deep-navy aesthetic, prioritizing real connections, community groups, and authentic local discovery.

### V1 Key Milestones & Features
- **Guest & Public Exploration:** Preview public directory profiles, interest tags, and sample community activity before sign-in.
- **Authentication:** Supabase Auth (email/password with secure session persistence via Expo SecureStore and reactive auth state).
- **Social Graph & Connections:** Follow/unfollow, mutual connection requests, request approvals/rejections, and connection stats.
- **Privacy Controls:** Private vs. public profile visibility toggles; private profiles only disclose full details to accepted connections.
- **Design System:** Minimalist, exclusive deep-navy aesthetic (`#0A1930` primary, `#FFFFFF` surface, `#F5F5F7` background, `#71797E` secondary, and `#10B981` verified fresh green).

---

## 2. Current Architecture & Implementation Status

| Component | Planned (Legacy Draft) | Implemented Reality | Current Status |
| :--- | :--- | :--- | :--- |
| **App Branding** | "Indiana" (`com.indiana.app`) | **"Gormati"** (`com.gormati.app`) | ✅ Completed |
| **Theme / Design** | High-saturation orange | **Sleek Pure Black & White Monochromatic Minimalist** | ✅ Completed |
| **Client Core** | Expo SDK 58, React Native 0.88, Expo Router | Expo SDK 58, React Native 0.88, Expo Router | ✅ Clean (0 tsc / 0 lint errors) |
| **Backend & Database** | Convex (legacy proposal) | **Supabase** PostgreSQL with secure RPCs | ✅ Configured & Connected |
| **Authentication** | Clerk (legacy proposal) | **Supabase Auth** + SecureStore token persistence | ✅ Fully wired |
| **User Profiles & Discovery** | Hardcoded mock data | **Live Supabase queries, Storage upload & full Gormati model** | ✅ Completed |
| **Profile Detail & Mutual Match** | Not implemented | **Dynamic Profile Detail (`/member/[id]`), Photo Carousel, Compatibility Score** | ✅ Completed |
| **Real-Time 1-on-1 Chat** | Not implemented | **Real-Time Chat (`/chat/[id]`), Date Prompts / Icebreakers & Supabase Realtime** | ✅ Completed |
| **Push Notifications** | Not implemented | **`expo-notifications` + Push Token Sync + Deep Link Router + Webhook Edge Function** | ✅ Completed |
| **Play Store Policy Compliance** | Not implemented | **In-App Account Deletion + Member Reporting & Blocking UI + Safety Engine** | ✅ Completed |
| **In-App OTA Updates** | Not implemented | **`expo-updates` + Auto-Check on Startup & Foreground + In-App Notification Banner** | ✅ Completed |
| **Cloud EAS Project** | Not initialized | `@venkateshjatroths-team/gormati` | ✅ Active & Linked |
| **Android APK Distribution** | Not built | Standalone Preview APK generated on EAS | ✅ Built & Downloadable |
| **Google Play Production Bundle (.aab)** | Not built | **Signed Production AAB (`distribution: store`)** | ✅ Built & Ready for Console |

---

## 3. Active Cloud Builds & Deliverables
- **Project ID:** `2bec6c32-3d58-45ed-9490-6f46da5ad030`
- **Latest Active OTA Update (Preview Channel):** [View Update Group](https://expo.dev/accounts/venkateshjatroths-team/projects/gormati/updates/a7bcb2df-19ba-427d-9529-5cca19eeb4f9) (Group ID: `a7bcb2df-19ba-427d-9529-5cca19eeb4f9`, Android Update ID: `01a18d58-cffc-706a-867c-ac654d934e51`)
- **Latest Black & White Preview APK:** [Download GorMati B&W APK](https://expo.dev/artifacts/eas/fpwBvxmCkOPRR8-JAUx5q03vQZ9tNK7NiBQ12WEtUgI.apk) (Build ID: `7d6dd290-93fd-41a8-94f0-5bdf6dc8fd19`)
- **Production AAB (Google Play Store):** [Download Signed Production AAB](https://expo.dev/artifacts/eas/uUzL0-dJVfcLLUXx3K6x3i1wikLFAU2bTh9t1WMvHr4.aab) (Build ID: `c7c4e878-abf2-43ea-9cc2-b072c7067269`)
- **Baseline Preview APK:** [Download Baseline APK](https://expo.dev/artifacts/eas/z1iHk-fCu2X2AdbuALBYap0cePvnZyRnmxDUoTaRJRU.apk) (Build ID: `75e761d1-fbd3-4f9b-85a2-e3a53ff0b3d0`)

---

## 4. Immediate Next Steps
1. Execute master SQL migration (`supabase/migrations/20261029_gormati_phase1_2_3.sql` and `supabase/migrations/20261029_push_notifications.sql`) in Supabase SQL editor.
2. Deploy the `push-notifications` Edge Function (`supabase/functions/push-notifications/index.ts`) via Supabase CLI (`npx supabase functions deploy push-notifications`).
3. Set up Database Webhooks in Supabase Dashboard (Database -> Webhooks) targeting the Edge Function for `messages` (INSERT) and `follow_relationships` (INSERT, UPDATE).
4. Trigger updated preview APK build for on-device push notification testing.
