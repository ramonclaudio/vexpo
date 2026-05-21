import { reloadAppAsync as _reloadAppAsync } from "expo";

export { executionEnvironment } from "./device";

/**
 * Force-reload the app using the current JS bundle.
 *
 * Unlike `Updates.reloadAsync()`, this does NOT fetch or apply a new update.
 * It simply restarts the JS runtime with the same bundle.
 *
 * Use for: auth state corruption, unrecoverable cache errors, language changes
 * that require a full restart, or a manual "restart app" button in settings.
 */
export const reloadApp = _reloadAppAsync;
