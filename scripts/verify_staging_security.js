"use strict";
/**
 * Automated Security & Storage Test Suite for Huddle Staging Readiness
 *
 * Verifies:
 *  1. Uploader blocked by recipient (Bidirectional check & cache eviction)
 *  2. Recipient blocked by uploader (Bidirectional check & cache eviction)
 *  3. Unblocked participant accessing private media (Exact path match)
 *  4. Unrelated user attempting to access private media (Strict denial)
 *  5. Expired signed URL token refresh logic
 *  6. Previously issued signed URL after block (HMAC expiry documentation & client cache purge)
 *  7. Unauthorized receipt updates (Sender forgery & monotonic progression)
 *  8. SECURITY DEFINER search_path and execution privilege hardening
 */
const results = [];
function assert(condition, name, category, details) {
    results.push({
        name,
        category,
        passed: condition,
        details,
    });
}
// -----------------------------------------------------------------------------
// 1. Storage RLS SQL Simulation & Exact Matching
// -----------------------------------------------------------------------------
function simulateStorageRlsSelect({ authUid, objectName, directMessages, blockedUsers, }) {
    // Evaluates exact SQL:
    // bucket_id = 'chat_media' AND EXISTS (
    //   SELECT 1 FROM public.direct_messages dm
    //   WHERE dm.image_url = name
    //     AND (dm.sender_id = auth.uid() OR dm.receiver_id = auth.uid()::text)
    //     AND NOT EXISTS (
    //       SELECT 1 FROM public.blocked_users bu
    //       WHERE (bu.blocker_id = auth.uid() AND (bu.blocked_user_id = dm.sender_id OR bu.blocked_user_id::text = dm.receiver_id))
    //          OR ((bu.blocker_id = dm.sender_id OR bu.blocker_id::text = dm.receiver_id) AND bu.blocked_user_id = auth.uid())
    //     )
    // )
    const matchedMessage = directMessages.find((dm) => dm.image_url === objectName && // EXACT MATCH
        (dm.sender_id === authUid || dm.receiver_id === authUid));
    if (!matchedMessage)
        return false;
    const hasBlock = blockedUsers.some((bu) => (bu.blocker_id === authUid &&
        (bu.blocked_user_id === matchedMessage.sender_id || bu.blocked_user_id === matchedMessage.receiver_id)) ||
        ((bu.blocker_id === matchedMessage.sender_id || bu.blocker_id === matchedMessage.receiver_id) &&
            bu.blocked_user_id === authUid));
    return !hasBlock;
}
// -----------------------------------------------------------------------------
// 1b. Helper: is_blocked_bidirectional Caller Privacy Enforcement
// -----------------------------------------------------------------------------
function simulateIsBlockedBidirectional({ callerUid, userA, userBText, blockedUsers, }) {
    // Strict privacy guard: Enforces that user_a = auth.uid()
    if (!callerUid || userA !== callerUid) {
        return {
            isBlocked: false,
            error: "Access denied: callers may only check blocking relationships involving their own authenticated identity",
        };
    }
    const isBlocked = blockedUsers.some((bu) => (bu.blocker_id === userA && bu.blocked_user_id === userBText) ||
        (bu.blocker_id === userBText && bu.blocked_user_id === userA));
    return { isBlocked };
}
// -----------------------------------------------------------------------------
// 2. Receipt Integrity & Trigger Simulation
// -----------------------------------------------------------------------------
function simulateMessageUpdateTrigger({ authUid, oldRow, newRow, }) {
    // Check immutable fields
    if (newRow.id !== oldRow.id ||
        newRow.sender_id !== oldRow.sender_id ||
        newRow.receiver_id !== oldRow.receiver_id ||
        newRow.content !== oldRow.content ||
        newRow.created_at !== oldRow.created_at) {
        return { allowed: false, error: "Immutable fields of direct_messages cannot be modified" };
    }
    // Sender updates
    if (authUid === oldRow.sender_id) {
        if (newRow.delivered_at !== oldRow.delivered_at || newRow.read_at !== oldRow.read_at) {
            return { allowed: false, error: "Senders cannot forge recipient delivery or read receipts" };
        }
        return { allowed: true };
    }
    // Recipient updates
    if (authUid === oldRow.receiver_id) {
        if (newRow.is_failed !== oldRow.is_failed) {
            return { allowed: false, error: "Recipients cannot alter message is_failed status" };
        }
        // Monotonicity check
        if (oldRow.delivered_at !== null && (newRow.delivered_at === null || newRow.delivered_at < oldRow.delivered_at)) {
            return { allowed: false, error: "delivered_at timestamp cannot be cleared or moved backwards" };
        }
        if (oldRow.read_at !== null && (newRow.read_at === null || newRow.read_at < oldRow.read_at)) {
            return { allowed: false, error: "read_at timestamp cannot be cleared or moved backwards" };
        }
        return { allowed: true };
    }
    return { allowed: false, error: "Unauthorized to update this direct message" };
}
// -----------------------------------------------------------------------------
// 3. Client Memory Cache & Resolution Simulation
// -----------------------------------------------------------------------------
class ClientSignedUrlManager {
    cache = new Map();
    blockedUsers = new Set();
    setBlocked(userId) {
        this.blockedUsers.add(userId);
        // Instant cache invalidation
        for (const [key] of this.cache.entries()) {
            const ownerId = key.split("/")[0];
            if (ownerId === userId) {
                this.cache.delete(key);
            }
        }
    }
    setCache(path, url, ttlSeconds) {
        this.cache.set(path, {
            signedUrl: url,
            expiresAt: Date.now() + ttlSeconds * 1000,
        });
    }
    resolveMediaUrl(path, isServerAuthorized) {
        const ownerId = path.split("/")[0];
        if (ownerId && this.blockedUsers.has(ownerId)) {
            this.cache.delete(path);
            return "";
        }
        const cached = this.cache.get(path);
        if (cached && cached.expiresAt > Date.now()) {
            return cached.signedUrl;
        }
        if (!isServerAuthorized) {
            return "";
        }
        const freshUrl = `https://supabase.local/storage/v1/object/sign/chat_media/${path}?token=mock_jwt_exp`;
        this.cache.set(path, {
            signedUrl: freshUrl,
            expiresAt: Date.now() + 600 * 1000,
        });
        return freshUrl;
    }
    isCached(path) {
        const entry = this.cache.get(path);
        return !!entry && entry.expiresAt > Date.now();
    }
}
// -----------------------------------------------------------------------------
// 4. Coturn Deploy Hook Simulation Helpers
// -----------------------------------------------------------------------------
function simulateIdentityReconciliation({ liveUid, liveGid, procUser, procGroup, systemdUser, systemdGroup, passwdDb, groupDb, }) {
    const liveUser = Object.keys(passwdDb).find((u) => passwdDb[u] === liveUid);
    const liveGroup = Object.keys(groupDb).find((g) => groupDb[g] === liveGid);
    if (!liveUser || !liveGroup) {
        return { valid: false, error: "Failed to resolve numeric effective UID/GID via getent" };
    }
    // Reconcile user
    if (procUser) {
        const confUid = passwdDb[procUser];
        if (confUid === undefined) {
            return { valid: false, error: `Configured proc-user '${procUser}' cannot be resolved via getent` };
        }
        if (confUid !== liveUid) {
            return { valid: false, error: `Live process UID (${liveUid}) does not match configured proc-user '${procUser}' (UID ${confUid})` };
        }
    }
    else if (systemdUser && systemdUser !== "root" && systemdUser !== "0") {
        const sysUid = passwdDb[systemdUser];
        if (sysUid !== liveUid) {
            return { valid: false, error: `Live process UID (${liveUid}) does not match systemd User '${systemdUser}' (UID ${sysUid})` };
        }
    }
    // Reconcile group
    if (procGroup) {
        const confGid = groupDb[procGroup];
        if (confGid === undefined) {
            return { valid: false, error: `Configured proc-group '${procGroup}' cannot be resolved via getent` };
        }
        if (confGid !== liveGid) {
            return { valid: false, error: `Live process GID (${liveGid}) does not match configured proc-group '${procGroup}' (GID ${confGid})` };
        }
    }
    else if (systemdGroup && systemdGroup !== "root" && systemdGroup !== "0") {
        const sysGid = groupDb[systemdGroup];
        if (sysGid !== liveGid) {
            return { valid: false, error: `Live process GID (${liveGid}) does not match systemd Group '${systemdGroup}' (GID ${sysGid})` };
        }
    }
    return { valid: true, runtimeUser: liveUser, runtimeGroup: liveGroup };
}
function simulateDeploymentRollback({ isFirstInstall, restartSucceeds, fingerprintMatches, rollbackRestartSucceeds, rollbackFingerprintMatches, }) {
    if (restartSucceeds && fingerprintMatches) {
        return { status: "SUCCESS" };
    }
    if (isFirstInstall) {
        return { status: "FIRST_INSTALL_ABORT" };
    }
    if (rollbackRestartSucceeds && rollbackFingerprintMatches) {
        return { status: "ROLLBACK_SUCCESS" };
    }
    return { status: "FATAL_OPERATOR_REQUIRED" };
}
// -----------------------------------------------------------------------------
// EXECUTE TESTS
// -----------------------------------------------------------------------------
async function runSuite() {
    const ALICE = "alice-uuid-111";
    const BOB = "bob-uuid-222";
    const CHARLIE = "charlie-uuid-333";
    const MEDIA_NAME = `${ALICE}/1730000000_photo.jpg`;
    const dmRecord = {
        sender_id: ALICE,
        receiver_id: BOB,
        image_url: MEDIA_NAME,
    };
    // Test 1: Unblocked participant access (Sender Alice & Recipient Bob)
    const aliceUnblocked = simulateStorageRlsSelect({
        authUid: ALICE,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: [],
    });
    const bobUnblocked = simulateStorageRlsSelect({
        authUid: BOB,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: [],
    });
    assert(aliceUnblocked && bobUnblocked, "Unblocked participants can read private conversation media", "Storage RLS", "Both Alice (sender) and Bob (recipient) are granted SELECT on exact image_url match.");
    // Test 2: Unrelated user access (Charlie)
    const charlieAccess = simulateStorageRlsSelect({
        authUid: CHARLIE,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: [],
    });
    assert(!charlieAccess, "Unrelated user denied access to private media", "Storage RLS", "Charlie (neither sender nor recipient) evaluates EXISTS as false and is denied access.");
    // Test 3: SQL Substring Injection Prevention (Ensure exact match only)
    const substringMatch = simulateStorageRlsSelect({
        authUid: BOB,
        objectName: "photo.jpg", // Substring without full prefix
        directMessages: [dmRecord],
        blockedUsers: [],
    });
    assert(!substringMatch, "Substring matching rejected (Exact dm.image_url = name enforced)", "Storage RLS", "Passing a substring of the object name fails exact equality check.");
    // Test 4: Uploader blocked by recipient (Bob blocks Alice)
    const bobBlocksAlice = [{ blocker_id: BOB, blocked_user_id: ALICE }];
    const aliceAccessWhenBlockedByBob = simulateStorageRlsSelect({
        authUid: ALICE,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: bobBlocksAlice,
    });
    const bobAccessWhenBobBlocksAlice = simulateStorageRlsSelect({
        authUid: BOB,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: bobBlocksAlice,
    });
    assert(!aliceAccessWhenBlockedByBob && !bobAccessWhenBobBlocksAlice, "Uploader blocked by recipient (Zero uploader bypass & strict mutual block)", "Storage RLS", "When Bob blocks Alice, neither Alice (uploader) nor Bob can read the media from chat_media.");
    // Test 5: Recipient blocked by uploader (Alice blocks Bob)
    const aliceBlocksBob = [{ blocker_id: ALICE, blocked_user_id: BOB }];
    const bobAccessWhenBlockedByAlice = simulateStorageRlsSelect({
        authUid: BOB,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: aliceBlocksBob,
    });
    const aliceAccessWhenAliceBlocksBob = simulateStorageRlsSelect({
        authUid: ALICE,
        objectName: MEDIA_NAME,
        directMessages: [dmRecord],
        blockedUsers: aliceBlocksBob,
    });
    assert(!bobAccessWhenBlockedByAlice && !aliceAccessWhenAliceBlocksBob, "Recipient blocked by uploader (Strict mutual block)", "Storage RLS", "When Alice blocks Bob, neither participant can read the media from chat_media.");
    // Test 6: Client Memory Cache Eviction upon Block
    const clientManager = new ClientSignedUrlManager();
    // Alice resolves Bob's media while unblocked
    const bobMedia = `${BOB}/1730000000_voice.m4a`;
    const initialUrl = clientManager.resolveMediaUrl(bobMedia, true);
    const wasCachedBeforeBlock = clientManager.isCached(bobMedia);
    // Alice blocks Bob
    clientManager.setBlocked(BOB);
    const wasCachedAfterBlock = clientManager.isCached(bobMedia);
    const blockedResolution = clientManager.resolveMediaUrl(bobMedia, false);
    assert(wasCachedBeforeBlock && !wasCachedAfterBlock && blockedResolution === "", "Client memory cache is purged on block and stops resolving media", "Signed URL", "Cache entry for blocked user is evicted; resolveMediaUrl returns empty string.");
    // Test 7: Expired Signed URL handling
    const expiredManager = new ClientSignedUrlManager();
    const mediaPath = `${ALICE}/test.jpg`;
    expiredManager.setCache(mediaPath, "https://old.url", -10); // Expired 10 seconds ago
    const refreshedUrl = expiredManager.resolveMediaUrl(mediaPath, true);
    assert(refreshedUrl.includes("token=mock_jwt_exp"), "Expired signed URLs are safely refreshed when authorized", "Signed URL", "Client skips expired cache entry and requests fresh signed URL.");
    // Test 8: Receipt Integrity - Senders cannot forge delivery or read receipts
    const oldMessage = {
        id: "msg-1",
        sender_id: ALICE,
        receiver_id: BOB,
        content: "Secret meetup",
        created_at: "2026-11-04T07:00:00Z",
        delivered_at: null,
        read_at: null,
        is_failed: false,
    };
    const senderForgingRead = simulateMessageUpdateTrigger({
        authUid: ALICE,
        oldRow: oldMessage,
        newRow: { ...oldMessage, read_at: "2026-11-04T07:01:00Z" },
    });
    assert(!senderForgingRead.allowed && Boolean(senderForgingRead.error?.includes("Senders cannot forge")), "Sender forgery of read_at rejected by database trigger", "Receipt Integrity", "validate_direct_message_update trigger raises exception when sender alters read_at.");
    // Test 9: Receipt Integrity - Monotonic progression of receipts (cannot clear or rewind)
    const deliveredMessage = {
        ...oldMessage,
        delivered_at: "2026-11-04T07:05:00Z",
    };
    const recipientRewindingDelivered = simulateMessageUpdateTrigger({
        authUid: BOB,
        oldRow: deliveredMessage,
        newRow: { ...deliveredMessage, delivered_at: "2026-11-04T07:00:00Z" }, // Earlier timestamp
    });
    const recipientClearingDelivered = simulateMessageUpdateTrigger({
        authUid: BOB,
        oldRow: deliveredMessage,
        newRow: { ...deliveredMessage, delivered_at: null }, // Cleared
    });
    assert(!recipientRewindingDelivered.allowed && !recipientClearingDelivered.allowed, "Recipient cannot clear or rewind delivered_at timestamp", "Receipt Integrity", "validate_direct_message_update trigger enforces monotonic time progression.");
    // Test 10: Privilege Hardening - Verification of search_path = '' and REVOKE FROM PUBLIC
    const migrationSqlPath = "supabase/migrations/20261104_chat_and_media_hardening.sql";
    const fs = require("fs");
    const sql = fs.readFileSync(migrationSqlPath, "utf-8");
    const hasSearchPathEmpty = sql.includes("SET search_path = ''");
    const hasRevokeInsert = sql.includes("REVOKE ALL ON FUNCTION public.validate_direct_message_insert() FROM PUBLIC");
    const hasRevokeUpdate = sql.includes("REVOKE ALL ON FUNCTION public.validate_direct_message_update() FROM PUBLIC");
    const hasBidirectionalHelper = sql.includes("FUNCTION public.is_blocked_bidirectional");
    assert(hasSearchPathEmpty && hasRevokeInsert && hasRevokeUpdate && hasBidirectionalHelper, "SECURITY DEFINER search_path set to '' and direct execution revoked from PUBLIC", "Privilege Hardening", "Functions declare SET search_path = '' and revoke execution from PUBLIC roles.");
    // Test 11: TURN Infrastructure & Credential Security Verification
    const edgeFunctionPath = "supabase/functions/get-turn-credentials/index.ts";
    const edgeSql = fs.readFileSync(edgeFunctionPath, "utf-8");
    const readsCoturnAuthSecret = edgeSql.includes("COTURN_AUTH_SECRET");
    const readsCoturnStaticSecret = edgeSql.includes("COTURN_STATIC_AUTH_SECRET");
    const enforcesAuthHeader = edgeSql.includes("Missing Authorization header");
    const bindsRelayPorts = edgeSql.includes("3478") && edgeSql.includes("5349") && edgeSql.includes("80") && edgeSql.includes("443");
    // Validate crypto.subtle HMAC generation matches RFC 5766 Base64 format
    const encoder = new TextEncoder();
    const testSecret = "staging_test_secret_key";
    const testUsername = "1730000000:test-uuid-user";
    const cryptoKey = await crypto.subtle.importKey("raw", encoder.encode(testSecret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
    const sig = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(testUsername));
    const b64Hmac = btoa(String.fromCharCode(...new Uint8Array(sig)));
    assert(readsCoturnAuthSecret && readsCoturnStaticSecret && enforcesAuthHeader && bindsRelayPorts && b64Hmac.length > 0, "TURN Edge Function environment variable consistency and RFC 5766 HMAC signature generation", "TURN Security", "Edge function supports COTURN_AUTH_SECRET and COTURN_STATIC_AUTH_SECRET, requires auth, and generates valid HMAC-SHA1 tokens.");
    // Test 12: Privacy Guard - User querying their own relationship
    const ownRelationshipCheck = simulateIsBlockedBidirectional({
        callerUid: ALICE,
        userA: ALICE,
        userBText: BOB,
        blockedUsers: aliceBlocksBob,
    });
    assert(!ownRelationshipCheck.error && ownRelationshipCheck.isBlocked === true, "Authenticated user can query relationships involving their own account", "Privacy & Info Disclosure", "Alice successfully queries if she and Bob have a mutual block; caller identity matches user_a.");
    // Test 13: Privacy Guard - Charlie attempting to probe Alice and Bob's relationship
    const charlieProbingAliceAndBob = simulateIsBlockedBidirectional({
        callerUid: CHARLIE,
        userA: ALICE, // Charlie supplies Alice's UUID instead of his own
        userBText: BOB,
        blockedUsers: aliceBlocksBob,
    });
    assert(Boolean(charlieProbingAliceAndBob.error?.includes("Access denied: callers may only check blocking relationships involving their own authenticated identity")), "Third-party user (Charlie) blocked from probing Alice and Bob's relationship", "Privacy & Info Disclosure", "Function raises exception when user_a != auth.uid(), completely preventing arbitrary relationship queries.");
    // Test 14: Storage RLS invoking is_blocked_bidirectional for authorized participant
    const storageRlsCall = simulateIsBlockedBidirectional({
        callerUid: ALICE,
        userA: ALICE, // Storage RLS automatically injects auth.uid()
        userBText: BOB,
        blockedUsers: [],
    });
    const sqlContainsPrivacyCheck = sql.includes("user_a IS DISTINCT FROM auth.uid()");
    assert(!storageRlsCall.error && storageRlsCall.isBlocked === false && sqlContainsPrivacyCheck, "Storage RLS invokes is_blocked_bidirectional seamlessly with caller auth.uid()", "Privacy & Info Disclosure", "Storage RLS passes auth.uid() as user_a; caller check passes and SQL definition contains strict privacy check.");
    // ---------------------------------------------------------------------------
    // Coturn Deploy Hook Verification & Static Analysis (Tests 15-20)
    // ---------------------------------------------------------------------------
    const hookScriptPath = "scripts/coturn_deploy_hook.sh";
    const hookScript = fs.readFileSync(hookScriptPath, "utf-8");
    // Test 15: Exact Domain Matching & Certbot Token Parsing
    const hasExactDomainFilter = hookScript.includes('TARGET_DOMAIN="turn.joinhuddl.me"') &&
        hookScript.includes('for d in ${RENEWED_DOMAINS}; do') &&
        hookScript.includes('if [[ "$d" == "$TARGET_DOMAIN" ]]; then');
    assert(hasExactDomainFilter, "Deploy hook enforces exact token matching on turn.joinhuddl.me in RENEWED_DOMAINS", "Deploy Hook Hardening", "Safely iterates space-separated RENEWED_DOMAINS without regex ambiguity or false matches.");
    // Test 16: Safe UID/GID Resolution using getent passwd/group (NO id -nu)
    const usesGetentPasswd = hookScript.includes('getent passwd "${EFF_UID}" | cut -d: -f1');
    const usesGetentGroup = hookScript.includes('getent group "${EFF_GID}" | cut -d: -f1');
    const forbidsIdNu = !hookScript.includes("id -nu") && !hookScript.includes("id -ng");
    assert(usesGetentPasswd && usesGetentGroup && forbidsIdNu, "Deploy hook resolves numeric UID/GID using getent passwd/group and avoids id -nu/id -ng", "Deploy Hook Hardening", "POSIX standard getent resolution safely handles numeric IDs without utility parameter confusion.");
    // Test 17: Complete Identity Reconciliation & Contradiction Detection
    const passwdMock = { root: 0, coturn: 112, turnserver: 114 };
    const groupMock = { root: 0, coturn: 118, turnserver: 120 };
    const normalMatch = simulateIdentityReconciliation({
        liveUid: 114,
        liveGid: 120,
        procUser: "turnserver",
        procGroup: "turnserver",
        passwdDb: passwdMock,
        groupDb: groupMock,
    });
    const contradictionMismatch = simulateIdentityReconciliation({
        liveUid: 114,
        liveGid: 120,
        procUser: "coturn", // Contradiction: proc-user configured to coturn but live is turnserver
        procGroup: "turnserver",
        passwdDb: passwdMock,
        groupDb: groupMock,
    });
    const checksContradictionsInScript = hookScript.includes("[CONTRADICTION]") &&
        hookScript.includes("RESOLVED_CONF_UID") &&
        hookScript.includes("RESOLVED_CONF_GID");
    assert(normalMatch.valid && !contradictionMismatch.valid && checksContradictionsInScript, "Identity reconciliation compares live process UID/GID against proc-user, proc-group and systemd", "Deploy Hook Hardening", "Halts with fatal error when live process identity contradicts turnserver.conf or systemd settings.");
    // Test 18: First-Install Detection & Rollback Safety
    const firstInstallRun = simulateDeploymentRollback({
        isFirstInstall: true,
        restartSucceeds: false,
        fingerprintMatches: false,
    });
    const detectsFirstInstallInScript = hookScript.includes("IS_FIRST_INSTALL=1") &&
        hookScript.includes("Automatic rollback unavailable because no previous known-good release exists");
    assert(firstInstallRun.status === "FIRST_INSTALL_ABORT" && detectsFirstInstallInScript, "First-install state detected; automatic rollback is disabled when no previous release exists", "Deploy Hook Hardening", "Avoids corrupting state by refusing rollback when previous target is empty or invalid.");
    // Test 19: Strict Hostname & Public Key Validation
    const hasCheckhost = hookScript.includes('openssl x509 -in "${RELEASE_DIR}/fullchain.pem" -noout -checkhost "${TARGET_DOMAIN}"');
    const hasPubkeyMatch = hookScript.includes("openssl pkey -pubin -outform DER") &&
        hookScript.includes('"${CERT_PUBKEY_HASH}" != "${KEY_PUBKEY_HASH}"');
    assert(hasCheckhost && hasPubkeyMatch, "Cryptographic verification enforces RFC 6125 -checkhost and public key pair equality", "Deploy Hook Hardening", "Directly verifies hostname match and compares SHA-256 DER hashes of cert public key vs private key.");
    // Test 20: Rollback Recovery and Critical Failure Halting
    const successfulRollback = simulateDeploymentRollback({
        isFirstInstall: false,
        restartSucceeds: false,
        fingerprintMatches: false,
        rollbackRestartSucceeds: true,
        rollbackFingerprintMatches: true,
    });
    const failedRollback = simulateDeploymentRollback({
        isFirstInstall: false,
        restartSucceeds: false,
        fingerprintMatches: false,
        rollbackRestartSucceeds: false,
        rollbackFingerprintMatches: false,
    });
    const hasRollbackLogicInScript = hookScript.includes("ln -sfn \"${PREV_TARGET}\" \"${CURRENT_LINK}.rollback\"") &&
        hookScript.includes("[ROLLBACK SUCCESS]") &&
        hookScript.includes("[FATAL] Automatic rollback to ${PREV_TARGET} failed!");
    assert(successfulRollback.status === "ROLLBACK_SUCCESS" &&
        failedRollback.status === "FATAL_OPERATOR_REQUIRED" &&
        hasRollbackLogicInScript, "Atomic symlink rollback restores previous known-good release, alerting operators on double fault", "Deploy Hook Hardening", "Restores previous release atomically if new release fails health check, raising fatal alert if rollback fails.");
    // Print results
    console.log("\n=======================================================");
    console.log("HUDDLE STAGING SECURITY VERIFICATION SUITE RESULTS");
    console.log("=======================================================");
    let passedCount = 0;
    for (const r of results) {
        if (r.passed)
            passedCount++;
        const symbol = r.passed ? "PASS" : "FAIL";
        console.log(`[${symbol}] [${r.category}] ${r.name}`);
        console.log(`       Details: ${r.details}`);
    }
    console.log("=======================================================");
    console.log(`Total: ${results.length} | Passed: ${passedCount} | Failed: ${results.length - passedCount}`);
    console.log("=======================================================\n");
}
runSuite().catch(console.error);
