const assert = require("node:assert/strict")
const { beforeEach, afterEach, test } = require("node:test")
const core = require("../miniprogram/lib/core")
let storage, notices, modals, confirmAnswer, store
const copy = (value) =>
  value === undefined ? undefined : JSON.parse(JSON.stringify(value))
const weekdayOf = (plan, id) => plan.days.find((d) => d.id === id).weekday
const dayOn = (plan, weekday) => plan.days.find((d) => d.weekday === weekday)

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
  delete global.Component
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
  instance.onLoad()
  return instance
}
function picker() {
  let definition
  global.Component = (value) => {
    definition = value
  }
  const file = require.resolve("../miniprogram/components/exercise-picker/index")
  delete require.cache[file]
  require(file)
  const instance = {
    ...definition.methods,
    data: copy(definition.data),
    properties: { single: false, managing: false },
    setData(value) {
      Object.assign(this.data, copy(value))
    },
    triggerEvent(name) {
      this.lastEvent = name
    },
  }
  definition.properties.open.observer.call(instance, true)
  return instance
}

test("移到休息日：原星期变休息，目标获得同一安排，原计划不被修改", () => {
  const plan = core.initialData().plan,
    before = copy(plan),
    monday = dayOn(plan, 1)
  const result = core.moveWeekSchedule(plan, 1, 2)
  assert.equal(result.kind, "move")
  assert.equal(weekdayOf(result.plan, monday.id), 2)
  assert.equal(dayOn(result.plan, 1), undefined)
  assert.deepEqual(dayOn(result.plan, 2).exercises, monday.exercises)
  assert.equal(result.plan.days.length, plan.days.length)
  assert.deepEqual(result.changes, ["胸部＋三头：周一 → 周二", "周一：改为休息"])
  assert.deepEqual(plan, before)
})

test("拖到有安排的一天：两天互换内容，安排身份和动作组数不变", () => {
  const plan = core.initialData().plan,
    monday = dayOn(plan, 1),
    wednesday = dayOn(plan, 3)
  const result = core.moveWeekSchedule(plan, 1, 3)
  assert.equal(result.kind, "swap")
  assert.equal(weekdayOf(result.plan, monday.id), 3)
  assert.equal(weekdayOf(result.plan, wednesday.id), 1)
  assert.equal(result.displaced.id, wednesday.id)
  assert.deepEqual(dayOn(result.plan, 3).exercises, monday.exercises)
  assert.deepEqual(
    result.plan.days.map((d) => d.weekday),
    [1, 3, 5, 0],
    "保存顺序仍按周一到周日",
  )
  assert.deepEqual(result.changes, [
    "胸部＋三头：周一 → 周三",
    "腿部：周三 → 周一",
  ])
})

test("同一天、休息日作为来源不产生变化；无效星期与旧计划重复星期被拒绝", () => {
  const plan = core.initialData().plan
  assert.equal(core.moveWeekSchedule(plan, 1, 1).kind, "none")
  assert.equal(core.moveWeekSchedule(plan, 2, 4).plan, plan)
  assert.throws(() => core.moveWeekSchedule(plan, 1, 7), /有效的星期/)
  const legacy = copy(plan)
  legacy.days[1].weekday = 1
  assert.throws(() => core.moveWeekSchedule(legacy, 1, 2), /确认旧计划/)
})

test("七个固定星期格按周一到周日排列，显示动作数和组数", () => {
  const slots = core.weekScheduleSlots(core.initialData().plan)
  assert.deepEqual(
    slots.map((s) => s.label),
    ["周一", "周二", "周三", "周四", "周五", "周六", "周日"],
  )
  assert.equal(slots[0].exerciseCount, 3)
  assert.equal(slots[0].setCount, 9)
  assert.equal(slots[1].day, null)
})

test("拖到休息日只改草稿，保存整份计划后才写入；进行中草稿和历史保持原快照", async () => {
  const original = store.snapshot().data,
    monday = dayOn(original.plan, 1)
  const draft = core.makeWorkout(monday, original.plan.id)
  const done = { ...core.makeWorkout(monday, original.plan.id), endedAt: 1 }
  store.stage({ ...original, draft, history: [done] })
  const before = copy(store.snapshot().data)
  const editor = page("plan-edit")
  await editor.dragEnd({ from: 1, to: 2 })
  assert.equal(modals.length, 0)
  assert.equal(editor.data.weeks[0].day, null)
  assert.equal(editor.data.weeks[1].day.id, monday.id)
  assert.equal(editor.data.dirty, true)
  assert.equal(editor.data.drop.mode, "settle")
  assert.equal(editor.data.landed[1] && editor.data.landed[2], true)
  assert.deepEqual(store.snapshot().data.plan, before.plan)
  await editor.save()
  const saved = store.snapshot().data
  assert.equal(weekdayOf(saved.plan, monday.id), 2)
  assert.deepEqual(saved.draft, before.draft)
  assert.deepEqual(saved.history, before.history)
  assert.equal(saved.draft.execution.weekday, 1)
})

test("拖到有安排的一天先展示双方变化；取消不改草稿并让卡片回位，确认后互换", async () => {
  const editor = page("plan-edit"),
    before = copy(editor.plan),
    friday = dayOn(before, 5),
    sunday = dayOn(before, 0)
  confirmAnswer = false
  await editor.dragEnd({ from: 5, to: 0 })
  assert.match(modals[0].content, /背部＋二头：周五 → 周日/)
  assert.match(modals[0].content, /肩部＋腹部：周日 → 周五/)
  assert.deepEqual(editor.plan, before)
  assert.equal(editor.data.drop.mode, "revert")
  confirmAnswer = true
  await editor.dragEnd({ from: 5, to: 0 })
  assert.equal(weekdayOf(editor.plan, friday.id), 0)
  assert.equal(weekdayOf(editor.plan, sunday.id), 5)
  assert.equal(editor.data.drop.mode, "settle")
  assert.ok(editor.data.drop.seq > 1)
})

test("松手不在其他格不改动；拖动刚结束的点击不进入编辑，之后点击卡片仍可编辑", async () => {
  const editor = page("plan-edit"),
    before = copy(editor.plan)
  editor.dragStart({ weekday: 1 })
  await editor.dragEnd({ from: 1, to: -1 })
  assert.deepEqual(editor.plan, before)
  const tap = { currentTarget: { dataset: { id: before.days[0].id } } }
  editor.editDay(tap)
  assert.equal(editor.data.selectedDay, null)
  editor.dragEndedAt = 0
  editor.editDay(tap)
  assert.equal(editor.data.selectedDay.id, before.days[0].id)
})

test("拖到页面边缘时自动滚动，滚动范围限制在页面内容内，松手即停止", async () => {
  const scrolls = []
  global.wx.pageScrollTo = (options) => scrolls.push(options.scrollTop)
  global.wx.getWindowInfo = () => ({ windowHeight: 600 })
  global.wx.createSelectorQuery = () => {
    const query = {
      select: () => query,
      boundingClientRect: () => query,
      selectViewport: () => query,
      scrollOffset: () => query,
      exec: (callback) => callback([{ bottom: 625 }, { scrollTop: 10 }]),
    }
    return query
  }
  const editor = page("plan-edit")
  editor.dragStart({ weekday: 1 })
  assert.equal(editor.maxScroll, 35)
  editor.autoScroll({ dir: 1 })
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.ok(scrolls.length >= 2)
  assert.equal(Math.max(...scrolls), 35)
  editor.autoScroll({ dir: -1 })
  await new Promise((resolve) => setTimeout(resolve, 120))
  assert.equal(scrolls.at(-1), 0)
  await editor.dragEnd({ from: 1, to: -1 })
  const count = scrolls.length
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(scrolls.length, count)
})

test("旧计划存在重复星期时拒绝拖动并回位，提示先确认星期", async () => {
  const value = store.snapshot().data
  const plan = copy(value.plan)
  plan.mode = "flexible"
  plan.days[1].weekday = 1
  store.stage({ ...value, plan })
  const editor = page("plan-edit")
  assert.equal(editor.data.legacy, true)
  await editor.dragEnd({ from: 1, to: 2 })
  assert.deepEqual(editor.plan, plan)
  assert.equal(editor.data.drop.mode, "revert")
  assert.ok(notices.some((n) => n.includes("确认旧计划")))
})

test("动作选择器的键盘高度只作内边距，失焦、收起创建、关闭后都会复位", async () => {
  const select = picker()
  select.create()
  select.focusField({
    currentTarget: { id: "create-note" },
    detail: { height: 300 },
  })
  assert.equal(select.data.keyboardHeight, 300)
  assert.equal(select.data.scrollTarget, "create-note")
  select.blurField()
  select.focusField({ currentTarget: { id: "create-name" }, detail: {} })
  await new Promise((resolve) => setTimeout(resolve, 150))
  assert.equal(select.data.keyboardHeight, 300, "切换输入框不闪回")
  select.keyboard({ detail: { height: 0 } })
  assert.equal(select.data.keyboardHeight, 0)
  select.keyboard({ detail: { height: 280 } })
  select.create()
  assert.equal(select.data.keyboardHeight, 0, "收起表单时输入框被移除也复位")
  select.keyboard({ detail: { height: 280 } })
  select.close()
  assert.equal(select.data.keyboardHeight, 0)
  assert.equal(select.lastEvent, "close")
})
