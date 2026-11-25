// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- intro & onboarding ---------- */
function introHTML(st,auto){
 const dots=`<div class="dots">${[0,1,2].map(i=>`<i class="${i===st?'on':''}"></i>`).join('')}</div>`;
 const jh=`<div class="jh">Una produzione <b>JH STUDIOS</b></div>`;
 const lt=`<button class="lang" data-act="lang" style="position:absolute;top:calc(14px + env(safe-area-inset-top));right:14px;background:rgb(255 255 255/.15);color:#fff"><i class="${LANG==='it'?'on':''}" style="color:${LANG==='it'?'#FFC107':'#fff'}">IT</i>/<i class="${LANG==='en'?'on':''}" style="color:${LANG==='en'?'#FFC107':'#fff'}">EN</i></button>`;
 if(st===0)return lt+`<div class="lw"><i></i><i></i><img src="img/logo.jpg" alt="City Pulse"></div><div class="slogan">Vivi il <em>battito</em><br>della tua città.</div><p class="intro-sub">Concerti, spettacoli, feste, sagre, cultura e movida a <b>Palermo</b>.</p>${auto?'<p class="xs" style="opacity:.7">Tocca per entrare</p>':`<button class="btn gold" data-act="ob" data-s="1" style="min-width:220px;animation:fade .6s .7s both">Inizia${ic('arrow_forward')}</button><button class="skip" data-act="obdone">Salta</button>`}${jh}`;
 if(st===1)return `<div class="ob">${dots}<h2>Cosa ti fa battere il cuore?</h2><p class="intro-sub" style="margin:0 auto">Scegli quello che ami: costruiamo il tuo feed su misura.</p><div class="grid">${CATS.slice(1).map(([k,i,l])=>`<button class="chip ${(S.taste.cats||[]).includes(k)?'on':''}" data-act="obcat" data-k="${k}" aria-pressed="${(S.taste.cats||[]).includes(k)}">${ic(i)}${l}</button>`).join('')}</div><button class="btn gold w" data-act="ob" data-s="2">Avanti${ic('arrow_forward')}</button><button class="skip" data-act="ob" data-s="0">Indietro</button></div>${lt}${jh}`;
 return `<div class="ob">${dots}<h2>I tuoi quartieri</h2><p class="intro-sub" style="margin:0 auto">Ti avvisiamo per primi su quello che succede dove vivi la città.</p><div class="grid">${ZONES.map(z=>`<button class="chip ${S.prefs.zones.includes(z)?'on':''}" data-act="obzone" data-k="${esc(z)}" aria-pressed="${S.prefs.zones.includes(z)}">${ic('near_me')}${z}</button>`).join('')}</div><button class="btn gold w" data-act="obdone">Entra in City Pulse${ic('bolt')}</button><button class="skip" data-act="ob" data-s="1">Indietro</button></div>${lt}${jh}`}
let IST=0;
function intro(st=0,auto=false){IST=st;let el=$('#intro');if(!el){el=document.createElement('div');el.id='intro';el.setAttribute('role','dialog');el.setAttribute('aria-label','Benvenuto in City Pulse');document.body.append(el)}
 el.dataset.auto=auto?'1':'';el.innerHTML=introHTML(st,auto);if(auto)setTimeout(closeIntro,2200);}
function closeIntro(){const el=$('#intro');if(!el||el.classList.contains('out'))return;el.classList.add('out');setTimeout(()=>el.remove(),450)}

