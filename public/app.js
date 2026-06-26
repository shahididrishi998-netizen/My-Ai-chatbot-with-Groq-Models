let currentUser = null;
let currentChatId = null;
let chats = [];
const API_URL = window.location.origin;

const fonts = ['Inter', 'Poppins', 'Roboto', 'Montserrat', 'Open Sans'];
let currentFontIndex = 0;

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
window.showPage = (id) => {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
};

window.switchAuthMode = (mode) => {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('loginForm').style.display = mode === 'login'? 'block' : 'none';
  document.getElementById('signupForm').style.display = mode === 'signup'? 'block' : 'none';
};

// ══ AUTH ══
window.handleEmailLogin = async () => {
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      updateProfileUI();
      loadChats();
      showPage('chatPage');
    } else {
      toast(data.error || 'Login failed');
    }
  } catch (err) {
    toast('Login failed');
  }
};

window.handleEmailSignup = async () => {
  const name = document.getElementById('signupName').value;
  const email = document.getElementById('signupEmail').value;
  const password = document.getElementById('signupPassword').value;
  try {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      updateProfileUI();
      newChat();
      showPage('chatPage');
    } else {
      toast(data.error || 'Signup failed');
    }
  } catch (err) {
    toast('Signup failed');
  }
};

window.handleGoogleLogin = async (response) => {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });
    const data = await res.json();
    if (data.user) {
      currentUser = data.user;
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      updateProfileUI();
      loadChats();
      showPage('chatPage');
    } else {
      toast(data.error || 'Google login failed');
    }
  } catch (err) {
    toast('Google login failed');
  }
};

// ══ PROFILE ══
function updateProfileUI() {
  const user = JSON.parse(localStorage.getItem('user') || 'null');
  if (user) {
    document.getElementById('profileName').textContent = user.name;
    document.getElementById('profileNameFull').textContent = user.name;
    document.getElementById('profileEmail').textContent = user.email;
    document.getElementById('userAvatar').src = user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=8B5CF6&color=fff`;
  }
}

window.toggleProfileMenu = () => {
  document.getElementById('profileMenu').classList.toggle('active');
};

document.addEventListener('click', (e) => {
  const dropdown = document.querySelector('.profile-dropdown');
  if (dropdown &&!dropdown.contains(e.target)) {
    document.getElementById('profileMenu')?.classList.remove('active');
  }
});

window.logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  currentUser = null;
  currentChatId = null;
  chats = [];
  showPage('landingPage');
  toast('Logged out');
};

window.changeFont = () => {
  currentFontIndex = (currentFontIndex + 1) % fonts.length;
  document.body.style.fontFamily = fonts[currentFontIndex] + ', sans-serif';
  localStorage.setItem('velice_font', fonts[currentFontIndex]);
  toast(`Font: ${fonts[currentFontIndex]}`);
  toggleProfileMenu();
};

window.toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark'? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('velice_theme', next);
  toggleProfileMenu();
};

// ══ CHAT FUNCTIONS ══
function getCurrentChat() {
  return chats.find(c => c._id === currentChatId);
}

window.newChat = () => {
  currentChatId = null;
  const container = document.getElementById('messages');
  if (container) {
    container.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--text-tertiary)"><h2>👋 Welcome to Velice AI</h2><p>Start a new conversation</p></div>';
  }
  document.querySelectorAll('.chat-item').forEach(item => item.classList.remove('active'));
  if (window.innerWidth < 768) toggleSidebar();
  document.getElementById('msgInput')?.focus();
};

async function loadChats() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch(`${API_URL}/api/chats`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.status === 401) {
      logout();
      return;
    }

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

function renderChatList() {
  const list = document.getElementById('chatList');
  if (!list) return;

  if (chats.length === 0) {
    list.innerHTML = '<div style="padding: 1rem; color: var(--text-secondary); text-align: center;">No chats yet</div>';
    return;
  }

  list.innerHTML = chats.map(c => `
    <div class="chat-item ${c._id === currentChatId? 'active' : ''}" onclick="switchChat('${c._id}')">
      <div class="chat-item-title">${c.title || 'New Chat'}</div>
      <button class="delete-chat-btn" onclick="event.stopPropagation(); deleteChat('${c._id}')" title="Delete">🗑️</button>
    </div>
  `).join('');
}

window.switchChat = (id) => {
  currentChatId = id;
  renderChatList();
  renderMessages();
  toggleProfileMenu();
  if (window.innerWidth < 768) toggleSidebar();
};

window.deleteChat = async (chatId) => {
  if (!confirm('Delete this chat?')) return;
  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`${API_URL}/api/chats/${chatId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      chats = chats.filter(c => c._id!== chatId);
      if (currentChatId === chatId) {
        currentChatId = chats.length > 0? chats[0]._id : null;
        if (currentChatId) renderMessages();
        else newChat();
      }
      renderChatList();
      toast('Chat deleted');
    }
  } catch (err) {
    toast('Failed to delete');
  }
};

window.sendMessage = async () => {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;

  const token = localStorage.getItem('token');
  if (!token) {
    toast('Please login');
    showPage('authPage');
    return;
  }

  const chat = getCurrentChat();
  if (!chat &&!currentChatId) {
    newChat();
  }

  addMessage('user', text);
  input.value = '';
  input.style.height = 'auto';
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ message: text, chatId: currentChatId })
    });
    const data = await res.json();
    hideTyping();

    if (res.ok) {
      addMessage('assistant', data.response);
      if (!currentChatId && data.chatId) {
        currentChatId = data.chatId;
        await loadChats();
      }
    } else {
      toast(data.error || 'Failed');
    }
  } catch (err) {
    hideTyping();
    toast('Network error');
  }
};

function addMessage(role, content) {
  const container = document.getElementById('messages');
  const div = document.createElement('div');
  div.className = `message message-${role}`;
  div.innerHTML = `<div class="message-bubble">${formatMsg(content)}</div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderMessages() {
  const chat = getCurrentChat();
  const container = document.getElementById('messages');
  if (!chat ||!chat.messages || chat.messages.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:4rem;color:var(--text-tertiary)"><h2>👋 Welcome to Velice AI</h2><p>Start a new conversation</p></div>';
    return;
  }
  container.innerHTML = chat.messages.map(msg => `
    <div class="message message-${msg.role}">
      <div class="message-bubble">${formatMsg(msg.content)}</div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function formatMsg(text) {
  if (!text) return '';
  let formatted = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  formatted = formatted.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const language = lang || 'text';
    const codeId = 'code-' + Date.now() + Math.random().toString(36).substr(2, 9);
    return `<pre><div class="code-header"><span>${language}</span><button onclick="copyCode('${codeId}')">Copy</button></div><code id="${codeId}">${code.trim()}</code></pre>`;
  });
  formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
  formatted = formatted.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank">$1</a>');
  formatted = formatted.replace(/\n/g, '<br>');
  return formatted;
}

window.copyCode = function(codeId) {
  const codeEl = document.getElementById(codeId);
  const text = codeEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    event.target.textContent = 'Copied!';
    setTimeout(() => event.target.textContent = 'Copy', 2000);
  });
};

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

window.toggleSidebar = () => {
  document.getElementById('chatSidebar').classList.toggle('open');
};

// ══ INIT ══
document.addEventListener('DOMContentLoaded', () => {
  const theme = localStorage.getItem('velice_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', theme);

  const savedFont = localStorage.getItem('velice_font');
  if (savedFont) {
    document.body.style.fontFamily = savedFont + ', sans-serif';
    currentFontIndex = fonts.indexOf(savedFont);
  }

  const user = localStorage.getItem('user');
  const token = localStorage.getItem('token');
  if (user && token) {
    currentUser = JSON.parse(user);
    updateProfileUI();
    loadChats();
    showPage('chatPage');
  }

  const msgInput = document.getElementById('msgInput');
  if (msgInput) {
    msgInput.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
    msgInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' &&!e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }
});