// frontend/src/pages/AdvancedReports.tsx
import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { FileSpreadsheet, FileText, Table as TableIcon, RefreshCw } from "lucide-react";
import { authFetch } from "../lib/api";

interface RawRecord {
  codigo?: string;
  employee_id?: string;
  id?: string;
  nombre?: string;
  name?: string;
  dispositivo?: string;
  device?: string;
  reloj?: string;
  sn?: string;
  worked_hours?: number;
  extra_hours?: number;
  night_hours?: number;
  saturday_premium_hours?: number;
  sunday_hours?: number;
  holiday_hours?: number;
  h15?: number;
  h45?: number;
  h100?: number;
  h165?: number;
}

interface AggregatedEmployee {
  codigo: string;
  nombre: string;
  h15: number;
  h45: number;
  h100: number;
  h165: number;
  total: number;
}

interface Device {
  id?: string | number;
  name?: string;
  alias?: string;
  dispositivo?: string;
  device_name?: string;
  sn?: string;
}

function monthRange() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const last = new Date(y, now.getMonth() + 1, 0).getDate();
  return {
    desde: `${y}-${m}-01`,
    hasta: `${y}-${m}-${String(last).padStart(2, "0")}`,
  };
}

export default function AdvancedReports() {
  const initial = monthRange();
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("todos");
  const [fechaDesde, setFechaDesde] = useState(initial.desde);
  const [fechaHasta, setFechaHasta] = useState(initial.hasta);
  const [holidaysInput, setHolidaysInput] = useState("2026-01-01, 2026-02-27");
  const [baseHours, setBaseHours] = useState(8);
  const [records, setRecords] = useState<RawRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await authFetch("/api/records/devices");
        if (!res.ok) return;
        const data = await res.json();
        const list = data.items || data.devices || [];
        if (Array.isArray(list)) setDevices(list);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    setError("");
    try {
      const holidays = holidaysInput
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);

      const res = await authFetch("/api/payroll/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispositivo: selectedDevice === "todos" ? "" : selectedDevice,
          fecha_desde: fechaDesde,
          fecha_hasta: fechaHasta,
          scheduled_hours: Number(baseHours),
          holidays,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.detail === "string" ? data.detail : `Error ${res.status}`
        );
      }

      const rawItems = Array.isArray(data)
        ? data
        : data.items || data.records || [];
      setRecords(rawItems);
      if (!rawItems.length) {
        setError("No hay ponches en ese rango (o faltan horas de salida).");
      }
    } catch (err) {
      setRecords([]);
      setError(err instanceof Error ? err.message : "Error al generar el reporte");
    } finally {
      setLoading(false);
    }
  };

  const deviceOptions = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach((d, idx) => {
      const val = String(
        d.dispositivo || d.alias || d.name || d.device_name || d.sn || d.id || `reloj-${idx}`
      ).trim();
      const label = String(
        d.dispositivo || d.alias || d.name || d.device_name || d.sn || `Reloj ${idx + 1}`
      ).trim();
      if (val) map.set(val, label);
    });
    records.forEach((item) => {
      const val = String(item.dispositivo || item.device || item.reloj || item.sn || "").trim();
      if (val && !map.has(val)) map.set(val, val);
    });
    return Array.from(map.entries()).map(([value, label]) => ({ value, label }));
  }, [devices, records]);

  const groupedData = useMemo(() => {
    const map = new Map<string, AggregatedEmployee>();

    const filtered = records.filter((item) => {
      if (selectedDevice === "todos" || !selectedDevice) return true;
      const dev = String(item.dispositivo || item.device || item.reloj || item.sn || "")
        .toLowerCase()
        .trim();
      const target = selectedDevice.toLowerCase().trim();
      return dev === target || dev.includes(target) || target.includes(dev);
    });

    for (const item of filtered) {
      const anyItem = item as Record<string, any>;
      const key = String(anyItem.codigo || anyItem.employee_id || anyItem.id || "SIN_CODIGO");

      if (!map.has(key)) {
        map.set(key, {
          codigo: key,
          nombre: anyItem.nombre || anyItem.name || `Colaborador ${key}`,
          h15: 0,
          h45: 0,
          h100: 0,
          h165: 0,
          total: 0,
        });
      }

      const row = map.get(key)!;
      const n15 = Number(anyItem.h15 ?? anyItem.night_hours ?? 0);
      const n45 = Number(anyItem.h45 ?? anyItem.extra_hours ?? 0);
      const n100 = Number(
        anyItem.h100 ?? anyItem.saturday_premium_hours ?? anyItem.sunday_hours ?? 0
      );
      const n165 = Number(anyItem.h165 ?? anyItem.holiday_hours ?? 0);
      const worked = Number(anyItem.worked_hours ?? 0);

      row.h15 += n15;
      row.h45 += n45;
      row.h100 += n100;
      row.h165 += n165;
      row.total += worked || n15 + n45 + n100 + n165;
    }

    return Array.from(map.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [records, selectedDevice]);

  const totals = useMemo(
    () =>
      groupedData.reduce(
        (acc, r) => {
          acc.h15 += r.h15;
          acc.h45 += r.h45;
          acc.h100 += r.h100;
          acc.h165 += r.h165;
          acc.total += r.total;
          return acc;
        },
        { h15: 0, h45: 0, h100: 0, h165: 0, total: 0 }
      ),
    [groupedData]
  );

  const exportCSV = () => {
    if (!groupedData.length) return;
    const headers = ["Codigo", "Nombre", "15%", "45%", "100%", "165%", "Total"];
    const rows = groupedData.map((r) => [
      `"${r.codigo}"`,
      `"${r.nombre.replace(/"/g, '""')}"`,
      r.h15.toFixed(2),
      r.h45.toFixed(2),
      r.h100.toFixed(2),
      r.h165.toFixed(2),
      r.total.toFixed(2),
    ]);
    rows.push([
      "TOTAL",
      "-",
      totals.h15.toFixed(2),
      totals.h45.toFixed(2),
      totals.h100.toFixed(2),
      totals.h165.toFixed(2),
      totals.total.toFixed(2),
    ]);
    const csv =
      "data:text/csv;charset=utf-8,\uFEFF" +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const link = document.createElement("a");
    link.href = encodeURI(csv);
    link.download = `Reporte_Avanzado_${fechaDesde}_al_${fechaHasta}.csv`;
    link.click();
  };

  const exportExcel = () => {
    if (!groupedData.length) return;
    const dataToExport = groupedData.map((r) => ({
      Codigo: r.codigo,
      Nombre: r.nombre,
      "15% nocturna": Number(r.h15.toFixed(2)),
      "45% extra LV": Number(r.h45.toFixed(2)),
      "100% dom/sab": Number(r.h100.toFixed(2)),
      "165% feriado": Number(r.h165.toFixed(2)),
      Total: Number(r.total.toFixed(2)),
    }));
    dataToExport.push({
      Codigo: "TOTAL",
      Nombre: "-",
      "15% nocturna": Number(totals.h15.toFixed(2)),
      "45% extra LV": Number(totals.h45.toFixed(2)),
      "100% dom/sab": Number(totals.h100.toFixed(2)),
      "165% feriado": Number(totals.h165.toFixed(2)),
      Total: Number(totals.total.toFixed(2)),
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Avanzado");
    XLSX.writeFile(workbook, `Reporte_Avanzado_${fechaDesde}_al_${fechaHasta}.xlsx`);
  };

  const exportPDF = () => {
    if (!groupedData.length) return;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Reporte avanzado de recargos", 14, 15);
    doc.setFontSize(10);
    doc.text(`Periodo: ${fechaDesde} al ${fechaHasta}`, 14, 22);
    const tableRows = groupedData.map((r) => [
      r.codigo,
      r.nombre,
      r.h15.toFixed(2),
      r.h45.toFixed(2),
      r.h100.toFixed(2),
      r.h165.toFixed(2),
      r.total.toFixed(2),
    ]);
    tableRows.push([
      "TOTAL",
      "-",
      totals.h15.toFixed(2),
      totals.h45.toFixed(2),
      totals.h100.toFixed(2),
      totals.h165.toFixed(2),
      totals.total.toFixed(2),
    ]);
    autoTable(doc, {
      head: [["Codigo", "Nombre", "15%", "45%", "100%", "165%", "Total"]],
      body: tableRows,
      startY: 28,
      theme: "grid",
      headStyles: { fillColor: [180, 0, 0] },
    });
    doc.save(`Reporte_Avanzado_${fechaDesde}_al_${fechaHasta}.pdf`);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Reportes Avanzados</h1>
        <p className="text-sm text-zinc-500">
          L-V: 15% nocturna dentro de 8h · 45% después de 8h · Sábado +4h y domingo 100% ·
          Feriado 165%
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1 uppercase tracking-wider">
              Reloj / dispositivo
            </label>
            <select
              value={selectedDevice}
              onChange={(e) => setSelectedDevice(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              <option value="todos">Todos los dispositivos</option>
              {deviceOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1 uppercase tracking-wider">
              Fecha desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1 uppercase tracking-wider">
              Fecha hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-semibold text-zinc-600 mb-1 uppercase tracking-wider">
              Feriados (YYYY-MM-DD separados por coma)
            </label>
            <input
              type="text"
              value={holidaysInput}
              onChange={(e) => setHolidaysInput(e.target.value)}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-zinc-600 mb-1 uppercase tracking-wider">
              Jornada base (horas)
            </label>
            <input
              type="number"
              value={baseHours}
              onChange={(e) => setBaseHours(Number(e.target.value))}
              className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={fetchReportData}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            {loading ? "Generando..." : "Generar reporte avanzado"}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      <div className="flex justify-between items-center">
        <span className="inline-flex items-center px-3 py-1 bg-amber-100 text-amber-800 rounded-md text-xs font-semibold">
          Rango: {fechaDesde} al {fechaHasta} · {groupedData.length} colaborador(es)
        </span>
        <div className="flex gap-2">
          <button
            onClick={exportExcel}
            disabled={!groupedData.length}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-700 text-white rounded-lg text-sm disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button
            onClick={exportPDF}
            disabled={!groupedData.length}
            className="flex items-center gap-2 px-3 py-2 bg-red-700 text-white rounded-lg text-sm disabled:opacity-50"
          >
            <FileText className="w-4 h-4" /> PDF
          </button>
          <button
            onClick={exportCSV}
            disabled={!groupedData.length}
            className="flex items-center gap-2 px-3 py-2 bg-zinc-800 text-white rounded-lg text-sm disabled:opacity-50"
          >
            <TableIcon className="w-4 h-4" /> CSV
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-zinc-100 border-b border-zinc-200 text-zinc-700 font-semibold">
                <th className="py-3 px-4 border-r">Código</th>
                <th className="py-3 px-4 border-r">Nombre</th>
                <th className="py-3 px-4 border-r text-center w-24">15%</th>
                <th className="py-3 px-4 border-r text-center w-24">45%</th>
                <th className="py-3 px-4 border-r text-center w-24">100%</th>
                <th className="py-3 px-4 border-r text-center w-24">165%</th>
                <th className="py-3 px-4 text-center w-28 bg-zinc-200">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {groupedData.length > 0 ? (
                groupedData.map((row) => (
                  <tr key={row.codigo} className="hover:bg-zinc-50">
                    <td className="py-2.5 px-4 font-mono text-xs border-r">{row.codigo}</td>
                    <td className="py-2.5 px-4 border-r font-medium">{row.nombre}</td>
                    <td className="py-2.5 px-4 border-r text-center">{row.h15.toFixed(2)}</td>
                    <td className="py-2.5 px-4 border-r text-center">{row.h45.toFixed(2)}</td>
                    <td className="py-2.5 px-4 border-r text-center">{row.h100.toFixed(2)}</td>
                    <td className="py-2.5 px-4 border-r text-center">{row.h165.toFixed(2)}</td>
                    <td className="py-2.5 px-4 text-center font-bold bg-zinc-50">
                      {row.total.toFixed(2)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-400">
                    {loading
                      ? "Generando..."
                      : "No se encontraron registros para los criterios seleccionados."}
                  </td>
                </tr>
              )}
            </tbody>
            {groupedData.length > 0 && (
              <tfoot>
                <tr className="bg-zinc-100 border-t-2 border-zinc-300 font-bold">
                  <td colSpan={2} className="py-3 px-4 border-r text-right">
                    TOTAL
                  </td>
                  <td className="py-3 px-4 border-r text-center">{totals.h15.toFixed(2)}</td>
                  <td className="py-3 px-4 border-r text-center">{totals.h45.toFixed(2)}</td>
                  <td className="py-3 px-4 border-r text-center">{totals.h100.toFixed(2)}</td>
                  <td className="py-3 px-4 border-r text-center">{totals.h165.toFixed(2)}</td>
                  <td className="py-3 px-4 text-center bg-zinc-200">{totals.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
}