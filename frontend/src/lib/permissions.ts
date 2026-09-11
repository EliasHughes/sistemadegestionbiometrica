import type { AppUser, ScreenKey } from "../types";
import { APP_MODULES } from "../types";

/**
 * Verifica si el usuario tiene permiso para ver una pantalla.
 * - super_admin y admin tienen acceso total por defecto.
 * - El resto depende de lo que el admin haya marcado en screens.
 */
export function canAccessScreen(user: AppUser | null, screen: ScreenKey): boolean {
  if (!user) return false;

  const role = user.role?.toLowerCase() ?? "";
  if (role === "super_admin" || role === "admin") {
    return true;
  }

  return !!user.permissions?.screens?.[screen];
}

/**
 * Devuelve solo los módulos que el usuario puede ver.
 * Usado por el menú lateral / navegación.
 */
export function getVisibleModules(user: AppUser | null) {
  if (!user) return [];

  return APP_MODULES.filter((mod) => {
    if (!mod.requiresPermission) return true;
    return canAccessScreen(user, mod.key);
  });
}