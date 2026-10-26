const DB='duong-learning-v1'; let db; let pending=Promise.resolve(); let writerLock;
export async function openStore(){
  // A single writer prevents two open tabs from replacing each other's whole state.
  if (navigator.locks && !writerLock) {
    writerLock=new Promise((resolve,reject)=>{
      navigator.locks.request(DB+'-writer',{ifAvailable:true},async lock=>{
        if(!lock){reject(Error('Practice is already open in another tab. Close that tab, then reload this one to protect your progress.'));return;}
        resolve(); await new Promise(()=>{});
      }).catch(reject);
    });
    await writerLock;
  }
  db=await new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('records');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Close another Đường tab to finish opening storage.'));});
  return db;
}
export function readState(){return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('state');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export function saveState(state){const copy=structuredClone(state);pending=pending.catch(()=>{}).then(()=>new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(copy,'state');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Storage write was interrupted.'));}));return pending;}
export function saveRollback(state){return new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(structuredClone(state),'before-import');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export function readRollback(){return new Promise((resolve,reject)=>{const r=db.transaction('records').objectStore('records').get('before-import');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
