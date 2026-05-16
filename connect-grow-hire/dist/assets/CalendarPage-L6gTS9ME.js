import{j as e,an as ce,ao as ne,a2 as oe,r as u,K as me,X as ue,z as he,ap as ie,L as X,aq as pe,a8 as xe,ar as ge,as as fe,ad as ye,a3 as be,at as we,l as ve}from"./vendor-react-BiYf6JDv.js";import{f as je,A as Ne,g as Se}from"./AppHeader-Cwbv8qyE.js";import{M as De}from"./MainContentWrapper-nT68_RNW.js";import{c as H,e as se,u as le,b as Ce,B as G}from"./index-BjLOHFG-.js";import{f as D}from"./firebaseApi-tLfClPQE.js";import{D as Ee,a as Fe,b as Me,c as $e,d as Te}from"./dialog-44z7vR6_.js";import{I as q}from"./input-BI12Ul4V.js";import{L as P}from"./label-Bk6JGKfc.js";import{S as J,a as Q,b as ee,c as te,d as I}from"./select-Ca_vw3Tt.js";import{T as ke}from"./textarea-CdHy7EwV.js";import{P as Le,a as Pe,b as Ie}from"./popover-CW1TFelD.js";import{o as R,a as re,s as ze,e as Ae,F as Oe,G as Re,c as Ue}from"./vendor-dates-E7FZUXjG.js";function de({className:a,classNames:l,showOutsideDays:C=!0,...c}){return e.jsx(ce,{showOutsideDays:C,className:H("p-3",a),classNames:{months:"flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",month:"space-y-4",caption:"flex justify-center pt-1 relative items-center",caption_label:"text-sm font-medium",nav:"space-x-1 flex items-center",nav_button:H(se({variant:"outline"}),"h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-[rgba(59,130,246,0.05)]"),nav_button_previous:"absolute left-1",nav_button_next:"absolute right-1",table:"w-full border-collapse space-y-1",head_row:"flex",head_cell:"text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",row:"flex w-full mt-2",cell:"h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-[rgba(59,130,246,0.05)] [&:has([aria-selected])]:bg-[rgba(59,130,246,0.05)] first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",day:H(se({variant:"ghost"}),"h-9 w-9 p-0 font-normal aria-selected:opacity-100 hover:bg-[rgba(59,130,246,0.05)] hover:text-foreground"),day_range_end:"day-range-end",day_selected:"bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",day_today:"bg-[#FAFBFF] text-foreground",day_outside:"day-outside text-muted-foreground opacity-50 aria-selected:bg-[rgba(59,130,246,0.05)] aria-selected:text-muted-foreground aria-selected:opacity-30",day_disabled:"text-muted-foreground opacity-50",day_range_middle:"aria-selected:bg-[rgba(59,130,246,0.05)] aria-selected:text-foreground",day_hidden:"invisible",...l},components:{Chevron:({orientation:d})=>{const x=d==="left"?ne:oe;return e.jsx(x,{className:"h-4 w-4"})}},...c})}de.displayName="Calendar";function Be({isOpen:a,onClose:l,onEventCreated:C,prefillContact:c}){const{user:d}=le(),{toast:x}=Ce(),[f,E]=u.useState(!1),[g,w]=u.useState(""),[h,F]=u.useState(null),[$,T]=u.useState([]),[V,v]=u.useState(!1),[j,y]=u.useState(""),[z,k]=u.useState(""),[b,A]=u.useState(void 0),[O,U]=u.useState(""),[t,n]=u.useState("30"),[i,r]=u.useState("video"),[m,M]=u.useState(""),[N,B]=u.useState(""),p=me.useMemo(()=>{const s=[];for(let o=8;o<=20;o++)for(let S=0;S<60;S+=30){const L=`${o.toString().padStart(2,"0")}:${S.toString().padStart(2,"0")}`;s.push(L)}return s},[]);u.useEffect(()=>{c&&a&&(c.contactName&&(w(c.contactName),y(`Coffee Chat with ${c.contactName}`)),c.firm&&k(c.firm),c.contactId&&D.getContact((d==null?void 0:d.uid)||"",c.contactId).then(s=>{s&&(F(s),k(s.company||c.firm||""))}))},[c,a,d==null?void 0:d.uid]),u.useEffect(()=>{if(g.length>1&&!h){const s=setTimeout(()=>{d!=null&&d.uid&&D.searchContacts(d.uid,g,5).then(o=>{T(o),v(!0)})},300);return()=>clearTimeout(s)}else T([]),v(!1)},[g,h,d==null?void 0:d.uid]),u.useEffect(()=>{a||(w(""),F(null),y(""),k(""),A(void 0),U(""),n("30"),r("video"),M(""),B(""),T([]),v(!1))},[a]);const Y=s=>{F(s),w(`${s.firstName} ${s.lastName}`.trim()||s.email),k(s.company||""),y(`Coffee Chat with ${s.firstName} ${s.lastName}`.trim()||s.email),v(!1)},W=()=>{F(null),w("")},_=async s=>{if(s.preventDefault(),!(d!=null&&d.uid)){x({title:"Error",description:"You must be logged in to schedule an event",variant:"destructive"});return}if(!j.trim()){x({title:"Validation Error",description:"Please enter an event title",variant:"destructive"});return}if(!z.trim()){x({title:"Validation Error",description:"Please enter a firm name",variant:"destructive"});return}if(!b){x({title:"Validation Error",description:"Please select a date",variant:"destructive"});return}if(!O){x({title:"Validation Error",description:"Please select a time",variant:"destructive"});return}E(!0);try{const o=re(b),S=R(o,"yyyy-MM-dd"),L=o.getFullYear(),Z=o.getMonth()+1,ae=o.getDate();console.log("📅 Creating event with date:",{inputDate:b,inputDateISO:b.toISOString(),inputDateLocal:b.toLocaleDateString(),normalizedDate:o.toISOString(),normalizedLocal:o.toLocaleDateString(),year:L,month:Z,day:ae,formattedDate:S,formattedViaDateFns:R(o,"yyyy-MM-dd"),timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});const K={title:j.trim(),contactId:h==null?void 0:h.id,contactName:h?`${h.firstName} ${h.lastName}`.trim()||h.email:g.trim()||"Unknown",firm:z.trim(),date:S,time:O,duration:parseInt(t,10),type:i,status:"pending",...m.trim()&&{meetingLink:m.trim()},...N.trim()&&{notes:N.trim()}};await D.createCalendarEvent(d.uid,K),x({title:"Event Scheduled",description:"Your calendar event has been created successfully"}),C(),l()}catch(o){console.error("Error creating calendar event:",o),x({title:"Error",description:"Failed to create calendar event. Please try again.",variant:"destructive"})}finally{E(!1)}};return e.jsx(Ee,{open:a,onOpenChange:l,children:e.jsxs(Fe,{className:"sm:max-w-[600px] max-h-[90vh] overflow-y-auto",children:[e.jsx(Me,{children:e.jsx($e,{children:"Schedule New Event"})}),e.jsxs("form",{onSubmit:_,className:"space-y-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"contact",children:"Contact (Optional)"}),e.jsx("div",{className:"relative",children:h?e.jsxs("div",{className:"flex items-center gap-2 p-2 rounded-lg border border-border bg-background",children:[e.jsxs("div",{className:"flex-1",children:[e.jsx("div",{className:"text-sm font-medium",children:`${h.firstName} ${h.lastName}`.trim()||h.email}),e.jsx("div",{className:"text-xs text-text-muted",children:h.company})]}),e.jsx(G,{type:"button",variant:"ghost",size:"sm",onClick:W,className:"h-6 w-6 p-0",children:e.jsx(ue,{className:"h-4 w-4"})})]}):e.jsxs(e.Fragment,{children:[e.jsxs("div",{className:"relative",children:[e.jsx(he,{className:"absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted"}),e.jsx(q,{id:"contact",className:"pl-9",placeholder:"Search contacts...",value:g,onChange:s=>w(s.target.value),onFocus:()=>{$.length>0&&v(!0)}})]}),V&&$.length>0&&e.jsx("div",{className:"absolute z-50 w-full mt-1 bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-y-auto",children:$.map(s=>e.jsxs("button",{type:"button",className:"w-full text-left px-4 py-2 hover:bg-background transition-colors",onClick:()=>Y(s),children:[e.jsx("div",{className:"text-sm font-medium",children:`${s.firstName} ${s.lastName}`.trim()||s.email}),e.jsx("div",{className:"text-xs text-text-muted",children:s.company})]},s.id))})]})})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"title",children:"Event Title *"}),e.jsx(q,{id:"title",value:j,onChange:s=>y(s.target.value),placeholder:"Coffee Chat with...",required:!0})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"firm",children:"Firm *"}),e.jsx(q,{id:"firm",value:z,onChange:s=>k(s.target.value),placeholder:"Company name",required:!0})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{children:"Date *"}),e.jsxs(Le,{children:[e.jsx(Pe,{asChild:!0,children:e.jsxs(G,{variant:"outline",className:H("w-full justify-start text-left font-normal",!b&&"text-muted-foreground"),children:[e.jsx(ie,{className:"mr-2 h-4 w-4"}),b?R(b,"PPP"):"Pick a date"]})}),e.jsx(Ie,{className:"w-auto p-0",align:"start",children:e.jsx(de,{mode:"single",selected:b,onSelect:s=>{if(s){const o=re(s);console.log("📅 Date selected from calendar:",{original:s,originalISO:s.toISOString(),originalLocal:s.toLocaleDateString(),originalUTC:{year:s.getUTCFullYear(),month:s.getUTCMonth()+1,day:s.getUTCDate()},originalLocalValues:{year:s.getFullYear(),month:s.getMonth()+1,day:s.getDate()},normalized:o,normalizedISO:o.toISOString(),normalizedLocal:o.toLocaleDateString(),normalizedValues:{year:o.getFullYear(),month:o.getMonth()+1,day:o.getDate()},formatted:R(o,"yyyy-MM-dd")}),A(o)}else A(void 0)},disabled:s=>{const o=new Date;return o.setHours(0,0,0,0),new Date(s.getFullYear(),s.getMonth(),s.getDate())<o},initialFocus:!0})})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"time",children:"Time *"}),e.jsxs(J,{value:O,onValueChange:U,required:!0,children:[e.jsx(Q,{id:"time",children:e.jsx(ee,{placeholder:"Select time"})}),e.jsx(te,{children:p.map(s=>{const[o,S]=s.split(":"),L=parseInt(o,10),Z=L>=12?"PM":"AM",K=`${L>12?L-12:L===0?12:L}:${S} ${Z}`;return e.jsx(I,{value:s,children:K},s)})})]})]})]}),e.jsxs("div",{className:"grid grid-cols-2 gap-4",children:[e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"duration",children:"Duration (minutes) *"}),e.jsxs(J,{value:t,onValueChange:n,required:!0,children:[e.jsx(Q,{id:"duration",children:e.jsx(ee,{})}),e.jsxs(te,{children:[e.jsx(I,{value:"15",children:"15 minutes"}),e.jsx(I,{value:"30",children:"30 minutes"}),e.jsx(I,{value:"45",children:"45 minutes"}),e.jsx(I,{value:"60",children:"60 minutes"})]})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"type",children:"Type *"}),e.jsxs(J,{value:i,onValueChange:s=>r(s),required:!0,children:[e.jsx(Q,{id:"type",children:e.jsx(ee,{})}),e.jsxs(te,{children:[e.jsx(I,{value:"video",children:"Video"}),e.jsx(I,{value:"phone",children:"Phone"}),e.jsx(I,{value:"in-person",children:"In-Person"})]})]})]})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"meetingLink",children:"Meeting Link (Optional)"}),e.jsx(q,{id:"meetingLink",type:"url",value:m,onChange:s=>M(s.target.value),placeholder:"https://meet.google.com/..."})]}),e.jsxs("div",{className:"space-y-2",children:[e.jsx(P,{htmlFor:"notes",children:"Notes (Optional)"}),e.jsx(ke,{id:"notes",value:N,onChange:s=>B(s.target.value),placeholder:"Additional notes about this meeting...",rows:3})]}),e.jsxs(Te,{children:[e.jsx(G,{type:"button",variant:"outline",onClick:l,disabled:f,children:"Cancel"}),e.jsx(G,{type:"submit",disabled:f,className:"gradient-bg",children:f?"Scheduling...":"Schedule Event"})]})]})]})})}function Ve(a){const[l,C,c]=a.date.split("-").map(Number),[d,x]=a.time.split(":").map(Number),f=new Date(l,C-1,c,d,x),E=new Date(f.getTime()+a.duration*60*1e3),g=T=>T.toISOString().replace(/[-:]/g,"").split(".")[0]+"Z",w=g(f),h=g(E),F=`Coffee chat with ${a.contactName} at ${a.firm}${a.notes?`

Notes: ${a.notes}`:""}`;return`https://calendar.google.com/calendar/render?${new URLSearchParams({action:"TEMPLATE",text:a.title,dates:`${w}/${h}`,details:F,location:a.meetingLink||(a.type==="in-person"?"TBD":"")}).toString()}`}function Ye(a){const[l,C,c]=a.date.split("-").map(Number),[d,x]=a.time.split(":").map(Number),f=new Date(l,C-1,c,d,x),E=new Date(f.getTime()+a.duration*60*1e3),g=y=>{const z=y.getUTCFullYear(),k=String(y.getUTCMonth()+1).padStart(2,"0"),b=String(y.getUTCDate()).padStart(2,"0"),A=String(y.getUTCHours()).padStart(2,"0"),O=String(y.getUTCMinutes()).padStart(2,"0"),U=String(y.getUTCSeconds()).padStart(2,"0");return`${z}${k}${b}T${A}${O}${U}Z`},w=g(f),h=g(E),F=g(new Date),$=`Coffee chat with ${a.contactName} at ${a.firm}${a.notes?`\\n\\nNotes: ${a.notes}`:""}`,T=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Offerloop//Calendar//EN","BEGIN:VEVENT",`UID:${a.id||Date.now()}@offerloop.ai`,`DTSTAMP:${F}`,`DTSTART:${w}`,`DTEND:${h}`,`SUMMARY:${a.title}`,`DESCRIPTION:${$.replace(/\n/g,"\\n")}`,`LOCATION:${a.meetingLink||(a.type==="in-person"?"TBD":"")}`,`STATUS:${a.status.toUpperCase()}`,"END:VEVENT","END:VCALENDAR"].join(`\r
`),V=new Blob([T],{type:"text/calendar;charset=utf-8"}),v=window.URL.createObjectURL(V),j=document.createElement("a");j.href=v,j.download=`${a.title.replace(/[^a-z0-9]/gi,"_")}.ics`,document.body.appendChild(j),j.click(),document.body.removeChild(j),window.URL.revokeObjectURL(v)}const _e=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];function Ge(){const{user:a}=le(),[l,C]=u.useState(new Date),[c,d]=u.useState([]),[x,f]=u.useState([]),[E,g]=u.useState(!0),[w,h]=u.useState(null),[F,$]=u.useState(!1);u.useEffect(()=>{(async()=>{if(!(a!=null&&a.uid)){g(!1);return}try{g(!0);const n=l.getMonth(),i=l.getFullYear();console.log(`📅 Fetching calendar events for month ${n+1}/${i}`);const[r,m]=await Promise.all([D.getCalendarEvents(a.uid,n,i),D.getFollowUpReminders(a.uid)]);console.log(`✅ Fetched ${r.length} events:`,r),d(r),f(m)}catch(n){console.error("Error fetching calendar data:",n)}finally{g(!1)}})()},[a==null?void 0:a.uid,l]),u.useEffect(()=>{(async()=>{if(!(a!=null&&a.uid)||c.length===0)return;const n=new Date,i=[];c.forEach(r=>{const[m,M,N]=r.date.split("-").map(Number),[B,p]=r.time.split(":").map(Number);new Date(m,M-1,N,B,p)<n&&r.status!=="completed"&&r.status!=="cancelled"&&i.push({id:r.id,updates:{status:"completed"}})}),i.length>0&&Promise.all(i.map(({id:r,updates:m})=>D.updateCalendarEvent(a.uid,r,m))).then(()=>{const r=l.getMonth(),m=l.getFullYear();D.getCalendarEvents(a.uid,r,m).then(d)})})()},[c,a==null?void 0:a.uid,l]);const T=u.useMemo(()=>{const t=ze(l),n=Ae(l),i=Oe(t),r=l.getFullYear(),m=l.getMonth()+1,M=n.getDate(),N=[];for(let p=0;p<i;p++)N.push({date:0,hasEvent:!1,isCurrentMonth:!1,isToday:!1});console.log(`📅 Generating calendar days for ${R(l,"MMMM yyyy")} with ${c.length} events`),console.log("📅 Events:",c.map(p=>({title:p.title,date:p.date})));for(let p=1;p<=M;p++){const Y=`${r}-${String(m).padStart(2,"0")}-${String(p).padStart(2,"0")}`,W=c.some(o=>{if(!o.date)return!1;const S=o.date===Y;return S&&console.log(`✅ Event found on day ${p} (${Y}):`,o.title,`event.date=${o.date}`),S}),_=new Date,s=_.getFullYear()===r&&_.getMonth()+1===m&&_.getDate()===p;N.push({date:p,hasEvent:W,isCurrentMonth:!0,isToday:s})}const B=N.filter(p=>p.hasEvent).length;return console.log(`📅 Calendar generated: ${B} days with events`),N},[l,c]),V=t=>{if(t===0)return[];const n=l.getFullYear(),i=l.getMonth()+1,r=`${n}-${String(i).padStart(2,"0")}-${String(t).padStart(2,"0")}`;return c.filter(m=>m.date?m.date===r:!1)},v=(t,n)=>{const[i,r,m]=t.split("-").map(Number),[M,N]=n.split(":").map(Number);return new Date(i,r-1,m,M,N)},j=c.filter(t=>v(t.date,t.time)>=new Date&&t.status!=="cancelled").sort((t,n)=>{const i=v(t.date,t.time),r=v(n.date,n.time);return i.getTime()-r.getTime()}).slice(0,10),y=t=>{const[n,i]=t.split(":").map(Number),r=n>12?n-12:n===0?12:n,m=n>=12?"PM":"AM";return`${r}:${i.toString().padStart(2,"0")} ${m}`},z=t=>{const[n,i,r]=t.split("-").map(Number),m=new Date(n,i-1,r);return R(m,"MMM d, yyyy")},k=()=>{C(Re(l))},b=()=>{C(Ue(l,1))},A=t=>{t!==0&&h(w===t?null:t)},O=async()=>{if(!(a!=null&&a.uid))return;const t=l.getMonth(),n=l.getFullYear();console.log("🔄 Refreshing calendar after event creation...");const[i,r]=await Promise.all([D.getCalendarEvents(a.uid,t,n),D.getFollowUpReminders(a.uid)]);console.log(`✅ Refreshed: ${i.length} events`),d(i),f(r)},U=async(t,n)=>{if(a!=null&&a.uid&&confirm(`Are you sure you want to delete "${n}"?`))try{await D.deleteCalendarEvent(a.uid,t);const i=l.getMonth(),r=l.getFullYear(),[m,M]=await Promise.all([D.getCalendarEvents(a.uid,i,r),D.getFollowUpReminders(a.uid)]);d(m),f(M),console.log(`✅ Event deleted: ${n}`)}catch(i){console.error("Error deleting event:",i),alert("Failed to delete event. Please try again.")}};return e.jsxs("div",{className:"grid grid-cols-12 gap-6 calendar-container",children:[e.jsxs("div",{className:"col-span-8 bg-card border border-border rounded-[3px] overflow-hidden calendar-main",children:[e.jsxs("div",{className:"p-4 border-b border-border flex items-center justify-between",children:[e.jsxs("div",{className:"flex items-center gap-4",children:[e.jsx("h3",{className:"text-lg font-semibold",children:R(l,"MMMM yyyy")}),e.jsx("div",{className:"flex items-center gap-1 bg-background rounded-[3px] p-1",children:e.jsx("button",{onClick:()=>C(new Date),className:"px-3 py-1 text-sm rounded-md transition-all text-text-secondary hover:text-text-primary",children:"Today"})})]}),e.jsxs("div",{className:"flex items-center gap-2",children:[e.jsx("button",{onClick:k,className:"w-8 h-8 rounded-[3px] hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors",children:e.jsx(ne,{size:18})}),e.jsx("button",{onClick:b,className:"w-8 h-8 rounded-[3px] hover:bg-background flex items-center justify-center text-text-secondary hover:text-text-primary transition-colors",children:e.jsx(oe,{size:18})})]})]}),e.jsx("div",{className:"p-6",children:E?e.jsx("div",{className:"flex items-center justify-center h-64",children:e.jsx(X,{className:"h-6 w-6 animate-spin text-[#3B82F6]"})}):e.jsxs(e.Fragment,{children:[e.jsx("div",{className:"grid grid-cols-7 gap-2 mb-2",children:_e.map(t=>e.jsx("div",{className:"text-center text-xs text-text-muted font-medium py-2",children:t},t))}),e.jsx("div",{className:"grid grid-cols-7 gap-2 calendar-days-grid",children:T.map((t,n)=>{if(t.date===0)return e.jsx("div",{className:"aspect-square"},n);const i=V(t.date),r=w===t.date;return e.jsxs("div",{onClick:()=>A(t.date),className:`aspect-square p-2 rounded-[3px] border transition-all cursor-pointer ${t.isToday||r?"border-purple bg-purple-soft":t.hasEvent?"border-border hover:border-purple bg-background":"border-border-subtle hover:border-border bg-card"}`,children:[e.jsx("div",{className:`text-sm ${t.isToday||r?"text-[#3B82F6] font-medium":"text-text-primary"}`,children:t.date}),t.hasEvent&&e.jsx("div",{className:"mt-1.5 flex items-center justify-center",children:e.jsx(pe,{className:"w-5 h-5 text-red-500"})}),r&&i.length>0&&e.jsxs("div",{className:"mt-1 text-[10px] text-[#3B82F6] font-medium",children:[i.length," event",i.length>1?"s":""]})]},n)})})]})})]}),e.jsxs("div",{className:"col-span-4 space-y-6 calendar-sidebar",children:[e.jsxs("div",{className:"bg-card border border-border rounded-[3px] p-6 calendar-upcoming-events",children:[e.jsxs("div",{className:"flex items-center gap-2 mb-4",children:[e.jsx(ie,{size:18,className:"text-[#3B82F6]"}),e.jsx("h3",{className:"text-lg font-semibold calendar-upcoming-title",children:"Upcoming Events"})]}),E?e.jsx("div",{className:"flex items-center justify-center py-8",children:e.jsx(X,{className:"h-5 w-5 animate-spin text-[#3B82F6]"})}):j.length===0?e.jsx("div",{className:"text-center py-8 text-text-muted text-sm",children:"No upcoming events. Schedule your first chat!"}):e.jsx("div",{className:"space-y-3",children:j.map(t=>e.jsxs("div",{className:"p-3 rounded-[3px] bg-background border border-border-subtle hover:border-purple transition-all",children:[e.jsxs("div",{className:"flex items-start justify-between mb-2",children:[e.jsx("div",{className:"font-medium text-sm flex-1",children:t.title}),e.jsx("span",{className:`px-2 py-0.5 rounded-full text-xs ml-2 ${t.status==="confirmed"?"bg-[#3B82F6]/10 text-[#3B82F6]":t.status==="pending"?"bg-yellow-500/10 text-yellow-500":"bg-gray-500/10 text-gray-500"}`,children:t.status})]}),e.jsx("div",{className:"text-xs text-text-muted mb-2",children:t.firm}),e.jsxs("div",{className:"flex items-center gap-3 text-xs text-text-secondary mb-2",children:[e.jsxs("div",{className:"flex items-center gap-1",children:[e.jsx(xe,{size:12}),e.jsxs("span",{children:[z(t.date)," • ",y(t.time)]})]}),t.type==="video"&&e.jsx(ge,{size:12,className:"text-[#3B82F6]"}),t.type==="phone"&&e.jsx(fe,{size:12,className:"text-[#3B82F6]"}),t.type==="in-person"&&e.jsx(ye,{size:12,className:"text-[#3B82F6]"})]}),e.jsxs("div",{className:"flex items-center gap-2 mt-2",children:[e.jsxs("button",{onClick:()=>window.open(Ve(t),"_blank"),className:"flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors",children:[e.jsx(be,{size:12}),"Add to Google"]}),e.jsxs("button",{onClick:()=>Ye(t),className:"flex items-center gap-1 text-xs bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-2 py-1 rounded transition-colors",children:[e.jsx(we,{size:12}),"Download .ics"]}),e.jsxs("button",{onClick:()=>t.id&&U(t.id,t.title),className:"flex items-center gap-1 text-xs text-red-500 hover:text-red-600 transition-colors ml-auto",title:"Delete event",children:[e.jsx(ve,{size:12}),"Delete"]})]})]},t.id))}),e.jsx("button",{onClick:()=>$(!0),className:"w-full mt-4 text-white px-4 py-2 rounded-[3px] font-medium text-sm shadow-sm transition-all hover:opacity-90 calendar-schedule-btn",style:{background:"linear-gradient(135deg, #0F172A, #1E293B)"},children:"Schedule New Chat"})]}),e.jsxs("div",{className:"bg-card border border-border rounded-[3px] p-6 calendar-followup-reminders",children:[e.jsx("h3",{className:"text-lg font-semibold mb-4 calendar-followup-title",children:"Follow-Up Reminders"}),E?e.jsx("div",{className:"flex items-center justify-center py-8",children:e.jsx(X,{className:"h-5 w-5 animate-spin text-[#3B82F6]"})}):x.length===0?e.jsx("div",{className:"text-center py-8 text-text-muted text-sm",children:"No follow-ups needed. Great job staying on top of your network!"}):e.jsx("div",{className:"space-y-3 calendar-followup-list",children:x.map(t=>e.jsx("div",{className:"p-3 rounded-[3px] bg-background calendar-followup-item",children:e.jsxs("div",{className:"flex items-start gap-2",children:[e.jsx("div",{className:"w-2 h-2 rounded-full bg-purple-500 mt-1.5 flex-shrink-0"}),e.jsxs("div",{className:"calendar-followup-content",children:[e.jsxs("div",{className:"text-sm mb-1 calendar-followup-name",children:["Follow up with ",t.contactName]}),e.jsxs("div",{className:"text-xs text-text-muted calendar-followup-details",children:[t.firm," • No response after ",t.daysSinceContact," day",t.daysSinceContact>1?"s":""]})]})]})},t.id))})]})]}),e.jsx(Be,{isOpen:F,onClose:()=>$(!1),onEventCreated:O}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. MAIN LAYOUT - Stack vertically */
          .calendar-container {
            display: flex !important;
            flex-direction: column !important;
            gap: 16px !important;
            padding: 16px;
            box-sizing: border-box;
          }

          /* 2. CALENDAR COMPONENT - Full width */
          .calendar-main {
            width: 100% !important;
            max-width: 100% !important;
            grid-column: span 12 !important;
            box-sizing: border-box;
          }

          .calendar-main > div {
            width: 100%;
            max-width: 100%;
          }

          /* Day cells - ensure adequate size for touch */
          .calendar-days-grid {
            width: 100%;
            max-width: 100%;
          }

          .calendar-days-grid > div {
            min-width: 40px;
            min-height: 40px;
            aspect-ratio: 1;
          }

          /* Day labels - ensure breathing room */
          .calendar-days-grid + div {
            font-size: 12px;
          }

          /* 3. UPCOMING EVENTS CARD - Full width */
          .calendar-sidebar {
            width: 100% !important;
            max-width: 100% !important;
            grid-column: span 12 !important;
            box-sizing: border-box;
          }

          .calendar-upcoming-events {
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px !important;
            box-sizing: border-box;
          }

          .calendar-upcoming-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-schedule-btn {
            width: 100% !important;
            min-height: 44px !important;
            box-sizing: border-box;
            white-space: normal;
            word-wrap: break-word;
          }

          /* 4. FOLLOW-UP REMINDERS SECTION - Full width */
          .calendar-followup-reminders {
            width: 100% !important;
            max-width: 100% !important;
            padding: 16px !important;
            box-sizing: border-box;
          }

          .calendar-followup-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-followup-list {
            width: 100%;
            max-width: 100%;
          }

          .calendar-followup-item {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .calendar-followup-content {
            width: 100%;
            max-width: 100%;
            flex: 1;
            min-width: 0;
          }

          .calendar-followup-name {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          .calendar-followup-details {
            word-wrap: break-word;
            overflow-wrap: break-word;
            white-space: normal;
          }

          /* 5. GENERAL - Page padding and spacing */
          .calendar-container > * {
            margin-bottom: 0;
          }

          .calendar-container > * + * {
            margin-top: 16px;
          }

          /* Ensure no horizontal overflow */
          .calendar-container,
          .calendar-main,
          .calendar-sidebar,
          .calendar-upcoming-events,
          .calendar-followup-reminders {
            overflow-x: hidden;
          }

          /* All text must be fully readable */
          .calendar-container * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .calendar-container p,
          .calendar-container h3,
          .calendar-container div {
            word-wrap: break-word;
            overflow-wrap: break-word;
          }
        }
      `})]})}function rt(){return e.jsx(je,{children:e.jsxs("div",{className:"min-h-screen flex w-full",children:[e.jsx(Ne,{}),e.jsxs(De,{children:[e.jsx(Se,{title:""}),e.jsx("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FAFBFF",flex:1,overflowY:"auto"},children:e.jsx("div",{style:{width:"100%",minWidth:"fit-content"},children:e.jsxs("div",{style:{maxWidth:"900px",margin:"0 auto",width:"100%"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Calendar"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"View and manage your scheduled events, coffee chats, and follow-up reminders."}),e.jsx("div",{className:"bg-white rounded-[3px] border border-[#E2E8F0] overflow-hidden",children:e.jsx(Ge,{})})]})})})]})]})})}export{rt as default};
