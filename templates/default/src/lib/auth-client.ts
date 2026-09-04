import { expoClient } from "@better-auth/expo/client";
import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { anonymousClient, emailOTPClient, usernameClient } from "better-auth/client/plugins";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";

import { env } from "./env";

const rawScheme = Constants.expoConfig?.scheme;
const scheme = Array.isArray(rawScheme) ? rawScheme[0] : rawScheme;

export const authClient = createAuthClient({
  baseURL: env.convexSiteUrl,
  plugins: [
    convexClient(),
    anonymousClient(),
    usernameClient(),
    emailOTPClient(),
    expoClient({ scheme, storagePrefix: scheme ?? "better-auth", storage: SecureStore }),
  ],
});
