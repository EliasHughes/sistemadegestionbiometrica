import { Navigate } from "react-router-dom";
import type { AppUser, ScreenKey } from "../types";
import { canAccessScreen } from "../lib/permissions";

type ProtectedRouteProps = {
  user: AppUser | null;
  screen: ScreenKey;
  children: React.ReactNode;
};

/**
 * Solo renderiza el contenido si el usuario tiene permiso para esa pantalla.
 * Si no tiene permiso → redirige al dashboard (o al primer módulo disponible).
 */
export default function ProtectedRoute({
  user,
  screen,
  children,
}: ProtectedRouteProps) {
  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (!canAccessScreen(user, screen)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}