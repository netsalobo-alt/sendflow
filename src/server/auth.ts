import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, verifyPassword } from './db.ts';

const SESSION_SECRET = process.env.APP_SECRET || 'chatwoot-campaign-auth-secret-2026';

export interface AuthSession {
  userId: string;
  username: string;
  expiresAt: number;
}

export function generateSessionToken(userId: string, username: string): string {
  // 7 days session
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ userId, username, expiresAt })).toString('base64url');
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifySessionToken(token: string): AuthSession | null {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');

  if (signature !== expectedSig) return null;

  try {
    const data: AuthSession = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (Date.now() > data.expiresAt) return null;
    return data;
  } catch {
    return null;
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Não autorizado. Faça login novamente.' });
    return;
  }

  const token = authHeader.substring(7);
  const session = verifySessionToken(token);

  if (!session) {
    res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    return;
  }

  // Attach user info to request
  (req as Request & { user: AuthSession }).user = session;
  next();
}
