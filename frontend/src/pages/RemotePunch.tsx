import { useEffect, useState } from "react";
import { authFetch } from "../lib/api";

export default function RemotePunch() {
  const [codigo, setCodigo] = useState("");
  const [punchType, setPunchType] = useState<"entrada" | "salida">("entrada");
  const [comentario, setComentario] = useState("");
  const [dispositivo, setDispositivo] = useState("Ponche Remoto");
  const [devices, setDevices] = useState<string[]>(["Ponche Remoto"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
  authFetch("/api/records/remote-devices")
      .then((r) => r.json())
      .then((d) => {
        if (d.items?.length) setDevices(d.items);
      })
      .catch(() => {});
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOk("");
    try {
    const res = await authFetch("/api/records/remote-punch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo: codigo.trim(),
          tipo: punchType,
          comentario,
          dispositivo,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "No se pudo registrar");
      setOk(
        `${data.tipo} de ${data.codigo} a las ${data.hora} en ${data.dispositivo}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-lg space-y-5">
      <div>
        <h2 className="text-lg font-bold">Ponche Remoto</h2>
        <p className="text-sm text-zinc-500">
          Se escribe en dbo.punches y aparece en la pantalla Ponches.
        </p>
      </div>
      <form onSubmit={onSubmit} className="bg-white border rounded-2xl p-5 space-y-4">
        <input
          required
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          placeholder="Código"
          className="w-full text-sm border rounded-xl px-3 py-2.5"
        />
        <div>
          <label className="text-[11px] uppercase text-zinc-500 font-semibold">Reloj / origen</label>
          <select
            value={dispositivo}
            onChange={(e) => setDispositivo(e.target.value)}
            className="w-full text-sm border rounded-xl px-3 py-2.5 mt-1"
          >
            {devices.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setPunchType("entrada")}
            className={`py-3 rounded-xl text-sm font-semibold border ${
              punchType === "entrada" ? "bg-emerald-50 border-emerald-300" : "border-zinc-200"
            }`}
          >
            Entrada
          </button>
          <button
            type="button"
            onClick={() => setPunchType("salida")}
            className={`py-3 rounded-xl text-sm font-semibold border ${
              punchType === "salida" ? "bg-zinc-100 border-zinc-300" : "border-zinc-200"
            }`}
          >
            Salida
          </button>
        </div>
        <input
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Comentario"
          className="w-full text-sm border rounded-xl px-3 py-2.5"
        />
        {error && <div className="p-3 bg-rose-50 text-rose-700 text-sm rounded-xl">{error}</div>}
        {ok && <div className="p-3 bg-emerald-50 text-emerald-700 text-sm rounded-xl">{ok}</div>}
        <button
          disabled={loading}
          className="w-full bg-red-600 text-white font-semibold py-2.5 rounded-xl"
        >
          {loading ? "Registrando..." : "Registrar ponche"}
        </button>
      </form>
    </div>
  );
}