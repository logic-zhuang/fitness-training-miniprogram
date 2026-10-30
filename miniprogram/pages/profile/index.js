const api = require("../../services/api")
const store = require("../../services/context")
const ui = require("../../services/page")
Page({
  data: {
    ready: false,
    goal: "",
    email: "",
    password: "",
    server: api.DEFAULT_SERVER,
    signingIn: false,
    saving: false,
    loginError: "",
    libraryOpen: false,
  },
  onShow() {
    ui.observe(this, (state) => {
      this.setData({
        account: state.auth,
        loginRequired: state.loginRequired,
        server: state.auth ? state.auth.server : this.data.server,
      })
      if (!this.goalDirty) this.setData({ goal: state.data.goal })
    })
    this.setData({ account: store.snapshot().auth })
  },
  onHide() {
    ui.stop(this)
  },
  onUnload() {
    ui.stop(this)
  },
  retrySync: ui.retry,
  openJournal() {
    wx.navigateTo({ url: "/pages/journal/index" })
  },
  openLibrary() {
    if (store.snapshot().ready) this.setData({ libraryOpen: true })
  },
  closeLibrary() {
    this.setData({ libraryOpen: false })
  },
  showBinding() {
    this.setData({ binding: !this.data.binding })
  },
  async loginWechat() {
    if (this.data.signingIn) return
    this.setData({ signingIn: true, loginError: "" })
    try {
      await store.loginWechat()
      await this.offerImport()
      this.goalDirty = false
    } catch (error) {
      this.setData({ loginError: error.message })
    } finally {
      this.setData({ signingIn: false })
    }
  },
  async retryBinding() {
    if (this.data.signingIn) return
    this.setData({ signingIn: true, loginError: "" })
    try {
      await store.bindWechat()
      this.setData({ binding: false })
      wx.showToast({ title: "微信已绑定" })
    } catch (error) {
      this.setData({ loginError: error.message })
    } finally {
      this.setData({ signingIn: false })
    }
  },
  async offerImport() {
    const preview = store.localImportPreview()
    if (
      (preview.history || preview.custom) &&
      (await ui.confirm(
        "导入本机记录",
        `${preview.history} 条历史、${preview.custom} 个自建动作。按身份去重，不覆盖账号计划和草稿；原本机副本保留。`,
      ))
    )
      store.importLocal()
  },
  field(event) {
    const field = event.currentTarget.dataset.field
    if (["server", "email", "password"].includes(field))
      this.setData({ [field]: event.detail.value })
  },
  onGoalInput(event) {
    this.goalDirty = true
    this.setData({ goal: event.detail.value })
  },
  async saveGoal() {
    if (this.data.saving) return
    if (!this.data.goal.trim()) {
      ui.notify(new Error("请先写下目标"))
      return
    }
    this.setData({ saving: true })
    try {
      const ok = await store.commit({
        ...store.snapshot().data,
        goal: this.data.goal.trim(),
      })
      if (ok) {
        this.goalDirty = false
        wx.showToast({ title: "目标已保存" })
      }
    } catch (problem) {
      ui.notify(problem)
    } finally {
      this.setData({ saving: false })
    }
  },
  async login() {
    if (this.data.signingIn) return
    if (!this.data.email.trim() || !this.data.password) {
      this.setData({ loginError: "请填写邮箱和密码" })
      return
    }
    this.setData({ signingIn: true, loginError: "" })
    try {
      await store.login(this.data.server, this.data.email, this.data.password)
      if (this.data.binding) await store.bindWechat()
      this.setData({ binding: false })
      await this.offerImport()
      this.goalDirty = false
      this.setData({
        password: "",
        account: store.snapshot().auth,
        goal: store.snapshot().data ? store.snapshot().data.goal : "",
      })
      if (store.snapshot().ready) wx.showToast({ title: "已读取账号记录" })
    } catch (problem) {
      this.setData({
        loginError:
          problem.message === "Incorrect email or password"
            ? "邮箱或密码不正确"
            : problem.message,
      })
    } finally {
      this.setData({ signingIn: false })
    }
  },
  async logout() {
    const pending = store.snapshot().dirty
    if (
      !(await ui.confirm(
        "切回本机记录",
        pending
          ? "账号还有未同步内容，将继续保留在本机账号缓存中。重新登录同一账号后可以重试。"
          : "账号记录已保留。未登录时使用单独的本机记录。",
      ))
    )
      return
    this.goalDirty = false
    store.logout()
    this.setData({ account: null, loginError: "" })
  },
  async sharePlan() {
    try {
      const json = store.exportPlan()
      await new Promise((resolve, reject) =>
        wx.setClipboardData({ data: json, success: resolve, fail: reject }),
      )
      wx.showModal({
        title: "计划已复制",
        content: "粘贴发给好友；好友在「我的 → 粘贴导入好友计划」即可使用这份计划。",
        showCancel: false,
      })
    } catch (error) {
      wx.showToast({ title: "复制失败", icon: "none" })
    }
  },
  async importPlanFromClipboard() {
    try {
      const text = await new Promise((resolve, reject) =>
        wx.getClipboardData({ success: (r) => resolve(r.data), fail: reject }),
      )
      if (!text) return wx.showToast({ title: "剪贴板为空", icon: "none" })
      const name = store.importPlan(text)
      wx.showToast({ title: "已导入：" + name, icon: "none" })
    } catch (error) {
      wx.showModal({ title: "导入失败", content: error.message || "无法识别", showCancel: false })
    }
  },
  exportBackup() {
    try {
      const backup = store.backup()
      const path = `${wx.env.USER_DATA_PATH}/training-backup-${Date.now()}.json`
      wx.getFileSystemManager().writeFile({
        filePath: path,
        data: backup,
        encoding: "utf8",
        success: () => {
          if (wx.shareFileMessage)
            wx.shareFileMessage({
              filePath: path,
              fileName: "训练记录备份.json",
              fail: () =>
                wx.showToast({ title: "备份文件已保存在本机", icon: "none" }),
            })
          else wx.setClipboardData({ data: backup })
        },
        fail: () =>
          ui.notify(new Error("备份失败，原记录仍保留，请检查本机存储空间。")),
      })
    } catch (problem) {
      ui.notify(problem)
    }
  },
  async reloadCloud() {
    if (
      !(await ui.confirm(
        "备份后读取账号记录",
        "本机未同步内容将先备份，再读取账号中的最新记录。需要的内容请先导出备份。",
      ))
    )
      return
    try {
      await store.reloadCloud()
      this.goalDirty = false
    } catch (problem) {
      ui.notify(problem)
    }
  },
})
