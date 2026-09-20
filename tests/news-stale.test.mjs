import test from 'node:test';import assert from 'node:assert/strict';
import {activeStories,visibleStories} from '../public/newsroom/shared.js';
test('expired availability remains visible but never becomes fresh evidence',()=>{
 const expired={topic:'Availability',expires_at:'2026-09-01T00:00:00Z',observed_at:'2026-08-31T00:00:00Z'};
 const data={stories:[expired,{...expired,topic:'Role'}]};const now=Date.parse('2026-09-20T00:00:00Z');
 assert.equal(activeStories(data,now).length,0);const rows=visibleStories(data,now);assert.equal(rows.length,1);assert.equal(rows[0].stale,true);assert.equal(rows[0].observed_at,expired.observed_at);
});
