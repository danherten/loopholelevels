import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';
// Used only for the Monthly Recap "Share" flow — rasterises the card DOM to
// a PNG so we can hand it to the native iOS / Android share sheet, or fall
// back to a download. ~15 KB gzipped; tree-shaken to just `toPng`.
import { toPng } from 'html-to-image';

const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || 'HollenAdmin2026';
const XP_PER_10_GMV = 100;
const DEFAULT_MILESTONES = [
  { id:1, days:3,   xp_bonus:50,   label:'3 Day Streak' },
  { id:2, days:7,   xp_bonus:100,  label:'1 Week Streak' },
  { id:3, days:14,  xp_bonus:250,  label:'2 Week Streak' },
  { id:4, days:30,  xp_bonus:500,  label:'1 Month Streak' },
  { id:5, days:60,  xp_bonus:1000, label:'2 Month Streak' },
  { id:6, days:100, xp_bonus:2000, label:'100 Day Streak' },
];
const DEFAULT_LEVELS = [
  {level:1,min:0,max:5000},{level:2,min:5000,max:10000},{level:3,min:10000,max:20000},
  {level:4,min:20000,max:40000},{level:5,min:40000,max:80000},{level:6,min:80000,max:160000},
  {level:7,min:160000,max:320000},{level:8,min:320000,max:640000},{level:9,min:640000,max:1280000},
  {level:10,min:1280000,max:9999999},
];
const TCOLS = {
  handle:['creator name','tiktok handle','creator handle','handle','tiktok @','username','creator username','@handle','tiktok id','creator id','name','influencer handle','affiliate handle','tiktoker','creator','tiktok','account','creator nickname'],
  sales:['affiliate-attributed items sold','items sold','units sold','items','total items','sales','sold items','sales count','items_sold'],
  gmv:['affiliate-attributed gmv','gmv','revenue','total gmv','gross revenue','gmv (gbp)','gmv (usd)','gmv(gbp)','gmv(usd)','total revenue','creator gmv'],
  orders:['attributed orders','orders','order count','total orders','num orders','# orders'],
  commission:['est. commission','commission','estimated commission','est commission','creator commission','total commission'],
  aov_col:['aov','average order value','avg order value'],
  product:['product name','product title','sku name','listing name','product id','item name'],
  cancelled:['items refunded','cancelled orders','cancellations','canceled orders','cancelled','canceled','refunded orders','returns','returned orders','cancel count'],
  cancelled_gmv:['refunds','cancelled gmv','canceled gmv','refunded gmv','returned gmv','cancellation value','refund value','return value','cancelled value'],
  live_streams:['live streams','lives','live stream count','livestreams','live','streams'],
};

function MiniChart({xpEvents}){
  const [mode,setMode]=React.useState('both');
  const byDay={};
  (xpEvents||[]).filter(e=>e.reason==='import'&&(e.gmv>0||e.commission>0)).forEach(e=>{
    const d=(e.created_at||'').slice(0,10);if(!d)return;
    if(!byDay[d])byDay[d]={date:d,gmv:0,comm:0};
    byDay[d].gmv+=e.gmv||0;byDay[d].comm+=e.commission||0;
  });
  const days=Object.values(byDay).sort((a,b)=>a.date.localeCompare(b.date));
  if(days.length<1) return(
    <div style={{borderRadius:14,overflow:'hidden',marginBottom:10}}>
      <div style={{height:3,background:'linear-gradient(90deg,#6b9b7d,#8ba4a8)'}}/>
      <div style={{background:'var(--card)',padding:'14px 16px',textAlign:'center'}}>
        <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4,textTransform:'uppercase',letterSpacing:1.5,fontWeight:500}}>GMV &amp; Commission</div>
        <div style={{fontSize:12,color:'var(--tx3)'}}>Import sales data to see your earnings trend</div>
      </div>
    </div>
  );
  const totalG=days.reduce((s,d)=>s+d.gmv,0);
  const totalC=days.reduce((s,d)=>s+d.comm,0);
  const showG=mode==='gmv'||mode==='both';
  const showC=mode==='comm'||mode==='both';
  const vals=[];if(showG)days.forEach(d=>vals.push(d.gmv));if(showC)days.forEach(d=>vals.push(d.comm));
  const maxVal=Math.max(...vals,1);
  const W=340,H=160,PAD_L=4,PAD_R=42,PAD_T=8,PAD_B=20;
  const innerW=W-PAD_L-PAD_R,innerH=H-PAD_T-PAD_B;
  const xScale=(i)=>days.length===1?PAD_L+innerW/2:PAD_L+(i/(days.length-1))*innerW;
  const yScale=(v)=>PAD_T+innerH-(v/maxVal)*innerH;
  const smooth=(pts,getY)=>{
    if(pts.length===0)return'';
    if(pts.length===1)return`M${xScale(0).toFixed(1)},${getY(pts[0]).toFixed(1)}`;
    let d=`M${xScale(0).toFixed(1)},${getY(pts[0]).toFixed(1)}`;
    for(let i=0;i<pts.length-1;i++){
      const i0=Math.max(0,i-1),i3=Math.min(pts.length-1,i+2);
      const x0=xScale(i0),y0=getY(pts[i0]);
      const x1=xScale(i),y1=getY(pts[i]);
      const x2=xScale(i+1),y2=getY(pts[i+1]);
      const x3=xScale(i3),y3=getY(pts[i3]);
      const cp1x=x1+(x2-x0)/6,cp1y=y1+(y2-y0)/6;
      const cp2x=x2-(x3-x1)/6,cp2y=y2-(y3-y1)/6;
      d+=` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`;
    }
    return d;
  };
  const gmvPath=smooth(days,d=>yScale(d.gmv));
  const commPath=smooth(days,d=>yScale(d.comm));
  const baseY=(PAD_T+innerH).toFixed(1);
  const gmvArea=gmvPath+` L${xScale(days.length-1).toFixed(1)},${baseY} L${xScale(0).toFixed(1)},${baseY} Z`;
  const commArea=commPath+` L${xScale(days.length-1).toFixed(1)},${baseY} L${xScale(0).toFixed(1)},${baseY} Z`;
  const yTicks=[1,0.66,0.33,0].map(p=>({y:yScale(maxVal*p),val:maxVal*p}));
  const labelCount=Math.min(5,days.length);
  const xLabels=[];
  for(let i=0;i<labelCount;i++){const idx=labelCount===1?0:Math.round(i*(days.length-1)/(labelCount-1));xLabels.push({x:xScale(idx),text:new Date(days[idx].date+'T00:00:00').toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit'})});}
  const fmtK=v=>v>=10000?`£${Math.round(v/1000)}k`:v>=1000?`£${(v/1000).toFixed(1)}k`:`£${Math.round(v)}`;
  return(
    <div style={{borderRadius:14,overflow:'hidden',marginBottom:10}}>
      <div style={{height:3,background:'linear-gradient(90deg,#6b9b7d,#8ba4a8)'}}/>
      <div style={{background:'var(--card)',padding:'14px 16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:11,gap:10}}>
          <div style={{minWidth:0}}>
            <div style={{fontSize:9,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:600,marginBottom:2}}>HOLLEN</div>
            <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',lineHeight:1.2}}>GMV &amp; Commission</div>
            <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{days.length} day{days.length===1?'':'s'}</div>
          </div>
          <div style={{display:'flex',gap:16,textAlign:'right',flexShrink:0}}>
            <div>
              <div style={{fontSize:8,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:600}}>GMV</div>
              <div style={{fontFamily:'var(--fh)',fontSize:18,color:'var(--gr)',letterSpacing:.5,lineHeight:1.1,marginTop:1}}>{fmtGBP(totalG)}</div>
            </div>
            <div>
              <div style={{fontSize:8,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:600}}>COMMISSION</div>
              <div style={{fontFamily:'var(--fh)',fontSize:18,color:'var(--go)',letterSpacing:.5,lineHeight:1.1,marginTop:1}}>{fmtGBP(totalC)}</div>
            </div>
          </div>
        </div>
        <div style={{display:'flex',background:'var(--bg2)',borderRadius:99,padding:3,marginBottom:10,gap:0,width:'fit-content'}}>
          {[['gmv','GMV'],['comm','Commission'],['both','Both']].map(([val,label])=>(
            <button key={val} onClick={()=>setMode(val)} style={{padding:'5px 13px',border:'none',borderRadius:99,background:mode===val?'var(--pu)':'transparent',color:mode===val?'#fff':'var(--tx3)',fontSize:11,fontWeight:600,cursor:'pointer',transition:'all .15s',fontFamily:'var(--fb)'}}>{label}</button>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{width:'100%',height:160,overflow:'visible'}}>
          <defs>
            <linearGradient id="mc-gmv" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6b9b7d" stopOpacity="0.28"/>
              <stop offset="100%" stopColor="#6b9b7d" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="mc-comm" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#c9a24b" stopOpacity="0.18"/>
              <stop offset="100%" stopColor="#c9a24b" stopOpacity="0"/>
            </linearGradient>
          </defs>
          {yTicks.map((t,i)=>(<g key={i}>
            <line x1={PAD_L} y1={t.y} x2={W-PAD_R} y2={t.y} stroke="rgba(255,255,255,.06)" strokeDasharray="2 3"/>
            <text x={W-PAD_R+3} y={t.y+3} fill="rgba(238,238,248,.35)" fontSize="8" fontFamily="var(--fb)" textAnchor="start">{fmtK(t.val)}</text>
          </g>))}
          {showG&&<path d={gmvArea} fill="url(#mc-gmv)"/>}
          {showC&&mode==='comm'&&<path d={commArea} fill="url(#mc-comm)"/>}
          {showG&&<path d={gmvPath} fill="none" stroke="#6b9b7d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>}
          {showC&&<path d={commPath} fill="none" stroke="#c9a24b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={mode==='comm'?'0':'4 3'}/>}
          {showG&&<circle cx={xScale(days.length-1)} cy={yScale(days[days.length-1].gmv)} r="2.8" fill="#6b9b7d"/>}
          {showC&&<circle cx={xScale(days.length-1)} cy={yScale(days[days.length-1].comm)} r="2.8" fill="#c9a24b"/>}
          {xLabels.map((l,i)=>(<text key={i} x={l.x} y={H-5} fill="rgba(238,238,248,.35)" fontSize="8" fontFamily="var(--fb)" textAnchor="middle">{l.text}</text>))}
        </svg>
      </div>
    </div>
  );
}

function HowToEarnDropdown({milestones}){
  const [open,setOpen]=React.useState(false);
  const items=[
    {icon:'🛒',label:'Generate Sales',sub:'Every £10 in net GMV you generate',val:'+100 XP'},
    {icon:'🔥',label:'Daily Streak',sub:'Make sales every day to keep your streak',val:'Milestone XP'},
    {icon:'👥',label:'Refer a Creator',sub:'They earn, you earn 1% GMV',val:'+100 XP & 1% GMV'},
  ];
  return(
    <div style={{marginBottom:13}}>
      <button onClick={()=>setOpen(!open)} style={{width:'100%',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:open?'var(--rsm) var(--rsm) 0 0':'var(--rsm)',padding:'11px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:'var(--tx)'}}>
        <div style={{fontFamily:'var(--fh)',fontSize:15,letterSpacing:1.5}}>HOW TO EARN XP</div>
        <span style={{fontSize:11,color:'var(--tx3)',transition:'transform .2s',display:'inline-block',transform:open?'rotate(180deg)':'none'}}>▼</span>
      </button>
      {open&&(<div style={{background:'var(--card)',border:'1px solid var(--bo)',borderTop:'none',borderRadius:'0 0 var(--rsm) var(--rsm)'}}>
        {items.map((item,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderBottom:i<items.length-1?'1px solid var(--bo)':'none'}}>
            <span style={{fontSize:17,width:24,textAlign:'center',flexShrink:0}}>{item.icon}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:12,fontWeight:500}}>{item.label}</div>
              <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{item.sub}</div>
            </div>
            <div style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--pu2)',flexShrink:0}}>{item.val}</div>
          </div>
        ))}
      </div>)}
    </div>
  );
}
function getLv(xp,levels){const L=levels||DEFAULT_LEVELS;for(let i=L.length-1;i>=0;i--)if(xp>=L[i].min)return L[i];return L[0]}
// Highest reward tier the user has actually EARNED — i.e. crossed the
// xp_required threshold. Different from getLv().level which is the tier
// the user is currently working WITHIN. A user with 4,999 XP is at
// getLv=1 ('Level 1') but has earned 0 reward tiers because they haven't
// hit L1's 5,000 XP threshold yet.
function achievedLevel(xp,rewards){let max=0;(rewards||[]).forEach(r=>{if((xp||0)>=(r.xp_required||0))max=Math.max(max,r.level||0);});return max;}
function getNx(xp,levels){const L=levels||DEFAULT_LEVELS;const c=getLv(xp,L);const i=L.findIndex(l=>l.level===c.level);return L[i+1]||null}
function xpPct(xp,levels){const c=getLv(xp,levels);return Math.min(100,Math.round(((xp-c.min)/(c.max-c.min))*100))}
function ini(n){return(n||'').slice(0,2).toUpperCase()||'??'}
function avc(n){const c=['#c9a24b','#c9a24b','#8ba4a8','#c9a24b','#6b9b7d','#b04a55'];let h=0;for(const x of n||'')h=(h*31+x.charCodeAt(0))%c.length;return c[h]}
function tdy(){return new Date().toISOString().slice(0,10)}
// Admin period → {from,to,prevFrom,prevTo} half-open windows ([from,to)).
// 'today' means the full calendar day BEFORE today ("Yesterday") because imports
// are back-stamped to noon of the import date — a rolling last-24h-from-now window
// would miss yesterday's noon-stamped events. 7d/30d stay rolling from now. 'all'→null.
function periodWindow(period,customStart,customEnd){
  if(!period||period==='all')return null;
  const dayMs=86400000;
  if(period==='custom'){
    if(!customStart||!customEnd)return null;
    const from=new Date(customStart);from.setHours(0,0,0,0);
    const to=new Date(customEnd);to.setHours(23,59,59,999);
    if(to<=from)return null;
    const span=to.getTime()-from.getTime();
    return{from,to,prevFrom:new Date(from.getTime()-span-1),prevTo:new Date(from.getTime()-1)};
  }
  if(period==='today'){
    const todayStart=new Date();todayStart.setHours(0,0,0,0);
    const from=new Date(todayStart.getTime()-dayMs);
    return{from,to:todayStart,prevFrom:new Date(from.getTime()-dayMs),prevTo:from};
  }
  const days=period==='7d'?7:period==='30d'?30:null;
  if(!days)return null;
  const now=new Date();
  const from=new Date(now.getTime()-days*dayMs);
  return{from,to:now,prevFrom:new Date(from.getTime()-days*dayMs),prevTo:from};
}
// Whole days elapsed since an ISO timestamp. Negative input → null.
function daysSince(iso){if(!iso)return null;const d=new Date(iso).getTime();if(!d||isNaN(d))return null;return Math.max(0,Math.floor((Date.now()-d)/86400000));}
// Monthly batch payout cadence: anything that happens in month N is due on
// the 15th of month N+1. May crossings → due 15 June, June → 15 July, etc.
// Picked so the minimum wait (cross on month-end) is ~15 days — enough buffer
// past the TikTok Shop return window without a whole-month delay.
function payoutDueDate(iso){if(!iso)return null;const d=new Date(iso);if(isNaN(d))return null;return new Date(d.getFullYear(),d.getMonth()+1,15,23,59,59,999);}
function daysUntil(d){if(!d)return null;return Math.ceil((d.getTime()-Date.now())/86400000);}
function fmtDueDate(d){return d?d.toLocaleDateString('en-GB',{day:'numeric',month:'short'}):'';}
// Walks a profile's xp_events in chronological order and finds the first event
// whose running XP total crosses each reward.xp_required threshold. Returns
// { level: ISO timestamp } for every level the profile has unlocked.
function computeUnlockDates(events,rewards){
  if(!events||!events.length||!rewards||!rewards.length)return{};
  const sortedEvents=[...events].sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
  const sortedRewards=[...rewards].sort((a,b)=>(a.xp_required||0)-(b.xp_required||0));
  const dates={};
  let runningXp=0;
  for(const e of sortedEvents){
    const prevXp=runningXp;
    runningXp+=(e.amount||0);
    for(const r of sortedRewards){
      const req=r.xp_required||0;
      if(dates[r.level]==null&&prevXp<req&&runningXp>=req){dates[r.level]=e.created_at;}
    }
  }
  return dates;
}
function fmtGBP(v){return'£'+(Number(v)||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
function findCol(headers,type){const maps=TCOLS[type];for(const m of maps){const f=headers.find(h=>h.toLowerCase().replace(/[_\-]/g,' ').trim()===m||h.toLowerCase().includes(m));if(f)return f;}return null}
function parseCSV(text){const lines=text.split(/\r?\n/).filter(l=>l.trim());if(!lines.length)return[];const dl=lines[0].includes('\t')?'\t':',';const hdrs=splitLine(lines[0],dl);return lines.slice(1).map(line=>{const vals=splitLine(line,dl);const obj={};hdrs.forEach((h,i)=>{obj[h.trim()]=vals[i]!==undefined?vals[i].trim():'';});return obj;}).filter(r=>Object.values(r).some(v=>v))}
function splitLine(l,dl){const r=[];let cur='';let inQ=false;for(const c of l){if(c==='"'){inQ=!inQ;}else if(c===dl&&!inQ){r.push(cur);cur='';}else{cur+=c;}}r.push(cur);return r.map(s=>s.replace(/^"|"$/g,'').trim())}

const CSS=`
:root{--bg:#0d0d0e;--bg2:#131315;--card:#17171a;--card2:#1e1e22;--card3:#2a2a2f;--bo:rgba(245,241,235,.06);--bo2:rgba(245,241,235,.11);--tx:#f5f1eb;--tx2:rgba(245,241,235,.62);--tx3:rgba(245,241,235,.34);--pu:#c9a24b;--pu2:#d4b465;--pu3:#e5cd8e;--go:#c9a24b;--gr:#6b9b7d;--re:#b04a55;--cy:#8ba4a8;--r:14px;--rsm:10px;--rxs:7px;--nav:52px;--sb:env(safe-area-inset-bottom,0px);--st:env(safe-area-inset-top,0px);--fh:'Manrope',-apple-system,sans-serif;--fb:'Manrope',-apple-system,sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html{height:100%}
/* body height is set in JS from window.innerHeight to bypass iOS dvh/svh/lvh
   inconsistency in standalone PWAs. Fallback to 100% if JS hasn't run yet. */
body{margin:0;height:100%;overflow:hidden;overscroll-behavior:none;-webkit-overflow-scrolling:auto}
#root{height:100%;display:flex;flex-direction:column;background:#0a0a0b;color:var(--tx);font-family:var(--fb)}
input,button{font-family:var(--fb)}
.app{display:flex;flex-direction:column;flex:1;min-height:0;width:100%;position:relative;max-width:100%}

.topbar{padding:9px 14px 8px;padding-top:calc(9px + var(--st));display:flex;align-items:center;justify-content:space-between;background:rgba(7,7,16,.96);backdrop-filter:blur(12px);border-bottom:1px solid var(--bo);flex-shrink:0}
.topbar.no-st{padding-top:9px}
.upd-banner{background:rgba(201,162,75,.1);border-bottom:1px solid rgba(201,162,75,.2);padding:5px 14px;padding-top:calc(5px + var(--st));display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.tr{display:flex;align-items:center;gap:7px}
.streak-pill{display:flex;align-items:center;gap:4px;background:rgba(201,162,75,.14);border:1px solid rgba(201,162,75,.28);border-radius:99px;padding:3px 9px;font-size:13px;font-weight:700;color:var(--go);cursor:pointer;letter-spacing:.3px}
.xpchip{background:rgba(201,162,75,.18);border:1px solid rgba(201,162,75,.28);border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600;color:var(--pu3)}
.av{width:29px;height:29px;border-radius:50%;border:2px solid var(--pu);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--fh);letter-spacing:1px;overflow:hidden;flex-shrink:0}
.av img{width:100%;height:100%;object-fit:cover}
.pages{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:calc(76px + var(--sb) + 12px);min-height:0;-webkit-overflow-scrolling:touch}
/* Desktop has no fixed bottom-nav, so the mobile padding is overkill — trim it. */
@media (min-width:768px){.pages{padding-bottom:24px}}
.pages::-webkit-scrollbar{display:none}
.pg{padding:13px}
.bnav{position:fixed;top:auto;left:12px;right:12px;bottom:max(6px,calc(var(--sb) - 12px));background:linear-gradient(to bottom,rgba(48,48,74,.26),rgba(18,18,34,.34));backdrop-filter:blur(34px) saturate(210%);-webkit-backdrop-filter:blur(34px) saturate(210%);border:1px solid rgba(255,255,255,.16);border-radius:30px;box-shadow:inset 0 1px 0 rgba(255,255,255,.2),inset 0 -1px 1px rgba(0,0,0,.18),0 10px 34px rgba(0,0,0,.4);display:flex;align-items:center;padding:6px;z-index:50;will-change:auto;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;}
.bnav.dragging{cursor:grabbing}
.nind{position:absolute;top:6px;bottom:6px;border-radius:22px;background:linear-gradient(to bottom,rgba(255,255,255,.2),rgba(255,255,255,.09));box-shadow:inset 0 1px 0 rgba(255,255,255,.28),inset 0 -1px 2px rgba(0,0,0,.18),0 3px 10px rgba(0,0,0,.32);transform-origin:center;transition:left .42s cubic-bezier(.34,1.56,.64,1),width .42s cubic-bezier(.34,1.56,.64,1),transform .18s ease;pointer-events:none;z-index:0;}
.ni{position:relative;z-index:1;flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:7px 2px;margin:0 1px;cursor:pointer;border:none;background:none;min-width:0;pointer-events:none;}
.nicon{font-size:17px;line-height:1}
.nlbl{font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:var(--tx3);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center;transition:color .2s}
.ni.on .nlbl{color:var(--tx)}
.hero{background:var(--card);border:1px solid var(--bo2);border-radius:var(--r);padding:15px;margin-bottom:11px;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;top:-45px;right:-45px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(201,162,75,.16) 0%,transparent 70%);pointer-events:none}
.lvlbadge{display:inline-flex;align-items:center;background:rgba(201,162,75,.14);border:1px solid rgba(201,162,75,.26);border-radius:99px;padding:3px 9px;margin-bottom:7px}
.lvlbtxt{font-size:11px;color:var(--pu2);font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.lvlnum{font-family:var(--fh);font-size:38px;letter-spacing:2px;line-height:1;margin-bottom:4px}
.lvlinfo{font-size:12px;color:var(--tx2);margin-bottom:10px}
.lvlinfo strong{color:var(--tx);font-weight:600}
.xpbar{height:7px;background:var(--card3);border-radius:99px;overflow:hidden}
.xpfill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--pu) 0%,var(--cy) 100%);transition:width 1.2s cubic-bezier(.34,1.56,.64,1)}
.xpnums{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--tx3)}
.chips{display:flex;gap:7px;margin-bottom:11px}
.chip{flex:1;background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:9px;text-align:center}
.chip.hot{border-color:rgba(201,162,75,.22);background:rgba(201,162,75,.04)}
.cv{font-family:var(--fh);font-size:22px;letter-spacing:1px;line-height:1}
.cv.go{color:var(--go)}.cv.pu{color:var(--pu2)}.cv.gr{color:var(--gr)}
.cl{font-size:9px;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3);margin-top:3px}
.sh{font-family:var(--fh);font-size:17px;letter-spacing:2px;margin-bottom:9px}
.sh small{font-family:var(--fb);font-size:10px;letter-spacing:.5px;color:var(--tx3);font-weight:400;margin-left:6px;text-transform:uppercase}
.rscroll{display:flex;gap:9px;overflow-x:auto;padding-bottom:5px;margin:0 -13px;padding-left:13px;padding-right:13px}
.rscroll::-webkit-scrollbar{display:none}
.rc{min-width:116px;border-radius:var(--r);flex-shrink:0;cursor:pointer;position:relative;overflow:hidden;transition:transform .15s}
.rc:active{transform:scale(.97)}
.rc-inner{background:var(--card);border:1px solid var(--bo);border-radius:var(--r);overflow:hidden;height:100%}
.rc.un .rc-inner{border-color:rgba(107,155,125,.32);background:rgba(107,155,125,.04)}
.rc.cur .rc-inner{border-color:rgba(201,162,75,.5);background:rgba(201,162,75,.08);box-shadow:0 0 12px rgba(201,162,75,.2)}
.rc-img-wrap{width:100%;height:86px;background:var(--card3);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden}
.rc-img-wrap img{width:100%;height:100%;object-fit:cover}
.rc-ph{font-size:26px;opacity:.3}
.rc-badge{position:absolute;top:5px;right:5px;padding:2px 6px;border-radius:99px;font-size:9px;font-weight:700}
.rc-badge.un{background:var(--gr);color:#fff}
.rc-badge.cur{background:var(--pu);color:#fff}
.rc-badge.lk{background:rgba(0,0,0,.5);color:var(--tx3);font-size:11px}
.rc-body{padding:8px 9px}
.rc-lv{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--tx3);margin-bottom:2px}
.rc-nm{font-size:11px;font-weight:600;line-height:1.3;margin-bottom:4px}
.rc-xp{font-size:10px;color:var(--pu3)}
.rc-prog{height:3px;background:var(--card3);border-radius:99px;overflow:hidden;margin-top:4px}
.rc-pf{height:100%;background:linear-gradient(90deg,var(--pu),var(--cy));border-radius:99px}
.lbrow{display:flex;align-items:center;gap:9px;padding:8px 0;border-bottom:1px solid var(--bo)}
.lbrow:last-child{border-bottom:none}
.lbrow.me{background:rgba(201,162,75,.06);border-radius:var(--rxs);margin:0 -4px;padding:8px 4px}
.lbrk{font-family:var(--fh);font-size:16px;letter-spacing:1px;width:22px;text-align:center;color:var(--tx3)}
.lbrk.g{color:var(--go)}.lbrk.s{color:#bbb}.lbrk.b{color:#cd7f32}
.lbav{width:29px;height:29px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-size:11px;flex-shrink:0;color:#fff;overflow:hidden}
.lbav img{width:100%;height:100%;object-fit:cover}
.lbin{flex:1;min-width:0}
.lbnm{font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbtt{font-size:10px;color:var(--tx3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbrt{text-align:right;flex-shrink:0}
.lbxp{font-family:var(--fh);font-size:14px;letter-spacing:.5px;color:var(--pu2)}
.lblv{font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px}
.phead{background:var(--card);border:1px solid var(--bo2);border-radius:var(--r);padding:16px;text-align:center;margin-bottom:9px}
.p-av{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:var(--fh);font-size:21px;border:3px solid var(--pu);margin:0 auto 7px;color:#fff;overflow:hidden}
.p-av img{width:100%;height:100%;object-fit:cover}
.pnm{font-family:var(--fh);font-size:21px;letter-spacing:2px;margin-bottom:5px}
.ttchips{display:flex;flex-wrap:wrap;justify-content:center;gap:4px}
.ttchip{background:var(--card2);border:1px solid var(--bo);border-radius:99px;padding:3px 8px;font-size:11px;color:var(--tx2)}
.pstats{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:9px}
.pst{background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:9px;text-align:center}
.pstv{font-family:var(--fh);font-size:18px;letter-spacing:1px}
.pstl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--tx3);margin-top:2px}
.mcard{background:var(--card);border:1px solid var(--bo);border-radius:var(--r);overflow:hidden;margin-bottom:8px}
.mi{display:flex;align-items:center;justify-content:space-between;padding:11px 13px;cursor:pointer;border-bottom:1px solid var(--bo);transition:background .18s}
.mi:last-child{border-bottom:none}
.mi:hover{background:var(--card2)}
.mil{display:flex;align-items:center;gap:9px;font-size:13px}
.mii{font-size:15px;width:18px;text-align:center}
.mich{color:var(--tx3);font-size:13px}
.admb{background:linear-gradient(135deg,rgba(201,162,75,.14) 0%,rgba(139,164,168,.07) 100%);border:1px solid rgba(201,162,75,.22);border-radius:var(--r);padding:13px;margin-bottom:11px;display:flex;align-items:center;gap:10px}
.admstats{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:9px}
.admstat{background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:11px}
.admsv{font-family:var(--fh);font-size:21px;letter-spacing:1px}
.admsl{font-size:9px;text-transform:uppercase;letter-spacing:.8px;color:var(--tx3);margin-top:2px}
.asec{background:var(--card);border:1px solid var(--bo);border-radius:var(--r);padding:13px;margin-bottom:9px}
.asect{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--tx3);margin-bottom:9px;font-weight:600}
.afrow{display:flex;align-items:center;gap:7px;padding:7px 0;border-bottom:1px solid var(--bo)}
.afrow:last-child{border-bottom:none}
.afin{flex:1;min-width:0}
.afnm{font-size:12px;font-weight:500}
.afmt{font-size:10px;color:var(--tx3);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.afac{display:flex;gap:4px;align-items:center;flex-shrink:0}
.xpin{width:48px;padding:4px 5px;background:var(--bg2);border:1px solid var(--bo2);border-radius:var(--rxs);color:var(--tx);font-size:11px;outline:none;text-align:center}
.xpin:focus{border-color:var(--pu2)}
.xbtn{background:rgba(201,162,75,.14);border:1px solid rgba(201,162,75,.26);border-radius:var(--rxs);padding:4px 7px;color:var(--pu2);font-size:11px;font-weight:600;cursor:pointer}
.aact{width:100%;padding:9px 11px;background:var(--card2);border:1px solid var(--bo);border-radius:var(--rsm);color:var(--tx2);font-size:12px;cursor:pointer;margin-bottom:5px;text-align:left;display:flex;align-items:center;gap:8px;transition:border-color .2s}
.aact:hover{border-color:var(--pu2);color:var(--tx)}
.aact:last-child{margin-bottom:0}
.dz{border:2px dashed var(--bo2);border-radius:var(--r);padding:20px 13px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;position:relative}
.dz:hover,.dz.drag{border-color:var(--pu);background:rgba(201,162,75,.05)}
.dz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.ilog{background:var(--bg2);border:1px solid var(--bo);border-radius:var(--rsm);padding:9px;margin-top:7px;font-size:11px;color:var(--tx2);line-height:1.65;max-height:120px;overflow-y:auto;font-family:monospace}
.logo{color:var(--gr)}.logw{color:var(--go)}.loge{color:var(--re)}
.rerow{padding:9px 0;border-bottom:1px solid var(--bo)}
.rerow:last-child{border-bottom:none}
.ins{padding:7px 9px;background:var(--bg2);border:1px solid var(--bo2);border-radius:var(--rxs);color:var(--tx);font-size:12px;outline:none;width:100%}
.ins:focus{border-color:var(--pu2)}
.svbtn{background:rgba(107,155,125,.11);border:1px solid rgba(107,155,125,.23);border-radius:var(--rxs);padding:5px 9px;color:var(--gr);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.bp-vcard{border-radius:var(--r);border:1px solid var(--bo);background:var(--card);padding:16px;margin:0 13px 11px;display:flex;gap:14px;align-items:center;cursor:pointer;position:relative;overflow:hidden;transition:transform .15s;}
.bp-vcard.un{border-color:rgba(107,155,125,.3);background:rgba(107,155,125,.05);}
.bp-vcard.cur{border-color:rgba(201,162,75,.5);background:rgba(201,162,75,.08);}
.bp-vcard.lk{opacity:.5;}
.bp-vcard.cur::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(201,162,75,.18) 0%,transparent 70%);pointer-events:none;}
.bp-vcard.un::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(107,155,125,.12) 0%,transparent 70%);pointer-events:none;}
.bp-vimg{width:72px;height:72px;border-radius:12px;background:var(--card2);display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--bo);flex-shrink:0;}
.bp-vimg img{width:100%;height:100%;object-fit:cover;}
.bp-vbody{flex:1;min-width:0;}
.bp-vlv{font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:3px;}
.bp-vnm{font-size:15px;font-weight:600;color:var(--tx);margin-bottom:2px;line-height:1.3;}
.bp-vxp{font-size:11px;color:var(--tx3);margin-bottom:8px;}
.bp-vbar{height:5px;background:var(--card3);border-radius:99px;overflow:hidden;}
.bp-vfill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--pu),var(--cy));}
.bp-vneed{font-size:10px;color:var(--tx3);margin-top:4px;}
.bp-vbadge{position:absolute;top:10px;right:10px;font-size:9px;font-weight:700;padding:3px 7px;border-radius:99px;letter-spacing:.3px;}
.bp-vbadge.un{background:rgba(107,155,125,.15);color:var(--gr);}
.bp-vbadge.cur{background:rgba(201,162,75,.2);color:var(--pu2);}
.bp-vbadge.lk{background:var(--card2);color:var(--tx3);}
.bp-next{background:linear-gradient(135deg,rgba(201,162,75,.1) 0%,rgba(201,162,75,.04) 100%);border:1px solid rgba(201,162,75,.3);border-radius:var(--r);padding:16px;margin:0 13px 13px;display:flex;align-items:center;gap:14px;cursor:pointer;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px}
.stat-card{background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:11px}
.stat-v{font-family:var(--fh);font-size:18px;letter-spacing:1px;margin-bottom:2px}
.stat-l{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3)}
.ref-card{background:linear-gradient(135deg,rgba(201,162,75,.12) 0%,rgba(139,164,168,.08) 100%);border:1px solid rgba(201,162,75,.25);border-radius:var(--r);padding:15px;margin-bottom:11px}
.ref-code{font-family:var(--fh);font-size:24px;letter-spacing:4px;color:var(--pu2);background:var(--card2);border-radius:var(--rsm);padding:9px;text-align:center;margin:9px 0;cursor:pointer}
.howto-item{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--bo)}
.howto-item:last-child{border-bottom:none}
.atab{padding:8px 14px;border-radius:99px;border:1px solid var(--bo);background:var(--card);color:var(--tx2);font-size:12px;font-weight:600;cursor:pointer;letter-spacing:.3px;display:inline-flex;align-items:center;gap:6px;transition:all .15s;font-family:var(--fb)}
.atab:hover{border-color:var(--bo2);color:var(--tx)}
.atab.on{background:rgba(201,162,75,.16);border-color:rgba(201,162,75,.45);color:var(--pu2)}
.aseg{display:inline-flex;background:var(--card2);border:1px solid var(--bo);border-radius:99px;padding:3px;gap:2px}
.aseg button{padding:5px 13px;border:none;background:transparent;color:var(--tx3);font-size:11px;font-weight:600;border-radius:99px;cursor:pointer;letter-spacing:.3px;font-family:var(--fb)}
.aseg button.on{background:var(--pu);color:#fff;box-shadow:0 1px 4px rgba(201,162,75,.4)}
.ahk{background:rgba(7,7,16,.55);border:1px solid var(--bo);border-radius:12px;padding:13px 15px;position:relative;overflow:hidden}
.ahkl{font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.9px;font-weight:700;margin-bottom:6px}
.ahkv{font-family:var(--fh);font-size:28px;line-height:1;letter-spacing:.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ahkd{font-size:10.5px;margin-top:7px;color:var(--tx3);display:flex;align-items:center;gap:5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.2}
.ahkd.up{color:var(--gr)}.ahkd.dn{color:var(--re)}
.ahkd .vs{color:var(--tx3);font-weight:500}
.asub{background:var(--card);border:1px solid var(--bo);border-radius:10px;padding:8px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.asubl{font-size:9px;color:var(--tx3);text-transform:uppercase;letter-spacing:.7px;font-weight:700}
.asubv{font-family:var(--fh);font-size:15px;letter-spacing:.4px}
.astrip{background:linear-gradient(90deg,rgba(107,155,125,.08),rgba(139,164,168,.05) 50%,transparent);border:1px solid var(--bo);border-left:3px solid var(--gr);border-radius:10px;padding:10px 13px;display:flex;align-items:center;gap:13px;flex-wrap:wrap;margin-bottom:11px}
.astrip .si{display:flex;align-items:center;gap:5px;font-size:12px;color:var(--tx2)}
.astrip .si strong{color:var(--tx);font-weight:600}
.astrip .si .b{font-family:var(--fh);font-size:14px;letter-spacing:.3px}
.astrip .si .b.gr{color:var(--gr)}.astrip .si .b.go{color:var(--go)}.astrip .si .b.pu{color:var(--pu2)}
.atask{display:flex;align-items:center;gap:11px;padding:11px 13px;border:1px solid var(--bo);border-radius:10px;background:var(--card2);cursor:pointer;transition:all .15s}
.atask:hover{border-color:var(--bo2);background:rgba(201,162,75,.06);transform:translateX(2px)}
.atask.warn{border-left:3px solid var(--go)}
.atask.crit{border-left:3px solid var(--re)}
.atask.info{border-left:3px solid var(--cy)}
.atask.ok{border-left:3px solid var(--gr)}
.aqab{padding:10px 13px;border-radius:10px;background:var(--card2);border:1px solid var(--bo);color:var(--tx);font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:7px;letter-spacing:.3px;transition:all .15s;font-family:var(--fb)}
.aqab:hover{background:var(--card3);border-color:var(--bo2)}
.howto-icon{font-size:18px;width:28px;text-align:center;flex-shrink:0}
.howto-xp{font-family:var(--fh);font-size:14px;color:var(--pu2);flex-shrink:0}
.pw{height:4px;background:var(--card3);border-radius:99px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,var(--pu),var(--cy));border-radius:99px}
.authwrap{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden}
.authwrap::before{content:'';position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(201,162,75,.12) 0%,transparent 70%);top:-80px;right:-150px;pointer-events:none}
.asub{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:var(--tx3);margin-bottom:26px;text-align:center}
.abox{width:100%;max-width:360px;background:var(--card);border:1px solid var(--bo2);border-radius:var(--r);padding:19px;position:relative;z-index:1}
.tabs{display:flex;background:var(--bg2);border-radius:var(--rsm);padding:3px;gap:3px;margin-bottom:15px}
.tab{flex:1;padding:7px;border:none;background:transparent;color:var(--tx3);border-radius:var(--rxs);cursor:pointer;font-size:12px;font-weight:500;transition:all .2s}
.tab.on{background:var(--pu);color:#fff}
.fg{display:flex;flex-direction:column;gap:9px}
.lbl{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;color:var(--tx3);margin-bottom:4px;display:block}
.inp{width:100%;padding:10px 11px;background:var(--bg2);border:1px solid var(--bo2);border-radius:var(--rsm);color:var(--tx);font-size:14px;outline:none;transition:border .18s}
.inp:focus{border-color:var(--pu2)}
.inp::placeholder{color:var(--tx3)}
.trow{display:flex;gap:6px}.trow .inp{flex:1}
.icobtn{width:35px;height:35px;background:var(--card2);border:1px solid var(--bo2);border-radius:var(--rxs);color:var(--tx2);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
.addtt{background:none;border:none;color:var(--pu2);font-size:12px;cursor:pointer;padding:2px 0;margin-top:5px;display:block}
.btn{width:100%;padding:11px;border:none;border-radius:var(--rsm);font-family:var(--fh);font-size:18px;letter-spacing:2px;cursor:pointer;margin-top:3px}
.btnpu{background:linear-gradient(135deg,var(--pu) 0%,#7c3aed 100%);color:#fff}
.btnre{background:rgba(176,74,85,.1);border:1px solid rgba(176,74,85,.25);color:var(--re);font-family:var(--fb);font-size:13px;font-weight:500;padding:9px}
.ferr{min-height:15px;font-size:12px;color:var(--re);text-align:center;margin-top:4px}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:fi .2s ease}
@keyframes fi{from{opacity:0}to{opacity:1}}
@keyframes ll-pulse{0%,100%{opacity:.35}50%{opacity:.7}}
.sheet{background:var(--card);border:1px solid var(--bo2);border-radius:20px 20px 0 0;padding:19px 17px;padding-bottom:calc(19px + var(--sb));width:100%;max-width:520px;animation:su .3s ease}
@keyframes su{from{transform:translateY(100%)}to{transform:translateY(0)}}
.clmbtn{width:100%;padding:12px;border:none;border-radius:var(--rsm);background:linear-gradient(135deg,var(--pu) 0%,#7c3aed 100%);color:#fff;font-family:var(--fh);font-size:19px;letter-spacing:2px;cursor:pointer;transition:opacity .2s}
.clmbtn:disabled{opacity:.35;cursor:not-allowed}
.shcan{width:100%;margin-top:7px;background:none;border:none;color:var(--tx3);font-size:13px;cursor:pointer;padding:5px}
.lvlup-ov{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:500;display:flex;align-items:center;justify-content:center;animation:fi .3s ease}
.lvlup-box{text-align:center;padding:28px 22px;position:relative}
.lvlup-shield{font-size:90px;line-height:1;animation:shi .6s cubic-bezier(.34,1.56,.64,1);display:block;margin-bottom:10px}
@keyframes shi{from{transform:scale(0) rotate(-20deg);opacity:0}to{transform:scale(1) rotate(0);opacity:1}}
.lvlup-txt{font-family:var(--fh);font-size:44px;letter-spacing:4px;background:linear-gradient(135deg,var(--go),var(--pu2));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:txi .5s ease .3s both}
@keyframes txi{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
.lvlup-sub{font-size:15px;color:var(--tx2);margin-top:5px;animation:txi .5s ease .5s both}
.lvlup-rays{position:absolute;inset:0;background:radial-gradient(circle,rgba(201,162,75,.28) 0%,transparent 60%);pointer-events:none;animation:rx .8s ease .1s both}
@keyframes rx{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
.toastwrap{position:fixed;top:calc(var(--st) + 62px);left:50%;transform:translateX(-50%);z-index:9998;display:flex;flex-direction:column;gap:5px;align-items:center;pointer-events:none}
.toast{background:var(--card2);border:1px solid var(--bo2);border-radius:99px;padding:7px 13px;font-size:12px;font-weight:500;white-space:nowrap;animation:ti .3s ease,to .3s ease 2.7s forwards}
.toast.ok{border-color:rgba(107,155,125,.38);color:var(--gr)}
.toast.info{border-color:rgba(201,162,75,.38);color:var(--pu2)}
.toast.wn{border-color:rgba(201,162,75,.38);color:var(--go)}
@keyframes ti{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:translateY(0)}}
@keyframes to{to{opacity:0}}
.spin{width:26px;height:26px;border-radius:50%;border:3px solid var(--card3);border-top-color:var(--pu);animation:sp .8s linear infinite;margin:0 auto}
@keyframes sp{to{transform:rotate(360deg)}}
.loading{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100dvh;gap:10px}
`;

function useToasts(){const [toasts,setToasts]=useState([]);const ctr=useRef(0);const toast=useCallback((msg,type='info')=>{const id=++ctr.current;setToasts(t=>[...t,{id,msg,type}]);setTimeout(()=>setToasts(t=>t.filter(x=>x.id!==id)),3200);},[]);return{toasts,toast};}

function ProfileHandles({profile,setProfile,toast}){
  const [editing,setEditing]=React.useState(false);
  const [handles,setHandles]=React.useState(profile.tiktok_handles||[]);
  const [saving,setSaving]=React.useState(false);
  async function save(){setSaving(true);const norm=handles.filter(Boolean).map(h=>{const t=h.trim().toLowerCase();return t.startsWith('@')?t:'@'+t;});const {error}=await supabase.from('profiles').update({tiktok_handles:norm}).eq('id',profile.id);setSaving(false);if(!error){setProfile({...profile,tiktok_handles:norm});setEditing(false);toast('Handles updated ✓','ok');}else toast('Failed','wn');}
  if(!editing)return(<div><div style={{display:'flex',flexWrap:'wrap',gap:4,marginBottom:7}}>{(profile.tiktok_handles||[]).map((t,i)=><span key={i} className="ttchip">{t}</span>)}</div><button onClick={()=>{setHandles(profile.tiktok_handles||['']);setEditing(true);}} style={{background:'none',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',padding:'4px 10px',color:'var(--pu2)',fontSize:12,cursor:'pointer'}}>Edit handles</button></div>);
  return(<div><div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:6}}>{handles.map((h,i)=>(<div key={i} className="trow"><input className="inp" value={h} onChange={e=>{const n=[...handles];n[i]=e.target.value;setHandles(n);}} placeholder="@handle" style={{fontSize:13,padding:'7px 10px'}}/>{handles.length>1&&<button className="icobtn" onClick={()=>setHandles(handles.filter((_,j)=>j!==i))}>✕</button>}</div>))}</div><button className="addtt" onClick={()=>setHandles([...handles,''])} style={{marginBottom:7}}>+ Add @</button><div style={{display:'flex',gap:6}}><button onClick={save} disabled={saving} style={{background:'var(--pu)',border:'none',borderRadius:'var(--rxs)',padding:'6px 13px',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>{saving?'...':'Save'}</button><button onClick={()=>setEditing(false)} style={{background:'none',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',padding:'6px 10px',color:'var(--tx3)',fontSize:12,cursor:'pointer'}}>Cancel</button></div></div>);
}

export default function App(){
  const {toasts,toast}=useToasts();
  // Defaults to true so the spinner page renders on first paint while init()
  // resolves the Supabase session and loads the profile. If we started false,
  // React would render the login screen for a beat before the auth check
  // settled — confusing for already-signed-in users on slower connections.
  const [loading,setLoading]=useState(true);
  const [profile,setProfile]=useState(null);
  const [rewards,setRewards]=useState([]);
  const [leaderboard,setLeaderboard]=useState([]);
  const [monthlyLeaderboard,setMonthlyLeaderboard]=useState([]);
  const [lbTab,setLbTab]=useState('alltime');
  // Selected month for the monthly leaderboard tab. Defaults to current month.
  const [lbMonth,setLbMonth]=useState(()=>{const n=new Date();return{year:n.getFullYear(),month:n.getMonth()};});
  // True while either rankings query is in-flight. Drives the loading
  // skeleton so we don't briefly flash 'No data' before the rows arrive.
  const [lbLoading,setLbLoading]=useState(false);
  const [milestones,setMilestones]=useState(DEFAULT_MILESTONES);
  const [page,setPage]=useState('home');
  const [adminUnlocked,setAdminUnlocked]=useState(()=>localStorage.getItem('hn-admin')==='true');
  const [levelUpAnim,setLevelUpAnim]=useState(null);
  const [showDaily,setShowDaily]=useState(false);
  const [grossOpen,setGrossOpen]=useState(false);
  const [showReward,setShowReward]=useState(null);
  // Active redeem-pick prompt — null means closed. Shape: {profileId, level, name, value, image}.
  const [redeemPick,setRedeemPick]=useState(null);
  // Bulk 'Redeem all owed' prompt — Shape: {profileId, username, tiers: [{level,name,value,image}]}.
  const [redeemAllPick,setRedeemAllPick]=useState(null);
  // Editable delivered amounts inside the redeem modal. Reset each time
  // redeemPick opens via the effect below so previous typing doesn't leak in.
  const [redeemPickProductAmt,setRedeemPickProductAmt]=useState('');
  const [redeemPickCashAmt,setRedeemPickCashAmt]=useState('');
  // Toggle between the pending-deliveries list and the historical delivered list.
  const [rewardsOwedView,setRewardsOwedView]=useState('pending');
  const [deliveredSearch,setDeliveredSearch]=useState('');
  const [showFlashSale,setShowFlashSale]=useState(false);
  // Ticks persist across reloads via localStorage so working through a long
  // flash-sale setup over multiple sessions doesn't lose progress. The Reset
  // button in the modal is the only way to clear them.
  const [flashCopied,setFlashCopied]=useState(()=>{
    try{const raw=typeof window!=='undefined'?window.localStorage.getItem('hn-flash-copied'):null;return new Set(raw?JSON.parse(raw):[]);}catch(e){return new Set();}
  });
  const [flashSearch,setFlashSearch]=useState('');
  const [showAdminGate,setShowAdminGate]=useState(false);
  const [authTab,setAuthTab]=useState('login');
  const [loginUser,setLoginUser]=useState('');
  const [loginPass,setLoginPass]=useState('');
  const [signupUser,setSignupUser]=useState('');
  const [signupEmail,setSignupEmail]=useState('');
  const [signupPass,setSignupPass]=useState('');
  const [handles,setHandles]=useState(['']);
  const [authErr,setAuthErr]=useState('');
  const [signupRef,setSignupRef]=useState(()=>new URLSearchParams(window.location.search).get('ref')||'');
  const [referralStats,setReferralStats]=useState([]);
  const [referralEvents,setReferralEvents]=useState([]);
  const [refDateRange,setRefDateRange]=useState('all');
  const [refSelectedMonth,setRefSelectedMonth]=useState(()=>{const n=new Date();return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0');});
  const [refCustomStart,setRefCustomStart]=useState('');
  const [refCustomEnd,setRefCustomEnd]=useState('');
  const [payouts,setPayouts]=useState([]);
  const [adminPayouts,setAdminPayouts]=useState([]);
  const [authLoading,setAuthLoading]=useState(false);
  // Password reset flow. `showResetPw` opens when Supabase fires PASSWORD_RECOVERY
  // after the user clicks the email link; `showForgotPw` is the in-app trigger
  // that emails the reset link via supabase.auth.resetPasswordForEmail.
  const [showResetPw,setShowResetPw]=useState(false);
  const [resetPw,setResetPw]=useState('');
  const [resetPw2,setResetPw2]=useState('');
  const [resetBusy,setResetBusy]=useState(false);
  const [showForgotPw,setShowForgotPw]=useState(false);
  const [forgotEmail,setForgotEmail]=useState('');
  const [forgotBusy,setForgotBusy]=useState(false);
  // Forgot-password is a 2-step flow: 'email' (collect email + trigger send) →
  // 'code' (enter the 6-digit OTP from email + new password). Using an OTP rather
  // than a magic link makes the flow resistant to Microsoft SafeLinks (and
  // similar email security tools) which pre-click every URL in incoming emails,
  // consuming the single-use Supabase recovery token before the human ever clicks.
  const [forgotStep,setForgotStep]=useState('email');
  const [forgotCode,setForgotCode]=useState('');
  // Monthly Recap — shareable end-of-month card. Auto-pops on the first visit
  // of a new month with the previous month's totals; localStorage gates so it
  // only opens once per user-per-month. Also reachable from Profile menu.
  const [monthlyRecap,setMonthlyRecap]=useState(null);
  const [monthlyRecapLoading,setMonthlyRecapLoading]=useState(false);
  // Calendar-style month picker for the recap modal — when open it overlays
  // the card. pickerYear scopes the visible 12-month grid.
  const [showMonthPicker,setShowMonthPicker]=useState(false);
  const [pickerYear,setPickerYear]=useState(()=>new Date().getFullYear());
  const [shareLoading,setShareLoading]=useState(false);
  const [adminPass,setAdminPass]=useState('');
  const [adminErr,setAdminErr]=useState('');
  const [allProfiles,setAllProfiles]=useState([]);
  // Tracks whether the initial admin profiles fetch has resolved (success or
  // error). Prevents the "All rewards delivered" empty state from flashing
  // while the query is still in flight.
  const [adminProfilesLoaded,setAdminProfilesLoaded]=useState(false);
  const [xpAmounts,setXpAmounts]=useState({});
  const [importLog,setImportLog]=useState([]);
  const [showRE,setShowRE]=useState(false);
  const [editRewards,setEditRewards]=useState([]);
  const [showME,setShowME]=useState(false);
  const [editMilestones,setEditMilestones]=useState([]);
  const [dragOver,setDragOver]=useState(false);
  const [xpEvents,setXpEvents]=useState([]);
  const [dateRange,setDateRange]=useState('yesterday');
  const [customStart,setCustomStart]=useState('');
  const [customEnd,setCustomEnd]=useState('');
  const [selectedMonth,setSelectedMonth]=useState(()=>{const n=new Date();const y=n.getFullYear();const m=String(n.getMonth()+1).padStart(2,'0');return y+'-'+m;});
  const [isDesktop,setIsDesktop]=useState(()=>typeof window!=='undefined'&&window.innerWidth>=768);
  const [products,setProducts]=useState([]);
  const [showPE,setShowPE]=useState(false);
  const [productMappings,setProductMappings]=useState({});
  const [showPM,setShowPM]=useState(false);
  const [unmappedProducts,setUnmappedProducts]=useState([]);
  const [editProducts,setEditProducts]=useState([]);
  const [topProducts,setTopProducts]=useState([]);
  const [showMilestoneCarousel,setShowMilestoneCarousel]=useState(false);
  const [importHistory,setImportHistory]=useState([]);
  const [lastUpdated,setLastUpdated]=useState(null);
  const [deleteConfirm,setDeleteConfirm]=useState(null);
  const [adminSearch,setAdminSearch]=useState('');
  const [adminLevelFilter,setAdminLevelFilter]=useState('');
  const [adminSort,setAdminSort]=useState('gmv');
  const [adminTab,setAdminTab]=useState('overview');
  const [adminPeriod,setAdminPeriod]=useState('30d');
  const [adminPeriodEvents,setAdminPeriodEvents]=useState([]);
  const [adminCustomStart,setAdminCustomStart]=useState('');
  const [adminCustomEnd,setAdminCustomEnd]=useState('');
  // Per-profile per-level unlock timestamps. Shape: { profileId: { 1: ISO, 2: ISO, ... } }.
  // Drives the 'waiting X days' badges in the admin Rewards Owed tab.
  const [affiliateUnlockDates,setAffiliateUnlockDates]=useState({});
  const [adminRewardValuesError,setAdminRewardValuesError]=useState(null);
  // Explicit loaded flag so the Rewards Owed page can shimmer the £ column
  // during the initial RPC round-trip instead of flashing '£?' for everyone.
  const [adminRewardValuesLoaded,setAdminRewardValuesLoaded]=useState(false);
  // Period filter for the Referrals tab. Defaults to 'all' because referral
  // signups are slow-moving — most people want lifetime totals first.
  const [referralPeriod,setReferralPeriod]=useState('all');
  const [referralCustomStart,setReferralCustomStart]=useState('');
  const [referralCustomEnd,setReferralCustomEnd]=useState('');
  const [showReferralTree,setShowReferralTree]=useState(()=>typeof window!=='undefined'&&window.innerWidth>=768);
  const [expandedAdminRow,setExpandedAdminRow]=useState(null);
  const [expandedReferrer,setExpandedReferrer]=useState(null);
  const [xpExclusions,setXpExclusions]=useState([]);
  const [showExclusions,setShowExclusions]=useState(false);
  const [newExclusionUser,setNewExclusionUser]=useState('');
  const [newExclusionProduct,setNewExclusionProduct]=useState('');
  const [newExclusionStart,setNewExclusionStart]=useState('');
  const [newExclusionEnd,setNewExclusionEnd]=useState('');
  const [editingProfile,setEditingProfile]=useState(null);
  const [editForm,setEditForm]=useState({});
  const [showDiscordCta,setShowDiscordCta]=useState(false);
  const [discordCountdown,setDiscordCountdown]=useState(5);


  useEffect(()=>{
    let sub=null;
    const init=async()=>{
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.user){await loadProfile(session.user.id);loadRewards();loadLeaderboard();loadMilestones();loadProducts();loadProductMappings();loadXpExclusions();loadLastUpdated();}
        else{loadRewards();loadProducts();loadProductMappings();loadLastUpdated();}
      }catch(e){console.error('init error:',e);}
      setLoading(false);
      try{
        const {data:{subscription}}=supabase.auth.onAuthStateChange((event,session)=>{
          if(event==='SIGNED_IN'&&session?.user){loadProfile(session.user.id).then(()=>{loadRewards();loadLeaderboard();loadMilestones();});}
          else if(event==='SIGNED_OUT'){setProfile(null);}
          // Triggered when (a) the user clicks the magic-link reset email
          // OR (b) we manually call verifyOtp during the OTP forgot-password
          // flow. In case (b) we suppress this handler via the ref because
          // the forgot flow is already collecting + applying the new password.
          else if(event==='PASSWORD_RECOVERY'){
            if(inForgotPwFlowRef.current)return;
            setResetPw('');setResetPw2('');setShowResetPw(true);
          }
        });
        sub=subscription;
      }catch(e){console.error('auth sub error:',e);}
    };
    init();
    // Safety net in case init() hangs on the network. 8s is well above a
    // normal getSession + loadProfile round-trip even on slow connections,
    // so we won't kill the spinner before the dashboard is actually ready.
    const t=setTimeout(()=>setLoading(false),8000);
    // Re-check session when the PWA / tab regains focus. iOS can suspend WKWebView and
    // sometimes resumes with a stale React state that thinks the user is logged out
    // when the underlying session is actually still valid.
    const onVisible=async()=>{
      if(document.visibilityState!=='visible')return;
      try{
        const {data:{session}}=await supabase.auth.getSession();
        if(session?.user&&!profileRef.current){
          await loadProfile(session.user.id);
        }
      }catch(e){}
    };
    document.addEventListener('visibilitychange',onVisible);
    window.addEventListener('focus',onVisible);
    return()=>{if(sub)sub.unsubscribe();clearTimeout(t);document.removeEventListener('visibilitychange',onVisible);window.removeEventListener('focus',onVisible);};
  },[]);
  // Keep a ref to current profile so the visibility handler can read it without
  // re-subscribing every time profile changes.
  const profileRef=React.useRef(null);
  // Liquid-glass bottom-nav drag state. bnavRef anchors geometry; draggingRef
  // mirrors `navDragging` so fast pointermove events don't read a stale closure.
  const bnavRef=React.useRef(null);
  const draggingRef=React.useRef(false);
  // Load-dedup TTL — every admin loader stamps its last-successful-load time in
  // here so navTo('admin') can skip refetches within TTL. Kills the sub-tab
  // switch lag (Overview→Discord was refiring every query).
  const loadedAtRef=React.useRef({});
  const LOAD_TTL_MS=60_000;
  const isFresh=(key)=>{const t=loadedAtRef.current[key];return t&&(Date.now()-t)<LOAD_TTL_MS;};
  const markFresh=(key)=>{loadedAtRef.current[key]=Date.now();};
  const invalidate=(...keys)=>{keys.forEach(k=>{delete loadedAtRef.current[k];});};
  const navLastXRef=React.useRef(0);
  const [navDragging,setNavDragging]=useState(false);
  const [navHotIdx,setNavHotIdx]=useState(null);
  const [navIndPx,setNavIndPx]=useState(null);
  // When true, the PASSWORD_RECOVERY auth event is suppressed because the
  // forgot-password OTP flow is handling the password update itself and we
  // don't want the standalone "Change Password" modal to also open on top.
  const inForgotPwFlowRef=React.useRef(false);
  useEffect(()=>{profileRef.current=profile;},[profile]);
  // When the profile resolves for the first time after page load, check whether
  // the previous-month recap card should pop. localStorage gates so it only
  // ever shows once per user per month. Deferred a beat so the dashboard paints
  // first and the recap arrives as a polite overlay rather than blocking init.
  useEffect(()=>{
    if(!profile?.id)return;
    const t=setTimeout(()=>{maybeShowMonthlyRecap(profile.id);},1200);
    return()=>clearTimeout(t);
  },[profile?.id]);
  useEffect(()=>{const fn=()=>setIsDesktop(window.innerWidth>=768);window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn);},[]);
  // Surface Supabase auth errors that arrive in the URL hash so they don't get
  // silently swallowed. Expired password-reset links land at:
  //   /#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired
  // Without this the user sees the login page with no explanation and assumes
  // the reset feature is broken.
  useEffect(()=>{
    const hash=window.location.hash;
    if(!hash||!hash.includes('error='))return;
    const params=new URLSearchParams(hash.slice(1));
    const errCode=params.get('error_code');
    const errDesc=params.get('error_description');
    if(errCode==='otp_expired'||params.get('error')==='access_denied'){
      toast('This reset link expired — request a new one','wn');
      // Auto-open the forgot-password modal so the user can immediately ask
      // for a fresh email instead of hunting for the button.
      setShowForgotPw(true);
    }else if(errDesc){
      toast(decodeURIComponent(errDesc).replace(/\+/g,' '),'wn');
    }
    // Strip the hash so a page reload doesn't re-trigger this toast.
    window.history.replaceState(null,'',window.location.pathname+window.location.search);
  },[]);
  // Keep body height in lockstep with the actual visible viewport. On iOS
  // standalone PWAs, window.innerHeight returns a stale Safari-toolbar-visible
  // value even though the PWA has no toolbar, leaving a black gap below the
  // bottom nav. In standalone mode we therefore also consider screen.height
  // (orientation-aware) as a candidate and use the largest measurement.
  useEffect(()=>{
    // Same iOS-only gating as in src/index.js — desktop PWAs shouldn't
    // override body height, the browser's natural viewport accounts for the
    // macOS Dock / Windows taskbar correctly.
    const isIOSDevice=()=>{
      if(typeof navigator==='undefined')return false;
      const ua=navigator.userAgent||'';
      if(/iPad|iPhone|iPod/.test(ua))return true;
      if(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)return true;
      return false;
    };
    if(!isIOSDevice())return;
    const computeH=()=>{
      const isStandalone=(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||(window.navigator&&window.navigator.standalone===true);
      const cands=[
        window.visualViewport&&window.visualViewport.height,
        window.innerHeight,
        document.documentElement&&document.documentElement.clientHeight,
      ];
      if(isStandalone&&window.screen){
        const portrait=window.matchMedia&&window.matchMedia('(orientation: portrait)').matches;
        const scH=portrait?Math.max(window.screen.height||0,window.screen.width||0):Math.min(window.screen.height||0,window.screen.width||0);
        cands.push(scH);
      }
      return Math.max(0,...cands.filter(x=>typeof x==='number'&&x>0));
    };
    const setBodyHeight=()=>{
      const h=computeH();
      if(h>0)document.body.style.height=h+'px';
    };
    setBodyHeight();
    window.addEventListener('resize',setBodyHeight);
    window.addEventListener('orientationchange',setBodyHeight);
    const vv=window.visualViewport;
    if(vv){vv.addEventListener('resize',setBodyHeight);}
    return()=>{
      window.removeEventListener('resize',setBodyHeight);
      window.removeEventListener('orientationchange',setBodyHeight);
      if(vv)vv.removeEventListener('resize',setBodyHeight);
    };
  },[]);
  // Force iOS WKWebView to do a fresh layout pass after first paint. The user
  // reported that the bottom nav floats above the screen on initial load and
  // "scrolling fixes it" — which means iOS isn't running layout for our fixed
  // children until a user gesture. We synthesise that by reading offsetHeight
  // (a sync layout flush) and firing a synthetic resize on the next frame.
  useEffect(()=>{
    const kick=()=>{
      try{
        // Read forces sync layout
        void document.body.offsetHeight;
        // Re-dispatch resize so any window.matchMedia / vv listeners refire
        window.dispatchEvent(new Event('resize'));
      }catch(e){}
    };
    // Several attempts: rAF for first paint, then 100/300/700ms for stragglers
    requestAnimationFrame(kick);
    const t1=setTimeout(kick,100);
    const t2=setTimeout(kick,300);
    const t3=setTimeout(kick,700);
    return()=>{clearTimeout(t1);clearTimeout(t2);clearTimeout(t3);};
  },[]);
  // Show the Discord CTA once per profile on this device. The localStorage key is
  // scoped to the profile id so different accounts on the same device each see it once.
  useEffect(()=>{
    if(!profile?.id)return;
    const key=`hn-discord-cta-${profile.id}`;
    if(localStorage.getItem(key)==='1')return;
    setDiscordCountdown(5);
    setShowDiscordCta(true);
  },[profile?.id]);
  useEffect(()=>{
    if(!showDiscordCta||discordCountdown<=0)return;
    const t=setTimeout(()=>setDiscordCountdown(n=>n-1),1000);
    return()=>clearTimeout(t);
  },[showDiscordCta,discordCountdown]);
  useEffect(()=>{
    try{window.localStorage.setItem('hn-flash-copied',JSON.stringify([...flashCopied]));}catch(e){}
  },[flashCopied]);
  useEffect(()=>{
    if(!redeemPick){setRedeemPickProductAmt('');setRedeemPickCashAmt('');return;}
    const v=Number(redeemPick.value||0);
    setRedeemPickProductAmt(v?v.toFixed(2):'');
    setRedeemPickCashAmt(v?(v*0.8).toFixed(2):'');
  },[redeemPick]);
  // Tab-scoped admin data loads. Only fires the loaders each tab actually
  // consumes — before this, every navTo('admin') fired every loader (unlock
  // dates paginated 100k+ events, generatePayouts did N sequential HTTP calls).
  // Loaders themselves guard with isFresh(), so switching between tabs within
  // the TTL is a no-op.
  useEffect(()=>{
    if(!adminUnlocked||page!=='admin')return;
    // Fast loaders fire immediately. Heavy ones (generatePayouts, unlock
    // dates — both do big xp_events scans that saturate the connection pool)
    // defer 300ms so the small RPCs / SELECTs on the current tab settle
    // first. This is what unblocks the reward-values RPC that was queuing
    // behind the heavy scans and taking up to a minute.
    if(adminTab==='overview'||adminTab==='referrals'||adminTab==='affiliates'){
      loadAdminPeriodEvents();
    }
    if(adminTab==='overview'){
      loadAdminPayouts();
      loadImportHistory();
    }
    if(adminTab==='payouts'){
      loadAdminPayouts();
      loadAdminPeriodEvents();
    }
    if(adminTab==='imports'){
      loadImportHistory();
      loadXpExclusions();
    }
    // Deferred heavy tier — these fire ~300ms later so the small queries
    // above win the initial DB connection slots.
    const deferHeavy=setTimeout(()=>{
      if(adminTab==='overview'||adminTab==='payouts'){generatePayouts({silent:true});}
      if(adminTab==='rewardsowed'){loadAffiliateUnlockDates();}
    },300);
    return()=>clearTimeout(deferHeavy);
  },[adminTab,adminUnlocked,page]);
  // When allProfiles hydrates and we're on Rewards Owed, kick unlock dates —
  // the loader depends on allProfiles to know WHICH profiles need events
  // fetched, so it bails early on cold visits until this signals.
  useEffect(()=>{
    if(!adminUnlocked||page!=='admin'||adminTab!=='rewardsowed')return;
    if(!allProfiles.length)return;
    loadAffiliateUnlockDates();
  },[allProfiles.length,adminTab,adminUnlocked,page]);
  // If either admin custom range extends older than the default 60-day window,
  // refetch with the earlier lower bound so the period sums see those events.
  useEffect(()=>{
    if(!adminUnlocked||page!=='admin')return;
    const starts=[];
    if(adminPeriod==='custom'&&adminCustomStart)starts.push(new Date(adminCustomStart));
    if(referralPeriod==='custom'&&referralCustomStart)starts.push(new Date(referralCustomStart));
    if(!starts.length)return;
    const earliest=new Date(Math.min(...starts.map(d=>d.getTime())));
    const sixtyAgo=new Date(Date.now()-60*86400000);
    if(earliest<sixtyAgo)loadAdminPeriodEvents(earliest);
  },[adminPeriod,adminCustomStart,referralPeriod,referralCustomStart,adminUnlocked,page]);

  async function loadProfile(id){const {data}=await supabase.from('profiles').select('*').eq('id',id).single();if(data){setProfile(data);await loadXpEvents(id);}}
  // Aggregates a user's previous-month import events into a Monthly Recap card.
  // `which`: 'prev' (default) for the previous calendar month, or {year,month}
  // for an explicit month. Returns null if there were no imports for that month.
  async function computeMonthlyRecap(id,which='prev'){
    let y,m,isCurrent=false;
    const now=new Date();
    if(which==='prev'){
      const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
      y=prev.getFullYear();m=prev.getMonth();
    }else if(which==='current'){
      y=now.getFullYear();m=now.getMonth();isCurrent=true;
    }else{y=which.year;m=which.month;}
    const start=new Date(y,m,1).toISOString();
    const end=new Date(y,m+1,1).toISOString();
    const {data}=await supabase.from('xp_events').select('gmv,cancelled_gmv,commission,orders,amount,product_name,created_at').eq('profile_id',id).eq('reason','import').gte('created_at',start).lt('created_at',end);
    if(!data||data.length===0)return null;
    const netGMV=data.reduce((s,e)=>s+Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0)),0);
    const commission=data.reduce((s,e)=>s+(e.commission||0),0);
    const orders=data.reduce((s,e)=>s+(e.orders||0),0);
    const xpGained=data.reduce((s,e)=>s+(e.amount||0),0);
    // Top product = highest net GMV from a single product_name across the month.
    const byProduct={};
    data.forEach(e=>{const n=e.product_name||'Other';if(!byProduct[n])byProduct[n]={gmv:0,orders:0};byProduct[n].gmv+=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0));byProduct[n].orders+=(e.orders||0);});
    const sortedProducts=Object.entries(byProduct).sort((a,b)=>b[1].gmv-a[1].gmv);
    const topName=sortedProducts[0]?.[0];
    const topGMV=sortedProducts[0]?.[1].gmv||0;
    const topOrders=sortedProducts[0]?.[1].orders||0;
    const topMeta=products.find(p=>p.name===topName);
    const monthLabel=new Date(y,m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}).toUpperCase();
    // Daily GMV bucket for the sparkline. Every day in the month gets a slot
    // (zeros included) so the line shows the real rhythm of activity.
    const daysInMonth=new Date(y,m+1,0).getDate();
    const dailyGMV=new Array(daysInMonth).fill(0);
    data.forEach(e=>{const d=new Date(e.created_at);if(d.getFullYear()===y&&d.getMonth()===m){dailyGMV[d.getDate()-1]+=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0));}});
    // Monthly rank — query everyone else's GMV for the same window, aggregate
    // per profile, sort, find our position. One extra round-trip, only runs
    // when the recap modal opens so it's cheap.
    let rank=null,totalRanked=null;
    try{
      const {data:allEvts}=await supabase.from('xp_events').select('profile_id,gmv,cancelled_gmv').eq('reason','import').gte('created_at',start).lt('created_at',end);
      if(allEvts){
        const byProfile={};
        allEvts.forEach(e=>{const pid=e.profile_id;if(!byProfile[pid])byProfile[pid]=0;byProfile[pid]+=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0));});
        const sorted=Object.entries(byProfile).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
        const idx=sorted.findIndex(([pid])=>pid===id);
        if(idx>=0){rank=idx+1;totalRanked=sorted.length;}
      }
    }catch(e){/* rank is non-critical, just leave null */}
    return{year:y,month:m,monthLabel,isCurrent,netGMV,commission,orders,xpGained,topName,topGMV,topOrders,topImage:topMeta?.image_url||null,productCount:sortedProducts.length,rank,totalRanked,dailyGMV};
  }
  // Auto-check if the previous-month recap should pop. ONLY fires on day 1
  // of the calendar month — we don't want the wrap-up popping a week into
  // the new month when a sporadic user logs back in. Users can still open
  // last month's recap any time via Profile → 📅 Monthly Recap.
  // Also gated on localStorage so it only shows once even on multiple
  // logins / refreshes during the same 1st-of-month.
  async function maybeShowMonthlyRecap(id){
    if(!id||monthlyRecapLoading)return;
    const now=new Date();
    if(now.getDate()!==1)return;
    const prev=new Date(now.getFullYear(),now.getMonth()-1,1);
    const monthKey=`${prev.getFullYear()}-${String(prev.getMonth()+1).padStart(2,'0')}`;
    const seenKey=`hn-recap-${id}-${monthKey}`;
    if(localStorage.getItem(seenKey))return;
    setMonthlyRecapLoading(true);
    const recap=await computeMonthlyRecap(id,'prev');
    setMonthlyRecapLoading(false);
    if(recap)setMonthlyRecap(recap);
    // Mark seen either way — if there was no data, don't keep querying every reload.
    try{localStorage.setItem(seenKey,'1');}catch(e){}
  }
  // Load (or reload) the Monthly Recap modal for a specific year/month. Used
  // by both openMonthlyRecap (initial open from Profile menu) and the ‹/›
  // navigation arrows inside the modal. When no data exists we still set a
  // placeholder so the modal stays open and the user can navigate forward.
  async function loadRecapForMonth(y,m){
    if(!profile)return;
    setMonthlyRecapLoading(true);
    const recap=await computeMonthlyRecap(profile.id,{year:y,month:m});
    setMonthlyRecapLoading(false);
    if(recap){setMonthlyRecap(recap);return;}
    // No imports that month — show empty placeholder so nav still works.
    const monthLabel=new Date(y,m,1).toLocaleDateString('en-GB',{month:'long',year:'numeric'}).toUpperCase();
    const now=new Date();
    const isCurrent=y===now.getFullYear()&&m===now.getMonth();
    setMonthlyRecap({year:y,month:m,monthLabel,isCurrent,isEmpty:true,netGMV:0,commission:0,orders:0,xpGained:0,topName:null,topGMV:0,topOrders:0,topImage:null,productCount:0,rank:null,totalRanked:null,dailyGMV:[]});
  }
  // Manual trigger for the Profile menu "Monthly Recap" item. Opens on the
  // current month — the modal's calendar picker lets users browse any month.
  async function openMonthlyRecap(){
    if(!profile||monthlyRecapLoading)return;
    const now=new Date();
    await loadRecapForMonth(now.getFullYear(),now.getMonth());
  }
  // Rasterises the recap card DOM to a PNG and hands it to the native share
  // sheet (Web Share API) on iOS/Android, falling back to a download on
  // desktop browsers where canShare({files}) isn't supported.
  // Walks the card DOM, fetches every <img>'s src and rewrites it to an inline
  // data: URL. Required because html-to-image's canvas draw is blocked by CORS
  // for cross-origin product / avatar images served from Supabase storage —
  // without this they render as blank rectangles in the exported PNG. Returns
  // a `restore` function that puts the original src values back, called after
  // toPng() resolves so the DOM stays clean.
  async function inlineCardImages(node){
    const imgs=Array.from(node.querySelectorAll('img'));
    const restorers=[];
    await Promise.all(imgs.map(async(img)=>{
      const original=img.getAttribute('src');
      if(!original||original.startsWith('data:'))return;
      try{
        const res=await fetch(original,{mode:'cors',cache:'no-cache'});
        if(!res.ok)return;
        const blob=await res.blob();
        const dataUrl=await new Promise((resolve,reject)=>{const r=new FileReader();r.onloadend=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(blob);});
        img.setAttribute('src',dataUrl);
        restorers.push(()=>img.setAttribute('src',original));
      }catch(e){/* best-effort, leave the original src and let toPng try */}
    }));
    return()=>restorers.forEach(fn=>fn());
  }
  async function shareRecap(){
    if(!monthlyRecap||shareLoading)return;
    setShareLoading(true);
    let restoreImages=null;
    try{
      const node=document.getElementById('ll-recap-card');
      if(!node){toast('Couldn\'t find card. Try again.','wn');setShareLoading(false);return;}
      restoreImages=await inlineCardImages(node);
      const dataUrl=await toPng(node,{pixelRatio:3,backgroundColor:'#0e0e1c',cacheBust:true,style:{transform:'none'}});
      if(restoreImages){restoreImages();restoreImages=null;}
      const monthShort=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      const filename=`hollen-${monthShort[monthlyRecap.month]}-${monthlyRecap.year}.png`;
      const blob=await(await fetch(dataUrl)).blob();
      const file=new File([blob],filename,{type:'image/png'});
      if(navigator.share&&navigator.canShare&&navigator.canShare({files:[file]})){
        try{
          await navigator.share({files:[file],title:'My Hollen Recap',text:`My ${monthlyRecap.monthLabel} on Hollen ✦`});
          setShareLoading(false);
          return;
        }catch(e){if(e.name==='AbortError'){setShareLoading(false);return;}}
      }
      const a=document.createElement('a');a.href=dataUrl;a.download=filename;a.click();
      toast('Saved to downloads','ok');
      setShareLoading(false);
    }catch(e){
      console.error('shareRecap error:',e);
      toast('Couldn\'t generate image. Try screenshot instead.','wn');
      setShareLoading(false);
    }finally{
      if(restoreImages){try{restoreImages();}catch(e){}}
    }
  }
  async function loadTopProduct(profileId){const {data}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',profileId).order('gmv',{ascending:false}).limit(3);if(data)setTopProducts(data);}

  async function loadXpEvents(id){const {data}=await supabase.from('xp_events').select('*').eq('profile_id',id).order('created_at');if(data)setXpEvents(data);await loadTopProduct(id);}
  // Public reward loader — explicitly excludes `value` (£ cost per tier) so
  // creators never receive cash amounts in the wire response. The admin
  // Catalog editor and Rewards Owed tab fetch the value column separately
  // via loadAdminRewardValues() once the admin gate is unlocked.
  async function loadRewards(){const {data}=await supabase.from('rewards').select('id,level,name,description,xp_required,image_url').order('level');if(data)setRewards(data);}
  // Admin-only — merges the £ value into the already-loaded rewards array.
  // Routes through admin_get_reward_values() RPC (migration 0005) rather
  // than querying rewards.value directly, since column-level SELECT on
  // value has been revoked from anon/authenticated. The RPC checks the
  // caller's profiles.is_admin and raises 'Not authorized' otherwise.
  async function loadAdminRewardValues(opts={}){
    if(!opts.force&&isFresh('adminRewardValues'))return;
    try{
      const {data,error}=await supabase.rpc('admin_get_reward_values');
      if(error){
        console.warn('admin_get_reward_values:',error.message);
        setAdminRewardValuesError(error.message||'Could not load reward £ values — set profiles.is_admin = TRUE or run migration 0005.');
        return;
      }
      // Empty response = RPC ran without error but returned zero rows. Usually
      // means is_admin isn't set for this user or migration 0005 hasn't been
      // applied yet — surface it explicitly instead of silently marking fresh
      // (which would prevent every retry) and leaving £? everywhere.
      if(!data||!data.length){
        setAdminRewardValuesError('admin_get_reward_values returned no rows — confirm profiles.is_admin = TRUE and rewards.value has data.');
        return;
      }
      setAdminRewardValuesError(null);
      setRewards(prev=>prev.map(r=>{const m=data.find(d=>d.id===r.id);return m?{...r,value:m.value}:r;}));
      markFresh('adminRewardValues');
    }finally{setAdminRewardValuesLoaded(true);}
  }
  async function loadLeaderboard(){setLbLoading(true);try{const {data}=await supabase.from('profiles').select('*').order('xp',{ascending:false}).limit(50);if(data)setLeaderboard(data);}finally{setLbLoading(false);}}
  // Aggregates xp_events into a per-month leaderboard. Queries the calendar
  // month bounds for {year, month} and sorts profiles by total XP in that
  // window. Top 50 only — matches the all-time leaderboard cap.
  async function loadMonthlyLeaderboard(year,month){
    setLbLoading(true);
    // Clear stale rows from a previous month so the skeleton shows instead of
    // briefly flashing last month's data while the new query is in-flight.
    setMonthlyLeaderboard([]);
    try{
      const start=new Date(year,month,1).toISOString();
      const end=new Date(year,month+1,1).toISOString();
      const {data:events}=await supabase.from('xp_events').select('profile_id,amount,gmv,commission').gte('created_at',start).lt('created_at',end);
      if(!events)return;
      const byProfile={};
      events.forEach(e=>{if(!byProfile[e.profile_id])byProfile[e.profile_id]={xp:0,gmv:0,commission:0};byProfile[e.profile_id].xp+=(e.amount||0);byProfile[e.profile_id].gmv+=(e.gmv||0);byProfile[e.profile_id].commission+=(e.commission||0);});
      const {data:profiles}=await supabase.from('profiles').select('id,username,avatar_url,tiktok_handles');
      if(!profiles)return;
      const monthly=Object.entries(byProfile).map(([pid,vals])=>{const p=profiles.find(x=>x.id===pid);if(!p)return null;return{...p,xp:vals.xp,total_gmv:vals.gmv,total_commission:vals.commission};}).filter(Boolean).sort((a,b)=>b.xp-a.xp).slice(0,50);
      setMonthlyLeaderboard(monthly);
    }finally{setLbLoading(false);}
  }
  // Explicit column list — SELECT * was pulling every profile column (including
  // the admin RPC helpers add-ons we never touch) and is the biggest single
  // payload on the admin tab. Restricted to what admin views actually consume.
  const ADMIN_PROFILE_COLS='id,username,xp,avatar_url,tiktok_handles,streak,last_claim,referral_code,referral_earnings,referred_by,created_at,discord_level,rewards_delivered_level,rewards_redeemed_levels,rewards_redeemed_cash_levels,rewards_redemption_amounts,rewards_redemption_dates,total_sales,total_gmv,total_orders,total_commission,total_cancelled,total_cancelled_gmv,total_live_streams';
  async function loadAllProfiles(opts={}){
    if(!opts.force&&isFresh('allProfiles'))return;
    try{
      const {data,error}=await supabase.from('profiles').select(ADMIN_PROFILE_COLS).order('xp',{ascending:false});
      if(error){console.error('loadAllProfiles:',error.message);toast('Failed to load affiliates — check connection','wn');return;}
      if(data){setAllProfiles(data);const a={};data.forEach(p=>{a[p.id]=100;});setXpAmounts(a);markFresh('allProfiles');}
    }finally{setAdminProfilesLoaded(true);}
  }
  async function loadMilestones(){const {data}=await supabase.from('streak_milestones').select('*').order('days');if(data&&data.length)setMilestones(data);}
  async function loadProducts(){const {data}=await supabase.from('products').select('*').order('sort_order',{ascending:true});if(data)setProducts(data);}
  async function loadReferralStats(){
    if(!profile)return;
    const {data}=await supabase.from('profiles').select('id,username,xp,total_gmv,total_commission,total_cancelled_gmv,tiktok_handles').eq('referred_by',profile.id);
    if(data)setReferralStats(data);
    // Load xp_events for all referred users to enable date filtering
    if(data&&data.length>0){
      const ids=data.map(d=>d.id);
      const {data:evts}=await supabase.from('xp_events').select('profile_id,gmv,commission,cancelled_gmv,created_at,reason').in('profile_id',ids).eq('reason','import').order('created_at');
      if(evts)setReferralEvents(evts);
    }
    loadPayouts();
  }
  async function loadPayouts(){
    if(!profile)return;
    const {data}=await supabase.from('payouts').select('*').eq('profile_id',profile.id).order('month',{ascending:false});
    if(data)setPayouts(data);
  }
  async function loadAdminPayouts(opts={}){
    if(!opts.force&&isFresh('adminPayouts'))return;
    const {data,error}=await supabase.from('payouts').select('*').order('month',{ascending:false});
    if(error){console.error('loadAdminPayouts:',error.message);toast('Failed to load payouts — check connection','wn');return;}
    if(data){setAdminPayouts(data);markFresh('adminPayouts');}
  }
  // Loads every xp_event in the system (light columns only) and walks each
  // profile's events chronologically to build a {level: ISO} unlock map.
  // Powers the 'waiting Xd' badges in the admin Rewards Owed tab.
  async function loadAffiliateUnlockDates(opts={}){
    if(!opts.force&&isFresh('unlockDates'))return;
    let rwds=rewards;
    if(!rwds||!rwds.length){
      const {data:rdata}=await supabase.from('rewards').select('id,level,xp_required').order('level');
      rwds=rdata||[];
    }
    if(!rwds.length)return;
    // Only fetch events for profiles who actually have unredeemed levels — the
    // Rewards Owed page is the sole consumer and it only reads unlock dates for
    // those. Slashes the query from "every event in the system" (previously
    // 100k+ rows across many sequential pages) to a targeted subset. If
    // allProfiles hasn't hydrated yet, fall back to a paginated full-table
    // scan so we don't lose data on a cold visit.
    // If allProfiles hasn't hydrated yet, bail without markFresh so the
    // adminTab useEffect re-runs us once it does. Otherwise we'd cache an
    // empty unlock map forever until the TTL expires.
    if(!allProfiles.length)return;
    const owedProfileIds=allProfiles.filter(p=>{
      const ach=achievedLevel(p.xp,rwds);
      const red=redeemedLevelsFor(p);
      for(let l=1;l<=ach;l++)if(!red.has(l))return true;
      return false;
    }).map(p=>p.id);
    const all=[];
    if(owedProfileIds.length){
      // Targeted path: just events belonging to owed profiles. Slashes the
      // query from "every event in the system" to a targeted subset.
      const {data,error}=await supabase.from('xp_events').select('profile_id,amount,created_at').in('profile_id',owedProfileIds).order('created_at',{ascending:true});
      if(error){console.error('loadAffiliateUnlockDates:',error.message);toast('Failed to load unlock history','wn');return;}
      if(data)all.push(...data);
    }
    // Fall through with empty `all` when no owed profiles — still markFresh so
    // we don't refire on every render.
    const byProfile={};
    all.forEach(e=>{if(!byProfile[e.profile_id])byProfile[e.profile_id]=[];byProfile[e.profile_id].push(e);});
    const unlocks={};
    for(const pid of Object.keys(byProfile)){unlocks[pid]=computeUnlockDates(byProfile[pid],rwds);}
    setAffiliateUnlockDates(unlocks);
    markFresh('unlockDates');
  }
  // Pulls the last 60 days of import xp_events for period-toggle deltas on the
  // admin overview. 60 days covers the 30d window plus the prior 30d for the
  // delta calculation; longer toggles use cumulative `profiles` totals.
  async function loadAdminPeriodEvents(sinceOverride,opts={}){
    // The fresh key encodes the effective 'since' so a custom-range extend
    // (which passes an older sinceOverride) always re-fetches with the wider window.
    const defaultSince=new Date(Date.now()-60*24*60*60*1000);
    const since=(sinceOverride&&sinceOverride<defaultSince?sinceOverride:defaultSince).toISOString();
    const key='periodEvents:'+since.slice(0,10);
    if(!opts.force&&isFresh(key))return;
    const {data,error}=await supabase.from('xp_events').select('profile_id,amount,gmv,commission,cancelled_gmv,cancelled,sales,orders,created_at').eq('reason','import').gte('created_at',since).order('created_at',{ascending:false});
    if(error){console.error('loadAdminPeriodEvents:',error.message);toast('Failed to load period metrics','wn');return;}
    if(data){setAdminPeriodEvents(data);markFresh(key);}
  }
  async function togglePayout(payoutId,paid){
    await supabase.from('payouts').update({paid,paid_at:paid?new Date().toISOString():null}).eq('id',payoutId);
    toast(paid?'Marked as paid ✓':'Marked as unpaid','ok');
    invalidate('adminPayouts');
    loadAdminPayouts();if(profile)loadPayouts();
  }
  // Marks a single profile's Discord role as updated to their current level
  // — used after the admin manually bumps their role in Discord.
  async function markDiscordRoleUpdated(profileId,toLevel){
    const {error}=await supabase.from('profiles').update({discord_level:toLevel}).eq('id',profileId);
    if(error){toast('Failed: '+(error.message||'unknown'),'wn');return;}
    setAllProfiles(prev=>prev.map(p=>p.id===profileId?{...p,discord_level:toLevel}:p));
    toast('Marked updated ✓','ok');
  }
  // Bulk-set every pending profile's discord_level to their current calculated
  // level. Used either to clear the inbox after a Discord sweep, or as the
  // one-time 'mark everyone as currently up-to-date' action when the feature
  // first launches.
  async function markAllDiscordRolesUpdated(){
    // Discord role display uses getLv semantics: someone in the L7 XP band is
    // shown as L7 everywhere (including their Discord role). achievedLevel is
    // reserved for reward-payout logic (which reward tier have they earned).
    const pending=allProfiles.filter(p=>getLv(p.xp,LEVELS).level>(p.discord_level??0));
    if(pending.length===0){toast('Nothing to mark','info');return;}
    const updates=pending.map(p=>({id:p.id,level:getLv(p.xp,LEVELS).level}));
    // Per-row updates rather than one giant upsert — safer with RLS and avoids
    // accidentally clobbering other columns.
    for(const u of updates){
      await supabase.from('profiles').update({discord_level:u.level}).eq('id',u.id);
    }
    setAllProfiles(prev=>prev.map(p=>{const u=updates.find(x=>x.id===p.id);return u?{...p,discord_level:u.level}:p;}));
    toast(`Marked ${pending.length} as updated ✓`,'ok');
  }
  // Mark a single profile's reward delivery up to their current level — used
  // when the admin physically dispatches all owed reward tiers.
  // Returns the full set of redeemed levels for a profile — union of the new
  // per-level array (migration 0006) and the legacy high-water-mark int field.
  // Pre-migration data uses just rewards_delivered_level; post-migration uses
  // the array; combining both means we never lose state during the transition.
  function redeemedLevelsFor(p){
    const set=new Set(p?.rewards_redeemed_levels||[]);
    const hwm=p?.rewards_delivered_level||0;
    for(let i=1;i<=hwm;i++)set.add(i);
    return set;
  }
  // Levels in rewards_redeemed_cash_levels — the subset of redeemed tiers the
  // affiliate took as the 80% cash alternative rather than the physical reward.
  function redeemedCashLevelsFor(p){return new Set(p?.rewards_redeemed_cash_levels||[]);}
  // Per-tier delivered £ override, keyed by level string. Falls back to the
  // catalog value when a level isn't present.
  function redemptionAmountsFor(p){return p?.rewards_redemption_amounts||{};}
  // Per-tier redemption timestamp, keyed by level string. Absent for legacy
  // redemptions that predate migration 0009.
  function redemptionDatesFor(p){return p?.rewards_redemption_dates||{};}
  // Marks/unmarks a single reward tier as redeemed for one profile. `mode` is
  // 'product' (default) or 'cash'. `amount` (optional number) overrides the
  // delivered £ recorded for this level — falls back to catalog value on absence.
  // When unmarking, also clears any cash flag and the amount override for that level.
  async function toggleRewardRedeemed(profileId,level,mode='product',amount){
    const p=allProfiles.find(x=>x.id===profileId);if(!p)return;
    const current=redeemedLevelsFor(p);
    const cashCurrent=redeemedCashLevelsFor(p);
    const amountsCurrent=redemptionAmountsFor(p);
    const datesCurrent=redemptionDatesFor(p);
    const next=new Set(current);
    const cashNext=new Set(cashCurrent);
    const amountsNext={...amountsCurrent};
    const datesNext={...datesCurrent};
    const wasRedeemed=current.has(level);
    if(wasRedeemed){next.delete(level);cashNext.delete(level);delete amountsNext[String(level)];delete datesNext[String(level)];}
    else{
      next.add(level);
      if(mode==='cash')cashNext.add(level);
      if(typeof amount==='number'&&!isNaN(amount)&&amount>=0)amountsNext[String(level)]=amount;
      datesNext[String(level)]=new Date().toISOString();
    }
    const nextArr=Array.from(next).sort((a,b)=>a-b);
    const cashArr=Array.from(cashNext).sort((a,b)=>a-b);
    // Also recompute the legacy high-water mark so older code paths stay
    // consistent. It's the largest contiguous-from-1 prefix in nextArr.
    let hwm=0;for(let i=1;i<=Math.max(...nextArr,0);i++){if(next.has(i))hwm=i;else break;}
    // Full payload first; if the DB rejects an unknown column (migrations not
    // run yet), retry with the offending column removed instead of failing hard.
    const full={rewards_redeemed_levels:nextArr,rewards_redeemed_cash_levels:cashArr,rewards_redemption_amounts:amountsNext,rewards_redemption_dates:datesNext,rewards_delivered_level:hwm};
    let payload=full;let attempt=await supabase.from('profiles').update(payload).eq('id',profileId);
    if(attempt.error){
      const msg=attempt.error.message||'';
      // Drop columns Postgres complains about, one at a time, then retry.
      const drop=(k)=>{const {[k]:_,...rest}=payload;payload=rest;};
      if(/rewards_redemption_dates/.test(msg)){drop('rewards_redemption_dates');attempt=await supabase.from('profiles').update(payload).eq('id',profileId);}
      if(attempt.error&&/rewards_redemption_amounts/.test(attempt.error.message||'')){drop('rewards_redemption_amounts');attempt=await supabase.from('profiles').update(payload).eq('id',profileId);}
      if(attempt.error&&/rewards_redeemed_cash_levels/.test(attempt.error.message||'')){drop('rewards_redeemed_cash_levels');attempt=await supabase.from('profiles').update(payload).eq('id',profileId);}
      if(attempt.error){toast('Failed: '+(attempt.error.message||'unknown')+(msg.includes('schema cache')?' — run migration 0007/0008/0009?':''),'wn');return;}
      toast(wasRedeemed?'Unmarked (partial — run pending migrations)':'Marked (partial — run pending migrations)','wn');
    }
    setAllProfiles(prev=>prev.map(x=>x.id===profileId?{...x,...payload}:x));
    if(!attempt.error&&payload===full)toast(wasRedeemed?'Unmarked':(mode==='cash'?'Marked redeemed (cash) ✓':'Marked redeemed ✓'),'ok');
  }
  // Marks every tier from 1..targetLevel as redeemed for one profile — the
  // 'Mark all delivered' per-row button. All assumed product unless previously flagged cash.
  async function markRewardsDeliveredThrough(profileId,targetLevel){
    const p=allProfiles.find(x=>x.id===profileId);if(!p)return;
    const current=redeemedLevelsFor(p);
    const next=new Set(current);
    for(let i=1;i<=targetLevel;i++)next.add(i);
    const nextArr=Array.from(next).sort((a,b)=>a-b);
    const {error}=await supabase.from('profiles').update({rewards_redeemed_levels:nextArr,rewards_delivered_level:targetLevel}).eq('id',profileId);
    if(error){toast('Failed: '+(error.message||'unknown'),'wn');return;}
    setAllProfiles(prev=>prev.map(x=>x.id===profileId?{...x,rewards_redeemed_levels:nextArr,rewards_delivered_level:targetLevel}:x));
    toast('Marked delivered ✓','ok');
  }
  // Bulk-mark every currently-owed tier (across all profiles) as redeemed.
  async function markAllRewardsDelivered(){
    const pending=allProfiles.filter(p=>{const ach=achievedLevel(p.xp,rewards);const red=redeemedLevelsFor(p);for(let l=1;l<=ach;l++)if(!red.has(l))return true;return false;});
    if(pending.length===0){toast('Nothing to mark','info');return;}
    for(const p of pending){
      const ach=achievedLevel(p.xp,rewards);
      const current=redeemedLevelsFor(p);
      const next=new Set(current);for(let l=1;l<=ach;l++)next.add(l);
      const nextArr=Array.from(next).sort((a,b)=>a-b);
      await supabase.from('profiles').update({rewards_redeemed_levels:nextArr,rewards_delivered_level:ach}).eq('id',p.id);
    }
    setAllProfiles(prev=>prev.map(p=>{const ach=achievedLevel(p.xp,rewards);const current=redeemedLevelsFor(p);const next=new Set(current);for(let l=1;l<=ach;l++)next.add(l);const nextArr=Array.from(next).sort((a,b)=>a-b);return{...p,rewards_redeemed_levels:nextArr,rewards_delivered_level:ach};}));
    toast(`Marked ${pending.length} as delivered ✓`,'ok');
  }
  async function generatePayouts(opts={}){
    // Idempotent — already-existing (profile, month) rows are skipped.
    // `silent` suppresses toasts for the auto-gen-on-load path.
    //
    // Previous shape did one .maybeSingle() per (referrer, month) which is N
    // sequential HTTP calls. We now fetch every existing payout key upfront
    // and dedupe locally. Also stamps a session-level fresh flag so navigating
    // between admin tabs within TTL doesn't re-run the whole scan.
    if(!opts.force&&isFresh('generatePayouts'))return;
    // Two-step to keep the events query small: fetch referrer'd profiles
    // first, then only fetch xp_events belonging to *those* profiles.
    // Previous shape pulled every import event in the system.
    const {data:allP,error:pErr}=await supabase.from('profiles').select('id,referred_by').not('referred_by','is',null);
    if(pErr){
      if(!opts.silent)toast('Failed to scan payouts: '+pErr.message,'wn');
      return;
    }
    if(!allP||!allP.length){markFresh('generatePayouts');return;}
    const referreeIds=allP.map(p=>p.id);
    const currentMonth=new Date().toISOString().slice(0,7);
    const currentMonthStart=currentMonth+'-01T00:00:00';
    const [{data:allEvts,error:eErr},{data:existingPayouts,error:xErr}]=await Promise.all([
      // Only referrer'd-profile events, only up to the start of the current
      // month (in-progress months can't produce payouts yet).
      supabase.from('xp_events').select('profile_id,gmv,cancelled_gmv,created_at').eq('reason','import').in('profile_id',referreeIds).lt('created_at',currentMonthStart),
      supabase.from('payouts').select('profile_id,month'),
    ]);
    if(eErr||xErr){
      const msg=eErr?.message||xErr?.message||'unknown';
      if(!opts.silent)toast('Failed to scan payouts: '+msg,'wn');
      return;
    }
    if(!allEvts)return;
    const existingSet=new Set((existingPayouts||[]).map(r=>`${r.profile_id}-${r.month}`));
    const referrers={};
    allP.forEach(p=>{referrers[p.id]=p.referred_by;});
    const byReferrerMonth={};
    allEvts.forEach(e=>{
      const refId=referrers[e.profile_id];if(!refId)return;
      const month=(e.created_at||'').slice(0,7);if(!month||month>=currentMonth)return;
      const key=`${refId}-${month}`;
      if(existingSet.has(key))return; // already-invoiced, skip early
      if(!byReferrerMonth[key])byReferrerMonth[key]={profile_id:refId,month,gmv:0,cancelled_gmv:0};
      byReferrerMonth[key].gmv+=(e.gmv||0);
      byReferrerMonth[key].cancelled_gmv+=(e.cancelled_gmv||0);
    });
    const toInsert=Object.values(byReferrerMonth).map(rec=>{
      const netGMV=Math.max(0,rec.gmv-rec.cancelled_gmv);
      const amount=parseFloat((netGMV*0.01).toFixed(2));
      return amount>0?{profile_id:rec.profile_id,month:rec.month,amount,paid:false}:null;
    }).filter(Boolean);
    let created=0;
    if(toInsert.length){
      const {error:iErr}=await supabase.from('payouts').insert(toInsert);
      if(iErr){
        if(!opts.silent)toast('Insert failed: '+iErr.message,'wn');
        return;
      }
      created=toInsert.length;
    }
    markFresh('generatePayouts');
    if(!opts.silent)toast(created>0?`Generated ${created} new payout record${created===1?'':'s'}`:'No new payouts — already up to date','ok');
    if(created>0){invalidate('adminPayouts');loadAdminPayouts();}
  }
  async function loadLastUpdated(){
    try{const {data}=await supabase.from('app_meta').select('*').eq('key','last_import').maybeSingle();if(data)setLastUpdated({time:data.updated_at,user:data.value});}catch(e){}
  }
  async function saveLastUpdated(){
    const now=new Date().toISOString();
    try{await supabase.from('app_meta').upsert({key:'last_import',value:profile?.username||'admin',updated_at:now},{onConflict:'key'});setLastUpdated({time:now,user:profile?.username||'admin'});}catch(e){}
  }
  async function loadProductMappings(){const {data}=await supabase.from('product_mappings').select('*');if(data){const m={};data.forEach(r=>{m[r.import_name.toLowerCase()]=r.product_name;});setProductMappings(m);}}
  async function loadXpExclusions(opts={}){
    if(!opts.force&&isFresh('xpExclusions'))return;
    const {data,error}=await supabase.from('xp_exclusions').select('*');
    if(error){console.error('loadXpExclusions:',error.message);return;}
    if(data){setXpExclusions(data);markFresh('xpExclusions');}
  }
  async function loadImportHistory(opts={}){
    if(!opts.force&&isFresh('importHistory'))return;
    const {data,error}=await supabase.from('xp_events').select('profile_id,created_at,gmv,commission,amount,note,reason').order('created_at',{ascending:false}).limit(500);
    if(error){console.error('importHistory error:',error);toast('Failed to load import history','wn');return;}
    if(!data)return;
    const imports=data.filter(e=>e.reason==='import');
    const byDate={};
    imports.forEach(e=>{const d=(e.created_at||'').slice(0,10);if(!d)return;if(!byDate[d])byDate[d]={date:d,totalGmv:0,totalComm:0,profiles:new Set()};byDate[d].totalGmv+=(e.gmv||0);byDate[d].totalComm+=(e.commission||0);byDate[d].profiles.add(e.profile_id);});
    const hist=Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date)).map(x=>({...x,profileCount:x.profiles.size}));
    setImportHistory(hist);
    markFresh('importHistory');
  }
  async function deleteImportByDate(date){
    const {data:evts}=await supabase.from('xp_events').select('id,profile_id,amount,gmv,commission,cancelled,cancelled_gmv,orders,sales,live_streams').eq('reason','import').gte('created_at',date+'T00:00:00').lte('created_at',date+'T23:59:59');
    if(!evts||!evts.length)return;
    const byProfile={};
    evts.forEach(e=>{
      if(!byProfile[e.profile_id])byProfile[e.profile_id]={xp:0,gmv:0,comm:0,cancelled:0,cancelled_gmv:0,orders:0,sales:0,live_streams:0,netGMVForReferral:0};
      byProfile[e.profile_id].xp+=(e.amount||0);
      byProfile[e.profile_id].gmv+=(e.gmv||0);
      byProfile[e.profile_id].comm+=(e.commission||0);
      byProfile[e.profile_id].cancelled+=(e.cancelled||0);
      byProfile[e.profile_id].cancelled_gmv+=(e.cancelled_gmv||0);
      byProfile[e.profile_id].orders+=(e.orders||0);
      byProfile[e.profile_id].sales+=(e.sales||0);
      byProfile[e.profile_id].live_streams+=(e.live_streams||0);
      byProfile[e.profile_id].netGMVForReferral+=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0));
    });
    // Look up referred_by for each affected profile so we can reverse referral_earnings.
    const affectedProfileIds=Object.keys(byProfile);
    const {data:refMap}=await supabase.from('profiles').select('id,referred_by').in('id',affectedProfileIds);
    const referralRefunds={};
    (refMap||[]).forEach(r=>{
      if(!r.referred_by)return;
      const refund=parseFloat((byProfile[r.id].netGMVForReferral*0.01).toFixed(2));
      if(refund>0)referralRefunds[r.referred_by]=(referralRefunds[r.referred_by]||0)+refund;
    });
    // Subtract values from each affected profile. Streak is reset since the deleted day
    // breaks continuity — next import rebuilds it cleanly.
    for(const [pid,vals] of Object.entries(byProfile)){
      const {data:p}=await supabase.from('profiles').select('*').eq('id',pid).single();
      if(p){
        const newXP=Math.max(0,(p.xp||0)-vals.xp);
        const newGMV=Math.max(0,(p.total_gmv||0)-vals.gmv);
        const newComm=Math.max(0,(p.total_commission||0)-vals.comm);
        const newOrders=Math.max(0,(p.total_orders||0)-vals.orders);
        const newSales=Math.max(0,(p.total_sales||0)-vals.sales);
        const newCancelled=Math.max(0,(p.total_cancelled||0)-vals.cancelled);
        const newCancelledGMV=Math.max(0,(p.total_cancelled_gmv||0)-vals.cancelled_gmv);
        const newLS=Math.max(0,(p.total_live_streams||0)-vals.live_streams);
        const newAOV=newOrders>0?parseFloat((newGMV/newOrders).toFixed(2)):0;
        await supabase.from('profiles').update({
          xp:newXP,total_gmv:newGMV,total_commission:newComm,total_orders:newOrders,
          total_sales:newSales,total_cancelled:newCancelled,total_cancelled_gmv:newCancelledGMV,
          total_live_streams:newLS,total_aov:newAOV,streak:0,last_claim:null
        }).eq('id',pid);
      }
    }
    // Reverse referral earnings on the referrers of affected affiliates.
    for(const [referrerId,amount] of Object.entries(referralRefunds)){
      const {data:refP}=await supabase.from('profiles').select('referral_earnings').eq('id',referrerId).maybeSingle();
      if(refP){
        await supabase.from('profiles').update({referral_earnings:Math.max(0,(refP.referral_earnings||0)-amount)}).eq('id',referrerId);
      }
    }
    // Delete the xp_events
    await supabase.from('xp_events').delete().in('id',evts.map(e=>e.id));
    // Delete product stats for affected profiles and rebuild from remaining events
    const affectedIds=[...new Set(evts.map(e=>e.profile_id))];
    await supabase.from('affiliate_product_stats').delete().in('profile_id',affectedIds);
    // Rebuild product stats from remaining events
    for(const pid of affectedIds){
      const {data:remaining}=await supabase.from('xp_events').select('product_name,gmv,commission,sales').eq('profile_id',pid).eq('reason','import');
      if(remaining){
        const byProd={};
        remaining.forEach(e=>{if(!e.product_name)return;if(!byProd[e.product_name])byProd[e.product_name]={gmv:0,commission:0,sales:0};byProd[e.product_name].gmv+=(e.gmv||0);byProd[e.product_name].commission+=(e.commission||0);byProd[e.product_name].sales+=(e.sales||0);});
        for(const [pn,v] of Object.entries(byProd)){
          await supabase.from('affiliate_product_stats').insert({profile_id:pid,product_name:pn,gmv:v.gmv,commission:v.commission,sales:v.sales});
        }
      }
    }
    toast(`Deleted import for ${date}`,'ok');
    invalidate('allProfiles','importHistory','unlockDates','generatePayouts');
    Object.keys(loadedAtRef.current).forEach(k=>{if(k.startsWith('periodEvents:'))delete loadedAtRef.current[k];});
    loadImportHistory();loadAllProfiles();if(profile)loadProfile(profile.id);
  }


  async function doSignup(){
    setAuthErr('');setAuthLoading(true);
    const clean=signupUser.trim().toLowerCase();const email=signupEmail.trim().toLowerCase();const hs=handles.filter(Boolean);
    if(!clean||clean.length<3){setAuthErr('Username needs 3+ chars.');setAuthLoading(false);return;}
    if(!email||!email.includes('@')){setAuthErr('Enter a valid email.');setAuthLoading(false);return;}
    if(!signupPass||signupPass.length<6){setAuthErr('Password needs 6+ chars.');setAuthLoading(false);return;}
    if(!hs.length){setAuthErr('Add at least one TikTok @.');setAuthLoading(false);return;}
    const {data:ex}=await supabase.from('profiles').select('id').eq('username',clean).maybeSingle();
    if(ex){setAuthErr('Username taken.');setAuthLoading(false);return;}
    const urlRef=signupRef.trim().toUpperCase()||new URLSearchParams(window.location.search).get('ref');
    let referredBy=null;
    if(urlRef){const {data:refP}=await supabase.from('profiles').select('id,username').eq('referral_code',urlRef).maybeSingle();if(refP){referredBy=refP.id;}else if(signupRef.trim()){setAuthErr('Invalid referral code.');setAuthLoading(false);return;}}
    const {data:authData,error:authErr2}=await supabase.auth.signUp({email,password:signupPass});
    if(authErr2||!authData.user){setAuthErr(authErr2?.message||'Sign up failed.');setAuthLoading(false);return;}
    const normH=hs.map(h=>{const t=h.trim().toLowerCase();return t.startsWith('@')?t:'@'+t;});
    const refCode=Math.random().toString(36).slice(2,10).toUpperCase();
    const {error:pErr}=await supabase.from('profiles').insert({id:authData.user.id,username:clean,tiktok_handles:normH,referral_code:refCode,referred_by:referredBy,xp:referredBy?100:0});
    if(pErr){setAuthErr(pErr.message);setAuthLoading(false);return;}
    if(referredBy){
      await supabase.from('xp_events').insert({profile_id:authData.user.id,amount:100,reason:'referral_bonus',note:'Signed up with a referral code'});
      const {data:refProf}=await supabase.from('profiles').select('xp').eq('id',referredBy).single();
      if(refProf){await supabase.from('profiles').update({xp:(refProf.xp||0)+100}).eq('id',referredBy);}
      await supabase.from('xp_events').insert({profile_id:referredBy,amount:100,reason:'referral_bonus',note:`Referred ${clean}`});
    }
    const {error:signInErr}=await supabase.auth.signInWithPassword({email,password:signupPass});
    if(signInErr){setAuthErr('Account created! Please sign in.');setAuthLoading(false);return;}
    setAuthLoading(false);setAuthErr('');
  }
  async function doLogin(){
    setAuthErr('');setAuthLoading(true);
    const email=loginUser.trim().toLowerCase();
    if(!email.includes('@')){setAuthErr('Use your email address.');setAuthLoading(false);return;}
    const {data:signInData,error}=await supabase.auth.signInWithPassword({email,password:loginPass});
    if(error){setAuthErr('Wrong email or password.');setAuthLoading(false);return;}
    // Recover orphaned auth users: if signup got partway and the profiles row was never
    // created, build a minimal one so the user isn't permanently locked out.
    if(signInData?.user){
      const {data:existing}=await supabase.from('profiles').select('id').eq('id',signInData.user.id).maybeSingle();
      if(!existing){
        const baseUsername=(email.split('@')[0]||'user').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,20)||'user';
        const refCode=Math.random().toString(36).slice(2,10).toUpperCase();
        let {error:pErr}=await supabase.from('profiles').insert({id:signInData.user.id,username:baseUsername,tiktok_handles:[],referral_code:refCode,xp:0});
        if(pErr){await supabase.from('profiles').insert({id:signInData.user.id,username:baseUsername+Math.random().toString(36).slice(2,6),tiktok_handles:[],referral_code:refCode,xp:0});}
        toast('Welcome! Add your TikTok @handles in Profile to start earning.','info');
      }
    }
    setAuthLoading(false);
  }
  async function doLogout(){await supabase.auth.signOut();setAdminUnlocked(false);localStorage.removeItem('hn-admin');setPage('home');}
  // Submit handler for the "Set new password" modal opened by PASSWORD_RECOVERY.
  async function submitResetPw(){
    if(resetPw.length<6){toast('Password must be at least 6 characters','wn');return;}
    if(resetPw!==resetPw2){toast('Passwords don\'t match','wn');return;}
    setResetBusy(true);
    const {error}=await supabase.auth.updateUser({password:resetPw});
    setResetBusy(false);
    if(error){toast('Failed: '+(error.message||'unknown'),'wn');return;}
    setShowResetPw(false);setResetPw('');setResetPw2('');
    toast('Password updated ✓','ok');
  }
  // "Forgot password?" step 1 — send the recovery email. The Supabase email
  // template should surface {{ .Token }} (6-digit OTP) so the user can complete
  // the flow even if SafeLinks / similar pre-clicks the magic link. We keep the
  // magic-link path working too via redirectTo for users on email providers
  // that don't pre-click.
  async function submitForgotPw(){
    const email=forgotEmail.trim().toLowerCase();
    if(!email.includes('@')){toast('Enter your email address','wn');return;}
    setForgotBusy(true);
    const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});
    setForgotBusy(false);
    if(error){toast('Failed: '+(error.message||'unknown'),'wn');return;}
    setForgotStep('code');setForgotCode('');setResetPw('');setResetPw2('');
    toast('Code sent — check your email','ok');
  }
  // "Forgot password?" step 2 — verify the 6-digit OTP from the email and
  // update the password in one shot. We set inForgotPwFlowRef to suppress
  // the PASSWORD_RECOVERY auto-modal so it doesn't pop up on top of the
  // forgot flow.
  async function submitForgotCode(){
    const email=forgotEmail.trim().toLowerCase();
    const code=forgotCode.trim();
    // Supabase project is configured to emit 8-digit OTPs (Auth → Settings →
    // OTP Length = 8). Sanity-check exactly 8 digits; verifyOtp is the real
    // validator anyway.
    if(code.length!==8){toast('Enter the 8-digit code from your email','wn');return;}
    if(resetPw.length<6){toast('Password must be at least 6 characters','wn');return;}
    if(resetPw!==resetPw2){toast('Passwords don\'t match','wn');return;}
    setForgotBusy(true);
    inForgotPwFlowRef.current=true;
    try{
      const {error:verifyErr}=await supabase.auth.verifyOtp({email,token:code,type:'recovery'});
      if(verifyErr){toast('Code invalid or expired — request a new one','wn');return;}
      const {error:updateErr}=await supabase.auth.updateUser({password:resetPw});
      if(updateErr){toast('Failed: '+(updateErr.message||'unknown'),'wn');return;}
      setShowForgotPw(false);setForgotEmail('');setForgotCode('');setResetPw('');setResetPw2('');setForgotStep('email');
      toast('Password updated ✓','ok');
    }finally{
      inForgotPwFlowRef.current=false;
      setForgotBusy(false);
    }
  }

  async function claimDaily(){
    if(!profile||profile.last_claim===tdy())return;
    const newStreak=(profile.streak||0)+1;
    const milestone=milestones.find(m=>m.days===newStreak);
    const xpBonus=milestone?milestone.xp_bonus:0;
    const newXP=(profile.xp||0)+xpBonus;
    const prevLv=getLv(profile.xp,LEVELS).level;
    await supabase.from('profiles').update({xp:newXP,streak:newStreak,last_claim:tdy()}).eq('id',profile.id);
    if(xpBonus>0)await supabase.from('xp_events').insert({profile_id:profile.id,amount:xpBonus,reason:'streak_milestone',note:milestone.label});
    setProfile({...profile,xp:newXP,streak:newStreak,last_claim:tdy()});
    setShowDaily(false);
    if(milestone){toast(`🔥 ${milestone.label}! +${xpBonus} XP!`,'ok');}else{toast(`🔥 Day ${newStreak} streak!`,'ok');}
    const newLv=getLv(newXP).level;
    if(newLv>prevLv)setTimeout(()=>setLevelUpAnim(newLv),400);
    loadLeaderboard();
  }

  function openAdminGate(){if(adminUnlocked){navTo('admin');return;}setAdminErr('');setAdminPass('');setShowAdminGate(true);}
  function checkAdminPass(){if(adminPass===ADMIN_PASSWORD){setAdminUnlocked(true);localStorage.setItem('hn-admin','true');setShowAdminGate(false);loadAllProfiles();loadImportHistory();navTo('admin');toast('Admin access granted','ok');}else{setAdminErr('Incorrect password.');}}
  function navTo(pg){
    setPage(pg);
    const el=document.querySelector('.pages');if(el)el.scrollTop=0;
    if(pg==='admin'&&adminUnlocked){
      // Lightweight admin bootstrap only — the *always-needed* data (profile
      // roster + reward values). The heavy per-tab loaders (unlock dates,
      // period events, generatePayouts) fire from the adminTab useEffect
      // below only when the consuming tab is actually visible.
      loadAllProfiles();
      loadAdminRewardValues();
    }
    if(pg==='home'||pg==='lb'){loadLeaderboard();loadMonthlyLeaderboard(lbMonth.year,lbMonth.month);}
    if(pg==='home'||pg==='referrals')loadReferralStats();
  }

  async function admAwardXP(profileId,subtract=false){
    const amount=xpAmounts[profileId]||100;const p=allProfiles.find(x=>x.id===profileId);if(!p)return;
    const prevLv=getLv(p.xp,LEVELS).level;const newXP=subtract?Math.max(0,p.xp-amount):p.xp+amount;
    await supabase.from('profiles').update({xp:newXP}).eq('id',profileId);
    await supabase.from('xp_events').insert({profile_id:profileId,amount:subtract?-amount:amount,reason:'manual'});
    toast(subtract?`✅ -${amount} XP → ${p.username}`:`✅ +${amount} XP → ${p.username}`,'ok');
    const newLv=getLv(newXP).level;if(!subtract&&newLv>prevLv)setTimeout(()=>toast(`🎉 ${p.username} hit Level ${newLv}!`,'ok'),400);
    if(profile?.id===profileId)setProfile({...profile,xp:newXP});
    invalidate('allProfiles','unlockDates');loadAllProfiles();
  }
  function openEditAffiliate(p){
    setEditingProfile(p.id);
    setEditForm({
      total_gmv:p.total_gmv||0,total_commission:p.total_commission||0,total_orders:p.total_orders||0,total_sales:p.total_sales||0,
      total_cancelled:p.total_cancelled||0,total_cancelled_gmv:p.total_cancelled_gmv||0,total_live_streams:p.total_live_streams||0,
      streak:p.streak||0,referral_earnings:p.referral_earnings||0
    });
  }
  async function saveEditAffiliate(){
    if(!editingProfile)return;
    const p=allProfiles.find(x=>x.id===editingProfile);if(!p)return;
    const f=editForm;
    const num=(v)=>{const n=parseFloat(v);return Number.isFinite(n)?n:0;};
    const intN=(v)=>{const n=parseInt(v);return Number.isFinite(n)?n:0;};
    const newGMV=num(f.total_gmv);
    const newComm=num(f.total_commission);
    const newOrders=intN(f.total_orders);
    const newSales=intN(f.total_sales);
    const newCancelled=intN(f.total_cancelled);
    const newCancelledGMV=num(f.total_cancelled_gmv);
    const newLiveStreams=intN(f.total_live_streams);
    const newStreak=intN(f.streak);
    const newReferralEarnings=num(f.referral_earnings);
    const dGMV=newGMV-(p.total_gmv||0);
    const dComm=newComm-(p.total_commission||0);
    const dOrders=newOrders-(p.total_orders||0);
    const dSales=newSales-(p.total_sales||0);
    const dCancelled=newCancelled-(p.total_cancelled||0);
    const dCancelledGMV=newCancelledGMV-(p.total_cancelled_gmv||0);
    const dLiveStreams=newLiveStreams-(p.total_live_streams||0);
    const netOrders=newOrders-newCancelled;
    const newAOV=netOrders>0?parseFloat(((newGMV-newCancelledGMV)/netOrders).toFixed(2)):0;
    const anyDelta=[dGMV,dComm,dOrders,dSales,dCancelled,dCancelledGMV,dLiveStreams].some(x=>Math.abs(x)>0.005);
    if(anyDelta){
      const parts=[];
      if(Math.abs(dGMV)>0.005)parts.push(`GMV ${dGMV>=0?'+':''}${dGMV.toFixed(2)}`);
      if(Math.abs(dComm)>0.005)parts.push(`Comm ${dComm>=0?'+':''}${dComm.toFixed(2)}`);
      if(dOrders!==0)parts.push(`Orders ${dOrders>=0?'+':''}${dOrders}`);
      if(dSales!==0)parts.push(`Units ${dSales>=0?'+':''}${dSales}`);
      if(dCancelled!==0)parts.push(`Ret ${dCancelled>=0?'+':''}${dCancelled}`);
      if(Math.abs(dCancelledGMV)>0.005)parts.push(`RetGMV ${dCancelledGMV>=0?'+':''}${dCancelledGMV.toFixed(2)}`);
      if(dLiveStreams!==0)parts.push(`Lives ${dLiveStreams>=0?'+':''}${dLiveStreams}`);
      await supabase.from('xp_events').insert({
        profile_id:p.id,amount:0,reason:'manual',note:`Admin adjustment: ${parts.join(', ')}`,
        gmv:dGMV,commission:dComm,orders:dOrders,sales:dSales,cancelled:dCancelled,cancelled_gmv:dCancelledGMV,
        live_streams:dLiveStreams,aov:0,product_name:null
      });
    }
    const{error}=await supabase.from('profiles').update({
      total_gmv:newGMV,total_commission:newComm,total_orders:newOrders,total_sales:newSales,
      total_cancelled:newCancelled,total_cancelled_gmv:newCancelledGMV,total_live_streams:newLiveStreams,
      total_aov:newAOV,streak:newStreak,referral_earnings:newReferralEarnings
    }).eq('id',p.id);
    if(error){toast('Save failed: '+error.message,'wn');return;}
    toast(`✅ Updated ${p.username}`,'ok');
    setEditingProfile(null);
    invalidate('allProfiles');loadAllProfiles();
    if(profile?.id===p.id)loadProfile(p.id);
  }
  async function revertReferral(profileId){
    const p=allProfiles.find(x=>x.id===profileId);
    if(!p||!p.referred_by){setDeleteConfirm(null);return;}
    const referrer=allProfiles.find(x=>x.id===p.referred_by);
    try{
      // Sum the referral_earnings that were credited to the referrer based on this
      // affiliate's import history. 1% of net GMV per import event.
      const {data:events}=await supabase.from('xp_events').select('gmv,cancelled_gmv').eq('profile_id',profileId).eq('reason','import');
      let totalRefEarnings=0;
      (events||[]).forEach(e=>{
        const netGMV=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0));
        totalRefEarnings+=netGMV*0.01;
      });
      totalRefEarnings=parseFloat(totalRefEarnings.toFixed(2));
      // Referred user: subtract the +100 signup bonus, clear referred_by.
      const referredNewXP=Math.max(0,(p.xp||0)-100);
      await supabase.from('profiles').update({referred_by:null,xp:referredNewXP}).eq('id',profileId);
      await supabase.from('xp_events').insert({
        profile_id:profileId,amount:-100,reason:'manual',
        note:`Referral reverted by admin (was referred by ${referrer?referrer.username:'unknown'})`
      });
      // Referrer: subtract the +100 referral bonus and the accumulated 1% earnings.
      if(referrer){
        const refNewXP=Math.max(0,(referrer.xp||0)-100);
        const refNewEarnings=Math.max(0,(referrer.referral_earnings||0)-totalRefEarnings);
        await supabase.from('profiles').update({xp:refNewXP,referral_earnings:refNewEarnings}).eq('id',referrer.id);
        await supabase.from('xp_events').insert({
          profile_id:referrer.id,amount:-100,reason:'manual',
          note:`Referral of ${p.username} reverted by admin (−${fmtGBP(totalRefEarnings)} earnings)`
        });
      }
      toast(`↩ Referral reverted for ${p.username}${totalRefEarnings>0?` · −${fmtGBP(totalRefEarnings)} from referrer`:''}`,'ok');
      setDeleteConfirm(null);
      invalidate('allProfiles','generatePayouts');loadAllProfiles();
      if(profile?.id===profileId)loadProfile(profileId);
      if(profile?.id===referrer?.id)loadProfile(referrer.id);
    }catch(e){toast('Revert failed: '+(e.message||''),'wn');}
  }
  async function deleteAffiliate(profileId){
    const p=allProfiles.find(x=>x.id===profileId);if(!p)return;
    try{
      // Detach anyone whose referred_by points at this profile so they aren't orphaned.
      await supabase.from('profiles').update({referred_by:null}).eq('referred_by',profileId);
      // Wipe per-affiliate rows from every related table. live_sessions cascades via FK;
      // the rest are explicit so the delete works regardless of FK ON DELETE behaviour.
      await supabase.from('xp_events').delete().eq('profile_id',profileId);
      await supabase.from('affiliate_product_stats').delete().eq('profile_id',profileId);
      await supabase.from('xp_exclusions').delete().eq('profile_id',profileId);
      await supabase.from('payouts').delete().eq('profile_id',profileId);
      await supabase.from('live_sessions').delete().eq('profile_id',profileId);
      const{error}=await supabase.from('profiles').delete().eq('id',profileId);
      if(error){toast('Delete failed: '+error.message,'wn');return;}
      toast(`🗑️ Deleted ${p.username}`,'ok');
      setDeleteConfirm(null);
      invalidate('allProfiles','unlockDates','generatePayouts');
      loadAllProfiles();loadLeaderboard();
    }catch(e){toast('Delete failed: '+(e.message||''),'wn');}
  }
  async function saveReward(r){
    const updates={name:r.name,description:r.description,xp_required:Number(r.xp_required),image_url:r.image_url,value:Number(r.value||0)};
    const {error}=await supabase.from('rewards').update(updates).eq('id',r.id);
    if(!error){toast(`Reward ${r.level} saved ✓`,'ok');loadRewards();}
    else toast('Save failed: '+error.message,'wn');
  }
  async function handleImageUpload(idx,file){const reader=new FileReader();reader.onload=e=>{const u=[...editRewards];u[idx]={...u[idx],image_url:e.target.result};setEditRewards(u);toast('Image ready — click Save','info');};reader.readAsDataURL(file);}

  async function handleFile(file){
    setImportLog(['Reading file...']);
    let rows=[];const ext=file.name.split('.').pop().toLowerCase();
    if(ext==='csv'){rows=parseCSV(await file.text());}
    else if(ext==='xlsx'||ext==='xls'){const buf=await file.arrayBuffer();const wb=XLSX.read(buf);rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});}
    else{setImportLog(['ERROR: Use .csv or .xlsx']);return;}
    const headers=Object.keys(rows[0]||{});
    const hCol=findCol(headers,'handle');const sCol=findCol(headers,'sales');const gCol=findCol(headers,'gmv');const oCol=findCol(headers,'orders');const cCol=findCol(headers,'commission');const aovCol=findCol(headers,'aov_col');const pCol=findCol(headers,'product');const canCol=findCol(headers,'cancelled');const canGCol=findCol(headers,'cancelled_gmv');
    const lsCol=findCol(headers,'live_streams');
    // Parse product name and date from filename e.g. "Product_Detail_Analysis_Creator_List_20260319-20260319_teeth.xlsx"
    const fnBase=file.name.replace(/\.xlsx?|\.csv$/i,'');
    const dateMatch=fnBase.match(/(\d{8})/);
    const importDate=dateMatch?`${dateMatch[1].slice(0,4)}-${dateMatch[1].slice(4,6)}-${dateMatch[1].slice(6,8)}`:tdy();
    const knownParts=['product','detail','analysis','creator','list','report','export','tiktok','shop'];
    const productFromFile=fnBase.split(/[_\-]/).filter(p=>p.length>2&&!/^\d+$/.test(p)&&!knownParts.includes(p.toLowerCase())).pop()||null;
    const logs=[`File: ${file.name} (${rows.length} rows)`,`Handle: ${hCol||'NOT FOUND'} | GMV: ${gCol||'?'} | Product: ${productFromFile||'(from col)'}`,`Date: ${importDate}`,'─────────────'];
    let matched=0,unmatched=0,skipped=0;
    const {data:profiles}=await supabase.from('profiles').select('id,username,tiktok_handles,xp,total_sales,total_gmv,total_orders,total_commission,referred_by');
    for(const row of rows){
      const rawH=(hCol?row[hCol]:'').toString().trim().toLowerCase();if(!rawH){skipped++;continue;}
      const handle=rawH.startsWith('@')?rawH:'@'+rawH;
      const p=(profiles||[]).find(x=>(x.tiktok_handles||[]).some(t=>{const tc=t.toLowerCase().replace(/^@/,'');const hc=handle.replace(/^@/,'');const rhc=rawH.replace(/^@/,'');return tc===hc||tc===rhc||t.toLowerCase()===handle||t.toLowerCase()===rawH;}));
      const rawS=sCol?parseInt((row[sCol]||'0').toString().replace(/[^0-9]/g,''))||0:0;
      const rawG=gCol?parseFloat((row[gCol]||'0').toString().replace(/[£,\s]/g,''))||0:0;
      const rawO=oCol?parseInt((row[oCol]||'0').toString().replace(/[^0-9]/g,''))||0:0;
      const rawC=cCol?parseFloat((row[cCol]||'0').toString().replace(/[^0-9.]/g,''))||0:0;
      const rawAOV=aovCol?parseFloat((row[aovCol]||'0').toString().replace(/[^0-9.]/g,''))||0:0;
      const rawCan=canCol?parseInt((row[canCol]||'0').toString().replace(/[^0-9]/g,''))||0:0;
      const rawLS=lsCol?parseInt((row[lsCol]||'0').toString().replace(/[^0-9]/g,''))||0:0;
      const rawCanG=canGCol?parseFloat((row[canGCol]||'0').toString().replace(/[^0-9.]/g,''))||0:0;
      const sales=rawS||(rawG>0?Math.max(1,Math.round(rawG/10)):0);
      if(!p){logs.push(`⚠ No match: ${handle}`);unmatched++;continue;}
      if(sales===0&&rawG===0&&rawCan===0&&rawCanG===0){skipped++;continue;}
      // If this is a return-only row (no new sales), subtract XP and update return stats
      if(sales===0&&rawG===0&&(rawCan>0||rawCanG>0)){
        const prodNameForReturn=(pCol&&row[pCol]?row[pCol].toString().trim():null)||productFromFile;
        let returnProdName=null;
        if(prodNameForReturn){
          const keywordMatch=products.find(pr=>(pr.keywords||[]).some(k=>prodNameForReturn.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(prodNameForReturn.toLowerCase())));
          if(keywordMatch)returnProdName=keywordMatch.name;
          if(!returnProdName){const nameMatch=products.find(pr=>pr.name.toLowerCase().includes(prodNameForReturn.toLowerCase())||prodNameForReturn.toLowerCase().includes(pr.name.toLowerCase()));if(nameMatch)returnProdName=nameMatch.name;}
          if(!returnProdName)returnProdName=prodNameForReturn;
        }
        const returnExcluded=xpExclusions.some(ex=>{
          if(ex.profile_id!==p.id)return false;
          if(!returnProdName||ex.product_name.toLowerCase()!==returnProdName.toLowerCase())return false;
          if(ex.start_date&&importDate<ex.start_date)return false;
          if(ex.end_date&&importDate>ex.end_date)return false;
          return true;
        });
        const xpToRemove=returnExcluded?0:Math.floor(rawCanG/10)*XP_PER_10_GMV;
        const newXP=Math.max(0,(p.xp||0)-xpToRemove);
        const newTotalCancelled=(p.total_cancelled||0)+rawCan;
        const newTotalCancelledGMV=(p.total_cancelled_gmv||0)+rawCanG;
        // xp_events FIRST as canonical source of truth.
        await supabase.from('xp_events').insert({profile_id:p.id,amount:xpToRemove>0?-xpToRemove:0,reason:'import',note:`Return: ${rawCan} item${rawCan!==1?'s':''}  (${fmtGBP(rawCanG)})${xpToRemove>0?' → -'+xpToRemove+' XP':''}${returnExcluded?' (XP excluded)':''}`,gmv:0,commission:0,aov:0,orders:0,sales:0,live_streams:rawLS,cancelled:rawCan,cancelled_gmv:rawCanG,product_name:returnProdName,created_at:new Date(importDate+'T12:00:00').toISOString()});
        await supabase.from('profiles').update({xp:newXP,total_cancelled:newTotalCancelled,total_cancelled_gmv:newTotalCancelledGMV}).eq('id',p.id);
        // Mutate local p so subsequent rows for the same profile see fresh values.
        p.xp=newXP;p.total_cancelled=newTotalCancelled;p.total_cancelled_gmv=newTotalCancelledGMV;
        logs.push(`↩️ ${p.username}: return — ${rawCan} item${rawCan!==1?'s':''} (${fmtGBP(rawCanG)})${xpToRemove>0?' → -'+xpToRemove+' XP':''}${returnExcluded?' (XP excluded)':''}`);
        matched++;continue;
      }
      const netGMVForXP=Math.max(0,rawG-rawCanG);
      // Resolve product name FIRST
      const rawProdName=(pCol&&row[pCol]?row[pCol].toString().trim():null)||productFromFile;
      let prodName=null;
      if(rawProdName){
        // First check keywords on each product
        const keywordMatch=products.find(p=>(p.keywords||[]).some(k=>rawProdName.toLowerCase().includes(k.toLowerCase())||k.toLowerCase().includes(rawProdName.toLowerCase())));
        if(keywordMatch)prodName=keywordMatch.name;
        // Then try name contains
        if(!prodName){const nameMatch=products.find(p=>p.name.toLowerCase().includes(rawProdName.toLowerCase())||rawProdName.toLowerCase().includes(p.name.toLowerCase()));if(nameMatch)prodName=nameMatch.name;}
        // Fallback to raw name
        if(!prodName)prodName=rawProdName;
      }
      // Check XP exclusions BEFORE calculating XP
      const isExcluded=xpExclusions.some(ex=>{
        if(ex.profile_id!==p.id)return false;
        if(!prodName||ex.product_name.toLowerCase()!==prodName.toLowerCase())return false;
        if(ex.start_date&&importDate<ex.start_date)return false;
        if(ex.end_date&&importDate>ex.end_date)return false;
        return true;
      });
      logs.push(`🔍 ${p.username}: product="${prodName}" | exclusions=${xpExclusions.length} | excluded=${isExcluded}`);
      if(isExcluded){
        // Still record the sale data but zero out XP
        const profileUpdateNoXP={total_sales:(p.total_sales||0)+sales,total_gmv:(p.total_gmv||0)+rawG,total_orders:(p.total_orders||0)+(rawO||sales),total_commission:(p.total_commission||0)+rawC,total_live_streams:(p.total_live_streams||0)+rawLS};
        const exclTotalAOV=rawAOV||(rawO>0?parseFloat((rawG/rawO).toFixed(2)):0);
        const exclTotalCancelled=(p.total_cancelled||0)+rawCan;
        const exclTotalCancelledGMV=(p.total_cancelled_gmv||0)+rawCanG;
        const xpInsertNoXP={profile_id:p.id,amount:0,reason:'import',note:`${fmtGBP(netGMVForXP)} net GMV — XP excluded (${prodName})`,gmv:rawG,commission:rawC,aov:exclTotalAOV,orders:rawO||sales,sales,live_streams:rawLS,cancelled:rawCan,cancelled_gmv:rawCanG,product_name:prodName,created_at:new Date(importDate+'T12:00:00').toISOString()};
        // xp_events FIRST as canonical source of truth.
        await supabase.from('xp_events').insert(xpInsertNoXP);
        await supabase.from('profiles').update(profileUpdateNoXP).eq('id',p.id);
        await supabase.from('profiles').update({total_aov:exclTotalAOV,total_cancelled:exclTotalCancelled,total_cancelled_gmv:exclTotalCancelledGMV}).eq('id',p.id);
        // Mutate local p so subsequent rows for the same profile see fresh values.
        Object.assign(p,profileUpdateNoXP,{total_aov:exclTotalAOV,total_cancelled:exclTotalCancelled,total_cancelled_gmv:exclTotalCancelledGMV});
        if(prodName){const {data:existing}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',p.id).eq('product_name',prodName).maybeSingle();if(existing){await supabase.from('affiliate_product_stats').update({gmv:(existing.gmv||0)+rawG,commission:(existing.commission||0)+rawC,sales:(existing.sales||0)+sales}).eq('id',existing.id);}else{await supabase.from('affiliate_product_stats').insert({profile_id:p.id,product_name:prodName,gmv:rawG,commission:rawC,sales});}}
        logs.push(`⊘ ${p.username}: ${prodName} — XP excluded | GMV: ${fmtGBP(rawG)}`);
        matched++;continue;
      }
      const prevLv=getLv(p.xp,LEVELS).level;const xpGain=Math.floor(netGMVForXP/10)*XP_PER_10_GMV;const newXP=p.xp+xpGain;const newLv=getLv(newXP).level;
      const newOrders=(p.total_orders||0)+(rawO||sales);const newGMV=(p.total_gmv||0)+rawG;const aov=rawAOV||( rawO>0?parseFloat((rawG/rawO).toFixed(2)):0);const newAOV=rawAOV||( newOrders>0?parseFloat((newGMV/newOrders).toFixed(2)):0);
      // Streak — only update when this import is NOT backdated (importDate >= last_claim).
      const lastClaim=p.last_claim;
      const prevDate=lastClaim?new Date(lastClaim):null;
      const importDateObj=new Date(importDate);
      const diffDays=prevDate?Math.round((importDateObj-prevDate)/(1000*60*60*24)):null;
      const isBackdated=diffDays!==null&&diffDays<0;
      let newStreak=p.streak||0;
      let streakXP=0;
      if(!isBackdated){
        if(diffDays===null){newStreak=1;}
        else if(diffDays===1){newStreak=(p.streak||0)+1;}
        else if(diffDays===0){newStreak=p.streak||1;}
        else{newStreak=1;}
        const hitMilestone=milestones.find(m=>m.days===newStreak);
        if(hitMilestone&&diffDays!==0){streakXP=hitMilestone.xp_bonus;}
      }
      const finalXP=newXP+streakXP;
      const xpGainTotal=xpGain+streakXP;
      const streakNote=isBackdated?` | Backdated — streak unchanged`:(streakXP>0?` | Day ${newStreak} streak +${streakXP} XP`:(diffDays!==0&&diffDays!==null&&diffDays>1?` | Streak reset (${diffDays}d gap)`:` | Day ${newStreak} streak`));
      const xpInsert={profile_id:p.id,amount:xpGainTotal,reason:'import',note:`${fmtGBP(netGMVForXP)} net GMV → +${xpGain} XP${streakNote}`,gmv:rawG,commission:rawC,aov,orders:rawO||sales,sales,live_streams:rawLS,cancelled:rawCan,cancelled_gmv:rawCanG,product_name:prodName||null,created_at:new Date(importDate+'T12:00:00').toISOString()};
      // xp_events FIRST so it is the canonical source of truth — if the profile update
      // then fails, totals can be re-derived from events.
      await supabase.from('xp_events').insert(xpInsert);
      const profileUpdate={xp:finalXP,total_sales:(p.total_sales||0)+sales,total_gmv:newGMV,total_orders:newOrders,total_commission:(p.total_commission||0)+rawC,total_live_streams:(p.total_live_streams||0)+rawLS};
      if(!isBackdated){profileUpdate.streak=newStreak;profileUpdate.last_claim=importDate;}
      const newTotalCancelled=(p.total_cancelled||0)+rawCan;
      const newTotalCancelledGMV=(p.total_cancelled_gmv||0)+rawCanG;
      const {error:puErr}=await supabase.from('profiles').update(profileUpdate).eq('id',p.id);
      if(!puErr){await supabase.from('profiles').update({total_aov:newAOV,total_cancelled:newTotalCancelled,total_cancelled_gmv:newTotalCancelledGMV}).eq('id',p.id);}
      // Mutate local p so subsequent rows for the same profile see fresh values.
      Object.assign(p,profileUpdate,{total_aov:newAOV,total_cancelled:newTotalCancelled,total_cancelled_gmv:newTotalCancelledGMV});
      if(prodName){const {data:existing}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',p.id).eq('product_name',prodName).maybeSingle();if(existing){await supabase.from('affiliate_product_stats').update({gmv:(existing.gmv||0)+rawG,commission:(existing.commission||0)+rawC,sales:(existing.sales||0)+sales}).eq('id',existing.id);}else{await supabase.from('affiliate_product_stats').insert({profile_id:p.id,product_name:prodName,gmv:rawG,commission:rawC,sales});}}
      // Credit referrer 1% of net GMV — mutate refP in-place so subsequent rows for the
      // same referrer (e.g. a referred creator with multiple products) accumulate correctly.
      const netGMV=Math.max(0,rawG-rawCanG);
      if(p.referred_by&&netGMV>0){
        const refBonus=parseFloat((netGMV*0.01).toFixed(2));
        const refP=(profiles||[]).find(x=>x.id===p.referred_by);
        if(refP){
          const newRefEarnings=(refP.referral_earnings||0)+refBonus;
          await supabase.from('profiles').update({referral_earnings:newRefEarnings}).eq('id',p.referred_by);
          refP.referral_earnings=newRefEarnings;
        }
      }
      logs.push(`✓ ${p.username}: ${fmtGBP(netGMVForXP)} net GMV → +${xpGain} XP${rawG>0?` | GMV: ${fmtGBP(rawG)}`:''}${rawCanG>0?` | Returns: -${fmtGBP(rawCanG)}`:''}${isBackdated?' (backdated)':''}${newLv>prevLv?` 🎉 Level ${newLv}!`:''}`);
      matched++;
    }
    logs.push('─────────────',`Done: ${matched} updated · ${unmatched} unmatched · ${skipped} skipped`);
    setImportLog(logs);toast(`Import done: ${matched} updated`,'ok');
    // Import touches profiles, xp_events, affiliate_product_stats — bust
    // every cache so admin views refresh cleanly rather than showing stale
    // pre-import numbers on tab switch.
    invalidate('allProfiles','importHistory','unlockDates','generatePayouts');
    Object.keys(loadedAtRef.current).forEach(k=>{if(k.startsWith('periodEvents:'))delete loadedAtRef.current[k];});
    loadAllProfiles();loadImportHistory();saveLastUpdated();if(profile)loadProfile(profile.id);
  }

  function exportCSV(){
    const rows=[['Username','TikTok Handles','XP','Level','Sales','GMV','Orders','Commission','Streak','Referral Code','Referral Earnings']];
    allProfiles.forEach(p=>{const lv=getLv(p.xp,LEVELS);rows.push([p.username,(p.tiktok_handles||[]).join('; '),p.xp,lv.level,p.total_sales||0,p.total_gmv||0,p.total_orders||0,p.total_commission||0,p.streak||0,p.referral_code||'',p.referral_earnings||0]);});
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`hollen-${tdy()}.csv`;a.click();
    toast('📊 Downloaded','ok');
  }

  const rangeBounds=React.useMemo(()=>{
    if(dateRange==='all')return null;
    let start,end=new Date();end.setHours(23,59,59,999);
    if(dateRange==='yesterday'){start=new Date();start.setDate(start.getDate()-1);start.setHours(0,0,0,0);end=new Date(start);end.setHours(23,59,59,999);}
    else if(dateRange==='7d'){start=new Date();start.setDate(start.getDate()-6);start.setHours(0,0,0,0);}
    else if(dateRange==='30d'){start=new Date();start.setDate(start.getDate()-29);start.setHours(0,0,0,0);}
    else if(dateRange==='month'){const[my,mm]=selectedMonth.split('-').map(Number);start=new Date(my,mm-1,1);end=new Date(my,mm,0,23,59,59,999);}
    else if(dateRange==='custom'&&customStart&&customEnd){start=new Date(customStart);start.setHours(0,0,0,0);end=new Date(customEnd);end.setHours(23,59,59,999);}
    else return null;
    let prevStart,prevEnd;
    if(dateRange==='month'){const[my,mm]=selectedMonth.split('-').map(Number);prevStart=new Date(my,mm-2,1);prevEnd=new Date(my,mm-1,0,23,59,59,999);}
    else{const dur=end.getTime()-start.getTime();prevEnd=new Date(start.getTime()-1);prevStart=new Date(prevEnd.getTime()-dur);}
    return{start,end,prevStart,prevEnd};
  },[dateRange,customStart,customEnd,selectedMonth]);

  const filteredEvents=React.useMemo(()=>{
    if(!xpEvents)return[];
    if(!rangeBounds)return xpEvents;
    const{start,end}=rangeBounds;
    return xpEvents.filter(e=>{const d=new Date(e.created_at);return d>=start&&d<=end;});
  },[xpEvents,rangeBounds]);

  const prevEvents=React.useMemo(()=>{
    if(!xpEvents||!rangeBounds)return[];
    const{prevStart,prevEnd}=rangeBounds;
    return xpEvents.filter(e=>{const d=new Date(e.created_at);return d>=prevStart&&d<=prevEnd;});
  },[xpEvents,rangeBounds]);

  const importEvts=filteredEvents.filter(e=>e.reason==='import');
  const filteredGMVGross=importEvts.reduce((s,e)=>s+(e.gmv||0),0);
  const filteredCommGross=importEvts.reduce((s,e)=>s+(e.commission||0),0);
  const filteredOrders=importEvts.reduce((s,e)=>s+(e.orders||0),0);
  const filteredUnits=importEvts.reduce((s,e)=>s+(e.sales||0),0);
  const filteredLiveStreams=importEvts.reduce((s,e)=>s+(e.live_streams||0),0);
  const filteredCancelled=importEvts.reduce((s,e)=>s+(e.cancelled||0),0);
  const filteredCancelledGMV=importEvts.reduce((s,e)=>s+(e.cancelled_gmv||0),0);
  const filteredGMV=Math.max(0,filteredGMVGross-filteredCancelledGMV);
  // Unclamped net for the headline — when returns (dated to ship-back day)
  // exceed a window's gross, net is genuinely negative and we show it.
  const filteredNet=filteredGMVGross-filteredCancelledGMV;
  const filteredComm=filteredGMVGross>0?Math.max(0,filteredCommGross-(filteredCommGross*(filteredCancelledGMV/filteredGMVGross))):0;
  const filteredAOV=(filteredOrders-filteredCancelled)>0?filteredGMV/(filteredOrders-filteredCancelled):0;
  const filteredCommPerLive=filteredLiveStreams>0?filteredComm/filteredLiveStreams:0;

  const prevImports=prevEvents.filter(e=>e.reason==='import');
  const prevGMVGross=prevImports.reduce((s,e)=>s+(e.gmv||0),0);
  const prevCommGross=prevImports.reduce((s,e)=>s+(e.commission||0),0);
  const prevOrders=prevImports.reduce((s,e)=>s+(e.orders||0),0);
  const prevUnits=prevImports.reduce((s,e)=>s+(e.sales||0),0);
  const prevLiveStreams=prevImports.reduce((s,e)=>s+(e.live_streams||0),0);
  const prevCancelled=prevImports.reduce((s,e)=>s+(e.cancelled||0),0);
  const prevCancelledGMV=prevImports.reduce((s,e)=>s+(e.cancelled_gmv||0),0);
  const prevGMV=Math.max(0,prevGMVGross-prevCancelledGMV);
  const prevNet=prevGMVGross-prevCancelledGMV;
  const prevComm=prevGMVGross>0?Math.max(0,prevCommGross-(prevCommGross*(prevCancelledGMV/prevGMVGross))):0;
  const prevAOV=(prevOrders-prevCancelled)>0?prevGMV/(prevOrders-prevCancelled):0;
  const prevCommPerLive=prevLiveStreams>0?prevComm/prevLiveStreams:0;

  const renderDelta=(current,prev,fmt,lowerIsBetter)=>{
    if(!rangeBounds)return null;
    const diff=current-prev;
    if(Math.abs(diff)<0.005)return(<span style={{display:'inline-flex',alignItems:'center',background:'rgba(255,255,255,.05)',color:'var(--tx3)',padding:'1px 6px',borderRadius:99,fontSize:9,fontWeight:700,marginLeft:5,letterSpacing:.3,verticalAlign:'middle'}}>–</span>);
    const good=lowerIsBetter?diff<0:diff>0;
    const color=good?'#6b9b7d':'#b04a55';
    const bg=good?'rgba(107,155,125,.14)':'rgba(176,74,85,.14)';
    return(<span style={{display:'inline-flex',alignItems:'center',gap:2,background:bg,color,padding:'1px 6px',borderRadius:99,fontSize:9,fontWeight:700,marginLeft:5,letterSpacing:.3,verticalAlign:'middle'}}>{diff>0?'▲':'▼'} {fmt(Math.abs(diff))}</span>);
  };
  const filteredProducts=React.useMemo(()=>{
    const byProd={};
    importEvts.forEach(e=>{
      if(!e.product_name)return;
      if(!byProd[e.product_name])byProd[e.product_name]={product_name:e.product_name,gmv:0,commission:0,sales:0};
      byProd[e.product_name].gmv+=(e.gmv||0);
      byProd[e.product_name].commission+=(e.commission||0);
      byProd[e.product_name].sales+=(e.sales||0);
    });
    return Object.values(byProd).sort((a,b)=>b.commission-a.commission);
  },[importEvts]);
  const isFiltered=dateRange!=='all';

  // Map: referrer profile_id -> array of profiles they've referred. Built from
  // allProfiles so the admin panel can show "Referred N creators" at a glance
  // without a separate query.
  const referralsByReferrer=React.useMemo(()=>{
    const m={};
    allProfiles.forEach(p=>{
      if(p.referred_by){
        if(!m[p.referred_by])m[p.referred_by]=[];
        m[p.referred_by].push(p);
      }
    });
    return m;
  },[allProfiles]);
  const profileById=React.useMemo(()=>{
    const m={};
    allProfiles.forEach(p=>{m[p.id]=p;});
    return m;
  },[allProfiles]);

  // Build LEVELS dynamically from rewards table
  const LEVELS=React.useMemo(()=>{
    if(!rewards||rewards.length===0)return DEFAULT_LEVELS;
    const sorted=[...rewards].sort((a,b)=>a.xp_required-b.xp_required);
    return sorted.map((r,i)=>({
      level:i+1,
      min:i===0?0:sorted[i-1].xp_required,
      max:r.xp_required
    })).concat([{level:sorted.length+1,min:sorted[sorted.length-1].xp_required,max:9999999}]).slice(0,sorted.length);
  },[rewards]);

    const lv=profile?getLv(profile.xp,LEVELS):LEVELS[0];
  const nx=profile?getNx(profile.xp,LEVELS):LEVELS[1];
  const pct=profile?xpPct(profile.xp,LEVELS):0;
  const nextMilestone=profile?milestones.find(m=>m.days>(profile.streak||0)):null;
  const refLink=profile?`${window.location.origin}?ref=${profile.referral_code||''}`:'';

  const RcCard=({r})=>{
    const un=profile&&profile.xp>=r.xp_required;
    const isCur=!un&&rewards.filter(x=>profile&&profile.xp<x.xp_required)[0]?.level===r.level;
    const prog=profile?Math.min(100,Math.round((profile.xp/r.xp_required)*100)):0;
    return(<div className={`rc${un?' un':isCur?' cur':''}`} onClick={()=>setShowReward(r)}><div className="rc-inner"><div className="rc-img-wrap">{r.image_url?<img src={r.image_url} alt={r.name}/>:<div className="rc-ph">🎁</div>}<div className={`rc-badge${un?' un':isCur?' cur':' lk'}`}>{un?'✓':isCur?'▶':'🔒'}</div></div><div className="rc-body"><div className="rc-lv">Level {r.level}</div><div className="rc-nm">{r.name}</div><div className="rc-xp">{r.xp_required.toLocaleString()} XP</div><div className="rc-prog"><div className="rc-pf" style={{width:`${prog}%`}}/></div></div></div></div>);
  };

  const LbRow=({u,rank})=>{const ulv=getLv(u.xp,LEVELS);const isMe=u.id===profile?.id;const col=avc(u.username);return(<div className={`lbrow${isMe?' me':''}`}><div className={`lbrk${rank===1?' g':rank===2?' s':rank===3?' b':''}`}>{rank}</div><div className="lbav" style={{background:u.avatar_url?'transparent':col}}>{u.avatar_url?<img src={u.avatar_url} alt=""/>:ini(u.username)}</div><div className="lbin"><div className="lbnm">{u.username}{isMe&&<span style={{fontSize:9,color:'var(--pu2)',marginLeft:4}}>(you)</span>}</div><div className="lbtt">{(u.tiktok_handles||[]).slice(0,2).join(' · ')}</div></div><div className="lbrt"><div className="lbxp">{(u.xp||0).toLocaleString()}</div><div className="lblv">Lvl {ulv.level}</div></div></div>);};

  if(loading)return(<><style>{`
body,html{margin:0;padding:0;background:#0d0d0e;}
#root{background:#0d0d0e;}
.spin-el{width:28px;height:28px;border-radius:50%;border:3px solid #22223d;border-top-color:#c9a24b;animation:sp .8s linear infinite;}
@keyframes sp{to{transform:rotate(360deg)}}
`}</style><div style={{background:"#0d0d0e",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:22}}><img src="/hollen-rewards-logo.png" alt="Hollen" style={{width:180,opacity:.85,filter:'invert(1)'}} onError={e=>{e.target.style.display='none';}}/><div className="spin-el"/></div></>);

  // Password reset modals — rendered in both the auth screen (when not signed in)
  // and the main app (when signed in via PASSWORD_RECOVERY) so the user always sees
  // the prompt regardless of which side of the auth gate they're on.
  const PwModals=(<>
    {showResetPw&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'18px',backdropFilter:'blur(4px)'}}>
        <div style={{width:'100%',maxWidth:380,background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:16,padding:'24px 22px',position:'relative'}}>
          <button onClick={()=>{setShowResetPw(false);setResetPw('');setResetPw2('');}} style={{position:'absolute',top:12,right:12,width:30,height:30,borderRadius:'50%',background:'var(--card2)',border:'1px solid var(--bo)',color:'var(--tx3)',fontSize:14,cursor:'pointer'}}>✕</button>
          <div style={{fontFamily:'var(--fh)',fontSize:22,letterSpacing:2,marginBottom:6,color:'var(--pu2)'}}>🔐 CHANGE PASSWORD</div>
          <div style={{fontSize:12,color:'var(--tx3)',marginBottom:16,lineHeight:1.5}}>Pick a new password for your account. You'll stay signed in after saving.</div>
          <div style={{marginBottom:10}}><label className="lbl">New password</label><input className="inp" type="password" value={resetPw} onChange={e=>setResetPw(e.target.value)} placeholder="••••••••" autoFocus/></div>
          <div style={{marginBottom:14}}><label className="lbl">Confirm password</label><input className="inp" type="password" value={resetPw2} onChange={e=>setResetPw2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submitResetPw()}/></div>
          <button className="btn btnpu" onClick={submitResetPw} disabled={resetBusy}>{resetBusy?'SAVING...':'SAVE PASSWORD'}</button>
        </div>
      </div>
    )}
    {showForgotPw&&(
      <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'18px',backdropFilter:'blur(4px)'}}>
        <div style={{width:'100%',maxWidth:380,background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:16,padding:'24px 22px',position:'relative'}}>
          <button onClick={()=>{setShowForgotPw(false);setForgotStep('email');setForgotCode('');setResetPw('');setResetPw2('');}} style={{position:'absolute',top:12,right:12,width:30,height:30,borderRadius:'50%',background:'var(--card2)',border:'1px solid var(--bo)',color:'var(--tx3)',fontSize:14,cursor:'pointer'}}>✕</button>
          {forgotStep==='email'?(<>
            <div style={{fontFamily:'var(--fh)',fontSize:22,letterSpacing:2,marginBottom:6,color:'var(--pu2)'}}>📧 FORGOT PASSWORD</div>
            <div style={{fontSize:12,color:'var(--tx3)',marginBottom:16,lineHeight:1.5}}>Enter the email you used to sign up — we'll email you an 8-digit code.</div>
            <div style={{marginBottom:14}}><label className="lbl">Email</label><input className="inp" type="email" value={forgotEmail} onChange={e=>setForgotEmail(e.target.value)} placeholder="your@email.com" autoFocus onKeyDown={e=>e.key==='Enter'&&submitForgotPw()}/></div>
            <button className="btn btnpu" onClick={submitForgotPw} disabled={forgotBusy}>{forgotBusy?'SENDING...':'SEND CODE'}</button>
          </>):(<>
            <div style={{fontFamily:'var(--fh)',fontSize:22,letterSpacing:2,marginBottom:6,color:'var(--pu2)'}}>🔐 ENTER YOUR CODE</div>
            <div style={{fontSize:12,color:'var(--tx3)',marginBottom:16,lineHeight:1.5}}>Check <strong style={{color:'var(--tx)'}}>{forgotEmail}</strong> for an 8-digit code, then choose a new password.</div>
            <div style={{marginBottom:10}}><label className="lbl">8-digit code</label><input className="inp" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={forgotCode} onChange={e=>setForgotCode(e.target.value.replace(/\D/g,''))} placeholder="••••••••" autoFocus style={{fontFamily:'var(--fh)',fontSize:18,letterSpacing:6,textAlign:'center'}}/></div>
            <div style={{marginBottom:10}}><label className="lbl">New password</label><input className="inp" type="password" value={resetPw} onChange={e=>setResetPw(e.target.value)} placeholder="••••••••"/></div>
            <div style={{marginBottom:14}}><label className="lbl">Confirm password</label><input className="inp" type="password" value={resetPw2} onChange={e=>setResetPw2(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&submitForgotCode()}/></div>
            <button className="btn btnpu" onClick={submitForgotCode} disabled={forgotBusy}>{forgotBusy?'SAVING...':'RESET PASSWORD'}</button>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:12,fontSize:11}}>
              <button onClick={()=>{setForgotStep('email');setForgotCode('');setResetPw('');setResetPw2('');}} style={{background:'none',border:'none',color:'var(--tx3)',cursor:'pointer',padding:'4px',fontFamily:'var(--fb)'}}>← Different email</button>
              <button onClick={submitForgotPw} disabled={forgotBusy} style={{background:'none',border:'none',color:'var(--pu2)',cursor:'pointer',padding:'4px',fontFamily:'var(--fb)',textDecoration:'underline'}}>Resend code</button>
            </div>
          </>)}
        </div>
      </div>
    )}
  </>);

  if(!profile)return(<><style>{CSS}</style><div className="authwrap"><img src="/hollen-rewards-logo.png" alt="Hollen" style={{width:220,marginBottom:8,filter:'invert(1)'}} onError={e=>{e.target.style.display='none';}}/><div className="asub">Rewards Platform</div><div className="abox"><div className="tabs"><button className={`tab${authTab==='login'?' on':''}`} onClick={()=>{setAuthTab('login');setAuthErr('');}}>Sign In</button><button className={`tab${authTab==='signup'?' on':''}`} onClick={()=>{setAuthTab('signup');setAuthErr('');}}>Join Up</button></div>{authTab==='login'?(<div className="fg"><div><label className="lbl">Email</label><input className="inp" value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="your@email.com" type="email"/></div><div><label className="lbl">Password</label><input className="inp" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin()}/></div><button className="btn btnpu" onClick={doLogin} disabled={authLoading}>{authLoading?'...':'SIGN IN'}</button><div className="ferr">{authErr}</div><button onClick={()=>{setForgotEmail(loginUser);setShowForgotPw(true);}} style={{background:'none',border:'none',color:'var(--pu2)',fontSize:12,cursor:'pointer',padding:'6px 4px 0',fontFamily:'var(--fb)',textDecoration:'underline',alignSelf:'center'}}>Forgot password?</button></div>):(<div className="fg"><div><label className="lbl">Username</label><input className="inp" value={signupUser} onChange={e=>setSignupUser(e.target.value)} placeholder="pick a username"/></div><div><label className="lbl">Email</label><input className="inp" type="email" value={signupEmail} onChange={e=>setSignupEmail(e.target.value)} placeholder="your@email.com"/></div><div><label className="lbl">Password</label><input className="inp" type="password" value={signupPass} onChange={e=>setSignupPass(e.target.value)} placeholder="create a password"/></div><div><label className="lbl">TikTok @handle(s)</label><div style={{display:'flex',flexDirection:'column',gap:5}}>{handles.map((h,i)=>(<div key={i} className="trow"><input className="inp" value={h} onChange={e=>{const n=[...handles];n[i]=e.target.value;setHandles(n);}} placeholder="@yourhandle"/>{handles.length>1&&<button className="icobtn" onClick={()=>setHandles(handles.filter((_,j)=>j!==i))}>✕</button>}</div>))}</div><button className="addtt" onClick={()=>setHandles([...handles,''])}>+ Add another @</button></div><div><label className="lbl">Referral code (optional)</label><input className="inp" value={signupRef} onChange={e=>setSignupRef(e.target.value.toUpperCase())} placeholder="e.g. ABC12345"/></div><button className="btn btnpu" onClick={doSignup} disabled={authLoading}>{authLoading?'...':'CREATE ACCOUNT'}</button><div className="ferr">{authErr}</div></div>)}</div><div className="toastwrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>{PwModals}</div></>);

  // ── Bottom-nav model + iOS liquid-glass drag interaction ──────────────────
  const bnavItems=[['home','🏠','Home'],['rewards','🎁','Rewards'],['lb','🏆','Rankings'],['referrals','💸','Refer'],['profile','👤','Profile',['profile','products']]];
  if(adminUnlocked)bnavItems.push(['admin','👑','Admin']);
  const navActiveIdx=Math.max(0,bnavItems.findIndex(([pg,,,activeOn])=>(activeOn||[pg]).includes(page)));
  const navHot=navDragging?navHotIdx:navActiveIdx;
  // Map a clientX onto the nav: which cell it's over plus geometry for the blob.
  const navGeom=clientX=>{
    const r=bnavRef.current.getBoundingClientRect();const pad=6;const inner=r.width-pad*2;const cw=inner/bnavItems.length;
    const x=clientX-r.left;let i=Math.floor((x-pad)/cw);i=Math.max(0,Math.min(bnavItems.length-1,i));
    return{i,cw,pad,inner,x};
  };
  const navMove=(clientX,initial)=>{
    const{i,cw,pad,inner,x}=navGeom(clientX);setNavHotIdx(i);
    const v=clientX-navLastXRef.current;navLastXRef.current=clientX;
    // Velocity → horizontal stretch / vertical squish for the liquid wobble.
    const sx=initial?1:Math.min(1.4,1+Math.abs(v)*0.02);
    const sy=initial?1:Math.max(0.78,1-Math.abs(v)*0.013);
    const w=cw-2;let left=x-w/2;left=Math.max(pad+1,Math.min(left,pad+inner-w-1));
    setNavIndPx({left,width:w,sx,sy});
  };
  const navDown=e=>{draggingRef.current=true;setNavDragging(true);navLastXRef.current=e.clientX;navMove(e.clientX,true);try{bnavRef.current.setPointerCapture(e.pointerId);}catch{}};
  const navMoveEvt=e=>{if(draggingRef.current)navMove(e.clientX,false);};
  const navUp=e=>{if(!draggingRef.current)return;draggingRef.current=false;setNavDragging(false);const{i}=navGeom(e.clientX);setNavHotIdx(null);setNavIndPx(null);navTo(bnavItems[i][0]);};
  const navInd=bnavItems.length;
  const navIndStyle=navDragging&&navIndPx?{left:navIndPx.left+'px',width:navIndPx.width+'px',transform:`scaleX(${navIndPx.sx}) scaleY(${navIndPx.sy})`,transition:'transform .16s ease'}:{left:`calc(6px + ${navHot} * ((100% - 12px)/${navInd}) + 1px)`,width:`calc((100% - 12px)/${navInd} - 2px)`,transform:'none'};
  return(<><style>{CSS}</style><div className="app" style={isDesktop?{flexDirection:'row'}:{}}>
    {/* DESKTOP SIDEBAR */}
    {isDesktop&&(<div style={{width:220,minWidth:220,height:'100dvh',background:'var(--bg2)',borderRight:'1px solid var(--bo2)',display:'flex',flexDirection:'column',flexShrink:0,zIndex:10}}>
      {lastUpdated&&<div style={{background:'rgba(201,162,75,.1)',borderBottom:'1px solid rgba(201,162,75,.2)',padding:'7px 16px',display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:10,color:'var(--pu2)'}}>●</span>
        <div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.4}}>Updated by <strong style={{color:'var(--tx2)'}}>{lastUpdated.user}</strong><br/>{new Date(lastUpdated.time).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'})} at {new Date(lastUpdated.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>}
      <div style={{padding:'22px 16px 20px',borderBottom:'1px solid var(--bo)'}}>
        <img src="/hollen-rewards-logo.png" alt="Hollen Rewards" style={{width:'100%',maxWidth:150,display:'block',filter:'invert(1)'}} onError={e=>{e.target.style.display='none';e.target.nextSibling.style.display='block';}}/>
        <div style={{display:'none'}}>
          <div style={{fontFamily:'var(--fh)',fontSize:28,fontWeight:800,letterSpacing:-0.5,lineHeight:1}}>hollen</div>
          <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:2,textTransform:'uppercase',marginTop:6,fontWeight:500}}>Rewards</div>
        </div>
      </div>
      <div style={{flex:1,padding:'8px',overflowY:'auto'}}>
        {[['home','🏠','Home'],['rewards','🎁','Rewards'],['lb','🏆','Rankings'],['products','📦','Products'],['referrals','👥','Refer'],['profile','👤','Profile']].map(([pg,icon,label])=>(
          <button key={pg} onClick={()=>navTo(pg)} style={{width:'100%',display:'flex',alignItems:'center',gap:11,padding:'10px 14px',background:page===pg?'rgba(201,162,75,.15)':'transparent',border:'none',color:page===pg?'var(--pu2)':'var(--tx2)',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'var(--fb)',textAlign:'left',borderRadius:'var(--rsm)'}}>
            <span style={{fontSize:17}}>{icon}</span>{label}
          </button>
        ))}
        {adminUnlocked&&<button onClick={()=>navTo('admin')} style={{width:'100%',display:'flex',alignItems:'center',gap:11,padding:'10px 14px',background:page==='admin'?'rgba(201,162,75,.15)':'transparent',border:'none',color:page==='admin'?'var(--pu2)':'var(--tx2)',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'var(--fb)',textAlign:'left',borderRadius:'var(--rsm)'}}>
          <span style={{fontSize:17}}>👑</span>Admin
        </button>}
      </div>
      <div style={{padding:'14px 16px',borderTop:'1px solid var(--bo)',display:'flex',alignItems:'center',gap:10}}>
        <div className="av" style={{background:avc(profile.username),color:'#fff',flexShrink:0}} onClick={()=>navTo('profile')}>{profile.avatar_url?<img src={profile.avatar_url} alt=""/>:ini(profile.username)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{profile.username}</div>
          <div style={{fontSize:10,color:'var(--tx3)'}}>{(profile.xp||0).toLocaleString()} XP · Lv{getLv(profile.xp,LEVELS).level}</div>
        </div>
        <div className="streak-pill" style={{fontSize:11,padding:'2px 7px'}} onClick={()=>setShowDaily(true)}>🔥 {profile.streak||0}</div>
      </div>
    </div>)}
    {/* MOBILE TOPBAR */}
    {!isDesktop&&lastUpdated&&(<div className="upd-banner">
      <span style={{fontSize:10,color:'var(--pu2)'}}>●</span>
      <span style={{fontSize:10,color:'var(--tx3)'}}>Data last updated by <strong style={{color:'var(--tx2)'}}>{lastUpdated.user}</strong> on {new Date(lastUpdated.time).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'})} at {new Date(lastUpdated.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>
    </div>)}
    {!isDesktop&&<div className={`topbar${lastUpdated?' no-st':''}`}>
      <img src="/hollen-rewards-logo.png" alt="Hollen" style={{height:22,filter:'invert(1)'}} onError={e=>{e.target.style.display='none';}}/>
      <div className="tr">
        <div className="streak-pill" onClick={()=>setShowDaily(true)}>🔥 {profile.streak||0}</div>
        <div className="xpchip" onClick={()=>navTo("level")} style={{cursor:"pointer"}}>{(profile.xp||0).toLocaleString()} XP · Lv{lv.level}</div>
        <div className="av" style={{background:profile.avatar_url?'transparent':avc(profile.username),color:'#fff'}} onClick={()=>navTo('profile')}>
          {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:ini(profile.username)}
        </div>
      </div>
    </div>}

    <div className="pages" style={isDesktop?{flex:1,overflowY:'auto',paddingBottom:0,minWidth:0}:{}}>
      <div style={isDesktop?{maxWidth:page==='admin'?1320:700,margin:'0 auto'}:{}}>
      {/* HOME */}
      {page==='home'&&(()=>{
        const now=new Date();const hour=now.getHours();
        const greeting=hour<12?'Good morning':hour<18?'Good afternoon':'Good evening';
        const dateStr=now.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'});
        const rankIx=leaderboard.findIndex(u=>u.id===profile?.id);
        const rank=rankIx>=0?rankIx+1:null;
        const rangeLabel=dateRange==='yesterday'?'Yesterday':dateRange==='7d'?'Last 7 days':dateRange==='30d'?'Last 30 days':dateRange==='month'?new Date(selectedMonth+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}):dateRange==='custom'&&customStart&&customEnd?`${new Date(customStart).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} — ${new Date(customEnd).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`:'All time';
        const deltaPct=(cur,prev)=>{if(!isFiltered||!prev)return null;const d=cur-prev;const pct=prev===0?0:(d/Math.abs(prev))*100;return{d,pct,up:d>0,dn:d<0};};
        const netDelta=deltaPct(filteredNet,prevNet);
        const commDelta=deltaPct(filteredComm,prevComm);
        const ordersDelta=deltaPct(filteredOrders,prevOrders);
        const aovDelta=deltaPct(filteredAOV,prevAOV);
        const unitsDelta=deltaPct(filteredUnits,prevUnits);
        const Trend=({d,fmt})=>{if(!d)return null;return(<span style={{fontSize:11,color:d.up?'var(--gr)':d.dn?'var(--re)':'var(--tx3)',fontWeight:500,marginLeft:6,fontVariantNumeric:'tabular-nums'}}>{d.up?'↗':d.dn?'↘':'→'} {fmt?fmt(Math.abs(d.d)):Math.abs(Math.round(d.pct))+'%'}</span>);};
        return(<div className="pg" style={{maxWidth:isDesktop?960:'100%',margin:'0 auto',paddingTop:isDesktop?18:13}}>
          {/* GREETING */}
          <div style={{marginBottom:22,paddingBottom:18,borderBottom:'1px solid var(--bo)'}}>
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
              <div style={{minWidth:0}}>
                <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?26:22,fontWeight:700,letterSpacing:-0.5,color:'var(--tx)',lineHeight:1.15}}>{greeting}, {profile.username||'creator'}</div>
                <div style={{fontSize:12,color:'var(--tx3)',marginTop:5,letterSpacing:.15}}>{dateStr}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:16,flexShrink:0}}>
                {profile.streak>0&&<div onClick={()=>setShowDaily(true)} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6}}>
                  <span style={{fontSize:15}}>🔥</span>
                  <div style={{lineHeight:1}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:16,fontWeight:700,color:'var(--tx)',fontVariantNumeric:'tabular-nums'}}>{profile.streak}</div>
                    <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:3}}>Streak</div>
                  </div>
                </div>}
                {rank&&<div onClick={()=>navTo('lb')} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6,borderLeft:'1px solid var(--bo)',paddingLeft:16}}>
                  <div style={{lineHeight:1}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:16,fontWeight:700,color:'var(--tx)',fontVariantNumeric:'tabular-nums'}}>#{rank}</div>
                    <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:3}}>Rank</div>
                  </div>
                </div>}
                <div onClick={()=>navTo('level')} style={{cursor:'pointer',display:'flex',alignItems:'center',gap:6,borderLeft:'1px solid var(--bo)',paddingLeft:16}}>
                  <div style={{lineHeight:1}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:16,fontWeight:700,color:'var(--go)',fontVariantNumeric:'tabular-nums'}}>{lv.level}</div>
                    <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:3}}>Level</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* PRIMARY METRIC — Net GMV */}
          <div style={{marginBottom:26}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500}}>Net GMV</div>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:.3}}>{rangeLabel}</div>
            </div>
            <button onClick={()=>setGrossOpen(!grossOpen)} style={{display:'block',background:'none',border:'none',padding:0,width:'100%',textAlign:'left',cursor:'pointer',color:'inherit',font:'inherit'}}>
              <div style={{display:'flex',alignItems:'baseline',gap:12,flexWrap:'wrap'}}>
                <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?56:44,fontWeight:700,letterSpacing:-1.5,color:filteredNet<0?'var(--re)':'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{filteredNet<0?'−'+fmtGBP(-filteredNet):fmtGBP(filteredNet)}</div>
                {netDelta&&<div style={{fontSize:13,color:netDelta.up?'var(--gr)':netDelta.dn?'var(--re)':'var(--tx3)',fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{netDelta.up?'↗':netDelta.dn?'↘':'→'} {fmtGBP(Math.abs(netDelta.d))}</div>}
                <span style={{fontSize:11,color:'var(--tx3)',marginLeft:'auto',opacity:.6,transition:'transform .15s',display:'inline-block',transform:grossOpen?'rotate(180deg)':'none'}}>▼</span>
              </div>
            </button>
            {grossOpen&&(
              <div style={{marginTop:14,padding:'14px 16px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:10}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingBottom:10,borderBottom:'1px solid var(--bo)'}}>
                  <span style={{fontSize:12,color:'var(--tx2)'}}>Gross GMV</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,fontWeight:600,color:'var(--gr)',fontVariantNumeric:'tabular-nums'}}>{fmtGBP(filteredGMVGross)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid var(--bo)'}}>
                  <span style={{fontSize:12,color:'var(--tx2)'}}>Returns <span style={{color:'var(--tx3)',fontSize:11}}>· {filteredCancelled} unit{filteredCancelled===1?'':'s'}</span></span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,fontWeight:600,color:'var(--re)',fontVariantNumeric:'tabular-nums'}}>−{fmtGBP(filteredCancelledGMV)}</span>
                </div>
                <div style={{fontSize:11,color:'var(--tx3)',marginTop:10,lineHeight:1.5}}>Returns are counted on the day the parcel ships back — not the original sale date. Net GMV can dip below gross in short windows.</div>
              </div>
            )}
          </div>

          {/* DATE FILTER — subtle text-link row, not chunky buttons */}
          <div style={{display:'flex',gap:0,marginBottom:24,borderBottom:'1px solid var(--bo)',flexWrap:'wrap'}}>
            {[['yesterday','Yesterday'],['7d','7 days'],['30d','30 days'],['month','Month'],['all','All time'],['custom','Custom']].map(([val,label])=>(
              <button key={val} onClick={()=>setDateRange(val)} style={{padding:'8px 14px',background:'none',border:'none',borderBottom:`2px solid ${dateRange===val?'var(--pu)':'transparent'}`,color:dateRange===val?'var(--tx)':'var(--tx3)',fontSize:12,fontWeight:dateRange===val?600:500,cursor:'pointer',transition:'all .15s',marginBottom:-1,letterSpacing:.15}}>{label}</button>
            ))}
            {dateRange==='month'&&<input type='month' value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{padding:'5px 10px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',marginLeft:10,alignSelf:'center'}}/>}
            {dateRange==='custom'&&(<>
              <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{padding:'5px 8px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',marginLeft:10,alignSelf:'center'}}/>
              <span style={{fontSize:11,color:'var(--tx3)',alignSelf:'center',padding:'0 6px'}}>→</span>
              <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{padding:'5px 8px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',alignSelf:'center'}}/>
            </>)}
          </div>

          {/* KPI GRID — 4 clean cells, single border container */}
          <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(4,1fr)':'repeat(2,1fr)',border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',marginBottom:26,background:'var(--card)'}}>
            {[
              {label:'Commission',val:fmtGBP(filteredComm),d:commDelta,fmt:fmtGBP},
              {label:'Orders',val:filteredOrders.toLocaleString(),d:ordersDelta,fmt:v=>Math.round(v).toLocaleString()},
              {label:'Avg order value',val:filteredAOV>0?fmtGBP(filteredAOV):'£0.00',d:aovDelta,fmt:fmtGBP},
              {label:'Units sold',val:filteredUnits.toLocaleString(),d:unitsDelta,fmt:v=>Math.round(v).toLocaleString()},
            ].map((s,i)=>(
              <div key={i} style={{padding:'18px 18px 20px',borderRight:isDesktop?(i<3?'1px solid var(--bo)':'none'):(i%2===0?'1px solid var(--bo)':'none'),borderBottom:isDesktop?'none':(i<2?'1px solid var(--bo)':'none')}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:500,marginBottom:8}}>{s.label}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:22,fontWeight:700,letterSpacing:-0.4,color:'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{s.val}</div>
                <div style={{marginTop:8,minHeight:14}}>
                  <Trend d={s.d} fmt={s.fmt}/>
                </div>
              </div>
            ))}
          </div>

          {/* CHART */}
          <div style={{marginBottom:26}}>
            <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:12}}>GMV & Commission</div>
            <MiniChart xpEvents={filteredEvents} />
          </div>

          {/* TOP PRODUCTS */}
          <div style={{marginBottom:26}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:12}}>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500}}>Top products</div>
              <button onClick={()=>navTo('products')} style={{background:'none',border:'none',color:'var(--tx3)',fontSize:11,cursor:'pointer',padding:0,letterSpacing:.15}}>View all →</button>
            </div>
            {(()=>{const list=isFiltered?filteredProducts.slice(0,3):topProducts;
              if(list.length===0)return(
                <div style={{padding:'24px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,textAlign:'center'}}>
                  <div style={{fontSize:13,color:'var(--tx2)',marginBottom:4,fontWeight:500}}>No product data yet</div>
                  <div style={{fontSize:11,color:'var(--tx3)'}}>Your top products will appear here after your first import.</div>
                </div>
              );
              return(<div style={{border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',background:'var(--card)'}}>{list.map((tp,i)=>{const prod=products.find(p=>p.name===tp.product_name);return(
                <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 16px',borderBottom:i<list.length-1?'1px solid var(--bo)':'none'}}>
                  {prod?.image_url?<img src={prod.image_url} alt="" style={{width:44,height:44,borderRadius:8,objectFit:'cover',flexShrink:0}}/>:<div style={{width:44,height:44,borderRadius:8,background:'var(--card2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0,color:'var(--tx3)'}}>📦</div>}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:.1}}>{tp.product_name||'Unknown product'}</div>
                    <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{(tp.sales||0).toLocaleString()} unit{(tp.sales||0)===1?'':'s'} sold</div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:15,fontWeight:700,color:'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(tp.gmv||0)}</div>
                    <div style={{fontSize:10.5,color:'var(--go)',marginTop:4,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(tp.commission||0)} comm</div>
                  </div>
                </div>
              );})}</div>);
            })()}
          </div>

          {/* REFERRAL EARNINGS — subtle inline row */}
          {(()=>{const ltNet=Math.max(0,referralStats.reduce((s,r)=>s+(r.total_gmv||0),0)-referralStats.reduce((s,r)=>s+(r.total_cancelled_gmv||0),0));const earn=parseFloat((ltNet*0.01).toFixed(2));return earn>0&&(
            <div onClick={()=>navTo('referrals')} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px 16px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,cursor:'pointer',marginBottom:26}}>
              <div>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:500,marginBottom:4}}>Referral earnings</div>
                <div style={{fontFamily:'var(--fh)',fontSize:20,fontWeight:700,letterSpacing:-0.4,color:'var(--tx)',fontVariantNumeric:'tabular-nums'}}>{fmtGBP(earn)}</div>
              </div>
              <span style={{fontSize:14,color:'var(--tx3)'}}>→</span>
            </div>
          );})()}

          {/* NEXT REWARD — editorial preview at bottom, not the hero */}
          {(()=>{
            const nextRw=rewards.find(r=>!profile||profile.xp<r.xp_required);
            const prevRw=nextRw?rewards[rewards.indexOf(nextRw)-1]:rewards[rewards.length-1];
            const startXP=prevRw?prevRw.xp_required:0;
            const endXP=nextRw?nextRw.xp_required:lv.max;
            const prog=nextRw?Math.min(100,Math.round(((profile.xp-startXP)/(endXP-startXP))*100)):100;
            const r=nextRw||rewards[rewards.length-1];
            if(!r)return null;
            return(
              <div onClick={()=>navTo('rewards')} style={{display:'flex',alignItems:'center',gap:16,padding:'16px 18px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,cursor:'pointer',marginBottom:20}}>
                <div style={{width:56,height:56,borderRadius:10,background:'var(--card2)',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--bo)'}}>
                  {r?.image_url?<img src={r.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<span style={{fontSize:22,opacity:.4}}>🎁</span>}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:8,gap:8,flexWrap:'wrap'}}>
                    <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:500}}>Next reward</div>
                    <div style={{fontSize:11,color:'var(--tx3)',fontVariantNumeric:'tabular-nums'}}>{nextRw?`${(endXP-profile.xp).toLocaleString()} XP to go`:'All unlocked'}</div>
                  </div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',marginBottom:8,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:.1}}>{r?.name&&r.name!==`Reward ${r?.level}`?r.name:`Level ${r?.level} Reward`}</div>
                  <div style={{height:3,background:'var(--bo)',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,background:'var(--pu)',width:`${prog}%`,transition:'width 1s ease'}}/>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>);
      })()}

      {/* LEVEL REWARDS (Battle Pass) */}
      {page==='rewards'&&(()=>{
        const now=new Date();
        const m1=new Date(now.getFullYear(),now.getMonth()-1,1).toLocaleDateString('en-GB',{month:'long'});
        const m1pay=new Date(now.getFullYear(),now.getMonth(),15).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        const m2=new Date(now.getFullYear(),now.getMonth(),1).toLocaleDateString('en-GB',{month:'long'});
        const m2pay=new Date(now.getFullYear(),now.getMonth()+1,15).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        const myUnlocks=computeUnlockDates(xpEvents,rewards);
        const myRedeemed=redeemedLevelsFor(profile);
        return(<div className="pg" style={{maxWidth:isDesktop?960:'100%',margin:'0 auto',paddingTop:isDesktop?18:13}}>
          {/* HEADER */}
          <div style={{marginBottom:24,paddingBottom:20,borderBottom:'1px solid var(--bo)',display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?28:23,fontWeight:700,letterSpacing:-0.6,color:'var(--tx)',lineHeight:1.1}}>Rewards</div>
              <div style={{fontSize:12,color:'var(--tx3)',marginTop:6,letterSpacing:.15,fontVariantNumeric:'tabular-nums'}}>Level {lv.level} · {(profile.xp||0).toLocaleString()} XP{nx?` · ${(nx.min-profile.xp).toLocaleString()} to next`:''}</div>
            </div>
            {nx&&<div style={{minWidth:isDesktop?220:170}}>
              <div style={{fontSize:9.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1.4,marginBottom:7,fontWeight:600,textAlign:'right'}}>Level progress</div>
              <div style={{height:3,background:'var(--bo)',borderRadius:99,overflow:'hidden'}}>
                <div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg, var(--go), var(--pu))',width:`${pct}%`,transition:'width 1s ease'}}/>
              </div>
              <div style={{fontSize:10.5,color:'var(--tx3)',marginTop:6,textAlign:'right',fontVariantNumeric:'tabular-nums',fontWeight:500}}>{(profile.xp||0).toLocaleString()} / {nx.min.toLocaleString()}</div>
            </div>}
          </div>

          {/* PAID ON THE 15TH — subtle gold hairline at the top */}
          <div style={{padding:'18px 20px',background:'var(--card)',border:'1px solid var(--bo)',borderTop:'1.5px solid var(--go)',borderRadius:12,marginBottom:12}}>
            <div style={{display:'flex',alignItems:'flex-start',gap:14}}>
              <div style={{fontFamily:'var(--fh)',fontSize:22,fontWeight:800,letterSpacing:-1,color:'var(--go)',lineHeight:1,marginTop:2,flexShrink:0}}>15</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:'var(--fh)',fontSize:14.5,fontWeight:700,color:'var(--tx)',letterSpacing:.1,marginBottom:3}}>Paid on the 15th</div>
                <div style={{fontSize:12,color:'var(--tx3)',lineHeight:1.55}}>Rewards ship on the 15th of the month after you unlock them.</div>
                <div style={{display:'flex',flexDirection:isDesktop?'row':'column',gap:isDesktop?22:5,fontSize:11.5,color:'var(--tx2)',marginTop:12,paddingTop:12,borderTop:'1px solid var(--bo)',fontVariantNumeric:'tabular-nums'}}>
                  <div>Unlock in <strong style={{color:'var(--tx)',fontWeight:600}}>{m1}</strong> · paid <strong style={{color:'var(--gr)',fontWeight:600}}>{m1pay}</strong></div>
                  <div>Unlock in <strong style={{color:'var(--tx)',fontWeight:600}}>{m2}</strong> · paid <strong style={{color:'var(--gr)',fontWeight:600}}>{m2pay}</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* CASH SWAP — subtle one-liner */}
          <div style={{padding:'14px 20px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,marginBottom:24,fontSize:12.5,color:'var(--tx2)',lineHeight:1.5}}>
            Prefer cash? Swap any reward for <strong style={{color:'var(--gr)',fontWeight:600}}>80% of its value</strong>. Contact Hollen for the exact amount.
          </div>

          {/* REWARDS LIST — refined editorial rows */}
          <div style={{fontSize:10.5,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:600,marginBottom:14,paddingLeft:2}}>All rewards</div>
          <div style={{border:'1px solid var(--bo)',borderRadius:14,overflow:'hidden',background:'var(--card)'}}>
            {rewards.map((r,i)=>{
              const un=profile.xp>=r.xp_required;
              const isCur=!un&&(i===0||profile.xp>=rewards[i-1]?.xp_required);
              const prog=Math.min(100,Math.round((profile.xp/r.xp_required)*100));
              const need=Math.max(0,r.xp_required-profile.xp);
              const delivered=un&&myRedeemed.has(r.level);
              const waited=un?daysSince(myUnlocks[r.level]):null;
              const status=delivered?{label:'Delivered',color:'var(--gr)',dot:'var(--gr)'}:un?{label:'Unlocked',color:'var(--go)',dot:'var(--go)'}:isCur?{label:'In progress',color:'var(--tx2)',dot:'var(--tx2)'}:{label:'Locked',color:'var(--tx3)',dot:'var(--tx3)'};
              let dueChip=null;
              if(un&&myUnlocks[r.level]&&!delivered){
                const due=payoutDueDate(myUnlocks[r.level]);
                if(due){
                  const daysLeft=daysUntil(due);
                  const overdue=due.getTime()<Date.now();
                  dueChip={label:overdue?`Overdue · ${fmtDueDate(due)}`:daysLeft===0?'Ships today':daysLeft===1?'Ships tomorrow':`Ships ${fmtDueDate(due)}`,color:overdue?'var(--re)':'var(--tx2)'};
                }
              }else if(delivered&&waited!=null){
                dueChip={label:`Unlocked ${waited}d ago`,color:'var(--tx3)'};
              }
              return(
                <div key={r.id} onClick={()=>setShowReward(r)} style={{display:'flex',alignItems:'center',gap:isDesktop?18:14,padding:isDesktop?'20px 22px':'16px 16px',borderBottom:i<rewards.length-1?'1px solid var(--bo)':'none',cursor:'pointer',opacity:un||isCur?1:.7,transition:'background .15s',background:isCur?'rgba(201,162,75,.03)':'transparent',position:'relative'}}>
                  {/* Left accent line for in-progress tier */}
                  {isCur&&<div style={{position:'absolute',left:0,top:0,bottom:0,width:2,background:'var(--go)'}}/>}
                  {/* Thumbnail — bigger, cleaner */}
                  <div style={{width:isDesktop?84:68,height:isDesktop?84:68,borderRadius:12,background:'var(--card2)',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
                    {r.image_url?<img src={r.image_url} alt={r.name} style={{width:'100%',height:'100%',objectFit:'contain',padding:'10%',filter:un||isCur?'none':'grayscale(60%) brightness(.75)'}}/>:<span style={{fontSize:28,opacity:.4}}>🎁</span>}
                  </div>
                  {/* Body */}
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:5,flexWrap:'wrap'}}>
                      <span style={{fontFamily:'var(--fh)',fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1.5,fontWeight:700}}>Level {r.level}</span>
                      <span style={{width:3,height:3,borderRadius:'50%',background:'var(--tx3)',opacity:.4}}/>
                      <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10.5,color:status.color,fontWeight:600,letterSpacing:.3,fontFamily:'var(--fb)'}}>
                        <span style={{width:5,height:5,borderRadius:'50%',background:status.dot}}/>
                        {status.label}
                      </span>
                    </div>
                    <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?17:15,fontWeight:700,color:'var(--tx)',marginBottom:6,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:-0.1,lineHeight:1.25}}>{r.name&&r.name!==`Level ${r.level} Reward`?r.name:`Level ${r.level} Reward`}</div>
                    <div style={{display:'flex',alignItems:'center',gap:10,fontSize:11.5,color:'var(--tx3)',fontVariantNumeric:'tabular-nums',flexWrap:'wrap'}}>
                      <span style={{fontWeight:500}}>{r.xp_required.toLocaleString()} XP</span>
                      {isCur&&<>
                        <span style={{opacity:.4}}>·</span>
                        <span style={{color:'var(--go)',fontWeight:600}}>{need.toLocaleString()} to go</span>
                      </>}
                      {dueChip&&<>
                        <span style={{opacity:.4}}>·</span>
                        <span style={{color:dueChip.color,fontWeight:500}}>{dueChip.label}</span>
                      </>}
                    </div>
                    {isCur&&<div style={{marginTop:10,height:3,background:'var(--bo)',borderRadius:99,overflow:'hidden',maxWidth:isDesktop?360:'100%'}}>
                      <div style={{height:'100%',borderRadius:99,background:'var(--go)',width:`${prog}%`,transition:'width 1s ease'}}/>
                    </div>}
                  </div>
                  <span style={{fontSize:15,color:'var(--tx3)',flexShrink:0,opacity:.5}}>→</span>
                </div>
              );
            })}
          </div>
        </div>);
      })()}

      {/* LEADERBOARD */}
      {page==='lb'&&(()=>{
        const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
        const lb=lbTab==='monthly'?monthlyLeaderboard:leaderboard;
        const isMonthly=lbTab==='monthly';
        const nowDate=new Date();
        const atCurrent=lbMonth.year===nowDate.getFullYear()&&lbMonth.month===nowDate.getMonth();
        const goPrev=()=>{const d=new Date(lbMonth.year,lbMonth.month-1,1);const ny=d.getFullYear(),nm=d.getMonth();setLbMonth({year:ny,month:nm});loadMonthlyLeaderboard(ny,nm);};
        const goNext=()=>{if(atCurrent)return;const d=new Date(lbMonth.year,lbMonth.month+1,1);const ny=d.getFullYear(),nm=d.getMonth();setLbMonth({year:ny,month:nm});loadMonthlyLeaderboard(ny,nm);};
        const myIdx=profile?lb.findIndex(u=>u.id===profile.id):-1;
        return(<div className="pg" style={{maxWidth:isDesktop?960:'100%',margin:'0 auto',paddingTop:isDesktop?18:13}}>
          {/* HEADER */}
          <div style={{marginBottom:18,paddingBottom:16,borderBottom:'1px solid var(--bo)',display:'flex',justifyContent:'space-between',alignItems:'flex-end',gap:12,flexWrap:'wrap'}}>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?26:22,fontWeight:700,letterSpacing:-0.5,color:'var(--tx)',lineHeight:1.15}}>Rankings</div>
              <div style={{fontSize:12,color:'var(--tx3)',marginTop:5,letterSpacing:.15}}>{isMonthly?`${monthNames[lbMonth.month]} ${lbMonth.year} · ${lb.length} creator${lb.length===1?'':'s'}`:`Top ${lb.length} all time`}</div>
            </div>
            {isMonthly&&(
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <button onClick={goPrev} style={{width:28,height:28,borderRadius:6,background:'transparent',border:'1px solid var(--bo)',color:'var(--tx2)',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
                <div style={{fontSize:12,fontWeight:500,color:'var(--tx2)',minWidth:110,textAlign:'center',fontVariantNumeric:'tabular-nums'}}>{monthNames[lbMonth.month]} {lbMonth.year}</div>
                <button onClick={goNext} disabled={atCurrent} style={{width:28,height:28,borderRadius:6,background:'transparent',border:'1px solid var(--bo)',color:atCurrent?'var(--tx3)':'var(--tx2)',fontSize:14,cursor:atCurrent?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',opacity:atCurrent?.35:1}}>›</button>
              </div>
            )}
          </div>

          {/* TABS — same subtle text-tab pattern as home */}
          <div style={{display:'flex',gap:0,marginBottom:20,borderBottom:'1px solid var(--bo)'}}>
            {[['alltime','All time'],['monthly','Monthly']].map(([key,label])=>(
              <button key={key} onClick={()=>setLbTab(key)} style={{padding:'10px 16px',background:'none',border:'none',borderBottom:`2px solid ${lbTab===key?'var(--pu)':'transparent'}`,color:lbTab===key?'var(--tx)':'var(--tx3)',fontSize:12.5,fontWeight:lbTab===key?600:500,cursor:'pointer',marginBottom:-1,letterSpacing:.15}}>{label}</button>
            ))}
          </div>

          {(()=>{
            if(lbLoading&&lb.length===0){
              const skel=(w)=>(<div style={{height:14,width:w,background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>);
              return(<div style={{border:'1px solid var(--bo)',borderRadius:12,background:'var(--card)',overflow:'hidden'}}>
                {[0,1,2,3,4].map(i=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:i<4?'1px solid var(--bo)':'none',opacity:.85-i*0.12}}>
                    <div style={{width:24,height:14,background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                    <div style={{width:36,height:36,borderRadius:'50%',background:'var(--card2)',animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                    <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>{skel('40%')}{skel('25%')}</div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:5}}>{skel(70)}{skel(48)}</div>
                  </div>
                ))}
              </div>);
            }
            if(lb.length===0){
              return(<div style={{padding:'60px 20px',textAlign:'center',border:'1px dashed var(--bo)',borderRadius:12}}>
                <div style={{fontSize:13,color:'var(--tx2)',marginBottom:4,fontWeight:500}}>No rankings yet</div>
                <div style={{fontSize:11.5,color:'var(--tx3)'}}>{isMonthly?'No activity in this month.':'Rankings will appear once creators start earning XP.'}</div>
              </div>);
            }
            return(<>
              {/* YOUR POSITION — subtle gold-tinted callout, no glow */}
              {profile&&(
                myIdx<0?(
                  <div style={{padding:'16px 18px',background:'var(--card)',border:'1px dashed var(--bo)',borderRadius:12,marginBottom:16,fontSize:12,color:'var(--tx2)',textAlign:'center'}}>
                    {isMonthly?"You haven't earned XP this month yet — get selling to appear here.":"You're not ranked yet — start selling to join the leaderboard."}
                  </div>
                ):(()=>{
                  const me=lb[myIdx];const myRank=myIdx+1;const pct=Math.round((myRank/lb.length)*100);
                  return(
                    <div style={{padding:'14px 18px',background:'rgba(201,162,75,.06)',border:'1px solid rgba(201,162,75,.28)',borderRadius:12,marginBottom:16,display:'flex',alignItems:'center',gap:14}}>
                      <div style={{fontFamily:'var(--fh)',fontSize:24,fontWeight:700,letterSpacing:-0.5,color:'var(--go)',lineHeight:1,minWidth:44,fontVariantNumeric:'tabular-nums'}}>#{myRank}</div>
                      <div style={{width:1,alignSelf:'stretch',background:'var(--bo)'}}/>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
                          <span style={{fontSize:13,fontWeight:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{me.username}</span>
                          <span style={{fontSize:9,padding:'2px 8px',background:'rgba(201,162,75,.16)',color:'var(--go)',borderRadius:99,fontWeight:600,letterSpacing:.4,fontFamily:'var(--fb)'}}>You</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--tx3)',fontVariantNumeric:'tabular-nums'}}>Top {pct}% of {lb.length}{isMonthly?` in ${monthNames[lbMonth.month]}`:''}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--fh)',fontSize:15,fontWeight:700,color:'var(--tx)',fontVariantNumeric:'tabular-nums'}}>{(me.xp||0).toLocaleString()}</div>
                        <div style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:3,fontWeight:500}}>XP</div>
                      </div>
                    </div>
                  );
                })()
              )}

              {/* TOP 3 LEADERS — classy editorial strip, no podium, no glow.
                  Three balanced cards side-by-side. Rank 1 gets slightly larger
                  avatar and a subtle gold top-line. Ranks 2 & 3 quieter. */}
              {lb.length>=3&&(
                <div style={{marginBottom:22}}>
                  <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:12}}>Leaders</div>
                  <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:isDesktop?14:8}}>
                    {[lb[0],lb[1],lb[2]].map((u,i)=>{
                      const rank=i+1;
                      const col=avc(u.username);
                      const isMe=u.id===profile?.id;
                      // Muted rank accent colours — deep gold / muted silver / warm bronze.
                      const rankTint=rank===1?'#c9a24b':rank===2?'#a8a8a8':'#a67c52';
                      const avSize=rank===1?(isDesktop?60:52):(isDesktop?48:42);
                      const isFirst=rank===1;
                      return(
                        <div key={u.id} style={{padding:isDesktop?'20px 16px 22px':'16px 12px 18px',background:isFirst?'linear-gradient(180deg, rgba(201,162,75,.06) 0%, var(--card) 100%)':'var(--card)',border:'1px solid var(--bo)',borderRadius:12,borderTop:isFirst?`1.5px solid ${rankTint}`:'1px solid var(--bo)',display:'flex',flexDirection:'column',alignItems:'center',textAlign:'center',position:'relative',minWidth:0}}>
                          <div style={{fontFamily:'var(--fh)',fontSize:11,fontWeight:700,color:rankTint,letterSpacing:1.2,marginBottom:10,fontVariantNumeric:'tabular-nums'}}>#{rank}</div>
                          <div style={{width:avSize,height:avSize,borderRadius:'50%',background:u.avatar_url?'transparent':col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:isFirst?16:13,fontWeight:700,color:'#fff',flexShrink:0,overflow:'hidden',marginBottom:12,border:isFirst?`2px solid ${rankTint}`:'none'}}>
                            {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(u.username)}
                          </div>
                          <div style={{display:'flex',alignItems:'center',gap:5,marginBottom:2,maxWidth:'100%',padding:'0 4px'}}>
                            <span style={{fontSize:isFirst?13.5:12.5,fontWeight:isFirst?700:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',letterSpacing:.1,minWidth:0}}>{u.username}</span>
                            {isMe&&<span style={{fontSize:8.5,padding:'1.5px 6px',background:'rgba(201,162,75,.16)',color:'var(--go)',borderRadius:99,fontWeight:600,letterSpacing:.4,fontFamily:'var(--fb)',flexShrink:0}}>You</span>}
                          </div>
                          <div style={{fontSize:10,color:'var(--tx3)',marginBottom:10,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%',padding:'0 4px'}}>{(u.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
                          <div style={{width:'100%',paddingTop:10,borderTop:'1px solid var(--bo)',display:'flex',justifyContent:'center',gap:isDesktop?16:10,fontVariantNumeric:'tabular-nums'}}>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontFamily:'var(--fh)',fontSize:isFirst?15:13,fontWeight:700,color:'var(--tx)',lineHeight:1}}>{(u.xp||0).toLocaleString()}</div>
                              <div style={{fontSize:8.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:4,fontWeight:500}}>XP</div>
                            </div>
                            <div style={{width:1,background:'var(--bo)'}}/>
                            <div style={{textAlign:'center'}}>
                              <div style={{fontFamily:'var(--fh)',fontSize:isFirst?13:11.5,fontWeight:600,color:'var(--gr)',lineHeight:1}}>{fmtGBP(u.total_gmv||0)}</div>
                              <div style={{fontSize:8.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginTop:4,fontWeight:500}}>GMV</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LEADERBOARD TABLE */}
              <div style={{border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',background:'var(--card)'}}>
                {/* Column headers */}
                <div style={{display:'grid',gridTemplateColumns:'48px 1fr auto auto',gap:14,padding:'10px 18px',borderBottom:'1px solid var(--bo)',background:'var(--card2)',fontSize:9.5,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1.2,fontWeight:600}}>
                  <div>Rank</div>
                  <div>Creator</div>
                  <div style={{textAlign:'right',minWidth:70}}>XP</div>
                  <div style={{textAlign:'right',minWidth:70}}>GMV</div>
                </div>
                {lb.map((u,i)=>{
                  const rank=i+1;
                  const isMe=u.id===profile?.id;
                  const col=avc(u.username);
                  const rankColor=rank<=3?'var(--go)':'var(--tx3)';
                  return(
                    <div key={u.id} style={{display:'grid',gridTemplateColumns:'48px 1fr auto auto',gap:14,padding:'14px 18px',borderBottom:i<lb.length-1?'1px solid var(--bo)':'none',alignItems:'center',background:isMe?'rgba(201,162,75,.05)':'transparent',transition:'background .15s'}}>
                      <div style={{fontFamily:'var(--fh)',fontSize:15,fontWeight:rank<=3?700:500,color:rankColor,fontVariantNumeric:'tabular-nums',letterSpacing:-0.2}}>{rank}</div>
                      <div style={{display:'flex',alignItems:'center',gap:12,minWidth:0}}>
                        <div style={{width:34,height:34,borderRadius:'50%',background:u.avatar_url?'transparent':col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:12,fontWeight:700,color:'#fff',flexShrink:0,overflow:'hidden'}}>
                          {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(u.username)}
                        </div>
                        <div style={{minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:6}}>
                            <span style={{fontSize:13,fontWeight:isMe?700:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.username}</span>
                            {isMe&&<span style={{fontSize:9,padding:'1.5px 7px',background:'rgba(201,162,75,.16)',color:'var(--go)',borderRadius:99,fontWeight:600,letterSpacing:.4,fontFamily:'var(--fb)',flexShrink:0}}>You</span>}
                          </div>
                          <div style={{fontSize:10.5,color:'var(--tx3)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(u.tiktok_handles||[]).slice(0,2).join(' · ')||'—'}</div>
                        </div>
                      </div>
                      <div style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:14,fontWeight:600,color:'var(--tx)',fontVariantNumeric:'tabular-nums',minWidth:70}}>{(u.xp||0).toLocaleString()}</div>
                      <div style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,fontWeight:500,color:'var(--gr)',fontVariantNumeric:'tabular-nums',minWidth:70}}>{fmtGBP(u.total_gmv||0)}</div>
                    </div>
                  );
                })}
              </div>
            </>);
          })()}
        </div>);
      })()}

      {/* REFERRALS */}
      {/* LEVEL PAGE */}
      {page==='level'&&(<div className="pg">
        <div className="sh" style={{marginBottom:14}}>YOUR PROGRESS</div>
        <div style={{background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:'var(--r)',padding:'18px 16px',marginBottom:11}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
            <div style={{width:56,height:56,borderRadius:'50%',background:'linear-gradient(135deg,var(--pu),var(--cy))',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:24,letterSpacing:1,color:'#fff',flexShrink:0}}>{lv.level}</div>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:28,letterSpacing:2}}>LEVEL {lv.level}</div>
              <div style={{fontSize:12,color:'var(--tx2)',marginTop:2}}>{(profile.xp||0).toLocaleString()} XP total</div>
            </div>
          </div>
          <div style={{height:10,background:'var(--card3)',borderRadius:99,overflow:'hidden',marginBottom:6}}>
            <div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg,var(--pu),var(--cy))',width:`${pct}%`,transition:'width 1s ease'}}/>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx3)'}}>
            <span>{lv.min.toLocaleString()} XP</span>
            <span>{nx?`${(nx.min-profile.xp).toLocaleString()} XP to Level ${nx.level}`:'MAX LEVEL 👑'}</span>
            <span>{(nx?nx.min:lv.max).toLocaleString()} XP</span>
          </div>
        </div>
        {/* All levels */}
        <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden',marginBottom:14}}>
          {LEVELS.map((l,i)=>{
            const done=profile.xp>=l.max||(LEVELS[i+1]&&profile.xp>=LEVELS[i+1].min);
            const cur=l.level===lv.level;
            const rw=rewards.find(r=>r.level===l.level+1);
            return(
              <div key={l.level} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',borderBottom:i<LEVELS.length-1?'1px solid var(--bo)':'none',background:cur?'rgba(201,162,75,.07)':'transparent'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:done?'var(--gr)':cur?'var(--pu)':'var(--card3)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:13,color:'#fff',flexShrink:0}}>{done&&!cur?'✓':l.level}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:cur?600:400,color:cur?'var(--tx)':'var(--tx2)'}}>Level {l.level}</div>
                  <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{l.min.toLocaleString()} – {l.level===10?'∞':l.max.toLocaleString()} XP</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {rw?.image_url&&<img src={rw.image_url} alt="" style={{width:28,height:28,borderRadius:6,objectFit:'cover',opacity:done?1:.4}}/>}
                  {cur&&<div style={{fontSize:11,background:'rgba(201,162,75,.2)',color:'var(--pu2)',padding:'3px 9px',borderRadius:99,fontWeight:600}}>YOU</div>}
                </div>
              </div>
            );
          })}
        </div>

        {/* How to earn XP */}
        <div className="sh">HOW TO EARN XP</div>
        <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden',marginBottom:14}}>
          {[
            {icon:'🛒',label:'Generate Sales',sub:'Every £10 in net GMV (after returns)',val:'+100 XP'},
            {icon:'🔥',label:'Daily Streak',sub:'Go live for Hollen every day — hit milestones for bonus XP',val:'Bonus XP'},
            {icon:'👥',label:'Refer a Creator',sub:'They earn, you earn 1% of their GMV forever',val:'+100 XP & 1% GMV'},
          ].map((item,i,arr)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',borderBottom:i<arr.length-1?'1px solid var(--bo)':'none'}}>
              <span style={{fontSize:20,width:28,textAlign:'center',flexShrink:0}}>{item.icon}</span>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500}}>{item.label}</div>
                <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>{item.sub}</div>
              </div>
              <div style={{fontFamily:'var(--fh)',fontSize:14,color:'var(--pu2)',flexShrink:0,letterSpacing:.5}}>{item.val}</div>
            </div>
          ))}
        </div>

        <button onClick={()=>setPage('home')} style={{width:'100%',padding:12,background:'none',border:'1px solid var(--bo2)',borderRadius:'var(--rsm)',color:'var(--tx3)',fontSize:13,cursor:'pointer',marginBottom:8}}>← Back to Home</button>
      </div>)}

      {page==='referrals'&&(()=>{
        let filteredRefEvts=referralEvents;
        if(refDateRange!=='all'){
          let start,end=new Date();end.setHours(23,59,59,999);
          if(refDateRange==='7d'){start=new Date();start.setDate(start.getDate()-6);start.setHours(0,0,0,0);}
          else if(refDateRange==='30d'){start=new Date();start.setDate(start.getDate()-29);start.setHours(0,0,0,0);}
          else if(refDateRange==='month'){const[my,mm]=refSelectedMonth.split('-').map(Number);start=new Date(my,mm-1,1);end=new Date(my,mm,0,23,59,59,999);}
          else if(refDateRange==='custom'&&refCustomStart&&refCustomEnd){start=new Date(refCustomStart);start.setHours(0,0,0,0);end=new Date(refCustomEnd);end.setHours(23,59,59,999);}
          if(start)filteredRefEvts=referralEvents.filter(e=>{const d=new Date(e.created_at);return d>=start&&d<=end;});
        }
        const refGMV=filteredRefEvts.reduce((s,e)=>s+(e.gmv||0),0);
        const refCancelledGMV=filteredRefEvts.reduce((s,e)=>s+(e.cancelled_gmv||0),0);
        const netRefGMV=Math.max(0,refGMV-refCancelledGMV);
        const refEarnings=parseFloat((netRefGMV*0.01).toFixed(2));
        const isRefFiltered=refDateRange!=='all';
        const lifetimeNetGMV=Math.max(0,referralStats.reduce((s,r)=>s+(r.total_gmv||0),0)-referralStats.reduce((s,r)=>s+(r.total_cancelled_gmv||0),0));
        const lifetimeEarned=parseFloat((lifetimeNetGMV*0.01).toFixed(2));
        const displayEarnings=isRefFiltered?refEarnings:lifetimeEarned;
        const displayGMV=isRefFiltered?netRefGMV:lifetimeNetGMV;
        const byUser={};
        filteredRefEvts.forEach(e=>{
          if(!byUser[e.profile_id])byUser[e.profile_id]={gmv:0,cancelled_gmv:0};
          byUser[e.profile_id].gmv+=(e.gmv||0);
          byUser[e.profile_id].cancelled_gmv+=(e.cancelled_gmv||0);
        });
        const paid=payouts.filter(p=>p.paid).reduce((s,p)=>s+(p.amount||0),0);
        const pending=payouts.filter(p=>!p.paid).reduce((s,p)=>s+(p.amount||0),0);
        const accruing=Math.max(0,parseFloat((lifetimeEarned-paid-pending).toFixed(2)));
        const rangeLabel=isRefFiltered?(refDateRange==='7d'?'Last 7 days':refDateRange==='30d'?'Last 30 days':refDateRange==='month'?new Date(refSelectedMonth+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'}):refDateRange==='custom'&&refCustomStart&&refCustomEnd?`${new Date(refCustomStart).toLocaleDateString('en-GB',{day:'numeric',month:'short'})} — ${new Date(refCustomEnd).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}`:''):'All time';
        const now=new Date();
        const m1=new Date(now.getFullYear(),now.getMonth()-1,1).toLocaleDateString('en-GB',{month:'long'});
        const m1pay=new Date(now.getFullYear(),now.getMonth(),15).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        const m2=new Date(now.getFullYear(),now.getMonth(),1).toLocaleDateString('en-GB',{month:'long'});
        const m2pay=new Date(now.getFullYear(),now.getMonth()+1,15).toLocaleDateString('en-GB',{day:'numeric',month:'short'});
        return(<div className="pg" style={{maxWidth:isDesktop?960:'100%',margin:'0 auto',paddingTop:isDesktop?18:13}}>
          {/* HEADER */}
          <div style={{marginBottom:22,paddingBottom:18,borderBottom:'1px solid var(--bo)'}}>
            <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?26:22,fontWeight:700,letterSpacing:-0.5,color:'var(--tx)',lineHeight:1.15}}>Refer &amp; earn</div>
            <div style={{fontSize:12,color:'var(--tx3)',marginTop:5,letterSpacing:.15}}>{referralStats.length} referred creator{referralStats.length===1?'':'s'} · {fmtGBP(lifetimeEarned)} earned all time</div>
          </div>

          {/* PRIMARY METRIC — Referral earnings */}
          <div style={{marginBottom:24}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500}}>Referral earnings</div>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:.3}}>{rangeLabel}</div>
            </div>
            <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?56:44,fontWeight:700,letterSpacing:-1.5,color:'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(displayEarnings)}</div>
          </div>

          {/* DATE FILTER — text tabs */}
          <div style={{display:'flex',gap:0,marginBottom:24,borderBottom:'1px solid var(--bo)',flexWrap:'wrap'}}>
            {[['all','All time'],['7d','7 days'],['30d','30 days'],['month','Month'],['custom','Custom']].map(([val,label])=>(
              <button key={val} onClick={()=>setRefDateRange(val)} style={{padding:'8px 14px',background:'none',border:'none',borderBottom:`2px solid ${refDateRange===val?'var(--pu)':'transparent'}`,color:refDateRange===val?'var(--tx)':'var(--tx3)',fontSize:12,fontWeight:refDateRange===val?600:500,cursor:'pointer',marginBottom:-1,letterSpacing:.15}}>{label}</button>
            ))}
            {refDateRange==='month'&&<input type='month' value={refSelectedMonth} onChange={e=>setRefSelectedMonth(e.target.value)} style={{padding:'5px 10px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',marginLeft:10,alignSelf:'center'}}/>}
            {refDateRange==='custom'&&(<>
              <input type="date" value={refCustomStart} onChange={e=>setRefCustomStart(e.target.value)} style={{padding:'5px 8px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',marginLeft:10,alignSelf:'center'}}/>
              <span style={{fontSize:11,color:'var(--tx3)',alignSelf:'center',padding:'0 6px'}}>→</span>
              <input type="date" value={refCustomEnd} onChange={e=>setRefCustomEnd(e.target.value)} style={{padding:'5px 8px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:6,color:'var(--tx)',fontSize:11,outline:'none',alignSelf:'center'}}/>
            </>)}
          </div>

          {/* KPI GRID — Their Net GMV + Affiliates + Bonus XP */}
          <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(3,1fr)':'repeat(3,1fr)',border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',marginBottom:26,background:'var(--card)'}}>
            {[
              {label:'Their net GMV',val:fmtGBP(displayGMV)},
              {label:'Referred creators',val:referralStats.length.toLocaleString()},
              {label:'Bonus XP earned',val:(referralStats.length*100).toLocaleString()},
            ].map((s,i)=>(
              <div key={i} style={{padding:'18px 18px 20px',borderRight:i<2?'1px solid var(--bo)':'none'}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:500,marginBottom:8}}>{s.label}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?22:18,fontWeight:700,letterSpacing:-0.4,color:'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* REFERRAL CODE — hero card */}
          <div style={{padding:'20px 22px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,marginBottom:26}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6,gap:10,flexWrap:'wrap'}}>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500}}>Your referral code</div>
              <div style={{fontSize:11,color:'var(--go)',fontWeight:500}}>+100 XP · both sides · then 1% forever</div>
            </div>
            <div onClick={()=>{navigator.clipboard.writeText(refLink);toast('Link copied ✓','ok');}} style={{fontFamily:'var(--fh)',fontSize:isDesktop?36:28,fontWeight:700,letterSpacing:isDesktop?4:2.5,color:'var(--tx)',padding:'20px 16px',background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:10,margin:'12px 0',textAlign:'center',cursor:'pointer',userSelect:'all',fontVariantNumeric:'tabular-nums'}}>{profile.referral_code||'...'}</div>
            <button onClick={()=>{navigator.clipboard.writeText(refLink);toast('Link copied ✓','ok');}} style={{width:'100%',padding:'13px',background:'var(--tx)',border:'none',borderRadius:10,color:'var(--bg)',fontFamily:'var(--fh)',fontSize:13,fontWeight:700,letterSpacing:.6,cursor:'pointer',transition:'opacity .15s'}}>Copy referral link</button>
          </div>

          {/* PAYOUT BREAKDOWN — 4 KPI cells */}
          <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:12}}>Payout breakdown</div>
          <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(4,1fr)':'repeat(2,1fr)',border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',marginBottom:26,background:'var(--card)'}}>
            {[
              {l:'Earned',v:fmtGBP(lifetimeEarned),c:'var(--tx)'},
              {l:'Paid',v:fmtGBP(paid),c:'var(--gr)'},
              {l:'Awaiting',v:fmtGBP(pending),c:'var(--go)'},
              {l:'This month',v:fmtGBP(accruing),c:'var(--tx2)'},
            ].map((b,i)=>(
              <div key={i} style={{padding:'18px 18px 20px',borderRight:isDesktop?(i<3?'1px solid var(--bo)':'none'):(i%2===0?'1px solid var(--bo)':'none'),borderBottom:isDesktop?'none':(i<2?'1px solid var(--bo)':'none')}}>
                <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.2,textTransform:'uppercase',fontWeight:500,marginBottom:8}}>{b.l}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?20:17,fontWeight:700,letterSpacing:-0.4,color:b.c,lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{b.v}</div>
              </div>
            ))}
          </div>

          {/* REFERRED CREATORS */}
          {referralStats.length>0&&(
            <div style={{marginBottom:26}}>
              <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:12}}>Referred creators</div>
              <div style={{border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',background:'var(--card)'}}>
                {referralStats.map((r,i)=>{
                  const userEvts=byUser[r.id];
                  const userGMV=isRefFiltered?(userEvts?userEvts.gmv:0):r.total_gmv||0;
                  const userCancelled=isRefFiltered?(userEvts?userEvts.cancelled_gmv:0):(r.total_cancelled_gmv||0);
                  const userNet=Math.max(0,userGMV-userCancelled);
                  return(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:i<referralStats.length-1?'1px solid var(--bo)':'none'}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:avc(r.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>{ini(r.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13.5,fontWeight:600,color:'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.username}</div>
                        <div style={{fontSize:11,color:'var(--tx3)',marginTop:2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(r.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--fh)',fontSize:14,fontWeight:700,color:'var(--tx)',lineHeight:1,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(userNet)}</div>
                        <div style={{fontSize:10.5,color:'var(--go)',marginTop:4,fontWeight:500,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(userNet*0.01)} earned</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PAYOUT HISTORY */}
          <div style={{marginBottom:26}}>
            <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:12}}>Payout history</div>
            {payouts.length===0?(
              <div style={{padding:'24px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,textAlign:'center'}}>
                <div style={{fontSize:13,color:'var(--tx2)',marginBottom:4,fontWeight:500}}>No payouts yet</div>
                <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5}}>Earnings are paid on the 15th of the month after they're generated.</div>
              </div>
            ):(
              <div style={{border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden',background:'var(--card)'}}>
                {payouts.map((po,i)=>{
                  const monthLabel=new Date(po.month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
                  const due=payoutDueDate(po.month+'-15');
                  const dueLabel=due?fmtDueDate(due):'';
                  const overdue=!po.paid&&due&&due.getTime()<Date.now();
                  const status=po.paid?{label:'Paid',color:'var(--gr)',bg:'rgba(107,155,125,.10)'}:overdue?{label:'Overdue',color:'var(--re)',bg:'rgba(176,74,85,.10)'}:{label:'Pending',color:'var(--go)',bg:'rgba(201,162,75,.10)'};
                  return(
                    <div key={po.id} style={{display:'flex',alignItems:'center',gap:14,padding:'14px 18px',borderBottom:i<payouts.length-1?'1px solid var(--bo)':'none'}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:3,flexWrap:'wrap'}}>
                          <span style={{fontSize:13.5,fontWeight:600,color:'var(--tx)'}}>{monthLabel}</span>
                          <span style={{fontSize:10,padding:'2px 8px',background:status.bg,color:status.color,borderRadius:99,fontWeight:600,letterSpacing:.3,fontFamily:'var(--fb)'}}>{status.label}</span>
                        </div>
                        <div style={{fontSize:11,color:'var(--tx3)'}}>{po.paid?`Paid${po.paid_at?' on '+new Date(po.paid_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}`:`Due ${dueLabel}${overdue?' · past due, contact Hollen':''}`}</div>
                      </div>
                      <div style={{fontFamily:'var(--fh)',fontSize:16,fontWeight:700,color:po.paid?'var(--gr)':overdue?'var(--re)':'var(--go)',flexShrink:0,fontVariantNumeric:'tabular-nums'}}>{fmtGBP(po.amount)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* PAID ON THE 15TH — same subtle card as rewards page */}
          <div style={{padding:'16px 18px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,marginBottom:26}}>
            <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
              <div style={{width:32,height:32,borderRadius:8,background:'rgba(201,162,75,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>📅</div>
              <div>
                <div style={{fontFamily:'var(--fh)',fontSize:14,fontWeight:700,color:'var(--tx)',letterSpacing:.1}}>Paid on the 15th</div>
                <div style={{fontSize:11.5,color:'var(--tx3)',marginTop:2}}>Commissions ship on the 15th of the month after they're earned.</div>
              </div>
            </div>
            <div style={{display:'flex',flexDirection:isDesktop?'row':'column',gap:isDesktop?24:6,fontSize:11.5,color:'var(--tx2)',paddingTop:10,borderTop:'1px solid var(--bo)',fontVariantNumeric:'tabular-nums'}}>
              <div>Earn in <strong style={{color:'var(--tx)',fontWeight:600}}>{m1}</strong> · paid <strong style={{color:'var(--gr)',fontWeight:600}}>{m1pay}</strong></div>
              <div>Earn in <strong style={{color:'var(--tx)',fontWeight:600}}>{m2}</strong> · paid <strong style={{color:'var(--gr)',fontWeight:600}}>{m2pay}</strong></div>
            </div>
          </div>

          {/* HOW IT WORKS — editorial three-step */}
          <div style={{marginBottom:20}}>
            <div style={{fontSize:11,color:'var(--tx3)',letterSpacing:1.5,textTransform:'uppercase',fontWeight:500,marginBottom:14}}>How it works</div>
            <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(3,1fr)':'1fr',gap:12}}>
              {[
                {n:'01',t:'Share your code',d:'Send your referral link or code to any creator you know.'},
                {n:'02',t:'They sign up',d:'Both of you receive +100 XP the moment they join with your code.'},
                {n:'03',t:'Earn 1% forever',d:'You earn 1% of every referred creator\'s net GMV, paid monthly.'},
              ].map((s,i)=>(
                <div key={i} style={{padding:'18px 18px 20px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:12,fontWeight:700,color:'var(--go)',letterSpacing:1,marginBottom:10,fontVariantNumeric:'tabular-nums'}}>{s.n}</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',marginBottom:5,letterSpacing:.1}}>{s.t}</div>
                  <div style={{fontSize:11.5,color:'var(--tx3)',lineHeight:1.55}}>{s.d}</div>
                </div>
              ))}
            </div>
          </div>
        </div>);
      })()}

      {/* PRODUCTS */}
      {page==='products'&&(<div className="pg">
        <div className="sh" style={{marginBottom:11}}>PRODUCTS</div>
        {products.length===0&&(<div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3)',fontSize:13}}>No products yet — check back soon!</div>)}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:9}}>
          {products.map(prod=>(
            <div key={prod.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:14,overflow:'hidden',display:'flex',flexDirection:'column'}}>
              {prod.image_url&&<div style={{width:'100%',aspectRatio:'1/1',overflow:'hidden'}}><img src={prod.image_url} alt={prod.name} style={{width:'100%',height:'100%',objectFit:'contain',display:'block',background:'var(--card2)'}}/></div>}
              <div style={{padding:'11px 12px 12px',display:'flex',flexDirection:'column',gap:8,flex:1}}>
                <div>
                  <div style={{fontFamily:'var(--fh)',fontSize:15,letterSpacing:.6,lineHeight:1.15,marginBottom:3}}>{prod.name}</div>
                  {prod.price&&<div style={{fontFamily:'var(--fh)',fontSize:15,color:'var(--gr)',letterSpacing:.5,lineHeight:1}}>£{Number(prod.price).toFixed(2)}</div>}
                </div>
                {prod.description&&<div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.4}}>{prod.description}</div>}
                {(prod.commission_rate||prod.free_shipping)&&(
                  <div style={{display:'flex',gap:5,flexWrap:'wrap'}}>
                    {prod.commission_rate&&<div style={{background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.25)',borderRadius:99,padding:'3px 9px',fontSize:9,color:'var(--go)',fontWeight:700,letterSpacing:.5,textTransform:'uppercase'}}>💰 {prod.commission_rate}% Comm</div>}
                    {prod.free_shipping&&<div style={{background:'rgba(107,155,125,.1)',border:'1px solid rgba(107,155,125,.28)',borderRadius:99,padding:'3px 9px',fontSize:9,color:'var(--gr)',fontWeight:700,letterSpacing:.5,textTransform:'uppercase'}}>🚚 Free Shipping</div>}
                  </div>
                )}
                {prod.tiktok_url&&<button onClick={()=>{navigator.clipboard.writeText(prod.tiktok_url);toast('Link copied! 📋','ok');}} style={{marginTop:'auto',width:'100%',background:'rgba(201,162,75,.14)',border:'1px solid rgba(201,162,75,.3)',borderRadius:'var(--rsm)',padding:'8px',fontSize:11,color:'var(--pu2)',fontWeight:700,cursor:'pointer',letterSpacing:.6,fontFamily:'var(--fb)'}}>📋 COPY LINK</button>}
              </div>
            </div>
          ))}
        </div>
      </div>)}

      {/* PROFILE */}
      {page==='profile'&&(<div className="pg">
        <div className="phead">
          <label style={{cursor:'pointer',position:'relative',display:'inline-block',marginBottom:7}}>
            <div className="p-av" style={{background:profile.avatar_url?'transparent':avc(profile.username),borderColor:avc(profile.username)}}>
              {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:ini(profile.username)}
            </div>
            <div style={{position:'absolute',bottom:0,right:0,width:18,height:18,background:'var(--pu)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:9}}>📷</div>
            <input type="file" accept="image/*" style={{display:'none'}} onChange={async e=>{const file=e.target.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=async ev=>{const {error}=await supabase.from('profiles').update({avatar_url:ev.target.result}).eq('id',profile.id);if(!error){setProfile({...profile,avatar_url:ev.target.result});toast('Photo updated ✓','ok');}};reader.readAsDataURL(file);}}/>
          </label>
          <div className="pnm">{profile.username.toUpperCase()}</div>
          <div className="ttchips">{(profile.tiktok_handles||[]).map((t,i)=><span key={i} className="ttchip">{t}</span>)}</div>
        </div>
        <div className="pstats">
          <div className="pst"><div className="pstv">{(profile.xp||0).toLocaleString()}</div><div className="pstl">XP</div></div>
          <div className="pst"><div className="pstv">{lv.level}</div><div className="pstl">Level</div></div>
          <div className="pst"><div className="pstv">{profile.streak||0}</div><div className="pstl">Streak</div></div>
        </div>

        <a href="https://discord.gg/eR4eJAhcVG" target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:12,padding:'14px 16px',background:'linear-gradient(135deg,#5865F2 0%,#7c3aed 100%)',borderRadius:'var(--r)',color:'#fff',textDecoration:'none',marginBottom:6,boxShadow:'0 4px 18px rgba(88,101,242,.3)'}}>
          <span style={{fontSize:24,filter:'drop-shadow(0 1px 3px rgba(0,0,0,.25))'}}>💬</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontFamily:'var(--fh)',fontSize:17,letterSpacing:1.5,lineHeight:1.1}}>JOIN THE HOLLEN DISCORD</div>
            <div style={{fontSize:10,opacity:.85,marginTop:3,letterSpacing:.3}}>Rewards · payouts · training · announcements</div>
          </div>
          <span style={{fontSize:18,opacity:.7}}>›</span>
        </a>
        <div style={{fontSize:11,color:'var(--tx3)',marginBottom:9,padding:'0 4px',lineHeight:1.4}}>
          Trouble joining? <a href="https://wa.me/447498435748" target="_blank" rel="noopener noreferrer" style={{color:'var(--pu2)',textDecoration:'underline',fontWeight:600,whiteSpace:'nowrap'}}>WhatsApp +44 7498 435748</a>
        </div>

        <div className="asec" style={{marginBottom:9}}><div className="asect">TikTok Handles</div><ProfileHandles profile={profile} setProfile={setProfile} toast={toast}/></div>
        <div className="mcard">
          <div className="mi" onClick={()=>navTo('products')}><div className="mil"><span className="mii">📦</span>Products</div><span className="mich">›</span></div>
          <div className="mi" onClick={()=>navTo('referrals')}><div className="mil"><span className="mii">👥</span>Refer &amp; Earn</div><span className="mich">›</span></div>
          <div className="mi" onClick={openMonthlyRecap}><div className="mil"><span className="mii">📅</span>Monthly Recap{monthlyRecapLoading&&<span style={{fontSize:10,color:'var(--tx3)',marginLeft:6,fontWeight:500}}>loading…</span>}</div><span className="mich">›</span></div>
          <div className="mi" onClick={()=>{setResetPw('');setResetPw2('');setShowResetPw(true);}}><div className="mil"><span className="mii">🔑</span>Change Password</div><span className="mich">›</span></div>
          <div className="mi" onClick={openAdminGate}><div className="mil"><span className="mii">🔐</span>Admin Panel</div><span className="mich">›</span></div>
        </div>
        <button className="btn btnre" onClick={doLogout}>Sign Out</button>
      </div>)}

      {/* ADMIN */}
      {page==='admin'&&adminUnlocked&&(<div className="pg">
        {/* TAB STRIP */}
        <div style={{display:'flex',gap:7,marginBottom:14,flexWrap:'wrap',alignItems:'center'}}>
          <span style={{fontFamily:'var(--fh)',fontSize:18,letterSpacing:2.5,marginRight:8,color:'var(--tx2)'}}>👑 ADMIN</span>
          {[['overview','📊','Overview'],['affiliates','👥','Affiliates'],['referrals','🔗','Referrals'],['discord','🎮','Discord'],['rewardsowed','🎁','Rewards'],['imports','📥','Imports'],['payouts','💷','Payouts'],['catalog','📦','Catalog']].map(([id,ic,lb])=>(
            <button key={id} className={`atab${adminTab===id?' on':''}`} onClick={()=>setAdminTab(id)}>
              <span>{ic}</span><span>{lb}</span>
              {id==='discord'&&(()=>{const n=allProfiles.filter(p=>getLv(p.xp,LEVELS).level>(p.discord_level??0)).length;return n>0?<span style={{background:'#5865F2',color:'#fff',fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:99,marginLeft:4,letterSpacing:.3}}>{n}</span>:null;})()}
              {id==='rewardsowed'&&(()=>{const n=allProfiles.filter(p=>achievedLevel(p.xp,rewards)>(p.rewards_delivered_level??0)).length;return n>0?<span style={{background:'rgba(201,162,75,.85)',color:'#1a1a2e',fontSize:9,fontWeight:800,padding:'2px 6px',borderRadius:99,marginLeft:4,letterSpacing:.3}}>{n}</span>:null;})()}
            </button>
          ))}
        </div>
        {adminTab==='overview'&&(()=>{
          // === All-time totals (used when period === 'all', plus all-time fallback for sub-chips that don't have a per-period meaning) ===
          const totalGross=allProfiles.reduce((s,p)=>s+(p.total_gmv||0),0);
          const totalCancGMV=allProfiles.reduce((s,p)=>s+(p.total_cancelled_gmv||0),0);
          const totalNet=Math.max(0,totalGross-totalCancGMV);
          const totalComm=allProfiles.reduce((s,p)=>s+(p.total_commission||0),0);
          const totalOrders=allProfiles.reduce((s,p)=>s+(p.total_orders||0),0);
          const totalUnits=allProfiles.reduce((s,p)=>s+(p.total_sales||0),0);
          const totalCanc=allProfiles.reduce((s,p)=>s+(p.total_cancelled||0),0);
          const totalXP=allProfiles.reduce((s,p)=>s+(p.xp||0),0);
          const totalReferred=allProfiles.filter(p=>p.referred_by&&profileById[p.referred_by]).length;
          const avgLevel=allProfiles.length>0?(allProfiles.reduce((s,p)=>s+getLv(p.xp,LEVELS).level,0)/allProfiles.length).toFixed(1):'0';
          const totalOwed=adminPayouts.filter(po=>!po.paid).reduce((s,po)=>s+(po.amount||0),0);
          // === Period aggregates from adminPeriodEvents (60-day import window) ===
          const sumEvts=(from,to)=>adminPeriodEvents.filter(e=>{const d=new Date(e.created_at);return d>=from&&d<to;}).reduce((a,e)=>({gmv:a.gmv+Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0)),comm:a.comm+(e.commission||0),orders:a.orders+(e.orders||0),xp:a.xp+(e.amount||0),units:a.units+(e.sales||0),canc:a.canc+(e.cancelled||0),cancGmv:a.cancGmv+(e.cancelled_gmv||0),profs:a.profs.add(e.profile_id)}),{gmv:0,comm:0,orders:0,xp:0,units:0,canc:0,cancGmv:0,profs:new Set()});
          const pw=periodWindow(adminPeriod,adminCustomStart,adminCustomEnd);
          let curPeriod=null,prevPeriod=null;
          if(pw){curPeriod=sumEvts(pw.from,pw.to);prevPeriod=sumEvts(pw.prevFrom,pw.prevTo);}
          const useP=adminPeriod!=='all'&&curPeriod;
          const dispNet=useP?curPeriod.gmv:totalNet;
          const dispComm=useP?curPeriod.comm:totalComm;
          const dispOrders=useP?curPeriod.orders:totalOrders;
          const dispXP=useP?curPeriod.xp:totalXP;
          const dispAff=useP?curPeriod.profs.size:allProfiles.length;
          const dispUnits=useP?curPeriod.units:totalUnits;
          const dispCanc=useP?curPeriod.canc:totalCanc;
          const dispCancGMV=useP?curPeriod.cancGmv:totalCancGMV;
          // Snapshot-style chips scoped to in-period profiles so the row tells the same story as the hero.
          const dispReferred=useP?[...curPeriod.profs].filter(pid=>{const p=profileById[pid];return p&&p.referred_by&&profileById[p.referred_by];}).length:totalReferred;
          const dispAvgLevel=useP?(curPeriod.profs.size>0?([...curPeriod.profs].reduce((s,pid)=>{const p=profileById[pid];return s+(p?getLv(p.xp,LEVELS).level:0);},0)/curPeriod.profs.size).toFixed(1):'0'):avgLevel;
          const dNet=useP?(curPeriod.gmv-prevPeriod.gmv):null;
          const dComm=useP?(curPeriod.comm-prevPeriod.comm):null;
          const dOrders=useP?(curPeriod.orders-prevPeriod.orders):null;
          const dXP=useP?(curPeriod.xp-prevPeriod.xp):null;
          const dAff=useP?(curPeriod.profs.size-prevPeriod.profs.size):null;
          // Compact GBP — drops decimals on big values so hero tiles don't truncate
          const fmtGBPc=(n)=>{const v=n||0;return Math.abs(v)>=1000?'£'+Math.round(v).toLocaleString('en-GB'):'£'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});};
          const fmtGBPd=(n)=>'£'+Math.round(n||0).toLocaleString('en-GB');
          const lastImp=importHistory[0];
          // === Tasks (real, derived from current state) ===
          const tasks=[];
          const today0=new Date();today0.setHours(0,0,0,0);
          const expiredEx=xpExclusions.filter(e=>e.end_date&&new Date(e.end_date)<today0);
          const unpaid=adminPayouts.filter(po=>!po.paid);
          if(unpaid.length>0)tasks.push({k:'warn',e:'💷',t:`${unpaid.length} unpaid payout${unpaid.length===1?'':'s'} · ${fmtGBPc(totalOwed)} owed`,n:'Mark each as paid after sending the transfer',cta:'Review',fn:()=>setAdminTab('payouts')});
          if(expiredEx.length>0)tasks.push({k:'info',e:'⏰',t:`${expiredEx.length} XP exclusion${expiredEx.length===1?'':'s'} expired`,n:'Affected affiliates are earning XP again — clean up or extend',cta:'Clean up',fn:()=>{setAdminTab('imports');setShowExclusions(true);}});
          // Discord role-update reminders: any profile whose displayed level
          // (getLv) is higher than the last acknowledged discord_level.
          const pendingDiscord=allProfiles.filter(p=>getLv(p.xp,LEVELS).level>(p.discord_level??0));
          if(pendingDiscord.length>0)tasks.push({k:'warn',e:'🎮',t:`${pendingDiscord.length} Discord role${pendingDiscord.length===1?'':'s'} need updating`,n:'Affiliates have levelled up since you last bumped their Discord role',cta:'Review',fn:()=>setAdminTab('discord')});
          // Reward delivery reminders — affiliates with unlocked level rewards that haven't been physically dispatched.
          const rewardByLevelLookup={};rewards.forEach(r=>{rewardByLevelLookup[r.level]={value:Number(r.value||0)};});
          const pendingRewards=allProfiles.map(p=>{const ach=achievedLevel(p.xp,rewards);const last=p.rewards_delivered_level??0;let owed=0;for(let l=last+1;l<=ach;l++){if(rewardByLevelLookup[l])owed+=rewardByLevelLookup[l].value||0;}return{p,owed,hasTiers:ach>last};}).filter(x=>x.hasTiers);
          const totalRewardOwed=pendingRewards.reduce((s,x)=>s+x.owed,0);
          if(pendingRewards.length>0)tasks.push({k:'warn',e:'🎁',t:`${pendingRewards.length} affiliate${pendingRewards.length===1?'':'s'} owed level rewards${totalRewardOwed>0?' ('+(totalRewardOwed>=1000?'£'+Math.round(totalRewardOwed).toLocaleString('en-GB'):'£'+totalRewardOwed.toFixed(2))+')':''}`,n:'Dispatch their tier reward then tick them off',cta:'Review',fn:()=>setAdminTab('rewardsowed')});
          if(allProfiles.length===0)tasks.push({k:'info',e:'🎯',t:'No affiliates yet',n:'Share the signup link to get started',cta:'',fn:()=>{}});
          // === Top performers (top 3 each) ===
          const byGMV=[...allProfiles].sort((a,b)=>(Math.max(0,(b.total_gmv||0)-(b.total_cancelled_gmv||0)))-(Math.max(0,(a.total_gmv||0)-(a.total_cancelled_gmv||0)))).slice(0,3);
          // For each referrer compute (a) count of people they referred and (b) sum of
          // net GMV from those referred users — the latter is what drives their 1% earnings.
          const byRef=[...allProfiles].map(p=>{
            const kids=referralsByReferrer[p.id]||[];
            const refGMV=kids.reduce((s,k)=>s+Math.max(0,(k.total_gmv||0)-(k.total_cancelled_gmv||0)),0);
            return {...p,_refs:kids.length,_refGMV:refGMV};
          }).filter(p=>p._refs>0).sort((a,b)=>b._refGMV-a._refGMV).slice(0,3);
          const owedByProfile={};
          unpaid.forEach(po=>{if(!owedByProfile[po.profile_id])owedByProfile[po.profile_id]={amount:0,months:0};owedByProfile[po.profile_id].amount+=(po.amount||0);owedByProfile[po.profile_id].months++;});
          const byOwed=Object.entries(owedByProfile).map(([pid,v])=>{const pp=profileById[pid];return pp?{...pp,_owed:v.amount,_months:v.months}:null;}).filter(Boolean).sort((a,b)=>b._owed-a._owed).slice(0,3);
          const PodRow=({p,i,right,rightLabel,rightColor})=>(
            <div style={{display:'flex',alignItems:'center',gap:9,padding:'8px 0',borderBottom:i<2?'1px solid var(--bo)':'none'}}>
              <span style={{fontFamily:'var(--fh)',fontSize:15,width:20,textAlign:'center',color:i===0?'#c9a24b':i===1?'#bbb':i===2?'#cd7f32':'var(--tx3)'}}>{i+1}</span>
              <div style={{width:28,height:28,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:10,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12.5,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}</div>
                <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
              </div>
              <div style={{textAlign:'right',flexShrink:0}}>
                <div style={{fontFamily:'var(--fh)',fontSize:14,color:rightColor,lineHeight:1}}>{right}</div>
                <div style={{fontSize:9,color:'var(--tx3)',marginTop:2,textTransform:'uppercase',letterSpacing:.5,fontWeight:600}}>{rightLabel}</div>
              </div>
            </div>
          );
          const HeroTile=({label,value,delta,deltaFmt,accent})=>{
            if(delta==null)return(<div className="ahk"><div className="ahkl">{label}</div><div className="ahkv" style={{color:accent}}>{value}</div><div className="ahkd"><span className="vs">All-time total</span></div></div>);
            const up=delta>0,dn=delta<0;
            const arrow=up?'▲':dn?'▼':'·';const sign=up?'+':dn?'−':'';
            const num=deltaFmt!=null?deltaFmt:Math.abs(delta).toLocaleString();
            return(<div className="ahk"><div className="ahkl">{label}</div><div className="ahkv" style={{color:accent}}>{value}</div><div className={`ahkd${up?' up':dn?' dn':''}`}><span>{arrow}</span><span>{sign}{num}</span><span className="vs">vs prev</span></div></div>);
          };
          return(<>
            {/* LAST IMPORT STRIP */}
            {lastImp&&(
              <div className="astrip" onClick={()=>setAdminTab('imports')} style={{cursor:'pointer'}}>
                <div className="si"><span style={{fontSize:15}}>📥</span><strong>Last import</strong></div>
                <div className="si"><span className="b">{new Date(lastImp.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</span></div>
                <div className="si"><span className="b pu">{lastImp.profileCount||0}</span> affiliates</div>
                <div className="si"><span className="b gr">+{fmtGBPc(lastImp.totalGmv)}</span> gross GMV</div>
                <div className="si"><span className="b go">{fmtGBPc(lastImp.totalComm)}</span> commission</div>
                <div style={{marginLeft:'auto',fontSize:11,color:'var(--pu2)',fontWeight:600}}>View import history →</div>
              </div>
            )}
            {/* HERO PERFORMANCE */}
            <div style={{background:'linear-gradient(135deg,rgba(201,162,75,.14) 0%,rgba(139,164,168,.06) 60%,rgba(201,162,75,.05) 100%)',border:'1px solid var(--bo2)',borderRadius:16,padding:isDesktop?'20px 22px':'16px',marginBottom:11,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,75,.16) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,position:'relative',flexWrap:'wrap',gap:10}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:isDesktop?26:22,filter:'drop-shadow(0 2px 6px rgba(201,162,75,.3))'}}>📊</span>
                  <div>
                    <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?22:18,letterSpacing:2.5,lineHeight:1}}>PERFORMANCE</div>
                    <div style={{fontSize:11,color:'var(--tx3)',marginTop:4,letterSpacing:.3}}>{adminPeriod==='all'?'All time':adminPeriod==='today'?'Yesterday':adminPeriod==='7d'?'Last 7 days':adminPeriod==='30d'?'Last 30 days':adminCustomStart&&adminCustomEnd?`${new Date(adminCustomStart).toLocaleDateString('en-GB')} → ${new Date(adminCustomEnd).toLocaleDateString('en-GB')}`:'Pick a custom range'}</div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div className="aseg">
                    {[['today','Yesterday'],['7d','7d'],['30d','30d'],['all','All-time'],['custom','Custom']].map(([v,l])=>(
                      <button key={v} className={adminPeriod===v?'on':''} onClick={()=>setAdminPeriod(v)}>{l}</button>
                    ))}
                  </div>
                  {adminPeriod==='custom'&&(<>
                    <input type="date" value={adminCustomStart} onChange={e=>setAdminCustomStart(e.target.value)} style={{padding:'5px 8px',background:'rgba(201,162,75,.12)',border:'1px solid rgba(201,162,75,.4)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none',colorScheme:'dark'}}/>
                    <span style={{color:'var(--tx3)',fontSize:11}}>→</span>
                    <input type="date" value={adminCustomEnd} onChange={e=>setAdminCustomEnd(e.target.value)} style={{padding:'5px 8px',background:'rgba(201,162,75,.12)',border:'1px solid rgba(201,162,75,.4)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none',colorScheme:'dark'}}/>
                  </>)}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(5, 1fr)':'1fr 1fr',gap:10,position:'relative'}}>
                <HeroTile label="Net GMV" value={fmtGBPc(dispNet)} delta={dNet} deltaFmt={dNet!=null?fmtGBPd(dNet):null} accent="var(--gr)"/>
                <HeroTile label="Commission" value={fmtGBPc(dispComm)} delta={dComm} deltaFmt={dComm!=null?fmtGBPd(dComm):null} accent="var(--go)"/>
                <HeroTile label="Orders" value={dispOrders.toLocaleString()} delta={dOrders} accent="var(--cy)"/>
                <HeroTile label="XP Awarded" value={dispXP.toLocaleString()} delta={dXP} accent="var(--pu2)"/>
                <HeroTile label="Affiliates" value={dispAff.toLocaleString()} delta={dAff} accent="var(--tx)"/>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(5, 1fr)':'1fr 1fr',gap:8,marginTop:12,position:'relative'}}>
                <div className="asub"><div className="asubl">Units Sold</div><div className="asubv" style={{color:'var(--cy)'}}>{dispUnits.toLocaleString()}</div></div>
                <div className="asub"><div className="asubl">Returns</div><div className="asubv" style={{color:'var(--re)'}}>{dispCanc} · {fmtGBPc(dispCancGMV)}</div></div>
                <div className="asub"><div className="asubl">{useP?'Active Refs':'Referrals'}</div><div className="asubv" style={{color:'var(--gr)'}}>{dispReferred}</div></div>
                <div className="asub"><div className="asubl">Owed</div><div className="asubv" style={{color:'var(--go)'}} title="Cumulative — unpaid referral payouts">{fmtGBPc(totalOwed)}</div></div>
                <div className="asub"><div className="asubl">{useP?'Avg Lv (Active)':'Avg Level'}</div><div className="asubv">{dispAvgLevel}</div></div>
              </div>
            </div>
            {/* NEEDS ATTENTION */}
            <div className="asec">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                <span style={{fontSize:14}}>📥</span>
                <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>NEEDS ATTENTION</span>
                {tasks.length>0&&<span style={{background:'rgba(176,74,85,.15)',color:'var(--re)',fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:700,letterSpacing:.3}}>{tasks.length}</span>}
                <span style={{marginLeft:'auto',fontSize:10,color:'var(--tx3)',letterSpacing:.3}}>Daily checklist — click to act</span>
              </div>
              {tasks.length===0?(
                <div style={{padding:'18px 8px',textAlign:'center',color:'var(--tx3)',fontSize:12,background:'rgba(107,155,125,.04)',border:'1px dashed rgba(107,155,125,.2)',borderRadius:10}}>✨ All clear — no actions needed</div>
              ):(
                <div style={{display:'grid',gridTemplateColumns:isDesktop?'1fr 1fr':'1fr',gap:8}}>
                  {tasks.map((t,i)=>(
                    <div key={i} className={`atask ${t.k}`} onClick={t.fn}>
                      <div style={{fontSize:18,flexShrink:0}}>{t.e}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12.5,fontWeight:500,color:'var(--tx)'}}>{t.t}</div>
                        <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{t.n}</div>
                      </div>
                      {t.cta&&<div style={{fontSize:11,color:'var(--pu2)',fontWeight:600,letterSpacing:.3}}>{t.cta} →</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* MERGED LEADERBOARD */}
            <div className="asec">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                <span style={{fontSize:14}}>🏆</span>
                <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>TOP PERFORMERS</span>
                <span style={{marginLeft:'auto',fontSize:10,color:'var(--pu2)',fontWeight:600,letterSpacing:.3,cursor:'pointer'}} onClick={()=>setAdminTab('affiliates')}>View all affiliates →</span>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'1fr 1fr 1fr':'1fr',gap:18}}>
                <div>
                  <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.9,fontWeight:700,marginBottom:6}}>By Net GMV</div>
                  {byGMV.length===0?<div style={{fontSize:11,color:'var(--tx3)',padding:'14px 4px'}}>No data yet.</div>:byGMV.map((p,i)=><PodRow key={p.id} p={p} i={i} right={fmtGBPc(Math.max(0,(p.total_gmv||0)-(p.total_cancelled_gmv||0)))} rightLabel="Net GMV" rightColor="var(--gr)"/>)}
                </div>
                <div>
                  <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.9,fontWeight:700,marginBottom:6}}>Top Referrers</div>
                  {byRef.length===0?<div style={{fontSize:11,color:'var(--tx3)',padding:'14px 4px'}}>No referrals yet.</div>:byRef.map((p,i)=><PodRow key={p.id} p={p} i={i} right={fmtGBPc(p._refGMV)} rightLabel={`${p._refs} REFERRED`} rightColor="var(--pu2)"/>)}
                </div>
                <div>
                  <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.9,fontWeight:700,marginBottom:6}}>Payouts Due</div>
                  {byOwed.length===0?(
                    <div style={{fontSize:11,color:'var(--tx3)',padding:'14px 4px',lineHeight:1.5}}>{adminPayouts.length===0?<>No completed months yet — payout records are auto-generated at the end of each month.</>:'All payouts marked paid 🎉'}</div>
                  ):byOwed.map((p,i)=><PodRow key={p.id} p={p} i={i} right={fmtGBPc(p._owed)} rightLabel="Owed" rightColor="var(--go)"/>)}
                </div>
              </div>
            </div>
            {/* QUICK ACTIONS */}
            <div className="asec">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                <span style={{fontSize:14}}>⚡</span>
                <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>QUICK ACTIONS</span>
              </div>
              <div style={{display:'flex',gap:7,flexWrap:'wrap'}}>
                <button className="aqab" onClick={()=>setAdminTab('imports')}>📥 Import files</button>
                <button className="aqab" onClick={()=>{setFlashSearch('');setShowFlashSale(true);}} title="Pull every TikTok handle as a tickable checklist for setting up flash sales. Ticks persist — use Reset inside to clear.">🚀 Flash sale handles</button>
                <button className="aqab" onClick={()=>{setAdminTab('catalog');if(!showRE)setEditRewards(rewards.map(r=>({...r})));setShowRE(true);}}>🎁 Edit rewards</button>
                <button className="aqab" onClick={()=>{setAdminTab('catalog');if(!showME)setEditMilestones(milestones.map(m=>({...m})));setShowME(true);}}>🔥 Edit milestones</button>
                <button className="aqab" onClick={()=>{setAdminTab('catalog');if(!showPE)setEditProducts(products.map(p=>({...p})));setShowPE(true);}}>📦 Edit products</button>
                <button className="aqab" onClick={()=>{setAdminTab('imports');loadXpExclusions();setShowExclusions(true);}}>🚫 XP exclusions</button>
                <button className="aqab" onClick={exportCSV}>📊 Export CSV</button>
              </div>
            </div>
          </>);
        })()}
        {adminTab==='imports'&&(<div className="asec">
          <div className="asect">Import TikTok Shop Data</div>
          <div className={`dz${dragOver?' drag':''}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={async e=>{e.preventDefault();setDragOver(false);const fs=Array.from(e.dataTransfer.files);for(const f of fs){await handleFile(f);}if(fs.length>1)toast(`✅ Imported ${fs.length} files`,'ok');}}>
            <input type="file" accept=".csv,.xlsx,.xls" multiple onChange={async e=>{const fs=Array.from(e.target.files||[]);for(const f of fs){await handleFile(f);}if(fs.length>1)toast(`✅ Imported ${fs.length} files`,'ok');e.target.value='';}}/>
            <div style={{fontSize:24,marginBottom:5}}>📂</div>
            <div style={{fontSize:12,fontWeight:500,marginBottom:2}}>Drop files or tap to browse</div>
            <div style={{fontSize:10,color:'var(--tx3)'}}>TikTok Shop Affiliate Center · .csv or .xlsx · drop multiple at once</div>
          </div>
          {importLog.length>0&&<div className="ilog">{importLog.map((l,i)=><div key={i} className={l.startsWith('✓')?'logo':l.startsWith('⚠')?'logw':l.startsWith('ERROR')?'loge':''}>{l}</div>)}</div>}
        </div>)}
        {adminTab==='affiliates'&&(<div className="asec">
          <div className="asect">Affiliates</div>
          {/* Referral tree moved to dedicated Referrals tab — see adminTab==='referrals' below */}
          {/* SEARCH, FILTER & SORT */}
          <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
            <input value={adminSearch} onChange={e=>setAdminSearch(e.target.value)} placeholder="Search affiliates..." style={{flex:1,minWidth:150,padding:'8px 12px',background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:10,color:'var(--tx)',fontSize:13,outline:'none',fontFamily:'var(--fb)'}}/>
            <select value={adminLevelFilter} onChange={e=>setAdminLevelFilter(e.target.value)} style={{padding:'8px 10px',background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:10,color:'var(--tx)',fontSize:12,outline:'none'}}>
              <option value="">All Levels</option>
              {LEVELS.map(l=><option key={l.level} value={l.level}>Level {l.level}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:5,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,marginRight:3}}>Sort:</span>
            {[['gmv','Net GMV'],['xp','XP'],['referrals','Referrals'],['newest','Newest'],['name','Name']].map(([val,label])=>(
              <button key={val} onClick={()=>setAdminSort(val)} style={{padding:'4px 10px',borderRadius:99,border:`1px solid ${adminSort===val?'var(--pu)':'var(--bo)'}`,background:adminSort===val?'rgba(201,162,75,.18)':'var(--card)',color:adminSort===val?'var(--pu2)':'var(--tx3)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)'}}>{label}</button>
            ))}
          </div>
          {/* AFFILIATE CARDS - sorted, with search/level filters applied */}
          {(()=>{
            const filtered=allProfiles.filter(p=>{
              const matchSearch=!adminSearch||p.username.toLowerCase().includes(adminSearch.toLowerCase())||(p.tiktok_handles||[]).some(h=>h.toLowerCase().includes(adminSearch.toLowerCase()));
              const matchLevel=adminLevelFilter===''||getLv(p.xp,LEVELS).level===Number(adminLevelFilter);
              return matchSearch&&matchLevel;
            });
            const sorted=[...filtered].sort((a,b)=>{
              if(adminSort==='gmv'){const aN=Math.max(0,(a.total_gmv||0)-(a.total_cancelled_gmv||0));const bN=Math.max(0,(b.total_gmv||0)-(b.total_cancelled_gmv||0));return bN-aN;}
              if(adminSort==='xp')return(b.xp||0)-(a.xp||0);
              if(adminSort==='referrals')return(referralsByReferrer[b.id]?.length||0)-(referralsByReferrer[a.id]?.length||0);
              if(adminSort==='newest')return new Date(b.created_at||0)-new Date(a.created_at||0);
              if(adminSort==='name')return a.username.localeCompare(b.username);
              return 0;
            });
            const hasSearch=adminSearch.trim()||adminLevelFilter!=='';
            const cols=isDesktop?'34px minmax(150px, 1fr) 40px 80px 96px 96px 60px 60px 56px 124px 264px':null;
            const headers=[
              {label:'#',align:'left'},
              {label:'Affiliate',align:'left'},
              {label:'Lv',align:'left'},
              {label:'XP',align:'right'},
              {label:'Net GMV',align:'right'},
              {label:'Commission',align:'right'},
              {label:'Orders',align:'right'},
              {label:'Units',align:'right'},
              {label:'Streak',align:'right'},
              {label:'Referrals',align:'left'},
              {label:'Actions',align:'right'},
            ];
            return(<>
              <div style={{fontSize:10,color:'var(--tx3)',marginBottom:8}}>{sorted.length} affiliate{sorted.length!==1?'s':''}{hasSearch?' found':''} · sorted by {adminSort==='gmv'?'Net GMV':adminSort==='xp'?'XP':adminSort==='referrals'?'referrals':adminSort==='newest'?'newest first':'name'}</div>
              {isDesktop?(
                <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,overflowX:'auto',overflowY:'hidden'}}>
                  {/* header row */}
                  <div style={{display:'grid',gridTemplateColumns:cols,gap:6,padding:'10px 14px',borderBottom:'1px solid var(--bo2)',background:'rgba(255,255,255,.025)',fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:700,alignItems:'center',minWidth:1100}}>
                    {headers.map((h,i)=><span key={i} style={{textAlign:h.align}}>{h.label}</span>)}
                  </div>
                  {/* data rows */}
                  {sorted.map((p,i)=>{
                    const plv=getLv(p.xp,LEVELS);
                    const netGMV=Math.max(0,(p.total_gmv||0)-(p.total_cancelled_gmv||0));
                    const netComm=Math.max(0,(p.total_commission||0)-((p.total_gmv||0)>0?(p.total_commission||0)*((p.total_cancelled_gmv||0)/(p.total_gmv||1)):0));
                    const referredBy=p.referred_by?profileById[p.referred_by]:null;
                    const referralCount=(referralsByReferrer[p.id]||[]).length;
                    return(<div key={p.id} style={{display:'grid',gridTemplateColumns:cols,gap:6,padding:'11px 14px',borderBottom:i<sorted.length-1?'1px solid var(--bo)':'none',alignItems:'center',fontSize:12,minWidth:1100}}>
                      <span style={{fontFamily:'var(--fh)',fontSize:14,color:i===0?'#c9a24b':i===1?'#bbb':i===2?'#cd7f32':'var(--tx3)'}}>{i+1}</span>
                      <div style={{display:'flex',gap:9,alignItems:'center',minWidth:0}}>
                        <div style={{width:30,height:30,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}</div>
                          <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,2).join(' · ')||'—'}</div>
                        </div>
                      </div>
                      <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--pu2)'}}>L{plv.level}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--pu2)'}}>{(p.xp||0).toLocaleString()}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--gr)'}}>{fmtGBP(netGMV)}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--go)'}}>{fmtGBP(netComm)}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13}}>{(p.total_orders||0).toLocaleString()}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13}}>{(p.total_sales||0).toLocaleString()}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--go)'}}>🔥{p.streak||0}</span>
                      <div style={{display:'flex',flexDirection:'column',gap:2,minWidth:0}}>
                        {referralCount>0&&<span style={{fontSize:10,color:'var(--gr)',fontWeight:600,whiteSpace:'nowrap'}}>👥 Referred {referralCount}</span>}
                        {referredBy&&<span style={{fontSize:10,color:'var(--pu2)',fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>↩ {referredBy.username}</span>}
                        {!referralCount&&!referredBy&&<span style={{fontSize:10,color:'var(--tx3)'}}>—</span>}
                      </div>
                      <div style={{display:'flex',gap:4,justifyContent:'flex-end',alignItems:'center',flexWrap:'nowrap'}}>
                        <input className="xpin" type="number" min="1" value={xpAmounts[p.id]||100} onChange={e=>setXpAmounts({...xpAmounts,[p.id]:parseInt(e.target.value)||100})} style={{width:54,padding:'4px 6px',fontSize:11}}/>
                        <button className="xbtn" style={{padding:'4px 7px'}} onClick={()=>admAwardXP(p.id)} title="Add XP">+</button>
                        <button className="xbtn" style={{background:'rgba(176,74,85,.14)',borderColor:'rgba(176,74,85,.26)',color:'var(--re)',padding:'4px 7px'}} onClick={()=>admAwardXP(p.id,true)} title="Subtract XP">−</button>
                        <button className="xbtn" style={{background:'rgba(139,164,168,.14)',borderColor:'rgba(139,164,168,.26)',color:'var(--cy)',padding:'4px 6px'}} onClick={()=>openEditAffiliate(p)} title="Edit all fields">✏️</button>
                        {referredBy&&(deleteConfirm===`revertref-${p.id}`?(<>
                          <button className="xbtn" style={{background:'rgba(201,162,75,.22)',borderColor:'rgba(201,162,75,.45)',color:'#fff',fontWeight:700,padding:'4px 6px'}} onClick={()=>revertReferral(p.id)} title="Confirm revert">✓</button>
                          <button className="xbtn" style={{background:'var(--card2)',borderColor:'var(--bo)',color:'var(--tx3)',padding:'4px 6px'}} onClick={()=>setDeleteConfirm(null)} title="Cancel">×</button>
                        </>):(<button className="xbtn" style={{background:'rgba(201,162,75,.1)',borderColor:'rgba(201,162,75,.25)',color:'var(--go)',padding:'4px 6px'}} onClick={()=>setDeleteConfirm(`revertref-${p.id}`)} title={`Revert referral by ${referredBy.username} (foul play)`}>↩</button>))}
                        {deleteConfirm===`profile-${p.id}`?(<>
                          <button className="xbtn" style={{background:'rgba(176,74,85,.22)',borderColor:'rgba(176,74,85,.45)',color:'#fff',fontWeight:700,padding:'4px 6px'}} onClick={()=>deleteAffiliate(p.id)}>✓</button>
                          <button className="xbtn" style={{background:'var(--card2)',borderColor:'var(--bo)',color:'var(--tx3)',padding:'4px 6px'}} onClick={()=>setDeleteConfirm(null)}>×</button>
                        </>):(<button className="xbtn" style={{background:'rgba(176,74,85,.08)',borderColor:'rgba(176,74,85,.2)',color:'var(--re)',padding:'4px 6px'}} onClick={()=>setDeleteConfirm(`profile-${p.id}`)} title="Delete this affiliate's profile and all their data">🗑️</button>)}
                      </div>
                    </div>);
                  })}
                </div>
              ):(
                /* MOBILE — per-card layout */
                sorted.map(p=>{
                  const plv=getLv(p.xp,LEVELS);
                  const pnx=getNx(p.xp,LEVELS);
                  const ppct=xpPct(p.xp,LEVELS);
                  const netGMV=Math.max(0,(p.total_gmv||0)-(p.total_cancelled_gmv||0));
                  const netComm=Math.max(0,(p.total_commission||0)-((p.total_gmv||0)>0?(p.total_commission||0)*((p.total_cancelled_gmv||0)/(p.total_gmv||1)):0));
                  const referredBy=p.referred_by?profileById[p.referred_by]:null;
                  const referralCount=(referralsByReferrer[p.id]||[]).length;
                  return(<div key={p.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:14,padding:'14px',marginBottom:10}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                      <div style={{width:38,height:38,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:13,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:14,fontWeight:600}}>{p.username}</div>
                        <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{(p.tiktok_handles||[]).join(' · ')}</div>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <div style={{fontFamily:'var(--fh)',fontSize:16,color:'var(--pu2)'}}>{(p.xp||0).toLocaleString()} XP</div>
                        <div style={{fontSize:10,color:'var(--tx3)'}}>Level {plv.level}</div>
                      </div>
                    </div>
                    {(referredBy||referralCount>0)&&(
                      <div style={{display:'flex',gap:5,flexWrap:'wrap',marginBottom:12}}>
                        {referredBy&&(<span style={{display:'inline-flex',alignItems:'center',gap:4,background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.22)',borderRadius:99,padding:'3px 9px',fontSize:10,color:'var(--pu2)',fontWeight:600}}>↩ Referred by <strong style={{color:'#fff',fontWeight:700,marginLeft:3}}>{referredBy.username}</strong></span>)}
                        {referralCount>0&&(<span style={{display:'inline-flex',alignItems:'center',gap:4,background:'rgba(107,155,125,.1)',border:'1px solid rgba(107,155,125,.25)',borderRadius:99,padding:'3px 9px',fontSize:10,color:'var(--gr)',fontWeight:700}}>👥 Referred {referralCount}</span>)}
                      </div>
                    )}
                    <div style={{marginBottom:12}}>
                      <div style={{height:6,background:'var(--card3)',borderRadius:99,overflow:'hidden'}}>
                        <div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg,var(--pu),var(--cy))',width:`${ppct}%`,transition:'width .5s'}}/>
                      </div>
                      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--tx3)',marginTop:3}}>
                        <span>Lvl {plv.level}</span>
                        <span>{pnx?`${(pnx.min-(p.xp||0)).toLocaleString()} XP to Lvl ${pnx.level}`:'MAX'}</span>
                      </div>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:12}}>
                      {[
                        {label:'Net GMV',val:fmtGBP(netGMV),color:'var(--gr)'},
                        {label:'Commission',val:fmtGBP(netComm),color:'var(--go)'},
                        {label:'Orders',val:(p.total_orders||0).toLocaleString(),color:'var(--tx)'},
                        {label:'Units Sold',val:(p.total_sales||0).toLocaleString(),color:'var(--tx)'},
                        {label:'Returns',val:`${p.total_cancelled||0} (${fmtGBP(p.total_cancelled_gmv||0)})`,color:'var(--re)'},
                        {label:'Streak',val:`🔥 ${p.streak||0} days`,color:'var(--go)'},
                      ].map((s,si)=>(
                        <div key={si} style={{background:'var(--card2)',borderRadius:8,padding:'7px 8px'}}>
                          <div style={{fontFamily:'var(--fh)',fontSize:13,color:s.color,lineHeight:1}}>{s.val}</div>
                          <div style={{fontSize:8,color:'var(--tx3)',marginTop:3,textTransform:'uppercase',letterSpacing:.5}}>{s.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:'flex',gap:5,alignItems:'center',flexWrap:'wrap'}}>
                      <input className="xpin" type="number" min="1" value={xpAmounts[p.id]||100} onChange={e=>setXpAmounts({...xpAmounts,[p.id]:parseInt(e.target.value)||100})} style={{flex:1,minWidth:60}}/>
                      <button className="xbtn" onClick={()=>admAwardXP(p.id)}>+XP</button>
                      <button className="xbtn" style={{background:'rgba(176,74,85,.14)',borderColor:'rgba(176,74,85,.26)',color:'var(--re)'}} onClick={()=>admAwardXP(p.id,true)}>-XP</button>
                      <button className="xbtn" style={{background:'rgba(139,164,168,.14)',borderColor:'rgba(139,164,168,.26)',color:'var(--cy)'}} onClick={()=>openEditAffiliate(p)}>✏️ Edit</button>
                      {deleteConfirm===`profile-${p.id}`?(<>
                        <button className="xbtn" style={{background:'rgba(176,74,85,.22)',borderColor:'rgba(176,74,85,.45)',color:'#fff',fontWeight:700}} onClick={()=>deleteAffiliate(p.id)}>✓ Delete forever</button>
                        <button className="xbtn" style={{background:'var(--card2)',borderColor:'var(--bo)',color:'var(--tx3)'}} onClick={()=>setDeleteConfirm(null)}>Cancel</button>
                      </>):(<button className="xbtn" style={{background:'rgba(176,74,85,.08)',borderColor:'rgba(176,74,85,.2)',color:'var(--re)'}} onClick={()=>setDeleteConfirm(`profile-${p.id}`)} title="Delete this affiliate's profile and all their data">🗑️</button>)}
                    </div>
                  </div>);
                })
              )}
            </>);
          })()}
        </div>)}
        {/* REFERRALS — dedicated dashboard for the referral programme */}
        {adminTab==='referrals'&&(()=>{
          const fmtGBPc=(n)=>{const v=n||0;return Math.abs(v)>=1000?'£'+Math.round(v).toLocaleString('en-GB'):'£'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});};
          // Period filter — when set, GMV/Orders/Earned reflect activity within
          // the window only. Paid/Owed stay cumulative because payouts are
          // monthly artefacts that don't map cleanly to rolling-day windows.
          const refWin=periodWindow(referralPeriod,referralCustomStart,referralCustomEnd);
          // Per-referrer roll-up. When a period is selected, derive GMV/orders
          // from adminPeriodEvents (already loaded for last 60 days) filtered
          // to events whose profile_id is one of the referrer's referrals.
          const referrers=[...allProfiles].map(p=>{
            const kids=referralsByReferrer[p.id]||[];
            // Per-kid breakdown for the drill-down. Net GMV/orders respect the
            // selected period (events) or fall back to cumulative totals (all-time).
            const kidStats=kids.map(k=>{
              let net,orders;
              if(refWin){
                const evts=adminPeriodEvents.filter(e=>{if(e.profile_id!==k.id)return false;const d=new Date(e.created_at);return d>=refWin.from&&d<refWin.to;});
                net=evts.reduce((s,e)=>s+Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0)),0);
                orders=evts.reduce((s,e)=>s+(e.orders||0),0);
              }else{
                net=Math.max(0,(k.total_gmv||0)-(k.total_cancelled_gmv||0));
                orders=k.total_orders||0;
              }
              return{...k,_net:net,_orders:orders,_earned:net*0.01};
            }).sort((a,b)=>b._net-a._net);
            const refGMV=kidStats.reduce((s,k)=>s+k._net,0);
            const refOrders=kidStats.reduce((s,k)=>s+k._orders,0);
            // Derive 1% from referred net GMV (same basis as generatePayouts) rather
            // than the denormalized referral_earnings field, which drifts.
            const earned=refGMV*0.01;
            const myPayouts=adminPayouts.filter(po=>po.profile_id===p.id);
            return{...p,_refs:kids.length,_kids:kids,_kidStats:kidStats,_refGMV:refGMV,_refOrders:refOrders,_earned:earned,_paid:myPayouts.filter(po=>po.paid).reduce((s,po)=>s+(po.amount||0),0),_owed:myPayouts.filter(po=>!po.paid).reduce((s,po)=>s+(po.amount||0),0)};
          }).filter(p=>p._refs>0).sort((a,b)=>b._refGMV-a._refGMV);
          const totalReferrers=referrers.length;
          const totalReferred=referrers.reduce((s,r)=>s+r._refs,0);
          const totalReferredGMV=referrers.reduce((s,r)=>s+r._refGMV,0);
          const totalEarned=referrers.reduce((s,r)=>s+r._earned,0);
          const totalPaid=referrers.reduce((s,r)=>s+r._paid,0);
          const totalOwed=referrers.reduce((s,r)=>s+r._owed,0);
          // Recent signups via referral — filtered by signup date when a period is on.
          const recentReferred=[...allProfiles].filter(p=>p.referred_by&&profileById[p.referred_by]).filter(p=>{if(!refWin)return true;const d=new Date(p.created_at||0);return d>=refWin.from&&d<refWin.to;}).sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,8);
          // Referral tree (collapsible at the bottom of the page).
          const roots=allProfiles.filter(p=>!p.referred_by||!profileById[p.referred_by]);
          const RefNode=({p,depth})=>{
            const kids=referralsByReferrer[p.id]||[];
            const myNetGMV=Math.max(0,(p.total_gmv||0)-(p.total_cancelled_gmv||0));
            return(
              <div style={{marginLeft:depth*16,paddingLeft:depth>0?10:0,borderLeft:depth>0?'1px dashed var(--bo)':'none',marginBottom:4}}>
                <div style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0'}}>
                  <div style={{width:24,height:24,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:10,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}{kids.length>0&&<span style={{fontSize:10,color:'var(--pu2)',marginLeft:6,fontWeight:500}}>referred {kids.length}</span>}</div>
                    <div style={{fontSize:10,color:'var(--tx3)'}}>{(p.xp||0).toLocaleString()} XP · {fmtGBP(myNetGMV)} net GMV</div>
                  </div>
                </div>
                {kids.length>0&&kids.map(k=><RefNode key={k.id} p={k} depth={depth+1}/>)}
              </div>
            );
          };
          return(<>
            {/* HERO STRIP */}
            <div style={{background:'linear-gradient(135deg,rgba(201,162,75,.14) 0%,rgba(139,164,168,.06) 60%,rgba(201,162,75,.05) 100%)',border:'1px solid var(--bo2)',borderRadius:16,padding:isDesktop?'20px 22px':'16px',marginBottom:11,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,75,.16) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,position:'relative',flexWrap:'wrap',gap:10}}>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <span style={{fontSize:isDesktop?26:22,filter:'drop-shadow(0 2px 6px rgba(201,162,75,.3))'}}>🔗</span>
                  <div>
                    <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?22:18,letterSpacing:2.5,lineHeight:1}}>REFERRAL PROGRAMME</div>
                    <div style={{fontSize:11,color:'var(--tx3)',marginTop:4,letterSpacing:.3}}>{referralPeriod==='all'?'All time · 1% of every referred creator\'s net GMV':referralPeriod==='today'?'Yesterday\'s referral activity':referralPeriod==='7d'?'Last 7 days of referral activity':referralPeriod==='30d'?'Last 30 days of referral activity':referralCustomStart&&referralCustomEnd?`${new Date(referralCustomStart).toLocaleDateString('en-GB')} → ${new Date(referralCustomEnd).toLocaleDateString('en-GB')}`:'Pick a custom range'}</div>
                  </div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                  <div className="aseg">
                    {[['today','Yesterday'],['7d','7d'],['30d','30d'],['all','All-time'],['custom','Custom']].map(([v,l])=>(
                      <button key={v} className={referralPeriod===v?'on':''} onClick={()=>setReferralPeriod(v)}>{l}</button>
                    ))}
                  </div>
                  {referralPeriod==='custom'&&(<>
                    <input type="date" value={referralCustomStart} onChange={e=>setReferralCustomStart(e.target.value)} style={{padding:'5px 8px',background:'rgba(201,162,75,.12)',border:'1px solid rgba(201,162,75,.4)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none',colorScheme:'dark'}}/>
                    <span style={{color:'var(--tx3)',fontSize:11}}>→</span>
                    <input type="date" value={referralCustomEnd} onChange={e=>setReferralCustomEnd(e.target.value)} style={{padding:'5px 8px',background:'rgba(201,162,75,.12)',border:'1px solid rgba(201,162,75,.4)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none',colorScheme:'dark'}}/>
                  </>)}
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(6, 1fr)':'1fr 1fr',gap:10,position:'relative'}}>
                <div className="ahk"><div className="ahkl">Active Referrers</div><div className="ahkv" style={{color:'var(--pu2)'}}>{totalReferrers}</div><div className="ahkd"><span className="vs">creators sharing</span></div></div>
                <div className="ahk"><div className="ahkl">Referred Users</div><div className="ahkv" style={{color:'var(--cy)'}}>{totalReferred}</div><div className="ahkd"><span className="vs">signed up via link</span></div></div>
                <div className="ahk"><div className="ahkl">Referred Net GMV</div><div className="ahkv" style={{color:'var(--gr)'}}>{fmtGBPc(totalReferredGMV)}</div><div className="ahkd"><span className="vs">from referred sales</span></div></div>
                <div className="ahk"><div className="ahkl">Earned (1%)</div><div className="ahkv" style={{color:'var(--go)'}}>{fmtGBPc(totalEarned)}</div><div className="ahkd"><span className="vs">total accrued</span></div></div>
                <div className="ahk"><div className="ahkl">Paid Out</div><div className="ahkv" style={{color:'var(--gr)'}}>{fmtGBPc(totalPaid)}</div><div className="ahkd"><span className="vs">marked as paid</span></div></div>
                <div className="ahk"><div className="ahkl">Owed</div><div className="ahkv" style={{color:'var(--go)'}}>{fmtGBPc(totalOwed)}</div><div className="ahkd"><span className="vs">pending payouts</span></div></div>
              </div>
            </div>
            {/* REFERRERS LEADERBOARD TABLE */}
            <div className="asec">
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                <span style={{fontSize:14}}>🏆</span>
                <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>TOP REFERRERS</span>
                <span style={{marginLeft:'auto',fontSize:10,color:'var(--pu2)',fontWeight:600,letterSpacing:.3,cursor:'pointer'}} onClick={()=>setAdminTab('payouts')}>Manage payouts →</span>
              </div>
              {referrers.length===0?(
                <div style={{padding:'18px 8px',textAlign:'center',color:'var(--tx3)',fontSize:12}}>No referrals yet — share your link to start earning 1%.</div>
              ):isDesktop?(
                <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,overflowX:'auto'}}>
                  <div style={{display:'grid',gridTemplateColumns:'34px minmax(160px, 1fr) 70px 110px 90px 100px 90px 90px',gap:6,padding:'10px 14px',borderBottom:'1px solid var(--bo2)',background:'rgba(255,255,255,.025)',fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:700,alignItems:'center',minWidth:780}}>
                    <span>#</span><span>Referrer</span><span style={{textAlign:'right'}}>Refs</span><span style={{textAlign:'right'}}>Referred GMV</span><span style={{textAlign:'right'}}>Orders</span><span style={{textAlign:'right'}}>Earned 1%</span><span style={{textAlign:'right'}}>Paid</span><span style={{textAlign:'right'}}>Owed</span>
                  </div>
                  {referrers.map((p,i)=>{const open=expandedReferrer===p.id;return(
                    <React.Fragment key={p.id}>
                    <div onClick={()=>setExpandedReferrer(open?null:p.id)} style={{display:'grid',gridTemplateColumns:'34px minmax(160px, 1fr) 70px 110px 90px 100px 90px 90px',gap:6,padding:'11px 14px',borderBottom:(open||i<referrers.length-1)?'1px solid var(--bo)':'none',alignItems:'center',fontSize:12,minWidth:780,cursor:'pointer',background:open?'rgba(201,162,75,.06)':'transparent'}}>
                      <span style={{fontFamily:'var(--fh)',fontSize:14,color:i===0?'#c9a24b':i===1?'#bbb':i===2?'#cd7f32':'var(--tx3)'}}>{i+1}</span>
                      <div style={{display:'flex',gap:9,alignItems:'center',minWidth:0}}>
                        <span style={{fontSize:10,color:'var(--tx3)',transform:open?'rotate(90deg)':'none',transition:'transform .18s ease',flexShrink:0}}>▸</span>
                        <div style={{width:30,height:30,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}</div>
                          <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
                        </div>
                      </div>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:14,color:'var(--pu2)'}}>{p._refs}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--gr)'}}>{fmtGBPc(p._refGMV)}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--cy)'}}>{p._refOrders.toLocaleString()}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--go)'}}>{fmtGBPc(p._earned)}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--gr)'}}>{fmtGBPc(p._paid)}</span>
                      <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:p._owed>0?'var(--go)':'var(--tx3)'}}>{fmtGBPc(p._owed)}</span>
                    </div>
                    {open&&(
                      <div style={{borderBottom:i<referrers.length-1?'1px solid var(--bo)':'none',background:'rgba(0,0,0,.18)',padding:'4px 14px 10px 44px',minWidth:780}}>
                        <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:700,padding:'8px 0 4px'}}>Referred creators · {p._kidStats.length}</div>
                        <div style={{display:'grid',gridTemplateColumns:'minmax(160px,1fr) 110px 90px 100px',gap:6,padding:'0 0 6px',fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.6,fontWeight:600}}>
                          <span>Creator</span><span style={{textAlign:'right'}}>Net GMV</span><span style={{textAlign:'right'}}>Orders</span><span style={{textAlign:'right'}}>Earned 1%</span>
                        </div>
                        {p._kidStats.map(k=>(
                          <div key={k.id} style={{display:'grid',gridTemplateColumns:'minmax(160px,1fr) 110px 90px 100px',gap:6,padding:'7px 0',borderTop:'1px solid var(--bo)',alignItems:'center',fontSize:12}}>
                            <div style={{display:'flex',gap:8,alignItems:'center',minWidth:0}}>
                              <div style={{width:24,height:24,borderRadius:'50%',background:k.avatar_url?'transparent':avc(k.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:9,color:'#fff',flexShrink:0,overflow:'hidden'}}>{k.avatar_url?<img src={k.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(k.username)}</div>
                              <div style={{minWidth:0}}>
                                <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.username}</div>
                                <div style={{fontSize:9.5,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(k.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
                              </div>
                            </div>
                            <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--gr)'}}>{fmtGBPc(k._net)}</span>
                            <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--cy)'}}>{k._orders.toLocaleString()}</span>
                            <span style={{textAlign:'right',fontFamily:'var(--fh)',fontSize:13,color:'var(--go)'}}>{fmtGBPc(k._earned)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    </React.Fragment>
                  );})}
                </div>
              ):(
                /* Mobile — stacked cards */
                referrers.map((p,i)=>{const open=expandedReferrer===p.id;return(
                  <div key={p.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,padding:12,marginBottom:8}}>
                    <div onClick={()=>setExpandedReferrer(open?null:p.id)} style={{display:'flex',alignItems:'center',gap:10,marginBottom:8,cursor:'pointer'}}>
                      <span style={{fontFamily:'var(--fh)',fontSize:15,width:20,textAlign:'center',color:i===0?'#c9a24b':i===1?'#bbb':i===2?'#cd7f32':'var(--tx3)'}}>{i+1}</span>
                      <div style={{width:32,height:32,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600}}>{p.username}</div>
                        <div style={{fontSize:10,color:'var(--tx3)'}}>{(p.tiktok_handles||[]).slice(0,1).join('')||'—'} · {p._refs} referred</div>
                      </div>
                      <span style={{fontSize:11,color:'var(--tx3)',transform:open?'rotate(90deg)':'none',transition:'transform .18s ease'}}>▸</span>
                    </div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
                      <div className="asub"><div className="asubl">Ref GMV</div><div className="asubv" style={{color:'var(--gr)'}}>{fmtGBPc(p._refGMV)}</div></div>
                      <div className="asub"><div className="asubl">Earned</div><div className="asubv" style={{color:'var(--go)'}}>{fmtGBPc(p._earned)}</div></div>
                      <div className="asub"><div className="asubl">Owed</div><div className="asubv" style={{color:p._owed>0?'var(--go)':'var(--tx3)'}}>{fmtGBPc(p._owed)}</div></div>
                    </div>
                    {open&&(
                      <div style={{marginTop:10,paddingTop:8,borderTop:'1px solid var(--bo2)'}}>
                        <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:700,marginBottom:4}}>Referred creators · {p._kidStats.length}</div>
                        {p._kidStats.map(k=>(
                          <div key={k.id} style={{display:'flex',alignItems:'center',gap:9,padding:'7px 0',borderTop:'1px solid var(--bo)'}}>
                            <div style={{width:26,height:26,borderRadius:'50%',background:k.avatar_url?'transparent':avc(k.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:9,color:'#fff',flexShrink:0,overflow:'hidden'}}>{k.avatar_url?<img src={k.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(k.username)}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{fontSize:12,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{k.username}</div>
                              <div style={{fontSize:9.5,color:'var(--tx3)'}}>{fmtGBPc(k._net)} net · {k._orders.toLocaleString()} orders</div>
                            </div>
                            <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--go)',flexShrink:0}}>{fmtGBPc(k._earned)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );})
              )}
            </div>
            {/* RECENT REFERRAL SIGNUPS */}
            {recentReferred.length>0&&(
              <div className="asec">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11}}>
                  <span style={{fontSize:14}}>📋</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>RECENT SIGNUPS</span>
                  <span style={{marginLeft:'auto',fontSize:10,color:'var(--tx3)',letterSpacing:.3}}>Newest first</span>
                </div>
                {recentReferred.map((p,i)=>{
                  const refBy=profileById[p.referred_by];
                  const myNetGMV=Math.max(0,(p.total_gmv||0)-(p.total_cancelled_gmv||0));
                  const when=p.created_at?new Date(p.created_at).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}):'—';
                  return(
                    <div key={p.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<recentReferred.length-1?'1px solid var(--bo)':'none'}}>
                      <div style={{width:30,height:30,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:12.5,fontWeight:600}}>{p.username} <span style={{fontSize:10,color:'var(--tx3)',fontWeight:500}}>joined via</span> <span style={{color:'var(--pu2)',fontWeight:600}}>{refBy?.username||'—'}</span></div>
                        <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{when} · {fmtGBPc(myNetGMV)} net GMV since</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* REFERRAL TREE (collapsible) */}
            <div className="asec" style={{padding:0,overflow:'hidden'}}>
              <button onClick={()=>setShowReferralTree(!showReferralTree)} style={{width:'100%',background:'none',border:'none',padding:'13px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',color:'var(--tx)',fontFamily:'var(--fb)'}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:12,display:'inline-block',transform:showReferralTree?'rotate(90deg)':'none',transition:'transform .15s'}}>▶</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>🌳 REFERRAL TREE</span>
                </div>
                <span style={{fontSize:10,color:'var(--tx3)'}}>{totalReferred} referred · {roots.length} root{roots.length===1?'':'s'}</span>
              </button>
              {showReferralTree&&(
                <div style={{padding:'4px 16px 14px',borderTop:'1px solid var(--bo)',maxHeight:420,overflowY:'auto'}}>
                  {roots.length===0?(<div style={{fontSize:11,color:'var(--tx3)',textAlign:'center',padding:'10px 0'}}>No affiliates yet.</div>):roots.sort((a,b)=>(referralsByReferrer[b.id]?.length||0)-(referralsByReferrer[a.id]?.length||0)).map(r=><RefNode key={r.id} p={r} depth={0}/>)}
                </div>
              )}
            </div>
          </>);
        })()}
        {/* DISCORD — checklist of pending Discord-role bumps for affiliates that have levelled up since the admin last acknowledged their role. */}
        {adminTab==='discord'&&!adminProfilesLoaded&&(
          <div className="asec" style={{padding:'24px 18px'}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 4px',borderBottom:i<3?'1px solid var(--bo)':'none',opacity:.6-i*0.12}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:'var(--card2)',animation:'ll-pulse 1.4s ease-in-out infinite',flexShrink:0}}/>
                <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                  <div style={{height:12,width:'35%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                  <div style={{height:9,width:'22%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                </div>
                <div style={{width:80,height:26,background:'var(--card2)',borderRadius:6,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
              </div>
            ))}
            <div style={{textAlign:'center',fontSize:11,color:'var(--tx3)',marginTop:14,letterSpacing:.3}}>Loading Discord roles…</div>
          </div>
        )}
        {adminTab==='discord'&&adminProfilesLoaded&&(()=>{
          const fmtGBPc=(n)=>{const v=n||0;return Math.abs(v)>=1000?'£'+Math.round(v).toLocaleString('en-GB'):'£'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});};
          // _curLevel = the level displayed on their profile / leaderboard (getLv).
          // Discord roles mirror that convention: someone in the L7 XP band gets
          // the "Hollen Level 7" Discord role. achievedLevel is used elsewhere
          // for reward-payout logic, not for role display.
          const pending=allProfiles.map(p=>{const lv=getLv(p.xp,LEVELS).level;return{...p,_curLevel:lv,_lastLevel:p.discord_level??0};}).filter(p=>p._curLevel>p._lastLevel).sort((a,b)=>(b._curLevel-b._lastLevel)-(a._curLevel-a._lastLevel)||b._curLevel-a._curLevel);
          const totalAffiliates=allProfiles.length;
          return(<>
            {/* HERO */}
            <div style={{background:'linear-gradient(135deg,rgba(88,101,242,.18) 0%,rgba(201,162,75,.10) 60%,rgba(139,164,168,.06) 100%)',border:'1px solid var(--bo2)',borderRadius:16,padding:isDesktop?'20px 22px':'16px',marginBottom:11,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle,rgba(88,101,242,.22) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14,position:'relative'}}>
                <span style={{fontSize:isDesktop?26:22,filter:'drop-shadow(0 2px 6px rgba(88,101,242,.4))'}}>🎮</span>
                <div>
                  <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?22:18,letterSpacing:2.5,lineHeight:1}}>DISCORD ROLE UPDATES</div>
                  <div style={{fontSize:11,color:'var(--tx3)',marginTop:4,letterSpacing:.3}}>Tick affiliates off after you've bumped their Discord role</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(3, 1fr)':'1fr 1fr 1fr',gap:8,position:'relative'}}>
                <div className="ahk"><div className="ahkl">Pending updates</div><div className="ahkv" style={{color:pending.length>0?'#5865F2':'var(--gr)'}}>{pending.length}</div><div className="ahkd"><span className="vs">need a role bump</span></div></div>
                <div className="ahk"><div className="ahkl">Affiliates tracked</div><div className="ahkv" style={{color:'var(--pu2)'}}>{totalAffiliates}</div><div className="ahkd"><span className="vs">all-time</span></div></div>
                <div className="ahk"><div className="ahkl">Up to date</div><div className="ahkv" style={{color:'var(--gr)'}}>{totalAffiliates-pending.length}</div><div className="ahkd"><span className="vs">role matches level</span></div></div>
              </div>
            </div>
            {pending.length===0?(
              <div className="asec" style={{padding:'40px 18px',textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:10,opacity:.6}}>✨</div>
                <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',marginBottom:6}}>All caught up</div>
                <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5,maxWidth:300,margin:'0 auto'}}>Everyone's Discord role matches their current level. New level-ups will show up here automatically.</div>
              </div>
            ):(
              <div className="asec">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11,flexWrap:'wrap'}}>
                  <span style={{fontSize:14}}>📋</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>PENDING ROLE UPDATES</span>
                  <span style={{background:'#5865F2',color:'#fff',fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:700,letterSpacing:.3}}>{pending.length}</span>
                  <button onClick={markAllDiscordRolesUpdated} style={{marginLeft:'auto',padding:'5px 11px',background:'rgba(88,101,242,.15)',border:'1px solid rgba(88,101,242,.4)',color:'#a5b4fc',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)'}}>✓ Mark all updated</button>
                </div>
                <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10,lineHeight:1.5}}>Bump their role in Discord, then tick them off. First-time users: hit 'Mark all updated' once to set everyone to their current level.</div>
                {isDesktop?(
                  <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,overflow:'hidden'}}>
                    <div style={{display:'grid',gridTemplateColumns:'34px minmax(150px, 1fr) minmax(140px, 1fr) 90px 130px',gap:6,padding:'10px 14px',borderBottom:'1px solid var(--bo2)',background:'rgba(255,255,255,.025)',fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:700,alignItems:'center'}}>
                      <span>#</span><span>Affiliate</span><span>Handles</span><span style={{textAlign:'center'}}>Level</span><span style={{textAlign:'right'}}>Action</span>
                    </div>
                    {pending.map((p,i)=>(
                      <div key={p.id} style={{display:'grid',gridTemplateColumns:'34px minmax(150px, 1fr) minmax(140px, 1fr) 90px 130px',gap:6,padding:'11px 14px',borderBottom:i<pending.length-1?'1px solid var(--bo)':'none',alignItems:'center',fontSize:12}}>
                        <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--tx3)'}}>{i+1}</span>
                        <div style={{display:'flex',gap:9,alignItems:'center',minWidth:0}}>
                          <div style={{width:30,height:30,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                          <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}</div>
                        </div>
                        <div style={{fontSize:11,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,2).join(' · ')||'—'}</div>
                        <div style={{textAlign:'center',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
                          <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--tx3)'}}>L{p._lastLevel||'—'}</span>
                          <span style={{color:'var(--tx3)',fontSize:11}}>→</span>
                          <span style={{fontFamily:'var(--fh)',fontSize:14,color:'#a5b4fc',padding:'2px 7px',background:'rgba(88,101,242,.18)',borderRadius:6}}>L{p._curLevel}</span>
                        </div>
                        <button onClick={()=>markDiscordRoleUpdated(p.id,p._curLevel)} style={{padding:'6px 10px',background:'rgba(107,155,125,.14)',border:'1px solid rgba(107,155,125,.32)',color:'var(--gr)',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)',justifySelf:'end'}}>✓ Mark updated</button>
                      </div>
                    ))}
                  </div>
                ):(
                  pending.map((p,i)=>(
                    <div key={p.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,padding:'12px 13px',marginBottom:8}}>
                      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:9}}>
                        <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--tx3)',width:20,textAlign:'center'}}>{i+1}</span>
                        <div style={{width:32,height:32,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:600}}>{p.username}</div>
                          <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,2).join(' · ')||'—'}</div>
                        </div>
                        <div style={{display:'flex',alignItems:'center',gap:5,flexShrink:0}}>
                          <span style={{fontFamily:'var(--fh)',fontSize:12,color:'var(--tx3)'}}>L{p._lastLevel||'—'}</span>
                          <span style={{color:'var(--tx3)',fontSize:10}}>→</span>
                          <span style={{fontFamily:'var(--fh)',fontSize:14,color:'#a5b4fc',padding:'2px 7px',background:'rgba(88,101,242,.18)',borderRadius:6}}>L{p._curLevel}</span>
                        </div>
                      </div>
                      <button onClick={()=>markDiscordRoleUpdated(p.id,p._curLevel)} style={{width:'100%',padding:'8px',background:'rgba(107,155,125,.14)',border:'1px solid rgba(107,155,125,.32)',color:'var(--gr)',fontSize:12,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)'}}>✓ Mark Discord role updated</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </>);
        })()}
        {/* REWARDS OWED — per-affiliate checklist of physical reward deliveries owed.
            Uses rewards.value to compute £ totals and rewards_delivered_level to
            track who's been paid out vs. who's still owed. */}
        {adminTab==='rewardsowed'&&(()=>{
          const fmtGBPc=(n)=>{const v=n||0;return Math.abs(v)>=1000?'£'+Math.round(v).toLocaleString('en-GB'):'£'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});};
          // Build per-level lookup of name + value from the rewards collection.
          const rewardByLevel={};
          rewards.forEach(r=>{rewardByLevel[r.level]={name:r.name,value:Number(r.value||0),image:r.image_url};});
          // Compute owed tiers per affiliate. Owed = any reward tier the
          // affiliate has achieved (xp >= xp_required) but is NOT in their
          // redeemed-levels set. Order is preserved by level so the rows
          // read L1, L2, L3 etc.
          const enriched=allProfiles.map(p=>{
            const cur=achievedLevel(p.xp,rewards);
            const redeemed=redeemedLevelsFor(p);
            const redeemedCash=redeemedCashLevelsFor(p);
            const amounts=redemptionAmountsFor(p);
            const owedLevels=[];
            for(let l=1;l<=cur;l++){
              if(rewardByLevel[l]&&!redeemed.has(l)){
                const crossedAt=affiliateUnlockDates[p.id]?.[l]||null;
                owedLevels.push({level:l,...rewardByLevel[l],crossedAt,dueDate:payoutDueDate(crossedAt)});
              }
            }
            const owedValue=owedLevels.reduce((s,r)=>s+(r.value||0),0);
            // Delivered value prefers the stored override (admin-typed actual £)
            // when present; else falls back to product 100% or cash 80% of catalog.
            const redeemedValue=Array.from(redeemed).reduce((s,l)=>{
              const stored=amounts[String(l)];
              if(typeof stored==='number'&&!isNaN(stored))return s+stored;
              const v=(rewardByLevel[l]?.value)||0;
              return s+(redeemedCash.has(l)?v*0.8:v);
            },0);
            // Stable sort key — the earliest cross date across ANY achieved tier
            // for this affiliate. Doesn't change as individual tiers get redeemed,
            // so the row stays put while the admin works through it.
            const allCrosses=Object.values(affiliateUnlockDates[p.id]||{}).map(x=>x?new Date(x).getTime():null).filter(x=>x);
            const oldestCross=allCrosses.length?Math.min(...allCrosses):null;
            return{...p,_curLevel:cur,_redeemed:redeemed,_redeemedCash:redeemedCash,_redeemedAmounts:amounts,_owedLevels:owedLevels,_owedValue:owedValue,_redeemedValue:redeemedValue,_oldestCross:oldestCross};
          });
          const pending=enriched.filter(p=>p._owedLevels.length>0).sort((a,b)=>{
            if(a._oldestCross==null&&b._oldestCross==null)return b._owedValue-a._owedValue;
            if(a._oldestCross==null)return 1;
            if(b._oldestCross==null)return -1;
            // Earliest crosser first (longest waiting). Tie-break on id for full
            // determinism so two affiliates with identical cross times don't swap.
            return a._oldestCross-b._oldestCross||(a.id<b.id?-1:1);
          });
          const delivered=enriched.filter(p=>p._owedLevels.length===0);
          // Hero totals.
          const totalOwedValue=pending.reduce((s,p)=>s+p._owedValue,0);
          const totalDeliveredValue=enriched.reduce((s,p)=>{
            return s+p._redeemedValue;
          },0);
          // Total number of individual tier deliveries — powers the Delivered
          // tab badge. Filters out levels that no longer map to a live reward.
          const totalDelivered=enriched.reduce((s,p)=>s+Array.from(p._redeemed).filter(l=>l>=1&&l<=p._curLevel&&rewardByLevel[l]).length,0);
          const missingValues=rewards.filter(r=>!r.value||Number(r.value)===0).length;
          return(<>
            {/* HERO STRIP */}
            <div style={{background:'linear-gradient(135deg,rgba(201,162,75,.14) 0%,rgba(201,162,75,.06) 60%,rgba(107,155,125,.05) 100%)',border:'1px solid var(--bo2)',borderRadius:16,padding:isDesktop?'20px 22px':'16px',marginBottom:11,position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-60,right:-60,width:200,height:200,borderRadius:'50%',background:'radial-gradient(circle,rgba(201,162,75,.22) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14,position:'relative'}}>
                <span style={{fontSize:isDesktop?26:22,filter:'drop-shadow(0 2px 6px rgba(201,162,75,.4))'}}>🎁</span>
                <div>
                  <div style={{fontFamily:'var(--fh)',fontSize:isDesktop?22:18,letterSpacing:2.5,lineHeight:1}}>REWARDS OWED</div>
                  <div style={{fontSize:11,color:'var(--tx3)',marginTop:4,letterSpacing:.3}}>Tick affiliates off after dispatching their level rewards</div>
                </div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:isDesktop?'repeat(4, 1fr)':'1fr 1fr',gap:8,position:'relative'}}>
                <div className="ahk"><div className="ahkl">Total owed</div><div className="ahkv" style={{color:'#c9a24b'}}>{fmtGBPc(totalOwedValue)}</div><div className="ahkd"><span className="vs">{totalOwedValue>0?`or ${fmtGBPc(totalOwedValue*0.8)} cash · `:''}across {pending.length} affiliate{pending.length===1?'':'s'}</span></div></div>
                <div className="ahk"><div className="ahkl">Already delivered</div><div className="ahkv" style={{color:'var(--gr)'}}>{fmtGBPc(totalDeliveredValue)}</div><div className="ahkd"><span className="vs">cumulative</span></div></div>
                <div className="ahk"><div className="ahkl">Pending</div><div className="ahkv" style={{color:pending.length>0?'#c9a24b':'var(--gr)'}}>{pending.length}</div><div className="ahkd"><span className="vs">affiliate{pending.length===1?'':'s'} waiting</span></div></div>
                <div className="ahk"><div className="ahkl">Up to date</div><div className="ahkv" style={{color:'var(--gr)'}}>{delivered.length}</div><div className="ahkd"><span className="vs">level rewards delivered</span></div></div>
              </div>
            </div>
            {/* Admin RPC failure — surfaces when the client couldn't fetch the
                gated rewards.value column (is_admin not set, migration not run, etc). */}
            {adminRewardValuesError&&(
              <div className="asec" style={{padding:'12px 14px',background:'rgba(176,74,85,.1)',border:'1px solid rgba(176,74,85,.35)',display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                <span style={{fontSize:18}}>🔒</span>
                <div style={{flex:1,fontSize:12,color:'var(--tx2)',lineHeight:1.5}}>
                  <strong style={{color:'#c48a92'}}>Couldn't load reward £ values.</strong>{' '}
                  Check: <code style={{background:'rgba(255,255,255,.05)',padding:'1px 5px',borderRadius:4,fontSize:11}}>{"UPDATE profiles SET is_admin = TRUE WHERE id = '<your-auth-id>'"}</code> in Supabase, and that migration <code style={{background:'rgba(255,255,255,.05)',padding:'1px 5px',borderRadius:4,fontSize:11}}>0005</code> has been applied. Server said: <em style={{color:'var(--tx3)'}}>{adminRewardValuesError}</em>
                </div>
              </div>
            )}
            {/* Missing values nudge */}
            {missingValues>0&&!adminRewardValuesError&&(
              <div className="asec" style={{padding:'12px 14px',background:'rgba(201,162,75,.08)',border:'1px solid rgba(201,162,75,.3)',display:'flex',alignItems:'center',gap:10}}>
                <span style={{fontSize:18}}>⚠️</span>
                <div style={{flex:1,fontSize:12,color:'var(--tx2)'}}>{missingValues} reward tier{missingValues===1?'':'s'} {missingValues===1?'has':'have'} no £ value set — owed totals won't include {missingValues===1?'it':'them'} until {missingValues===1?'it\'s':'they\'re'} filled in.</div>
                <button onClick={()=>{setAdminTab('catalog');if(!showRE)setEditRewards(rewards.map(r=>({...r})));setShowRE(true);}} style={{padding:'6px 11px',background:'rgba(201,162,75,.15)',border:'1px solid rgba(201,162,75,.4)',color:'#d4b465',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)'}}>Edit rewards →</button>
              </div>
            )}
            {/* View toggle — Pending list (default) vs full Delivered history. */}
            <div style={{display:'flex',gap:0,marginBottom:11,background:'var(--card)',borderRadius:'var(--rsm)',border:'1px solid var(--bo)',overflow:'hidden'}}>
              {[['pending',`📦 Pending (${pending.length})`],['delivered',`✅ Delivered (${totalDelivered})`]].map(([k,l])=>(
                <button key={k} onClick={()=>setRewardsOwedView(k)} style={{flex:1,padding:'10px 0',background:rewardsOwedView===k?'rgba(201,162,75,.18)':'transparent',border:'none',borderRight:k==='pending'?'1px solid var(--bo)':'none',color:rewardsOwedView===k?'var(--pu2)':'var(--tx3)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)',letterSpacing:.3}}>{l}</button>
              ))}
            </div>
            {rewardsOwedView==='delivered'?(()=>{
              // Flatten every profile's redeemed levels into a single audit-log list.
              // Sorted by redemption date desc (with tiers missing a timestamp
              // grouped at the bottom in achieved-order).
              const rows=[];
              enriched.forEach(p=>{
                Array.from(p._redeemed).forEach(l=>{
                  if(l<1||l>p._curLevel||!rewardByLevel[l])return;
                  const isCash=p._redeemedCash.has(l);
                  const storedAmt=p._redeemedAmounts?.[String(l)];
                  const catalog=rewardByLevel[l].value||0;
                  const delivered=typeof storedAmt==='number'?storedAmt:(catalog*(isCash?0.8:1));
                  const redeemedAt=(p.rewards_redemption_dates||{})[String(l)]||null;
                  const crossedAt=affiliateUnlockDates[p.id]?.[l]||null;
                  rows.push({profile:p,level:l,reward:rewardByLevel[l],isCash,delivered,redeemedAt,crossedAt});
                });
              });
              rows.sort((a,b)=>{
                const at=a.redeemedAt?new Date(a.redeemedAt).getTime():0;
                const bt=b.redeemedAt?new Date(b.redeemedAt).getTime():0;
                if(at===bt)return a.profile.username?.localeCompare(b.profile.username||'')||a.level-b.level;
                return bt-at;
              });
              const q=deliveredSearch.trim().toLowerCase();
              const filtered=q?rows.filter(r=>(r.profile.username||'').toLowerCase().includes(q)||(r.profile.tiktok_handles||[]).some(h=>h.toLowerCase().includes(q))||(r.reward.name||'').toLowerCase().includes(q)):rows;
              const totalDeliveredValue=filtered.reduce((s,r)=>s+r.delivered,0);
              const cashCount=filtered.filter(r=>r.isCash).length;
              return(<div className="asec">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11,flexWrap:'wrap'}}>
                  <span style={{fontSize:14}}>📜</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>DELIVERED HISTORY</span>
                  <span style={{background:'rgba(107,155,125,.18)',color:'var(--gr)',fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:800,letterSpacing:.3}}>{filtered.length}</span>
                  {filtered.length>0&&<span style={{marginLeft:'auto',fontSize:11,color:'var(--tx3)',fontWeight:500}}>Total delivered <strong style={{color:'var(--gr)',fontFamily:'var(--fh)',fontSize:13,marginLeft:4}}>{fmtGBPc(totalDeliveredValue)}</strong> · {cashCount} cash · {filtered.length-cashCount} product</span>}
                </div>
                <input className="inp" placeholder="Search affiliate, handle, or reward name…" value={deliveredSearch} onChange={e=>setDeliveredSearch(e.target.value)} style={{marginBottom:10,fontSize:12}}/>
                {rows.length===0?(
                  <div style={{padding:'34px 18px',textAlign:'center'}}>
                    <div style={{fontSize:32,marginBottom:10,opacity:.5}}>📜</div>
                    <div style={{fontSize:13,fontWeight:600,color:'var(--tx2)',marginBottom:4}}>Nothing delivered yet</div>
                    <div style={{fontSize:11,color:'var(--tx3)'}}>Tier redemptions from the Pending tab will show up here.</div>
                  </div>
                ):filtered.length===0?(
                  <div style={{padding:'22px 12px',textAlign:'center',color:'var(--tx3)',fontSize:12}}>No matches for "{deliveredSearch}".</div>
                ):filtered.map((r,i)=>(
                  <div key={`${r.profile.id}-${r.level}`} style={{display:'grid',gridTemplateColumns:isDesktop?'34px minmax(150px,1.4fr) minmax(140px,1.6fr) 74px 74px 130px 60px':'34px 1fr 60px',gap:8,padding:'10px 4px',borderBottom:i<filtered.length-1?'1px solid var(--bo)':'none',alignItems:'center',fontSize:12}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:r.profile.avatar_url?'transparent':avc(r.profile.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',overflow:'hidden',flexShrink:0}}>{r.profile.avatar_url?<img src={r.profile.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(r.profile.username)}</div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',fontSize:12.5}}>{r.profile.username}</div>
                      <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(r.profile.tiktok_handles||[]).slice(0,1).join('')||'—'}</div>
                    </div>
                    {isDesktop&&(
                      <div style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}>
                        <div style={{width:22,height:22,borderRadius:5,background:r.reward.image?'transparent':'rgba(201,162,75,.14)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,overflow:'hidden',flexShrink:0}}>{r.reward.image?<img src={r.reward.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'🎁'}</div>
                        <span style={{fontFamily:'var(--fh)',fontSize:10.5,color:'var(--pu2)',letterSpacing:.5,flexShrink:0}}>L{r.level}</span>
                        <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--tx2)',fontSize:11.5}}>{r.reward.name}</span>
                      </div>
                    )}
                    {isDesktop&&(
                      <span style={{fontSize:9,padding:'2px 7px',background:r.isCash?'rgba(201,162,75,.18)':'rgba(107,155,125,.18)',color:r.isCash?'#d4b465':'var(--gr)',borderRadius:99,fontWeight:800,letterSpacing:.5,fontFamily:'var(--fb)',textAlign:'center'}}>{r.isCash?'CASH':'PRODUCT'}</span>
                    )}
                    {isDesktop&&(
                      <span style={{fontFamily:'var(--fh)',fontSize:13,color:r.isCash?'#d4b465':'var(--gr)',textAlign:'right'}}>{fmtGBPc(r.delivered)}</span>
                    )}
                    {isDesktop&&(
                      <span style={{fontSize:10.5,color:'var(--tx3)',textAlign:'right',fontFamily:'var(--fb)',letterSpacing:.2}}>{r.redeemedAt?new Date(r.redeemedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}):'—'}</span>
                    )}
                    {!isDesktop&&(
                      <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:2}}>
                        <span style={{fontFamily:'var(--fh)',fontSize:13,color:r.isCash?'#d4b465':'var(--gr)'}}>{fmtGBPc(r.delivered)}</span>
                        <span style={{fontSize:8.5,padding:'1px 6px',background:r.isCash?'rgba(201,162,75,.18)':'rgba(107,155,125,.18)',color:r.isCash?'#d4b465':'var(--gr)',borderRadius:99,fontWeight:800,letterSpacing:.4,fontFamily:'var(--fb)'}}>L{r.level} · {r.isCash?'CASH':'PRODUCT'}</span>
                      </div>
                    )}
                    <button onClick={()=>{if(window.confirm(`Undo redemption of ${r.reward.name} for ${r.profile.username}? Moves it back to pending.`))toggleRewardRedeemed(r.profile.id,r.level);}} title="Undo — move back to pending" style={{padding:'4px 8px',background:'transparent',border:'1px solid var(--bo)',color:'var(--tx3)',fontSize:10,cursor:'pointer',borderRadius:6,fontFamily:'var(--fb)',fontWeight:600,justifySelf:'end'}}>↶ Undo</button>
                  </div>
                ))}
              </div>);
            })():pending.length===0?(
              !adminProfilesLoaded?(
                <div className="asec" style={{padding:'24px 18px'}}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{display:'flex',alignItems:'center',gap:11,padding:'11px 4px',borderBottom:i<2?'1px solid var(--bo)':'none',opacity:.6-i*0.15}}>
                      <div style={{width:36,height:36,borderRadius:'50%',background:'var(--card2)',animation:'ll-pulse 1.4s ease-in-out infinite',flexShrink:0}}/>
                      <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                        <div style={{height:12,width:'40%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                        <div style={{height:9,width:'25%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                      </div>
                    </div>
                  ))}
                  <div style={{textAlign:'center',fontSize:11,color:'var(--tx3)',marginTop:14,letterSpacing:.3}}>Loading rewards…</div>
                </div>
              ):allProfiles.length===0?(
                <div className="asec" style={{padding:'40px 18px',textAlign:'center'}}>
                  <div style={{fontSize:36,marginBottom:10,opacity:.6}}>🎯</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',marginBottom:6}}>No affiliates yet</div>
                  <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5,maxWidth:320,margin:'0 auto 12px'}}>Once creators sign up and earn XP, their unlocked reward tiers will appear here.</div>
                  <button onClick={()=>{setAdminProfilesLoaded(false);loadAllProfiles();}} style={{padding:'6px 12px',background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:8,color:'var(--tx2)',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)'}}>↺ Retry load</button>
                </div>
              ):(
                <div className="asec" style={{padding:'40px 18px',textAlign:'center'}}>
                  <div style={{fontSize:36,marginBottom:10,opacity:.6}}>✨</div>
                  <div style={{fontSize:14,fontWeight:600,color:'var(--tx)',marginBottom:6}}>All rewards delivered</div>
                  <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5,maxWidth:300,margin:'0 auto'}}>Every affiliate has received their level rewards. New unlocks will appear here automatically.</div>
                </div>
              )
            ):(
              <div className="asec">
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:11,flexWrap:'wrap'}}>
                  <span style={{fontSize:14}}>📦</span>
                  <span style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:1.5}}>PENDING DELIVERIES</span>
                  <span style={{background:'rgba(201,162,75,.85)',color:'#1a1a2e',fontSize:10,padding:'2px 8px',borderRadius:99,fontWeight:800,letterSpacing:.3}}>{pending.length}</span>
                  <button onClick={markAllRewardsDelivered} style={{marginLeft:'auto',padding:'5px 11px',background:'rgba(107,155,125,.14)',border:'1px solid rgba(107,155,125,.32)',color:'var(--gr)',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)'}}>✓ Mark all delivered</button>
                </div>
                <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10,lineHeight:1.5}}>Monthly batch: a tier crossed in month <em>N</em> is due by the <em>15th of month N+1</em> — enough buffer past the return window without dragging into a whole-month delay. Dispatch the reward then tick the affiliate off. 'Mark all delivered' bulk-acknowledges everyone at their current level.</div>
                {pending.map((p,i)=>(
                  <div key={p.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:12,padding:'12px 13px',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                      <span style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--tx3)',width:20,textAlign:'center'}}>{i+1}</span>
                      <div style={{width:34,height:34,borderRadius:'50%',background:p.avatar_url?'transparent':avc(p.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden'}}>{p.avatar_url?<img src={p.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(p.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{p.username}</div>
                        <div style={{fontSize:10,color:'var(--tx3)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(p.tiktok_handles||[]).slice(0,2).join(' · ')||'—'}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        {!adminRewardValuesLoaded&&p._owedValue===0?(
                          <>
                            <div style={{display:'inline-block',width:70,height:18,background:'var(--card2)',borderRadius:5,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                            <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.6,marginTop:4,fontWeight:700}}>owed</div>
                          </>
                        ):(<>
                          <div style={{fontFamily:'var(--fh)',fontSize:17,color:'#c9a24b',letterSpacing:.3,lineHeight:1}}>{fmtGBPc(p._owedValue)}</div>
                          <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.6,marginTop:2,fontWeight:700}}>owed</div>
                          {p._owedValue>0&&<div style={{fontSize:10,color:'#d4b465',opacity:.75,marginTop:3,letterSpacing:.2,fontWeight:600}}>or {fmtGBPc(p._owedValue*0.8)} cash</div>}
                        </>)}
                      </div>
                    </div>
                    {/* Owed-tiers list — each row has its own ✓ Redeem button so
                        tiers can be ticked off individually in any order. */}
                    <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:10,padding:'8px 10px',background:'var(--card2)',borderRadius:8}}>
                      {p._owedLevels.map(r=>{
                        const due=r.dueDate;
                        const daysLeft=due?daysUntil(due):null;
                        const overdue=due!=null&&due.getTime()<Date.now();
                        const dueToday=daysLeft===0;
                        const urgent=daysLeft!=null&&daysLeft>0&&daysLeft<=7;
                        const warn=daysLeft!=null&&daysLeft>7&&daysLeft<=14;
                        const color=overdue||urgent||dueToday?'#b04a55':warn?'#d4b465':'#6b9b7d';
                        const bg=overdue||urgent||dueToday?'rgba(176,74,85,.13)':warn?'rgba(212,180,101,.12)':'rgba(107,155,125,.1)';
                        const border=overdue||urgent||dueToday?'rgba(176,74,85,.32)':warn?'rgba(212,180,101,.3)':'rgba(107,155,125,.28)';
                        const label=!due?null:overdue?`⚠ Overdue ${Math.abs(daysLeft)}d`:dueToday?'⚠ Due today':`⏱ Due ${fmtDueDate(due)}`;
                        return(
                          <div key={r.level} style={{display:'flex',alignItems:'center',gap:8,fontSize:11.5}}>
                            <div style={{width:24,height:24,borderRadius:5,background:r.image?'transparent':'rgba(201,162,75,.12)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,overflow:'hidden',flexShrink:0}}>{r.image?<img src={r.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'🎁'}</div>
                            <span style={{fontFamily:'var(--fh)',fontSize:11,color:'var(--pu2)',letterSpacing:.5,minWidth:24}}>L{r.level}</span>
                            <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--tx2)'}}>{r.name}</span>
                            {label&&<span title={r.crossedAt?`Crossed ${new Date(r.crossedAt).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`:''} style={{fontSize:10,color,padding:'2px 6px',background:bg,border:`1px solid ${border}`,borderRadius:99,fontWeight:600,letterSpacing:.2,flexShrink:0,fontFamily:'var(--fb)',cursor:'help'}}>{label}</span>}
                            <span style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:1,flexShrink:0,minWidth:78,textAlign:'right'}}>
                              {!adminRewardValuesLoaded&&!(r.value>0)?(
                                <>
                                  <span style={{display:'inline-block',width:42,height:12,background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                                  <span style={{display:'inline-block',width:52,height:8,marginTop:3,background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                                </>
                              ):(<>
                                <span style={{fontFamily:'var(--fh)',fontSize:12,color:r.value>0?'#d4b465':'var(--tx3)',lineHeight:1}}>{r.value>0?fmtGBPc(r.value):'£?'}</span>
                                {r.value>0&&<span style={{fontSize:8.5,color:'var(--tx3)',letterSpacing:.3,fontWeight:600,lineHeight:1}}>or {fmtGBPc(r.value*0.8)} cash</span>}
                              </>)}
                            </span>
                            <button onClick={()=>setRedeemPick({profileId:p.id,level:r.level,name:r.name,value:r.value,image:r.image})} title="Mark this tier as redeemed — choose product or cash" style={{padding:'3px 8px',background:'rgba(107,155,125,.14)',border:'1px solid rgba(107,155,125,.32)',color:'var(--gr)',fontSize:10,fontWeight:700,cursor:'pointer',borderRadius:6,fontFamily:'var(--fb)',flexShrink:0,letterSpacing:.2}}>✓ Redeem</button>
                          </div>
                        );
                      })}
                    </div>
                    {/* Already-redeemed tiers — shown as ticked rows so admin can untick if they marked one by mistake. */}
                    {(()=>{
                      const redeemedHere=Array.from(p._redeemed).filter(l=>l>=1&&l<=p._curLevel&&rewardByLevel[l]).sort((a,b)=>a-b);
                      if(redeemedHere.length===0)return null;
                      return(
                        <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:10,padding:'7px 10px',background:'rgba(107,155,125,.05)',border:'1px solid rgba(107,155,125,.15)',borderRadius:8}}>
                          <div style={{fontSize:8,color:'rgba(107,155,125,.7)',textTransform:'uppercase',letterSpacing:1.3,fontWeight:700,marginBottom:2}}>Already redeemed</div>
                          {redeemedHere.map(level=>{const r=rewardByLevel[level];const isCash=p._redeemedCash.has(level);const stored=p._redeemedAmounts?.[String(level)];const delivered=typeof stored==='number'?stored:r.value*(isCash?0.8:1);return(
                            <div key={level} style={{display:'flex',alignItems:'center',gap:8,fontSize:11}}>
                              <span style={{fontFamily:'var(--fh)',fontSize:10,color:'var(--gr)',letterSpacing:.5,minWidth:22}}>L{level}</span>
                              <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--tx3)',textDecoration:'line-through'}}>{r.name}</span>
                              <span style={{fontSize:8,padding:'1px 6px',background:isCash?'rgba(201,162,75,.18)':'rgba(107,155,125,.18)',color:isCash?'#d4b465':'var(--gr)',borderRadius:99,fontWeight:700,letterSpacing:.4,fontFamily:'var(--fb)',flexShrink:0}}>{isCash?'CASH':'PRODUCT'}</span>
                              <span style={{fontFamily:'var(--fh)',fontSize:11,color:'rgba(212,180,101,.7)',flexShrink:0,minWidth:50,textAlign:'right'}}>{r.value>0?fmtGBPc(delivered):'£?'}</span>
                              <button onClick={()=>toggleRewardRedeemed(p.id,level)} title="Undo: move back to pending" style={{padding:'2px 7px',background:'transparent',border:'1px solid var(--bo)',color:'var(--tx3)',fontSize:9,cursor:'pointer',borderRadius:5,fontFamily:'var(--fb)',flexShrink:0}}>↶ Undo</button>
                            </div>
                          );})}
                        </div>
                      );
                    })()}
                    <div style={{display:'flex',gap:6,alignItems:'center'}}>
                      <div style={{fontSize:10,color:'var(--tx3)',flex:1}}>Achieved: L{p._curLevel} · Redeemed: {p._redeemed.size}/{p._curLevel}</div>
                      <button onClick={()=>setRedeemAllPick({profileId:p.id,username:p.username,tiers:p._owedLevels.map(r=>({level:r.level,name:r.name,value:r.value,image:r.image}))})} style={{padding:'7px 12px',background:'rgba(107,155,125,.14)',border:'1px solid rgba(107,155,125,.32)',color:'var(--gr)',fontSize:11,fontWeight:600,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)',flexShrink:0}}>✓ Redeem all owed</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>);
        })()}
        {/* XP EXCLUSIONS — accessible via Imports tab + Quick Actions */}
        {adminTab==='imports'&&showExclusions&&(<div className="asec">
          <div className="asect">XP Exclusions</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:9,lineHeight:1.5}}>Block specific affiliates from earning XP on certain products. Sales data is still recorded — only XP is excluded.</div>
          {/* Add new exclusion */}
          <div style={{display:'flex',gap:6,marginBottom:6,flexWrap:'wrap'}}>
            <select value={newExclusionUser} onChange={e=>setNewExclusionUser(e.target.value)} style={{flex:1,minWidth:120,padding:'7px 8px',background:'var(--bg2)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:12,outline:'none'}}>
              <option value=''>— Select affiliate —</option>
              {allProfiles.map(p=><option key={p.id} value={p.id}>{p.username}</option>)}
            </select>
            <select value={newExclusionProduct} onChange={e=>setNewExclusionProduct(e.target.value)} style={{flex:1,minWidth:120,padding:'7px 8px',background:'var(--bg2)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:12,outline:'none'}}>
              <option value=''>— Select product —</option>
              {products.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
          <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap',alignItems:'center'}}>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:11,color:'var(--tx3)'}}>From</span>
              <input type="date" value={newExclusionStart} onChange={e=>setNewExclusionStart(e.target.value)} style={{padding:'5px 7px',background:'var(--bg2)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <span style={{fontSize:11,color:'var(--tx3)'}}>To</span>
              <input type="date" value={newExclusionEnd} onChange={e=>setNewExclusionEnd(e.target.value)} style={{padding:'5px 7px',background:'var(--bg2)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
            </div>
            <span style={{fontSize:10,color:'var(--tx3)'}}>(leave blank = forever)</span>
            <button onClick={async()=>{
              if(!newExclusionUser||!newExclusionProduct){toast('Select both an affiliate and product','wn');return;}
              const existing=xpExclusions.find(ex=>ex.profile_id===newExclusionUser&&ex.product_name===newExclusionProduct);
              if(existing){toast('Already excluded','wn');return;}
              const row={profile_id:newExclusionUser,product_name:newExclusionProduct};
              if(newExclusionStart)row.start_date=newExclusionStart;
              if(newExclusionEnd)row.end_date=newExclusionEnd;
              const {error}=await supabase.from('xp_exclusions').insert(row);
              if(!error){toast('Exclusion added ✓','ok');setNewExclusionUser('');setNewExclusionProduct('');setNewExclusionStart('');setNewExclusionEnd('');loadXpExclusions();}else toast('Failed: '+error.message,'wn');
            }} style={{padding:'7px 14px',background:'rgba(176,74,85,.12)',border:'1px solid rgba(176,74,85,.25)',borderRadius:'var(--rxs)',color:'var(--re)',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',marginLeft:'auto'}}>+ Add</button>
          </div>
          {/* Existing exclusions */}
          {xpExclusions.length===0?<div style={{fontSize:12,color:'var(--tx3)'}}>No exclusions set.</div>:(
            xpExclusions.map(ex=>{
              const prof=allProfiles.find(p=>p.id===ex.profile_id);
              const hasDate=ex.start_date||ex.end_date;
              const dateStr=hasDate?`${ex.start_date||'start'} → ${ex.end_date||'forever'}`:null;
              return(
                <div key={ex.id} style={{display:'flex',alignItems:'center',gap:8,padding:'7px 0',borderBottom:'1px solid var(--bo)'}}>
                  <div style={{flex:1}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--tx)'}}>{prof?.username||'Unknown'}</span>
                      <span style={{fontSize:11,color:'var(--tx3)',margin:'0 6px'}}>won't earn XP on</span>
                      <span style={{fontSize:13,fontWeight:600,color:'var(--go)'}}>{ex.product_name}</span>
                    </div>
                    {dateStr&&<div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>📅 {dateStr}</div>}
                    {!hasDate&&<div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>Forever</div>}
                  </div>
                  <button onClick={async()=>{await supabase.from('xp_exclusions').delete().eq('id',ex.id);toast('Removed ✓','ok');loadXpExclusions();}} style={{background:'none',border:'none',color:'var(--re)',cursor:'pointer',fontSize:15,padding:'0 4px'}}>✕</button>
                </div>
              );
            })
          )}
        </div>)}
        {/* REFERRAL PAYOUTS MANAGEMENT */}
        {adminTab==='payouts'&&(<div className="asec">
          <div className="asect">Referral Payouts</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:9,lineHeight:1.5}}>Records auto-generate when you open admin — one row per (affiliate, completed month). Mark each paid after sending the transfer.</div>
          {(!adminProfilesLoaded||!isFresh('adminPayouts'))&&adminPayouts.length===0?(
            <div style={{padding:'18px 4px'}}>
              {[0,1,2].map(i=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:11,padding:'10px 4px',borderBottom:i<2?'1px solid var(--bo)':'none',opacity:.6-i*0.15}}>
                  <div style={{width:32,height:32,borderRadius:'50%',background:'var(--card2)',animation:'ll-pulse 1.4s ease-in-out infinite',flexShrink:0}}/>
                  <div style={{flex:1,display:'flex',flexDirection:'column',gap:6}}>
                    <div style={{height:11,width:'40%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                    <div style={{height:8,width:'25%',background:'var(--card2)',borderRadius:4,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                  </div>
                  <div style={{width:70,height:20,background:'var(--card2)',borderRadius:5,animation:'ll-pulse 1.4s ease-in-out infinite'}}/>
                </div>
              ))}
              <div style={{textAlign:'center',fontSize:11,color:'var(--tx3)',marginTop:12,letterSpacing:.3}}>Loading payouts…</div>
            </div>
          ):adminPayouts.length===0?(()=>{
            // Show whether the current in-progress month is accruing anything so the
            // admin can tell "empty because nothing happened yet" vs "empty because
            // June isn't closed". Sums 1% of net GMV for referred-users' events in
            // the current calendar month.
            const cm=new Date().toISOString().slice(0,7);
            const referrerById={};allProfiles.forEach(p=>{if(p.referred_by)referrerById[p.id]=p.referred_by;});
            const accruing={};
            adminPeriodEvents.forEach(e=>{
              const refId=referrerById[e.profile_id];if(!refId)return;
              if((e.created_at||'').slice(0,7)!==cm)return;
              if(!accruing[refId])accruing[refId]=0;
              accruing[refId]+=Math.max(0,(e.gmv||0)-(e.cancelled_gmv||0))*0.01;
            });
            const accruingTotal=Object.values(accruing).reduce((s,v)=>s+v,0);
            const accruingCount=Object.keys(accruing).length;
            const monthName=new Date().toLocaleDateString('en-GB',{month:'long'});
            return(
              <div style={{padding:'18px 16px',background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:10}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--tx2)',marginBottom:6}}>No payout records yet</div>
                <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.5,marginBottom:accruingTotal>0?12:0}}>Records auto-generate at the end of each calendar month. {monthName} is still in progress.</div>
                {accruingTotal>0&&(
                  <div style={{padding:'10px 12px',background:'rgba(201,162,75,.08)',border:'1px solid rgba(201,162,75,.25)',borderRadius:8}}>
                    <div style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginBottom:4,fontWeight:600}}>Accruing this month</div>
                    <div style={{fontFamily:'var(--fh)',fontSize:20,color:'var(--go)',letterSpacing:.3}}>{fmtGBP(accruingTotal)}</div>
                    <div style={{fontSize:11,color:'var(--tx3)',marginTop:3}}>{accruingCount} referrer{accruingCount===1?'':'s'} — will batch on the 1st of next month</div>
                  </div>
                )}
              </div>
            );
          })():(()=>{
            // Group by profile
            const byProfile={};
            adminPayouts.forEach(po=>{if(!byProfile[po.profile_id])byProfile[po.profile_id]=[];byProfile[po.profile_id].push(po);});
            return Object.entries(byProfile).map(([pid,pos])=>{
              const prof=allProfiles.find(p=>p.id===pid);
              const totalOwed=pos.filter(p=>!p.paid).reduce((s,p)=>s+p.amount,0);
              const totalPaid=pos.filter(p=>p.paid).reduce((s,p)=>s+p.amount,0);
              return(
                <div key={pid} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'11px 12px',marginBottom:8}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600}}>{prof?.username||'Unknown'}</div>
                      <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{(prof?.tiktok_handles||[]).slice(0,2).join(' · ')}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                      {totalOwed>0&&<div style={{fontSize:11,color:'var(--go)',fontWeight:600}}>{fmtGBP(totalOwed)} owed</div>}
                      {totalPaid>0&&<div style={{fontSize:10,color:'var(--gr)',marginTop:1}}>{fmtGBP(totalPaid)} paid</div>}
                    </div>
                  </div>
                  {pos.map(po=>{
                    const monthLabel=new Date(po.month+'-01').toLocaleDateString('en-GB',{month:'short',year:'numeric'});
                    return(
                      <div key={po.id} style={{display:'flex',alignItems:'center',gap:8,padding:'6px 0',borderTop:'1px solid var(--bo)'}}>
                        <div style={{flex:1}}>
                          <span style={{fontSize:12,fontWeight:500}}>{monthLabel}</span>
                          <span style={{fontSize:12,color:po.paid?'var(--gr)':'var(--go)',marginLeft:8,fontFamily:'var(--fh)'}}>{fmtGBP(po.amount)}</span>
                        </div>
                        <button onClick={()=>togglePayout(po.id,!po.paid)} style={{padding:'4px 10px',borderRadius:'var(--rxs)',border:`1px solid ${po.paid?'rgba(107,155,125,.3)':'rgba(201,162,75,.3)'}`,background:po.paid?'rgba(107,155,125,.1)':'rgba(201,162,75,.1)',color:po.paid?'var(--gr)':'var(--go)',fontSize:11,fontWeight:600,cursor:'pointer'}}>{po.paid?'✅ Paid':'Mark Paid'}</button>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>)}
        {/* IMPORT HISTORY */}
        {adminTab==='imports'&&(<div className="asec">
          <div className="asect">Import History — Delete by Date</div>
          {importHistory.length===0?<div style={{color:'var(--tx3)',fontSize:12}}>No imports yet.</div>:importHistory.map(ih=>(
            <div key={ih.date} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid var(--bo)'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{ih.date}</div>
                <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{ih.profileCount||0} affiliate{(ih.profileCount||0)!==1?'s':''} · GMV {fmtGBP(ih.totalGmv)} · Comm {fmtGBP(ih.totalComm)}</div>
              </div>
              {deleteConfirm===`date-${ih.date}`?(<div style={{display:'flex',gap:5}}>
                <button onClick={()=>{deleteImportByDate(ih.date);setDeleteConfirm(null);}} style={{background:'rgba(176,74,85,.15)',border:'1px solid rgba(176,74,85,.3)',borderRadius:'var(--rxs)',padding:'4px 8px',color:'var(--re)',fontSize:11,fontWeight:700,cursor:'pointer'}}>Confirm</button>
                <button onClick={()=>setDeleteConfirm(null)} style={{background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:'var(--rxs)',padding:'4px 8px',color:'var(--tx3)',fontSize:11,cursor:'pointer'}}>Cancel</button>
              </div>):(<button onClick={()=>setDeleteConfirm(`date-${ih.date}`)} style={{background:'rgba(176,74,85,.1)',border:'1px solid rgba(176,74,85,.2)',borderRadius:'var(--rxs)',padding:'4px 9px',color:'var(--re)',fontSize:11,fontWeight:600,cursor:'pointer'}}>Delete</button>)}
            </div>
          ))}
        </div>)}

        {adminTab==='catalog'&&showME&&(<div className="asec"><div className="asect">Edit Streak Milestones</div>{editMilestones.map((m,i)=>(<div key={m.id||i} className="rerow"><div style={{display:'flex',gap:5,alignItems:'flex-end'}}><div style={{width:55}}><div className="lbl">Days</div><input className="ins" type="number" value={m.days} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],days:parseInt(e.target.value)||m.days};setEditMilestones(n);}}/></div><div style={{flex:1}}><div className="lbl">Label</div><input className="ins" value={m.label} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],label:e.target.value};setEditMilestones(n);}}/></div><div style={{width:60}}><div className="lbl">XP</div><input className="ins" type="number" value={m.xp_bonus} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],xp_bonus:parseInt(e.target.value)||m.xp_bonus};setEditMilestones(n);}}/></div><button className="svbtn" onClick={async()=>{const {error}=await supabase.from('streak_milestones').update({days:Number(m.days),label:String(m.label),xp_bonus:Number(m.xp_bonus)}).eq('id',m.id);if(!error){toast('Saved ✓','ok');loadMilestones();}else{console.error('Milestone save error:',error);toast('Failed: '+(error.message||'unknown'),'wn');}}}>Save</button></div></div>))}</div>)}
        {adminTab==='catalog'&&showRE&&(<div className="asec"><div className="asect">Edit Reward Tiers</div>{editRewards.map((r,i)=>(<div key={r.id} className="rerow"><div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1,color:'var(--tx3)',marginBottom:6,fontWeight:600}}>Level {r.level}</div><div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">Name</div><input className="ins" value={r.name} onChange={e=>{const n=[...editRewards];n[i]={...n[i],name:e.target.value};setEditRewards(n);}}/></div><div style={{width:78}}><div className="lbl">XP Req</div><input className="ins" type="number" value={r.xp_required} onChange={e=>{const n=[...editRewards];n[i]={...n[i],xp_required:parseInt(e.target.value)||r.xp_required};setEditRewards(n);}}/></div><div style={{width:78}}><div className="lbl">Value £</div><input className="ins" type="number" step="0.01" value={r.value??0} onChange={e=>{const n=[...editRewards];n[i]={...n[i],value:e.target.value===''?0:parseFloat(e.target.value)};setEditRewards(n);}}/></div></div><div style={{marginBottom:5}}><div className="lbl">Description</div><input className="ins" value={r.description} onChange={e=>{const n=[...editRewards];n[i]={...n[i],description:e.target.value};setEditRewards(n);}}/></div><div style={{display:'flex',gap:4,alignItems:'flex-end'}}><div style={{flex:1}}><div className="lbl">Image URL or upload</div><div style={{display:'flex',gap:4}}><input className="ins" value={r.image_url&&r.image_url.startsWith('data:')?'[uploaded]':(r.image_url||'')} onChange={e=>{const n=[...editRewards];n[i]={...n[i],image_url:e.target.value||null};setEditRewards(n);}} placeholder="https://..." style={{flex:1}}/><label style={{cursor:'pointer',background:'rgba(201,162,75,.13)',border:'1px solid rgba(201,162,75,.25)',borderRadius:5,padding:'5px 7px',fontSize:11,color:'var(--pu2)',display:'flex',alignItems:'center'}}>📷<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0])handleImageUpload(i,e.target.files[0]);}}/></label></div>{r.image_url&&<img src={r.image_url} alt="" style={{width:44,height:30,objectFit:'cover',borderRadius:4,marginTop:4}}/>}</div><button className="svbtn" style={{marginLeft:3}} onClick={()=>saveReward(r)}>Save</button></div></div>))}</div>)}
      </div>)}
      {adminTab==='catalog'&&showPE&&adminUnlocked&&(<div className="asec" style={{margin:'0 13px 9px'}}>
        <div className="asect">Edit Products</div>
        {editProducts.map((prod,i)=>(
          <div key={prod.id||i} className="rerow">
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1,color:'var(--tx3)',marginBottom:6,fontWeight:600}}>Product {i+1}</div>
            <div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">Name</div><input className="ins" value={prod.name||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],name:e.target.value};setEditProducts(n);}}/></div><div style={{width:70}}><div className="lbl">Price £</div><input className="ins" type="number" value={prod.price||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],price:e.target.value};setEditProducts(n);}}/></div></div>
            <div style={{marginBottom:5}}><div className="lbl">Description</div><input className="ins" value={prod.description||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],description:e.target.value};setEditProducts(n);}}/></div>
            <div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">TikTok Shop URL</div><input className="ins" value={prod.tiktok_url||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],tiktok_url:e.target.value};setEditProducts(n);}}/></div><div style={{width:70}}><div className="lbl">Comm %</div><input className="ins" type="number" value={prod.commission_rate||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],commission_rate:e.target.value};setEditProducts(n);}}/></div></div>
            <div style={{marginBottom:5}}><div className="lbl">Import Keywords <span style={{fontWeight:400,color:'var(--tx3)'}}>(comma separated — matches filename)</span></div><input className="ins" value={(prod.keywords||[]).join(', ')} onChange={e=>{const n=[...editProducts];n[i]={...n[i],keywords:e.target.value.split(',').map(k=>k.trim()).filter(Boolean)};setEditProducts(n);}} placeholder="e.g. teeth, tooth, cleaner"/></div>
            <div style={{marginBottom:5}}><div className="lbl">Image URL</div><div style={{display:'flex',gap:4}}><input className="ins" value={prod.image_url&&prod.image_url.startsWith('data:')?'[uploaded]':(prod.image_url||'')} onChange={e=>{const n=[...editProducts];n[i]={...n[i],image_url:e.target.value||null};setEditProducts(n);}} placeholder="https://..." style={{flex:1}}/><label style={{cursor:'pointer',background:'rgba(201,162,75,.13)',border:'1px solid rgba(201,162,75,.25)',borderRadius:5,padding:'5px 7px',fontSize:11,color:'var(--pu2)',display:'flex',alignItems:'center'}}>📷<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0]){const r=new FileReader();r.onload=ev=>{const n=[...editProducts];n[i]={...n[i],image_url:ev.target.result};setEditProducts(n);toast('Image ready — click Save','info');};r.readAsDataURL(e.target.files[0]);}}}/></label></div>{prod.image_url&&<img src={prod.image_url} alt="" style={{width:44,height:30,objectFit:'cover',borderRadius:4,marginTop:4}}/>}</div>
            <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:5,cursor:'pointer',padding:'4px 2px'}}>
              <input type="checkbox" checked={!!prod.free_shipping} onChange={e=>{const n=[...editProducts];n[i]={...n[i],free_shipping:e.target.checked};setEditProducts(n);}} style={{width:18,height:18,accentColor:'var(--gr)',cursor:'pointer'}}/>
              <span style={{fontSize:12,color:'var(--tx2)'}}>🚚 Show <strong style={{color:'var(--gr)'}}>Free Shipping</strong> chip on this product</span>
            </label>
            <div style={{display:'flex',gap:5,marginTop:5}}><button className="svbtn" onClick={async()=>{const p=editProducts[i];if(p.id){const {error}=await supabase.from('products').update({name:p.name,description:p.description,price:p.price,tiktok_url:p.tiktok_url,commission_rate:p.commission_rate,image_url:p.image_url,keywords:p.keywords||[],sort_order:p.sort_order||i,free_shipping:!!p.free_shipping}).eq('id',p.id);if(!error){toast('Saved ✓','ok');loadProducts();}else toast('Failed: '+(error.message||''),'wn');}else{const {error}=await supabase.from('products').insert({name:p.name,description:p.description,price:p.price,tiktok_url:p.tiktok_url,commission_rate:p.commission_rate,image_url:p.image_url,keywords:p.keywords||[],sort_order:i,free_shipping:!!p.free_shipping});if(!error){toast('Added ✓','ok');loadProducts();}else toast('Failed: '+(error.message||''),'wn');}}}>Save</button><button onClick={async()=>{if(prod.id){await supabase.from('products').delete().eq('id',prod.id);toast('Deleted','ok');loadProducts();}setEditProducts(editProducts.filter((_,j)=>j!==i));}} style={{background:'rgba(176,74,85,.1)',border:'1px solid rgba(176,74,85,.2)',borderRadius:'var(--rxs)',padding:'5px 9px',color:'var(--re)',fontSize:11,fontWeight:600,cursor:'pointer'}}>Delete</button></div>
          </div>
        ))}
        <button onClick={()=>setEditProducts([...editProducts,{name:'',description:'',price:'',tiktok_url:'',commission_rate:'',image_url:null,sort_order:editProducts.length,free_shipping:false}])} style={{width:'100%',marginTop:9,padding:'8px',background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.2)',borderRadius:'var(--rsm)',color:'var(--pu2)',fontSize:12,cursor:'pointer',fontWeight:600}}>+ Add Product</button>
      </div>)}
      </div>
    </div>

    {/* Bottom nav moved out of .app below — see end of return */}

    {/* DAILY STREAK FULL PAGE */}
    {showDaily&&(()=>{
      const streak=profile.streak||0;const nextStreak=streak+1;const todayClaimed=profile.last_claim===tdy();
      const todayMilestone=milestones.find(m=>m.days===nextStreak);const nm=milestones.find(m=>m.days>streak);
      return(
        <div style={{position:'fixed',inset:0,background:'var(--bg)',zIndex:200,display:'flex',flexDirection:'column',overflowY:'auto'}}>
          {/* Header */}
          <div style={{padding:'calc(14px + var(--st)) 16px 14px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid var(--bo)',flexShrink:0}}>
            <div style={{fontFamily:'var(--fh)',fontSize:20,letterSpacing:2}}>🔥 DAILY STREAK</div>
            <button onClick={()=>setShowDaily(false)} style={{background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:99,width:30,height:30,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',color:'var(--tx3)',fontSize:16}}>✕</button>
          </div>

          <div style={{flex:1,padding:'20px 16px',overflowY:'auto'}}>
            {/* Big streak number */}
            <div style={{textAlign:'center',marginBottom:24,padding:'28px 0',background:'var(--card)',borderRadius:'var(--r)',border:'1px solid var(--bo2)',position:'relative',overflow:'hidden'}}>
              <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 50% 60%,rgba(201,162,75,.12) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{fontSize:72,lineHeight:1,marginBottom:6}}>🔥</div>
              <div style={{fontFamily:'var(--fh)',fontSize:80,letterSpacing:2,color:'var(--go)',lineHeight:1}}>{todayClaimed?streak:nextStreak}</div>
              <div style={{fontSize:13,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:3,marginTop:6}}>Day Streak</div>
              {todayClaimed&&<div style={{marginTop:10,display:'inline-block',background:'rgba(107,155,125,.12)',border:'1px solid rgba(107,155,125,.25)',borderRadius:99,padding:'4px 14px',fontSize:12,color:'var(--gr)',fontWeight:600}}>✓ Claimed today</div>}
            </div>

            {/* Next milestone pill - tappable to open carousel */}
            {nm&&(()=>{
              const currentDay=todayClaimed?streak:nextStreak;
              const allStages=milestones.map(m=>({...m,type:'streak'}));
              const flameStages=['🔥','🔥','🔥','🔥','🔥','🔥'];
              const flameSizes=[42,42,42,42,42,42];
              const flameFilters=[
                'brightness(0.85) saturate(0.8)',
                'brightness(1.1) saturate(1.2) drop-shadow(0 0 3px rgba(251,146,60,.5))',
                'brightness(1.25) saturate(1.5) drop-shadow(0 0 6px rgba(251,146,60,.7)) drop-shadow(0 0 12px rgba(251,146,60,.4))',
                'brightness(1.4) saturate(2) hue-rotate(-10deg) drop-shadow(0 0 8px rgba(239,68,68,.8)) drop-shadow(0 0 20px rgba(239,68,68,.4))',
                'brightness(1.6) saturate(2.5) hue-rotate(-20deg) drop-shadow(0 0 10px rgba(220,38,38,.9)) drop-shadow(0 0 25px rgba(220,38,38,.5)) drop-shadow(0 0 40px rgba(220,38,38,.3))',
                'brightness(1.9) saturate(3) hue-rotate(-30deg) contrast(1.2) drop-shadow(0 0 12px rgba(185,28,28,1)) drop-shadow(0 0 30px rgba(185,28,28,.7)) drop-shadow(0 0 50px rgba(185,28,28,.4))',
              ];
              const glowColors=['rgba(201,162,75,.3)','rgba(201,162,75,.4)','rgba(249,115,22,.45)','rgba(239,68,68,.45)','rgba(239,68,68,.55)','rgba(239,68,68,.6)'];
              const borderColors=['rgba(201,162,75,.4)','rgba(201,162,75,.5)','rgba(249,115,22,.5)','rgba(239,68,68,.5)','rgba(239,68,68,.6)','rgba(239,68,68,.7)'];
              const bgColors=['rgba(201,162,75,.08)','rgba(201,162,75,.1)','rgba(249,115,22,.1)','rgba(239,68,68,.1)','rgba(239,68,68,.12)','rgba(239,68,68,.14)'];
              return(<div style={{marginBottom:11}}>
                {/* Pill */}
                <button onClick={()=>setShowMilestoneCarousel(!showMilestoneCarousel)} style={{width:'100%',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',padding:'14px',cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Next Milestone</span>
                    <span style={{fontSize:11,color:'var(--pu2)'}}>{showMilestoneCarousel?'▲ hide':'▼ see all stages'}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:16,letterSpacing:1,color:'var(--tx)'}}>{nm.label}</div>
                    <div style={{background:'rgba(201,162,75,.14)',border:'1px solid rgba(201,162,75,.28)',borderRadius:99,padding:'3px 10px',fontFamily:'var(--fh)',fontSize:14,color:'var(--go)'}}>+{nm.xp_bonus} XP</div>
                  </div>
                  <div style={{height:8,background:'var(--card3)',borderRadius:99,overflow:'hidden',marginBottom:6}}><div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg,var(--go),#f97316)',width:`${Math.min(100,Math.round((currentDay/nm.days)*100))}%`,transition:'width .8s ease'}}/></div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--tx3)'}}>
                    <span>{currentDay} days</span>
                    <span>{nm.days-currentDay} more day{nm.days-currentDay!==1?'s':''} to go</span>
                    <span>{nm.days} days</span>
                  </div>
                </button>
                {/* Carousel - shown when pill tapped */}
                {showMilestoneCarousel&&(<div style={{marginTop:8}}>
                  <div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:8,margin:'0 -16px',paddingLeft:16,paddingRight:16,scrollSnapType:'x mandatory'}}>
                    {allStages.map((s,i)=>{
                      const done=currentDay>s.days;
                      const isCur=currentDay===s.days;
                      const isNext=!done&&!isCur&&i===allStages.findIndex(x=>currentDay<x.days);
                      const fi=Math.min(i,flameStages.length-1);
                      return(
                        <div key={i} style={{minWidth:170,maxWidth:170,height:200,flexShrink:0,scrollSnapAlign:'start',background:done?'rgba(107,155,125,.07)':isCur?bgColors[fi]:'var(--card)',border:`1px solid ${done?'rgba(107,155,125,.3)':isCur?borderColors[fi]:'var(--bo)'}`,borderRadius:'var(--r)',padding:'16px 12px',textAlign:'center',position:'relative',overflow:'hidden',boxShadow:isCur?`0 0 18px ${glowColors[fi]}`:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                          {done&&<div style={{position:'absolute',top:8,right:8,background:'rgba(107,155,125,.2)',border:'1px solid rgba(107,155,125,.4)',borderRadius:99,padding:'2px 6px',fontSize:9,color:'var(--gr)',fontWeight:700}}>DONE ✓</div>}
                          {isCur&&<div style={{position:'absolute',top:8,right:8,background:bgColors[fi],border:`1px solid ${borderColors[fi]}`,borderRadius:99,padding:'2px 6px',fontSize:9,color:'var(--go)',fontWeight:700}}>NOW</div>}
                          {isNext&&<div style={{position:'absolute',top:8,right:8,background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:99,padding:'2px 6px',fontSize:9,color:'var(--tx3)',fontWeight:700}}>NEXT</div>}
                          {(isCur||done)&&<div style={{position:'absolute',inset:0,background:`radial-gradient(circle at 50% 25%,${glowColors[fi]} 0%,transparent 70%)`,pointerEvents:'none'}}/>}
                          <div style={{fontSize:flameSizes[fi],lineHeight:1,marginBottom:8,filter:(!done&&!isCur)?'grayscale(.6) brightness(.5)':flameFilters[fi]}}>{flameStages[fi]}</div>
                          <div style={{fontFamily:'var(--fh)',fontSize:13,letterSpacing:1.5,marginBottom:3,color:done?'var(--gr)':isCur?'var(--go)':'var(--tx2)'}}>{s.label.toUpperCase()}</div>
                          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:10}}>{s.days} days straight</div>
                          <div style={{fontFamily:'var(--fh)',fontSize:30,color:done?'var(--gr)':isCur?'var(--go)':'var(--pu2)',letterSpacing:1}}>+{s.xp_bonus}</div>
                          <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1,marginBottom:6}}>XP BONUS</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{textAlign:'center',fontSize:10,color:'var(--tx3)',marginTop:2}}>← swipe through milestones →</div>
                </div>)}
              </div>);
            })()}

            {/* Today milestone banner */}
            {todayMilestone&&!todayClaimed&&(<div style={{background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.3)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:11,textAlign:'center'}}>
              <div style={{fontSize:22,marginBottom:4}}>🎉</div>
              <div style={{fontFamily:'var(--fh)',fontSize:18,color:'var(--go)',letterSpacing:1}}>MILESTONE REACHED!</div>
              <div style={{fontSize:13,color:'var(--tx2)',marginTop:3}}>{todayMilestone.label} — claim your <strong style={{color:'var(--go)'}}>+{todayMilestone.xp_bonus} XP</strong> bonus</div>
            </div>)}

            {/* How to earn - simple explanation */}
            <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden',marginBottom:16}}>
              <div style={{padding:'12px 14px',borderBottom:'1px solid var(--bo)',fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1}}>How to Earn XP</div>
              {[
                {icon:'🛒',label:'Generate Sales',desc:'Every £10 in net GMV you generate (after returns)',val:'+100 XP'},
                {icon:'🔥',label:'Daily Streak',desc:'Make at least one sale every day — your streak is updated automatically when data is imported',val:'Bonus XP'},
                {icon:'👥',label:'Refer a Creator',desc:'When someone signs up with your link and makes sales',val:'+100 XP & 1% GMV'},
              ].map((item,i,arr)=>(
                <div key={i} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',borderBottom:i<arr.length-1?'1px solid var(--bo)':'none'}}>
                  <div style={{fontSize:20,width:32,textAlign:'center',flexShrink:0}}>{item.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,marginBottom:2}}>{item.label}</div>
                    <div style={{fontSize:11,color:'var(--tx3)',lineHeight:1.4}}>{item.desc}</div>
                  </div>
                  <div style={{fontFamily:'var(--fh)',fontSize:12,color:'var(--pu2)',flexShrink:0,textAlign:'right',letterSpacing:.5,maxWidth:80}}>{item.val}</div>
                </div>
              ))}
            </div>

            <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'12px 14px',textAlign:'center',marginBottom:10}}>
              <div style={{fontSize:12,color:'var(--tx3)',lineHeight:1.5}}>Your streak updates automatically each time your admin imports sales data. Make at least one sale per day to keep it going!</div>
            </div>
            <button className="shcan" onClick={()=>setShowDaily(false)} style={{width:'100%',padding:11,background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',color:'var(--tx2)',fontSize:13,cursor:'pointer'}}>Close</button>
          </div>
        </div>
      );
    })()}

    {/* REWARD MODAL */}
    {showReward&&(<div className="ov" onClick={e=>e.target===e.currentTarget&&setShowReward(null)}>
      <div className="sheet">
        <div style={{fontFamily:'var(--fh)',fontSize:21,letterSpacing:2,marginBottom:3}}>{showReward.name}</div>
        <div style={{fontSize:13,color:'var(--tx2)',marginBottom:12,lineHeight:1.5}}>{showReward.description||'Complete this level to unlock.'}</div>
        {showReward.image_url?<div style={{width:'100%',aspectRatio:'1/1',borderRadius:10,overflow:'hidden',marginBottom:11,background:'var(--card2)'}}><img src={showReward.image_url} alt={showReward.name} style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/></div>:<div style={{width:'100%',aspectRatio:'1/1',background:'var(--card2)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:11,fontSize:54,opacity:.3}}>🎁</div>}
        {(()=>{
          const un=profile.xp>=showReward.xp_required;
          const prog=Math.min(100,Math.round((profile.xp/showReward.xp_required)*100));
          const need=Math.max(0,showReward.xp_required-profile.xp);
          // When unlocked, work out when they crossed the line and how long
          // they've been waiting for delivery (using their own xp_events).
          const myUnlocks=un?computeUnlockDates(xpEvents,rewards):null;
          const unlockIso=myUnlocks?myUnlocks[showReward.level]:null;
          const waited=daysSince(unlockIso);
          const delivered=un&&redeemedLevelsFor(profile).has(showReward.level);
          return(<div style={{background:'var(--card2)',borderRadius:8,padding:11,marginBottom:11}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx3)',marginBottom:5}}><span>Progress</span><span>{un?'✅ Unlocked!':`${need.toLocaleString()} XP needed`}</span></div>
            <div className="pw"><div className="pf" style={{width:`${prog}%`}}/></div>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:3,fontSize:10,color:'var(--tx3)'}}><span>{profile.xp.toLocaleString()}</span><span>{showReward.xp_required.toLocaleString()} XP</span></div>
            {un&&(
              <div style={{marginTop:8,background:delivered?'rgba(107,155,125,.09)':'rgba(201,162,75,.1)',border:`1px solid ${delivered?'rgba(107,155,125,.2)':'rgba(201,162,75,.25)'}`,borderRadius:7,padding:10,textAlign:'center',fontSize:12,color:delivered?'var(--gr)':'var(--pu2)',lineHeight:1.45}}>
                {delivered?(<>✅ <strong>Delivered</strong> — enjoy your reward!</>):(<>🎉 <strong>Unlocked!</strong> Contact Hollen to claim — or swap it for <strong style={{color:'#fff'}}>80% cash</strong>.</>)}
                {unlockIso&&!delivered&&(()=>{
                  const due=payoutDueDate(unlockIso);
                  const daysLeft=due?daysUntil(due):null;
                  const overdue=due&&due.getTime()<Date.now();
                  const c=overdue||(daysLeft!=null&&daysLeft<=7)?'#b04a55':daysLeft!=null&&daysLeft<=14?'#d4b465':'#6b9b7d';
                  return(<div style={{marginTop:6,fontSize:11,color:c,fontWeight:600}}>{overdue?`⚠ Due ${fmtDueDate(due)} · past due, contact Hollen`:`⏱ Due ${fmtDueDate(due)}`}</div>);
                })()}
                {unlockIso&&delivered&&(<div style={{marginTop:6,fontSize:11,color:'var(--tx3)',fontWeight:500}}>Unlocked {waited} day{waited===1?'':'s'} ago</div>)}
              </div>
            )}
          </div>);
        })()}
        <button onClick={()=>setShowReward(null)} style={{width:'100%',padding:9,background:'var(--card2)',border:'1px solid var(--bo2)',borderRadius:8,color:'var(--tx2)',fontSize:13,cursor:'pointer'}}>Close</button>
      </div>
    </div>)}

    {/* ADMIN GATE */}
    {editingProfile&&(()=>{
      const p=allProfiles.find(x=>x.id===editingProfile);
      if(!p)return null;
      const fields=[
        ['total_gmv','Total GMV (£)','0.01'],
        ['total_commission','Commission (£)','0.01'],
        ['total_orders','Orders','1'],
        ['total_sales','Units Sold','1'],
        ['total_cancelled','Returns Count','1'],
        ['total_cancelled_gmv','Returns GMV (£)','0.01'],
        ['total_live_streams','Live Streams','1'],
        ['streak','Streak (days)','1'],
        ['referral_earnings','Referral Earnings (£)','0.01'],
      ];
      return(
        <div className="ov" onClick={e=>e.target===e.currentTarget&&setEditingProfile(null)}>
          <div className="sheet" style={{maxHeight:'85dvh',overflowY:'auto'}}>
            <div style={{fontFamily:'var(--fh)',fontSize:21,letterSpacing:2,marginBottom:3}}>EDIT {p.username.toUpperCase()}</div>
            <div style={{fontSize:11,color:'var(--tx3)',marginBottom:14,lineHeight:1.45}}>Manually adjust totals for this affiliate. Deltas are logged to <code style={{color:'var(--tx2)'}}>xp_events</code> with reason <code style={{color:'var(--tx2)'}}>'manual'</code> for audit. XP is edited via the row's <strong style={{color:'var(--pu2)'}}>+XP</strong>/<strong style={{color:'var(--re)'}}>-XP</strong> buttons.</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
              {fields.map(([key,label,step])=>(
                <div key={key}>
                  <label className="lbl">{label}</label>
                  <input className="inp" type="number" step={step} min="0" value={editForm[key]??''} onChange={e=>setEditForm({...editForm,[key]:e.target.value})}/>
                </div>
              ))}
            </div>
            <button className="clmbtn" onClick={saveEditAffiliate}>SAVE</button>
            <button className="shcan" onClick={()=>setEditingProfile(null)}>Cancel</button>
          </div>
        </div>
      );
    })()}

    {/* FLASH SALE HANDLE PICKER — tick-off list of every TikTok handle on the
        platform, so the admin can copy them into TikTok Shop Flash Sale setup
        without losing their place. */}
    {showFlashSale&&(()=>{
      // Build a flat, alphabetised, deduped list of {handle, username} pairs.
      const rows=[];const seen=new Set();
      allProfiles.forEach(p=>{
        (p.tiktok_handles||[]).forEach(raw=>{
          const h=(raw||'').trim();if(!h)return;
          const noAt=h.startsWith('@')?h.slice(1):h;
          const norm=noAt.toLowerCase();
          if(seen.has(norm))return;seen.add(norm);
          // display keeps the @ for the UI, copyVal is bare so it pastes clean into TikTok Shop.
          rows.push({display:'@'+noAt,copyVal:noAt,username:p.username||'—'});
        });
      });
      rows.sort((a,b)=>a.display.localeCompare(b.display,'en',{sensitivity:'base'}));
      const filtered=flashSearch.trim()?rows.filter(r=>r.display.toLowerCase().includes(flashSearch.toLowerCase())||r.username.toLowerCase().includes(flashSearch.toLowerCase())):rows;
      const copiedCount=rows.filter(r=>flashCopied.has(r.copyVal)).length;
      const copyOne=(val)=>{navigator.clipboard.writeText(val);setFlashCopied(prev=>{const n=new Set(prev);n.add(val);return n;});};
      const copyAll=()=>{navigator.clipboard.writeText(rows.map(r=>r.copyVal).join('\n'));setFlashCopied(new Set(rows.map(r=>r.copyVal)));toast(`Copied all ${rows.length} handles 📋`,'ok');};
      const allDone=copiedCount===rows.length&&rows.length>0;
      return(<div className="ov" onClick={e=>e.target===e.currentTarget&&setShowFlashSale(false)}>
        <div className="sheet" style={{maxWidth:520,maxHeight:'85vh',display:'flex',flexDirection:'column'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:4}}>
            <span style={{fontSize:24,filter:'drop-shadow(0 2px 6px rgba(201,162,75,.4))'}}>🚀</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontFamily:'var(--fh)',fontSize:20,letterSpacing:2,lineHeight:1}}>FLASH SALE HANDLES</div>
              <div style={{fontSize:11,color:'var(--tx3)',marginTop:3}}>{copiedCount} / {rows.length} copied · click a handle to copy</div>
            </div>
            <button onClick={()=>setShowFlashSale(false)} style={{background:'transparent',border:'none',color:'var(--tx3)',fontSize:22,cursor:'pointer',padding:'0 4px',lineHeight:1}} aria-label="Close">×</button>
          </div>
          {allDone&&(
            <div style={{margin:'10px 0 6px',padding:'9px 12px',background:'rgba(107,155,125,.1)',border:'1px solid rgba(107,155,125,.32)',borderRadius:8,fontSize:12,color:'var(--gr)',fontWeight:600,display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:16}}>✓</span> All handles copied — ready to paste into TikTok Shop.
            </div>
          )}
          <div style={{display:'flex',gap:6,margin:'12px 0 10px'}}>
            <input className="inp" placeholder="Search handle or creator…" value={flashSearch} onChange={e=>setFlashSearch(e.target.value)} style={{flex:1,fontSize:13}}/>
            <button onClick={copyAll} style={{padding:'8px 12px',background:'var(--pu)',border:'none',borderRadius:'var(--rxs)',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)',whiteSpace:'nowrap'}} title="Copy every handle, newline-separated">📋 All</button>
            <button onClick={()=>setFlashCopied(new Set())} style={{padding:'8px 12px',background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:'var(--rxs)',color:'var(--tx2)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)',whiteSpace:'nowrap'}} title="Clear all green ticks">↺ Reset</button>
          </div>
          <div style={{flex:1,overflowY:'auto',background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:10}}>
            {filtered.length===0?(
              <div style={{padding:'22px 14px',textAlign:'center',color:'var(--tx3)',fontSize:12}}>{rows.length===0?'No TikTok handles on file yet.':'No matches.'}</div>
            ):filtered.map((r,i)=>{
              const done=flashCopied.has(r.copyVal);
              return(
                <div key={r.copyVal} onClick={()=>copyOne(r.copyVal)} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderBottom:i<filtered.length-1?'1px solid var(--bo)':'none',background:done?'rgba(107,155,125,.08)':'transparent',cursor:'pointer',transition:'background .12s'}}>
                  <div style={{width:22,height:22,borderRadius:'50%',border:`1.5px solid ${done?'var(--gr)':'var(--bo)'}`,background:done?'var(--gr)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:12,color:'#fff',fontWeight:700}}>{done?'✓':''}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13.5,fontWeight:600,color:done?'var(--gr)':'var(--tx)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.display}</div>
                    <div style={{fontSize:10,color:'var(--tx3)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{r.username}</div>
                  </div>
                  <span style={{fontSize:10,color:done?'var(--gr)':'var(--tx3)',letterSpacing:.5,fontWeight:600,flexShrink:0}}>{done?'COPIED':'COPY'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>);
    })()}
    {/* REDEEM-ALL PICK — bulk version of the per-tier redeem modal. Applies
        the same product/cash choice to every owed tier at once. Amounts stay at
        the catalog default per tier (admin can edit individually if needed). */}
    {redeemAllPick&&(()=>{
      const totalProduct=redeemAllPick.tiers.reduce((s,t)=>s+(Number(t.value)||0),0);
      const totalCash=totalProduct*0.8;
      const confirmAll=async(mode)=>{
        // Fire sequentially — toggleRewardRedeemed mutates state that the next
        // call reads (redeemedLevelsFor). Parallel would race.
        for(const t of redeemAllPick.tiers){
          const amt=mode==='cash'?(Number(t.value)||0)*0.8:(Number(t.value)||0);
          await toggleRewardRedeemed(redeemAllPick.profileId,t.level,mode,amt);
        }
        setRedeemAllPick(null);
      };
      return(<div className="ov" onClick={e=>e.target===e.currentTarget&&setRedeemAllPick(null)}>
        <div className="sheet" style={{maxWidth:420}}>
          <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:12}}>
            <span style={{fontSize:26}}>📦</span>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.4,textTransform:'uppercase',fontWeight:600}}>Bulk redeem</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--tx)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{redeemAllPick.username} · {redeemAllPick.tiers.length} tier{redeemAllPick.tiers.length===1?'':'s'}</div>
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--tx2)',marginBottom:11,lineHeight:1.5}}>How was every owed tier delivered? Same choice applies to all — amounts default to the catalog value per tier.</div>
          {/* Tier preview list so admin can see what's included before confirming. */}
          <div style={{display:'flex',flexDirection:'column',gap:4,marginBottom:12,padding:'8px 10px',background:'var(--card2)',borderRadius:8,maxHeight:140,overflowY:'auto'}}>
            {redeemAllPick.tiers.map(t=>(
              <div key={t.level} style={{display:'flex',alignItems:'center',gap:8,fontSize:11}}>
                <span style={{fontFamily:'var(--fh)',fontSize:10,color:'var(--pu2)',letterSpacing:.5,minWidth:22}}>L{t.level}</span>
                <span style={{flex:1,minWidth:0,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',color:'var(--tx2)'}}>{t.name||`Level ${t.level}`}</span>
                <span style={{fontFamily:'var(--fh)',fontSize:11,color:'#d4b465',flexShrink:0}}>{t.value>0?fmtGBP(t.value):'£?'}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:11}}>
            <button onClick={()=>confirmAll('product')} style={{display:'flex',alignItems:'center',gap:11,padding:'12px 14px',background:'rgba(107,155,125,.12)',border:'1px solid rgba(107,155,125,.4)',borderRadius:10,color:'var(--tx)',cursor:'pointer',textAlign:'left',fontFamily:'var(--fb)'}}>
              <span style={{fontSize:22,flexShrink:0}}>📦</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--gr)'}}>All as Product</div>
                <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Records {fmtGBP(totalProduct)} delivered total</div>
              </div>
            </button>
            <button onClick={()=>confirmAll('cash')} style={{display:'flex',alignItems:'center',gap:11,padding:'12px 14px',background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.35)',borderRadius:10,color:'var(--tx)',cursor:'pointer',textAlign:'left',fontFamily:'var(--fb)'}}>
              <span style={{fontSize:22,flexShrink:0}}>💷</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'#d4b465'}}>All as Cash <span style={{fontSize:10,color:'var(--tx3)',fontWeight:500}}>(80%)</span></div>
                <div style={{fontSize:11,color:'var(--tx3)',marginTop:2}}>Records {fmtGBP(totalCash)} delivered total</div>
              </div>
            </button>
          </div>
          <button onClick={()=>setRedeemAllPick(null)} style={{width:'100%',padding:9,background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:8,color:'var(--tx2)',fontSize:12,cursor:'pointer',fontFamily:'var(--fb)'}}>Cancel</button>
        </div>
      </div>);
    })()}
    {/* REDEEM PICK — asks the admin whether a tier was delivered as the product
        or the 80% cash alternative, so the recorded delivered total reflects what
        the business actually paid out. */}
    {redeemPick&&(()=>{
      const v=Number(redeemPick.value||0);
      // Parse the current input; use the tier value as the fallback so an empty
      // field still records something meaningful rather than 0.
      const parseAmt=(s,fallback)=>{const n=parseFloat(s);return isNaN(n)||n<0?fallback:n;};
      const confirm=async(mode)=>{
        const raw=mode==='cash'?redeemPickCashAmt:redeemPickProductAmt;
        const amt=parseAmt(raw,mode==='cash'?v*0.8:v);
        await toggleRewardRedeemed(redeemPick.profileId,redeemPick.level,mode,amt);
        setRedeemPick(null);
      };
      const amtInput=(val,setVal,accent)=>(
        <div style={{display:'flex',alignItems:'center',gap:0,background:'var(--bg2)',border:`1px solid ${accent}`,borderRadius:8,paddingLeft:10}}>
          <span style={{fontFamily:'var(--fh)',fontSize:16,color:accent,letterSpacing:.5}}>£</span>
          <input type="number" value={val} onChange={e=>setVal(e.target.value)} step="0.01" min="0" inputMode="decimal" style={{flex:1,padding:'8px 10px 8px 4px',background:'transparent',border:'none',color:'var(--tx)',fontFamily:'var(--fh)',fontSize:16,letterSpacing:.5,outline:'none',minWidth:0,width:'100%'}}/>
        </div>
      );
      return(<div className="ov" onClick={e=>e.target===e.currentTarget&&setRedeemPick(null)}>
        <div className="sheet" style={{maxWidth:400}}>
          <div style={{display:'flex',alignItems:'center',gap:11,marginBottom:14}}>
            <div style={{width:46,height:46,borderRadius:10,background:redeemPick.image?'transparent':'rgba(201,162,75,.14)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,overflow:'hidden',flexShrink:0,border:'1px solid var(--bo)'}}>{redeemPick.image?<img src={redeemPick.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'🎁'}</div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:1.4,textTransform:'uppercase',fontWeight:600}}>L{redeemPick.level}</div>
              <div style={{fontSize:15,fontWeight:700,color:'var(--tx)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{redeemPick.name||`Level ${redeemPick.level} Reward`}</div>
            </div>
          </div>
          <div style={{fontSize:12,color:'var(--tx2)',marginBottom:12,lineHeight:1.5}}>How was this delivered? Amounts default to the catalog guesstimate — edit if the real cost differed.</div>
          <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:12}}>
            <div style={{padding:'12px 14px',background:'rgba(107,155,125,.09)',border:'1px solid rgba(107,155,125,.32)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{fontSize:20}}>📦</span>
                <div style={{fontSize:13,fontWeight:700,color:'var(--gr)',fontFamily:'var(--fb)',flex:1}}>Product</div>
                <span style={{fontSize:9,color:'var(--tx3)',letterSpacing:.5,fontWeight:600}}>GUESSTIMATE {fmtGBP(v)}</span>
              </div>
              {amtInput(redeemPickProductAmt,setRedeemPickProductAmt,'rgba(107,155,125,.4)')}
              <button onClick={()=>confirm('product')} style={{marginTop:8,width:'100%',padding:'9px',background:'rgba(107,155,125,.18)',border:'1px solid rgba(107,155,125,.4)',color:'var(--gr)',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)',letterSpacing:.4}}>✓ CONFIRM PRODUCT</button>
            </div>
            <div style={{padding:'12px 14px',background:'rgba(201,162,75,.08)',border:'1px solid rgba(201,162,75,.32)',borderRadius:10}}>
              <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
                <span style={{fontSize:20}}>💷</span>
                <div style={{fontSize:13,fontWeight:700,color:'#d4b465',fontFamily:'var(--fb)',flex:1}}>Cash alternative <span style={{fontSize:10,color:'var(--tx3)',fontWeight:500}}>(80%)</span></div>
                <span style={{fontSize:9,color:'var(--tx3)',letterSpacing:.5,fontWeight:600}}>GUESSTIMATE {fmtGBP(v*0.8)}</span>
              </div>
              {amtInput(redeemPickCashAmt,setRedeemPickCashAmt,'rgba(201,162,75,.4)')}
              <button onClick={()=>confirm('cash')} style={{marginTop:8,width:'100%',padding:'9px',background:'rgba(201,162,75,.18)',border:'1px solid rgba(201,162,75,.4)',color:'#d4b465',fontSize:12,fontWeight:700,cursor:'pointer',borderRadius:8,fontFamily:'var(--fb)',letterSpacing:.4}}>✓ CONFIRM CASH</button>
            </div>
          </div>
          <button onClick={()=>setRedeemPick(null)} style={{width:'100%',padding:9,background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:8,color:'var(--tx2)',fontSize:12,cursor:'pointer',fontFamily:'var(--fb)'}}>Cancel</button>
        </div>
      </div>);
    })()}
    {showAdminGate&&(<div className="ov" onClick={e=>e.target===e.currentTarget&&setShowAdminGate(false)}>
      <div className="sheet">
        <div style={{fontFamily:'var(--fh)',fontSize:21,letterSpacing:2,marginBottom:3}}>🔐 ADMIN</div>
        <div style={{fontSize:13,color:'var(--tx2)',marginBottom:13}}>Enter the admin password.</div>
        <input className="inp" type="password" value={adminPass} onChange={e=>setAdminPass(e.target.value)} placeholder="Admin password" onKeyDown={e=>e.key==='Enter'&&checkAdminPass()} style={{marginBottom:10}}/>
        <button className="clmbtn" onClick={checkAdminPass}>ENTER</button>
        <div style={{color:'var(--re)',fontSize:12,textAlign:'center',marginTop:5,minHeight:15}}>{adminErr}</div>
        <button className="shcan" onClick={()=>setShowAdminGate(false)}>Cancel</button>
      </div>
    </div>)}

    {/* LEVEL UP */}
    {levelUpAnim&&(<div className="lvlup-ov" onClick={()=>setLevelUpAnim(null)}>
      <div className="lvlup-box">
        <div className="lvlup-rays"/>
        <span className="lvlup-shield">🏆</span>
        <div className="lvlup-txt">LEVEL {levelUpAnim}</div>
        <div className="lvlup-sub">You've reached Level {levelUpAnim}!</div>
        <button onClick={()=>setLevelUpAnim(null)} style={{marginTop:20,padding:'9px 26px',background:'var(--pu)',border:'none',borderRadius:'var(--rsm)',color:'#fff',fontFamily:'var(--fh)',fontSize:17,letterSpacing:2,cursor:'pointer'}}>KEEP GOING</button>
      </div>
    </div>)}

    {showDiscordCta&&(()=>{
      const canClose=discordCountdown<=0;
      const dismiss=()=>{if(profile?.id)localStorage.setItem(`hn-discord-cta-${profile.id}`,'1');setShowDiscordCta(false);};
      return(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center',padding:'18px',backdropFilter:'blur(4px)',animation:'fi .25s ease'}}>
          <div style={{position:'relative',width:'100%',maxWidth:380,background:'linear-gradient(155deg,#5865F2 0%,#7c3aed 55%,#c9a24b 100%)',borderRadius:22,padding:'30px 22px 22px',color:'#fff',boxShadow:'0 0 60px rgba(88,101,242,.45),0 20px 50px rgba(0,0,0,.55)',textAlign:'center'}}>
            <button onClick={canClose?dismiss:undefined} disabled={!canClose} aria-label={canClose?'Close':`Wait ${discordCountdown}s`} style={{position:'absolute',top:12,right:12,width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,.18)',border:'none',color:'#fff',fontSize:canClose?15:13,cursor:canClose?'pointer':'not-allowed',opacity:canClose?1:.55,display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontFamily:'var(--fb)',transition:'opacity .2s'}}>{canClose?'✕':discordCountdown}</button>
            <div style={{fontSize:36,marginBottom:6,filter:'drop-shadow(0 2px 6px rgba(0,0,0,.3))'}}>⚠️</div>
            <div style={{fontFamily:'var(--fh)',fontSize:26,letterSpacing:1.8,lineHeight:1.05,marginBottom:8}}>JOIN THE HOLLEN DISCORD</div>
            <div style={{fontSize:10,textTransform:'uppercase',letterSpacing:2.4,fontWeight:800,opacity:.9,marginBottom:14,color:'#fff'}}>Required to use this app</div>
            <div style={{fontSize:13,lineHeight:1.55,opacity:.94,marginBottom:22}}>
              Hollen works <strong>alongside</strong> our Discord. Without joining, you'll miss reward drops, payouts, training, and product announcements.<br/><br/>This app is built on top of the Discord community — <strong>it is not optional</strong>.
            </div>
            <a href="https://discord.gg/eR4eJAhcVG" target="_blank" rel="noopener noreferrer" onClick={dismiss} style={{display:'block',width:'100%',padding:'14px',background:'#fff',color:'#5865F2',borderRadius:12,fontFamily:'var(--fh)',fontSize:19,letterSpacing:2,textDecoration:'none',fontWeight:600,boxShadow:'0 6px 18px rgba(0,0,0,.18)'}}>💬 JOIN DISCORD</a>
            <div style={{fontSize:10,opacity:.55,marginTop:11,letterSpacing:.5}}>discord.gg/eR4eJAhcVG</div>
            <div style={{fontSize:11,opacity:.85,marginTop:14,padding:'10px 12px',background:'rgba(0,0,0,.18)',borderRadius:10,lineHeight:1.4}}>
              Trouble joining? <a href="https://wa.me/447498435748" target="_blank" rel="noopener noreferrer" style={{color:'#fff',textDecoration:'underline',fontWeight:700,whiteSpace:'nowrap'}}>WhatsApp +44 7498 435748</a>
            </div>
          </div>
        </div>
      );
    })()}

    {PwModals}
    {/* MONTHLY RECAP — shareable end-of-month card. Pops automatically on the
        first visit of a new month, or on demand via Profile menu. */}
    {monthlyRecap&&(()=>{
      const handle=(profile?.tiktok_handles||[])[0]||('@'+(profile?.username||''));
      const lv=getLv(profile?.xp||0,LEVELS);
      const fmtGBPc=(n)=>{const v=n||0;return Math.abs(v)>=1000?'£'+Math.round(v).toLocaleString('en-GB'):'£'+v.toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2});};
      const now=new Date();
      const monthNames=['January','February','March','April','May','June','July','August','September','October','November','December'];
      const monthShort=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const refCode=profile?.referral_code||'';
      return(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.82)',zIndex:650,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-start',padding:'calc(70px + var(--st)) 16px calc(24px + var(--sb))',backdropFilter:'blur(6px)',overflowY:'auto'}}>
          {/* Top toolbar — sits outside the card so screenshots stay clean.
              `top` uses the iOS safe-area inset so the chip/✕ clear the
              notch + status bar instead of sitting underneath them. */}
          <div style={{position:'fixed',top:'calc(14px + var(--st))',left:0,right:0,zIndex:6,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 18px',pointerEvents:'none'}}>
            <button onClick={()=>{setShowMonthPicker(true);setPickerYear(monthlyRecap.year);}} disabled={monthlyRecapLoading} style={{pointerEvents:'auto',padding:'7px 14px',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.18)',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',borderRadius:99,fontFamily:'var(--fb)',display:'flex',alignItems:'center',gap:6,backdropFilter:'blur(8px)'}}>📅 {monthShort[monthlyRecap.month]} {monthlyRecap.year} <span style={{opacity:.6,fontSize:10}}>▾</span></button>
            <button onClick={()=>setMonthlyRecap(null)} style={{pointerEvents:'auto',width:34,height:34,borderRadius:'50%',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.18)',color:'#fff',fontSize:14,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,backdropFilter:'blur(8px)'}}>✕</button>
          </div>
          {/* THE CARD — same visual vibe as the Rewards page: deep purple
              base with a wireframe grid overlay, atmospheric purple mist
              glow from the centre. Big logo top. ~340 wide.
              id='ll-recap-card' for share. */}
          <div id="ll-recap-card" style={{position:'relative',width:'100%',maxWidth:340,background:'#0a0218',backgroundImage:'radial-gradient(ellipse at 50% 25%, rgba(201,162,75,.55) 0%, rgba(201,162,75,.18) 30%, transparent 65%),linear-gradient(rgba(201,162,75,.12) 1px, transparent 1px),linear-gradient(90deg, rgba(201,162,75,.12) 1px, transparent 1px)',backgroundSize:'auto, 32px 32px, 32px 32px',backgroundPosition:'center center, center center, center center',borderRadius:24,overflow:'hidden',border:'1px solid rgba(201,162,75,.35)',boxShadow:'0 24px 60px rgba(0,0,0,.7),0 0 100px rgba(201,162,75,.4)',flexShrink:0}}>
            {/* Atmospheric mist puffs — soft purple radials with blur */}
            <div style={{position:'absolute',top:'18%',left:'18%',width:180,height:180,background:'radial-gradient(circle, rgba(192,38,211,.45) 0%, transparent 70%)',pointerEvents:'none',filter:'blur(24px)'}}/>
            <div style={{position:'absolute',bottom:'12%',right:'12%',width:160,height:160,background:'radial-gradient(circle, rgba(201,162,75,.35) 0%, transparent 70%)',pointerEvents:'none',filter:'blur(20px)'}}/>
            {/* LARGE LOGO at top, centered — the hero brand element */}
            <div style={{position:'relative',padding:'30px 18px 8px',display:'flex',justifyContent:'center'}}>
              <img src="/hollen-rewards-logo.png" alt="Hollen" style={{width:220,filter:'invert(1) drop-shadow(0 4px 20px rgba(245,241,235,.35))'}} onError={e=>{e.target.style.display='none';}}/>
            </div>
            {/* Month label below logo */}
            <div style={{position:'relative',textAlign:'center',marginTop:6}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:3.5,fontWeight:600}}>{monthlyRecap.isEmpty?'No data':monthlyRecap.isCurrent?'In Progress':'Monthly Recap'}</div>
              <div style={{fontFamily:'var(--fh)',fontSize:22,letterSpacing:2.5,color:'#fff',marginTop:4}}>{monthNames[monthlyRecap.month].toUpperCase()} {monthlyRecap.year}</div>
            </div>
            {/* BODY */}
            {monthlyRecap.isEmpty?(
              <div style={{position:'relative',padding:'40px 22px 32px',textAlign:'center'}}>
                <div style={{fontSize:36,marginBottom:8,opacity:.55}}>📭</div>
                <div style={{fontSize:13,color:'rgba(255,255,255,.85)',marginBottom:4}}>No imports this month</div>
                <div style={{fontSize:11,color:'rgba(255,255,255,.55)'}}>Tap 📅 above to pick another month</div>
              </div>
            ):(<>
              {/* HERO NUMBER — green money, glow on the dark backdrop */}
              <div style={{position:'relative',padding:'22px 18px 0',textAlign:'center'}}>
                <div style={{fontSize:9,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:3,fontWeight:700,marginBottom:6}}>Net GMV</div>
                <div style={{fontFamily:'var(--fh)',fontSize:54,lineHeight:1,color:'#6b9b7d',letterSpacing:1,textShadow:'0 0 30px rgba(107,155,125,.55),0 2px 12px rgba(0,0,0,.4)'}}>{fmtGBPc(monthlyRecap.netGMV)}</div>
              </div>
              {/* SPARKLINE — daily GMV. Green line with glow to match the GMV. */}
              {(()=>{
                const dailyGMV=monthlyRecap.dailyGMV||[];
                if(dailyGMV.length===0)return null;
                const max=Math.max(...dailyGMV,1);
                const W=304,H=58,PAD=4;
                const innerW=W-PAD*2,innerH=H-PAD*2;
                const xAt=(i)=>PAD+(i/(dailyGMV.length-1))*innerW;
                const yAt=(v)=>PAD+innerH-(v/max)*innerH;
                const pts=dailyGMV.map((v,i)=>`${xAt(i)},${yAt(v)}`).join(' ');
                const areaPts=`${PAD},${H-PAD} ${pts} ${W-PAD},${H-PAD}`;
                const peakIdx=dailyGMV.indexOf(max);
                return(
                  <div style={{position:'relative',padding:'18px 18px 0'}}>
                    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{display:'block',filter:'drop-shadow(0 0 8px rgba(107,155,125,.5))'}}>
                      <defs>
                        <linearGradient id="rcSpark" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6b9b7d" stopOpacity=".45"/><stop offset="100%" stopColor="#6b9b7d" stopOpacity="0"/></linearGradient>
                      </defs>
                      <polygon points={areaPts} fill="url(#rcSpark)"/>
                      <polyline points={pts} fill="none" stroke="#6b9b7d" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
                      {dailyGMV[peakIdx]>0&&(<circle cx={xAt(peakIdx)} cy={yAt(max)} r="3.5" fill="#fff" stroke="#6b9b7d" strokeWidth="1.5"/>)}
                    </svg>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'rgba(255,255,255,.45)',marginTop:2,fontFamily:'var(--fb)',fontWeight:600}}>
                      <span>1</span>
                      <span style={{color:'rgba(255,255,255,.8)'}}>PEAK · {peakIdx+1} {monthShort[monthlyRecap.month].toUpperCase()}</span>
                      <span>{dailyGMV.length}</span>
                    </div>
                  </div>
                );
              })()}
              {/* STATS — purple-tinted panel for the dark backdrop */}
              <div style={{position:'relative',display:'grid',gridTemplateColumns:'1fr 1fr 1fr',margin:'18px 18px 0',background:'rgba(201,162,75,.12)',border:'1px solid rgba(201,162,75,.28)',borderRadius:12,padding:'10px 0',backdropFilter:'blur(8px)'}}>
                <div style={{textAlign:'center',borderRight:'1px solid rgba(201,162,75,.25)'}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:16,color:'#fff',letterSpacing:.5,lineHeight:1}}>{fmtGBPc(monthlyRecap.commission)}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:1.2,fontWeight:700,marginTop:4}}>Commission</div>
                </div>
                <div style={{textAlign:'center',borderRight:'1px solid rgba(201,162,75,.25)'}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:16,color:monthlyRecap.rank===1?'#fde047':'#fff',letterSpacing:.5,lineHeight:1}}>{monthlyRecap.rank?'#'+monthlyRecap.rank:'—'}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:1.2,fontWeight:700,marginTop:4}}>Rank{monthlyRecap.totalRanked?'/'+monthlyRecap.totalRanked:''}</div>
                </div>
                <div style={{textAlign:'center'}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:16,color:'#d4b465',letterSpacing:.5,lineHeight:1}}>+{monthlyRecap.xpGained>=1000?(monthlyRecap.xpGained/1000).toFixed(1)+'k':monthlyRecap.xpGained.toLocaleString()}</div>
                  <div style={{fontSize:8,color:'rgba(255,255,255,.55)',textTransform:'uppercase',letterSpacing:1.2,fontWeight:700,marginTop:4}}>XP</div>
                </div>
              </div>
              {/* TOP PRODUCT */}
              {monthlyRecap.topName&&(
                <div style={{position:'relative',margin:'10px 18px 0',display:'flex',alignItems:'center',gap:10,padding:'8px 10px',background:'rgba(201,162,75,.1)',border:'1px solid rgba(201,162,75,.22)',borderRadius:10,backdropFilter:'blur(8px)'}}>
                  <div style={{width:32,height:32,borderRadius:6,background:monthlyRecap.topImage?'transparent':'rgba(255,255,255,.06)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,overflow:'hidden',flexShrink:0}}>{monthlyRecap.topImage?<img src={monthlyRecap.topImage} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'📦'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:8,color:'rgba(255,255,255,.5)',textTransform:'uppercase',letterSpacing:1.2,fontWeight:700}}>🏆 Top Product</div>
                    <div style={{fontSize:12,fontWeight:600,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{monthlyRecap.topName}</div>
                  </div>
                  <div style={{fontFamily:'var(--fh)',fontSize:13,color:'#6b9b7d',flexShrink:0}}>{fmtGBPc(monthlyRecap.topGMV)}</div>
                </div>
              )}
            </>)}
            {/* USER + REFERRAL FOOTER — purple-tinted glass card */}
            <div style={{position:'relative',margin:'14px 18px 0',padding:'12px 12px',background:'rgba(201,162,75,.14)',border:'1px solid rgba(201,162,75,.3)',borderRadius:12,backdropFilter:'blur(10px)'}}>
              <div style={{display:'flex',alignItems:'center',gap:9,marginBottom:refCode?9:0}}>
                <div style={{width:30,height:30,borderRadius:'50%',background:profile?.avatar_url?'transparent':avc(profile?.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:11,color:'#fff',flexShrink:0,overflow:'hidden',border:'1.5px solid rgba(201,162,75,.6)'}}>{profile?.avatar_url?<img src={profile.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(profile?.username)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{handle}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,.65)'}}>LVL {lv.level} · {(profile?.xp||0).toLocaleString()} XP</div>
                </div>
              </div>
              {refCode&&(
                <div style={{paddingTop:9,borderTop:'1px solid rgba(201,162,75,.25)',textAlign:'center'}}>
                  <div style={{fontSize:10,color:'rgba(255,255,255,.7)',lineHeight:1.4,marginBottom:5}}><strong style={{color:'#6b9b7d',fontWeight:700}}>+100 XP</strong> sign-up bonus when you join with code:</div>
                  <div style={{fontFamily:'var(--fh)',fontSize:18,letterSpacing:4,color:'#fff',lineHeight:1,marginBottom:4,textShadow:'0 0 14px rgba(201,162,75,.6)'}}>{refCode}</div>
                  <div style={{fontSize:9.5,color:'rgba(255,255,255,.55)'}}>hollen.app</div>
                </div>
              )}
            </div>
            <div style={{height:16}}/>
          </div>
          {/* SHARE BUTTON — lives outside the card so it doesn't appear in the rasterised image. */}
          <div style={{position:'relative',display:'flex',gap:10,justifyContent:'center',marginTop:18,width:'100%',maxWidth:380,flexShrink:0}}>
            <button onClick={shareRecap} disabled={shareLoading||monthlyRecap.isEmpty} style={{flex:1,padding:'13px 18px',background:shareLoading?'rgba(201,162,75,.4)':'linear-gradient(135deg,#c9a24b 0%,#8ba4a8 100%)',border:'none',color:'#fff',fontSize:14,fontWeight:700,letterSpacing:.5,cursor:(shareLoading||monthlyRecap.isEmpty)?'not-allowed':'pointer',borderRadius:14,fontFamily:'var(--fb)',display:'flex',alignItems:'center',justifyContent:'center',gap:8,boxShadow:'0 8px 24px rgba(201,162,75,.4)',opacity:monthlyRecap.isEmpty?.5:1}}>
              {shareLoading?'⏳ Generating...':'📤 Share Recap'}
            </button>
          </div>
          {/* CALENDAR MONTH PICKER — opens on top of the recap when user taps the date chip. */}
          {showMonthPicker&&(
            <div style={{position:'fixed',inset:0,background:'rgba(7,7,16,.92)',zIndex:660,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',backdropFilter:'blur(10px)'}} onClick={()=>setShowMonthPicker(false)}>
              <div onClick={e=>e.stopPropagation()} style={{width:'100%',maxWidth:340,background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:20,padding:'22px',position:'relative'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:18}}>
                  <button onClick={()=>setPickerYear(y=>y-1)} style={{width:32,height:32,borderRadius:'50%',background:'var(--card2)',border:'1px solid var(--bo)',color:'#fff',fontSize:16,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fb)',fontWeight:700}}>‹</button>
                  <div style={{fontFamily:'var(--fh)',fontSize:26,letterSpacing:2.5,color:'#fff'}}>{pickerYear}</div>
                  <button onClick={()=>setPickerYear(y=>y+1)} disabled={pickerYear>=now.getFullYear()} style={{width:32,height:32,borderRadius:'50%',background:'var(--card2)',border:'1px solid var(--bo)',color:'#fff',fontSize:16,cursor:pickerYear>=now.getFullYear()?'not-allowed':'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fb)',fontWeight:700,opacity:pickerYear>=now.getFullYear()?.3:1}}>›</button>
                </div>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
                  {monthShort.map((label,i)=>{
                    const isFuture=pickerYear>now.getFullYear()||(pickerYear===now.getFullYear()&&i>now.getMonth());
                    const isSelected=pickerYear===monthlyRecap.year&&i===monthlyRecap.month;
                    return(
                      <button key={i} disabled={isFuture||monthlyRecapLoading} onClick={()=>{loadRecapForMonth(pickerYear,i);setShowMonthPicker(false);}} style={{padding:'14px 0',borderRadius:12,border:isSelected?'1px solid rgba(201,162,75,.5)':'1px solid var(--bo)',background:isSelected?'rgba(201,162,75,.22)':'var(--card2)',color:isFuture?'rgba(255,255,255,.25)':'#fff',fontFamily:'var(--fh)',fontSize:15,letterSpacing:1.5,cursor:isFuture?'not-allowed':'pointer',transition:'background .15s'}}>{label}</button>
                    );
                  })}
                </div>
                <button onClick={()=>setShowMonthPicker(false)} style={{width:'100%',marginTop:16,padding:'10px',background:'transparent',border:'1px solid var(--bo)',borderRadius:10,color:'var(--tx3)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)'}}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      );
    })()}
    <div className="toastwrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>
  </div>
  {/* BOTTOM NAV - mobile only. Placed OUTSIDE .app so it has no overflow:hidden
      ancestor — iOS WebKit can pin position:fixed children inside overflow:hidden
      to a stale viewport-bottom value during initial paint. */}
  {!isDesktop&&<div className={`bnav${navDragging?' dragging':''}`} ref={bnavRef} onPointerDown={navDown} onPointerMove={navMoveEvt} onPointerUp={navUp} onPointerCancel={navUp}>
    <div className="nind" style={navIndStyle}/>
    {bnavItems.map(([pg,icon,label],i)=>(
      <button key={pg} className={`ni${i===navHot?' on':''}`} type="button">
        <div className="nicon">{icon}</div><div className="nlbl">{label}</div>
      </button>
    ))}
  </div>}
  </>);
}
