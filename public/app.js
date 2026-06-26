// ══ GLOBAL STATE ══
let currentUser = null;
let currentChatId = null;
let chats = [];
let isNavOpen = false;

// ══ TOAST ══
function toast(message, duration = 3000) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = message;
  document.body.appendChild(toastEl);

  setTimeout(() => toastEl.classList.add('show'), 10);
  setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.remove(), 300);
  }, duration);
}

// ══ PAGE MANAGEMENT ══
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
  if (isNavOpen) toggleNav();
}

function showLanding() {
  showPage('landingPage');
}

function showAuth() {
  showPage('authPage');
  switchAuthTab('login');
}

function showChat() {
  if (!currentUser) {
    toast('Please login first');
    showAuth();
    return;
  }
  showPage('chatPage');
  loadUserChats();
}

// ══ NAVIGATION ══
function toggleNav() {
  const navMenu = document.getElementById('navMenu');
  const hamburger = document.querySelector('.hamburger');

  isNavOpen =!isNavOpen;

  if (isNavOpen) {
    navMenu.classList.add('active');
    hamburger.classList.add('active');
    document.body.style.overflow = 'hidden';
  } else {
    navMenu.classList.remove('active');
    hamburger.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function closeNavOnClick() {
  if (isNavOpen) toggleNav();
}

document.addEventListener('click', (e) => {
  const nav = document.querySelector('.top-nav');
  if (isNavOpen &&!nav.contains(e.target)) {
    toggleNav();
  }
});

// ══ AUTH TABS ══
function switchAuthTab(tab) {
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const tabs = document.querySelectorAll('.auth-tab');

  tabs.forEach(t => t.classList.remove('active'));

  if (tab === 'login') {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
    tabs[0].classList.add('active');
  } else {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
    tabs[1].classList.add('active');
  }
}

// ══ AUTH FUNCTIONS ══
async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentUser = data.user;
      toast('Login successful!');
      showChat();
      updateUserUI();
    } else {
      toast(data.error || 'Login failed');
    }
  } catch (err) {
    toast('Network error');
    console.error(err);
  }
}

async function handleSignup(e) {
  e.preventDefault();
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
    if (res.ok) {
      localStorage.setItem('token', data.token);
      currentUser = data.user;
      toast('Account created!');
      showChat();
      updateUserUI();
    } else {
      toast(data.error || 'Signup failed');
    }
  } catch (err) {
    toast('Network error');
    console.error(err);
  }
}

function logout() {
  localStorage.removeItem('token');
  currentUser = null;
  currentChatId = null;
  chats = [];
  showLanding();
  toast('Logged out');
  updateUserUI();
}

// ══ USER UI UPDATE ══
function updateUserUI() {
  const userInfo = document.getElementById('userInfo');
  const userName = document.getElementById('userName');
  const loginBtn = document.getElementById('loginBtn');

  if (currentUser) {
    userName.textContent = currentUser.name;
    userInfo.style.display = 'flex';
    loginBtn.style.display = 'none';
  } else {
    userInfo.style.display = 'none';
    loginBtn.style.display = 'block';
  }
}

// ══ CHAT FUNCTIONS ══
async function sendMessage() {
  if (!currentUser) {
    toast('Please login to chat');
    showAuth();
    return;
  }

  const input = document.getElementById('messageInput');
  const message = input.value.trim();
  const imageInput = document.getElementById('imageInput');
  const image = imageInput.files[0];

  if (!message &&!image) return;

  input.value = '';
  addMessageToUI('user', message, image? URL.createObjectURL(image) : null);

  const loadingId = addMessageToUI('assistant', 'Thinking...', null, true);

  try {
    let imageBase64 = null;
    if (image) imageBase64 = await fileToBase64(image);

    const token = localStorage.getItem('token');
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message,
        image: imageBase64,
        chatId: currentChatId
      })
    });

    const data = await res.json();
    removeMessage(loadingId);

    if (res.ok) {
      addMessageToUI('assistant', data.response);
      if (data.chatId) currentChatId = data.chatId;
      loadUserChats();
    } else {
      addMessageToUI('assistant', data.error || 'Something went wrong');
    }

    imageInput.value = '';
    clearImage();

  } catch (err) {
    removeMessage(loadingId);
    addMessageToUI('assistant', 'Network error. Please try again.');
    console.error(err);
  }
}

function addMessageToUI(role, content, imageUrl = null, isLoading = false) {
  const messagesDiv = document.getElementById('messages');
  const messageId = 'msg-' + Date.now();

  const messageEl = document.createElement('div');
  messageEl.className = `message ${role}`;
  messageEl.id = messageId;
  if (isLoading) messageEl.classList.add('loading');

  let html = `<div class="message-content">`;
  if (imageUrl) html += `<img src="${imageUrl}" class="message-image" alt="User image">`;
  if (content) html += `<p>${content}</p>`;
  html += `</div>`;

  messageEl.innerHTML = html;
  messagesDiv.appendChild(messageEl);
  messagesDiv.scrollTop = messagesDiv.scrollHeight;

  return messageId;
}

function removeMessage(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
  });
}

// ══ CHAT HISTORY ══
async function loadUserChats() {
  const token = localStorage.getItem('token');
  if (!token) return;

  try {
    const res = await fetch('/api/chats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      chats = await res.json();
      renderChatList();
    }
  } catch (err) {
    console.error('Failed to load chats:', err);
  }
}

function renderChatList() {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;

  chatList.innerHTML = '';

  if (chats.length === 0) {
    chatList.innerHTML = '<p class="no-chats">No chats yet</p>';
    return;
  }

  chats.forEach(chat => {
    const chatEl = document.createElement('div');
    chatEl.className = 'chat-item';
    if (chat._id === currentChatId) chatEl.classList.add('active');
    chatEl.textContent = chat.title;
    chatEl.onclick = () => loadChat(chat._id);
    chatList.appendChild(chatEl);
  });
}

async function loadChat(chatId) {
  const chat = chats.find(c => c._id === chatId);
  if (!chat) return;

  currentChatId = chatId;
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';

  chat.messages.forEach(msg => {
    addMessageToUI(msg.role, msg.content, msg.image);
  });

  renderChatList();
  document.getElementById('sidebar').classList.remove('open');
}

function newChat() {
  if (!currentUser) {
    toast('Please login first');
    showAuth();
    return;
  }

  currentChatId = null;
  document.getElementById('messages').innerHTML = `
    <div class="welcome-message">
      <h2>New Chat Started</h2>
      <p>Ask me anything!</p>
    </div>
  `;
  renderChatList();
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() {
  if (!currentUser) {
    toast('Please login first');
    showAuth();
    return;
  }
  document.getElementById('sidebar').classList.toggle('open');
}

// ══ INIT ══
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('messageInput');
  if (input) {
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' &&!e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  // Auto login check
  const token = localStorage.getItem('token');
  if (token) {
    // Backend se user verify kar sakta hai, abhi simple
    currentUser = { name: 'User' };
    updateUserUI();
  }
});

// ══ IMAGE PREVIEW ══
function previewImage(e) {
  const file = e.target.files[0];
  if (file) {
    const preview = document.getElementById('imagePreview');
    preview.src = URL.createObjectURL(file);
    preview.style.display = 'block';
  }
}

function clearImage() {
  document.getElementById('imageInput').value = '';
  document.getElementById('imagePreview').style.display = 'none';
}

// ══ DELETE CHAT ══
async function deleteChat(chatId, e) {
  e.stopPropagation(); // Parent click na ho

  if (!confirm('Delete this chat? This cannot be undone.')) return;

  const token = localStorage.getItem('token');
  try {
    const res = await fetch(`/api/chats/${chatId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      toast('Chat deleted');

      // Agar current chat delete hui toh new chat khol
      if (currentChatId === chatId) {
        newChat();
      }

      loadUserChats();
    } else {
      toast('Failed to delete chat');
    }
  } catch (err) {
    toast('Network error');
    console.error(err);
  }
}

// ══ CHAT LIST RENDER - Delete button add kiya ══
function renderChatList() {
  const chatList = document.getElementById('chatList');
  if (!chatList) return;

  chatList.innerHTML = '';

  if (chats.length === 0) {
    chatList.innerHTML = '<p class="no-chats">No chats yet</p>';
    return;
  }

  chats.forEach(chat => {
    const chatEl = document.createElement('div');
    chatEl.className = 'chat-item';
    if (chat._id === currentChatId) chatEl.classList.add('active');

    chatEl.innerHTML = `
      <div class="chat-item-content" onclick="loadChat('${chat._id}')">
        <span class="chat-title">${chat.title}</span>
      </div>
      <button class="delete-chat-btn" onclick="deleteChat('${chat._id}', event)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
      </button>
    `;

    chatList.appendChild(chatEl);
  });
}

// ══ DELETE ALL CHATS ══
async function deleteAllChats() {
  if (!confirm('Delete all chats? This cannot be undone.')) return;

  const token = localStorage.getItem('token');
  try {
    const res = await fetch('/api/chats', {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (res.ok) {
      toast('All chats deleted');
      newChat();
      loadUserChats();
    } else {
      toast('Failed to delete chats');
    }
  } catch (err) {
    toast('Network error');
    console.error(err);
  }
}

async function handleGoogleLogin(response) {
  try {
    const res = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential })
    });

    const data = await res.json();
    if (res.ok) {
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      showChatPage();
      loadUserChats();
    } else {
      toast(data.error || 'Google login failed');
    }
  } catch (err) {
    toast('Network error');
  }
}