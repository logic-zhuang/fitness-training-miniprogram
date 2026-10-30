const assert = require("node:assert/strict")
const { beforeEach, afterEach, test } = require("node:test")
const core = require("../miniprogram/lib/core")
let storage, store, calls, notices, failStorage, server
const copy = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value))
function freshStore() {
  for (const file of ["store", "api", "page"])
    delete require.cache[require.resolve(`../miniprogram/services/${file}`)]
  const loaded = require("../miniprogram/services/store")
  loaded.init()
  return loaded
}
function page(name, options = {}) {
  let definition
  global.Page = (value) => {
    definition = value
  }
  const file = require.resolve(`../miniprogram/pages/${name}/index`)
  delete require.cache[file]
  require(file)
  const instance = {
    ...definition,
    data: copy(definition.data),
    setData(values) {
      for (const [path, value] of Object.entries(values)) {
        const parts = path.replace(/\[(\d+)\]/g, ".$1").split(".")
        let current = this.data
        for (const part of parts.slice(0, -1)) {
          if (!current[part]) current[part] = {}
          current = current[part]
        }
        current[parts[parts.length - 1]] = copy(value)
      }
    },
  }
  if (instance.onLoad) instance.onLoad(options)
  return instance
}
const event = (dataset = {}, value = "") => ({
  currentTarget: { dataset },
  detail: { value },
})

test("微信菜单限制下，本周七天调整入口仍可打开", () => {
  const home = page("home")
  assert.doesNotThrow(() => home.moveWeek())
  assert.equal(home.data.weekOpen, true)
  assert.equal(home.data.weekTitles.length, 7)
  home.closeWeek()
})

test("微信菜单限制下，训练更多操作仍可打开", async () => {
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: core.builtInExercises.slice(0, 7) },
  })
  await assert.doesNotReject(() => workout.menu())
  assert.equal(workout.data.menuOpen, true)
  assert.ok(
    workout.data.menuGroups.flatMap((group) => group.actions).length > 6,
  )
})

test("周日可与周五交换，预览双方安排、取消无改动、失败重试不反向交换", () => {
  const home = page("home"),
    before = copy(store.snapshot().data)
  home.moveWeek()
  home.chooseWeekDate(event({ field: "weekFrom" }, "6"))
  home.chooseWeekDate(event({ field: "weekTo" }, "4"))
  const sunday = home.data.weekRows[6].date,
    friday = home.data.weekRows[4].date
  const a = core.dayForDate(before, sunday),
    b = core.dayForDate(before, friday)
  assert.equal(home.data.weekChanges[0].after, b?.name || "休息")
  assert.equal(home.data.weekChanges[1].after, a?.name || "休息")
  assert.deepEqual(
    store.snapshot().data.scheduleOverrides,
    before.scheduleOverrides,
  )
  home.closeWeek()
  assert.deepEqual(store.snapshot().data, before)
  home.moveWeek()
  home.chooseWeekDate(event({ field: "weekFrom" }, "6"))
  home.chooseWeekDate(event({ field: "weekTo" }, "4"))
  failStorage = true
  home.applyWeek()
  assert.equal(home.data.weekOpen, true)
  assert.ok(home.data.weekError)
  failStorage = false
  home.applyWeek()
  assert.equal(home.data.weekOpen, false)
  assert.equal(core.dayForDate(store.snapshot().data, sunday)?.id, b?.id)
  assert.equal(core.dayForDate(store.snapshot().data, friday)?.id, a?.id)
  assert.deepEqual(store.snapshot().data.plan, before.plan)
  assert.deepEqual(store.snapshot().data.history, before.history)
  store = freshStore()
  assert.equal(core.dayForDate(store.snapshot().data, sunday)?.id, b?.id)
})

test("移动到第七个动作先预览且取消无改动，确认保留当前动作及已有组", async () => {
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: core.builtInExercises.slice(0, 7) },
  })
  workout.select(event({ index: 0 }))
  workout.setInput(event({ index: 0, field: "reps" }, "8"))
  workout.toggleSet(event({ index: 0 }))
  const before = copy(workout.workout),
    id = workout.workout.exercises[0].id
  await workout.menu()
  await workout.menuAction(event({ action: "move" }))
  workout.choosePosition(event({}, "6"))
  assert.equal(workout.data.orderRows[6].id, id)
  assert.deepEqual(workout.workout, before)
  workout.closeOrder()
  assert.deepEqual(workout.workout, before)
  workout.openOrder()
  workout.choosePosition(event({}, "6"))
  failStorage = true
  workout.applyOrder()
  assert.ok(workout.data.orderError)
  assert.equal(workout.data.orderOpen, true)
  failStorage = false
  workout.applyOrder()
  assert.equal(workout.data.orderOpen, false)
  assert.equal(workout.workout.exercises[6].id, id)
  assert.equal(workout.workout.exercises[6].sets[0].reps, "8")
  assert.equal(workout.workout.exercises[6].sets[0].done, true)
  assert.equal(store.snapshot().data.draft.flow.currentExerciseId, id)
  assert.equal(workout.data.selected, 6)
  assert.deepEqual(workout.workout.execution, before.execution)
})

test("菜单和位置选择切后台或切换动作后失效，不误改另一动作", async () => {
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: core.builtInExercises.slice(0, 7) },
  })
  await workout.menu()
  workout.select(event({ index: 0 }))
  const before = copy(workout.workout)
  await workout.menuAction(event({ action: "remove" }))
  assert.deepEqual(workout.workout, before)
  workout.openOrder()
  workout.choosePosition(event({}, "6"))
  workout.onHide()
  assert.equal(workout.data.orderOpen, false)
  workout.applyOrder()
  assert.deepEqual(workout.workout, before)
})

test("自由训练可调整组数和每组秒数，保留实际组且不足目标不自动推进", async () => {
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: [core.builtInExercises[15]] },
  })
  workout.openTargets()
  assert.equal(workout.data.targetCount, "3")
  workout.targetField(event({ field: "targetCount" }, "1"))
  workout.targetField(event({ field: "targetSeconds" }, "30"))
  await workout.applyTargets()
  assert.equal(workout.workout.exercises[0].sets.length, 1)
  assert.equal(workout.workout.exercises[0].targetSeconds, 30)
  workout.setInput(event({ index: 0, field: "durationSeconds" }, "20"))
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.workout.exercises[0].sets[0].done, true)
  assert.equal(workout.workout.flow.stage, "recording")
  assert.equal(workout.data.completion.complete, false)
  workout.openTargets()
  workout.targetField(event({ field: "targetCount" }, "0"))
  await workout.applyTargets()
  assert.equal(workout.workout.exercises[0].sets.length, 1)
  assert.equal(workout.workout.exercises[0].sets[0].durationSeconds, 20)
  workout.closeTargets()
  workout.setInput(event({ index: 0, field: "durationSeconds" }, "30"))
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.workout.flow.stage, "ready")
  assert.equal(workout.workout.timer.runningSince, null)
  assert.equal(
    workout.data.completion.complete,
    false,
    "自由训练不能获得周计划完成",
  )
})

test("自动进入待提交后仍提示未确认的额外组，取消不提交，确认保留原始数据", async () => {
  const value = store.snapshot().data
  const draft = core.makeWorkout(value.plan.days[0], value.plan.id)
  draft.exercises = draft.exercises.slice(0, 1)
  draft.execution.current = draft.execution.current.filter(
    (target) => target.exerciseId === draft.exercises[0].id,
  )
  draft.execution.original = copy(draft.execution.current)
  store.stage({ ...value, draft })
  const workout = page("workout")
  workout.addSet()
  workout.setInput(event({ index: 3, field: "reps" }, "5"))
  for (const index of [0, 1, 2]) {
    workout.setInput(event({ index, field: "reps" }, "8"))
    workout.toggleSet(event({ index }))
  }
  assert.equal(workout.workout.flow.stage, "ready")
  let prompt
  wx.showModal = (options) => {
    prompt = options
    options.success({ confirm: false })
  }
  await workout.save()
  assert.ok(prompt?.content.includes("第 4 组"))
  assert.equal(workout.data.saved, false)
  assert.equal(store.snapshot().data.history.length, 0)
  wx.showModal = (options) => options.success({ confirm: true })
  await workout.save()
  assert.equal(store.snapshot().data.history.length, 1)
  assert.equal(store.snapshot().data.history[0].exercises[0].sets[3].reps, "5")
  assert.equal(
    store.snapshot().data.history[0].exercises[0].sets[3].done,
    false,
  )
  assert.equal(workout.data.doneSets, 3)
})

test("总结补充保存明确反馈，失败可重试，不新增训练或复活已删除记录", async () => {
  const original = store.snapshot().data
  const training = core.makeWorkout(original.plan.days[0], original.plan.id)
  training.exercises[0].sets[0].reps = "8"
  training.exercises[0].sets[0].done = true
  store.commitRecord(core.archiveWorkout(original, training))
  const workout = page("workout", { id: training.id })
  const endedAt = store.snapshot().data.history[0].endedAt
  workout.workout.note = "总结补充"
  workout.workout.exertion = "适中"
  failStorage = true
  await workout.saveDetails()
  assert.ok(workout.data.finishError, "补充保存失败不能无反馈")
  assert.equal(workout.workout.note, "总结补充", "失败时保留当前输入")
  assert.equal(
    storage.get("training-notebook:mini:local:v1").cachedData.history[0].note,
    "",
    "未落盘时原保存记录仍保留",
  )
  assert.ok(!notices.includes("补充内容已保存到此设备"))
  failStorage = false
  await workout.saveDetails()
  assert.equal(workout.data.finishError, "")
  assert.ok(notices.includes("补充内容已保存到此设备"))
  assert.equal(store.snapshot().data.history.length, 1)
  assert.equal(store.snapshot().data.history[0].note, "总结补充")
  assert.equal(store.snapshot().data.history[0].endedAt, endedAt)
  store.stage({ ...store.snapshot().data, history: [] })
  await workout.saveDetails()
  assert.equal(
    store.snapshot().data.history.length,
    0,
    "旧总结页面不能复活已删除记录",
  )
  assert.ok(workout.data.finishError)
})

test("照片上传时离开页面，完成后返回可再次上传", async () => {
  const photos = require("../miniprogram/services/photos")
  const originalSync = photos.sync
  let finish
  photos.sync = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  const journal = page("journal")
  try {
    journal.onShow()
    const uploading = journal.retryPhotos()
    assert.equal(journal.data.uploading, true)
    journal.onHide()
    finish()
    await uploading
    journal.onShow()
    assert.equal(journal.data.uploading, false, "后台完成后上传按钮仍被锁住")
  } finally {
    photos.sync = originalSync
    journal.onUnload()
  }
})

test("选图切后台再返回，所选照片仍自动进入上传流程", async () => {
  const photos = require("../miniprogram/services/photos")
  const originalChoose = photos.choose,
    originalSync = photos.sync
  let picked,
    uploads = 0
  photos.choose = () =>
    new Promise((resolve) => {
      picked = resolve
    })
  photos.sync = async () => {
    uploads += 1
  }
  const journal = page("journal")
  try {
    journal.onShow()
    const adding = journal.add()
    journal.onHide()
    picked()
    await adding
    journal.onShow()
    assert.equal(uploads, 1, "系统选图导致 onHide，返回结果未继续上传")
    assert.equal(journal.data.uploading, false)
  } finally {
    photos.choose = originalChoose
    photos.sync = originalSync
    journal.onUnload()
  }
})

test("换日确认期间账号变化，不能把旧账号安排写入当前账号", async () => {
  await store.login("http://127.0.0.1:8001", "test@example.com", "password")
  const home = page("home")
  home.onShow()
  const before = copy(store.snapshot().data.scheduleOverrides)
  home.moveWeek()
  home.chooseWeekDate(event({ field: "weekFrom" }, "0"))
  home.chooseWeekDate(event({ field: "weekTo" }, "1"))
  store.logout()
  home.applyWeek()
  assert.deepEqual(
    store.snapshot().data.scheduleOverrides,
    before,
    "旧弹窗改写了新账号安排",
  )
  home.onHide()
})

test("账号登录过期可重新微信登录，待同步草稿保留；另一微信账号不能自动替换", async () => {
  await store.login("http://127.0.0.1:8001", "test@example.com", "password")
  const request = wx.request
  let expired = true,
    userId = "test-user"
  wx.login = (options) => options.success({ code: "test-code" })
  wx.request = (options) => {
    if (options.url.endsWith("/login/wechat"))
      return options.success({
        statusCode: 200,
        data: { access_token: "renewed-token" },
      })
    if (options.url.endsWith("/users/me"))
      return options.success({
        statusCode: 200,
        data: { id: userId, email: "test@example.com" },
      })
    if (expired)
      return options.success({ statusCode: 401, data: { detail: "expired" } })
    request(options)
  }
  const value = store.clone(store.snapshot().data)
  value.draft = core.makeWorkout(value.plan.days[0], value.plan.id)
  value.goal = "到期期间的改动"
  await store.commit(value)
  assert.equal(store.snapshot().loginRequired, true)
  const profile = page("profile")
  profile.onShow()
  assert.equal(profile.data.loginRequired, true)
  expired = false
  await profile.loginWechat()
  assert.equal(store.snapshot().loginRequired, false)
  assert.equal(store.snapshot().data.draft.id, value.draft.id)
  assert.equal(server.data.goal, value.goal)
  userId = "another-user"
  await profile.loginWechat()
  assert.match(profile.data.loginError, /其他账号/)
  assert.equal(store.snapshot().auth.user.id, "test-user")
  profile.onHide()
})

test("我的动作管理只修改个人库，不创建训练或要求添加动作", async () => {
  const manager = picker()
  manager.properties.managing = true
  manager.create()
  manager.field(event({ field: "name" }, "我的核心动作"))
  await manager.saveCustom()
  assert.equal(store.snapshot().data.exerciseLibrary.custom.length, 1)
  assert.equal(store.snapshot().data.draft, null)
  assert.equal(manager.data.selectedIds.length, 0)
  const profile = page("profile")
  profile.openLibrary()
  assert.equal(profile.data.libraryOpen, true)
  profile.closeLibrary()
  assert.equal(profile.data.libraryOpen, false)
})

test("首页继续待提交草稿保留冻结计时，不退回训练阶段", async () => {
  const data = store.snapshot().data
  const draft = core.reviewWorkout(
    core.makeWorkout(data.plan.days[0], data.plan.id),
  )
  store.stage({ ...data, draft })
  const home = page("home")
  await home.start(event())
  assert.equal(store.snapshot().data.draft.flow.stage, "ready")
  assert.equal(store.snapshot().data.draft.reviewing, true)
  assert.equal(store.snapshot().data.draft.timer.runningSince, null)
})

test("调整今天暂停计时且保留周模板，明确开始后计时", async () => {
  const home = page("home"),
    template = copy(store.snapshot().data.plan)
  await home.adjustToday()
  assert.equal(store.snapshot().data.draft.timer.runningSince, null)
  const workout = page("workout", { adjust: "1" })
  assert.equal(workout.data.preparing, true)
  workout.beginTraining()
  assert.equal(workout.data.preparing, false)
  assert.ok(workout.workout.timer.runningSince)
  assert.deepEqual(store.snapshot().data.plan, template)
})

test("准备中草稿重启和首页继续不提前计时，只有明确开始才退出准备阶段", async () => {
  // 用显式「准备中」草稿，避免 adjustToday 在无安排日生成空草稿（日期无关）
  const data = store.snapshot().data
  const draft = core.prepareWorkout(
    core.makeWorkout(data.plan.days[0], data.plan.id),
  )
  store.stage({ ...data, draft })
  const id = store.snapshot().data.draft.id
  store = freshStore()
  const resumedHome = page("home")
  await resumedHome.start(event())
  const workout = page("workout")
  assert.equal(workout.workout.id, id)
  assert.equal(workout.data.preparing, true)
  assert.equal(workout.workout.flow.stage, "preparing")
  assert.equal(workout.workout.timer.runningSince, null)
  workout.setInput(event({ index: 0, field: "reps" }, "8"))
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.workout.exercises[0].sets[0].done, false)
  assert.equal(core.elapsedSeconds(workout.workout), 0)
  workout.beginTraining()
  assert.equal(store.snapshot().data.draft.flow.stage, "recording")
  assert.equal(workout.data.preparing, false)
  assert.ok(workout.workout.timer.runningSince)
})

beforeEach(() => {
  storage = new Map()
  calls = []
  notices = []
  failStorage = false
  server = {
    revision: 0,
    data: null,
    receipts: new Map(),
    loseAck: false,
    offline: false,
  }
  global.wx = {
    getStorageSync: (key) => copy(storage.get(key)),
    setStorageSync(key, value) {
      if (failStorage) throw new Error("quota")
      storage.set(key, copy(value))
    },
    removeStorageSync: (key) => storage.delete(key),
    showToast: (options) => notices.push(options.title),
    showActionSheet(options) {
      assert.ok(options.itemList.length <= 6, "wx.showActionSheet 最多 6 项")
    },
    showModal: (options) => options.success({ confirm: true }),
    navigateTo: (options) => calls.push(options.url),
    navigateBack() {},
    switchTab: (options) => calls.push(options.url),
    request(options) {
      calls.push({
        url: options.url,
        data: copy(options.data),
        header: options.header,
      })
      if (server.offline) {
        options.fail({ errMsg: "offline" })
        return
      }
      if (options.url.endsWith("/login/access-token")) {
        options.success({
          statusCode: 200,
          data: { access_token: "test-token" },
        })
        return
      }
      if (options.url.endsWith("/users/me")) {
        options.success({
          statusCode: 200,
          data: { id: "test-user", email: "test@example.com" },
        })
        return
      }
      if (options.method === "GET") {
        options.success({
          statusCode: 200,
          data: { revision: server.revision, data: copy(server.data) },
        })
        return
      }
      const job = options.data
      if (server.receipts.has(job.mutation_id)) {
        options.success({
          statusCode: 200,
          data: { revision: server.receipts.get(job.mutation_id) },
        })
        return
      }
      if (job.expected_revision !== server.revision) {
        options.success({ statusCode: 409, data: { detail: "conflict" } })
        return
      }
      server.revision += 1
      server.data = copy(job.data)
      server.receipts.set(job.mutation_id, server.revision)
      if (server.loseAck) {
        server.loseAck = false
        options.fail({ errMsg: "lost acknowledgement" })
        return
      }
      options.success({ statusCode: 200, data: { revision: server.revision } })
    },
  }
  store = freshStore()
  global.getApp = () => ({ fitness: store })
})
afterEach(() => {
  store.logout()
  delete global.Page
  delete global.getApp
})

function picker(single = false) {
  let definition
  global.Component = (value) => {
    definition = value
  }
  const file = require.resolve(
    "../miniprogram/components/exercise-picker/index",
  )
  delete require.cache[file]
  require(file)
  const instance = {
    ...definition.methods,
    data: copy(definition.data),
    properties: { single },
    setData(value) {
      Object.assign(this.data, copy(value))
    },
    triggerEvent(name, detail) {
      this.lastEvent = { name, detail }
    },
  }
  definition.properties.open.observer.call(instance, true)
  delete global.Component
  return instance
}

test("三动作逐一完成、恢复不自动跳转、最终显式提交且重复保存不新增", async () => {
  const data = store.snapshot().data
  const draft = core.makeWorkout(data.plan.days[0], data.plan.id)
  store.stage({ ...data, draft })
  let workout = page("workout")
  for (let i = 0; i < draft.exercises.length; i++) {
    workout.select(event({ index: i }))
    for (let j = 0; j < workout.workout.exercises[i].sets.length; j++) {
      workout.setInput(event({ index: j, field: "reps" }, "8"))
      workout.toggleSet(event({ index: j }))
    }
    workout.onHide()
    assert.equal(workout.advanceTimer, null)
    if (i < draft.exercises.length - 1) {
      workout = page("workout")
      assert.equal(workout.workout.flow.stage, "exercise-complete")
      assert.equal(workout.data.selected, i)
      workout.advance()
      assert.equal(workout.data.selected, i + 1)
    }
  }
  assert.equal(workout.workout.flow.stage, "ready")
  assert.equal(workout.workout.timer.runningSince, null)
  assert.equal(store.snapshot().data.history.length, 0)
  await workout.save()
  await workout.save()
  assert.equal(workout.data.saved, true)
  assert.equal(store.snapshot().data.history.length, 1)
  workout.onUnload()
})

test("断网重启恢复账号草稿，保持原账号身份并可保存", async () => {
  await store.login(
    "http://127.0.0.1:8001",
    "test@example.com",
    "test-password",
  )
  const draft = core.makeWorkout()
  store.stage({ ...store.snapshot().data, draft })
  await store.flush()
  server.offline = true
  store = freshStore()
  await new Promise((resolve) => setTimeout(resolve, 10))
  assert.equal(store.snapshot().ready, true)
  assert.equal(store.snapshot().data.draft.id, draft.id)
  store.commitRecord({ ...store.snapshot().data, goal: "离线修改" })
  assert.equal(store.snapshot().data.goal, "离线修改")
})

test("手机提交离线：已持久归档应显示保存结果，待同步与未保存分开", async () => {
  await store.login(
    "http://127.0.0.1:8001",
    "test@example.com",
    "test-password",
  )
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: [core.builtInExercises[0]] },
  })
  workout.setInput(event({ index: 0, field: "reps" }, "10"))
  workout.toggleSet(event({ index: 0 }))
  await workout.finish()
  server.offline = true
  await workout.save()
  assert.equal(store.snapshot().data.history.length, 1)
  assert.equal(workout.data.saved, true, "本机已归档却仍停在待提交页面")
  assert.equal(store.snapshot().dirty, true)
  assert.ok(
    [...storage.values()].some(
      (v) => v?.cachedData?.history?.[0]?.id === workout.workout.id,
    ),
  )
})

test("页面替换保留卧推一组，新动作两组单次达标；额外组不代替计划目标", async () => {
  const value = store.clone(store.snapshot().data),
    day = value.plan.days[0]
  day.exercises = [core.exerciseFromDefinition(core.builtInExercises[0])]
  store.stage({ ...value, draft: core.makeWorkout(day, value.plan.id) })
  const workout = page("workout")
  workout.setInput(event({ index: 0, field: "reps" }, "10"))
  workout.toggleSet(event({ index: 0 }))
  workout.replace()
  await workout.chooseExercises({
    detail: { definitions: [core.builtInExercises[1]] },
  })
  assert.equal(workout.workout.exercises[0].sets.length, 1)
  assert.equal(workout.workout.exercises[1].sets.length, 2)
  for (const index of [0, 1]) {
    workout.setInput(event({ index, field: "reps" }, "8"))
    workout.toggleSet(event({ index }))
  }
  assert.equal(workout.data.completion.label, "调整后完成")
  await workout.finish()
  await workout.save()
  assert.equal(store.snapshot().data.history.length, 1)
  assert.equal(
    core.planWeekSummary(value.plan, store.snapshot().data.history).completed,
    1,
  )
})

test("时长二十秒不达三十秒目标；删行、移除动作不减目标，恢复后明确调整才达标", async () => {
  const value = store.clone(store.snapshot().data),
    day = value.plan.days[0]
  const movement = core.exerciseFromDefinition(core.builtInExercises[15])
  movement.targetSeconds = 30
  day.exercises = [movement]
  store.stage({ ...value, draft: core.makeWorkout(day, value.plan.id) })
  const workout = page("workout")
  workout.setInput(event({ index: 0, field: "durationSeconds" }, "20"))
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.workout.exercises[0].sets[0].durationSeconds, 20)
  assert.equal(workout.data.completion.done, 0)
  await workout.removeSet(event({ index: 1 }))
  assert.equal(workout.data.completion.total, 3)
  workout.setInput(event({ index: 0, field: "durationSeconds" }, "30"))
  workout.toggleSet(event({ index: 0 }))
  workout.openTargets()
  workout.targetField(event({ field: "targetCount" }, "1"))
  await workout.applyTargets()
  assert.equal(workout.data.completion.label, "调整后完成")
  const id = workout.workout.exercises[0].id
  await workout.removeExercise()
  assert.equal(workout.data.completion.complete, false)
  assert.equal(workout.data.targetGroups[0].missing, true)
  workout.restoreTarget(event({ id }))
  assert.equal(workout.workout.exercises[0].id, id)
  workout.openTargets()
  workout.targetField(event({ field: "targetCount" }, "0"))
  await workout.applyTargets()
  assert.equal(workout.data.completion.complete, false)
})

test("暂停、稍后继续、重启及总结冻结计时，返回继续清除校正；失败重试记录身份不变", async () => {
  const originalNow = Date.now
  let now = 100000
  Date.now = () => now
  try {
    const workout = page("workout")
    now += 10000
    workout.pause()
    now += 90000
    assert.equal(core.elapsedSeconds(workout.workout), 10)
    workout.pause()
    now += 5000
    workout.later()
    store = freshStore()
    const resumed = page("workout")
    assert.equal(core.elapsedSeconds(resumed.workout), 15)
    resumed.pause()
    now += 5000
    await resumed.finish()
    now += 60000
    assert.equal(core.elapsedSeconds(resumed.workout), 20)
    resumed.manualDuration(event({}, "240"))
    resumed.continueTraining()
    now += 5000
    assert.equal(core.elapsedSeconds(resumed.workout), 25)
    await resumed.finish()
    const id = resumed.workout.id
    failStorage = true
    await resumed.save()
    assert.equal(resumed.data.saved, false)
    failStorage = false
    await resumed.save()
    await resumed.save()
    assert.equal(store.snapshot().data.history.length, 1)
    assert.equal(store.snapshot().data.history[0].id, id)
    now += 90000
    assert.equal(core.elapsedSeconds(store.snapshot().data.history[0]), null) // 空组保存为仅打卡
  } finally {
    Date.now = originalNow
  }
})

test("交换取消不修改草稿；时长目标输入不合法时禁止整份保存", async () => {
  const editor = page("plan-edit"),
    before = store.clone(editor.plan)
  editor.editDay(event({ id: before.days[0].id }))
  global.wx.showModal = (options) => options.success({ confirm: false })
  await editor.weekday(
    event({}, String(core.orderedWeekdays.indexOf(before.days[1].weekday))),
  )
  assert.deepEqual(editor.plan, before)
  editor.chooseExercises({
    detail: { definitions: [core.builtInExercises[15]] },
  })
  const timed = editor.selected().exercises.at(-1)
  editor.targetSeconds(event({ id: timed.id }, "1.5"))
  await editor.save()
  assert.equal(
    store.snapshot().data.plan.days[0].exercises.some((e) => e.id === timed.id),
    false,
  )
  assert.ok(notices.some((n) => n.includes("修正目标秒数")))
  editor.targetSeconds(event({ id: timed.id }, "30"))
  await editor.save()
  assert.equal(
    store.snapshot().data.plan.days[0].exercises.at(-1).targetSeconds,
    30,
  )
})

test("统一选择器创建、去重、收藏和编辑重启保留，库变化不修改训练快照", async () => {
  const select = picker()
  assert.equal(select.data.tab, "mine")
  select.setData({
    name: "我的平板",
    customMuscle: "核心",
    customType: "duration",
    note: "收紧腹部",
  })
  await select.saveCustom()
  const custom = store.snapshot().data.exerciseLibrary.custom[0]
  select.setData({
    name: "我的平板",
    customMuscle: "核心",
    customType: "duration",
  })
  await select.saveCustom()
  assert.equal(store.snapshot().data.exerciseLibrary.custom.length, 1)
  const value = store.snapshot().data,
    workout = core.makeWorkout()
  workout.exercises = [core.exerciseFromDefinition(custom)]
  store.stage({ ...value, draft: workout })
  select.render()
  select.edit(event({ id: custom.id }))
  select.field(event({ field: "name" }, "我的平板支撑"))
  await select.saveCustom()
  assert.equal(store.snapshot().data.exerciseLibrary.custom[0].id, custom.id)
  assert.equal(store.snapshot().data.draft.exercises[0].name, "我的平板")
  select.favorite(event({ id: core.builtInExercises[0].id }))
  store = freshStore()
  const afterRestart = picker()
  assert.equal(afterRestart.data.rows.length, 2)
  assert.equal(afterRestart.data.rows[0].name, "我的平板支撑")
  afterRestart.pick(event({ id: custom.id }))
  afterRestart.confirm()
  assert.equal(
    afterRestart.lastEvent.detail.definitions[0].recordType,
    "duration",
  )
  await afterRestart.remove(event({ id: custom.id }))
  assert.equal(store.snapshot().data.draft.exercises[0].note, "收紧腹部")
})

test("实际页面处理器完成训练、暂停/恢复/取消休息，重新加载后保留同一条历史", async () => {
  const home = page("home")
  home.onShow()
  const day = store.snapshot().data.plan.days[0]
  home.start(event({ id: day.id }))
  assert.equal(calls[calls.length - 1], "/pages/workout/index")
  const workout = page("workout")
  workout.setInput(event({ index: 0, field: "weight" }, "40"))
  workout.setInput(event({ index: 0, field: "reps" }, "10"))
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.data.doneSets, 1)
  assert.equal(workout.data.restActive, true)
  workout.rest(event({ action: "pause" }))
  assert.equal(workout.data.restPaused, true)
  const paused = workout.workout.restPausedSeconds
  workout.rest(event({ action: "extend" }))
  assert.equal(workout.workout.restPausedSeconds, paused + 30)
  workout.rest(event({ action: "resume" }))
  assert.equal(workout.data.restPaused, false)
  workout.rest(event({ action: "cancel" }))
  assert.equal(workout.data.restActive, false)
  workout.input(event({ field: "note" }, "肩胛收紧，控制下放"))
  const id = workout.workout.id
  await workout.finish()
  assert.equal(store.snapshot().data.history.length, 0)
  assert.equal(workout.workout.reviewing, true)
  await workout.save()
  await workout.save()
  assert.equal(store.snapshot().data.history.length, 1)
  assert.equal(store.snapshot().data.draft, null)
  store = freshStore()
  assert.equal(store.snapshot().data.history[0].id, id)
  assert.equal(
    store.snapshot().data.history[0].exercises[0].sets[0].weight,
    "40",
  )
  assert.equal(store.snapshot().data.history[0].note, "肩胛收紧，控制下放")
  const history = page("history")
  history.onShow()
  assert.equal(history.data.overview.sets, 1)
  assert.match(
    history.data.groups[0].records[0].highlights[0].text,
    /40 kg × 10 次/,
  )
  history.onHide()
  home.onHide()
})

test("热重载后页面与生命周期共享 App 实例，不读取另一份未初始化的模块", () => {
  delete require.cache[require.resolve("../miniprogram/services/store")]
  const dormant = require("../miniprogram/services/store")
  assert.equal(dormant.snapshot().ready, false)
  const home = page("home")
  home.onShow()
  assert.equal(home.data.ready, true)
  home.start(event({ id: store.snapshot().data.plan.days[0].id }))
  assert.ok(store.snapshot().data.draft)
  assert.equal(dormant.snapshot().ready, false)
  const workout = page("workout")
  assert.equal(workout.workout.id, store.snapshot().data.draft.id)
  home.onHide()
})

test("编辑计划最多七天且固定星期不可重复，修改计划不改训练快照", async () => {
  const original = store.snapshot().data
  store.stage({ ...original, draft: core.makeWorkout(original.plan.days[0]) })
  const editor = page("plan-edit")
  for (let i = 0; i < 5; i++) editor.addDay()
  assert.equal(editor.data.plan.days.length, 7)
  assert.ok(notices.some((text) => text.includes("最多 7")))
  const first = editor.plan.days[0],
    second = editor.plan.days[1]
  editor.editDay(event({ id: first.id }))
  editor.dayName(event({}, "新的胸部训练"))
  const oldWeekday = first.weekday
  await editor.weekday(
    event({}, String(core.orderedWeekdays.indexOf(second.weekday))),
  )
  assert.equal(
    editor.plan.days.find((d) => d.id === second.id).weekday,
    oldWeekday,
  )
  assert.equal(new Set(editor.plan.days.map((d) => d.weekday)).size, 7)
  for (const d of editor.plan.days)
    if (!d.exercises.length)
      d.exercises.push(core.makeExercise("俯卧撑", "胸部"))
  await editor.save()
  assert.equal(store.snapshot().data.plan.days.length, 7)
  assert.equal(store.snapshot().data.draft.name, "胸部＋三头")
})

test("未填写次数不可标记完成；离开页面后可恢复未完成训练", async () => {
  const workout = page("workout")
  await workout.chooseExercises({
    detail: { definitions: [core.builtInExercises[0]] },
  })
  workout.toggleSet(event({ index: 0 }))
  assert.equal(workout.data.doneSets, 0)
  assert.ok(notices.some((text) => text.includes("次数")))
  workout.setInput(event({ index: 0, field: "reps" }, "12"))
  const id = workout.workout.id
  store = freshStore()
  assert.equal(store.snapshot().data.draft.id, id)
  assert.equal(store.snapshot().data.draft.exercises[0].sets[0].reps, "12")
})

test("本机存储失败保留输入、不声称成功；重试写入后可恢复", async () => {
  const value = store.clone(store.snapshot().data)
  value.goal = "每周四练"
  failStorage = true
  assert.throws(() => store.stage(value))
  assert.equal(store.snapshot().phase, "error")
  assert.equal(store.snapshot().data.goal, "每周四练")
  assert.equal(JSON.parse(store.backup()).cachedData.goal, "每周四练")
  failStorage = false
  assert.equal(await store.flush(), true)
  store = freshStore()
  assert.equal(store.snapshot().data.goal, "每周四练")
})

test("服务已写入但响应丢失，重新登录重试保留请求身份且只生成一次打卡", async () => {
  await store.login(
    "http://127.0.0.1:8001",
    "test@example.com",
    "test-password",
  )
  const value = store.snapshot().data
  const workout = core.makeWorkout(value.plan.days[0])
  workout.exercises[0].sets[0].reps = "10"
  workout.exercises[0].sets[0].done = true
  server.loseAck = true
  assert.equal(await store.commit(core.archiveWorkout(value, workout)), false)
  const sent = calls
    .filter(
      (call) => typeof call === "object" && call.data && call.data.mutation_id,
    )
    .at(-1)
  assert.equal(store.snapshot().phase, "error")
  const revision = server.revision
  store = freshStore()
  await store.flush()
  const retried = calls
    .filter(
      (call) => typeof call === "object" && call.data && call.data.mutation_id,
    )
    .at(-1)
  assert.deepEqual(retried.data, sent.data)
  assert.equal(server.revision, revision)
  assert.equal(server.data.history.length, 1)
  assert.equal(store.snapshot().phase, "synced")
})

test("云端版本冲突不会覆盖，备份后重新读取保留本机副本", async () => {
  await store.login(
    "http://127.0.0.1:8001",
    "test@example.com",
    "test-password",
  )
  const remote = copy(server.data)
  remote.goal = "网站修改的目标"
  server.data = remote
  server.revision += 1
  const value = store.clone(store.snapshot().data)
  value.goal = "小程序未同步目标"
  assert.equal(await store.commit(value), false)
  assert.equal(store.snapshot().phase, "conflict")
  assert.equal(server.data.goal, "网站修改的目标")
  assert.match(store.backup(), /小程序未同步目标/)
  await store.reloadCloud()
  assert.equal(store.snapshot().data.goal, "网站修改的目标")
  assert.ok(
    [...storage].some(
      ([key, saved]) =>
        key.includes(":backup:") &&
        saved.cachedData.goal === "小程序未同步目标",
    ),
  )
})

test("账号退出后回到单独的本机记录，后端请求携带身份且密码不落存储", async () => {
  store.stage({ ...store.snapshot().data, goal: "本机目标" })
  await store.login(
    "http://127.0.0.1:8001",
    "test@example.com",
    "unique-password-not-stored",
  )
  assert.notEqual(store.snapshot().data.goal, "本机目标")
  const get = calls.find(
    (call) => typeof call === "object" && call.url.endsWith("/fitness/state"),
  )
  assert.equal(get.header.Authorization, "Bearer test-token")
  assert.ok(
    !JSON.stringify([...storage]).includes("unique-password-not-stored"),
  )
  store.logout()
  assert.equal(store.snapshot().data.goal, "本机目标")
  assert.equal(store.snapshot().auth, null)
})

test("损坏的缓存不会初始化覆盖；旧模板中的目标迁移到本机记录", () => {
  storage.set("training-notebook:mini:local:v1", { invalid: "preserve" })
  store = freshStore()
  assert.equal(store.snapshot().ready, false)
  assert.deepEqual(storage.get("training-notebook:mini:local:v1"), {
    invalid: "preserve",
  })
  storage.delete("training-notebook:mini:local:v1")
  storage.set("training-notebook:mini-preview:goal", "原来填写的目标")
  store = freshStore()
  assert.equal(store.snapshot().data.goal, "原来填写的目标")
})

test("旧缓存先原样备份，历史不推测目标；继续旧草稿明确确认才能总结", async () => {
  const old = copy(store.snapshot().data),
    workout = core.makeWorkout(old.plan.days[0])
  workout.exercises[0].sets[0].reps = "10"
  workout.exercises[0].sets[0].done = true
  old.history = [core.archiveWorkout(old, workout).history[0]]
  old.draft = core.makeWorkout(old.plan.days[0])
  old.plan.mode = "flexible"
  old.version = 1
  delete old.exerciseLibrary
  for (const plan of [old.plan, ...old.templates])
    for (const d of plan.days)
      for (const e of d.exercises) {
        for (const key of [
          "libraryId",
          "recordType",
          "equipment",
          "targetSeconds",
        ])
          delete e[key]
        for (const s of e.sets) {
          delete s.targetId
          delete s.durationSeconds
        }
      }
  for (const w of [old.draft, ...old.history]) {
    for (const key of ["execution", "timer", "reviewing"]) delete w[key]
    for (const e of w.exercises) {
      for (const key of [
        "libraryId",
        "recordType",
        "equipment",
        "targetSeconds",
      ])
        delete e[key]
      for (const s of e.sets) {
        delete s.targetId
        delete s.durationSeconds
      }
    }
  }
  const raw = { cachedData: old, revision: 0, pendingId: null, uncertain: null }
  storage.set("training-notebook:mini:local:v1", copy(raw))
  store = freshStore()
  assert.deepEqual(
    storage.get("training-notebook:mini:local:v1:legacy-backup"),
    raw,
  )
  assert.equal(store.snapshot().data.version, 3)
  assert.equal(
    core.workoutCompletion(store.snapshot().data.history[0]).label,
    "目标未保存",
  )
  const resumed = page("workout")
  await resumed.finish()
  assert.equal(resumed.workout.reviewing, false)
  await resumed.confirmTargets()
  await resumed.finish()
  assert.equal(resumed.workout.reviewing, true)
  assert.ok(resumed.workout.execution)
})

test("新增时长组不复制上一组实际秒数，当前组计时从零累计", async () => {
  const originalNow = Date.now
  let now = 100000
  Date.now = () => now
  try {
    const workout = page("workout")
    await workout.chooseExercises({
      detail: { definitions: [core.builtInExercises[15]] },
    })
    workout.setInput(event({ index: 2, field: "durationSeconds" }, "30"))
    workout.addSet()
    assert.equal(workout.workout.exercises[0].sets[3].durationSeconds, null)
    workout.startSetTimer(event({ index: 3 }))
    now += 20000
    workout.stopCurrentSet()
    assert.equal(workout.workout.exercises[0].sets[3].durationSeconds, 20)
    assert.equal(workout.workout.exercises[0].sets[3].done, false)
  } finally {
    Date.now = originalNow
  }
})
