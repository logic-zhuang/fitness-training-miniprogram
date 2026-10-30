const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
Component({
  options: { styleIsolation: "apply-shared" },
  properties: {
    open: {
      type: Boolean,
      value: false,
      observer(value) {
        if (value) {
          const state = store.snapshot()
          this.owner = state.auth
            ? state.auth.server + ":" + state.auth.user.id
            : "local"
          this.setData({
            tab: "mine",
            muscle: "全部",
            query: "",
            selectedIds: [],
            creating: false,
            editingId: null,
            keyboardHeight: 0,
            scrollTarget: "",
          })
          this.render()
        } else this.clearKeyboard()
      },
    },
    single: { type: Boolean, value: false },
    managing: { type: Boolean, value: false },
  },
  data: {
    tab: "mine",
    query: "",
    muscle: "全部",
    muscles: [...core.muscles, "其他"],
    customMuscles: [...core.muscles.slice(1), "其他"],
    selectedIds: [],
    rows: [],
    creating: false,
    name: "",
    customMuscle: "胸部",
    customType: "reps",
    equipment: "",
    note: "",
    types: ["重量 / 自重次数", "按时长（秒）"],
    keyboardHeight: 0,
    scrollTarget: "",
  },
  lifetimes: {
    attached() {
      this.unsubscribe = store.subscribe(() => this.render())
    },
    detached() {
      if (this.unsubscribe) this.unsubscribe()
      clearTimeout(this.blurTimer)
    },
  },
  methods: {
    ownerValid() {
      const state = store.snapshot(),
        owner = state.auth
          ? state.auth.server + ":" + state.auth.user.id
          : "local"
      if (!state.ready || owner !== this.owner) {
        this.close()
        ui.notify(new Error("账号已变化，请重新打开动作库"))
        return false
      }
      return true
    },
    noop() {},
    // 键盘高度只用于弹层内边距；遮罩始终铺满，安卓漏发收起事件也不会露出下层页面。
    keyboard(e) {
      const height = Math.max(0, Number(e.detail.height) || 0)
      if (height) clearTimeout(this.blurTimer)
      if (height !== this.data.keyboardHeight)
        this.setData({ keyboardHeight: height })
    },
    focusField(e) {
      clearTimeout(this.blurTimer)
      const height = Math.max(0, Number(e.detail.height) || 0)
      const target = e.currentTarget.id || ""
      const values = {}
      if (height && height !== this.data.keyboardHeight)
        values.keyboardHeight = height
      if (target) values.scrollTarget = ""
      if (Object.keys(values).length) this.setData(values)
      if (target) wx.nextTick(() => this.setData({ scrollTarget: target }))
    },
    blurField() {
      clearTimeout(this.blurTimer)
      this.blurTimer = setTimeout(() => this.clearKeyboard(), 120)
    },
    clearKeyboard() {
      clearTimeout(this.blurTimer)
      if (this.data.keyboardHeight) this.setData({ keyboardHeight: 0 })
    },
    render() {
      const state = store.snapshot()
      if (!state.data) return
      const sections = core.librarySections(state.data)
      this.definitions = [
        ...sections.mine,
        ...sections.builtin,
        ...sections.recent,
      ]
      const rows = sections[this.data.tab]
        .filter(
          (d) =>
            d.name
              .toLowerCase()
              .includes(this.data.query.trim().toLowerCase()) &&
            (this.data.muscle === "全部" || d.muscle === this.data.muscle),
        )
        .map((d) => ({
          ...d,
          picked: this.data.selectedIds.includes(d.id),
          favorite: state.data.exerciseLibrary.favorites.includes(d.id),
          custom: state.data.exerciseLibrary.custom.some((c) => c.id === d.id),
          recent: !d.id.startsWith("builtin:"),
          typeLabel: d.recordType === "duration" ? "时长 · 秒" : "重量 / 次数",
        }))
      this.setData({ rows })
    },
    tab(event) {
      this.setData({ tab: event.currentTarget.dataset.tab, scrollTarget: "" })
      this.render()
    },
    query(event) {
      this.setData({ query: event.detail.value })
      this.render()
    },
    muscle(event) {
      this.setData({ muscle: this.data.muscles[Number(event.detail.value)] })
      this.render()
    },
    pick(event) {
      if (this.properties.managing) return this.menu(event)
      const key = event.currentTarget.dataset.id,
        selected = this.data.selectedIds
      this.setData({
        selectedIds: this.properties.single
          ? [key]
          : selected.includes(key)
            ? selected.filter((v) => v !== key)
            : [...selected, key],
      })
      this.render()
    },
    confirm() {
      if (!this.ownerValid()) return
      const definitions = this.data.selectedIds
        .map((key) => this.definitions.find((d) => d.id === key))
        .filter(Boolean)
      if (!definitions.length) return
      this.triggerEvent("choose", { definitions })
    },
    close() {
      this.clearKeyboard()
      this.triggerEvent("close")
    },
    menu(event) {
      if (!this.ownerValid()) return
      const key = event.currentTarget.dataset.id
      const state = store.snapshot()
      const custom = state.data.exerciseLibrary.custom.some((d) => d.id === key)
      const favorite = state.data.exerciseLibrary.favorites.includes(key)
      wx.showActionSheet({
        itemList: custom
          ? ["编辑动作", "移出个人动作库"]
          : [
              favorite
                ? "取消收藏"
                : key.startsWith("builtin:")
                  ? "收藏到我的动作"
                  : "保存到我的动作",
            ],
        success: ({ tapIndex }) => {
          if (!this.ownerValid()) return
          if (!this.definitions.some((d) => d.id === key)) return
          if (custom) {
            if (tapIndex === 0) this.edit(event)
            else void this.remove(event)
          } else this.favorite(event)
        },
      })
    },
    favorite(event) {
      if (!this.ownerValid()) return
      ui.attempt(() => {
        const definition = this.definitions.find(
          (d) => d.id === event.currentTarget.dataset.id,
        )
        const state = store.snapshot()
        store.stage(core.toggleFavorite(state.data, definition))
        this.render()
      })
    },
    async remove(event) {
      if (
        !(await ui.confirm(
          "移出个人动作库",
          "仅从我的动作中移除，已有计划和历史仍保留原内容。",
        ))
      )
        return
      if (!this.ownerValid()) return
      ui.attempt(() => {
        const state = store.snapshot()
        store.stage(
          core.deleteCustomExercise(state.data, event.currentTarget.dataset.id),
        )
        this.render()
      })
    },
    create() {
      clearTimeout(this.blurTimer)
      this.setData({
        creating: !this.data.creating,
        editingId: null,
        name: "",
        equipment: "",
        note: "",
        keyboardHeight: 0,
        scrollTarget: "",
      })
    },
    edit(event) {
      const definition = this.definitions.find(
        (d) => d.id === event.currentTarget.dataset.id,
      )
      this.setData({
        creating: true,
        editingId: definition.id,
        name: definition.name,
        customMuscle: definition.muscle,
        customType: definition.recordType,
        equipment: definition.equipment,
        note: definition.note,
      })
    },
    field(event) {
      this.setData({ [event.currentTarget.dataset.field]: event.detail.value })
    },
    customMuscle(event) {
      this.setData({
        customMuscle: this.data.customMuscles[Number(event.detail.value)],
      })
    },
    customType(event) {
      this.setData({
        customType: Number(event.detail.value) ? "duration" : "reps",
      })
    },
    async saveCustom() {
      try {
        if (!this.ownerValid()) return
        const state = store.snapshot()
        const input = {
          name: this.data.name,
          muscle: this.data.customMuscle,
          recordType: this.data.customType,
          equipment: this.data.equipment,
          note: this.data.note,
        }
        let result = core.saveCustomExercise(
          state.data,
          input,
          this.data.editingId || undefined,
        )
        if (
          result.duplicate &&
          !(await ui.confirm(
            "动作已经存在",
            `选择已有的「${result.definition.name}」？`,
          ))
        )
          return
        if (!this.ownerValid()) return
        result = core.saveCustomExercise(
          store.snapshot().data,
          input,
          this.data.editingId || undefined,
        )
        store.stage(result.data)
        this.setData({
          tab: result.definition.id.startsWith("builtin:") ? "builtin" : "mine",
          query: "",
          muscle: "全部",
          creating: false,
          name: "",
          equipment: "",
          note: "",
          keyboardHeight: 0,
          scrollTarget: "",
          selectedIds: this.properties.managing
            ? []
            : this.properties.single
              ? [result.definition.id]
              : [...new Set([...this.data.selectedIds, result.definition.id])],
        })
        this.render()
        wx.showToast({
          title: result.duplicate
            ? this.properties.managing
              ? "动作已经在库中"
              : "已选择已有动作"
            : "已保存到我的动作",
          icon: "none",
        })
      } catch (problem) {
        ui.notify(problem)
      }
    },
  },
})
