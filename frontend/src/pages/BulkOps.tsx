import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

type Device = { name: string };
type Result = { codigo: string; ok: boolean; error?: string; zk?: { mode?: string } };
type BulkRow = {
  codigo: string;
  nombre: string;
  password: string;
  card: number;
  dispositivo: string;
};

export default function BulkOps() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [device, setDevice] = useState("");
  const [raw, setRaw] = useState(
    "codigo,nombre,password,card\n1001,Juan Perez,1234,0\n1002,Ana Gomez,1234,0"
  );
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    authFetch("/api/records/managed-devices")
      .then((r) => r.json())
      .then((d) => setDevices((d.items || []) as Device[]))
      .catch(() => setErr("No se pudieron cargar relojes"));
  }, []);

  const parse = (): BulkRow[] => {
    const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return [];
    const header = lines[0].toLowerCase();
    const start = header.includes("codigo") ? 1 : 0;
    const rows: BulkRow[] = [];
    for (const line of lines.slice(start)) {
      const parts = line.split(",").map((p) => p.trim());
      if (!parts[0]) continue;
      rows.push({
        codigo: parts[0],
        nombre: parts[1] || "",
        password: parts[2] || "",
        card: Number(parts[3] || 0),
        dispositivo: device,
      });
    }
    return rows;
  };

  const run = async () => {
    if (!device) {
      setErr("Elige el reloj destino");
      return;
    }
    const rows = parse();
    if (!rows.length) {
      setErr("No hay filas válidas. Formato: codigo,nombre,password,card");
      return;
    }
    setRunning(true);
    setErr("");
    setMsg("");
    try {
      const res = await authFetch("/api/records/bulk-enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "Falló la inscripción masiva");
      }
      setResults((data.results || []) as Result[]);
      setMsg(`${data.ok} ok · ${data.fail} con error`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Falló la inscripción masiva");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">Operaciones masivas</h2>
        <p className="text-sm text-zinc-500">Una línea por persona: codigo,nombre,password,card</p>
      </div>
      {err && <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">{err}</div>}
      {msg && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">{msg}</div>}
      <select
        value={device}
        onChange={(e) => setDevice(e.target.value)}
        className="text-sm border rounded-lg px-3 py-2 bg-white max-w-md"
      >
        <option value="">Reloj destino</option>
        {devices.map((d) => (
          <option key={d.name} value={d.name}>
            {d.name}
          </option>
        ))}
      </select>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        className="w-full min-h-[220px] text-sm font-mono border rounded-2xl p-3"
      />
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="bg-red-600 text-white text-sm font-semibold px-4 py-2 rounded-xl disabled:bg-zinc-300"
      >
        {running ? "Inscribiendo..." : `Inscribir ${parse().length} usuarios`}
      </button>
      {results.length > 0 && (
        <div className="bg-white border rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 text-[11px] uppercase text-zinc-500 text-left">
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {results.map((r) => (
                <tr key={r.codigo}>
                  <td className="px-3 py-2 font-mono text-xs">{r.codigo}</td>
                  <td className="px-3 py-2">{r.ok ? "OK" : "Error"}</td>
                  <td className="px-3 py-2 text-xs text-zinc-500">{r.error || r.zk?.mode || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}