var N=Object.defineProperty;var H=(o,e,t)=>e in o?N(o,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):o[e]=t;var h=(o,e,t)=>H(o,typeof e!="symbol"?e+"":e,t);import{r as T,s as R}from"../chunks/domScanner-C3PC8FwL.js";const C=3e3,F=50,z=30;function f(o){return!!(o.closest("#privai-assistant-root")||o.closest("#privai-overlay-container"))}function G(){var i;const o=document.querySelector('main, [role="main"], article, .content, #content')||document.body;if(f(o))return"";const e=document.createTreeWalker(o,NodeFilter.SHOW_TEXT,{acceptNode:n=>{var g;const r=n.parentElement;if(!r||f(r))return NodeFilter.FILTER_REJECT;const a=r.tagName;if(["SCRIPT","STYLE","NOSCRIPT","SVG","META","LINK"].includes(a))return NodeFilter.FILTER_REJECT;const l=window.getComputedStyle(r);if(l.display==="none"||l.visibility==="hidden")return NodeFilter.FILTER_REJECT;const u=(g=n.textContent)==null?void 0:g.trim();return!u||u.length===0?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT}}),t=[];let s=0;for(;e.nextNode()&&s<C;){const n=((i=e.currentNode.textContent)==null?void 0:i.trim())||"";n.length>0&&(t.push(n),s+=n.length)}return t.join(" ").replace(/\s+/g," ").trim().slice(0,C)}function V(){var t;const o=[],e=document.querySelectorAll("h1, h2, h3, h4, h5, h6");for(const s of e){if(f(s))continue;const i=(t=s.textContent)==null?void 0:t.trim();i&&o.push({level:parseInt(s.tagName[1]),text:i.slice(0,200),id:s.id||void 0})}return o}function K(){var s;const o=[],e=new Set,t=document.querySelectorAll("a[href]");for(const i of t){if(f(i))continue;const n=i,r=(s=n.textContent)==null?void 0:s.trim(),a=n.href;if(!r||!a||a==="#"||a.startsWith("javascript:"))continue;const l=`${r}:${a}`;if(e.has(l))continue;e.add(l);const u=!a.startsWith(window.location.origin);o.push({text:r.slice(0,200),href:a,isExternal:u})}return o}function W(){const o=[],e=document.querySelectorAll("form");for(const t of e){if(f(t))continue;const s=[],i=t.querySelectorAll("input, textarea, select");for(const n of i){if(n instanceof HTMLInputElement&&n.type==="hidden")continue;const r=U(n);s.push({label:r,type:n.type||n.tagName.toLowerCase(),name:n.name||"",placeholder:n.placeholder||"",required:n.required||!1,value:n.value||""})}s.length>0&&o.push({action:t.action||"",method:(t.method||"GET").toUpperCase(),fields:s})}return o}function U(o){var s,i;const e=o.getAttribute("aria-label");if(e)return e;if(o.id){const n=document.querySelector(`label[for="${o.id}"]`);if(n)return((s=n.textContent)==null?void 0:s.trim())||""}const t=o.closest("label");return t?((i=t.textContent)==null?void 0:i.trim())||"":o.placeholder||o.name||""}function Y(){var t,s,i,n;const o=[],e=document.querySelectorAll("table");for(const r of e){if(f(r))continue;const a=(s=(t=r.querySelector("caption"))==null?void 0:t.textContent)==null?void 0:s.trim(),l=[],u=[],g=r.querySelectorAll("thead th, tr:first-child th");for(const b of g)l.push(((i=b.textContent)==null?void 0:i.trim())||"");const k=r.querySelector("tbody"),c=k?k.querySelectorAll("tr"):r.querySelectorAll("tr:not(:first-child)");let p=0;for(const b of c){if(p>=z)break;const y=[],M=b.querySelectorAll("td, th");if(M.length!==0){for(const q of M)y.push(((n=q.textContent)==null?void 0:n.trim().slice(0,100))||"");u.push(y),p++}}(l.length>0||u.length>0)&&o.push({caption:a,headers:l,rows:u})}return o}function X(){var t;const o=[],e=document.querySelectorAll("ul, ol");for(const s of e){if(f(s)||s.closest("nav"))continue;const i=[],n=s.querySelectorAll(":scope > li");let r=0;for(const a of n){if(r>=F)break;const l=(t=a.textContent)==null?void 0:t.trim().slice(0,200);l&&(i.push(l),r++)}i.length>1&&o.push(i)}return o}function j(){const o=[],e=document.querySelectorAll("img");for(const t of e){if(f(t)||!t.src||t.src.startsWith("data:"))continue;const s=t.getBoundingClientRect();s.width<30||s.height<30||o.push({alt:t.alt||"",src:t.src,width:Math.round(s.width),height:Math.round(s.height)})}return o}function J(){const o=e=>{const t=document.querySelector(`meta[name="${e}"], meta[property="og:${e}"]`);return(t==null?void 0:t.content)||void 0};return{description:o("description"),keywords:o("keywords"),author:o("author"),language:document.documentElement.lang||void 0}}function Z(){return{title:document.title,url:window.location.href,mainText:G(),headings:V(),links:K(),forms:W(),tables:Y(),images:j(),lists:X(),metadata:J()}}let d=null;function A(o,e,t=!1){if(!o){d&&(d.remove(),d=null);return}d?d.innerHTML="":(d=document.createElement("div"),d.id="privai-overlay-container",d.style.position="absolute",d.style.top="0",d.style.left="0",d.style.width="100%",d.style.height="100%",d.style.pointerEvents="none",d.style.zIndex="999999",document.body.appendChild(d)),e.forEach(s=>{if(!s.bbox)return;const i=document.createElement("div");i.style.position="absolute",i.style.left=`${s.bbox.x}px`,i.style.top=`${s.bbox.y}px`,i.style.width=`${s.bbox.width}px`,i.style.height=`${s.bbox.height}px`,t?(i.style.border="2px solid rgba(0, 255, 0, 0.9)",i.style.backgroundColor="rgba(0, 255, 0, 0.1)"):(i.style.border="2px solid rgba(255, 0, 0, 0.7)",i.style.backgroundColor="rgba(255, 0, 0, 0.1)"),i.style.boxSizing="border-box";const n=document.createElement("div");t?(n.textContent=`${s.className||s.type||"vision"} ${(s.confidence||0).toFixed(2)}`,n.style.backgroundColor="rgba(0, 255, 0, 0.9)",n.style.color="black"):(n.textContent=s.id||s.element_id,n.style.backgroundColor="rgba(255, 0, 0, 0.8)",n.style.color="white"),n.style.position="absolute",n.style.top="-20px",n.style.left="-2px",n.style.fontSize="12px",n.style.padding="2px 4px",n.style.borderRadius="2px",n.style.whiteSpace="nowrap",i.appendChild(n),d.appendChild(i)})}let S=null,E=0,I=0,O=[];function Q(){S||(S=new MutationObserver(o=>{const e=o.filter(t=>{var i,n;const s=t.target;return!((i=s.closest)!=null&&i.call(s,"#privai-assistant-root")||(n=s.closest)!=null&&n.call(s,"#privai-overlay-container"))});if(e.length>0){E+=e.length,I=Date.now();for(const t of O)try{t()}catch{}}}),S.observe(document.body,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["class","style","hidden","aria-hidden","disabled","checked","value"],characterData:!0}),window.addEventListener("popstate",L),window.addEventListener("hashchange",L))}function L(){E++,I=Date.now();for(const o of O)try{o()}catch{}}function $(o=300,e=3e3){return new Promise(t=>{const s=Date.now();let i;const n=E,r=()=>{const a=Date.now()-s,l=Date.now()-I,u=E>n;if(l>=o||!u){clearInterval(i),t(!0);return}if(a>=e){clearInterval(i),t(!1);return}};i=setInterval(r,50),r()})}function ee(o,e=5e3){return new Promise(t=>{const s=document.querySelector(o);if(s){t(s);return}let i=!1;const n=new MutationObserver(()=>{if(i)return;const r=document.querySelector(o);r&&(i=!0,n.disconnect(),t(r))});n.observe(document.body,{childList:!0,subtree:!0}),setTimeout(()=>{i||(i=!0,n.disconnect(),t(null))},e)})}async function te(o){switch(o.action){case"click":if(!o.target)throw new Error("Click requires a target");await oe(o.target);break;case"type":if(!o.target)throw new Error("Type requires a target");if(o.text===void 0)throw new Error("Type requires text");await se(o.target,o.text);break;case"scroll":re(o.direction||"down",o.amount||500);break;case"scroll_to_element":if(!o.target)throw new Error("scroll_to_element requires a target");await ae(o.target);break;case"scroll_to_top":_("top");break;case"scroll_to_bottom":_("bottom");break;case"navigate":if(!o.url)throw new Error("Navigate requires a url");de(o.url);break;case"go_back":ue();break;case"select":if(!o.target)throw new Error("Select requires a target");if(!o.value)throw new Error("Select requires a value");await le(o.target,o.value);break;case"check":if(!o.target)throw new Error("Check requires a target");await D(o.target,!0);break;case"uncheck":if(!o.target)throw new Error("Uncheck requires a target");await D(o.target,!1);break;case"press_key":if(!o.key)throw new Error("press_key requires a key");ce(o.key,o.target);break;case"extract":break;case"wait_for_element":if(!o.target)throw new Error("wait_for_element requires a target selector");await ee(o.target,5e3);break;case"wait":case"read_page":case"finish":case"ask_user":break;default:throw new Error(`Unsupported action: ${o.action}`)}await $(250,2e3)}function v(o){var r;if(!o)return null;const e=o.match(/^\[?(\d+)\]?$/);if(e){const a=T.findElementByIndex(parseInt(e[1]));if(a)return a}const t=T.findElementById(o)||T.findElementByDescription(o);if(t)return t;let s=document.querySelector(`[data-agent-id="${o}"]`);if(s||(s=document.getElementById(o),s)||(s=document.querySelector(`[name="${o}"]`),s))return s;try{if(s=document.querySelector(o),s)return s}catch{}try{if(s=document.querySelector(`[aria-label="${o}" i], [placeholder="${o}" i], [title="${o}" i]`),s)return s}catch{}try{if(s=document.querySelector(`[data-agent-id*="${o}"], [id*="${o}"]`),s)return s}catch{}const i=document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"], label, select, [tabindex]'),n=o.toLowerCase();for(const a of i){const l=((r=a.textContent)==null?void 0:r.trim().toLowerCase())||"";if(l&&(l===n||l.includes(n)))return a}return null}async function w(o){let e=v(o);if(e)return e;if(typeof window.scrollBy=="function"){if(window.scrollBy({top:400,behavior:"smooth"}),await new Promise(t=>setTimeout(t,400)),e=v(o),e||(window.scrollBy({top:-800,behavior:"smooth"}),await new Promise(t=>setTimeout(t,400)),e=v(o),e))return e;window.scrollBy({top:400,behavior:"smooth"})}throw new Error(`Target element "${o}" not found on page after scroll retry`)}async function oe(o){const e=await w(o);if(e instanceof HTMLElement&&typeof e.scrollIntoView=="function"&&(e.scrollIntoView({behavior:"smooth",block:"center"}),await new Promise(t=>setTimeout(t,200))),e instanceof HTMLButtonElement&&e.disabled)throw new Error(`Target element "${o}" is disabled`);e instanceof HTMLElement?(typeof e.focus=="function"&&e.focus(),e.click()):e.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window}))}async function se(o,e){var s,i,n;const t=await w(o);if(!(t instanceof HTMLInputElement)&&!(t instanceof HTMLTextAreaElement)&&!t.hasAttribute("contenteditable"))throw new Error(`Target element "${o}" is not an editable field`);if(t.readOnly)throw new Error(`Target element "${o}" is marked readonly`);if(t instanceof HTMLInputElement&&t.type==="password")throw new Error(`Safety violation: Cannot type into password field "${o}"`);if(t instanceof HTMLElement&&(typeof t.scrollIntoView=="function"&&(t.scrollIntoView({behavior:"smooth",block:"center"}),await new Promise(r=>setTimeout(r,150))),typeof t.focus=="function"&&t.focus()),t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement){const r=t instanceof HTMLTextAreaElement?(s=window.HTMLTextAreaElement)==null?void 0:s.prototype:(i=window.HTMLInputElement)==null?void 0:i.prototype,a=r?(n=Object.getOwnPropertyDescriptor(r,"value"))==null?void 0:n.set:null;a?a.call(t,e):t.value=e,t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0})),ne(t)&&(await new Promise(l=>setTimeout(l,100)),ie(t))}else t instanceof HTMLElement&&t.hasAttribute("contenteditable")&&(t.textContent=e,t.dispatchEvent(new Event("input",{bubbles:!0})))}function ne(o){const e=(o.getAttribute("name")||"").toLowerCase(),t=(o.id||"").toLowerCase(),s=(o.getAttribute("placeholder")||"").toLowerCase();return(o instanceof HTMLInputElement?o.type:"")==="search"||e==="q"||e==="search_query"||e==="search"||t.includes("search")||s.includes("search")}function ie(o){const e={key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0};o.dispatchEvent(new KeyboardEvent("keydown",e)),o.dispatchEvent(new KeyboardEvent("keypress",e)),o.dispatchEvent(new KeyboardEvent("keyup",e));const t=o.closest("form");if(t)try{typeof t.requestSubmit=="function"?t.requestSubmit():t.submit()}catch{}else{const s=document.querySelector('button#search-icon-legacy, button[aria-label="Search" i], button[type="submit"], input[type="submit"]');s&&setTimeout(()=>s.click(),100)}}function P(){const o=document.querySelectorAll('main, [role="main"], article, #content, .content, #app, #root');for(const e of o)if(e.scrollHeight>e.clientHeight&&e.clientHeight>200)try{const t=window.getComputedStyle(e);if(t&&["auto","scroll"].includes(t.overflowY))return e}catch{}return null}function re(o,e){const t=o==="up"?-e:o==="down"?e:0,s=o==="left"?-e:o==="right"?e:0,i=typeof window.scrollY=="number"?window.scrollY:0;typeof window.scrollBy=="function"&&window.scrollBy({top:t,left:s,behavior:"smooth"}),setTimeout(()=>{if(typeof window.scrollY=="number"&&window.scrollY===i&&t!==0){const n=P()||document.scrollingElement||document.documentElement||document.body;n&&typeof n.scrollBy=="function"&&n.scrollBy({top:t,left:s,behavior:"smooth"})}},50)}function _(o){var i,n;const e=o==="top",t=e?0:Math.max(((i=document.documentElement)==null?void 0:i.scrollHeight)||0,((n=document.body)==null?void 0:n.scrollHeight)||0);typeof window.scrollTo=="function"&&window.scrollTo({top:t,behavior:"smooth"});const s=P()||document.scrollingElement||document.documentElement||document.body;s&&typeof s.scrollTo=="function"&&s.scrollTo({top:e?0:s.scrollHeight,behavior:"smooth"})}async function ae(o){const e=await w(o);e instanceof HTMLElement&&typeof e.scrollIntoView=="function"&&(e.scrollIntoView({behavior:"smooth",block:"center"}),await new Promise(t=>setTimeout(t,300)))}async function le(o,e){const t=await w(o);if(!(t instanceof HTMLSelectElement))throw new Error(`Target element "${o}" is not a select element`);let s=!1;for(const i of t.options)if(i.value===e||i.text.toLowerCase().includes(e.toLowerCase())){t.value=i.value,s=!0;break}if(!s)throw new Error(`Option "${e}" not found in select element "${o}"`);t.dispatchEvent(new Event("change",{bubbles:!0})),t.dispatchEvent(new Event("input",{bubbles:!0}))}async function D(o,e){const t=await w(o);if(!(t instanceof HTMLInputElement)||t.type!=="checkbox"&&t.type!=="radio")throw new Error(`Target element "${o}" is not a checkbox or radio button`);t.checked!==e&&(t.checked=e,t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0})))}function ce(o,e){const t=e?v(e):document.activeElement||document.body;if(!t)throw new Error("No element to send key event to");const i={enter:{key:"Enter",code:"Enter",keyCode:13},escape:{key:"Escape",code:"Escape",keyCode:27},tab:{key:"Tab",code:"Tab",keyCode:9},space:{key:" ",code:"Space",keyCode:32},backspace:{key:"Backspace",code:"Backspace",keyCode:8},delete:{key:"Delete",code:"Delete",keyCode:46},arrowup:{key:"ArrowUp",code:"ArrowUp",keyCode:38},arrowdown:{key:"ArrowDown",code:"ArrowDown",keyCode:40},arrowleft:{key:"ArrowLeft",code:"ArrowLeft",keyCode:37},arrowright:{key:"ArrowRight",code:"ArrowRight",keyCode:39}}[o.toLowerCase()]||{key:o,code:o,keyCode:0},n={...i,which:i.keyCode,bubbles:!0,cancelable:!0};t.dispatchEvent(new KeyboardEvent("keydown",n)),t.dispatchEvent(new KeyboardEvent("keypress",n)),t.dispatchEvent(new KeyboardEvent("keyup",n))}function de(o){window.location.href=o}function ue(){window.history.back()}class pe{constructor(){h(this,"host",null);h(this,"shadow",null);h(this,"isOpen",!1);h(this,"isVisionOverlayActive",!1);h(this,"failureModeActive",!1);h(this,"messages",[]);h(this,"lastProcessedTimelineIndex",-1);h(this,"isThinking",!1);h(this,"userIsNearBottom",!0);h(this,"hasUnreadBelow",!1);this.loadStateFromStorage(),this.init()}loadStateFromStorage(){try{const e=sessionStorage.getItem("privai_chat_messages");e&&(this.messages=JSON.parse(e)),sessionStorage.getItem("privai_widget_open")==="true"&&(this.isOpen=!0)}catch{this.messages=[]}}saveStateToStorage(){try{sessionStorage.setItem("privai_chat_messages",JSON.stringify(this.messages)),sessionStorage.setItem("privai_widget_open",this.isOpen?"true":"false")}catch{}}init(){var e;if(document.getElementById("privai-assistant-root")){console.log("[PrivAI Chat] Singleton instance already mounted on this page");return}this.host=document.createElement("div"),this.host.id="privai-assistant-root",this.host.style.position="fixed",this.host.style.bottom="0",this.host.style.right="0",this.host.style.zIndex="2147483647",this.host.style.pointerEvents="none",document.body.appendChild(this.host),this.shadow=this.host.attachShadow({mode:"open"}),this.render(),this.setupListeners(),console.log("[PrivAI Chat] Assistant widget mounted cleanly into Shadow DOM"),this.messages.length===0?this.addMessage({id:"msg_welcome",sender:"assistant",text:"Hello! I am PrivAI, your on-device Privacy Browser Assistant. You can ask me to fill forms, search documentation, answer questions about this page, or navigate—while ensuring zero sensitive data ever leaves your machine unredacted.",badge:"Zero Raw PII Egress",badgeType:"success",timestamp:Date.now()},!0):this.renderMessages(!0);try{typeof chrome<"u"&&((e=chrome.runtime)!=null&&e.sendMessage)&&chrome.runtime.sendMessage({type:"GET_STATUS"},t=>{t!=null&&t.success&&t.data&&this.updateState(t.data)})}catch{}}render(){this.shadow&&(this.shadow.innerHTML=`
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        }

        .floating-btn {
          position: fixed;
          bottom: 24px;
          right: 24px;
          display: flex;
          align-items: center;
          gap: 10px;
          background: linear-gradient(135deg, #10b981 0%, #059669 100%);
          color: white;
          padding: 12px 20px;
          border-radius: 9999px;
          border: none;
          box-shadow: 0 8px 24px rgba(16, 185, 129, 0.4), 0 2px 6px rgba(0, 0, 0, 0.2);
          cursor: pointer;
          font-size: 14px;
          font-weight: 700;
          pointer-events: auto;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          user-select: none;
        }

        .floating-btn:hover {
          transform: translateY(-2px) scale(1.03);
          box-shadow: 0 12px 28px rgba(16, 185, 129, 0.5);
        }

        .floating-btn .robot-icon {
          font-size: 18px;
        }

        .floating-btn .pulse-dot {
          width: 8px;
          height: 8px;
          background-color: #34d399;
          border-radius: 50%;
          animation: pulse 2s infinite;
        }

        @keyframes pulse {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(52, 211, 153, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
        }

        .chat-dialog {
          position: fixed;
          bottom: 84px;
          right: 24px;
          width: 400px;
          max-width: calc(100vw - 48px);
          height: 580px;
          max-height: calc(100vh - 110px);
          background: #0f172a;
          color: #f8fafc;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          box-shadow: 0 24px 48px rgba(0, 0, 0, 0.6), 0 4px 12px rgba(0, 0, 0, 0.3);
          display: flex;
          flex-direction: column;
          overflow: hidden;
          pointer-events: auto;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          opacity: 0;
          transform: translateY(16px) scale(0.96);
          visibility: hidden;
          position: fixed;
        }

        .chat-dialog.open {
          opacity: 1;
          transform: translateY(0) scale(1);
          visibility: visible;
        }

        .dialog-header {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          background: #1e293b;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .header-title {
          font-size: 15px;
          font-weight: 700;
          color: #f8fafc;
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .status-pill {
          font-size: 10px;
          padding: 2px 8px;
          border-radius: 9999px;
          font-weight: 600;
          text-transform: uppercase;
          background: rgba(16, 185, 129, 0.2);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.4);
        }

        .status-pill.busy {
          background: rgba(59, 130, 246, 0.2);
          color: #60a5fa;
          border-color: rgba(59, 130, 246, 0.4);
        }

        .status-pill.blocked {
          background: rgba(239, 68, 68, 0.2);
          color: #f87171;
          border-color: rgba(239, 68, 68, 0.4);
        }

        .status-pill.error {
          background: rgba(245, 158, 11, 0.2);
          color: #fbbf24;
          border-color: rgba(245, 158, 11, 0.4);
        }

        .header-actions {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .btn-icon {
          background: transparent;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          padding: 4px 8px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 500;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: all 0.15s;
        }

        .btn-icon:hover {
          background: rgba(255, 255, 255, 0.08);
          color: #f8fafc;
        }

        .btn-icon.active {
          background: rgba(16, 185, 129, 0.2);
          border-color: #10b981;
          color: #10b981;
        }

        .btn-icon.active-danger {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
          color: #f87171;
        }

        .btn-close {
          background: none;
          border: none;
          color: #94a3b8;
          cursor: pointer;
          font-size: 16px;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s;
        }

        .btn-close:hover {
          color: #f8fafc;
        }

        /* Dedicated Independent Scrollable Message Body */
        .chat-body {
          flex: 1;
          min-height: 0; /* CRITICAL: Enables flex child to scroll properly */
          overflow-y: auto;
          overflow-x: hidden;
          overscroll-behavior: contain; /* Prevents outer webpage scroll jank */
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          position: relative;
          outline: none; /* Focusable for keyboard scroll */
        }

        .chat-body::-webkit-scrollbar {
          width: 6px;
        }
        .chat-body::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 3px;
        }
        .chat-body::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }

        .message-bubble {
          max-width: 88%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 13px;
          line-height: 1.5;
          word-break: break-word;
          white-space: pre-wrap;
          user-select: text;
        }

        .message-bubble.user {
          align-self: flex-end;
          background: #2563eb;
          color: white;
          border-bottom-right-radius: 2px;
          box-shadow: 0 2px 8px rgba(37, 99, 235, 0.25);
        }

        .message-bubble.assistant {
          align-self: flex-start;
          background: #1e293b;
          color: #e2e8f0;
          border-bottom-left-radius: 2px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
        }

        .message-bubble.system {
          align-self: center;
          background: rgba(51, 65, 85, 0.6);
          color: #cbd5e1;
          font-size: 11px;
          padding: 6px 12px;
          border-radius: 8px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .thinking-bubble {
          align-self: flex-start;
          display: flex;
          align-items: center;
          gap: 8px;
          background: #1e293b;
          color: #94a3b8;
          border-radius: 12px;
          border-bottom-left-radius: 2px;
          padding: 8px 14px;
          font-size: 12px;
          border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .dots-loader {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dots-loader span {
          width: 5px;
          height: 5px;
          background: #10b981;
          border-radius: 50%;
          animation: bounce 1.2s infinite ease-in-out both;
        }
        .dots-loader span:nth-child(1) { animation-delay: -0.32s; }
        .dots-loader span:nth-child(2) { animation-delay: -0.16s; }
        .dots-loader span:nth-child(3) { animation-delay: 0s; }

        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0); }
          40% { transform: scale(1); }
        }

        .badge-tag {
          display: inline-block;
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          margin-top: 6px;
        }
        .badge-success { background: rgba(16, 185, 129, 0.2); color: #34d399; }
        .badge-warning { background: rgba(245, 158, 11, 0.2); color: #fbbf24; }
        .badge-danger { background: rgba(239, 68, 68, 0.2); color: #f87171; }
        .badge-info { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }

        /* Floating Scroll to Bottom Button */
        .btn-scroll-bottom {
          position: absolute;
          bottom: 12px;
          right: 14px;
          background: #2563eb;
          color: white;
          border: none;
          padding: 6px 12px;
          border-radius: 9999px;
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: 10;
          display: flex;
          align-items: center;
          gap: 4px;
          transition: transform 0.15s;
        }
        .btn-scroll-bottom:hover {
          transform: translateY(-2px);
          background: #1d4ed8;
        }

        .chips-container {
          flex-shrink: 0;
          display: flex;
          gap: 6px;
          padding: 8px 14px 4px 14px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
          background: #0f172a;
          overflow-x: auto;
          white-space: nowrap;
        }

        .chips-container::-webkit-scrollbar {
          height: 4px;
        }

        .chip-btn {
          background: #1e293b;
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: #cbd5e1;
          font-size: 11px;
          padding: 5px 10px;
          border-radius: 9999px;
          cursor: pointer;
          transition: all 0.15s;
          flex-shrink: 0;
        }

        .chip-btn:hover {
          background: #334155;
          color: #f8fafc;
          border-color: rgba(255, 255, 255, 0.25);
        }

        .input-bar {
          flex-shrink: 0;
          display: flex;
          align-items: flex-end;
          gap: 8px;
          padding: 10px 14px;
          background: #1e293b;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .input-textarea {
          flex: 1;
          background: #0f172a;
          border: 1px solid rgba(255, 255, 255, 0.15);
          color: #f8fafc;
          padding: 8px 12px;
          border-radius: 8px;
          font-size: 13px;
          line-height: 1.4;
          outline: none;
          resize: none;
          max-height: 90px;
          min-height: 36px;
          transition: border-color 0.15s;
        }

        .input-textarea:focus {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }

        .input-textarea:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .btn-send {
          background: #10b981;
          color: white;
          border: none;
          padding: 9px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
          height: 36px;
        }

        .btn-send:hover {
          background: #059669;
        }

        .btn-stop {
          background: #ef4444;
          color: white;
          border: none;
          padding: 9px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          height: 36px;
        }

        .btn-stop:hover {
          background: #dc2626;
        }

        .dialog-footer {
          flex-shrink: 0;
          padding: 7px 14px;
          background: #090d16;
          border-top: 1px solid rgba(255, 255, 255, 0.04);
          font-size: 10px;
          color: #64748b;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .footer-secure {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #10b981;
          font-weight: 600;
        }
      </style>

      <!-- Floating Trigger Button -->
      <button class="floating-btn" id="privai-toggle-btn" title="Open PrivAI Assistant">
        <span class="pulse-dot"></span>
        <span class="robot-icon">🤖</span>
        <span>PrivAI</span>
      </button>

      <!-- Chat Interface Dialog -->
      <div class="chat-dialog ${this.isOpen?"open":""}" id="privai-chat-dialog">
        <div class="dialog-header">
          <div class="header-left">
            <span class="header-title">🤖 PrivAI Assistant</span>
            <span class="status-pill" id="privai-status-pill">IDLE</span>
          </div>
          <div class="header-actions">
            <button class="btn-icon" id="privai-btn-vision" title="Toggle On-Device Vision Overlay">
              👁️ Vision
            </button>
            <button class="btn-icon" id="privai-btn-failure" title="Test Hard Client Privacy Gate">
              Demo Block
            </button>
            <button class="btn-close" id="privai-btn-close" title="Close Assistant">✕</button>
          </div>
        </div>

        <!-- Scrollable Message Body with tabindex for keyboard scroll -->
        <div class="chat-body" id="privai-chat-body" tabindex="0" title="Chat Messages (Scrollable)">
          <!-- Messages rendered here -->
        </div>

        <!-- Floating Scroll to Bottom Indicator Button -->
        <button class="btn-scroll-bottom" id="privai-scroll-bottom" style="display: none;">
          ↓ New messages
        </button>

        <!-- Quick Suggestions -->
        <div class="chips-container">
          <button class="chip-btn" data-task="Fill the registration form with valid synthetic data">📝 Fill Form</button>
          <button class="chip-btn" data-task="Search for Kubernetes HPA documentation and open official result">🔍 Search Docs</button>
          <button class="chip-btn" data-task="What is this page about?">❓ What is this page?</button>
          <button class="chip-btn" data-task="Scroll down">⬇️ Scroll Down</button>
          <button class="chip-btn" data-task="__test_30_messages__">🧪 Test 30 Messages</button>
        </div>

        <div class="input-bar">
          <textarea
            class="input-textarea"
            id="privai-input"
            rows="1"
            placeholder="Ask PrivAI to perform a task or ask about this page..."
          ></textarea>
          <button class="btn-send" id="privai-btn-send">Send</button>
          <button class="btn-stop" id="privai-btn-stop" style="display: none;">Stop</button>
        </div>

        <div class="dialog-footer">
          <span class="footer-secure">🛡️ Privacy Firewall Active</span>
          <span>UltraFace ONNX • Client Redaction</span>
        </div>
      </div>
    `)}renderMessages(e=!1){if(!this.shadow)return;const t=this.shadow.getElementById("privai-chat-body");if(!t)return;let s=this.messages.map(i=>{let n="";return i.badge&&(n=`<div class="badge-tag ${`badge-${i.badgeType||"info"}`}">${i.badge}</div>`),`
          <div class="message-bubble ${i.sender}">
            <div>${i.text}</div>
            ${n}
          </div>
        `}).join("");this.isThinking&&(s+=`
        <div class="thinking-bubble" id="privai-thinking-indicator">
          <span>Thinking</span>
          <div class="dots-loader">
            <span></span><span></span><span></span>
          </div>
        </div>
      `),t.innerHTML=s,e||this.userIsNearBottom?(t.scrollTop=t.scrollHeight,this.userIsNearBottom=!0,this.hideScrollToBottomButton()):this.showScrollToBottomButton()}showScrollToBottomButton(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-scroll-bottom");e&&(e.style.display="flex")}hideScrollToBottomButton(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-scroll-bottom");e&&(e.style.display="none")}scrollToBottom(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-chat-body");e&&(typeof e.scrollTo=="function"?e.scrollTo({top:e.scrollHeight,behavior:"smooth"}):e.scrollTop=e.scrollHeight,this.userIsNearBottom=!0,this.hideScrollToBottomButton())}addMessage(e,t=!1){this.messages.push(e),this.saveStateToStorage(),this.renderMessages(t)}setupListeners(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-toggle-btn"),t=this.shadow.getElementById("privai-btn-close");this.shadow.getElementById("privai-chat-dialog");const s=this.shadow.getElementById("privai-btn-send"),i=this.shadow.getElementById("privai-btn-stop"),n=this.shadow.getElementById("privai-input"),r=this.shadow.getElementById("privai-btn-vision"),a=this.shadow.getElementById("privai-btn-failure"),l=this.shadow.getElementById("privai-chat-body"),u=this.shadow.getElementById("privai-scroll-bottom");l==null||l.addEventListener("scroll",()=>{if(!l)return;const c=l.scrollHeight-l.scrollTop-l.clientHeight;this.userIsNearBottom=c<=60,this.userIsNearBottom&&this.hideScrollToBottomButton()}),u==null||u.addEventListener("click",()=>{this.scrollToBottom()}),e==null||e.addEventListener("click",()=>{this.toggleDialog()}),t==null||t.addEventListener("click",()=>{this.toggleDialog(!1)});const g=()=>{var p;const c=(p=n==null?void 0:n.value)==null?void 0:p.trim();c&&(n.value="",n.style.height="auto",this.startAgent(c))};s==null||s.addEventListener("click",g),n==null||n.addEventListener("keydown",c=>{if(c.key==="Enter"){if(c.shiftKey)return;c.preventDefault(),g()}}),n==null||n.addEventListener("input",()=>{n.style.height="auto",n.style.height=`${Math.min(n.scrollHeight,90)}px`}),i==null||i.addEventListener("click",()=>{var c;typeof chrome<"u"&&((c=chrome.runtime)!=null&&c.sendMessage)&&chrome.runtime.sendMessage({type:"STOP_TASK"}),this.isThinking=!1,this.addMessage({id:`stop_${Date.now()}`,sender:"system",text:"Agent task stopped by user.",timestamp:Date.now()},!0),this.setRunning(!1)}),r==null||r.addEventListener("click",()=>{var c;this.isVisionOverlayActive=!this.isVisionOverlayActive,r.classList.toggle("active",this.isVisionOverlayActive),typeof chrome<"u"&&((c=chrome.runtime)!=null&&c.sendMessage)&&chrome.runtime.sendMessage({type:"GET_STATUS"},p=>{var y;const b=((y=p==null?void 0:p.data)==null?void 0:y.lastVisionDetections)||[];window.postMessage({source:"privai-widget",action:"TOGGLE_VISION",show:this.isVisionOverlayActive,detections:b},"*")})}),a==null||a.addEventListener("click",()=>{var c;this.failureModeActive=!this.failureModeActive,a.classList.toggle("active-danger",this.failureModeActive),typeof chrome<"u"&&((c=chrome.runtime)!=null&&c.sendMessage)&&chrome.runtime.sendMessage({type:"SET_FAILURE_MODE",payload:this.failureModeActive}),this.addMessage({id:`demo_${Date.now()}`,sender:"system",text:this.failureModeActive?"🚨 Demo Mode Enabled: Will simulate unredacted PII leak to verify Hard Privacy Gate blockage.":"🛡️ Demo Mode Disabled: Normal privacy protection active.",timestamp:Date.now()},!0)}),this.shadow.querySelectorAll(".chip-btn").forEach(c=>{c.addEventListener("click",p=>{const b=p.currentTarget.getAttribute("data-task");b==="__test_30_messages__"?this.generate30TestMessages():b&&this.startAgent(b)})})}toggleDialog(e){if(!this.shadow)return;const t=this.shadow.getElementById("privai-chat-dialog"),s=this.shadow.getElementById("privai-input");this.isOpen=e!==void 0?e:!this.isOpen,t==null||t.classList.toggle("open",this.isOpen),this.saveStateToStorage(),this.isOpen&&(this.scrollToBottom(),s&&setTimeout(()=>s.focus(),100))}generate30TestMessages(){console.log("[PrivAI Chat] Generating 30 test conversation messages for scroll verification"),this.messages=[];for(let e=1;e<=15;e++)this.messages.push({id:`test_usr_${e}`,sender:"user",text:`User request message #${e}: Testing chat scrolling and history recall.`,timestamp:Date.now()-(16-e)*6e4}),this.messages.push({id:`test_ai_${e}`,sender:"assistant",text:`AI response #${e}: Understood. Action planned and verified on-device. Zero sensitive data leaves the browser.`,badge:e%2===0?"Safe to Transmit":void 0,badgeType:"success",timestamp:Date.now()-(16-e)*6e4+1e3});this.saveStateToStorage(),this.renderMessages(!0)}startAgent(e){var i;console.log("[PrivAI Chat] User submitted task:",e),this.addMessage({id:`usr_${Date.now()}`,sender:"user",text:e,timestamp:Date.now()},!0);const t=e.trim().toLowerCase();if(/^(hi+|hello+|hey+|hola|greetings?|ping|test)\b/i.test(t)){setTimeout(()=>{this.addMessage({id:`greet_${Date.now()}`,sender:"assistant",text:"Hello! The chat interface is working. How can I help you on this page?",badge:"Ready",badgeType:"success",timestamp:Date.now()},!0)},100);return}if(t==="test scroll"||t==="test 30"){this.generate30TestMessages();return}this.isThinking=!0,this.renderMessages(!0),this.setRunning(!0),typeof chrome<"u"&&((i=chrome.runtime)!=null&&i.sendMessage)?chrome.runtime.sendMessage({type:"START_TASK",payload:e}):(this.isThinking=!1,this.addMessage({id:`err_${Date.now()}`,sender:"assistant",text:"PrivAI requires the Chrome extension background service to sanitize page data locally before transmission. Direct unredacted network requests from webpage context are strictly prohibited.",badge:"Privacy Gate",badgeType:"warning",timestamp:Date.now()},!0),this.setRunning(!1))}setRunning(e){if(!this.shadow)return;const t=this.shadow.getElementById("privai-btn-send"),s=this.shadow.getElementById("privai-btn-stop"),i=this.shadow.getElementById("privai-input");t&&s&&i&&(t.style.display=e?"none":"block",s.style.display=e?"block":"none",i.disabled=e,e||setTimeout(()=>i.focus(),100))}updateState(e){if(!this.shadow||!e)return;const t=this.shadow.getElementById("privai-status-pill");t&&(t.textContent=e.agentState,t.className="status-pill",e.agentState==="NETWORK_BLOCKED"?t.classList.add("blocked"):e.agentState==="ERROR"?t.classList.add("error"):e.agentState!=="IDLE"&&e.agentState!=="COMPLETED"&&t.classList.add("busy"));const s=e.agentState!=="IDLE"&&e.agentState!=="COMPLETED"&&e.agentState!=="ERROR"&&e.agentState!=="NETWORK_BLOCKED";if(s||(this.isThinking=!1),this.setRunning(s),e.timeline&&Array.isArray(e.timeline)){e.timeline.length<=this.lastProcessedTimelineIndex&&(this.lastProcessedTimelineIndex=-1);for(let i=this.lastProcessedTimelineIndex+1;i<e.timeline.length;i++){const n=e.timeline[i];this.lastProcessedTimelineIndex=i,!(!n||!n.label)&&(n.label==="PRIVACY PASSED"?e.redactedRegions&&e.redactedRegions>0&&this.addMessage({id:`evt_${Date.now()}_${i}`,sender:"assistant",text:`🛡️ Local Privacy Engine: Redacted ${e.redactedRegions} sensitive items locally before network transmission.`,badge:"Safe to Transmit",badgeType:"success",timestamp:n.timestamp||Date.now()}):n.label==="AI ANSWER"?(this.isThinking=!1,this.addMessage({id:`ans_${Date.now()}_${i}`,sender:"assistant",text:n.detail||"Done.",badge:"Verified On-Device",badgeType:"success",timestamp:n.timestamp||Date.now()})):n.label==="NETWORK BLOCKED"?(this.isThinking=!1,this.addMessage({id:`evt_${Date.now()}_${i}`,sender:"assistant",text:"🚨 NETWORK REQUEST BLOCKED! Unredacted sensitive data detected by Hard Client Privacy Gate. Zero bytes were sent.",badge:"Privacy Violation Prevented",badgeType:"danger",timestamp:n.timestamp||Date.now()})):n.label==="VLM RESPONSE"?n.detail&&!n.detail.includes("read_page")&&this.addMessage({id:`vlm_${Date.now()}_${i}`,sender:"assistant",text:`🧠 AI Reasoning: ${n.detail}`,badge:"AI Plan",badgeType:"info",timestamp:n.timestamp||Date.now()}):n.label==="ACTION EXECUTED"?n.detail&&!n.detail.includes("read_page")&&this.addMessage({id:`act_${Date.now()}_${i}`,sender:"assistant",text:`⚡ ${n.detail}`,badge:"Action Success",badgeType:"success",timestamp:n.timestamp||Date.now()}):n.label==="TASK COMPLETED"?(this.isThinking=!1,!this.messages.some(a=>a.id.startsWith("ans_"))&&n.detail&&n.detail!=="Task completed"&&this.addMessage({id:`done_${Date.now()}_${i}`,sender:"assistant",text:`✅ ${n.detail}`,badge:"Completed",badgeType:"success",timestamp:n.timestamp||Date.now()})):n.label==="ERROR"&&(this.isThinking=!1,this.addMessage({id:`err_${Date.now()}_${i}`,sender:"assistant",text:`⚠️ Execution Error: ${n.detail||"An unexpected error occurred."}`,badge:"Error",badgeType:"danger",timestamp:n.timestamp||Date.now()})))}}this.renderMessages()}}let x=null,m=null;function B(){!m&&document.body&&(m=new pe),Q()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",B):B();chrome.runtime.onMessage.addListener((o,e,t)=>{if(o.type==="PING")return t({success:!0,pong:!0}),!1;if(o.type==="SCAN_PAGE"){try{x=R(),t({success:!0,data:x})}catch(s){t({success:!1,error:s.message})}return!1}if(o.type==="READ_PAGE"){try{const s=Z();t({success:!0,data:s})}catch(s){t({success:!1,error:s.message})}return!1}if(o.type==="WAIT_FOR_STABLE")return $(300,3e3).then(s=>t({success:!0,data:{stable:s}})).catch(s=>t({success:!1,error:s.message})),!0;if(o.type==="TOGGLE_OVERLAY")return x?(A(o.payload,x.elements),t({success:!0,data:null})):t({success:!1,error:"No scan data available. Scan page first."}),!1;if(o.type==="TOGGLE_VISION_OVERLAY"){const{show:s,detections:i}=o.payload;return A(s,i,!0),t({success:!0,data:null}),!1}return o.type==="EXECUTE_ACTION"?(te(o.payload).then(()=>t({success:!0,data:null})).catch(s=>t({success:!1,error:s.message})),!0):o.type==="STATE_UPDATE"?(m&&m.updateState(o.payload),t({success:!0}),!1):(o.type==="TOGGLE_WIDGET"&&(m?(m.toggleDialog(),t({success:!0})):t({success:!1,error:"Widget not initialized"})),!1)});window.addEventListener("message",o=>{var e;((e=o.data)==null?void 0:e.source)==="privai-widget"&&o.data.action==="TOGGLE_VISION"&&A(o.data.show,o.data.detections||[],!0)});
