import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type Emp = {
  codigo: string;
  nombre?: string;
  departamento?: string;
  total_registros?: number;
  ultima_fecha?: string;
  ultimo_dispositivo?: string;
};

export default function Employees() {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Emp[]>([]);
  const [err, setErr] = useState("");

  const load = async () => {
    setErr("");
    try {
      const res = await authFetch(`/api/records/employees?q=${encodeURIComponent(q)}&limit=150`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setItems(data.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudo cargar");
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5 page-enter">
      <PageHeader kicker="Personas" title="Empleados" subtitle="Vistos en BioTimeDB · solo lectura" />
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="kpi-tile kpi-red"><span className="shine" /><p className="text-xs text-white/80">Listados</p><p className="text-3xl font-black">{items.length}</p></div>
        <div className="kpi-tile kpi-sky"><span className="shine" /><p className="text-xs text-white/80">Con depto</p><p className="text-3xl font-black">{items.filter((e) => e.departamento).length}</p></div>
        <div className="kpi-tile kpi-slate"><span className="shine" /><p className="text-xs text-white/80">Filtro</p><p className="text-lg font-black truncate">{q || "todos"}</p></div>
      </div>
      {err ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{err}</p> : null}
      <Panel>
        <form onSubmit={(e) => { e.preventDefault(); load(); }} className="flex gap-2 mb-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="w-full text-sm border rounded-xl pl-8 pr-3 py-2.5" placeholder="Código o nombre" />
          </div>
          <Btn type="submit" tone="primary">Buscar</Btn>
        </form>
        <div className="overflow-auto max-h-[560px]">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase text-zinc-500 text-left"><th className="py-2">Código</th><th>Nombre</th><th>Depto</th><th>Registros</th><th>Último reloj</th></tr></thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.codigo} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 font-mono text-xs">{e.codigo}</td>
                  <td className="font-medium">{e.nombre || "—"}</td>
                  <td>{e.departamento || "—"}</td>
                  <td>{e.total_registros ?? 0}</td>
                  <td className="text-xs text-zinc-500">{e.ultimo_dispositivo} · {e.ultima_fecha}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}