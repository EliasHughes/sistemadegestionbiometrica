import type { AppUser } from "../../types";

type HeaderProps = {
  user: AppUser;
  title?: string;
};

export default function Header({ user, title = "Visualizador de Ponches" }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-zinc-200 flex items-center justify-between px-6">
      <div>
        <h1 className="text-sm font-bold text-zinc-900">{title}</h1>
        <p className="text-[11px] text-zinc-500">César Iglesias · Consola de Asistencia</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-xs font-semibold text-zinc-800">{user.name}</p>
          <p className="text-[10px] text-red-600 uppercase tracking-wide">{user.role}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-red-100 text-red-700 flex items-center justify-center text-xs font-bold">
          {user.name.charAt(0).toUpperCase()}
        </div>
      </div>
    </header>
  );
}