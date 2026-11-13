(function(){
  if(window.__agentPatch)return;
  window.__agentPatch=true;

  const PROFILES={
    normal:{label:'일반',icon:'🧍',speed:1.2},
    blind:{label:'시각장애인',icon:'🦯',speed:0.9,voice:true,big:true,careful:true},
    deaf:{label:'청각장애인',icon:'🧏',speed:1.2,flash:true,big:true,mute:true},
    wheel:{label:'휠체어 사용자',icon:'🦽',speed:0.8,low:true,careful:true},
    elder:{label:'노약자',icon:'🧓',speed:0.9,big:true,careful:true,crowd:true},
    stroller:{label:'유모차·임산부',icon:'👶',speed:1.0,lowPref:true,careful:true,crowd:true}
  };
  const CONG={'3':'여유','4':'보통','5':'혼잡','6':'매우 혼잡'};
  const BUS_LEN=11,BUS_GAP=3,DWELL=20,SIGNAL_CYCLE=140;
  const TDATA_SIGNAL='https://t-data.seoul.go.kr/apig/apiman-gateway/tapi/v2xSignalPhaseTimingFusionCurrentInfo/1.0';
  const LLM_MODEL='claude-opus-5-5';
  const DIRS=[['nt',0,'북'],['ne',45,'북동'],['et',90,'동'],['se',135,'남동'],['st',180,'남'],['sw',225,'남서'],['wt',270,'서'],['nw',315,'북서']];

  const NODE=new Map();
  for(const s of STOPS)if(s&&s.mode!=='subway'&&s.node)NODE.set(String(s.node),s);

  const S={open:false,stop:null,tab:'queue',profile:lsGet('agentProfile')||'normal',route:lsGet('agentRoute')||'',
    queue:null,timer:null,layer:null,lastOrder:'',lastMineFirst:false,chat:[],busy:false};
  if(!PROFILES[S.profile])S.profile='normal';
  const P=()=>PROFILES[S.profile];

  const css=document.createElement('style');
  css.textContent=`
#agentBtn{background:linear-gradient(135deg,#2f6fe0,#6b4fe0);border-color:#5d7fe6}
#agentDrawer{position:fixed;top:0;right:0;bottom:0;width:min(420px,100%);z-index:1800;background:var(--panel);border-left:1px solid var(--border);
  box-shadow:-10px 0 30px rgba(0,0,0,.35);display:flex;flex-direction:column;transform:translateX(104%);transition:transform .28s ease;color:var(--text)}
#agentDrawer.open{transform:none}
#agentDrawer.big{font-size:17px}
#agentDrawer.flash{animation:agFlash .45s ease 4}
@keyframes agFlash{0%,100%{box-shadow:-10px 0 30px rgba(0,0,0,.35)}50%{box-shadow:inset 0 0 0 6px #ffd400,-10px 0 30px rgba(255,212,0,.6)}}
.ag-head{padding:12px 14px 10px;border-bottom:1px solid var(--border)}
.ag-top{display:flex;align-items:center;gap:8px}
.ag-title{font-weight:850;font-size:1.08em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-sub{font-size:.78em;color:var(--muted);margin-top:2px}
.ag-x{height:32px;width:32px;padding:0;border-radius:9px}
.ag-prof{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:10px}
.ag-prof button{height:auto;padding:7px 4px;font-size:.78em;line-height:1.25;border-radius:10px;background:var(--panel2);border:1px solid var(--border);color:var(--text)}
.ag-prof button b{display:block;font-size:1.35em}
.ag-prof button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.ag-row{display:flex;gap:8px;align-items:center;margin-top:8px;font-size:.85em;color:var(--muted)}
.ag-row select{height:34px;border-radius:9px;background:var(--panel2);color:var(--text);border:1px solid var(--border);padding:0 8px;font:inherit;font-weight:700}
.ag-tabs{display:flex;border-bottom:1px solid var(--border)}
.ag-tabs button{flex:1;height:42px;border:0;border-radius:0;background:none;color:var(--muted);border-bottom:3px solid transparent;font-size:.88em}
.ag-tabs button.on{color:var(--text);border-bottom-color:var(--accent)}
.ag-body{flex:1;overflow:auto;padding:14px}
.ag-say{background:var(--panel2);border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:10px;padding:11px 12px;line-height:1.6;font-size:.95em}
.ag-bay{position:relative;height:118px;margin:12px 0;border-radius:12px;background:var(--panel2);border:1px solid var(--border);overflow:hidden}
.ag-bay .lane{position:absolute;left:0;right:0;top:50px;border-top:2px dashed rgba(255,255,255,.12)}
.ag-bay .curb{position:absolute;left:0;right:0;bottom:0;height:24px;background:rgba(255,255,255,.06);font-size:.7em;color:var(--muted);display:flex;justify-content:space-between;align-items:center;padding:0 10px}
.ag-bay .dir{position:absolute;top:6px;left:10px;font-size:.7em;color:var(--muted)}
.ag-bay .bus{position:absolute;top:26px;height:56px;border-radius:9px 9px 7px 7px;background:#2c3542;border:2px solid #4b5869;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:left .5s ease}
.ag-bay .bus b{font-size:1.05em}
.ag-bay .bus i{font-style:normal;font-size:.62em;color:var(--muted)}
.ag-bay .bus.low{border-color:#29c5f6}
.ag-bay .bus.mine{background:#ffd400;border-color:#fff;color:#111}
.ag-bay .bus.mine i{color:#333}
.ag-bay .bus.more{background:none;border-style:dotted}
.ag-bay .bus.coming{opacity:.5;border-style:dashed}
.ag-btns{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}
.ag-btns button{height:36px;font-size:.85em}
.ag-btns .pri{background:var(--accent);border-color:var(--accent);color:#fff}
.ag-list{list-style:none;margin:6px 0 0;padding:0;display:grid;gap:6px}
.ag-list li{display:grid;grid-template-columns:30px 1fr auto;gap:9px;align-items:center;background:var(--panel2);border:1px solid var(--border);border-radius:11px;padding:8px 10px}
.ag-list li.mine{border-color:#ffd400}
.ag-list .n{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.08);font-weight:850;font-size:.85em}
.ag-list .r{font-weight:850}
.ag-list .m{font-size:.74em;color:var(--muted);margin-top:1px}
.ag-list .t{font-weight:850;font-size:.9em;text-align:right}
.ag-b{display:inline-block;font-size:.68em;font-weight:800;padding:1px 6px;border-radius:999px;margin-left:5px;vertical-align:1px}
.ag-b.low{background:#29c5f6;color:#012}.ag-b.c3{background:#2fbf71;color:#012}.ag-b.c4{background:#ff9f1c;color:#111}.ag-b.c5,.ag-b.c6{background:#ff5a5f;color:#fff}.ag-b.bn{background:#8b5cf6;color:#fff}
.ag-h{font-size:.8em;font-weight:800;color:var(--muted);margin:14px 0 4px}
.ag-note{font-size:.74em;color:var(--muted);margin-top:8px;line-height:1.5}
.ag-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ag-grid label{display:grid;gap:3px;font-size:.76em;color:var(--muted)}
.ag-grid input{min-width:0;height:36px;font-size:.95em}
.ag-sig{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:.78em}
.ag-sig span{padding:4px 8px;border-radius:7px;background:var(--panel2);border:1px solid var(--border);font-weight:750}
.ag-sig span.g{background:#2fbf71;color:#012;border-color:#2fbf71}.ag-sig span.r{background:#e5484d;color:#fff;border-color:#e5484d}.ag-sig span.y{background:#ff9f1c;color:#111;border-color:#ff9f1c}
.ag-sig span.pick{outline:2px solid var(--text);outline-offset:1px}
.ag-verdict{margin-top:12px;border-radius:12px;padding:13px;background:var(--panel2);border:1px solid var(--border);border-left:6px solid var(--border)}
.ag-verdict b{font-size:1.25em;display:block}
.ag-verdict p{margin:6px 0 0;line-height:1.6;font-size:.9em;color:var(--muted)}
.ag-verdict.ok{border-left-color:#2fbf71}.ag-verdict.tight{border-left-color:#ff9f1c}.ag-verdict.no{border-left-color:#e5484d}
.ag-tl{position:relative;height:78px;margin-top:10px;border-radius:10px;background:var(--panel2);border:1px solid var(--border);overflow:hidden}
.ag-tl .sg{position:absolute;top:10px;height:20px;border-radius:4px;font-size:.62em;font-weight:800;display:flex;align-items:center;padding-left:4px;white-space:nowrap;overflow:hidden}
.ag-tl .w{background:#4b5869}.ag-tl .wt{background:#e5484d}.ag-tl .cr{background:#2fbf71;color:#012}
.ag-tl .mk{position:absolute;transform:translateX(-50%);font-size:.62em;text-align:center;white-space:nowrap;line-height:1.2}
.ag-tl .ax{position:absolute;bottom:2px;font-size:.58em;color:var(--muted);transform:translateX(-50%)}
.ag-chat{display:grid;gap:8px}
.ag-msg{padding:9px 11px;border-radius:12px;line-height:1.55;max-width:90%;white-space:pre-wrap;font-size:.9em}
.ag-msg.me{justify-self:end;background:var(--accent);color:#fff}
.ag-msg.bot{background:var(--panel2);border:1px solid var(--border)}
.ag-msg.tool{font-size:.72em;color:var(--muted);padding:0 4px}
.ag-ask[hidden]{display:none}
.ag-ask{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--border)}
.ag-ask input{flex:1;min-width:0}
.ag-ask button{flex:0 0 auto}
.ag-sugg{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.ag-sugg button{height:30px;font-size:.75em;border-radius:999px;background:var(--panel2)}
.ag-key{margin-top:14px;font-size:.75em;color:var(--muted)}
.ag-key input{width:100%;margin-top:4px}
.ag-open-stop{margin-top:8px;width:100%;height:38px;background:linear-gradient(135deg,#2f6fe0,#6b4fe0);border-color:#5d7fe6;color:#fff}
.ag-pin{display:inline-flex;align-items:center;gap:4px;height:26px;padding:0 9px 0 3px;border-radius:13px;background:#ffd400;color:#111;border:2px solid #fff;font-weight:800;font-size:13px;white-space:nowrap;box-shadow:0 2px 8px #0008;transform:translate(-13px,-13px)}
.ag-pin u{text-decoration:none;display:grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#111;color:#fff;font-size:11px}
.ag-pin.low{background:#29c5f6}
.ag-pin.other{background:#e8edf3}
.ag-pin.far{opacity:.75;transform:translate(-13px,-13px) scale(.85)}
@media(max-width:700px){#agentDrawer{top:auto;height:72%;width:100%;border-left:0;border-top:1px solid var(--border);border-radius:16px 16px 0 0;transform:translateY(104%)}#agentDrawer.open{transform:none}}
`;
  document.head.appendChild(css);

  const drawer=document.createElement('aside');
  drawer.id='agentDrawer';
  drawer.setAttribute('aria-label','모두의 안내');
  drawer.innerHTML=`
    <div class="ag-head">
      <div class="ag-top"><div style="flex:1;min-width:0"><div class="ag-title" id="agStop">모두의 안내</div><div class="ag-sub" id="agSub">지도에서 정류소를 골라 주세요</div></div><button class="ag-x" id="agClose" aria-label="닫기">✕</button></div>
      <div class="ag-prof" id="agProf"></div>
      <div class="ag-row">내 버스 <select id="agRoute"><option value="">선택 안 함</option></select><span id="agClock" style="margin-left:auto"></span></div>
    </div>
    <div class="ag-tabs" role="tablist">
      <button data-t="queue" class="on">도착 순서</button><button data-t="catch">탈 수 있을까?</button><button data-t="chat">물어보기</button>
    </div>
    <div class="ag-body" id="agBody"></div>
    <form class="ag-ask" id="agAsk" hidden><input id="agQ" autocomplete="off" placeholder="예) 143번 몇 번째에 서 있어?"><button type="button" id="agMic" title="말로 묻기">🎙</button><button type="submit">보내기</button></form>`;
  (document.getElementById('app')||document.body).appendChild(drawer);
  const $=id=>document.getElementById(id);

  const topBtn=document.createElement('button');
  topBtn.id='agentBtn';topBtn.type='button';topBtn.title='교통약자 맞춤 버스 안내';topBtn.textContent='♿ 모두의 안내';
  const settingsBtn=$('settingsBtn');
  if(settingsBtn)settingsBtn.parentNode.insertBefore(topBtn,settingsBtn);
  topBtn.onclick=()=>S.open?closeDrawer():openDrawer(currentStop());

  $('agProf').innerHTML=Object.entries(PROFILES).map(([k,p])=>`<button type="button" data-p="${k}"><b>${p.icon}</b>${p.label}</button>`).join('');
  $('agProf').onclick=e=>{const b=e.target.closest('button[data-p]');if(!b)return;setProfile(b.dataset.p);};
  $('agRoute').onchange=e=>{S.route=e.target.value;lsSet('agentRoute',S.route);render();};
  $('agClose').onclick=closeDrawer;
  drawer.querySelector('.ag-tabs').onclick=e=>{const b=e.target.closest('button[data-t]');if(!b)return;S.tab=b.dataset.t;render();};
  $('agAsk').onsubmit=e=>{e.preventDefault();const t=$('agQ').value;$('agQ').value='';ask(t);};

  function setProfile(k){
    S.profile=k;lsSet('agentProfile',k);
    drawer.querySelectorAll('.ag-prof button').forEach(b=>b.classList.toggle('on',b.dataset.p===k));
    drawer.classList.toggle('big',!!P().big);
    const sp=$('agSpeed');if(sp)sp.value=P().speed;
    render();
  }

  function currentStop(){return typeof selectedIdx==='number'&&selectedIdx>=0&&STOPS[selectedIdx]?.mode!=='subway'?STOPS[selectedIdx]:S.stop;}
  function openDrawer(stop){
    S.open=true;const top=document.getElementById('top');if(top&&innerWidth>700)drawer.style.top=top.offsetHeight+'px';drawer.classList.add('open');
    if(stop&&stop!==S.stop){S.stop=stop;S.queue=null;S.lastOrder='';}
    setProfile(S.profile);
    refresh(true);
    clearInterval(S.timer);
    S.timer=setInterval(()=>{if(S.open&&document.visibilityState==='visible')refresh(false);},20000);
  }
  function closeDrawer(){
    S.open=false;drawer.classList.remove('open');clearInterval(S.timer);
    if(S.layer){S.layer.remove();S.layer=null;}
    if('speechSynthesis' in window)speechSynthesis.cancel();
  }

  const origRender=window.renderSelectedPanel;
  if(typeof origRender==='function'){
    window.renderSelectedPanel=function(idx){
      const r=origRender.apply(this,arguments);
      try{
        const s=STOPS[idx],sel=$('selected');
        if(s&&s.mode!=='subway'&&sel&&!sel.querySelector('.ag-open-stop')){
          const b=document.createElement('button');b.type='button';b.className='ag-open-stop';
          b.textContent='♿ 이 정류장 도착 순서 · 탈 수 있을까?';
          b.onclick=()=>openDrawer(s);
          sel.appendChild(b);
        }
        if(S.open&&s&&s.mode!=='subway'&&s!==S.stop){S.stop=s;S.queue=null;S.lastOrder='';refresh(true);}
      }catch(e){}
      return r;
    };
  }

  function toXY(lat,lng,lat0,lng0){return [(lng-lng0)*111320*Math.cos(lat0*Math.PI/180),(lat-lat0)*110540];}
  function fmt(s){s=Math.max(0,Math.round(s));if(s<60)return s+'초';const m=Math.floor(s/60),r=s%60;return r?`${m}분 ${r}초`:`${m}분`;}
  function jo(w,a,b){const c=String(w).charCodeAt(String(w).length-1)-0xAC00;return w+(c>=0&&c<11172&&c%28?a:b);}
function iye(w){const c=String(w).charCodeAt(String(w).length-1)-0xAC00;return c>=0&&c<11172&&c%28?'이에요':'예요';}
  function bn(r){const m=String(r).match(/^(\d+)([가-힣]+)$/);return m?`${m[1]}번(${m[2]})`:r+'번';}
  function ord(n){return n===1?'맨 앞':(['','','두','세','네','다섯','여섯','일곱','여덟','아홉','열'][n]||n)+' 번째';}
  function routeOf(it){return ROUTE_BY_ID.get(String(it.busRouteId))||null;}
  function stopIdx(route,stop,staOrd){
    const n=route.nodes||[];
    if(String(n[staOrd-1])===String(stop.node))return staOrd-1;
    let best=-1,gap=1e9;n.forEach((x,i)=>{if(String(x)===String(stop.node)&&Math.abs(i-staOrd+1)<gap){gap=Math.abs(i-staOrd+1);best=i;}});
    return best;
  }
  function leg(route,i){const a=NODE.get(String(route.nodes[i])),b=NODE.get(String(route.nodes[i+1]));return a&&b?hav(a.lat,a.lng,b.lat,b.lng)*1.15:300;}
  function proj(route,i,lat,lng){
    const s=NODE.get(String(route.nodes[i])),p=NODE.get(String(route.nodes[Math.max(0,i-1)])),n=NODE.get(String(route.nodes[Math.min(route.nodes.length-1,i+1)]));
    if(!s||!p||!n||!isFinite(lat))return 0;
    const [dx,dy]=toXY(n.lat,n.lng,p.lat,p.lng),L=Math.hypot(dx,dy)||1,[bx,by]=toXY(lat,lng,s.lat,s.lng);
    return (bx*dx+by*dy)/L;
  }

  async function buildQueue(stop){
    const items=await fetchStopArrivals(stop.ars);
    const list=[];
    for(const it of items){
      for(const k of [1,2]){
        const veh=it['vehId'+k];if(!veh||veh==='0')continue;
        const t=parseInt(it['traTime'+k],10),arrive=it['isArrive'+k]==='1',msg=String(it['arrmsg'+k]||'');
        if(/운행종료|출발대기|회차대기|운행대기/.test(msg))continue;
        if(!arrive&&!(t>=0))continue;
        list.push({route:String(it.rtNm||'').replace(/\s/g,''),routeId:String(it.busRouteId),vehId:String(veh),staOrd:parseInt(it.staOrd,10),
          eta:arrive?0:t,atStop:arrive,low:it['busType'+k]==='1',cong:String(it['congestion'+k]||''),dir:it.adirection||'',lat:NaN,lng:NaN,proj:0,src:'arrival'});
      }
    }
    const near=[...new Set(list.filter(v=>v.atStop||v.eta<=150).map(v=>v.routeId))].slice(0,6);
    await Promise.all(near.map(async rid=>{
      const route=ROUTE_BY_ID.get(rid);if(!route)return;
      let pos=[];try{pos=await fetchBusPositions(route.id);}catch(e){return;}
      const sample=list.find(v=>v.routeId===rid),i=stopIdx(route,stop,sample.staOrd);if(i<0)return;
      for(const p of pos){
        const v=list.find(x=>x.vehId===String(p.vehId));if(!v)continue;
        const cur=parseInt(p.sectOrd,10)-1,lat=parseFloat(p.gpsY),lng=parseFloat(p.gpsX);
        v.lat=lat;v.lng=lng;v.proj=proj(route,i,lat,lng);v.src='gps';
        if(cur===i&&p.stopFlag==='1'){v.atStop=true;v.eta=0;}
        else if(cur===i&&parseFloat(p.sectDist)*1000<=40){v.atStop=true;v.leaving=true;v.eta=0;}
        else if(cur<i&&cur>=0){
          let d=Math.max(0,parseFloat(p.fullSectDist)*1000-parseFloat(p.sectDist)*1000);
          for(let j=cur+1;j<i;j++)d+=leg(route,j);
          v.dist=d;
        }
      }
    }));
    list.sort((a,b)=>a.atStop!==b.atStop?(a.atStop?-1:1):a.atStop?(a.leaving===b.leaving?b.proj-a.proj:(a.leaving?-1:1)):a.eta-b.eta);
    const by=new Map();for(const v of list){if(!by.has(v.route))by.set(v.route,[]);by.get(v.route).push(v);}
    for(const arr of by.values())for(let i=1;i<arr.length;i++)if(arr[i].eta-arr[i-1].eta<120){arr[i].bunch=arr[i-1];arr[i-1].bunchNext=arr[i];}
    const group=list.filter(v=>v.atStop||v.eta<=60);
    return{stop,list,group,routes:[...new Set(items.map(it=>String(it.rtNm||'').replace(/\s/g,'')).filter(Boolean))],at:Date.now()};
  }

  function myBus(q,route){
    const r=route||S.route;if(!r)return null;
    const pool=q.list.filter(v=>v.route===r&&!v.leaving);
    if(P().low)return pool.find(v=>v.low)||null;
    if(P().lowPref)return pool.find(v=>v.low&&v.eta-pool[0].eta<300)||pool[0]||null;
    return pool[0]||null;
  }

  function queueSentence(q,route){
    const g=q.group,p=P(),out=[],mine=myBus(q,route),r=route||S.route;
    const central=/중앙/.test(q.stop.name)||['01013','01014'].includes(q.stop.ars);
    if(!g.length){
      const f=q.list.find(v=>!v.leaving);
      out.push(f?`지금 정류장에 들어온 버스는 없어요. 가장 먼저 오는 버스는 ${bn(f.route)}, ${fmt(f.eta)} 뒤예요.`:'지금 이 정류장으로 오는 버스 정보가 없어요.');
    }else{
      const st=g.filter(v=>v.atStop).length;
      out.push(st===g.length?`지금 정류장에 버스 ${g.length}대가 서 있어요.`:`지금 정류장에 버스 ${g.length}대가 들어오고 있어요.`);
      out.push(g.map((v,i)=>`${ord(i+1)} ${bn(v.route)}`).join(', ')+'이에요.');
    }
    if(mine){
      const i=g.indexOf(mine);
      if(i>=0){
        const back=i*(BUS_LEN+BUS_GAP)+(p.low?6:0);
        out.push(`타실 ${bn(mine.route)}은 ${ord(i+1)}${iye(ord(i+1))}.`+(back?` 맨 앞 버스 앞쪽에서 뒤로 약 ${back}미터${p.low?', 가운데 문 경사판 쪽이에요.':'예요.'}`:p.low?' 가운데 문 경사판으로 타세요.':' 승강장 맨 앞쪽이에요.'));
        const twin=g.filter(v=>v!==mine&&v.route===mine.route);
        if(twin.length){const w=bn(mine.route);out.push(`같은 ${w}${iye(w)==='이에요'?'이':'가'} ${twin.map(v=>ord(g.indexOf(v)+1)).join(', ')}에도 있어요.`+(twin.some(v=>v.low!==mine.low)&&(p.low||p.lowPref)?` 그 차는 저상버스${twin[0].low?'예요':'가 아니에요'}.`:''));}
      }else out.push(`타실 ${bn(mine.route)}은 ${fmt(mine.eta)} 뒤 도착해요.`);
      if(p.low||p.lowPref)out.push(mine.low?'저상버스예요.':'저상버스가 아니에요.');
      if(mine.cong&&CONG[mine.cong]&&(p.crowd||mine.cong>='5'))out.push(`혼잡도는 ${CONG[mine.cong]}${iye(CONG[mine.cong])}.`);
      if(mine.bunchNext){const n=mine.bunchNext;out.push(`바로 뒤에 같은 ${bn(n.route)}이 ${fmt(n.eta-mine.eta)} 간격으로 붙어 와요.`+(n.cong&&mine.cong&&n.cong<mine.cong?` 뒤차가 덜 붐벼요.`:''));}
    }else if(r){
      out.push(p.low?`${bn(r)} 저상버스는 지금 오고 있지 않아요.`:`${bn(r)}은 지금 도착 정보가 없어요.`);
    }
    if(central&&g.length>1)out.push('중앙차로 정류장이라 승강장 앞쪽부터 차례로 서요.');
    return out.join(' ');
  }

  async function readCrosswalk(stop){
    const rows=Array.isArray(window.STATIC_TRAFFIC_INTERSECTIONS)?window.STATIC_TRAFFIC_INTERSECTIONS:[];
    let best=null,bd=1e9;
    for(const r of rows){if(!String(r[0]).startsWith('11'))continue;const d=hav(stop.lat,stop.lng,+r[2],+r[3]);if(d<bd){bd=d;best=r;}}
    if(!best||bd>250)return null;
    const inter={id:String(best[1]),lat:+best[2],lng:+best[3],name:best[4]||'교차로',dist:bd};
    try{
      const q=new URLSearchParams({apikey:SEOUL_TDATA_KEY,type:'json',numOfRows:'10',pageNo:'1',itstId:inter.id});
      const res=await fetch(`${TDATA_SIGNAL}?${q}`,{cache:'no-store'});
      const data=await res.json(),item=Array.isArray(data)?data[0]:null;
      const peds=[];
      for(const [k,deg,label] of DIRS){
        const cs=item?.[k+'PdsgRmdrCs'],st=String(item?.[k+'PdsgStatNm']||'').toLowerCase();
        if(cs==null&&!st)continue;
        peds.push({k,deg,label,remain:cs==null?null:cs/10,color:st.includes('stop')?'r':st.includes('clearance')?'y':st.includes('allowed')?'g':''});
      }
      const legDeg=bearingDeg(inter.lat,inter.lng,stop.lat,stop.lng),gap=d=>Math.abs(((d-legDeg+540)%360)-180);
      return{inter,peds,pick:peds.slice().sort((a,b)=>gap(a.deg)-gap(b.deg))[0]||null,at:Date.now()};
    }catch(e){return{inter,peds:[],error:'신호 정보를 불러오지 못했어요'};}
  }

  function plan(sig,tReach,cross,crossLen){
    if(!sig||!sig.pick||sig.pick.remain==null)return{start:tReach,wait:0,assumed:true};
    const G=Math.max(15,7+crossLen*2),C=SIGNAL_CYCLE,R=sig.pick.remain-(Date.now()-sig.at)/1000,w=[];
    if(sig.pick.color==='g'){if(R>0)w.push([0,R]);for(let s=Math.max(R,0)+(C-G);s<3600;s+=C)w.push([s,s+G]);}
    else{for(let s=sig.pick.color==='y'?Math.max(R,0)+(C-G):Math.max(R,0);s<3600;s+=C)w.push([s,s+G]);}
    for(const [a,b] of w){const st=Math.max(tReach,a);if(st+cross<=b)return{start:st,wait:st-tReach};}
    return{start:tReach,wait:0,assumed:true};
  }

  async function evaluate(route,walk,crossLen,speed){
    const q=S.queue&&Date.now()-S.queue.at<15000?S.queue:await buildQueue(S.stop);
    S.queue=q;
    const sig=await readCrosswalk(S.stop),p=P();
    const cross=crossLen/speed,tReach=Math.max(0,walk-crossLen)/speed,pl=plan(sig,tReach,cross,crossLen),T=pl.start+cross;
    const r=route||S.route;
    const pool=q.list.filter(v=>(!r||v.route===r)&&(!p.low||v.low)&&!v.leaving);
    let pick=null,verdict='no';
    for(const v of pool){const m=v.eta+(v.atStop?DWELL/2:DWELL)-T;if(m>=(p.careful?20:0)){pick=v;verdict=v===pool[0]?(m>=30?'ok':'tight'):'next';break;}}
    return{q,sig,pl,T,tReach,cross,pool,pick,verdict,route:r};
  }

  function catchSentence(x){
    const p=P(),name=x.route?`${bn(x.route)}`:'버스',low=p.low?' 저상':'',o=[];
    const pn=x.pick&&x.pick.route?bn(x.pick.route):name;
    if(!x.pool.length)return`지금 오는${low} ${jo(name,'이','가')} 없어요.`;
    if(x.verdict==='ok')o.push(`지금 출발하면${low} ${pn} 탈 수 있어요.`);
    else if(x.verdict==='tight')o.push(`${pn} 탈 수는 있는데 빠듯해요. 서두르세요.`);
    else if(x.verdict==='next')o.push(`이번${low} ${jo(name,'은','는')} 못 타요. 다음${low} ${jo(pn,'이','가')} ${fmt(x.pick.eta)} 뒤에 와요. 천천히 가셔도 돼요.`);
    else o.push(`지금 오는${low} ${jo(name,'은','는')} 시간 안에 타기 어려워요.`);
    o.push(`정류장까지 약 ${fmt(x.T)} 걸려요.`);
    if(x.pl.wait>1)o.push(`그중 신호 기다리는 시간이 ${fmt(x.pl.wait)}${iye(fmt(x.pl.wait))}.`);
    else if(x.sig?.pick?.color==='g')o.push('지금 보행 신호가 초록불이라 바로 건널 수 있어요.');
    if(x.pick?.cong&&CONG[x.pick.cong]&&p.crowd)o.push(`그 버스 혼잡도는 ${CONG[x.pick.cong]}${iye(CONG[x.pick.cong])}.`);
    return o.join(' ');
  }

  function speak(t){
    if(P().mute||!('speechSynthesis' in window)||!t)return;
    speechSynthesis.cancel();
    const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';
    const v=speechSynthesis.getVoices().find(v=>v.lang&&v.lang.startsWith('ko'));if(v)u.voice=v;
    speechSynthesis.speak(u);
  }
  function alertUser(n){
    if(navigator.vibrate){const p=[];for(let i=0;i<Math.max(1,n);i++)p.push(220,160);navigator.vibrate(p);}
    if(P().flash){drawer.classList.remove('flash');void drawer.offsetWidth;drawer.classList.add('flash');}
  }

  function fillRoutes(names){
    const sel=$('agRoute'),cur=S.route;
    const list=names.slice().sort((a,b)=>a.localeCompare(b,'ko',{numeric:true}));
    sel.innerHTML='<option value="">선택 안 함</option>'+list.map(n=>`<option value="${esc(n)}"${n===cur?' selected':''}>${esc(bn(n))}</option>`).join('');
    if(cur&&!list.includes(cur))sel.insertAdjacentHTML('beforeend',`<option value="${esc(cur)}" selected>${esc(bn(cur))}</option>`);
  }

  function drawMap(q){
    if(S.layer){S.layer.remove();S.layer=null;}
    if(!S.open||!q)return;
    S.layer=L.layerGroup().addTo(map);
    [...q.group,...q.list.filter(v=>!q.group.includes(v))].filter(v=>isFinite(v.lat)).slice(0,8).forEach(v=>{
      const i=q.group.indexOf(v),mine=v.route===S.route;
      const icon=L.divIcon({className:'',iconSize:[0,0],iconAnchor:[0,0],html:`<div class="ag-pin${mine?'':v.low?' low':' other'}${i>=0?'':' far'}"${i>0?` style="transform:translate(-13px,${-13-i*30}px)"`:''}>${i>=0?`<u>${i+1}</u>`:'<u>·</u>'}${esc(v.route)}</div>`});
      L.marker([v.lat,v.lng],{icon,zIndexOffset:i>=0?2000-i*10:900}).bindTooltip(`${bn(v.route)}${v.low?' 저상':''} · ${v.atStop?'정차 중':fmt(v.eta)}`).addTo(S.layer);
    });
  }

  async function refresh(force){
    if(!S.stop){render();return;}
    $('agStop').textContent=S.stop.name;
    $('agSub').textContent=`정류소 번호 ${S.stop.ars} · 실시간 갱신 20초`;
    try{
      const q=await buildQueue(S.stop);
      S.queue=q;fillRoutes(q.routes);
      const order=q.group.map(v=>v.vehId).join();
      const mine=myBus(q),mineIn=mine&&q.group.includes(mine);
      if(!force&&order&&order!==S.lastOrder&&(P().voice||P().flash||mineIn)){
        if(P().voice)speak(queueSentence(q));
        if(mineIn&&!S.lastMineFirst)alertUser(q.group.indexOf(mine)+1);
      }
      S.lastOrder=order;S.lastMineFirst=!!mineIn;
      $('agClock').textContent=new Date(q.at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      drawMap(q);
      if(force&&isFinite(S.stop.lat)){const pts=[[S.stop.lat,S.stop.lng],...q.list.filter(v=>isFinite(v.lat)&&(q.group.includes(v)||v.eta<=120)).map(v=>[v.lat,v.lng])];const mob=innerWidth<768,o={paddingTopLeft:[50,50],paddingBottomRight:mob?[50,drawer.offsetHeight+30]:[drawer.offsetWidth+50,50],maxZoom:17};map.fitBounds(pts.length>1?pts:[pts[0],pts[0]],o);}
    }catch(e){$('agClock').textContent='갱신 실패';}
    if(S.tab!=='catch'||force)render();
  }

  function bayHtml(q){
    const W=drawer.clientWidth-30||380,cap=Math.max(3,Math.floor((W-20)/66));
    const all=q.group.length?q.group:q.list.slice(0,1),g=all.slice(0,cap),more=all.length-g.length,n=Math.max(3,g.length+(more?1:0));
    const bw=Math.min(110,(W-20-(n-1)*8)/n);
    return`<div class="ag-bay" aria-hidden="true"><div class="dir">← 진행 방향</div><div class="lane"></div><div class="curb"><span>승강장 앞쪽</span><span>뒤쪽</span></div>`+
      g.map((v,i)=>`<div class="bus${v.low?' low':''}${v.route===S.route?' mine':''}${v.atStop?'':' coming'}" style="left:${10+i*(bw+8)}px;width:${bw}px"><b>${esc(v.route)}</b><i>${i+1}번째${v.atStop||bw<84?'':' · '+fmt(v.eta)}</i></div>`).join('')+(more?`<div class="bus more" style="left:${10+g.length*(bw+8)}px;width:${bw}px"><b>+${more}</b><i>대 더</i></div>`:'')+`</div>`;
  }
  function listHtml(q){
    return`<ul class="ag-list">`+(q.list.slice(0,10).map((v,i)=>`<li class="${v.route===S.route?'mine':''}"><span class="n">${i+1}</span><div><span class="r">${esc(v.route)}</span>${v.low?'<span class="ag-b low">저상</span>':''}${CONG[v.cong]?`<span class="ag-b c${v.cong}">${CONG[v.cong]}</span>`:''}${v.bunch||v.bunchNext?'<span class="ag-b bn">몰림</span>':''}<div class="m">${esc(v.dir)} 방면${v.dist&&!v.atStop?` · ${Math.round(v.dist)}m`:''}</div></div><span class="t">${v.atStop?(v.leaving?'출발 중':'정차 중'):fmt(v.eta)}</span></li>`).join('')||'<li><span></span><div>오는 버스가 없어요.</div><span></span></li>')+`</ul>`;
  }

  function render(){
    drawer.querySelectorAll('.ag-tabs button').forEach(b=>b.classList.toggle('on',b.dataset.t===S.tab));
    $('agAsk').hidden=S.tab!=='chat';
    const body=$('agBody');
    if(!S.stop){body.innerHTML='<div class="ag-say">지도에서 정류소를 누르고 <b>♿ 이 정류장 도착 순서</b> 버튼을 눌러 주세요.</div>';return;}
    if(S.tab==='queue'){
      if(!S.queue){body.innerHTML='<div class="ag-say">버스 정보를 불러오는 중이에요…</div>';return;}
      const say=queueSentence(S.queue);
      body.innerHTML=`<div class="ag-say" aria-live="polite" id="agSay">${esc(say)}</div>${bayHtml(S.queue)}
        <div class="ag-btns">${P().mute?'':'<button class="pri" id="agSpeak">🔊 음성으로 듣기</button>'}<button id="agRefresh">↻ 새로고침</button></div>
        <div class="ag-h">다가오는 버스</div>${listHtml(S.queue)}
        <div class="ag-note">버스 위치는 GPS 기준이라 실제와 몇 초 차이가 날 수 있어요. ${P().flash?'내 버스가 들어오면 화면이 노랗게 깜빡이고 진동이 울려요.':P().voice?'순서가 바뀌면 자동으로 읽어 드려요.':''}</div>`;
      const sp=$('agSpeak');if(sp)sp.onclick=()=>speak(say);
      $('agRefresh').onclick=()=>refresh(true);
    }else if(S.tab==='catch'){
      body.innerHTML=`<div class="ag-grid">
          <label>정류장까지 거리(m)<input id="agWalk" type="number" value="${lsGet('agentWalk')||80}" min="0" step="10"></label>
          <label>횡단보도 길이(m)<input id="agCross" type="number" value="${lsGet('agentCross')||15}" min="0"></label>
          <label>걷는 속도(m/초)<input id="agSpeed" type="number" value="${P().speed}" min="0.3" step="0.1"></label>
          <label>&nbsp;<button type="button" id="agGps">📍 내 위치로</button></label>
        </div>
        <div class="ag-btns"><button class="pri" id="agRun">판단하기</button>${P().mute?'':'<button id="agSay2">🔊 듣기</button>'}</div>
        <div id="agSig" class="ag-sig"></div><div id="agVerdict"></div><div id="agTl"></div>
        <div class="ag-note">걷는 속도는 이용자 유형에 맞춰 자동으로 바뀌어요. 신호는 서울시 실시간 신호 잔여시간을 써요.</div>`;
      $('agRun').onclick=runCatch;
      $('agGps').onclick=()=>navigator.geolocation?.getCurrentPosition(p=>{$('agWalk').value=Math.round(hav(p.coords.latitude,p.coords.longitude,S.stop.lat,S.stop.lng)*1.3);runCatch();},()=>{},{enableHighAccuracy:true,timeout:8000});
      const s2=$('agSay2');if(s2)s2.onclick=()=>speak($('agVerdict').dataset.say||'');
    }else{
      body.innerHTML=`<div class="ag-chat" id="agChat"></div>
        <div class="ag-sugg">${['지금 몇 번째에 서 있어?','지금 가면 탈 수 있어?','저상버스 언제 와?','덜 붐비는 버스는?'].map(t=>`<button type="button">${t}</button>`).join('')}</div>
        <div class="ag-key">AI 키 (선택)<input id="agKey" type="password" placeholder="입력하면 더 자연스럽게 대화해요" value="${esc(lsGet('agentKey')||'')}"></div>`;
      const log=$('agChat');
      S.chat.forEach(m=>{const d=document.createElement('div');d.className='ag-msg '+m.c;d.textContent=m.t;log.appendChild(d);});
      if(!S.chat.length)log.innerHTML='<div class="ag-msg bot">버스에 대해 편하게 물어보세요. 말로 물어봐도 돼요.</div>';
      body.querySelectorAll('.ag-sugg button').forEach(b=>b.onclick=()=>ask((S.route?S.route+'번 ':'')+b.textContent));
      $('agKey').onchange=e=>lsSet('agentKey',e.target.value.trim());
      body.scrollTop=1e9;
    }
  }

  async function runCatch(){
    lsSet('agentWalk',$('agWalk').value);lsSet('agentCross',$('agCross').value);
    $('agVerdict').innerHTML='<div class="ag-verdict"><b>판단 중…</b></div>';
    try{
      const x=await evaluate(S.route,+$('agWalk').value||0,+$('agCross').value||0,+$('agSpeed').value||P().speed);
      const sig=x.sig;
      $('agSig').innerHTML=!sig?'<span>근처에 신호 정보가 있는 교차로가 없어요</span>':sig.error?`<span>${esc(sig.error)}</span>`:
        `<span>🚦 ${esc(sig.inter.name)} ${Math.round(sig.inter.dist)}m</span>`+sig.peds.map(p=>`<span class="${p.color}${p===sig.pick?' pick':''}">${p.label}쪽 ${p.color==='g'?'초록':p.color==='y'?'점멸':'빨강'} ${p.remain!=null?(Math.round(p.remain)>0?Math.round(p.remain)+'초':'곧 바뀜'):''}</span>`).join('');
      const text=catchSentence(x),cls={ok:'ok',tight:'tight',next:'no',no:'no'}[x.verdict];
      const head={ok:'✅ 탈 수 있어요',tight:'⚠️ 빠듯해요',next:'⏳ 다음 차를 타세요',no:'❌ 어려워요'}[x.verdict];
      $('agVerdict').innerHTML=`<div class="ag-verdict ${cls}"><b>${head}</b><p>${esc(text)}</p></div>`;
      $('agVerdict').dataset.say=text;
      const end=Math.max(x.T,...x.pool.slice(0,3).map(v=>v.eta))+30,X=t=>(t/end*100).toFixed(2)+'%';
      const sg=(a,b,c,l)=>b>a?`<div class="sg ${c}" style="left:${X(a)};width:calc(${X(b)} - ${X(a)})">${l}</div>`:'';
      let h=sg(0,x.tReach,'w','걷기')+sg(x.tReach,x.pl.start,'wt','신호 대기')+sg(x.pl.start,x.T,'cr','횡단');
      h+=`<div class="mk" style="left:${X(x.T)};top:32px">${P().icon}<br>${fmt(x.T)}</div>`;
      x.pool.slice(0,3).forEach(v=>{if(v.eta<end)h+=`<div class="mk" style="left:${X(v.eta)};top:52px">🚌${esc(v.route)} ${fmt(v.eta)}</div>`;});
      for(let t=60;t<end;t+=60)h+=`<div class="ax" style="left:${X(t)}">${t/60}분</div>`;
      $('agTl').innerHTML=`<div class="ag-tl">${h}</div>`;
      if(P().voice)speak(text);
      if(P().flash&&x.verdict!=='ok')alertUser(1);
    }catch(e){$('agVerdict').innerHTML=`<div class="ag-verdict no"><b>판단하지 못했어요</b><p>${esc(e.message)}</p></div>`;}
  }

  const TOOLS=[
    {name:'find_stop',description:'정류소 이름이나 5자리 정류소 번호로 서울 버스 정류소를 찾아 선택한다. 사용자가 다른 정류소를 말하면 먼저 호출한다.',
      input_schema:{type:'object',properties:{query:{type:'string'}},required:['query'],additionalProperties:false}},
    {name:'stop_queue',description:'현재 정류소에 서 있거나 곧 들어오는 버스의 도착 순서, 승강장에서 몇 번째 칸인지, 저상 여부, 혼잡도, 같은 노선 몰림 여부를 실시간으로 계산한다.',
      input_schema:{type:'object',properties:{route:{type:'string',description:'탈 노선 번호, 없으면 빈 문자열'}},required:['route'],additionalProperties:false}},
    {name:'can_i_catch',description:'걷는 속도, 정류장까지 거리, 횡단보도 실시간 보행신호를 합쳐 노선 버스를 탈 수 있는지 판단한다.',
      input_schema:{type:'object',properties:{route:{type:'string'},walk_m:{type:'number',description:'정류장까지 거리(m), 모르면 0'}},required:['route','walk_m'],additionalProperties:false}}
  ];
  function findStops(q){
    q=String(q||'').replace(/\s|정류장|정류소/g,'');if(!q)return[];
    if(/^\d{5}$/.test(q))return[...NODE.values()].filter(s=>s.ars===q);
    const all=[...NODE.values()];
    return all.filter(s=>s.name.replace(/\s/g,'')===q).concat(all.filter(s=>s.name.replace(/\s/g,'').includes(q)&&s.name.replace(/\s/g,'')!==q));
  }
  async function tool(name,input){
    if(name==='find_stop'){
      let hits=findStops(input.query);
      if(S.stop&&hits.length>1)hits.sort((x,y)=>hav(S.stop.lat,S.stop.lng,x.lat,x.lng)-hav(S.stop.lat,S.stop.lng,y.lat,y.lng));
      if(hits[0]){const idx=STOPS.indexOf(hits[0]);if(idx>=0&&typeof selectStop==='function')selectStop(idx,true);S.stop=hits[0];S.queue=null;await refresh(true);}
      return{selected:hits[0]?.name||null,candidates:hits.slice(0,4).map(s=>`${s.name}(${s.ars})`)};
    }
    if(!S.stop)return{error:'정류소가 선택되지 않았어요'};
    if(name==='stop_queue'){
      const q=await buildQueue(S.stop);S.queue=q;
      return{stop:S.stop.name,sentence:queueSentence(q,input.route),buses:q.list.slice(0,8).map((v,i)=>({order:i+1,route:v.route,at_stop:v.atStop,eta_sec:v.eta,low_floor:v.low,crowd:CONG[v.cong]||'정보없음',bunched:!!(v.bunch||v.bunchNext)}))};
    }
    if(name==='can_i_catch'){
      const x=await evaluate(input.route,input.walk_m||+(lsGet('agentWalk')||80),+(lsGet('agentCross')||15),P().speed);
      return{verdict:x.verdict,sentence:catchSentence(x),arrive_stop_sec:Math.round(x.T),signal_wait_sec:Math.round(x.pl.wait),bus_eta_sec:x.pick?x.pick.eta:null};
    }
    return{error:'unknown tool'};
  }
  const history=[];
  async function askLLM(key,text,onTool){
    history.push({role:'user',content:text});
    const system=`너는 서울 시내버스 이용을 돕는 안내 도우미야. 이용자 유형: ${P().label}. 현재 정류소: ${S.stop?S.stop.name+'('+S.stop.ars+')':'없음'}. 선택한 노선: ${S.route||'없음'}.
버스 정보는 반드시 도구로 실시간 확인한 뒤 답해. 2~4문장 존댓말로, 표·기호·이모지 없이 귀로 듣기 좋게 말해.
버스 순서는 "맨 앞, 두 번째"로, 위치는 미터로 말해. 휠체어 사용자에게는 저상버스만 권하고, 위험하면 서두르게 하지 말고 다음 버스를 권해.`;
    for(let i=0;i<6;i++){
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'content-type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
        body:JSON.stringify({model:LLM_MODEL,max_tokens:16000,output_config:{effort:'low'},system,tools:TOOLS,messages:history})});
      if(!res.ok)throw new Error('응답 오류 '+res.status);
      const r=await res.json();
      history.push({role:'assistant',content:r.content});
      if(r.stop_reason==='refusal')return'그 질문에는 답하기 어려워요.';
      if(r.stop_reason!=='tool_use')return r.content.filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
      const results=await Promise.all(r.content.filter(b=>b.type==='tool_use').map(async b=>{
        onTool(b.name);
        try{return{type:'tool_result',tool_use_id:b.id,content:JSON.stringify(await tool(b.name,b.input))};}
        catch(e){return{type:'tool_result',tool_use_id:b.id,content:String(e.message||e),is_error:true};}
      }));
      history.push({role:'user',content:results});
    }
    return'확인이 오래 걸렸어요. 다시 물어봐 주세요.';
  }
  async function askRules(text,onTool){
    const t=text.replace(/\s+/g,' ');
    const routes=S.queue?S.queue.routes:[];
    const m=[...t.matchAll(/([0-9]{2,4}(?:-[0-9])?|[가-힣]{2}[0-9]{2})\s*번/g)].map(x=>x[1]).concat([...t.matchAll(/\b([0-9]{2,4})\b/g)].map(x=>x[1]));
    const route=m.find(r=>routes.includes(r)||ROUTES.some(x=>x.name===r))||'';
    const stopM=t.match(/([가-힣0-9.]{2,})(?:\s*(?:정류장|정류소))?에서/)||t.match(/([가-힣0-9.]{2,}(?:역|사거리|입구|가|앞|정류장|정류소))(?:으로|은|는|$|\s)/);
    if(stopM&&(!S.stop||!S.stop.name.includes(stopM[1].replace(/정류장|정류소/,'')))){
      onTool('find_stop');const f=await tool('find_stop',{query:stopM[1]});
      if(!f.selected)return`"${stopM[1]}" 정류소를 찾지 못했어요. 이름을 다시 말해 주세요.`;
    }
    if(!S.stop)return'먼저 정류소를 알려 주세요. "종로2가에서 143번 언제 와?"처럼 물어보면 돼요.';
    if(route&&route!==S.route){S.route=route;lsSet('agentRoute',route);}
    if(/(탈 ?수|타려면|놓치|늦|뛰어|가면)/.test(t)){
      if(!S.route)return'어떤 버스를 타실지 번호를 알려 주세요.';
      const d=t.match(/([0-9]+)\s*(m|미터)/);
      onTool('can_i_catch');return(await tool('can_i_catch',{route:S.route,walk_m:d?+d[1]:0})).sentence;
    }
    onTool('stop_queue');
    const q=await tool('stop_queue',{route:S.route});
    if(/(덜 ?붐|한산|혼잡|자리)/.test(t)){
      const c=S.queue.list.filter(v=>!S.route||v.route===S.route).filter(v=>CONG[v.cong]).sort((a,b)=>a.cong-b.cong||a.eta-b.eta)[0];
      if(c)return`${bn(c.route)} 중에서는 ${fmt(c.eta)} 뒤에 오는 차가 ${CONG[c.cong]}${/[가-힣]$/.test(CONG[c.cong])&&iye(CONG[c.cong])==='예요'?'라':'이라'} 가장 덜 붐벼요.`;
    }
    if(/저상/.test(t)){
      const lows=S.queue.list.filter(v=>v.low),say=v=>`${bn(v.route)} 저상버스가 ${v.atStop?'지금 정류장에 있어요':fmt(v.eta)+' 뒤에 와요'}.`;
      if(route){const l=lows.find(v=>v.route===route);return l?say(l):`${bn(route)}은 지금 오는 저상버스가 없어요.`+(lows[0]?` 다른 노선은 ${say(lows[0])}`:'');}
      if(!lows.length)return'지금 오는 저상버스가 없어요.';
      const mine=S.route&&lows.find(v=>v.route===S.route);
      return say(lows[0])+(mine&&mine!==lows[0]?` 타실 ${say(mine)}`:'');
    }
    return q.sentence;
  }
  const TOOL_LABEL={find_stop:'정류소 찾는 중',stop_queue:'도착 순서 계산 중',can_i_catch:'신호·거리 계산 중'};
  async function ask(text){
    if(!text.trim()||S.busy)return;
    S.busy=true;S.tab='chat';S.chat.push({c:'me',t:text});render();
    const log=$('agChat'),wait=document.createElement('div');wait.className='ag-msg tool';wait.textContent='생각하는 중…';log.appendChild(wait);
    const onTool=n=>{wait.textContent='· '+(TOOL_LABEL[n]||n);};
    let ans;
    const key=lsGet('agentKey');
    try{ans=key?await askLLM(key,text,onTool):await askRules(text,onTool);}
    catch(e){history.length=0;try{ans=await askRules(text,onTool);}catch(x){ans='지금은 정보를 불러오지 못했어요.';}}
    S.chat.push({c:'bot',t:ans});S.busy=false;render();speak(ans);
  }
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){const rec=new SR();rec.lang='ko-KR';rec.onresult=e=>ask(e.results[0][0].transcript);$('agMic').onclick=()=>{speechSynthesis.cancel();rec.start();};}
  else $('agMic').style.display='none';

  window.agentOpen=openDrawer;
  window.agentState=S;
  const params=new URL((performance.getEntriesByType('navigation')[0]||{}).name||location.href).searchParams;
  if(params.get('ag')){
    const s=[...NODE.values()].find(x=>x.ars===params.get('ag'));
    if(params.get('agp')&&PROFILES[params.get('agp')])S.profile=params.get('agp');
    if(params.get('agr'))S.route=params.get('agr');
    if(s)setTimeout(()=>openDrawer(s),600);
  }
})();
