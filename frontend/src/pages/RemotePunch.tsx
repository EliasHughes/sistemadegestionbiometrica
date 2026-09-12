import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { authFetch } from "../lib/api";
import { Btn, PageHeader, Panel } from "../ui/kit";

export default function RemotePunch() {
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [comentario, setComentario] = useState("");
  const [dispositivo, setDispositivo] = useState("Ponche Remoto");
  const [devices, setDevices] = useState<string[]>(["Ponche Remoto"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [preview, setPreview] = useState<string>("");

  useEffect(() => {
    authFetch("/api/records/remote-devices")
      .then((r) => r.json())
      .then((d) => {
        const items = d.items || d.devices || [];
        const names = items.map((x: string | { name?: string }) => (typeof x === "string" ? x : x.name || "")).filter(Boolean);
        if (names.length) setDevices(names);
      })
      .catch(() => undefined);
  }, []);

  const payload = () => ({ codigo, tipo, comentario, dispositivo });

  const onPreview = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    try {
      const res = await authFetch("/api/records/remote-punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), dry_run: true, confirm: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Error ${res.status}`);
      setPreview(JSON.stringify(data, null, 2));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo previsualizar");
    } finally {
      setLoading(false);
    }
  };

  const onLive = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await authFetch("/api/records/remote-punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload(), dry_run: false, confirm: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : `Error ${res.status}`);
      setOk(`Ponche ${tipo} registrado para ${codigo}`);
      setPreview("");
      setComentario("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se registró el ponche");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 page-enter">
      <PageHeader kicker="Operación" title="Ponche remoto" subtitle="Primero preview · luego confirmación live" />

      <div className="grid sm:grid-cols-2 gap-3">
        <div className={`kpi-tile ${tipo === "entrada" ? "kpi-emerald" : "kpi-sky"}`}>
          <span className="shine" />
          <p className="text-xs text-white/80">Tipo</p>
          <p className="text-3xl font-black capitalize">{tipo}</p>
        </div>
        <div className="kpi-tile kpi-slate">
          <span className="shine" />
          <p className="text-xs text-white/80">Origen</p>
          <p className="text-lg font-black truncate">{dispositivo}</p>
        </div>
      </div>

      <Panel className="max-w-xl">
        <form onSubmit={onPreview} className="space-y-3">
          <input required value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="Código" className="w-full text-sm border rounded-xl px-3 py-2.5" />
          <select value={dispositivo} onChange={(e) => setDispositivo(e.target.value)} className="w-full text-sm border rounded-xl px-3 py-2.5 bg-white">
            {devices.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setTipo("entrada")} className={`btn-modern rounded-xl py-2 text-sm font-semibold ${tipo === "entrada" ? "bg-emerald-600 text-white" : "bg-zinc-100"}`}>Entrada</button>
            <button type="button" onClick={() => setTipo("salida")} className={`btn-modern rounded-xl py-2 text-sm font-semibold ${tipo === "salida" ? "bg-sky-600 text-white" : "bg-zinc-100"}`}>Salida</button>
          </div>
          <input value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="Comentario" className="w-full text-sm border rounded-xl px-3 py-2.5" />
          {error ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{error}</p> : null}
          {ok ? <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{ok}</p> : null}
          <Btn type="submit" tone="primary" disabled={loading}>{loading ? "…" : "Previsualizar"}</Btn>
        </form>

        {preview ? (
          <div className="mt-4 rounded-xl bg-zinc-50 p-3">
            <p className="text-xs font-semibold flex items-center gap-2 mb-2"><Shield size={14} /> Dry-run</p>
            <pre className="text-[11px] overflow-auto max-h-40">{preview}</pre>
            <div className="flex gap-2 mt-3">
              <Btn tone="ghost" onClick={() => setPreview("")}>Cancelar</Btn>
              <Btn tone="primary" onClick={onLive} disabled={loading}>Confirmar live</Btn>
            </div>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}