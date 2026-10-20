/* ---------- pushberichten: weekendseintje (vrijdag, standaard 17:30) ----------
   Standaard aan: bij de eerstvolgende opening vraagt een kaartje met één knop om toestemming
   (browsers staan push nooit toe zonder één tik van de gebruiker). Wegtikken = nog één keer vragen.
   iPhone in de browser: eerst uitleg "Zet op beginscherm", want daar werkt push alleen als app. */
const PUSH_KEY='BGTdx0JOqRZ_fbr7XbjqYfxn5KHFpm5M9eK_LGHi45AQa1d1vfWvH_X2Zk3B4fVJDZO6HBoucBB2HI2Ps5VySqU';
const PUSH_TIMES=(()=>{const t=[];for(let h=12;h<=22;h++)for(const m of ['00','30'])if(!(h===22&&m==='30'))t.push(String(h).padStart(2,'0')+':'+m);return t})();
const pushSupported=()=>'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;
const isIOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const isStandalone=()=>{try{return matchMedia('(display-mode: standalone)').matches||navigator.standalone===true}catch(e){return false}};
const pushNeedsHome=()=>isIOS()&&!isStandalone();
const pushPerm=()=>('Notification' in window)?Notification.permission:'unsupported';

(function pushCss(){const s=document.createElement('style');s.textContent=`
.pushbell{font-size:40px;line-height:1;margin:0}
.pushex{display:flex;gap:10px;align-items:center;text-align:left;background:rgba(241,230,214,.06);border:1px solid rgba(241,230,214,.14);border-radius:14px;padding:10px 12px;max-width:300px;font-size:13px;line-height:1.35}
.pushex i{flex:none;width:30px;height:30px;border-radius:8px;background:#5A1F2A;display:grid;place-items:center;font-style:normal}
.pushsteps{list-style:none;padding:0;margin:0;text-align:left;max-width:300px;counter-reset:s}
.pushsteps li{counter-increment:s;display:flex;gap:10px;align-items:center;margin:10px 0;font-size:14px}
.pushsteps li::before{content:counter(s);flex:none;width:24px;height:24px;border-radius:50%;background:var(--gold);color:#2B1308;font-weight:700;display:grid;place-items:center;font-size:12px}
.pushsteps .k{display:inline-grid;place-items:center;min-width:24px;height:24px;padding:0 4px;border:1px solid rgba(241,230,214,.5);border-radius:6px;font-size:13px}
.settings .pushrow{display:flex;justify-content:space-between;align-items:center;gap:12px}
.settings .pushrow small{display:block;opacity:.65;font-size:11.5px;font-weight:400;margin-top:2px}
.settings .pushrow input[type=checkbox]{width:22px;height:22px;accent-color:var(--gold);flex:none}
.settings select#ptime{font:inherit;padding:8px 10px;border-radius:10px;border:1px solid rgba(90,60,30,.35);background:transparent;color:inherit}
`;document.head.appendChild(s)})();

let pushReg=null;
async function pushRegister(){
  if(!pushSupported())return null;
  if(pushReg)return pushReg;
  try{pushReg=await navigator.serviceWorker.register('sw.js');await navigator.serviceWorker.ready;return pushReg}catch(e){console.error('sw',e);return null}
}
function b64ToU8(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}

// Abonnement van dit toestel maken (of hergebruiken) en opslaan bij de gebruiker
async function pushSubscribe(){
  const reg=await pushRegister();if(!reg||!session)return false;
  try{
    let sub=await reg.pushManager.getSubscription();
    if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(PUSH_KEY)});
    const j=sub.toJSON();
    const {error}=await sb.rpc('push_save',{p_endpoint:j.endpoint,p_p256dh:j.keys.p256dh,p_auth:j.keys.auth});
    if(error){console.error(error);return false}
    return true;
  }catch(e){console.error('push',e);return false}
}

// Moet direct vanuit een tik worden aangeroepen (iOS vraagt anders niet om toestemming)
async function pushEnable(){
  if(pushNeedsHome()){openPushHome(true);return false}
  if(!pushSupported()){toast('Deze browser ondersteunt geen meldingen.');return false}
  let p=pushPerm();
  if(p==='default'){try{p=await Notification.requestPermission()}catch(e){p='denied'}}
  if(p!=='granted'){toast(p==='denied'?'Meldingen staan uit voor Vineder. Zet ze aan in de instellingen van je telefoon of browser.':'Geen toestemming gekregen.',5200);return false}
  const ok=await pushSubscribe();
  if(!ok)toast('Aanzetten lukte niet. Probeer het later nog eens.');
  return ok;
}

const pushAsk=k=>{try{return JSON.parse(localStorage.getItem(k)||'{"n":0,"t":0}')}catch(e){return {n:9,t:Date.now()}}};
const pushAsked=k=>{const a=pushAsk(k);try{localStorage.setItem(k,JSON.stringify({n:a.n+1,t:Date.now()}))}catch(e){}};
const pushMayAsk=k=>{const a=pushAsk(k);return a.n<2&&Date.now()-a.t>6*3600e3};

function openPushAsk(){
  pushAsked('vi.pushask');
  const o=overlay(`<p class="pushbell" aria-hidden="true">🔔</p><p class="status">Weekendseintje</p>
    <p class="hint" style="max-width:30ch">Elke vrijdag om 17:30 krijg je een seintje om je weekendwijn te scannen. Al gescand die dag? Dan laten we je met rust.</p>
    <div class="pushex"><i>🍷</i><div><b>Vineder</b><br>Het is weekend! Vergeet niet je wijn te scannen.</div></div>
    <div class="actions"><button class="btn primary" id="pon">Zet aan</button></div>
    <p class="hint" style="font-size:11.5px">Het tijdstip kun je aanpassen in Instellingen.</p>`);
  o.querySelector('#pon').onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent='Even geduld…';
    const ok=await pushEnable();closeOverlay();if(ok){pushAsked('vi.pushask');pushAsked('vi.pushask');toast('Staat aan! Vrijdag om 17:30 krijg je een seintje 🍷')}};
}

function openPushHome(fromSettings){
  if(!fromSettings)pushAsked('vi.pushios');
  const share=/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent)?'<span class="k">⋯</span> of <span class="k">⇪</span>':'<span class="k">⇪</span>';
  const o=overlay(`<p class="pushbell" aria-hidden="true">📲</p><p class="status">Zet Vineder op je beginscherm</p>
    <p class="hint" style="max-width:30ch">Dan opent hij als een echte app en kunnen we je op vrijdag een seintje sturen om je weekendwijn te scannen.</p>
    <ol class="pushsteps"><li><span>Tik op ${share} in de balk van je browser</span></li><li><span>Kies <b>Zet op beginscherm</b></span></li><li><span>Open Vineder vanaf je beginscherm en tik op <b>Zet aan</b></span></li></ol>
    <div class="actions"><button class="btn primary" id="pok">Begrepen</button></div>`,fromSettings?{nest:true}:{});
  o.querySelector('#pok').onclick=()=>fromSettings?popOverlay():closeOverlay();
}

// Bij het opstarten: toestel stil bijwerken als er al toestemming is; anders (max. 2x) het kaartje tonen
let pushBooted=false;
function pushBoot(tries=0){
  if(!session||viewing||pushBooted)return;
  if(document.querySelector('.overlay:not([hidden]),.kistov,.reveal,.primeur')||(typeof kistBusy!=='undefined'&&kistBusy)){if(tries<8)setTimeout(()=>pushBoot(tries+1),4000);return}
  pushBooted=true;
  if(pushNeedsHome()){if(pushMayAsk('vi.pushios'))openPushHome(false);return}
  if(!pushSupported())return;
  const p=pushPerm();
  if(p==='granted'){pushSubscribe();return}
  if(p==='default'&&pushMayAsk('vi.pushask'))openPushAsk();
}

// Instellingen: blok met aan/uit en tijdstip
function pushSettingsHTML(){
  return `<fieldset class="pushset"><legend>Weekendseintje</legend>
    <label class="pushrow" for="pon2"><span>Seintje op vrijdag<small>Niet als je die dag al gescand hebt</small></span><input type="checkbox" id="pon2" checked></label>
    <label for="ptime" class="pushrow" style="margin-top:10px"><span>Tijdstip</span><select id="ptime">${PUSH_TIMES.map(t=>`<option${t==='17:30'?' selected':''}>${t}</option>`).join('')}</select></label>
    ${isAdmin()?'<button class="btn" type="button" id="ptest" style="margin-top:10px">Stuur testbericht naar dit toestel</button>':''}
  </fieldset>`;
}
async function pushSettingsInit(o){
  const on=o.querySelector('#pon2'),tm=o.querySelector('#ptime');if(!on)return;
  const local=pushPerm()==='granted';
  on.checked=local;
  try{const {data}=await sb.rpc('push_my');if(data){if(data.devices)on.checked=!!data.enabled&&local;if(data.time&&PUSH_TIMES.includes(data.time))tm.value=data.time}}catch(e){}
  on.dataset.was=on.checked?'1':'';tm.dataset.was=tm.value;
  const t=o.querySelector('#ptest');
  if(t)t.onclick=async()=>{t.disabled=true;
    if(pushPerm()!=='granted'&&!(await pushEnable())){t.disabled=false;return}
    await pushSubscribe();
    const {data,error}=await sb.functions.invoke('push',{body:{action:'test'}});t.disabled=false;
    toast(error?'Testbericht lukte niet.':data&&data.status==='ok'?`Verstuurd naar ${data.sent} toestel${data.sent==1?'':'len'}.`:'Geen toestel gevonden. Zet het seintje eerst aan.')};
}
// Aanroepen vanuit het opslaan van Instellingen (start binnen de tik, vóór andere awaits)
async function pushSettingsSave(o){
  const on=o.querySelector('#pon2'),tm=o.querySelector('#ptime');if(!on)return;
  const want=on.checked,changed=(want?'1':'')!==on.dataset.was||tm.value!==tm.dataset.was;
  if(!changed)return;
  if(want&&pushNeedsHome()){toast('Zet Vineder eerst op je beginscherm en open hem daarvandaan; daarna kun je het seintje aanzetten.',6000);return}
  if(want&&!(pushPerm()==='granted'&&await pushSubscribe())){if(!(await pushEnable()))return}
  const {error}=await sb.rpc('push_settings',{p_enabled:want,p_time:tm.value});
  if(error)console.error(error);
  else if(want)toast(`Staat aan: vrijdag om ${tm.value} een seintje 🍷`);
}
