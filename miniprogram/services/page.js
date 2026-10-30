// 页面生命周期、点击处理器与 App 共享一个实例，避免热重载/相对路径加载出两份状态。
const store = require("./context")

function observe(page, render) {
  if (page.unsubscribe) page.unsubscribe()
  page.unsubscribe = store.subscribe((state) => {
    page.setData({
      ready: state.ready,
      status: state.status,
      phase: state.phase,
      error: state.error,
    })
    if (state.data) render.call(page, state)
  })
}
function stop(page) {
  if (page.unsubscribe) page.unsubscribe()
  page.unsubscribe = null
}
function notify(problem) {
  wx.showToast({
    title: problem.message || String(problem),
    icon: "none",
    duration: 3000,
  })
}
function attempt(action) {
  try {
    return action()
  } catch (problem) {
    notify(problem)
    return false
  }
}
function confirm(title, content, buttons = {}) {
  return new Promise((resolve) =>
    wx.showModal({
      ...buttons,
      title,
      content,
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    }),
  )
}
function retry() {
  void store.flush()
}
module.exports = { observe, stop, notify, attempt, confirm, retry }
