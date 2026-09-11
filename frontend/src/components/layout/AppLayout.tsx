import { Outlet } from "react-router-dom";
import type { AppUser } from "../../types";
import Sidebar from "./Sidebar";
import Header from "./Header";
import BrandBackdrop from "../BrandBackdrop";

type AppLayoutProps = {
  user: AppUser;
  onLogout: () => void;
};

export default function AppLayout({ user, onLogout }: AppLayoutProps) {
  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <BrandBackdrop />
      <div className="app-shell min-h-screen flex w-full">
        <Sidebar user={user} onLogout={onLogout} />
        <div className="flex-1 flex flex-col min-w-0">
          <Header user={user} />
          <main className="flex-1 p-6 overflow-auto">
            <div className="page-enter">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}