// 过期警报 · 认证模块
// 所有认证操作通过 /api/auth 接口完成，前端不直接连接 Supabase
// 会话信息以 base64 编码的 JSON 存在 localStorage 中，作为 Bearer Token 传递

const SESSION_KEY = "expiry-alert-session";
let currentUser = null;
let authCallbacks = [];

// ── 对外暴露的 AuthAPI ──

const AuthAPI = {
  get user() {
    return currentUser;
  },

  get isLoggedIn() {
    return currentUser !== null;
  },

  get isGuest() {
    return currentUser !== null && currentUser.isGuest;
  },

  get userId() {
    return currentUser ? currentUser.id : null;
  },

  onAuthChange(callback) {
    authCallbacks.push(callback);
    if (currentUser) {
      callback(currentUser);
    }
    return () => {
      authCallbacks = authCallbacks.filter((cb) => cb !== callback);
    };
  },

  login,
  register,
  guestLogin,
  logout
};

// ── 会话 Token 工具 ──

function encodeSession(user) {
  const payload = JSON.stringify({ userId: user.id, username: user.username, isGuest: user.isGuest });
  return btoa(unescape(encodeURIComponent(payload)));
}

// 获取 Authorization header（给 /api/foods 等接口用）
AuthAPI.getAuthHeader = function () {
  const session = loadSession();
  if (!session) return null;
  return "Bearer " + encodeSession(session);
};

// ── 核心操作 ──

async function safeJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `服务器返回非 JSON 响应 (HTTP ${res.status})`);
  }
}

async function login(email, password) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "login", email, password })
  });

  const data = await safeJson(res);
  if (data.error) throw new Error(data.error);

  const user = parseUser(data.user);
  currentUser = user;
  saveSession(user);
  notifyListeners(user);
  return user;
}

async function register(username, email, password) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "register", username, email, password })
  });

  const data = await safeJson(res);
  if (data.error) throw new Error(data.error);

  const user = parseUser(data.user);
  currentUser = user;
  saveSession(user);
  notifyListeners(user);
  return user;
}

async function guestLogin() {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "guest" })
  });

  const data = await safeJson(res);
  if (data.error) throw new Error(data.error);

  const user = parseUser(data.user);
  currentUser = user;
  saveSession(user);
  notifyListeners(user);
  return user;
}

async function logout() {
  currentUser = null;
  clearSession();
  // 退出时清除本地食材缓存，避免旧数据在重新登录时覆盖云端
  try {
    localStorage.removeItem("expiry-alert-foods-v2");
  } catch {
    // 忽略
  }
  notifyListeners(null);
}

// ── 会话管理（localStorage） ──

function parseUser(rpcUser) {
  return {
    id: rpcUser.id,
    username: rpcUser.username,
    email: rpcUser.email || null,
    displayName: rpcUser.username,
    isGuest: rpcUser.is_guest || false,
    createdAt: rpcUser.created_at
  };
}

function saveSession(user) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  } catch {
    // 忽略
  }
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // 忽略
  }
}

// ── 初始化 ──

function initAuth() {
  const saved = loadSession();
  if (saved && saved.id) {
    currentUser = saved;
    notifyListeners(currentUser);
  }
}

function notifyListeners(user) {
  authCallbacks.forEach((cb) => {
    try {
      cb(user);
    } catch (err) {
      console.warn("auth callback error:", err);
    }
  });
}

initAuth();

// ── Auth UI：登录弹窗 ──

function showAuthModal() {
  if (document.getElementById("auth-overlay")) {
    return;
  }

  const overlay = document.createElement("div");
  overlay.id = "auth-overlay";
  overlay.className = "auth-overlay";

  overlay.innerHTML = `
    <div class="auth-modal" role="dialog" aria-label="登录或注册">
      <button class="auth-close" id="auth-close-btn" type="button" aria-label="关闭">&times;</button>

      <h2>欢迎使用过期警报</h2>

      <div class="auth-tabs">
        <button class="auth-tab active" data-tab="login" type="button" id="auth-tab-login">登录</button>
        <button class="auth-tab" data-tab="register" type="button" id="auth-tab-register">注册</button>
      </div>

      <!-- 登录表单 -->
      <form class="auth-form active" id="auth-form-login" autocomplete="on">
        <div class="auth-field">
          <label for="login-email">邮箱</label>
          <input id="login-email" type="email" placeholder="your@email.com" required autocomplete="email" />
        </div>
        <div class="auth-field">
          <label for="login-password">密码</label>
          <input id="login-password" type="password" placeholder="至少 6 位" required minlength="6" autocomplete="current-password" />
        </div>
        <div class="auth-error" id="auth-error-login"></div>
        <button class="auth-submit" type="submit">登录</button>
      </form>

      <!-- 注册表单 -->
      <form class="auth-form" id="auth-form-register" autocomplete="on">
        <div class="auth-field">
          <label for="register-username">用户名</label>
          <input id="register-username" type="text" placeholder="给自己起个名字" required autocomplete="username" />
        </div>
        <div class="auth-field">
          <label for="register-email">邮箱</label>
          <input id="register-email" type="email" placeholder="your@email.com" required autocomplete="email" />
        </div>
        <div class="auth-field">
          <label for="register-password">密码</label>
          <input id="register-password" type="password" placeholder="至少 6 位" required minlength="6" autocomplete="new-password" />
        </div>
        <div class="auth-field">
          <label for="register-confirm">确认密码</label>
          <input id="register-confirm" type="password" placeholder="再次输入密码" required minlength="6" autocomplete="new-password" />
        </div>
        <div class="auth-error" id="auth-error-register"></div>
        <button class="auth-submit" type="submit">注册</button>
      </form>

      <div class="auth-divider"><span>或</span></div>

      <button class="auth-guest" id="auth-guest-btn" type="button">
        游客模式进入
      </button>
      <p class="auth-guest-hint">无需注册，数据保存在云端，随时可用。</p>
    </div>
  `;

  document.body.appendChild(overlay);
  bindAuthModalEvents(overlay);
}

function bindAuthModalEvents(overlay) {
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) closeAuthModal();
  });
  document.getElementById("auth-close-btn").addEventListener("click", closeAuthModal);
  document.getElementById("auth-tab-login").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("auth-tab-register").addEventListener("click", () => switchAuthTab("register"));
  document.getElementById("auth-form-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitLogin();
  });
  document.getElementById("auth-form-register").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitRegister();
  });
  document.getElementById("auth-guest-btn").addEventListener("click", async () => {
    await submitGuest();
  });
}

function closeAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) overlay.remove();
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((el) => el.classList.toggle("active", el.dataset.tab === tab));
  document.querySelectorAll(".auth-form").forEach((form) => form.classList.toggle("active", form.id === `auth-form-${tab}`));
}

function showAuthError(tab, message) {
  const el = document.getElementById(`auth-error-${tab}`);
  if (el) {
    el.textContent = message;
    el.style.display = message ? "block" : "none";
  }
}

async function submitLogin() {
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  showAuthError("login", "");
  try {
    await login(email, password);
    closeAuthModal();
    showToast("登录成功");
  } catch (err) {
    showAuthError("login", err.message || "登录失败");
  }
}

async function submitRegister() {
  const username = document.getElementById("register-username").value.trim();
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm = document.getElementById("register-confirm").value;
  showAuthError("register", "");
  if (!username) { showAuthError("register", "请输入用户名"); return; }
  if (password !== confirm) { showAuthError("register", "两次密码输入不一致"); return; }
  try {
    await register(username, email, password);
    closeAuthModal();
    showToast("注册成功");
  } catch (err) {
    showAuthError("register", err.message || "注册失败");
  }
}

async function submitGuest() {
  try {
    await guestLogin();
    closeAuthModal();
    showToast("已进入游客模式，数据将保存在云端");
  } catch (err) {
    showToast("游客模式暂时不可用：" + (err.message || "请检查网络连接"));
  }
}

// ── Toast 提示 ──

function showToast(message) {
  const existing = document.getElementById("toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── 用户菜单 UI ──

function updateUserMenu(user) {
  const existing = document.getElementById("user-menu");
  if (existing) existing.remove();

  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) loginBtn.style.display = user ? "none" : "";

  if (!user) return;

  const header = document.querySelector(".site-header .nav");
  if (!header) return;

  const menu = document.createElement("div");
  menu.id = "user-menu";
  menu.className = "user-menu";
  menu.innerHTML = `
    <span class="user-menu-email" title="${escapeHtml(user.email || "匿名用户")}">
      ${escapeHtml(user.isGuest ? "游客" : user.displayName)}
    </span>
    <button class="user-menu-logout" type="button" id="logout-btn">退出</button>
  `;
  header.appendChild(menu);
  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    showToast("已退出");
  });
}

AuthAPI.onAuthChange(updateUserMenu);

// ── 辅助 ──

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}