/** Usuario autenticado de la aplicación */
export type AppUser = {
  username: string;
  name: string;
  role: string;
  permissions: {
    screens: Record<string, boolean>;
    operations?: string[];
  };
  operations?: string[];
};

/** Claves de pantallas/módulos que el admin puede otorgar o quitar */
export type ScreenKey =
  | "dashboard"
  | "records"
  | "db_records"
  | "remote_punch"
  | "devices"
  | "employees"
  | "collaborators"
  | "schedules"
  | "biometric_inventory"
  | "bulk_ops"
  | "reports"
  | "data_export"
  | "sync_history"
  | "users"
  | "settings"
  | "advanced_reports";

export type OperationKey =
  | "users.read"
  | "users.write"
  | "users.delete"
  | "roles.read"
  | "roles.write"
  | "attendance.read"
  | "reports.export"
  | "payroll.run"
  | "remote_punch"
  | "schema.admin"
  | "settings.write"
  | "collaborators.read"
  | "collaborators.write"
  | "collaborators.sync"
  | "schedules.read"
  | "schedules.write"
  | "inventory.read"
  | "inventory.write"
  | "bulk.execute"
  | "devices.read"
  | "devices.write"
  | "devices.delete"
  | "zk.read"
  | "zk.clone"
  | "zk.move"
  | "zk.enroll"
  | "zk.delete"
  | "zk.push"
  | "zk.sync";

/** Definición de cada módulo (para el menú y control de acceso) */
export type ModuleDef = {
  key: ScreenKey;
  label: string;
  path: string;
  /** Solo se muestra si el usuario tiene el permiso en screens */
  requiresPermission: boolean;
};

/** Lista oficial de módulos de la aplicación */
export const APP_MODULES: ModuleDef[] = [
  { key: "dashboard", label: "Dashboard", path: "/dashboard", requiresPermission: true },
  { key: "records", label: "Ponches", path: "/records", requiresPermission: true },
  { key: "db_records", label: "Historial SQL", path: "/db-records", requiresPermission: true },
  { key: "remote_punch", label: "Ponche Remoto", path: "/remote-punch", requiresPermission: true },
  { key: "devices", label: "Dispositivos", path: "/devices", requiresPermission: true },
  { key: "employees", label: "Empleados", path: "/employees", requiresPermission: true },
  { key: "collaborators", label: "Colaboradores", path: "/collaborators", requiresPermission: true },
  { key: "schedules", label: "Horarios", path: "/schedules", requiresPermission: true },
  { key: "biometric_inventory", label: "Inventario Biométrico", path: "/biometric", requiresPermission: true },
  { key: "bulk_ops", label: "Operaciones Masivas", path: "/bulk", requiresPermission: true },
  { key: "reports", label: "Reportes", path: "/reports", requiresPermission: true },
  { key: "data_export", label: "Exportar Datos", path: "/export", requiresPermission: true },
  { key: "sync_history", label: "Historial Sync", path: "/sync-history", requiresPermission: true },
  { key: "users", label: "Usuarios", path: "/users", requiresPermission: true },
  { key: "settings", label: "Configuración", path: "/settings", requiresPermission: true },
  { key: "advanced_reports", label: "Reportes Avanzados", path: "/advanced-reports", requiresPermission: true },
];