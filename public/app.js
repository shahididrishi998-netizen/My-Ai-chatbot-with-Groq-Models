// ================================
// VELICE AI - APP.JS (PART 1)
// ================================

const API_URL = window.location.origin;

let currentUser = null;
let currentChatId = null;
let chats = [];

const fonts = [
    "Inter",
    "Poppins",
    "Roboto",
    "Montserrat",
    "Open Sans"
];

let currentFontIndex = 0;

// ================================
// TOAST
// ================================

function toast(message, type = "info") {

    const old = document.querySelector(".toast");
    if (old) old.remove();

    const toastBox = document.createElement("div");

    toastBox.className = "toast";

    toastBox.textContent = message;

    toastBox.style.cssText = `
        position:fixed;
        right:20px;
        bottom:20px;
        padding:12px 18px;
        border-radius:10px;
        background:#1e1e1e;
        color:white;
        z-index:99999;
        font-size:14px;
        box-shadow:0 10px 25px rgba(0,0,0,.35);
    `;

    document.body.appendChild(toastBox);

    setTimeout(() => {

        toastBox.remove();

    },3000);

}

// ================================
// PAGE
// ================================

window.showPage = function(id){

    document.querySelectorAll(".page").forEach(page=>{

        page.classList.remove("active");

    });

    document.getElementById(id).classList.add("active");

};

// ================================
// AUTH TAB
// ================================

window.switchAuthMode = function(mode){

    document.querySelectorAll(".auth-tab").forEach(btn=>{

        btn.classList.remove("active");

    });

    if(event) event.target.classList.add("active");

    document.getElementById("loginForm").style.display =
        mode==="login" ? "block":"none";

    document.getElementById("signupForm").style.display =
        mode==="signup" ? "block":"none";

};

// ================================
// USER STORAGE
// ================================

function saveUser(user,token){

    currentUser = user;

    localStorage.setItem("user",JSON.stringify(user));

    localStorage.setItem("token",token);

}

function getUser(){

    return JSON.parse(localStorage.getItem("user") || "null");

}

function getToken(){

    return localStorage.getItem("token");

}

// ================================
// PROFILE UI
// ================================

function updateProfileUI(){

    const user = getUser();

    if(!user) return;

    const username =
        user.name ||
        user.username ||
        user.fullName ||
        "User";

    const email =
        user.email ||
        "";

    const avatar =
        user.avatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(username)}&background=8B5CF6&color=fff`;

    document.getElementById("profileName").textContent =
        username;

    document.getElementById("profileNameFull").textContent =
        username;

    document.getElementById("profileEmail").textContent =
        email;

    document.getElementById("userAvatar").src =
        avatar;

}

// ================================
// PROFILE MENU
// ================================

window.toggleProfileMenu=function(){

    document
    .getElementById("profileMenu")
    .classList
    .toggle("active");

};

document.addEventListener("click",(e)=>{

    const menu=document.querySelector(".profile-dropdown");

    if(menu && !menu.contains(e.target)){

        document
        .getElementById("profileMenu")
        ?.classList
        .remove("active");

    }

});

// ================================
// LOGOUT
// ================================

window.logout=function(){

    localStorage.clear();

    chats=[];

    currentUser=null;

    currentChatId=null;

    showPage("landingPage");

};

// ================================
// FONT
// ================================

window.changeFont=function(){

    currentFontIndex++;

    if(currentFontIndex>=fonts.length){

        currentFontIndex=0;

    }

    document.body.style.fontFamily=
        fonts[currentFontIndex]+",sans-serif";

    localStorage.setItem(
        "velice_font",
        fonts[currentFontIndex]
    );

    toast("Font Changed");

};

// ================================
// THEME
// ================================

window.toggleTheme=function(){

    const current=document.documentElement
    .getAttribute("data-theme");

    const next=current==="dark"
        ?"light"
        :"dark";

    document.documentElement
    .setAttribute("data-theme",next);

    localStorage.setItem(
        "velice_theme",
        next
    );

};
// ================================
// AUTH FUNCTIONS
// ================================

window.handleEmailLogin = async function () {

    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    if (!email || !password) {
        toast("Enter email and password");
        return;
    }

    try {

        const response = await fetch(`${API_URL}/api/auth/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email,
                password
            })
        });

        const data = await response.json();

        if (!response.ok) {
            toast(data.error || "Login failed");
            return;
        }

        saveUser(data.user, data.token);

        updateProfileUI();

        showPage("chatPage");

        await loadChats();

        toast("Welcome " + (data.user.name || data.user.username));

    } catch (err) {

        console.error(err);

        toast("Network Error");

    }

};

// ================================
// SIGNUP
// ================================

window.handleEmailSignup = async function () {

    const name =
        document.getElementById("signupName").value.trim();

    const email =
        document.getElementById("signupEmail").value.trim();

    const password =
        document.getElementById("signupPassword").value;

    if (!name || !email || !password) {

        toast("Fill all fields");

        return;

    }

    try {

        const response = await fetch(`${API_URL}/api/auth/signup`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                name,
                email,
                password
            })

        });

        const data = await response.json();

        if (!response.ok) {

            toast(data.error || "Signup Failed");

            return;

        }

        saveUser(data.user, data.token);

        updateProfileUI();

        showPage("chatPage");

        chats = [];

        currentChatId = null;

        newChat();

        toast("Account Created");

    } catch (err) {

        console.error(err);

        toast("Network Error");

    }

};

// ================================
// GOOGLE LOGIN
// ================================

window.handleGoogleLogin = async function (response) {

    try {

        const res = await fetch(`${API_URL}/api/auth/google`, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                credential: response.credential
            })

        });

        const data = await res.json();

        if (!res.ok) {

            toast(data.error || "Google Login Failed");

            return;

        }

        saveUser(data.user, data.token);

        updateProfileUI();

        showPage("chatPage");

        await loadChats();

        toast("Google Login Successful");

    } catch (err) {

        console.error(err);

        toast("Google Login Failed");

    }

};

// ================================
// SESSION RESTORE
// ================================

function restoreSession() {

    const token = getToken();

    const user = getUser();

    if (!token || !user)
        return;

    currentUser = user;

    updateProfileUI();

    showPage("chatPage");

    loadChats();

}

// =======================================
// CHAT HELPERS
// =======================================

function getCurrentChat() {

    return chats.find(chat => chat._id === currentChatId);

}

window.newChat = function () {

    currentChatId = null;

    document.querySelectorAll(".chat-item")
        .forEach(item => item.classList.remove("active"));

    const container = document.getElementById("messages");

    container.innerHTML = `
        <div style="text-align:center;padding:4rem;color:var(--text-tertiary)">
            <h2>👋 Welcome to Velice AI</h2>
            <p>Start a new conversation</p>
        </div>
    `;

    const input = document.getElementById("msgInput");

    if (input) {

        input.value = "";

        input.focus();

    }

    if (window.innerWidth < 969) {

        toggleSidebar();

    }

};

// =======================================
// LOAD CHATS
// =======================================

async function loadChats() {

    const token = getToken();

    if (!token) return;

    try {

        const res = await fetch(`${API_URL}/api/chats`, {

            headers: {

                Authorization: `Bearer ${token}`

            }

        });

        if (res.status === 401) {

            logout();

            return;

        }

        chats = await res.json();

        renderChatList();

        if (currentChatId) {

            const exists = chats.some(chat => chat._id === currentChatId);

            if (!exists) {

                currentChatId = null;

            }

        }

        if (!currentChatId && chats.length) {

            currentChatId = chats[0]._id;

        }

        renderMessages();

    }

    catch (err) {

        console.error(err);

    }

}

// =======================================
// CHAT LIST
// =======================================

function renderChatList() {

    const list = document.getElementById("chatList");

    if (!list) return;

    if (!chats.length) {

        list.innerHTML = `
            <div style="padding:20px;text-align:center;color:gray;">
                No Chats Yet
            </div>
        `;

        return;

    }

    list.innerHTML = chats.map(chat => `

<div
class="chat-item ${chat._id===currentChatId?"active":""}"
onclick="switchChat('${chat._id}')">

<div class="chat-item-title">

${chat.title || "New Chat"}

</div>

<button

class="delete-chat-btn"

onclick="event.stopPropagation();deleteChat('${chat._id}')">

🗑

</button>

</div>

`).join("");

}

// =======================================
// SWITCH CHAT
// =======================================

window.switchChat = function(id){

    currentChatId=id;

    renderChatList();

    renderMessages();

    if(window.innerWidth<969){

        toggleSidebar();

    }

};

// =======================================
// DELETE CHAT
// =======================================

window.deleteChat=async function(chatId){

    if(!confirm("Delete Chat?")) return;

    try{

        const res=await fetch(

            `${API_URL}/api/chats/${chatId}`,

            {

                method:"DELETE",

                headers:{

                    Authorization:`Bearer ${getToken()}`

                }

            }

        );

        if(!res.ok){

            toast("Delete Failed");

            return;

        }

        chats=chats.filter(chat=>chat._id!==chatId);

        if(currentChatId===chatId){

            currentChatId=null;

        }

        renderChatList();

        renderMessages();

        toast("Deleted");

    }

    catch(err){

        console.error(err);

    }

};

// =======================================
// MESSAGE RENDER
// =======================================

function renderMessages(){

    const container=document.getElementById("messages");

    const chat=getCurrentChat();

    if(!chat){

        container.innerHTML=`

<div style="text-align:center;padding:4rem;color:gray">

<h2>👋 Welcome</h2>

<p>Start a conversation.</p>

</div>

`;

        return;

    }

    container.innerHTML="";

    chat.messages.forEach(message=>{

        const div=document.createElement("div");

        div.className=`message message-${message.role}`;

        div.innerHTML=`

<div class="message-bubble">

${formatMsg(message.content)}

</div>

`;

        container.appendChild(div);

    });

    container.scrollTop=container.scrollHeight;

}

// =======================================
// LOCAL MESSAGE
// =======================================

function addMessage(role,content){

    const chat=getCurrentChat();

    if(chat){

        chat.messages.push({

            role,

            content

        });

    }

    const container=document.getElementById("messages");

    const div=document.createElement("div");

    div.className=`message message-${role}`;

    div.innerHTML=`

<div class="message-bubble">

${formatMsg(content)}

</div>

`;

    container.appendChild(div);

    container.scrollTop=container.scrollHeight;

}

// =======================================
// TYPING
// =======================================

function showTyping() {

    hideTyping();

    const container = document.getElementById("messages");

    const div = document.createElement("div");

    div.id = "typing";

    div.className = "message message-assistant";

    div.innerHTML = `
        <div class="message-bubble">
            Typing...
        </div>
    `;

    container.appendChild(div);

    container.scrollTop = container.scrollHeight;

}

function hideTyping() {

    document.getElementById("typing")?.remove();

}

// =======================================
// SEND MESSAGE
// =======================================

window.sendMessage = async function () {

    const input = document.getElementById("msgInput");

    const text = input.value.trim();

    if (!text) return;

    const token = getToken();

    if (!token) {

        toast("Please Login");

        showPage("authPage");

        return;

    }

    addMessage("user", text);

    input.value = "";

    input.style.height = "auto";

    showTyping();

    try {

        const response = await fetch(`${API_URL}/api/chat`, {

            method: "POST",

            headers: {

                "Content-Type": "application/json",

                Authorization: `Bearer ${token}`

            },

            body: JSON.stringify({

                message: text,

                chatId: currentChatId

            })

        });

        const data = await response.json();

        hideTyping();

        if (!response.ok) {

            toast(data.error || "Failed");

            return;

        }

        addMessage("assistant", data.response);

        // =====================
        // NEW CHAT CREATED
        // =====================

        if (!currentChatId && data.chatId) {

            currentChatId = data.chatId;

        }

        // =====================
        // RELOAD CHAT LIST
        // =====================

        await loadChats();

    }

    catch (err) {

        hideTyping();

        console.error(err);

        toast("Network Error");

    }

};

// =======================================
// ENTER KEY
// =======================================

document.addEventListener("DOMContentLoaded",()=>{

    const input=document.getElementById("msgInput");

    if(!input) return;

    input.addEventListener("keydown",(e)=>{

        if(e.key==="Enter" && !e.shiftKey){

            e.preventDefault();

            sendMessage();

        }

    });

});

// =======================================
// FORMAT MESSAGE
// =======================================

function formatMsg(text){

    if(!text) return "";

    let html=String(text)
        .replace(/&/g,"&amp;")
        .replace(/</g,"&lt;")
        .replace(/>/g,"&gt;");

    // Code Blocks
    html=html.replace(/```(\w+)?\n([\s\S]*?)```/g,(m,lang,code)=>{

        const id="code_"+Math.random().toString(36).slice(2);

        return `
<pre>
<div class="code-header">
<span>${lang||"text"}</span>
<button onclick="copyCode(event,'${id}')">
Copy
</button>
</div>

<code id="${id}">
${code.trim()}
</code>

</pre>
`;

    });

    // Inline Code
    html=html.replace(
        /`([^`]+)`/g,
        "<code>$1</code>"
    );

    // Bold
    html=html.replace(
        /\*\*(.*?)\*\*/g,
        "<strong>$1</strong>"
    );

    // Italic
    html=html.replace(
        /\*(.*?)\*/g,
        "<em>$1</em>"
    );

    // Links
    html=html.replace(
        /(https?:\/\/[^\s]+)/g,
        `<a href="$1" target="_blank">$1</a>`
    );

    // New Line
    // html=html.replace(/\n/g,"\n");

    return html;

}

// =======================================
// COPY CODE
// =======================================

window.copyCode=function(e,id){

    const code=document
        .getElementById(id)
        .innerText;

    navigator.clipboard
        .writeText(code)
        .then(()=>{

            e.target.innerText="Copied";

            setTimeout(()=>{

                e.target.innerText="Copy";

            },2000);

        });

}

// =======================================
// SIDEBAR
// =======================================

window.toggleSidebar=function(){

    if(window.innerWidth>=969) return;

    document
        .getElementById("chatSidebar")
        .classList
        .toggle("open");

}

// =======================================
// INIT
// =======================================

document.addEventListener("DOMContentLoaded",()=>{

    // Theme

    const theme=
        localStorage.getItem("velice_theme")||
        "dark";

    document.documentElement
        .setAttribute(
            "data-theme",
            theme
        );

    // Font

    const font=
        localStorage.getItem("velice_font");

    if(font){

        document.body.style.fontFamily=
            font+",sans-serif";

        currentFontIndex=
            fonts.indexOf(font);

    }

    // Restore Login

    restoreSession();

    // Auto Resize

    const input=
        document.getElementById("msgInput");

    if(input){

        input.addEventListener("input",()=>{

            input.style.height="auto";

            input.style.height=
                input.scrollHeight+"px";

        });

    }

});

// =======================================
// WINDOW DEBUG
// =======================================

window.getCurrentChat=getCurrentChat;
window.renderMessages=renderMessages;
window.renderChatList=renderChatList;
window.loadChats=loadChats;

// =======================================
// END
// =======================================