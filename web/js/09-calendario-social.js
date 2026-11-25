// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- calendario ---------- */
function vCalendario(){
 if(!S.calM){S.calM=[TODAY.getFullYear(),TODAY.getMonth()]}
 const[y,m]=S.calM;const first=new Date(y,m,1);const startDow=(first.getDay()+6)%7;const dim=new Date(y,m+1,0).getDate();
 const byDay={};for(const e of EV.filter(x=>!x.draft)){const k=ymd(e.date);(byDay[k]=byDay[k]||[]).push(e)}
 const mine=new Set([...S.tickets.map(t=>ymd(E(t.ev).date)),...[...S.going].map(id=>E(id)&&ymd(E(id).date))]);
 const wd=LANG==='en'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
 let cells='';for(let i=0;i<startDow;i++)cells+='<span></span>';
 for(let d=1;d<=dim;d++){const dt=new Date(y,m,d),k=ymd(dt),L=byDay[k]||[];
  cells+=`<button class="${k===ymd(TODAY)?'today':''} ${S.calSel===k?'sel':''} ${mine.has(k)?'mine':''} ${dt<TODAY?'off':''}" data-act="calday" data-k="${k}" aria-label="${d} ${MONL[LANG][m]}, ${L.length} eventi">${d}<span class="dd">${L.slice(0,3).map(()=>'<i></i>').join('')}</span></button>`}
 const sel=S.calSel;const list=sel?(byDay[sel]||[]):EV.filter(e=>e.date.getMonth()===m&&e.date.getFullYear()===y&&!e.past&&!e.draft).sort((a,b)=>a.off-b.off);
 return header('Calendario')+`<div class="wrap"><div class="row" style="margin-top:16px"><button class="back" data-act="calm" data-d="-1" aria-label="Mese precedente">${ic('chevron_left')}</button><h2 class="sp" style="text-align:center">${MONL[LANG][m]} ${y}</h2><button class="back" data-act="calm" data-d="1" aria-label="Mese successivo">${ic('chevron_right')}</button></div>
 <div class="card pad" style="margin-top:10px"><div class="cal">${wd.map(w=>`<span class="h">${w}</span>`).join('')}${cells}</div>
 <div class="row xs mut" style="margin-top:12px;gap:14px;flex-wrap:wrap"><span class="row" style="gap:4px"><i style="width:8px;height:8px;border-radius:50%;background:var(--red);display:inline-block"></i>Eventi</span><span class="row" style="gap:4px"><i style="width:8px;height:8px;border-radius:50%;background:var(--gold);display:inline-block"></i>I tuoi impegni</span><span class="row" style="gap:4px"><i style="width:12px;height:12px;border-radius:4px;border:2px solid var(--red);display:inline-block"></i>Oggi</span></div></div>
 <section class="sec"><div class="sechd"><h2>${sel?fmtD(new Date(sel+'T00:00')):'In programma questo mese'}</h2>${sel?'<button class="link" data-act="calday" data-k="">Tutto il mese</button>':''}</div>
 <div class="lst">${list.map(e=>`<div class="li" style="padding-right:8px">${pic(e)}<a class="tx" href="#evento-${e.id}"><div class="k">${e.day} • ${e.time}</div><b>${esc(e.t)}</b><div class="meta">${e.venue}</div></a>${e.past?'':`<button class="iconb" style="background:var(--soft)" data-act="calsheet" data-id="${e.id}" aria-label="Aggiungi al calendario">${ic('event_available')}</button>`}</div>`).join('')||`<div class="empty card">${ic('event_busy')}<b>Nessun evento in questa data</b></div>`}</div></section></div>`+nav('calendario')}
const pad2=n=>String(n).padStart(2,'0');
function evTimes(e){const d=e.date;const[a,b]=[e.time,e.end].map(t=>t.split(':').map(Number));const st=new Date(d);st.setHours(a[0],a[1]);const en=new Date(d);en.setHours(b[0],b[1]);if(en<=st)en.setDate(en.getDate()+1);return[st,en]}
const gfmt=d=>`${d.getFullYear()}${pad2(d.getMonth()+1)}${pad2(d.getDate())}T${pad2(d.getHours())}${pad2(d.getMinutes())}00`;
function calSheet(e){const[st,en]=evTimes(e);const det=`${e.d}\n\n${evLink(e)}`;const loc=`${e.venue}, ${e.addr}`;
 const g=`https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(e.t)}&dates=${gfmt(st)}/${gfmt(en)}&ctz=Europe/Rome&details=${encodeURIComponent(det)}&location=${encodeURIComponent(loc)}`;
 const iso=d=>`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:00`;
 const o=`https://outlook.live.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=${encodeURIComponent(e.t)}&startdt=${iso(st)}&enddt=${iso(en)}&location=${encodeURIComponent(loc)}&body=${encodeURIComponent(det)}`;
 sheet(`<div class="grab"></div><h2>Aggiungi al calendario</h2><p class="mut sm" style="margin:4px 0 0">${esc(e.t)} · ${e.day} · ${e.time}–${e.end}</p>
 <div class="lst" style="margin-top:14px"><a class="pay" href="${g}" target="_blank" rel="noopener"><span class="ic" style="background:var(--redt);color:var(--redtx)">${ic('calendar_month')}</span><span class="sp"><b>Google Calendar</b><br><span class="mut sm">Si apre in una nuova finestra</span></span>${ic('open_in_new')}</a>
 <a class="pay" href="${o}" target="_blank" rel="noopener"><span class="ic" style="background:var(--goldt);color:var(--goldink)">${ic('event')}</span><span class="sp"><b>Outlook</b><br><span class="mut sm">Outlook.com / Microsoft 365</span></span>${ic('open_in_new')}</a>
 <button class="pay" data-act="copy" data-txt="${esc(e.t+' — '+e.day+' '+e.time+'-'+e.end+' — '+loc+' — '+evLink(e))}"><span class="ic" style="background:var(--soft)">${ic('content_copy')}</span><span class="sp"><b>Apple Calendar o altro</b><br><span class="mut sm">Copia i dettagli e incollali nel nuovo evento</span></span></button></div>`)}

/* ---------- condivisione ---------- */
function shareSheet(e){const url=evLink(e);const txt=`${e.t} · ${e.day} ${e.time} · ${e.venue}, Palermo`;const enc=encodeURIComponent;
 sheet(`<div class="grab"></div><h2>Condividi evento</h2><p class="mut sm" style="margin:4px 0 0">Il link apre direttamente la pagina di questo evento.</p>
 <div class="linkbox">${ic('link')}<code>${esc(url)}</code><button class="btn sm" data-act="copy" data-txt="${esc(url)}">Copia</button></div>
 <div class="shr"><a href="https://wa.me/?text=${enc(txt+' 👉 '+evLink(e,'whatsapp'))}" target="_blank" rel="noopener">${ic('chat')}WhatsApp</a><a href="https://t.me/share/url?url=${enc(evLink(e,'telegram'))}&text=${enc(txt)}" target="_blank" rel="noopener">${ic('send')}Telegram</a><a href="https://www.facebook.com/sharer/sharer.php?u=${enc(evLink(e,'facebook'))}" target="_blank" rel="noopener">${ic('thumb_up')}Facebook</a><a href="https://twitter.com/intent/tweet?text=${enc(txt)}&url=${enc(evLink(e,'x'))}" target="_blank" rel="noopener">${ic('alternate_email')}X</a></div>
 <button class="btn gold w" style="margin-top:14px" data-act="story" data-id="${e.id}">${ic('photo_camera')}Crea la card per le storie</button><div id="storyout"></div>`)}
function wrapText(ctx,t,maxW){const words=t.split(' ');const L=[];let cur='';for(const w of words){const tt=cur?cur+' '+w:w;if(ctx.measureText(tt).width>maxW&&cur){L.push(cur);cur=w}else cur=tt}if(cur)L.push(cur);return L}
async function makeStory(e){const out=$('#storyout');if(!out)return;out.innerHTML=`<p class="mut sm" style="text-align:center;margin-top:12px">Creo la card…</p>`;
 try{await Promise.race([Promise.all([document.fonts.load('120px Anton'),document.fonts.load('600 40px Montserrat'),document.fonts.load('800 40px Montserrat'),document.fonts.load('200px "Material Symbols Outlined"')]),new Promise(r=>setTimeout(r,2500))])}catch(x){}
 const load=src=>new Promise(r=>{const i=new Image();i.onload=()=>r(i);i.onerror=()=>r(null);i.src=src});
 const ill=URL.createObjectURL(new Blob([scene(venueOf(e).k,{night:isNight(e),seed:hash(e.id)}).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="702" ')],{type:'image/svg+xml'}));
 const[ph,logo]=await Promise.all([load(e.photo||ill),load('img/logo.jpg')]);
 const c=document.createElement('canvas');c.width=1080;c.height=1920;const x=c.getContext('2d');
 let g=x.createRadialGradient(540,600,100,540,900,1400);g.addColorStop(0,'#ff1f1f');g.addColorStop(.45,'#E00000');g.addColorStop(.8,'#7a0000');g.addColorStop(1,'#171717');x.fillStyle=g;x.fillRect(0,0,1080,1920);
 const PH=1060;if(ph){const r=Math.max(1080/ph.width,PH/ph.height),w=ph.width*r,h=ph.height*r;x.drawImage(ph,(1080-w)/2,(PH-h)/2,w,h)}else{x.fillStyle='rgba(0,0,0,.25)';x.fillRect(0,0,1080,PH);x.fillStyle='#FFC107';x.font='420px "Material Symbols Outlined"';x.textAlign='center';x.fillText(e.ico||'event',540,700);x.textAlign='left'}
 g=x.createLinearGradient(0,PH-420,0,PH+40);g.addColorStop(0,'rgba(224,0,0,0)');g.addColorStop(1,'#E00000');x.fillStyle=g;x.fillRect(0,PH-420,1080,460);
 if(logo){x.save();x.shadowColor='rgba(0,0,0,.35)';x.shadowBlur=30;x.drawImage(logo,64,64,190,190);x.restore()}
 x.fillStyle='#FFC107';const cat=catName(e.cat).toUpperCase();x.font='800 34px Montserrat';const cw=x.measureText(cat).width+48;x.beginPath();x.roundRect(64,PH-150,cw,62,31);x.fill();x.fillStyle='#171717';x.fillText(cat,88,PH-108);
 x.fillStyle='#fff';x.font='128px Anton';let y=PH+120;for(const l of wrapText(x,e.t.toUpperCase(),950).slice(0,3)){x.fillText(l,64,y);y+=134}
 x.font='600 44px Montserrat';x.fillStyle='#FFC107';x.fillText(`${e.day.toUpperCase()} · ${e.time}`,64,y+16);x.fillStyle='#fff';x.fillText(`${e.venue}, Palermo`,64,y+80);
 x.fillStyle='#FFC107';x.fillRect(64,1700,952,4);x.font='60px Anton';x.fillStyle='#fff';x.fillText(LANG==='en'?'FEEL THE PULSE OF YOUR CITY.':'VIVI IL BATTITO DELLA TUA CITTÀ.',64,1790);
 x.font='600 30px Montserrat';x.fillStyle='rgba(255,255,255,.85)';x.fillText((LANG==='en'?'Tickets on City Pulse · A JH STUDIOS production':'Biglietti su City Pulse · Una produzione JH STUDIOS'),64,1850);
 let url;try{url=c.toDataURL('image/jpeg',.9)}catch(err){out.innerHTML=`<p class="mut sm">${LANG==='en'?'Could not create the card here.':'Non è stato possibile creare la card qui.'}</p>`;return}
 out.innerHTML=`<img class="story" src="${url}" alt="Card per le storie: ${esc(e.t)}"><p class="sm mut" style="text-align:center">Tieni premuto sull'immagine (o tasto destro → Salva immagine) e pubblicala nelle storie. Aggiungi lo sticker link con l'indirizzo dell'evento.</p><button class="btn sec2 w" data-act="copy" data-txt="${esc(evLink(e,'instagram'))}">${ic('link')}Copia link per lo sticker</button>`}

/* ---------- social ---------- */
function friendsSheet(e){const F=friendsAt(e);sheet(`<div class="grab"></div><h2>${e.past?'Chi c\'era':'Chi ci va'}</h2><p class="mut sm" style="margin:4px 0 12px">${esc(e.t)} · ${pplOf(e)+(S.going.has(e.id)?1:0)} persone</p>
 ${S.going.has(e.id)?`<div class="set"><span class="fav-i" style="background:var(--red);width:42px;height:42px;margin:0">MR</span><div class="sp"><b>Tu</b><small>Hai detto “Ci vado”</small></div></div>`:''}
 ${F.map(f=>`<div class="set"><span class="fav-i" style="background:${f.c};width:42px;height:42px;margin:0">${ini(f.n)}</span><div class="sp"><b>${esc(f.n)}</b><small>${f.go.length} eventi su City Pulse</small></div><span class="tag ok">${ic('check')}${e.past?'C\'era':'Ci va'}</span></div>`).join('')||'<p class="mut">Nessuno dei tuoi amici, per ora.</p>'}
 <p class="xs mut">Amici di esempio.</p>${e.past?'':`<button class="btn w" data-act="share" data-id="${e.id}">${ic('person_add')}Invita altri amici</button>`}`)}

/* ---------- recensioni ---------- */
let RV={stars:0,photos:[]};
function reviewSheet(e){RV={stars:0,photos:[],id:e.id};drawReview(e)}
function drawReview(e){sheet(`<div class="grab"></div><h2>La tua recensione</h2><p class="mut sm" style="margin:4px 0 0">${esc(e.t)} · ${e.day}</p><div class="row sm" style="margin-top:8px;color:var(--ok);font-weight:700">${ic('verified','fill')}Biglietto verificato</div>
 <form id="rvform"><div class="starpick" role="radiogroup" aria-label="Voto">${[1,2,3,4,5].map(i=>`<button type="button" data-act="rvstar" data-v="${i}" aria-label="${i} stelle" aria-checked="${RV.stars===i}" role="radio">${ic('star',i<=RV.stars?'fill':'')}</button>`).join('')}</div>
 <label class="lb" for="rvtxt">Racconta com'è andata</label><div class="input" style="align-items:flex-start"><textarea id="rvtxt" rows="4" maxlength="600" style="flex:1;border:0;background:transparent;outline:0;font-size:16px;padding:12px 0;resize:vertical" placeholder="Musica, atmosfera, organizzazione…">${esc(RV.txt||'')}</textarea></div>
 <label class="lb">Foto (fino a 3)</label><div class="ph3" id="rvph">${RV.photos.map((u,i)=>`<img src="${u}" alt="Foto ${i+1}">`).join('')}${RV.photos.length<3?`<label class="btn sec2" style="width:84px;height:84px;border-radius:12px;flex-direction:column;gap:2px;font-size:12px;cursor:pointer">${ic('add_a_photo')}Aggiungi<input type="file" accept="image/*" multiple id="rvfile" style="display:none"></label>`:''}</div>
 <div class="grid2" style="margin-top:16px"><button type="button" class="btn sec2" data-act="close">Annulla</button><button class="btn" type="submit">${ic('send')}Pubblica</button></div></form>`)}
function shrinkBig(file){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,1000/Math.max(i.width,i.height));const c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',.74))};i.onerror=()=>r(null);i.src=fr.result};fr.onerror=()=>r(null);fr.readAsDataURL(file)})}
function shrink(file){return new Promise(r=>{const fr=new FileReader();fr.onload=()=>{const i=new Image();i.onload=()=>{const k=Math.min(1,720/Math.max(i.width,i.height));const c=document.createElement('canvas');c.width=Math.round(i.width*k);c.height=Math.round(i.height*k);c.getContext('2d').drawImage(i,0,0,c.width,c.height);r(c.toDataURL('image/jpeg',.72))};i.onerror=()=>r(null);i.src=fr.result};fr.onerror=()=>r(null);fr.readAsDataURL(file)})}

/* ---------- filtri ---------- */
function filterSheet(){const f=S.f;const n=filt().length;
 sheet(`<div class="grab"></div><div class="row"><h2 class="sp">Filtri</h2><button class="link" data-act="freset2">Azzera</button></div>
 <div class="card pad" style="margin-top:12px"><div class="row"><b class="sp">Fascia di prezzo</b><b style="color:var(--redtx)" id="fmaxl">${f.max>=50?'Qualsiasi prezzo':'Fino a €'+f.max}</b></div><input type="range" id="fmax" min="0" max="50" step="5" value="${f.max}" aria-label="Prezzo massimo"><div class="row xs mut" style="justify-content:space-between"><span>Gratis</span><span>€25</span><span>€50+</span></div></div>
 <div class="card pad" style="margin-top:10px">
 ${[['free','money_off','Solo eventi gratis','Ingresso libero o con prenotazione gratuita'],['now','schedule','Aperto ora','Eventi già iniziati, in corso in questo momento'],['acc','accessible','Accessibile','Accesso totale per persone con disabilità motoria']].map(([k,i,t,d])=>`<div class="set"><span class="ic">${ic(i)}</span><div class="sp"><b>${t}</b><small>${d}</small></div><label class="tg"><input type="checkbox" data-f="${k}" ${f[k]?'checked':''} aria-label="${t}"><span></span></label></div>`).join('')}</div>
 <div class="card pad" style="margin-top:10px"><b>Distanza dai Quattro Canti</b><div class="seg" style="margin-top:10px">${[[0,'Qualsiasi'],[1,'1 km'],[2,'2 km'],[5,'5 km']].map(([v,l])=>`<button class="${f.dist===v?'on':''}" data-act="fdist" data-v="${v}">${l}</button>`).join('')}</div></div>
 <button class="btn w" style="margin-top:14px" data-act="close" id="fapply">${n===1?'Mostra 1 evento':'Mostra '+n+' eventi'}</button>`)}
function fRefresh(){const r=$('#res');if(r)r.innerHTML=resEsplora();const b=$('#fapply');if(b){const n=filt().length;b.textContent=LANG==='en'?`Show ${n} event${n===1?'':'s'}`:`Mostra ${n} event${n===1?'o':'i'}`}const l=$('#fmaxl');if(l)l.textContent=S.f.max>=50?(LANG==='en'?'Any price':'Qualsiasi prezzo'):(LANG==='en'?'Up to €':'Fino a €')+S.f.max}

