const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
const photos = require("../../services/photos")
const clock = (seconds) =>
  String(Math.floor(seconds / 60)).padStart(2, "0") +
  ":" +
  String(seconds % 60).padStart(2, "0")
Page({
  data: {
    ready: false,
    saving: false,
    selected: 0,
    historyMode: false,
    editing: false,
    pickerOpen: false,
    pickerSingle: false,
    targetOpen: false,
    restExpanded: false,
    saved: false,
    preparing: false,
    menuOpen: false,
    orderOpen: false,
    photoPanel: false,
    photoKind: "workout",
    photoTags: "",
    photoAngle: "正面",
    photoUploading: false,
    photoError: "",
  },
  onLoad(options) {
    this.options = options || {}
    this.prepare()
  },
  prepare() {
    if (this.initializing || this.workout || !store.snapshot().ready) return
    this.initializing = true
    try {
      const state = store.snapshot(),
        value = state.data
      this.owner = state.auth
        ? state.auth.server + ":" + state.auth.user.id
        : "local"
      if (this.options.id) {
        const found = value.history.find((w) => w.id === this.options.id)
        if (!found) return ui.notify(new Error("这条记录不存在"))
        this.workout = store.clone(found)
        this.setData({ historyMode: true, saved: true })
      } else {
        if (!value.draft) {
          const draft = core.makeWorkout()
          if (this.options.backfill) {
            draft.source = "backfill"
            draft.name = "补录训练"
            draft.timer = null
          }
          store.stage({ ...value, draft })
        }
        this.workout = store.clone(store.snapshot().data.draft)
      }
      this.setData({
        ready: true,
        today: core.localDate(),
        selected: Math.max(
          0,
          this.workout.exercises.findIndex(
            (e) => e.id === this.workout.flow.currentExerciseId,
          ),
        ),
      })
      if (this.workout.flow.stage === "preparing")
        this.setData({ preparing: true, listOpen: true })
      this.renderWorkout()
    } finally {
      this.initializing = false
    }
  },
  onShow() {
    ui.observe(this, (state) => {
      const owner = state.auth
        ? state.auth.server + ":" + state.auth.user.id
        : "local"
      if (this.owner && this.owner !== owner) {
        this.stopAdvance()
        this.closeActions()
        this.setData({ ready: false })
        if (!this.ownerChanged) {
          this.ownerChanged = true
          ui.notify(new Error("账号已变化，请从首页重新打开训练"))
          wx.switchTab({ url: "/pages/home/index" })
        }
        return
      }
      if (!state.ready) return
      if (!this.workout) this.prepare()
      else this.renderWorkout()
    })
    clearInterval(this.ticker)
    this.ticker = setInterval(() => {
      if (this.workout) this.tick()
    }, 500)
  },
  onHide() {
    this.stopAdvance()
    this.closeActions()
    this.stopSetTimer()
    ui.stop(this)
    clearInterval(this.ticker)
    void store.flush()
  },
  onUnload() {
    this.stopAdvance()
    this.closeActions()
    this.stopSetTimer()
    ui.stop(this)
    clearInterval(this.ticker)
  },
  ownerValid() {
    const state = store.snapshot(),
      owner = state.auth
        ? state.auth.server + ":" + state.auth.user.id
        : "local"
    if (owner !== this.owner || !state.ready) {
      ui.notify(new Error("账号已变化，请返回首页重新打开训练"))
      return false
    }
    return true
  },
  renderWorkout() {
    this.setData({
      movementRows: this.workout.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        label: core.exerciseFinished(this.workout, e)
          ? "已完成"
          : e.sets.filter((s) => s.done).length + "/" + e.sets.length + " 组",
      })),
    })
    const selected = Math.min(
      this.data.selected,
      Math.max(0, this.workout.exercises.length - 1),
    )
    const exercise = this.workout.exercises[selected] || null
    let previous = null,
      lastSet = null
    if (exercise) {
      for (const w of [...store.snapshot().data.history].sort((a, b) =>
        core.workoutOrder(b, a),
      )) {
        if (w.id === this.workout.id || core.workoutOrder(w, this.workout) >= 0)
          continue
        const best = core.bestSet(
          w.exercises
            .filter((e) => core.exerciseKey(e) === core.exerciseKey(exercise))
            .flatMap((e) => e.sets),
        )
        if (best) {
          previous = w.date + " · " + core.setLabel(best)
          lastSet =
            exercise.recordType === "reps"
              ? { weight: best.weight, reps: best.reps }
              : null
          break
        }
      }
    }
    const completion = core.workoutCompletion(this.workout)
    this.setData({
      legacyAcknowledged: !!this.legacyAcknowledged,
      targetGroups: completion.groups.map((g) => ({
        ...g,
        missing: !this.workout.exercises.some((e) => e.id === g.id),
      })),
    })
    this.setData({
      workout: this.workout,
      preparing: this.workout.flow.stage === "preparing",
      selected,
      exercise,
      previous,
      completion,
      comparisons: core.workoutComparisons(
        this.workout,
        store.snapshot().data.history,
      ),
      lastSet,
      copyReady:
        !!exercise &&
        exercise.recordType === "reps" &&
        exercise.sets.length > 1 &&
        !!exercise.sets[0].reps,
      week: core.planWeekSummary(
        core.scheduledPlan(store.snapshot().data),
        store.snapshot().data.history,
      ),
      exerciseCount: this.workout.exercises.filter((e) =>
        e.sets.some((s) => s.done),
      ).length,
      nextName: core.nextExercise(this.workout)?.name || "全部动作已完成",
      doneSets: core.completedSets(this.workout).length,
      summaryExercises: this.workout.exercises.map((e) => ({
        name: e.name,
        count: e.sets.filter((s) => s.done).length,
        detail: e.sets
          .filter((s) => s.done)
          .map(core.setLabel)
          .join(" / "),
      })),
      positions: this.workout.exercises.map((e, i) => "第 " + (i + 1) + " 位"),
      legacyTargets:
        !!this.workout.dayId &&
        !this.workout.execution &&
        !this.data.historyMode,
      duration: core.duration(this.workout),
    })
    this.tick()
  },
  tick() {
    const remaining = core.restRemaining(this.workout, Date.now())
    this.setData({
      restActive:
        this.workout.restUntil !== null ||
        this.workout.restPausedSeconds !== null,
      restPaused: this.workout.restPausedSeconds !== null,
      restClock: clock(remaining),
      elapsed:
        core.elapsedSeconds(this.workout) === null
          ? "用时未知"
          : clock(core.elapsedSeconds(this.workout)),
      paused: this.workout.timer && this.workout.timer.runningSince === null,
      setClock: this.setTimer
        ? clock(
            Math.floor((Date.now() - this.setTimer.start) / 1000) +
              this.setTimer.base,
          )
        : "",
    })
    if (
      this.workout.restUntil &&
      remaining === 0 &&
      this.notifiedRest !== this.workout.restUntil
    ) {
      this.notifiedRest = this.workout.restUntil
      wx.showToast({ title: "休息结束", icon: "none" })
      if (wx.vibrateShort) wx.vibrateShort({ type: "light" })
    }
  },
  select(e) {
    this.stopAdvance()
    this.closeActions()
    this.stopSetTimer()
    this.setData({ selected: Number(e.currentTarget.dataset.index) })
    this.workout.flow.currentExerciseId =
      this.workout.exercises[this.data.selected]?.id || null
    this.write()
  },
  write() {
    if (!this.ownerValid()) return false
    const ids = this.workout.exercises.map((e) => e.id)
    this.workout.flow.currentExerciseId = ids[this.data.selected] || null
    this.workout.flow.closedExerciseIds = [
      ...new Set(
        this.workout.flow.closedExerciseIds.filter((id) => ids.includes(id)),
      ),
    ]
    if (this.data.historyMode) {
      this.renderWorkout()
      return true
    }
    const state = store.snapshot()
    const existing = state.data.history.find((w) => w.id === this.workout.id)
    const value = existing
      ? core.archiveWorkout(state.data, {
          ...store.clone(this.workout),
          endedAt: existing.endedAt,
        })
      : { ...state.data, draft: store.clone(this.workout) }
    const ok = ui.attempt(() => store.stage(value)) !== false
    this.renderWorkout()
    return ok
  },
  input(e) {
    const field = e.currentTarget.dataset.field
    if (!["name", "date", "note", "feeling"].includes(field)) return
    this.workout[field] = e.detail.value
    this.write()
  },
  applyLastSets() {
    const exercise = this.workout.exercises[this.data.selected],
      last = this.data.lastSet
    if (!exercise || !last) return
    let filled = 0
    for (const set of exercise.sets)
      if (!set.done && (set.weight === "" || set.reps === "")) {
        set.weight = last.weight
        set.reps = last.reps
        filled += 1
      }
    if (!filled) return ui.notify(new Error("本组已填过，可直接确认"))
    this.write()
    wx.showToast({ title: "已沿用上次 · " + filled + " 组", icon: "none" })
  },
  copyFirstToAll() {
    const exercise = this.workout.exercises[this.data.selected],
      first = exercise?.sets[0]
    if (!first || !first.reps) return
    let filled = 0
    for (const set of exercise.sets)
      if (!set.done) {
        set.weight = first.weight
        set.reps = first.reps
        filled += 1
      }
    if (!filled) return ui.notify(new Error("没有需要填充的组"))
    this.write()
    wx.showToast({ title: "已复制到 " + filled + " 组", icon: "none" })
  },
  setInput(e) {
    const field = e.currentTarget.dataset.field
    if (!["weight", "reps", "durationSeconds"].includes(field)) return
    const set =
      this.workout.exercises[this.data.selected].sets[
        Number(e.currentTarget.dataset.index)
      ]
    if (field === "durationSeconds") {
      const text = e.detail.value.trim()
      set.durationSeconds =
        text && /^[1-9]\d*$/.test(text) ? Number(text) : null
    } else set[field] = e.detail.value
    set.done = false
    this.write()
  },
  toggleSet(e) {
    if (this.data.preparing)
      return ui.notify(new Error("调整完成后，先点击开始本次训练"))
    this.stopSetTimer()
    const exercise = this.workout.exercises[this.data.selected],
      set = exercise.sets[Number(e.currentTarget.dataset.index)]
    if (!set.done && !core.validCompletedSet(exercise, { ...set, done: true }))
      return ui.notify(
        new Error(
          exercise.recordType === "duration"
            ? "请填写有效秒数"
            : "请填写有效次数，重量可留空",
        ),
      )
    const wasComplete = core.exerciseFinished(this.workout, exercise)
    set.done = !set.done
    if (
      set.done &&
      !this.data.historyMode &&
      !this.workout.reviewing &&
      exercise.recordType === "reps"
    ) {
      const idx = Number(e.currentTarget.dataset.index)
      const next = exercise.sets[idx + 1]
      if (next && !next.done && next.weight === "" && next.reps === "") {
        next.weight = set.weight
        next.reps = set.reps
      }
    }
    if (set.done && !this.data.historyMode && !this.workout.reviewing)
      Object.assign(
        this.workout,
        core.changeRest(this.workout, "start", Date.now()),
      )
    this.write()
    if (
      !this.data.historyMode &&
      !wasComplete &&
      core.exerciseFinished(this.workout, exercise)
    ) {
      this.workout = core.finishExercise(this.workout, exercise.id)
      this.write()
      if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      if (this.workout.flow.stage === "exercise-complete")
        this.advanceTimer = setTimeout(() => this.advance(), 2000)
    }
  },
  addSet() {
    const exercise = this.workout.exercises[this.data.selected]
    if (exercise.sets.length >= 100)
      return ui.notify(new Error("每个动作最多 100 组"))
    const last = exercise.sets[exercise.sets.length - 1]
    const missing =
      this.workout.execution &&
      this.workout.execution.current.find(
        (t) =>
          t.exerciseId === exercise.id &&
          !exercise.sets.some((s) => s.targetId === t.id),
      )
    exercise.sets.push({
      ...core.makeSet(),
      weight: last ? last.weight : "",
      reps: last ? last.reps : "",
      durationSeconds: null,
      targetId: missing ? missing.id : null,
    })
    this.write()
  },
  async removeSet(e) {
    this.stopSetTimer()
    const exercise = this.workout.exercises[this.data.selected],
      index = Number(e.currentTarget.dataset.index)
    if (
      exercise.sets[index].done &&
      !(await ui.confirm(
        "移除已完成组",
        "删除实际记录不会减少目标组数。确认移除？",
      ))
    )
      return
    exercise.sets.splice(index, 1)
    this.write()
  },
  exerciseNote(e) {
    this.workout.exercises[this.data.selected].note = e.detail.value
    this.write()
  },
  openPicker() {
    this.stopSetTimer()
    this.setData({ pickerOpen: true, pickerSingle: false })
  },
  replace() {
    this.stopSetTimer()
    this.setData({ pickerOpen: true, pickerSingle: true })
  },
  closePicker() {
    this.setData({ pickerOpen: false })
  },
  async chooseExercises(e) {
    try {
      const definitions = e.detail.definitions
      if (this.data.pickerSingle) {
        const old = this.workout.exercises[this.data.selected]
        if (
          !(await ui.confirm(
            "确认替换剩余目标",
            "保留「" +
              old.name +
              "」已完成组，将剩余目标交给「" +
              definitions[0].name +
              "」。仅修改本次训练。",
          ))
        )
          return
        this.workout = core.replaceWorkoutExercise(
          this.workout,
          old.id,
          definitions[0],
        )
        this.setData({
          selected: this.workout.exercises.findIndex(
            (x) => x.libraryId === definitions[0].id && x.id !== old.id,
          ),
        })
      } else {
        if (this.workout.exercises.length + definitions.length > 100)
          throw new Error("单次最多 100 个动作")
        this.workout.exercises.push(
          ...definitions.map(core.exerciseFromDefinition),
        )
        this.setData({ selected: this.workout.exercises.length - 1 })
      }
      this.setData({ pickerOpen: false })
      this.write()
    } catch (error) {
      ui.notify(error)
    }
  },
  moveExercise(e) {
    this.stopSetTimer()
    const id = this.workout.exercises[this.data.selected].id
    this.workout = core.moveExercise(this.workout, id, Number(e.detail.value))
    this.setData({ selected: Number(e.detail.value) })
    this.write()
  },
  async removeExercise() {
    this.stopSetTimer()
    const exercise = this.workout.exercises[this.data.selected]
    if (
      !(await ui.confirm(
        "移除本次动作记录",
        "将移除这个动作及实际组，目标清单仍保留。需要减少目标请先使用「调整本次目标」。",
      ))
    )
      return
    this.workout.exercises = this.workout.exercises.filter(
      (x) => x.id !== exercise.id,
    )
    this.write()
  },
  openTargets() {
    if (!this.ownerValid()) return
    const exercise = this.workout.exercises[this.data.selected],
      targets = this.workout.execution
        ? this.workout.execution.current.filter(
            (t) => t.exerciseId === exercise.id,
          )
        : []
    if (!exercise) return
    this.targetExerciseId = exercise.id
    this.setData({
      targetOpen: true,
      targetCount: String(
        this.workout.execution ? targets.length : exercise.sets.length,
      ),
      targetError: "",
      targetSeconds:
        exercise.targetSeconds === null ? "" : String(exercise.targetSeconds),
    })
  },
  targetField(e) {
    if (
      !["targetCount", "targetSeconds"].includes(e.currentTarget.dataset.field)
    )
      return
    this.setData({ [e.currentTarget.dataset.field]: e.detail.value })
  },
  closeTargets() {
    this.setData({ targetOpen: false })
    this.targetExerciseId = null
  },
  async applyTargets() {
    if (!this.data.targetOpen || !this.ownerValid()) return
    const exercise = this.workout.exercises[this.data.selected]
    if (exercise?.id !== this.targetExerciseId) return this.closeTargets()
    if (!/^\d+$/.test(this.data.targetCount.trim())) {
      this.setData({ targetError: "组数须为 0–100 的整数，不能留空" })
      return
    }
    const count = Number(this.data.targetCount),
      seconds = this.data.targetSeconds ? Number(this.data.targetSeconds) : null
    if (
      !(await ui.confirm(
        "确认本次目标调整",
        exercise.name +
          "：目标改为 " +
          this.data.targetCount +
          " 组" +
          (exercise.recordType === "duration" && this.data.targetSeconds
            ? "，每组 " + this.data.targetSeconds + " 秒"
            : "") +
          "。不回写每周计划。" +
          (!this.workout.execution
            ? "缩减组数会移除多余的未确认行，已确认组保留。"
            : ""),
      ))
    )
      return
    if (
      !this.ownerValid() ||
      this.targetExerciseId !== exercise.id ||
      this.workout.exercises[this.data.selected]?.id !== exercise.id
    )
      return
    try {
      this.workout = core.adjustWorkoutTargets(
        this.workout,
        exercise.id,
        count,
        seconds,
      )
      if (this.write() === false)
        throw new Error(store.snapshot().error || "调整未保存，请重试")
      this.closeTargets()
    } catch (error) {
      this.setData({ targetError: error.message })
      ui.notify(error)
    }
  },
  async confirmTargets() {
    if (
      !(await ui.confirm(
        "确认旧草稿的本次目标",
        "以当前草稿的每个动作和录入行作为目标清单。以后修改周计划不会改变本次目标。",
      ))
    )
      return
    ui.attempt(() => {
      this.workout = core.resumeWorkout(
        core.confirmLegacyTargets(this.workout, store.snapshot().data.plan),
      )
      this.write()
    })
  },
  async preserveLegacy() {
    if (
      !(await ui.confirm(
        "仅保留旧记录",
        "不关联当前计划，也不推测过去是否达标；保留实际动作和组。确认？",
      ))
    )
      return
    this.legacyAcknowledged = true
    this.renderWorkout()
  },
  restoreTarget(e) {
    ui.attempt(() => {
      this.workout = core.restoreTargetExercise(
        this.workout,
        e.currentTarget.dataset.id,
      )
      this.setData({ selected: this.workout.exercises.length - 1 })
      this.write()
    })
  },
  startSetTimer(e) {
    if (this.data.preparing) return ui.notify(new Error("请先开始本次训练"))
    this.stopSetTimer()
    const exercise = this.workout.exercises[this.data.selected],
      set = exercise.sets[Number(e.currentTarget.dataset.index)]
    this.setTimer = {
      exerciseId: exercise.id,
      setId: set.id,
      base: set.durationSeconds || 0,
      start: Date.now(),
    }
    this.setData({ timingSetId: set.id })
    this.tick()
  },
  stopSetTimer() {
    if (!this.setTimer || !this.workout) return
    const timing = this.setTimer
    this.setTimer = null
    const exercise = this.workout.exercises.find(
        (x) => x.id === timing.exerciseId,
      ),
      set = exercise && exercise.sets.find((x) => x.id === timing.setId)
    if (set) {
      set.durationSeconds = Math.max(
        1,
        timing.base + Math.floor((Date.now() - timing.start) / 1000),
      )
      set.done = false
      this.write()
    }
    this.setData({ timingSetId: null, setClock: "" })
  },
  stopCurrentSet() {
    this.stopSetTimer()
  },
  pause() {
    if (this.data.preparing) return ui.notify(new Error("请先开始本次训练"))
    this.stopSetTimer()
    this.workout =
      this.workout.timer && this.workout.timer.runningSince !== null
        ? core.pauseWorkout(this.workout)
        : core.resumeWorkout(this.workout)
    this.write()
  },
  beginTraining() {
    if (!this.ownerValid()) return
    const original = this.workout
    this.workout = core.resumeWorkout(this.workout)
    if (this.write() === false) {
      this.workout = original
      this.renderWorkout()
      return
    }
    this.setData({ preparing: false, listOpen: false })
  },
  rest(e) {
    Object.assign(
      this.workout,
      core.changeRest(this.workout, e.currentTarget.dataset.action, Date.now()),
    )
    this.write()
  },
  expandRest() {
    this.setData({ restExpanded: !this.data.restExpanded })
  },
  edit() {
    this.setData({ editing: true, saved: false })
    this.workout = core.resumeWorkout(this.workout)
    this.renderWorkout()
    if (wx.enableAlertBeforeUnload)
      wx.enableAlertBeforeUnload({ message: "历史修改尚未保存，确认离开？" })
  },
  async finish() {
    if (this.data.preparing)
      return ui.notify(new Error("准备完成后请先开始本次训练"))
    if (this.data.saving || !this.ownerValid()) return
    this.stopSetTimer()
    if (this.data.legacyTargets && !this.legacyAcknowledged)
      return ui.notify(new Error("请先确认旧草稿目标，或选择仅保留旧记录"))
    const error = core.validateWorkout(this.workout)
    if (error) return ui.notify(new Error(error))
    if (!(await this.acknowledgePending())) return
    this.stopAdvance()
    this.workout = core.reviewWorkout(this.workout)
    this.write()
    if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
  },
  pendingSignature() {
    return JSON.stringify(
      this.workout.exercises.map((exercise) => ({
        id: exercise.id,
        name: exercise.name,
        sets: exercise.sets.filter((set) => !set.done),
      })),
    )
  },
  async acknowledgePending() {
    if (this.confirmingPending || !this.ownerValid()) return false
    const pending = core.unconfirmedSets(this.workout),
      signature = this.pendingSignature()
    if (!pending.length || signature === this.pendingAcknowledged) return true
    this.confirmingPending = true
    try {
      if (
        !(await ui.confirm(
          "有填写但未确认的组",
          pending.join("、") +
            "。未确认数据会保留，但不计入统计。仍然结束并提交？",
        ))
      )
        return false
      if (!this.ownerValid()) return false
      if (signature !== this.pendingSignature()) {
        ui.notify(new Error("录入内容已变化，请重新检查后提交"))
        return false
      }
      this.pendingAcknowledged = signature
      return true
    } finally {
      this.confirmingPending = false
    }
  },
  stopAdvance() {
    clearTimeout(this.advanceTimer)
    this.advanceTimer = null
  },
  showExerciseList() {
    this.setData({ listOpen: !this.data.listOpen })
  },
  goHome() {
    wx.switchTab({ url: "/pages/home/index" })
  },
  advance() {
    this.stopAdvance()
    if (!this.ownerValid()) return
    this.workout = core.continueExercise(this.workout)
    const index = this.workout.exercises.findIndex(
      (e) => e.id === this.workout.flow.currentExerciseId,
    )
    this.setData({ selected: Math.max(0, index) })
    this.write()
  },
  async menu() {
    if (!this.ownerValid() || (this.data.historyMode && !this.data.editing))
      return
    this.stopAdvance()
    this.stopSetTimer()
    const exercise = this.workout.exercises[this.data.selected]
    if (!exercise) return
    this.menuExerciseId = exercise.id
    const extra = !this.workout.execution?.current.some(
      (t) => t.exerciseId === exercise.id,
    )
    const actions = [
      {
        id: "replace",
        title: "替换剩余动作",
        detail: "保留已完成组，替换未完成部分",
      },
      {
        id: "targets",
        title: this.workout.execution ? "调整本次目标" : "调整本次组数",
        detail: "只调整这次训练，不改每周计划",
      },
      { id: "move", title: "移动动作", detail: "选择位置，预览顺序后确认" },
      { id: "note", title: "动作备注", detail: "记录器械、动作要点或本次感受" },
      {
        id: "remove",
        title: "移除动作记录",
        detail: "移除实际数据；计划目标仍保留",
        danger: true,
      },
    ]
    if (extra && !this.data.preparing && !this.data.historyMode)
      actions.push({
        id: "complete",
        title: "结束这个动作",
        detail: "保留已确认组，继续其他动作；不代替计划目标",
      })
    const session = this.data.preparing
      ? []
      : [
          {
            id: "finish",
            title: this.data.historyMode ? "结束编辑" : "提前结束训练",
            detail: "查看已确认内容，再提交保存",
          },
        ]
    if (!this.data.historyMode)
      session.push({
        id: "discard",
        title: "放弃本次草稿",
        detail: "确认后删除草稿，历史记录保留",
        danger: true,
      })
    this.setData({
      menuOpen: true,
      menuName: exercise.name,
      menuGroups: [
        { title: "这个动作", actions },
        { title: "本次训练", actions: session },
      ],
    })
  },
  keepSheet() {},
  closeMenu() {
    this.setData({ menuOpen: false })
    this.menuExerciseId = null
  },
  closeOrder() {
    this.setData({ orderOpen: false })
    this.orderContext = null
  },
  closeActions() {
    this.closeMenu()
    this.closeOrder()
    this.closeTargets()
  },
  async menuAction(e) {
    const action = e.currentTarget.dataset.action
    if (!this.data.menuOpen || !this.ownerValid()) return this.closeMenu()
    const exercise = this.workout.exercises[this.data.selected]
    if (exercise?.id !== this.menuExerciseId) {
      this.closeMenu()
      return ui.notify(new Error("当前动作已变化，请重新打开更多"))
    }
    if (
      !this.data.menuGroups.some((group) =>
        group.actions.some((item) => item.id === action),
      )
    )
      return
    this.closeMenu()
    if (action === "replace") this.replace()
    if (action === "targets") this.openTargets()
    if (action === "move") this.openOrder()
    if (action === "note") this.setData({ noteOpen: true })
    if (action === "remove") await this.removeExercise()
    if (action === "finish") await this.finish()
    if (action === "discard") await this.discard()
    if (action === "complete") {
      if (!this.workout.flow.closedExerciseIds.includes(exercise.id))
        this.workout.flow.closedExerciseIds.push(exercise.id)
      this.workout = core.finishExercise(this.workout, exercise.id)
      if (this.write() === false) return
      if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      if (this.workout.flow.stage === "exercise-complete")
        this.advanceTimer = setTimeout(() => this.advance(), 2000)
    }
  },
  openOrder() {
    if (!this.ownerValid()) return
    const exercise = this.workout.exercises[this.data.selected]
    if (!exercise) return
    this.orderContext = {
      exerciseId: exercise.id,
      ids: this.workout.exercises.map((item) => item.id).join(":"),
    }
    this.setData({
      orderOpen: true,
      orderName: exercise.name,
      orderPosition: this.data.selected,
      orderError: "",
    })
    this.previewOrder()
  },
  orderValid() {
    if (!this.data.orderOpen || !this.orderContext || !this.ownerValid())
      return false
    if (
      this.orderContext.ids !==
      this.workout.exercises.map((item) => item.id).join(":")
    ) {
      this.closeOrder()
      ui.notify(new Error("动作列表已变化，请重新选择位置"))
      return false
    }
    return true
  },
  choosePosition(e) {
    if (!this.orderValid()) return
    const index = Number(e.detail.value)
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= this.workout.exercises.length
    )
      return
    this.setData({ orderPosition: index, orderError: "" })
    this.previewOrder()
  },
  previewOrder() {
    const value = core.moveExercise(
      this.workout,
      this.orderContext.exerciseId,
      this.data.orderPosition,
    )
    this.setData({
      orderRows: value.exercises.map((item, index) => ({
        id: item.id,
        name: item.name,
        position: index + 1,
        selected: item.id === this.orderContext.exerciseId,
      })),
    })
  },
  applyOrder() {
    if (!this.orderValid()) return
    this.workout = core.moveExercise(
      this.workout,
      this.orderContext.exerciseId,
      this.data.orderPosition,
    )
    this.setData({ selected: this.data.orderPosition })
    if (this.write() === false) {
      this.orderContext.ids = this.workout.exercises
        .map((item) => item.id)
        .join(":")
      this.setData({
        orderError: store.snapshot().error || "顺序未保存，请重试",
      })
      return
    }
    this.closeOrder()
    wx.showToast({ title: "动作顺序已保存到此设备", icon: "none" })
  },
  async saveDetails() {
    if (!this.ownerValid()) return
    try {
      const state = store.snapshot()
      const existing = state.data.history.find((w) => w.id === this.workout.id)
      if (!existing)
        throw new Error("原训练记录已不存在，补充内容未保存，请返回日志")
      const updated = {
        ...existing,
        note: this.workout.note,
        exertion: this.workout.exertion,
      }
      if (
        !store.commitRecord({
          ...state.data,
          history: state.data.history.map((w) =>
            w.id === updated.id ? updated : w,
          ),
        })
      )
        throw new Error(
          store.snapshot().error || "补充内容未保存，请保留当前页面并重试",
        )
      this.workout = store.clone(updated)
      this.setData({ finishError: "" })
      this.renderWorkout()
      wx.showToast({ title: "补充内容已保存到此设备", icon: "none" })
    } catch (error) {
      this.setData({ finishError: error.message })
      ui.notify(error)
    }
  },
  exertion(e) {
    this.workout.exertion = e.currentTarget.dataset.value
    this.write()
  },
  showChanges() {
    this.setData({ allChanges: !this.data.allChanges })
  },
  showDetails() {
    this.setData({ detailsOpen: !this.data.detailsOpen })
  },
  viewTodayPhotos() {
    wx.navigateTo({
      url:
        "/pages/journal/index?date=" +
        this.workout.date +
        "&id=" +
        this.workout.id,
    })
  },
  openPhotoPanel() {
    this.setData({
      photoPanel: true,
      photoKind: "workout",
      photoTags: "",
      photoAngle: "正面",
      photoError: "",
    })
  },
  closePhotoPanel() {
    if (this.data.photoUploading) return
    this.setData({ photoPanel: false })
  },
  setPhotoKind(e) {
    this.setData({ photoKind: e.currentTarget.dataset.kind })
  },
  pickPhotoAngle(e) {
    this.setData({ photoAngle: e.currentTarget.dataset.angle })
  },
  photoField(e) {
    if (e.currentTarget.dataset.field === "photoTags")
      this.setData({ photoTags: e.detail.value })
  },
  async addPhotos() {
    if (this.data.photoUploading) return
    this.setData({ photoUploading: true, photoError: "" })
    try {
      const kind = this.data.photoKind,
        angle = this.data.photoAngle
      await photos.choose(
        this.workout.date,
        this.workout.id,
        kind === "body" ? "" : this.data.photoTags,
        { kind, angle },
      )
      wx.showToast({
        title: kind === "body" ? "整体照片已添加" : "部位照片已添加",
        icon: "success",
      })
      this.setData({ photoPanel: false })
    } catch (error) {
      this.setData({ photoError: error.message || "照片添加失败" })
    } finally {
      this.setData({ photoUploading: false })
    }
  },
  continueTraining() {
    this.stopAdvance()
    this.pendingAcknowledged = null
    this.invalidDuration = false
    this.workout = core.resumeWorkout(this.workout)
    this.write()
  },
  manualDuration(e) {
    const text = e.detail.value.trim()
    this.invalidDuration = !!text && !/^\d+$/.test(text)
    if (this.invalidDuration)
      return ui.notify(new Error("用时请输入非负整数秒"))
    if (!this.workout.timer)
      this.workout.timer = {
        elapsedMs: 0,
        runningSince: null,
        manualSeconds: null,
        legacy: false,
      }
    this.workout.timer.manualSeconds = text ? Number(text) : null
    this.write()
  },
  async save() {
    if (this.data.saving || !this.ownerValid()) return
    if (this.invalidDuration) return ui.notify(new Error("请修正用时后保存"))
    const problem = core.validateWorkout(this.workout)
    if (problem) return ui.notify(new Error(problem))
    if (!(await this.acknowledgePending())) return
    if (
      !core.completedSets(this.workout).length &&
      !this.data.historyMode &&
      !(await ui.confirm(
        "仅保存打卡",
        "没有已确认的有效组。这次只保留打卡，不算计划完成，确认保存？",
      ))
    )
      return
    if (!this.ownerValid() || this.data.saving) return
    this.setData({ saving: true, finishError: "" })
    try {
      const completed = core.pauseWorkout(store.clone(this.workout))
      if (!core.completedSets(completed).length && !this.data.historyMode)
        completed.source = "checkin"
      const value = core.archiveWorkout(store.snapshot().data, completed)
      if (!store.commitRecord(value)) {
        this.setData({ finishError: store.snapshot().error })
        return
      }
      this.workout = value.history.find((w) => w.id === completed.id)
      this.setData({ saved: true, editing: false })
      this.renderWorkout()
      if (wx.pageScrollTo) wx.pageScrollTo({ scrollTop: 0, duration: 0 })
      if (wx.disableAlertBeforeUnload) wx.disableAlertBeforeUnload()
    } catch (error) {
      this.setData({ finishError: error.message })
      ui.notify(error)
    } finally {
      this.setData({ saving: false })
    }
  },
  viewHistory() {
    wx.navigateTo({
      url:
        "/pages/journal/index?date=" +
        this.workout.date +
        "&id=" +
        this.workout.id,
    })
  },
  async retrySync() {
    const ok = await store.flush()
    if (ok) this.setData({ finishError: "" })
  },
  async discard() {
    if (
      !(await ui.confirm("放弃这次训练", "移除草稿，已有历史记录保持原内容。"))
    )
      return
    if (!this.ownerValid()) return
    if (await store.commit({ ...store.snapshot().data, draft: null }))
      wx.switchTab({ url: "/pages/home/index" })
  },
  async removeHistory() {
    if (!(await ui.confirm("删除训练记录", "删除本次记录并重新计算统计？")))
      return
    if (!this.ownerValid()) return
    if (
      await store.commit({
        ...store.snapshot().data,
        history: store
          .snapshot()
          .data.history.filter((w) => w.id !== this.workout.id),
      })
    )
      this.viewHistory()
  },
  later() {
    this.stopSetTimer()
    if (!this.ownerValid()) return
    if (!this.data.historyMode) {
      this.workout = core.pauseWorkout(this.workout)
      this.write()
    }
    wx.navigateBack()
  },
})
