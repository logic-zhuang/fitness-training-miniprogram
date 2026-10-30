const assert = require("node:assert/strict")
const { beforeEach, afterEach, test } = require("node:test")
let photos, storage, files, account, remote, attempts, failIds, loseAck, pendingUpload
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value))
beforeEach(() => {
  storage = new Map(); files = new Map([["temp-a","A"],["temp-b","B"]]); remote = new Map(); attempts = []; failIds = new Set(); loseAck = false; pendingUpload = null
  account = {server:"http://test.local",token:"token-a",user:{id:"user-a"}}
  global.getApp = () => ({fitness:{init(){},credentials:()=>clone(account),flush:async()=>true,snapshot:()=>({data:{history:[]}})}})
  global.wx = {
    env:{USER_DATA_PATH:"/private"},
    getStorageSync:key=>clone(storage.get(key)), setStorageSync:(key,value)=>storage.set(key,clone(value)),
    chooseMedia:options=>options.success({tempFiles:[{tempFilePath:"temp-a"}]}),
    getFileSystemManager:()=>({
      copyFile(options){files.set(options.destPath,files.get(options.srcPath));options.success({})},
      unlink(options){files.delete(options.filePath);options.success({})},
    }),
    uploadFile(options){
      attempts.push(clone(options.formData))
      const respond=()=>{
        if(failIds.has(options.formData.photo_id))return options.fail({})
        remote.set(options.formData.photo_id,clone(options.formData))
        if(loseAck){loseAck=false;return options.fail({})}
        options.success({statusCode:200,data:JSON.stringify({id:options.formData.photo_id,...options.formData})})
      }
      if(pendingUpload)pendingUpload(respond);else respond()
    },
    request(options){
      if(options.method==="DELETE") {remote.delete(options.url.split("/").pop());options.success({statusCode:200,data:{}})}
      else options.success({statusCode:200,data:{data:[...remote.values()],count:remote.size}})
    },
  }
  delete require.cache[require.resolve("../miniprogram/services/photos")]
  photos=require("../miniprogram/services/photos")
})
afterEach(()=>{delete global.getApp;delete global.wx})

test("照片选图后持久化；导入创建独立原件，删除账号照片不损坏本机副本",async()=>{
  account=null;await photos.choose("2026-10-01",null,"胸部")
  const guest=photos.local()[0]
  assert.equal(files.get(guest.path),"A")
  account={server:"http://test.local",token:"token-a",user:{id:"user-a"}}
  await photos.importGuest();await photos.importGuest()
  const imported=photos.local()[0]
  assert.equal(photos.local().length,1);assert.notEqual(imported.path,guest.path)
  await photos.remove(imported)
  assert.equal(files.get(guest.path),"A")
  account=null;assert.equal(photos.local().length,1)
})
test("照片上传响应丢失保留请求；重试同一照片身份和内容，不重复创建",async()=>{
  await photos.choose("2026-10-01",null,"胸部")
  loseAck=true;await assert.rejects(()=>photos.sync())
  assert.equal(photos.local()[0].uploaded,false)
  await photos.sync()
  assert.equal(remote.size,1);assert.deepEqual(attempts[0],attempts[1])
  assert.equal(photos.local()[0].uploaded,true)
})
test("逐张上传：一张失败不阻塞其余照片，保留失败项供重试",async()=>{
  wx.chooseMedia=options=>options.success({tempFiles:[{tempFilePath:"temp-a"},{tempFilePath:"temp-b"}]})
  await photos.choose("2026-10-01",null,"")
  failIds.add(photos.local()[0].id)
  await assert.rejects(()=>photos.sync())
  assert.equal(photos.local().filter(p=>p.uploaded).length,1)
  assert.equal(photos.local().filter(p=>p.error).length,1)
})
test("上传结果未确认的照片删除时也清除云端，不能留下隐藏照片",async()=>{
  await photos.choose("2026-10-01",null,"")
  loseAck=true;await assert.rejects(()=>photos.sync())
  assert.equal(remote.size,1)
  await photos.remove(photos.local()[0])
  assert.equal(remote.size,0);assert.equal(photos.local().length,0)
})
test("上传期间切换账号，结果仅写回原账号，不进入新账号照片队列",async()=>{
  await photos.choose("2026-10-01",null,"")
  let finish;pendingUpload=callback=>{finish=callback}
  const saving=photos.sync();await new Promise(resolve=>setTimeout(resolve,0))
  const original=clone(account)
  account={...account,user:{id:"user-b"},token:"token-b"}
  finish();await saving
  assert.equal(photos.local().length,0)
  account=original;assert.equal(photos.local()[0].uploaded,true)
})
test("重试仅处理选择的失败照片；上传结果不明时禁止改写原请求",async()=>{
  wx.chooseMedia=options=>options.success({tempFiles:[{tempFilePath:"temp-a"},{tempFilePath:"temp-b"}]})
  await photos.choose("2026-10-01",null,"")
  const first=photos.local()[0]
  loseAck=true;await assert.rejects(()=>photos.sync(first.id))
  await assert.rejects(()=>photos.update(photos.local()[0],{tags:"变更说明"}),/尚未确认/)
  assert.equal(photos.local()[1].uploaded,false)
  await photos.sync(first.id)
  assert.equal(remote.size,1)
  assert.equal(photos.local()[0].uploaded,true)
})
test("旧账号照片操作在切换后拒绝，照片日期输入也需要有效",async()=>{
  await assert.rejects(()=>photos.choose("2026-02-30",null,""),/有效/)
  await photos.choose("2026-10-01",null,"")
  const previous=photos.local()[0]
  account={...account,user:{id:"user-b"}}
  await assert.rejects(()=>photos.remove(previous),/账号已变化/)
  await assert.rejects(()=>photos.imagePath(previous),/账号已变化/)
  assert.equal(files.has(previous.path),true)
})
test("整体照片：kind=body 与角度入库并随上传提交；部位照片保持默认 kind=workout",async()=>{
  await photos.choose("2026-10-01",null,"",{kind:"body",angle:"正面"})
  const body=photos.local()[0]
  assert.equal(body.kind,"body");assert.equal(body.angle,"正面")
  await photos.choose("2026-10-02",null,"胸")
  const part=photos.local()[1]
  assert.equal(part.kind,"workout");assert.equal(part.angle,null)
  await photos.sync()
  assert.equal(remote.get(body.id).kind,"body");assert.equal(remote.get(body.id).angle,"正面")
  assert.equal(remote.get(part.id).kind,"workout")
})
test("整体照片角度或类型非法时拒绝，不影响已选照片",async()=>{
  await assert.rejects(()=>photos.choose("2026-10-01",null,"",{kind:"body",angle:"斜45度"}),/角度/)
  await assert.rejects(()=>photos.choose("2026-10-01",null,"",{kind:"avatar"}),/类型/)
  assert.equal(photos.local().length,0)
})
