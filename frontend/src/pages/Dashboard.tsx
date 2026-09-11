// frontend/src/pages/Dashboard.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../lib/api";

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
  open_shifts: {
    codigo: string;
    nombre?: string;
    dispositivo_origen?: string;
    entrada?: string;
  }[];
  by_dept: { depto: string; total: number }[];
};

type PunchRow = {
  id: number;
  codigo: string;
  nombre: string | null;
  entrada: string | null;
  dispositivo_origen: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  login: "Inicio de sesión",
  login_ok: "Inicio de sesión",
  remote_punch: "Ponche remoto",
  clone_user: "Usuario copiado",
  sync_collaborator: "Sync a reloj",
  change_password: "Cambio de contraseña",
};

function delta(today: number, yesterday: number) {
  if (!yesterday) return today ? "+100%" : "0%";
  const p = ((today - yesterday) / yesterday) * 100;
  return `${p >= 0 ? "+" : ""}${p.toFixed(0)}% vs ayer`;
}

function LineChart({ points }: { points: { label: string; value: number }[] }) {
  const w = 560;
  const h = 180;
  const pad = 24;
  const max = Math.max(1, ...points.map((p) => p.value));
  const coords = points.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(points.length - 1, 1);
    const y = h - pad - (p.value / max) * (h - pad * 2);
    return `${x},${y}`;
  });
  if (!points.length) return <p className="text-xs text-zinc-400">Sin serie</p>;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-44">
      <defs>
        <linearGradient id="redFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8102e" />
          <stop offset="100%" stopColor="#c8102e" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon fill="url(#redFade)" opacity="0.25" points={`${pad},${h - pad} ${coords.join(" ")} ${w - pad},${h - pad}`} />
      <polyline fill="none" stroke="#c8102e" strokeWidth="2.5" points={coords.join(" ")} />
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [recent, setRecent] = useState<PunchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [sRes, stRes, rRes, oRes] = await Promise.all([
        authFetch("/api/records/summary"),
        authFetch("/api/records/stats"),
        authFetch("/api/records/recent?limit=8"),
        authFetch("/api/records/ops-overview"),
      ]);
      if (!sRes.ok) throw new Error("No se pudo cargar el resumen");
      setSummary(await sRes.json());
      setStats(stRes.ok ? await stRes.json() : { by_device: [], by_day: [], by_hour: [], activity: [] });
      const rec = rRes.ok ? await rRes.json() : { items: [] };
      setRecent(rec.items || []);
      setOverview(oRes.ok ? await oRes.json() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const dayPoints = useMemo(
    () => (stats?.by_day || []).map((d) => ({ label: String(d.dia).slice(5), value: Number(d.total || 0) })),
    [stats]
  );
  const hourPoints = useMemo(
    () =>
      Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, "0")}`,
        value: Number(stats?.by_hour.find((x) => Number(x.hora) === h)?.total || 0),
      })),
    [stats]
  );
  const maxHour = Math.max(1, ...hourPoints.map((p) => p.value));
  const maxDev = Math.max(1, ...(stats?.by_device || []).map((d) => Number(d.total || 0)));
  const maxDept = Math.max(1, ...(overview?.by_dept || []).map((d) => Number(d.total || 0)));

  const kpis = [
    {
      label: "Ponches hoy",
      value: overview?.today.total ?? summary?.total_hoy,
      hint: delta(overview?.today.total || 0, overview?.yesterday.total || 0),
      to: "/records",
    },
    {
      label: "Empleados hoy",
      value: overview?.today.empleados ?? summary?.empleados_hoy,
      hint: `${summary?.con_entrada ?? 0} in · ${summary?.con_salida ?? 0} out`,
      to: "/collaborators",
    },
    {
      label: "Relojes con marca",
      value: overview?.today.relojes ?? summary?.dispositivos_hoy,
      hint: stats?.by_device?.[0]?.name || "Sin ranking",
      to: "/devices",
    },
    {
      label: "Turnos abiertos",
      value: overview?.today.sin_salida ?? 0,
      hint: "Entrada sin salida hoy",
      to: "/records",
      warn: (overview?.today.sin_salida || 0) > 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-red-700">
            César Iglesias
          </p>
          <h2 className="text-xl font-bold">Dashboard operativo</h2>
          <p className="text-sm text-zinc-500">Hoy vs ayer · huecos de salida · actividad · 60s</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("/export")}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-zinc-200"
          >
            Exportar
          </button>
          <button
            onClick={load}
            disabled={loading}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-600 text-white"
          >
            {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((kpi) => (
          <button
            key={kpi.label}
            type="button"
            onClick={() => navigate(kpi.to)}
            className={`rounded-2xl p-5 text-left border ${
              kpi.warn ? "bg-amber-50 border-amber-200" : "bg-white border-zinc-200"
            }`}
          >
            <p className="text-[11px] font-semibold text-zinc-500 uppercase">{kpi.label}</p>
            <p className="text-2xl font-bold mt-2 tabular-nums">
              {typeof kpi.value === "number" ? kpi.value.toLocaleString() : kpi.value ?? "—"}
            </p>
            <p className="text-[11px] text-zinc-500 mt-1">{kpi.hint}</p>
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <button
          type="button"
          onClick={() => navigate("/db-records")}
          className="lg:col-span-3 bg-white border border-zinc-200 rounded-2xl p-5 text-left"
        >
          <h3 className="text-sm font-bold mb-2">Tendencia 14 días</h3>
          <LineChart points={dayPoints} />
        </button>
        <div className="lg:col-span-2 bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-2">Por hora (hoy)</h3>
          <div className="flex items-end gap-1 h-40">
            {hourPoints.map((p) => (
              <div key={p.label} className="flex-1 flex flex-col items-center justify-end h-full">
                <div
                  className="w-full max-w-[12px] rounded-t bg-red-600"
                  title={`${p.label}:00 · ${p.value}`}
                  style={{ height: `${Math.max(3, (p.value / maxHour) * 100)}%` }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <div className="flex justify-between mb-3">
            <h3 className="text-sm font-bold">Ranking de relojes</h3>
            <button className="text-[11px] font-semibold text-red-700" onClick={() => navigate("/devices")}>
              Ver
            </button>
          </div>
          <div className="space-y-2.5">
            {(stats?.by_device || []).slice(0, 8).map((d) => (
              <div key={d.name}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="truncate pr-2">{d.name}</span>
                  <span className="font-semibold tabular-nums">{Number(d.total).toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full bg-red-600 rounded-full"
                    style={{ width: `${(Number(d.total) / maxDev) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl p-5">
          <h3 className="text-sm font-bold mb-3">Departamentos hoy</h3>
          <div className="space-y-2.5">
            {(overview?.by_dept || []).map((d) => (
              <div key={d.depto}>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span>{d.depto}</span>
                  <span className="font-semibold">{Number(d.total).toLocaleString()}</span>
                </div>
                <div className="h-2 rounded-full bg-zinc-100 overflow-hidden">
                  <div
                    className="h-full bg-zinc-800 rounded-full"
                    style={{ width: `${(Number(d.total) / maxDept) * 100}%` }}
                  />
                </div>
              </div>
            ))}
            {!overview?.by_dept?.length && <p className="text-sm text-zinc-400">Sin datos de hoy</p>}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 text-sm font-bold">
            Entrada sin salida
          </div>
          <div className="divide-y divide-zinc-100 max-h-72 overflow-auto">
            {(overview?.open_shifts || []).map((item, i) => (
              <div key={`${item.codigo}-${i}`} className="px-5 py-3">
                <p className="text-sm font-medium truncate">{item.nombre || item.codigo}</p>
                <p className="text-[11px] text-zinc-500">
                  {String(item.entrada || "").slice(0, 8)} · {item.dispositivo_origen || "—"}
                </p>
              </div>
            ))}
            {!overview?.open_shifts?.length && (
              <p className="px-5 py-6 text-sm text-zinc-400">No hay turnos abiertos</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 flex justify-between">
            <h3 className="text-sm font-bold">Últimos ponches</h3>
            <button className="text-[11px] font-semibold text-red-700" onClick={() => navigate("/records")}>
              Abrir
            </button>
          </div>
          <div className="divide-y divide-zinc-100">
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate("/records")}
                className="w-full px-5 py-3 flex gap-3 text-left hover:bg-zinc-50"
              >
                <span className="text-xs font-mono text-zinc-500 w-16">
                  {item.entrada ? String(item.entrada).slice(0, 8) : "—"}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.nombre || item.codigo}</p>
                  <p className="text-[11px] text-zinc-500 truncate">{item.dispositivo_origen || "—"}</p>
                </div>
              </button>
            ))}
            {recent.length === 0 && <p className="px-5 py-6 text-sm text-zinc-400">Sin marcas recientes</p>}
          </div>
        </div>

        <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-zinc-100 text-sm font-bold">Auditoría de la app</div>
          <div className="divide-y divide-zinc-100 max-h-80 overflow-auto">
            {(stats?.activity || []).map((a, i) => (
              <div key={`${a.timestamp}-${i}`} className="px-5 py-3">
                <p className="text-sm font-medium">{ACTION_LABEL[a.action] || a.action}</p>
                <p className="text-[11px] text-zinc-500">
                  {a.timestamp} · {a.actor} · {a.target}
                </p>
              </div>
            ))}
            {!stats?.activity?.length && (
              <p className="px-5 py-6 text-sm text-zinc-400">Sin movimientos aún</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}