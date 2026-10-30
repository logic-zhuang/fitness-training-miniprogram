const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
function record(workout) {
  return {
    ...workout,
    completion: core.workoutCompletion(workout),
    duration: core.duration(workout),
    sets: core.completedSets(workout).length,
    muscles: [
      ...new Set(
        workout.exercises
          .filter((exercise) => exercise.sets.some((set) => set.done))
          .map((exercise) => exercise.muscle),
      ),
    ].join(" · "),
    highlights: workout.exercises
      .flatMap((exercise) => {
        const best = core.bestSet(exercise.sets)
        if (!best) return []
        const before = core.previousExerciseSet(
          store.snapshot().data.history,
          workout,
          exercise,
        )
        const delta = before
          ? Number(best.weight) - Number(before.set.weight)
          : 0
        return [
          {
            id: exercise.id,
            text: `${exercise.name}  ${core.setLabel(best)}${before && delta > 0 ? ` · 比上次 +${delta} kg` : ""}`,
          },
        ]
      })
      .slice(0, 3),
  }
}
Page({
  data: { ready: false, search: "", groups: [] },
  onShow() {
    ui.observe(this, (state) => {
      this.setData({
        overview: core.weeklyOverview(state.data.history),
        muscles: core
          .muscleDistribution(core.weekWorkouts(state.data.history))
          .map((d, _, rows) => ({
            ...d,
            percent: Math.round(
              (d.sets /
                Math.max(
                  1,
                  rows.reduce((sum, r) => sum + r.sets, 0),
                )) *
                100,
            ),
          })),
      })
      this.renderRecords()
    })
  },
  onHide() {
    ui.stop(this)
  },
  onUnload() {
    ui.stop(this)
  },
  retrySync: ui.retry,
  search(event) {
    this.setData({ search: event.detail.value })
    this.renderRecords()
  },
  renderRecords() {
    const value = store.snapshot().data
    if (!value) return
    const query = this.data.search.trim().toLowerCase()
    const filtered = value.history
      .filter((workout) =>
        [
          workout.name,
          workout.date,
          workout.note,
          ...workout.exercises.map((exercise) => exercise.name),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
      .sort((a, b) => core.workoutOrder(b, a))
    const groups = []
    for (const workout of filtered) {
      const month = workout.date.slice(0, 7)
      let group = groups[groups.length - 1]
      if (!group || group.month !== month) {
        group = { month, records: [] }
        groups.push(group)
      }
      group.records.push(record(workout))
    }
    this.setData({ groups, count: filtered.length })
    this.filtered = filtered
    const options = core.recordedExercises(filtered)
    this.setData({
      trendOptions: options,
      trendNames: options.map((d) => d.name + " · " + d.muscle),
    })
    this.renderTrend()
  },
  trend(event) {
    this.setData({ trendIndex: Number(event.detail.value) })
    this.renderTrend()
  },
  renderTrend() {
    const options = this.data.trendOptions || [],
      selected = options[this.data.trendIndex || 0] || options[0]
    if (!selected) {
      this.setData({ trendPoints: [], trendLabel: "" })
      return
    }
    const progress = core.exerciseProgress(this.filtered || [], selected.key),
      points = progress.points.slice(-8)
    const max = Math.max(1, ...points.map((p) => p.value))
    this.setData({
      trendIndex: Math.max(
        0,
        options.findIndex((d) => d.key === selected.key),
      ),
      trendLabel: progress.timed
        ? "每次最长完成组 · 秒"
        : progress.weighted
          ? "每次最高重量组 · kg"
          : "每次自重最多次数 · 次",
      trendPoints: points.map((p) => ({
        ...p,
        height: Math.max(6, (p.value / max) * 120),
        shortDate: p.date.slice(5),
        detail: core.setLabel(p.set),
      })),
    })
  },
  open(event) {
    wx.navigateTo({
      url: `/pages/workout/index?id=${event.currentTarget.dataset.id}`,
    })
  },
  async backfill() {
    if (store.snapshot().data.draft) {
      if (await ui.confirm("已有训练草稿", "先继续并处理当前训练，再补录？"))
        wx.navigateTo({ url: "/pages/workout/index" })
      return
    }
    wx.navigateTo({ url: "/pages/workout/index?backfill=1" })
  },
})
