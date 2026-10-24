# Indiana — Project Plan

## Product

Indiana is an Android-first social discovery app for people in India and the Indian diaspora. It is open to everyone, centered on Indian communities, and restricted to users aged 18 or older. Its main promise is helping people find relevant people and groups by connection goals and city.

### V1 goals

- Let visitors preview public profiles and groups before creating an account.
- Help signed-in users discover people, groups, and nearby connections.
- Support following, mutual connection requests, and group membership.
- Keep a useful profile private to the right audience: public previews show basic details; accepted connections see bio, interests, and languages.
- Launch the interface in English, Hindi, Telugu, Kannada, and Tamil.

### Out of scope for V1

- Private messaging, a general content feed, group posts/discussions, and events.
- iOS or web releases as end-user products.
- Automatic translation of user-written profile or group text.

## Primary journeys

1. **Explore as a guest:** Open discovery, choose people, groups, or nearby, and browse limited public previews. Sign-in is required to follow, request a connection, or join a group.
2. **Create an account:** Sign up or sign in with email/password, phone OTP, or Google. Authentication methods should resolve to one Clerk account. Collect display name, date of birth, city, and connection goals; reject users under 18. Users can enter a city manually or optionally grant foreground location access to suggest one.
3. **Find people:** Filter and simply rank profiles by city and connection goals. Follow someone or send a connection request. Acceptance unlocks the expanded profile; phone and email remain private.
4. **Join a group:** Browse public group previews. Groups are user-created, with open or owner-approval joining. Owners can appoint admins and transfer ownership.
5. **Manage safety and activity:** Block users, report profiles or groups, review received connection requests and group join decisions, and receive push notifications for request and group-approval decisions.

## Data and system design

- **Client:** Expo SDK 58, React Native 0.88, TypeScript, and Expo Router. Android is the first release target; use Expo Continuous Native Generation and config plugins for native configuration.
- **Authentication:** Clerk Expo SDK with email/password, phone OTP, and Google. Store one application profile per Clerk user ID and support linking sign-in methods to that account.
- **Backend:** Convex is the source of truth. Define validated tables and server functions for profiles, follows, connection requests, groups, group memberships/roles, blocks, reports, activity notifications, registered push tokens, and Indiana admin IDs.
- **Access rules:** Public queries return only preview fields. Connection-only profile fields are returned only when an accepted connection exists. Mutations verify the Clerk identity and authorization on the server; clients cannot assign their own admin or group-owner roles.
- **Location:** Store a city only. Ask for location permission only when the user requests a location suggestion; allow manual entry and never persist device coordinates.
- **Age and deletion:** Validate date of birth at signup, then retain only an adult-eligible flag. Account deletion removes personal records. Before deleting an owner, transfer a group to an existing admin; if none exists, archive the group.
- **Notifications:** Store in-app activity and Expo push tokens. Server-side Convex actions send Expo Push Service alerts after connection-request decisions and group join decisions. Push is optional and must not be required for core app use.
- **Connectivity:** Online connection is required for discovery and social actions. Show loading, empty, retry, and offline states; do not queue mutations offline.
- **Secrets and environments:** Keep Clerk and Convex public client configuration in environment variables; never ship server secrets. Use separate development, staging, and production Clerk/Convex environments.

## Delivery workflow and stage gates

1. **Project planning — current stage:** Maintain this file as the approved scope and decisions record. Do not begin screen implementation until product scope and assumptions are accepted.
2. **UI design:** Create a coherent visual system and reference designs for the agreed screens. Review and approve the references before implementation.
3. **Feature implementation:** Build one screen or flow at a time. Compare Android emulator screenshots with its reference, iterate on feedback, and only then move to the next screen. Keep business logic and shared components outside `src/app/` routes.
4. **Authentication and backend:** Integrate Clerk and Convex after the screen structure is approved. Add server-side access checks and database functions, then connect the UI to live data.
5. **Code quality and review:** Work on feature branches, run lint/typecheck and relevant scenario checks, use CodeRabbit when available, and review changes through pull requests before merging.
6. **Legal and deployment:** Prepare Privacy Policy, Terms of Service, and a landing page; configure Sentry; create an Android development/release build with EAS and complete release checks before publishing.

## Acceptance criteria

- Guest previews expose only public fields; expanded profile data is available only to accepted connections.
- Email/password, phone OTP, and Google sign-in can be linked to one Clerk user, and users under 18 cannot complete onboarding.
- Discovery filters by city and connection goal; denying location permission leaves manual city entry usable.
- Follow, connection request/acceptance, block, open/approval group joining, ownership transfer, and account deletion behave as specified.
- Reports are visible to Indiana admins only and move between `pending` and `resolved` states.
- Push alerts are tested in an Android development build; core flows remain usable when push is denied or unavailable.
- Before a task is considered complete, run `npx expo lint`, `npx tsc --noEmit`, and `npx expo-doctor`, plus an Android emulator walkthrough.

## Assumptions and open risks

- **Assumption:** Public previews show a limited profile (display name, city, and connection goals) and a group's name/description; sign-in is needed for social actions.
- **Assumption:** The app interface defaults to the device language when supported, with a user-selectable language setting; user-generated text is not translated.
- **Assumption:** Report status shown to reporters is only `pending` or `resolved`; review is manual in the Convex dashboard during V1.
- **Open risk:** Phone OTP costs, country coverage, abuse protection, and India-specific SMS requirements must be checked before enabling production sign-in.
- **Open risk:** Confirm Clerk and Convex hosting/data-region requirements and privacy obligations before production.
- **Open risk:** Clerk Google sign-in needs Google Cloud credentials and a native development build; push notifications also require a development build and configured Android credentials.
- **Open risk:** No Clerk or Convex project credentials have been provided yet. The application cannot connect to live services until development environments are created and configured.

## Version and integration references

- Existing project baseline: Expo `~58.0.17`, React Native `0.88.0`, Expo Router `~58.0.25`.
- Expo SDK 58 reference: <https://docs.expo.dev/versions/v58.0.0/>
- Clerk Expo quickstart: <https://clerk.com/docs/expo/getting-started/quickstart>
- Clerk Google sign-in for Expo: <https://clerk.com/docs/expo/guides/configure/auth-strategies/sign-in-with-google>
- Convex React Native quickstart: <https://docs.convex.dev/quickstart/react-native>
- Convex with Clerk: <https://docs.convex.dev/auth/clerk>

At implementation time, verify exact Clerk, Convex, and Expo package versions against their current official compatibility documentation before installing or writing integration code.
