const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

function createUserStore(baseDir) {
  const dataDir = process.env.SAJUWAR_DATA_DIR || path.join(baseDir, "data");
  const usersPath = path.join(dataDir, "users.json");

  function ensureFile() {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, "[]", "utf8");
  }

  function readUsers() {
    ensureFile();
    try {
      const parsed = JSON.parse(fs.readFileSync(usersPath, "utf8"));
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeUsers(users) {
    ensureFile();
    fs.writeFileSync(usersPath, `${JSON.stringify(users, null, 2)}\n`, "utf8");
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
    return { salt, hash };
  }

  function publicUser(user) {
    if (!user) return null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      created_at: user.created_at,
    };
  }

  function makeToken() {
    return crypto.randomBytes(32).toString("hex");
  }

  function signup({ name, email, phone, password }) {
    const safeName = String(name || "").trim();
    const safeEmail = normalizeEmail(email);
    const safePhone = String(phone || "").trim();
    if (!safeName || !safeEmail || !safePhone || !password) {
      const error = new Error("name, email, phone and password are required");
      error.status = 400;
      throw error;
    }

    const users = readUsers();
    if (users.some((user) => user.email === safeEmail)) {
      const error = new Error("이미 가입된 이메일입니다.");
      error.status = 409;
      throw error;
    }

    const passwordHash = hashPassword(password);
    const token = makeToken();
    const user = {
      id: `USER_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`,
      name: safeName,
      email: safeEmail,
      phone: safePhone,
      password_salt: passwordHash.salt,
      password_hash: passwordHash.hash,
      sessions: [{ token, created_at: new Date().toISOString() }],
      created_at: new Date().toISOString(),
    };
    users.push(user);
    writeUsers(users);
    return { user: publicUser(user), token };
  }

  function login({ email, password }) {
    const safeEmail = normalizeEmail(email);
    const users = readUsers();
    const index = users.findIndex((user) => user.email === safeEmail);
    if (index === -1) {
      const error = new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
      error.status = 401;
      throw error;
    }

    const user = users[index];
    const passwordHash = hashPassword(password, user.password_salt);
    if (passwordHash.hash !== user.password_hash) {
      const error = new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
      error.status = 401;
      throw error;
    }

    const token = makeToken();
    users[index] = {
      ...user,
      sessions: [...(user.sessions || []), { token, created_at: new Date().toISOString() }],
    };
    writeUsers(users);
    return { user: publicUser(users[index]), token };
  }

  function findByToken(token) {
    const safeToken = String(token || "").trim();
    if (!safeToken) return null;
    return publicUser(readUsers().find((user) => (user.sessions || []).some((session) => session.token === safeToken)));
  }

  function logout(token) {
    const safeToken = String(token || "").trim();
    const users = readUsers();
    let changed = false;
    const nextUsers = users.map((user) => {
      const sessions = (user.sessions || []).filter((session) => session.token !== safeToken);
      if (sessions.length !== (user.sessions || []).length) changed = true;
      return { ...user, sessions };
    });
    if (changed) writeUsers(nextUsers);
    return changed;
  }

  return { findByToken, login, logout, signup };
}

module.exports = { createUserStore };
