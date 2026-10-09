// Messaging: whispers, party chat, and DM secrets. Attachments, unread badges, @mentions.
const fmtT=d=>new Date(d).toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
const mentionRe=name=>new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")}\\b`,"i");
function mentionHighlight(escapedBody,ppl){
 return ppl.reduce((body,p)=>p.display_name?body.replace(new RegExp(mentionRe(p.display_name).source,"gi"),m=>`<span class="mention">${m}</span>`):body,escapedBody);
}
function threadStats(id,msgs,readMap,myId,myName){
 const since=readMap[id];
 const unread=msgs.filter(m=>m.thread_id===id&&m.sender_id!==myId&&(!since||m.created_at>since));
 return {count:unread.length,mention:myName&&unread.some(m=>mentionRe(myName).test(m.body||""))};
}
async function messaging(){S.view="msg";
 const [{data:th},{data:pp},{data:allMsgs},{data:reads}]=await Promise.all([
  sb.from("threads").select("*").order("created_at",{ascending:false}),
  sb.from("profiles").select("id,display_name"),
  sb.from("messages").select("thread_id,sender_id,body,created_at"),
  sb.from("message_reads").select("thread_id,last_read_at").eq("user_id",S.user.id)
 ]);
 const thr=th||[],ppl=pp||[],msgs=allMsgs||[],dm=isDM();
 const myName=ppl.find(x=>x.id===S.user.id)?.display_name||"";
 const readMap=Object.fromEntries((reads||[]).map(r=>[r.thread_id,r.last_read_at]));
 let h=navH("msg")+`<div class="msg-root" data-mobile="list"><div class="threads" id="tl">`;
 if(!thr.length)h+=`<p class="ro">No conversations yet.</p>`;else
  h+=thr.map(t=>{const nm=t.kind==="party"?"Party":t.kind==="secret"?`Secret to ${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"player"}`:
   `${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"DM"}`;
   const st=threadStats(t.id,msgs,readMap,S.user.id,myName);
   return `<button class="thread-item" data-id="${t.id}"><span>${esc(nm)}</span>${st.count?`<span class="badge unread${st.mention?" mention":""}">${st.count}</span>`:""}</button>`}).join("");
 h+=`</div><div class="chat" id="chat"><p class="ro">Select a conversation.</p></div></div>`;
 if(dm)h=h.replace("<div class=\"threads\"","<button id=\"newth\" style=\"margin-bottom:10px\">New conversation</button><div class=\"threads\"");
 $main.innerHTML=h;wireNav();
 document.getElementById("tl").querySelectorAll(".thread-item").forEach(b=>b.onclick=()=>openThread(b.dataset.id));
 if(dm)document.getElementById("newth").onclick=()=>newThread(ppl);
 if(S.cur_thread&&thr.some(t=>t.id===S.cur_thread))openThread(S.cur_thread);
}
async function openThread(id){
 document.querySelector(".msg-root")?.setAttribute("data-mobile","chat");
 const {data:th}=await sb.from("threads").select("*").eq("id",id).single(),
  {data:msgs}=await sb.from("messages").select("sender_id,body,created_at,image_path").eq("thread_id",id).order("created_at");
 S.cur_thread=id;const m=msgs||[],t=th||{};
 const ppl=(await sb.from("profiles").select("id,display_name")).data||[];
 const nm=t.kind==="party"?"Party chat":t.kind==="secret"?`Secret from ${ppl.find(x=>x.id===t.created_by)?.display_name||"DM"}`:
  `Whisper with ${ppl.find(x=>x.id!=S.user.id&&t.members.includes(x.id))?.display_name||"someone"}`;
 document.getElementById("chat").innerHTML=`<div class="msg-chat"><button type="button" class="back-list">← Conversations</button><h3>${esc(nm)}</h3><div id="msgs">${m.map(g=>`<div class="msg ${g.sender_id===S.user.id?"me":"them"}"><b>${esc(ppl.find(x=>x.id===g.sender_id)?.display_name||"?")}</b>${g.image_path?`<img class="pimg" data-p="${esc(g.image_path)}" alt="Attached image">`:""}${g.body?`<p>${mentionHighlight(esc(g.body),ppl)}</p>`:""}<time>${fmtT(g.created_at)}</time></div>`).join("")}</div>
 <form id="mf" class="composer"><input type="text" id="mb" placeholder="Type a message…" autocomplete="off"><input type="file" id="mi" accept="image/*" aria-label="Attach an image"><button>Send</button></form></div>`;
 document.querySelector(".back-list").onclick=()=>document.querySelector(".msg-root").setAttribute("data-mobile","list");
 document.getElementById("mf").onsubmit=async e=>{e.preventDefault();
  const b=document.getElementById("mb"),fi=document.getElementById("mi"),text=b.value.trim(),file=fi.files[0];
  if(!text&&!file)return;
  let image_path=null;
  if(file){try{image_path=await up(file)}catch(x){return alert("Could not upload image: "+x.message)}}
  await sb.from("messages").insert({thread_id:id,sender_id:S.user.id,body:text,image_path});
  b.value="";fi.value="";openThread(id)};
 const ms=document.getElementById("msgs");ms.scrollTop=ms.scrollHeight;fillImgs(ms);
 await sb.from("message_reads").upsert({thread_id:id,user_id:S.user.id,last_read_at:new Date().toISOString()});
 if(S.threadChannel)sb.removeChannel(S.threadChannel);
 S.threadChannel=sb.channel(`thread:${id}`).on("postgres_changes",{event:"INSERT",schema:"public",table:"messages",filter:`thread_id=eq.${id}`},()=>openThread(id)).subscribe();
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
