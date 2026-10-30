const DEFAULT_SERVER = require("../config").server

function serverAddress(value) {
  const result = (value || DEFAULT_SERVER).trim().replace(/\/+$/, "")
  if (!/^https?:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(result))
    throw new Error("请填写完整后端地址，例如 http://127.0.0.1:8001")
  return result
}

function request(auth, path, method = "GET", data, form = false) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${auth.server}/api/v1${path}`,
      method,
      data,
      timeout: 15000,
      header: {
        "content-type": form
          ? "application/x-www-form-urlencoded"
          : "application/json",
        ...(auth.token ? { Authorization: `Bearer ${auth.token}` } : {}),
      },
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(response.data)
          return
        }
        const detail = response.data?.detail
        const message =
          response.statusCode === 401
            ? "登录已失效，请重新登录；本机记录已保留。"
            : response.statusCode === 409 && path === "/fitness/state"
              ? "云端已有新版本，本机改动已保留，请先导出备份。"
              : typeof detail === "string"
                ? detail
                : "保存内容未通过校验，请检查已完成组的次数。"
        reject(
          Object.assign(new Error(message), {
            status: response.statusCode,
            body: response.data,
          }),
        )
      },
      fail() {
        reject(
          new Error("无法连接后端，请检查服务地址和网络；本机记录已保留。"),
        )
      },
    })
  })
}

async function signIn(server, email, password) {
  const auth = { server: serverAddress(server) }
  const token = await request(
    auth,
    "/login/access-token",
    "POST",
    `username=${encodeURIComponent(email.trim())}&password=${encodeURIComponent(password)}`,
    true,
  )
  auth.token = token.access_token
  auth.user = await request(auth, "/users/me")
  return auth
}

function loginCode() {
  return new Promise((resolve, reject) =>
    wx.login({
      success: (r) =>
        r.code ? resolve(r.code) : reject(new Error("未取得微信登录凭证")),
      fail: () => reject(new Error("微信登录取消或失败")),
    }),
  )
}
async function signInWechat(server = DEFAULT_SERVER) {
  const account = { server: serverAddress(server) }
  const result = await request(account, "/login/wechat", "POST", {
    code: await loginCode(),
  })
  account.token = result.access_token
  account.user = await request(account, "/users/me")
  return account
}
module.exports = {
  DEFAULT_SERVER,
  serverAddress,
  request,
  signIn,
  signInWechat,
  loginCode,
}
