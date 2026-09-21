import {esc,stamp} from '../research/highlights.js';
import {weatherText} from '../game-context.js';
export function weatherWatch(games){
 return `<section class="ui-home-panel"><header><h2>Weather Watch</h2></header>${games.slice(0,5).map(g=>`<p><strong>${esc(g.away)} @ ${esc(g.home)}</strong> · ${esc(weatherText({start:g.start_time,fetchedAt:g.captured_at,roofed:g.roofed,weather:g.weather?{temperature:g.weather.temperature,description:g.weather.displayValue||'Forecast'}:null}))}</p>`).join('')||'<p>Upcoming forecast coverage is unavailable.</p>'}<small>Wind and precipitation intensity are not supplied by this feed. Weather adjustments are not yet included in projections.</small></section>`;
}
