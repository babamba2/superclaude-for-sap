// Offline profile → SessionStart reminder, so skills branch per common/offline-mode.md
// instead of failing on the first MCP call. Returns null for online / missing profiles.
import { activeProfile } from '../hud/lib/sc4sap-status.mjs';

export function offlineReminder(directory) {
  let ap = null;
  try { ap = activeProfile(directory); } catch { return null; }
  if (!ap?.offline) return null;
  return `<system-reminder>
[SC4SAP] Active profile "${ap.alias}" is OFFLINE (SAP_CONNECTION=offline): no SAP system is connected and the SAP MCP tools are not available.
Follow common/offline-mode.md — answer from the profile identity (config.json) and the local knowledge files only, say what was not checked in the system, and stop skills that need the system with the one-line notice there.
</system-reminder>`;
}
