// server/_core/index.ts
import "dotenv/config";
import express2 from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// shared/const.ts
var COOKIE_NAME = "app_session_id";
var ONE_YEAR_MS = 1e3 * 60 * 60 * 24 * 365;
var AXIOS_TIMEOUT_MS = 3e4;
var UNAUTHED_ERR_MSG = "Please login (10001)";
var NOT_ADMIN_ERR_MSG = "You do not have required permission (10002)";

// server/db.ts
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";

// drizzle/schema.ts
import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  longtext,
  uniqueIndex
} from "drizzle-orm/mysql-core";
var users = mysqlTable(
  "users",
  {
    id: int("id").autoincrement().primaryKey(),
    openId: varchar("openId", { length: 64 }).notNull().unique(),
    email: varchar("email", { length: 320 }).unique(),
    passwordHash: varchar("passwordHash", { length: 255 }),
    emailVerified: boolean("emailVerified").default(false).notNull(),
    emailVerificationCode: varchar("emailVerificationCode", { length: 10 }),
    emailVerificationCodeExpiry: timestamp("emailVerificationCodeExpiry"),
    loginMethod: varchar("loginMethod", { length: 64 }),
    // "google", "email"
    role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
    lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull()
  },
  (table) => ({
    emailIdx: uniqueIndex("email_idx").on(table.email)
  })
);
var profiles = mysqlTable(
  "profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().unique(),
    handle: varchar("handle", { length: 32 }).notNull().unique(),
    // @handle
    displayName: varchar("displayName", { length: 100 }).notNull(),
    bio: text("bio"),
    avatar: varchar("avatar", { length: 512 }),
    // S3 URL
    karma: int("karma").default(0).notNull(),
    // Karma points for photo sharing
    photoSharingEnabled: boolean("photoSharingEnabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    handleIdx: uniqueIndex("handle_idx").on(table.handle),
    userIdIdx: uniqueIndex("userId_idx").on(table.userId)
  })
);
var friendRequests = mysqlTable("friendRequests", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  recipientId: int("recipientId").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "rejected"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var directMessages = mysqlTable("directMessages", {
  id: int("id").autoincrement().primaryKey(),
  senderId: int("senderId").notNull(),
  recipientId: int("recipientId").notNull(),
  content: longtext("content"),
  type: mysqlEnum("type", ["text", "image"]).default("text").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  // S3 URL for images
  isRead: boolean("isRead").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var groups = mysqlTable(
  "groups",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    description: text("description"),
    avatar: varchar("avatar", { length: 512 }),
    // S3 URL
    creatorId: int("creatorId").notNull(),
    isPrivate: boolean("isPrivate").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
  },
  (table) => ({
    creatorIdx: uniqueIndex("creator_idx").on(table.creatorId)
  })
);
var groupMembers = mysqlTable("groupMembers", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["admin", "member"]).default("member").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull()
});
var groupMessages = mysqlTable("groupMessages", {
  id: int("id").autoincrement().primaryKey(),
  groupId: int("groupId").notNull(),
  senderId: int("senderId").notNull(),
  content: longtext("content"),
  type: mysqlEnum("type", ["text", "image"]).default("text").notNull(),
  imageUrl: varchar("imageUrl", { length: 512 }),
  // S3 URL for images
  createdAt: timestamp("createdAt").defaultNow().notNull()
});
var onlineStatus = mysqlTable("onlineStatus", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  isOnline: boolean("isOnline").default(false).notNull(),
  lastSeen: timestamp("lastSeen").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull()
});
var typingIndicators = mysqlTable("typingIndicators", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  chatId: varchar("chatId", { length: 100 }).notNull(),
  // Can be "dm_userId1_userId2" or "group_groupId"
  expiresAt: timestamp("expiresAt").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull()
});

// server/_core/env.ts
var ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? ""
};

// server/db.ts
var _db = null;
async function getDb() {
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
async function upsertUser(user) {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  try {
    const values = {
      openId: user.openId
    };
    const updateSet = {};
    const textFields = ["email", "loginMethod"];
    const assignNullable = (field) => {
      const value = user[field];
      if (value === void 0) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);
    if (user.lastSignedIn !== void 0) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== void 0) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = "admin";
      updateSet.role = "admin";
    }
    if (!values.lastSignedIn) {
      values.lastSignedIn = /* @__PURE__ */ new Date();
    }
    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = /* @__PURE__ */ new Date();
    }
    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}
async function getUserByOpenId(openId) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return void 0;
  }
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserByEmail(email) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getUserById(id) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateEmailVerification(userId, verified) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({
    emailVerified: verified,
    emailVerificationCode: null,
    emailVerificationCodeExpiry: null
  }).where(eq(users.id, userId));
}
async function setEmailVerificationCode(userId, code, expiryMinutes = 15) {
  const db = await getDb();
  if (!db) return;
  const expiry = new Date(Date.now() + expiryMinutes * 60 * 1e3);
  await db.update(users).set({
    emailVerificationCode: code,
    emailVerificationCodeExpiry: expiry
  }).where(eq(users.id, userId));
}
async function verifyEmailCode(userId, code) {
  const db = await getDb();
  if (!db) return false;
  const user = await getUserById(userId);
  if (!user) return false;
  if (!user.emailVerificationCode || user.emailVerificationCode !== code) {
    return false;
  }
  if (!user.emailVerificationCodeExpiry || user.emailVerificationCodeExpiry < /* @__PURE__ */ new Date()) {
    return false;
  }
  await updateEmailVerification(userId, true);
  return true;
}
async function createProfile(profile) {
  const db = await getDb();
  if (!db) return;
  const result = await db.insert(profiles).values(profile);
  return result;
}
async function getProfileByUserId(userId) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function getProfileByHandle(handle) {
  const db = await getDb();
  if (!db) return void 0;
  const result = await db.select().from(profiles).where(eq(profiles.handle, handle)).limit(1);
  return result.length > 0 ? result[0] : void 0;
}
async function updateProfile(userId, updates) {
  const db = await getDb();
  if (!db) return;
  await db.update(profiles).set({ ...updates, updatedAt: /* @__PURE__ */ new Date() }).where(eq(profiles.userId, userId));
}

// server/_core/cookies.ts
function isSecureRequest(req) {
  if (req.protocol === "https") return true;
  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;
  const protoList = Array.isArray(forwardedProto) ? forwardedProto : forwardedProto.split(",");
  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}
function getSessionCookieOptions(req) {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: isSecureRequest(req)
  };
}

// shared/_core/errors.ts
var HttpError = class extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
    this.name = "HttpError";
  }
};
var ForbiddenError = (msg) => new HttpError(403, msg);

// server/_core/sdk.ts
import axios from "axios";
import { parse as parseCookieHeader } from "cookie";
import { SignJWT, jwtVerify } from "jose";
var isNonEmptyString = (value) => typeof value === "string" && value.length > 0;
var EXCHANGE_TOKEN_PATH = `/webdev.v1.WebDevAuthPublicService/ExchangeToken`;
var GET_USER_INFO_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfo`;
var GET_USER_INFO_WITH_JWT_PATH = `/webdev.v1.WebDevAuthPublicService/GetUserInfoWithJwt`;
var OAuthService = class {
  constructor(client) {
    this.client = client;
    console.log("[OAuth] Initialized with baseURL:", ENV.oAuthServerUrl);
    if (!ENV.oAuthServerUrl) {
      console.error(
        "[OAuth] ERROR: OAUTH_SERVER_URL is not configured! Set OAUTH_SERVER_URL environment variable."
      );
    }
  }
  decodeState(state) {
    const redirectUri = atob(state);
    return redirectUri;
  }
  async getTokenByCode(code, state) {
    const payload = {
      clientId: ENV.appId,
      grantType: "authorization_code",
      code,
      redirectUri: this.decodeState(state)
    };
    const { data } = await this.client.post(
      EXCHANGE_TOKEN_PATH,
      payload
    );
    return data;
  }
  async getUserInfoByToken(token) {
    const { data } = await this.client.post(
      GET_USER_INFO_PATH,
      {
        accessToken: token.accessToken
      }
    );
    return data;
  }
};
var createOAuthHttpClient = () => axios.create({
  baseURL: ENV.oAuthServerUrl,
  timeout: AXIOS_TIMEOUT_MS
});
var SDKServer = class {
  client;
  oauthService;
  constructor(client = createOAuthHttpClient()) {
    this.client = client;
    this.oauthService = new OAuthService(this.client);
  }
  deriveLoginMethod(platforms, fallback) {
    if (fallback && fallback.length > 0) return fallback;
    if (!Array.isArray(platforms) || platforms.length === 0) return null;
    const set = new Set(
      platforms.filter((p) => typeof p === "string")
    );
    if (set.has("REGISTERED_PLATFORM_EMAIL")) return "email";
    if (set.has("REGISTERED_PLATFORM_GOOGLE")) return "google";
    if (set.has("REGISTERED_PLATFORM_APPLE")) return "apple";
    if (set.has("REGISTERED_PLATFORM_MICROSOFT") || set.has("REGISTERED_PLATFORM_AZURE"))
      return "microsoft";
    if (set.has("REGISTERED_PLATFORM_GITHUB")) return "github";
    const first = Array.from(set)[0];
    return first ? first.toLowerCase() : null;
  }
  /**
   * Exchange OAuth authorization code for access token
   * @example
   * const tokenResponse = await sdk.exchangeCodeForToken(code, state);
   */
  async exchangeCodeForToken(code, state) {
    return this.oauthService.getTokenByCode(code, state);
  }
  /**
   * Get user information using access token
   * @example
   * const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
   */
  async getUserInfo(accessToken) {
    const data = await this.oauthService.getUserInfoByToken({
      accessToken
    });
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  parseCookies(cookieHeader) {
    if (!cookieHeader) {
      return /* @__PURE__ */ new Map();
    }
    const parsed = parseCookieHeader(cookieHeader);
    return new Map(Object.entries(parsed));
  }
  getSessionSecret() {
    const secret = ENV.cookieSecret;
    return new TextEncoder().encode(secret);
  }
  /**
   * Create a session token for a Manus user openId
   * @example
   * const sessionToken = await sdk.createSessionToken(userInfo.openId);
   */
  async createSessionToken(openId, options = {}) {
    return this.signSession(
      {
        openId,
        appId: ENV.appId,
        name: options.name || ""
      },
      options
    );
  }
  async signSession(payload, options = {}) {
    const issuedAt = Date.now();
    const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
    const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1e3);
    const secretKey = this.getSessionSecret();
    return new SignJWT({
      openId: payload.openId,
      appId: payload.appId,
      name: payload.name
    }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime(expirationSeconds).sign(secretKey);
  }
  async verifySession(cookieValue) {
    if (!cookieValue) {
      console.warn("[Auth] Missing session cookie");
      return null;
    }
    try {
      const secretKey = this.getSessionSecret();
      const { payload } = await jwtVerify(cookieValue, secretKey, {
        algorithms: ["HS256"]
      });
      const { openId, appId, name } = payload;
      if (!isNonEmptyString(openId) || !isNonEmptyString(appId) || !isNonEmptyString(name)) {
        console.warn("[Auth] Session payload missing required fields");
        return null;
      }
      return {
        openId,
        appId,
        name
      };
    } catch (error) {
      console.warn("[Auth] Session verification failed", String(error));
      return null;
    }
  }
  async getUserInfoWithJwt(jwtToken) {
    const payload = {
      jwtToken,
      projectId: ENV.appId
    };
    const { data } = await this.client.post(
      GET_USER_INFO_WITH_JWT_PATH,
      payload
    );
    const loginMethod = this.deriveLoginMethod(
      data?.platforms,
      data?.platform ?? data.platform ?? null
    );
    return {
      ...data,
      platform: loginMethod,
      loginMethod
    };
  }
  async authenticateRequest(req) {
    const cookies = this.parseCookies(req.headers.cookie);
    const sessionCookie = cookies.get(COOKIE_NAME);
    const session = await this.verifySession(sessionCookie);
    if (!session) {
      throw ForbiddenError("Invalid session cookie");
    }
    const sessionUserId = session.openId;
    const signedInAt = /* @__PURE__ */ new Date();
    let user = await getUserByOpenId(sessionUserId);
    if (!user) {
      try {
        const userInfo = await this.getUserInfoWithJwt(sessionCookie ?? "");
        await upsertUser({
          openId: userInfo.openId,
          email: userInfo.email ?? null,
          loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
          lastSignedIn: signedInAt
        });
        user = await getUserByOpenId(userInfo.openId);
      } catch (error) {
        console.error("[Auth] Failed to sync user from OAuth:", error);
        throw ForbiddenError("Failed to sync user info");
      }
    }
    if (!user) {
      throw ForbiddenError("User not found");
    }
    await upsertUser({
      openId: user.openId,
      lastSignedIn: signedInAt
    });
    return user;
  }
};
var sdk = new SDKServer();

// server/_core/oauth.ts
function getQueryParam(req, key) {
  const value = req.query[key];
  return typeof value === "string" ? value : void 0;
}
function registerOAuthRoutes(app) {
  app.get("/api/oauth/callback", async (req, res) => {
    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");
    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }
    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);
      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }
      await upsertUser({
        openId: userInfo.openId,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: /* @__PURE__ */ new Date()
      });
      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        expiresInMs: ONE_YEAR_MS
      });
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}

// server/_core/systemRouter.ts
import { z } from "zod";

// server/_core/notification.ts
import { TRPCError } from "@trpc/server";
var TITLE_MAX_LENGTH = 1200;
var CONTENT_MAX_LENGTH = 2e4;
var trimValue = (value) => value.trim();
var isNonEmptyString2 = (value) => typeof value === "string" && value.trim().length > 0;
var buildEndpointUrl = (baseUrl) => {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(
    "webdevtoken.v1.WebDevService/SendNotification",
    normalizedBase
  ).toString();
};
var validatePayload = (input) => {
  if (!isNonEmptyString2(input.title)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification title is required."
    });
  }
  if (!isNonEmptyString2(input.content)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Notification content is required."
    });
  }
  const title = trimValue(input.title);
  const content = trimValue(input.content);
  if (title.length > TITLE_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification title must be at most ${TITLE_MAX_LENGTH} characters.`
    });
  }
  if (content.length > CONTENT_MAX_LENGTH) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Notification content must be at most ${CONTENT_MAX_LENGTH} characters.`
    });
  }
  return { title, content };
};
async function notifyOwner(payload) {
  const { title, content } = validatePayload(payload);
  if (!ENV.forgeApiUrl) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service URL is not configured."
    });
  }
  if (!ENV.forgeApiKey) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Notification service API key is not configured."
    });
  }
  const endpoint = buildEndpointUrl(ENV.forgeApiUrl);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${ENV.forgeApiKey}`,
        "content-type": "application/json",
        "connect-protocol-version": "1"
      },
      body: JSON.stringify({ title, content })
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.warn(
        `[Notification] Failed to notify owner (${response.status} ${response.statusText})${detail ? `: ${detail}` : ""}`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn("[Notification] Error calling notification service:", error);
    return false;
  }
}

// server/_core/trpc.ts
import { initTRPC, TRPCError as TRPCError2 } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;
var requireUser = t.middleware(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user) {
    throw new TRPCError2({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user
    }
  });
});
var protectedProcedure = t.procedure.use(requireUser);
var adminProcedure = t.procedure.use(
  t.middleware(async (opts) => {
    const { ctx, next } = opts;
    if (!ctx.user || ctx.user.role !== "admin") {
      throw new TRPCError2({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({
      ctx: {
        ...ctx,
        user: ctx.user
      }
    });
  })
);

// server/_core/systemRouter.ts
var systemRouter = router({
  health: publicProcedure.input(
    z.object({
      timestamp: z.number().min(0, "timestamp cannot be negative")
    })
  ).query(() => ({
    ok: true
  })),
  notifyOwner: adminProcedure.input(
    z.object({
      title: z.string().min(1, "title is required"),
      content: z.string().min(1, "content is required")
    })
  ).mutation(async ({ input }) => {
    const delivered = await notifyOwner(input);
    return {
      success: delivered
    };
  })
});

// server/routers.ts
import { z as z5 } from "zod";

// server/routers/friends.ts
import { z as z2 } from "zod";
import { eq as eq2, and as and2, or } from "drizzle-orm";
import { TRPCError as TRPCError3 } from "@trpc/server";
var friendsRouter = router({
  // Send friend request
  sendRequest: protectedProcedure.input(z2.object({ recipientId: z2.number() })).mutation(async ({ ctx, input }) => {
    if (input.recipientId === ctx.user.id) {
      throw new TRPCError3({
        code: "BAD_REQUEST",
        message: "Cannot send friend request to yourself"
      });
    }
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR" });
    const existing = await db.select().from(friendRequests).where(
      and2(
        eq2(friendRequests.senderId, ctx.user.id),
        eq2(friendRequests.recipientId, input.recipientId)
      )
    ).limit(1);
    if (existing.length > 0) {
      throw new TRPCError3({
        code: "CONFLICT",
        message: "Friend request already sent"
      });
    }
    await db.insert(friendRequests).values({
      senderId: ctx.user.id,
      recipientId: input.recipientId,
      status: "pending"
    });
    return { success: true };
  }),
  // Accept friend request
  acceptRequest: protectedProcedure.input(z2.object({ requestId: z2.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR" });
    const request = await db.select().from(friendRequests).where(eq2(friendRequests.id, input.requestId)).limit(1);
    if (request.length === 0) {
      throw new TRPCError3({ code: "NOT_FOUND" });
    }
    if (request[0].recipientId !== ctx.user.id) {
      throw new TRPCError3({ code: "FORBIDDEN" });
    }
    await db.update(friendRequests).set({ status: "accepted" }).where(eq2(friendRequests.id, input.requestId));
    return { success: true };
  }),
  // Reject friend request
  rejectRequest: protectedProcedure.input(z2.object({ requestId: z2.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR" });
    const request = await db.select().from(friendRequests).where(eq2(friendRequests.id, input.requestId)).limit(1);
    if (request.length === 0) {
      throw new TRPCError3({ code: "NOT_FOUND" });
    }
    if (request[0].recipientId !== ctx.user.id) {
      throw new TRPCError3({ code: "FORBIDDEN" });
    }
    await db.update(friendRequests).set({ status: "rejected" }).where(eq2(friendRequests.id, input.requestId));
    return { success: true };
  }),
  // Get pending friend requests
  getPendingRequests: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const requests = await db.select({
      id: friendRequests.id,
      senderId: friendRequests.senderId,
      senderHandle: profiles.handle,
      senderDisplayName: profiles.displayName,
      senderAvatar: profiles.avatar,
      createdAt: friendRequests.createdAt
    }).from(friendRequests).innerJoin(profiles, eq2(friendRequests.senderId, profiles.userId)).where(
      and2(
        eq2(friendRequests.recipientId, ctx.user.id),
        eq2(friendRequests.status, "pending")
      )
    );
    return requests;
  }),
  // Get friends list
  getFriends: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const friends = await db.select({
      id: friendRequests.id,
      userId: profiles.userId,
      handle: profiles.handle,
      displayName: profiles.displayName,
      avatar: profiles.avatar,
      karma: profiles.karma
    }).from(friendRequests).innerJoin(profiles, eq2(friendRequests.senderId, profiles.userId)).where(
      and2(
        eq2(friendRequests.recipientId, ctx.user.id),
        eq2(friendRequests.status, "accepted")
      )
    );
    const friendsReverse = await db.select({
      id: friendRequests.id,
      userId: profiles.userId,
      handle: profiles.handle,
      displayName: profiles.displayName,
      avatar: profiles.avatar,
      karma: profiles.karma
    }).from(friendRequests).innerJoin(profiles, eq2(friendRequests.recipientId, profiles.userId)).where(
      and2(
        eq2(friendRequests.senderId, ctx.user.id),
        eq2(friendRequests.status, "accepted")
      )
    );
    return [...friends, ...friendsReverse];
  }),
  // Remove friend
  removeFriend: protectedProcedure.input(z2.object({ friendId: z2.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError3({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(friendRequests).set({ status: "rejected" }).where(
      or(
        and2(
          eq2(friendRequests.senderId, ctx.user.id),
          eq2(friendRequests.recipientId, input.friendId)
        ),
        and2(
          eq2(friendRequests.senderId, input.friendId),
          eq2(friendRequests.recipientId, ctx.user.id)
        )
      )
    );
    return { success: true };
  })
});

// server/routers/messages.ts
import { z as z3 } from "zod";
import { eq as eq3, and as and3, or as or2, desc } from "drizzle-orm";
import { TRPCError as TRPCError4 } from "@trpc/server";
var messagesRouter = router({
  // Send direct message
  sendDM: protectedProcedure.input(z3.object({
    recipientId: z3.number(),
    content: z3.string().optional(),
    imageUrl: z3.string().url().optional()
  })).mutation(async ({ ctx, input }) => {
    if (!input.content && !input.imageUrl) {
      throw new TRPCError4({
        code: "BAD_REQUEST",
        message: "Message must have content or image"
      });
    }
    if (input.imageUrl) {
      const senderProfile = await getProfileByUserId(ctx.user.id);
      if (!senderProfile || senderProfile.karma < 10) {
        throw new TRPCError4({
          code: "FORBIDDEN",
          message: "Insufficient karma to share photos (need 10+)"
        });
      }
    }
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR" });
    const result = await db.insert(directMessages).values({
      senderId: ctx.user.id,
      recipientId: input.recipientId,
      content: input.content || null,
      type: input.imageUrl ? "image" : "text",
      imageUrl: input.imageUrl || null
    });
    return { success: true, messageId: result[0] };
  }),
  // Get direct message history
  getDMHistory: protectedProcedure.input(z3.object({
    recipientId: z3.number(),
    limit: z3.number().default(50),
    offset: z3.number().default(0)
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const messages = await db.select({
      id: directMessages.id,
      senderId: directMessages.senderId,
      senderHandle: profiles.handle,
      senderAvatar: profiles.avatar,
      content: directMessages.content,
      type: directMessages.type,
      imageUrl: directMessages.imageUrl,
      isRead: directMessages.isRead,
      createdAt: directMessages.createdAt
    }).from(directMessages).leftJoin(profiles, eq3(directMessages.senderId, profiles.userId)).where(
      or2(
        and3(
          eq3(directMessages.senderId, ctx.user.id),
          eq3(directMessages.recipientId, input.recipientId)
        ),
        and3(
          eq3(directMessages.senderId, input.recipientId),
          eq3(directMessages.recipientId, ctx.user.id)
        )
      )
    ).orderBy(desc(directMessages.createdAt)).limit(input.limit).offset(input.offset);
    return messages.reverse();
  }),
  // Get conversations list (latest message from each contact)
  getConversations: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const conversations = await db.select({
      contactId: profiles.userId,
      contactHandle: profiles.handle,
      contactDisplayName: profiles.displayName,
      contactAvatar: profiles.avatar,
      lastMessage: directMessages.content,
      lastMessageType: directMessages.type,
      lastMessageTime: directMessages.createdAt,
      unreadCount: directMessages.isRead
    }).from(directMessages).innerJoin(
      profiles,
      or2(
        eq3(directMessages.senderId, profiles.userId),
        eq3(directMessages.recipientId, profiles.userId)
      )
    ).where(
      or2(
        eq3(directMessages.senderId, ctx.user.id),
        eq3(directMessages.recipientId, ctx.user.id)
      )
    ).orderBy(desc(directMessages.createdAt));
    const seen = /* @__PURE__ */ new Set();
    return conversations.filter((conv) => {
      if (conv.contactId === ctx.user.id) return false;
      if (seen.has(conv.contactId)) return false;
      seen.add(conv.contactId);
      return true;
    });
  }),
  // Mark message as read
  markAsRead: protectedProcedure.input(z3.object({ messageId: z3.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(directMessages).set({ isRead: true }).where(
      and3(
        eq3(directMessages.id, input.messageId),
        eq3(directMessages.recipientId, ctx.user.id)
      )
    );
    return { success: true };
  }),
  // Delete message
  deleteMessage: protectedProcedure.input(z3.object({ messageId: z3.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError4({ code: "INTERNAL_SERVER_ERROR" });
    const message = await db.select().from(directMessages).where(eq3(directMessages.id, input.messageId)).limit(1);
    if (message.length === 0) {
      throw new TRPCError4({ code: "NOT_FOUND" });
    }
    if (message[0].senderId !== ctx.user.id) {
      throw new TRPCError4({ code: "FORBIDDEN" });
    }
    await db.delete(directMessages).where(eq3(directMessages.id, input.messageId));
    return { success: true };
  })
});

// server/routers/groups.ts
import { z as z4 } from "zod";
import { eq as eq4, and as and4, desc as desc2 } from "drizzle-orm";
import { TRPCError as TRPCError5 } from "@trpc/server";
var groupsRouter = router({
  // Create group
  createGroup: protectedProcedure.input(z4.object({
    name: z4.string().min(1).max(100),
    description: z4.string().max(500).optional(),
    memberIds: z4.array(z4.number())
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const result = await db.insert(groups).values({
      name: input.name,
      description: input.description,
      creatorId: ctx.user.id,
      isPrivate: false
    });
    const newGroup = await db.select().from(groups).where(and4(eq4(groups.creatorId, ctx.user.id), eq4(groups.name, input.name))).orderBy(desc2(groups.createdAt)).limit(1);
    if (newGroup.length === 0) {
      throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    }
    const groupId = newGroup[0].id;
    await db.insert(groupMembers).values({
      groupId,
      userId: ctx.user.id,
      role: "admin"
    });
    for (const memberId of input.memberIds) {
      if (memberId !== ctx.user.id) {
        await db.insert(groupMembers).values({
          groupId,
          userId: memberId,
          role: "member"
        });
      }
    }
    return { success: true, groupId };
  }),
  // Get user's groups
  getMyGroups: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const userGroups = await db.select({
      id: groups.id,
      name: groups.name,
      description: groups.description,
      avatar: groups.avatar,
      creatorId: groups.creatorId,
      isPrivate: groups.isPrivate,
      role: groupMembers.role,
      memberCount: groupMembers.id,
      createdAt: groups.createdAt
    }).from(groups).innerJoin(groupMembers, eq4(groups.id, groupMembers.groupId)).where(eq4(groupMembers.userId, ctx.user.id));
    return userGroups;
  }),
  // Get group details
  getGroup: protectedProcedure.input(z4.object({ groupId: z4.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return null;
    const membership = await db.select().from(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, ctx.user.id)
      )
    ).limit(1);
    if (membership.length === 0) {
      throw new TRPCError5({ code: "FORBIDDEN" });
    }
    const group = await db.select().from(groups).where(eq4(groups.id, input.groupId)).limit(1);
    return group[0] || null;
  }),
  // Get group members
  getMembers: protectedProcedure.input(z4.object({ groupId: z4.number() })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const members = await db.select({
      userId: profiles.userId,
      handle: profiles.handle,
      displayName: profiles.displayName,
      avatar: profiles.avatar,
      karma: profiles.karma,
      role: groupMembers.role,
      joinedAt: groupMembers.joinedAt
    }).from(groupMembers).innerJoin(profiles, eq4(groupMembers.userId, profiles.userId)).where(eq4(groupMembers.groupId, input.groupId));
    return members;
  }),
  // Send group message
  sendGroupMessage: protectedProcedure.input(z4.object({
    groupId: z4.number(),
    content: z4.string().optional(),
    imageUrl: z4.string().url().optional()
  })).mutation(async ({ ctx, input }) => {
    if (!input.content && !input.imageUrl) {
      throw new TRPCError5({
        code: "BAD_REQUEST",
        message: "Message must have content or image"
      });
    }
    if (input.imageUrl) {
      const senderProfile = await getProfileByUserId(ctx.user.id);
      if (!senderProfile || senderProfile.karma < 10) {
        throw new TRPCError5({
          code: "FORBIDDEN",
          message: "Insufficient karma to share photos (need 10+)"
        });
      }
    }
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const membership = await db.select().from(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, ctx.user.id)
      )
    ).limit(1);
    if (membership.length === 0) {
      throw new TRPCError5({ code: "FORBIDDEN" });
    }
    await db.insert(groupMessages).values({
      groupId: input.groupId,
      senderId: ctx.user.id,
      content: input.content || null,
      type: input.imageUrl ? "image" : "text",
      imageUrl: input.imageUrl || null
    });
    return { success: true };
  }),
  // Get group messages
  getMessages: protectedProcedure.input(z4.object({
    groupId: z4.number(),
    limit: z4.number().default(50),
    offset: z4.number().default(0)
  })).query(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) return [];
    const messages = await db.select({
      id: groupMessages.id,
      senderId: groupMessages.senderId,
      senderHandle: profiles.handle,
      senderDisplayName: profiles.displayName,
      senderAvatar: profiles.avatar,
      content: groupMessages.content,
      type: groupMessages.type,
      imageUrl: groupMessages.imageUrl,
      createdAt: groupMessages.createdAt
    }).from(groupMessages).leftJoin(profiles, eq4(groupMessages.senderId, profiles.userId)).where(eq4(groupMessages.groupId, input.groupId)).orderBy(desc2(groupMessages.createdAt)).limit(input.limit).offset(input.offset);
    return messages.reverse();
  }),
  // Add member to group
  addMember: protectedProcedure.input(z4.object({
    groupId: z4.number(),
    userId: z4.number()
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const adminCheck = await db.select().from(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, ctx.user.id),
        eq4(groupMembers.role, "admin")
      )
    ).limit(1);
    if (adminCheck.length === 0) {
      throw new TRPCError5({ code: "FORBIDDEN" });
    }
    const existing = await db.select().from(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, input.userId)
      )
    ).limit(1);
    if (existing.length > 0) {
      throw new TRPCError5({ code: "CONFLICT", message: "User already in group" });
    }
    await db.insert(groupMembers).values({
      groupId: input.groupId,
      userId: input.userId,
      role: "member"
    });
    return { success: true };
  }),
  // Remove member from group
  removeMember: protectedProcedure.input(z4.object({
    groupId: z4.number(),
    userId: z4.number()
  })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const adminCheck = await db.select().from(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, ctx.user.id),
        eq4(groupMembers.role, "admin")
      )
    ).limit(1);
    if (adminCheck.length === 0 && ctx.user.id !== input.userId) {
      throw new TRPCError5({ code: "FORBIDDEN" });
    }
    await db.delete(groupMembers).where(
      and4(
        eq4(groupMembers.groupId, input.groupId),
        eq4(groupMembers.userId, input.userId)
      )
    );
    return { success: true };
  }),
  // Delete group (admin only)
  deleteGroup: protectedProcedure.input(z4.object({ groupId: z4.number() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError5({ code: "INTERNAL_SERVER_ERROR" });
    const group = await db.select().from(groups).where(eq4(groups.id, input.groupId)).limit(1);
    if (group.length === 0 || group[0].creatorId !== ctx.user.id) {
      throw new TRPCError5({ code: "FORBIDDEN" });
    }
    await db.delete(groups).where(eq4(groups.id, input.groupId));
    await db.delete(groupMembers).where(eq4(groupMembers.groupId, input.groupId));
    await db.delete(groupMessages).where(eq4(groupMessages.groupId, input.groupId));
    return { success: true };
  })
});

// server/auth.ts
import crypto from "crypto";
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 1e5, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}
function verifyPassword(password, hash) {
  const [salt, storedHash] = hash.split(":");
  if (!salt || !storedHash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, 1e5, 64, "sha256").toString("hex");
  return computed === storedHash;
}
function generateVerificationCode() {
  return Math.floor(1e5 + Math.random() * 9e5).toString();
}
function generateHandleSuggestion() {
  const adjectives = ["swift", "bright", "clever", "happy", "quick", "bold", "calm", "cool", "kind", "wise"];
  const nouns = ["fox", "eagle", "lion", "tiger", "wolf", "bear", "hawk", "raven", "panda", "otter"];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 1e3);
  return `${adj}${noun}${num}`;
}

// server/email.ts
async function sendVerificationEmail(email, code) {
  try {
    console.log(`[Email] Verification code for ${email}: ${code}`);
    return true;
  } catch (error) {
    console.error("[Email] Failed to send verification email:", error);
    return false;
  }
}

// server/routers.ts
import { TRPCError as TRPCError6 } from "@trpc/server";
var appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true
      };
    }),
    // Email/password signup
    signupWithEmail: publicProcedure.input(z5.object({
      email: z5.string().email(),
      password: z5.string().min(8),
      displayName: z5.string().min(1).max(100)
    })).mutation(async ({ input }) => {
      const existingUser = await getUserByEmail(input.email);
      if (existingUser) {
        throw new TRPCError6({
          code: "CONFLICT",
          message: "Email already registered"
        });
      }
      const passwordHash = hashPassword(input.password);
      const verificationCode = generateVerificationCode();
      await upsertUser({
        openId: `email_${input.email}_${Date.now()}`,
        email: input.email,
        passwordHash,
        loginMethod: "email",
        emailVerified: false
      });
      const user = await getUserByEmail(input.email);
      if (!user) {
        throw new TRPCError6({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create user"
        });
      }
      await setEmailVerificationCode(user.id, verificationCode);
      await sendVerificationEmail(input.email, verificationCode);
      const suggestedHandle = generateHandleSuggestion();
      await createProfile({
        userId: user.id,
        handle: suggestedHandle,
        displayName: input.displayName,
        karma: 0,
        photoSharingEnabled: true
      });
      return {
        success: true,
        userId: user.id,
        message: "Verification code sent to your email"
      };
    }),
    // Verify email code
    verifyEmailCode: publicProcedure.input(z5.object({
      userId: z5.number(),
      code: z5.string()
    })).mutation(async ({ input }) => {
      const verified = await verifyEmailCode(input.userId, input.code);
      if (!verified) {
        throw new TRPCError6({
          code: "BAD_REQUEST",
          message: "Invalid or expired verification code"
        });
      }
      return { success: true };
    }),
    // Email/password login
    loginWithEmail: publicProcedure.input(z5.object({
      email: z5.string().email(),
      password: z5.string()
    })).mutation(async ({ input }) => {
      const user = await getUserByEmail(input.email);
      if (!user || !user.passwordHash) {
        throw new TRPCError6({
          code: "UNAUTHORIZED",
          message: "Invalid email or password"
        });
      }
      if (!user.emailVerified) {
        throw new TRPCError6({
          code: "FORBIDDEN",
          message: "Email not verified. Please check your email for the verification code."
        });
      }
      const passwordValid = verifyPassword(input.password, user.passwordHash);
      if (!passwordValid) {
        throw new TRPCError6({
          code: "UNAUTHORIZED",
          message: "Invalid email or password"
        });
      }
      return {
        success: true,
        userId: user.id,
        openId: user.openId
      };
    }),
    // Resend verification code
    resendVerificationCode: publicProcedure.input(z5.object({
      userId: z5.number()
    })).mutation(async ({ input }) => {
      const user = await getUserById(input.userId);
      if (!user || !user.email) {
        throw new TRPCError6({
          code: "NOT_FOUND",
          message: "User not found"
        });
      }
      const verificationCode = generateVerificationCode();
      await setEmailVerificationCode(input.userId, verificationCode);
      await sendVerificationEmail(user.email, verificationCode);
      return { success: true };
    })
  }),
  profile: router({
    // Get current user's profile
    me: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getProfileByUserId(ctx.user.id);
      return profile;
    }),
    // Get profile by handle
    getByHandle: publicProcedure.input(z5.object({ handle: z5.string() })).query(async ({ input }) => {
      const profile = await getProfileByHandle(input.handle);
      if (!profile) {
        throw new TRPCError6({
          code: "NOT_FOUND",
          message: "Profile not found"
        });
      }
      return profile;
    }),
    // Get profile by user ID
    getById: publicProcedure.input(z5.object({ userId: z5.number() })).query(async ({ input }) => {
      const profile = await getProfileByUserId(input.userId);
      if (!profile) {
        throw new TRPCError6({
          code: "NOT_FOUND",
          message: "Profile not found"
        });
      }
      return profile;
    }),
    // Update profile
    update: protectedProcedure.input(z5.object({
      handle: z5.string().min(3).max(32).optional(),
      displayName: z5.string().min(1).max(100).optional(),
      bio: z5.string().max(500).optional(),
      avatar: z5.string().url().optional()
    })).mutation(async ({ ctx, input }) => {
      if (input.handle) {
        const existingProfile = await getProfileByHandle(input.handle);
        if (existingProfile && existingProfile.userId !== ctx.user.id) {
          throw new TRPCError6({
            code: "CONFLICT",
            message: "Handle already taken"
          });
        }
      }
      await updateProfile(ctx.user.id, input);
      const updated = await getProfileByUserId(ctx.user.id);
      return updated;
    }),
    // Check if handle is available
    checkHandleAvailable: publicProcedure.input(z5.object({ handle: z5.string() })).query(async ({ input }) => {
      const profile = await getProfileByHandle(input.handle);
      return { available: !profile };
    }),
    // Get user karma
    getKarma: publicProcedure.input(z5.object({ userId: z5.number() })).query(async ({ input }) => {
      const profile = await getProfileByUserId(input.userId);
      return { karma: profile?.karma ?? 0 };
    })
  }),
  friends: friendsRouter,
  messages: messagesRouter,
  groups: groupsRouter
});

// server/_core/context.ts
async function createContext(opts) {
  let user = null;
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    user = null;
  }
  return {
    req: opts.req,
    res: opts.res,
    user
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid } from "nanoid";
import path2 from "path";
import { createServer as createViteServer } from "vite";

// vite.config.ts
import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
var PROJECT_ROOT = import.meta.dirname;
var LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
var MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
var TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}
function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }
    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;
    const targetSize = TRIM_TARGET_BYTES;
    for (let i = lines.length - 1; i >= 0; i--) {
      const lineBytes = Buffer.byteLength(`${lines[i]}
`, "utf-8");
      if (keptBytes + lineBytes > targetSize) break;
      keptLines.unshift(lines[i]);
      keptBytes += lineBytes;
    }
    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
  }
}
function writeToLogFile(source, entries) {
  if (entries.length === 0) return;
  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => {
    const ts = (/* @__PURE__ */ new Date()).toISOString();
    return `[${ts}] ${JSON.stringify(entry)}`;
  });
  fs.appendFileSync(logPath, `${lines.join("\n")}
`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}
function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",
    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }
      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true
            },
            injectTo: "head"
          }
        ]
      };
    },
    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }
        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };
        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
          return;
        }
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", () => {
          try {
            const payload = JSON.parse(body);
            handlePayload(payload);
          } catch (e) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(e) }));
          }
        });
      });
    }
  };
}
var plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime(), vitePluginManusDebugCollector()];
var vite_config_default = defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets")
    }
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1"
    ],
    fs: {
      strict: true,
      deny: ["**/.*"]
    }
  }
});

// server/_core/vite.ts
async function setupVite(app, server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...vite_config_default,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path2.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app) {
  const distPath = process.env.NODE_ENV === "development" ? path2.resolve(import.meta.dirname, "../..", "dist", "public") : path2.resolve(import.meta.dirname, "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app.use(express.static(distPath));
  app.use("*", (_req, res) => {
    res.sendFile(path2.resolve(distPath, "index.html"));
  });
}

// server/_core/index.ts
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app = express2();
  const server = createServer(app);
  app.use(express2.json({ limit: "50mb" }));
  app.use(express2.urlencoded({ limit: "50mb", extended: true }));
  registerOAuthRoutes(app);
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}
startServer().catch(console.error);
