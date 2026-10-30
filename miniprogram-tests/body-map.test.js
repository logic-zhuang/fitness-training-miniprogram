const assert = require("node:assert/strict")
const { test } = require("node:test")
const core = require("../miniprogram/lib/core")

const copy = (value) => JSON.parse(JSON.stringify(value))
const rect = { left: 24, top: 180, width: 300, height: 300 * (440 / 420) }
function component(exercises, viewport = { scrollLeft: 0, scrollTop: 0 }) {
  let definition
  global.Component = (value) => {
    definition = value
  }
  const file = require.resolve("../miniprogram/components/body-map/index")
  delete require.cache[file]
  require(file)
  const instance = {
    ...definition.methods,
    data: copy(definition.data),
    properties: { exercises: copy(exercises) },
    updates: 0,
    setData(values) {
      this.updates += 1
      Object.assign(this.data, copy(values))
    },
    createSelectorQuery() {
      const results = []
      return {
        select() {
          results.push(rect)
          return { boundingClientRect: () => {} }
        },
        selectViewport() {
          results.push(viewport)
          return { scrollOffset: () => {} }
        },
        exec(callback) {
          callback(results)
        },
      }
    },
  }
  definition.lifetimes.attached.call(instance)
  return instance
}
const confirmed = (name, count = 3) => {
  const exercise = core.exerciseFromDefinition(
    core.builtInExercises.find((d) => d.name === name),
  )
  exercise.sets = exercise.sets.map((s, i) => ({
    ...s,
    done: i < count,
    reps: i < count ? "10" : "",
  }))
  return exercise
}
// 取该肌肉图形中心附近一个确实会命中它的点，换算为屏幕坐标。
function clientPoint(muscle) {
  const area = core.bodyMapHitAreas.find((a) => a.muscle === muscle)
  const xs = area.polygon.map((p) => p[0])
  const ys = area.polygon.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  for (let r = 0; r < 20; r += 0.5)
    for (const [dx, dy] of [
      [0, 0],
      [r, 0],
      [-r, 0],
      [0, r],
      [0, -r],
    ])
      if (core.bodyMuscleAt(cx + dx, cy + dy) === muscle)
        return {
          clientX: rect.left + ((cx + dx) / 420) * rect.width,
          clientY: rect.top + ((cy + dy) / 440) * rect.height,
        }
  throw new Error(`找不到 ${muscle} 的命中点`)
}
const tap = (instance, point) =>
  instance.tapMap({ changedTouches: [point], detail: {} })

test("总结部位图：点胸大肌显示卧推和上斜哑铃各 3 组，并叠加选中描边", () => {
  const map = component([
    confirmed("卧推"),
    confirmed("上斜哑铃推举"),
    confirmed("绳索下压", 2),
  ])
  assert.ok(map.data.image.startsWith("data:image/svg+xml;base64,"))
  assert.equal(map.data.overlay, "")
  assert.deepEqual(
    map.data.recorded.map((m) => [m.name, m.sets, m.level]),
    [
      ["胸大肌", 6, 2],
      ["肱三头肌", 2, 1],
    ],
  )
  assert.equal(map.data.categories, "胸部 6 组 · 手臂 2 组")
  tap(map, clientPoint("chest"))
  assert.equal(map.data.selected, "chest")
  assert.equal(map.data.selectedName, "胸大肌")
  assert.deepEqual(
    map.data.details.map((e) => e.name + " · " + e.sets + " 组"),
    ["卧推 · 3 组", "上斜哑铃推举 · 3 组"],
  )
  assert.ok(map.data.overlay.startsWith("data:image/svg+xml;base64,"))
})

test("点未训练的肌肉提示没有主部位组；点图外不改变已有选择", () => {
  const map = component([confirmed("卧推")])
  tap(map, clientPoint("hamstrings"))
  assert.equal(map.data.selectedName, "腘绳肌")
  assert.deepEqual(map.data.details, [])
  tap(map, { clientX: rect.left + 2, clientY: rect.top + 2 })
  assert.equal(map.data.selected, "hamstrings")
})

test("只有页面坐标时扣除滚动距离；列表行点击同样选中", () => {
  const map = component([confirmed("高位下拉")], {
    scrollLeft: 0,
    scrollTop: 640,
  })
  const point = clientPoint("lats")
  map.tapMap({ detail: { x: point.clientX, y: point.clientY + 640 } })
  assert.equal(map.data.selected, "lats")
  map.select({ currentTarget: { dataset: { id: "lats" } } })
  assert.deepEqual(
    map.data.details.map((e) => e.name),
    ["高位下拉"],
  )
})

test("未知分类只用文字列出；部位等级不变时不重新生成底图", () => {
  const custom = core.makeExercise("跳绳", "其他")
  custom.sets[0] = { ...custom.sets[0], reps: "100", done: true }
  const map = component([custom])
  assert.deepEqual(map.data.recorded, [])
  assert.deepEqual(
    map.data.unknown.map((e) => [e.muscle, e.name, e.sets]),
    [["其他", "跳绳", 1]],
  )
  assert.equal(map.data.categories, "")
  const image = map.data.image
  map.properties.exercises = copy([custom])
  const before = map.updates
  delete map.data.image
  map.refresh()
  assert.equal(map.updates, before + 1)
  assert.equal(map.data.image, undefined, "等级未变，不应再次写入底图")
  map.data.image = image
  map.properties.exercises = [confirmed("深蹲")]
  map.refresh()
  assert.notEqual(map.data.image, image)
})
