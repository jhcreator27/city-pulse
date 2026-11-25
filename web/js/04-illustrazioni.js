// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- illustrazioni dei luoghi di Palermo (SVG originali) ---------- */
let SCN=0;
function scene(kind,o={}){
 const id='s'+(++SCN),night=o.night!==false,seed=o.seed||7;
 const R=(n=>()=>((n=Math.imul(n^n>>>15,1|n)+0x6D2B79F5|0)>>>0)/4294967296)(seed);
 const sky=night?['#1b0f2e','#5a0a14','#E00000']:['#7ec3f0','#ffd27a','#ffb347'];
 const ink=night?'#171717':'#3a2a1a',ink2=night?'#2a1d1d':'#6b4a2a',warm='#FFC107',red='#E00000',stone=night?'#4a3a3a':'#e8d6b8',stone2=night?'#3a2c2c':'#d4bd98',sea=night?'#1d3a5a':'#3d8ed0';
 let o_=`<defs><linearGradient id="${id}k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset=".62" stop-color="${sky[1]}"/><stop offset="1" stop-color="${sky[2]}"/></linearGradient><linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea}"/><stop offset="1" stop-color="${night?'#0c1a2c':'#1f5f99'}"/></linearGradient><radialGradient id="${id}g"><stop offset="0" stop-color="#FFC107" stop-opacity=".9"/><stop offset="1" stop-color="#FFC107" stop-opacity="0"/></radialGradient></defs>
 <rect width="400" height="260" fill="url(#${id}k)"/>`;
 if(night){for(let i=0;i<26;i++)o_+=`<circle cx="${R()*400}" cy="${R()*110}" r="${R()*1.4+.4}" fill="#fff" opacity="${.35+R()*.6}"/>`;o_+=`<circle cx="${320+R()*50}" cy="${38+R()*20}" r="15" fill="#fff4d0"/><circle cx="${326+R()*50}" cy="${34+R()*20}" r="13" fill="${sky[0]}" opacity=".0"/>`}
 else o_+=`<circle cx="${60+R()*60}" cy="52" r="26" fill="#fff1b0"/><circle cx="${60+R()*60}" cy="52" r="40" fill="#fff1b0" opacity=".25"/>`;
 // Monte Pellegrino sullo sfondo
 const mtn=(c,op)=>`<path d="M0 170 C60 120 110 96 160 110 C200 120 220 92 270 88 C320 84 360 118 400 132 L400 260 L0 260Z" fill="${c}" opacity="${op}"/>`;
 const win=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${w/2}" fill="${night?warm:'#5a3d22'}" opacity="${night?.9:.75}"/>`;
 const palm=(x,y,s=1)=>`<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 C2 -30 -2 -55 4 -80" stroke="${ink}" stroke-width="5" fill="none" stroke-linecap="round"/>${[-70,-35,0,35,70,105,-105].map(a=>`<path d="M4 -80 q${Math.cos((a-90)*Math.PI/180)*22} ${Math.sin((a-90)*Math.PI/180)*22-6} ${Math.cos((a-90)*Math.PI/180)*40} ${Math.sin((a-90)*Math.PI/180)*30+8}" stroke="${night?'#1f3a22':'#2f6b35'}" stroke-width="6" fill="none" stroke-linecap="round"/>`).join('')}</g>`;
 const lights=(y)=>{let s=`<path d="M0 ${y} Q100 ${y+18} 200 ${y} T400 ${y}" stroke="${ink}" stroke-width="1.2" fill="none"/>`;for(let i=0;i<20;i++){const x=10+i*20,yy=y+Math.sin(i/20*Math.PI*2)*(9)*(i%2?1:1);s+=`<circle cx="${x}" cy="${y+ (i<10?Math.sin(i/10*Math.PI)*9:-Math.sin((i-10)/10*Math.PI)*9)}" r="2.6" fill="${warm}"/>`}return night?s:''};
 const crowd=(n=40)=>{let s='';for(let i=0;i<n;i++){const x=R()*400,h=10+R()*10;s+=`<circle cx="${x}" cy="${252-h}" r="${4+R()*2}" fill="${ink}"/><rect x="${x-5}" y="${252-h+3}" width="10" height="${h+6}" rx="4" fill="${ink}"/>`}return s};
 switch(kind){
 case 'teatro':{ // Teatro Massimo: scalinata, colonnato, frontone e cupola
  o_+=mtn(night?'#2b1630':'#c9a37a',.5);
  o_+=`<ellipse cx="200" cy="92" rx="70" ry="52" fill="${stone2}"/><rect x="128" y="88" width="144" height="14" fill="${stone}"/><path d="M200 34 l6 -14 l6 14z" fill="${warm}"/><rect x="196" y="40" width="8" height="8" fill="${stone}"/>`;
  o_+=`<rect x="60" y="120" width="280" height="96" fill="${stone}"/><path d="M110 120 L200 82 L290 120Z" fill="${stone}"/><path d="M128 117 L200 88 L272 117Z" fill="${stone2}"/><rect x="104" y="120" width="192" height="8" fill="${stone2}"/>`;
  for(let i=0;i<6;i++)o_+=`<rect x="${116+i*32}" y="128" width="12" height="80" fill="${night?'#5a4848':'#f4e6cc'}"/><rect x="${113+i*32}" y="128" width="18" height="5" fill="${stone2}"/>`;
  for(let i=0;i<5;i++)o_+=win(132+i*32,150,12,40);
  o_+=win(72,140,14,24)+win(314,140,14,24)+win(72,176,14,24)+win(314,176,14,24);
  for(let i=0;i<5;i++)o_+=`<rect x="${70-i*10}" y="${210+i*8}" width="${260+i*20}" height="8" fill="${i%2?stone2:stone}"/>`;
  o_+=`<path d="M70 210 l-22 0 l0 -14 l22 0z" fill="${ink2}"/><path d="M330 210 l22 0 l0 -14 l-22 0z" fill="${ink2}"/>`;
  if(night)o_+=`<ellipse cx="200" cy="200" rx="150" ry="40" fill="url(#${id}g)" opacity=".35"/>`;
  break}
 case 'castello':{ // Castello a Mare sulla Cala
  o_+=mtn(night?'#2b1630':'#c9a37a',.5);
  o_+=`<rect x="0" y="196" width="400" height="64" fill="url(#${id}w)"/>`;
  o_+=`<rect x="40" y="120" width="250" height="82" fill="${stone}"/>`;for(let i=0;i<13;i++)o_+=`<rect x="${40+i*20}" y="110" width="12" height="12" fill="${stone}"/>`;
  o_+=`<rect x="250" y="78" width="70" height="124" fill="${stone2}"/>`;for(let i=0;i<4;i++)o_+=`<rect x="${250+i*19}" y="68" width="13" height="12" fill="${stone2}"/>`;
  o_+=`<path d="M150 202 v-36 a20 20 0 0 1 40 0 v36z" fill="${ink}"/>${night?`<path d="M152 202 v-34 a18 18 0 0 1 36 0 v34z" fill="${warm}" opacity=".55"/>`:''}`;
  o_+=win(272,100,9,22)+win(296,100,9,22)+win(80,146,8,18)+win(110,146,8,18)+win(220,146,8,18);
  o_+=`<path d="M318 78 l0 -26 l22 8 l-22 8" fill="${red}"/><rect x="316" y="50" width="3" height="30" fill="${ink}"/>`;
  for(let i=0;i<6;i++)o_+=`<rect x="${R()*400}" y="${210+R()*40}" width="${20+R()*40}" height="2" fill="${night?warm:'#fff'}" opacity=".5"/>`;
  o_+=crowd(16).replace(/252/g,'246');
  break}
 case 'zisa':{ // Cantieri Culturali alla Zisa: capannoni industriali
  o_+=mtn(night?'#2b1630':'#c9a37a',.45);
  o_+=`<rect x="322" y="60" width="16" height="150" fill="${ink2}"/><rect x="318" y="56" width="24" height="8" fill="${ink}"/>`;
  for(let i=0;i<5;i++){const x=10+i*62;o_+=`<path d="M${x} 210 V120 L${x+30} 96 L${x+60} 120 V210Z" fill="${i%2?stone:stone2}"/><rect x="${x+12}" y="132" width="36" height="40" fill="${night?warm:'#5a3d22'}" opacity="${night?.75:.6}"/><path d="M${x+12} 152 h36 M${x+30} 132 v40" stroke="${stone2}" stroke-width="3"/>`}
  o_+=`<rect x="0" y="208" width="400" height="52" fill="${ink2}"/>`+lights(70)+crowd(34);
  if(night)for(let i=0;i<3;i++)o_+=`<path d="M${120+i*80} 210 L${60+i*110} 0" stroke="${['#E00000','#FFC107','#ff5fa0'][i]}" stroke-width="10" opacity=".22"/>`;
  break}
 case 'mercato':{ // Ballarò / Vucciria: bancarelle con tende a righe
  o_+=`<rect x="0" y="40" width="130" height="180" fill="${stone2}"/><rect x="270" y="30" width="130" height="190" fill="${stone}"/>`;
  for(let r=0;r<3;r++)for(let c=0;c<3;c++){o_+=win(16+c*38,58+r*42,14,26);o_+=win(286+c*38,50+r*42,14,26)}
  for(let i=0;i<4;i++){const x=10+i*98;o_+=`<path d="M${x} 150 h88 l10 22 h-108z" fill="${i%2?red:warm}"/>`;for(let j=0;j<5;j++)o_+=`<rect x="${x+4+j*18}" y="150" width="9" height="22" fill="#fff" opacity=".85" transform="skewX(-14)"/>`;o_+=`<rect x="${x}" y="172" width="98" height="40" fill="${ink2}"/>`;for(let j=0;j<7;j++)o_+=`<circle cx="${x+10+j*13}" cy="182" r="6" fill="${['#E00000','#FFC107','#f28c28','#7bbf4a'][j%4]}"/>`}
  o_+=`<rect x="0" y="212" width="400" height="48" fill="${ink}"/>`+lights(30);
  for(let i=0;i<4;i++)o_+=`<line x1="${55+i*98}" y1="0" x2="${55+i*98}" y2="120" stroke="${ink}" stroke-width="1"/><circle cx="${55+i*98}" cy="124" r="6" fill="${warm}"/><circle cx="${55+i*98}" cy="124" r="16" fill="url(#${id}g)"/>`;
  break}
 case 'porta':{ // Porta Felice sul mare, Foro Italico
  o_+=`<rect x="0" y="150" width="400" height="110" fill="url(#${id}w)"/>`;
  for(const x of [96,244]){o_+=`<rect x="${x}" y="70" width="60" height="140" fill="${stone}"/><rect x="${x-6}" y="64" width="72" height="12" fill="${stone2}"/><rect x="${x+20}" y="96" width="20" height="44" rx="10" fill="${stone2}"/><path d="M${x+22} 64 c0 -16 16 -16 16 0z" fill="${stone2}"/><rect x="${x+27}" y="40" width="6" height="12" fill="${stone2}"/>`}
  o_+=`<rect x="0" y="208" width="400" height="52" fill="${night?'#2a1d1d':'#c9a37a'}"/>`+palm(40,214,1)+palm(360,214,.9)+crowd(22);
  for(let i=0;i<8;i++)o_+=`<rect x="${R()*400}" y="${158+R()*40}" width="${20+R()*40}" height="2" fill="${night?warm:'#fff'}" opacity=".5"/>`;
  break}
 case 'porto':{ // la Cala: barche e case affacciate
  o_+=mtn(night?'#2b1630':'#c9a37a',.5);
  for(let i=0;i<7;i++){const h=60+R()*50,x=i*58;o_+=`<rect x="${x}" y="${170-h}" width="56" height="${h}" fill="${[stone,stone2,'#d98c5f','#e8b04a'][i%4]}" opacity="${night?.8:1}"/>`;for(let j=0;j<2;j++)o_+=win(x+12+j*20,180-h+10,9,16)}
  o_+=`<rect x="0" y="168" width="400" height="92" fill="url(#${id}w)"/>`;
  for(let i=0;i<5;i++){const x=20+i*80,y=196+(i%2)*14;o_+=`<path d="M${x} ${y} h54 l-10 14 h-34z" fill="${['#fff','#E00000','#FFC107','#fff','#3d8ed0'][i]}"/><line x1="${x+26}" y1="${y}" x2="${x+26}" y2="${y-70}" stroke="${ink}" stroke-width="2"/><path d="M${x+28} ${y-66} l22 52 h-22z" fill="#fff" opacity=".85"/>`}
  for(let i=0;i<10;i++)o_+=`<rect x="${R()*400}" y="${222+R()*34}" width="${18+R()*30}" height="2" fill="${night?warm:'#fff'}" opacity=".45"/>`;
  o_+=lights(110);
  break}
 case 'palazzo':{ // palazzo barocco sul Cassaro
  o_+=`<rect x="30" y="54" width="340" height="170" fill="${stone}"/><rect x="24" y="46" width="352" height="12" fill="${stone2}"/>`;
  for(let r=0;r<2;r++)for(let c=0;c<6;c++){const x=52+c*54,y=74+r*62;o_+=`<path d="M${x} ${y+44} v-30 a12 12 0 0 1 24 0 v30z" fill="${night?warm:'#5a3d22'}" opacity="${night?.85:.7}"/><rect x="${x-6}" y="${y+44}" width="36" height="5" fill="${stone2}"/><path d="M${x-4} ${y+49} v8 M${x+4} ${y+49} v8 M${x+12} ${y+49} v8 M${x+20} ${y+49} v8 M${x+28} ${y+49} v8" stroke="${ink}" stroke-width="2"/>`}
  o_+=`<path d="M170 224 v-40 a30 30 0 0 1 60 0 v40z" fill="${ink}"/><rect x="0" y="222" width="400" height="38" fill="${ink2}"/>`+crowd(18);
  o_+=`<rect x="186" y="150" width="28" height="10" fill="${red}"/>`;
  break}
 case 'loggia':{ // loggiato sul mare
  o_+=`<rect x="0" y="150" width="400" height="110" fill="url(#${id}w)"/><rect x="0" y="80" width="400" height="140" fill="${stone}"/><rect x="0" y="70" width="400" height="14" fill="${stone2}"/>`;
  for(let i=0;i<6;i++){const x=12+i*66;o_+=`<path d="M${x} 214 v-80 a26 26 0 0 1 52 0 v80z" fill="${night?'#2a1a3a':'#7ec3f0'}"/>${night?`<path d="M${x} 214 v-80 a26 26 0 0 1 52 0 v80z" fill="${['#E00000','#FFC107','#ff5fa0','#5a6bff'][i%4]}" opacity=".45"/>`:''}`}
  o_+=`<rect x="0" y="212" width="400" height="48" fill="${ink2}"/>`+crowd(20);
  break}
 case 'mare':{ // Mondello: spiaggia, stabilimento Liberty, Monte Pellegrino
  o_+=`<path d="M220 160 C250 80 300 60 340 70 C370 78 390 110 400 130 V170 H220Z" fill="${night?'#2b1630':'#b98a5e'}"/>`;
  o_+=`<rect x="0" y="150" width="400" height="60" fill="url(#${id}w)"/><path d="M0 206 Q200 190 400 206 V260 H0Z" fill="${night?'#3a2c2c':'#f2d9a6'}"/>`;
  o_+=`<rect x="70" y="118" width="120" height="40" fill="${stone}"/><path d="M60 118 h140 l-10 -18 h-120z" fill="${red}"/><rect x="120" y="86" width="20" height="16" fill="${stone}"/><path d="M116 86 h28 l-14 -14z" fill="${warm}"/>`;for(let i=0;i<5;i++)o_+=win(80+i*22,128,10,18);
  o_+=`<rect x="70" y="158" width="120" height="6" fill="${stone2}"/>`;for(let i=0;i<6;i++)o_+=`<line x1="${78+i*22}" y1="164" x2="${78+i*22}" y2="186" stroke="${stone2}" stroke-width="3"/>`;
  for(let i=0;i<4;i++){const x=240+i*40;o_+=`<path d="M${x} 222 q16 -18 32 0z" fill="${i%2?red:warm}"/><line x1="${x+16}" y1="214" x2="${x+16}" y2="246" stroke="${ink}" stroke-width="2"/>`}
  o_+=palm(30,236,.9);if(night)o_+=lights(40)+`<circle cx="320" cy="60" r="0"/>`;
  for(let i=0;i<8;i++)o_+=`<path d="M${R()*400} ${170+R()*30} q8 -10 16 0" stroke="#fff" stroke-width="2" fill="none" opacity=".7"/>`;
  break}
 default:{ // piazza: palme, palco, luminarie
  o_+=mtn(night?'#2b1630':'#c9a37a',.5);
  o_+=`<rect x="0" y="80" width="90" height="140" fill="${stone2}"/><rect x="310" y="70" width="90" height="150" fill="${stone}"/>`;for(let i=0;i<3;i++){o_+=win(16+i*24,100,10,22)+win(326+i*24,92,10,22)}
  o_+=`<rect x="120" y="140" width="160" height="60" fill="${ink2}"/><path d="M110 140 h180 l-14 -26 h-152z" fill="${red}"/><rect x="134" y="150" width="132" height="44" fill="${night?'#2a1a3a':'#5a3d22'}"/>`;
  if(night)o_+=`<path d="M150 150 L120 260 M250 150 L280 260" stroke="${warm}" stroke-width="16" opacity=".18"/><circle cx="200" cy="172" r="40" fill="url(#${id}g)" opacity=".7"/>`;
  o_+=palm(100,226,.9)+palm(305,226,.95)+`<rect x="0" y="210" width="400" height="50" fill="${ink2}"/>`+lights(44)+crowd(36);
 }}
 return `<svg viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${o_}</svg>`}

