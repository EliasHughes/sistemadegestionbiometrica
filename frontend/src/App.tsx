import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login/Login";
import { useAuth } from "./hooks/useAuth";
import AppLayout from "./components/layout/AppLayout";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import RemotePunch from "./pages/RemotePunch";
import BulkOps from "./pages/BulkOps";
import Records from "./pages/Records";
import Devices from "./pages/Devices";
import Employees from "./pages/Employees";
import DataExport from "./pages/DataExport";
import UsersAdmin from "./pages/UsersAdmin";
import SyncHistory from "./pages/SyncHistory";
import Schedules from "./pages/Schedules";
import Overtime from "./pages/Overtime";
import Collaborators from "./pages/Collaborators";
import Settings from "./pages/Settings";
import SqlHistory from "./pages/SqlHistory";
import Inventory from "./pages/Inventory";
import AdvancedReports from "./pages/AdvancedReports"
import Fiorella from "./components/layout/Fiorella";

function App() {
  const { user, isAuthenticated, ready, login, logout } = useAuth();

  if (!ready) {
    return <div className="min-h-screen grid place-items-center text-zinc-500 text-sm">Cargando sesión...</div>;
  }

 if (!isAuthenticated || !user) {
    return (
      <>
        <Login onLoginSuccess={login} />
        <Fiorella />
      </>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout user={user} onLogout={logout} />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<ProtectedRoute user={user} screen="dashboard"><Dashboard /></ProtectedRoute>} />
          <Route path="records" element={<ProtectedRoute user={user} screen="records"><Records /></ProtectedRoute>} />
          <Route path="remote-punch" element={<ProtectedRoute user={user} screen="remote_punch"><RemotePunch /></ProtectedRoute>} />
          <Route path="db-records" element={<ProtectedRoute user={user} screen="db_records"><SqlHistory /></ProtectedRoute>} />
          <Route path="devices" element={<ProtectedRoute user={user} screen="devices"><Devices /></ProtectedRoute>} />
          <Route path="employees" element={<ProtectedRoute user={user} screen="employees"><Employees /></ProtectedRoute>} />
          <Route path="collaborators" element={<ProtectedRoute user={user} screen="collaborators"><Collaborators /></ProtectedRoute>} />
          <Route path="schedules" element={<ProtectedRoute user={user} screen="schedules"><Schedules /></ProtectedRoute>} />
          <Route path="biometric" element={<ProtectedRoute user={user} screen="biometric_inventory"><Inventory /></ProtectedRoute>} />
          <Route path="bulk" element={<ProtectedRoute user={user} screen="bulk_ops"><BulkOps /></ProtectedRoute>} />
          <Route path="reports" element={<ProtectedRoute user={user} screen="reports"><Overtime /></ProtectedRoute>} />
          <Route path="export" element={<ProtectedRoute user={user} screen="data_export"><DataExport /></ProtectedRoute>} />
          <Route path="sync-history" element={<ProtectedRoute user={user} screen="sync_history"><SyncHistory /></ProtectedRoute>} />
          <Route path="users" element={<ProtectedRoute user={user} screen="users"><UsersAdmin /></ProtectedRoute>} />
          <Route path="settings" element={<ProtectedRoute user={user} screen="settings"><Settings /></ProtectedRoute>} />
          <Route path="advanced-reports" element={<ProtectedRoute user={user} screen="advanced_reports"><AdvancedReports /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />          
        </Route>
      </Routes>
      <Fiorella />
    </BrowserRouter>
   
    
  );
}

export default App;