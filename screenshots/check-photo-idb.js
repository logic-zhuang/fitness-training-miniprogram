async () => {
  if ((await indexedDB.databases()).some(d => d.name === "training-notebook-photos")) throw new Error("Requires an isolated empty browser session")
  const blob = await (await fetch("/tests/fitness/fixtures/body-test.png")).blob()
  const original = {id:"legacy-fixture",owner:"preview",date:"2026-10-01",angle:"侧面",note:"原始照片",blob}
  await new Promise((resolve,reject) => {
    const request = indexedDB.open("training-notebook-photos",1)
    request.onupgradeneeded = () => request.result.createObjectStore("photos",{keyPath:"id"}).createIndex("owner","owner")
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const tx=request.result.transaction("photos","readwrite")
      tx.objectStore("photos").put(original)
      tx.oncomplete=()=>{request.result.close();resolve()}
      tx.onabort=()=>reject(tx.error)
    }
  })
  const m=await import("/src/features/fitness/photos.ts")
  const migrated=(await m.readPhotos("preview"))[0]
  if (!migrated || migrated.note!==original.note || migrated.blob.size!==blob.size) throw new Error("Legacy photo migration lost original metadata or file")
  await m.savePhoto({...migrated,owner:"account-a"})
  await m.savePhoto({...migrated,owner:"account-b"})
  await m.deletePhoto("account-a",original.id)
  const a=await m.readPhotos("account-a"),b=await m.readPhotos("account-b"),guest=await m.readPhotos("preview")
  if (a.length!==0 || b.length!==1 || guest.length!==1 || b[0].blob.size!==blob.size) throw new Error("Compound identity failed account isolation")
  const backup=await new Promise((resolve,reject)=>{
    const r=indexedDB.open("training-notebook-photos",2)
    r.onsuccess=()=>{const tx=r.result.transaction("photos");const q=tx.objectStore("photos").getAll();tx.oncomplete=()=>{r.result.close();resolve(q.result)};tx.onabort=()=>reject(tx.error)}
    r.onerror=()=>reject(r.error)
  })
  if (backup.length!==1 || backup[0].owner!=="preview" || backup[0].blob.size!==blob.size) throw new Error("Legacy backup was overwritten")
  const cache=JSON.parse(localStorage.getItem("training-notebook:v1:preview"))
  if (!cache?.history.length) throw new Error("Preview history identity was not persisted before photo attachment")
  sessionStorage.setItem("photo-verification-history",JSON.stringify(cache.history.map(w=>w.id)))
  return {migration:"passed",legacyBackup:backup.length,guest:guest.length,accountA:a.length,accountB:b.length,bytes:blob.size,history:cache.history.map(w=>w.id)}
}
