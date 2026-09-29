import bcrypt from "bcryptjs";
import cors from "cors";
import crypto from "crypto";
import express from "express";
import fs from "fs";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const frontendDir = path.resolve(projectRoot, "frontend");

loadEnvFile(path.join(projectRoot, ".env"));

const app = express();
const PORT = Number(process.env.PORT || 5000);
const APP_ORIGIN = process.env.APP_ORIGIN || `http://localhost:${PORT}`;
const MONGO_URI = process.env.MONGO_URI || "";
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "velice_ai";
const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
const JWT_SECRET = process.env.JWT_SECRET || "dev-only-velice-ai-secret";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
];
const SYSTEM_PROMPT = [
  "You are Velice Ai, a fast and classy AI assistant.",
  "Reply with short, efficient answers unless the user asks for depth.",
  "Use clear headings only when helpful. Prefer concise bullets for steps.",
  "When code is useful, return fenced markdown code blocks with a language label.",
  "Never produce violent, abusive, or harmful instructions. Refuse violent requests briefly and redirect safely.",
  "If the user's name is unknown, politely ask what they want to be called."
].join(" ");

let dbInstance = null;
let clientPromise = null;

app.use(cors({
  origin: APP_ORIGIN === "*" ? true : APP_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(frontendDir));

app.get("/api/health", asyncHandler(async (_req, res) => {
  res.json({
    ok: true,
    app: "Velice Ai",
    groqConfigured: Boolean(GROQ_API_KEY),
    mongoConfigured: Boolean(MONGO_URI),
    googleConfigured: Boolean(GOOGLE_CLIENT_ID)
  });
}));

app.get("/api/config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    appName: "Velice Ai"
  });
});

app.post("/api/auth/signup", asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");
  const nickname = cleanNickname(req.body.nickname) || deriveNickname(email);

  if (!isEmail(email)) {
    throw new ApiError(400, "Enter a valid email address.");
  }
  if (password.length < 6) {
    throw new ApiError(400, "Password must be at least 6 characters.");
  }

  const db = await getDb();
  const users = db.collection("users");
  const existing = await users.findOne({ email });
  if (existing) {
    throw new ApiError(409, "An account already exists with this email.");
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await users.insertOne({
    email,
    passwordHash,
    nickname,
    fontStyle: "Inter",
    authProvider: "password",
    createdAt: now,
    updatedAt: now,
    lastLoginAt: now
  });

  const user = await users.findOne({ _id: result.insertedId });
  res.status(201).json(authPayload(user));
}));

app.post("/api/auth/login", asyncHandler(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  const password = String(req.body.password || "");

  const db = await getDb();
  const users = db.collection("users");
  const user = await users.findOne({ email });
  if (!user || !user.passwordHash) {
    throw new ApiError(401, "Invalid email or password.");
  }

  const matches = await bcrypt.compare(password, user.passwordHash);
  if (!matches) {
    throw new ApiError(401, "Invalid email or password.");
  }

  await users.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
  res.json(authPayload(user));
}));

app.post("/api/auth/google", asyncHandler(async (req, res) => {
  const credential = String(req.body.credential || "");
  if (!credential) {
    throw new ApiError(400, "Google credential is missing.");
  }

  const googleProfile = await verifyGoogleCredential(credential);
  const email = normalizeEmail(googleProfile.email);
  const nickname = cleanNickname(googleProfile.name) || deriveNickname(email);
  const avatar = googleProfile.picture || "";

  const db = await getDb();
  const users = db.collection("users");
  const now = new Date();
  const update = {
    $set: {
      nickname,
      avatar,
      authProvider: "google",
      updatedAt: now,
      lastLoginAt: now
    },
    $setOnInsert: {
      email,
      fontStyle: "Inter",
      createdAt: now
    }
  };

  await users.updateOne({ email }, update, { upsert: true });
  const user = await users.findOne({ email });
  res.json(authPayload(user));
}));

app.get("/api/me", requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: publicUser(req.user) });
}));

app.patch("/api/me", requireAuth, asyncHandler(async (req, res) => {
  const nickname = cleanNickname(req.body.nickname);
  const fontStyle = cleanFontStyle(req.body.fontStyle);
  const patch = { updatedAt: new Date() };

  if (nickname) {
    patch.nickname = nickname;
  }
  if (fontStyle) {
    patch.fontStyle = fontStyle;
  }

  const db = await getDb();
  await db.collection("users").updateOne({ _id: req.user._id }, { $set: patch });
  const user = await db.collection("users").findOne({ _id: req.user._id });
  res.json({ user: publicUser(user) });
}));

app.get("/api/chats", requireAuth, asyncHandler(async (req, res) => {
  const db = await getDb();
  const chats = await db.collection("conversations")
    .find({ userId: req.user._id })
    .sort({ updatedAt: -1 })
    .project({ messages: { $slice: -1 }, title: 1, createdAt: 1, updatedAt: 1, messageCount: 1 })
    .toArray();

  res.json({ chats: chats.map(summaryChat) });
}));

app.post("/api/chats", requireAuth, asyncHandler(async (req, res) => {
  const db = await getDb();
  const now = new Date();
  const title = cleanTitle(req.body.title) || "New chat";
  const result = await db.collection("conversations").insertOne({
    userId: req.user._id,
    title,
    messages: [],
    messageCount: 0,
    createdAt: now,
    updatedAt: now
  });

  const chat = await db.collection("conversations").findOne({ _id: result.insertedId });
  res.status(201).json({ chat: summaryChat(chat) });
}));

app.get("/api/chats/:id", requireAuth, asyncHandler(async (req, res) => {
  const chat = await findOwnedChat(req.params.id, req.user._id);
  res.json({ chat: fullChat(chat) });
}));

app.delete("/api/chats/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const db = await getDb();
  await db.collection("conversations").deleteOne({ _id: id, userId: req.user._id });
  res.json({ ok: true });
}));

app.post("/api/chat", requireAuth, asyncHandler(async (req, res) => {
  const userMessage = String(req.body.message || "").trim();
  const incomingChatId = String(req.body.chatId || "").trim();

  if (!userMessage) {
    throw new ApiError(400, "Message is required.");
  }
  if (userMessage.length > 6000) {
    throw new ApiError(400, "Message is too long. Keep it under 6000 characters.");
  }

  const db = await getDb();
  const conversations = db.collection("conversations");
  const now = new Date();
  let chat = null;

  if (incomingChatId) {
    chat = await findOwnedChat(incomingChatId, req.user._id);
  } else {
    const result = await conversations.insertOne({
      userId: req.user._id,
      title: makeChatTitle(userMessage),
      messages: [],
      messageCount: 0,
      createdAt: now,
      updatedAt: now
    });
    chat = await conversations.findOne({ _id: result.insertedId });
  }

  const previousMessages = (chat.messages || []).slice(-12).map((message) => ({
    role: message.role,
    content: message.content
  }));

  const groqMessages = [
    { role: "system", content: SYSTEM_PROMPT },
    ...previousMessages,
    { role: "user", content: userMessage }
  ];

  const assistantContent = await callGroq(groqMessages);
  const userEntry = {
    id: crypto.randomUUID(),
    role: "user",
    content: userMessage,
    createdAt: now
  };
  const assistantEntry = {
    id: crypto.randomUUID(),
    role: "assistant",
    content: assistantContent,
    structured: structureResponse(assistantContent),
    createdAt: new Date()
  };

  await conversations.updateOne(
    { _id: chat._id, userId: req.user._id },
    {
      $push: { messages: { $each: [userEntry, assistantEntry] } },
      $inc: { messageCount: 2 },
      $set: {
        updatedAt: new Date(),
        title: chat.messageCount ? chat.title : makeChatTitle(userMessage)
      }
    }
  );

  const updatedChat = await conversations.findOne({ _id: chat._id, userId: req.user._id });
  res.json({
    chat: summaryChat(updatedChat),
    messages: [userEntry, assistantEntry],
    assistant: assistantEntry
  });
}));

app.use("/api", (_req, res) => {
  res.status(404).json({
    error: {
      message: "API route not found.",
      details: null
    }
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = status >= 500 ? "Something went wrong on the server." : err.message;
  if (status >= 500) {
    console.error(err);
  }
  res.status(status).json({
    error: {
      message,
      details: err.details || null
    }
  });
});

app.listen(PORT, () => {
  console.log(`Velice Ai is running at http://localhost:${PORT}`);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const rows = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const row of rows) {
    const line = row.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalIndex = line.indexOf("=");
    if (equalIndex === -1) {
      continue;
    }

    const key = line.slice(0, equalIndex).trim();
    let value = line.slice(equalIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function getDb() {
  if (dbInstance) {
    return dbInstance;
  }
  if (!MONGO_URI) {
    throw new ApiError(500, "MongoDB is not configured. Add MONGO_URI to .env.");
  }
  if (!clientPromise) {
    const client = new MongoClient(MONGO_URI);
    clientPromise = client.connect().then(async (connectedClient) => {
      const db = connectedClient.db(MONGO_DB_NAME);
      await db.collection("users").createIndex({ email: 1 }, { unique: true });
      await db.collection("conversations").createIndex({ userId: 1, updatedAt: -1 });
      return db;
    });
  }
  dbInstance = await clientPromise;
  return dbInstance;
}

async function callGroq(messages) {
  if (!GROQ_API_KEY) {
    throw new ApiError(500, "Groq is not configured. Add GROQ_API_KEY to .env.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "groq-compound",
      messages,
      temperature: 0.35,
      max_tokens: 900
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new ApiError(502, "Groq request failed.", {
      status: response.status,
      body: body.slice(0, 500)
    });
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  return String(content || "I could not generate a response. Try again.").trim();
}

async function verifyGoogleCredential(credential) {
  if (!GOOGLE_CLIENT_ID) {
    throw new ApiError(500, "Google OAuth is not configured. Add GOOGLE_CLIENT_ID to .env.");
  }

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new ApiError(401, "Google sign-in failed.");
  }

  const payload = await response.json();
  if (payload.aud !== GOOGLE_CLIENT_ID) {
    throw new ApiError(401, "Google credential audience does not match this app.");
  }
  if (payload.email_verified !== "true" && payload.email_verified !== true) {
    throw new ApiError(401, "Google email is not verified.");
  }

  return payload;
}

async function requireAuth(req, _res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      throw new ApiError(401, "Authentication required.");
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const db = await getDb();
    const user = await db.collection("users").findOne({ _id: new ObjectId(decoded.sub) });
    if (!user) {
      throw new ApiError(401, "User no longer exists.");
    }

    req.user = user;
    next();
  } catch (error) {
    next(error.status ? error : new ApiError(401, "Invalid or expired session."));
  }
}

function structureResponse(content) {
  const codeBlocks = [];
  let text = String(content || "").replace(/```([a-zA-Z0-9_+#.-]*)\s*([\s\S]*?)```/g, (_match, language, code) => {
    const placeholder = `[[VELICE_CODE_${codeBlocks.length}]]`;
    codeBlocks.push({
      id: codeBlocks.length,
      language: language || "text",
      code: String(code || "").trim()
    });
    return placeholder;
  });

  const links = Array.from(new Set((content.match(/https?:\/\/[^\s)]+/g) || []).map((url) => url.replace(/[.,;]+$/, ""))));
  const tags = Array.from(new Set((content.match(/#[a-zA-Z0-9_-]+/g) || []).map((tag) => tag.toLowerCase())));
  const hasList = /(^|\n)\s*[-*]\s+/.test(content);
  const kind = codeBlocks.length && text.trim() ? "mixed" : codeBlocks.length ? "code" : links.length ? "links" : "information";

  text = text
    .split(/\[\[VELICE_CODE_\d+\]\]/)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    kind,
    text,
    codeBlocks,
    links,
    tags,
    sections: {
      information: text,
      code: codeBlocks,
      links,
      tags,
      listDetected: hasList
    }
  };
}

async function findOwnedChat(id, userId) {
  const objectId = toObjectId(id);
  const db = await getDb();
  const chat = await db.collection("conversations").findOne({ _id: objectId, userId });
  if (!chat) {
    throw new ApiError(404, "Chat not found.");
  }
  return chat;
}

function toObjectId(id) {
  if (!ObjectId.isValid(id)) {
    throw new ApiError(400, "Invalid chat id.");
  }
  return new ObjectId(id);
}

function authPayload(user) {
  return {
    token: jwt.sign({ sub: user._id.toString(), email: user.email }, JWT_SECRET, { expiresIn: "7d" }),
    user: publicUser(user)
  };
}

function publicUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    nickname: user.nickname || deriveNickname(user.email),
    avatar: user.avatar || "",
    fontStyle: user.fontStyle || "Inter",
    authProvider: user.authProvider || "password"
  };
}

function summaryChat(chat) {
  const lastMessage = Array.isArray(chat.messages) ? chat.messages[chat.messages.length - 1] : null;
  return {
    id: chat._id.toString(),
    title: chat.title || "New chat",
    preview: lastMessage ? String(lastMessage.content || "").slice(0, 110) : "No messages yet",
    messageCount: chat.messageCount || 0,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt
  };
}

function fullChat(chat) {
  return {
    ...summaryChat(chat),
    messages: chat.messages || []
  };
}

function makeChatTitle(message) {
  const title = cleanTitle(message) || "New chat";
  return title.length > 54 ? `${title.slice(0, 51)}...` : title;
}

function cleanTitle(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 80);
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function cleanNickname(value) {
  return String(value || "")
    .replace(/[<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

function cleanFontStyle(value) {
  const allowed = new Set(["Inter", "Sora", "Poppins", "Space Grotesk", "Fira Code"]);
  return allowed.has(value) ? value : "";
}

function deriveNickname(email) {
  const local = String(email || "").split("@")[0] || "Velice User";
  const words = local.replace(/[._-]+/g, " ").split(" ").filter(Boolean);
  const name = words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
  return name || "Velice User";
}

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
