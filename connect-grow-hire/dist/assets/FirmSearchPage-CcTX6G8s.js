import{r as o,j as e,z as Oe,b4 as tt,L as ue,l as $e,u as rt,f as st,am as we,aS as je,at as it,X as at,bb as nt,a2 as ot,aw as lt}from"./vendor-react-BiYf6JDv.js";import{f as ct,A as dt,g as ht}from"./AppHeader-Cwbv8qyE.js";import{T as ft,c as Be}from"./tabs-CvrTYjf_.js";import{u as ut,l as pt,d as K,t as S,B as ve,L as mt}from"./index-BjLOHFG-.js";import{V as xt}from"./VideoDemo-CpwXoeys.js";import{A as Te,a as Re,b as ze,c as Ie,d as Le,e as De,f as Me,g as Pe}from"./alert-dialog-D47V-nG6.js";import{M as gt}from"./MainContentWrapper-nT68_RNW.js";import{S as yt}from"./StickyCTA-GOc0RXvc.js";const L="'IBM Plex Mono', monospace",Se=[{key:"name",letter:"A",label:"Company",width:"22%"},{key:"website",letter:"B",label:"Website",width:"10%"},{key:"linkedin",letter:"C",label:"LinkedIn",width:"10%"},{key:"location",letter:"D",label:"Location",width:"22%"},{key:"industry",letter:"E",label:"Industry",width:"20%"}],Fe=40,ke=32;function bt({firms:R,onViewContacts:V,onDelete:U,deletingId:M}){const[x,F]=o.useState("name"),[Y,p]=o.useState("desc"),[w,P]=o.useState(""),[k,se]=o.useState(R),[j,G]=o.useState(new Set),[h,C]=o.useState(null),le=o.useRef(null);o.useEffect(()=>{if(!w.trim()){se(R);return}const r=R.filter(f=>{var m,A,I,l,O;const n=w.toLowerCase();return((m=f.name)==null?void 0:m.toLowerCase().includes(n))||((A=f.industry)==null?void 0:A.toLowerCase().includes(n))||((l=(I=f.location)==null?void 0:I.display)==null?void 0:l.toLowerCase().includes(n))||((O=f.website)==null?void 0:O.toLowerCase().includes(n))});se(r)},[w,R]);const Q=[...k].sort((r,f)=>{var A,I,l,O,z,W,X,J;let n,m;switch(x){case"name":n=((A=r.name)==null?void 0:A.toLowerCase())||"",m=((I=f.name)==null?void 0:I.toLowerCase())||"";break;case"location":n=((O=(l=r.location)==null?void 0:l.display)==null?void 0:O.toLowerCase())||"",m=((W=(z=f.location)==null?void 0:z.display)==null?void 0:W.toLowerCase())||"";break;case"industry":n=((X=r.industry)==null?void 0:X.toLowerCase())||"",m=((J=f.industry)==null?void 0:J.toLowerCase())||"";break;default:return 0}return n<m?Y==="asc"?-1:1:n>m?Y==="asc"?1:-1:0}),ce=r=>{x===r?p(Y==="asc"?"desc":"asc"):(F(r),p("desc"))},y=r=>{var f;return r.id||`${r.name}-${(f=r.location)==null?void 0:f.display}`},Ne=()=>{j.size===k.length?G(new Set):G(new Set(k.map(r=>y(r))))},de=r=>{G(f=>{const n=new Set(f);return n.has(r)?n.delete(r):n.add(r),n})},N=()=>{if(!h)return"A1";const r=Se.find(m=>m.key===h.col),f=(r==null?void 0:r.letter)||"A",n=Q.findIndex(m=>y(m)===h.firmKey);return`${f}${n>=0?n+1:1}`},_=()=>{var f;if(!h)return"";const r=Q.find(n=>y(n)===h.firmKey);if(!r)return"";switch(h.col){case"name":return r.name||"";case"website":return r.website||"";case"linkedin":return r.linkedinUrl||"";case"location":return((f=r.location)==null?void 0:f.display)||"";case"industry":return r.industry||"";default:return""}},pe={name:"name",location:"location",industry:"industry"};return e.jsxs("div",{className:"firm-search-results-page",style:{fontFamily:L,display:"flex",flexDirection:"column",height:"100%",overflow:"hidden",background:"#fff"},onClick:r=>{le.current&&!le.current.contains(r.target)&&C(null)},children:[e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:"#ffffff",borderBottom:"1px solid #e5e5e3"},children:[e.jsxs("div",{className:"relative firm-search-input-wrap",style:{flex:"0 0 220px"},children:[e.jsx(Oe,{className:"absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3",style:{color:"#bbb"}}),e.jsx("input",{type:"text",placeholder:"Search...",value:w,onChange:r=>P(r.target.value),style:{fontFamily:L,fontSize:12,color:"#2a2a2a",background:"#fff",border:"1px solid #e5e5e3",outline:"none",padding:"4px 6px 4px 24px",width:"100%"}})]}),e.jsx("div",{style:{flex:1}}),e.jsxs("span",{style:{fontSize:11,color:"#999"},children:[k.length," firm",k.length!==1?"s":"",w&&` of ${R.length}`]})]}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"center",height:26,borderBottom:"1px solid #e5e5e3",background:"#fff"},children:[e.jsx("div",{style:{width:60,height:"100%",display:"flex",alignItems:"center",justifyContent:"center",background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:11,fontWeight:500,letterSpacing:"0.08em",color:"#2a2a2a",fontFamily:L},children:N()}),e.jsx("div",{style:{padding:"0 10px",borderRight:"1px solid #e5e5e3",fontSize:11,color:"#bbb",fontStyle:"italic",fontFamily:L,display:"flex",alignItems:"center",height:"100%"},children:"fx"}),e.jsx("div",{style:{flex:1,padding:"0 10px",fontSize:12,color:"#2a2a2a",fontFamily:L,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",height:"100%"},children:_()})]}),e.jsx("div",{ref:le,style:{flex:1,overflow:"auto"},children:k.length===0&&R.length>0&&w?e.jsxs("div",{style:{padding:"40px 24px",textAlign:"center",fontFamily:L},children:[e.jsx("p",{style:{color:"#999",fontSize:12,marginBottom:8},children:"No firms match your search."}),e.jsx("button",{onClick:()=>P(""),style:{fontSize:11,color:"#555",background:"none",border:"none",textDecoration:"underline",cursor:"pointer",fontFamily:L},children:"Clear search"})]}):k.length>0&&e.jsx("div",{className:"firm-table-wrapper",style:{overflowX:"auto",WebkitOverflowScrolling:"touch"},children:e.jsxs("table",{className:"firm-table",style:{width:"100%",minWidth:900,borderCollapse:"collapse",fontFamily:L},children:[e.jsxs("thead",{children:[e.jsxs("tr",{style:{borderBottom:"1px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",padding:0}}),Se.map(r=>{const f=(h==null?void 0:h.col)===r.key;return e.jsx("th",{style:{fontSize:10,color:f?"#2a2a2a":"#999",fontWeight:f?500:400,background:f?"#f0f0ee":"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"3px 0",width:r.width},children:r.letter},r.letter)}),e.jsx("th",{style:{background:"#ffffff",padding:0,width:100}})]}),e.jsxs("tr",{style:{borderBottom:"2px solid #e5e5e3"},children:[e.jsx("th",{style:{width:Fe,background:"#ffffff",borderRight:"1px solid #e5e5e3",fontSize:10,color:"#999",textAlign:"center",padding:"11px 0",position:"sticky",top:0,zIndex:10},children:"#"}),e.jsx("th",{style:{width:ke,background:"#ffffff",borderRight:"1px solid #e5e5e3",textAlign:"center",padding:"11px 4px",position:"sticky",top:0,zIndex:10},children:e.jsx("input",{type:"checkbox",checked:k.length>0&&j.size===k.length,onChange:Ne,style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),Se.map(r=>{const f=(h==null?void 0:h.col)===r.key,n=pe[r.key];return e.jsxs("th",{onClick:n?()=>ce(n):void 0,style:{padding:"11px 12px",textAlign:"left",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",background:f?"#f0f0ee":"#ffffff",whiteSpace:"nowrap",width:r.width,cursor:n?"pointer":"default",position:"sticky",top:0,zIndex:10},children:[r.label,n&&x===n&&(Y==="asc"?" ↑":" ↓")]},r.key)}),e.jsx("th",{style:{background:"#ffffff",padding:"11px 12px",textAlign:"right",fontSize:10,fontWeight:400,textTransform:"uppercase",letterSpacing:"0.1em",color:"#999",width:100,position:"sticky",top:0,zIndex:10}})]})]}),e.jsx("tbody",{children:Q.map((r,f)=>{var I;const n=y(r),m=j.has(n),A=l=>({padding:"0 12px",whiteSpace:"nowrap",position:"relative",...(h==null?void 0:h.firmKey)===n&&(h==null?void 0:h.col)===l?{outline:"2px solid #2a2a2a",outlineOffset:-2,background:"#fff",zIndex:1}:{}});return e.jsxs("tr",{style:{height:28,borderBottom:"1px solid #f0f0ee",background:m?"#f0f0ee":"white",transition:"background 0.08s"},onMouseEnter:l=>{m||(l.currentTarget.style.background="#f5f5f3")},onMouseLeave:l=>{l.currentTarget.style.background=m?"#f0f0ee":"white"},children:[e.jsx("td",{style:{width:Fe,textAlign:"center",fontSize:10,color:m?"#fff":"#999",background:m?"#555":"#ffffff",borderRight:"1px solid #e5e5e3",padding:"0 4px"},onMouseEnter:l=>{m||(l.currentTarget.style.background="#f0f0ee",l.currentTarget.style.color="#555")},onMouseLeave:l=>{m||(l.currentTarget.style.background="#ffffff",l.currentTarget.style.color="#999")},children:f+1}),e.jsx("td",{style:{width:ke,textAlign:"center",borderRight:"1px solid #e5e5e3",padding:"0 4px"},children:e.jsx("input",{type:"checkbox",checked:m,onChange:()=>de(n),style:{width:13,height:13,accentColor:"#444",cursor:"pointer"}})}),e.jsx("td",{onClick:()=>C({firmKey:n,col:"name"}),style:A("name"),children:e.jsx("span",{style:{fontSize:12,fontWeight:500,color:"#2a2a2a"},children:r.name||"—"})}),e.jsx("td",{onClick:()=>C({firmKey:n,col:"website"}),style:A("website"),children:r.website?e.jsx("a",{href:r.website,target:"_blank",rel:"noopener noreferrer",onClick:l=>l.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:l=>{l.currentTarget.style.color="#2a2a2a"},onMouseLeave:l=>{l.currentTarget.style.color="#555"},children:"↗ site"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>C({firmKey:n,col:"linkedin"}),style:A("linkedin"),children:r.linkedinUrl?e.jsx("a",{href:r.linkedinUrl.startsWith("http")?r.linkedinUrl:`https://${r.linkedinUrl}`,target:"_blank",rel:"noopener noreferrer",onClick:l=>l.stopPropagation(),style:{fontSize:11,color:"#555",textDecoration:"none",borderBottom:"1px solid #e5e5e3",paddingBottom:1},onMouseEnter:l=>{l.currentTarget.style.color="#2a2a2a"},onMouseLeave:l=>{l.currentTarget.style.color="#555"},children:"↗ view"}):e.jsx("span",{style:{color:"#bbb"},children:"—"})}),e.jsx("td",{onClick:()=>C({firmKey:n,col:"location"}),style:A("location"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:((I=r.location)==null?void 0:I.display)||"—"})}),e.jsx("td",{onClick:()=>C({firmKey:n,col:"industry"}),style:A("industry"),children:e.jsx("span",{style:{fontSize:12,color:"#555"},children:r.industry||"—"})}),e.jsx("td",{style:{padding:"0 8px",whiteSpace:"nowrap",textAlign:"right",width:100},children:e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"flex-end",gap:4},children:[e.jsxs("button",{onClick:()=>V(r),style:{fontFamily:L,fontSize:10,textTransform:"uppercase",letterSpacing:"0.04em",border:"1px solid #e5e5e3",background:"#fff",color:"#555",padding:"3px 8px",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:3},onMouseEnter:l=>{l.currentTarget.style.color="#2a2a2a"},onMouseLeave:l=>{l.currentTarget.style.color="#555"},children:[e.jsx(tt,{className:"h-3 w-3"})," View"]}),U&&e.jsx("button",{onClick:()=>U(r),disabled:M===n,style:{background:"none",border:"none",color:"#bbb",cursor:M===n?"wait":"pointer",padding:3},onMouseEnter:l=>{l.currentTarget.style.color="#c00"},onMouseLeave:l=>{l.currentTarget.style.color="#bbb"},children:M===n?e.jsx(ue,{className:"h-3 w-3 animate-spin"}):e.jsx($e,{className:"h-3 w-3"})})]})})]},n)})})]})})}),e.jsxs("div",{style:{flexShrink:0,display:"flex",alignItems:"stretch",height:30,background:"#ffffff",borderTop:"1px solid #e5e5e3",fontFamily:L},children:[e.jsx("div",{style:{flex:1}}),e.jsxs("div",{style:{display:"flex",alignItems:"center",padding:"0 12px",fontSize:10,color:"#bbb",whiteSpace:"nowrap"},children:[Q.length," rows · offerloop.ai"]})]}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          .firm-search-results-page { width: 100%; max-width: 100vw; box-sizing: border-box; }
          .firm-search-input-wrap { flex: 1 1 100% !important; }
          .firm-table-wrapper { overflow-x: auto; -webkit-overflow-scrolling: touch; }
          .firm-table { min-width: 800px; }
        }
      `})]})}const wt=[{id:1,label:"Tech startups in SF",query:"Early-stage tech startups in San Francisco focused on AI/ML"},{id:2,label:"Healthcare M&A banks",query:"Mid-sized investment banks in New York focused on healthcare M&A"},{id:3,label:"Consulting in Chicago",query:"Management consulting firms in Chicago with 100-500 employees"},{id:4,label:"Fintech in London",query:"Series B+ fintech companies in London focused on payments"}],Ce="scout_auto_populate",jt=R=>R<=5?"Perfect for focused targeting":R<=10?"Great for exploring an industry":"Maximum discovery — cast a wide net",Tt=({embedded:R=!1,initialTab:V})=>{const U=rt(),M=st(),{user:x,checkCredits:F}=ut(),{openPanelWithSearchHelp:Y}=pt(),p=x||{credits:0,tier:"free"},[w,P]=o.useState(""),[k,se]=o.useState(null),[j,G]=o.useState(!1),[h,C]=o.useState([]),[le,Q]=o.useState(null),[ce,y]=o.useState(null),[Ne,de]=o.useState(!1),[N,_]=o.useState(null),[pe,r]=o.useState(!1),[f,n]=o.useState(!1),[m,A]=o.useState([]),[I,l]=o.useState(!1),O=o.useRef(null),[z,W]=o.useState(V||"firm-search");o.useEffect(()=>{V&&W(V)},[V]);const[X,J]=o.useState(!1),[He,Ee]=o.useState(null),[Ue,me]=o.useState(!1),[_e,xe]=o.useState(!1),We=o.useRef([]),Z=o.useRef(new Set),[b,qe]=o.useState(10),[D]=o.useState(5),[ie,ge]=o.useState(null),ye=o.useRef(null),Ke=/\b(in\s+\w+|located|based in|remote|nationwide|global|worldwide)\b/i.test(w),ee=w.length>20&&Ke;o.useEffect(()=>{F&&x&&F()},[b,F,x]),o.useEffect(()=>{We.current=h},[h]),o.useEffect(()=>{const t=u=>{const{industry:c,location:d,size:s}=u;let a="";c&&(a+=c),d&&(a+=(a?" in ":"")+d),s&&(a+=(a?", ":"")+s),a&&(P(a),S({title:"Search pre-filled",description:"Scout has filled in your search fields. Click Search to find firms."}))},i=()=>{var u;try{const c=(u=M.state)==null?void 0:u.scoutAutoPopulate;if((c==null?void 0:c.search_type)==="firm"){t(c),sessionStorage.removeItem(Ce),U(M.pathname,{replace:!0,state:{}});return}const d=sessionStorage.getItem(Ce);if(d){const s=JSON.parse(d);let a;s.search_type==="firm"&&(s.auto_populate?a=s.auto_populate:a=s,t(a),sessionStorage.removeItem(Ce))}}catch(c){console.error("[Scout] Auto-populate error:",c)}};return i(),window.addEventListener("scout-auto-populate",i),()=>window.removeEventListener("scout-auto-populate",i)},[M.state,M.pathname,U]);const q=o.useRef(new Set),$=o.useCallback(async()=>{if(!x){J(!1);return}J(!0);try{const t=await K.getFirmSearchHistory(100,!0),i=[],u=new Set,c=new Set;t.forEach(s=>{s.results&&Array.isArray(s.results)&&s.results.forEach(a=>{var T;if(a.id&&Z.current.has(a.id)||a.id&&q.current.has(a.id))return;const g=a.id||`${a.name}-${(T=a.location)==null?void 0:T.display}`;a.id?u.has(a.id)||(u.add(a.id),i.push(a)):c.has(g)||(c.add(g),i.push(a))})});const d=i.filter(s=>!(s.id&&Z.current.has(s.id)));q.current.size>0&&q.current.clear(),C(d)}catch(t){console.error("Failed to load saved firms:",t),S({title:"Failed to load firms",description:t instanceof Error?t.message:"Please check your connection and try refreshing.",variant:"destructive"})}finally{J(!1)}},[x]),he=o.useCallback(async()=>{if(x){l(!0);try{const t=await K.getFirmSearchHistory(10);A(t)}catch(t){console.error("Failed to load search history:",t)}finally{l(!1)}}},[x]);o.useEffect(()=>{he(),F&&F()},[he,F]);const fe=o.useRef(!1);o.useEffect(()=>{if(z!=="firm-library"){fe.current=!1;return}x&&(fe.current||(fe.current=!0,$()))},[z,x,$]);const be=async t=>{var s;const i=w;if(!i.trim()){y("Please enter a search query");return}if(!x){y("Please sign in to search for firms"),S({title:"Authentication Required",description:"Please sign in to use Firm Search.",variant:"destructive"});return}G(!0),y(null),de(!0),r(!1);const u=2+Math.ceil(b/5)*2,c=u<60?`${u} seconds`:`${Math.ceil(u/60)} minutes`;_({current:0,total:b,step:`Starting search... (est. ${c})`});let d=null;try{const{searchId:a}=await K.searchFirmsAsync(i,b);d=await K.createFirmSearchStream(a),await new Promise((g,T)=>{d.addEventListener("progress",B=>{try{const E=JSON.parse(B.data);_({current:E.current??0,total:E.total??b,step:E.step||"Searching..."})}catch{}}),d.addEventListener("complete",B=>{var E,H;te=!0,d==null||d.close();try{const v=JSON.parse(B.data);_(null),v.success&&((E=v.firms)==null?void 0:E.length)>0?(Q(v.parsedFilters),C(v.firms),r(!0),S({title:"Search Complete!",description:`Found ${v.firms.length} firm${v.firms.length!==1?"s":""}. Used ${v.creditsCharged||0} credits.`}),F&&F(),he()):((H=v.firms)==null?void 0:H.length)===0?(y("No firms found matching your criteria. Try broadening your search."),Y({searchType:"firm",failedSearchParams:{industry:i,location:"",size:""},errorType:"no_results"})):y(v.error||"Search failed. Please try again.")}catch{y("Failed to parse search results.")}g()}),d.addEventListener("error",B=>{te=!0,d==null||d.close();try{const E=JSON.parse(B.data);y(E.message||"Search failed.")}catch{y("Search connection lost. Please try again.")}g()});let te=!1;d.onerror=()=>{if(te)return;te=!0,d==null||d.close();const B=setInterval(async()=>{var E,H,v;try{const re=await K.getFirmSearchStatus(a);((E=re.progress)==null?void 0:E.status)==="completed"?(clearInterval(B),_(null),F&&F(),he(),$(),r(!0),S({title:"Search Complete!",description:"Results loaded from history."}),g()):((H=re.progress)==null?void 0:H.status)==="failed"&&(clearInterval(B),y(((v=re.progress)==null?void 0:v.error)||"Search failed."),g())}catch{clearInterval(B),y("Search connection lost. Please check your search history for results."),g()}},2e3);setTimeout(()=>{clearInterval(B),y("Search is taking longer than expected. Check your history for results."),g()},12e4)}})}catch(a){if(console.error("Search error:",a),a.status===401||(s=a.message)!=null&&s.includes("Authentication required"))y("Authentication required. Please sign in again."),S({title:"Authentication Required",description:"Your session may have expired.",variant:"destructive"});else if(a.status===402||a.error_code==="INSUFFICIENT_CREDITS"){const g=a.creditsNeeded||a.required||b*D,T=a.currentCredits||a.available||p.credits||0;y(`Insufficient credits. You need ${g} but have ${T}.`),S({title:"Insufficient Credits",description:`Need ${g}, have ${T}.`,variant:"destructive"}),F&&await F()}else a.status===502||a.error_code==="EXTERNAL_API_ERROR"?(y(a.message||"Search service temporarily unavailable."),S({title:"Service Unavailable",description:a.message||"Try again shortly.",variant:"destructive"})):(y(a.message||"An unexpected error occurred."),S({title:"Search Failed",description:a.message||"Please try again.",variant:"destructive"}))}finally{d==null||d.close(),G(!1),_(null)}},Ve=t=>{var u,c;const i=new URLSearchParams;if(i.set("company",t.name),(u=t.location)!=null&&u.display)i.set("location",t.location.display);else if((c=t.location)!=null&&c.city){const d=[t.location.city,t.location.state,t.location.country].filter(Boolean);i.set("location",d.join(", "))}U(`/find?${i.toString()}`)},ae=t=>{var i;return t.id||`${t.name}-${(i=t.location)==null?void 0:i.display}`},Ye=async t=>{const i=ae(t);Ee(i);try{t.id&&(Z.current.add(t.id),q.current.add(t.id)),C(c=>c.filter(s=>t.id&&s.id?s.id!==t.id:ae(s)!==i));const u=await K.deleteFirm(t);if(u.success){if(u.deletedCount===0){t.id&&(Z.current.delete(t.id),q.current.delete(t.id)),C(c=>c.some(s=>t.id&&s.id?s.id===t.id:ae(s)===i)?c:[...c,t]),S({title:"Delete failed",description:"Firm not found in database. It may have already been deleted.",variant:"destructive"});return}S({title:"Firm deleted",description:"Removed from your Firm Library."}),z==="firm-library"&&setTimeout(async()=>{try{await $()}catch(c){console.error("Error reloading firms:",c)}},1500)}else throw t.id&&(Z.current.delete(t.id),q.current.delete(t.id)),C(c=>c.some(s=>t.id&&s.id?s.id===t.id:ae(s)===i)?c:[...c,t]),new Error(u.error||"Failed to delete firm")}catch(u){console.error("Delete firm error:",u),t.id&&(Z.current.delete(t.id),q.current.delete(t.id)),C(c=>c.some(s=>t.id&&s.id?s.id===t.id:ae(s)===i)?c:[...c,t]),S({title:"Delete failed",description:u instanceof Error?u.message:"Please try again.",variant:"destructive"})}finally{Ee(null)}},Ge=async()=>{const t=h.length;me(!1);try{const i=h.map(s=>K.deleteFirm(s)),c=(await Promise.allSettled(i)).filter(s=>s.status==="fulfilled"&&s.value.success&&(s.value.deletedCount||0)>0).length,d=t-c;d===0?(C([]),S({title:"All firms deleted",description:`Removed ${c} firm${c!==1?"s":""} from your Firm Library.`}),z==="firm-library"&&setTimeout(async()=>{try{await $()}catch(s){console.error("Error reloading firms:",s)}},1e3)):(S({title:"Partial deletion",description:`Deleted ${c} of ${t} firms. ${d} failed.`,variant:"default"}),z==="firm-library"&&setTimeout(async()=>{try{await $()}catch(s){console.error("Error reloading firms:",s)}},1e3))}catch(i){console.error("Error deleting all firms:",i),S({title:"Delete error",description:"An error occurred while deleting firms.",variant:"destructive"}),z==="firm-library"&&setTimeout(async()=>{try{await $()}catch(u){console.error("Error reloading firms:",u)}},1e3)}},Qe=t=>{P(t.query),n(!1)},Xe=(t,i)=>{P(t),ge(i),ye.current&&(ye.current.focus(),setTimeout(()=>{ge(null)},150))},Je=t=>{t.key==="Enter"&&!t.shiftKey&&(t.preventDefault(),be())},Ze=()=>{if(p.tier==="free"){xe(!0);return}if(!h||h.length===0)return;const i=["Company Name","Website","LinkedIn","Location","Industry"].join(","),u=h.map(g=>{var B,E,H,v;const T=re=>{if(!re)return"";const oe=String(re);return oe.includes(",")||oe.includes('"')||oe.includes(`
`)?`"${oe.replace(/"/g,'""')}"`:oe},te=((B=g.location)==null?void 0:B.display)||[(E=g.location)==null?void 0:E.city,(H=g.location)==null?void 0:H.state,(v=g.location)==null?void 0:v.country].filter(Boolean).join(", ");return[T(g.name),T(g.website),T(g.linkedinUrl),T(te),T(g.industry)].join(",")}),c=[i,...u].join(`
`),d=new Blob([c],{type:"text/csv;charset=utf-8;"}),s=document.createElement("a"),a=URL.createObjectURL(d);s.setAttribute("href",a),s.setAttribute("download",`firms_${new Date().toISOString().split("T")[0]}.csv`),s.style.visibility="hidden",document.body.appendChild(s),s.click(),document.body.removeChild(s),URL.revokeObjectURL(a)},et=()=>{xe(!1),U("/pricing")},ne=((p==null?void 0:p.tier)==="pro"?"pro":"free")==="free"?10:15,Ae=e.jsxs(e.Fragment,{children:[e.jsx("div",{children:e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(ft,{value:z,onValueChange:W,className:"w-full",children:[e.jsxs(Be,{value:"firm-search",className:"mt-0",children:[!x&&e.jsxs("div",{className:"flex items-center gap-2 text-sm text-amber-800",style:{maxWidth:"860px",margin:"0 auto 16px",padding:"10px 14px",background:"#FFFBEB",border:"0.5px solid #FDE68A",borderRadius:3},children:[e.jsx(we,{className:"h-4 w-4 flex-shrink-0"}),"Please sign in to use Find Companies."]}),e.jsxs("div",{style:{padding:"24px 32px 32px",maxWidth:"860px"},children:[e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",border:"1.5px solid transparent",borderRadius:14,background:"#F0F7FF",transition:"all .15s",minHeight:110},className:"focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]",children:[e.jsx(Oe,{style:{width:16,height:16,flexShrink:0,color:"#3B82F6",marginTop:1}}),e.jsx("input",{ref:ye,value:k&&!w?k:w,onChange:t=>{k||P(t.target.value)},onKeyDown:Je,onFocus:()=>ge(null),placeholder:"Fintech startups in NYC, consulting firms in Chicago...",disabled:j||!x,style:{flex:1,border:"none",background:"none",fontSize:14,color:k&&!w?"#94A3B8":"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}})]})}),!w.trim()&&e.jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:8,marginBottom:24},children:wt.map(t=>e.jsx("button",{type:"button",onClick:()=>Xe(t.query,t.id),disabled:j,style:{display:"inline-flex",alignItems:"center",gap:6,padding:"7px 14px",fontSize:13,border:`1px solid ${ie===t.id?"#3B82F6":"#E2E8F0"}`,borderRadius:100,background:ie===t.id?"rgba(59,130,246,0.05)":"#fff",color:ie===t.id?"#3B82F6":"#6B7280",cursor:"pointer",transition:"all .12s",fontFamily:"inherit"},onMouseEnter:i=>{se(t.query),ie!==t.id&&(i.currentTarget.style.borderColor="#3B82F6",i.currentTarget.style.background="rgba(59,130,246,0.05)",i.currentTarget.style.color="#3B82F6")},onMouseLeave:i=>{se(null),ie!==t.id&&(i.currentTarget.style.borderColor="#E2E8F0",i.currentTarget.style.background="#fff",i.currentTarget.style.color="#6B7280")},children:t.label},t.id))}),ce&&e.jsxs("div",{className:"p-3 bg-red-50 text-red-700 text-sm rounded-[3px] flex items-center gap-2 border border-red-200 mb-4",children:[e.jsx(we,{className:"w-4 h-4 flex-shrink-0"}),ce]}),w.trim()&&e.jsxs("div",{style:{marginBottom:16},children:[e.jsx("div",{style:{fontSize:10,color:"#94A3B8",fontWeight:500,letterSpacing:".05em",marginBottom:8},children:"HOW MANY TO FIND?"}),e.jsx("div",{className:"slider-container",children:e.jsxs("div",{className:"slider-wrapper",children:[e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[16px]",children:"5"}),e.jsxs("div",{className:"slider-input-wrapper",children:[e.jsx("div",{className:"slider-filled-track",style:{width:ne>5?`${(b-5)/(ne-5)*100}%`:"0%"}}),e.jsx("input",{type:"range",min:5,max:ne,step:5,value:b,onChange:t=>{const i=Math.min(Number(t.target.value),ne);qe(i)},disabled:j,className:"slider-custom","aria-label":"Number of companies to find"})]}),e.jsx("span",{className:"text-xs text-[#94A3B8] min-w-[20px] text-right",children:ne})]})}),e.jsx("p",{className:"text-xs text-[#6B7280] mt-2",children:jt(b)}),e.jsxs("div",{className:"mt-2 flex items-center gap-2 text-xs text-[#6B7280]",children:[e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]",children:[b*D," credits"]}),e.jsxs("span",{children:["of ",p.credits??0," available"]})]}),p.credits!==void 0&&p.credits<b*D&&e.jsxs("p",{className:"text-xs text-amber-600 mt-2 flex items-center gap-1",children:[e.jsx(we,{className:"w-3 h-3"}),"Insufficient credits. You need ",b*D," but have ",p.credits,"."]})]}),e.jsx("button",{ref:O,onClick:()=>be(),disabled:!ee||j||!x||(p.credits??0)<b*D||(p.credits??0)===0,style:{width:"100%",height:52,borderRadius:12,background:!ee||j||!x||(p.credits??0)<b*D||(p.credits??0)===0?"#E2E8F0":"#2563EB",color:!ee||j||!x||(p.credits??0)<b*D||(p.credits??0)===0?"#94A3B8":"#fff",border:"none",fontSize:15,fontWeight:600,cursor:!ee||j||!x||(p.credits??0)<b*D||(p.credits??0)===0?"not-allowed":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s",fontFamily:"inherit"},children:j?e.jsxs(e.Fragment,{children:[e.jsx(ue,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding companies..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(je,{className:"w-4 h-4"}),e.jsx("span",{children:"Find companies"})]})}),w&&!ee&&e.jsx("p",{style:{fontSize:11,color:"#94A3B8",marginTop:10,textAlign:"center"},children:"Include an industry and location for best results"})]})]}),e.jsx(Be,{value:"firm-library",className:"mt-0",children:e.jsxs("div",{style:{background:"#FFFFFF",border:"1px solid #E2E8F0",borderRadius:"3px",maxWidth:"900px",margin:"0 auto",boxShadow:"none",animationDelay:"200ms"},className:"w-full px-4 py-5 sm:px-10 sm:py-9 overflow-hidden animate-fadeInUp",children:[e.jsx("div",{className:"h-1",style:{background:"#EEF2F8"}}),e.jsxs("div",{className:"p-8",children:[e.jsxs("div",{className:"flex justify-between items-center pb-6 mb-6",style:{borderBottom:"1px solid #EEF2F8"},children:[e.jsxs("div",{children:[e.jsxs("h2",{className:"text-xl font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:[h.length," ",h.length===1?"company":"companies"," saved"]}),e.jsx("p",{className:"text-sm mt-1",style:{color:"#6B7280"},children:"Export your results to CSV for further analysis"})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsxs(ve,{onClick:()=>{fe.current=!1,$()},variant:"outline",size:"sm",className:"gap-2 hover:bg-[#FAFBFF]",style:{borderColor:"#E2E8F0",color:"#0F172A",borderRadius:3},disabled:X,children:[X?e.jsx(ue,{className:"h-4 w-4 animate-spin"}):e.jsx("svg",{className:"h-4 w-4",fill:"none",stroke:"currentColor",viewBox:"0 0 24 24",children:e.jsx("path",{strokeLinecap:"round",strokeLinejoin:"round",strokeWidth:2,d:"M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"})}),"Refresh"]}),h.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs(ve,{onClick:()=>me(!0),variant:"outline",className:"gap-2 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700",children:[e.jsx($e,{className:"h-4 w-4"}),"Delete All"]}),e.jsxs(ve,{onClick:Ze,className:`gap-2 ${p.tier==="free"?"bg-[#94A3B8] hover:bg-[#94A3B8] cursor-not-allowed opacity-60":"bg-[#0F172A] hover:bg-[#1E293B]"}`,disabled:p.tier==="free",title:p.tier==="free"?"Upgrade to Pro or Elite to export CSV":"Export firms to CSV",children:[e.jsx(it,{className:"h-4 w-4"}),"Export CSV"]})]})]})]}),X?e.jsx(mt,{variant:"card",count:3}):h.length>0?e.jsx(bt,{firms:h,onViewContacts:Ve,onDelete:Ye,deletingId:He}):e.jsxs("div",{className:"py-12 text-center",children:[e.jsx("div",{className:"w-16 h-16 flex items-center justify-center mx-auto mb-4",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx(je,{className:"h-8 w-8",style:{color:"#0F172A"}})}),e.jsx("h3",{className:"text-lg font-semibold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"No companies yet"}),e.jsx("p",{className:"text-sm mb-6",style:{color:"#6B7280"},children:"Use the Find Companies tab to discover companies"}),e.jsx("button",{onClick:()=>W("firm-search"),className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"Find Companies"})]})]})]})})]})})}),f&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsxs("div",{className:"flex items-center justify-between mb-4",children:[e.jsx("h3",{className:"text-lg font-semibold",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Search History"}),e.jsx("button",{onClick:()=>n(!1),className:"p-2 hover:bg-[#FAFBFF]",style:{borderRadius:3},children:e.jsx(at,{className:"w-5 h-5",style:{color:"#6B7280"}})})]}),e.jsx("div",{className:"overflow-y-auto flex-1 space-y-2",children:I?e.jsx("div",{className:"py-8 text-center",children:e.jsx(ue,{className:"h-6 w-6 animate-spin mx-auto",style:{color:"#94A3B8"}})}):m.length===0?e.jsxs("div",{className:"py-8 text-center",style:{color:"#6B7280"},children:[e.jsx(nt,{className:"h-8 w-8 mx-auto mb-2 opacity-50"}),e.jsx("p",{children:"No search history yet"})]}):m.map(t=>e.jsxs("div",{onClick:()=>Qe(t),className:"flex items-center justify-between p-4 cursor-pointer transition-colors",style:{background:"#FAFBFF",borderRadius:3},onMouseEnter:i=>{i.currentTarget.style.background="#EEF2F8"},onMouseLeave:i=>{i.currentTarget.style.background="#FAFBFF"},children:[e.jsxs("div",{children:[e.jsx("p",{className:"font-medium text-sm line-clamp-2",style:{color:"#0F172A"},children:t.query}),e.jsxs("p",{className:"text-xs mt-1",style:{color:"#6B7280"},children:[t.resultsCount," results • ",new Date(t.createdAt).toLocaleDateString()]})]}),e.jsx(ot,{className:"w-4 h-4",style:{color:"#94A3B8"}})]},t.id))})]})}),j&&e.jsx("div",{className:"fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-in fade-in duration-200",children:e.jsxs("div",{className:"bg-white p-8 max-w-md w-full mx-4 animate-in zoom-in-95 duration-200",style:{borderRadius:3,border:"1px solid #E2E8F0",boxShadow:"0 2px 8px rgba(0,0,0,0.06)"},children:[e.jsxs("div",{className:"w-20 h-20 flex items-center justify-center mx-auto mb-6 relative",style:{background:"#EEF2F8",borderRadius:3},children:[e.jsx("div",{className:"absolute inset-0 animate-pulse",style:{background:"rgba(59,130,246,0.10)",borderRadius:3}}),e.jsx(je,{className:"w-10 h-10 relative z-10",style:{color:"#0F172A"}})]}),e.jsx("h3",{className:"text-2xl font-bold mb-2",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:"Searching for companies"}),e.jsx("p",{className:"mb-6 text-sm min-h-[20px]",style:{color:"#6B7280"},children:(N==null?void 0:N.step)||`Finding ${b} companies matching your criteria`}),e.jsxs("div",{className:"mb-4",children:[e.jsx("div",{className:"w-full h-3 overflow-hidden",style:{background:"#EEF2F8",borderRadius:3},children:e.jsx("div",{className:"h-3 transition-all duration-500 ease-out relative overflow-hidden",style:{background:"#3B82F6",borderRadius:3,width:N?`${Math.max(2,Math.min(98,N.current/N.total*100))}%`:"10%"},children:e.jsx("div",{className:"absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-loading-shimmer bg-[length:200%_100%]"})})}),e.jsxs("div",{className:"flex items-center justify-between mt-3 text-xs",children:[e.jsx("span",{className:"font-medium",style:{color:"#3B82F6"},children:N?`${N.current} of ${N.total} companies`:"Starting..."}),e.jsx("span",{style:{color:"#6B7280"},children:N?`${Math.round(N.current/N.total*100)}%`:"0%"})]})]}),e.jsx("p",{className:"text-xs mt-4",style:{color:"#94A3B8"},children:"This usually takes 10-20 seconds"})]})}),pe&&h.length>0&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white p-8 max-w-md text-center animate-scaleIn",style:{borderRadius:3,boxShadow:"0 2px 8px rgba(0,0,0,0.08)"},children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 flex items-center justify-center mx-auto mb-4",style:{borderRadius:3},children:e.jsx(lt,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold mb-1",style:{color:"#0F172A",fontFamily:"'Lora', Georgia, serif"},children:["Found ",h.length," companies!"]}),e.jsx("p",{className:"mb-2",style:{color:"#6B7280"},children:"Matching your criteria"}),e.jsx("p",{className:"text-sm font-medium mb-6",style:{color:"#3B82F6"},children:"Saved to your Company Tracker"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:()=>{r(!1),W("firm-library")},className:"px-6 py-3 text-white font-semibold transition-all",style:{background:"#3B82F6",borderRadius:3},children:"View Companies →"}),e.jsx("button",{onClick:()=>{r(!1),P(""),de(!1)},className:"px-6 py-3 font-semibold transition-colors",style:{background:"#EEF2F8",color:"#0F172A",borderRadius:3},children:"Search again"})]})]})}),e.jsx(Te,{open:Ue,onOpenChange:me,children:e.jsxs(Re,{children:[e.jsxs(ze,{children:[e.jsx(Ie,{children:"Delete All Companies?"}),e.jsxs(Le,{children:["This will permanently remove all ",h.length," ",h.length===1?"company":"companies"," from your Company Tracker. This action cannot be undone."]})]}),e.jsxs(De,{children:[e.jsx(Me,{children:"Cancel"}),e.jsx(Pe,{onClick:Ge,className:"bg-red-600 hover:bg-red-700 focus:ring-red-600",children:"Delete All"})]})]})}),e.jsx(Te,{open:_e,onOpenChange:xe,children:e.jsxs(Re,{children:[e.jsxs(ze,{children:[e.jsx(Ie,{children:"Upgrade to Export CSV"}),e.jsx(Le,{children:"CSV export is available for Pro and Elite tier users. Upgrade your plan to export your company search results to CSV for further analysis."})]}),e.jsxs(De,{children:[e.jsx(Me,{children:"Cancel"}),e.jsx(Pe,{onClick:et,className:"bg-[#3B82F6] hover:bg-[#2563EB] focus:ring-[#3B82F6]",children:"Upgrade to Pro/Elite"})]})]})}),e.jsx("style",{children:`
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
      `}),z==="firm-search"&&e.jsx(yt,{originalButtonRef:O,onClick:()=>be(),isLoading:j,disabled:!ee||j||!x||(p.credits??0)<b*D,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find companies"})})]});return R?Ae:e.jsx(ct,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(dt,{}),e.jsxs(gt,{children:[e.jsx(ht,{}),e.jsxs("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:[e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 sm:pt-12 sm:pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Companies"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Describe the type of companies you're looking for in plain English and we'll find them for you."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(xt,{videoId:"n_AYHEJSXrE"})})]}),Ae]})]})]})})};export{Tt as default};
