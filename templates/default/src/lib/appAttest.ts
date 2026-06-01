import {
  attestKeyAsync,
  generateAssertionAsync,
  generateKeyAsync,
  isSupported,
} from "@expo/app-integrity";

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
 * and on iOS < 14.
 */
export const supportsAppAttest = (): boolean => isSupported;

/**
 * App Attest requires the same keyId across a device's lifetime; the caller
 * should persist the returned keyId and reuse it on every assertion. Rotating
 * it costs a fresh attestation round-trip.
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
 * `payload` must be a deterministic encoding signed as the *exact* same bytes
 * the server will verify (e.g. JSON.stringify with sorted keys, or the raw
 * mutation arg string).
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

export function getCachedKeyId(): string | null {
  return cachedKeyId;
}

export function setCachedKeyId(keyId: string | null): void {
  cachedKeyId = keyId;
}

export const APP_ATTEST_STORAGE_KEY = STORAGE_KEY;
