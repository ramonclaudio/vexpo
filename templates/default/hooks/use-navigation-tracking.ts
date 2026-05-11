import { useEffect, useRef } from "react";
import { usePathname, useSegments } from "expo-router";

export function useNavigationTracking() {
  const pathname = usePathname();
  const segments = useSegments();
  const prev = useRef(pathname);

  useEffect(() => {
    if (!__DEV__) return;
    if (pathname === prev.current) return;
    prev.current = pathname;
    console.log("[Nav]", pathname, segments);
  }, [pathname, segments]);
}
