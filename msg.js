// Messaging: whispers, party chat, and DM secrets.
const TK={party:"Party chat",whisper:"Whisper to DM",secret:"Secret"};
async function messaging(){S.view="msg";const {data:th}=await sb.from("threads").select("*").order("created_at",{ascending:false}),
 {data:pp}=await sb.from("profiles").select("id,display_name");const thr=th||[],ppl=pp||{},dm=isDM();
 let h=navH("msg")+`<div class="msg-root"><div class="threads" id="tl">`;
 if(!thr.length)h+=`<p class="ro">No conversations yet.</p>`;else
  h+=thr.map(t=>{const nm=t.kind==="party"?"Party":t.kind==="secret"?`Secret to ${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"player"}`:
   `${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"DM"}`;return `<button class="thread-item" data-id="${t.id}">${esc(nm)}</button>`}).join("");
 h+=`</div><div class="chat" id="chat"><p class="ro">Select a conversation.</p></div></div>`;
 if(dm)h=h.replace("<div class=\"threads\"","<button id=\"newth\" style=\"margin-bottom:10px\">New conversation</button><div class=\"threads\"");
 $main.innerHTML=h;wireNav();
 document.getElementById("tl").querySelectorAll(".thread-item").forEach(b=>b.onclick=()=>openThread(b.dataset.id));
 if(!dm)return;document.getElementById("newth").onclick=()=>newThread(ppl);
}
async function openThread(id){
 const {data:th}=await sb.from("threads").select("*").eq("id",id).single(),
  {data:msgs}=await sb.from("messages").select("sender_id,body,created_at").eq("thread_id",id).order("created_at");
 S.cur_thread=id;const m=msgs||[],t=th||{};
 const ppl=(await sb.from("profiles").select("id,display_name")).data||[];
 const nm=t.kind==="party"?"Party chat":t.kind==="secret"?`Secret from ${ppl.find(x=>x.id===t.created_by)?.display_name||"DM"}`:
  `Whisper with ${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"someone"}`;
 document.getElementById("chat").innerHTML=`<div class="msg-chat"><h3>${esc(nm)}</h3><div id="msgs">${m.map(g=>`<div class="msg ${g.sender_id===S.user.id?"me":"them"}"><b>${esc(ppl.find(x=>x.id===g.sender_id)?.display_name||"?")}</b> ${esc(g.body)}</div>`).join("")}</div>
 <form id="mf"><input type="text" id="mb" placeholder="Type a message…" required autocomplete="off"><button>Send</button></form></div>`;
 document.getElementById("mf").onsubmit=async e=>{e.preventDefault();const b=document.getElementById("mb");
  await sb.from("messages").insert({thread_id:id,sender_id:S.user.id,body:b.value});b.value="";openThread(id)};
 const ms=document.getElementById("msgs");ms.scrollTop=ms.scrollHeight;
 sb.channel(`thread:${id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`thread_id=eq.${id}`},pl=>{openThread(id)}).subscribe();
}
function newThread(ppl){
 const p=ppl.filter(x=>x.id!==S.user.id).map(x=>`<label class="chk"><input type="radio" name="to" value="${x.id}" required> ${esc(x.display_name)}</label>`).join("");
 const d=document.createElement("div");d.className="dlg";d.setAttribute("role","dialog");d.setAttribute("aria-modal","true");
 d.innerHTML=`<div class="dlg-box"><h3>New conversation</h3><form id="nf"><fieldset><legend>Who?</legend>${p}<label class="chk"><input type="radio" name="to" value="party" required> Everyone</label></fieldset>
 <p class="err" id="ne" role="alert"></p><div class="tr"><button>Create</button><button type="button" class="cancel">Cancel</button></div></form></div>`;
 document.body.appendChild(d);d.querySelector(".cancel").onclick=()=>d.remove();
 document.getElementById("nf").onsubmit=async e=>{e.preventDefault();const to=document.querySelector("[name=to]:checked").value;
  const ne=document.getElementById("ne");try{const mem=to==="party"?ppl.map(x=>x.id):[S.user.id,to];
   const k=to==="party"?"party":"secret";const {error}=await sb.from("threads").insert({kind:k,members:mem});if(error)throw error;
   d.remove();messaging()}catch(x){ne.textContent="Could not create: "+x.message}};
}
