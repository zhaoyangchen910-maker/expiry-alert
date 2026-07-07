// 过期警报 · 认证模块
// 支持：邮箱注册、邮箱登录、游客匿名登录

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
    return currentUser !== null && currentUser.isAnonymous;
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

  login, // 邮箱登录
  register, // 邮箱注册
  guestLogin, // 游客登录
  logout // 退出
};

// ── 核心操作 ──

async function login(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw error;
  }

  await handleSession(data.session);
  return data;
}

async function register(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: email.split("@")[0] }
    }
  });

  if (error) {
    throw error;
  }

  // 注册成功后立即登录
  await handleSession(data.session);
  return data;
}

async function guestLogin() {
  const { data, error } = await supabaseClient.auth.signInAnonymously();

  if (error) {
    throw error;
  }

  await handleSession(data.session);
  return data;
}

async function logout() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    throw error;
  }
  currentUser = null;
  notifyListeners(null);
}

// ── 会话管理 ──

async function handleSession(session) {
  if (!session) {
    currentUser = null;
    notifyListeners(null);
    return;
  }

  const user = extractUser(session);
  currentUser = user;
  notifyListeners(user);
}

function extractUser(session) {
  const authUser = session.user;
  return {
    id: authUser.id,
    email: authUser.email || null,
    displayName: authUser.user_metadata?.display_name || authUser.email?.split("@")[0] || "匿名用户",
    isAnonymous: authUser.is_anonymous || false,
    createdAt: authUser.created_at
  };
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

// ── 初始化：恢复已有会话 ──

async function initAuth() {
  try {
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      console.warn("getSession error:", error);
      return;
    }

    if (data.session) {
      await handleSession(data.session);

      // 监听未来会话变更（跨标签页等）
      supabaseClient.auth.onAuthStateChange((_event, session) => {
        handleSession(session);
      });
    }
  } catch (err) {
    console.warn("initAuth error:", err);
  }
}

// 自动初始化
initAuth();

// ── Auth UI：登录弹窗 ──

function showAuthModal() {
  // 防止重复
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
      <p class="auth-guest-hint">无需注册，数据仅保存在本地。后续可以关联邮箱保留数据。</p>
    </div>
  `;

  document.body.appendChild(overlay);

  // 绑定事件
  bindAuthModalEvents(overlay);
}

function bindAuthModalEvents(overlay) {
  // 关闭
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) {
      closeAuthModal();
    }
  });

  document.getElementById("auth-close-btn").addEventListener("click", closeAuthModal);

  // Tab 切换
  document.getElementById("auth-tab-login").addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("auth-tab-register").addEventListener("click", () => switchAuthTab("register"));

  // 登录提交
  document.getElementById("auth-form-login").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitLogin();
  });

  // 注册提交
  document.getElementById("auth-form-register").addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitRegister();
  });

  // 游客登录
  document.getElementById("auth-guest-btn").addEventListener("click", async () => {
    await submitGuest();
  });
}

function closeAuthModal() {
  const overlay = document.getElementById("auth-overlay");
  if (overlay) {
    overlay.remove();
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll(".auth-tab").forEach((tabEl) => {
    tabEl.classList.toggle("active", tabEl.dataset.tab === tab);
  });

  document.querySelectorAll(".auth-form").forEach((form) => {
    form.classList.toggle("active", form.id === `auth-form-${tab}`);
  });
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
    const message = translateAuthError(err.message);
    showAuthError("login", message);
  }
}

async function submitRegister() {
  const email = document.getElementById("register-email").value.trim();
  const password = document.getElementById("register-password").value;
  const confirm = document.getElementById("register-confirm").value;
  showAuthError("register", "");

  if (password !== confirm) {
    showAuthError("register", "两次密码输入不一致");
    return;
  }

  try {
    await register(email, password);
    closeAuthModal();
    showToast("注册成功");
  } catch (err) {
    const message = translateAuthError(err.message);
    showAuthError("register", message);
  }
}

async function submitGuest() {
  try {
    await guestLogin();
    closeAuthModal();
    showToast("已进入游客模式");
  } catch (err) {
    showToast("游客模式暂时不可用，请检查 Supabase 是否开启匿名登录");
  }
}

function translateAuthError(message) {
  if (message.includes("invalid_credentials") || message.includes("Invalid login credentials")) {
    return "邮箱或密码错误";
  }
  if (message.includes("User already registered")) {
    return "该邮箱已注册，请直接登录";
  }
  if (message.includes("Password should be at least 6 characters")) {
    return "密码至少 6 位";
  }
  if (message.includes("Email not confirmed")) {
    return "邮箱尚未验证，请查收验证邮件";
  }
  if (message.includes("rate_limit")) {
    return "操作太频繁，请稍后再试";
  }
  return message || "操作失败，请稍后再试";
}

// ── Toast 提示 ──

function showToast(message) {
  const existing = document.getElementById("toast");
  if (existing) {
    existing.remove();
  }

  const toast = document.createElement("div");
  toast.id = "toast";
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);

  // 触发动画
  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ── 用户菜单 UI ──

function updateUserMenu(user) {
  const existing = document.getElementById("user-menu");
  if (existing) {
    existing.remove();
  }

  const loginBtn = document.getElementById("login-btn");
  if (loginBtn) {
    loginBtn.style.display = user ? "none" : "";
  }

  if (!user) {
    return;
  }

  const header = document.querySelector(".site-header .nav");
  if (!header) {
    return;
  }

  const menu = document.createElement("div");
  menu.id = "user-menu";
  menu.className = "user-menu";
  menu.innerHTML = `
    <span class="user-menu-email" title="${escapeHtml(user.email || "匿名用户")}">
      ${escapeHtml(user.isAnonymous ? "游客" : user.displayName)}
    </span>
    <button class="user-menu-logout" type="button" id="logout-btn">退出</button>
  `;

  header.appendChild(menu);

  document.getElementById("logout-btn").addEventListener("click", async () => {
    await logout();
    showToast("已退出");
  });
}

// 监听认证变化 → 更新用户菜单
AuthAPI.onAuthChange(updateUserMenu);

// ── 辅助 ──

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[char];
  });
}