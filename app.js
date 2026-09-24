const sb=supabase.createClient(APP_CONFIG.SUPABASE_URL,APP_CONFIG.SUPABASE_KEY);
const $main=document.getElementById("main"),$who=document.getElementById("who");
const S={user:null,role:"player",chars:[],cur:null,tab:"core",notes:null};
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const mod=v=>Math.floor((v-10)/2),sg=n=>(n>=0?"+":"")+n;
const SK=[["Acrobatics","dex"],["Animal Handling","wis"],["Arcana","int"],["Athletics","str"],["Deception","cha"],["History","int"],["Insight","wis"],["Intimidation","cha"],["Investigation","int"],["Medicine","wis"],["Nature","int"],["Perception","wis"],["Performance","cha"],["Persuasion","cha"],["Religion","int"],["Sleight of Hand","dex"],["Stealth","dex"],["Survival","wis"]];
const AB=["str","dex","con","int","wis","cha"];
const canEdit=c=>S.role==="dm"||c.owner===S.user.id;
const table=(head,rows)=>`<table><thead><tr>${head.map(h=>`<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(x=>`<td>${esc(x)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
const pre=t=>`<p class="pre">${esc(t)}</p>`;

function login(msg=""){
 $who.innerHTML="";
 $main.innerHTML=`<form class="box login" id="lf"><h2>Enter Barovia</h2><label for="em">Email</label><input id="em" type="email" autocomplete="username" required><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" required><p class="err" role="alert">${esc(msg)}</p><button>Sign in</button></form>`;
 document.getElementById("lf").onsubmit=async e=>{e.preventDefault();
  const {error}=await sb.auth.signInWithPassword({email:em.value.trim(),password:pw.value});
  if(error)login("Could not sign in. Check your email and password.");else start()};
}
async function start(){
 const {data:{session}}=await sb.auth.getSession();
 if(!session)return login();
 S.user=session.user;
 const {data:p}=await sb.from("profiles").select("display_name,role").eq("id",S.user.id).single();
 S.role=p?.role||"player";
 $who.innerHTML=`<span>${esc(p?.display_name||S.user.email)} (${S.role === "dm" ? "DM" : "player"}) </span><button id="so">Sign out</button>`;
 document.getElementById("so").onclick=async()=>{await sb.auth.signOut();S.cur=null;login()};
 await load();party();initExtras();
 sb.channel("chars").on("postgres_changes",{event:"*",schema:"public",table:"characters"},pl=>{
  const r=pl.new;if(!r||!r.id)return;const i=S.chars.findIndex(c=>c.id===r.id);
  if(i>=0)S.chars[i]=r;else S.chars.push(r);
  if(S.cur===r.id&&S.tab==="core")drawLive()}).subscribe();
}
async function load(){
 const {data,error}=await sb.from("characters").select("*").order("name");
 S.chars=data||[];if(error)console.error(error);
}
function party(){
 S.cur=null;S.view="party";
 let h=`<div class="party">${S.chars.map(c=>`<button class="tile" data-id="${c.id}"><img src="${esc(c.portrait_path)}" alt="Portrait of ${esc(c.name)}"><span><h2>${esc(c.name)}</h2><small>${esc(c.sheet?.header?.cls||"")}, played by ${esc(c.sheet?.header?.player||"")}</small></span></button>`).join("")}</div>`;
 if(!S.chars.length)h=`<div class="box pending"><h3>No characters yet</h3><p>${S.role==="dm"?"Load the three starting characters. Malakor will be assigned to you.":"The DM hasn't added characters yet."}</p>${S.role==="dm"?'<button id="seed">Load characters</button>':""}</div>`;
 $main.innerHTML=navH("party")+h;wireNav();
 $main.querySelectorAll(".tile").forEach(b=>b.onclick=()=>open(b.dataset.id));
 const sd=document.getElementById("seed");
 if(sd)sd.onclick=async()=>{sd.disabled=true;
  const rows=SEED.map(({own,...r})=>({...r,kind:"pc",owner:own==="me"?S.user.id:null}));
  const {error}=await sb.from("characters").insert(rows);
  if(error){sd.disabled=false;return alert("Could not load: "+error.message)}
  await load();party()};
}
async function open(id){
 S.cur=id;S.view="char";S.tab="core";S.notes=null;
 const {data}=await sb.from("player_notes").select("*").eq("character_id",id).eq("owner",S.user.id).maybeSingle();
 S.notes=data;char();
}
const cc=()=>S.chars.find(c=>c.id===S.cur);
function char(){
 const c=cc(),h=c.sheet.header||{};
 const tabs=[["core","Core"],["actions","Actions"],["features","Features"],["gear","Equipment"],["spells","Spells"],["story","Story and notes"]];
 $main.innerHTML=`<button id="bk">Back to party</button>
 <div class="hero"><img src="${esc(c.portrait_path)}" alt="Portrait of ${esc(c.name)}" style="object-position:60% 30%"><div><h2>${esc(c.name)}</h2><p>${esc([h.cls,h.species,h.bg].filter(Boolean).join(", "))}. Played by ${esc(h.player||"")}. ${h.xp?h.xp+" XP":""}</p></div></div>
 <div class="tabs" role="tablist">${tabs.map(([k,l])=>`<button role="tab" aria-selected="${k===S.tab}" data-k="${k}">${l}</button>`).join("")}</div><div id="pane"></div>`;
 document.getElementById("bk").onclick=party;
 $main.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{S.tab=b.dataset.k;char()});
 pane(c);
}
function pending(c){return `<div class="box pending"><h3>Sheet not loaded yet</h3><p>Waiting on the D&amp;D Beyond sheet from ${esc(c.sheet.header?.player||"the player")}.</p></div>`}
function pane(c){
 const sh=c.sheet,el=document.getElementById("pane"),full=!!sh.ab;
 if(S.tab==="story"){el.innerHTML=storyH(c);return wireNotes(c)}
 if(!full){el.innerHTML=pending(c);return}
 el.innerHTML=({core:coreH,actions:actionsH,features:featuresH,gear:gearH,spells:spellsH})[S.tab](c);
 if(S.tab==="core")wireLive(c);
}
function coreH(c){
 const s=c.sheet,pb=s.pb,cb=s.combat,m=k=>mod(s.ab[k]);
 const sk=SK.map(([n,a])=>{const p=s.skills.includes(n);return[p?"●":"○",n,a.toUpperCase(),sg(m(a)+(p?pb:0))]});
 const pass=n=>10+m(n)+(s.skills.includes(n==="wis"?"Perception":"")?pb:0);
 return `<div class="cols">
 <section class="box" aria-labelledby="tk"><h3 id="tk">Play tracker</h3><div id="live"></div>${canEdit(c)?"":'<p class="ro">View only. You can edit your own character.</p>'}</section>
 <section class="box"><h3>Vitals</h3><div class="kv"><span><b>AC</b> ${cb.ac}</span><span><b>Initiative</b> ${sg(cb.init)}</span><span><b>Speed</b> ${esc(cb.speed)}</span><span><b>Proficiency</b> ${sg(pb)}</span><span><b>Hit dice</b> ${esc(cb.hd)}</span><span><b>Passive Perception</b> ${pass("wis")}</span><span><b>Passive Insight</b> ${10+m("wis")}</span><span><b>Passive Investigation</b> ${10+m("int")}</span></div><p><span class="lab">Senses</span>${esc(cb.senses)}</p><p><span class="lab">Defenses</span>${esc(s.defenses)}</p><p><span class="lab">Armor</span>${esc(s.prof.armor)}</p><p><span class="lab">Weapons</span>${esc(s.prof.weapons)}</p><p><span class="lab">Languages</span>${esc(s.prof.langs)}</p></section>
 <section class="box"><h3>Abilities and saves</h3><div class="abil">${AB.map(k=>`<div class="${s.saves.includes(k)?"p":""}"><i>${k.toUpperCase()}${s.saves.includes(k)?" save "+sg(m(k)+pb):" save "+sg(m(k))}</i><b>${s.ab[k]}</b><i>${sg(m(k))}</i></div>`).join("")}</div></section>
 <section class="box"><h3>Skills</h3>${table(["","Skill","Ability","Mod"],sk)}</section></div>`;
}
function liveH(c){
 const l=c.live||{},mx=c.sheet.combat.hp,e=canEdit(c)?"":"disabled",sl=c.sheet.spells;
 return `<div class="tr"><span class="lab">Hit points (max ${mx})</span></div>
 <div class="tr"><button data-a="hp-1" ${e} aria-label="Lose 1 hit point">-1</button><button data-a="hp-5" ${e} aria-label="Lose 5 hit points">-5</button><output aria-live="polite">${l.hp??mx}</output><button data-a="hp+1" ${e} aria-label="Gain 1 hit point">+1</button><button data-a="hp+5" ${e} aria-label="Gain 5 hit points">+5</button></div>
 <div class="tr"><span class="lab">Temp HP</span><button data-a="t-1" ${e} aria-label="Lose 1 temp HP">-</button><output>${l.thp||0}</output><button data-a="t+1" ${e} aria-label="Gain 1 temp HP">+</button></div>
 <div class="tr"><span class="lab">Pact slots (level ${sl.slotLvl})</span>${(l.slots||[0,0]).map((u,i)=>`<button class="gem" data-a="slot${i}" ${e} aria-pressed="${!!u}" aria-label="Slot ${i+1} ${u?"used":"available"}"></button>`).join("")}</div>
 <div class="tr"><span class="lab">Healing Hands</span><button class="gem" data-a="hh" ${e} aria-pressed="${!!l.hh}" aria-label="Healing Hands ${l.hh?"used":"available"}"></button><span class="lab">Heroic Inspiration</span><button class="gem" data-a="insp" ${e} aria-pressed="${!l.insp}" aria-label="Heroic Inspiration ${l.insp?"held":"none"}"></button></div>
 <div class="tr"><span class="lab">Death saves</span>${["Success","Failure"].map((n,j)=>[0,1,2].map(i=>`<button class="gem" data-a="ds${j}${i}" ${e} aria-pressed="${!(l.ds?.[j]>i)}" aria-label="${n} ${i+1}"></button>`).join("")).join(" | ")}</div>
 <label for="cd">Conditions</label><input id="cd" ${e} value="${esc(l.cond||"")}">
 <div class="tr"><button data-a="rest" ${e}>Long rest</button></div>`;
}
function drawLive(){const c=cc();if(!c||!c.sheet.ab)return;const el=document.getElementById("live");if(!el)return;el.innerHTML=liveH(c);wireLive(c,true)}
function wireLive(c,re){
 const el=document.getElementById("live");if(!re)el.innerHTML=liveH(c);
 const mx=c.sheet.combat.hp;
 const save=async l=>{c.live=l;await sb.from("characters").update({live:l,updated_at:new Date().toISOString()}).eq("id",c.id);drawLive()};
 el.querySelectorAll("[data-a]").forEach(b=>b.onclick=()=>{
  const a=b.dataset.a,l={hp:mx,thp:0,slots:[0,0],hh:0,insp:0,ds:[0,0],cond:"",...c.live};l.slots=[...l.slots];l.ds=[...l.ds];
  if(a.startsWith("hp")){let d=+a.slice(2);if(d<0&&l.thp){const t=Math.min(l.thp,-d);l.thp-=t;d+=t}l.hp=Math.max(0,Math.min(mx,l.hp+d))}
  else if(a.startsWith("t"))l.thp=Math.max(0,l.thp+(a==="t+1"?1:-1));
  else if(a.startsWith("slot")){const i=+a.slice(4);l.slots[i]^=1}
  else if(a==="hh")l.hh^=1;else if(a==="insp")l.insp^=1;
  else if(a.startsWith("ds")){const j=+a[2],i=+a[3];l.ds[j]=l.ds[j]>i?i:i+1}
  else if(a==="rest"){l.hp=mx;l.thp=0;l.slots=[0,0];l.hh=0;l.ds=[0,0]}
  save(l)});
 const cd=document.getElementById("cd");
 if(cd)cd.onchange=()=>save({...(c.live||{}),cond:cd.value});
}
function actionsH(c){
 const s=c.sheet;
 return `<div class="cols"><section class="box"><h3>Attacks and cantrips</h3>${table(["Name","Hit","Damage","Notes"],s.atk)}</section>
 <section class="box"><h3>Actions</h3><p><span class="lab">Standard actions</span>${esc(s.std)}</p>${s.acts.map(a=>`<p><span class="lab">${esc(a[0])}</span>${esc(a[1])}</p>`).join("")}</section></div>`;
}
function featuresH(c){return `<div class="box"><h3>Features and traits</h3>${c.sheet.feats.map(f=>`<p><span class="lab">${esc(f[0])} <small class="ro">${esc(f[1])}</small></span>${esc(f[2])}</p>`).join("")}</div>`}
function gearH(c){const g=c.sheet.gear;return `<div class="box"><h3>Equipment</h3><p><b class="lab">Coin</b>${g.gp} gp</p>${table(["Item","Qty"],g.items)}</div>`}
function spellsH(c){
 const p=c.sheet.spells,h=["Spell","Source","Save/Atk","Time","Range","Comp.","Duration"];
 return `<div class="box"><h3>Spellcasting</h3><div class="kv"><span><b>Ability</b> ${p.ab}</span><span><b>Save DC</b> ${p.dc}</span><span><b>Attack</b> ${sg(p.atk)}</span><span><b>Pact slots</b> ${p.slots} at level ${p.slotLvl}</span></div>
 <span class="lab">Cantrips</span>${table(h,p.can)}<span class="lab" style="margin-top:14px">Level 1</span>${table(h,p.l1)}</div>`;
}
function storyH(c){
 const t=c.sheet.story||{},ed=canEdit(c);
 const kv=[["Alignment",t.align],["Faith",t.faith],["Gender",t.gender],["Age",t.age],["Size",t.size],["Height",t.height],["Weight",t.weight],["Skin",t.skin],["Eyes",t.eyes],["Hair",t.hair]].filter(x=>x[1]);
 return `<div class="cols"><section class="box"><h3>Character</h3><div class="kv">${kv.map(([k,v])=>`<span><b>${k}</b> ${esc(v)}</span>`).join("")}</div>
 ${[["Personality traits",t.traits],["Ideals",t.ideals],["Bonds",t.bonds],["Flaws",t.flaws],["Allies and organizations",t.allies],["Notes",t.notes]].filter(x=>x[1]).map(([k,v])=>`<span class="lab">${k}</span>${pre(v)}`).join("")}</section>
 <section class="box"><h3>Backstory</h3>${pre(t.backstory||"")}</section>
 <section class="box"><h3>My notes</h3><label for="nt">Private. Only you can read these.</label><textarea id="nt" rows="10">${esc(S.notes?.body||"")}</textarea><p class="ro" id="ns"></p></section></div>`;
}
function wireNotes(c){
 const nt=document.getElementById("nt"),ns=document.getElementById("ns");let t;
 nt.oninput=()=>{clearTimeout(t);ns.textContent="Saving...";t=setTimeout(async()=>{
  const body=nt.value;let r;
  if(S.notes)r=await sb.from("player_notes").update({body,updated_at:new Date().toISOString()}).eq("id",S.notes.id).select().single();
  else r=await sb.from("player_notes").insert({body,character_id:c.id}).select().single();
  if(r.error)ns.textContent="Could not save: "+r.error.message;else{S.notes=r.data;ns.textContent="Saved."}},700)};
}
start();
