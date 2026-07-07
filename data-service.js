// 过期警报 · 数据服务抽象层
// 未登录 → localStorage
// 已登录 → Supabase（含游客匿名用户）

const LS_KEY = "expiry-alert-foods-v2";
const SUPABASE_TABLE = "foods";

// ── 对外暴露的 DataService API ──

const DataService = {
  /** 加载食材列表 */
  load() {
    return AuthAPI.isLoggedIn ? loadFromSupabase() : loadFromLocal();
  },

  /** 保存食材列表（替换整表） */
  save(foods) {
    return AuthAPI.isLoggedIn ? saveToSupabase(foods) : saveToLocal(foods);
  },

  /** 添加一条食材 */
  add(food) {
    return AuthAPI.isLoggedIn ? addToSupabase(food) : addToLocal(food);
  },

  /** 删除一条食材 */
  remove(id) {
    return AuthAPI.isLoggedIn ? removeFromSupabase(id) : removeFromLocal(id);
  },

  /** 清空全部 */
  clear() {
    return AuthAPI.isLoggedIn ? clearFromSupabase() : clearFromLocal();
  },

  /** 将本地数据迁移到 Supabase（登录时调用） */
  async migrateLocalToSupabase() {
    const localFoods = loadFromLocal();
    if (!localFoods || localFoods.length === 0) {
      return;
    }

    // 逐条插入，复用原有 id
    for (const food of localFoods) {
      const { error } = await supabaseClient.from(SUPABASE_TABLE).upsert(
        {
          id: food.id,
          user_id: AuthAPI.userId,
          name: food.name,
          category: food.category,
          buy_date: food.buyDate,
          shelf_life: food.shelfLife,
          note: food.note || ""
        },
        { onConflict: "id" }
      );
      if (error) {
        console.warn("迁移失败:", error);
      }
    }

    // 迁移后清空本地，避免下次重复
    clearFromLocal();
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

function addToLocal(food) {
  const foods = loadFromLocal();
  foods.push(food);
  saveToLocal(foods);
}

function removeFromLocal(id) {
  const foods = loadFromLocal().filter((f) => f.id !== id);
  saveToLocal(foods);
}

function clearFromLocal() {
  localStorage.removeItem(LS_KEY);
}

// ── Supabase 操作 ──

async function loadFromSupabase() {
  try {
    const { data, error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .select("id, name, category, buy_date, shelf_life, note")
      .eq("user_id", AuthAPI.userId);

    if (error) {
      console.warn("Supabase 查询失败, 回退 localStorage:", error);
      return loadFromLocal();
    }

    // 转换字段名：snake_case → camelCase
    return (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      buyDate: row.buy_date,
      shelfLife: row.shelf_life,
      note: row.note || ""
    }));
  } catch (err) {
    console.warn("Supabase 查询异常, 回退 localStorage:", err);
    return loadFromLocal();
  }
}

async function saveToSupabase(foods) {
  try {
    // 全量替换：删除当前用户所有数据，再批量插入
    await supabaseClient.from(SUPABASE_TABLE).delete().eq("user_id", AuthAPI.userId);

    if (foods.length === 0) {
      return;
    }

    const rows = foods.map((food) => ({
      id: food.id,
      user_id: AuthAPI.userId,
      name: food.name,
      category: food.category,
      buy_date: food.buyDate,
      shelf_life: food.shelfLife,
      note: food.note || ""
    }));

    const { error } = await supabaseClient.from(SUPABASE_TABLE).insert(rows);
    if (error) {
      console.warn("Supabase 保存失败:", error);
    }
  } catch (err) {
    console.warn("Supabase 保存异常:", err);
  }
}

async function addToSupabase(food) {
  try {
    const { error } = await supabaseClient.from(SUPABASE_TABLE).insert({
      id: food.id,
      user_id: AuthAPI.userId,
      name: food.name,
      category: food.category,
      buy_date: food.buyDate,
      shelf_life: food.shelfLife,
      note: food.note || ""
    });
    if (error) {
      console.warn("Supabase 添加失败:", error);
    }
  } catch (err) {
    console.warn("Supabase 添加异常:", err);
  }
}

async function removeFromSupabase(id) {
  try {
    const { error } = await supabaseClient
      .from(SUPABASE_TABLE)
      .delete()
      .eq("id", id)
      .eq("user_id", AuthAPI.userId);
    if (error) {
      console.warn("Supabase 删除失败:", error);
    }
  } catch (err) {
    console.warn("Supabase 删除异常:", err);
  }
}

async function clearFromSupabase() {
  try {
    await supabaseClient.from(SUPABASE_TABLE).delete().eq("user_id", AuthAPI.userId);
  } catch (err) {
    console.warn("Supabase 清空异常:", err);
  }
}