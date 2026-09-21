// Reusable table state: stable null-last sorting, paging and session-only columns.
export function sortRows(rows,key,direction='desc'){
 return [...rows].sort((a,b)=>{const x=a[key],y=b[key],missing=v=>v==null||typeof v==='number'&&!Number.isFinite(v);if(missing(x)!==missing(y))return missing(x)?1:-1;const d=missing(x)?0:typeof x==='string'?x.localeCompare(String(y)):x-y;return d*(direction==='asc'?1:-1)||String(a.player_name||a.team||'').localeCompare(String(b.player_name||b.team||''));});
}
export function paginate(rows,page=0,size=30){const pages=Math.max(1,Math.ceil(rows.length/size)),index=Math.min(Math.max(0,page),pages-1);return {rows:rows.slice(index*size,(index+1)*size),page:index,pages,total:rows.length};}
export function readColumns(storage,key,allowed,fallback){try{const saved=JSON.parse(storage.getItem(key));if(Array.isArray(saved)){const cols=[...new Set(saved)].filter(k=>allowed.includes(k));if(cols.length)return cols;}}catch{}return [...fallback];}
