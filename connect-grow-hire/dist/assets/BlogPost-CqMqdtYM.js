import{Y as n,j as e,W as p,y as c,z as s,cj as m,ck as d}from"./vendor-react-RPIM82HW.js";import{o as x}from"./index-DRWzIRfN.js";import{a as f}from"./blog-vj4KZd67.js";import{S as g,g as h,B as u,E as y}from"./generateMeta-B3XYevy2.js";const B=()=>{var a;const{slug:r}=n(),o=r?f(r):void 0;if(!o)return e.jsx(p,{to:"/blog",replace:!0});const i={"@context":"https://schema.org","@type":"Article",headline:o.title,description:o.description,datePublished:o.date,dateModified:o.date,url:`https://www.offerloop.ai/blog/${o.slug}`,author:{"@type":"Organization",name:"Offerloop Team",url:"https://www.offerloop.ai"},publisher:{"@type":"Organization",name:"Offerloop",url:"https://www.offerloop.ai"},mainEntityOfPage:{"@type":"WebPage","@id":`https://www.offerloop.ai/blog/${o.slug}`}},l=(a=o.faqSchema)!=null&&a.length?{"@context":"https://schema.org","@type":"FAQPage",mainEntity:o.faqSchema.map(t=>({"@type":"Question",name:t.question,acceptedAnswer:{"@type":"Answer",text:t.answer}}))}:null;return e.jsxs("div",{className:"min-h-screen w-full",style:{fontFamily:"'DM Sans', system-ui, sans-serif",background:"#FFFFFF"},children:[e.jsx(g,{...h("blog",{slug:o.slug,title:o.title,description:o.description}),ogType:"article"}),e.jsxs(c,{children:[e.jsx("meta",{name:"keywords",content:o.keywords}),e.jsx("script",{type:"application/ld+json",children:JSON.stringify(i)}),l&&e.jsx("script",{type:"application/ld+json",children:JSON.stringify(l)})]}),e.jsxs("nav",{className:"w-full px-6 py-5 flex items-center justify-between",style:{maxWidth:"1100px",margin:"0 auto"},children:[e.jsx(s,{to:"/",className:"text-xl font-bold",style:{color:"#0F172A",letterSpacing:"-0.02em"},children:e.jsx("img",{src:x,alt:"Offerloop",style:{height:"64px",width:"auto"}})}),e.jsx(s,{to:"/blog",className:"text-sm font-medium",style:{color:"#64748B"},children:"← Back to Blog"})]}),e.jsxs("header",{className:"px-6 pt-16 pb-8",style:{maxWidth:"720px",margin:"0 auto"},children:[e.jsx(s,{to:"/blog",className:"text-sm font-medium mb-4 inline-block",style:{color:"#3B82F6",letterSpacing:"0.02em"},children:"BLOG"}),e.jsx("h1",{style:{fontFamily:"'Lora', Georgia, serif",fontSize:"clamp(32px, 5vw, 48px)",fontWeight:400,lineHeight:1.15,letterSpacing:"-0.025em",color:"#0F172A",marginBottom:"16px"},children:o.title}),e.jsxs("div",{className:"flex items-center gap-3",children:[e.jsx("span",{className:"text-sm",style:{color:"#94A3B8"},children:new Date(o.date).toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"})}),e.jsx("span",{style:{color:"#E2E8F0"},children:"·"}),e.jsx("span",{className:"text-sm",style:{color:"#94A3B8"},children:"Offerloop Team"})]})]}),e.jsx("article",{className:"px-6 pb-16",style:{maxWidth:"720px",margin:"0 auto"},children:e.jsx("div",{className:"prose-offerloop",children:e.jsx(m,{remarkPlugins:[d],children:o.content})})}),e.jsx("section",{className:"px-6 py-16",style:{background:"#FAFBFF"},children:e.jsxs("div",{className:"text-center",style:{maxWidth:"520px",margin:"0 auto"},children:[e.jsx("h2",{style:{fontFamily:"'Lora', Georgia, serif",fontSize:"clamp(28px, 4vw, 36px)",fontWeight:400,lineHeight:1.15,color:"#0F172A",marginBottom:"16px"},children:"Skip the manual work"}),e.jsx("p",{style:{fontSize:"15px",color:"#64748B",marginBottom:"28px"},children:"Offerloop finds verified emails, writes personalized messages, and sends through Gmail. Try it free."}),e.jsx(s,{to:"/signin?mode=signup",className:"inline-flex items-center gap-2 px-7 py-3.5 rounded-[3px] text-white font-semibold text-base hover:shadow-lg transition-all",style:{background:"#3B82F6"},children:"Create free account"})]})}),e.jsx("footer",{className:"py-10 px-6",style:{borderTop:"1px solid #E2E8F0"},children:e.jsxs("div",{className:"flex flex-col md:flex-row justify-between items-center gap-4",style:{maxWidth:"1100px",margin:"0 auto"},children:[e.jsxs("p",{className:"text-sm",style:{color:"#94A3B8"},children:["© ",new Date().getFullYear()," Offerloop. All rights reserved."]}),e.jsx("div",{className:"flex gap-6",children:[{label:"About",path:"/about"},{label:"Pricing",path:"/pricing"},{label:"Privacy",path:"/privacy"},{label:"Terms",path:"/terms-of-service"}].map(t=>e.jsx(s,{to:t.path,className:"text-sm",style:{color:"#94A3B8"},children:t.label},t.path))})]})}),e.jsx(u,{}),e.jsx(y,{}),e.jsx("style",{children:`
        .prose-offerloop h2 {
          font-family: 'Lora', Georgia, serif;
          font-size: 28px;
          font-weight: 400;
          color: #0F172A;
          margin-top: 40px;
          margin-bottom: 16px;
          line-height: 1.3;
        }
        .prose-offerloop h3 {
          font-size: 20px;
          font-weight: 600;
          color: #0F172A;
          margin-top: 32px;
          margin-bottom: 12px;
          line-height: 1.4;
        }
        .prose-offerloop p {
          font-size: 15px;
          line-height: 1.8;
          color: #475569;
          margin-bottom: 16px;
        }
        .prose-offerloop ul, .prose-offerloop ol {
          margin-bottom: 16px;
          padding-left: 24px;
        }
        .prose-offerloop li {
          font-size: 15px;
          line-height: 1.8;
          color: #475569;
          margin-bottom: 6px;
        }
        .prose-offerloop strong {
          color: #0F172A;
          font-weight: 600;
        }
        .prose-offerloop blockquote {
          border-left: 3px solid #3B82F6;
          padding-left: 16px;
          margin: 24px 0;
          font-style: italic;
          color: #64748B;
        }
        .prose-offerloop code {
          background: #F1F5F9;
          padding: 2px 6px;
          border-radius: 4px;
          font-size: 13px;
          color: #334155;
        }
        .prose-offerloop pre {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 8px;
          padding: 16px;
          overflow-x: auto;
          margin-bottom: 16px;
        }
        .prose-offerloop pre code {
          background: none;
          padding: 0;
        }
        .prose-offerloop a {
          color: #3B82F6;
          text-decoration: underline;
        }
        .prose-offerloop hr {
          border: none;
          border-top: 1px solid #E2E8F0;
          margin: 32px 0;
        }
      `})]})};export{B as default};
