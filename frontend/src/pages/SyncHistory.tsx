import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type Row = { id?: number; fecha?: string; evento?: string; detalle?: string; registros?: number; estado?: string };

export default function SyncHistory() {
  const [items, setItems] = useState<Row[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await authFetch("/api/records/sync-history?limit=150");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setItems(data.items || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se cargó el historial");
    } finally {
      setLoading(false);
    }
  };

  const runNow = async () => {
    setLoading(true);
    try {
      const res = await authFetch("/api/records/sync-now", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sync falló");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const ok = items.filter((i) => i.estado === "ok").length;

  return (
    <div className="space-y-5 page-enter">
      <PageHeader kicker="Operación" title="Historial Sync" subtitle="Bitácora de lecturas y empujes"
        actions={<><Btn tone="ghost" onClick={load}><RefreshCw size={16} /></Btn><Btn tone="primary" onClick={runNow} disabled={loading}>Sync ahora</Btn></>} />
      <div className="grid sm:grid-cols-3 gap-3">
        <div className="kpi-tile kpi-violet"><span className="shine" /><p className="text-xs text-white/80">Eventos</p><p className="text-3xl font-black">{items.length}</p></div>
        <div className="kpi-tile kpi-emerald"><span className="shine" /><p className="text-xs text-white/80">OK</p><p className="text-3xl font-black">{ok}</p></div>
        <div className="kpi-tile kpi-amber"><span className="shine" /><p className="text-xs text-white/80">Otros</p><p className="text-3xl font-black">{items.length - ok}</p></div>
      </div>
      {err ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{err}</p> : null}
      <Panel>
        <div className="overflow-auto max-h-[560px]">
          <table className="w-full text-sm">
            <thead><tr className="text-[11px] uppercase text-zinc-500 text-left"><th className="py-2">Fecha</th><th>Evento</th><th>Detalle</th><th>Regs</th><th>Estado</th></tr></thead>
            <tbody>
              {items.map((r, i) => (
                <tr key={r.id ?? i} className="border-t border-zinc-100">
                  <td className="py-2 text-xs">{r.fecha}</td>
                  <td>{r.evento}</td>
                  <td className="text-xs text-zinc-500 max-w-[280px] truncate">{r.detalle}</td>
                  <td>{r.registros ?? 0}</td>
                  <td className={r.estado === "ok" ? "text-emerald-600 font-semibold" : "text-rose-600"}>{r.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}