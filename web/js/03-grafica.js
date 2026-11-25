// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- grafica generata ---------- */
const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0};
const rng=seed=>()=>((seed=Math.imul(seed^seed>>>15,1|seed)+0x6D2B79F5|0)>>>0)/4294967296;
function qr(str){if(window.qrcode){try{const q=qrcode(0,'M');q.addData(str);q.make();const n=q.getModuleCount();let o='';for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(q.isDark(y,x))o+=`M${x} ${y}h1v1h-1z`;return `<svg viewBox="-2 -2 ${n+4} ${n+4}" role="img" aria-label="QR code" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n+4}" height="${n+4}" fill="#fff"/><path d="${o}" fill="#171717"/></svg>`}catch(x){}}const N=25,r=rng(hash(str));let o='';const fin=(x,y)=>`<rect x="${x}" y="${y}" width="7" height="7" fill="#171717"/><rect x="${x+1}" y="${y+1}" width="5" height="5" fill="#fff"/><rect x="${x+2}" y="${y+2}" width="3" height="3" fill="#171717"/>`;
 for(let y=0;y<N;y++)for(let x=0;x<N;x++){if((x<8&&y<8)||(x>16&&y<8)||(x<8&&y>16))continue;if(x>9&&x<15&&y>9&&y<15)continue;if(r()<.5)o+=`<rect x="${x}" y="${y}" width="1.02" height="1.02" fill="#171717"/>`}
 return `<svg viewBox="0 0 ${N} ${N}" role="img" aria-label="QR code ${esc(str)}" shape-rendering="crispEdges">${o}${fin(0,0)}${fin(18,0)}${fin(0,18)}<rect x="10" y="10" width="5" height="5" rx="1.2" fill="#E00000"/><path d="M12.5 11.2v2.6M11.2 12.5h2.6" stroke="#fff" stroke-width=".7"/></svg>`}
function bars(str){const r=rng(hash(str+'b'));let o='';for(let i=0;i<34;i++)o+=`<i style="width:${1+Math.floor(r()*4)}px"></i>`;return `<div class="bar" aria-hidden="true">${o}</div>`}
function mapSVG(evs,sel,mini){
 const P=(x,y)=>[x*4,y*5.2];
 let pins='';
 for(const e of evs){const[x,y]=P(e.x,e.y);const lab=e.label||pr(e.price);const w=lab.length*8+34-6;const on=e.id===sel;
  const fillc=e.price?(on?'#a80000':'#D00000'):'#8a6400';
  pins+=`<g class="pin" data-act="mpin" data-id="${e.id}" transform="translate(${x-w/2},${y-30})" role="button" tabindex="0" aria-label="${esc(e.t)} · ${pr(e.price)}"><rect width="${w}" height="28" rx="14" fill="${on?'#171717':fillc}" stroke="#fff" stroke-width="2"/><circle cx="14" cy="14" r="5" fill="#FFC107"/><text x="25" y="19" font-size="13" font-weight="800" fill="#fff" font-family="Montserrat,system-ui,sans-serif">${lab}</text><path d="M${w/2-5} 27 L${w/2} 34 L${w/2+5} 27z" fill="${on?'#171717':fillc}"/></g>`}
 const lbl=(t,x,y,r=0)=>`<text class="m-lbl" x="${x}" y="${y}" text-anchor="middle"${r?` transform="rotate(${r} ${x} ${y})"`:''}>${t}</text>`;
 return `<svg viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice" aria-label="Mappa di Palermo con gli eventi">
 <rect width="400" height="520" fill="var(--map)"/>
 <path class="m-sea" d="M350 0 C338 70 332 140 322 192 Q300 210 306 228 Q318 236 322 252 C328 300 330 360 344 420 C356 470 364 500 372 520 L400 520 L400 0Z"/>
 <path class="m-park" d="M250 30 C290 10 330 30 330 70 C328 110 300 130 270 120 C245 110 232 60 250 30Z" opacity=".75"/>
 <ellipse class="m-park" cx="150" cy="70" rx="58" ry="40" transform="rotate(-20 150 70)"/>
 <ellipse class="m-park" cx="312" cy="372" rx="16" ry="26"/><ellipse class="m-park" cx="112" cy="250" rx="18" ry="12"/>
 <rect class="m-old" x="150" y="232" width="150" height="140" rx="22" transform="rotate(6 225 302)"/>
 <path class="m-ring" stroke-width="10" d="M40 0 C60 140 70 300 120 520"/>
 <path class="m-road" stroke-width="8" d="M200 228 L120 0"/>
 <path class="m-road" stroke-width="7" d="M226 150 L218 470"/>
 <path class="m-road" stroke-width="7" d="M60 296 L316 304"/>
 <path class="m-road" stroke-width="5" d="M252 180 L246 450"/>
 <path class="m-road" stroke-width="4" d="M150 232 L300 250 M150 372 L296 382 M60 210 L210 228 M90 420 L230 400 M226 150 L300 200 M120 0 L300 120"/>
 <circle cx="221" cy="300" r="5" fill="var(--red)" opacity=".9"/>
 ${lbl('QUATTRO CANTI',221,318)}${lbl('POLITEAMA',190,212)}${lbl('LIBERTÀ',150,140,-70)}${lbl('ZISA',96,282)}${lbl('KALSA',282,340)}${lbl('BALLARÒ',178,392)}${lbl('VUCCIRIA',258,276)}${lbl('LA CALA',300,178)}${lbl('MONTE PELLEGRINO',285,72)}${lbl('FAVORITA',150,74)}${lbl('FORO ITALICO',336,330,78)}${lbl('MAR TIRRENO',375,260,90)}${lbl('↑ MONDELLO',100,22)}${lbl('TEATRO MASSIMO',196,262)}
 ${mini?'':'<circle cx="221" cy="300" r="20" fill="#E00000" opacity=".18"><animate attributeName="r" values="10;26;10" dur="2.4s" repeatCount="indefinite"/></circle><circle cx="221" cy="300" r="8" fill="#E00000" stroke="#fff" stroke-width="3"/>'}
 ${pins}</svg>`}

