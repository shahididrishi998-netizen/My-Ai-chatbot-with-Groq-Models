const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const publicPath = path.join(__dirname, '..', 'public');
app.use(express.static(publicPath));

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ══ MONGODB CONNECT ══
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI missing in environment variables');
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  });

// ══ USER MODEL ══
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String },
  avatar: { type: String, default: '' },
  googleId: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ══ CHAT MODEL ══
const chatSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  title: { type: String, default: 'New Chat' },
  messages: [{
    role: String,
    content: String,
    image: String,
    timestamp: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

const Chat = mongoose.model('Chat', chatSchema);

// ══ JWT MIDDLEWARE ══
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ══ AUTH ROUTES ══
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name ||!email ||!password) {
    return res.status(400).json({ error: 'All fields required' });
  }

  try {
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword
    });

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      token
    });

  } catch (err) {
    console.error('Signup Error:', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email ||!password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ error: 'User not found' });
    }

    if (!user.password) {
      return res.status(400).json({ error: 'Use Google login for this account' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid password' });
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: { id: user._id, name: user.name, email: user.email },
      token
    });

  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ══ GOOGLE LOGIN ══
app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body;

  if (!credential) {
    return res.status(400).json({ error: 'No credential provided' });
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture } = payload;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        avatar: picture,
        password: null
      });
    } else if (!user.googleId) {
      user.googleId = googleId;
      user.avatar = picture;
      await user.save();
    }

    const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });

    res.json({
      user: { id: user._id, name: user.name, email: user.email, avatar: user.avatar },
      token
    });

  } catch (err) {
    console.error('Google Auth Error:', err);
    res.status(400).json({ error: 'Google authentication failed' });
  }
});

// ══ CHAT ROUTES ══
app.post('/api/chat', authMiddleware, async (req, res) => {
  const { message, image, chatId } = req.body;

  if (!message &&!image) {
    return res.status(400).json({ error: 'Message or image required' });
  }

  try {
    const messages = [{ role: 'user', content: message }];
    if (image) {
      messages[0].content = [
        { type: 'text', text: message || 'What is in this image?' },
        { type: 'image_url', image_url: { url: image } }
      ];
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: image? 'llama-3.2-11b-vision-preview' : 'llama-3.3-70b-versatile',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2048
      })
    });

    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });

    const aiResponse = data.choices[0].message.content;

    let chat;
    if (chatId) {
      chat = await Chat.findById(chatId);
    }

    if (!chat) {
      chat = await Chat.create({
        userId: req.userId,
        title: message.slice(0, 30) + '...',
        messages: []
      });
    }

    chat.messages.push(
      { role: 'user', content: message, image },
      { role: 'assistant', content: aiResponse }
    );
    await chat.save();

    res.json({ response: aiResponse, chatId: chat._id });

  } catch (error) {
    console.error('Chat Error:', error);
    res.status(500).json({ error: 'Failed to get AI response' });
  }
});

app.get('/api/chats', authMiddleware, async (req, res) => {
  try {
    const chats = await Chat.find({ userId: req.userId })
   .select('title createdAt messages')
   .sort({ createdAt: -1 });
    res.json(chats);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch chats' });
  }
});

// ══ DELETE SINGLE CHAT ══
app.delete('/api/chats/:chatId', authMiddleware, async (req, res) => {
  try {
    const chat = await Chat.findOneAndDelete({
      _id: req.params.chatId,
      userId: req.userId
    });

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    res.json({ message: 'Chat deleted successfully' });
  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// ══ FRONTEND ROUTES ══
app.get('/', (req, res) => {
  res.sendFile(path.join(publicPath, 'index.html'));
});

// ══ START ══
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server: http://localhost:${PORT}`);
  console.log(`🍃 MongoDB: Connected`);
});