const core = require("../../lib/core")

// 底图按部位等级生成一次；选中只换透明描边层，避免整图重新解码闪烁。
// WXML 不能内嵌 SVG，改为 base64 data URI 交给 image，点击按坐标换算命中肌肉。
Component({
  properties: {
    exercises: { type: Array, value: [], observer: "refresh" },
  },
  data: {
    image: "",
    overlay: "",
    recorded: [],
    categories: "",
    unknown: [],
    selected: "",
    selectedName: "",
    details: [],
    levels: core.bodyMapLevels,
  },
  lifetimes: {
    attached() {
      this.refresh()
    },
  },
  methods: {
    refresh() {
      const summary = core.bodyMapSummary(this.properties.exercises || [])
      this.summary = summary
      const values = {
        recorded: summary.recorded.map((m) => ({
          id: m.id,
          name: m.name,
          sets: m.sets,
          level: m.level,
        })),
        categories: summary.categories
          .filter((c) => c.known)
          .map((c) => c.muscle + " " + c.sets + " 组")
          .join(" · "),
        unknown: summary.unknown,
        ...this.detail(this.data.selected),
      }
      const key = summary.muscles.map((m) => m.level).join("")
      if (key !== this.imageKey) {
        this.imageKey = key
        values.image = core.svgDataUri(core.bodyMapSvg(summary))
      }
      this.setData(values)
    },
    detail(id) {
      const muscle =
        id && this.summary && this.summary.muscles.find((m) => m.id === id)
      if (!muscle)
        return { selected: "", selectedName: "", details: [], overlay: "" }
      return {
        selected: muscle.id,
        selectedName: muscle.name,
        details: muscle.exercises,
        overlay:
          id === this.data.selected && this.data.overlay
            ? this.data.overlay
            : core.svgDataUri(core.bodyMapSelectionSvg(muscle.id)),
      }
    },
    select(event) {
      this.setData(this.detail(event.currentTarget.dataset.id))
    },
    tapMap(event) {
      const touch =
        (event.changedTouches && event.changedTouches[0]) ||
        (event.touches && event.touches[0])
      const detail = event.detail || {}
      const query = this.createSelectorQuery()
      query.select(".map-stage").boundingClientRect()
      query.selectViewport().scrollOffset()
      query.exec((result) => {
        const rect = result && result[0]
        const viewport = (result && result[1]) || {}
        if (!rect) return
        // 优先用视口坐标；个别基础库只给页面坐标时扣除滚动距离。
        const x =
          touch && typeof touch.clientX === "number"
            ? touch.clientX
            : detail.x - (viewport.scrollLeft || 0)
        const y =
          touch && typeof touch.clientY === "number"
            ? touch.clientY
            : detail.y - (viewport.scrollTop || 0)
        const id = core.bodyMuscleAtClient(x, y, rect)
        if (id) this.setData(this.detail(id))
      })
    },
  },
})
