import{r as i,j as e,w as me,cn as gt,L as xe,l as Ze,u as yt,f as bt,am as Me,ct as Oe,a6 as Ue,as as wt,aR as $e,X as vt,av as jt}from"./vendor-react-Cvi3ws32.js";import{f as St,A as Ft,g as kt}from"./AppHeader-DS8KH5zW.js";import{T as At,c as He}from"./tabs-GcPrraN-.js";import{u as Ct,l as Et,b as q,t as A,e as Fe,L as Nt}from"./index-CauoN2AN.js";import{V as Rt}from"./VideoDemo-CQEOUTjq.js";import{A as We,a as _e,b as Ke,c as Ve,d as qe,e as Ge,f as Je,g as Ye}from"./alert-dialog-B_Q13ETv.js";import{M as Tt}from"./MainContentWrapper-CFq7-TD8.js";import{S as Bt}from"./StickyCTA-BoJo-0_A.js";import{D as zt}from"./devPreview-BKaiNRnB.js";import{a as Xe}from"./universityUtils-IWoHoM4I.js";import{i as It,a as Lt,b as Qe}from"./suggestionChips-CBa5dcmh.js";import{f as Dt}from"./firebaseApi-HYzo3JlB.js";const D="'IBM Plex Mono', monospace",ke=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Ae=40,Ce=32;function Pt({firms:F,onViewContacts:M,onDelete:ne,deletingId:L}){const[O,ge]=i.useState("name"),[w,f]=i.useState("desc"),[U,y]=i.useState(""),[R,ee]=i.useState(F),[k,I]=i.useState(new Set),[p,P]=i.useState(null),g=i.useRef(null);i.useEffect(()=>{if(!U.trim()){ee(F);return}const r=F.filter(d=>{var m,v,E,c,B;const n=U.toLowerCase();return((m=d.name)==null?void 0:m.toLowerCase().includes(n))||((v=d.industry)==null?void 0:v.toLowerCase().includes(n))||((c=(E=d.location)==null?void 0:E.display)==null?void 0:c.toLowerCase().includes(n))||((B=d.website)==null?void 0:B.toLowerCase().includes(n))});ee(r)},[U,F]);const T=[...R].sort((r,d)=>{var v,E,c,B,ce,de,te,re;let n,m;switch(O){case"name":n=((v=r.name)==null?void 0:v.toLowerCase())||"",m=((E=d.name)==null?void 0:E.toLowerCase())||"";break;case"location":n=((B=(c=r.location)==null?void 0:c.display)==null?void 0:B.toLowerCase())||"",m=((de=(ce=d.location)==null?void 0:ce.display)==null?void 0:de.toLowerCase())||"";break;case"industry":n=((te=r.industry)==null?void 0:te.toLowerCase())||"",m=((re=d.industry)==null?void 0:re.toLowerCase())||"";break;default:return 0}return n<m?w==="asc"?-1:1:n>m?w==="asc"?1:-1:0}),Ne=r=>{O===r?f(w==="asc"?"desc":"asc"):(ge(r),f("desc"))},G=r=>{var d;return r.id||`${r.name}-${(d=r.location)==null?void 0:d.display}`},Re=()=>{k.size===R.length?I(new Set):I(new Set(R.map(r=>G(r))))},b=r=>{I(d=>{const n=new Set(d);return n.has(r)?n.delete(r):n.add(r),n})},Te=()=>{if(!p)return"A1";const r=ke.find(m=>m.key===p.col),d=(r==null?void 0:r.letter)||"A",n=T.findIndex(m=>G(m)===p.firmKey);return`${d}${n>=0?n+1:1}`},le=()=>{var d;if(!p)return"";const r=T.find(n=>G(n)===p.firmKey);if(!r)return"";switch(p.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((d=r.location)==null?void 0:d.display)||"";case"industry":return r.industry||"";default:return""}},J={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:D,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{g.current&&!g.current.contains(r.target)&&P(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(me,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:U,onChange:r=>y(r.target.value),style:{fontFamily:D,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[R.length," firm",R.length!==1?"s":"",U&&` of ${F.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:D},children:Te()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:D,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:D,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:le()})]}),e.jsx("div",{ref:g,style:{flex:1,overflow:"auto"},children:R.length===0&&F.length>0&&U?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:D},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>y(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:D},children:"Clear search"})]}):R.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:D},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ae,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:Ce,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),ke.map(r=>{const d=(p==null?void 0:p.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:d?"#2a2a2a":"#999",fontWeight:d?500:400,background:d?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Ae,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:Ce,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:R.length>0&&k.size===R.length,onChange:Re,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),ke.map(r=>{const d=(p==null?void 0:p.col)===r.key,n=J[r.key];return e.jsxs("th",{onClick:n?()=>Ne(n):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:d?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:n?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,n&&O===n&&(w==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:T.map((r,d)=>{var E;const n=G(r),m=k.has(n),v=c=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(p==null?void 0:p.firmKey)===n&&(p==null?void 0:p.col)===c?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:m?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:c=>{m||(c.currentTarget.style.background="#f5f5f3")},onMouseLeave:c=>{c.currentTarget.style.background=m?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Ae,textAlign:"center",fontSize:10,color:m?"#fff":"#999",background:m?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:c=>{m||(c.currentTarget.style.background="#f0f0ee",c.currentTarget.style.color="#555")},onMouseLeave:c=>{m||(c.currentTarget.style.background="#ffffff",c.currentTarget.style.color="#999")},children:d+1}),e.jsx("td",{style:{width:Ce,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:m,onChange:()=>b(n),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>P({firmKey:n,col:"name"}),style:v("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||" - "})}),e.jsx("td",{onClick:()=>P({firmKey:n,col:"website"}),style:v("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:" - "})}),e.jsx("td",{onClick:()=>P({firmKey:n,col:"linkedin"}),style:v("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl.startsWith("http")?r.linkedinUrl:`https://${r.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",onClick:c=>c.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:" - "})}),e.jsx("td",{onClick:()=>P({firmKey:n,col:"location"}),style:v("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((E=r.location)==null?void 0:E.display)||" - "})}),e.jsx("td",{onClick:()=>P({firmKey:n,col:"industry"}),style:v("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||" - "})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>M(r),style:{fontFamily:D,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:c=>{c.currentTarget.style.color="#2a2a2a"},onMouseLeave:c=>{c.currentTarget.style.color="#555"},children:[e.jsx(gt,{className:"h-3 w-3"})," View"]}),ne&&e.jsx("button",{onClick:()=>ne(r),disabled:L===n,style:{background:"none",border:"none",color:"#bbb",cursor:L===n?"wait":"pointer",padding:3},onMouseEnter:c=>{c.currentTarget.style.color="#c00"},onMouseLeave:c=>{c.currentTarget.style.color="#bbb"},children:L===n?e.jsx(xe,{className:"h-3 w-3 animate-spin"}):e.jsx(Ze,{className:"h-3 w-3"})})]})})]},n)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:D},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[T.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const Mt=({item:F,onSelect:M})=>e.jsxs("button",{type:"button",onClick:()=>M(F.prompt),className:"prompt-card",style:{display:"flex",flexDirection:"column",background:"#fff",border:"1px solid #E5E3DE",borderRadius:8,padding:14,minHeight:88,cursor:"pointer",textAlign:"left",fontFamily:"inherit",transition:"border-color .15s ease, transform .15s ease",width:"100%"},children:[e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:15,lineHeight:1.4,color:"var(--ink, #111418)",flex:1},children:["“",F.prompt,"”"]}),e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:9.5,letterSpacing:"0.08em",textTransform:"uppercase",color:"#8A8F97",marginTop:"auto",paddingTop:8},children:F.hint}),e.jsx("style",{children:`
        .prompt-card:hover {
          border-color: #1B2A44 !important;
          transform: translateY(-1px);
        }
        .prompt-card:focus-visible {
          outline: 2px solid var(--st-accent, #1B2A44);
          outline-offset: 2px;
        }
      `})]}),Ee="scout_auto_populate";function Ot(F){return["Netflix hiring managers in LA",F?`${F} grads at McKinsey`:"Top grads at McKinsey","AI startups hiring data scientists","Boutique banks in New York","Gaming studios in Los Angeles"]}const er=({embedded:F=!1,initialTab:M,isDevPreview:ne=!1})=>{const L=yt(),O=bt(),{user:ge,checkCredits:w}=Ct(),f=ne?zt:ge,{openPanelWithSearchHelp:U}=Et(),y=f||{credits:0,tier:"free"},R=i.useMemo(()=>Xe(f==null?void 0:f.university),[f]),ee=i.useMemo(()=>Ot(R),[R]),[k,I]=i.useState(""),[p,P]=i.useState(!1),[g,T]=i.useState([]),[Ne,G]=i.useState(null),[Re,b]=i.useState(null),[Te,le]=i.useState([]),[J,r]=i.useState(!1),[d,n]=i.useState(null),[m,v]=i.useState(!1),[E,c]=i.useState(!1),[B,ce]=i.useState([]),[de,te]=i.useState(!1),re=i.useRef(null),[$,he]=i.useState(M||"firm-search");i.useEffect(()=>{M&&he(M)},[M]);const[ye,be]=i.useState(!1),[et,Be]=i.useState(null),[tt,we]=i.useState(!1),[rt,ve]=i.useState(!1),st=i.useRef([]),Y=i.useRef(new Set),[j,it]=i.useState(10),[X]=i.useState(5),ot=i.useRef(null),[at,nt]=i.useState(0),[Ut,ze]=i.useState(!0),[se,Ie]=i.useState(!1);i.useEffect(()=>{if(se||k)return;const t=setInterval(()=>{ze(!1),setTimeout(()=>{nt(s=>(s+1)%ee.length),ze(!0)},300)},3e3);return()=>clearInterval(t)},[se,k]);const Le=i.useRef(!1),[lt,je]=i.useState([]),[pe,Se]=i.useState(!1),[De,ct]=i.useState(null);i.useEffect(()=>{if(!(f!=null&&f.uid)||Le.current)return;Le.current=!0,(async()=>{try{const s=await Dt.getUserOnboardingData(f.uid),u=Xe(s.university);ct(u||null);const l={firstName:s.firstName,university:s.university,graduationYear:s.graduationYear,targetIndustries:s.targetIndustries,preferredLocations:s.preferredLocations,dreamCompanies:s.dreamCompanies,careerTrack:s.careerTrack,preferredJobRole:s.preferredJobRole,targetFirms:s.targetFirms||[],extractedRoles:s.extractedRoles||[],directionNarrative:s.directionNarrative||"",personalContext:s.personalContext||""};It(l)?(je(Qe()),Se(!1)):(je(Lt(l)),Se(!0))}catch(s){console.error("[FirmSearch] onboarding fetch failed, using generic prompts:",s),je(Qe()),Se(!1)}})()},[f==null?void 0:f.uid]);const _=k.trim().length>=3;i.useEffect(()=>{w&&f&&w()},[j,w,f]),i.useEffect(()=>{st.current=g},[g]),i.useEffect(()=>{const t=u=>{const{industry:l,location:h,size:o}=u;let a="";l&&(a+=l),h&&(a+=(a?" in ":"")+h),o&&(a+=(a?", ":"")+o),a&&(I(a),A({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},s=()=>{var u;try{const l=(u=O.state)==null?void 0:u.scoutAutoPopulate;if((l==null?void 0:l.search_type)==="firm"){t(l),sessionStorage.removeItem(Ee),L(O.pathname,{replace:!0,state:{}});return}const h=sessionStorage.getItem(Ee);if(h){const o=JSON.parse(h);let a;o.search_type==="firm"&&(o.auto_populate?a=o.auto_populate:a=o,t(a),sessionStorage.removeItem(Ee))}}catch(l){console.error("[Scout] Auto-populate error:",l)}};return s(),window.addEventListener("scout-auto-populate",s),()=>window.removeEventListener("scout-auto-populate",s)},[O.state,O.pathname,L]);const K=i.useRef(new Set),H=i.useCallback(async()=>{if(!f){be(!1);return}be(!0);try{const t=await q.getFirmSearchHistory(100,!0),s=[],u=new Set,l=new Set;t.forEach(o=>{o.results&&Array.isArray(o.results)&&o.results.forEach(a=>{var z;if(a.id&&Y.current.has(a.id)||a.id&&K.current.has(a.id))return;const x=a.id||`${a.name}-${(z=a.location)==null?void 0:z.display}`;a.id?u.has(a.id)||(u.add(a.id),s.push(a)):l.has(x)||(l.add(x),s.push(a))})});const h=s.filter(o=>!(o.id&&Y.current.has(o.id)));K.current.size>0&&K.current.clear(),T(h)}catch(t){console.error("Failed to load saved firms:",t),A({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{be(!1)}},[f]),fe=i.useCallback(async()=>{if(f){te(!0);try{const t=await q.getFirmSearchHistory(10);ce(t)}catch(t){console.error("Failed to load search history:",t)}finally{te(!1)}}},[f]);i.useEffect(()=>{fe(),w&&w()},[fe,w]);const ue=i.useRef(!1);i.useEffect(()=>{if($!=="firm-library"){ue.current=!1;return}f&&(ue.current||(ue.current=!0,H()))},[$,f,H]);const ie=async t=>{var o;const s=t||k;if(!s.trim()){b("Please enter a search query");return}if(!f){b("Please sign in to search for firms"),A({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}P(!0),b(null),r(!0),v(!1);const u=2+Math.ceil(j/5)*2,l=u<60?`${u} seconds`:`${Math.ceil(u/60)} minutes`;n({current:0,total:j,step:`Starting search... (est. ${l})`});let h=null;try{const{searchId:a}=await q.searchFirmsAsync(s,j);h=await q.createFirmSearchStream(a),await new Promise((x,z)=>{h.addEventListener("progress",N=>{try{const C=JSON.parse(N.data);n({current:C.current??0,total:C.total??j,step:C.step||"Searching..."})}catch{}}),h.addEventListener("complete",N=>{var C,W;Q=!0,h==null||h.close();try{const S=JSON.parse(N.data);n(null),S.success&&((C=S.firms)==null?void 0:C.length)>0?(G(S.parsedFilters),T(S.firms),v(!0),le(S.suggestions||[]),A({title:"Search Complete!",description:`Found ${S.firms.length} firm${S.firms.length!==1?"s":""}. Used ${S.creditsCharged||0} credits.`}),w&&w(),fe()):((W=S.firms)==null?void 0:W.length)===0?(le(S.suggestions||[]),b("Hmm, nothing matched that exactly. Try broadening to just the city or industry - or ask Scout."),U({searchType:"firm",failedSearchParams:{industry:s,location:"",size:""},errorType:"no_results"})):b(S.error||"Search failed. Please try again.")}catch{b("Failed to parse search results.")}x()}),h.addEventListener("error",N=>{Q=!0,h==null||h.close();try{const C=JSON.parse(N.data);b(C.message||"Search failed.")}catch{b("Search connection lost. Please try again.")}x()});let Q=!1;h.onerror=()=>{if(Q)return;Q=!0,h==null||h.close();const N=setInterval(async()=>{var C,W,S;try{const Z=await q.getFirmSearchStatus(a);((C=Z.progress)==null?void 0:C.status)==="completed"?(clearInterval(N),n(null),w&&w(),fe(),H(),v(!0),A({title:"Search Complete!",description:"Results loaded from history."}),x()):((W=Z.progress)==null?void 0:W.status)==="failed"&&(clearInterval(N),b(((S=Z.progress)==null?void 0:S.error)||"Search failed."),x())}catch{clearInterval(N),b("Search connection lost. Please check your search history for results."),x()}},2e3);setTimeout(()=>{clearInterval(N),b("Search is taking longer than expected. Check your history for results."),x()},12e4)}})}catch(a){if(console.error("Search error:",a),a.status===401||(o=a.message)!=null&&o.includes("Authentication required"))b("Authentication required. Please sign in again."),A({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(a.status===402||a.error_code==="INSUFFICIENT_CREDITS"){const x=a.creditsNeeded||a.required||j*X,z=a.currentCredits||a.available||y.credits||0;b(`Insufficient credits. You need ${x} but have ${z}.`),A({title:"Insufficient Credits",description:`Need ${x}, have ${z}.`,variant:"destructive"}),w&&await w()}else a.status===502||a.error_code==="EXTERNAL_API_ERROR"?(b(a.message||"Search service temporarily unavailable."),A({title:"Service Unavailable",description:a.message||"Try again shortly.",variant:"destructive"})):(b(a.message||"An unexpected error occurred."),A({title:"Search Failed",description:a.message||"Please try again.",variant:"destructive"}))}finally{h==null||h.close(),P(!1),n(null)}},dt=t=>{var u,l;const s=new URLSearchParams;if(s.set("company",t.name),(u=t.location)!=null&&u.display)s.set("location",t.location.display);else if((l=t.location)!=null&&l.city){const h=[t.location.city,t.location.state,t.location.country].filter(Boolean);s.set("location",h.join(", "))}L(`/find?${s.toString()}`)},oe=t=>{var s;return t.id||`${t.name}-${(s=t.location)==null?void 0:s.display}`},ht=async t=>{const s=oe(t);Be(s);try{t.id&&(Y.current.add(t.id),K.current.add(t.id)),T(l=>l.filter(o=>t.id&&o.id?o.id!==t.id:oe(o)!==s));const u=await q.deleteFirm(t);if(u.success){if(u.deletedCount===0){t.id&&(Y.current.delete(t.id),K.current.delete(t.id)),T(l=>l.some(o=>t.id&&o.id?o.id===t.id:oe(o)===s)?l:[...l,t]),A({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}A({title:"Firm deleted",description:"Removed from your Firm Library."}),$==="firm-library"&&setTimeout(async()=>{try{await H()}catch(l){console.error("Error reloading firms:",l)}},1500)}else throw t.id&&(Y.current.delete(t.id),K.current.delete(t.id)),T(l=>l.some(o=>t.id&&o.id?o.id===t.id:oe(o)===s)?l:[...l,t]),new Error(u.error||"Failed to delete firm")}catch(u){console.error("Delete firm error:",u),t.id&&(Y.current.delete(t.id),K.current.delete(t.id)),T(l=>l.some(o=>t.id&&o.id?o.id===t.id:oe(o)===s)?l:[...l,t]),A({title:"Delete failed",description:u instanceof Error?u.message:"Please try again.",variant:"destructive"})}finally{Be(null)}},pt=async()=>{const t=g.length;we(!1);try{const s=g.map(o=>q.deleteFirm(o)),l=(await Promise.allSettled(s)).filter(o=>o.status==="fulfilled"&&o.value.success&&(o.value.deletedCount||0)>0).length,h=t-l;h===0?(T([]),A({title:"All firms deleted",description:`Removed ${l} firm${l!==1?"s":""} from your Firm Library.`}),$==="firm-library"&&setTimeout(async()=>{try{await H()}catch(o){console.error("Error reloading firms:",o)}},1e3)):(A({title:"Partial deletion",description:`Deleted ${l} of ${t} firms. ${h} failed.`,variant:"default"}),$==="firm-library"&&setTimeout(async()=>{try{await H()}catch(o){console.error("Error reloading firms:",o)}},1e3))}catch(s){console.error("Error deleting all firms:",s),A({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),$==="firm-library"&&setTimeout(async()=>{try{await H()}catch(u){console.error("Error reloading firms:",u)}},1e3)}},ft=t=>{I(t.query),c(!1)},ut=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),ie())},mt=()=>{if(y.tier==="free"){ve(!0);return}if(!g||g.length===0)return;const s=["Company Name","Website","LinkedIn","Location","Industry"].join(","),u=g.map(x=>{var N,C,W,S;const z=Z=>{if(!Z)return"";const ae=String(Z);return ae.includes(",")||ae.includes('"')||ae.includes(`
`)?`"${ae.replace(/"/g,'""')}"`:ae},Q=((N=x.location)==null?void 0:N.display)||[(C=x.location)==null?void 0:C.city,(W=x.location)==null?void 0:W.state,(S=x.location)==null?void 0:S.country].filter(Boolean).join(", ");return[z(x.name),z(x.website),z(x.linkedinUrl),z(Q),z(x.industry)].join(",")}),l=[s,...u].join(`
`),h=new Blob([l],{type:"text/csv;charset=utf-8;"}),o=document.createElement("a"),a=URL.createObjectURL(h);o.setAttribute("href",a),o.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),o.style.visibility="hidden",document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a)},xt=()=>{ve(!1),L("/pricing")},V=((y==null?void 0:y.tier)==="pro"?"pro":"free")==="free"?10:15,Pe=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(At,{value:$,onValueChange:he,className:"w-full",children:[e.jsxs(He,{value:"firm-search",className:"mt-0",children:[!f&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(Me,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[e.jsx("div",{className:"firm-search-textarea-wrapper",style:{position:"relative",border:"1.5px solid var(--line, #E5E3DE)",borderRadius:14,padding:"12px 14px",background:"#FFFFFF",transition:"border-color .15s, box-shadow .15s",...se?{borderColor:"#2563EB",boxShadow:"0 0 0 4px rgba(37,99,235,0.10)"}:{}},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10},children:[e.jsx(me,{style:{width:16,height:16,flexShrink:0,color:se?"#3B82F6":"#8A8F97",marginTop:2}}),e.jsx("textarea",{ref:ot,className:"firm-search-textarea",rows:1,value:k,onChange:t=>{I(t.target.value);const s=t.currentTarget;s.style.height="auto",s.style.height=`${Math.min(s.scrollHeight,160)}px`},onKeyDown:ut,onFocus:()=>Ie(!0),onBlur:()=>Ie(!1),placeholder:ee[at],disabled:p,style:{width:"100%",border:"none",outline:"none",resize:"none",background:"transparent",fontSize:14,lineHeight:1.5,color:"var(--ink, #111418)",fontFamily:"inherit",overflow:"hidden"}})]})}),!J&&!p&&e.jsxs(e.Fragment,{children:[e.jsx("div",{style:{height:24}}),e.jsxs("div",{style:{opacity:se&&k.trim()?.4:1,transition:"opacity .15s"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12},children:[e.jsxs("div",{children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.14em",color:"#8A8F97",textTransform:"uppercase",marginBottom:4},children:pe?"Built from your profile":"Curated by Offerloop"}),e.jsx("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontSize:22,lineHeight:1.2,color:"#111418",fontWeight:400},children:pe?e.jsxs(e.Fragment,{children:["Six places to look first, ",e.jsx("em",{style:{fontStyle:"italic",color:"#4A4F57"},children:De?`${De} finance.`:"your field."})]}):e.jsxs(e.Fragment,{children:["Six strong ",e.jsx("em",{style:{fontStyle:"italic",color:"#4A4F57"},children:"starting points."})]})})]}),pe?e.jsx("a",{onClick:()=>L("/account-settings"),style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.1em",color:"#4A4F57",textDecoration:"none",whiteSpace:"nowrap",cursor:"pointer"},children:"Update preferences ↗"}):e.jsx("a",{onClick:()=>L("/onboarding"),style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.1em",color:"#4A4F57",textDecoration:"none",whiteSpace:"nowrap",cursor:"pointer"},children:"Tell us about yourself ↗"})]}),!pe&&e.jsx("div",{style:{background:"#FAFAF8",border:"1px solid #EFEDE8",borderRadius:8,padding:"10px 14px",marginBottom:14,fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:13,color:"#4A4F57"},children:"Add your school and target industries to get prompts shaped around you."}),e.jsx("div",{style:{display:"grid",gridTemplateColumns:"repeat(2, 1fr)",gap:10,marginBottom:40},className:"max-sm:!grid-cols-1",children:lt.map(t=>e.jsx(Mt,{item:{prompt:t.prompt,hint:t.hint},onSelect:s=>{I(s),ie(s)}},t.id))})]}),B.length>0&&e.jsxs("div",{children:[e.jsxs("button",{onClick:()=>c(!E),style:{background:"none",border:"none",padding:0,cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,fontFamily:"'JetBrains Mono', monospace",fontSize:11,letterSpacing:"0.04em",color:"#8A8F97"},children:[e.jsx(Oe,{style:{width:12,height:12}}),B.length," recent ",B.length===1?"search":"searches",e.jsx(Ue,{style:{width:11,height:11,transition:"transform .15s ease",transform:E?"rotate(90deg)":"rotate(0deg)"}})]}),E&&e.jsx("div",{style:{marginTop:8},children:B.slice(0,5).map(t=>e.jsxs("div",{onClick:()=>{I(t.query),ie(t.query)},style:{display:"flex",alignItems:"baseline",justifyContent:"space-between",padding:"7px 0",borderTop:"1px solid #EFEDE8",cursor:"pointer"},children:[e.jsxs("div",{style:{fontSize:12,color:"#4A4F57"},children:[e.jsx(me,{style:{width:11,height:11,display:"inline",verticalAlign:"middle",color:"#8A8F97",marginRight:5}}),t.query]}),e.jsxs("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,color:"#8A8F97",whiteSpace:"nowrap",marginLeft:12},children:[t.resultsCount," ",t.resultsCount===1?"result":"results"]})]},t.id))})]})]}),e.jsxs("div",{style:{marginBottom:12},children:[e.jsx("div",{style:{fontFamily:"'JetBrains Mono', monospace",fontSize:10,letterSpacing:"0.12em",color:"#8A8F97",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsxs("div",{style:{display:"flex",alignItems:"center",gap:12},children:[e.jsx("span",{style:{fontSize:11,color:"#8A8F97",minWidth:12},children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",style:{flex:1,position:"relative",height:4,background:"#E5E3DE",borderRadius:2},children:[e.jsx("div",{style:{position:"absolute",left:0,top:0,height:4,width:V>5?`${(j-5)/(V-5)*100}%`:"0%",background:"var(--accent, #1B2A44)",borderRadius:2}}),e.jsx("input",{type:"range",min:5,max:V,step:1,value:j,onChange:t=>it(Math.min(Number(t.target.value),V)),disabled:p,className:"slider-custom","aria-label":"Number of companies to find",style:{position:"absolute",inset:0,width:"100%",height:"100%",opacity:0,cursor:"pointer",margin:0}}),e.jsx("div",{style:{position:"absolute",left:`calc(${V>5?(j-5)/(V-5)*100:0}% - 7px)`,top:-5,width:14,height:14,borderRadius:"50%",background:"var(--accent, #1B2A44)",boxShadow:"0 1px 4px rgba(27,42,68,0.4)",pointerEvents:"none"}})]}),e.jsx("span",{style:{fontSize:11,color:"#8A8F97",minWidth:16,textAlign:"right"},children:V})]}),e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:9},children:[e.jsxs("div",{style:{fontFamily:"var(--serif, 'Instrument Serif', Georgia, serif)",fontStyle:"italic",fontSize:13.5,color:"#111418"},children:["Find ",j," companies"]}),e.jsxs("div",{style:{display:"inline-flex",alignItems:"center",gap:6,fontSize:11,color:"#4A4F57"},children:[e.jsxs("span",{style:{display:"inline-flex",padding:"3px 8px",background:"#FAFAF8",border:"1px solid #E5E3DE",borderRadius:4,fontFamily:"'JetBrains Mono', monospace",fontSize:10,color:"#111418"},children:[j*X," credits"]}),e.jsxs("span",{style:{color:"#8A8F97"},children:["of ",y.credits??0]})]})]}),y.credits!==void 0&&y.credits<j*X&&e.jsxs("p",{style:{fontSize:11,color:"#D97706",marginTop:6,display:"flex",alignItems:"center",gap:4},children:[e.jsx(Me,{style:{width:12,height:12}}),"Insufficient credits. Need ",j*X,", have ",y.credits,"."]})]}),e.jsx("button",{ref:re,onClick:()=>ie(),disabled:!_||p||!f||(y.credits??0)<j*X||(y.credits??0)===0,style:{width:"100%",height:52,borderRadius:12,background:p?"var(--warm-border, #E8E4DE)":!k.trim()||!_||!f?"transparent":"var(--ink, #1A1D23)",color:p?"var(--warm-ink-tertiary, #9C9590)":!k.trim()||!_||!f?"#6B6560":"var(--paper, #FFFFFF)",border:(!k.trim()||!_||!f)&&!p?"1.5px solid #D5D0C9":"1.5px solid transparent",fontSize:15,fontWeight:600,cursor:p?"not-allowed":k.trim()&&_?"pointer":"default",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s ease",fontFamily:"inherit",marginBottom:J?0:8},children:p?e.jsxs(e.Fragment,{children:[e.jsx(xe,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(me,{style:{width:14,height:14}}),e.jsxs("span",{children:["Find ",j," companies"]})]})}),k&&!_&&!J&&e.jsx("p",{style:{fontSize:11,color:"#8A8F97",marginTop:6,textAlign:"center"},children:"Include an industry and location for best results"}),J&&e.jsx("button",{type:"button",onClick:()=>{I(""),r(!1),b(null)},style:{fontSize:12,color:"#8A8F97",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",padding:"12px 0 0",transition:"color .12s"},onMouseEnter:t=>{t.currentTarget.style.color="var(--accent, #1B2A44)"},onMouseLeave:t=>{t.currentTarget.style.color="#8A8F97"},children:"← Back to recommendations"})]})]}),e.jsx(He,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[g.length," ",g.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(Fe,{onClick:()=>{ue.current=!1,H()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:ye,children:[ye?e.jsx(xe,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),g.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(Fe,{onClick:()=>we(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx(Ze,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(Fe,{onClick:mt,className:`gap-2 ${y.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:y.tier==="free",title:y.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(wt,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),ye?e.jsx(Nt,{variant:"card",count:3}):g.length>0?e.jsx(Pt,{firms:g,onViewContacts:dt,onDelete:ht,deletingId:et}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx($e,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>he("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),E&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>c(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(vt,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:de?e.jsx("div",{className:"py-8 text-center",children:e.jsx(xe,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):B.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(Oe,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):B.map(t=>e.jsxs("div",{onClick:()=>ft(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:s=>{s.currentTarget.style.background="#EEF2F8"},onMouseLeave:s=>{s.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(Ue,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),p&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx($e,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(d==null?void 0:d.step)||`Finding ${j} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:d?`${Math.max(2,Math.min(98,d.current/d.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:d?`${d.current} of ${d.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:d?`${Math.round(d.current/d.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),m&&g.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(jt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",g.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{v(!1),he("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{v(!1),I(""),r(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(We,{open:tt,onOpenChange:we,children:e.jsxs(_e,{children:[e.jsxs(Ke,{children:[e.jsx(Ve,{children:"Delete All Companies?"}),e.jsxs(qe,{children:["This will permanently remove all ",g.length," ",g.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(Ge,{children:[e.jsx(Je,{children:"Cancel"}),e.jsx(Ye,{onClick:pt,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(We,{open:rt,onOpenChange:ve,children:e.jsxs(_e,{children:[e.jsxs(Ke,{children:[e.jsx(Ve,{children:"Upgrade to Export CSV"}),e.jsx(qe,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(Ge,{children:[e.jsx(Je,{children:"Cancel"}),e.jsx(Ye,{onClick:xt,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. PAGE CONTAINER - Prevent horizontal overflow */
          .firm-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-container {
            max-width: 100%;
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          /* 2. HEADER - Reduce font size, ensure wrapping */
          .firm-search-title {
            font-size: 1.75rem !important;
            line-height: 1.3;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding-left: 0;
            padding-right: 0;
          }

          /* 3. SUBTITLE TEXT - Reduce font size */
          .firm-search-subtitle {
            font-size: 0.875rem !important;
            line-height: 1.4;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 4. TAB BAR - Horizontal scroll or fit within viewport */
          .firm-search-tabs {
            width: 100% !important;
            max-width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .firm-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .firm-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARD - Full width, proper padding */
          .firm-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. SECTION HEADING + HISTORY BUTTON ROW - Stack if needed */
          .firm-search-header-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .firm-search-header-content {
            width: 100%;
          }

          .firm-search-form-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-form-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-history-btn {
            width: 100%;
            justify-content: center;
            min-height: 44px;
          }

          /* 7. EXAMPLE CHIPS - Wrap to multiple lines */
          .firm-search-examples {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-example-chips {
            flex-wrap: wrap !important;
            gap: 8px;
            max-width: 100%;
          }

          .firm-search-example-chips button {
            flex-shrink: 0;
            max-width: 100%;
            word-wrap: break-word;
            white-space: normal;
            padding: 8px 12px;
            font-size: 0.875rem;
          }

          /* 8. TEXTAREA - Full width, proper padding */
          .firm-search-textarea-wrapper {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-textarea {
            width: 100% !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 12px !important;
            padding-right: 48px !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 9. HOW MANY COMPANIES SECTION - Ensure wrapping */
          .firm-search-quantity-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-quantity-title {
            font-size: 1.125rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            line-height: 1.3;
          }

          .firm-search-quantity-subtitle {
            font-size: 0.875rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          .firm-search-quantity-card {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 10. NUMBER SELECTOR BUTTONS - Ensure all 4 fit or allow scroll */
          .firm-search-quantity-buttons {
            flex-wrap: wrap;
            gap: 8px;
            justify-content: flex-start;
          }

          .firm-search-quantity-btn {
            min-width: 60px;
            min-height: 44px !important;
            flex: 1 1 calc(25% - 6px);
            max-width: calc(25% - 6px);
            padding: 12px 8px !important;
            font-size: 0.875rem;
          }

          /* 11. COMPANY ICON VISUALIZATION ROW - Constrain to viewport */
          .firm-search-company-icons {
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            max-width: 100%;
            flex-wrap: nowrap;
            padding-bottom: 4px;
          }

          .firm-search-company-icons::-webkit-scrollbar {
            display: none;
          }

          .firm-search-company-icons > div {
            flex-shrink: 0;
          }

          /* 12. WHAT YOU'LL GET SECTION - Stack in 2x2 grid or single column */
          .firm-search-features-section {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-features-title {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
            padding: 0 8px;
          }

          .firm-search-features-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 12px !important;
          }

          .firm-search-features-grid > div {
            padding: 12px !important;
            box-sizing: border-box;
          }

          .firm-search-features-grid > div > div {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-features-grid p {
            font-size: 0.75rem !important;
            word-wrap: break-word;
            overflow-wrap: break-word;
          }

          /* 13. FIND COMPANIES CTA BUTTON - Full width */
          .firm-search-cta {
            width: 100%;
            max-width: 100%;
          }

          .firm-search-find-btn {
            width: 100% !important;
            min-height: 48px !important;
            max-width: 100%;
            box-sizing: border-box;
            padding: 14px 16px !important;
          }

          /* GENERAL - Ensure all containers respect max-width */
          .firm-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .firm-search-page input,
          .firm-search-page textarea,
          .firm-search-page select,
          .firm-search-page button {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .firm-search-page p,
          .firm-search-page h1,
          .firm-search-page h2,
          .firm-search-page h3,
          .firm-search-page span,
          .firm-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }

          /* Ensure content doesn't touch screen edge */
          .firm-search-container > * {
            padding-left: 0;
            padding-right: 0;
          }

          /* Additional overflow fixes */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .firm-search-page {
            overflow-x: hidden;
          }

          .firm-search-header {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      `}),$==="firm-search"&&e.jsx(Bt,{originalButtonRef:re,onClick:()=>ie(),isLoading:p,disabled:!_||p||!f||(y.credits??0)<j*X,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return F?Pe:e.jsx(St,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(Ft,{}),e.jsxs(Tt,{children:[e.jsx(kt,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Rt,{videoId:"n_AYHEJSXrE"})})]}),Pe]})]})]})})};export{er as default};
