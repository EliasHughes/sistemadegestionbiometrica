// frontend/src/components/fiorella/Fiorella.tsx

import React, {
  useEffect,
  useRef,
  useState,
} from "react";

const MODULE_NAMES: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/records": "Ponches",
  "/history": "Historial SQL",
  "/remote": "Ponche Remoto",
  "/devices": "Dispositivos",
  "/employees": "Empleados",
  "/collaborators": "Colaboradores",
  "/schedules": "Horarios",
  "/inventory": "Inventario Biométrico",
  "/operations": "Operaciones Masivas",
  "/reports": "Reportes",
  "/export": "Exportar Datos",
  "/sync-history": "Historial Sync",
  "/users": "Usuarios",
  "/settings": "Configuración",
  "/advanced-reports": "Reportes Avanzados",
};

export interface ChatMessage {
  id: string;
  sender: "user" | "fiorella";
  text: string;
}

interface FiorellaProps {
  action?: string;
  x?: number;
  facing?: "left" | "right";
  line?: string;

  reducedMotion?: boolean;

  onSpriteClick?: () => void;
  onHide?: () => void;

  isChatOpen?: boolean;

  messages?: ChatMessage[];
  loading?: boolean;

  activeModule?: string;

  onSendMessage?: (msg: string) => void;

  // NUEVO: limpiar conversación
  onClearChat?: () => void;

  onCloseChat?: () => void;
  onMinimizeChat?: () => void;
}


// ============================================================
// SPRITES
// ============================================================

const SPRITES: Record<string, string> = {
  idle: "/fiorella-idle.png",
  walk: "/fiorella-walk.png",
  jump: "/fiorella-jump.png",
  point: "/fiorella-point.png",
};


// ============================================================
// COMPONENTE
// ============================================================

export const Fiorella: React.FC<FiorellaProps> = ({
  action = "idle",
  x = 48,
  facing = "right",
  line,

  reducedMotion = false,

  onSpriteClick,
  onHide,

  isChatOpen = false,

  messages = [],
  loading = false,

  activeModule = "/dashboard",

  onSendMessage,
  onClearChat,
  onCloseChat,
  onMinimizeChat,
}) => {

  const [input, setInput] = useState("");
  const [imgError, setImgError] = useState(false);

  const messagesEndRef =
    useRef<HTMLDivElement | null>(null);


  // ============================================================
  // NOMBRE DEL MÓDULO
  // ============================================================

  const spanishModuleName =
    MODULE_NAMES[activeModule] || "General";


  // ============================================================
  // AUTO SCROLL DEL CHAT
  // ============================================================

  useEffect(() => {

    if (!isChatOpen) {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: reducedMotion
        ? "auto"
        : "smooth",
    });

  }, [
    messages,
    loading,
    isChatOpen,
    reducedMotion,
  ]);


  // ============================================================
  // ENVIAR MENSAJE
  // ============================================================

  const handleSubmit = (
    e: React.FormEvent,
  ) => {

    e.preventDefault();

    const cleanInput =
      input.trim();

    if (!cleanInput) {
      return;
    }

    if (loading) {
      return;
    }

    if (onSendMessage) {
      onSendMessage(
        cleanInput,
      );
    }

    setInput("");
  };


  // ============================================================
  // SPRITE ACTUAL
  // ============================================================

  const spriteSrc =
    SPRITES[action] ||
    SPRITES.idle;


  // ============================================================
  // POSICIÓN
  // ============================================================

  const containerStyle:
    React.CSSProperties =
      isChatOpen
        ? {
            right: "24px",
            bottom: "16px",
          }
        : {
            left: `${x}px`,
            bottom: "16px",
          };


  // ============================================================
  // RENDER
  // ============================================================

  return (

    <div
      className="
        fixed
        z-50
        flex
        flex-col
        items-end
        gap-2
        pointer-events-auto
        select-none
        transition-all
        duration-300
        ease-out
      "
      style={containerStyle}
    >

      {/* ===================================================== */}
      {/* VENTANA FLOTANTE CHAT                                */}
      {/* ===================================================== */}

      {isChatOpen && (

        <div
          className="
            w-80
            bg-white
            rounded-lg
            shadow-2xl
            border
            border-gray-200
            overflow-hidden
            flex
            flex-col
          "
        >

          {/* ================================================= */}
          {/* CABECERA                                         */}
          {/* ================================================= */}

          <div
            className="
              bg-red-800
              text-white
              px-4
              py-2.5
              flex
              justify-between
              items-center
              text-sm
              font-semibold
              shadow
            "
          >

            <span>
              Fiorella AI /{" "}
              {spanishModuleName}
            </span>


            <div
              className="
                flex
                items-center
                gap-1
              "
            >

              {/* ============================================= */}
              {/* LIMPIAR CHAT                                  */}
              {/* ============================================= */}

              {onClearChat && (

                <button
                  type="button"

                  onClick={() => {

                    const confirmar =
                      window.confirm(
                        "¿Deseas limpiar la conversación con Fiorella?",
                      );

                    if (
                      confirmar
                    ) {
                      onClearChat();
                    }

                  }}

                  title="Limpiar conversación"
                  aria-label="Limpiar conversación"

                  className="
                    hover:bg-red-900
                    text-white
                    px-2
                    py-1
                    rounded
                    font-bold
                    transition-colors
                  "
                >
                  🗑
                </button>

              )}


              {/* ============================================= */}
              {/* MINIMIZAR                                     */}
              {/* ============================================= */}

              {onMinimizeChat && (

                <button
                  type="button"

                  onClick={
                    onMinimizeChat
                  }

                  title="Minimizar chat"
                  aria-label="Minimizar chat"

                  className="
                    hover:bg-red-900
                    text-white
                    px-2
                    py-1
                    rounded
                    font-bold
                    transition-colors
                  "
                >
                  —
                </button>

              )}


              {/* ============================================= */}
              {/* CERRAR                                        */}
              {/* ============================================= */}

              {onCloseChat && (

                <button
                  type="button"

                  onClick={
                    onCloseChat
                  }

                  title="Cerrar chat"
                  aria-label="Cerrar chat"

                  className="
                    hover:bg-red-900
                    text-white
                    px-2
                    py-1
                    rounded
                    font-bold
                    transition-colors
                    text-lg
                    leading-none
                  "
                >
                  ×
                </button>

              )}

            </div>

          </div>


          {/* ================================================= */}
          {/* MENSAJES                                         */}
          {/* ================================================= */}

          <div
            className="
              h-72
              p-3
              overflow-y-auto
              space-y-2.5
              text-xs
              bg-gray-50
              flex
              flex-col
            "
          >

            {messages &&
            messages.length > 0
              ? (

                messages.map(
                  (msg) => (

                    <div
                      key={msg.id}

                      className={`
                        max-w-[85%]
                        p-2.5
                        rounded-lg
                        text-xs
                        leading-relaxed
                        shadow-sm

                        ${
                          msg.sender ===
                          "user"

                            ? `
                              bg-red-700
                              text-white
                              self-end
                              ml-auto
                              rounded-br-none
                            `

                            : `
                              bg-white
                              text-gray-800
                              border
                              border-gray-200
                              self-start
                              rounded-bl-none
                            `
                        }
                      `}
                    >

                      {msg.text}

                    </div>

                  ),
                )

              ) : (

                <div
                  className="
                    text-gray-400
                    italic
                    text-center
                    my-auto
                    text-[11px]
                  "
                >
                  Sin mensajes
                  en esta sesión.
                </div>

              )}


            {/* ============================================= */}
            {/* PENSANDO                                     */}
            {/* ============================================= */}

            {loading && (

              <div
                className="
                  text-gray-500
                  italic
                  text-[11px]
                  self-start
                  bg-gray-100
                  p-2
                  rounded
                  animate-pulse
                "
              >
                Fiorella está pensando...
              </div>

            )}


            <div
              ref={
                messagesEndRef
              }
            />

          </div>


          {/* ================================================= */}
          {/* FORMULARIO                                       */}
          {/* ================================================= */}

          <form
            onSubmit={
              handleSubmit
            }

            className="
              p-2
              border-t
              border-gray-200
              flex
              gap-1.5
              bg-white
            "
          >

            <input
              type="text"

              value={
                input
              }

              onChange={(
                e,
              ) =>
                setInput(
                  e.target.value,
                )
              }

              placeholder="Escribe un comando..."

              disabled={
                loading
              }

              autoComplete="off"

              className="
                flex-1
                border
                border-gray-300
                rounded
                px-2.5
                py-1.5
                text-xs
                focus:outline-none
                focus:border-red-600
                shadow-inner
                disabled:bg-gray-100
              "
            />


            <button
              type="submit"

              disabled={
                loading ||
                !input.trim()
              }

              className="
                bg-red-700
                text-white
                px-3
                py-1.5
                rounded
                text-xs
                font-semibold
                hover:bg-red-800
                disabled:opacity-50
                disabled:cursor-not-allowed
                shadow
                transition-colors
              "
            >
              {loading
                ? "..."
                : "Enviar"}
            </button>

          </form>

        </div>

      )}


      {/* ===================================================== */}
      {/* GLOBO DE DIÁLOGO                                     */}
      {/* ===================================================== */}

      {!isChatOpen &&
        line && (

          <div
            className="
              bg-white
              text-gray-800
              px-3
              py-1.5
              rounded-lg
              shadow-lg
              border
              border-gray-200
              text-xs
              font-medium
              max-w-xs
              animate-bounce
              mb-1
            "
          >
            {line}
          </div>

        )}


      {/* ===================================================== */}
      {/* AVATAR FIORELLA                                      */}
      {/* ===================================================== */}

      <div
        onClick={
          onSpriteClick
        }

        className="
          cursor-pointer
          hover:scale-105
          transition-transform
          duration-150
          active:scale-95
          flex
          items-center
          justify-center
          relative
        "

        title="Hablar con Fiorella"
      >

        {!imgError ? (

          <img
            src={
              spriteSrc
            }

            alt="Fiorella Avatar"

            draggable={
              false
            }

            className={`
              h-28
              w-auto
              object-contain
              drop-shadow-md

              ${
                facing ===
                "left"
                  ? "scale-x-[-1]"
                  : ""
              }
            `}

            onError={() =>
              setImgError(
                true,
              )
            }
          />

        ) : (

          <div
            className="
              w-14
              h-14
              bg-red-700
              text-white
              rounded-full
              flex
              items-center
              justify-center
              text-2xl
              font-bold
              shadow-lg
              border-2
              border-white
            "
          >
            👩
          </div>

        )}


        {/* ============================================= */}
        {/* INDICADOR IA                                  */}
        {/* ============================================= */}

        <div
          className="
            absolute
            -bottom-1
            -right-1
            w-5
            h-5
            rounded-full
            bg-white
            border
            border-gray-200
            shadow
            flex
            items-center
            justify-center
            text-[10px]
          "
          title="Fiorella AI"
        >
          ✨
        </div>

      </div>


      {/* ===================================================== */}
      {/* OCULTAR FIORELLA                                     */}
      {/* ===================================================== */}

      {onHide &&
        !isChatOpen && (

          <button
            type="button"

            onClick={(
              e,
            ) => {
              e.stopPropagation();
              onHide();
            }}

            title="Ocultar Fiorella"

            className="
              text-[10px]
              bg-white
              border
              border-gray-200
              text-gray-500
              px-2
              py-0.5
              rounded-full
              shadow-sm
              hover:text-red-700
              hover:border-red-300
              transition-colors
            "
          >
            Ocultar
          </button>

        )}

    </div>

  );
};


export default Fiorella;