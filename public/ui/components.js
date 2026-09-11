export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => Number.isFinite(value) ? new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(value) : '—';
export const decimal = value => Number.isFinite(value) ? value.toFixed(1) : '—';
export const option = (value,label) => `<option value="${esc(value)}">${esc(label)}</option>`;
export const avatar = p => `<span class="ui-avatar" aria-hidden="true">${esc(p.position==='DST'?p.team:p.player_name.split(' ').map(s=>s[0]).slice(0,2).join(''))}</span>`;
