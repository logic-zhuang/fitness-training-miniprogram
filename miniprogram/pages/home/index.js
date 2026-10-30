const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
Page({
  data: {
    ready: false,
    weekOpen: false,
    weekSaving: false,
    weekError: "",
    backfillOpen: false,
    backfillDays: [],
    restToday: false,
  },
  onShow() {
    ui.observe(this, (state) => {
      const value = state.data,
        summary = core.planWeekSummary(
          core.scheduledPlan(value),
          value.history,
          undefined,
          value.scheduleOverrides,
        )
      if (
        this.data.weekOpen &&
        this.weekContext?.owner !== this.arrangementContext().owner
      )
        this.closeWeek()
      const next =
        value.plan.mode === "fixed"
          ? core.dayForDate(value, core.localDate())
          : null
      const range = core.weekRange()
      const adjustedDates = value.scheduleOverrides
        .filter(
          (o) =>
            o.planId === value.plan.id &&
            o.date >= range.start &&
            o.date <= range.end,
        )
        .map((o) => o.date)
      this.setData({
        draft: value.draft,
        plan: value.plan,
        completed: summary.completed,
        sessions: summary.sessions,
        progress: summary.progress,
        next: next || null,
        date: core.localDate(),
        goal: value.goal,
        lastRecord:
          [...value.history].sort((a, b) => core.workoutOrder(b, a))[0] || null,
        legacy: value.plan.mode !== "fixed" || !!core.validatePlan(value.plan),
        restToday: value.scheduleOverrides.some(
          (o) =>
            o.planId === value.plan.id &&
            o.date === core.localDate() &&
            o.dayId === null,
        ),
        weekAdjusted: adjustedDates.length > 0,
        days: summary.days.map((d, i) => ({
          ...d,
          adjusted: adjustedDates.includes(
            core.localDate(
              new Date(
                new Date(range.start + "T12:00:00").getTime() + i * 86400000,
              ),
            ),
          ),
          summary: d.day ? d.day.exercises.map((e) => e.name).join(" · ") : "",
        })),
      })
    })
  },
  onHide() {
    this.closeWeek()
    ui.stop(this)
  },
  onUnload() {
    this.closeWeek()
    ui.stop(this)
  },
  retrySync: ui.retry,
  async start(event) {
    const state = store.snapshot()
    if (!state.ready) return ui.notify(new Error("请先读取训练记录"))
    const context = this.arrangementContext()
    const day = state.data.plan.days.find(
      (d) => d.id === event.currentTarget.dataset.id,
    )
    if (state.data.draft) {
      if (day && day.id !== state.data.draft.dayId) {
        const choice = await new Promise((resolve) =>
          wx.showActionSheet({
            itemList: [
              "继续「" + state.data.draft.name + "」",
              "放弃草稿，开始「" + day.name + "」",
            ],
            success: (r) => resolve(r.tapIndex),
            fail: () => resolve(null),
          }),
        )
        if (choice === null) return
        if (choice === 1) {
          if (
            ui.attempt(() =>
              store.stage({
                ...store.snapshot().data,
                draft: core.makeWorkout(day, state.data.plan.id),
              }),
            ) === false
          )
            return
          wx.navigateTo({ url: "/pages/workout/index" })
          return
        }
      }
      if (
        !this.arrangementValid(context) ||
        store.snapshot().data.draft?.id !== state.data.draft.id
      )
        return
      if (
        ui.attempt(() =>
          store.stage({
            ...store.snapshot().data,
            draft:
              state.data.draft.flow.stage === "recording"
                ? core.resumeWorkout(state.data.draft)
                : state.data.draft,
          }),
        ) === false
      )
        return
    } else {
      if (
        day &&
        (state.data.plan.mode !== "fixed" || core.validatePlan(state.data.plan))
      )
        return wx.navigateTo({ url: "/pages/plan-edit/index" })
      if (
        ui.attempt(() =>
          store.stage({
            ...state.data,
            draft: core.makeWorkout(day, state.data.plan.id),
          }),
        ) === false
      )
        return
    }
    wx.navigateTo({ url: "/pages/workout/index" })
  },
  async openBackfill() {
    const state = store.snapshot()
    if (!state.ready) return ui.notify(new Error("请先读取训练记录"))
    if (state.data.draft) {
      if (
        await ui.confirm(
          "已有进行中的训练",
          "先继续并处理当前草稿，再新建补录？",
        )
      )
        wx.navigateTo({ url: "/pages/workout/index" })
      return
    }
    const days = core.planWeekSummary(
      state.data.plan,
      state.data.history,
      undefined,
      state.data.scheduleOverrides,
    ).days
    const pending = days.filter((d) => d.day && d.state === "待训练")
    if (!pending.length) {
      wx.showToast({ title: "本周没有待补训的安排", icon: "none" })
      return
    }
    this.setData({
      backfillOpen: true,
      backfillDays: pending.map((d) => ({
        ...d,
        pickerLabel:
          core.weekdays[d.weekday] + " · " + d.day.name,
      })),
    })
  },
  backfillFree() {
    this.closeBackfill()
    wx.navigateTo({ url: "/pages/workout/index?backfill=1" })
  },
  closeBackfill() {
    this.setData({ backfillOpen: false })
  },
  async chooseBackfill(e) {
    const day = this.data.backfillDays.find(
      (d) => d.day.id === e.currentTarget.dataset.dayid,
    )?.day
    if (!day) return
    if (
      !(await ui.confirm(
        "补练安排",
        "按「" + day.name + "」训练，今天完成并记在今天；原日期会显示已补练。",
      ))
    )
      return
    const state = store.snapshot()
    if (!state.ready || state.data.draft) {
      this.closeBackfill()
      return
    }
    const draft = core.makeWorkout(day, state.data.plan.id)
    draft.source = "backfill"
    draft.name = "补练 · " + day.name
    draft.timer = null
    if (
      ui.attempt(() => store.stage({ ...state.data, draft })) === false
    ) {
      this.closeBackfill()
      return
    }
    this.closeBackfill()
    wx.navigateTo({ url: "/pages/workout/index" })
  },
  async toggleRest() {
    const state = store.snapshot()
    if (!state.ready) return ui.notify(new Error("请先读取训练记录"))
    if (state.data.draft)
      return ui.notify(new Error("请先处理进行中的训练，再安排休息"))
    const today = core.localDate()
    const rest = state.data.scheduleOverrides.some(
      (o) =>
        o.planId === state.data.plan.id &&
        o.date === today &&
        o.dayId === null,
    )
    const overrides = rest
      ? state.data.scheduleOverrides.filter(
          (o) =>
            !(o.planId === state.data.plan.id && o.date === today && o.dayId === null),
        )
      : [
          ...state.data.scheduleOverrides,
          { planId: state.data.plan.id, date: today, dayId: null },
        ]
    if (
      ui.attempt(() =>
        store.stage({ ...state.data, scheduleOverrides: overrides }),
      ) === false
    )
      return
    wx.showToast({
      title: rest ? "已恢复今天的训练" : "今天已休息",
      icon: "none",
    })
  },
  async discardDraft() {
    const state = store.snapshot()
    if (!state.ready || !state.data.draft) return
    if (
      !(await ui.confirm(
        "放弃草稿",
        "移除未完成的草稿，恢复为未开始状态。已有记录不受影响。",
      ))
    )
      return
    if (
      ui.attempt(() => store.stage({ ...state.data, draft: null })) === false
    )
      return
    wx.showToast({ title: "已放弃", icon: "success" })
  },
  openPlan() {
    wx.switchTab({ url: "/pages/plans/index" })
  },
  openJournal() {
    wx.navigateTo({ url: "/pages/journal/index" })
  },
  async adjustToday() {
    const state = store.snapshot()
    if (!state.ready) return ui.notify(new Error("请先读取训练记录"))
    if (state.data.draft) return this.start({ currentTarget: { dataset: {} } })
    const day = core.dayForDate(state.data, core.localDate()),
      now = Date.now()
    if (
      day &&
      (state.data.plan.mode !== "fixed" || core.validatePlan(state.data.plan))
    )
      return this.openPlan()
    if (
      ui.attempt(() =>
        store.stage({
          ...state.data,
          draft: core.prepareWorkout(
            core.makeWorkout(day, state.data.plan.id, now),
            now,
          ),
        }),
      ) === false
    )
      return
    wx.navigateTo({ url: "/pages/workout/index?adjust=1" })
  },
  arrangementContext() {
    const state = store.snapshot()
    const value = state.data ? core.fitnessSchema.parse(state.data) : null
    return {
      owner: state.auth
        ? state.auth.server + ":" + state.auth.user.id
        : "local",
      plan: JSON.stringify(value?.plan),
      overrides: JSON.stringify(value?.scheduleOverrides),
      week: core.weekRange().start,
    }
  },
  arrangementValid(context) {
    const current = this.arrangementContext()
    if (
      !store.snapshot().ready ||
      Object.keys(context).some((k) => context[k] !== current[k])
    ) {
      ui.notify(new Error("账号或安排已变化，请重新打开日期调整"))
      return false
    }
    return true
  },
  async restoreWeek() {
    if (!store.snapshot().ready) return
    const context = this.arrangementContext()
    if (
      await ui.confirm(
        "恢复本周默认安排",
        "仅恢复本周日期，不修改每周模板。已有训练或草稿的安排会保留，并提示不能恢复。",
      )
    ) {
      if (!this.arrangementValid(context)) return
      ui.attempt(() =>
        store.commitRecord(core.resetWeekDates(store.snapshot().data)),
      )
    }
  },
  moveWeek() {
    if (!store.snapshot().ready) return
    this.weekContext = this.arrangementContext()
    this.weekBase = store.clone(store.snapshot().data.scheduleOverrides)
    const range = core.weekRange(),
      start = new Date(range.start + "T12:00:00")
    const dates = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return core.localDate(d)
    })
    const rows = dates.map((date) => ({
      date,
      label:
        date.slice(5) +
        " · " +
        core.weekdays[new Date(date + "T12:00:00").getDay()],
      name: core.dayForDate(store.snapshot().data, date)?.name || "休息",
    }))
    const from = Math.max(0, dates.indexOf(core.localDate()))
    this.setData({
      weekOpen: true,
      weekSaving: false,
      weekError: "",
      weekRows: rows,
      weekTitles: rows.map((row) => row.label + " · " + row.name),
      weekFrom: from,
      weekTo: (from + 1) % 7,
    })
    this.previewWeek()
  },
  chooseWeekDate(e) {
    if (!this.data.weekOpen || this.data.weekSaving) return
    const field = e.currentTarget.dataset.field,
      index = Number(e.detail.value)
    if (
      !["weekFrom", "weekTo"].includes(field) ||
      !Number.isInteger(index) ||
      index < 0 ||
      index > 6
    )
      return
    this.setData({ [field]: index, weekError: "" })
    this.previewWeek()
  },
  previewWeek() {
    const from = this.data.weekRows[this.data.weekFrom],
      to = this.data.weekRows[this.data.weekTo]
    this.setData({
      weekChanges: [
        { date: from.label, before: from.name, after: to.name },
        { date: to.label, before: to.name, after: from.name },
      ],
    })
  },
  closeWeek() {
    this.setData({ weekOpen: false })
    this.weekContext = null
    this.weekBase = null
  },
  keepSheet() {},
  applyWeek() {
    if (!this.data.weekOpen || this.data.weekSaving || !this.weekContext) return
    if (!this.arrangementValid(this.weekContext)) return this.closeWeek()
    if (this.data.weekFrom === this.data.weekTo)
      return this.setData({ weekError: "请选择两个不同日期" })
    this.setData({ weekSaving: true, weekError: "" })
    let attemptedContext
    try {
      const value = core.swapWeekDates(
        { ...store.snapshot().data, scheduleOverrides: this.weekBase },
        this.data.weekRows[this.data.weekFrom].date,
        this.data.weekRows[this.data.weekTo].date,
      )
      attemptedContext = {
        ...this.weekContext,
        overrides: JSON.stringify(value.scheduleOverrides),
      }
      if (!store.commitRecord(value)) {
        // 失败后内存可已更新；重试仍从原安排计算，不能再次交换而还原。
        this.weekContext = this.arrangementContext()
        throw new Error(store.snapshot().error || "本周调整未保存，请重试")
      }
      this.closeWeek()
      wx.showToast({ title: "本周安排已保存到此设备", icon: "none" })
    } catch (error) {
      const current = this.arrangementContext()
      if (
        attemptedContext &&
        this.weekContext &&
        Object.keys(attemptedContext).every(
          (key) => attemptedContext[key] === current[key],
        )
      )
        this.weekContext = current
      this.setData({ weekError: error.message })
      ui.notify(error)
    } finally {
      this.setData({ weekSaving: false })
    }
  },
})
