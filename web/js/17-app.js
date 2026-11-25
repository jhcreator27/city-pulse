// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- router ---------- */
const app=$('#app');
function render(keep){applyPrices();
 const h=(location.hash||'#esplora').slice(1);let html;
 if(h.startsWith('evento-'))html=vEvento(h.slice(7));
 else if(h.startsWith('regalo-'))html=vRegalo(h.slice(7));
 else if(h.startsWith('luogo-'))html=vLuogo(h.slice(6));
 else if(h.startsWith('artista-'))html=vArtista(h.slice(8));
 else if(h.startsWith('org-ev-'))html=vOrgEv(h.slice(7));
 else if(h.startsWith('org-prezzi-'))html=vOrgPrezzi(h.slice(11));
 else if(h.startsWith('org-report-'))html=vOrgReport(h.slice(11));
 else html=((window.CPB?.enabled&&CPB.views[h])?CPB.views[h]():null)??({esplora:vEsplora,mappa:vMappa,checkout:vCheckout,conferma:vConferma,biglietti:()=>vBiglietti(S.btab==='fav'?'tickets':S.btab),preferiti:()=>vBiglietti('fav'),profilo:vProfilo,gusti:vGusti,notifiche:vNotifiche,staff:vStaff,accrediti:vAccrediti,'pass-ospite':vPass,cronologia:vCrono,calendario:vCalendario,luoghi:vLuoghi,artisti:vArtisti,org:vOrg,'org-eventi':vOrgEventi,'org-nuovo':vOrgNuovo,'org-promo':vOrgPromo,'org-team':vOrgTeam,...XR}[h]||vEsplora)();
 window.CPB?.onRoute?.(h);const y=window.scrollY;app.innerHTML=html;window.scrollTo(0,keep?y:0);drawCharts();
 if(!keep&&!$('#intro')){const hd=$('#app h1');if(hd){hd.tabIndex=-1;try{hd.focus({preventScroll:true})}catch(x){}}}
 {const md=document.querySelector('meta[name=description]');const ev=h.startsWith('evento-')&&E(h.slice(7));if(md)md.content=ev?`${ev.t} · ${ev.day} ${ev.time} · ${ev.venue}, Palermo`:'City Pulse: concerti, spettacoli, feste, sagre, cultura e movida a Palermo. Una produzione JH STUDIOS.';if(ev){document.title=`${ev.t} · ${ev.venue} | City Pulse`}}
 if(!h.startsWith('evento-'))document.title='City Pulse – '+(({esplora:'Esplora',mappa:'Mappa',biglietti:'Biglietti',preferiti:'Preferiti',profilo:'Profilo',staff:'Check-in',accrediti:'Accrediti',cronologia:'Cronologia',calendario:'Calendario',account:'Account e privacy',amici:'Amici',admin:'Admin'})[h]||'Eventi Palermo');
}
const rr=()=>render(true);
const HIST=[location.hash.slice(1)||'esplora'];
window.addEventListener('hashchange',()=>{const h=location.hash.slice(1);if(h==='checkout'||h==='conferma'||HIST[HIST.length-1]!==h)HIST.push(h);if(h==='conferma'){HIST.length=0;HIST.push('biglietti','conferma')}render(false)});

/* ---------- UI helper ---------- */
let tt;function toast(m,i='check_circle'){const d=document.createElement('div');d.className='toast';d.setAttribute('role','status');d.innerHTML=ic(i)+esc(m);document.querySelectorAll('.toast').forEach(x=>x.remove());document.body.append(d);clearTimeout(tt);tt=setTimeout(()=>d.remove(),2600)}
let OPENER=null;
function sheet(html){if(!$('#layer .sheet'))OPENER=document.activeElement;$('#layer').innerHTML=`<div class="scrim" id="scrim"><div class="sheet" role="dialog" aria-modal="true">${html}</div></div>`;const f=$('#layer input,#layer button:not([data-act=close])');f&&f.focus()}
const closeSheet=()=>{const had=!!$('#layer .sheet');$('#layer').innerHTML='';if(had&&OPENER&&document.contains(OPENER))try{OPENER.focus()}catch(x){}OPENER=null};
async function copy(t){try{await navigator.clipboard.writeText(t);toast('Copiato negli appunti','content_copy')}catch(e){sheet(`<div class="grab"></div><h3>Copia manualmente</h3><textarea style="width:100%;min-height:120px;margin-top:10px;border-radius:12px;padding:10px;border:1px solid var(--line);background:var(--card)" readonly>${esc(t)}</textarea><button class="btn w" style="margin-top:10px" data-act="close">Chiudi</button>`)}}
function validate(a,m){a.s='ok';a.at=now();a.m=m||'QR app';a.gate=S.gate;S.staff.inside=Math.min(S.staff.cap,S.staff.inside+1);S.lastScan={...a,ok:1};save()}

/* ---------- azioni ---------- */
const A={
 back(el){if(HIST.length>1){HIST.pop();const p=HIST.pop();location.hash=p}else location.hash=el.dataset.to||'esplora'},
 city(){sheet(`<div class="grab"></div><h2>Scegli la città</h2><div class="lst" style="margin-top:14px">${[['Palermo','11 eventi in programma',1],['Catania','In arrivo'],['Messina','In arrivo'],['Trapani','In arrivo'],['Agrigento','In arrivo']].map(([c,d,on])=>`<button class="pay ${on?'on':''}" data-act="${on?'close':'soon'}"><span class="ic" style="background:var(--redt);color:var(--redtx)">${ic('location_city')}</span><span class="sp"><b>${c}</b><br><span class="mut sm">${d}</span></span><span class="radio"></span></button>`).join('')}</div>`)},
 soon(){closeSheet();toast('Questa città arriverà presto su City Pulse','schedule')},
 close(){const f=!!$('#fapply');closeSheet();if(f)rr()},
 intro(){intro(0,false)},
 ob(el){intro(+el.dataset.s,false)},
 obcat(el){const a=S.taste.cats||(S.taste.cats=[]),k=el.dataset.k;a.includes(k)?a.splice(a.indexOf(k),1):a.push(k);intro(1,false)},
 obzone(el){const a=S.prefs.zones,k=el.dataset.k;a.includes(k)?a.splice(a.indexOf(k),1):a.push(k);intro(2,false)},
 obdone(){store.set('onb',1);save();closeIntro();if(!location.hash.startsWith('#evento-'))location.hash='esplora';render()},
 when(el){S.when=el.dataset.k;rr()},cat(el){S.cat=el.dataset.k;rr()},reset(){S.when='tutti';S.cat='tutti';S.q='';S.f={max:50,free:false,now:false,dist:0,acc:false};render()},
 fav(el){const id=el.dataset.id;S.fav.has(id)?S.fav.delete(id):S.fav.add(id);save();toast(S.fav.has(id)?'Aggiunto ai preferiti':'Rimosso dai preferiti','favorite');rr()},
 mpin(el){S.mapSel=el.dataset.id;rr()},mcat(el){S.mapCat=el.dataset.k;rr()},locate(){S.mapCat='tutti';S.mapSel='naviglio';rr();toast('Centrato sui Quattro Canti','my_location')},
 share(el){shareSheet(E(el.dataset.id))},
 story(el){makeStory(E(el.dataset.id))},
 calsheet(el){calSheet(E(el.dataset.id))},
 calm(el){let[y,m]=S.calM;m+= +el.dataset.d;if(m<0){m=11;y--}if(m>11){m=0;y++}S.calM=[y,m];S.calSel=null;rr()},
 calday(el){S.calSel=el.dataset.k||null;rr()},
 going(el){const id=el.dataset.id;if(S.going.has(id)){S.going.delete(id);toast(LANG==='en'?'Removed from your plans':'Rimosso dai tuoi programmi','event_busy')}else{S.going.add(id);toast(LANG==='en'?'Great! Your friends will see you\'re going':'Ottimo! I tuoi amici vedranno che ci vai','how_to_reg')}save();rr()},
 friends(el){friendsSheet(E(el.dataset.id))},
 invite(){copy((LANG==='en'?'Discover Palermo events with me on City Pulse: ':'Scopri gli eventi di Palermo con me su City Pulse: ')+SHARE_BASE)},
 review(el){reviewSheet(E(el.dataset.id))},
 rvstar(el){RV.txt=$('#rvtxt')?.value||'';RV.stars=+el.dataset.v;drawReview(E(RV.id))},
 filters(){filterSheet()},
 fdist(el){S.f.dist=+el.dataset.v;el.parentNode.querySelectorAll('button').forEach(b=>b.classList.toggle('on',b===el));fRefresh()},
 freset(){S.f={max:50,free:false,now:false,dist:0,acc:false};rr()},
 freset2(){S.f={max:50,free:false,now:false,dist:0,acc:false};filterSheet();fRefresh()},
 fclr(el){const k=el.dataset.k;if(k==='max')S.f.max=50;else if(k==='dist')S.f.dist=0;else S.f[k]=false;rr()},
 follow(el){const a=artistBy(el.dataset.id);if(!a)return;if(S.follow.has(a.id)){S.follow.delete(a.id);toast(LANG==='en'?`You no longer follow ${a.n}`:`Non segui più ${a.n}`,'notifications_off')}else{S.follow.add(a.id);toast(LANG==='en'?`We'll alert you about ${a.n}'s new dates`:`Ti avviseremo delle nuove date di ${a.n}`,'notifications_active')}save();rr()},
 vshare(el){const v=VEN.find(x=>x.id===el.dataset.id);copy(`${v.n} · ${v.addr} — ${SHARE_BASE}#luogo-${v.id}`)},
 gate(el){S.gate=el.dataset.k;rr()},
 'code-toggle'(el){ORG_API.toggleCode(el.dataset.k);rr()},
 'code-del'(el){ORG_API.delCode(el.dataset.k);toast(LANG==='en'?'Code deleted':'Codice eliminato','delete');rr()},
 'team-del'(el){ORG_API.removeMember(+el.dataset.i);rr()},
 'msg-open'(el){messageSheet(E(el.dataset.id))},
 'msg-tpl'(el){const t=MSGT[+el.dataset.k];$('#msg-t').value=t[1];$('#msg-b').value=t[2];$('#msg-b').focus()},
 billing(){billingSheet()},
 print(){const inFrame=(()=>{try{return window.self!==window.top}catch(x){return true}})();if(inFrame){toast(LANG==='en'?'PDF download works in the online version: open the report from your City Pulse site':'Il PDF si scarica dalla versione online: apri il report dal sito City Pulse','picture_as_pdf');return}window.print()},
 orgnew(){S.draft=newDraft();if(location.hash==='#org-nuovo')render();else location.hash='org-nuovo'},
 of(el){S.of=el.dataset.k;rr()},
 orgedit(el){editDraft(E(el.dataset.id));if(location.hash==='#org-nuovo')render();else location.hash='org-nuovo'},
 evcancel(){S.draft=null;location.hash='org-eventi'},
 evsave(el){saveEvent(true)},
 dfcat(el){keepDraft();S.draft.cat=el.dataset.k;rr()},
 dfnophoto(){keepDraft();S.draft.photo='';rr()},
 luadd(){keepDraft();const l=S.draft.lu;l.push([l.length?l[l.length-1][0]:S.draft.time,'Live','','']);rr()},
 ludel(el){keepDraft();S.draft.lu.splice(+el.dataset.i,1);if(!S.draft.lu.length)S.draft.lu.push([S.draft.time,'Opening','','']);rr()},
 tiadd(){keepDraft();S.draft.tiers.push(['',0,50]);rr()},
 tidel(el){keepDraft();if(S.draft.tiers.length>1)S.draft.tiers.splice(+el.dataset.i,1);rr()},
 'promo-open'(el){promoSheet(el.dataset.id,el.dataset.pkg)},
 'promo-pkg'(el){promoSheet($('#pr-ev')?.value,el.dataset.k)},
 'promo-buy'(el){const id=$('#pr-ev')?.value;if(!id){toast(LANG==='en'?'No event to promote':'Nessun evento da promuovere','error');return}const pk=PKG.find(x=>x[0]===el.dataset.k);const until=new Date(TODAY.getTime()+(pk[3]-1)*864e5);PROMO[id]={pkg:pk[0],until:ymd(until)+'T23:59',price:pk[2],imp:pk[3]*(2400+hash(id)%1800)};saveOrg();closeSheet();toast((LANG==='en'?'Featured! ':'In evidenza! ')+E(id).t,'star');rr()},
 orgcsv(el){const e=E(el.dataset.id),x=salesOf(e);copy('tipo,prezzo,venduti,incasso\n'+x.tiers.map(t=>`"${t[0].replace(/"/g,'""')}",${t[1]},${t[2]},${(t[1]*t[2]).toFixed(2)}`).join('\n')+`\n\ngiorno,venduti\n`+x.days.map((v,i)=>dayLbl(i)+','+v).join('\n'))},
 orgdel(el){const e=E(el.dataset.id);sheet(`<div class="grab"></div><h2>Eliminare l'evento?</h2><p class="mut">${esc(e.t)} sparirà da Esplora, Mappa e Calendario.</p><div class="grid2" style="margin-top:14px"><button class="btn sec2" data-act="close">Annulla</button><button class="btn" data-act="orgdel2" data-id="${e.id}">Elimina</button></div>`)},
 orgdel2(el){const id=el.dataset.id;EV.splice(EV.findIndex(e=>e.id===id),1);S.myev=S.myev.filter(m=>m.id!==id);delete PROMO[id];saveOrg();closeSheet();toast(LANG==='en'?'Event deleted':'Evento eliminato','delete');location.hash='org-eventi'},
 lang(){LANG=LANG==='it'?'en':'it';store.set('lang',LANG);document.documentElement.lang=LANG;relabel();closeSheet();if($('#intro'))intro(IST,false);rr();toast(LANG==='en'?'Language: English':'Lingua: Italiano','translate')},
 buy(el){const e=E(el.dataset.id);if(isOff(e))return;if(needsPhone(e)){phoneSheet(()=>A.buy(el));return}S.cart={ev:e.id,qty:{[tiers(e)[0][0]]:1},pay:'apple',promo:false,name:'Marco Rossi',mail:'marco.rossi@example.com',tel:'+39 348 765 4321'};S.timer=600;location.hash='checkout'},
 qty(el){const c=S.cart,k=el.dataset.k;keepForm();c.qty[k]=Math.max(0,Math.min(4,(c.qty[k]||0)+ +el.dataset.d));rr()},
 pay(el){keepForm();S.cart.pay=el.dataset.k;rr()},
 promo(){keepForm();const v=($('#promo').value||'').trim();const e=E(S.cart.ev);ORG_API.checkCode(e,v).then(r=>{if(r&&r.valid){S.cart.code=r;toast(LANG==='en'?'Discount applied':'Sconto applicato','sell')}else{S.cart.code=null;toast(LANG==='en'?'Invalid or expired code':'Codice non valido o scaduto','error')}rr()})},
 checkout(){keepForm();const c=S.cart;if(!c.name.trim()||!/\S+@\S+\.\S+/.test(c.mail)){toast('Inserisci nome ed email validi','error');$('#hn')?.focus();return}
  const e=E(c.ev),T=totals();const items=tiers(e).filter(([k])=>c.qty[k]).map(([k,n,,p])=>[n,c.qty[k],Math.round(T.lines[k]/c.qty[k]*100)/100]);if(c.code){const cc=S.codes.find(x=>x.code===c.code.code);if(cc)cc.used++}(S.sim[e.id]=S.sim[e.id]||{t:{},d:0});
  const r=Math.floor(1000+Math.random()*9000);const d=new Date();
  const dn=T.dinner;S.tickets.unshift({dinner:dn?{n:dn.r.n,title:dn.r.title,addr:dn.r.addr,slot:dn.slot,people:dn.people,code:'CENA-'+String(r).slice(0,4)+'A'}:null,code:`CP-${r}-${c.qty.vip?'VIP':'STD'}`,oid:`CP-${r+417}-PA`,ev:e.id,holder:c.name.trim(),mail:c.mail.trim(),items,fee:T.fee,disc:T.disc,total:T.tot,when:d.toLocaleDateString('it-IT',{day:'numeric',month:'short',year:'numeric'})+', '+now(),pay:T.sub?{apple:'Apple Pay (•••• 4242)',card:'Mastercard •••• 4242',pp:'Satispay / PayPal'}[c.pay]:'Prenotazione gratuita'});
  S.cart=null;save();location.hash='conferma'},
 btab(el){S.btab=el.dataset.k;rr()},
 wallet(){toast('Pass pronto: aggiungilo al Wallet dall\'app sul telefono','account_balance_wallet')},
 copy(el){copy(el.dataset.txt)},
 theme(){const r=document.documentElement;const d=r.dataset.theme==='dark'||(!r.dataset.theme&&matchMedia('(prefers-color-scheme: dark)').matches);r.dataset.theme=d?'light':'dark';store.set('theme',r.dataset.theme)},
 'reset-all'(){['fav','tickets','prefs','taste','staff','guests'].forEach(k=>{try{localStorage.removeItem('cp2_'+k)}catch(e){}});location.hash='esplora';location.reload()},
 logout(){toast('Sei uscito. A presto in città!','logout')},
 gen(el){const k=el.dataset.k;if(S.taste.lv[k]!==undefined)delete S.taste.lv[k];else S.taste.lv[k]=1;rr()},
 lv(el){S.taste.lv[el.dataset.k]=+el.dataset.v;rr()},
 subg(el){const k=el.dataset.k,a=S.taste.sub;a.includes(k)?a.splice(a.indexOf(k),1):a.push(k);rr()},
 mood(el){const k=el.dataset.k,a=S.taste.mood;a.includes(k)?a.splice(a.indexOf(k),1):a.push(k);rr()},
 savegusti(){save();toast('Preferenze aggiornate! Il tuo feed è pronto.','celebration')},
 remind(el){S.prefs.remind=el.dataset.k;rr()},
 zone(el){const k=el.dataset.k,a=S.prefs.zones;a.includes(k)?a.splice(a.indexOf(k),1):a.push(k);rr()},
 savenoti(){save();toast('Preferenze salvate per Palermo!','done_all')},
 torch(){S.torch=!S.torch;rr()},
 simscan(){const s=S.staff;const scan=$('#scan');let a=s.att.find(x=>x.s==='wait');let res;
  if(!a){const n=['Paolo Ricci','Marta Greco','Simone Fontana','Irene Gallo','Tommaso Costa','Alice Marino'][hash(String(Date.now()))%6];a={n,type:'Ingresso Standard',code:String(10000+Math.floor(Math.random()*89999)),note:'Acquistato in app',s:'wait'};s.att.push(a)}
  if(Math.random()<.12&&s.att.some(x=>x.s==='ok')){const d=s.att.filter(x=>x.s==='ok').pop();S.lastScan={...d,ok:0,msg:'Già entrato',at:now()};res=['ko','block',`Già entrato alle ${d.at}`]}
  else{validate(a,['Apple Wallet NFC','QR app','Google Wallet'][hash(a.code)%3]);res=['ok','verified','Biglietto valido']}
  if(scan){scan.insertAdjacentHTML('beforeend',`<div class="res ${res[0]}"><div>${ic(res[1],'fill')}${res[2]}</div></div>`)}
  setTimeout(()=>rr(),900)},
 pinsheet(){sheet(`<div class="grab"></div><h2>Inserimento PIN rapido</h2><p class="mut sm">Se il QR è illeggibile o il display è rotto, digita le 5 cifre del codice univoco. Prova 10492 o 44021.</p><form id="pinf"><div class="pinin">${[0,1,2,3,4].map(i=>`<input inputmode="numeric" maxlength="1" pattern="[0-9]" aria-label="Cifra ${i+1}" data-pin="${i}">`).join('')}</div><div class="grid2"><button type="button" class="btn sec2" data-act="close">Annulla</button><button class="btn" type="submit">${ic('search')}Trova & valida</button></div></form>`)},
 af(el){S.af=el.dataset.k;rr()},gf(el){S.gf=el.dataset.k;rr()},
 valid(el){const a=S.staff.att[+el.dataset.i];validate(a,'Lista manuale');toast(`Ingresso convalidato! ${a.n} può accedere.`,'verified');rr()},
 verify(el){const i=+el.dataset.i,a=S.staff.att[i];sheet(`<div class="grab"></div><h2>Verifica documento</h2><p class="mut">${esc(a.n)} • ${esc(a.type)}</p><div class="card pad" style="margin:12px 0">${ic('id_card')} ${esc(a.note)}</div><div class="grid2"><button class="btn sec2" data-act="close">Non idoneo</button><button class="btn" data-act="valid" data-i="${i}">${ic('check')}Documento ok</button></div>`)},
 undo(el){const a=S.staff.att[+el.dataset.i];a.s='wait';delete a.at;S.staff.inside--;save();toast('Ingresso annullato','undo');rr()},
 newguest(){sheet(guestSheet())},
 gtype(el){el.parentNode.querySelectorAll('.chip').forEach(c=>c.classList.toggle('on',c===el))},
 gpax(el){el.parentNode.querySelectorAll('button').forEach(c=>c.classList.toggle('on',c===el))},
 gok(el){const g=S.guests.find(x=>x.code===el.dataset.c);g.ok=1;g.kit='Kit consegnato alle '+now();save();rr()},
 gopen(el){const i=S.guests.findIndex(x=>x.code===el.dataset.c);S.guests.unshift(...S.guests.splice(i,1));location.hash='pass-ospite'},
 csv(){copy('ora,nome,tipologia,pax,codice,stato\n'+S.guests.map(g=>[g.at,g.n,g.type,g.pax,g.code,g.ok?'convalidato':'in attesa'].map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n'))}
};
Object.assign(A,AX,AP);
function keepForm(){const c=S.cart;if(!c)return;const v=id=>{const x=$('#'+id);return x?x.value:null};c.name=v('hn')??c.name;c.mail=v('he')??c.mail;c.tel=v('hp')??c.tel;c.age=v('h-age')??c.age;c.orig=v('h-orig')??c.orig}

document.addEventListener('click',ev=>{if(ev.target.id==='scrim'){const f=!!$('#fapply');closeSheet();if(f)rr();return}const it=$('#intro');if(it&&it.dataset.auto&&it.contains(ev.target)){closeIntro();return}const el=ev.target.closest('[data-act]');if(!el)return;if(window.CPB?.enabled&&CPB.intercept(el.dataset.act,el,ev)){ev.preventDefault();return}const f=A[el.dataset.act];if(f){if(el.tagName==='A'&&el.getAttribute('href')?.startsWith('http'))return;ev.preventDefault();f(el,ev)}});
document.addEventListener('input',ev=>{const t=ev.target;
 if(t.id==='q'){S.q=t.value;$('#res').innerHTML=resEsplora()}
 else if(t.id==='pq'){S.pq=t.value;const r=t.value.trim().length>=2?DQ.search(t.value):null;Promise.resolve(r).then(x=>{const o=$('#pres');if(o)o.innerHTML=x?peopleRes(x):''})}
 else if(t.id==='aq'){S.aq=t.value;const s=S.staff,q=t.value.toLowerCase();$('#alist').innerHTML=s.att.map((a,i)=>[a,i]).filter(([a])=>!q||(a.n+' '+a.code+' '+a.type).toLowerCase().includes(q)).map(([a,i])=>attRow(a,i)).join('')||'<div class="empty">Nessun partecipante trovato.</div>'}
 else if(t.id==='gq'){S.gq=t.value;const p=t.selectionStart;rr();const n=$('#gq');n.focus();n.setSelectionRange(p,p)}
 else if(t.id==='mq'){const q=t.value.toLowerCase();const e=EV.find(e=>(e.t+e.zone+e.venue).toLowerCase().includes(q));if(q&&e&&e.id!==S.mapSel){S.mapCat='tutti';S.mapSel=e.id;const p=t.selectionStart;rr();const n=$('#mq');n.value=t.value;n.focus();n.setSelectionRange(p,p)}}
 else if(t.dataset.df||t.dataset.lu||t.dataset.ti){keepDraft();const pv=$('#prev');if(pv)pv.innerHTML=previewCard()}
 else if(t.id==='fmax'){S.f.max=+t.value;fRefresh()}
 else if(t.id==='freq'){S.taste.freq=+t.value;$('#fq').textContent=FREQ[t.value]}
 else if(t.dataset.pin!==undefined){t.value=t.value.replace(/\D/g,'').slice(-1);if(t.value)t.nextElementSibling?.focus()}
});
document.addEventListener('keydown',ev=>{
 if(ev.key==='Tab'){const sh=$('#layer .sheet');if(sh){const f=[...sh.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled);if(f.length){const a=f[0],z=f[f.length-1];if(ev.shiftKey&&document.activeElement===a){ev.preventDefault();z.focus()}else if(!ev.shiftKey&&document.activeElement===z){ev.preventDefault();a.focus()}}}}
 if((ev.key==='Enter'||ev.key===' ')&&ev.target.matches?.('[data-act][role=button]:not(button)')){ev.preventDefault();ev.target.dispatchEvent(new MouseEvent('click',{bubbles:true}))}if(ev.key==='Escape')closeSheet();const t=ev.target;if(t.dataset?.pin!==undefined&&ev.key==='Backspace'&&!t.value)t.previousElementSibling?.focus()});
document.addEventListener('change',async ev=>{const t=ev.target;
 if(t.dataset.team){ORG_API.setMember(+t.dataset.team,{[t.dataset.tf]:t.value});toast(LANG==='en'?'Team updated':'Team aggiornato','groups');return}
 if(t.dataset.f){S.f[t.dataset.f]=t.checked;fRefresh();return}

 if(t.id==='orglive'){S.live=t.checked;rr();return}
 if(t.id==='f-vk'){keepDraft();const v=VENUES.find(v=>v[0]===t.value);const D=S.draft;D.vk=v[0];if(v[0]==='altro'){D.venue='';D.addr='';}else{D.venue=v[1];D.zone=v[2];D.addr=v[3];D.x=v[4];D.y=v[5]}rr();return}
 if(t.id==='f-zone'&&S.draft){const z=ZXY[t.value]||[52,56];S.draft.x=z[0];S.draft.y=z[1]}
 if(t.id==='evphoto'&&t.files[0]){keepDraft();const u=await shrinkBig(t.files[0]);if(u){S.draft.photo=u;rr()}return}
 if(t.id==='rvfile'){RV.txt=$('#rvtxt')?.value||'';const fs=[...t.files].slice(0,3-RV.photos.length);for(const f of fs){const u=await shrink(f);if(u)RV.photos.push(u)}drawReview(E(RV.id));return}if(t.dataset.pref){S.prefs[t.dataset.pref]=t.checked;save();if(location.hash==='#notifiche')rr()}if(t.dataset.taste){S.taste[t.dataset.taste]=t.checked}});
document.addEventListener('submit',ev=>{ev.preventDefault();const f=ev.target;
 if(window.CPB?.enabled&&CPB.onSubmit(f))return;
 if(onDailySubmit(f))return;
 if(onPubSubmit(f))return;
 if(f.id==='evform'){saveEvent(false);return}
 if(f.classList.contains('stepf')){const e=E(f.dataset.id),base=+f.dataset.base;const st=[...f.querySelectorAll('.lurow:not(.head)')].map(r=>[r.querySelector('[name=u]').value,r.querySelector('[name=p]').value]).filter(([u,p])=>u!==''&&p!==''&&+u>0&&+p>=0).map(([u,p])=>[+u,+p]).sort((a,b)=>a[0]-b[0]);
  if(st.some(([u,p],i)=>i&&p<st[i-1][1])){toast(LANG==='en'?'Each step should cost the same or more than the previous one':'Ogni scaglione deve costare uguale o più del precedente','error');return}
  Promise.resolve(ORG_API.setSteps(e,f.dataset.n,st)).then(()=>{toast(LANG==='en'?'Prices saved':'Prezzi salvati','save');rr()});return}
 if(f.id==='codef'){const d=Object.fromEntries(new FormData(f));const code=String(d.code).trim().toUpperCase();if(!/^[A-Z0-9_-]{3,24}$/.test(code)){toast(LANG==='en'?'Code: 3-24 letters or numbers':'Codice: da 3 a 24 lettere o numeri','error');return}
  if(d.kind==='percent'&&+d.value>100){toast('Max 100%','error');return}if(ORG_API.codes(null).some(c=>c.code===code)){toast(LANG==='en'?'Code already exists':'Codice già esistente','error');return}
  Promise.resolve(ORG_API.addCode({code,kind:d.kind,value:+d.value,max:d.max?+d.max:null,until:d.until||null,ev:d.all?null:f.dataset.id,used:0,active:true})).then(()=>{toast(LANG==='en'?'Code created':'Codice creato','sell');rr()});return}
 if(f.id==='invitef'){const em=$('#inv-e').value.trim();if(!/\S+@\S+\.\S+/.test(em)){toast(LANG==='en'?'Enter a valid email':'Inserisci un\'email valida','error');return}Promise.resolve(ORG_API.invite({e:em,r:$('#inv-r').value,g:$('#inv-g').value})).then(()=>{toast(LANG==='en'?'Invitation sent':'Invito inviato','send');rr()});return}
 if(f.id==='gatef'){const g=$('#gate-n').value.trim();if(g&&!S.gates.includes(g)){S.gates.push(g);save();rr()}return}
 if(f.id==='msgf'){const e=E(f.dataset.id),t=$('#msg-t').value.trim(),b=$('#msg-b').value.trim();if(t.length<3||b.length<3){toast(LANG==='en'?'Write a title and a message':'Scrivi titolo e messaggio','error');return}
  ORG_API.send(e,t,b).then(n=>{closeSheet();toast((LANG==='en'?'Sent to ':'Inviato a ')+n+(LANG==='en'?' attendees':' partecipanti'),'send');rr()}).catch(err=>toast(err.message,'error'));return}
 if(f.id==='billf'){ORG_API.setBilling(Object.fromEntries(new FormData(f)));closeSheet();toast(LANG==='en'?'Billing details saved':'Dati di fatturazione salvati','save');rr();return}
 if(f.id==='rvform'){if(!RV.stars){toast(LANG==='en'?'Choose a rating from 1 to 5 stars':'Scegli un voto da 1 a 5 stelle','star');return}const e=E(RV.id);(S.reviews[e.id]=S.reviews[e.id]||[]).unshift({n:'Marco Rossi',stars:RV.stars,txt:$('#rvtxt').value.trim(),photos:RV.photos,d:LANG==='en'?'Just now':'Adesso',ok:1,me:1});save();closeSheet();toast(LANG==='en'?'Thanks! Review published':'Grazie! Recensione pubblicata','rate_review');rr();return}
 if(f.id==='pinf'){const code=[...f.querySelectorAll('[data-pin]')].map(i=>i.value).join('');const i=S.staff.att.findIndex(a=>a.code===code);
  if(code.length<5){toast('Inserisci tutte e 5 le cifre','error');return}
  if(i<0){toast('Codice #CP-'+code+' non trovato','error');return}
  const a=S.staff.att[i];closeSheet();if(a.s==='ok'){toast(`${a.n} è già entrato alle ${a.at}`,'block');return}validate(a,'PIN manuale');toast(`Ingresso convalidato! ${a.n} può accedere.`,'verified');rr()}
 if(f.id==='gform'){const n=$('#gn').value.trim();if(!n){toast('Inserisci nome e cognome','error');$('#gn').focus();return}
  const type=f.querySelector('#gtype .on').dataset.k,pax=+f.querySelector('#gpax .on').dataset.v,now2=$('#gnow').checked;
  const g={n,type,pax,code:`CP-${type==='Last-Minute Ticket'?'DOOR':'GUEST'}-${88220+S.guests.length*7}`,note:$('#gnote').value.trim()||'Accredito rapido al desk',at:now(),op:'Gate A • Desk',ok:now2?1:0,kit:now2?'Convalidato all\'ingresso':'In attesa del kit'};
  S.guests.unshift(g);if(now2)S.staff.inside=Math.min(S.staff.cap,S.staff.inside+pax);save();closeSheet();toast('Pass emesso per '+n,'how_to_reg');if(location.hash==='#pass-ospite')rr();else location.hash='pass-ospite'}
});
setInterval(()=>{if(location.hash!=='#checkout'||!S.cart)return;S.timer--;if(S.timer<=0){S.timer=600;toast('Tempo scaduto: abbiamo rinnovato la tua prenotazione per altri 10 minuti','timer')}const el=$('#timer');if(el)el.textContent=String(Math.floor(S.timer/60)).padStart(2,'0')+':'+String(S.timer%60).padStart(2,'0')},1000);
const th=store.get('theme',null);if(th)document.documentElement.dataset.theme=th;document.documentElement.lang=LANG;
window.CP_APP={ORG_API,DQ,PUB,RISTO,soldOut,weatherCard,stOf,PEOPLE,save2,phoneSheet,needsPhone,SRC,getRV:()=>RV,editDraft,isFeat,salesOfDemo:null,EV,S,E,prep,relabel,render,rr,toast,sheet,closeSheet,copy,esc,ic,eur,pr,fmtD,ymd,tiers,TODAY,store,save,saveOrg,PROMO,PKG,CH,kpi,barsChart,lineChart,drawCharts,sub,header,nav,staffNav,orgHead,orgNav,pic,featCard,stfHead,attRow,qr,bars,now,pct,dayLbl,keepDraft,newDraft,shrink,shrinkBig,draftEvent,get LANG(){return LANG},catName,CATS,toMin,UP};
if(window.CP_CONFIG&&window.CP_CONFIG.supabaseUrl){import(new URL('backend.js',document.baseURI).href).then(m=>m.start(window.CP_APP)).catch(err=>{console.error(err);toast('Connessione al server non riuscita: modalità demo','error')})}
if('serviceWorker' in navigator&&location.protocol==='https:'&&window.CP_CONFIG){navigator.serviceWorker.register('sw.js').catch(()=>{})}
$('#skip').addEventListener('click',ev=>{ev.preventDefault();const h=$('#app h1');if(h){h.tabIndex=-1;h.focus()}});
render();
{let seen=false;try{seen=sessionStorage.getItem('cp2_splash')}catch(e){}
 if(!store.get('onb',0))intro(0,false);else if(!seen)intro(0,true);
 try{sessionStorage.setItem('cp2_splash','1')}catch(e){}}
