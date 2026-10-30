const core = require("../../lib/core")
const store = require("../../services/context")
const ui = require("../../services/page")
const photos = require("../../services/photos")
Page({
  data: {
    ready: false,
    groups: [],
    onlyPhotos: false,
    loading: false,
    uploading: false,
    photoError: "",
    date: core.localDate(),
    today: core.localDate(),
    selectedId: "",
    tags: "",
    hasMore: false,
    composer: false,
    detail: false,
    editingPhoto: null,
  },
  onLoad(options = {}) {
    this.options = options
    this.remote = []
    this.sequence = 0
    this.setData({
      date: options.date || core.localDate(),
      selectedId: options.id || "",
      detail: !!options.date,
      composer: !!options.date,
    })
  },
  onShow() {
    this.active = true
    this.disposed = false
    this.setData({
      uploading: !!(
        this.photoOperation?.busy &&
        this.photoOperation.owner === photos.scope()
      ),
    })
    ui.observe(this, () => {
      const owner = photos.scope()
      if (this.owner !== owner) {
        if (this.owner !== undefined)
          this.setData({ selectedId: "", tags: "", composer: false })
        this.owner = owner
        this.sequence += 1
        this.remote = []
        this.photoItems = []
        this.setData({
          groups: [],
          photoError: "",
          loading: false,
          uploading: !!(
            this.photoOperation?.busy && this.photoOperation.owner === owner
          ),
          editingPhoto: null,
        })
        void this.loadPhotos()
      }
      this.renderGroups()
    })
    void this.loadPhotos()
  },
  onHide() {
    this.active = false
    this.sequence += 1
    this.setData({ loading: false })
    ui.stop(this)
  },
  onUnload() {
    this.disposed = true
    this.onHide()
  },
  retrySync: ui.retry,
  valid(owner, sequence = this.sequence) {
    return this.active && owner === photos.scope() && sequence === this.sequence
  },
  beginPhotoOperation() {
    const operation = { owner: photos.scope(), busy: true }
    this.photoOperation = operation
    this.setData({ uploading: true, photoError: "" })
    return operation
  },
  endPhotoOperation(operation) {
    operation.busy = false
    if (
      this.disposed ||
      this.photoOperation !== operation ||
      operation.owner !== photos.scope()
    )
      return
    this.setData({
      uploading: false,
      ...(operation.error ? { photoError: operation.error } : {}),
    })
    if (this.active) this.renderGroups()
  },
  renderGroups() {
    const state = store.snapshot()
    if (!state.data) return
    const workouts = state.data.history
    const all = new Map(this.remote.map((p) => [p.id, p]))
    for (const p of photos.local()) {
      const remote = all.get(p.id)
      all.set(
        p.id,
        p.uploaded && remote ? { ...p, ...remote, path: p.path } : p,
      )
    }
    this.photoItems = [...all.values()]
    const dates = [
      ...new Set([
        ...workouts.map((w) => w.date),
        ...this.photoItems.map((p) => p.date),
      ]),
    ]
      .sort()
      .reverse()
    const groups = dates
      .filter((d) => !this.options.date || d === this.options.date)
      .map((date) => {
        const records = workouts.filter((w) => w.date === date)
        const images = this.photoItems.filter((p) => p.date === date)
        const tags =
          [
            ...new Set(
              records
                .flatMap((w) =>
                  core.muscleDistribution([w]).map((m) => m.muscle),
                )
                .concat(images.map((p) => p.tags).filter(Boolean)),
            ),
          ].join(" · ") || "日常记录"
        return {
          date,
          month: date.slice(0, 7),
          tags,
          photoCount: images.length,
          photos: (this.options.date ? images : images.slice(0, 3)).map(
            (p) => ({
              id: p.id,
              path: p.path || p.preview || "",
              label:
                p.uploaded || !p.path
                  ? "已同步"
                  : p.error
                    ? "上传失败"
                    : state.auth
                      ? "待上传"
                      : "本机照片",
              error: p.error || "",
              note: p.note || "",
            }),
          ),
          records: records.map((w) => ({
            id: w.id,
            name: w.name,
            duration: core.duration(w),
            sets: core.completedSets(w).length,
            label: core.workoutCompletion(w).label,
          })),
        }
      })
      .filter((g) => !this.data.onlyPhotos || g.photoCount)
    const workout = workouts.find((w) => w.id === this.data.selectedId)
    this.setData({
      groups,
      account: state.auth,
      guestCount: photos.guestCount(),
      tags:
        this.data.tags ||
        (workout
          ? core
              .muscleDistribution([workout])
              .map((m) => m.muscle)
              .join(" · ")
          : ""),
    })
  },
  async loadPhotos(more = false) {
    if (this.data.loading || !this.active) return
    const owner = photos.scope(),
      sequence = this.sequence
    this.setData({ loading: true })
    try {
      const result = await photos.remoteList(
        more ? this.remote.length : 0,
        this.options.date,
      )
      if (!this.valid(owner, sequence)) return
      this.remote = more ? [...this.remote, ...result.data] : result.data
      this.setData({
        hasMore: this.remote.length < result.count,
        photoError: "",
      })
      this.renderGroups()
      const visible = new Set(
        this.data.groups.flatMap((g) => g.photos.map((p) => p.id)),
      )
      for (const p of this.photoItems.filter((p) => visible.has(p.id))) {
        if (p.path || p.preview) continue
        try {
          const path = await photos.imagePath(p)
          if (!this.valid(owner, sequence)) return
          const target = this.remote.find((x) => x.id === p.id)
          if (target) target.preview = path
        } catch (_) {
          /* 下载失败保留可点开的缩略图入口，点开时显示具体错误。 */
        }
      }
      if (this.valid(owner, sequence)) this.renderGroups()
    } catch (error) {
      if (this.valid(owner, sequence))
        this.setData({ photoError: error.message })
    } finally {
      if (this.valid(owner, sequence)) this.setData({ loading: false })
    }
  },
  more() {
    void this.loadPhotos(true)
  },
  filter(e) {
    const value = e.currentTarget.dataset.value
    this.setData({
      photoFilter: value,
      onlyPhotos: value === "photos",
    })
    this.renderGroups()
  },
  toggleComposer() {
    this.setData({ composer: !this.data.composer })
  },
  field(e) {
    const field = e.currentTarget.dataset.field
    if (!["date", "tags"].includes(field)) return
    this.setData({ [field]: e.detail.value })
    if (field === "date") this.setData({ selectedId: "" })
  },
  async add() {
    if (this.data.uploading) return
    const operation = this.beginPhotoOperation(),
      owner = operation.owner
    try {
      await photos.choose(this.data.date, this.data.selectedId, this.data.tags)
      if (owner !== photos.scope()) return
      if (this.valid(owner)) this.renderGroups()
      await photos.sync()
      if (this.valid(owner)) await this.loadPhotos()
    } catch (error) {
      operation.error = error.message
      if (this.valid(owner)) this.setData({ photoError: error.message })
    } finally {
      this.endPhotoOperation(operation)
    }
  },
  async retryPhotos(photoId = null) {
    if (this.data.uploading) return
    const operation = this.beginPhotoOperation(),
      owner = operation.owner
    try {
      await photos.sync(typeof photoId === "string" ? photoId : null)
      if (this.valid(owner)) await this.loadPhotos()
    } catch (error) {
      operation.error = error.message
      if (this.valid(owner)) this.setData({ photoError: error.message })
    } finally {
      this.endPhotoOperation(operation)
    }
  },
  async preview(e) {
    const photo = this.photoItems.find(
      (p) => p.id === e.currentTarget.dataset.id,
    )
    if (!photo) return
    const owner = photos.scope()
    try {
      const path = await photos.imagePath(photo)
      if (this.valid(owner)) wx.previewImage({ current: path, urls: [path] })
    } catch (error) {
      if (this.valid(owner)) ui.notify(error)
    }
  },
  photoMenu(e) {
    const photo = this.photoItems.find(
      (p) => p.id === e.currentTarget.dataset.id,
    )
    if (!photo) return
    const owner = photos.scope()
    wx.showActionSheet({
      itemList: ["修改日期与说明", "重试这张照片", "删除照片"],
      success: async ({ tapIndex }) => {
        if (!this.valid(owner)) return
        if (tapIndex === 0)
          this.setData({
            editingPhoto: {
              id: photo.id,
              date: photo.date,
              tags: photo.tags || "",
              note: photo.note || "",
              photoKind: photo.kind === "body" ? "body" : "workout",
              photoAngle: photo.angle || "正面",
            },
          })
        if (tapIndex === 1) await this.retryPhotos(photo.id)
        if (
          tapIndex === 2 &&
          (await ui.confirm("删除这张照片", "仅删除照片，训练记录保留。"))
        ) {
          if (!this.valid(owner)) return
          try {
            await photos.remove(photo)
            if (this.valid(owner)) {
              await this.loadPhotos()
              this.renderGroups()
            }
          } catch (error) {
            if (this.valid(owner)) ui.notify(error)
          }
        }
      },
    })
  },
  photoField(e) {
    const field = e.currentTarget.dataset.field,
      value = e.currentTarget.dataset.value
    if (field === "photoKind") {
      this.setData({
        "editingPhoto.photoKind": value === "body" ? "body" : "workout",
        "editingPhoto.photoAngle": "正面",
      })
      return
    }
    if (field === "photoAngle") {
      this.setData({ "editingPhoto.photoAngle": value })
      return
    }
    if (["date", "tags", "note"].includes(field))
      this.setData({ ["editingPhoto." + field]: e.detail.value })
  },
  closePhotoEditor() {
    this.setData({ editingPhoto: null })
  },
  async savePhotoDetails() {
    const fields = this.data.editingPhoto,
      photo = this.photoItems.find((p) => p.id === fields?.id)
    if (!photo || this.data.uploading) return
    const operation = this.beginPhotoOperation(),
      owner = operation.owner
    try {
      await photos.update(photo, {
        date: fields.date,
        tags: fields.tags,
        note: fields.note,
        kind: fields.photoKind || "workout",
        angle: fields.photoAngle || null,
      })
      if (this.valid(owner)) {
        this.setData({ editingPhoto: null })
        await this.loadPhotos()
        this.renderGroups()
      }
    } catch (error) {
      if (this.valid(owner)) ui.notify(error)
    } finally {
      this.endPhotoOperation(operation)
    }
  },
  open(e) {
    wx.navigateTo({
      url: "/pages/workout/index?id=" + e.currentTarget.dataset.id,
    })
  },
  async importPhotos() {
    const owner = photos.scope()
    if (
      await ui.confirm(
        "导入本机照片",
        `导入 ${photos.guestCount()} 张照片到当前账号，原件保留；相同照片不重复创建。`,
      )
    ) {
      if (!this.valid(owner)) return
      try {
        await photos.importGuest()
        if (this.valid(owner)) this.renderGroups()
      } catch (error) {
        if (this.valid(owner)) ui.notify(error)
      }
    }
  },
  openDate(e) {
    this.sequence += 1
    this.options = { date: e.currentTarget.dataset.date }
    this.setData({
      date: this.options.date,
      selectedId: "",
      detail: true,
      composer: false,
      loading: false,
    })
    this.remote = []
    this.renderGroups()
    void this.loadPhotos()
  },
  allDates() {
    this.sequence += 1
    this.options = {}
    this.setData({
      selectedId: "",
      detail: false,
      composer: false,
      loading: false,
    })
    this.remote = []
    this.renderGroups()
    void this.loadPhotos()
  },
})
