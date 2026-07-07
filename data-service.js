// 过期警报 · 数据服务抽象层
// 未登录 → localStorage
// 已登录 → 通过 /api/foods 接口操作 Supabase（后端完成鉴权）

const LS_KEY = "expiry-alert-foods-v2";

// ── 对外暴露的 DataService API ──

const DataService = {
  /** 加载食材列表 */
  async load() {
    return AuthAPI.isLoggedIn ? loadFromApi() : loadFromLocal();
  },

  /** 保存食材列表（替换整表） */
  async save(foods) {
    return AuthAPI.isLoggedIn ? saveToApi(foods) : saveToLocal(foods);
  },

  /** 将本地数据迁移到云端（登录时调用） */
  async migrateLocalToSupabase() {
    const localFoods = loadFromLocal();
    if (!localFoods || localFoods.length === 0) {
      return;
    }

    try {
      await saveToApi(localFoods);
      clearFromLocal();
    } catch (err) {
      console.warn("迁移数据失败:", err);
    }
  }
};

// ── localStorage 操作 ──

function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToLocal(foods) {
  localStorage.setItem(LS_KEY, JSON.stringify(foods));
}

function clearFromLocal() {
  localStorage.removeItem(LS_KEY);
}

// ── 后端 API 操作（通过 /api/foods 接口） ──

async function getApiHeaders() {
  const authHeader = AuthAPI.getAuthHeader();
  return {
    "Content-Type": "application/json",
    ...(authHeader ? { Authorization: authHeader } : {})
  };
}

async function loadFromApi() {
  try {
    const res = await fetch("/api/foods", {
      method: "GET",
      headers: await getApiHeaders()
    });
    const data = await res.json();
    if (data.error) {
      console.warn("API 加载失败:", data.error);
      return loadFromLocal();
    }
    return data.foods || [];
  } catch (err) {
    console.warn("API 加载异常:", err);
    return loadFromLocal();
  }
}

async function saveToApi(foods) {
  try {
    const res = await fetch("/api/foods", {
      method: "POST",
      headers: await getApiHeaders(),
      body: JSON.stringify({ foods })
    });
    const data = await res.json();
    if (data.error) {
      console.warn("API 保存失败:", data.error);
    }
  } catch (err) {
    console.warn("API 保存异常:", err);
  }
}