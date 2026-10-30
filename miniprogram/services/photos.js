const core = require("../lib/core")
const store = require("./context")
const api = require("./api")
const jobs = new Map()
const scope = account => account ? encodeURIComponent(account.server)+":"+account.user.id : "local"
const key = account => "training-notebook:photos:"+scope(account)
const list = account => wx.getStorageSync(key(account)) || []
const persist = (account,photos) => wx.setStorageSync(key(account),photos)
const sameOwner = account => scope(account) === scope(store.credentials())
function assertPhotoOwner(photo,account) {
  if(photo.ownerScope && photo.ownerScope!==scope(account))throw new Error("账号已变化，请重新打开照片")
}
const PHOTO_KINDS=["workout","body"]
const PHOTO_ANGLES=["正面","侧面","背面"]
function validateMetadata(date,tags="",note="",kind="workout",angle=null) {
  const parsed=new Date(date+"T12:00:00")
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || core.localDate(parsed)!==date || date>core.localDate())throw new Error("请选择有效的照片日期，不能晚于今天")
  if(tags.length>160 || note.length>1000)throw new Error("部位说明最多 160 字，备注最多 1000 字")
  if(!PHOTO_KINDS.includes(kind))throw new Error("照片类型无效")
  if(angle && !PHOTO_ANGLES.includes(angle))throw new Error("整体照片角度请选择正面、侧面或背面")
}
function fileCall(method,values) {return new Promise((resolve,reject)=>wx.getFileSystemManager()[method]({...values,success:resolve,fail:()=>reject(new Error("照片本机保存失败，请检查存储空间"))}))}
async function choose(date,workoutId,tags,options) {
  const {kind="workout", angle=null} = options || {}
  validateMetadata(date,tags,"",kind,angle)
  const account = store.credentials()
  const result = await new Promise((resolve,reject)=>wx.chooseMedia({count:9,mediaType:["image"],sourceType:["album","camera"],success:resolve,fail:r=>reject(new Error(r.errMsg?.includes("cancel") ? "已取消选图" : "无法选择图片，请检查相册权限"))}))
  if (!sameOwner(account)) throw new Error("账号已变化，请重新选图")
  for (const file of result.tempFiles) {
    if(file.size>10*1024*1024)throw new Error("请选择 10 MB 以内的照片；此前选中的照片已保留")
    const photo = {id:core.id(),ownerScope:scope(account),date,workout_id:workoutId || null,tags:tags || "",kind,angle,note:"",uploaded:false,error:""}
    photo.path = wx.env.USER_DATA_PATH+"/fitness-photo-"+photo.id+".jpg"
    await fileCall("copyFile",{srcPath:file.tempFilePath,destPath:photo.path})
    try {
      if (!sameOwner(account)) throw new Error("账号已变化，已选图片未上传")
      persist(account,[...list(account),photo])
    } catch(error) {
      await fileCall("unlink",{filePath:photo.path}).catch(()=>{})
      throw error
    }
  }
}
function upload(account,photo) {
  const formData=photo.uploadRequest
  return new Promise((resolve,reject)=>wx.uploadFile({url:account.server+"/api/v1/fitness/photos",filePath:photo.path,name:"file",header:{Authorization:"Bearer "+account.token},formData,
    success:r=>{try{const data=JSON.parse(r.data);if(r.statusCode>=200&&r.statusCode<300)resolve(data);else reject(Object.assign(new Error(typeof data.detail === "string" ? data.detail : "图片未通过校验"),{status:r.statusCode}))}catch(error){reject(error)}},fail:()=>reject(new Error("上传中断，照片仍保存在此设备，可重试"))}))
}
async function sync(photoId=null) {
  const account=store.credentials()
  if (!account) return
  const owner=scope(account)
  if(jobs.has(owner)) return jobs.get(owner)
  const task=(async()=>{
    if (!(await store.flush()) || !sameOwner(account)) throw new Error("请先同步训练记录，再上传关联照片")
    const failures=[]
    for (let photo of list(account).filter(p=>!p.uploaded && (!photoId || p.id===photoId))) {
      if (!sameOwner(account)) return
      try {
        if(!photo.uploadRequest) {
          // 请求发出前落盘；响应丢失或重启后重发同一份内容。
          const linked=photo.workout_id && store.snapshot().data.history.some(w=>w.id===photo.workout_id)
          const formData={photo_id:photo.id,date:photo.date,kind:photo.kind,tags:photo.tags,note:photo.note}
          if(linked) formData.workout_id=photo.workout_id
          if(photo.angle) formData.angle=photo.angle
          photo={...photo,workout_id:linked?photo.workout_id:null,uploadRequest:formData,attempted:true}
          persist(account,list(account).map(p=>p.id===photo.id?photo:p))
        }
        const remote=await upload(account,photo)
        persist(account,list(account).map(p=>p.id===photo.id ? {...p,uploaded:true,error:"",uncertain:false,remote} : p))
      } catch(error) {
        const uncertain=!error.status || error.status>=500
        persist(account,list(account).map(p=>p.id===photo.id ? {...p,error:error.message,uncertain,uploadRequest:uncertain?p.uploadRequest:null} : p))
        failures.push(error.message)
      }
    }
    if(failures.length)throw new Error(failures.length+" 张照片未上传："+failures[0]+"；其余照片已继续处理")
  })().finally(()=>jobs.delete(owner))
  jobs.set(owner,task);return task
}
async function remoteList(offset=0,date=null) {
  const account=store.credentials()
  if(!account) return {data:[],count:0}
  const result=await api.request(account,"/fitness/photos?limit=100&offset="+offset+(date?"&date="+encodeURIComponent(date):""))
  if(!sameOwner(account)) throw new Error("账号已变化")
  return {...result,data:result.data.map(p=>({...p,ownerScope:scope(account)}))}
}
async function imagePath(photo) {
  assertPhotoOwner(photo,store.credentials())
  if(photo.path) return photo.path
  const account=store.credentials();if(!account) throw new Error("请先登录")
  const result=await new Promise((resolve,reject)=>wx.downloadFile({url:account.server+"/api/v1/fitness/photos/"+photo.id+"/content",header:{Authorization:"Bearer "+account.token},success:r=>r.statusCode===200?resolve(r):reject(new Error("照片读取失败")),fail:()=>reject(new Error("照片下载失败"))}))
  if(!sameOwner(account)) throw new Error("账号已变化")
  return result.tempFilePath
}
async function remove(photo) {
  const account=store.credentials()
  assertPhotoOwner(photo,account)
  if(jobs.has(scope(account))) throw new Error("照片正在上传，请完成后再删除")
  if(photo.uploaded || photo.attempted || photo.error || !photo.path) {
    if(!account) throw new Error("请先登录")
    try {await api.request(account,"/fitness/photos/"+photo.id,"DELETE")} catch(error){if(error.status!==404)throw error}
  }
  persist(account,list(account).filter(p=>p.id!==photo.id))
  if(photo.path?.startsWith(wx.env.USER_DATA_PATH+"/fitness-photo-")) await fileCall("unlink",{filePath:photo.path}).catch(()=>{})
}
async function update(photo, fields) {
  const account=store.credentials()
  assertPhotoOwner(photo,account)
  if(jobs.has(scope(account))) throw new Error("照片正在上传，请完成后再编辑")
  const next={...photo,...fields}
  validateMetadata(
    next.date,
    next.tags || "",
    next.note || "",
    next.kind || "workout",
    next.angle || null,
  )
  if(photo.uploaded || !photo.path) {
    if(!account) throw new Error("请先登录")
    await api.request(account,"/fitness/photos/"+photo.id,"PATCH",{id:photo.id,date:next.date,kind:next.kind || "workout",angle:next.angle || null,workout_id:next.workout_id || null,tags:next.tags || "",note:next.note || ""})
  } else if (photo.uncertain || photo.uploadRequest) {
    // 可能已上传但响应丢失，先保留原始请求用于重试，禁止改动同一幂等身份。
    throw new Error("这张照片的上传结果尚未确认，请先重试上传，再修改说明")
  }
  persist(account,list(account).map(p=>p.id===photo.id ? {...p,...fields} : p))
}
async function importGuest() {
  const account=store.credentials();if(!account)throw new Error("请先登录")
  const source=list(null), target=list(account)
  // 保留本机照片原件；导入去重，若关联训练未导入则保留按日期照片。
  for (const p of source.filter(p=>!target.some(x=>x.id===p.id))) {
    if (!sameOwner(account)) throw new Error("账号已变化，导入已停止")
    const path=wx.env.USER_DATA_PATH+"/fitness-photo-"+core.id()+".jpg"
    await fileCall("copyFile",{srcPath:p.path,destPath:path})
    try {
      if (!sameOwner(account)) throw new Error("账号已变化，导入已停止")
      persist(account,[...list(account),{...p,path,ownerScope:scope(account),uploaded:false,error:"",uploadRequest:null,attempted:false,uncertain:false,workout_id:store.snapshot().data.history.some(w=>w.id===p.workout_id)?p.workout_id:null}])
    } catch(error) {
      await fileCall("unlink",{filePath:path}).catch(()=>{})
      throw error
    }
  }
}
module.exports={choose,sync,remoteList,imagePath,remove,update,importGuest,local:()=>{const account=store.credentials();return list(account).map(p=>({...p,ownerScope:scope(account)}))},guestCount:()=>list(null).length,scope:()=>scope(store.credentials())}
