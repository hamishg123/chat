import { eq, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, profiles, InsertProfile } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    // Handle passwordHash for email signup
    if (user.passwordHash !== undefined) {
      values.passwordHash = user.passwordHash;
      updateSet.passwordHash = user.passwordHash;
    }

    // Handle emailVerified for email signup
    if (user.emailVerified !== undefined) {
      values.emailVerified = user.emailVerified;
      updateSet.emailVerified = user.emailVerified;
    }

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export async function getUserByEmail(email: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateEmailVerification(userId: number, verified: boolean) {
  const db = await getDb();
  if (!db) return;

  await db.update(users)
    .set({ 
      emailVerified: verified,
      emailVerificationCode: null,
      emailVerificationCodeExpiry: null,
    })
    .where(eq(users.id, userId));
}

export async function setEmailVerificationCode(userId: number, code: string, expiryMinutes: number = 15) {
  const db = await getDb();
  if (!db) return;

  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1000);
  await db.update(users)
    .set({ 
      emailVerificationCode: code,
      emailVerificationCodeExpiry: expiry,
    })
    .where(eq(users.id, userId));
}

export async function verifyEmailCode(userId: number, code: string) {
  const db = await getDb();
  if (!db) return false;

  const user = await getUserById(userId);
  if (!user) return false;

  if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
    return false;
  }

  if (!user.emailVerificationCodeExpiry || user.emailVerificationCodeExpiry < new Date()) {
    return false;
  }

  await updateEmailVerification(userId, true);
  return true;
}

export async function createProfile(profile: InsertProfile) {
  const db = await getDb();
  if (!db) return;

  const result = await db.insert(profiles).values(profile);
  return result;
}

export async function getProfileByUserId(userId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getProfileByHandle(handle: string) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateProfile(userId: number, updates: Partial<InsertProfile>) {
  const db = await getDb();
  if (!db) return;

  await db.update(profiles)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
}

export async function updateKarma(userId: number, delta: number) {
  const db = await getDb();
  if (!db) return;

  const profile = await getProfileByUserId(userId);
  if (!profile) return;

  const newKarma = Math.max(0, profile.karma + delta);
  await db.update(profiles)
    .set({ karma: newKarma, updatedAt: new Date() })
    .where(eq(profiles.userId, userId));
}
