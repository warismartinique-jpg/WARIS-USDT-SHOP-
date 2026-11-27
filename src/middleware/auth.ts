import { Request, Response, NextFunction } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { profiles } from '../db/schema.ts';

const PRIMARY_ADMIN_EMAIL = 'warismartinique@gmail.com';

export function isConfiguredAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (normalized === PRIMARY_ADMIN_EMAIL) return true;
  const extra = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(normalized);
}

export type ProfileRecord = typeof profiles.$inferSelect;

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  profile?: ProfileRecord;
}

export async function getOrCreateProfile(
  uid: string,
  email: string,
  displayName?: string
): Promise<ProfileRecord> {
  try {
    const shouldBeAdmin = isConfiguredAdminEmail(email);
    const existing = await db
      .select()
      .from(profiles)
      .where(eq(profiles.uid, uid))
      .limit(1);

    if (existing.length > 0) {
      const current = existing[0];
      const nextRole = shouldBeAdmin ? 'admin' : current.role;
      if (current.email !== email || current.role !== nextRole) {
        const updated = await db
          .update(profiles)
          .set({
            email,
            role: nextRole,
            updatedAt: new Date(),
          })
          .where(eq(profiles.uid, uid))
          .returning();
        return updated[0];
      }
      return current;
    }

    const inserted = await db
      .insert(profiles)
      .values({
        uid,
        email,
        fullName: displayName || '',
        role: shouldBeAdmin ? 'admin' : 'client',
      })
      .onConflictDoUpdate({
        target: profiles.uid,
        set: {
          email,
          updatedAt: new Date(),
        },
      })
      .returning();

    return inserted[0];
  } catch (error) {
    console.error('Database profile sync failed:', error);
    throw new Error('Impossible de synchroniser le profil utilisateur.', { cause: error });
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentification requise : jeton manquant.' });
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken;
    const profile = await getOrCreateProfile(
      decodedToken.uid,
      decodedToken.email || '',
      decodedToken.name
    );
    req.profile = profile;
    next();
  } catch (error) {
    console.error('Error verifying Firebase ID token:', error);
    return res.status(401).json({ error: 'Session expirée ou invalide. Veuillez vous reconnecter.' });
  }
};

export const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  if (!req.profile || req.profile.role !== 'admin') {
    return res
      .status(403)
      .json({ error: 'Accès refusé : droits administrateur vérifiés requis.' });
  }
  next();
};
