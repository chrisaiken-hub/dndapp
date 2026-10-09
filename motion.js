// Re-plays the page-turn entrance animation on #main every time a view function
// replaces its content (they all just set $main.innerHTML) — no changes needed
// to app.js/dm.js/msg.js, since this only watches the DOM from the outside.
(()=>{
 const m=document.getElementById("main");
 if(!m||!("MutationObserver"in window))return;
 new MutationObserver(()=>{
  m.classList.remove("enter");
  void m.offsetWidth; // force reflow so the animation restarts
  m.classList.add("enter");
 }).observe(m,{childList:true});
})();
