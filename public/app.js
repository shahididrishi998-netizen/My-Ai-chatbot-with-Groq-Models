let currentUser = null;
let currentChatId = null;
let selectedImage = null;
let chats = [];

const API_URL = window.location.origin;

// ══ TOAST ══
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  t.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#333;color:#fff;padding:12px 20px;border-radius:8px;z-index:9999;';
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ══ PAGE NAVIGATION ══
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

// ══ AUTH TABS ══
function switchAuthMode(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('loginForm').style.display = mode === 'login' ? 'block' : 'none';
  document.getElementById('signupForm').style.display = mode === 'signup' ? 'block' : 'none';
}

// ══ EMAIL SIGNUP ══
async function handleEmailSignup() {
  const name = document.getElementById('signupName').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;

  if (!name || !email || !password) {
    toast('All fields required');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('velice_token', data.token);
      localStorage.setItem('velice_user', JSON.stringify(data.user));
      currentUser = data.user;
      newChat();
      showPage('chatPage');
      toast('Account created!');
    } else {
      toast(data.error || 'Signup failed');
    }
  } catch (err) {
    toast('Network error');
  }
}

// ══ EMAIL LOGIN ══
async function handleEmailLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;

  if (!email || !password) {
    toast('Email and password required');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('velice_token', data.token);
      localStorage.setItem('velice_user', JSON.stringify(data.user));
      currentUser = data.user;
      await loadChats();
      showPage('chatPage');
      toast('Login successful!');
    } else {
      toast(data.error || 'Login failed');
    }
  } catch (err) {
    toast('Network error');
  }
}

// ══ GOOGLE LOGIN ══
async function handleGoogleLogin(response) {
  try {
    const res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('velice_token', data.token);
      localStorage.setItem('velice_user', JSON.stringify(data.user));
      currentUser = data.user;
      await loadChats();
      showPage('chatPage');
      toast('Google login successful!');
    } else {
      toast(data.error || 'Google login failed');
    }
  } catch (err) {
    toast('Network error');
  }
}

// ══ CHAT FUNCTIONS ══
async function loadChats() {
  const token = localStorage.getItem('velice_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/chats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      chats = await res.json();
      if (chats.length === 0) {
        newChat();
      } else {
        currentChatId = chats[0]._id;
        renderChatList();
        renderMessages();
      }
    }
  } catch (err) {
    console.error('Load chats error:', err);
  }
}

function newChat() {
  currentChatId = null;
  const container = document.getElementById('messages');
  container.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--text-tertiary)">Start a conversation</div>';
  renderChatList();
}

function renderChatList() {
  const list = document.getElementById('chatList');
  if (!list) return;
  
  list.innerHTML = chats.map(c =>
    `<div class="chat-item ${c._id === currentChatId ? 'active' : ''}" onclick="switchChat('${c._id}')">
      ${c.title || 'New Chat'}
    </div>`
  ).join('');
}

function switchChat(id) {
  currentChatId = id;
  renderChatList();
  renderMessages();
}

async function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  const token = localStorage.getItem('velice_token');

  if (!token) {
    toast('Please login first');
    showPage('authPage');
    return;
  }

  if (!text && !selectedImage) return;

  addMessage('user', text, selectedImage);
  input.value = '';
  input.style.height = 'auto';
  const imgToSend = selectedImage;
  selectedImage = null;

  showTyping();

  try {
    const res = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: text, image: imgToSend, chatId: currentChatId })
    });
    
    hideTyping();
    const data = await res.json();
    
    if (res.ok) {
      addMessage('assistant', data.response);
      if (!currentChatId) {
        currentChatId = data.chatId;
        await loadChats();
      }
    } else {
      toast(data.error || 'Failed to get response');
    }
  } catch (err) {
    hideTyping();
    toast('Network error');
  }
}

function addMessage(role, content, image = null) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message message-${role}`;
  div.innerHTML = `
    <div class="message-bubble">
      ${image ? `<img src="${image}" style="max-width:300px;border-radius:8px;margin-bottom:8px;" alt="Uploaded">` : ''}
      ${formatMsg(content)}
    </div>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderMessages() {
  const chat = chats.find(c => c._id === currentChatId);
  const container = document.getElementById('messages');
  
  if (!chat || !chat.messages || chat.messages.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--text-tertiary)">Start a conversation</div>';
    return;
  }
  
  container.innerHTML = chat.messages.map(msg => `
    <div class="message message-${msg.role}">
      <div class="message-bubble">
        ${msg.image ? `<img src="${msg.image}" style="max-width:300px;border-radius:8px;margin-bottom:8px;" alt="Uploaded">` : ''}
        ${formatMsg(msg.content)}
      </div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

// ══ FIX: Safe formatMsg - undefined check ══
function formatMsg(text) {
  if (!text) return '';
  
  let formatted = String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    const codeId = 'code-' + Date.now() + Math.random().toString(36).substr(2, 9);
    return `<pre><div class="code-header"><span>${language}</span><button onclick="copyCode('${codeId}')">Copy</button></div><code id="${codeId}">${code.trim()}</code></pre>`;
  });

  // Inline code
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  // Bold
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Italic
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  // Links
  formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
  // Line breaks
  formatted = formatted.replace(/\n/g, '<br>');

  return formatted;
}

function copyCode(codeId) {
  const codeEl = document.getElementById(codeId);
  const text = codeEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    event.target.textContent = 'Copied!';
    setTimeout(() => event.target.textContent = 'Copy', 2000);
  });
}

function showTyping() {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.id = 'typing';
  div.className = 'message message-assistant';
  div.innerHTML = '<div class="message-bubble">Typing...</div>';
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function hideTyping() {
  document.getElementById('typing')?.remove();
}

function toggleSidebar() {
  document.getElementById('chatSidebar').classList.toggle('open');
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('velice_theme', next);
}

// ══ INIT ══
document.addEventListener('DOMContentLoaded', () => {
  // Load theme
  const theme = localStorage.getItem('velice_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  // Check auth
  const user = localStorage.getItem('velice_user');
  const token = localStorage.getItem('velice_token');
  if (user && token) {
    currentUser = JSON.parse(user);
    loadChats();
    showPage('chatPage');
  }

  // Auto-resize textarea
  const msgInput = document.getElementById('msgInput');
  if (msgInput) {
    msgInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
    
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});