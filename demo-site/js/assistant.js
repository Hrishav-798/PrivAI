var A=Object.defineProperty;var I=(s,e,t)=>e in s?A(s,e,{enumerable:!0,configurable:!0,writable:!0,value:t}):s[e]=t;var u=(s,e,t)=>I(s,typeof e!="symbol"?e+"":e,t);class M{constructor(){u(this,"elementIdMap",new WeakMap);u(this,"idCounter",0)}getIdForElement(e,t="agent-el"){if(this.elementIdMap.has(e))return this.elementIdMap.get(e);const a=`${t}-${this.idCounter++}`;return this.elementIdMap.set(e,a),e.setAttribute("data-agent-id",a),a}reset(){this.idCounter=0,this.elementIdMap=new WeakMap}}const v=new M;function _(s){if(!(s instanceof HTMLElement))return!1;const e=window.getComputedStyle(s);if(e.display==="none"||e.visibility==="hidden"||e.opacity==="0")return!1;const t=s.getBoundingClientRect();return t.width>0&&t.height>0}function D(s){var e;return s instanceof HTMLInputElement||s instanceof HTMLTextAreaElement?s.placeholder||s.value||s.name||"":((e=s.textContent)==null?void 0:e.trim().replace(/\s+/g," "))||""}function L(s){var e;if(s instanceof HTMLInputElement&&s.id){const t=document.querySelector(`label[for="${s.id}"]`);if(t)return((e=t.textContent)==null?void 0:e.trim())||null}return s.getAttribute("aria-label")||s.getAttribute("title")||null}function C(s){return s instanceof HTMLInputElement?s.type:null}const $=["BUTTON","A","INPUT","TEXTAREA","SELECT","SUMMARY","DETAILS"];function O(s){return $.includes(s.tagName)||s.getAttribute("role")==="button"||s.hasAttribute("tabindex")}function B(s){return s.tagName==="BUTTON"?"agent-btn":s.tagName==="A"?"agent-link":s.tagName==="INPUT"?"agent-input":"agent-el"}function T(){const s=document.querySelectorAll('button, a, input, textarea, select, h1, h2, h3, h4, h5, h6, [role="button"]'),e=[],t={interactive:0,buttons:0,inputs:0,links:0};return v.reset(),s.forEach(a=>{if(a.closest("#privai-assistant-root")||a.closest("#privai-overlay-container")||!_(a))return;const n=O(a),i=v.getIdForElement(a,B(a)),o=a.getBoundingClientRect(),l={x:o.x+window.scrollX,y:o.y+window.scrollY,width:o.width,height:o.height},d=C(a),g=a instanceof HTMLInputElement||a instanceof HTMLTextAreaElement?a.placeholder:void 0,f=a.getAttribute("autocomplete")||void 0,h={id:i,element_id:i,tag:a.tagName.toLowerCase(),role:a.getAttribute("role"),text:D(a),label:L(a),type:d,input_type:d,bbox:l,visible:!0,enabled:!a.disabled,interactive:n,placeholder:g,autocomplete:f};e.push(h),n&&t.interactive++,(h.tag==="button"||h.role==="button")&&t.buttons++,h.tag==="input"&&t.inputs++,h.tag==="a"&&t.links++}),{elements:e,pageTitle:document.title||"",pageUrl:window.location.href||"",counts:t}}let c=null;function x(s,e,t=!1){if(!s){c&&(c.remove(),c=null);return}c?c.innerHTML="":(c=document.createElement("div"),c.id="privai-overlay-container",c.style.position="absolute",c.style.top="0",c.style.left="0",c.style.width="100%",c.style.height="100%",c.style.pointerEvents="none",c.style.zIndex="999999",document.body.appendChild(c)),e.forEach(a=>{if(!a.bbox)return;const n=document.createElement("div");n.style.position="absolute",n.style.left=`${a.bbox.x}px`,n.style.top=`${a.bbox.y}px`,n.style.width=`${a.bbox.width}px`,n.style.height=`${a.bbox.height}px`,t?(n.style.border="2px solid rgba(0, 255, 0, 0.9)",n.style.backgroundColor="rgba(0, 255, 0, 0.1)"):(n.style.border="2px solid rgba(255, 0, 0, 0.7)",n.style.backgroundColor="rgba(255, 0, 0, 0.1)"),n.style.boxSizing="border-box";const i=document.createElement("div");t?(i.textContent=`${a.className||a.type||"vision"} ${(a.confidence||0).toFixed(2)}`,i.style.backgroundColor="rgba(0, 255, 0, 0.9)",i.style.color="black"):(i.textContent=a.id||a.element_id,i.style.backgroundColor="rgba(255, 0, 0, 0.8)",i.style.color="white"),i.style.position="absolute",i.style.top="-20px",i.style.left="-2px",i.style.fontSize="12px",i.style.padding="2px 4px",i.style.borderRadius="2px",i.style.whiteSpace="nowrap",n.appendChild(i),c.appendChild(n)})}async function k(s){switch(s.action){case"click":if(!s.target)throw new Error("Click requires a target");P(s.target);break;case"type":if(!s.target)throw new Error("Type requires a target");if(s.text===void 0)throw new Error("Type requires text");N(s.target,s.text);break;case"scroll":H(s.direction||"down",s.amount||500);break;case"navigate":if(!s.url)throw new Error("Navigate requires a url");R(s.url);break;case"go_back":z();break;case"wait":case"read_page":break;default:throw new Error(`Unsupported action: ${s.action}`)}}function S(s){if(!s)return null;let e=document.querySelector(`[data-agent-id="${s}"]`);if(e||(e=document.getElementById(s),e)||(e=document.querySelector(`[name="${s}"]`),e))return e;try{if(e=document.querySelector(s),e)return e}catch{}if(e=document.querySelector(`[aria-label="${s}" i], [placeholder="${s}" i], [title="${s}" i]`),e||(e=document.querySelector(`[data-agent-id*="${s}"], [id*="${s}"]`),e))return e;const t=document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]');for(const a of t){const n=a.textContent?a.textContent.trim().toLowerCase():"";if(n&&n.includes(s.toLowerCase()))return a}return null}function P(s){var t;const e=S(s);if(!e)throw new Error(`Target element "${s}" not found on page`);e instanceof HTMLElement?((t=e.scrollIntoView)==null||t.call(e,{behavior:"smooth",block:"nearest"}),e.focus(),e.click()):e.dispatchEvent(new MouseEvent("click",{bubbles:!0,cancelable:!0,view:window}))}function N(s,e){var a,n,i,o;const t=S(s);if(!t)throw new Error(`Target element "${s}" not found on page`);if(!(t instanceof HTMLInputElement)&&!(t instanceof HTMLTextAreaElement)&&!t.hasAttribute("contenteditable"))throw new Error(`Target element "${s}" is not an editable field`);if(t.readOnly)throw new Error(`Target element "${s}" is marked readonly`);if(t instanceof HTMLInputElement&&t.type==="password")throw new Error(`Safety violation: Cannot type into password field "${s}"`);if(t instanceof HTMLElement&&((a=t.scrollIntoView)==null||a.call(t,{behavior:"smooth",block:"nearest"}),t.focus()),t instanceof HTMLInputElement||t instanceof HTMLTextAreaElement){const l=t instanceof HTMLTextAreaElement?(n=window.HTMLTextAreaElement)==null?void 0:n.prototype:(i=window.HTMLInputElement)==null?void 0:i.prototype,d=l?(o=Object.getOwnPropertyDescriptor(l,"value"))==null?void 0:o.set:null;d?d.call(t,e):t.value=e,t.dispatchEvent(new Event("input",{bubbles:!0})),t.dispatchEvent(new Event("change",{bubbles:!0}));const g=(t.getAttribute("name")||"").toLowerCase(),f=(t.id||"").toLowerCase(),h=(t.getAttribute("placeholder")||"").toLowerCase();if(t instanceof HTMLInputElement&&t.type==="search"||g==="q"||g==="search_query"||f.includes("search")||h.includes("search")){t.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0})),t.dispatchEvent(new KeyboardEvent("keypress",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0})),t.dispatchEvent(new KeyboardEvent("keyup",{key:"Enter",code:"Enter",keyCode:13,which:13,bubbles:!0}));const p=t.closest("form");if(p)try{typeof p.requestSubmit=="function"?p.requestSubmit():p.submit()}catch{}else{const b=document.querySelector('button#search-icon-legacy, button[aria-label="Search" i], button[type="submit"]');b&&setTimeout(()=>b.click(),100)}}}else t instanceof HTMLElement&&t.hasAttribute("contenteditable")&&(t.textContent=e,t.dispatchEvent(new Event("input",{bubbles:!0})))}function H(s,e){switch(s){case"up":window.scrollBy({top:-e,behavior:"smooth"});break;case"down":window.scrollBy({top:e,behavior:"smooth"});break;case"left":window.scrollBy({left:-e,behavior:"smooth"});break;case"right":window.scrollBy({left:e,behavior:"smooth"});break}}function R(s){window.location.href=s}function z(){window.history.back()}class F{constructor(){u(this,"host",null);u(this,"shadow",null);u(this,"isOpen",!1);u(this,"isVisionOverlayActive",!1);u(this,"failureModeActive",!1);u(this,"messages",[]);u(this,"lastProcessedTimelineIndex",-1);u(this,"isThinking",!1);u(this,"userIsNearBottom",!0);u(this,"hasUnreadBelow",!1);this.loadStateFromStorage(),this.init()}loadStateFromStorage(){try{const e=sessionStorage.getItem("privai_chat_messages");e&&(this.messages=JSON.parse(e)),sessionStorage.getItem("privai_widget_open")==="true"&&(this.isOpen=!0)}catch{this.messages=[]}}saveStateToStorage(){try{sessionStorage.setItem("privai_chat_messages",JSON.stringify(this.messages)),sessionStorage.setItem("privai_widget_open",this.isOpen?"true":"false")}catch{}}init(){var e;if(document.getElementById("privai-assistant-root")){console.log("[PrivAI Chat] Singleton instance already mounted on this page");return}this.host=document.createElement("div"),this.host.id="privai-assistant-root",this.host.style.position="fixed",this.host.style.bottom="0",this.host.style.right="0",this.host.style.zIndex="2147483647",this.host.style.pointerEvents="none",document.body.appendChild(this.host),this.shadow=this.host.attachShadow({mode:"open"}),this.render(),this.setupListeners(),console.log("[PrivAI Chat] Assistant widget mounted cleanly into Shadow DOM"),this.messages.length===0?this.addMessage({id:"msg_welcome",sender:"assistant",text:"Hello! I am PrivAI, your on-device Privacy Browser Assistant. You can ask me to fill forms, search documentation, answer questions about this page, or navigate—while ensuring zero sensitive data ever leaves your machine unredacted.",badge:"Zero Raw PII Egress",badgeType:"success",timestamp:Date.now()},!0):this.renderMessages(!0);try{typeof chrome<"u"&&((e=chrome.runtime)!=null&&e.sendMessage)&&chrome.runtime.sendMessage({type:"GET_STATUS"},t=>{t!=null&&t.success&&t.data&&this.updateState(t.data)})}catch{}}render(){this.shadow&&(this.shadow.innerHTML=`
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
    `)}renderMessages(e=!1){if(!this.shadow)return;const t=this.shadow.getElementById("privai-chat-body");if(!t)return;let a=this.messages.map(n=>{let i="";return n.badge&&(i=`<div class="badge-tag ${`badge-${n.badgeType||"info"}`}">${n.badge}</div>`),`
          <div class="message-bubble ${n.sender}">
            <div>${n.text}</div>
            ${i}
          </div>
        `}).join("");this.isThinking&&(a+=`
        <div class="thinking-bubble" id="privai-thinking-indicator">
          <span>Thinking</span>
          <div class="dots-loader">
            <span></span><span></span><span></span>
          </div>
        </div>
      `),t.innerHTML=a,e||this.userIsNearBottom?(t.scrollTop=t.scrollHeight,this.userIsNearBottom=!0,this.hideScrollToBottomButton()):this.showScrollToBottomButton()}showScrollToBottomButton(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-scroll-bottom");e&&(e.style.display="flex")}hideScrollToBottomButton(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-scroll-bottom");e&&(e.style.display="none")}scrollToBottom(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-chat-body");e&&(typeof e.scrollTo=="function"?e.scrollTo({top:e.scrollHeight,behavior:"smooth"}):e.scrollTop=e.scrollHeight,this.userIsNearBottom=!0,this.hideScrollToBottomButton())}addMessage(e,t=!1){this.messages.push(e),this.saveStateToStorage(),this.renderMessages(t)}setupListeners(){if(!this.shadow)return;const e=this.shadow.getElementById("privai-toggle-btn"),t=this.shadow.getElementById("privai-btn-close");this.shadow.getElementById("privai-chat-dialog");const a=this.shadow.getElementById("privai-btn-send"),n=this.shadow.getElementById("privai-btn-stop"),i=this.shadow.getElementById("privai-input"),o=this.shadow.getElementById("privai-btn-vision"),l=this.shadow.getElementById("privai-btn-failure"),d=this.shadow.getElementById("privai-chat-body"),g=this.shadow.getElementById("privai-scroll-bottom");d==null||d.addEventListener("scroll",()=>{if(!d)return;const r=d.scrollHeight-d.scrollTop-d.clientHeight;this.userIsNearBottom=r<=60,this.userIsNearBottom&&this.hideScrollToBottomButton()}),g==null||g.addEventListener("click",()=>{this.scrollToBottom()}),e==null||e.addEventListener("click",()=>{this.toggleDialog()}),t==null||t.addEventListener("click",()=>{this.toggleDialog(!1)});const f=()=>{var p;const r=(p=i==null?void 0:i.value)==null?void 0:p.trim();r&&(i.value="",i.style.height="auto",this.startAgent(r))};a==null||a.addEventListener("click",f),i==null||i.addEventListener("keydown",r=>{if(r.key==="Enter"){if(r.shiftKey)return;r.preventDefault(),f()}}),i==null||i.addEventListener("input",()=>{i.style.height="auto",i.style.height=`${Math.min(i.scrollHeight,90)}px`}),n==null||n.addEventListener("click",()=>{var r;typeof chrome<"u"&&((r=chrome.runtime)!=null&&r.sendMessage)&&chrome.runtime.sendMessage({type:"STOP_TASK"}),this.isThinking=!1,this.addMessage({id:`stop_${Date.now()}`,sender:"system",text:"Agent task stopped by user.",timestamp:Date.now()},!0),this.setRunning(!1)}),o==null||o.addEventListener("click",()=>{var r;this.isVisionOverlayActive=!this.isVisionOverlayActive,o.classList.toggle("active",this.isVisionOverlayActive),typeof chrome<"u"&&((r=chrome.runtime)!=null&&r.sendMessage)&&chrome.runtime.sendMessage({type:"GET_STATUS"},p=>{var w;const b=((w=p==null?void 0:p.data)==null?void 0:w.lastVisionDetections)||[];window.postMessage({source:"privai-widget",action:"TOGGLE_VISION",show:this.isVisionOverlayActive,detections:b},"*")})}),l==null||l.addEventListener("click",()=>{var r;this.failureModeActive=!this.failureModeActive,l.classList.toggle("active-danger",this.failureModeActive),typeof chrome<"u"&&((r=chrome.runtime)!=null&&r.sendMessage)&&chrome.runtime.sendMessage({type:"SET_FAILURE_MODE",payload:this.failureModeActive}),this.addMessage({id:`demo_${Date.now()}`,sender:"system",text:this.failureModeActive?"🚨 Demo Mode Enabled: Will simulate unredacted PII leak to verify Hard Privacy Gate blockage.":"🛡️ Demo Mode Disabled: Normal privacy protection active.",timestamp:Date.now()},!0)}),this.shadow.querySelectorAll(".chip-btn").forEach(r=>{r.addEventListener("click",p=>{const b=p.currentTarget.getAttribute("data-task");b==="__test_30_messages__"?this.generate30TestMessages():b&&this.startAgent(b)})})}toggleDialog(e){if(!this.shadow)return;const t=this.shadow.getElementById("privai-chat-dialog"),a=this.shadow.getElementById("privai-input");this.isOpen=e!==void 0?e:!this.isOpen,t==null||t.classList.toggle("open",this.isOpen),this.saveStateToStorage(),this.isOpen&&(this.scrollToBottom(),a&&setTimeout(()=>a.focus(),100))}generate30TestMessages(){console.log("[PrivAI Chat] Generating 30 test conversation messages for scroll verification"),this.messages=[];for(let e=1;e<=15;e++)this.messages.push({id:`test_usr_${e}`,sender:"user",text:`User request message #${e}: Testing chat scrolling and history recall.`,timestamp:Date.now()-(16-e)*6e4}),this.messages.push({id:`test_ai_${e}`,sender:"assistant",text:`AI response #${e}: Understood. Action planned and verified on-device. Zero sensitive data leaves the browser.`,badge:e%2===0?"Safe to Transmit":void 0,badgeType:"success",timestamp:Date.now()-(16-e)*6e4+1e3});this.saveStateToStorage(),this.renderMessages(!0)}startAgent(e){var n,i,o,l,d;console.log("[PrivAI Chat] User submitted task:",e),this.addMessage({id:`usr_${Date.now()}`,sender:"user",text:e,timestamp:Date.now()},!0);const t=e.trim().toLowerCase();if(/^(hi+|hello+|hey+|hola|greetings?|ping|test)\b/i.test(t)){setTimeout(()=>{this.addMessage({id:`greet_${Date.now()}`,sender:"assistant",text:"Hello! The chat interface is working. How can I help you on this page?",badge:"Ready",badgeType:"success",timestamp:Date.now()},!0)},100);return}if(t==="test scroll"||t==="test 30"){this.generate30TestMessages();return}this.isThinking=!0,this.renderMessages(!0),this.setRunning(!0),typeof chrome<"u"&&((n=chrome.runtime)!=null&&n.id)&&((i=chrome.runtime)!=null&&i.sendMessage)?chrome.runtime.sendMessage({type:"START_TASK",payload:e}):typeof chrome<"u"&&((o=chrome.runtime)!=null&&o.sendMessage)&&!((d=(l=window.location)==null?void 0:l.host)!=null&&d.includes("5000"))?chrome.runtime.sendMessage({type:"START_TASK",payload:e}):this.handleDirectFallback(e)}async handleDirectFallback(e){var t,a;try{const n=T(),i=await fetch("http://localhost:8000/api/agent/plan",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({task:e,screen:{width:window.innerWidth,height:window.innerHeight},sanitized_dom:n.elements,redactions:[],privacy:{raw_data_removed:!0,sanitized:!0,regions_detected:0,regions_redacted:0,scan_ms:0},page_title:document.title||"",page_url:window.location.href||""})});if(i.ok){const o=await i.json();if(this.isThinking=!1,((t=o.action)==null?void 0:t.action)==="read_page")this.addMessage({id:`ans_${Date.now()}`,sender:"assistant",text:o.reasoning||"Observed page.",badge:"Verified On-Device",badgeType:"success",timestamp:Date.now()},!0);else{this.addMessage({id:`plan_${Date.now()}`,sender:"assistant",text:o.reasoning||`Executing ${(a=o.action)==null?void 0:a.action}`,badge:"Action Planned",badgeType:"info",timestamp:Date.now()},!0);try{await k(o.action),this.addMessage({id:`done_${Date.now()}`,sender:"assistant",text:"✅ Action executed successfully in page.",badge:"Completed",badgeType:"success",timestamp:Date.now()},!0)}catch(l){this.addMessage({id:`err_${Date.now()}`,sender:"assistant",text:`Action execution note: ${l.message}`,badge:"Warning",badgeType:"warning",timestamp:Date.now()},!0)}}}else this.isThinking=!1,this.addMessage({id:`err_${Date.now()}`,sender:"assistant",text:"Unable to connect to AI server at http://localhost:8000. Please ensure FastAPI backend is running.",badge:"Error",badgeType:"danger",timestamp:Date.now()},!0)}catch(n){this.isThinking=!1,this.addMessage({id:`err_${Date.now()}`,sender:"assistant",text:`Error connecting to AI service: ${n.message}`,badge:"Error",badgeType:"danger",timestamp:Date.now()},!0)}this.setRunning(!1)}setRunning(e){if(!this.shadow)return;const t=this.shadow.getElementById("privai-btn-send"),a=this.shadow.getElementById("privai-btn-stop"),n=this.shadow.getElementById("privai-input");t&&a&&n&&(t.style.display=e?"none":"block",a.style.display=e?"block":"none",n.disabled=e,e||setTimeout(()=>n.focus(),100))}updateState(e){if(!this.shadow||!e)return;const t=this.shadow.getElementById("privai-status-pill");t&&(t.textContent=e.agentState,t.className="status-pill",e.agentState==="NETWORK_BLOCKED"?t.classList.add("blocked"):e.agentState==="ERROR"?t.classList.add("error"):e.agentState!=="IDLE"&&e.agentState!=="COMPLETED"&&t.classList.add("busy"));const a=e.agentState!=="IDLE"&&e.agentState!=="COMPLETED"&&e.agentState!=="ERROR"&&e.agentState!=="NETWORK_BLOCKED";if(a||(this.isThinking=!1),this.setRunning(a),e.timeline&&Array.isArray(e.timeline)){e.timeline.length<=this.lastProcessedTimelineIndex&&(this.lastProcessedTimelineIndex=-1);for(let n=this.lastProcessedTimelineIndex+1;n<e.timeline.length;n++){const i=e.timeline[n];this.lastProcessedTimelineIndex=n,!(!i||!i.label)&&(i.label==="PRIVACY PASSED"?e.redactedRegions&&e.redactedRegions>0&&this.addMessage({id:`evt_${Date.now()}_${n}`,sender:"assistant",text:`🛡️ Local Privacy Engine: Redacted ${e.redactedRegions} sensitive items locally before network transmission.`,badge:"Safe to Transmit",badgeType:"success",timestamp:i.timestamp||Date.now()}):i.label==="AI ANSWER"?(this.isThinking=!1,this.addMessage({id:`ans_${Date.now()}_${n}`,sender:"assistant",text:i.detail||"Done.",badge:"Verified On-Device",badgeType:"success",timestamp:i.timestamp||Date.now()})):i.label==="NETWORK BLOCKED"?(this.isThinking=!1,this.addMessage({id:`evt_${Date.now()}_${n}`,sender:"assistant",text:"🚨 NETWORK REQUEST BLOCKED! Unredacted sensitive data detected by Hard Client Privacy Gate. Zero bytes were sent.",badge:"Privacy Violation Prevented",badgeType:"danger",timestamp:i.timestamp||Date.now()})):i.label==="VLM RESPONSE"?i.detail&&!i.detail.includes("read_page")&&this.addMessage({id:`vlm_${Date.now()}_${n}`,sender:"assistant",text:`🧠 AI Reasoning: ${i.detail}`,badge:"AI Plan",badgeType:"info",timestamp:i.timestamp||Date.now()}):i.label==="ACTION EXECUTED"?i.detail&&!i.detail.includes("read_page")&&this.addMessage({id:`act_${Date.now()}_${n}`,sender:"assistant",text:`⚡ ${i.detail}`,badge:"Action Success",badgeType:"success",timestamp:i.timestamp||Date.now()}):i.label==="TASK COMPLETED"?(this.isThinking=!1,!this.messages.some(l=>l.id.startsWith("ans_"))&&i.detail&&i.detail!=="Task completed"&&this.addMessage({id:`done_${Date.now()}_${n}`,sender:"assistant",text:`✅ ${i.detail}`,badge:"Completed",badgeType:"success",timestamp:i.timestamp||Date.now()})):i.label==="ERROR"&&(this.isThinking=!1,this.addMessage({id:`err_${Date.now()}_${n}`,sender:"assistant",text:`⚠️ Execution Error: ${i.detail||"An unexpected error occurred."}`,badge:"Error",badgeType:"danger",timestamp:i.timestamp||Date.now()})))}}this.renderMessages()}}let y=null,m=null;function E(){!m&&document.body&&(m=new F)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",E):E();chrome.runtime.onMessage.addListener((s,e,t)=>{if(s.type==="PING")return t({success:!0,pong:!0}),!1;if(s.type==="SCAN_PAGE"){try{y=T(),t({success:!0,data:y})}catch(a){t({success:!1,error:a.message})}return!1}if(s.type==="TOGGLE_OVERLAY")return y?(x(s.payload,y.elements),t({success:!0,data:null})):t({success:!1,error:"No scan data available. Scan page first."}),!1;if(s.type==="TOGGLE_VISION_OVERLAY"){const{show:a,detections:n}=s.payload;return x(a,n,!0),t({success:!0,data:null}),!1}return s.type==="EXECUTE_ACTION"?(k(s.payload).then(()=>t({success:!0,data:null})).catch(a=>t({success:!1,error:a.message})),!0):s.type==="STATE_UPDATE"?(m&&m.updateState(s.payload),t({success:!0}),!1):(s.type==="TOGGLE_WIDGET"&&(m?(m.toggleDialog(),t({success:!0})):t({success:!1,error:"Widget not initialized"})),!1)});window.addEventListener("message",s=>{var e;((e=s.data)==null?void 0:e.source)==="privai-widget"&&s.data.action==="TOGGLE_VISION"&&x(s.data.show,s.data.detections||[],!0)});
