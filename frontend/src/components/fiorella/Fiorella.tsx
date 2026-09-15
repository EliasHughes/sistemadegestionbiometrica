// frontend/src/components/fiorella/Fiorella.tsx
import React, { useState } from 'react';

const MODULE_NAMES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/records': 'Ponches',
  '/history': 'Historial SC3',
  '/remote': 'Ponche Remoto',
  '/devices': 'Dispositivos',
  '/employees': 'Empleados',
  '/collaborators': 'Colaboradores',
  '/schedules': 'Horarios',
  '/inventory': 'Inventario Biométrico',
  '/operations': 'Operaciones Masivas',
  '/reports': 'Reportes',
  '/export': 'Exportar Datos',
  '/sync-history': 'Historial Sync',
  '/users': 'Usuarios',
  '/settings': 'Configuración',
  '/advanced-reports': 'Reportes Avanzados',
};

export interface ChatMessage {
  id: string;
  sender: 'user' | 'fiorella';
  text: string;
}

interface FiorellaProps {
  action?: string;
  x?: number;
  facing?: 'left' | 'right';
  line?: string;
  reducedMotion?: boolean;
  onSpriteClick?: () => void;
  onHide?: () => void;
  isChatOpen?: boolean;
  messages?: ChatMessage[];
  loading?: boolean;
  activeModule?: string;
  onSendMessage?: (msg: string) => void;
  onCloseChat?: () => void;
  onMinimizeChat?: () => void;
}

// Rutas corregidas apuntando a public/
const SPRITES: Record<string, string> = {
  idle: '/fiorella-idle.png',
  walk: '/fiorella-walk.png',
  jump: '/fiorella-jump.png',
  point: '/fiorella-point.png',
};

export const Fiorella: React.FC<FiorellaProps> = ({
  action = 'idle',
  x = 48,
  facing = 'right',
  line,
  onSpriteClick,
  isChatOpen = false,
  messages = [],
  loading = false,
  activeModule = '/dashboard',
  onSendMessage,
  onCloseChat,
}) => {
  const [input, setInput] = useState('');
  const [imgError, setImgError] = useState(false);

  const spanishModuleName = MODULE_NAMES[activeModule] || 'General';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    if (onSendMessage) onSendMessage(input);
    setInput('');
  };

  const spriteSrc = SPRITES[action] || SPRITES.idle;

  const containerStyle: React.CSSProperties = isChatOpen
    ? { right: '24px', bottom: '16px' }
    : { left: `${x}px`, bottom: '16px' };

  return (
    <div
      className="fixed z-50 flex flex-col items-end gap-2 pointer-events-auto select-none transition-all duration-300 ease-out"
      style={containerStyle}
    >
      {/* Ventana Flotante de Chat */}
      {isChatOpen && (
        <div className="w-80 bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="bg-red-800 text-white px-4 py-2.5 flex justify-between items-center text-sm font-semibold shadow">
            <span>Fiorella AI / {spanishModuleName}</span>
            {onCloseChat && (
              <button
                onClick={onCloseChat}
                type="button"
                className="hover:bg-red-900 text-white px-2 py-0.5 rounded font-bold transition-colors"
              >
                ✕
              </button>
            )}
          </div>

          <div className="h-72 p-3 overflow-y-auto space-y-2.5 text-xs bg-gray-50 flex flex-col">
            {messages && messages.length > 0 ? (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`max-w-[85%] p-2.5 rounded-lg text-xs leading-relaxed shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-red-700 text-white self-end ml-auto rounded-br-none'
                      : 'bg-white text-gray-800 border border-gray-200 self-start rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              ))
            ) : (
              <div className="text-gray-400 italic text-center my-auto text-[11px]">
                Sin mensajes en esta sesión.
              </div>
            )}
            {loading && (
              <div className="text-gray-400 italic text-[11px] self-start bg-gray-100 p-2 rounded">
                Fiorella está pensando...
              </div>
            )}
          </div>

          <form onSubmit={handleSubmit} className="p-2 border-t border-gray-200 flex gap-1.5 bg-white">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe un comando..."
              className="flex-1 border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-red-600 shadow-inner"
            />
            <button
              type="submit"
              disabled={loading}
              className="bg-red-700 text-white px-3 py-1.5 rounded text-xs font-semibold hover:bg-red-800 disabled:opacity-50 shadow transition-colors"
            >
              Enviar
            </button>
          </form>
        </div>
      )}

      {/* Globo de Diálogo Flotante */}
      {!isChatOpen && line && (
        <div className="bg-white text-gray-800 px-3 py-1.5 rounded-lg shadow-lg border border-gray-200 text-xs font-medium max-w-xs animate-bounce mb-1">
          {line}
        </div>
      )}

      {/* Avatar Gráfico (Sprite) */}
      <div
        onClick={onSpriteClick}
        className="cursor-pointer hover:scale-105 transition-transform duration-150 active:scale-95 flex items-center justify-center"
        title="Hablar con Fiorella"
      >
        {!imgError ? (
          <img
            src={spriteSrc}
            alt="Fiorella Avatar"
            className={`h-28 w-auto object-contain drop-shadow-md ${
              facing === 'left' ? 'scale-x-[-1]' : ''
            }`}
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-14 h-14 bg-red-700 text-white rounded-full flex items-center justify-center text-2xl font-bold shadow-lg border-2 border-white">
            🤖
          </div>
        )}
      </div>
    </div>
  );
};

export default Fiorella;