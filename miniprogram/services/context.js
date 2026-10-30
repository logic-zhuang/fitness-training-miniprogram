// 不在模块加载时捕获 App 对象：开发工具热重载会替换 App/页面上下文。
// 每次操作都从当前 App 取得唯一存储实例，并确保已初始化。
const service = {}
for (const name of [
  "init",
  "subscribe",
  "snapshot",
  "stage",
  "commit",
  "commitRecord",
  "flush",
  "login",
  "loginWechat",
  "bindWechat",
  "localImportPreview",
  "importLocal",
  "credentials",
  "logout",
  "backup",
  "reloadCloud",
  "clone",
]) {
  service[name] = (...args) => {
    const current = getApp().fitness
    current.init()
    return current[name](...args)
  }
}
module.exports = service
