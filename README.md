<div align="center">

<img src="./assets/logo.png" alt="Huddle Logo" width="140" style="border-radius: 28px; box-shadow: 0 10px 30px rgba(236, 72, 153, 0.3);" />

# Huddle: Let's Connect

**The modern mobile social platform engineered for real, authentic human connection.**  
*1-on-1 WebRTC Voice & Video Calling • Anonymous Confessions • Secret Sparks • Daily Hot Takes • 15s Voice Intros*

---

<!-- Top Hero Action Badges -->
<p align="center">
  <a href="https://joinhuddl.me">
    <img src="https://img.shields.io/badge/%F0%9F%8C%90%20Live%20Website-joinhuddl.me-ec4899?style=for-the-badge" alt="Live Website" />
  </a>
  <a href="https://expo.dev/artifacts/eas/YDrbENeKJra9P7ZGWrr4xxWax8_dWuZaiRNq7ktWsuI.apk">
    <img src="https://img.shields.io/badge/%F0%9F%93%B2%20Download%20APK-Android%20v1.2%20(WebRTC)-8b5cf6?style=for-the-badge&logo=android&logoColor=white" alt="Download APK" />
  </a>
  <a href="https://expo.dev/accounts/venkateshjatroths-team/projects/huddle-social/builds/07459770-f109-448a-8d6d-49a04b22fc6d">
    <img src="https://img.shields.io/badge/%F0%9F%93%A6%20EAS%20Build-QR%20Code%20%26%20Artifacts-000000?style=for-the-badge&logo=expo&logoColor=white" alt="EAS Build" />
  </a>
</p>

<!-- Tech Stack Badges -->
<p align="center">
  <img src="https://img.shields.io/badge/Expo-SDK_58-000000?style=flat-square&logo=expo&logoColor=white" alt="Expo SDK 58" />
  <img src="https://img.shields.io/badge/React_Native-0.88-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React Native 0.88" />
  <img src="https://img.shields.io/badge/WebRTC-Peer--to--Peer-333333?style=flat-square&logo=webrtc&logoColor=white" alt="WebRTC" />
  <img src="https://img.shields.io/badge/Supabase-Realtime_%26_PostgreSQL-3ECF8E?style=flat-square&logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/TypeScript-Strict_6.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Platform-Android_%E2%80%A2_iOS-white?style=flat-square" alt="Android & iOS" />
</p>

</div>

---

## 🚀 Try Huddle Now (Android)

Get Huddle running on your Android device in seconds without Google Play:

1. **Visit the Live Website:**  
   👉 **[https://joinhuddl.me](https://joinhuddl.me)**

2. **Direct One-Click APK Download:**  
   👉 **[Download Huddle APK v1.2 (Direct .apk)](https://expo.dev/artifacts/eas/YDrbENeKJra9P7ZGWrr4xxWax8_dWuZaiRNq7ktWsuI.apk)**

3. **Install & Permissions Note:**  
   * When prompted with *"File might be harmful"* by Chrome or your mobile browser, tap **Download anyway** (the build is directly compiled and cryptographically signed on EAS Build Cloud).
   * Open the `.apk` file and tap **Install**.
   * Grant **Microphone** and **Camera** permissions when prompted so you can experience real-time 1-on-1 peer-to-peer WebRTC voice and video calls!

---

## ✨ Key Features & Architecture Highlights

### 🎙️ 1-on-1 Real-Time Peer-to-Peer Calling (Raw WebRTC)
* **Native WebRTC Engine:** Powered by `react-native-webrtc` with low-latency audio/video streaming and hardware camera/mic controls (switch camera, mute mic, toggle video).
* **Google STUN Infrastructure:** Public STUN servers (`stun:stun.l.google.com:19302`, `stun1`, `stun2`) ensure NAT traversal and peer discovery.
* **Instant In-App Signaling:** Powered by Supabase Realtime Broadcast channels (`user_calls_${userId}` and `call:${callId}`).
* **Global Ringing Banner:** Receiving users get an incoming call toast anywhere in the app with caller details, avatar, and Accept / Decline controls.
* **Peer-Ready Handshake:** Handshake protocol eliminates dropped SDP negotiations by requiring the callee to signal `peer-ready` before offer generation, with automatic ICE candidate queuing.

### 📸 Instagram-Style Profile & Custom Handles
* **Custom Username Handle:** Users customize their clean Instagram-style handle (e.g. `@alex.travels`), replacing system-generated IDs with live uniqueness checking.
* **Header Stats:** Displays **Posts**, **Followers**, and **Following** arranged side-by-side in a modern layout.
* **Interactive Followers & Following:** Tapping follower or following counts opens a searchable modal list showing member avatars, names, handles, and direct profile navigation.
* **Organized Tabs:**
  * 📸 **Posts:** User-created posts and local feed items.
  * 🔖 **Saved:** Bookmarked posts saved from community circles.
  * 🏆 **Badges:** Earned community achievements and posting streaks.
  * 👤 **About:** Authentic details grid, full bio, interests chips, and Q&A prompts.

### 🎙️ 15-Second Voice Intros & 100% Profile Completion
* **Integrated Voice Recorder:** Records up to 15 seconds of authentic audio via `expo-audio` with real-time waveform visualization and countdown timer.
* **Cloud Audio Storage:** Uploads audio files to Supabase Storage (`voice-intros` bucket) and binds the public URL to `profiles.voice_intro_url`.
* **Profile Completion Tracker:** Recording a voice intro unlocks the final 10% enrichment score, bringing the user to **100% completion** and permanently hiding the setup reminder.
* **Audio Player Card:** Full in-profile audio playback with Play, Pause, waveform scrubber, and a "Re-record" option.

### 🎭 Anonymous Confessions ("Spill the Tea")
* Share unfiltered thoughts, campus/city secrets, and authentic stories with complete privacy.
* Automatically assigns cute, whimsical anonymous aliases (e.g., *Anonymous Fox*, *Night Owl*) with masked user IDs.

### ✨ Secret Sparks & Mutual Match
* Send private compliments to community members you admire.
* If two members reciprocate and send a spark to each other, a **Mutual Spark** triggers an celebratory match modal and unlocks a 1-on-1 direct conversation.

### 📊 Daily Hot Take Battles & Streaks
* Provocative daily community questions with real-time voting percentages, comment debates, and streak tracking.
* Earn streak badges for daily active participation.

### 🛡️ Mandatory Profile Setup Gate
* Guarantees a zero-bot, high-trust community by requiring core fields (photo, display name, 15+ char bio, city, and 3+ interests) before unlocking feeds.

---

## 🛠️ Tech Stack & Libraries

| Layer | Technology |
|---|---|
| **Framework** | [Expo SDK 58](https://expo.dev/) (React Native 0.88.1) |
| **Routing** | [Expo Router](https://docs.expo.dev/router/introduction/) (File-based navigation) |
| **P2P Audio/Video** | [`react-native-webrtc`](https://github.com/react-native-webrtc/react-native-webrtc) + Google STUN |
| **Audio Recording** | [`expo-audio`](https://docs.expo.dev/versions/latest/sdk/audio/) (High-quality AAC / M4A) |
| **Database & Auth** | [Supabase](https://supabase.com/) (PostgreSQL, Row-Level Security, Auth) |
| **Signaling & Push** | Supabase Realtime Broadcast & Postgres Changes + `expo-notifications` |
| **Cloud Storage** | Supabase Storage (`avatars`, `gallery`, `voice-intros`) |
| **Build & Deploy** | [EAS Build](https://expo.dev/eas) (Android APK preview & production builds) |
| **Landing Page** | HTML5, Tailwind CSS, Lucide Icons, hosted on [GitHub Pages](https://pages.github.com/) |

---

## 💻 Local Development

### Prerequisites
* [Node.js](https://nodejs.org/) v18+ (tested on v24)
* [Expo CLI](https://docs.expo.dev/more/expo-cli/) (`npx expo`)

### Setup & Run

1. **Clone the repository:**
   ```bash
   git clone https://github.com/VenkateshJatroth/Huddle.git
   cd Huddle
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npx expo start
   ```

4. **Run Quality & Typecheck Commands:**
   ```bash
   npx tsc --noEmit    # Typecheck (0 errors)
   npx expo lint       # Lint verification (0 errors, 0 warnings)
   npx expo-doctor     # Verify Expo dependencies & config
   ```

---

## 📦 Building Standalone Binaries (EAS Build)

To compile a new native Android APK with raw WebRTC and native dependencies:

```bash
# Trigger an internal preview APK build on EAS Cloud
npx eas-cli build --platform android --profile preview --non-interactive --clear-cache
```

To publish an instant Over-The-Air (OTA) update to all installed devices:

```bash
# Publish OTA update to the preview branch
npx eas-cli update --branch preview --environment preview --message="v1.2 update"
```

---

## 👤 Author & Maintainer

**Venkatesh Jatroth**  
* GitHub: [@VenkateshJatroth](https://github.com/VenkateshJatroth)  
* Project: [Huddle Social on Expo](https://expo.dev/accounts/venkateshjatroths-team/projects/huddle-social)

---

<div align="center">
  <sub>Built with ❤️ for authentic human connection. Copyright © 2026 Huddle. All rights reserved.</sub>
</div>
