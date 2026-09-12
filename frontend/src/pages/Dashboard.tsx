import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Download,
  RefreshCw,
  Shield,
  Smartphone,
  Users,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type Summary = {
  total_hoy: number;
  con_entrada: number;
  con_salida: number;
  empleados_hoy: number;
  dispositivos_hoy: number;
};
type Stats = {
  by_device: { name: string; total: number }[];
  by_day: { dia: string; total: number }[];
  by_hour: { hora: number; total: number }[];
  activity: { timestamp: string; actor: string; action: string; target: string }[];
};
type Overview = {
  today: { total: number; empleados: number; relojes: number; sin_salida: number };
  yesterday: { total: number; empleados: number };
  open_shifts: { codigo: string; nombre?: string; dispositivo_origen?: string; entrada?: string }[];
  by_dept: { depto: string; total: number }[];
};
type HealthItem = {
  name: string;
  online?: boolean;
  latency_ms?: number | null;
  punches_today?: number;
};
type PunchRow = {
  id: number;
  codigo: string;
  nombre: string | null;
  entrada: string | null;
  dispositivo_origen: string | null;
};

function delta(now: number, prev: number) {
  if (!prev) return "sin base ayer";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% vs ayer`;
}

export default function Dashboard() {
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<PunchRow[]>([]);
  const [health, setHealth] = useState<{ total: number; online: number; offline: number; items: HealthItem[] } | null>(null);
  const [syncItems, setSyncItems] = useState<{ fecha?: string; evento?: string; estado?: string }[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setErr("");
    try {
      const [s, st, r, o, h, sy] = await Promise.all([
        authFetch("/api/records/summary"),
        authFetch("/api/records/stats"),
        authFetch("/api/records/recent?limit=8"),
        authFetch("/api/records/ops-overview"),
        authFetch("/api/records/device-health"),
        authFetch("/api/records/sync-history?limit=8"),
      ]);
      if (s.ok) setSummary(await s.json());
      if (st.ok) setStats(await st.json());
      if (r.ok) setRecent((await r.json()).items || []);
      if (o.ok) setOverview(await o.json());
      if (h.ok) setHealth(await h.json());
      if (sy.ok) setSyncItems((await sy.json()).items || []);
    } catch {
      setErr("No se pudo refrescar el tablero");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
  }, []);

  const presentes = overview?.today.empleados ?? summary?.empleados_hoy ?? 0;
  const ponches = overview?.today.total ?? summary?.total_hoy ?? 0;
  const abiertos = overview?.today.sin_salida ?? 0;
  const offline = health?.offline ?? 0;
  const online = health?.online ?? 0;
  const totalDev = Math.max(1, health?.total ?? 1);
  const onlinePct = Math.round((online / totalDev) * 100);

  const status = useMemo(() => {
    if (offline >= 8 || abiertos > 80) return { label: "Crítico", cls: "bg-rose-600", pct: 48 };
    if (offline >= 3 || abiertos > 20) return { label: "Atención", cls: "bg-amber-500", pct: 70 };
    return { label: "Normal", cls: "bg-emerald-600", pct: 92 };
  }, [offline, abiertos]);

  const peakHour = useMemo(() => {
    const rows = stats?.by_hour || [];
    if (!rows.length) return "—";
    const top = [...rows].sort((a, b) => b.total - a.total)[0];
    return `${String(top.hora).padStart(2, "0")}:00`;
  }, [stats]);

  const healthScore = useMemo(() => {
    const zk = health ? onlinePct : 50;
    const db = summary ? 100 : 40;
    const syncOk = syncItems[0]?.estado === "ok" ? 100 : 72;
    const att = abiertos > 100 ? 55 : 88;
    return Math.round(zk * 0.35 + db * 0.2 + syncOk * 0.2 + att * 0.25);
  }, [health, summary, syncItems, abiertos, onlinePct]);

  const maxDay = Math.max(1, ...(stats?.by_day || []).map((d) => d.total));
  const maxHour = Math.max(1, ...(stats?.by_hour || []).map((d) => d.total));
  const maxDept = Math.max(1, ...(overview?.by_dept || []).map((d) => d.total));

  const kpis = [
    { label: "Colaboradores hoy", value: presentes, hint: delta(presentes, overview?.yesterday.empleados || 0), to: "/collaborators", cls: "kpi-red", icon: Users },
    { label: "Con entrada", value: summary?.con_entrada ?? ponches, hint: `${summary?.con_salida ?? 0} ya salieron`, to: "/records", cls: "kpi-emerald", icon: CheckCircle2 },
    { label: "Turnos abiertos", value: abiertos, hint: "Entrada sin salida", to: "/records", cls: "kpi-amber", icon: Clock3 },
    { label: "Relojes online", value: online, hint: `${offline} offline`, to: "/devices", cls: "kpi-sky", icon: Smartphone },
    { label: "Ponches hoy", value: ponches, hint: delta(ponches, overview?.yesterday.total || 0), to: "/records", cls: "kpi-violet", icon: Activity },
    { label: "Pico horario", value: peakHour, hint: "Mayor tráfico", to: "/records", cls: "kpi-slate", icon: Clock3 },
  ];

  return (
    <div className="space-y-5 page-enter">
      <PageHeader
        kicker="Centro de control"
        title="Dashboard operativo"
        subtitle="Asistencia · relojes · sync · actividad"
        actions={
          <>
            <Btn tone="ghost" onClick={() => nav("/export")}><Download size={16} /> Exportar</Btn>
            <Btn tone="primary" onClick={load} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualizar
            </Btn>
          </>
        }
      />

      {err ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{err}</p> : null}

      <div className="flex items-center gap-3">
        <span className={`text-white text-xs font-bold px-3 py-1 rounded-full ${status.cls}`}>{status.label}</span>
        <div className="flex-1 h-2.5 rounded-full bg-zinc-200 overflow-hidden">
          <div className={`h-full ${status.cls} transition-all duration-700`} style={{ width: `${status.pct}%` }} />
        </div>
        <span className="text-xs text-zinc-500">operación {status.pct}%</span>
      </div>

      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {kpis.map((k) => (
          <button key={k.label} type="button" onClick={() => nav(k.to)} className={`kpi-tile btn-modern ${k.cls}`}>
            <span className="shine" />
            <div className="flex items-center justify-between text-white/80">
              <span className="text-[11px] uppercase tracking-wide font-semibold">{k.label}</span>
              <k.icon size={18} />
            </div>
            <p className="text-3xl font-black mt-2">{k.value}</p>
            <p className="text-xs text-white/80 mt-1">{k.hint}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-2">
          <h3 className="font-bold text-sm mb-3 flex items-center gap-2">
            <AlertTriangle size={16} className="text-[#c8102e]" /> Alertas
          </h3>
          <div className="space-y-2">
            {offline ? (
              <button type="button" onClick={() => nav("/devices")} className="w-full text-left rounded-xl px-3 py-2 bg-rose-50 text-rose-800 text-sm">
                {offline} relojes sin ping
              </button>
            ) : null}
            {abiertos ? (
              <button type="button" onClick={() => nav("/records")} className="w-full text-left rounded-xl px-3 py-2 bg-amber-50 text-amber-900 text-sm">
                {abiertos} turnos abiertos
              </button>
            ) : null}
            {!offline && !abiertos ? <p className="text-sm text-emerald-700">Sin alertas prioritarias</p> : null}
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <h3 className="font-bold text-sm mb-3">Tendencia de ponches</h3>
          <div className="flex items-end gap-1.5 h-36">
            {(stats?.by_day || []).map((d) => (
              <div key={d.dia} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <span className="text-[10px] text-zinc-500">{d.total}</span>
                <div
                  className="w-full rounded-t-lg bg-gradient-to-t from-[#9f1239] to-[#fb7185]"
                  style={{ height: `${Math.max(10, (d.total / maxDay) * 100)}%` }}
                  title={`${d.dia}: ${d.total}`}
                />
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Panel>
          <h3 className="font-bold text-sm mb-3">Disponibilidad ZK</h3>
          <div className="flex items-center gap-4">
            <div
              className="donut"
              style={{ background: `conic-gradient(#059669 0 ${onlinePct}%, #e4e4e7 ${onlinePct}% 100%)` }}
            >
              <div className="donut-hole">
                <b className="text-lg">{onlinePct}%</b>
                <span className="text-[10px] text-zinc-500">online</span>
              </div>
            </div>
            <div className="text-sm space-y-1">
              <p className="text-emerald-700 font-semibold">{online} en línea</p>
              <p className="text-zinc-500">{offline} offline</p>
              <p className="text-zinc-500">{health?.total ?? 0} inventariados</p>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="font-bold text-sm mb-3">Tráfico por hora</h3>
          <div className="flex items-end gap-[3px] h-28">
            {Array.from({ length: 24 }, (_, h) => {
              const t = stats?.by_hour?.find((x) => x.hora === h)?.total || 0;
              return (
                <div
                  key={h}
                  className="flex-1 rounded-t bg-gradient-to-t from-sky-700 to-sky-400"
                  style={{ height: `${Math.max(4, (t / maxHour) * 100)}%` }}
                  title={`${h}:00 · ${t}`}
                />
              );
            })}
          </div>
        </Panel>

        <Panel>
          <h3 className="font-bold text-sm mb-3">Departamentos</h3>
          <ul className="space-y-2">
            {(overview?.by_dept || []).slice(0, 6).map((d) => (
              <li key={d.depto}>
                <div className="flex justify-between text-xs mb-1">
                  <span className="truncate">{d.depto || "Sin depto"}</span>
                  <span className="font-semibold">{d.total}</span>
                </div>
                <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: `${(d.total / maxDept) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel>
          <div className="flex justify-between mb-3">
            <h3 className="font-bold text-sm">Relojes</h3>
            <button type="button" className="text-xs text-[#c8102e] font-semibold" onClick={() => nav("/devices")}>Ver</button>
          </div>
          <ul className="space-y-1 max-h-52 overflow-auto">
            {(health?.items || []).slice(0, 10).map((d) => (
              <li key={d.name} className="flex justify-between text-sm py-1 border-b border-zinc-50">
                <span className="truncate pr-2">{d.name}</span>
                <span className={d.online ? "text-emerald-600 text-xs font-semibold" : "text-zinc-400 text-xs"}>
                  {d.online ? `${d.latency_ms ?? "—"} ms` : "offline"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h3 className="font-bold text-sm mb-3">Actividad reciente</h3>
          <ul className="space-y-2">
            {recent.map((p) => (
              <li key={p.id} className="text-sm flex justify-between gap-2">
                <span className="truncate font-medium">{p.nombre || p.codigo}</span>
                <span className="text-xs text-zinc-500">{p.entrada}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <footer className="flex flex-wrap items-center justify-between text-xs text-zinc-500">
        <span className="inline-flex items-center gap-2">
          <Shield size={14} /> Health Score <b className="text-zinc-800 text-sm">{healthScore}</b>/100
        </span>
        <span>Rojo / verde / ámbar / azul = clic a módulo</span>
      </footer>
    </div>
  );
}