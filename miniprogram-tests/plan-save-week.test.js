const assert = require("node:assert/strict")
const { beforeEach, afterEach, test } = require("node:test")
const core = require("../miniprogram/lib/core")
let storage, notices, modals, confirmAnswer, store
const copy = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value))

beforeEach(() => {
  storage = new Map()
  notices = []
  modals = []
  confirmAnswer = true
  global.wx = {
    getStorageSync: (key) => copy(storage.get(key)),
    setStorageSync: (key, value) => storage.set(key, copy(value)),
    removeStorageSync: (key) => storage.delete(key),
    showToast: (options) => notices.push(options.title),
    showModal(options) {
      modals.push(options)
      options.success({ confirm: confirmAnswer })
    },
    navigateBack() {},
    navigateTo() {},
    nextTick: (callback) => callback(),
    request: (options) => options.fail({ errMsg: "offline" }),
  }
  for (const file of ["store", "api", "page"])
    delete require.cache[require.resolve(`../miniprogram/services/${file}`)]
  store = require("../miniprogram/services/store")
  store.init()
  global.getApp = () => ({ fitness: store })
})
afterEach(() => {
  store.logout()
  delete global.Page
  delete global.getApp
})

function page(name) {
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
      for (const [path, value] of Object.entries(values))
        this.data[path] = copy(value)
    },
  }
  if (instance.onLoad) instance.onLoad({})
  if (instance.onShow) instance.onShow()
  return instance
}

const range = () => core.weekRange()
const dateAt = (i) =>
  core.localDate(
    new Date(new Date(range().start + "T12:00:00").getTime() + i * 86400000),
  )
const weekdayOf = (date) => new Date(date + "T12:00:00").getDay()

function adjustWeek() {
  const data = store.snapshot().data
  const dates = Array.from({ length: 7 }, (_, i) => dateAt(i)).filter((d) =>
    core.dayForDate(data, d),
  )
  const [from, to] = dates
  assert.ok(store.commitRecord(core.swapWeekDates(data, from, to)))
  return { from, to }
}

function editFromDay(edit, date) {
  const day = edit.plan.days.find((d) => d.weekday === weekdayOf(date))
  day.name = "新计划安排"
  return day
}

test("保存计划时本周有调整：选择用新计划，清除本周调整，调整过的日期改用新计划", async () => {
  const { from } = adjustWeek()
  const home = page("home")
  const edit = page("plan-edit")
  editFromDay(edit, from)
  confirmAnswer = true
  await edit.save()
  const data = store.snapshot().data
  assert.equal(modals.length, 1)
  assert.equal(modals[0].confirmText, "用新计划")
  assert.match(modals[0].content, /本周有 2 天/)
  assert.equal(
    data.scheduleOverrides.filter((o) => o.planId === data.plan.id).length,
    0,
  )
  assert.equal(core.dayForDate(data, from).name, "新计划安排")
  assert.equal(home.data.weekAdjusted, false)
  assert.ok(notices.includes("计划已保存，本周改用新计划"))
})

test("选择保留调整：计划保存，本周调整保留，调整过的日期仍按原调整", async () => {
  const { from, to } = adjustWeek()
  const pinned = core.dayForDate(store.snapshot().data, from).id
  const edit = page("plan-edit")
  editFromDay(edit, from)
  confirmAnswer = false
  await edit.save()
  const data = store.snapshot().data
  assert.equal(data.plan.days.find((d) => d.weekday === weekdayOf(from)).name, "新计划安排")
  assert.equal(core.dayForDate(data, from).id, pinned)
  assert.deepEqual(
    data.scheduleOverrides.map((o) => o.date).sort(),
    [from, to].sort(),
  )
})

test("本周调整涉及的安排已有训练记录：计划照常保存，调整保留并说明原因", async () => {
  const { from } = adjustWeek()
  const data = store.snapshot().data
  const day = core.dayForDate(data, from)
  const workout = {
    ...core.makeWorkout(day, data.plan.id),
    date: from,
    status: "completed",
  }
  assert.ok(store.commitRecord({ ...data, history: [workout] }))
  const edit = page("plan-edit")
  editFromDay(edit, from)
  confirmAnswer = true
  await edit.save()
  const saved = store.snapshot().data
  assert.equal(
    saved.plan.days.find((d) => d.weekday === weekdayOf(from)).name,
    "新计划安排",
  )
  assert.equal(saved.scheduleOverrides.length, 2)
  assert.ok(notices.some((n) => n.startsWith("计划已保存；本周调整未恢复")))
})

test("本周没有调整：不弹确认，直接保存", async () => {
  const edit = page("plan-edit")
  edit.plan.days[0].name = "直接保存"
  await edit.save()
  assert.equal(modals.length, 0)
  assert.equal(store.snapshot().data.plan.days[0].name, "直接保存")
})
