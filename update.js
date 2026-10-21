// Meldt als er een nieuwere versie van Vineder online staat en biedt een vernieuwknop aan.
// Vergelijkt window.VI_V (de versie waarmee deze pagina laadde) met version.json op de server.
(function(){
  const mine=window.VI_V;
  if(!mine)return;
  let shown=null,dismissed=null,busy=false;

  async function check(){
    if(busy)return;busy=true;
    try{
      const r=await fetch('version.json?t='+Date.now(),{cache:'no-store'});
      if(!r.ok)return;
      const v=(await r.json()).v;
      if(v&&v!==mine&&v!==dismissed&&v!==shown)show(v);
    }catch(_){/* offline: stil negeren */}
    finally{busy=false}
  }

  function show(v){
    shown=v;
    const b=document.createElement('div');
    b.className='upd';b.setAttribute('role','status');
    b.innerHTML='<span>Nieuwe versie beschikbaar</span><button class="go" type="button">Vernieuwen</button><button class="x" type="button" aria-label="Later">×</button>';
    b.querySelector('.go').onclick=async e=>{
      e.target.disabled=true;e.target.textContent='Bezig…';
      // ververs eerst de gecachte index.html, anders laadt de browser soms nog de oude
      try{await fetch(location.pathname,{cache:'reload'})}catch(_){}
      location.reload();
    };
    b.querySelector('.x').onclick=()=>{dismissed=v;shown=null;b.remove()};
    document.body.appendChild(b);
  }

  document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
  window.addEventListener('online',check);
  setInterval(check,10*60*1000);
  setTimeout(check,4000);
})();
