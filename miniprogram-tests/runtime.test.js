const assert = require("node:assert/strict")
const { readFileSync } = require("node:fs")
const { test } = require("node:test")
const vm = require("node:vm")

test("小程序禁用动态函数时，开始训练和数据校验仍能工作", () => {
  let dynamicCalls = 0
  const sandbox = {
    module: { exports: {} },
    console,
    setTimeout,
    clearTimeout,
    // 部分运行环境会替换 Function，却不抛异常，使依赖库误判为可用。
    Function: function DisabledFunction() {
      dynamicCalls += 1
      return {}
    },
  }
  vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } })
  vm.runInContext(
    readFileSync(
      new URL("../miniprogram/lib/core.js", import.meta.url),
      "utf8",
    ),
    sandbox,
  )
  const core = sandbox.module.exports
  const data = core.initialData()
  data.draft = core.makeWorkout(data.plan.days[0])
  data.draft.exercises[0].sets[0] = {
    ...data.draft.exercises[0].sets[0],
    weight: "40",
    reps: "10",
    done: true,
  }
  const parsed = core.fitnessSchema.parse(data)
  assert.equal(parsed.draft.exercises[0].sets[0].weight, "40")
  assert.equal(dynamicCalls, 0, "小程序业务模块不应尝试生成动态函数")
  data.draft.exercises[0].sets[0].weight = { invalid: true }
  assert.equal(core.fitnessSchema.safeParse(data).success, false)
})
