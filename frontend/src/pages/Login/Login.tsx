import { useState, useEffect } from "react";
import type { AppUser } from "../../types";

type LoginProps = {
  onLoginSuccess: (user: AppUser) => void;
};

const BRANDS = [
  { id: "el-gallo", src: "/brands/el-gallo.png", alt: "El Gallo" },
  { id: "mazeite", src: "/brands/mazeite.png", alt: "Mazeite" },
  { id: "del-cesar", src: "/brands/del-cesar.png", alt: "Del César" },
  { id: "trigo-de-oro", src: "/brands/trigo-de-oro.png", alt: "Trigo de Oro" },
  { id: "el-rey", src: "/brands/el-rey.png", alt: "El Rey" },
  { id: "domino", src: "/brands/domino.png", alt: "Dominó" },
  { id: "hispano", src: "/brands/hispano.png", alt: "Hispano" },
  { id: "kinsu", src: "/brands/kinsu.png", alt: "Kinsú" },
  { id: "aurora", src: "/brands/aurora.png", alt: "Aurora" },
  { id: "brillante", src: "/brands/brillante.png", alt: "Brillante" },
];

export default function Login({ onLoginSuccess }: LoginProps) {
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem("biolink_remember_user") || "";
    } catch {
      return "";
    }
  });
  const [password, setPassword] = useState("");
  const [rememberUser, setRememberUser] = useState(() => {
    try {
      return !!localStorage.getItem("biolink_remember_user");
    } catch {
      return false;
    }
  });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const detail = data.detail;
        throw new Error(
          typeof detail === "string" ? detail : "Usuario o contraseña incorrectos"
        );
      }

      const data = await res.json();

      if (rememberUser) {
        localStorage.setItem("biolink_remember_user", username.trim());
      } else {
        localStorage.removeItem("biolink_remember_user");
      }

      localStorage.setItem("access_token", data.access_token);

      onLoginSuccess({
        username: data.user.username,
        name: data.user.name,
        role: data.user.role,
        permissions: data.user.permissions,
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo contactar el backend (puerto 8012)."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        position: "relative",
        overflow: "hidden",
        background: "#fafafa",
      }}
    >
      {/* Blobs */}
      <div
        style={{
          position: "absolute",
          top: -160,
          left: -160,
          width: 420,
          height: 420,
          background: "rgba(239,68,68,0.15)",
          borderRadius: "50%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: -160,
          right: -160,
          width: 420,
          height: 420,
          background: "rgba(251,113,133,0.2)",
          borderRadius: "50%",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      {/* Marcas flotantes (pequeñas) */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          overflow: "hidden",
          zIndex: 0,
        }}
      >
        {BRANDS.map((brand, i) => {
          const positions = [
            { top: "6%", left: "4%" },
            { top: "10%", right: "5%" },
            { top: "28%", left: "2%" },
            { top: "34%", right: "3%" },
            { top: "55%", left: "3%" },
            { top: "62%", right: "4%" },
            { top: "78%", left: "6%" },
            { top: "82%", right: "7%" },
            { top: "44%", left: "10%" },
            { top: "18%", right: "11%" },
          ];
          const pos = positions[i % positions.length];
          return (
            <img
              key={brand.id}
              src={brand.src}
              alt={brand.alt}
              style={{
                position: "absolute",
                ...pos,
                height: 32,
                width: "auto",
                maxWidth: 72,
                objectFit: "contain",
                opacity: 0.28,
                animation: `floatBrand ${8 + (i % 4)}s ease-in-out ${i * 0.6}s infinite`,
              }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          );
        })}
      </div>

      {/* Tarjeta de login */}
      <div
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: 420,
          background: "rgba(255,255,255,0.85)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.7)",
          borderRadius: 24,
          padding: 28,
          boxShadow: "0 20px 50px rgba(200,16,46,0.12)",
          opacity: mounted ? 1 : 0,
          transform: mounted ? "translateY(0)" : "translateY(12px)",
          transition: "all 0.6s ease",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div
            style={{
              display: "inline-block",
              padding: 6,
              background: "#fff",
              borderRadius: 12,
              boxShadow: "0 4px 14px rgba(200,16,46,0.15)",
              marginBottom: 12,
            }}
          >
            <img
              src="/logo-cesar-iglesias.png"
              alt="César Iglesias"
              style={{ height: 28, width: "auto", display: "block" }}
            />
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 800,
              color: "#18181b",
              lineHeight: 1.3,
            }}
          >
            Visualizador de Ponches
            <br />
            <span style={{ color: "#c8102e" }}>César Iglesias</span>
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 11, color: "#71717a" }}>
            Consola Central para Biométricos y LocalDB
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: 12,
              background: "#fff1f2",
              border: "1px solid #fecdd3",
              borderRadius: 12,
              fontSize: 12,
              color: "#be123c",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "#52525b",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              Usuario
            </label>
            <input
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Usuario"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                fontSize: 14,
                outline: "none",
              }}
            />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 11,
                fontWeight: 600,
                color: "#52525b",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: 6,
              }}
            >
              Contraseña
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  padding: "10px 56px 10px 12px",
                  border: "1px solid #e4e4e7",
                  borderRadius: 12,
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  border: "none",
                  background: "transparent",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#71717a",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {showPassword ? "Ocultar" : "Ver"}
              </button>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 18,
              fontSize: 11,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={rememberUser}
                onChange={(e) => setRememberUser(e.target.checked)}
              />
              Recordar usuario
            </label>
            <button
              type="button"
              onClick={() => setError("La recuperación se habilitará más adelante.")}
              style={{
                border: "none",
                background: "transparent",
                color: "#c8102e",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: 11,
              }}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "11px 16px",
              background: loading ? "#d4d4d8" : "#c8102e",
              color: "#fff",
              border: "none",
              borderRadius: 12,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading ? "none" : "0 8px 20px rgba(200,16,46,0.25)",
            }}
          >
            {loading ? "Iniciando sesión..." : "Autenticar Acceso"}
          </button>
        </form>

        <p
          style={{
            marginTop: 20,
            textAlign: "center",
            fontSize: 10,
            color: "#a1a1aa",
          }}
        >
          César Iglesias · Visualizador de Ponches
        </p>
      </div>

      <style>{`
        @keyframes floatBrand {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
}