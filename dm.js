// Journal, quests and scene push. Loaded before app.js; uses its globals (sb, S, esc, pre, $main).
const KINDS={recap:"Session recap",handout:"Handout",npc:"NPC",map:"Map",secret:"Secret"};
const QS={active:"Active",done:"Completed",failed:"Failed"};
const isDM=()=>S.role==="dm";
const fmt=d=>new Date(d).toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
function navH(a){const t=[["party","Party"],["journal","Journal"],["quests","Quests"]];if(isDM())t.push(["scene","Push scene"]);
 return `<nav class="tabs nav" aria-label="Sections">${t.map(([k,l])=>`<button data-v="${k}" aria-current="${k===a?"page":"false"}">${l}</button>`).join("")}</nav>`}
function wireNav(){$main.querySelectorAll(".nav button").forEach(b=>b.onclick=()=>({party,journal,quests,scene:scenePage})[b.dataset.v]())}
async function signed(p){const {data}=await sb.storage.from("campaign").createSignedUrl(p,3600);return data?.signedUrl}
async function fillImgs(root=document){for(const im of root.querySelectorAll("img[data-p]")){const u=await signed(im.dataset.p);if(u)im.src=u}}
async function up(file){if(!file||!file.size)return null;
 const p=`uploads/${Date.now()}-${file.name.replace(/[^\w.-]/g,"_")}`;
 const {error}=await sb.storage.from("campaign").upload(p,file);if(error)throw error;return p}
const opts=o=>Object.entries(o).map(([k,v])=>`<option value="${k}">${v}</option>`).join("");

/* Journal */
function composer(ppl){return `<form class="box form" id="pf"><h3>New post</h3>
 <label for="pt">Title</label><input id="pt" required>
 <label for="pk">Type</label><select id="pk">${opts(KINDS)}</select>
 <label for="pb">Text</label><textarea id="pb" rows="5"></textarea>
 <label for="pi">Image (optional)</label><input id="pi" type="file" accept="image/*">
 <fieldset><legend>Visible to (leave all unticked for everyone)</legend>${ppl.map(p=>`<label class="chk"><input type="checkbox" name="aud" value="${p.id}"> ${esc(p.display_name)}</label>`).join("")}</fieldset>
 <label class="chk"><input type="checkbox" id="pr"> Reveal to players now</label>
 <p class="err" id="pe" role="alert"></p><button>Post</button></form>`}
function postH(p,ppl){const dm=isDM(),names=(p.audience||[]).map(id=>ppl.find(x=>x.id===id)?.display_name||"player");
 return `<article class="box post"><h3>${esc(p.title)}</h3><p class="ro">${KINDS[p.kind]||p.kind}, ${fmt(p.created_at)}${dm&&!p.revealed?' <b class="badge">Hidden</b>':""}${dm&&names.length?" For: "+esc(names.join(", ")):""}</p>
 ${p.image_path?`<img class="pimg" data-p="${esc(p.image_path)}" alt="${esc(p.title)}">`:""}${p.body?pre(p.body):""}
 ${dm?`<div class="tr"><button data-tog="${p.id}" data-r="${p.revealed}">${p.revealed?"Hide from players":"Reveal to players"}</button><button data-del="${p.id}">Delete</button></div>`:""}</article>`}
async function journal(){S.view="journal";
 const {data:posts}=await sb.from("posts").select("*").order("created_at",{ascending:false});
 let ppl=[];if(isDM()){ppl=(await sb.from("profiles").select("id,display_name").eq("role","player")).data||[]}
 $main.innerHTML=navH("journal")+(isDM()?composer(ppl):"")+`<div class="feed">${(posts||[]).map(p=>postH(p,ppl)).join("")||'<p class="ro">Nothing posted yet.</p>'}</div>`;
 wireNav();fillImgs($main);if(!isDM())return;
 document.getElementById("pf").onsubmit=async e=>{e.preventDefault();const er=document.getElementById("pe");er.textContent="";
  try{const aud=[...document.querySelectorAll("[name=aud]:checked")].map(x=>x.value);
   const image_path=await up(document.getElementById("pi").files[0]);
   const {error}=await sb.from("posts").insert({title:pt.value,kind:pk.value,body:pb.value,image_path,revealed:pr.checked,audience:aud.length?aud:null});
   if(error)throw error;journal()}catch(x){er.textContent="Could not post: "+x.message}};
 $main.querySelectorAll("[data-tog]").forEach(b=>b.onclick=async()=>{await sb.from("posts").update({revealed:b.dataset.r!=="true"}).eq("id",b.dataset.tog);journal()});
 $main.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this post?")){await sb.from("posts").delete().eq("id",b.dataset.del);journal()}});
}

/* Quests */
async function quests(){S.view="quests";
 const {data}=await sb.from("quests").select("*").order("created_at",{ascending:false});const q=data||[],dm=isDM();
 const grp=s=>q.filter(x=>x.status===s);
 $main.innerHTML=navH("quests")+(dm?`<form class="box form" id="qf"><h3>New quest</h3><label for="qt">Title</label><input id="qt" required><label for="qb">Details</label><textarea id="qb" rows="3"></textarea><label class="chk"><input type="checkbox" id="qr"> Reveal to players now</label><button>Add quest</button></form>`:"")+
 Object.entries(QS).map(([s,l])=>`<section><h3>${l}</h3>${grp(s).map(x=>`<article class="box post"><h3>${esc(x.title)}</h3>${dm&&!x.revealed?'<p><b class="badge">Hidden</b></p>':""}${x.body?pre(x.body):""}${dm?`<div class="tr"><select data-st="${x.id}" aria-label="Status of ${esc(x.title)}">${opts(QS).replace(`value="${x.status}"`,`value="${x.status}" selected`)}</select><button data-tog="${x.id}" data-r="${x.revealed}">${x.revealed?"Hide":"Reveal"}</button><button data-del="${x.id}">Delete</button></div>`:""}</article>`).join("")||'<p class="ro">None.</p>'}</section>`).join("");
 wireNav();if(!dm)return;
 document.getElementById("qf").onsubmit=async e=>{e.preventDefault();await sb.from("quests").insert({title:qt.value,body:qb.value,revealed:qr.checked});quests()};
 $main.querySelectorAll("[data-st]").forEach(s=>s.onchange=async()=>{await sb.from("quests").update({status:s.value}).eq("id",s.dataset.st);quests()});
 $main.querySelectorAll("[data-tog]").forEach(b=>b.onclick=async()=>{await sb.from("quests").update({revealed:b.dataset.r!=="true"}).eq("id",b.dataset.tog);quests()});
 $main.querySelectorAll("[data-del]").forEach(b=>b.onclick=async()=>{if(confirm("Delete this quest?")){await sb.from("quests").delete().eq("id",b.dataset.del);quests()}});
}

/* Scene push */
function scenePage(){S.view="scene";
 $main.innerHTML=navH("scene")+`<form class="box form" id="sf"><h3>Push a scene to every screen</h3><label for="st">Title</label><input id="st" required><label for="sb2">Description</label><textarea id="sb2" rows="5"></textarea><label for="si">Image (optional)</label><input id="si" type="file" accept="image/*"><p class="err" id="se" role="alert"></p><div class="tr"><button>Send to everyone</button><button type="button" id="sc">Close for everyone</button></div></form>`;
 wireNav();
 document.getElementById("sf").onsubmit=async e=>{e.preventDefault();const er=document.getElementById("se");er.textContent="";
  try{const image_path=await up(document.getElementById("si").files[0]);
   await sb.from("scenes").update({active:false}).eq("active",true);
   const {error}=await sb.from("scenes").insert({title:st.value,body:sb2.value,image_path,active:true});if(error)throw error;
   er.textContent="Sent."}catch(x){er.textContent="Could not send: "+x.message}};
 document.getElementById("sc").onclick=()=>sb.from("scenes").update({active:false}).eq("active",true);
}
function closeScene(){document.getElementById("scene")?.remove()}
async function showScene(s){closeScene();const d=document.createElement("div");d.id="scene";
 d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");d.setAttribute("aria-label",s.title);
 d.innerHTML=`<div class="sc"><h2>${esc(s.title)}</h2>${s.image_path?`<img data-p="${esc(s.image_path)}" alt="${esc(s.title)}">`:""}${s.body?pre(s.body):""}<button id="scx">Close</button></div>`;
 document.body.appendChild(d);const x=d.querySelector("#scx");x.onclick=closeScene;x.focus();fillImgs(d)}

async function initExtras(){
 const {data}=await sb.from("scenes").select("*").eq("active",true).order("pushed_at",{ascending:false}).limit(1);
 if(data?.[0])showScene(data[0]);
 const idle=()=>!document.activeElement?.closest("form");
 sb.channel("extras")
  .on("postgres_changes",{event:"*",schema:"public",table:"scenes"},pl=>{const r=pl.new;if(r?.active)showScene(r);else closeScene()})
  .on("postgres_changes",{event:"*",schema:"public",table:"posts"},()=>{if(S.view==="journal"&&idle())journal()})
  .on("postgres_changes",{event:"*",schema:"public",table:"quests"},()=>{if(S.view==="quests"&&idle())quests()}).subscribe();
}
