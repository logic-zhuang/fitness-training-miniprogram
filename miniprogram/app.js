const store = require("./services/store")
App({
  fitness: store,
  onLaunch() {
    this.fitness.init()
  },
  onHide() {
    void this.fitness.flush()
  },
  onShow() {
    this.fitness.init()
    if (this.fitness.snapshot().ready) void this.fitness.flush()
  },
})
