import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './lib/supabase';
import * as XLSX from 'xlsx';

const ADMIN_PASSWORD = process.env.REACT_APP_ADMIN_PASSWORD || 'LoopholeLads123';
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
  product:['product name','product','item name','product title','sku name','listing name','product id','item','listing'],
  cancelled:['items refunded','cancelled orders','cancellations','canceled orders','cancelled','canceled','refunded orders','returns','returned orders','cancel count'],
  cancelled_gmv:['refunds','cancelled gmv','canceled gmv','refunded gmv','returned gmv','cancellation value','refund value','return value','cancelled value'],
  live_streams:['live streams','lives','live stream count','livestreams','live','streams'],
};

function MiniChart({xpEvents}){
  const importEvents=(xpEvents||[]).filter(e=>e.reason==='import'&&(e.gmv>0||e.commission>0));
  if(importEvents.length<1) return(
    <div style={{borderRadius:14,overflow:'hidden',marginBottom:10}}>
      <div style={{height:3,background:'linear-gradient(90deg,#10b981,#06b6d4)'}}/>
      <div style={{background:'var(--card)',padding:'14px 16px',textAlign:'center'}}>
        <div style={{fontSize:10,color:'var(--tx3)',marginBottom:4,textTransform:'uppercase',letterSpacing:1.5,fontWeight:500}}>GMV &amp; Commission</div>
        <div style={{fontSize:12,color:'var(--tx3)'}}>Import sales data to see your earnings trend</div>
      </div>
    </div>
  );
  let cumG=0,cumC=0;
  const points=importEvents.map(e=>{cumG+=e.gmv||0;cumC+=e.commission||0;return{gmv:cumG,comm:cumC,date:new Date(e.created_at)};});
  const maxVal=Math.max(...points.map(p=>p.gmv),1);
  const W=320,H=90,PAD=8;
  const xScale=(i)=>points.length===1?W/2:PAD+((i/(points.length-1))*(W-PAD*2));
  const yScale=(v)=>H-PAD-((v/maxVal))*(H-PAD*2);
  const gmvPath=points.map((p,i)=>`${i===0?'M':'L'}${xScale(i).toFixed(1)},${yScale(p.gmv).toFixed(1)}`).join(' ');
  const commPath=points.map((p,i)=>`${i===0?'M':'L'}${xScale(i).toFixed(1)},${yScale(p.comm).toFixed(1)}`).join(' ');
  const gmvArea=gmvPath+` L${xScale(points.length-1).toFixed(1)},${H} L${xScale(0).toFixed(1)},${H} Z`;
  const lastDate=points[points.length-1].date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const firstDate=points[0].date.toLocaleDateString('en-GB',{day:'numeric',month:'short'});
  const totalGMV=points[points.length-1].gmv;
  const totalComm=points[points.length-1].comm;
  return(
    <div style={{borderRadius:14,overflow:'hidden',marginBottom:10}}>
      <div style={{height:3,background:'linear-gradient(90deg,#10b981,#06b6d4)'}}/>
      <div style={{background:'var(--card)',padding:'12px 14px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
        <div style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1}}>GMV &amp; Commission</div>
        <div style={{display:'flex',gap:10}}>
          <span style={{fontSize:11,color:'var(--gr)',fontWeight:600}}>● {fmtGBP(totalGMV)}</span>
          <span style={{fontSize:11,color:'var(--go)',fontWeight:600}}>● {fmtGBP(totalComm)}</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',height:90,overflow:'visible'}}>
        <defs>
          <linearGradient id="gmvgrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="#10b981" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d={gmvArea} fill="url(#gmvgrad)"/>
        <path d={gmvPath} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        <path d={commPath} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 3"/>
        <circle cx={xScale(points.length-1)} cy={yScale(totalGMV)} r="3" fill="#10b981"/>
        <circle cx={xScale(points.length-1)} cy={yScale(totalComm)} r="3" fill="#f59e0b"/>
      </svg>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'var(--tx3)',marginTop:2}}>
        <span>{firstDate}</span><span>{lastDate}</span>
      </div>
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
function getNx(xp,levels){const L=levels||DEFAULT_LEVELS;const c=getLv(xp,L);const i=L.findIndex(l=>l.level===c.level);return L[i+1]||null}
function xpPct(xp,levels){const c=getLv(xp,levels);return Math.min(100,Math.round(((xp-c.min)/(c.max-c.min))*100))}
function ini(n){return(n||'').slice(0,2).toUpperCase()||'??'}
function avc(n){const c=['#8b5cf6','#a855f7','#06b6d4','#f59e0b','#10b981','#f43f5e'];let h=0;for(const x of n||'')h=(h*31+x.charCodeAt(0))%c.length;return c[h]}
function tdy(){return new Date().toISOString().slice(0,10)}
function fmtGBP(v){return'£'+(Number(v)||0).toLocaleString('en-GB',{minimumFractionDigits:2,maximumFractionDigits:2})}
function findCol(headers,type){const maps=TCOLS[type];for(const m of maps){const f=headers.find(h=>h.toLowerCase().replace(/[_\-]/g,' ').trim()===m||h.toLowerCase().includes(m));if(f)return f;}return null}
function parseCSV(text){const lines=text.split(/\r?\n/).filter(l=>l.trim());if(!lines.length)return[];const dl=lines[0].includes('\t')?'\t':',';const hdrs=splitLine(lines[0],dl);return lines.slice(1).map(line=>{const vals=splitLine(line,dl);const obj={};hdrs.forEach((h,i)=>{obj[h.trim()]=vals[i]!==undefined?vals[i].trim():'';});return obj;}).filter(r=>Object.values(r).some(v=>v))}
function splitLine(l,dl){const r=[];let cur='';let inQ=false;for(const c of l){if(c==='"'){inQ=!inQ;}else if(c===dl&&!inQ){r.push(cur);cur='';}else{cur+=c;}}r.push(cur);return r.map(s=>s.replace(/^"|"$/g,'').trim())}

const CSS=`
:root{--bg:#070710;--bg2:#0e0e1c;--card:#12121f;--card2:#1a1a2e;--card3:#22223d;--bo:rgba(255,255,255,.07);--bo2:rgba(255,255,255,.13);--tx:#eeeef8;--tx2:rgba(238,238,248,.55);--tx3:rgba(238,238,248,.3);--pu:#8b5cf6;--pu2:#a78bfa;--pu3:#c4b5fd;--go:#f59e0b;--gr:#10b981;--re:#f43f5e;--cy:#06b6d4;--r:14px;--rsm:10px;--rxs:7px;--nav:52px;--sb:env(safe-area-inset-bottom,0px);--st:env(safe-area-inset-top,0px);--fh:'Bebas Neue',sans-serif;--fb:'Space Grotesk',sans-serif;}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{height:100%;margin:0}#root{min-height:100%;background:#030308;color:var(--tx);font-family:var(--fb)}
input,button{font-family:var(--fb)}
.app{display:flex;flex-direction:column;height:100vh;height:100dvh;width:100%;position:relative;overflow:hidden;max-width:100%}

.topbar{padding:9px 14px 8px;padding-top:calc(9px + var(--st));display:flex;align-items:center;justify-content:space-between;background:rgba(7,7,16,.96);backdrop-filter:blur(12px);border-bottom:1px solid var(--bo);flex-shrink:0}
.topbar.no-st{padding-top:9px}
.upd-banner{background:rgba(139,92,246,.1);border-bottom:1px solid rgba(139,92,246,.2);padding:5px 14px;padding-top:calc(5px + var(--st));display:flex;align-items:center;justify-content:center;gap:6px;flex-shrink:0}
.tr{display:flex;align-items:center;gap:7px}
.streak-pill{display:flex;align-items:center;gap:4px;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.28);border-radius:99px;padding:3px 9px;font-size:13px;font-weight:700;color:var(--go);cursor:pointer;letter-spacing:.3px}
.xpchip{background:rgba(139,92,246,.18);border:1px solid rgba(139,92,246,.28);border-radius:99px;padding:3px 10px;font-size:12px;font-weight:600;color:var(--pu3)}
.av{width:29px;height:29px;border-radius:50%;border:2px solid var(--pu);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;cursor:pointer;font-family:var(--fh);letter-spacing:1px;overflow:hidden;flex-shrink:0}
.av img{width:100%;height:100%;object-fit:cover}
.pages{flex:1;overflow-y:auto;overflow-x:hidden;padding-bottom:calc(48px + var(--sb) + 8px);min-height:0;-webkit-overflow-scrolling:touch}
.pages::-webkit-scrollbar{display:none}
.pg{padding:13px}
.bnav{width:100%;background:rgba(7,7,16,.97);backdrop-filter:blur(16px);border-top:1px solid var(--bo2);display:flex;align-items:center;padding:9px 2px;padding-bottom:max(9px,var(--sb));z-index:50;flex:0 0 auto;max-height:80px;}
.ni{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px 2px;cursor:pointer;border:none;background:none;min-width:0;}
.ni.on .nicon{transform:scale(1.15)}
.nicon{font-size:17px;line-height:1;transition:transform .18s}
.nlbl{font-size:8px;text-transform:uppercase;letter-spacing:.3px;color:var(--tx3);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-align:center;}
.ni.on .nlbl{color:var(--pu2)}
.hero{background:var(--card);border:1px solid var(--bo2);border-radius:var(--r);padding:15px;margin-bottom:11px;position:relative;overflow:hidden}
.hero::after{content:'';position:absolute;top:-45px;right:-45px;width:150px;height:150px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.16) 0%,transparent 70%);pointer-events:none}
.lvlbadge{display:inline-flex;align-items:center;background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.26);border-radius:99px;padding:3px 9px;margin-bottom:7px}
.lvlbtxt{font-size:11px;color:var(--pu2);font-weight:600;letter-spacing:.5px;text-transform:uppercase}
.lvlnum{font-family:var(--fh);font-size:38px;letter-spacing:2px;line-height:1;margin-bottom:4px}
.lvlinfo{font-size:12px;color:var(--tx2);margin-bottom:10px}
.lvlinfo strong{color:var(--tx);font-weight:600}
.xpbar{height:7px;background:var(--card3);border-radius:99px;overflow:hidden}
.xpfill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--pu) 0%,var(--cy) 100%);transition:width 1.2s cubic-bezier(.34,1.56,.64,1)}
.xpnums{display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:var(--tx3)}
.chips{display:flex;gap:7px;margin-bottom:11px}
.chip{flex:1;background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:9px;text-align:center}
.chip.hot{border-color:rgba(245,158,11,.22);background:rgba(245,158,11,.04)}
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
.rc.un .rc-inner{border-color:rgba(16,185,129,.32);background:rgba(16,185,129,.04)}
.rc.cur .rc-inner{border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.08);box-shadow:0 0 12px rgba(139,92,246,.2)}
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
.lbrow.me{background:rgba(139,92,246,.06);border-radius:var(--rxs);margin:0 -4px;padding:8px 4px}
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
.admb{background:linear-gradient(135deg,rgba(139,92,246,.14) 0%,rgba(6,182,212,.07) 100%);border:1px solid rgba(139,92,246,.22);border-radius:var(--r);padding:13px;margin-bottom:11px;display:flex;align-items:center;gap:10px}
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
.xbtn{background:rgba(139,92,246,.14);border:1px solid rgba(139,92,246,.26);border-radius:var(--rxs);padding:4px 7px;color:var(--pu2);font-size:11px;font-weight:600;cursor:pointer}
.aact{width:100%;padding:9px 11px;background:var(--card2);border:1px solid var(--bo);border-radius:var(--rsm);color:var(--tx2);font-size:12px;cursor:pointer;margin-bottom:5px;text-align:left;display:flex;align-items:center;gap:8px;transition:border-color .2s}
.aact:hover{border-color:var(--pu2);color:var(--tx)}
.aact:last-child{margin-bottom:0}
.dz{border:2px dashed var(--bo2);border-radius:var(--r);padding:20px 13px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;position:relative}
.dz:hover,.dz.drag{border-color:var(--pu);background:rgba(139,92,246,.05)}
.dz input{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.ilog{background:var(--bg2);border:1px solid var(--bo);border-radius:var(--rsm);padding:9px;margin-top:7px;font-size:11px;color:var(--tx2);line-height:1.65;max-height:120px;overflow-y:auto;font-family:monospace}
.logo{color:var(--gr)}.logw{color:var(--go)}.loge{color:var(--re)}
.rerow{padding:9px 0;border-bottom:1px solid var(--bo)}
.rerow:last-child{border-bottom:none}
.ins{padding:7px 9px;background:var(--bg2);border:1px solid var(--bo2);border-radius:var(--rxs);color:var(--tx);font-size:12px;outline:none;width:100%}
.ins:focus{border-color:var(--pu2)}
.svbtn{background:rgba(16,185,129,.11);border:1px solid rgba(16,185,129,.23);border-radius:var(--rxs);padding:5px 9px;color:var(--gr);font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.bp-vcard{border-radius:var(--r);border:1px solid var(--bo);background:var(--card);padding:16px;margin:0 13px 11px;display:flex;gap:14px;align-items:center;cursor:pointer;position:relative;overflow:hidden;transition:transform .15s;}
.bp-vcard.un{border-color:rgba(16,185,129,.3);background:rgba(16,185,129,.05);}
.bp-vcard.cur{border-color:rgba(139,92,246,.5);background:rgba(139,92,246,.08);}
.bp-vcard.lk{opacity:.5;}
.bp-vcard.cur::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.18) 0%,transparent 70%);pointer-events:none;}
.bp-vcard.un::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,.12) 0%,transparent 70%);pointer-events:none;}
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
.bp-vbadge.un{background:rgba(16,185,129,.15);color:var(--gr);}
.bp-vbadge.cur{background:rgba(139,92,246,.2);color:var(--pu2);}
.bp-vbadge.lk{background:var(--card2);color:var(--tx3);}
.bp-next{background:linear-gradient(135deg,rgba(245,158,11,.1) 0%,rgba(245,158,11,.04) 100%);border:1px solid rgba(245,158,11,.3);border-radius:var(--r);padding:16px;margin:0 13px 13px;display:flex;align-items:center;gap:14px;cursor:pointer;}
.stat-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:11px}
.stat-card{background:var(--card);border:1px solid var(--bo);border-radius:var(--rsm);padding:11px}
.stat-v{font-family:var(--fh);font-size:18px;letter-spacing:1px;margin-bottom:2px}
.stat-l{font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--tx3)}
.ref-card{background:linear-gradient(135deg,rgba(139,92,246,.12) 0%,rgba(6,182,212,.08) 100%);border:1px solid rgba(139,92,246,.25);border-radius:var(--r);padding:15px;margin-bottom:11px}
.ref-code{font-family:var(--fh);font-size:24px;letter-spacing:4px;color:var(--pu2);background:var(--card2);border-radius:var(--rsm);padding:9px;text-align:center;margin:9px 0;cursor:pointer}
.howto-item{display:flex;align-items:center;gap:9px;padding:9px 0;border-bottom:1px solid var(--bo)}
.howto-item:last-child{border-bottom:none}
.howto-icon{font-size:18px;width:28px;text-align:center;flex-shrink:0}
.howto-xp{font-family:var(--fh);font-size:14px;color:var(--pu2);flex-shrink:0}
.pw{height:4px;background:var(--card3);border-radius:99px;overflow:hidden}
.pf{height:100%;background:linear-gradient(90deg,var(--pu),var(--cy));border-radius:99px}
.authwrap{min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;position:relative;overflow:hidden}
.authwrap::before{content:'';position:absolute;width:500px;height:500px;border-radius:50%;background:radial-gradient(circle,rgba(139,92,246,.12) 0%,transparent 70%);top:-80px;right:-150px;pointer-events:none}
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
.btnre{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.25);color:var(--re);font-family:var(--fb);font-size:13px;font-weight:500;padding:9px}
.ferr{min-height:15px;font-size:12px;color:var(--re);text-align:center;margin-top:4px}
.ov{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:200;display:flex;align-items:flex-end;justify-content:center;animation:fi .2s ease}
@keyframes fi{from{opacity:0}to{opacity:1}}
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
.lvlup-rays{position:absolute;inset:0;background:radial-gradient(circle,rgba(139,92,246,.28) 0%,transparent 60%);pointer-events:none;animation:rx .8s ease .1s both}
@keyframes rx{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:scale(1)}}
.toastwrap{position:fixed;top:calc(var(--st) + 62px);left:50%;transform:translateX(-50%);z-index:9998;display:flex;flex-direction:column;gap:5px;align-items:center;pointer-events:none}
.toast{background:var(--card2);border:1px solid var(--bo2);border-radius:99px;padding:7px 13px;font-size:12px;font-weight:500;white-space:nowrap;animation:ti .3s ease,to .3s ease 2.7s forwards}
.toast.ok{border-color:rgba(16,185,129,.38);color:var(--gr)}
.toast.info{border-color:rgba(139,92,246,.38);color:var(--pu2)}
.toast.wn{border-color:rgba(245,158,11,.38);color:var(--go)}
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
  const [loading,setLoading]=useState(false);
  const [profile,setProfile]=useState(null);
  const [rewards,setRewards]=useState([]);
  const [leaderboard,setLeaderboard]=useState([]);
  const [weeklyLeaderboard,setWeeklyLeaderboard]=useState([]);
  const [lbTab,setLbTab]=useState('alltime');
  const [milestones,setMilestones]=useState(DEFAULT_MILESTONES);
  const [page,setPage]=useState('home');
  const [adminUnlocked,setAdminUnlocked]=useState(()=>localStorage.getItem('ll-admin')==='true');
  const [levelUpAnim,setLevelUpAnim]=useState(null);
  const [showDaily,setShowDaily]=useState(false);
  const [showReward,setShowReward]=useState(null);
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
  const [adminPass,setAdminPass]=useState('');
  const [adminErr,setAdminErr]=useState('');
  const [allProfiles,setAllProfiles]=useState([]);
  const [xpAmounts,setXpAmounts]=useState({});
  const [importLog,setImportLog]=useState([]);
  const [showRE,setShowRE]=useState(false);
  const [editRewards,setEditRewards]=useState([]);
  const [showME,setShowME]=useState(false);
  const [editMilestones,setEditMilestones]=useState([]);
  const [dragOver,setDragOver]=useState(false);
  const [xpEvents,setXpEvents]=useState([]);
  const [dateRange,setDateRange]=useState('all');
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
  const [xpExclusions,setXpExclusions]=useState([]);
  const [showExclusions,setShowExclusions]=useState(false);
  const [newExclusionUser,setNewExclusionUser]=useState('');
  const [newExclusionProduct,setNewExclusionProduct]=useState('');
  const [newExclusionStart,setNewExclusionStart]=useState('');
  const [newExclusionEnd,setNewExclusionEnd]=useState('');


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
        });
        sub=subscription;
      }catch(e){console.error('auth sub error:',e);}
    };
    init();
    const t=setTimeout(()=>setLoading(false),3000);
    return()=>{if(sub)sub.unsubscribe();clearTimeout(t);};
  },[]);
  useEffect(()=>{const fn=()=>setIsDesktop(window.innerWidth>=768);window.addEventListener('resize',fn);return()=>window.removeEventListener('resize',fn);},[]);

  async function loadProfile(id){const {data}=await supabase.from('profiles').select('*').eq('id',id).single();if(data){setProfile(data);await loadXpEvents(id);}}
  async function loadTopProduct(profileId){const {data}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',profileId).order('gmv',{ascending:false}).limit(3);if(data)setTopProducts(data);}

  async function loadXpEvents(id){const {data}=await supabase.from('xp_events').select('*').eq('profile_id',id).order('created_at');if(data)setXpEvents(data);await loadTopProduct(id);}
  async function loadRewards(){const {data}=await supabase.from('rewards').select('*').order('level');if(data)setRewards(data);}
  async function loadLeaderboard(){const {data}=await supabase.from('profiles').select('*').order('xp',{ascending:false}).limit(50);if(data)setLeaderboard(data);}
  async function loadWeeklyLeaderboard(){
    const now=new Date();const day=now.getDay();const diff=day===0?6:day-1;
    const monday=new Date(now);monday.setDate(now.getDate()-diff);monday.setHours(0,0,0,0);
    const {data:events}=await supabase.from('xp_events').select('profile_id,amount,gmv,commission').gte('created_at',monday.toISOString());
    if(!events)return;
    const byProfile={};
    events.forEach(e=>{if(!byProfile[e.profile_id])byProfile[e.profile_id]={xp:0,gmv:0,commission:0};byProfile[e.profile_id].xp+=(e.amount||0);byProfile[e.profile_id].gmv+=(e.gmv||0);byProfile[e.profile_id].commission+=(e.commission||0);});
    const {data:profiles}=await supabase.from('profiles').select('id,username,avatar_url,tiktok_handles');
    if(!profiles)return;
    const weekly=Object.entries(byProfile).map(([pid,vals])=>{const p=profiles.find(x=>x.id===pid);if(!p)return null;return{...p,xp:vals.xp,total_gmv:vals.gmv,total_commission:vals.commission};}).filter(Boolean).sort((a,b)=>b.xp-a.xp).slice(0,50);
    setWeeklyLeaderboard(weekly);
  }
  async function loadAllProfiles(){const {data}=await supabase.from('profiles').select('*').order('xp',{ascending:false});if(data){setAllProfiles(data);const a={};data.forEach(p=>{a[p.id]=100;});setXpAmounts(a);}}
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
  async function loadAdminPayouts(){
    const {data}=await supabase.from('payouts').select('*').order('month',{ascending:false});
    if(data)setAdminPayouts(data);
  }
  async function togglePayout(payoutId,paid){
    await supabase.from('payouts').update({paid,paid_at:paid?new Date().toISOString():null}).eq('id',payoutId);
    toast(paid?'Marked as paid ✓':'Marked as unpaid','ok');
    loadAdminPayouts();if(profile)loadPayouts();
  }
  async function generatePayouts(){
    // Generate payout records for each affiliate for each month they have referral earnings
    const {data:allP}=await supabase.from('profiles').select('id,username,referred_by');
    const {data:allEvts}=await supabase.from('xp_events').select('profile_id,gmv,cancelled_gmv,created_at,reason').eq('reason','import');
    if(!allP||!allEvts)return;
    // For each profile that has a referrer, group their GMV by month
    const referrers={};
    allP.forEach(p=>{if(p.referred_by)referrers[p.id]=p.referred_by;});
    const byReferrerMonth={};
    allEvts.forEach(e=>{
      const refId=referrers[e.profile_id];if(!refId)return;
      const month=(e.created_at||'').slice(0,7);if(!month)return;
      const key=`${refId}-${month}`;
      if(!byReferrerMonth[key])byReferrerMonth[key]={profile_id:refId,month,gmv:0,cancelled_gmv:0};
      byReferrerMonth[key].gmv+=(e.gmv||0);
      byReferrerMonth[key].cancelled_gmv+=(e.cancelled_gmv||0);
    });
    let created=0;
    for(const rec of Object.values(byReferrerMonth)){
      const netGMV=Math.max(0,rec.gmv-rec.cancelled_gmv);
      const amount=parseFloat((netGMV*0.01).toFixed(2));
      if(amount<=0)continue;
      const {data:existing}=await supabase.from('payouts').select('id').eq('profile_id',rec.profile_id).eq('month',rec.month).maybeSingle();
      if(!existing){
        await supabase.from('payouts').insert({profile_id:rec.profile_id,month:rec.month,amount,paid:false});
        created++;
      }
    }
    toast(`Generated ${created} new payout records`,'ok');
    loadAdminPayouts();
  }
  async function loadLastUpdated(){
    try{const {data}=await supabase.from('app_meta').select('*').eq('key','last_import').maybeSingle();if(data)setLastUpdated({time:data.updated_at,user:data.value});}catch(e){}
  }
  async function saveLastUpdated(){
    const now=new Date().toISOString();
    try{await supabase.from('app_meta').upsert({key:'last_import',value:profile?.username||'admin',updated_at:now},{onConflict:'key'});setLastUpdated({time:now,user:profile?.username||'admin'});}catch(e){}
  }
  async function loadProductMappings(){const {data}=await supabase.from('product_mappings').select('*');if(data){const m={};data.forEach(r=>{m[r.import_name.toLowerCase()]=r.product_name;});setProductMappings(m);}}
  async function loadXpExclusions(){const {data}=await supabase.from('xp_exclusions').select('*');if(data)setXpExclusions(data);}
  async function loadImportHistory(){const {data,error}=await supabase.from('xp_events').select('profile_id,created_at,gmv,commission,amount,note,reason').order('created_at',{ascending:false}).limit(500);if(error){console.error('importHistory error:',error);return;}if(data){const imports=data.filter(e=>e.reason==='import');const byDate={};imports.forEach(e=>{const d=(e.created_at||'').slice(0,10);if(!d)return;if(!byDate[d])byDate[d]={date:d,totalGmv:0,totalComm:0,profiles:new Set()};byDate[d].totalGmv+=(e.gmv||0);byDate[d].totalComm+=(e.commission||0);byDate[d].profiles.add(e.profile_id);});const hist=Object.values(byDate).sort((a,b)=>b.date.localeCompare(a.date)).map(x=>({...x,profileCount:x.profiles.size}));setImportHistory(hist);}}
  async function deleteImportByDate(date){
    const {data:evts}=await supabase.from('xp_events').select('id,profile_id,amount,gmv,commission,cancelled,cancelled_gmv,orders,sales,live_streams').eq('reason','import').gte('created_at',date+'T00:00:00').lte('created_at',date+'T23:59:59');
    if(!evts||!evts.length)return;
    const byProfile={};
    evts.forEach(e=>{
      if(!byProfile[e.profile_id])byProfile[e.profile_id]={xp:0,gmv:0,comm:0,cancelled:0,cancelled_gmv:0,orders:0,sales:0,live_streams:0};
      byProfile[e.profile_id].xp+=(e.amount||0);
      byProfile[e.profile_id].gmv+=(e.gmv||0);
      byProfile[e.profile_id].comm+=(e.commission||0);
      byProfile[e.profile_id].cancelled+=(e.cancelled||0);
      byProfile[e.profile_id].cancelled_gmv+=(e.cancelled_gmv||0);
      byProfile[e.profile_id].orders+=(e.orders||0);
      byProfile[e.profile_id].sales+=(e.sales||0);
      byProfile[e.profile_id].live_streams+=(e.live_streams||0);
    });
    // Subtract values from each profile
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
          total_live_streams:newLS,total_aov:newAOV
        }).eq('id',pid);
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
    toast(`Deleted import for ${date}`,'ok');loadImportHistory();loadAllProfiles();if(profile)loadProfile(profile.id);
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
    const {error}=await supabase.auth.signInWithPassword({email,password:loginPass});
    if(error){setAuthErr('Wrong email or password.');setAuthLoading(false);return;}
    setAuthLoading(false);
  }
  async function doLogout(){await supabase.auth.signOut();setAdminUnlocked(false);localStorage.removeItem('ll-admin');setPage('home');}

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
  function checkAdminPass(){if(adminPass===ADMIN_PASSWORD){setAdminUnlocked(true);localStorage.setItem('ll-admin','true');setShowAdminGate(false);loadAllProfiles();loadImportHistory();navTo('admin');toast('Admin access granted','ok');}else{setAdminErr('Incorrect password.');}}
  function navTo(pg){setPage(pg);const el=document.querySelector('.pages');if(el)el.scrollTop=0;if(pg==='admin'&&adminUnlocked){loadAllProfiles();loadImportHistory();loadAdminPayouts();loadXpExclusions();}if(pg==='home'||pg==='lb'){loadLeaderboard();loadWeeklyLeaderboard();}if(pg==='referrals')loadReferralStats();}

  async function admAwardXP(profileId,subtract=false){
    const amount=xpAmounts[profileId]||100;const p=allProfiles.find(x=>x.id===profileId);if(!p)return;
    const prevLv=getLv(p.xp,LEVELS).level;const newXP=subtract?Math.max(0,p.xp-amount):p.xp+amount;
    await supabase.from('profiles').update({xp:newXP}).eq('id',profileId);
    await supabase.from('xp_events').insert({profile_id:profileId,amount:subtract?-amount:amount,reason:'manual'});
    toast(subtract?`✅ -${amount} XP → ${p.username}`:`✅ +${amount} XP → ${p.username}`,'ok');
    const newLv=getLv(newXP).level;if(!subtract&&newLv>prevLv)setTimeout(()=>toast(`🎉 ${p.username} hit Level ${newLv}!`,'ok'),400);
    if(profile?.id===profileId)setProfile({...profile,xp:newXP});loadAllProfiles();
  }
  async function saveReward(r){
    const {error,count}=await supabase.from('rewards').update({name:r.name,description:r.description,xp_required:Number(r.xp_required),image_url:r.image_url}).eq('level',r.level);
    if(!error){
      // Verify it actually saved
      const {data:check}=await supabase.from('rewards').select('xp_required').eq('level',r.level).single();
      if(check&&check.xp_required===Number(r.xp_required)){toast(`Reward ${r.level} saved ✓`,'ok');}
      else{toast(`Save appeared to work but didn't persist — check RLS policies on rewards table`,'wn');}
      loadRewards();
    }else toast('Save failed: '+error.message,'wn');
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
      if(sales===0&&rawG===0){skipped++;continue;}
      const netGMVForXP=Math.max(0,rawG-rawCanG);
      // Resolve product name FIRST
      const rawProdName=(pCol&&row[pCol]?row[pCol].toString().trim():null)||productFromFile;
      const prodName=rawProdName?(productMappings[rawProdName.toLowerCase()]||rawProdName):null;
      if(rawProdName&&!productMappings[rawProdName.toLowerCase()])setUnmappedProducts(prev=>[...new Set([...prev,rawProdName])]);
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
        await supabase.from('profiles').update(profileUpdateNoXP).eq('id',p.id);
        await supabase.from('profiles').update({total_aov:rawAOV||(rawO>0?parseFloat((rawG/rawO).toFixed(2)):0),total_cancelled:(p.total_cancelled||0)+rawCan,total_cancelled_gmv:(p.total_cancelled_gmv||0)+rawCanG}).eq('id',p.id);
        const xpInsertNoXP={profile_id:p.id,amount:0,reason:'import',note:`${fmtGBP(netGMVForXP)} net GMV — XP excluded (${prodName})`,gmv:rawG,commission:rawC,aov:rawAOV||(rawO>0?parseFloat((rawG/rawO).toFixed(2)):0),orders:rawO||sales,sales,live_streams:rawLS,cancelled:rawCan,cancelled_gmv:rawCanG,product_name:prodName,created_at:new Date(importDate+'T12:00:00').toISOString()};
        await supabase.from('xp_events').insert(xpInsertNoXP);
        if(prodName){const {data:existing}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',p.id).eq('product_name',prodName).maybeSingle();if(existing){await supabase.from('affiliate_product_stats').update({gmv:(existing.gmv||0)+rawG,commission:(existing.commission||0)+rawC,sales:(existing.sales||0)+sales}).eq('id',existing.id);}else{await supabase.from('affiliate_product_stats').insert({profile_id:p.id,product_name:prodName,gmv:rawG,commission:rawC,sales});}}
        logs.push(`⊘ ${p.username}: ${prodName} — XP excluded | GMV: ${fmtGBP(rawG)}`);
        matched++;continue;
      }
      const prevLv=getLv(p.xp,LEVELS).level;const xpGain=Math.floor(netGMVForXP/10)*XP_PER_10_GMV;const newXP=p.xp+xpGain;const newLv=getLv(newXP).level;
      const newOrders=(p.total_orders||0)+(rawO||sales);const newGMV=(p.total_gmv||0)+rawG;const aov=rawAOV||( rawO>0?parseFloat((rawG/rawO).toFixed(2)):0);const newAOV=rawAOV||( newOrders>0?parseFloat((newGMV/newOrders).toFixed(2)):0);
      // Streak calculation (must be before profileUpdate)
      const lastClaim=p.last_claim;
      const prevDate=lastClaim?new Date(lastClaim):null;
      const importDateObj=new Date(importDate);
      const diffDays=prevDate?Math.round((importDateObj-prevDate)/(1000*60*60*24)):null;
      let newStreak=p.streak||0;
      let streakXP=0;
      if(diffDays===null||diffDays<0){newStreak=1;}
      else if(diffDays===1){newStreak=(p.streak||0)+1;}
      else if(diffDays===0){newStreak=p.streak||1;}
      else{newStreak=1;}
      const hitMilestone=milestones.find(m=>m.days===newStreak);
      if(hitMilestone&&diffDays!==0){streakXP=hitMilestone.xp_bonus;}
      const finalXP=newXP+streakXP;
      const profileUpdate={xp:finalXP,total_sales:(p.total_sales||0)+sales,total_gmv:newGMV,total_orders:newOrders,total_commission:(p.total_commission||0)+rawC,streak:newStreak,last_claim:importDate,total_live_streams:(p.total_live_streams||0)+rawLS};
      const {error:puErr}=await supabase.from('profiles').update(profileUpdate).eq('id',p.id);
      if(!puErr){await supabase.from('profiles').update({total_aov:newAOV,total_cancelled:(p.total_cancelled||0)+rawCan,total_cancelled_gmv:(p.total_cancelled_gmv||0)+rawCanG}).eq('id',p.id).then(()=>{});}
      const xpGainTotal=xpGain+streakXP;
      const streakNote=streakXP>0?` | Day ${newStreak} streak +${streakXP} XP`:(diffDays!==0&&diffDays!==null&&diffDays>1?` | Streak reset (${diffDays}d gap)`:` | Day ${newStreak} streak`);
      const xpInsert={profile_id:p.id,amount:xpGainTotal,reason:'import',note:`${fmtGBP(netGMVForXP)} net GMV → +${xpGain} XP${streakNote}`,gmv:rawG,commission:rawC,aov,orders:rawO||sales,sales,live_streams:rawLS,cancelled:rawCan,cancelled_gmv:rawCanG,product_name:prodName||null,created_at:new Date(importDate+'T12:00:00').toISOString()};
      await supabase.from('xp_events').insert(xpInsert);
      if(prodName){const {data:existing}=await supabase.from('affiliate_product_stats').select('*').eq('profile_id',p.id).eq('product_name',prodName).maybeSingle();if(existing){await supabase.from('affiliate_product_stats').update({gmv:(existing.gmv||0)+rawG,commission:(existing.commission||0)+rawC,sales:(existing.sales||0)+sales}).eq('id',existing.id);}else{await supabase.from('affiliate_product_stats').insert({profile_id:p.id,product_name:prodName,gmv:rawG,commission:rawC,sales});}}
      // Credit referrer 1% of GMV minus cancellations
      const netGMV=Math.max(0,rawG-rawCanG);
      if(p.referred_by&&netGMV>0){
        const refBonus=parseFloat((netGMV*0.01).toFixed(2));
        const refP=(profiles||[]).find(x=>x.id===p.referred_by);
        if(refP)await supabase.from('profiles').update({referral_earnings:(refP.referral_earnings||0)+refBonus}).eq('id',p.referred_by);
      }
      logs.push(`✓ ${p.username}: ${fmtGBP(netGMVForXP)} net GMV → +${xpGain} XP${rawG>0?` | GMV: ${fmtGBP(rawG)}`:''}${rawCanG>0?` | Returns: -${fmtGBP(rawCanG)}`:''}${newLv>prevLv?` 🎉 Level ${newLv}!`:''}`);
      matched++;
    }
    logs.push('─────────────',`Done: ${matched} updated · ${unmatched} unmatched · ${skipped} skipped`);
    setImportLog(logs);toast(`Import done: ${matched} updated`,'ok');
    loadAllProfiles();loadImportHistory();saveLastUpdated();if(profile)loadProfile(profile.id);
  }

  function exportCSV(){
    const rows=[['Username','TikTok Handles','XP','Level','Sales','GMV','Orders','Commission','Streak','Referral Code','Referral Earnings']];
    allProfiles.forEach(p=>{const lv=getLv(p.xp,LEVELS);rows.push([p.username,(p.tiktok_handles||[]).join('; '),p.xp,lv.level,p.total_sales||0,p.total_gmv||0,p.total_orders||0,p.total_commission||0,p.streak||0,p.referral_code||'',p.referral_earnings||0]);});
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`loophole-${tdy()}.csv`;a.click();
    toast('📊 Downloaded','ok');
  }

  const filteredEvents=React.useMemo(()=>{
    if(!xpEvents||dateRange==='all')return xpEvents||[];
    const now=new Date();
    let start,end=new Date();
    end.setHours(23,59,59,999);
    if(dateRange==='7d'){start=new Date();start.setDate(start.getDate()-6);start.setHours(0,0,0,0);}
    else if(dateRange==='30d'){start=new Date();start.setDate(start.getDate()-29);start.setHours(0,0,0,0);}
    else if(dateRange==='month'){const[my,mm]=selectedMonth.split('-').map(Number);start=new Date(my,mm-1,1);end=new Date(my,mm,0,23,59,59,999);}
    else if(dateRange==='custom'&&customStart&&customEnd){start=new Date(customStart);start.setHours(0,0,0,0);end=new Date(customEnd);end.setHours(23,59,59,999);}
    else return xpEvents||[];
    return(xpEvents||[]).filter(e=>{const d=new Date(e.created_at);return d>=start&&d<=end;});
  },[xpEvents,dateRange,customStart,customEnd,selectedMonth]);

  const importEvts=filteredEvents.filter(e=>e.reason==='import');
  const filteredGMVGross=importEvts.reduce((s,e)=>s+(e.gmv||0),0);
  const filteredCommGross=importEvts.reduce((s,e)=>s+(e.commission||0),0);
  const filteredOrders=importEvts.reduce((s,e)=>s+(e.orders||0),0);
  const filteredUnits=importEvts.reduce((s,e)=>s+(e.sales||0),0);
  const filteredLiveStreams=importEvts.reduce((s,e)=>s+(e.live_streams||0),0);
  const filteredCancelled=importEvts.reduce((s,e)=>s+(e.cancelled||0),0);
  const filteredCancelledGMV=importEvts.reduce((s,e)=>s+(e.cancelled_gmv||0),0);
  const filteredGMV=Math.max(0,filteredGMVGross-filteredCancelledGMV);
  const filteredComm=filteredGMVGross>0?Math.max(0,filteredCommGross-(filteredCommGross*(filteredCancelledGMV/filteredGMVGross))):0;
  const filteredAOV=(filteredOrders-filteredCancelled)>0?filteredGMV/(filteredOrders-filteredCancelled):0;
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
body,html{margin:0;padding:0;background:#070710;}
#root{background:#070710;}
.spin-el{width:28px;height:28px;border-radius:50%;border:3px solid #22223d;border-top-color:#8b5cf6;animation:sp .8s linear infinite;}
@keyframes sp{to{transform:rotate(360deg)}}
`}</style><div style={{background:"#070710",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}><img src="/logo.png" alt="Loophole" style={{width:180,opacity:.9}}/><div className="spin-el"/></div></>);

  if(!profile)return(<><style>{CSS}</style><div className="authwrap"><img src="/logo.png" alt="Loophole Levels" style={{width:230,marginBottom:5}}/><div className="asub">Affiliate Rewards Platform</div><div className="abox"><div className="tabs"><button className={`tab${authTab==='login'?' on':''}`} onClick={()=>{setAuthTab('login');setAuthErr('');}}>Sign In</button><button className={`tab${authTab==='signup'?' on':''}`} onClick={()=>{setAuthTab('signup');setAuthErr('');}}>Join Up</button></div>{authTab==='login'?(<div className="fg"><div><label className="lbl">Email</label><input className="inp" value={loginUser} onChange={e=>setLoginUser(e.target.value)} placeholder="your@email.com" type="email"/></div><div><label className="lbl">Password</label><input className="inp" type="password" value={loginPass} onChange={e=>setLoginPass(e.target.value)} placeholder="••••••••" onKeyDown={e=>e.key==='Enter'&&doLogin()}/></div><button className="btn btnpu" onClick={doLogin} disabled={authLoading}>{authLoading?'...':'SIGN IN'}</button><div className="ferr">{authErr}</div></div>):(<div className="fg"><div><label className="lbl">Username</label><input className="inp" value={signupUser} onChange={e=>setSignupUser(e.target.value)} placeholder="pick a username"/></div><div><label className="lbl">Email</label><input className="inp" type="email" value={signupEmail} onChange={e=>setSignupEmail(e.target.value)} placeholder="your@email.com"/></div><div><label className="lbl">Password</label><input className="inp" type="password" value={signupPass} onChange={e=>setSignupPass(e.target.value)} placeholder="create a password"/></div><div><label className="lbl">TikTok @handle(s)</label><div style={{display:'flex',flexDirection:'column',gap:5}}>{handles.map((h,i)=>(<div key={i} className="trow"><input className="inp" value={h} onChange={e=>{const n=[...handles];n[i]=e.target.value;setHandles(n);}} placeholder="@yourhandle"/>{handles.length>1&&<button className="icobtn" onClick={()=>setHandles(handles.filter((_,j)=>j!==i))}>✕</button>}</div>))}</div><button className="addtt" onClick={()=>setHandles([...handles,''])}>+ Add another @</button></div><div><label className="lbl">Referral code (optional)</label><input className="inp" value={signupRef} onChange={e=>setSignupRef(e.target.value.toUpperCase())} placeholder="e.g. ABC12345"/></div><button className="btn btnpu" onClick={doSignup} disabled={authLoading}>{authLoading?'...':'CREATE ACCOUNT'}</button><div className="ferr">{authErr}</div></div>)}</div><div className="toastwrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div></div></>);

  return(<><style>{CSS}</style><div className="app" style={isDesktop?{flexDirection:'row'}:{}}>
    {/* DESKTOP SIDEBAR */}
    {isDesktop&&(<div style={{width:220,minWidth:220,height:'100dvh',background:'var(--bg2)',borderRight:'1px solid var(--bo2)',display:'flex',flexDirection:'column',flexShrink:0,zIndex:10}}>
      {lastUpdated&&<div style={{background:'rgba(139,92,246,.1)',borderBottom:'1px solid rgba(139,92,246,.2)',padding:'7px 16px',display:'flex',alignItems:'center',gap:6}}>
        <span style={{fontSize:10,color:'var(--pu2)'}}>●</span>
        <div style={{fontSize:10,color:'var(--tx3)',lineHeight:1.4}}>Updated by <strong style={{color:'var(--tx2)'}}>{lastUpdated.user}</strong><br/>{new Date(lastUpdated.time).toLocaleDateString('en-GB',{day:'2-digit',month:'2-digit',year:'2-digit'})} at {new Date(lastUpdated.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</div>
      </div>}
      <div style={{padding:'20px 16px 16px',borderBottom:'1px solid var(--bo)'}}>
        <div style={{fontFamily:'var(--fh)',fontSize:22,letterSpacing:3}}>LOOPHOLE</div>
        <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:2,textTransform:'uppercase',marginTop:2}}>Affiliate Levels</div>
      </div>
      <div style={{flex:1,padding:'8px',overflowY:'auto'}}>
        {[['home','🏠','Home'],['rewards','🎁','Rewards'],['lb','🏆','Rankings'],['products','📦','Products'],['referrals','👥','Refer'],['profile','👤','Profile']].map(([pg,icon,label])=>(
          <button key={pg} onClick={()=>navTo(pg)} style={{width:'100%',display:'flex',alignItems:'center',gap:11,padding:'10px 14px',background:page===pg?'rgba(139,92,246,.15)':'transparent',border:'none',color:page===pg?'var(--pu2)':'var(--tx2)',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'var(--fb)',textAlign:'left',borderRadius:'var(--rsm)'}}>
            <span style={{fontSize:17}}>{icon}</span>{label}
          </button>
        ))}
        {adminUnlocked&&<button onClick={()=>navTo('admin')} style={{width:'100%',display:'flex',alignItems:'center',gap:11,padding:'10px 14px',background:page==='admin'?'rgba(139,92,246,.15)':'transparent',border:'none',color:page==='admin'?'var(--pu2)':'var(--tx2)',cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'var(--fb)',textAlign:'left',borderRadius:'var(--rsm)'}}>
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
      <img src="/logo.png" alt="Loophole Levels" style={{height:24}}/>
      <div className="tr">
        <div className="streak-pill" onClick={()=>setShowDaily(true)}>🔥 {profile.streak||0}</div>
        <div className="xpchip" onClick={()=>navTo("level")} style={{cursor:"pointer"}}>{(profile.xp||0).toLocaleString()} XP · Lv{lv.level}</div>
        <div className="av" style={{background:profile.avatar_url?'transparent':avc(profile.username),color:'#fff'}} onClick={()=>navTo('profile')}>
          {profile.avatar_url?<img src={profile.avatar_url} alt=""/>:ini(profile.username)}
        </div>
      </div>
    </div>}

    <div className="pages" style={isDesktop?{flex:1,overflowY:'auto',paddingBottom:0,minWidth:0}:{}}>
      {/* HOME */}
      {page==='home'&&(<div className="pg">
        {/* DATE RANGE FILTER */}
        <div style={{display:'flex',gap:5,marginBottom:13,flexWrap:'wrap',alignItems:'center'}}>
          {[['all','All'],['7d','7D'],['30d','30D'],['month','Month']].map(([val,label])=>(
            <button key={val} onClick={()=>setDateRange(val)} style={{padding:'6px 14px',borderRadius:99,border:`1px solid ${dateRange===val?'var(--pu)':'rgba(255,255,255,.06)'}`,background:dateRange===val?'rgba(139,92,246,.18)':'rgba(255,255,255,.03)',color:dateRange===val?'var(--pu2)':'var(--tx3)',fontSize:12,fontWeight:600,cursor:'pointer',transition:'all .2s'}}>{label}</button>
          ))}
          {dateRange==='month'&&<input type='month' value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{padding:'6px 10px',background:'rgba(139,92,246,.18)',border:'1px solid var(--pu)',borderRadius:99,color:'var(--pu2)',fontSize:12,fontWeight:600,outline:'none',cursor:'pointer',maxWidth:120}}/>}
          <button onClick={()=>setDateRange('custom')} style={{padding:'6px 14px',borderRadius:99,border:`1px solid ${dateRange==='custom'?'var(--pu)':'rgba(255,255,255,.06)'}`,background:dateRange==='custom'?'rgba(139,92,246,.18)':'rgba(255,255,255,.03)',color:dateRange==='custom'?'var(--pu2)':'var(--tx3)',fontSize:12,fontWeight:600,cursor:'pointer'}}>Custom</button>
          {dateRange==='custom'&&(<>
            <input type="date" value={customStart} onChange={e=>setCustomStart(e.target.value)} style={{padding:'5px 8px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
            <span style={{fontSize:11,color:'var(--tx3)'}}>→</span>
            <input type="date" value={customEnd} onChange={e=>setCustomEnd(e.target.value)} style={{padding:'5px 8px',background:'rgba(255,255,255,.03)',border:'1px solid rgba(255,255,255,.08)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
          </>)}
        </div>

        {/* HERO GMV CARD */}
        <div style={{borderRadius:16,overflow:'hidden',marginBottom:10}}>
          <div style={{height:3,background:'linear-gradient(90deg,#10b981,#06b6d4,#8b5cf6)'}}/>
          <div style={{background:'var(--card)',padding:'20px 18px 18px'}}>
            <div style={{fontSize:10,color:'var(--tx3)',letterSpacing:2,textTransform:'uppercase',marginBottom:6,fontWeight:500}}>Net GMV</div>
            <div style={{fontFamily:'var(--fh)',fontSize:48,letterSpacing:1,color:'#fff',lineHeight:1,marginBottom:20}}>{fmtGBP(isFiltered?filteredGMV:Math.max(0,(profile.total_gmv||0)-(profile.total_cancelled_gmv||0)))}</div>
            <div style={{display:'flex',gap:0}}>
              {[
                {label:'Commission',val:fmtGBP(isFiltered?filteredComm:Math.max(0,(profile.total_commission||0)-((profile.total_gmv||0)>0?(profile.total_commission||0)*((profile.total_cancelled_gmv||0)/(profile.total_gmv||1)):0))),color:'#f59e0b',bg:'rgba(245,158,11,.08)'},
                {label:'Orders',val:(isFiltered?filteredOrders:(profile.total_orders||0)).toLocaleString(),color:'#06b6d4',bg:'rgba(6,182,212,.08)'},
                {label:'Units Sold',val:(isFiltered?filteredUnits:(profile.total_sales||0)).toLocaleString(),color:'#8b5cf6',bg:'rgba(139,92,246,.08)'},
              ].map((s,i)=>(
                <div key={i} style={{flex:1,background:s.bg,borderRadius:10,padding:'10px 8px',textAlign:'center',marginRight:i<2?6:0}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:19,letterSpacing:.5,color:s.color,lineHeight:1}}>{s.val}</div>
                  <div style={{fontSize:9,color:'var(--tx3)',marginTop:4,textTransform:'uppercase',letterSpacing:.8,fontWeight:500}}>{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* QUICK STATS STRIP */}
        <div style={{display:'flex',gap:6,marginBottom:10}}>
          <div onClick={()=>setShowDaily(true)} style={{flex:1,background:'rgba(245,158,11,.08)',borderRadius:10,padding:'9px 11px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <span style={{fontSize:16}}>🔥</span>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:17,color:'var(--go)',lineHeight:1}}>{profile.streak||0}</div>
              <div style={{fontSize:8,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:500,marginTop:2}}>Day Streak</div>
            </div>
          </div>
          <div onClick={()=>navTo('level')} style={{flex:1,background:'rgba(139,92,246,.08)',borderRadius:10,padding:'9px 11px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <span style={{fontSize:16}}>⚡</span>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:17,color:'var(--pu2)',lineHeight:1}}>{(profile.xp||0).toLocaleString()}</div>
              <div style={{fontSize:8,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:500,marginTop:2}}>XP · Level {lv.level}</div>
            </div>
          </div>
          <div onClick={()=>navTo('lb')} style={{flex:1,background:'rgba(6,182,212,.08)',borderRadius:10,padding:'9px 11px',display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}>
            <span style={{fontSize:16}}>🏆</span>
            <div>
              <div style={{fontFamily:'var(--fh)',fontSize:17,color:'#06b6d4',lineHeight:1}}>#{leaderboard.findIndex(u=>u.id===profile?.id)+1||'—'}</div>
              <div style={{fontSize:8,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:500,marginTop:2}}>Rank</div>
            </div>
          </div>
        </div>

        {/* METRICS GRID */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:10}}>
          {[
            {label:'Avg Comm / Live',val:(isFiltered?filteredLiveStreams:(profile.total_live_streams||0))>0?fmtGBP((isFiltered?filteredComm:Math.max(0,(profile.total_commission||0)-((profile.total_gmv||0)>0?(profile.total_commission||0)*((profile.total_cancelled_gmv||0)/(profile.total_gmv||1)):0)))/(isFiltered?filteredLiveStreams:(profile.total_live_streams||1))):'£0.00',icon:'📡',accent:'#10b981'},
            {label:'Avg Order Value',val:isFiltered?(filteredAOV>0?fmtGBP(filteredAOV):'£0.00'):((profile.total_orders||0)-(profile.total_cancelled||0)>0?fmtGBP(Math.max(0,(profile.total_gmv||0)-(profile.total_cancelled_gmv||0))/((profile.total_orders||0)-(profile.total_cancelled||0))):'£0.00'),icon:'🛒',accent:'#10b981'},
            {label:'Returns',val:`${isFiltered?filteredCancelled:(profile.total_cancelled||0)} units`,icon:'↩️',accent:'#f43f5e'},
            {label:'Returns GMV',val:fmtGBP(isFiltered?filteredCancelledGMV:(profile.total_cancelled_gmv||0)),icon:'💸',accent:'#f43f5e'},
          ].map((s,i)=>(
            <div key={i} style={{background:'var(--card)',borderRadius:12,overflow:'hidden',display:'flex'}}>
              <div style={{width:3,background:s.accent,flexShrink:0}}/>
              <div style={{padding:'13px 12px',flex:1}}>
                <div style={{fontSize:15,marginBottom:5}}>{s.icon}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:18,letterSpacing:.5,lineHeight:1}}>{s.val}</div>
                <div style={{fontSize:9,color:'var(--tx3)',marginTop:5,textTransform:'uppercase',letterSpacing:.8,fontWeight:500}}>{s.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* GMV CHART */}
        <MiniChart xpEvents={filteredEvents} />

        {/* TOP PRODUCTS */}
        <div style={{borderRadius:14,overflow:'hidden',marginBottom:10}}>
          <div style={{height:3,background:'linear-gradient(90deg,#f59e0b,#f97316)'}}/>
          <div style={{background:'var(--card)',padding:'14px 16px'}}>
            <div style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1.5,marginBottom:10,fontWeight:500}}>🏆 Top Products</div>
            {(isFiltered?filteredProducts:topProducts).length===0?(<div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>navTo('products')}>
              <div style={{width:44,height:44,borderRadius:10,background:'var(--card2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0,opacity:.4}}>📦</div>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600,color:'var(--tx2)',marginBottom:3}}>No data yet</div>
                <div style={{fontSize:11,color:'var(--tx3)'}}>Your top products will appear here after your first import</div>
              </div>
            </div>):(topProducts.map((tp,i)=>{const prod=products.find(p=>p.name===tp.product_name);return(<div key={i} style={{display:'flex',alignItems:'center',gap:10,paddingBottom:i<topProducts.length-1?10:0,marginBottom:i<topProducts.length-1?10:0,borderBottom:i<topProducts.length-1?'1px solid rgba(255,255,255,.04)':'none'}}>
              <div style={{width:28,fontFamily:'var(--fh)',fontSize:15,color:i===0?'#f59e0b':i===1?'#94a3b8':'#cd7f32',flexShrink:0,textAlign:'center'}}>{i+1}</div>
              {prod?.image_url?<img src={prod.image_url} alt="" style={{width:42,height:42,borderRadius:9,objectFit:'cover',flexShrink:0,border:'1px solid rgba(255,255,255,.06)'}}/>:<div style={{width:42,height:42,borderRadius:9,background:'var(--card2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>📦</div>}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,marginBottom:4,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{tp.product_name||'Unknown Product'}</div>
                <div style={{display:'flex',gap:12}}>
                  <div><div style={{fontFamily:'var(--fh)',fontSize:14,color:'#f59e0b'}}>{fmtGBP(tp.commission||0)}</div><div style={{fontSize:8,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:500}}>Comm</div></div>
                  <div><div style={{fontFamily:'var(--fh)',fontSize:14,color:'#10b981'}}>{fmtGBP(tp.gmv||0)}</div><div style={{fontSize:8,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,fontWeight:500}}>GMV</div></div>
                </div>
              </div>
            </div>);}))}
          </div>
        </div>

        {/* REFERRAL EARNINGS - only if they have some */}
        {(profile.referral_earnings>0)&&(
          <div onClick={()=>navTo('referrals')} style={{background:'rgba(139,92,246,.07)',border:'1px solid rgba(139,92,246,.18)',borderRadius:'var(--rsm)',padding:'12px 14px',marginBottom:11,display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer'}}>
            <div>
              <div style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:'.7px',marginBottom:3}}>Referral Earnings</div>
              <div style={{fontFamily:'var(--fh)',fontSize:22,color:'var(--pu2)'}}>{fmtGBP(profile.referral_earnings)}</div>
            </div>
            <span style={{fontSize:18,opacity:.6}}>👥 ›</span>
          </div>
        )}

        {/* NEXT REWARD PROGRESS */}
        {(()=>{
          const nextRw = rewards.find(r=>!profile||profile.xp<r.xp_required);
          const prevRw = nextRw ? rewards[rewards.indexOf(nextRw)-1] : rewards[rewards.length-1];
          const startXP = prevRw ? prevRw.xp_required : 0;
          const endXP = nextRw ? nextRw.xp_required : lv.max;
          const prog = nextRw ? Math.min(100,Math.round(((profile.xp-startXP)/(endXP-startXP))*100)) : 100;
          const r = nextRw || rewards[rewards.length-1];
          return (
            <div onClick={()=>navTo('rewards')} style={{background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:'var(--r)',padding:'14px 16px',marginBottom:11,cursor:'pointer'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
                <div style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1}}>Next Reward</div>
                <div style={{fontSize:11,color:'var(--pu2)',fontWeight:600}}>{nextRw?`${(endXP-profile.xp).toLocaleString()} XP away`:'All Unlocked 🏆'}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                <div style={{width:52,height:52,borderRadius:10,background:'var(--card2)',overflow:'hidden',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',border:'1px solid var(--bo2)'}}>
                  {r?.image_url ? <img src={r.image_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/> : <span style={{fontSize:24,opacity:.4}}>🎁</span>}
                </div>
                <div style={{flex:1}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:16,letterSpacing:1,marginBottom:6}}>{r?.name&&r.name!==`Reward ${r?.level}`?r.name:`Level ${r?.level} Reward`}</div>
                  <div style={{height:8,background:'var(--card3)',borderRadius:99,overflow:'hidden'}}>
                    <div style={{height:'100%',borderRadius:99,background:'linear-gradient(90deg,var(--pu),var(--cy))',width:`${prog}%`,transition:'width 1s ease'}}/>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontSize:10,color:'var(--tx3)'}}>
                    <span>{startXP.toLocaleString()} XP</span><span>{endXP.toLocaleString()} XP</span>
                  </div>
                </div>
              </div>
              <div style={{fontSize:11,color:'var(--tx3)',textAlign:'right',marginTop:6}}>Tap to see all rewards →</div>
            </div>
          );
        })()}


      </div>)}

      {/* LEVEL REWARDS (Battle Pass) */}
      {page==='rewards'&&(<div style={{paddingBottom:14}}>
        <div style={{padding:'13px 13px 9px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{fontFamily:'var(--fh)',fontSize:21,letterSpacing:3}}>LEVEL REWARDS</div>
          <div style={{fontFamily:'var(--fh)',fontSize:13,color:'var(--pu2)',letterSpacing:1}}>Level {lv.level}</div>
        </div>
        <div style={{padding:'0 13px 11px'}}>
          <div style={{background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:'var(--r)',padding:11}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx2)',marginBottom:6}}><span style={{fontWeight:600,color:'var(--pu2)'}}>Level {lv.level}</span><span>{(profile.xp||0).toLocaleString()} / {nx?nx.min.toLocaleString():'MAX'} XP</span></div>
            <div className="xpbar"><div className="xpfill" style={{width:`${pct}%`}}/></div>
            {nx&&<div style={{fontSize:10,color:'var(--tx3)',marginTop:3,textAlign:'right'}}>{(nx.min-profile.xp).toLocaleString()} XP to Level {nx.level}</div>}
          </div>
        </div>
        <div style={{paddingTop:4}}>
          {rewards.map((r,i)=>{
            const un=profile.xp>=r.xp_required;
            const isCur=!un&&(i===0||profile.xp>=rewards[i-1]?.xp_required);
            const prog=Math.min(100,Math.round((profile.xp/r.xp_required)*100));
            const need=Math.max(0,r.xp_required-profile.xp);
            return(
              <div key={r.id} className={`bp-vcard${un?' un':isCur?' cur':' lk'}`} onClick={()=>setShowReward(r)}>
                <div className={`bp-vbadge${un?' un':isCur?' cur':' lk'}`}>{un?'✓ DONE':isCur?'IN PROGRESS':'🔒'}</div>
                <div className="bp-vimg">
                  {r.image_url?<img src={r.image_url} alt={r.name}/>:<span style={{fontSize:26,opacity:.35}}>🎁</span>}
                </div>
                <div className="bp-vbody">
                  <div className="bp-vlv">Level {r.level}</div>
                  <div className="bp-vnm">{r.name&&r.name!==`Level ${r.level} Reward`?r.name:`Level ${r.level} Reward`}</div>
                  <div className="bp-vxp">{r.xp_required.toLocaleString()} XP required</div>
                  <div className="bp-vbar"><div className="bp-vfill" style={{width:`${prog}%`,background:un?'var(--gr)':undefined}}/></div>
                  {isCur&&<div className="bp-vneed">{need.toLocaleString()} XP to go</div>}
                </div>
              </div>
            );
          })}
        </div>

      </div>)}

      {/* LEADERBOARD */}
      {page==='lb'&&(<div className="pg">
        <div className="sh" style={{marginBottom:10}}>RANKINGS</div>
        {/* Tabs */}
        <div style={{display:'flex',gap:0,marginBottom:14,background:'var(--card)',borderRadius:'var(--rsm)',border:'1px solid var(--bo)',overflow:'hidden'}}>
          {[['alltime','🏆 All Time'],['weekly','⚡ This Week']].map(([key,label])=>(
            <button key={key} onClick={()=>setLbTab(key)} style={{flex:1,padding:'10px 0',background:lbTab===key?'rgba(139,92,246,.18)':'transparent',border:'none',borderRight:key==='alltime'?'1px solid var(--bo)':'none',color:lbTab===key?'var(--pu2)':'var(--tx3)',fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'var(--fb)',letterSpacing:.3}}>{label}</button>
          ))}
        </div>
        {/* Weekly reset note */}
        {lbTab==='weekly'&&<div style={{textAlign:'center',fontSize:11,color:'var(--tx3)',marginBottom:12,padding:'6px 10px',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)'}}>Resets every Monday at midnight</div>}
        {(()=>{
          const lb=lbTab==='weekly'?weeklyLeaderboard:leaderboard;
          const isWeekly=lbTab==='weekly';
          return(<>
            {/* TOP 3 PODIUM */}
            {lb.length>=3&&(()=>{
              const [first,second,third]=lb;
              const PodCard=({u,rank,height})=>{
                const col=avc(u.username);
                const isMe=u.id===profile?.id;
                const medal=rank===1?'🥇':rank===2?'🥈':'🥉';
                const glow=rank===1?'rgba(245,158,11,.3)':rank===2?'rgba(187,187,187,.25)':'rgba(205,127,50,.25)';
                const border=rank===1?'rgba(245,158,11,.5)':rank===2?'rgba(187,187,187,.4)':'rgba(205,127,50,.4)';
                const bg=rank===1?'rgba(245,158,11,.08)':rank===2?'rgba(187,187,187,.06)':'rgba(205,127,50,.06)';
                return(
                  <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end'}}>
                    <div style={{fontSize:11,fontWeight:700,color:isMe?'var(--pu2)':'var(--tx2)',marginBottom:5,textAlign:'center',maxWidth:'100%',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',padding:'0 2px'}}>{u.username}</div>
                    <div style={{position:'relative'}}>
                      <div style={{width:rank===1?52:44,height:rank===1?52:44,borderRadius:'50%',background:u.avatar_url?'transparent':col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:rank===1?17:14,color:'#fff',border:`2px solid ${border}`,boxShadow:`0 0 18px ${glow}`,overflow:'hidden',flexShrink:0}}>
                        {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(u.username)}
                      </div>
                      <div style={{position:'absolute',bottom:-6,left:'50%',transform:'translateX(-50%)',fontSize:16}}>{medal}</div>
                    </div>
                    <div style={{width:'100%',background:bg,border:`1px solid ${border}`,borderRadius:'var(--rsm) var(--rsm) 0 0',padding:'14px 6px 12px',textAlign:'center',marginTop:12,height}}>
                      <div style={{fontFamily:'var(--fh)',fontSize:18,color:'var(--tx)',letterSpacing:.5}}>{(u.xp||0).toLocaleString()}</div>
                      <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,marginBottom:6}}>{isWeekly?'XP this week':'XP'}</div>
                      <div style={{fontFamily:'var(--fh)',fontSize:14,color:'var(--gr)'}}>{fmtGBP(u.total_gmv||0)}</div>
                      <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7}}>{isWeekly?'GMV this week':'GMV'}</div>
                    </div>
                  </div>
                );
              };
              return(
                <div style={{display:'flex',alignItems:'flex-end',gap:6,marginBottom:16,padding:'10px 0 0'}}>
                  <PodCard u={second} rank={2} height={95}/>
                  <PodCard u={first} rank={1} height={125}/>
                  <PodCard u={third} rank={3} height={80}/>
                </div>
              );
            })()}
            {/* If less than 3, show simple list for all */}
            {lb.length>0&&lb.length<3&&(
              <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden',marginBottom:14}}>
                {lb.map((u,i)=>{
                  const isMe=u.id===profile?.id;const col=avc(u.username);const medal=i===0?'🥇':i===1?'🥈':'🥉';
                  return(
                    <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'12px 13px',borderBottom:i<lb.length-1?'1px solid var(--bo)':'none',background:isMe?'rgba(139,92,246,.06)':'transparent'}}>
                      <div style={{fontSize:16,width:24,textAlign:'center'}}>{medal}</div>
                      <div style={{width:36,height:36,borderRadius:'50%',background:u.avatar_url?'transparent':col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:13,color:'#fff',flexShrink:0,overflow:'hidden'}}>{u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(u.username)}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:600}}>{u.username}{isMe&&<span style={{fontSize:9,color:'var(--pu2)',marginLeft:4}}>(you)</span>}</div>
                        <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{(u.tiktok_handles||[]).slice(0,2).join(' · ')}</div>
                      </div>
                      <div style={{textAlign:'right',flexShrink:0}}>
                        <div style={{fontFamily:'var(--fh)',fontSize:15,color:'var(--pu2)',letterSpacing:.5}}>{(u.xp||0).toLocaleString()} XP</div>
                        <div style={{fontSize:10,color:'var(--gr)',marginTop:1}}>{fmtGBP(u.total_gmv||0)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {/* REST OF LEADERBOARD (4th+) */}
            {lb.length>=3&&(<div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden'}}>
              {lb.slice(3).map((u,i)=>{
                const rank=i+4;
                const isMe=u.id===profile?.id;
                const col=avc(u.username);
                return(
                  <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'11px 13px',borderBottom:i<lb.slice(3).length-1?'1px solid var(--bo)':'none',background:isMe?'rgba(139,92,246,.06)':'transparent'}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:15,letterSpacing:.5,width:24,textAlign:'center',color:'var(--tx3)',flexShrink:0}}>{rank}</div>
                    <div style={{width:34,height:34,borderRadius:'50%',background:u.avatar_url?'transparent':col,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:12,color:'#fff',flexShrink:0,overflow:'hidden'}}>
                      {u.avatar_url?<img src={u.avatar_url} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:ini(u.username)}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{u.username}{isMe&&<span style={{fontSize:9,color:'var(--pu2)',marginLeft:4}}>(you)</span>}</div>
                      <div style={{fontSize:10,color:'var(--tx3)',marginTop:1,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{(u.tiktok_handles||[]).slice(0,2).join(' · ')}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontFamily:'var(--fh)',fontSize:14,color:'var(--pu2)',letterSpacing:.5}}>{(u.xp||0).toLocaleString()} XP</div>
                      <div style={{fontSize:10,color:'var(--gr)',marginTop:1}}>{fmtGBP(u.total_gmv||0)}</div>
                    </div>
                  </div>
                );
              })}
            </div>)}
            {lb.length===0&&<div style={{padding:'40px 20px',textAlign:'center',color:'var(--tx3)',fontSize:13}}>{isWeekly?'No activity this week yet — get selling!':'No affiliates yet.'}</div>}
            {/* Your position callout */}
            {profile&&lb.length>0&&(()=>{
              const myIdx=lb.findIndex(u=>u.id===profile.id);
              if(myIdx<0)return <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'12px 14px',marginTop:11,textAlign:'center',fontSize:12,color:'var(--tx3)'}}>{isWeekly?'You haven\'t earned any XP this week yet':'You\'re not on the leaderboard yet'}</div>;
              return(
                <div style={{background:'rgba(139,92,246,.08)',border:'1px solid rgba(139,92,246,.2)',borderRadius:'var(--rsm)',padding:'12px 14px',marginTop:11,display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:18,color:'var(--pu2)'}}>#{myIdx+1}</div>
                    <div style={{fontSize:12,color:'var(--tx2)'}}>Your position</div>
                  </div>
                  <div style={{fontFamily:'var(--fh)',fontSize:14,color:'var(--pu2)'}}>{(lb[myIdx].xp||0).toLocaleString()} XP</div>
                </div>
              );
            })()}
          </>);
        })()}
      </div>)}

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
              <div key={l.level} style={{display:'flex',alignItems:'center',gap:12,padding:'11px 14px',borderBottom:i<LEVELS.length-1?'1px solid var(--bo)':'none',background:cur?'rgba(139,92,246,.07)':'transparent'}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:done?'var(--gr)':cur?'var(--pu)':'var(--card3)',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:13,color:'#fff',flexShrink:0}}>{done&&!cur?'✓':l.level}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:cur?600:400,color:cur?'var(--tx)':'var(--tx2)'}}>Level {l.level}</div>
                  <div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>{l.min.toLocaleString()} – {l.level===10?'∞':l.max.toLocaleString()} XP</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  {rw?.image_url&&<img src={rw.image_url} alt="" style={{width:28,height:28,borderRadius:6,objectFit:'cover',opacity:done?1:.4}}/>}
                  {cur&&<div style={{fontSize:11,background:'rgba(139,92,246,.2)',color:'var(--pu2)',padding:'3px 9px',borderRadius:99,fontWeight:600}}>YOU</div>}
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
            {icon:'🔥',label:'Daily Streak',sub:'Go live for Loophole every day — hit milestones for bonus XP',val:'Bonus XP'},
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

      {page==='referrals'&&(<div className="pg">
        <div className="sh" style={{marginBottom:9}}>REFERRALS</div>
        {/* Referral link card */}
        <div className="ref-card" style={{marginBottom:11}}>
          <div style={{fontSize:13,fontWeight:600,marginBottom:3}}>Your Referral Link</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:7}}>Share this — when they sign up and make sales, you earn 1% of their GMV forever.</div>
          <div className="ref-code" onClick={()=>{navigator.clipboard.writeText(refLink);toast('Link copied! 📋','ok');}}>{profile.referral_code||'...'}</div>
          <button onClick={()=>{navigator.clipboard.writeText(refLink);toast('Link copied! 📋','ok');}} style={{width:'100%',padding:'9px',background:'var(--pu)',border:'none',borderRadius:'var(--rsm)',color:'#fff',fontFamily:'var(--fh)',fontSize:15,letterSpacing:1,cursor:'pointer'}}>COPY REFERRAL LINK</button>
        </div>

        {/* DATE FILTER */}
        <div style={{display:'flex',gap:5,marginBottom:11,flexWrap:'wrap',alignItems:'center'}}>
          {[['all','All'],['7d','7D'],['30d','30D'],['month','Month']].map(([val,label])=>(
            <button key={val} onClick={()=>setRefDateRange(val)} style={{padding:'5px 11px',borderRadius:99,border:`1px solid ${refDateRange===val?'var(--pu)':'var(--bo)'}`,background:refDateRange===val?'rgba(139,92,246,.18)':'var(--card)',color:refDateRange===val?'var(--pu2)':'var(--tx3)',fontSize:12,fontWeight:600,cursor:'pointer'}}>{label}</button>
          ))}
          {refDateRange==='month'&&<input type='month' value={refSelectedMonth} onChange={e=>setRefSelectedMonth(e.target.value)} style={{padding:'5px 8px',background:'rgba(139,92,246,.18)',border:'1px solid var(--pu)',borderRadius:99,color:'var(--pu2)',fontSize:12,fontWeight:600,outline:'none',cursor:'pointer',maxWidth:120}}/>}
          <button onClick={()=>setRefDateRange('custom')} style={{padding:'5px 11px',borderRadius:99,border:`1px solid ${refDateRange==='custom'?'var(--pu)':'var(--bo)'}`,background:refDateRange==='custom'?'rgba(139,92,246,.18)':'var(--card)',color:refDateRange==='custom'?'var(--pu2)':'var(--tx3)',fontSize:12,fontWeight:600,cursor:'pointer'}}>Custom</button>
          {refDateRange==='custom'&&(<>
            <input type="date" value={refCustomStart} onChange={e=>setRefCustomStart(e.target.value)} style={{padding:'4px 7px',background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
            <span style={{fontSize:11,color:'var(--tx3)'}}>→</span>
            <input type="date" value={refCustomEnd} onChange={e=>setRefCustomEnd(e.target.value)} style={{padding:'4px 7px',background:'var(--card)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:11,outline:'none'}}/>
          </>)}
        </div>

        {/* Stats grid - filtered */}
        {(()=>{
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
          // Group by referred user for the filtered period
          const byUser={};
          filteredRefEvts.forEach(e=>{
            if(!byUser[e.profile_id])byUser[e.profile_id]={gmv:0,cancelled_gmv:0};
            byUser[e.profile_id].gmv+=(e.gmv||0);
            byUser[e.profile_id].cancelled_gmv+=(e.cancelled_gmv||0);
          });
          return(<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:7,marginBottom:11}}>
              <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'11px 12px'}}>
                <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,marginBottom:4}}>Your Earnings{isRefFiltered?' (filtered)':''}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:22,color:'var(--gr)'}}>{fmtGBP(isRefFiltered?refEarnings:(profile.referral_earnings||0))}</div>
                <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>{referralStats.length} affiliate{referralStats.length!==1?'s':''} referred · 1% of net GMV</div>
              </div>
              <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'11px 12px'}}>
                <div style={{fontSize:9,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:.7,marginBottom:4}}>Their Net GMV{isRefFiltered?' (filtered)':''}</div>
                <div style={{fontFamily:'var(--fh)',fontSize:22,color:'var(--go)'}}>{fmtGBP(isRefFiltered?netRefGMV:Math.max(0,referralStats.reduce((s,r)=>s+(r.total_gmv||0),0)-referralStats.reduce((s,r)=>s+(r.total_cancelled_gmv||0),0)))}</div>
                <div style={{fontSize:10,color:'var(--tx3)',marginTop:3}}>combined net GMV generated</div>
              </div>
            </div>
            {/* Referred affiliates list */}
            {referralStats.length>0&&(<div className="asec" style={{marginBottom:11}}>
              <div className="asect">Your Referred Affiliates</div>
              {referralStats.map((r,i)=>{
                const userEvts=byUser[r.id];
                const userGMV=isRefFiltered?(userEvts?userEvts.gmv:0):r.total_gmv||0;
                const userCancelled=isRefFiltered?(userEvts?userEvts.cancelled_gmv:0):(r.total_cancelled_gmv||0);
                const userNet=Math.max(0,userGMV-userCancelled);
                return(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<referralStats.length-1?'1px solid var(--bo)':'none'}}>
                    <div style={{width:32,height:32,borderRadius:'50%',background:avc(r.username),display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--fh)',fontSize:12,color:'#fff',flexShrink:0}}>{ini(r.username)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:500}}>{r.username}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>{(r.tiktok_handles||[]).slice(0,1).join('')}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:12,color:'var(--gr)',fontWeight:600}}>{fmtGBP(userNet)}</div>
                      <div style={{fontSize:10,color:'var(--tx3)'}}>Net GMV</div>
                      <div style={{fontSize:10,color:'var(--go)',marginTop:1}}>{fmtGBP(userNet*0.01)} earned</div>
                    </div>
                  </div>
                );
              })}
            </div>)}
          </>);
        })()}

        {/* PAYOUT INVOICES */}
        <div className="asec" style={{marginBottom:11}}>
          <div className="asect">Payout History</div>
          {payouts.length===0?(<div style={{fontSize:12,color:'var(--tx3)',padding:'10px 0'}}>No payouts yet — earnings are paid 30 days after the end of each month.</div>):(
            payouts.map((po,i)=>{
              const monthLabel=new Date(po.month+'-01').toLocaleDateString('en-GB',{month:'long',year:'numeric'});
              return(
                <div key={po.id} style={{display:'flex',alignItems:'center',gap:10,padding:'10px 0',borderBottom:i<payouts.length-1?'1px solid var(--bo)':'none'}}>
                  <div style={{width:36,height:36,borderRadius:8,background:po.paid?'rgba(16,185,129,.1)':'rgba(245,158,11,.1)',border:`1px solid ${po.paid?'rgba(16,185,129,.25)':'rgba(245,158,11,.25)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{po.paid?'✅':'⏳'}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600}}>{monthLabel}</div>
                    <div style={{fontSize:10,color:po.paid?'var(--gr)':'var(--go)',marginTop:2}}>{po.paid?`Paid${po.paid_at?' on '+new Date(po.paid_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}):''}`:('Due end of '+new Date(new Date(po.month+'-01').setMonth(new Date(po.month+'-01').getMonth()+1)).toLocaleDateString('en-GB',{month:'long',year:'numeric'}))}</div>
                  </div>
                  <div style={{fontFamily:'var(--fh)',fontSize:18,color:po.paid?'var(--gr)':'var(--go)',flexShrink:0}}>{fmtGBP(po.amount)}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Earnings note */}
        <div style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--rsm)',padding:'13px',marginBottom:11}}>
          <div style={{fontSize:11,fontWeight:600,color:'var(--tx2)',marginBottom:5}}>💰 Payment Terms</div>
          <div style={{fontSize:12,color:'var(--tx3)',lineHeight:1.6}}>All referral earnings are paid <strong style={{color:'var(--tx2)'}}>30 days after the end of the month</strong> they were generated in — this allows time for returns and cancellations to be processed.</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginTop:7,padding:'8px 10px',background:'var(--card2)',borderRadius:'var(--rxs)',lineHeight:1.5}}>Example: referral commission you earn in <strong style={{color:'var(--tx2)'}}>April</strong> will be paid out by the <strong style={{color:'var(--tx2)'}}>end of May</strong>.</div>
        </div>
        {/* How it works */}
        <div className="asec">
          <div className="asect">How It Works</div>
          <div className="howto-item"><span className="howto-icon">1️⃣</span><div style={{flex:1,fontSize:12,color:'var(--tx2)'}}>Share your link with another creator</div></div>
          <div className="howto-item"><span className="howto-icon">2️⃣</span><div style={{flex:1,fontSize:12,color:'var(--tx2)'}}>They sign up using your referral code</div></div>
          <div className="howto-item"><span className="howto-icon">3️⃣</span><div style={{flex:1,fontSize:12,color:'var(--tx2)'}}>You earn 1% of all their net GMV — forever</div></div>
        </div>
      </div>)}

      {/* PRODUCTS */}
      {page==='products'&&(<div className="pg">
        <div className="sh" style={{marginBottom:11}}>PRODUCTS</div>
        {products.length===0&&(<div style={{textAlign:'center',padding:'40px 0',color:'var(--tx3)',fontSize:13}}>No products yet — check back soon!</div>)}
        <div style={{display:'flex',flexDirection:'column',gap:9}}>
          {products.map(prod=>(
            <div key={prod.id} style={{background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',overflow:'hidden'}}>
              {prod.image_url&&<div style={{width:'100%',height:160,overflow:'hidden'}}><img src={prod.image_url} alt={prod.name} style={{width:'100%',height:'100%',objectFit:'cover'}}/></div>}
              <div style={{padding:'12px 13px'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
                  <div style={{fontFamily:'var(--fh)',fontSize:17,letterSpacing:1,flex:1,marginRight:8}}>{prod.name}</div>
                  {prod.price&&<div style={{fontFamily:'var(--fh)',fontSize:17,color:'var(--gr)',flexShrink:0}}>£{Number(prod.price).toFixed(2)}</div>}
                </div>
                {prod.description&&<div style={{fontSize:12,color:'var(--tx2)',lineHeight:1.5,marginBottom:10}}>{prod.description}</div>}
                <div style={{display:'flex',gap:7}}>
                  {prod.commission_rate&&<div style={{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:99,padding:'3px 9px',fontSize:11,color:'var(--go)',fontWeight:600}}>{prod.commission_rate}% commission</div>}
                  {prod.tiktok_url&&<button onClick={()=>{navigator.clipboard.writeText(prod.tiktok_url);toast('Link copied! 📋','ok');}} style={{background:'rgba(139,92,246,.12)',border:'1px solid rgba(139,92,246,.25)',borderRadius:99,padding:'3px 10px',fontSize:11,color:'var(--pu2)',fontWeight:600,cursor:'pointer'}}>📋 Copy Link</button>}
                </div>
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

        <div className="asec" style={{marginBottom:9}}><div className="asect">TikTok Handles</div><ProfileHandles profile={profile} setProfile={setProfile} toast={toast}/></div>
        <div className="mcard">
          <div className="mi" onClick={openAdminGate}><div className="mil"><span className="mii">🔐</span>Admin Panel</div><span className="mich">›</span></div>

        </div>
        <button className="btn btnre" onClick={doLogout}>Sign Out</button>
      </div>)}

      {/* ADMIN */}
      {page==='admin'&&adminUnlocked&&(<div className="pg">
        <div className="admb"><span style={{fontSize:22}}>👑</span><div><div style={{fontFamily:'var(--fh)',fontSize:14,letterSpacing:'1.5px'}}>ADMIN PANEL</div><div style={{fontSize:10,color:'var(--tx3)',marginTop:1}}>Loophole Levels Control Centre</div></div></div>
        <div className="admstats">
          <div className="admstat"><div className="admsv">{allProfiles.length}</div><div className="admsl">Affiliates</div></div>
          <div className="admstat"><div className="admsv">{allProfiles.reduce((s,p)=>s+(p.xp||0),0).toLocaleString()}</div><div className="admsl">XP Awarded</div></div>
        </div>
        <div className="admstats">
          <div className="admstat"><div className="admsv" style={{fontSize:15,color:'var(--gr)'}}>{fmtGBP(allProfiles.reduce((s,p)=>s+(p.total_gmv||0),0))}</div><div className="admsl">Total GMV</div></div>
          <div className="admstat"><div className="admsv" style={{fontSize:15}}>{allProfiles.reduce((s,p)=>s+(p.total_orders||0),0)}</div><div className="admsl">Total Orders</div></div>
        </div>
        <div className="asec">
          <div className="asect">Import TikTok Shop Data</div>
          <div className={`dz${dragOver?' drag':''}`} onDragOver={e=>{e.preventDefault();setDragOver(true);}} onDragLeave={()=>setDragOver(false)} onDrop={e=>{e.preventDefault();setDragOver(false);const f=e.dataTransfer.files[0];if(f)handleFile(f);}}>
            <input type="file" accept=".csv,.xlsx,.xls" onChange={e=>{if(e.target.files?.[0])handleFile(e.target.files[0]);}}/>
            <div style={{fontSize:24,marginBottom:5}}>📂</div>
            <div style={{fontSize:12,fontWeight:500,marginBottom:2}}>Drop file or tap to browse</div>
            <div style={{fontSize:10,color:'var(--tx3)'}}>TikTok Shop Affiliate Center · .csv or .xlsx</div>
          </div>
          {importLog.length>0&&<div className="ilog">{importLog.map((l,i)=><div key={i} className={l.startsWith('✓')?'logo':l.startsWith('⚠')?'logw':l.startsWith('ERROR')?'loge':''}>{l}</div>)}</div>}
        </div>
        <div className="asec">
          <div className="asect">Manually Award XP</div>
          {allProfiles.length===0?<div style={{color:'var(--tx3)',fontSize:12}}>No affiliates yet.</div>:allProfiles.map(p=>{const plv=getLv(p.xp,LEVELS);return(<div key={p.id} className="afrow"><div className="afin"><div className="afnm">{p.username}</div><div className="afmt">Lvl {plv.level} · {(p.xp||0).toLocaleString()} XP · {(p.tiktok_handles||[]).join(', ')}</div></div><div className="afac"><input className="xpin" type="number" min="1" value={xpAmounts[p.id]||100} onChange={e=>setXpAmounts({...xpAmounts,[p.id]:parseInt(e.target.value)||100})}/><button className="xbtn" onClick={()=>admAwardXP(p.id)}>+XP</button><button className="xbtn" style={{background:'rgba(244,63,94,.14)',borderColor:'rgba(244,63,94,.26)',color:'var(--re)'}} onClick={()=>admAwardXP(p.id,true)}>-XP</button></div></div>);})}
        </div>
        <div className="asec">
          <div className="asect">Actions</div>
          <button className="aact" onClick={()=>{if(!showRE)setEditRewards(rewards.map(r=>({...r})));setShowRE(!showRE);}}>🎁 Edit Reward Tiers & Images</button>
          <button className="aact" onClick={()=>{if(!showME)setEditMilestones(milestones.map(m=>({...m})));setShowME(!showME);}}>🔥 Edit Streak Milestones & XP</button>
          <button className="aact" onClick={exportCSV}>📊 Export Affiliate Data (.csv)</button>
          <button className="aact" onClick={()=>{if(!showPE)setEditProducts(products.map(p=>({...p})));setShowPE(!showPE);}}>📦 Edit Products</button>
          <button className="aact" onClick={()=>setShowPM(!showPM)}>🔗 Map Import Names to Products</button>
          <button className="aact" onClick={()=>{loadXpExclusions();setShowExclusions(!showExclusions);}}>🚫 XP Exclusions</button>
          <button className="aact" onClick={generatePayouts}>💷 Generate Payout Records</button>
        </div>
        {/* XP EXCLUSIONS */}
        {showExclusions&&(<div className="asec">
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
            }} style={{padding:'7px 14px',background:'rgba(244,63,94,.12)',border:'1px solid rgba(244,63,94,.25)',borderRadius:'var(--rxs)',color:'var(--re)',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap',marginLeft:'auto'}}>+ Add</button>
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
        <div className="asec">
          <div className="asect">Referral Payouts</div>
          <div style={{fontSize:11,color:'var(--tx3)',marginBottom:9,lineHeight:1.5}}>Mark referral payouts as paid for each affiliate. Click "Generate Payout Records" above to create records from import data.</div>
          {adminPayouts.length===0?<div style={{color:'var(--tx3)',fontSize:12}}>No payout records yet — generate them first.</div>:(()=>{
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
                        <button onClick={()=>togglePayout(po.id,!po.paid)} style={{padding:'4px 10px',borderRadius:'var(--rxs)',border:`1px solid ${po.paid?'rgba(16,185,129,.3)':'rgba(245,158,11,.3)'}`,background:po.paid?'rgba(16,185,129,.1)':'rgba(245,158,11,.1)',color:po.paid?'var(--gr)':'var(--go)',fontSize:11,fontWeight:600,cursor:'pointer'}}>{po.paid?'✅ Paid':'Mark Paid'}</button>
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}
        </div>
        {/* IMPORT HISTORY */}
        <div className="asec">
          <div className="asect">Import History — Delete by Date</div>
          {importHistory.length===0?<div style={{color:'var(--tx3)',fontSize:12}}>No imports yet.</div>:importHistory.map(ih=>(
            <div key={ih.date} style={{display:'flex',alignItems:'center',gap:8,padding:'8px 0',borderBottom:'1px solid var(--bo)'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:600}}>{ih.date}</div>
                <div style={{fontSize:10,color:'var(--tx3)',marginTop:2}}>{ih.profileCount||0} affiliate{(ih.profileCount||0)!==1?'s':''} · GMV {fmtGBP(ih.totalGmv)} · Comm {fmtGBP(ih.totalComm)}</div>
              </div>
              {deleteConfirm===`date-${ih.date}`?(<div style={{display:'flex',gap:5}}>
                <button onClick={()=>{deleteImportByDate(ih.date);setDeleteConfirm(null);}} style={{background:'rgba(244,63,94,.15)',border:'1px solid rgba(244,63,94,.3)',borderRadius:'var(--rxs)',padding:'4px 8px',color:'var(--re)',fontSize:11,fontWeight:700,cursor:'pointer'}}>Confirm</button>
                <button onClick={()=>setDeleteConfirm(null)} style={{background:'var(--card2)',border:'1px solid var(--bo)',borderRadius:'var(--rxs)',padding:'4px 8px',color:'var(--tx3)',fontSize:11,cursor:'pointer'}}>Cancel</button>
              </div>):(<button onClick={()=>setDeleteConfirm(`date-${ih.date}`)} style={{background:'rgba(244,63,94,.1)',border:'1px solid rgba(244,63,94,.2)',borderRadius:'var(--rxs)',padding:'4px 9px',color:'var(--re)',fontSize:11,fontWeight:600,cursor:'pointer'}}>Delete</button>)}
            </div>
          ))}
        </div>

        {showME&&(<div className="asec"><div className="asect">Edit Streak Milestones</div>{editMilestones.map((m,i)=>(<div key={m.id||i} className="rerow"><div style={{display:'flex',gap:5,alignItems:'flex-end'}}><div style={{width:55}}><div className="lbl">Days</div><input className="ins" type="number" value={m.days} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],days:parseInt(e.target.value)||m.days};setEditMilestones(n);}}/></div><div style={{flex:1}}><div className="lbl">Label</div><input className="ins" value={m.label} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],label:e.target.value};setEditMilestones(n);}}/></div><div style={{width:60}}><div className="lbl">XP</div><input className="ins" type="number" value={m.xp_bonus} onChange={e=>{const n=[...editMilestones];n[i]={...n[i],xp_bonus:parseInt(e.target.value)||m.xp_bonus};setEditMilestones(n);}}/></div><button className="svbtn" onClick={async()=>{const {error}=await supabase.from('streak_milestones').update({days:m.days,label:m.label,xp_bonus:m.xp_bonus}).eq('id',m.id);if(!error){toast('Saved ✓','ok');loadMilestones();}else toast('Failed','wn');}}>Save</button></div></div>))}</div>)}
        {showRE&&(<div className="asec"><div className="asect">Edit Reward Tiers</div>{editRewards.map((r,i)=>(<div key={r.id} className="rerow"><div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1,color:'var(--tx3)',marginBottom:6,fontWeight:600}}>Level {r.level}</div><div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">Name</div><input className="ins" value={r.name} onChange={e=>{const n=[...editRewards];n[i]={...n[i],name:e.target.value};setEditRewards(n);}}/></div><div style={{width:78}}><div className="lbl">XP Req</div><input className="ins" type="number" value={r.xp_required} onChange={e=>{const n=[...editRewards];n[i]={...n[i],xp_required:parseInt(e.target.value)||r.xp_required};setEditRewards(n);}}/></div></div><div style={{marginBottom:5}}><div className="lbl">Description</div><input className="ins" value={r.description} onChange={e=>{const n=[...editRewards];n[i]={...n[i],description:e.target.value};setEditRewards(n);}}/></div><div style={{display:'flex',gap:4,alignItems:'flex-end'}}><div style={{flex:1}}><div className="lbl">Image URL or upload</div><div style={{display:'flex',gap:4}}><input className="ins" value={r.image_url&&r.image_url.startsWith('data:')?'[uploaded]':(r.image_url||'')} onChange={e=>{const n=[...editRewards];n[i]={...n[i],image_url:e.target.value||null};setEditRewards(n);}} placeholder="https://..." style={{flex:1}}/><label style={{cursor:'pointer',background:'rgba(139,92,246,.13)',border:'1px solid rgba(139,92,246,.25)',borderRadius:5,padding:'5px 7px',fontSize:11,color:'var(--pu2)',display:'flex',alignItems:'center'}}>📷<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0])handleImageUpload(i,e.target.files[0]);}}/></label></div>{r.image_url&&<img src={r.image_url} alt="" style={{width:44,height:30,objectFit:'cover',borderRadius:4,marginTop:4}}/>}</div><button className="svbtn" style={{marginLeft:3}} onClick={()=>saveReward(r)}>Save</button></div></div>))}</div>)}
      </div>)}
      {showPE&&adminUnlocked&&(<div className="asec" style={{margin:'0 13px 9px'}}>
        <div className="asect">Edit Products</div>
        {editProducts.map((prod,i)=>(
          <div key={prod.id||i} className="rerow">
            <div style={{fontSize:9,textTransform:'uppercase',letterSpacing:1,color:'var(--tx3)',marginBottom:6,fontWeight:600}}>Product {i+1}</div>
            <div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">Name</div><input className="ins" value={prod.name||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],name:e.target.value};setEditProducts(n);}}/></div><div style={{width:70}}><div className="lbl">Price £</div><input className="ins" type="number" value={prod.price||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],price:e.target.value};setEditProducts(n);}}/></div></div>
            <div style={{marginBottom:5}}><div className="lbl">Description</div><input className="ins" value={prod.description||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],description:e.target.value};setEditProducts(n);}}/></div>
            <div style={{display:'flex',gap:5,marginBottom:5}}><div style={{flex:1}}><div className="lbl">TikTok Shop URL</div><input className="ins" value={prod.tiktok_url||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],tiktok_url:e.target.value};setEditProducts(n);}}/></div><div style={{width:70}}><div className="lbl">Comm %</div><input className="ins" type="number" value={prod.commission_rate||''} onChange={e=>{const n=[...editProducts];n[i]={...n[i],commission_rate:e.target.value};setEditProducts(n);}}/></div></div>
            <div style={{marginBottom:5}}><div className="lbl">Image URL</div><div style={{display:'flex',gap:4}}><input className="ins" value={prod.image_url&&prod.image_url.startsWith('data:')?'[uploaded]':(prod.image_url||'')} onChange={e=>{const n=[...editProducts];n[i]={...n[i],image_url:e.target.value||null};setEditProducts(n);}} placeholder="https://..." style={{flex:1}}/><label style={{cursor:'pointer',background:'rgba(139,92,246,.13)',border:'1px solid rgba(139,92,246,.25)',borderRadius:5,padding:'5px 7px',fontSize:11,color:'var(--pu2)',display:'flex',alignItems:'center'}}>📷<input type="file" accept="image/*" style={{display:'none'}} onChange={e=>{if(e.target.files?.[0]){const r=new FileReader();r.onload=ev=>{const n=[...editProducts];n[i]={...n[i],image_url:ev.target.result};setEditProducts(n);toast('Image ready — click Save','info');};r.readAsDataURL(e.target.files[0]);}}}/></label></div>{prod.image_url&&<img src={prod.image_url} alt="" style={{width:44,height:30,objectFit:'cover',borderRadius:4,marginTop:4}}/>}</div>
            <div style={{display:'flex',gap:5,marginTop:5}}><button className="svbtn" onClick={async()=>{const p=editProducts[i];if(p.id){const {error}=await supabase.from('products').update({name:p.name,description:p.description,price:p.price,tiktok_url:p.tiktok_url,commission_rate:p.commission_rate,image_url:p.image_url,sort_order:p.sort_order||i}).eq('id',p.id);if(!error){toast('Saved ✓','ok');loadProducts();}else toast('Failed','wn');}else{const {error}=await supabase.from('products').insert({name:p.name,description:p.description,price:p.price,tiktok_url:p.tiktok_url,commission_rate:p.commission_rate,image_url:p.image_url,sort_order:i});if(!error){toast('Added ✓','ok');loadProducts();}else toast('Failed','wn');}}}>Save</button><button onClick={async()=>{if(prod.id){await supabase.from('products').delete().eq('id',prod.id);toast('Deleted','ok');loadProducts();}setEditProducts(editProducts.filter((_,j)=>j!==i));}} style={{background:'rgba(244,63,94,.1)',border:'1px solid rgba(244,63,94,.2)',borderRadius:'var(--rxs)',padding:'5px 9px',color:'var(--re)',fontSize:11,fontWeight:600,cursor:'pointer'}}>Delete</button></div>
          </div>
        ))}
        <button onClick={()=>setEditProducts([...editProducts,{name:'',description:'',price:'',tiktok_url:'',commission_rate:'',image_url:null,sort_order:editProducts.length}])} style={{width:'100%',marginTop:9,padding:'8px',background:'rgba(139,92,246,.1)',border:'1px solid rgba(139,92,246,.2)',borderRadius:'var(--rsm)',color:'var(--pu2)',fontSize:12,cursor:'pointer',fontWeight:600}}>+ Add Product</button>
      </div>)}
      {showPM&&adminUnlocked&&(<div className="asec" style={{margin:'0 13px 9px'}}>
        <div className="asect">Map Import Names to Products</div>
        <div style={{fontSize:11,color:'var(--tx3)',marginBottom:9,lineHeight:1.5}}>When TikTok data uses a different name, map it to the right product here. Import a file first to see unrecognised names.</div>
        {unmappedProducts.length===0&&Object.keys(productMappings).length===0&&<div style={{fontSize:12,color:'var(--tx3)'}}>No unrecognised product names yet.</div>}
        {unmappedProducts.map((name,i)=>(
          <div key={i} style={{display:'flex',gap:7,alignItems:'center',padding:'7px 0',borderBottom:'1px solid var(--bo)'}}>
            <div style={{flex:1,fontSize:12,color:'var(--go)',fontWeight:500}}>{name}</div>
            <span style={{fontSize:11,color:'var(--tx3)'}}>→</span>
            <select style={{flex:1,padding:'5px 7px',background:'var(--bg2)',border:'1px solid var(--bo2)',borderRadius:'var(--rxs)',color:'var(--tx)',fontSize:12,outline:'none'}}
              value={productMappings[name.toLowerCase()]||''}
              onChange={async e=>{const v=e.target.value;if(v){await supabase.from('product_mappings').upsert({import_name:name.toLowerCase(),product_name:v},{onConflict:'import_name'});setProductMappings(prev=>({...prev,[name.toLowerCase()]:v}));setUnmappedProducts(prev=>prev.filter(x=>x!==name));}}}>
              <option value=''>-- select product --</option>
              {products.map(p=><option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </div>
        ))}
        {Object.keys(productMappings).filter(k=>productMappings[k]).length>0&&(<div style={{marginTop:9}}>
          <div style={{fontSize:10,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>Active Mappings</div>
          {Object.entries(productMappings).map(([k,v],i)=>v&&(
            <div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid var(--bo)',fontSize:11}}>
              <span style={{color:'var(--go)'}}>{k}</span><span style={{color:'var(--tx3)',margin:'0 6px'}}>→</span><span style={{color:'var(--gr)',flex:1}}>{v}</span>
              <button onClick={async()=>{await supabase.from('product_mappings').delete().eq('import_name',k);setProductMappings(prev=>{const n={...prev};delete n[k];return n;});}} style={{background:'none',border:'none',color:'var(--re)',cursor:'pointer',fontSize:13,padding:'0 4px'}}>✕</button>
            </div>
          ))}
        </div>)}
      </div>)}
    </div>

    {/* BOTTOM NAV - mobile only */}
    {!isDesktop&&<div className="bnav">
      {[['home','🏠','Home'],['rewards','🎁','Rewards'],['lb','🏆','Rankings'],['products','📦','Products'],['referrals','👥','Refer'],['profile','👤','Profile']].map(([pg,icon,label])=>(
        <button key={pg} className={`ni${page===pg?' on':''}`} onClick={()=>navTo(pg)}>
          <div className="nicon">{icon}</div><div className="nlbl">{label}</div>
        </button>
      ))}
      {adminUnlocked&&(<button className={`ni${page==='admin'?' on':''}`} onClick={()=>navTo('admin')}><div className="nicon">👑</div><div className="nlbl">Admin</div></button>)}
    </div>}

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
              <div style={{position:'absolute',inset:0,background:'radial-gradient(circle at 50% 60%,rgba(245,158,11,.12) 0%,transparent 70%)',pointerEvents:'none'}}/>
              <div style={{fontSize:72,lineHeight:1,marginBottom:6}}>🔥</div>
              <div style={{fontFamily:'var(--fh)',fontSize:80,letterSpacing:2,color:'var(--go)',lineHeight:1}}>{todayClaimed?streak:nextStreak}</div>
              <div style={{fontSize:13,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:3,marginTop:6}}>Day Streak</div>
              {todayClaimed&&<div style={{marginTop:10,display:'inline-block',background:'rgba(16,185,129,.12)',border:'1px solid rgba(16,185,129,.25)',borderRadius:99,padding:'4px 14px',fontSize:12,color:'var(--gr)',fontWeight:600}}>✓ Claimed today</div>}
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
              const glowColors=['rgba(245,158,11,.3)','rgba(245,158,11,.4)','rgba(249,115,22,.45)','rgba(239,68,68,.45)','rgba(239,68,68,.55)','rgba(239,68,68,.6)'];
              const borderColors=['rgba(245,158,11,.4)','rgba(245,158,11,.5)','rgba(249,115,22,.5)','rgba(239,68,68,.5)','rgba(239,68,68,.6)','rgba(239,68,68,.7)'];
              const bgColors=['rgba(245,158,11,.08)','rgba(245,158,11,.1)','rgba(249,115,22,.1)','rgba(239,68,68,.1)','rgba(239,68,68,.12)','rgba(239,68,68,.14)'];
              return(<div style={{marginBottom:11}}>
                {/* Pill */}
                <button onClick={()=>setShowMilestoneCarousel(!showMilestoneCarousel)} style={{width:'100%',background:'var(--card)',border:'1px solid var(--bo)',borderRadius:'var(--r)',padding:'14px',cursor:'pointer',textAlign:'left'}}>
                  <div style={{fontSize:11,color:'var(--tx3)',textTransform:'uppercase',letterSpacing:1,marginBottom:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span>Next Milestone</span>
                    <span style={{fontSize:11,color:'var(--pu2)'}}>{showMilestoneCarousel?'▲ hide':'▼ see all stages'}</span>
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
                    <div style={{fontFamily:'var(--fh)',fontSize:16,letterSpacing:1,color:'var(--tx)'}}>{nm.label}</div>
                    <div style={{background:'rgba(245,158,11,.14)',border:'1px solid rgba(245,158,11,.28)',borderRadius:99,padding:'3px 10px',fontFamily:'var(--fh)',fontSize:14,color:'var(--go)'}}>+{nm.xp_bonus} XP</div>
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
                        <div key={i} style={{minWidth:170,maxWidth:170,height:200,flexShrink:0,scrollSnapAlign:'start',background:done?'rgba(16,185,129,.07)':isCur?bgColors[fi]:'var(--card)',border:`1px solid ${done?'rgba(16,185,129,.3)':isCur?borderColors[fi]:'var(--bo)'}`,borderRadius:'var(--r)',padding:'16px 12px',textAlign:'center',position:'relative',overflow:'hidden',boxShadow:isCur?`0 0 18px ${glowColors[fi]}`:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
                          {done&&<div style={{position:'absolute',top:8,right:8,background:'rgba(16,185,129,.2)',border:'1px solid rgba(16,185,129,.4)',borderRadius:99,padding:'2px 6px',fontSize:9,color:'var(--gr)',fontWeight:700}}>DONE ✓</div>}
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
            {todayMilestone&&!todayClaimed&&(<div style={{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.3)',borderRadius:'var(--r)',padding:'12px 14px',marginBottom:11,textAlign:'center'}}>
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
        {showReward.image_url?<img src={showReward.image_url} alt={showReward.name} style={{width:'100%',height:148,objectFit:'cover',borderRadius:10,marginBottom:11}}/>:<div style={{width:'100%',height:100,background:'var(--card2)',borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:11,fontSize:38,opacity:.3}}>🎁</div>}
        {(()=>{const un=profile.xp>=showReward.xp_required;const prog=Math.min(100,Math.round((profile.xp/showReward.xp_required)*100));const need=Math.max(0,showReward.xp_required-profile.xp);return(<div style={{background:'var(--card2)',borderRadius:8,padding:11,marginBottom:11}}><div style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'var(--tx3)',marginBottom:5}}><span>Progress</span><span>{un?'✅ Unlocked!':`${need.toLocaleString()} XP needed`}</span></div><div className="pw"><div className="pf" style={{width:`${prog}%`}}/></div><div style={{display:'flex',justifyContent:'space-between',marginTop:3,fontSize:10,color:'var(--tx3)'}}><span>{profile.xp.toLocaleString()}</span><span>{showReward.xp_required.toLocaleString()} XP</span></div>{un&&<div style={{marginTop:8,background:'rgba(16,185,129,.09)',border:'1px solid rgba(16,185,129,.2)',borderRadius:7,padding:9,textAlign:'center',fontSize:12,color:'var(--gr)'}}>🎉 Unlocked! Contact Loophole to claim.</div>}</div>);})()} 
        <button onClick={()=>setShowReward(null)} style={{width:'100%',padding:9,background:'var(--card2)',border:'1px solid var(--bo2)',borderRadius:8,color:'var(--tx2)',fontSize:13,cursor:'pointer'}}>Close</button>
      </div>
    </div>)}

    {/* ADMIN GATE */}
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

    <div className="toastwrap">{toasts.map(t=><div key={t.id} className={`toast ${t.type}`}>{t.msg}</div>)}</div>
  </div></>);
}
