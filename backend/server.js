const express = require("express");
const cors = require("cors");
const Groq = require("groq-sdk");
require("dotenv").config({ path: "./api.env" });
const path = require("path");
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");
const { OAuth2Client } = require("google-auth-library");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

const GOOGLE_CLIENT_ID = "276271803154-ksn2heakd93bcsdr0c2plebeasgkm1s8.apps.googleusercontent.com";
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// ── MongoDB ──
mongoose.connect(process.env.MONGO_URI, { family: 4 })
  .then(() => console.log("MongoDB connected! ✅"))
  .catch(err => console.log("MongoDB error:", err.message));

// ── Schemas ──
const userSchema = new mongoose.Schema({
  googleId: String,
  email: { type: String, unique: true },
  name: String,
  picture: String,
  password: String,
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model("User", userSchema);

const chatSchema = new mongoose.Schema({
  chatId: String,
  userId: String,
  title: String,
  messages: Array,
  createdAt: { type: Date, default: Date.now }
});
const Chat = mongoose.model("Chat", chatSchema);

// ── Google Auth ──
app.post("/auth/google", async (req, res) => {
  const { credential } = req.body;
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;
    let user = await User.findOne({ googleId });
    if (!user) user = await User.create({ googleId, email, name, picture });
    res.json({ success: true, user: { id: user._id, googleId, email, name, picture } });
  } catch (err) {
    res.status(401).json({ error: "Invalid Google token" });
  }
});

// ── Email Signup ──
app.post("/auth/signup", async (req, res) => {
  const { name, email, password } = req.body;
  try {
    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ error: "Email already registered." });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed });
    res.json({ success: true, user: { id: user._id, name, email, picture: null } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Email Login ──
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user || !user.password) return res.status(401).json({ error: "Invalid email or password." });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password." });
    res.json({ success: true, user: { id: user._id, name: user.name, email, picture: user.picture } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Chat Routes ──
app.post("/chat/new", async (req, res) => {
  try {
    const { userId } = req.body;
    const chatId = uuidv4();
    await Chat.create({ chatId, userId, title: "New Chat", messages: [] });
    res.json({ chatId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat/save", async (req, res) => {
  try {
    const { chatId, messages, title } = req.body;
    await Chat.findOneAndUpdate({ chatId }, { messages, title });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/chat/:chatId", async (req, res) => {
  try {
    const chat = await Chat.findOne({ chatId: req.params.chatId });
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/chats/:userId", async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.params.userId })
      .sort({ createdAt: -1 })
      .select("chatId title createdAt");
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/chat/:chatId", async (req, res) => {
  try {
    await Chat.findOneAndDelete({ chatId: req.params.chatId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Groq + Vision ──
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const TEXT_MODELS = [
  "llama-3.3-70b-versatile",
  "llama3-70b-8192",
  "mixtral-8x7b-32768",
  "gemma2-9b-it"
];
let currentModelIndex = 0;

app.post("/chat", async (req, res) => {
  const { messages, user, image, imageText } = req.body;

  const systemPrompt = `You are a smart, concise AI assistant and your name is Velice AI.
${user ? `The user's name is ${user.name} and their email is ${user.email}. Address them by name when appropriate.` : ''}
- Answer only what is asked. No fluff.
- Be brief by default. Detail only when asked.
- For code: clean and working only.
- For real-time requests (weather, news, prices): 1-2 lines only.
- If unsure: say "I'm not sure" — never make up facts.
- Always use markdown for code, tables, and lists.
- Don't call the user name if user is don't want it. Use only when the user ask to use it or when it's appropriate or asking his name.`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // ── Vision request (image attached) ──
    if (image && image.base64) {
      const visionMessages = [
        { role: "system", content: systemPrompt },
        ...messages,
        {
          role: "user",
          content: [
            { type: "text", text: imageText || "What is in this image? Describe in detail." },
            { type: "image_url", image_url: { url: `data:${image.type};base64,${image.base64}` } }
          ]
        }
      ];

      const response = await groq.chat.completions.create({
        model: VISION_MODEL,
        messages: visionMessages,
        stream: true,
        max_tokens: 1024,
      });

      for await (const chunk of response) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    // ── Text request ──
    const finalMessages = [{ role: "system", content: systemPrompt }, ...messages];

    for (let i = 0; i < TEXT_MODELS.length; i++) {
      const model = TEXT_MODELS[(currentModelIndex + i) % TEXT_MODELS.length];
      try {
        const response = await groq.chat.completions.create({
          model,
          messages: finalMessages,
          stream: true,
        });

        currentModelIndex = (currentModelIndex + 1) % TEXT_MODELS.length;

        for await (const chunk of response) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) res.write(`data: ${JSON.stringify({ content })}\n\n`);
        }

        res.write("data: [DONE]\n\n");
        res.end();
        return;

      } catch (err) {
        if (i === TEXT_MODELS.length - 1) {
          res.write(`data: ${JSON.stringify({ content: "Couldn't generate a response, please try again." })}\n\n`);
          res.write("data: [DONE]\n\n");
          res.end();
        }
        continue;
      }
    }

  } catch (err) {
    res.write(`data: ${JSON.stringify({ content: "Something went wrong. Please try again." })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  }
});


const https = require("https");

app.post("/generate-image", async (req, res) => {
  const { prompt } = req.body;
  const body = JSON.stringify({ inputs: prompt, parameters: { num_inference_steps: 4 } });

  const options = {
    hostname: "api-inference.huggingface.co",
    path: "/models/black-forest-labs/FLUX.1-schnell",
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.HF_TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "x-wait-for-model": "true"
    }
  };

  const hfReq = https.request(options, (hfRes) => {
    if (hfRes.statusCode !== 200) {
      let errData = '';
      hfRes.on('data', d => errData += d);
      hfRes.on('end', () => { console.log("HF Error:", errData); res.status(500).json({ error: errData }); });
      return;
    }
    res.set("Content-Type", "image/jpeg");
    hfRes.pipe(res);
  });

  hfReq.on('error', (e) => { console.log("HF req error:", e.message); res.status(500).json({ error: e.message }); });
  hfReq.write(body);
  hfReq.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server chal raha hai port ${PORT} pe! 🚀`));
