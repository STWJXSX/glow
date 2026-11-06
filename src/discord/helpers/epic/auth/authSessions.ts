/**
 * Sistema de sesiones de autenticación
 * Previene múltiples flujos de login simultáneos
 * Las sesiones caducan después de 10 minutos
 */

export interface AuthSession {
  userId: string;
  messageUrl: string;
  expiresAt: number;
}

const activeSessions = new Map<string, AuthSession>();
const SESSION_DURATION = 10 * 60 * 1000; // 10 minutos

/**
 * Crea una nueva sesión de autenticación
 */
export function createAuthSession(userId: string, messageUrl: string): void {
  activeSessions.set(userId, {
    userId,
    messageUrl,
    expiresAt: Date.now() + SESSION_DURATION,
  });
}

/**
 * Obtiene una sesión activa de un usuario
 */
export function getAuthSession(userId: string): AuthSession | null {
  const session = activeSessions.get(userId);
  
  if (!session) return null;
  
  // Verificar si la sesión ha expirado
  if (Date.now() > session.expiresAt) {
    activeSessions.delete(userId);
    return null;
  }
  
  return session;
}

/**
 * Elimina una sesión de autenticación
 */
export function clearAuthSession(userId: string): void {
  activeSessions.delete(userId);
}

/**
 * Limpia sesiones expiradas automáticamente
 */
function cleanExpiredSessions(): void {
  const now = Date.now();
  
  for (const [userId, session] of activeSessions.entries()) {
    if (now > session.expiresAt) {
      activeSessions.delete(userId);
    }
  }
}

// Limpiar sesiones expiradas cada 2 minutos
setInterval(cleanExpiredSessions, 2 * 60 * 1000);
