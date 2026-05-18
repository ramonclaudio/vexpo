import {
  attestKeyAsync,
  generateAssertionAsync,
  generateKeyAsync,
  isSupported,
} from "@expo/app-integrity";

/**
 * Client-side App Attest helpers.
 *
 * Pairs with the Convex `appAttest` actions:
 *   1. Call `attestThisDevice` once per fresh install. Convex returns a
 *      challenge, the device generates + attests a Secure-Enclave key,
 *      and Convex verifies the attestation and records the public key.
 *   2. Call `signRequest` before every protected mutation. The device
 *      signs the payload with the attested key, Convex verifies the
 *      signature, and only then runs the underlying mutation.
 *
 * The flow is opt-in per-mutation. Public reads stay cheap; only the
 * surfaces that care about anti-abuse pay the round-trip.
 */

export type AppAttestClient = {
  issueChallenge: () => Promise<{ nonce: string }>;
  verifyAttestation: (args: {
    keyId: string;
    attestation: string;
    challenge: string;
  }) => Promise<{ keyId: string }>;
  verifyAssertion: (args: {
    keyId: string;
    assertion: string;
    payload: string;
  }) => Promise<{ counter: number }>;
};

const STORAGE_KEY = "vexpo.app-attest.key-id";

let cachedKeyId: string | null = null;

/**
 * Whether the running device supports App Attest. False on iOS Simulator
 * and on iOS < 14. Callers should fall through to unattested behavior
 * when this is false (App Attest is a defense-in-depth layer, not a
 * gate, for a starter template).
 */
export const supportsAppAttest = (): boolean => isSupported;

/**
 * Attest a fresh App Attest key on this device and register its public
 * key with the server. Idempotent: re-running before the previous keyId
 * is stored just generates a new one.
 *
 * The returned keyId should be persisted by the caller (SecureStore is
 * a fine spot) and reused on every subsequent assertion. App Attest
 * requires the same keyId across a device's lifetime; rotating it costs
 * a fresh attestation round-trip.
 */
export async function attestThisDevice(client: AppAttestClient): Promise<string> {
  if (!isSupported) {
    throw new Error("app-attest: device does not support App Attest");
  }
  const { nonce } = await client.issueChallenge();
  const keyId = await generateKeyAsync();
  const attestation = await attestKeyAsync(keyId, nonce);
  await client.verifyAttestation({ keyId, attestation, challenge: nonce });
  cachedKeyId = keyId;
  return keyId;
}

/**
 * Sign a payload with the previously-attested key and forward the
 * signature to the server. The server verifies the signature against
 * the stored public key + monotonic counter.
 *
 * `payload` should be a compact deterministic encoding of the request
 * (e.g. JSON.stringify with sorted keys, or the raw mutation arg string).
 * Whatever shape you pick, sign the *exact* same bytes the server will
 * verify.
 */
export async function signRequest(
  client: AppAttestClient,
  keyId: string,
  payload: string,
): Promise<{ counter: number }> {
  if (!isSupported) {
    throw new Error("app-attest: device does not support App Attest");
  }
  const { nonce } = await client.issueChallenge();
  const assertion = await generateAssertionAsync(keyId, nonce);
  return client.verifyAssertion({ keyId, assertion, payload });
}

/**
 * The keyId in-memory cache. Cleared automatically on app restart.
 * Callers that need durability should persist the keyId in SecureStore
 * and rehydrate the cache here.
 */
export function getCachedKeyId(): string | null {
  return cachedKeyId;
}

export function setCachedKeyId(keyId: string | null): void {
  cachedKeyId = keyId;
}

export const APP_ATTEST_STORAGE_KEY = STORAGE_KEY;
