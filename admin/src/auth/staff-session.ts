import type { StaffRole } from "@/auth/roles";

/** Staff are signed out after 30 minutes without activity. */
export const STAFF_IDLE_TIMEOUT_MS = 30 * 60 * 1000;
/** …and after 12 hours regardless (absolute session lifetime). */
export const STAFF_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;
/** Wrong 2FA codes allowed per session before it is destroyed. */
export const STAFF_MFA_MAX_ATTEMPTS = 5;
/** Don't write lastActiveAt more often than this. */
export const STAFF_ACTIVITY_WRITE_INTERVAL_MS = 60 * 1000;

export type StaffSessionRecord = {
  sessionToken: string;
  expires: Date;
  createdAt: Date;
  lastActiveAt: Date;
  mfaVerifiedAt: Date | null;
  mfaMethod: "passkey" | "totp" | null;
  mfaFailedAttempts: number;
  staff: {
    id: string;
    email: string;
    name: string;
    role: StaffRole;
    isActive: boolean;
    hasTotp: boolean;
    passkeyCount: number;
  };
};

export type StaffSessionStatus =
  | "active" // signed in with both factors
  | "mfa_required" // first factor done; must enter TOTP or use a passkey
  | "mfa_setup_required" // first factor done; no second factor enrolled yet
  | "missing"
  | "expired"
  | "idle"
  | "inactive" // account deactivated
  | "locked"; // too many wrong 2FA codes

/** Decides what a staff session may do. Pure, so it is easy to test. */
export function evaluateStaffSession(
  record: StaffSessionRecord | null,
  now: Date = new Date(),
): StaffSessionStatus {
  if (!record) return "missing";
  if (record.expires.getTime() <= now.getTime()) return "expired";
  if (!record.staff.isActive) return "inactive";
  if (now.getTime() - record.lastActiveAt.getTime() > STAFF_IDLE_TIMEOUT_MS) return "idle";
  if (record.mfaFailedAttempts >= STAFF_MFA_MAX_ATTEMPTS) return "locked";
  if (!record.mfaVerifiedAt) {
    return record.staff.hasTotp || record.staff.passkeyCount > 0
      ? "mfa_required"
      : "mfa_setup_required";
  }
  return "active";
}

/** Statuses where the session is dead and must be deleted. */
export function isTerminalStatus(status: StaffSessionStatus): boolean {
  return status === "expired" || status === "idle" || status === "inactive" || status === "locked";
}

export function shouldRecordActivity(record: StaffSessionRecord, now: Date = new Date()): boolean {
  return now.getTime() - record.lastActiveAt.getTime() >= STAFF_ACTIVITY_WRITE_INTERVAL_MS;
}
