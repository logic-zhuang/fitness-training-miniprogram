const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
Page({
  data: { ready: false },
  onShow() {
    ui.observe(this, (state) =>
      this.setData({
        plan: state.data.plan,
        legacy:
          state.data.plan.mode !== "fixed" ||
          !!core.validatePlan(state.data.plan),
        days: core.planWeekSummary(state.data.plan, state.data.history).days,
      }),
    )
  },
  onHide() {
    ui.stop(this)
  },
  onUnload() {
    ui.stop(this)
  },
  retrySync: ui.retry,
  edit() {
    wx.navigateTo({ url: "/pages/plan-edit/index" })
  },
  async start(event) {
    const state = store.snapshot()
    if (!state.ready) return ui.notify(new Error("请先读取训练记录"))
    if (state.data.plan.mode !== "fixed" || core.validatePlan(state.data.plan))
      return this.edit()
    const day = state.data.plan.days.find(
      (item) => item.id === event.currentTarget.dataset.id,
    )
    if (state.data.draft) {
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
      if (
        ui.attempt(() =>
          store.stage({
            ...state.data,
            draft:
              choice === 1
                ? core.makeWorkout(day, state.data.plan.id)
                : core.resumeWorkout(state.data.draft),
          }),
        ) === false
      )
        return
    } else if (
      ui.attempt(() =>
        store.stage({
          ...state.data,
          draft: core.makeWorkout(day, state.data.plan.id),
        }),
      ) === false
    )
      return
    wx.navigateTo({ url: "/pages/workout/index" })
  },
})
