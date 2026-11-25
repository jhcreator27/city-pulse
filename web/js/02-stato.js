// City Pulse · Una produzione JH STUDIOS
// Modulo caricato in ordine da index.html: le dichiarazioni sono condivise tra i file (script classici).
/* ---------- stato ---------- */
const S={
 fav:new Set(store.get('fav',['castello','luce','street'])),
 tickets:store.get('tickets',null),
 when:'tutti',cat:'tutti',q:'',mapCat:'tutti',mapSel:'naviglio',btab:'tickets',
 cart:null,timer:600,
 prefs:store.get('prefs',{push:true,mail:true,sms:false,bot:false,early:true,low:true,artists:true,secret:true,remind:'2h',free:false,zones:['Centro Storico & Cassaro','Kalsa & Foro Italico','Vucciria & La Cala','Politeama & Libertà'],radar:true,sleep:true,crit:true,follow:true,ebird:true,r2h:true}),
 taste:store.get('taste',{cats:[],lv:{indie:0,elettro:0,jazz:1},sub:['Indie Pop','Post-Punk','Dream Pop','Techno Melodica','House','Neo-Soul','Jazz Contemporaneo'],mood:['Concerti intimi & secret show','Aperitivi jazz & live acustico'],freq:2,eb:true}),
 staff:store.get('staff',null),
 guests:store.get('guests',null),
 going:new Set(store.get('going',['castello'])),reviews:store.get('reviews',null),f:{max:50,free:false,now:false,dist:0,acc:false},calM:null,calSel:null,
 steps:store.get('steps',{castello:{'Ingresso Standard':[[150,12],[300,15]]},neon:{'Ingresso Standard':[[300,18],[700,22]]}}),codes:store.get('codes',[{code:'CITYPULSE10',kind:'percent',value:10,ev:null,max:null,used:38,until:null,active:true},{code:'AMICI5',kind:'fixed',value:5,ev:'castello',max:50,used:12,until:null,active:true}]),team:store.get('team',[{n:'Julian Haramis',e:'julian@jhstudios.it',r:'owner',g:'Gate A'},{n:'Marco Bellini',e:'marco@jhstudios.it',r:'manager',g:'Gate A'},{n:'Chiara Russo',e:'chiara@jhstudios.it',r:'cassa',g:'Desk'},{n:'Alex Greco',e:'alex@jhstudios.it',r:'staff',g:'Gate B'},{n:'',e:'sara.vip@gmail.com',r:'staff',g:'VIP',pending:1}]),gates:store.get('gates',['Gate A','Gate B','VIP','Backstage','Desk']),msgs:store.get('msgs',{}),billing:store.get('billing',{rs:'JH STUDIOS Live'}),gate:'Gate A',
 follow:new Set(store.get('follow',['cosmo-elettrico','giulia-and-the-echoes'])),alerts:store.get('alerts',[]),
 torch:false,lastScan:null,aq:'',af:'tutti',gq:'',gf:'tutti'
};
if(!S.tickets)S.tickets=[{code:'CP-8492-VIP',ev:'jazz',holder:'Marco Rossi',items:[['Ingresso VIP',1,36]],total:37.5,when:'20 Nov 2026, 18:12',pay:'Apple Pay'},{code:'CP-7710-STD',ev:'pjazz',holder:'Marco Rossi',items:[['Ingresso Standard',2,22]],total:44,when:'20 Ott 2026, 10:02',pay:'Apple Pay'},{code:'CP-6031-FREE',ev:'kalsa',holder:'Marco Rossi',items:[['Ingresso libero',1,0]],total:0,when:'15 Nov 2026, 12:40',pay:'Prenotazione gratuita'}];
if(!S.reviews)S.reviews={pjazz:[{n:'Federica S.',stars:5,txt:'Acustica perfetta e un bis da brividi. Il Santa Cecilia è il posto giusto per il jazz.',d:'4 settimane fa',ok:1,demo:1},{n:'Gianluca B.',stars:4,txt:'Gran concerto, ingresso col QR velocissimo. Unico neo: poco spazio al bar.',d:'4 settimane fa',ok:1,demo:1}],kalsa:[{n:'Rosalia T.',stars:5,txt:'La Kalsa piena di musica fino a tardi, un\'atmosfera unica.',d:'5 giorni fa',ok:1,demo:1}]};
const ACTIVE=()=>S.tickets.filter(t=>!E(t.ev).past);
const ATT0=[
 {n:'Elena Moretti',type:'Stampa / Media',code:'10492',note:'Giornale di quartiere • Ritira pass foto & backstage al check-in',s:'wait'},
 {n:'Luca Brambilla',type:'Early Bird Parterre',code:'44021',note:'Acquistato online (Tier 1) • In attesa ai tornelli',s:'wait'},
 {n:'Matteo Conti',type:'Tavolo Balconata #04',code:'77190',note:'Host Privé (capogruppo 5 pax) • Accoglienza sommelier',s:'wait'},
 {n:'Marco Rossi',type:'VIP Parterre',code:'98421',note:'Scan Gate A (Scanner #2)',s:'ok',at:'21:14',m:'Apple Wallet NFC'},
 {n:'Sofia Colombo',type:'VIP Backstage',code:'08219',note:'Guestlist artista • Braccialetto Gold assegnato',s:'ok',at:'20:48',m:'QR app'},
 {n:'Giulia Ferri',type:'Ridotto Under 25',code:'33918',note:'Carta d\'identità obbligatoria • Controlla data di nascita',s:'warn'},
 {n:'Andrea Galli',type:'Ingresso Standard',code:'51207',note:'Acquistato in app',s:'wait'},
 {n:'Chiara Lombardi',type:'Ingresso Standard',code:'62880',note:'Acquistato in app',s:'wait'}
];
if(!S.staff)S.staff={inside:248,cap:400,att:ATT0};
const G0=[
 {n:'Giulia Bianchi',type:'Guestlist Artista',pax:2,code:'CP-GUEST-88219',note:'Band headliner • Accesso palco & foyer',at:'21:38',op:'Scanner #2 • Op. Marco',ok:1,kit:'Braccialetto arancione consegnato'},
 {n:'Davide Marini',type:'Stampa / Media',pax:1,code:'CP-GUEST-88212',note:'Magazine musicale • Pit foto (primi 3 brani)',at:'21:24',op:'Desk centrale • Chiara',ok:1,kit:'Pass foto laminato consegnato'},
 {n:'Sara De Angelis',type:'VIP Invito',pax:3,code:'CP-GUEST-88198',note:'Ospite sponsor • Tavolo Terrazza Backstage #4',at:'21:10',op:'Scanner #2 • Op. Marco',ok:1,kit:'3 braccialetti Gold VIP consegnati'},
 {n:'Luca Rinaldi',type:'Staff / Crew',pax:1,code:'CP-GUEST-88174',note:'Service luci & regia • All-Areas',at:'20:55',op:'Gate Staff • Alex',ok:1,kit:'Pass All-Areas attivo'},
 {n:'Federico Villa',type:'Last-Minute Ticket',pax:2,code:'CP-DOOR-88150',note:'Acquisto alle porte • Parterre A • POS #1 €40,00',at:'20:42',op:'POS #1',ok:0,kit:'In attesa del kit'}
];
if(!S.guests)S.guests=G0;
const save=()=>{store.set('fav',[...S.fav]);store.set('tickets',S.tickets);store.set('prefs',S.prefs);store.set('taste',S.taste);store.set('staff',S.staff);store.set('guests',S.guests);store.set('going',[...S.going]);store.set('follow',[...S.follow]);store.set('steps',S.steps);store.set('codes',S.codes);store.set('team',S.team);store.set('gates',S.gates);store.set('msgs',S.msgs);store.set('billing',S.billing);store.set('alerts',S.alerts);try{localStorage.setItem('cp2_reviews',JSON.stringify(S.reviews))}catch(e){toast(LANG==='en'?'Photos too large to save on this device':'Foto troppo pesanti da salvare su questo dispositivo','error')}};

