import type { ReactNode } from "react";

export function PageHeader({
  kicker,
  title,
  subtitle,
  actions,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 page-enter">
      <div>
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#c8102e] font-semibold">{kicker}</p>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {subtitle ? <p className="text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Btn({
  children,
  tone = "neutral",
  type = "button",
  onClick,
  disabled,
}: {
  children: ReactNode;
  tone?: "primary" | "neutral" | "ghost" | "danger";
  type?: "button" | "submit";
  onClick?: () => void;
  disabled?: boolean;
}) {
  const tones: Record<string, string> = {
    primary:
      "bg-[#c8102e] text-white shadow-[0_10px_24px_-12px_rgba(200,16,46,.8)]",
    neutral: "bg-zinc-900 text-white hover:bg-zinc-800",
    ghost: "bg-white border border-zinc-200 text-zinc-700 hover:border-[#c8102e]/40 hover:text-[#c8102e]",
    danger: "bg-white border border-rose-200 text-rose-600 hover:bg-rose-50",
  };
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn-modern inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold disabled:opacity-50 ${tones[tone]}`}
    >
      <span className="shine" />
      {children}
    </button>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`glass-card rounded-2xl p-4 ${className}`}>{children}</section>;
}