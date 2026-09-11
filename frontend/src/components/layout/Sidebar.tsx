import { NavLink } from "react-router-dom";
import type { AppUser } from "../../types";
import { getVisibleModules } from "../../lib/permissions";

type SidebarProps = {
  user: AppUser;
  onLogout: () => void;
};

export default function Sidebar({ user, onLogout }: SidebarProps) {
  const modules = getVisibleModules(user);

  return (
    <aside className="w-60 min-h-screen bg-white border-r border-zinc-200 flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-zinc-100 flex items-center gap-2">
        <img
          src="/logo-cesar-iglesias.png"
          alt="César Iglesias"
          className="h-8 w-auto"
        />
      </div>

      {/* Usuario */}
      <div className="px-4 py-3 border-b border-zinc-100">
        <p className="text-sm font-semibold text-zinc-900 truncate">{user.name}</p>
        <p className="text-[11px] text-red-600 font-medium uppercase tracking-wide">
          {user.role}
        </p>
      </div>

      {/* Navegación */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {modules.map((mod) => (
          <NavLink
            key={mod.key}
            to={mod.path}
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? "bg-red-50 text-red-700 font-semibold"
                  : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
              }`
            }
          >
            <span
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                mod.key === "remote_punch" ? "bg-emerald-500" : "bg-red-400"
              }`}
            />
            {mod.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-3 border-t border-zinc-100">
        <button
          onClick={onLogout}
          className="w-full text-left px-3 py-2 text-sm text-zinc-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );
}