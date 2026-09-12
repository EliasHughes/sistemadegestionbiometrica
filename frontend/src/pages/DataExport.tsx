import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Btn, PageHeader, Panel } from "../ui/kit";

type DeviceRow = {
  dispositivo: string;
  total_registros: number;
};

type ExportType = "excel" | "pdf";

export default function DataExport() {
  const [limit, setLimit] = useState<number>(1000);
  const [fechaDesde, setFechaDesde] = useState<string>("");
  const [fechaHasta, setFechaHasta] = useState<string>("");
  const [dispositivo, setDispositivo] = useState<string>("todos");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [loading, setLoading] = useState<ExportType | null>(null);
  const [loadingDevices, setLoadingDevices] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [ok, setOk] = useState<string>("");

  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("auth_token") ||
      "";
    const headers: Record<string, string> = { Accept: "*/*" };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  };

  useEffect(() => {
    let mounted = true;
    const loadDevices = async () => {
      try {
        setLoadingDevices(true);
        setError("");
        const response = await fetch("/api/records/devices", {
          method: "GET",
          headers: getAuthHeaders(),
        });
        if (!response.ok) {
          throw new Error(`No se pudieron cargar los dispositivos. Estado: ${response.status}`);
        }
        const data = await response.json();
        if (!mounted) return;
        const items = data?.items || data?.devices || [];
        setDevices(Array.isArray(items) ? items : []);
      } catch (err) {
        if (mounted) {
          setDevices([]);
          setError(err instanceof Error ? err.message : "Error al cargar los dispositivos.");
        }
      } finally {
        if (mounted) setLoadingDevices(false);
      }
    };
    loadDevices();
    return () => {
      mounted = false;
    };
  }, []);

  const validateDates = (): boolean => {
    if (!fechaDesde && !fechaHasta) return true;
    if (fechaDesde && fechaHasta) {
      const desde = new Date(`${fechaDesde}T00:00:00`);
      const hasta = new Date(`${fechaHasta}T23:59:59.999`);
      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        setError("El rango de fechas seleccionado no es válido.");
        return false;
      }
      if (desde.getTime() > hasta.getTime()) {
        setError("La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'.");
        return false;
      }
    }
    return true;
  };

  const buildExportParams = () => {
    const params = new URLSearchParams();
    const device = dispositivo && dispositivo !== "todos" ? dispositivo.trim() : "";
    const desdeFull = fechaDesde ? `${fechaDesde} 00:00:00` : "";
    const hastaFull = fechaHasta ? `${fechaHasta} 23:59:59.999999` : "";
    if (device) params.set("dispositivo", device);
    if (fechaDesde) params.set("fecha_desde", fechaDesde);
    if (fechaHasta) params.set("fecha_hasta", fechaHasta);
    params.set("limit", String(Number(limit)));
    return { params, device, desdeFull, hastaFull };
  };

  const download = async (type: ExportType) => {
    if (loading) return;
    setError("");
    setOk("");
    if (!validateDates()) return;
    setLoading(type);
    try {
      const baseUrl = type === "excel" ? "/api/records/export/excel" : "/api/records/export/pdf";
      const { params, device, desdeFull, hastaFull } = buildExportParams();
      const bodyPayload = {
        limit: Number(limit),
        dispositivo: device,
        device,
        reloj: device,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        desde: fechaDesde,
        hasta: fechaHasta,
        start_date: fechaDesde,
        end_date: fechaHasta,
        fecha_inicio: fechaDesde,
        fecha_fin: fechaHasta,
        fecha_desde_full: desdeFull,
        fecha_hasta_full: hastaFull,
        start_datetime: desdeFull,
        end_datetime: hastaFull,
        start_date_time: desdeFull,
        end_date_time: hastaFull,
      };

      let response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload),
      });

      if (response.status === 404 || response.status === 405 || response.status === 415) {
        response = await fetch(`${baseUrl}?${params.toString()}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
      }

      if (!response.ok) {
        let message = "";
        try {
          const contentType = response.headers.get("content-type") || "";
          if (contentType.includes("application/json")) {
            const data = await response.json();
            message = data?.detail || data?.message || data?.error || "";
          } else {
            message = await response.text();
          }
        } catch {
          /* ignore */
        }
        throw new Error(message || `Error al generar ${type.toUpperCase()}. Estado HTTP: ${response.status}`);
      }

      const blob = await response.blob();
      if (!blob || blob.size === 0) {
        throw new Error("El reporte generado no contiene datos para los filtros seleccionados.");
      }

      const safeDevice = device
        ? device.replace(/[<>:"/\\|?*]+/g, "").replace(/\s+/g, "_").slice(0, 50)
        : "todos";
      const filename = `ponches_${fechaDesde || "inicio"}_a_${fechaHasta || "fin"}_${safeDevice}.${type === "excel" ? "xlsx" : "pdf"}`;
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setOk(`Descargado ${filename}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con el servidor.");
    } finally {
      setLoading(null);
    }
  };

  const clearFilters = () => {
    setFechaDesde("");
    setFechaHasta("");
    setDispositivo("todos");
    setError("");
    setOk("");
  };

  const hasFilters = Boolean(fechaDesde || fechaHasta || dispositivo !== "todos");

  return (
    <div className="space-y-5 page-enter">
      <PageHeader
        kicker="Reportes"
        title="Exportar datos"
        subtitle="Excel y PDF · rango de fechas y reloj · solo lectura"
      />

      <div className="grid sm:grid-cols-3 gap-3">
        <div className="kpi-tile kpi-emerald">
          <span className="shine" />
          <p className="text-xs text-white/80">Excel</p>
          <p className="text-2xl font-black">.xlsx</p>
        </div>
        <div className="kpi-tile kpi-slate">
          <span className="shine" />
          <p className="text-xs text-white/80">PDF</p>
          <p className="text-2xl font-black">.pdf</p>
        </div>
        <div className="kpi-tile kpi-violet">
          <span className="shine" />
          <p className="text-xs text-white/80">Tope</p>
          <p className="text-2xl font-black">{limit.toLocaleString()}</p>
        </div>
      </div>

      <Panel className="max-w-xl space-y-4">
        <label className="block text-[11px] font-semibold text-zinc-500 uppercase">
          Reloj / dispositivo
          <select
            value={dispositivo}
            onChange={(e) => {
              setDispositivo(e.target.value);
              setError("");
            }}
            disabled={loadingDevices || !!loading}
            className="mt-1 w-full px-3 py-2.5 border rounded-xl text-sm bg-white disabled:bg-zinc-100"
          >
            <option value="todos">Todos los relojes</option>
            {devices.map((device, index) => (
              <option key={`${device.dispositivo}-${index}`} value={device.dispositivo}>
                {device.dispositivo} ({(device.total_registros || 0).toLocaleString()} reg.)
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase">
            Desde
            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              disabled={!!loading}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setError("");
              }}
              className="mt-1 w-full px-3 py-2.5 border rounded-xl text-sm disabled:bg-zinc-100"
            />
          </label>
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase">
            Hasta
            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              disabled={!!loading}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setError("");
              }}
              className="mt-1 w-full px-3 py-2.5 border rounded-xl text-sm disabled:bg-zinc-100"
            />
          </label>
        </div>

        {hasFilters ? (
          <div className="rounded-xl bg-zinc-50 border border-zinc-100 p-3 text-xs text-zinc-600">
            <div className="font-semibold text-zinc-700 mb-1">Filtro seleccionado</div>
            <div>Desde: <strong>{fechaDesde || "Sin límite"}</strong></div>
            <div>Hasta: <strong>{fechaHasta || "Sin límite"}</strong></div>
            {fechaDesde && fechaHasta ? (
              <div className="mt-1 text-zinc-500">Incluye de 00:00:00 a 23:59:59.999999.</div>
            ) : null}
          </div>
        ) : null}

        <label className="block text-[11px] font-semibold text-zinc-500 uppercase">
          Máximo de filas
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={!!loading}
            className="mt-1 w-full px-3 py-2.5 border rounded-xl text-sm bg-white disabled:bg-zinc-100"
          >
            <option value={200}>200 (PDF recomendado)</option>
            <option value={500}>500</option>
            <option value={1000}>1,000</option>
            <option value={5000}>5,000 (solo Excel)</option>
            <option value={10000}>10,000 (solo Excel)</option>
          </select>
        </label>

        {error ? <p className="text-sm text-rose-700 bg-rose-50 rounded-xl px-3 py-2">{error}</p> : null}
        {ok ? <p className="text-sm text-emerald-700 bg-emerald-50 rounded-xl px-3 py-2">{ok}</p> : null}

        <div className="grid grid-cols-2 gap-3">
          <Btn tone="primary" onClick={() => download("excel")} disabled={!!loading}>
            <Download size={16} /> {loading === "excel" ? "Generando…" : "Descargar Excel"}
          </Btn>
          <Btn tone="neutral" onClick={() => download("pdf")} disabled={!!loading}>
            {loading === "pdf" ? "Generando…" : "Descargar PDF"}
          </Btn>
        </div>

        {hasFilters ? (
          <Btn tone="ghost" onClick={clearFilters} disabled={!!loading}>
            Limpiar filtros
          </Btn>
        ) : null}
      </Panel>
    </div>
  );
}