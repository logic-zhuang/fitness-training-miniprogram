const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
const weekdays = core.orderedWeekdays.map((value) => core.weekdays[value])
Page({
  data: {
    ready: false,
    saving: false,
    selectedDay: null,
    pickerOpen: false,
    weekdays,
    counts: Array.from({ length: 100 }, (_, i) => i + 1),
    landed: {},
    drop: null,
  },
  onLoad() {
    this.prepare()
  },
  onShow() {
    ui.observe(this, () => {
      if (!this.plan) this.prepare()
    })
  },
  onHide() {
    ui.stop(this)
    this.autoScroll({ dir: 0 })
  },
  onUnload() {
    ui.stop(this)
    this.autoScroll({ dir: 0 })
    clearTimeout(this.landedTimer)
    if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
  },
  prepare() {
    const state = store.snapshot()
    if (!state.ready || this.plan) return
    this.owner = state.auth
      ? state.auth.server + ":" + state.auth.user.id
      : "local"
    this.plan = store.clone(state.data.plan)
    this.original = JSON.stringify(this.plan)
    this.unconfirmed = new Set(
      core.needsScheduleConfirmation(this.plan)
        ? this.plan.days.map((d) => d.id)
        : [],
    )
    this.invalidSeconds = new Set()
    this.render()
  },
  render(extra = {}) {
    const selected = this.plan.days.find((d) => d.id === this.editingId)
    const dirty = JSON.stringify(this.plan) !== this.original
    if (dirty && wx.enableAlertBeforeUnload)
      wx.enableAlertBeforeUnload({ message: "计划修改尚未保存，确认离开？" })
    else if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
    this.setData({
      ready: true,
      dirty,
      plan: this.plan,
      selectedDay: selected
        ? {
            ...selected,
            confirmed: !this.unconfirmed.has(selected.id),
            weekdayIndex: core.orderedWeekdays.indexOf(selected.weekday),
            exercises: selected.exercises.map((e) => ({
              ...e,
              countIndex: e.sets.length - 1,
            })),
          }
        : null,
      positions: selected
        ? selected.exercises.map((e, i) => "第 " + (i + 1) + " 位")
        : [],
      weekdayOptions: selected
        ? core.orderedWeekdays.map(
            (w) =>
              core.weekdays[w] +
              (this.plan.days.some(
                (d) => d.weekday === w && d.id !== selected.id,
              )
                ? " · 已占用，选择后交换"
                : ""),
          )
        : weekdays,
      legacyDays: this.plan.days.map((d) => ({
        ...d,
        confirmed: !this.unconfirmed.has(d.id),
      })),
      legacy:
        this.unconfirmed.size > 0 || core.needsScheduleConfirmation(this.plan),
      weeks: core.weekScheduleSlots(this.plan),
      landed: this.landed || {},
      ...extra,
    })
  },
  selected() {
    return this.plan.days.find((d) => d.id === this.editingId)
  },
  inputPlan(e) {
    this.plan.name = e.detail.value
    this.render()
  },
  dayName(e) {
    this.selected().name = e.detail.value
    this.render()
  },
  editDay(e) {
    if (this.dragging || Date.now() - (this.dragEndedAt || 0) < 400) return
    this.editingId = e.currentTarget.dataset.id
    this.render()
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  overview() {
    const day = this.selected()
    this.editingId = null
    this.render()
    if (day && wx.pageScrollTo)
      wx.pageScrollTo({ selector: "#week-" + day.weekday, duration: 0 })
  },
  confirmWeekday() {
    this.unconfirmed.delete(this.editingId)
    this.render()
  },
  dragStart() {
    this.dragging = true
    this.scrollTop = 0
    this.maxScroll = 0
    if (wx.vibrateShort) wx.vibrateShort({ type: "medium" })
    if (!wx.createSelectorQuery) return
    wx.createSelectorQuery()
      .select(".plan-page")
      .boundingClientRect()
      .selectViewport()
      .scrollOffset()
      .exec(([content, view] = []) => {
        if (!content || !view) return
        const info = wx.getWindowInfo
          ? wx.getWindowInfo()
          : wx.getSystemInfoSync()
        this.scrollTop = view.scrollTop
        this.maxScroll = Math.max(
          0,
          view.scrollTop + content.bottom - info.windowHeight,
        )
      })
  },
  autoScroll({ dir }) {
    clearInterval(this.scrollTimer)
    this.scrollTimer = null
    if (!dir || !wx.pageScrollTo) return
    this.scrollTimer = setInterval(() => {
      const next = Math.min(
        this.maxScroll,
        Math.max(0, this.scrollTop + dir * 10),
      )
      if (next === this.scrollTop) return
      this.scrollTop = next
      wx.pageScrollTo({ scrollTop: next, duration: 0 })
    }, 16)
  },
  // 拖动只改本页草稿；有安排的目标沿用交换确认，取消或失败时卡片回到原位。
  async dragEnd({ from, to }) {
    this.dragging = false
    this.dragEndedAt = Date.now()
    this.autoScroll({ dir: 0 })
    if (to < 0 || to === from) return
    let result
    try {
      result = core.moveWeekSchedule(this.plan, from, to)
    } catch (problem) {
      ui.notify(problem)
      return this.settleDrop("revert")
    }
    if (result.kind === "none") return this.settleDrop("revert")
    if (
      result.kind === "swap" &&
      !(await ui.confirm("交换安排", result.changes.join("\n")))
    )
      return this.settleDrop("revert")
    if (result.kind === "move")
      await new Promise((resolve) => setTimeout(resolve, 180))
    this.plan = result.plan
    for (const day of [result.moved, result.displaced])
      if (day) this.unconfirmed.delete(day.id)
    this.landed = { [from]: true, [to]: true }
    this.settleDrop("settle")
    clearTimeout(this.landedTimer)
    this.landedTimer = setTimeout(() => {
      this.landed = {}
      this.render()
    }, 600)
  },
  settleDrop(mode) {
    this.dropSeq = (this.dropSeq || 0) + 1
    this.render({ drop: { seq: this.dropSeq, mode } })
  },
  async weekday(e) {
    const day = this.selected(),
      weekday = core.orderedWeekdays[Number(e.detail.value)]
    const occupied = this.plan.days.find(
      (d) => d.weekday === weekday && d.id !== day.id,
    )
    if (
      occupied &&
      !(await ui.confirm(
        "交换安排",
        day.name +
          "：" +
          core.weekdays[day.weekday] +
          " → " +
          core.weekdays[weekday] +
          "\n" +
          occupied.name +
          "：" +
          core.weekdays[weekday] +
          " → " +
          core.weekdays[day.weekday],
      ))
    )
      return
    this.plan = core.moveTrainingDay(this.plan, day.id, weekday)
    this.unconfirmed.delete(day.id)
    if (occupied) this.unconfirmed.delete(occupied.id)
    this.render()
  },
  addDay(e) {
    if (this.plan.days.length >= 7)
      return ui.notify(new Error("一周最多 7 个训练日"))
    const supplied = e && e.currentTarget && e.currentTarget.dataset.weekday
    const weekday =
      supplied === undefined
        ? core.orderedWeekdays.find(
            (w) => !this.plan.days.some((d) => d.weekday === w),
          )
        : Number(supplied)
    if (this.plan.days.some((d) => d.weekday === weekday)) return
    const day = {
      id: core.id(),
      name: core.weekdays[weekday] + "训练",
      weekday,
      exercises: [],
    }
    this.plan.days.push(day)
    this.editingId = day.id
    this.render()
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  async removeDay() {
    if (
      !(await ui.confirm(
        "取消这天的安排",
        "只影响以后开始的训练，进行中的草稿和历史保持原内容。",
      ))
    )
      return
    this.plan.days = this.plan.days.filter((d) => d.id !== this.editingId)
    this.unconfirmed.delete(this.editingId)
    this.editingId = null
    this.render()
  },
  openPicker() {
    this.setData({ pickerOpen: true })
  },
  closePicker() {
    this.setData({ pickerOpen: false })
  },
  chooseExercises(e) {
    const day = this.selected(),
      definitions = e.detail.definitions
    if (day.exercises.length + definitions.length > 100)
      return ui.notify(new Error("单日最多 100 个动作"))
    day.exercises.push(...definitions.map(core.exerciseFromDefinition))
    this.setData({ pickerOpen: false })
    this.render()
  },
  setCount(e) {
    const exercise = this.selected().exercises.find(
      (x) => x.id === e.currentTarget.dataset.id,
    )
    const count = this.data.counts[Number(e.detail.value)]
    exercise.sets = Array.from(
      { length: count },
      (_, i) => exercise.sets[i] || core.makeSet(),
    )
    this.render()
  },
  targetSeconds(e) {
    const exercise = this.selected().exercises.find(
      (x) => x.id === e.currentTarget.dataset.id,
    )
    const text = e.detail.value.trim()
    if (text && !/^[1-9]\d*$/.test(text)) {
      this.invalidSeconds.add(exercise.id)
      this.setData({ error: "目标秒数请输入正整数" })
      return
    }
    this.invalidSeconds.delete(exercise.id)
    exercise.targetSeconds = text ? Number(text) : null
    this.setData({ error: "" })
    this.render()
  },
  exerciseNote(e) {
    this.selected().exercises.find(
      (x) => x.id === e.currentTarget.dataset.id,
    ).note = e.detail.value
    this.render()
  },
  moveExercise(e) {
    const day = this.selected(),
      index = day.exercises.findIndex(
        (x) => x.id === e.currentTarget.dataset.id,
      )
    const item = day.exercises.splice(index, 1)[0]
    day.exercises.splice(Number(e.detail.value), 0, item)
    this.render()
  },
  async removeExercise(e) {
    if (!(await ui.confirm("移除计划动作", "既有训练和个人动作库保持原内容。")))
      return
    this.selected().exercises = this.selected().exercises.filter(
      (x) => x.id !== e.currentTarget.dataset.id,
    )
    this.render()
  },
  async save() {
    if (this.data.saving) return
    if (
      this.plan.days.some((d) =>
        d.exercises.some((e) => this.invalidSeconds.has(e.id)),
      )
    )
      return ui.notify(new Error("请修正目标秒数后保存"))
    const state = store.snapshot(),
      owner = state.auth
        ? state.auth.server + ":" + state.auth.user.id
        : "local"
    if (owner !== this.owner || !state.ready)
      return ui.notify(new Error("账号已变化，请重新打开计划"))
    if (this.unconfirmed.size)
      return ui.notify(new Error("请先确认旧计划各训练日的星期"))
    const plan = store.clone(this.plan)
    plan.mode = "fixed"
    plan.name = plan.name.trim()
    plan.days.sort(
      (a, b) =>
        core.orderedWeekdays.indexOf(a.weekday) -
        core.orderedWeekdays.indexOf(b.weekday),
    )
    plan.days.forEach((d) => {
      d.name = d.name.trim()
    })
    const problem =
      core.validatePlan(plan) ||
      (plan.days.some((d) => !d.exercises.length)
        ? "每个训练日请至少选择一个动作"
        : "")
    if (problem) return ui.notify(new Error(problem))
    this.setData({ saving: true, error: "" })
    try {
      const range = core.weekRange()
      const adjusted = state.data.scheduleOverrides.filter(
        (o) =>
          o.planId === plan.id && o.date >= range.start && o.date <= range.end,
      ).length
      const useNewPlan =
        adjusted > 0 &&
        (await ui.confirm(
          "本周有调整过的日期",
          "本周有 " +
            adjusted +
            " 天按「调整本周日期」安排，不会跟着新计划变。恢复本周默认安排，改用新计划吗？已有训练记录的日期会保留。",
          { confirmText: "用新计划", cancelText: "保留调整" },
        ))
      const latest = store.snapshot()
      if (
        !latest.ready ||
        (latest.auth
          ? latest.auth.server + ":" + latest.auth.user.id
          : "local") !== this.owner
      )
        return ui.notify(new Error("账号已变化，请重新打开计划"))
      const value = latest.data
      let next = {
        ...value,
        plan,
        templates: [plan, ...value.templates.filter((p) => p.id !== plan.id)],
      }
      let kept = ""
      if (useNewPlan) {
        try {
          next = core.resetWeekDates(next)
        } catch (error) {
          kept = error.message
        }
      }
      const ok = await store.commit(next)
      if (!ok) {
        this.setData({ error: store.snapshot().error })
        return
      }
      this.original = JSON.stringify(plan)
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
      if (kept) ui.notify(new Error("计划已保存；本周调整未恢复：" + kept))
      else if (useNewPlan)
        wx.showToast({ title: "计划已保存，本周改用新计划", icon: "none" })
      else wx.showToast({ title: "计划已保存" })
      wx.navigateBack()
    } catch (error) {
      this.setData({ error: error.message })
      ui.notify(error)
    } finally {
      this.setData({ saving: false })
    }
  },
})
