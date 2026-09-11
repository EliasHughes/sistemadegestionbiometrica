import { useEffect, useState } from "react";

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

  /*
   * ============================================================
   * AUTENTICACIÓN
   * ============================================================
   */
  const getAuthHeaders = (): Record<string, string> => {
    const token =
      localStorage.getItem("access_token") ||
      sessionStorage.getItem("access_token") ||
      localStorage.getItem("token") ||
      sessionStorage.getItem("token") ||
      localStorage.getItem("auth_token") ||
      "";

    const headers: Record<string, string> = {
      Accept: "*/*",
    };

    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    return headers;
  };

  /*
   * ============================================================
   * CARGAR DISPOSITIVOS
   * ============================================================
   */
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
          throw new Error(
            `No se pudieron cargar los dispositivos. Estado: ${response.status}`
          );
        }

        const data = await response.json();

        if (!mounted) return;

        const items = data?.items || data?.devices || [];

        setDevices(Array.isArray(items) ? items : []);
      } catch (err) {
        console.error("Error al cargar dispositivos:", err);

        if (mounted) {
          setDevices([]);
          setError(
            err instanceof Error
              ? err.message
              : "Error al cargar los dispositivos."
          );
        }
      } finally {
        if (mounted) {
          setLoadingDevices(false);
        }
      }
    };

    loadDevices();

    return () => {
      mounted = false;
    };
  }, []);

  /*
   * ============================================================
   * VALIDACIÓN DE FECHAS
   * ============================================================
   */
  const validateDates = (): boolean => {
    if (!fechaDesde && !fechaHasta) {
      return true;
    }

    if (fechaDesde && fechaHasta) {
      const desde = new Date(`${fechaDesde}T00:00:00`);
      const hasta = new Date(`${fechaHasta}T23:59:59.999`);

      if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
        setError("El rango de fechas seleccionado no es válido.");
        return false;
      }

      if (desde.getTime() > hasta.getTime()) {
        setError(
          "La fecha 'Desde' no puede ser posterior a la fecha 'Hasta'."
        );
        return false;
      }
    }

    return true;
  };

  /*
   * ============================================================
   * CONSTRUCCIÓN DEL FILTRO
   * ============================================================
   *
   * IMPORTANTE:
   *
   * Las fechas se mandan tanto:
   *
   *   1. Como fecha simple:
   *      2026-09-05
   *
   *   2. Como fecha/hora completa:
   *      2026-09-05 00:00:00
   *      2026-09-05 23:59:59.999999
   *
   * Esto evita problemas dependiendo de cómo el backend
   * esté leyendo los parámetros.
   */
  const buildExportParams = () => {
    const params = new URLSearchParams();

    const device =
      dispositivo && dispositivo !== "todos" ? dispositivo.trim() : "";

    const desdeFull = fechaDesde
      ? `${fechaDesde} 00:00:00`
      : "";

    const hastaFull = fechaHasta
      ? `${fechaHasta} 23:59:59.999999`
      : "";

    /*
     * ----------------------------------------------------------
     * DISPOSITIVO
     * ----------------------------------------------------------
     */
    if (device) {
      params.set("dispositivo", device);
    }

    /*
     * ----------------------------------------------------------
     * FECHA DESDE
     * ----------------------------------------------------------
     */
    if (fechaDesde) {
      params.set("fecha_desde", fechaDesde);
    }

    /*
     * ----------------------------------------------------------
     * FECHA HASTA
     * ----------------------------------------------------------
     */
    if (fechaHasta) {
      params.set("fecha_hasta", fechaHasta);
    }

    /*
     * ----------------------------------------------------------
     * LÍMITE
     * ----------------------------------------------------------
     */
    params.set("limit", String(Number(limit)));

    return {
      params,
      device,
      desdeFull,
      hastaFull,
    };
  };

  /*
   * ============================================================
   * DESCARGA EXCEL / PDF
   * ============================================================
   */
  const download = async (type: ExportType) => {
    if (loading) {
      return;
    }

    setError("");

    /*
     * Validar primero las fechas.
     */
    if (!validateDates()) {
      return;
    }

    setLoading(type);

    try {
      const baseUrl =
        type === "excel"
          ? "/api/records/export/excel"
          : "/api/records/export/pdf";

      const {
        params,
        device,
        desdeFull,
        hastaFull,
      } = buildExportParams();

      /*
       * ========================================================
       * PAYLOAD JSON
       * ========================================================
       *
       * Se mantienen varias denominaciones por compatibilidad
       * con el backend existente.
       */
      const bodyPayload = {
        limit: Number(limit),

        /*
         * Dispositivo
         */
        dispositivo: device,
        device: device,
        reloj: device,

        /*
         * Fechas simples
         */
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,

        desde: fechaDesde,
        hasta: fechaHasta,

        start_date: fechaDesde,
        end_date: fechaHasta,

        fecha_inicio: fechaDesde,
        fecha_fin: fechaHasta,

        /*
         * Fechas completas
         */
        fecha_desde_full: desdeFull,
        fecha_hasta_full: hastaFull,

        start_datetime: desdeFull,
        end_datetime: hastaFull,

        start_date_time: desdeFull,
        end_date_time: hastaFull,
      };

      /*
       * ========================================================
       * DEBUG
       * ========================================================
       *
       * Esto permite comprobar en F12 > Console exactamente
       * qué se está enviando.
       */
      console.log("========================================");
      console.log("EXPORTANDO DATOS");
      console.log("Tipo:", type);
      console.log("Dispositivo:", device || "TODOS");
      console.log("Fecha desde:", fechaDesde || "SIN LÍMITE");
      console.log("Fecha hasta:", fechaHasta || "SIN LÍMITE");
      console.log("Desde completo:", desdeFull || "SIN LÍMITE");
      console.log("Hasta completo:", hastaFull || "SIN LÍMITE");
      console.log("Límite:", Number(limit));
      console.log("Query:", params.toString());
      console.log("Payload:", bodyPayload);
      console.log("========================================");

      let response: Response;

      /*
       * ========================================================
       * PRIMER INTENTO
       * ========================================================
       *
       * POST
       *
       * IMPORTANTE:
       *
       * Las fechas van:
       *
       *   - En el JSON
       *   - En la URL
       *
       * Esto soluciona el caso donde el backend acepta POST
       * pero realmente lee request.args / query parameters.
       */
      response = await fetch(`${baseUrl}?${params.toString()}`, {
        method: "POST",

        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },

        body: JSON.stringify(bodyPayload),
      });

      /*
       * ========================================================
       * FALLBACK GET
       * ========================================================
       *
       * Si el endpoint no acepta POST, usamos GET.
       */
      if (
        response.status === 404 ||
        response.status === 405 ||
        response.status === 415
      ) {
        console.warn(
          `POST ${baseUrl} no disponible (${response.status}). Intentando GET...`
        );

        response = await fetch(`${baseUrl}?${params.toString()}`, {
          method: "GET",
          headers: getAuthHeaders(),
        });
      }

      /*
       * ========================================================
       * RESPUESTA CON ERROR
       * ========================================================
       */
      if (!response.ok) {
        let message = "";

        try {
          const contentType =
            response.headers.get("content-type") || "";

          if (contentType.includes("application/json")) {
            const data = await response.json();

            if (typeof data?.detail === "string") {
              message = data.detail;
            } else if (typeof data?.message === "string") {
              message = data.message;
            } else if (typeof data?.error === "string") {
              message = data.error;
            }
          } else {
            message = await response.text();
          }
        } catch {
          // Ignorar error al intentar leer respuesta
        }

        throw new Error(
          message ||
            `Error al generar ${type.toUpperCase()}. Estado HTTP: ${response.status}`
        );
      }

      /*
       * ========================================================
       * VALIDAR ARCHIVO
       * ========================================================
       */
      const blob = await response.blob();

      if (!blob || blob.size === 0) {
        throw new Error(
          "El reporte generado no contiene datos para los filtros seleccionados."
        );
      }

      /*
       * ========================================================
       * NOMBRE DEL ARCHIVO
       * ========================================================
       */
      const safeDevice = device
        ? device
            .replace(/[<>:"/\\|?*]+/g, "")
            .replace(/\s+/g, "_")
            .slice(0, 50)
        : "todos";

      const safeDesde = fechaDesde || "inicio";
      const safeHasta = fechaHasta || "fin";

      const extension = type === "excel" ? "xlsx" : "pdf";

      const filename =
        `ponches_${safeDesde}_a_${safeHasta}_${safeDevice}.${extension}`;

      /*
       * ========================================================
       * DESCARGAR
       * ========================================================
       */
      const url = window.URL.createObjectURL(blob);

      const anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;

      document.body.appendChild(anchor);

      anchor.click();

      anchor.remove();

      /*
       * Liberar memoria.
       */
      setTimeout(() => {
        window.URL.revokeObjectURL(url);
      }, 1000);

      console.log("Archivo descargado:", filename);
    } catch (err) {
      console.error("Error durante la exportación:", err);

      setError(
        err instanceof Error
          ? err.message
          : "Error de conexión con el servidor."
      );
    } finally {
      setLoading(null);
    }
  };

  /*
   * ============================================================
   * LIMPIAR FILTROS
   * ============================================================
   */
  const clearFilters = () => {
    setFechaDesde("");
    setFechaHasta("");
    setDispositivo("todos");
    setError("");
  };

  /*
   * ============================================================
   * RENDER
   * ============================================================
   */
  return (
    <div className="space-y-6 max-w-xl">
      {/* ======================================================
          ENCABEZADO
      ====================================================== */}
      <div>
        <h2 className="text-lg font-bold text-zinc-900">
          Exportar Datos
        </h2>

        <p className="text-sm text-zinc-500">
          Excel y PDF · filtro por rango de fechas y reloj · solo lectura
        </p>
      </div>

      {/* ======================================================
          PANEL PRINCIPAL
      ====================================================== */}
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-6 space-y-5">

        {/* ====================================================
            DISPOSITIVO
        ==================================================== */}
        <div>
          <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
            Reloj / dispositivo
          </label>

          <select
            value={dispositivo}
            onChange={(e) => {
              setDispositivo(e.target.value);
              setError("");
            }}
            disabled={loadingDevices || !!loading}
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-red-500/30"
          >
            <option value="todos">
              Todos los relojes
            </option>

            {devices.map((device, index) => (
              <option
                key={`${device.dispositivo}-${index}`}
                value={device.dispositivo}
              >
                {device.dispositivo} (
                {device.total_registros
                  ? device.total_registros.toLocaleString()
                  : 0}{" "}
                reg.)
              </option>
            ))}
          </select>
        </div>

        {/* ====================================================
            FECHAS
        ==================================================== */}
        <div className="grid grid-cols-2 gap-3">

          {/* DESDE */}
          <div>
            <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
              Desde (opcional)
            </label>

            <input
              type="date"
              value={fechaDesde}
              max={fechaHasta || undefined}
              disabled={!!loading}
              onChange={(e) => {
                setFechaDesde(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:bg-zinc-100"
            />
          </div>

          {/* HASTA */}
          <div>
            <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
              Hasta (opcional)
            </label>

            <input
              type="date"
              value={fechaHasta}
              min={fechaDesde || undefined}
              disabled={!!loading}
              onChange={(e) => {
                setFechaHasta(e.target.value);
                setError("");
              }}
              className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-500/30 disabled:bg-zinc-100"
            />
          </div>
        </div>

        {/* ====================================================
            INFORMACIÓN DEL FILTRO
        ==================================================== */}
        {(fechaDesde || fechaHasta) && (
          <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-3 text-xs text-zinc-600">
            <div className="font-semibold text-zinc-700 mb-1">
              Filtro seleccionado
            </div>

            <div>
              Desde:{" "}
              <strong>
                {fechaDesde || "Sin límite"}
              </strong>
            </div>

            <div>
              Hasta:{" "}
              <strong>
                {fechaHasta || "Sin límite"}
              </strong>
            </div>

            {fechaDesde && fechaHasta && (
              <div className="mt-1 text-zinc-500">
                Se incluirán todos los registros desde las{" "}
                <strong>00:00:00</strong> hasta las{" "}
                <strong>23:59:59.999999</strong>.
              </div>
            )}
          </div>
        )}

        {/* ====================================================
            MÁXIMO DE FILAS
        ==================================================== */}
        <div>
          <label className="block text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-1.5">
            Máximo de filas
          </label>

          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            disabled={!!loading}
            className="w-full px-3 py-2.5 border border-zinc-200 rounded-xl text-sm bg-white disabled:bg-zinc-100"
          >
            <option value={200}>
              200 (PDF recomendado)
            </option>

            <option value={500}>
              500
            </option>

            <option value={1000}>
              1,000
            </option>

            <option value={5000}>
              5,000 (solo Excel)
            </option>

            <option value={10000}>
              10,000 (solo Excel)
            </option>
          </select>
        </div>

        {/* ====================================================
            ERROR
        ==================================================== */}
        {error && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* ====================================================
            BOTONES
        ==================================================== */}
        <div className="grid grid-cols-2 gap-3">

          {/* EXCEL */}
          <button
            type="button"
            onClick={() => download("excel")}
            disabled={!!loading}
            className="bg-red-600 hover:bg-red-500 disabled:bg-zinc-300 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            {loading === "excel"
              ? "Generando..."
              : "Descargar Excel"}
          </button>

          {/* PDF */}
          <button
            type="button"
            onClick={() => download("pdf")}
            disabled={!!loading}
            className="bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-300 text-white font-semibold text-sm py-2.5 rounded-xl transition-colors"
          >
            {loading === "pdf"
              ? "Generando..."
              : "Descargar PDF"}
          </button>
        </div>

        {/* ====================================================
            LIMPIAR FILTROS
        ==================================================== */}
        {(fechaDesde || fechaHasta || dispositivo !== "todos") && (
          <button
            type="button"
            onClick={clearFilters}
            disabled={!!loading}
            className="w-full border border-zinc-200 hover:bg-zinc-50 disabled:bg-zinc-100 text-zinc-700 font-medium text-sm py-2.5 rounded-xl transition-colors"
          >
            Limpiar filtros
          </button>
        )}
      </div>
    </div>
  );
}