// Clear Air app logic. Renders into #app with plain DOM; persistence goes through the Supabase client passed in.
export function startClearAir(supabase){
const TRIGGERS=[
 {k:"wake",n:"Waking up",tip:"Drink a full glass of water and step outside for 2 minutes before anything else."},
 {k:"chai",n:"With chai / coffee",tip:"Change the cup or the spot. Have your chai somewhere you never smoke."},
 {k:"meal",n:"After meals",tip:"Get up from the table right away. Brush your teeth or chew saunf or mint."},
 {k:"break",n:"Work breaks",tip:"Keep the break, change the route. Walk a different way or call someone."},
 {k:"stress",n:"Stress",tip:"Box breathing: in 4, hold 4, out 4, hold 4. Do four rounds."},
 {k:"drinks",n:"Drinking",tip:"Hold the drink in your smoking hand and stay away from the smokers' corner."},
 {k:"friends",n:"With friends",tip:"Tell them you are quitting. Step away when they light up."},
 {k:"bored",n:"Boredom",tip:"Give your hands a job for 10 minutes: phone game, squeeze ball, dishes."},
 {k:"bed",n:"Before bed",tip:"Put the phone down, wash your face, cold water. Bed, not balcony."},
 {k:"drive",n:"Driving / commute",tip:"Keep gum or roasted chana in the bag. Put music or a podcast on."}
];
const T=Object.fromEntries(TRIGGERS.map(t=>[t.k,t]));
const MILES=[
 [20*60e3,"20 min","Heart rate and blood pressure start to drop."],
 [12*3600e3,"12 hours","Carbon monoxide in your blood falls to normal."],
 [48*3600e3,"2 days","Taste and smell start to sharpen."],
 [72*3600e3,"3 days","Nicotine is out of your system. Cravings often peak around here."],
 [14*864e5,"2 weeks","Circulation and lung function begin improving."],
 [30*864e5,"1 month","Coughing and shortness of breath start to ease."],
 [90*864e5,"3 months","Exercise feels noticeably easier."],
 [365*864e5,"1 year","Added risk of heart disease is about half that of a smoker."]
];
const LS="clear-air-v1";
let S=null, db=null, ref=null, saving=Promise.resolve(), saveTimer=null, synced=false;
const app=document.getElementById("app");
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const rupee=n=>"₹"+Math.round(n).toLocaleString("en-IN");

function readLocal(){try{const r=localStorage.getItem(LS);return r?JSON.parse(r):null}catch(e){return null}}
function writeLocal(){try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}}
function save(){
  writeLocal();
  if(!ref) return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{
    const body=JSON.parse(JSON.stringify(S));
    saving=saving.then(()=>ref.set(body)).catch(()=>{});
  },400);
}
function trim(){S.cravings=S.cravings.slice(-400);S.slips=S.slips.slice(-400)}

/* ---------- derived numbers ---------- */
function streakMs(){return Math.max(0,Date.now()-S.streakStart)}
function bestMs(){return Math.max(S.longest||0,streakMs())}
function totals(){
  const days=(Date.now()-S.quitStart)/864e5;
  const smoked=S.slips.reduce((a,s)=>a+(s.n||1),0);
  const avoided=Math.max(0,Math.floor(days*S.setup.perDay)-smoked);
  return {avoided,saved:avoided*S.setup.cost,smoked};
}
function fmtDur(ms){const d=Math.floor(ms/864e5);if(d>=1)return d+"d";const h=Math.floor(ms/36e5);if(h>=1)return h+"h";return Math.floor(ms/6e4)+"m"}

/* ---------- views ---------- */
function header(){return `<header><div class="brand"><svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="var(--air)"/><path d="M8 18c3-4 6 2 9-2s4-5 6-3" stroke="var(--surface)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg><h1>Clear Air</h1></div>${S?'<button class="iconbtn" id="settingsBtn">Settings</button>':""}</header>`}

function onboarding(){
  const d={perDay:8,cost:20,triggers:["chai","stress","drinks"],why:""};
  app.innerHTML=header()+`
  <form class="onb" id="onbForm">
    <div style="display:flex;flex-direction:column;gap:8px">
      <h2>Let's set up your quit.</h2>
      <p class="intro">Four quick answers. They power your savings counter and the tips you get when a craving hits.</p>
    </div>
    <div class="row2">
      <div class="field"><label class="label" for="perDay">Cigarettes a day</label><input id="perDay" type="number" min="1" max="80" value="${d.perDay}" required></div>
      <div class="field"><label class="label" for="cost">Cost per stick (₹)</label><input id="cost" type="number" min="1" max="500" step="0.5" value="${d.cost}" required></div>
    </div>
    <div class="field"><span class="label">When do you usually smoke?</span>
      <div class="chips" id="trigChips">${TRIGGERS.map(t=>`<button type="button" class="chip" data-k="${t.k}" aria-pressed="${d.triggers.includes(t.k)}">${t.n}</button>`).join("")}</div>
      <span class="hint">Pick all that apply.</span></div>
    <div class="field"><label class="label" for="why">Your reason to quit</label><textarea id="why" rows="2" placeholder="e.g. Breathe easy on runs. Stop smelling of smoke."></textarea><span class="hint">You'll see this every time you open the app.</span></div>
    <div class="field"><span class="label">Last cigarette</span>
      <div class="chips" id="startChips"><button type="button" class="chip" data-s="now" aria-pressed="true">Just now</button><button type="button" class="chip" data-s="morning" aria-pressed="false">This morning</button><button type="button" class="chip" data-s="yesterday" aria-pressed="false">Yesterday</button></div></div>
    <button class="btn primary" type="submit">Start my streak</button>
  </form>`;
  $("#trigChips").onclick=e=>{const b=e.target.closest(".chip");if(b)b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")!=="true")};
  $("#startChips").onclick=e=>{const b=e.target.closest(".chip");if(!b)return;document.querySelectorAll("#startChips .chip").forEach(c=>c.setAttribute("aria-pressed",c===b))};
  $("#onbForm").onsubmit=e=>{
    e.preventDefault();
    const sel=document.querySelector('#startChips [aria-pressed="true"]').dataset.s;
    const now=new Date();let start=now.getTime();
    if(sel==="morning"){const m=new Date(now);m.setHours(8,0,0,0);start=Math.min(start,m.getTime())}
    if(sel==="yesterday"){const y=new Date(now);y.setDate(y.getDate()-1);y.setHours(22,0,0,0);start=y.getTime()}
    S={v:1,setup:{perDay:+$("#perDay").value||8,cost:+$("#cost").value||20,
      triggers:[...document.querySelectorAll('#trigChips [aria-pressed="true"]')].map(b=>b.dataset.k),
      why:$("#why").value.trim()},quitStart:start,streakStart:start,longest:0,cravings:[],slips:[]};
    save();home();
  };
}

function home(){
  const t=totals();
  app.innerHTML=header()+`
  <div class="hero" aria-live="polite">
    <svg class="wisps" width="200" height="160" viewBox="0 0 200 160" aria-hidden="true"><path d="M10 120c30-40 60 20 90-20s50-60 90-30M20 150c30-30 60 10 90-15s50-40 80-20M40 80c20-30 50 10 70-15s40-40 70-25" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"/></svg>
    <span class="label">Smoke-free streak</span>
    <div class="days"><span id="dNum" class="num" style="font-family:inherit">0</span><small id="dLbl">days</small></div>
    <div class="clock" id="clock">00h 00m 00s</div>
  </div>
  ${S.setup.why?`<p class="why">${esc(S.setup.why)}</p>`:""}
  <div class="stats">
    <div class="stat"><span class="label">Saved</span><span class="v" id="saved">${rupee(t.saved)}</span></div>
    <div class="stat"><span class="label">Not smoked</span><span class="v" id="avoided">${t.avoided}</span></div>
    <div class="stat"><span class="label">Best streak</span><span class="v" id="best">${fmtDur(bestMs())}</span></div>
  </div>
  <div class="actions">
    <button class="btn primary" id="craveBtn">I'm craving</button>
    <button class="btn slip" id="slipBtn">I smoked</button>
  </div>
  <section><div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px"><h2>Last 14 days</h2><span class="hint" id="resisted"></span></div>
    <div class="panel" style="display:flex;flex-direction:column;gap:12px"><div class="strip" id="strip"></div>
    <div class="legend"><span><i style="background:var(--air)"></i>Smoke-free</span><span><i style="background:var(--ember)"></i>Smoked</span><span><i style="background:var(--line)"></i>Before start</span></div></div></section>
  <section><h2>Your triggers</h2><div class="panel" style="display:flex;flex-direction:column;gap:14px" id="trig"></div></section>
  <section><h2>Body recovery</h2><div class="panel miles" id="miles"></div><span class="hint">Commonly cited public-health milestones; individual recovery varies.</span></section>
  <section><h2>Recent log</h2><div class="panel log" id="log"></div></section>
  <p class="sync" id="sync">${ref?"Saved to your account":"Saved on this device"}</p>`;
  $("#craveBtn").onclick=craving;
  $("#slipBtn").onclick=()=>slipSheet();
  $("#settingsBtn").onclick=settings;
  renderStrip();renderTriggers();renderLog();tick();
}

function tick(){
  if(!$("#clock")) return;
  const ms=streakMs(),d=Math.floor(ms/864e5);
  $("#dNum").textContent=d;$("#dLbl").textContent=d===1?"day":"days";
  const h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4),s=Math.floor(ms%6e4/1e3);
  $("#clock").textContent=`${String(h).padStart(2,"0")}h ${String(m).padStart(2,"0")}m ${String(s).padStart(2,"0")}s`;
  const t=totals();$("#saved").textContent=rupee(t.saved);$("#avoided").textContent=t.avoided;$("#best").textContent=fmtDur(bestMs());
  $("#miles").innerHTML=MILES.map(([at,w,txt])=>`<div class="mile ${ms>=at?"done":""}"><span class="tick"></span><span class="what">${txt}</span><span class="when">${w}</span></div>`).join("");
}
setInterval(tick,1000);

function renderStrip(){
  const out=[];const today=new Date();today.setHours(0,0,0,0);
  const startDay=new Date(S.quitStart);startDay.setHours(0,0,0,0);
  for(let i=13;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);const a=d.getTime(),b=a+864e5;
    let cls="";
    if(S.slips.some(s=>s.t>=a&&s.t<b)) cls="slip";
    else if(b>S.quitStart) cls="free";
    if(i===0) cls+=" today";
    out.push(`<div class="day"><span class="dot ${cls}"></span>${d.getDate()}</div>`);
  }
  $("#strip").innerHTML=out.join("");
  const ok=S.cravings.filter(c=>c.ok).length;
  $("#resisted").textContent=ok?`${ok} craving${ok>1?"s":""} beaten`:"";
}

function renderTriggers(){
  const c={},s={};
  S.cravings.forEach(x=>c[x.trig]=(c[x.trig]||0)+1);
  S.slips.forEach(x=>s[x.trig]=(s[x.trig]||0)+1);
  const keys=[...new Set([...S.setup.triggers,...Object.keys(c),...Object.keys(s)])].filter(k=>T[k]);
  const logged=S.cravings.length+S.slips.length;
  if(!keys.length){$("#trig").innerHTML=`<p class="empty">No triggers yet. Log a craving to start seeing patterns.</p>`;return}
  const max=Math.max(1,...keys.map(k=>(c[k]||0)+(s[k]||0)));
  keys.sort((a,b)=>((c[b]||0)+(s[b]||0))-((c[a]||0)+(s[a]||0)));
  let html=`<div class="bars">${keys.map(k=>{const cc=c[k]||0,ss=s[k]||0;return `<div class="bar"><span>${T[k].n}</span><span class="track"><span class="c" style="width:${cc/max*100}%"></span><span class="s" style="width:${ss/max*100}%"></span></span><span class="n">${cc+ss}</span></div>`}).join("")}</div>
  <div class="legend"><span><i style="background:var(--air)"></i>Cravings beaten</span><span><i style="background:var(--ember)"></i>Smoked</span></div>`;
  if(logged>=3){
    const P=["Night","Morning","Afternoon","Evening"],cnt=[0,0,0,0];
    [...S.cravings,...S.slips].forEach(x=>{const h=new Date(x.t).getHours();cnt[h<5?0:h<12?1:h<17?2:h<22?3:0]++});
    const top=cnt.indexOf(Math.max(...cnt));
    const topTrig=keys[0];
    html+=`<p class="insight">Most urges hit in the <b>${P[top].toLowerCase()}</b>, and <b>${T[topTrig].n.toLowerCase()}</b> is your biggest trigger. Plan for that moment in advance.</p>`;
  } else html+=`<p class="insight">Bars fill as you log. After a few entries you'll see when your urges peak.</p>`;
  $("#trig").innerHTML=html;
}

function renderLog(){
  const all=[...S.cravings.map(x=>({...x,type:"c"})),...S.slips.map(x=>({...x,type:"s"}))].sort((a,b)=>b.t-a.t).slice(0,8);
  if(!all.length){$("#log").innerHTML=`<p class="empty">Nothing logged yet. Tap "I'm craving" when an urge hits; riding it out counts.</p>`;return}
  $("#log").innerHTML=all.map(x=>{const dt=new Date(x.t);const when=dt.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+", "+dt.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
    return `<div class="entry"><span>${T[x.trig]?T[x.trig].n:"Other"}<br><span class="hint">${when}${x.type==="c"&&x.int?` · urge ${x.int}/5`:""}${x.type==="s"&&x.n>1?` · ${x.n} cigs`:""}</span></span>${x.type==="c"?'<span class="pill ok">Beaten</span>':'<span class="pill bad">Smoked</span>'}</div>`}).join("");
}

/* ---------- sheets ---------- */
let timerInt=null;
function openSheet(html){
  closeSheet();
  const sc=document.createElement("div");sc.className="scrim";sc.id="scrim";
  sc.innerHTML=`<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
  sc.onclick=e=>{if(e.target===sc)closeSheet()};
  document.body.appendChild(sc);
  return sc.firstChild;
}
function closeSheet(){clearInterval(timerInt);const s=$("#scrim");if(s)s.remove()}
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeSheet()});
function toast(msg){const t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}

function trigChips(sel,cls=""){
  const order=[...S.setup.triggers,...TRIGGERS.map(t=>t.k).filter(k=>!S.setup.triggers.includes(k))];
  return `<div class="chips" id="pick">${order.map(k=>`<button type="button" class="chip ${cls}" data-k="${k}" aria-pressed="${k===sel}">${T[k].n}</button>`).join("")}</div>`;
}
function bindSingle(id,onPick){$(id).onclick=e=>{const b=e.target.closest("button");if(!b)return;$(id).querySelectorAll("button").forEach(x=>x.setAttribute("aria-pressed",x===b));onPick&&onPick(b)}}
function guessTrigger(){
  const h=new Date().getHours(),st=S.setup.triggers;
  const g=h<10?"wake":h>=13&&h<15?"meal":h>=22?"bed":null;
  return g&&st.includes(g)?g:(st[0]||"stress");
}

function craving(){
  let trig=guessTrigger(),intensity=3,left=600;
  const sh=openSheet(`
    <h3>Ride it out</h3>
    <p class="hint" style="margin-top:-8px">Most urges fade within 10 minutes. Stay with this screen.</p>
    <svg class="ring" width="200" height="200" viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="88" stroke="var(--air-soft)" stroke-width="12" fill="none"/><circle id="arc" cx="100" cy="100" r="88" stroke="var(--air)" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="552.9" stroke-dashoffset="0" transform="rotate(-90 100 100)"/><text id="tTxt" x="100" y="112" text-anchor="middle" font-family="DM Mono, monospace" font-size="38" fill="var(--ink)">10:00</text></svg>
    <div class="tip" id="tip">${T[trig].tip}</div>
    <div class="field"><span class="label">What set it off?</span>${trigChips(trig)}</div>
    <div class="field"><span class="label">How strong?</span><div class="range" id="int">${[1,2,3,4,5].map(n=>`<button type="button" aria-pressed="${n===3}" data-n="${n}">${n}</button>`).join("")}</div></div>
    <div class="btnrow"><button class="btn air" id="beat">Urge passed</button><button class="btn slip" id="gaveIn">I smoked</button></div>
  `);
  bindSingle("#pick",b=>{trig=b.dataset.k;$("#tip").textContent=T[trig].tip});
  bindSingle("#int",b=>intensity=+b.dataset.n);
  const upd=()=>{left=Math.max(0,left-1);$("#tTxt").textContent=`${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`;
    $("#arc").setAttribute("stroke-dashoffset",552.9*(1-left/600));
    if(left===0){clearInterval(timerInt);$("#tTxt").textContent="Done";$("#tip").textContent="10 minutes down. That urge is weaker than it was. Log the win."}};
  timerInt=setInterval(upd,1000);
  $("#beat").onclick=()=>{S.cravings.push({t:Date.now(),trig,int:intensity,ok:true});trim();save();closeSheet();home();toast("Craving beaten. Logged.")};
  $("#gaveIn").onclick=()=>slipSheet(trig);
}

function slipSheet(pre){
  let trig=pre||guessTrigger(),n=1;
  openSheet(`
    <h3>Log a cigarette</h3>
    <p style="margin:-6px 0 0;color:var(--muted)">A slip is data, not failure. Your best streak and savings stay. Your current streak restarts now.</p>
    <div class="field"><span class="label">What set it off?</span>${trigChips(trig,"ember")}</div>
    <div class="field"><span class="label">How many?</span><div class="stepper"><button type="button" id="minus" aria-label="Fewer">−</button><span class="num" id="cnt">1</span><button type="button" id="plus" aria-label="More">+</button></div></div>
    <div class="btnrow"><button class="btn ghost" id="cancel">Cancel</button><button class="btn slip" id="confirm" style="background:var(--ember);color:var(--surface)">Log and restart</button></div>
  `);
  bindSingle("#pick",b=>trig=b.dataset.k);
  $("#minus").onclick=()=>{n=Math.max(1,n-1);$("#cnt").textContent=n};
  $("#plus").onclick=()=>{n=Math.min(40,n+1);$("#cnt").textContent=n};
  $("#cancel").onclick=closeSheet;
  $("#confirm").onclick=()=>{const now=Date.now();S.longest=Math.max(S.longest||0,now-S.streakStart);S.streakStart=now;S.slips.push({t:now,trig,n});trim();save();closeSheet();home();toast("Logged. New streak starts now.")};
}

function settings(){
  const sh=openSheet(`
    <h3>Settings</h3>
    <div class="row2">
      <div class="field"><label class="label" for="sPer">Cigs a day (before)</label><input id="sPer" type="number" min="1" max="80" value="${S.setup.perDay}"></div>
      <div class="field"><label class="label" for="sCost">Cost per stick (₹)</label><input id="sCost" type="number" min="1" step="0.5" value="${S.setup.cost}"></div>
    </div>
    <div class="field"><span class="label">Usual triggers</span><div class="chips" id="sTrig">${TRIGGERS.map(t=>`<button type="button" class="chip" data-k="${t.k}" aria-pressed="${S.setup.triggers.includes(t.k)}">${t.n}</button>`).join("")}</div></div>
    <div class="field"><label class="label" for="sWhy">Your reason</label><textarea id="sWhy" rows="2">${esc(S.setup.why)}</textarea></div>
    <div class="btnrow"><button class="btn ghost" id="sCancel">Cancel</button><button class="btn primary" id="sSave">Save</button></div>
    <div style="border-top:1px solid var(--line);padding-top:14px;display:flex;flex-direction:column;gap:10px">
      <span class="label">Start over</span><span class="hint">Erases your streaks, savings and log.</span>
      <div id="resetBox"><button class="danger" id="reset">Erase everything</button></div>
    </div>`);
  $("#sTrig").onclick=e=>{const b=e.target.closest(".chip");if(b)b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")!=="true")};
  $("#sCancel").onclick=closeSheet;
  $("#sSave").onclick=()=>{S.setup.perDay=+$("#sPer").value||S.setup.perDay;S.setup.cost=+$("#sCost").value||S.setup.cost;
    S.setup.triggers=[...document.querySelectorAll('#sTrig [aria-pressed="true"]')].map(b=>b.dataset.k);S.setup.why=$("#sWhy").value.trim();save();closeSheet();home();toast("Settings saved")};
  $("#reset").onclick=()=>{$("#resetBox").innerHTML=`<div class="btnrow"><button class="btn ghost" id="rNo">Keep my data</button><button class="danger" id="rYes">Yes, erase</button></div>`;
    $("#rNo").onclick=()=>{$("#resetBox").innerHTML='<button class="danger" id="reset">Erase everything</button>';closeSheet();settings()};
    $("#rYes").onclick=()=>{S=null;try{localStorage.removeItem(LS)}catch(e){};if(ref)saving=saving.then(()=>ref.delete()).catch(()=>{});closeSheet();onboarding()}};
}

/* ---------- boot ---------- */
S=readLocal();
if(S) home(); else onboarding();
(async()=>{
  try{
    db=supabase;
    let {data:{session}}=await db.auth.getSession();
    if(!session){const r=await db.auth.signInAnonymously(); if(r.error) throw r.error; session=r.data.session;}
    const id=session.user.id;
    const tbl=()=>db.from("quit_state");
    ref={
      async get(){const {data,error}=await tbl().select("data").eq("user_id",id).maybeSingle(); if(error) throw error; return {exists:!!data,data:()=>data&&data.data};},
      async set(body){const {error}=await tbl().upsert({user_id:id,data:body,updated_at:new Date().toISOString()}); if(error) throw error;},
      async delete(){const {error}=await tbl().delete().eq("user_id",id); if(error) throw error;}
    };
    const snap=await ref.get();
    if(snap.exists){
      const remote=JSON.parse(JSON.stringify(snap.data()));
      const onForm=!!$("#onbForm");
      S=remote;writeLocal();
      if(!$("#scrim")) (onForm||true)&&home();
    } else if(S){ await ref.set(JSON.parse(JSON.stringify(S))); }
    const sy=$("#sync");if(sy)sy.textContent="Saved to your account";
  }catch(e){ ref=null; }
})();
}
