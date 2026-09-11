import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../lib/api";

function isAutoField(name: string) {
  const n = name.toLowerCase();
  return (
    n.includes("creado") ||
    n.includes("actualizado") ||
    n.includes("created") ||
    n.includes("updated")
  );
}

function isTolerance(name: string) {
  const n = name.toLowerCase();
  return n.includes("tolerancia") || n.includes("tolerance") || n.includes("gracia");
}

function isOvernight(name: string) {
  const n = name.toLowerCase();
  return n.includes("overnight") || n.includes("nocturn") || n === "es_nocturno";
}

function isActiveField(name: string) {
  const n = name.toLowerCase();
  return n === "activo" || n === "active" || n === "enabled" || n === "is_active";
}

function isTimeField(name: string) {
  const n = name.toLowerCase();
  return (
    n.includes("entrada") ||
    n.includes("salida") ||
    n.includes("inicio") ||
    n.includes("fin") ||
    n.includes("start") ||
    n.includes("end") ||
    n.includes("hora")
  );
}

function isTruthy(v: string) {
  return ["1", "true", "si", "sí", "yes", "on"].includes(String(v).toLowerCase());
}

function parseTimeToMinutes(v: string): number | null {
  if (!v) return null;
  const parts = v.split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

export default function Schedules() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [rotations, setRotations] = useState<any[]>([]);
  const [rotName, setRotName] = useState("");
  const [rotIds, setRotIds] = useState<number[]>([]);
  const [rotCodes, setRotCodes] = useState("");

  const currentUser = "admin";

  const load = async () => {
    setLoading(true);
    setError("");
    try {
    const [sRes, rRes] = await Promise.all([
        authFetch("/api/records/schedules"),
        authFetch("/api/payroll/rotations"),
      ]);
      if (!sRes.ok) {
        const d = await sRes.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "Error al cargar horarios");
      }
      const data = await sRes.json();
      setColumns(data.columns || []);
      setRows(data.items || []);
      if (rRes.ok) {
        const rd = await rRes.json();
        setRotations(rd.items || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const writableCols = useMemo(
    () => columns.filter((c) => c.toLowerCase() !== "id"),
    [columns]
  );
  const visibleFormCols = writableCols.filter((c) => !isAutoField(c));

  const applyOvernightRule = (next: Record<string, string>) => {
    const salidaKey = Object.keys(next).find((k) => {
      const n = k.toLowerCase();
      return n.includes("salida") || n.includes("end") || n.includes("fin");
    });
    const overnightKey = Object.keys(next).find((k) => isOvernight(k));
    if (!salidaKey || !overnightKey) return next;
    const mins = parseTimeToMinutes(next[salidaKey]);
    if (mins !== null && mins >= 18 * 60) next[overnightKey] = "true";
    return next;
  };

  const startCreate = () => {
    const empty: Record<string, string> = {};
    writableCols.forEach((c) => {
      if (isAutoField(c)) empty[c] = currentUser;
      else if (isTolerance(c)) empty[c] = "15";
      else if (isOvernight(c)) empty[c] = "false";
      else if (isActiveField(c)) empty[c] = "true";
      else empty[c] = "";
    });
    setForm(empty);
    setEditingId("new");
    setOk("");
  };

  const startEdit = (row: Record<string, unknown>) => {
    const next: Record<string, string> = {};
    writableCols.forEach((c) => {
      next[c] = row[c] == null ? "" : String(row[c]);
    });
    setForm(applyOvernightRule(next));
    setEditingId(Number(row.id ?? row.Id ?? row.ID));
    setOk("");
  };

  const onFieldChange = (key: string, value: string) => {
    setForm((prev) => applyOvernightRule({ ...prev, [key]: value }));
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    setOk("");
    try {
      const url =
        editingId === "new"
          ? "/api/records/schedules"
          : `/api/records/schedules/${editingId}`;
      const res = await fetch(url, {
        method: editingId === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fields: form }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(typeof d.detail === "string" ? d.detail : "No se pudo guardar");
      }
      setOk(editingId === "new" ? "Horario creado" : "Horario actualizado");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const toggleRotId = (id: number) => {
    setRotIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const saveRotation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rotName.trim() || rotIds.length < 2) {
      setError("Indica un nombre y marca al menos 2 horarios");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/payroll/rotations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: rotName,
          description: "Rotación semanal automática",
          schedule_ids: rotIds,
          employee_codes: rotCodes.split(",").map((c) => c.trim()).filter(Boolean),
          active: true,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "No se pudo guardar rotación");
      }
      setOk("Horario rotativo guardado");
      setRotName("");
      setRotIds([]);
      setRotCodes("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const fmt = (v: unknown) => (v == null || v === "" ? "—" : String(v));
  const visibleCols = columns.slice(0, 7);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-zinc-900">Horarios</h2>
          <p className="text-sm text-zinc-500">
            Switch activo · overnight automático ≥ 18:00 · rotativos por checkbox
          </p>
        </div>
        <button
          onClick={startCreate}
          className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white"
        >
          Nuevo horario
        </button>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{error}</div>
      )}
      {ok && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{ok}</div>
      )}

      {editingId !== null && (
        <form onSubmit={save} className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">
              {editingId === "new" ? "Crear horario" : `Editar horario #${editingId}`}
            </h3>
            <button type="button" onClick={() => setEditingId(null)} className="text-xs text-zinc-500">
              Cancelar
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {visibleFormCols.map((c) => {
              const tol = isTolerance(c);
              const night = isOvernight(c);
              const timeF = isTimeField(c);
              const active = isActiveField(c);
              return (
                <div key={c} className={tol ? "max-w-[140px]" : ""}>
                  <label className="block text-[11px] font-semibold text-zinc-500 uppercase mb-1">
                    {c.split("_").join(" ")}
                    {night && <span className="ml-1 text-red-600 normal-case font-normal">(auto ≥ 18:00)</span>}
                  </label>
                  {active ? (
                    <button
                      type="button"
                      onClick={() => onFieldChange(c, isTruthy(form[c]) ? "false" : "true")}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full ${
                        isTruthy(form[c]) ? "bg-emerald-500" : "bg-zinc-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-6 w-6 rounded-full bg-white shadow transition ${
                          isTruthy(form[c]) ? "translate-x-7" : "translate-x-1"
                        }`}
                      />
                    </button>
                  ) : night ? (
                    <select
                      value={form[c] || "false"}
                      onChange={(e) => onFieldChange(c, e.target.value)}
                      className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white"
                    >
                      <option value="false">false</option>
                      <option value="true">true</option>
                    </select>
                  ) : (
                    <input
                      type={tol ? "number" : timeF ? "time" : "text"}
                      min={tol ? 0 : undefined}
                      value={form[c] || ""}
                      onChange={(e) => onFieldChange(c, e.target.value)}
                      className={`text-sm border border-zinc-200 rounded-lg px-3 py-2 ${tol ? "w-24" : "w-full"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="submit"
            disabled={saving}
            className="bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </form>
      )}

      <div className="bg-white border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-left text-[11px] uppercase text-zinc-500">
                {visibleCols.map((c) => (
                  <th key={c} className="px-4 py-3 font-semibold whitespace-nowrap">
                    {c.split("_").join(" ")}
                  </th>
                ))}
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {loading && rows.length === 0 && (
                <tr>
                  <td colSpan={visibleCols.length + 1} className="px-4 py-8 text-center text-zinc-400">
                    Cargando...
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={i} className="hover:bg-zinc-50/80">
                  {visibleCols.map((c) => (
                    <td key={c} className="px-4 py-2.5 max-w-[180px] truncate">
                      {fmt(row[c])}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => startEdit(row)} className="text-xs font-bold text-red-600 hover:underline">
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-2xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-zinc-900">Horarios rotativos (semanal)</h3>
          <p className="text-xs text-zinc-500">
            Marca con checkbox 2 o más horarios. Cada semana ISO se usa el siguiente.
          </p>
        </div>
        <form onSubmit={saveRotation} className="space-y-3">
          <input
            value={rotName}
            onChange={(e) => setRotName(e.target.value)}
            placeholder="Nombre del rotativo (ej: Turno Planta A)"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <div className="grid sm:grid-cols-2 gap-2 max-h-56 overflow-auto border border-zinc-100 rounded-xl p-3">
            {rows.map((r) => {
              const id = Number(r.id ?? r.Id ?? r.ID);
              if (!id) return null;
              const label = String(r.nombre ?? r.name ?? r.descripcion ?? r.description ?? `Horario ${id}`);
              const checked = rotIds.includes(id);
              return (
                <label
                  key={id}
                  className={`flex items-center gap-2 text-sm border rounded-xl px-3 py-2 cursor-pointer ${
                    checked ? "border-red-300 bg-red-50" : "border-zinc-200 bg-zinc-50"
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleRotId(id)} />
                  <span className="font-medium">#{id}</span>
                  <span className="truncate text-zinc-600">{label}</span>
                </label>
              );
            })}
          </div>
          <input
            value={rotCodes}
            onChange={(e) => setRotCodes(e.target.value)}
            placeholder="Códigos de empleados (opcional, separados por coma)"
            className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2"
          />
          <button
            type="submit"
            disabled={saving}
            className="bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2 rounded-xl"
          >
            Guardar rotativo
          </button>
        </form>

        {rotations.length > 0 && (
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            {rotations.map((r) => (
              <div key={r.id} className="text-sm flex flex-wrap gap-2 items-center">
                <span className="font-semibold">{r.name}</span>
                <span className="text-xs text-zinc-500">
                  semana {r.iso_week} → horario #{r.current_schedule_id}
                </span>
                <span className="text-xs text-zinc-400">({(r.schedule_ids || []).join(" → ")})</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}