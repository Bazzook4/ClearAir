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
/* Persistence: Supabase is the source of truth, keyed to the signed-in account.
   localStorage keeps a per-account copy so the app opens instantly and survives offline;
   unsynced changes are flagged and pushed as soon as the connection is back. */
const LEGACY="clear-air-v1";
let LS=LEGACY, uid=null, email="", S=null, ref=null, saveTimer=null, dirty=false, pushing=false, lastSync=0, syncState="ok";
const app=document.getElementById("app");
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const rupee=n=>"₹"+Math.round(n).toLocaleString("en-IN");

function readLocal(k=LS){try{const r=localStorage.getItem(k);return r?JSON.parse(r):null}catch(e){return null}}
function writeLocal(){if(!uid)return;try{localStorage.setItem(LS,JSON.stringify(S))}catch(e){}}
function setDirty(v){dirty=v;try{v?localStorage.setItem(LS+"-dirty","1"):localStorage.removeItem(LS+"-dirty")}catch(e){}}
function syncText(){return syncState==="err"?"Not synced yet. Saved on this device and will retry.":`Saved to your account${email?" ("+esc(email)+")":""}`}
function setSync(st){syncState=st;const el=$("#sync");if(el){el.innerHTML=syncText();el.classList.toggle("warn",st==="err")}}
function save(){writeLocal();setDirty(true);clearTimeout(saveTimer);saveTimer=setTimeout(push,400)}
async function push(){
  if(!ref||!dirty||!S) return;
  if(pushing){clearTimeout(saveTimer);saveTimer=setTimeout(push,800);return}
  pushing=true;setDirty(false);
  try{lastSync=await ref.set(JSON.parse(JSON.stringify(S)));setSync("ok")}
  catch(e){setDirty(true);setSync("err")}
  pushing=false;
}
function trim(){S.cravings=S.cravings.slice(-400);S.slips=S.slips.slice(-400)}

/* ---------- derived numbers ---------- */
function streakMs(){return Math.max(0,Date.now()-S.streakStart)}
function bestMs(){return Math.max(S.longest||0,streakMs())}
function totals(){
  const days=(Date.now()-S.quitStart)/864e5;
  const smoked=S.slips.reduce((a,s)=>a+(s.n||1),0);
  const avoided=Math.max(0,Math.floor(days*S.setup.perDay)-smoked);
  return {avoided,saved:avoided*S.setup.cost,smoked,beaten:S.cravings.filter(c=>c.ok).length};
}
function fmtDur(ms){const d=Math.floor(ms/864e5);if(d>=1)return d+"d";const h=Math.floor(ms/36e5);if(h>=1)return h+"h";return Math.floor(ms/6e4)+"m"}
function fmtLeft(ms){const d=Math.floor(ms/864e5),h=Math.floor(ms%864e5/36e5),m=Math.ceil(ms%36e5/6e4);return d?`${d}d ${h}h`:h?`${h}h ${m}m`:`${m}m`}
function nextMile(ms){
  const i=MILES.findIndex(([at])=>ms<at);if(i<0)return null;
  const prev=i?MILES[i-1][0]:0,[at,w,txt]=MILES[i];
  return {txt,left:at-ms,pct:Math.min(100,(ms-prev)/(at-prev)*100)};
}

/* ---------- views ---------- */
const LOGO=`<svg width="28" height="28" viewBox="0 0 30 30" aria-hidden="true"><circle cx="15" cy="15" r="14" fill="var(--air)"/><path d="M8 18c3-4 6 2 9-2s4-5 6-3" stroke="var(--surface)" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>`;
function header(){return `<header><div class="brand">${LOGO}<h1>Clear Air</h1></div>${S?'<button class="iconbtn" id="settingsBtn" aria-label="Settings"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg></button>':""}</header>`}

/* Onboarding: one question per screen, defaults pre-filled, optional steps skippable. */
function onboarding(){
  const d={start:"now",perDay:10,cost:20,triggers:[],why:""};
  let step=0;
  const steps=[
    ()=>`<h2>When was your last cigarette?</h2>
      <div class="choices" id="startChips">${[["now","Just now"],["morning","This morning"],["yesterday","Yesterday"]].map(([k,n])=>`<button type="button" class="choice" data-s="${k}">${n}</button>`).join("")}</div>`,
    ()=>`<h2>How much did you usually smoke?</h2>
      <p class="intro">This powers your savings counter. A rough guess is fine.</p>
      <div class="field"><span class="label">Cigarettes a day</span>${stepper("perDay",d.perDay)}</div>
      <div class="field"><span class="label">Cost per cigarette (₹)</span>${stepper("cost",d.cost)}</div>
      <button class="btn primary" id="next">Next</button>`,
    ()=>`<h2>When do urges usually hit?</h2>
      <p class="intro">Tap any that fit. We'll have a tip ready for those moments.</p>
      <div class="chips" id="trigChips">${TRIGGERS.map(t=>`<button type="button" class="chip" data-k="${t.k}" aria-pressed="${d.triggers.includes(t.k)}">${t.n}</button>`).join("")}</div>
      <div class="btnrow"><button class="btn ghost" id="skip">Skip</button><button class="btn primary" id="next">Next</button></div>`,
    ()=>`<h2>One reason you're doing this</h2>
      <p class="intro">Short and personal works best. You'll see it every time you open the app.</p>
      <textarea id="why" rows="2" maxlength="140" placeholder="e.g. Play football with my kid without getting winded">${esc(d.why)}</textarea>
      <div class="btnrow"><button class="btn ghost" id="skip">Skip</button><button class="btn primary" id="next">Start</button></div>`
  ];
  const finish=()=>{
    const now=new Date();let start=now.getTime();
    if(d.start==="morning"){const m=new Date(now);m.setHours(8,0,0,0);start=Math.min(start,m.getTime())}
    if(d.start==="yesterday"){const y=new Date(now);y.setDate(y.getDate()-1);y.setHours(22,0,0,0);start=y.getTime()}
    S={v:1,setup:{perDay:d.perDay,cost:d.cost,triggers:d.triggers,why:d.why},quitStart:start,streakStart:start,longest:0,cravings:[],slips:[]};
    save();home();toast("Your streak has started");
  };
  const go=n=>{
    if(n>=steps.length) return finish();
    step=n;
    app.innerHTML=header()+`<div class="onb">
      <div class="steps" aria-label="Step ${step+1} of ${steps.length}">${steps.map((_,i)=>`<i class="${i<=step?"on":""}"></i>`).join("")}</div>
      ${step?'<button class="link back" id="back">← Back</button>':""}
      ${steps[step]()}</div>`;
    if($("#back")) $("#back").onclick=()=>go(step-1);
    if(step===0) $("#startChips").onclick=e=>{const b=e.target.closest(".choice");if(b){d.start=b.dataset.s;go(1)}};
    if(step===1){bindStepper("perDay",v=>d.perDay=v,1,80);bindStepper("cost",v=>d.cost=v,1,500)}
    if(step===2) $("#trigChips").onclick=e=>{const b=e.target.closest(".chip");if(!b)return;const on=b.getAttribute("aria-pressed")!=="true";b.setAttribute("aria-pressed",on);
      d.triggers=on?[...d.triggers,b.dataset.k]:d.triggers.filter(k=>k!==b.dataset.k)};
    if(step===3){const w=$("#why");w.oninput=()=>d.why=w.value.trim()}
    if($("#skip")) $("#skip").onclick=()=>{if(step===2)d.triggers=[];if(step===3)d.why="";go(step+1)};
    if($("#next")) $("#next").onclick=()=>go(step+1);
  };
  go(0);
}
function stepper(id,v){return `<div class="stepper"><button type="button" data-d="-1" aria-label="Less">−</button><span class="num" id="${id}">${v}</span><button type="button" data-d="1" aria-label="More">+</button></div>`}
function bindStepper(id,set,min,max){const el=$("#"+id),box=el.parentNode;box.onclick=e=>{const b=e.target.closest("button");if(!b)return;const v=Math.min(max,Math.max(min,+el.textContent+ +b.dataset.d));el.textContent=v;set(v)}}

/* Home: one number, one action. Everything else is folded under "Your progress". */
let milesDone=-1;
function home(){
  milesDone=-1;
  app.innerHTML=header()+`
  <div class="hero" aria-live="polite">
    <span class="label">Smoke-free for</span>
    <div class="days"><span id="dNum">0</span><small id="dLbl">days</small></div>
    <div class="clock" id="clock"></div>
    <div class="next" id="next"></div>
  </div>
  ${S.setup.why?`<p class="why">${esc(S.setup.why)}</p>`:""}
  <button class="btn primary big" id="craveBtn">I'm having a craving</button>
  <p class="summary" id="sum"></p>
  <button class="link center" id="slipBtn">I smoked. Log it</button>
  <details class="more" id="more"${moreOpen?" open":""}><summary>Your progress</summary>
    <div class="more-body">
      <section><h2>Last 14 days</h2><div class="strip" id="strip"></div>
        <div class="legend"><span><i style="background:var(--air)"></i>Smoke-free</span><span><i style="background:var(--ember)"></i>Smoked</span></div></section>
      <section><h2>Patterns</h2><div id="trig"></div></section>
      <section><h2>Body recovery</h2><div class="miles" id="miles"></div><span class="hint">Commonly cited public-health milestones; individual recovery varies.</span></section>
      <section><h2>Recent</h2><div class="log" id="log"></div></section>
    </div>
  </details>
  <p class="sync${syncState==="err"?" warn":""}" id="sync">${syncText()}</p>`;
  $("#craveBtn").onclick=craving;
  $("#slipBtn").onclick=()=>slipSheet();
  $("#settingsBtn").onclick=settings;
  $("#more").ontoggle=e=>{moreOpen=e.target.open;try{localStorage.setItem(LS+"-more",moreOpen?"1":"")}catch(_){}};
  renderStrip();renderTriggers();renderLog();tick();
}
let moreOpen=false;try{moreOpen=!!localStorage.getItem(LS+"-more")}catch(e){}

function tick(){
  if(!$("#clock")) return;
  const ms=streakMs(),d=Math.floor(ms/864e5);
  $("#dNum").textContent=d;$("#dLbl").textContent=d===1?"day":"days";
  const h=Math.floor(ms%864e5/36e5),m=Math.floor(ms%36e5/6e4);
  $("#clock").textContent=`${h}h ${m}m`;
  const nm=nextMile(ms);
  $("#next").innerHTML=nm?`<div class="next-txt"><span>Next: ${nm.txt.replace(/\.$/,"")}</span><span class="num">in ${fmtLeft(nm.left)}</span></div><div class="meter"><span style="width:${nm.pct}%"></span></div>`:`<div class="next-txt">Every recovery milestone reached.</div>`;
  const t=totals();
  $("#sum").innerHTML=`<b>${rupee(t.saved)}</b> saved · <b>${t.avoided}</b> not smoked${t.beaten?` · <b>${t.beaten}</b> urge${t.beaten>1?"s":""} beaten`:""}`;
  const done=MILES.filter(([at])=>ms>=at).length;
  if(done!==milesDone){milesDone=done;
    $("#miles").innerHTML=MILES.map(([at,w,txt])=>`<div class="mile ${ms>=at?"done":""}"><span class="tick"></span><span class="what">${txt}</span><span class="when">${w}</span></div>`).join("")}
}
setInterval(tick,1000);

function renderStrip(){
  const out=[];const today=new Date();today.setHours(0,0,0,0);
  for(let i=13;i>=0;i--){
    const d=new Date(today);d.setDate(d.getDate()-i);const a=d.getTime(),b=a+864e5;
    let cls="";
    if(S.slips.some(s=>s.t>=a&&s.t<b)) cls="slip";
    else if(b>S.quitStart) cls="free";
    if(i===0) cls+=" today";
    out.push(`<div class="day"><span class="dot ${cls}"></span>${d.getDate()}</div>`);
  }
  $("#strip").innerHTML=out.join("");
}

function renderTriggers(){
  const c={},s={};
  S.cravings.forEach(x=>c[x.trig]=(c[x.trig]||0)+1);
  S.slips.forEach(x=>s[x.trig]=(s[x.trig]||0)+1);
  const keys=[...new Set([...Object.keys(c),...Object.keys(s)])].filter(k=>T[k]);
  const logged=S.cravings.length+S.slips.length;
  if(logged<3||!keys.length){$("#trig").innerHTML=`<p class="empty">After a few logged urges you'll see when they peak and what sets them off.</p>`;return}
  keys.sort((a,b)=>((c[b]||0)+(s[b]||0))-((c[a]||0)+(s[a]||0)));
  const top5=keys.slice(0,5),max=Math.max(1,...top5.map(k=>(c[k]||0)+(s[k]||0)));
  const P=["night","morning","afternoon","evening"],cnt=[0,0,0,0];
  [...S.cravings,...S.slips].forEach(x=>{const h=new Date(x.t).getHours();cnt[h<5?0:h<12?1:h<17?2:h<22?3:0]++});
  $("#trig").innerHTML=`<p class="insight">Urges peak in the <b>${P[cnt.indexOf(Math.max(...cnt))]}</b>. Biggest trigger: <b>${T[keys[0]].n.toLowerCase()}</b>.</p>
  <p class="tip">${T[keys[0]].tip}</p>
  <div class="bars">${top5.map(k=>{const cc=c[k]||0,ss=s[k]||0;return `<div class="bar"><span>${T[k].n}</span><span class="track"><span class="c" style="width:${cc/max*100}%"></span><span class="s" style="width:${ss/max*100}%"></span></span><span class="n">${cc+ss}</span></div>`}).join("")}</div>
  <div class="legend"><span><i style="background:var(--air)"></i>Beaten</span><span><i style="background:var(--ember)"></i>Smoked</span></div>`;
}

function renderLog(){
  const all=[...S.cravings.map(x=>({...x,type:"c"})),...S.slips.map(x=>({...x,type:"s"}))].sort((a,b)=>b.t-a.t).slice(0,6);
  if(!all.length){$("#log").innerHTML=`<p class="empty">Nothing yet. Riding out an urge counts as a win.</p>`;return}
  $("#log").innerHTML=all.map(x=>{const dt=new Date(x.t);const when=dt.toLocaleDateString("en-IN",{day:"numeric",month:"short"})+", "+dt.toLocaleTimeString("en-IN",{hour:"numeric",minute:"2-digit"});
    return `<div class="entry"><span>${T[x.trig]?T[x.trig].n:"Craving"}<br><span class="hint">${when}${x.type==="s"&&x.n>1?` · ${x.n} cigs`:""}</span></span>${x.type==="c"?'<span class="pill ok">Beaten</span>':'<span class="pill bad">Smoked</span>'}</div>`}).join("");
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
function toast(msg){const t=document.createElement("div");t.className="toast";t.setAttribute("role","status");t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2600)}

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

/* Quick, hands-busy ideas. Novelty helps hold attention through the peak of an urge. */
const IDEAS=[
 "Drink a full glass of cold water, slowly.",
 "Name 5 things you can see, 4 you can hear, 3 you can touch.",
 "Walk to another room, or outside, for two minutes.",
 "Text someone: \"Craving right now, distract me.\"",
 "Chew gum, a clove, or some saunf.",
 "Do 15 squats or push-ups against the wall.",
 "Splash cold water on your face and wrists.",
 "Put on one song you love and just listen."
];

/* Craving: help first, questions after. No form while the urge is strongest. */
function craving(){
  const DUR=300;let left=DUR,ideaI=0,phase=0;
  const trig0=guessTrigger(),pool=[T[trig0].tip,...IDEAS];
  openSheet(`
    <h3>Let's ride this out</h3>
    <p class="hint lead">Urges rise, peak, then fade. Usually within a few minutes. You don't have to fight it. Just wait it out with me.</p>
    <div class="breath" aria-hidden="true"><div class="orb"></div><span class="t num" id="tTxt">5:00</span></div>
    <p class="cue" id="cue" aria-live="polite">Breathe in…</p>
    <div class="tip idea"><span id="tip">${pool[0]}</span><button class="link" id="another">Another idea</button></div>
    <button class="btn air big" id="beat">The urge passed</button>
    <button class="link center" id="gaveIn">I smoked</button>
  `);
  const upd=()=>{left=Math.max(0,left-1);phase=(phase+1)%10;
    $("#cue").textContent=left===0?"Time's up. How do you feel?":phase<4?"Breathe in…":"Breathe out, slowly…";
    $("#tTxt").textContent=left?`${Math.floor(left/60)}:${String(left%60).padStart(2,"0")}`:"✓";
    if(left===0)clearInterval(timerInt)};
  timerInt=setInterval(upd,1000);
  $("#another").onclick=()=>{ideaI=(ideaI+1)%pool.length;$("#tip").textContent=pool[ideaI]};
  $("#beat").onclick=()=>{clearInterval(timerInt);afterWin(trig0)};
  $("#gaveIn").onclick=()=>slipSheet(trig0);
}
function afterWin(guess){
  const n=S.cravings.filter(c=>c.ok).length+1;
  const sh=$(".sheet");
  sh.innerHTML=`<div class="win"><div class="badge" aria-hidden="true">✓</div><h3>You did it.</h3><p class="hint">That's urge #${n} beaten. Each one makes the next a little easier.</p></div>
    <div class="field"><span class="label">What set it off? <span class="opt">Optional</span></span>${trigChips(null)}</div>
    <button class="btn ghost" id="skip">Done</button>`;
  const log=trig=>{S.cravings.push({t:Date.now(),trig,ok:true});trim();save();closeSheet();home();toast("Win logged")};
  $("#pick").onclick=e=>{const b=e.target.closest("button");if(b)log(b.dataset.k)};
  $("#skip").onclick=()=>log(null);
}

/* Slip: no shame. Frame it as information so one cigarette doesn't snowball into "I've failed". */
function slipSheet(pre){
  let trig=pre||guessTrigger(),n=1;
  openSheet(`
    <h3>That's okay. Let's note it.</h3>
    <p class="hint lead">One cigarette doesn't undo your progress. Your savings and best streak stay. The timer just starts fresh.</p>
    <div class="field"><span class="label">What set it off?</span>${trigChips(trig,"ember")}</div>
    <div class="field"><span class="label">How many?</span>${stepper("cnt",1)}</div>
    <button class="btn primary big" id="confirm">Log it and start fresh</button>
    <button class="link center" id="cancel">Cancel</button>
  `);
  bindSingle("#pick",b=>trig=b.dataset.k);
  bindStepper("cnt",v=>n=v,1,40);
  $("#cancel").onclick=closeSheet;
  $("#confirm").onclick=()=>{const now=Date.now();S.longest=Math.max(S.longest||0,now-S.streakStart);S.streakStart=now;S.slips.push({t:now,trig,n});trim();save();closeSheet();home();toast("Logged. Fresh start from now.")};
}

function settings(){
  openSheet(`
    <h3>Settings</h3>
    <div class="field"><span class="label">Your reason</span><textarea id="sWhy" rows="2" maxlength="140">${esc(S.setup.why)}</textarea></div>
    <div class="row2">
      <div class="field"><span class="label">Cigs a day (before)</span>${stepper("sPer",S.setup.perDay)}</div>
      <div class="field"><span class="label">₹ per cigarette</span>${stepper("sCost",S.setup.cost)}</div>
    </div>
    <div class="field"><span class="label">Usual triggers</span><div class="chips" id="sTrig">${TRIGGERS.map(t=>`<button type="button" class="chip" data-k="${t.k}" aria-pressed="${S.setup.triggers.includes(t.k)}">${t.n}</button>`).join("")}</div></div>
    <div class="btnrow"><button class="btn ghost" id="sCancel">Cancel</button><button class="btn primary" id="sSave">Save</button></div>
    <div class="account"><span class="hint">Signed in as <b>${esc(email)}</b></span><button class="link" id="signOut">Sign out</button></div>
    <div class="danger-zone"><div id="resetBox"><button class="link danger-link" id="reset">Erase everything and start over</button></div></div>`);
  let per=S.setup.perDay,cost=S.setup.cost;
  bindStepper("sPer",v=>per=v,1,80);bindStepper("sCost",v=>cost=v,1,500);
  $("#sTrig").onclick=e=>{const b=e.target.closest(".chip");if(b)b.setAttribute("aria-pressed",b.getAttribute("aria-pressed")!=="true")};
  $("#sCancel").onclick=closeSheet;
  $("#signOut").onclick=async()=>{await push();closeSheet();await supabase.auth.signOut()};
  $("#sSave").onclick=()=>{S.setup.perDay=per;S.setup.cost=cost;
    S.setup.triggers=[...document.querySelectorAll('#sTrig [aria-pressed="true"]')].map(b=>b.dataset.k);S.setup.why=$("#sWhy").value.trim();save();closeSheet();home();toast("Saved")};
  $("#reset").onclick=()=>{$("#resetBox").innerHTML=`<p class="hint">This erases your streaks, savings and log. It can't be undone.</p><div class="btnrow"><button class="btn ghost" id="rNo">Keep my data</button><button class="btn danger" id="rYes">Erase</button></div>`;
    $("#rNo").onclick=()=>{closeSheet();settings()};
    $("#rYes").onclick=async()=>{S=null;clearTimeout(saveTimer);setDirty(false);try{localStorage.removeItem(LS)}catch(e){};closeSheet();onboarding();try{await ref.delete()}catch(e){toast("Couldn't erase your account copy. Try again when online.")}}};
}

/* ---------- sign in (email code, no password) ---------- */
function signIn(prefill=""){
  app.innerHTML=header()+`<div class="onb">
    <h2>Keep your progress safe</h2>
    <p class="intro">Sign in so your streak lives in your account. Changing phones or clearing your browser won't lose it.</p>
    <div id="gWrap"></div>
    <form id="emailForm" class="stack">
      <label class="label" for="email">Email</label>
      <input id="email" class="input" type="email" autocomplete="email" inputmode="email" required placeholder="you@example.com" value="${esc(prefill)}">
      <button class="btn primary big" type="submit" id="send">Email me a code</button>
      <p class="hint err" id="err" role="alert"></p>
    </form>
    <p class="hint">No password. New here? This creates your account.</p></div>`;
  googleButton();
  $("#emailForm").onsubmit=async e=>{
    e.preventDefault();const em=$("#email").value.trim().toLowerCase();if(!em)return;
    const btn=$("#send");btn.disabled=true;btn.textContent="Sending…";
    const {error}=await supabase.auth.signInWithOtp({email:em,options:{shouldCreateUser:true,emailRedirectTo:location.origin+"/auth/callback"}});
    if(error){btn.disabled=false;btn.textContent="Email me a code";$("#err").textContent=authMsg(error);return}
    codeScreen(em);
  };
}
/* Google button appears only once the provider is switched on in Supabase, so it is never a dead end. */
let googleOn=null;
async function googleButton(){
  if(googleOn===null){
    try{const r=await fetch(process.env.NEXT_PUBLIC_SUPABASE_URL+"/auth/v1/settings",{headers:{apikey:process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}});
      googleOn=!!(await r.json()).external?.google}catch(e){googleOn=false}
  }
  const w=$("#gWrap");if(!googleOn||!w)return;
  w.innerHTML=`<button class="btn ghost big google" id="google"><svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continue with Google</button><div class="or"><span>or use email</span></div>`;
  $("#google").onclick=async()=>{
    const {error}=await supabase.auth.signInWithOAuth({provider:"google",options:{redirectTo:location.origin+"/auth/callback"}});
    if(error)$("#err").textContent=authMsg(error);
  };
}
function codeScreen(em){
  app.innerHTML=header()+`<div class="onb">
    <h2>Check your email</h2>
    <p class="intro">We sent a code to <b>${esc(em)}</b>. Type it below, or tap the link in the email on this device.</p>
    <form id="codeForm" class="stack">
      <label class="label" for="code">Code</label>
      <input id="code" class="input code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" required placeholder="123456">
      <button class="btn primary big" type="submit" id="verify">Sign in</button>
      <p class="hint err" id="err" role="alert"></p>
    </form>
    <div class="row-links"><button class="link" id="resend" disabled>Resend in 60s</button><button class="link" id="other">Use a different email</button></div></div>`;
  $("#code").focus();
  let wait=60;const cd=setInterval(()=>{const r=$("#resend");if(!r){clearInterval(cd);return}wait--;if(wait<=0){clearInterval(cd);r.disabled=false;r.textContent="Resend code"}else r.textContent=`Resend in ${wait}s`},1000);
  $("#other").onclick=()=>{clearInterval(cd);signIn(em)};
  $("#resend").onclick=async()=>{const {error}=await supabase.auth.signInWithOtp({email:em,options:{emailRedirectTo:location.origin+"/auth/callback"}});
    if(error){$("#err").textContent=authMsg(error);return}clearInterval(cd);codeScreen(em);toast("New code sent")};
  $("#codeForm").onsubmit=async e=>{
    e.preventDefault();const token=$("#code").value.replace(/\D/g,"");if(token.length<6){$("#err").textContent="Enter the full code from the email.";return}
    const btn=$("#verify");btn.disabled=true;btn.textContent="Checking…";
    const {error}=await supabase.auth.verifyOtp({email:em,token,type:"email"});
    if(error){btn.disabled=false;btn.textContent="Sign in";$("#err").textContent=/expired|invalid/i.test(error.message)?"That code didn't work. It may have expired. Try again or resend.":authMsg(error);return}
    clearInterval(cd); // onAuthStateChange takes it from here
  };
}
function authMsg(e){return /rate|too many|security purposes/i.test(e.message||"")?"Too many attempts. Please wait a minute and try again.":(e.message||"Something went wrong. Check your connection and try again.")}

/* ---------- boot ---------- */
function loading(msg="Opening your streak…"){app.innerHTML=header()+`<p class="empty">${msg}</p>`}
async function start(user){
  uid=user.id;email=user.email||"";LS=LEGACY+":"+uid;
  const tbl=()=>supabase.from("quit_state");
  ref={
    async get(){const {data,error}=await tbl().select("data,updated_at").eq("user_id",uid).maybeSingle();if(error)throw error;return data?{data:data.data,u:Date.parse(data.updated_at)}:null},
    async set(body){const {data,error}=await tbl().upsert({user_id:uid,data:body,updated_at:new Date().toISOString()}).select("updated_at").single();if(error)throw error;return Date.parse(data.updated_at)},
    async delete(){const {error}=await tbl().delete().eq("user_id",uid);if(error)throw error}
  };
  // Local copy for this account, or data saved on this device before accounts existed.
  const legacy=readLocal(LEGACY);
  S=readLocal(LS);dirty=false;try{dirty=!!localStorage.getItem(LS+"-dirty")}catch(e){}
  if(S) home(); else loading();
  let remote;
  try{remote=await ref.get()}
  catch(e){setSync("err");if(!S){loading("Can't reach the server. Check your connection.");setTimeout(()=>uid===user.id&&start(user),5000)}return}
  if(uid!==user.id) return;
  if(S&&dirty){await push()}                                   // unsynced local changes win
  else if(remote){S=remote.data;lastSync=remote.u;writeLocal()} // account copy wins
  else if(S||legacy){S=S||legacy;setDirty(true);await push()}  // first sign-in: upload what this device had
  if(legacy&&!dirty){try{localStorage.removeItem(LEGACY)}catch(e){}}
  setSync(dirty?"err":"ok");
  if(!$("#scrim")) S?home():onboarding();
}
function stop(){clearTimeout(saveTimer);uid=null;email="";ref=null;S=null;LS=LEGACY;dirty=false;closeSheet();signIn()}

// Pull changes made on another device when the app comes back into view; push anything pending.
document.addEventListener("visibilitychange",async()=>{
  if(document.visibilityState!=="visible"||!ref) return;
  if(dirty) return push();
  try{const r=await ref.get();if(r&&r.u>lastSync){S=r.data;lastSync=r.u;writeLocal();if(!$("#scrim"))home()}}catch(e){}
});
window.addEventListener("online",()=>push());

if(new URLSearchParams(location.search).has("auth_error")){history.replaceState(null,"","/");setTimeout(()=>toast("That link expired or was opened in another browser. Use the code instead."),300)}
loading();
supabase.auth.onAuthStateChange((event,session)=>{
  // Defer: Supabase recommends not awaiting its own calls inside this callback.
  setTimeout(()=>{
    if(session&&session.user&&session.user.id!==uid) start(session.user);
    else if(!session&&(event==="SIGNED_OUT"||event==="INITIAL_SESSION")) {if(uid||event==="INITIAL_SESSION")stop()}
  },0);
});
}
