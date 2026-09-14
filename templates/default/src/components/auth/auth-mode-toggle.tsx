import { router } from "expo-router";

import { SegmentedToggle } from "@/components/ui/segmented-toggle";

export function AuthModeToggle({ current }: { current: "sign-in" | "sign-up" }) {
  return (
    <SegmentedToggle
      accessibilityLabel="Sign in or sign up"
      value={current}
      options={[
        { value: "sign-in", label: "Sign in" },
        { value: "sign-up", label: "Sign up" },
      ]}
      onChange={(value) => {
        if (value === current) return;
        router.replace(value === "sign-up" ? "/auth/sign-up" : "/auth/sign-in");
      }}
    />
  );
}
