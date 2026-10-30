const core = require("../lib/core")
const api = require("./api")
const AUTH_KEY = "training-notebook:mini:auth"
const LOCAL_KEY = "training-notebook:mini:local:v1"
const listeners = new Set()
let data = null
let auth = null
let engine = null
let ready = false
let phase = "loading"
let error = ""
let timer = null
let initialized = false
let generation = 0
let loading = null
let loginRequired = false

const clone = (value) => JSON.parse(JSON.stringify(value))
const keyFor = (account) =>
  account
    ? `training-notebook:mini:${encodeURIComponent(account.server)}:${account.user.id}:v1`
    : LOCAL_KEY
const statusLabels = {
  local: "已保存到本机",
  loading: "正在读取记录",
  pending: "已保留在本机，待同步",
  saving: "正在同步到账号",
  synced: "已同步到账号",
  error: "保存失败，记录已保留",
  conflict: "版本冲突，改动已保留",
}
function snapshot() {
  return {
    data,
    auth: auth ? { server: auth.server, user: auth.user } : null,
    ready,
    phase,
    error,
    loginRequired,
    status: statusLabels[phase],
    dirty: !!(engine && (engine.meta.pendingId || engine.meta.uncertain)),
  }
}
function emit() {
  for (const listener of listeners) listener(snapshot())
}
function status(next, detail = "") {
  phase = next
  error = detail
  emit()
}
function readCache(key) {
  const raw = wx.getStorageSync(key)
  if (!raw) return null
  if (
    raw.cachedData?.version < 3 &&
    !wx.getStorageSync(key + ":backup-v" + raw.cachedData.version)
  )
    wx.setStorageSync(key + ":backup-v" + raw.cachedData.version, raw)
  if (
    raw.cachedData &&
    raw.cachedData.version < 3 &&
    !wx.getStorageSync(key + ":legacy-backup")
  )
    wx.setStorageSync(key + ":legacy-backup", raw)
  const meta = core.syncMetaSchema.parse(raw)
  if (!meta.cachedData) throw new Error("缓存没有训练记录")
  return meta
}
function saveLocal(value) {
  wx.setStorageSync(LOCAL_KEY, {
    cachedData: value,
    revision: 0,
    pendingId: null,
    uncertain: null,
  })
}
function openLocal() {
  engine = null
  try {
    const cache = readCache(LOCAL_KEY)
    data = cache ? cache.cachedData : core.initialData()
    if (!cache) {
      const oldGoal = wx.getStorageSync("training-notebook:mini-preview:goal")
      if (
        typeof oldGoal === "string" &&
        oldGoal.length <= 2000 &&
        oldGoal.trim()
      )
        data.goal = oldGoal
    }
    ready = true
    status("local")
  } catch (_) {
    data = null
    ready = false
    status("error", "本机记录无法读取，原缓存未覆盖。请先导出备份。")
  }
}
async function loadCloud() {
  if (loading) return loading
  const account = auth
  const sequence = generation
  const cacheKey = keyFor(account)
  const task = (async () => {
    ready = false
    status("loading")
    try {
      const cache = readCache(cacheKey)
      let remote
      let offline = false
      try {
        remote = await api.request(account, "/fitness/state")
      } catch (problem) {
        if (sequence === generation && problem.status === 401)
          loginRequired = true
        if (!cache) throw problem
        offline = true
        remote = { revision: cache.revision, data: cache.cachedData }
      }
      if (sequence !== generation) return
      const dirty = cache && (cache.pendingId || cache.uncertain)
      const meta = dirty
        ? cache
        : { revision: remote.revision, pendingId: null, uncertain: null }
      data = dirty
        ? cache.cachedData
        : remote.data
          ? core.fitnessSchema.parse(remote.data)
          : core.initialData()
      const current = new core.FitnessSync(
        data,
        meta,
        async (job) => {
          try {
            return (
              await api.request(account, "/fitness/state", "PUT", {
                expected_revision: job.expectedRevision,
                mutation_id: job.mutationId,
                data: job.data,
              })
            ).revision
          } catch (problem) {
            if (sequence === generation && problem.status === 401)
              loginRequired = true
            throw problem
          }
        },
        (value, metadata) =>
          wx.setStorageSync(cacheKey, { ...metadata, cachedData: value }),
        (next, detail) => {
          if (sequence === generation) status(next, detail)
        },
      )
      engine = current
      ready = true
      if (offline) {
        status(
          "error",
          "当前离线或登录失效，已恢复此账号的本机记录。可继续记录，联网后重试同步。",
        )
      } else if (dirty && remote.revision !== meta.revision && !meta.uncertain)
        current.markConflict()
      else if (dirty || !remote.data) {
        if (!dirty) current.stage(data)
        const ok = await current.flush()
        if (ok && remote.revision > current.meta.revision)
          current.markConflict()
      } else {
        wx.setStorageSync(cacheKey, { ...meta, cachedData: data })
        status("synced")
      }
      emit()
    } catch (problem) {
      if (sequence !== generation) return
      status(
        "error",
        problem.message || "无法读取账号记录，请重试；本机缓存没有被清除。",
      )
    }
  })()
  loading = task
  try {
    await task
  } finally {
    if (loading === task) loading = null
  }
}
function init() {
  if (initialized) return
  initialized = true
  try {
    const cached = wx.getStorageSync(AUTH_KEY)
    if (cached?.token && cached.user?.id && cached.server) auth = cached
  } catch (_) {
    /* 无法读取登录信息时，仍尝试读取本机记录。 */
  }
  if (auth) void loadCloud()
  else openLocal()
}
function subscribe(listener) {
  init()
  listeners.add(listener)
  listener(snapshot())
  return () => listeners.delete(listener)
}
function stage(value) {
  if (!ready || !data) throw new Error("记录尚未读取完成，请先重试。")
  if (phase === "conflict") throw new Error(error)
  const parsed = core.fitnessSchema.parse(clone(value))
  if (auth) {
    data = parsed
    if (!engine.stage(parsed)) throw new Error("本机保存失败，请保留页面并重试")
    clearTimeout(timer)
    const current = engine
    timer = setTimeout(() => {
      void current.flush()
    }, 700)
  } else {
    // 存储失败时不切换成成功状态，页面仍保留用户输入。
    data = parsed
    try {
      saveLocal(parsed)
    } catch (problem) {
      status(
        "error",
        "本机保存失败，输入保留在当前页面，请重试并检查存储空间。",
      )
      throw problem
    }
    status("local")
  }
  emit()
}
async function flush() {
  clearTimeout(timer)
  if (!ready) {
    if (auth) await loadCloud()
    return ready && phase !== "error" && phase !== "conflict"
  }
  if (engine) return engine.flush()
  if (phase === "error" && data) {
    try {
      saveLocal(data)
      status("local")
    } catch (_) {
      return false
    }
  }
  return phase === "local"
}
async function commit(value) {
  stage(value)
  return flush()
}
function commitRecord(value) {
  stage(value)
  // stage 成功才表示本机已可靠落盘；上传独立执行，保留原请求回执身份。
  if (engine) void flush()
  return true
}
async function login(server, email, password) {
  if (!auth && phase === "error" && ready && !(await flush()))
    throw new Error("请先保存或备份当前本机输入，再登录账号。")
  const sequence = generation
  const account = await api.signIn(server, email, password)
  if (sequence !== generation) throw new Error("登录状态已变化，请重试")
  if (
    engine &&
    (engine.meta.pendingId || engine.meta.uncertain) &&
    keyFor(account) !== keyFor(auth)
  )
    throw new Error("当前账号有待同步记录，请先同步；可以重新登录原账号。")
  await activateAccount(account)
}
async function activateAccount(account) {
  wx.setStorageSync(AUTH_KEY, account)
  clearTimeout(timer)
  generation += 1
  auth = account
  loginRequired = false
  engine = null
  data = null
  ready = false
  loading = null
  await loadCloud()
}
async function loginWechat() {
  if (!auth && phase === "error" && !(await flush()))
    throw new Error("请先保存本机记录")
  const sequence = generation
  const account = await api.signInWechat(auth?.server)
  if (sequence !== generation) throw new Error("登录状态已变化，请重试")
  if (auth && keyFor(account) !== keyFor(auth))
    throw new Error(
      "此微信关联的是其他账号。请先通过邮箱验证并绑定当前账号；如需切换，请先退出。本机记录已保留",
    )
  await activateAccount(account)
}
async function bindWechat() {
  if (!auth) throw new Error("请先验证已有网站账号")
  const account = auth
  const sequence = generation,
    code = await api.loginCode()
  if (sequence !== generation) throw new Error("账号已变化，请重新绑定")
  return api.request(account, "/login/wechat/bind", "POST", { code })
}
function localImportPreview() {
  const cached = readCache(LOCAL_KEY)
  return {
    history: cached?.cachedData.history.length || 0,
    custom: cached?.cachedData.exerciseLibrary.custom.length || 0,
  }
}
function importLocal() {
  if (!auth || !ready) throw new Error("请先登录并读取账号记录")
  const cached = readCache(LOCAL_KEY)
  if (!cached) return
  commitRecord(core.importLocalRecords(data, cached.cachedData))
}
function credentials() {
  return auth ? clone(auth) : null
}
function logout() {
  clearTimeout(timer)
  generation += 1
  wx.removeStorageSync(AUTH_KEY)
  auth = null
  loginRequired = false
  loading = null
  openLocal()
}
function backup() {
  // 备份完整同步元数据，包含未确认请求，避免丢失幂等回执身份。
  const cached = wx.getStorageSync(keyFor(auth))
  return JSON.stringify(
    data
      ? { ...(engine ? engine.meta : cached || {}), cachedData: data }
      : cached,
    null,
    2,
  )
}
async function reloadCloud() {
  if (!auth) return
  // 先落备份，再读取云端；任何存储失败都中止替换。
  const key = keyFor(auth)
  const sequence = generation
  const preserved = wx.getStorageSync(key)
  if (preserved) wx.setStorageSync(`${key}:backup:${Date.now()}`, preserved)
  const remote = await api.request(auth, "/fitness/state")
  if (sequence !== generation) return
  wx.setStorageSync(key, {
    cachedData: remote.data || core.initialData(),
    revision: remote.revision,
    pendingId: null,
    uncertain: null,
  })
  engine = null
  await loadCloud()
}
function exportPlan() {
  if (!data) throw new Error("尚未加载计划")
  return JSON.stringify({ type: "fitness-plan-v1", plan: data.plan })
}
function importPlan(jsonString) {
  if (!data) throw new Error("尚未加载完成")
  let parsed
  try {
    parsed = JSON.parse(String(jsonString).trim())
  } catch {
    throw new Error("内容不是有效 JSON")
  }
  const plan = parsed.cachedData?.plan || parsed.plan || parsed
  if (!plan || !Array.isArray(plan.days))
    throw new Error("这份内容里没有训练计划")
  if (core.validatePlan && core.validatePlan(plan))
    throw new Error("计划内容不完整")
  const next = clone(data)
  const imported = { ...plan, id: "plan-" + Date.now(), name: plan.name || "好友分享计划" }
  next.templates = [...next.templates, imported]
  next.plan = imported
  next.scheduleOverrides = []
  stage(next)
  return imported.name
}
module.exports = {
  init,
  subscribe,
  snapshot,
  stage,
  commit,
  commitRecord,
  flush,
  login,
  loginWechat,
  bindWechat,
  localImportPreview,
  importLocal,
  credentials,
  logout,
  backup,
  reloadCloud,
  exportPlan,
  importPlan,
  clone,
}
