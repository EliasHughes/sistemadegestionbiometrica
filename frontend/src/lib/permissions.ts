import type { AppUser, OperationKey, ScreenKey } from "../types";
import { APP_MODULES } from "../types";

const ADMIN_ROLES = new Set(["super_admin", "admin"]);

export function canAccessScreen(user: AppUser | null, screen: ScreenKey): boolean {
  if (!user) return false;

  const role = user.role?.toLowerCase() ?? "";
  if (ADMIN_ROLES.has(role)) {
    return true;
  }

  return !!user.permissions?.screens?.[screen];
}

export function canPerform(user: AppUser | null, operation: OperationKey): boolean {
  if (!user) return false;

  const role = user.role?.toLowerCase() ?? "";
  if (ADMIN_ROLES.has(role)) {
    return true;
  }

  const ops = user.permissions?.operations ?? user.operations ?? [];
  return ops.includes(operation);
}

export function getVisibleModules(user: AppUser | null) {
  if (!user) return [];

  return APP_MODULES.filter((mod) => {
    if (!mod.requiresPermission) return true;
    return canAccessScreen(user, mod.key);
  });
}