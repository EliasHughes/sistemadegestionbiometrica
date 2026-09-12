import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Download,
  Filter,
  Pause,
  Play,
  RefreshCw,
  Radio,
  Search,
  Shield,
  Smartphone,
  Users,
  WifiOff,
  TrendingUp,
} from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

type Summary = {
  total_hoy: number;
  con_entrada: number;
  con_salida: number;
  empleados_hoy: number;
  dispositivos_hoy: number;
  database?: { status?: string; detail?: string };
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
  open_shifts: {
    codigo: string;
    nombre?: string;
    dispositivo_origen?: string;
    entrada?: string;
  }[];
  by_dept: { depto: string; total: number }[];
  sql_online?: boolean;
  error?: string;
};

type HealthItem = {
  name: string;
  online?: boolean;
  latency_ms?: number | null;
  punches_today?: number;
};

type Health = {
  total: number;
  online: number;
  offline: number;
  items: HealthItem[];
};

type PunchRow = {
  id: number;
  codigo: string;
  nombre: string | null;
  departamento?: string | null;
  entrada: string | null;
  salida?: string | null;
  dispositivo_origen: string | null;
};

type Combined = {
  summary?: Summary;
  overview?: Overview;
  stats?: Stats;
  recent?: PunchRow[];
  timestamp?: string;
};

function delta(now: number, prev: number) {
  if (!prev) return "Sin referencia ayer";
  const pct = Math.round(((now - prev) / prev) * 100);
  return `${pct > 0 ? "+" : ""}${pct}% vs ayer`;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, value));
}

export default function Dashboard() {
  const nav = useNavigate();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<PunchRow[]>([]);
  const [health, setHealth] = useState<Health | null>(null);

  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      /*
       * The combined endpoint is useful, but the current backend implementation
       * references helper functions that are not defined in records_query.py.
       * We therefore keep a resilient client-side fallback and always obtain
       * device health from its dedicated endpoint.
       */
      const combinedRes = await authFetch("/api/records/dashboard-combined");

      if (combinedRes.ok) {
        const data: Combined = await combinedRes.json();
        setSummary(data.summary || null);
        setOverview(data.overview || null);
        setStats(data.stats || null);
        setRecent(data.recent || []);
        setLastUpdated(data.timestamp || new Date().toLocaleTimeString());
      } else {
        const [s, st, r, o] = await Promise.all([
          authFetch("/api/records/summary"),
          authFetch("/api/records/stats"),
          authFetch("/api/records/recent?limit=10"),
          authFetch("/api/records/ops-overview"),
        ]);

        if (s.ok) setSummary(await s.json());
        if (st.ok) setStats(await st.json());
        if (r.ok) setRecent((await r.json()).items || []);
        if (o.ok) setOverview(await o.json());

        setLastUpdated(new Date().toLocaleTimeString());
      }

      const h = await authFetch("/api/records/device-health");
      if (h.ok) {
        setHealth(await h.json());
      }
    } catch {
      setErr("No fue posible actualizar el Centro de Control.");
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
    if (!autoRefresh) return;

    const interval = window.setInterval(loadDashboardData, 30000);
    return () => window.clearInterval(interval);
  }, [loadDashboardData, autoRefresh]);

  const presentes = overview?.today.empleados ?? summary?.empleados_hoy ?? 0;
  const ponches = overview?.today.total ?? summary?.total_hoy ?? 0;
  const abiertos = overview?.today.sin_salida ?? 0;
  const online = health?.online ?? 0;
  const offline = health?.offline ?? 0;
  const totalDev = health?.total ?? 0;
  const onlinePct = totalDev > 0 ? Math.round((online / totalDev) * 100) : 0;

  const status = useMemo(() => {
    const employeeBase = Math.max(presentes, 1);
    const openRatio = abiertos / employeeBase;

    if (offline > 0 && offline >= Math.max(3, Math.ceil(totalDev * 0.25))) {
      return {
        label: "Crítico",
        description: "Hay una degradación importante en la red biométrica.",
        pct: 45,
        cls: "bg-rose-600 text-white",
      };
    }

    if (offline > 0 || openRatio > 0.35) {
      return {
        label: "Atención",
        description: "Existen incidencias que conviene revisar.",
        pct: 72,
        cls: "bg-amber-500 text-white",
      };
    }

    return {
      label: "Normal",
      description: "La operación se encuentra estable.",
      pct: 96,
      cls: "bg-emerald-600 text-white",
    };
  }, [offline, abiertos, presentes, totalDev]);

  const healthScore = useMemo(() => {
    const deviceScore = totalDev ? onlinePct : 50;
    const dbScore = summary?.database?.status === "online" || summary ? 100 : 40;
    const attendanceScore = presentes > 0
      ? clamp(100 - Math.min(60, (abiertos / presentes) * 100))
      : 80;

    return Math.round(deviceScore * 0.45 + dbScore * 0.30 + attendanceScore * 0.25);
  }, [onlinePct, totalDev, summary, presentes, abiertos]);

  const peakHour = useMemo(() => {
    const rows = stats?.by_hour || [];
    if (!rows.length) return "—";
    const top = [...rows].sort((a, b) => b.total - a.total)[0];
    return `${String(top.hora).padStart(2, "0")}:00`;
  }, [stats]);

  const maxDay = useMemo(
    () => Math.max(1, ...(stats?.by_day || []).map((d) => d.total)),
    [stats]
  );

  const maxHour = useMemo(
    () => Math.max(1, ...(stats?.by_hour || []).map((d) => d.total)),
    [stats]
  );

  const maxDept = useMemo(
    () => Math.max(1, ...(overview?.by_dept || []).map((d) => d.total)),
    [overview]
  );

  const filteredRecent = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return recent;

    return recent.filter((p) =>
      [p.nombre, p.codigo, p.dispositivo_origen, p.departamento]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [recent, searchTerm]);

  const alerts = useMemo(() => {
    const items: { tone: "rose" | "amber" | "sky"; label: string; to: string }[] = [];

    if (offline > 0) {
      items.push({
        tone: "rose",
        label: `${offline} reloj${offline === 1 ? "" : "es"} fuera de línea`,
        to: "/devices",
      });
    }

    if (abiertos > 0) {
      items.push({
        tone: "amber",
        label: `${abiertos} turno${abiertos === 1 ? "" : "s"} abierto${abiertos === 1 ? "" : "s"}`,
        to: "/records",
      });
    }

    if (overview?.error) {
      items.push({
        tone: "sky",
        label: "El backend reportó una incidencia operativa",
        to: "/records",
      });
    }

    return items;
  }, [offline, abiertos, overview?.error]);

  if (initialLoading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3">
        <RefreshCw size={32} className="animate-spin text-zinc-400" />
        <p className="text-sm font-medium text-zinc-500">
          Cargando Centro de Control Operativo...
        </p>
      </div>
    );
  }

  return (
    <div className="relative space-y-5 page-enter overflow-hidden">
      {/* Mascota opcional: si el asset no existe, desaparece sin afectar el Dashboard. */}
      <div className="fiorella-dashboard-mascot" aria-hidden="true">
        <img
          src="/fiorella/fiorella.png"
          alt=""
          onError={(e) => {
            e.currentTarget.parentElement?.remove();
          }}
        />
        <span className="fiorella-bubble">Todo bajo control.</span>
      </div>

      <style>{`
        .fiorella-dashboard-mascot {
          position: absolute;
          right: 14px;
          top: 74px;
          z-index: 5;
          pointer-events: none;
          animation: fiorellaFloat 3.8s ease-in-out infinite;
        }
        .fiorella-dashboard-mascot img {
          width: 74px;
          height: 74px;
          object-fit: contain;
          filter: drop-shadow(0 8px 12px rgba(0,0,0,.12));
        }
        .fiorella-bubble {
          position: absolute;
          right: 52px;
          top: -8px;
          width: max-content;
          max-width: 150px;
          padding: 6px 9px;
          border-radius: 10px 10px 2px 10px;
          background: white;
          border: 1px solid #e4e4e7;
          box-shadow: 0 6px 18px rgba(0,0,0,.08);
          font-size: 10px;
          color: #3f3f46;
          white-space: nowrap;
        }
        @keyframes fiorellaFloat {
          0%, 100% { transform: translate3d(0,0,0) rotate(-1deg); }
          50% { transform: translate3d(-5px,-7px,0) rotate(1deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .fiorella-dashboard-mascot { animation: none; }
        }
        @media (max-width: 900px) {
          .fiorella-dashboard-mascot { display: none; }
        }
      `}</style>

      <PageHeader
        kicker="Centro de control operativo"
        title="Dashboard General"
        subtitle={`Última actualización: ${lastUpdated || "—"}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAutoRefresh((value) => !value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 border transition-colors ${
                autoRefresh
                  ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                  : "bg-zinc-100 border-zinc-200 text-zinc-600"
              }`}
              title="Actualizar automáticamente cada 30 segundos"
            >
              {autoRefresh ? (
                <Radio size={14} className="animate-pulse" />
              ) : (
                <Pause size={14} />
              )}
              {autoRefresh ? "En vivo" : "Pausado"}
            </button>

            <Btn tone="ghost" onClick={() => nav("/export")}>
              <Download size={16} /> Exportar
            </Btn>

            <Btn tone="primary" onClick={loadDashboardData} disabled={loading}>
              <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
              Actualizar
            </Btn>
          </div>
        }
      />

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 flex items-center gap-2">
          <AlertTriangle size={16} />
          {err}
        </div>
      )}

      {/* Estado global */}
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-[180px]">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${status.cls}`}>
                {status.label}
              </span>
              <span className="text-xs font-semibold text-zinc-700">
                Estado operativo
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 mt-1">{status.description}</p>
          </div>

          <div className="flex-1">
            <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-zinc-400 mb-1">
              <span>Salud operacional</span>
              <span>{healthScore}/100</span>
            </div>
            <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${
                  healthScore >= 85
                    ? "bg-emerald-500"
                    : healthScore >= 70
                    ? "bg-amber-500"
                    : "bg-rose-500"
                }`}
                style={{ width: `${healthScore}%` }}
              />
            </div>
          </div>

          <div className="text-right text-xs text-zinc-500">
            <span className="font-semibold text-zinc-800">{onlinePct}%</span> de relojes online
          </div>
        </div>
      </section>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {[
          {
            label: "Colaboradores hoy",
            value: presentes,
            hint: delta(presentes, overview?.yesterday.empleados || 0),
            to: "/collaborators",
            cls: "kpi-red",
            icon: Users,
          },
          {
            label: "Ponches hoy",
            value: ponches,
            hint: delta(ponches, overview?.yesterday.total || 0),
            to: "/records",
            cls: "kpi-violet",
            icon: Activity,
          },
          {
            label: "Turnos abiertos",
            value: abiertos,
            hint: "Entrada sin salida",
            to: "/records",
            cls: "kpi-amber",
            icon: Clock3,
          },
          {
            label: "Relojes online",
            value: online,
            hint: `${offline} fuera de línea`,
            to: "/devices",
            cls: "kpi-sky",
            icon: Smartphone,
          },
        ].map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => nav(k.to)}
            className={`kpi-tile btn-modern ${k.cls} text-left group`}
          >
            <span className="shine" />
            <div className="flex items-center justify-between text-white/80">
              <span className="text-[11px] uppercase tracking-wider font-bold">
                {k.label}
              </span>
              <k.icon size={18} className="group-hover:scale-110 transition-transform" />
            </div>
            <p className="text-3xl font-black mt-2 tracking-tight">{k.value}</p>
            <div className="flex items-center justify-between mt-1 text-xs text-white/80">
              <span>{k.hint}</span>
              <ArrowUpRight
                size={14}
                className="opacity-0 group-hover:opacity-100 transition-opacity"
              />
            </div>
          </button>
        ))}
      </div>

      {/* Alertas + tendencia */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Panel className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm text-zinc-800 flex items-center gap-2">
              <AlertTriangle size={16} className="text-rose-600" />
              Atención operativa
            </h3>
            <span className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
              {alerts.length} alertas
            </span>
          </div>

          <div className="space-y-2">
            {alerts.length ? (
              alerts.map((item, index) => (
                <button
                  key={`${item.label}-${index}`}
                  type="button"
                  onClick={() => nav(item.to)}
                  className={`w-full text-left rounded-xl px-3.5 py-2.5 border text-sm flex items-center justify-between transition-colors ${
                    item.tone === "rose"
                      ? "bg-rose-50 border-rose-100 hover:bg-rose-100 text-rose-900"
                      : item.tone === "amber"
                      ? "bg-amber-50 border-amber-100 hover:bg-amber-100 text-amber-900"
                      : "bg-sky-50 border-sky-100 hover:bg-sky-100 text-sky-900"
                  }`}
                >
                  <span className="font-medium">{item.label}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))
            ) : (
              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm flex items-center gap-2">
                <CheckCircle2 size={18} />
                <span>No hay incidencias operativas pendientes.</span>
              </div>
            )}
          </div>

          <div className="mt-4 pt-3 border-t border-zinc-100 flex justify-between items-center">
            <span className="text-xs text-zinc-500">
              Health Score <b className="text-zinc-800">{healthScore}/100</b>
            </span>
            <Shield size={15} className="text-zinc-400" />
          </div>
        </Panel>

        <Panel className="lg:col-span-3">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-800">
                Tendencia de ponches
              </h3>
              <p className="text-[11px] text-zinc-400">Últimos 14 días</p>
            </div>
            <div className="flex items-center gap-1 text-xs text-zinc-400">
              <TrendingUp size={13} />
              <span>Volumen diario</span>
            </div>
          </div>

          <div className="flex items-end gap-2 h-40 pt-4">
            {(stats?.by_day || []).map((d) => (
              <button
                type="button"
                key={d.dia}
                className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end group"
                onClick={() => nav("/records")}
                title={`${d.dia}: ${d.total} ponches`}
              >
                <span className="text-[10px] text-zinc-500 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  {d.total}
                </span>
                <div
                  className="w-full rounded-t-md bg-gradient-to-t from-rose-700 to-rose-400 group-hover:from-rose-600 group-hover:to-rose-300 transition-all"
                  style={{
                    height: `${Math.max(12, (d.total / maxDay) * 100)}%`,
                  }}
                />
                <span className="text-[10px] text-zinc-400 font-medium truncate max-w-full">
                  {d.dia.split("-").slice(1).join("/")}
                </span>
              </button>
            ))}
          </div>
        </Panel>
      </div>

      {/* Salud biométrica + horas + departamentos */}
      <div className="grid lg:grid-cols-3 gap-4">
        <Panel>
          <h3 className="font-bold text-sm mb-3 text-zinc-800">
            Salud de relojes
          </h3>
          <div className="flex items-center gap-4">
            <div
              className="donut shrink-0"
              style={{
                background: `conic-gradient(#059669 0 ${onlinePct}%, #e4e4e7 ${onlinePct}% 100%)`,
              }}
            >
              <div className="donut-hole">
                <b className="text-xl text-zinc-800">{onlinePct}%</b>
                <span className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                  Online
                </span>
              </div>
            </div>

            <div className="text-xs space-y-2">
              <p className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                {online} en línea
              </p>
              <p className="text-rose-600 font-semibold flex items-center gap-1.5">
                <WifiOff size={12} />
                {offline} fuera de línea
              </p>
              <p className="text-zinc-500 text-[11px] pt-1 border-t border-zinc-100">
                Total: {totalDev}
              </p>
            </div>
          </div>
        </Panel>

        <Panel>
          <h3 className="font-bold text-sm mb-3 text-zinc-800">
            Tráfico por hora
          </h3>
          <div className="flex items-end gap-[2px] h-28 pt-2">
            {Array.from({ length: 24 }, (_, h) => {
              const total =
                stats?.by_hour?.find((x) => x.hora === h)?.total || 0;

              return (
                <div
                  key={h}
                  className="flex-1 rounded-t bg-gradient-to-t from-sky-600 to-sky-400 hover:from-sky-500 hover:to-sky-300 transition-colors cursor-pointer"
                  style={{
                    height: `${Math.max(6, (total / maxHour) * 100)}%`,
                  }}
                  title={`${String(h).padStart(2, "0")}:00 — ${total} ponches`}
                />
              );
            })}
          </div>
          <div className="flex justify-between text-[10px] text-zinc-400 mt-2 font-mono">
            <span>00:00</span>
            <span>12:00</span>
            <span>23:00</span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-2">
            Hora pico detectada: <b className="text-zinc-800">{peakHour}</b>
          </p>
        </Panel>

        <Panel>
          <h3 className="font-bold text-sm mb-3 text-zinc-800">
            Distribución por departamento
          </h3>
          <ul className="space-y-2.5">
            {(overview?.by_dept || []).slice(0, 6).map((d) => (
              <li key={d.depto}>
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="truncate text-zinc-700">{d.depto}</span>
                  <span className="font-bold text-zinc-900">{d.total}</span>
                </div>
                <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-violet-600 rounded-full transition-all duration-500"
                    style={{ width: `${(d.total / maxDept) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {/* Relojes + turnos abiertos + actividad */}
      <div className="grid xl:grid-cols-3 gap-4">
        <Panel>
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-bold text-sm text-zinc-800">
              Monitoreo de relojes
            </h3>
            <button
              type="button"
              className="text-xs text-[#c8102e] font-bold hover:underline"
              onClick={() => nav("/devices")}
            >
              Ver todos
            </button>
          </div>

          <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {(health?.items || []).slice(0, 10).map((d) => (
              <li
                key={d.name}
                className="flex items-center justify-between text-xs py-1.5 border-b border-zinc-100 last:border-0"
              >
                <div className="min-w-0">
                  <span className="truncate block font-medium text-zinc-700">
                    {d.name}
                  </span>
                  {d.punches_today !== undefined && (
                    <span className="text-[10px] text-zinc-400">
                      {d.punches_today} ponches hoy
                    </span>
                  )}
                </div>
                <span
                  className={`ml-2 shrink-0 px-2 py-0.5 rounded text-[10px] font-bold ${
                    d.online
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {d.online ? `${d.latency_ms ?? "—"} ms` : "OFFLINE"}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel>
          <div className="flex justify-between items-center mb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-800">
                Turnos abiertos
              </h3>
              <p className="text-[11px] text-zinc-400">
                Entradas sin salida registrada
              </p>
            </div>
            <Clock3 size={16} className="text-amber-500" />
          </div>

          <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {(overview?.open_shifts || []).slice(0, 8).map((p) => (
              <li
                key={`${p.codigo}-${p.entrada}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-xs font-bold text-zinc-800 truncate">
                    {p.nombre || p.codigo}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {p.dispositivo_origen || "Biométrico"}
                  </p>
                </div>
                <span className="font-mono text-[11px] font-semibold text-amber-800">
                  {p.entrada || "—"}
                </span>
              </li>
            ))}
            {!overview?.open_shifts?.length && (
              <li className="text-xs text-zinc-400 text-center py-8">
                No hay turnos abiertos.
              </li>
            )}
          </ul>
        </Panel>

        <Panel>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="font-bold text-sm text-zinc-800">
                Últimos registros
              </h3>
              <p className="text-[11px] text-zinc-400">
                Actividad biométrica reciente
              </p>
            </div>
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="text"
                placeholder="Buscar..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 text-xs w-full sm:w-40 focus:outline-none focus:border-zinc-400"
              />
            </div>
          </div>

          <ul className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {filteredRecent.length ? (
              filteredRecent.map((p) => (
                <li
                  key={p.id}
                  className="text-xs flex items-center justify-between gap-2 p-2 rounded-lg bg-zinc-50 border border-zinc-100 hover:bg-zinc-100 transition-colors"
                >
                  <div className="truncate">
                    <p className="font-bold text-zinc-800 truncate">
                      {p.nombre || p.codigo}
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">
                      {p.departamento || p.dispositivo_origen || "Biométrico"}
                    </p>
                  </div>
                  <span className="font-mono text-[11px] text-zinc-600 font-semibold bg-white px-2 py-1 rounded border border-zinc-200">
                    {p.entrada || "—"}
                  </span>
                </li>
              ))
            ) : (
              <p className="text-xs text-zinc-400 text-center py-8">
                No hay registros coincidentes.
              </p>
            )}
          </ul>
        </Panel>
      </div>

      <footer className="flex flex-wrap items-center justify-between text-xs text-zinc-400 pt-2 border-t border-zinc-200/60">
        <span className="inline-flex items-center gap-1.5">
          <Shield size={14} className="text-zinc-500" />
          Sistema de Control de Asistencia Enterprise
        </span>
        <span className="inline-flex items-center gap-1.5">
          {autoRefresh ? <Play size={12} /> : <Pause size={12} />}
          {autoRefresh ? "Actualización automática cada 30s" : "Actualización pausada"}
        </span>
      </footer>
    </div>
  );
}
