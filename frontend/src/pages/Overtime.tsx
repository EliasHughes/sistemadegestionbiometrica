import { useState } from "react";
import { authFetch } from "../lib/api";

type Item = {
  codigo: string;
  nombre: string | null;
  fecha: string;
  entrada: string;
  salida: string | null;
  worked_hours: number;
  regular_hours: number;
  extra_hours: number;
  night_hours: number;
  saturday_premium_hours: number;
  is_sunday: boolean;
  is_saturday: boolean;
  is_holiday: boolean;
};

export default function Overtime() {
  const [codigo, setCodigo] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [scheduled, setScheduled] = useState(8);
  const [holidays, setHolidays] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [totals, setTotals] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
        const res = await authFetch("/api/payroll/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo || null,
          fecha_desde: desde || null,
          fecha_hasta: hasta || null,
          scheduled_hours: scheduled,
          holidays: holidays
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(
          typeof d.detail === "string" ? d.detail : "Error al calcular"
        );
      }
      const data = await res.json();
      setItems(data.items || []);
      setTotals(data.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const exportExcel = () => {
    const headers = [
      "Codigo",
      "Nombre",
      "Fecha",
      "Entrada",
      "Salida",
      "Trabajadas",
      "Regulares",
      "Extras",
      "Nocturnas",
      "Sabado_premium",
      "Domingo",
      "Sabado",
      "Feriado",
    ];
    const lines = [
      headers.join(","),
      ...items.map((it) =>
        [
          it.codigo,
          `"${(it.nombre || "").replace(/"/g, '""')}"`,
          it.fecha,
          it.entrada,
          it.salida || "",
          it.worked_hours,
          it.regular_hours,
          it.extra_hours,
          it.night_hours,
          it.saturday_premium_hours,
          it.is_sunday ? "SI" : "NO",
          it.is_saturday ? "SI" : "NO",
          it.is_holiday ? "SI" : "NO",
        ].join(",")
      ),
    ];
    if (totals) {
      lines.push("");
      lines.push(
        [
          "TOTALES",
          "",
          "",
          "",
          "",
          totals.worked_hours,
          totals.regular_hours,
          totals.extra_hours,
          totals.night_hours,
          totals.saturday_premium_hours,
          "",
          "",
          "",
        ].join(",")
      );
    }
    const blob = new Blob(["\uFEFF" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `horas_extras_${codigo || "todos"}_${desde || "rango"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-zinc-900">Horas extras y nocturnas</h2>
        <p className="text-sm text-zinc-500">
          Extra +45% · Nocturna +15% (desde 18:00) · Domingo +100% · Sábado +100% tras 4h · Feriado +165%
        </p>
      </div>

      <form
        onSubmit={run}
        className="bg-white border border-zinc-200 rounded-2xl p-4 grid grid-cols-1 md:grid-cols-5 gap-3 items-end"
      >
        <div>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">Código</label>
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Opcional"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">Jornada (h)</label>
          <input
            type="number"
            min={1}
            max={12}
            step={0.5}
            value={scheduled}
            onChange={(e) => setScheduled(Number(e.target.value))}
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold py-2 rounded-lg"
        >
          {loading ? "Calculando..." : "Calcular"}
        </button>
        <div className="md:col-span-5">
          <label className="text-[11px] font-semibold text-zinc-500 uppercase">
            Feriados (YYYY-MM-DD separados por coma)
          </label>
          <input
            value={holidays}
            onChange={(e) => setHolidays(e.target.value)}
            placeholder="2026-01-01, 2026-02-27"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
        </div>
      </form>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            ["Trabajadas", totals.worked_hours],
            ["Regulares", totals.regular_hours],
            ["Extras", totals.extra_hours],
            ["Nocturnas", totals.night_hours],
            ["Sáb. premium", totals.saturday_premium_hours],
          ].map(([l, v]) => (
            <div key={String(l)} className="bg-white border border-zinc-200 rounded-2xl p-4">
              <p className="text-[11px] uppercase text-zinc-400 font-semibold">{l}</p>
              <p className="text-xl font-bold tabular-nums">{v}</p>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={exportExcel}
            className="text-sm font-semibold px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white"
          >
            Exportar cálculo (Excel/CSV)
          </button>
        </div>
      )}

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left text-[11px] uppercase text-zinc-500">
                <th className="px-3 py-3">Código</th>
                <th className="px-3 py-3">Fecha</th>
                <th className="px-3 py-3">Entrada</th>
                <th className="px-3 py-3">Salida</th>
                <th className="px-3 py-3">Trab.</th>
                <th className="px-3 py-3">Extra</th>
                <th className="px-3 py-3">Noct.</th>
                <th className="px-3 py-3">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 font-mono text-xs">{it.codigo}</td>
                  <td className="px-3 py-2">{it.fecha}</td>
                  <td className="px-3 py-2">{it.entrada}</td>
                  <td className="px-3 py-2">{it.salida || "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{it.worked_hours}</td>
                  <td className="px-3 py-2 tabular-nums text-red-700 font-semibold">
                    {it.extra_hours}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-violet-700 font-semibold">
                    {it.night_hours}
                  </td>
                  <td className="px-3 py-2 text-[10px] space-x-1">
                    {it.is_holiday && (
                      <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">FER</span>
                    )}
                    {it.is_sunday && (
                      <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">DOM</span>
                    )}
                    {it.is_saturday && (
                      <span className="bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">SÁB</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}