import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Smartphone, WifiOff } from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type Item = {
  name: string;
  ip?: string;
  port?: number;
  location?: string;
  online?: boolean;
  latency_ms?: number | null;
  punches_today?: number;
  punches_total?: number;
  last_fecha?: string;
  last_entrada?: string;
  configured?: boolean;
};

export default function Devices() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [online, setOnline] = useState(0);
  const [offline, setOffline] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await authFetch("/api/records/device-health");
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || `Error ${res.status}`);
      setItems(data.items || []);
      setTotal(data.total || 0);
      setOnline(data.online || 0);
      setOffline(data.offline || 0);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "No se pudieron cargar los dispositivos");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return items;
    return items.filter((d) => `${d.name} ${d.ip} ${d.location}`.toLowerCase().includes(n));
  }, [items, q]);

  const pct = total ? Math.round((online / total) * 100) : 0;

  return (
    <div className="space-y-5 page-enter">
      <PageHeader
        kicker="Infraestructura"
        title="Dispositivos ZKTeco"
        subtitle="Ping + marcas de hoy · Device Health"
        actions={
          <Btn tone="primary" onClick={load} disabled={loading}>
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
          </Btn>
        }
      />

      {err ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{err}</p> : null}

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="kpi-tile kpi-sky"><span className="shine" /><p className="text-xs text-white/80">Inventario</p><p className="text-3xl font-black">{total}</p></div>
        <div className="kpi-tile kpi-emerald"><span className="shine" /><p className="text-xs text-white/80">Online</p><p className="text-3xl font-black">{online}</p></div>
        <div className="kpi-tile kpi-amber"><span className="shine" /><p className="text-xs text-white/80">Offline</p><p className="text-3xl font-black">{offline}</p></div>
      </div>

      <Panel>
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <div className="donut" style={{ background: `conic-gradient(#059669 0 ${pct}%, #e4e4e7 ${pct}% 100%)` }}>
            <div className="donut-hole">
              <b className="text-lg">{pct}%</b>
              <span className="text-[10px] text-zinc-500">up</span>
            </div>
          </div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filtrar por nombre, IP o ubicación"
            className="flex-1 min-w-[200px] text-sm border rounded-xl px-3 py-2.5"
          />
        </div>

        <div className="overflow-auto max-h-[520px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase text-zinc-500 text-left">
                <th className="py-2">Reloj</th>
                <th>IP</th>
                <th>Estado</th>
                <th>Hoy</th>
                <th>Última marca</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.name} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {d.online ? <Smartphone size={14} className="text-emerald-600" /> : <WifiOff size={14} className="text-zinc-400" />}
                      {d.name}
                    </span>
                    <div className="text-[11px] text-zinc-400">{d.location || "—"}</div>
                  </td>
                  <td className="text-zinc-500">{d.ip || "sin IP"}</td>
                  <td>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${d.online ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}>
                      {d.online ? `${d.latency_ms ?? "—"} ms` : "offline"}
                    </span>
                  </td>
                  <td>{d.punches_today ?? 0}</td>
                  <td className="text-xs text-zinc-500">{d.last_fecha} {d.last_entrada}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}