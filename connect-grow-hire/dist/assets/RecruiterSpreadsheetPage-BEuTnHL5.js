import{aO as Be,r as i,j as e,b8 as Ue,aw as M,aR as Te,a1 as Le,L as Ie,aQ as ce,aC as Me}from"./vendor-react-BiYf6JDv.js";import ze from"./RecruiterSpreadsheet-Bnf7T088.js";import{f as Pe,A as De,g as _e}from"./AppHeader-Cwbv8qyE.js";import{T as He,c as he}from"./tabs-CvrTYjf_.js";import{u as Je,g as ue,t as u,d as pe,s as Oe}from"./index-BjLOHFG-.js";import{d as me,e as We,r as Ve,l as $e,m as Ge,u as Ye}from"./vendor-firebase-7YYPBCi_.js";import{A as qe,i as Ke}from"./resumeFileTypes-B1GfhC9L.js";import{M as Qe}from"./MainContentWrapper-nT68_RNW.js";import{V as Xe}from"./VideoDemo-CpwXoeys.js";import{P as Ze}from"./ProGate-DZV27HhL.js";import{S as et}from"./StickyCTA-GOc0RXvc.js";import{f as ge}from"./firebaseApi-tLfClPQE.js";const mt=({embedded:z=!1})=>{const{user:n}=Je(),[fe]=Be(),[P,C]=i.useState("find-hiring-managers"),[D,_]=i.useState(null),[H,J]=i.useState(null),[F,O]=i.useState(!1),N=i.useRef(null),[d,W]=i.useState(fe.get("jobUrl")||""),[k,V]=i.useState(""),[R,$]=i.useState(""),[G,Y]=i.useState(""),[A,q]=i.useState(""),[c,w]=i.useState(!1),[xe,B]=i.useState(!1),[be,U]=i.useState(0),[T]=i.useState(2),[K,ye]=i.useState(0),[E,Q]=i.useState(!1),X=i.useRef(null),[tt,je]=i.useState(0),[we,ve]=i.useState(0),Z=r=>{if(!r||r.trim().length===0)return!1;const s=["javascript is disabled","javascript is required","enable javascript","please enable javascript","browser not supported","loading...","please wait"],o=r.toLowerCase().trim();return!s.some(g=>o.includes(g))},Fe=r=>{try{return new URL(r),!0}catch{return!1}},ee=i.useCallback(async()=>{if(n!=null&&n.uid)try{const r=me(ue,"users",n.uid),s=await We(r);if(s.exists()){const o=s.data();_(o.resumeUrl||null),J(o.resumeFileName||null)}}catch(r){console.error("Failed to load saved resume:",r)}},[n==null?void 0:n.uid]);i.useEffect(()=>{ee()},[ee]);const ke=async r=>{if(!(n!=null&&n.uid))throw new Error("User not authenticated");O(!0);try{const s=Ve(Oe,`resumes/${n.uid}/${r.name}`);await $e(s,r);const o=await Ge(s),g=me(ue,"users",n.uid);await Ye(g,{resumeUrl:o,resumeFileName:r.name,resumeUpdatedAt:new Date().toISOString()}),_(o),J(r.name),u({title:"Resume saved",description:"Your resume has been uploaded and saved to your account."})}catch(s){const o=s instanceof Error?s.message:"Failed to save resume";throw u({title:"Upload failed",description:o,variant:"destructive"}),s}finally{O(!1)}},Ee=async r=>{var o;const s=(o=r.target.files)==null?void 0:o[0];if(s){if(!Ke(s)){u({title:"Invalid file type",description:"Please upload a PDF, DOCX, or DOC file.",variant:"destructive"});return}if(s.size>10*1024*1024){u({title:"File Too Large",description:"Please upload a file smaller than 10MB.",variant:"destructive"});return}try{await ke(s)}catch{}r.target.value=""}},Se=d.trim()||A.trim(),x=D&&Se&&!c,te=async()=>{var s,o,g,ie;if(!x||!n)return;w(!0),U(0);const r=setInterval(()=>{U(p=>p>=90?(clearInterval(r),90):p+10)},200);try{let p=k,b=R,L=G,v=A;if(d&&d.trim())try{const a=await pe.parseJobUrl({url:d});if(a.job){a.job.company&&!p&&(p=a.job.company);const y=a.job.title;y&&!b&&Z(y)&&(b=y),a.job.location&&!L&&(L=a.job.location),a.job.description&&!v&&(v=a.job.description)}else a.error&&(console.warn("Failed to parse job URL:",a.error),u({title:"Could not parse job URL",description:"Please paste the job description instead.",variant:"default"}))}catch(a){console.error("Error parsing job URL:",a)}if(!v||!v.trim()){u({title:"Job description required",description:"Please provide a job description or paste a job URL.",variant:"destructive"}),clearInterval(r),w(!1);return}const l=await pe.findHiringManagers({company:p,jobTitle:b,jobDescription:v,location:L,jobUrl:d||void 0,maxResults:T,generateEmails:!0,createDrafts:!0});if(console.log("🔍 API Response:",JSON.stringify(l,null,2)),console.log("🔍 Hiring managers found:",(s=l.hiringManagers)==null?void 0:s.length),console.log("🔍 First manager raw:",(o=l.hiringManagers)==null?void 0:o[0]),clearInterval(r),U(100),l.error){u({title:"Error finding hiring managers",description:l.error,variant:"destructive"}),w(!1);return}if(l.hiringManagers&&l.hiringManagers.length>0)try{const a=new Map;l.draftsCreated&&Array.isArray(l.draftsCreated)&&l.draftsCreated.forEach(t=>{const m=t.recruiter_email||t.recruiterEmail;m&&a.set(m.toLowerCase(),t)});const y=l.hiringManagers.map(t=>{const m=t.Email||t.email||t.WorkEmail||t.work_email||"",h={firstName:t.FirstName||t.firstName||t.first_name||"",lastName:t.LastName||t.lastName||t.last_name||"",linkedinUrl:t.LinkedIn||t.linkedin||t.linkedinUrl||t.linkedin_url||"",email:m,company:t.Company||t.company||p,jobTitle:t.Title||t.title||t.jobTitle||t.job_title||"",location:`${t.City||t.city||""}${(t.City||t.city)&&(t.State||t.state)?", ":""}${t.State||t.state||""}`.trim()||"",dateAdded:new Date().toISOString(),status:"Not Contacted"},ne=t.Phone||t.phone,oe=t.WorkEmail||t.work_email||t.workEmail,le=t.PersonalEmail||t.personal_email||t.personalEmail,I=b,de=d;if(ne&&(h.phone=ne),oe&&(h.workEmail=oe),le&&(h.personalEmail=le),I&&Z(I)&&(h.associatedJobTitle=I),de&&(h.associatedJobUrl=de),m){const f=a.get(m.toLowerCase());f&&(f.draft_id&&(h.gmailDraftId=f.draft_id),f.message_id&&(h.gmailMessageId=f.message_id),f.draft_url&&(h.gmailDraftUrl=f.draft_url))}return h});console.log("📋 Converted to Firebase format:",JSON.stringify(y,null,2));const ae=await ge.getRecruiters(n.uid),Re=new Set(ae.map(t=>t.email).filter(Boolean)),Ae=new Set(ae.map(t=>t.linkedinUrl).filter(Boolean)),j=y.filter(t=>{const m=t.email&&Re.has(t.email),h=t.linkedinUrl&&Ae.has(t.linkedinUrl);return!m&&!h});console.log("💾 About to save these recruiters:",j.length,JSON.stringify(j,null,2)),j.length>0?(await ge.bulkCreateRecruiters(n.uid,j),je(t=>t+j.length),console.log(`✅ Saved ${j.length} hiring manager(s) to tracker`),ve(t=>t+1),C("hiring-manager-tracker")):console.log("⚠️ All hiring managers were duplicates, nothing saved")}catch(a){console.error("Error saving hiring managers to tracker:",a),u({title:"Error saving to tracker",description:"Hiring managers were found but couldn't be saved. Please try again.",variant:"destructive"})}else console.log("⚠️ No hiring managers in response to save");const S=((g=l.hiringManagers)==null?void 0:g.length)||0,se=((ie=l.hiringManagers)==null?void 0:ie.length)||0;ye(S),S>0?u({title:`Found ${S} hiring manager${S!==1?"s":""}!`,description:l.draftsCreated&&l.draftsCreated.length>0?`${se} saved to tracker. Draft emails saved to your Gmail.`:`${se} saved to tracker.`}):u({title:"No hiring managers found",description:"Try adjusting your search criteria or company name.",variant:"default"}),w(!1),B(!0)}catch(p){clearInterval(r),w(!1);const b=p instanceof Error?p.message:"Failed to find hiring managers";u({title:"Error",description:b,variant:"destructive"})}},Ce=()=>{B(!1),C("hiring-manager-tracker")},Ne=()=>{B(!1),W(""),V(""),$(""),Y(""),q("")},re=e.jsxs(e.Fragment,{children:[e.jsx(Ze,{title:"Find Hiring Manager",description:"Find the recruiters and hiring managers behind any job posting. Paste a URL and get direct contact info in seconds.",videoId:"TIERqtjc1tk",children:e.jsx("main",{className:"px-3 py-6 sm:px-6 sm:py-12",style:{background:"#FFFFFF",flex:1,overflowY:"auto",paddingBottom:"96px"},children:e.jsxs("div",{children:[!z&&e.jsxs("div",{className:"w-full px-3 py-6 sm:px-6 sm:py-12 !pb-0",style:{maxWidth:"900px",margin:"0 auto"},children:[e.jsx("h1",{className:"text-[28px] sm:text-[42px]",style:{fontFamily:"'Lora', Georgia, serif",fontWeight:400,letterSpacing:"-0.025em",color:"#0F172A",textAlign:"center",marginBottom:"10px",lineHeight:1.1},children:"Find Hiring Managers"}),e.jsx("p",{style:{fontFamily:"'DM Sans', system-ui, sans-serif",fontSize:"16px",color:"#6B7280",textAlign:"center",marginBottom:"28px",lineHeight:1.5},children:"Paste a job posting URL and we'll find the recruiters and hiring managers for that role."}),e.jsx("div",{style:{display:"flex",justifyContent:"center"},children:e.jsx(Xe,{videoId:"TIERqtjc1tk"})})]}),e.jsx("div",{className:"animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100",children:e.jsxs(He,{value:P,onValueChange:C,className:"w-full",children:[e.jsx(he,{value:"find-hiring-managers",className:"mt-0",children:e.jsxs("div",{style:{padding:"0 32px 0",maxWidth:"860px"},children:[e.jsx("input",{type:"file",accept:qe.accept,onChange:Ee,className:"hidden",ref:N,disabled:c||F}),e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{style:{display:"flex",alignItems:"flex-start",gap:10,padding:"16px 20px",border:"1.5px solid transparent",borderRadius:14,background:"#F0F7FF",transition:"all .15s",minHeight:110},className:"focus-within:border-[#2563EB] focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(37,99,235,0.12)]",children:[e.jsx(Ue,{style:{width:16,height:16,flexShrink:0,color:"#3B82F6",marginTop:1}}),e.jsx("input",{type:"url",value:d,onChange:r=>{W(r.target.value),r.target.value.trim()&&Q(!1)},placeholder:"Paste a job posting URL (LinkedIn, Greenhouse, Lever, etc.)",disabled:c,style:{flex:1,border:"none",background:"none",fontSize:14,color:"#0F172A",outline:"none",fontFamily:"inherit",lineHeight:1.5}}),d&&Fe(d)&&e.jsx(M,{style:{width:15,height:15,flexShrink:0,color:"#22C55E",marginTop:1}})]})}),e.jsx("div",{style:{marginBottom:14},children:e.jsxs("div",{className:"flex items-center gap-2 text-xs text-[#6B7280]",children:[e.jsxs("span",{className:"inline-flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-[#FAFBFF] border border-[#E2E8F0] font-medium text-[#0F172A]",children:[15*T," credits"]}),e.jsxs("span",{children:["· finds ~",T," hiring managers"]})]})}),e.jsx("div",{style:{marginBottom:14},children:e.jsxs("button",{type:"button",onClick:()=>Q(!E),style:{fontSize:12,fontWeight:600,color:"#64748B",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",gap:5},children:[E?e.jsx(Te,{style:{width:13,height:13}}):e.jsx(Le,{style:{width:13,height:13}}),E?"Hide manual entry":"Or enter details manually"]})}),E&&!d&&e.jsxs("div",{style:{marginBottom:16,paddingTop:16,borderTop:"0.5px solid #E2E8F0"},children:[e.jsxs("div",{className:"grid grid-cols-1 md:grid-cols-3 gap-3 mb-3",children:[e.jsxs("div",{children:[e.jsx("label",{style:{display:"block",fontSize:11,fontWeight:500,color:"#6B7280",marginBottom:4},children:"Company"}),e.jsx("input",{type:"text",value:k,onChange:r=>V(r.target.value),placeholder:"e.g. Google",disabled:c,style:{width:"100%",padding:"8px 12px",border:"1.5px solid #E2E8F0",borderRadius:3,fontSize:13,color:"#0F172A",background:"#FAFBFF",outline:"none",fontFamily:"inherit"}})]}),e.jsxs("div",{children:[e.jsx("label",{style:{display:"block",fontSize:11,fontWeight:500,color:"#6B7280",marginBottom:4},children:"Job Title"}),e.jsx("input",{type:"text",value:R,onChange:r=>$(r.target.value),placeholder:"e.g. Product Manager",disabled:c,style:{width:"100%",padding:"8px 12px",border:"1.5px solid #E2E8F0",borderRadius:3,fontSize:13,color:"#0F172A",background:"#FAFBFF",outline:"none",fontFamily:"inherit"}})]}),e.jsxs("div",{children:[e.jsx("label",{style:{display:"block",fontSize:11,fontWeight:500,color:"#6B7280",marginBottom:4},children:"Location"}),e.jsx("input",{type:"text",value:G,onChange:r=>Y(r.target.value),placeholder:"e.g. New York, NY",disabled:c,style:{width:"100%",padding:"8px 12px",border:"1.5px solid #E2E8F0",borderRadius:3,fontSize:13,color:"#0F172A",background:"#FAFBFF",outline:"none",fontFamily:"inherit"}})]})]}),e.jsxs("div",{children:[e.jsxs("label",{style:{display:"block",fontSize:11,fontWeight:500,color:"#6B7280",marginBottom:4},children:["Job Description ",e.jsx("span",{style:{color:"#EF4444"},children:"*"})]}),e.jsx("textarea",{value:A,onChange:r=>q(r.target.value),placeholder:"Paste the job description or role summary here.",rows:4,disabled:c,style:{width:"100%",padding:"10px 12px",border:"1.5px solid #E2E8F0",borderRadius:3,fontSize:13,color:"#0F172A",background:"#FAFBFF",outline:"none",resize:"none",fontFamily:"inherit"}})]})]}),e.jsx("button",{ref:X,onClick:te,disabled:!x,style:{width:"100%",height:52,borderRadius:12,background:x?"#2563EB":"#E2E8F0",color:x?"#fff":"#94A3B8",border:"none",fontSize:15,fontWeight:600,cursor:x?"pointer":"not-allowed",display:"flex",alignItems:"center",justifyContent:"center",gap:8,transition:"all .15s",fontFamily:"inherit"},children:c?e.jsxs(e.Fragment,{children:[e.jsx(Ie,{className:"w-4 h-4 animate-spin"}),e.jsx("span",{children:"Finding hiring managers..."})]}):e.jsxs(e.Fragment,{children:[e.jsx(ce,{className:"w-4 h-4"}),e.jsx("span",{children:"Find hiring managers"})]})}),e.jsx("div",{style:{display:"flex",justifyContent:"center",marginTop:10},children:D&&H?e.jsxs("button",{onClick:()=>{var r;return(r=N.current)==null?void 0:r.click()},disabled:c||F,style:{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"none",border:"none",fontFamily:"inherit"},children:[e.jsx(M,{style:{width:11,height:11,color:"#22C55E"}}),"Resume: ",e.jsx("span",{style:{fontWeight:500},children:H}),e.jsx("span",{style:{color:"#3B82F6",marginLeft:2},children:F?"Uploading...":"· Change"})]}):e.jsxs("button",{onClick:()=>{var r;return(r=N.current)==null?void 0:r.click()},style:{fontSize:11,color:"#94A3B8",display:"flex",alignItems:"center",gap:4,cursor:"pointer",background:"none",border:"none",fontFamily:"inherit"},children:[e.jsx(Me,{style:{width:11,height:11}}),F?"Uploading...":"Upload resume (required for personalized emails)"]})})]})}),e.jsx(he,{value:"hiring-manager-tracker",className:"mt-0",children:e.jsx("div",{className:"animate-fadeInUp",style:{animationDelay:"200ms",maxWidth:"900px",margin:"0 auto"},children:e.jsx("div",{className:"py-4",children:e.jsx(ze,{},we)})})})]})})]})})}),c&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-[3px] p-8 max-w-md text-center",children:[e.jsx("div",{className:"w-16 h-16 bg-[#FAFBFF] rounded-[3px] flex items-center justify-center mx-auto mb-4",children:e.jsx(ce,{className:"w-8 h-8 text-[#0F172A] animate-pulse"})}),e.jsx("h3",{className:"text-xl font-semibold text-[#0F172A] mb-2",style:{fontFamily:"'Lora', Georgia, serif"},children:"Finding hiring managers..."}),e.jsx("p",{className:"text-[#6B7280] mb-4",children:d?"Analyzing the job posting and identifying decision makers":`Searching for hiring managers at ${k}`}),e.jsx("div",{className:"w-full bg-[#E2E8F0] rounded-[3px] h-2",children:e.jsx("div",{className:"bg-[#3B82F6] h-2 rounded-[3px] transition-all duration-300",style:{width:`${be}%`}})}),e.jsx("p",{className:"text-sm text-[#6B7280] mt-3",children:"This usually takes 15-30 seconds"})]})}),xe&&e.jsx("div",{className:"fixed inset-0 bg-black/50 flex items-center justify-center z-50",children:e.jsxs("div",{className:"bg-white rounded-[3px] p-8 max-w-md text-center animate-scaleIn",children:[e.jsx("div",{className:"w-16 h-16 bg-green-100 rounded-[3px] flex items-center justify-center mx-auto mb-4",children:e.jsx(M,{className:"w-10 h-10 text-green-600"})}),e.jsxs("h3",{className:"text-xl font-semibold text-[#0F172A] mb-1",style:{fontFamily:"'Lora', Georgia, serif"},children:["Found ",K," hiring manager",K!==1?"s":"","!"]}),e.jsxs("p",{className:"text-[#6B7280] mb-2",children:[R||"Role"," at ",k||"Company"]}),e.jsx("p",{className:"text-sm text-[#6B7280] font-medium mb-6",children:"Draft emails saved to your Gmail"}),e.jsxs("div",{className:"flex flex-col sm:flex-row gap-3 justify-center",children:[e.jsx("button",{onClick:Ce,className:"px-6 py-3 bg-[#3B82F6] text-white font-semibold rounded-[3px] hover:bg-[#2563EB] transition-all",children:"View Hiring Managers →"}),e.jsx("button",{onClick:Ne,className:"px-6 py-3 bg-[#FAFBFF] text-[#6B7280] font-semibold rounded-[3px] hover:bg-[#EEF2F8] transition-colors",children:"Search again"})]})]})}),e.jsx("style",{children:`
        @media (max-width: 768px) {
          /* 1. PAGE/BODY LEVEL - Prevent horizontal overflow */
          html, body {
            overflow-x: hidden;
            max-width: 100vw;
          }

          .recruiter-search-page {
            overflow-x: hidden;
            max-width: 100vw;
          }

          /* 2. ALL MAIN CONTENT CONTAINERS */
          .recruiter-search-container {
            max-width: 100vw;
            width: 100%;
            box-sizing: border-box;
            padding-left: 16px;
            padding-right: 16px;
          }

          /* 3. HEADER SECTION - Ensure padding so text doesn't touch edges */
          .recruiter-search-header {
            padding-left: 16px;
            padding-right: 16px;
            box-sizing: border-box;
          }

          .recruiter-search-title {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 1.75rem !important;
          }

          .recruiter-search-subtitle {
            word-wrap: break-word;
            overflow-wrap: break-word;
            font-size: 0.875rem !important;
          }

          /* 4. TAB BARS - Ensure doesn't overflow */
          .recruiter-search-tabs {
            max-width: 100%;
            width: 100%;
            overflow-x: auto;
            overflow-y: hidden;
            -webkit-overflow-scrolling: touch;
            scrollbar-width: none;
            -ms-overflow-style: none;
            padding: 8px !important;
            justify-content: flex-start;
          }

          .recruiter-search-tabs::-webkit-scrollbar {
            display: none;
          }

          .recruiter-search-tabs button {
            min-width: fit-content;
            min-height: 44px;
            flex-shrink: 0;
            white-space: nowrap;
          }

          /* 5. FORM CARDS - Full width with proper padding */
          .recruiter-search-form-card {
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-form-content {
            padding: 16px !important;
            box-sizing: border-box;
          }

          /* 6. ALL CHILD ELEMENTS - Ensure no fixed widths exceed viewport */
          .recruiter-search-page * {
            max-width: 100%;
            box-sizing: border-box;
          }

          .recruiter-search-page img,
          .recruiter-search-page .recruiter-search-form-card,
          .recruiter-search-page button,
          .recruiter-search-page input,
          .recruiter-search-page textarea,
          .recruiter-search-page select {
            max-width: 100%;
            box-sizing: border-box;
          }

          /* Prevent text overflow */
          .recruiter-search-page p,
          .recruiter-search-page h1,
          .recruiter-search-page h2,
          .recruiter-search-page h3,
          .recruiter-search-page span,
          .recruiter-search-page label {
            word-wrap: break-word;
            overflow-wrap: break-word;
            hyphens: auto;
          }
        }
      `}),P==="find-hiring-managers"&&e.jsx(et,{originalButtonRef:X,onClick:te,isLoading:c,disabled:!x,buttonClassName:"rounded-[3px]",children:e.jsx("span",{children:"Find Hiring Managers"})})]});return z?re:e.jsx(Pe,{children:e.jsxs("div",{className:"flex min-h-screen w-full text-foreground",children:[e.jsx(De,{}),e.jsxs(Qe,{children:[e.jsx(_e,{title:""}),re]})]})})};export{mt as default};
