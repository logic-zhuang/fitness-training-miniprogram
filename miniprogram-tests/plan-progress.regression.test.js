const assert = require('node:assert/strict')
const { test } = require('node:test')
const core = require('../miniprogram/lib/core')

test('首页不能把一组部分训练、重复训练和临时训练算成三个已完成安排', () => {
  const data = core.initialData()
  const workout = core.makeWorkout(data.plan.days[0])
  Object.assign(workout.exercises[0].sets[0], { weight: '40', reps: '10', done: true })
  const partial = { ...workout, endedAt: Date.now() }
  const repeat = { ...partial, id: core.id() }
  const temporary = { ...core.makeWorkout(), endedAt: Date.now() }
  data.history = [partial, repeat, temporary]
  let definition
  global.Page = value => { definition = value }
  global.getApp = () => ({ fitness: {
    init() {},
    snapshot: () => ({ data, ready: true, phase: 'local', status: '已保存到本机', error: '' }),
    subscribe(listener) { listener(this.snapshot()); return () => {} },
  } })
  delete require.cache[require.resolve('../miniprogram/pages/home/index')]
  require('../miniprogram/pages/home/index')
  const instance = { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value) } }
  try {
    instance.onShow()
    assert.equal(instance.data.completed, 0)
  } finally {
    if (instance.onHide) instance.onHide()
    delete global.Page
    delete global.getApp
  }
})
