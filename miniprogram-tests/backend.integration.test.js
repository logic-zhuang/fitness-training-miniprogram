const assert = require("node:assert/strict")
const { test } = require("node:test")
const core = require("../miniprogram/lib/core")

const address = process.env.FITNESS_TEST_SERVER
test(
  "小程序请求适配器真实连接 FastAPI：登录、训练保存、重试、重登和两个账号隔离",
  { skip: !address },
  async () => {
    const storage = new Map(),
      sent = [],
      accounts = []
    const copy = (value) =>
      value === undefined ? undefined : JSON.parse(JSON.stringify(value))
    global.wx = {
      getStorageSync: (key) => copy(storage.get(key)),
      setStorageSync: (key, value) => storage.set(key, copy(value)),
      removeStorageSync: (key) => storage.delete(key),
      request(options) {
        sent.push(
          copy({
            url: options.url,
            method: options.method,
            data: options.data,
          }),
        )
        void fetch(options.url, {
          method: options.method,
          headers: options.header,
          body:
            options.data === undefined
              ? undefined
              : typeof options.data === "string"
                ? options.data
                : JSON.stringify(options.data),
        })
          .then(async (response) =>
            options.success({
              statusCode: response.status,
              data: await response.json(),
            }),
          )
          .catch((problem) => options.fail({ errMsg: problem.message }))
      },
    }
    function fresh() {
      for (const file of ["store", "api", "page"])
        delete require.cache[require.resolve(`../miniprogram/services/${file}`)]
      const store = require("../miniprogram/services/store")
      store.init()
      return store
    }
    let store = fresh()
    async function account() {
      const email = `mini-${crypto.randomUUID()}@example.com`
      const password = `Mini-${crypto.randomUUID()}`
      const response = await fetch(`${address}/api/v1/users/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      assert.equal(response.status, 200, "临时测试账号注册失败")
      const auth = await require("../miniprogram/services/api").signIn(
        address,
        email,
        password,
      )
      accounts.push(auth)
      return { email, password, auth }
    }
    try {
      const first = await account()
      await store.login(address, first.email, first.password)
      assert.equal(store.snapshot().phase, "synced")
      const value = store.snapshot().data,
        workout = core.makeWorkout(value.plan.days[0])
      workout.exercises[0].sets[0].weight = "42.5"
      workout.exercises[0].sets[0].reps = "8"
      workout.exercises[0].sets[0].done = true
      workout.note = "原生小程序后端联调"
      assert.equal(
        await store.commit(core.archiveWorkout(value, workout)),
        true,
      )
      const savedJob = sent.filter((request) => request.method === "PUT").at(-1)
      const headers = {
        "content-type": "application/json",
        Authorization: `Bearer ${first.auth.token}`,
      }
      const retry = await fetch(`${address}/api/v1/fitness/state`, {
        method: "PUT",
        headers,
        body: JSON.stringify(savedJob.data),
      })
      assert.equal(retry.status, 200)
      // 这也是现有网站读取的接口，检查记录可以跨客户端读取。
      const remote = await (
        await fetch(`${address}/api/v1/fitness/state`, { headers })
      ).json()
      assert.equal(remote.data.history.length, 1)
      assert.equal(remote.data.history[0].exercises[0].sets[0].weight, "42.5")
      assert.equal(remote.revision, (await retry.json()).revision)
      store = fresh()
      await store.flush()
      assert.equal(store.snapshot().data.history[0].id, workout.id)
      const second = await account()
      await store.login(address, second.email, second.password)
      assert.equal(store.snapshot().data.history.length, 0)
      store.logout()
      assert.equal(store.snapshot().data.history.length, 0)
    } finally {
      store.logout()
      for (const account of accounts) {
        const response = await fetch(`${address}/api/v1/users/me`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${account.token}` },
        })
        assert.equal(response.status, 200, "清理临时测试账号失败")
      }
    }
  },
)
