const { cert, getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getDatabase } = require("firebase-admin/database");

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();

function getFirebaseServices() {
  const required = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "FIREBASE_DATABASE_URL",
  ];
  const missing = required.filter((name) => !process.env[name]);
  if (!ADMIN_EMAIL || missing.length) {
    const error = new Error("Admin API is not configured.");
    error.statusCode = 503;
    throw error;
  }

  const app = getApps()[0] || initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
    databaseURL: process.env.FIREBASE_DATABASE_URL,
  });

  return {
    auth: getAuth(app),
    db: getDatabase(app),
  };
}

function getBearerToken(req) {
  const header = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : "";
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch (error) { return {}; }
  }
  return {};
}

function getQuery(req) {
  const requestUrl = new URL(req.url, "http://localhost");
  return requestUrl.searchParams;
}

function accountNotFound() {
  const error = new Error("No account found.");
  error.statusCode = 404;
  return error;
}

async function findAccount(auth, db, query) {
  let authUser;
  if (query.includes("@")) {
    try {
      authUser = await auth.getUserByEmail(query.toLowerCase());
    } catch (error) {
      if (error.code === "auth/user-not-found") throw accountNotFound();
      throw error;
    }
  } else {
    if (!/^[a-z0-9_]{2,30}$/i.test(query)) throw accountNotFound();
    const usernameSnap = await db.ref("usernames/" + query.toLowerCase()).once("value");
    const usernameRecord = usernameSnap.val();
    if (!usernameRecord || !usernameRecord.uid) throw accountNotFound();
    try {
      authUser = await auth.getUser(usernameRecord.uid);
    } catch (error) {
      if (error.code === "auth/user-not-found") throw accountNotFound();
      throw error;
    }
  }

  const profileSnap = await db.ref("users/" + authUser.uid).once("value");
  const profile = profileSnap.val() || {};
  return {
    uid: authUser.uid,
    email: authUser.email || profile.email || "",
    username: profile.username || "",
    displayName: profile.displayName || "",
    isPro: profile.isPro === true,
    createdAt: profile.createdAt || authUser.metadata.creationTime || null,
    disabled: authUser.disabled === true,
  };
}

async function getDashboard(db) {
  const usersSnap = await db.ref("users").once("value");
  let totalUsers = 0;
  let proUsers = 0;
  usersSnap.forEach((child) => {
    totalUsers += 1;
    if (child.child("isPro").val() === true) proUsers += 1;
  });

  const auditSnap = await db.ref("adminAudit").limitToLast(8).once("value");
  const activity = [];
  auditSnap.forEach((child) => {
    const record = child.val();
    if (record && typeof record === "object") activity.push(record);
  });
  activity.sort((a, b) => Number(b && b.at || 0) - Number(a && a.at || 0));

  return { totalUsers, proUsers, activity };
}

module.exports = async function adminUsers(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ error: "Sign in is required." });

  let services;
  let decodedToken;
  try {
    services = getFirebaseServices();
  } catch (error) {
    console.error("Admin API configuration failed:", error);
    return res.status(error.statusCode || 503).json({ error: "Admin API is not configured." });
  }

  try {
    decodedToken = await services.auth.verifyIdToken(token, true);
  } catch (error) {
    return res.status(401).json({ error: "Your sign-in could not be verified. Sign in again and retry." });
  }

  if (String(decodedToken.email || "").toLowerCase() !== ADMIN_EMAIL) {
    return res.status(403).json({ error: "This account is not authorized to use the admin panel." });
  }

  try {
    if (req.method === "GET") {
      const query = getQuery(req);
      const action = query.get("action");
      if (action === "dashboard") {
        return res.status(200).json(await getDashboard(services.db));
      }
      return res.status(400).json({ error: "Unknown admin action." });
    }

    const body = readBody(req);
    if (body.action === "search") {
      const search = String(body.q || "").trim();
      if (search.length < 2 || search.length > 120) {
        return res.status(400).json({ error: "Enter a username or email address." });
      }
      return res.status(200).json({ user: await findAccount(services.auth, services.db, search) });
    }

    if (body.action !== "set-pro" || typeof body.isPro !== "boolean" || typeof body.uid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(body.uid)) {
      return res.status(400).json({ error: "Invalid Pro status request." });
    }

    let targetAuthUser;
    try {
      targetAuthUser = await services.auth.getUser(body.uid);
    } catch (error) {
      if (error.code === "auth/user-not-found") return res.status(404).json({ error: "No account found." });
      throw error;
    }

    const userRef = services.db.ref("users/" + targetAuthUser.uid);
    const profileSnap = await userRef.once("value");
    if (!profileSnap.exists()) return res.status(404).json({ error: "User profile not found." });
    const profile = profileSnap.val() || {};
    const wasPro = profile.isPro === true;

    if (wasPro !== body.isPro) {
      await userRef.update({ isPro: body.isPro });
      const auditRef = services.db.ref("adminAudit").push();
      try {
        await auditRef.set({
          action: body.isPro ? "grant-pro" : "remove-pro",
          targetUid: targetAuthUser.uid,
          username: profile.username || "",
          isPro: body.isPro,
          performedBy: decodedToken.email,
          at: Date.now(),
        });
      } catch (error) {
        console.error("Could not write admin audit record:", error);
      }
    }

    return res.status(200).json({
      ok: true,
      isPro: body.isPro,
      changed: wasPro !== body.isPro,
    });
  } catch (error) {
    if (error.statusCode === 404) return res.status(404).json({ error: error.message });
    if (error.statusCode === 400) return res.status(400).json({ error: error.message });
    console.error("Admin API operation failed:", error);
    return res.status(500).json({ error: "The admin request could not be completed." });
  }
};
