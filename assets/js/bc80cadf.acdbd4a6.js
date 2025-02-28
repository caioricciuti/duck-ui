"use strict";(self.webpackChunkdocs=self.webpackChunkdocs||[]).push([[195],{9677:(e,n,t)=>{t.r(n),t.d(n,{assets:()=>l,contentTitle:()=>o,default:()=>d,frontMatter:()=>s,metadata:()=>r,toc:()=>c});const r=JSON.parse('{"id":"external-connections","title":"External Connections (Alpha)","description":"Connect to external servers for querying and managing databases - Alpha Feature","source":"@site/docs/external-connections.mdx","sourceDirName":".","slug":"/external-connections","permalink":"/docs/external-connections","draft":false,"unlisted":false,"editUrl":"https://github.com/caioricciuti/duck-ui/tree/main/packages/create-docusaurus/templates/shared/docs/external-connections.mdx","tags":[],"version":"current","lastUpdatedBy":"Caio Ricciuti","lastUpdatedAt":1740782604000,"sidebarPosition":3,"frontMatter":{"title":"External Connections (Alpha)","description":"Connect to external servers for querying and managing databases - Alpha Feature","sidebar_position":3},"sidebar":"tutorialSidebar","previous":{"title":"Getting Started","permalink":"/docs/getting-started"},"next":{"title":"Acknowledgments","permalink":"/docs/acknowledgments"}}');var i=t(4848),a=t(8453);t(5537),t(9329);const s={title:"External Connections (Alpha)",description:"Connect to external servers for querying and managing databases - Alpha Feature",sidebar_position:3},o=void 0,l={},c=[{value:"Quick Start",id:"quick-start",level:2},{value:"Connection Methods",id:"connection-methods",level:2},{value:"Method 1: Docker Environment Variables",id:"method-1-docker-environment-variables",level:3},{value:"Method 2: User Interface",id:"method-2-user-interface",level:3},{value:"Important Disclaimers",id:"important-disclaimers",level:2},{value:"Production Use Warning",id:"production-use-warning",level:3},{value:"Security Considerations",id:"security-considerations",level:3},{value:"Technical Requirements",id:"technical-requirements",level:3},{value:"Current Limitations",id:"current-limitations",level:3},{value:"External Resources",id:"external-resources",level:2},{value:"Testing the Connection",id:"testing-the-connection",level:2}];function u(e){const n={a:"a",admonition:"admonition",code:"code",h2:"h2",h3:"h3",li:"li",ol:"ol",p:"p",pre:"pre",strong:"strong",ul:"ul",...(0,a.R)(),...e.components};return(0,i.jsxs)(i.Fragment,{children:[(0,i.jsx)(n.admonition,{title:"Alpha Feature",type:"warning",children:(0,i.jsxs)(n.p,{children:["This external connection feature is currently in ",(0,i.jsx)(n.strong,{children:"alpha stage"})," and is provided as a proof of concept. It is still under active development and may undergo significant changes. Not recommended for production use."]})}),"\n",(0,i.jsx)(n.h2,{id:"quick-start",children:"Quick Start"}),"\n",(0,i.jsx)(n.p,{children:"The fastest way to test experiment with external connections is to use the provided demo credentials:"}),"\n",(0,i.jsxs)(n.p,{children:["You can create your own connection @ ",(0,i.jsx)(n.a,{href:"https://demo.duckui.com/connections",children:"https://demo.duckui.com/connections"})]}),"\n",(0,i.jsx)(n.pre,{children:(0,i.jsx)(n.code,{className:"language-bash",children:"Name: EXAMPLE (Or any name you prefer)\nHost: https://quackpy.fly.dev\nPort: 443\nDatabase: - (leave empty)\nUser: duckui\nPassword: duckui\n"})}),"\n",(0,i.jsx)(n.h2,{id:"connection-methods",children:"Connection Methods"}),"\n",(0,i.jsx)(n.h3,{id:"method-1-docker-environment-variables",children:"Method 1: Docker Environment Variables"}),"\n",(0,i.jsx)(n.pre,{children:(0,i.jsx)(n.code,{className:"language-bash",children:'docker run -p 5522:5522 \\\n    -e DUCK_UI_EXTERNAL_CONNECTION_NAME="EXAMPLE" \\\n    -e DUCK_UI_EXTERNAL_HOST="https://quackpy.fly.dev" \\\n    -e DUCK_UI_EXTERNAL_PORT=443 \\\n    -e DUCK_UI_EXTERNAL_USER="" \\\n    -e DUCK_UI_EXTERNAL_PASS="" \\\n    -e DUCK_UI_EXTERNAL_DATABASE_NAME="" \\\n    -e DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS="true"\n'})}),"\n",(0,i.jsx)(n.admonition,{type:"note",children:(0,i.jsxs)(n.ul,{children:["\n",(0,i.jsx)(n.li,{children:"DUCK_UI_EXTERNAL_HOST: Currently, only Quackpy - That's running http_server extension under the hood is available as a provider"}),"\n",(0,i.jsx)(n.li,{children:"USER/PASS: Any values can be used to create credentials"}),"\n",(0,i.jsx)(n.li,{children:"DATABASE_NAME: Not required for this implementation (leave empty)"}),"\n",(0,i.jsx)(n.li,{children:'DUCK_UI_ALLOW_UNSIGNED_EXTENSIONS: Set to "true" if you need to use unsigned DuckDB extensions'}),"\n"]})}),"\n",(0,i.jsx)(n.h3,{id:"method-2-user-interface",children:"Method 2: User Interface"}),"\n",(0,i.jsx)(n.p,{children:"You can create connections directly through the Duck-UI interface:"}),"\n",(0,i.jsxs)(n.ol,{children:["\n",(0,i.jsx)(n.li,{children:"Navigate to Connections page"}),"\n",(0,i.jsx)(n.li,{children:'Click "Add Connection"'}),"\n",(0,i.jsx)(n.li,{children:"Fill in the connection details"}),"\n",(0,i.jsx)(n.li,{children:"Test and save your connection"}),"\n"]}),"\n",(0,i.jsx)(n.h2,{id:"important-disclaimers",children:"Important Disclaimers"}),"\n",(0,i.jsx)(n.h3,{id:"production-use-warning",children:"Production Use Warning"}),"\n",(0,i.jsx)(n.p,{children:"This feature is not intended for production use or storing sensitive data. Use at your own risk and only with non-sensitive, test data."}),"\n",(0,i.jsx)(n.h3,{id:"security-considerations",children:"Security Considerations"}),"\n",(0,i.jsxs)(n.ul,{children:["\n",(0,i.jsx)(n.li,{children:"Connection credentials are stored in local storage"}),"\n",(0,i.jsx)(n.li,{children:"Communication may not be encrypted depending on server configuration"}),"\n",(0,i.jsx)(n.li,{children:"No built-in protection against SQL injection"}),"\n",(0,i.jsx)(n.li,{children:"Basic authentication implementation"}),"\n",(0,i.jsx)(n.li,{children:"Use in trusted environments only"}),"\n"]}),"\n",(0,i.jsx)(n.h3,{id:"technical-requirements",children:"Technical Requirements"}),"\n",(0,i.jsx)(n.p,{children:"The external server must support:"}),"\n",(0,i.jsxs)(n.ul,{children:["\n",(0,i.jsx)(n.li,{children:"HTTP Basic Authentication"}),"\n",(0,i.jsx)(n.li,{children:"CORS for cross-origin requests"}),"\n",(0,i.jsx)(n.li,{children:"POST requests with query parameters"}),"\n",(0,i.jsx)(n.li,{children:"ClickHouse JSON/JSONCompact response format"}),"\n"]}),"\n",(0,i.jsx)(n.h3,{id:"current-limitations",children:"Current Limitations"}),"\n",(0,i.jsxs)(n.ul,{children:["\n",(0,i.jsx)(n.li,{children:"Limited error handling"}),"\n",(0,i.jsx)(n.li,{children:"Basic authentication only"}),"\n",(0,i.jsx)(n.li,{children:"Network-dependent performance"}),"\n",(0,i.jsx)(n.li,{children:"Incomplete schema information"}),"\n",(0,i.jsx)(n.li,{children:"Limited DuckDB feature support"}),"\n",(0,i.jsx)(n.li,{children:"No built-in security protections"}),"\n"]}),"\n",(0,i.jsx)(n.h2,{id:"external-resources",children:"External Resources"}),"\n",(0,i.jsxs)(n.ul,{children:["\n",(0,i.jsx)(n.li,{children:(0,i.jsx)(n.a,{href:"https://github.com/duckdb/duckdb/tree/master/extension/httpfs",children:"DuckDB HTTP Server Extension"})}),"\n",(0,i.jsx)(n.li,{children:(0,i.jsx)(n.a,{href:"https://github.com/caioricciuti/duck-ui",children:"Duck-UI GitHub Repository"})}),"\n",(0,i.jsx)(n.li,{children:(0,i.jsx)(n.a,{href:"https://github.com/Quackscience/quackpy",children:"Quackpy GitHub Repository"})}),"\n"]}),"\n",(0,i.jsx)(n.h2,{id:"testing-the-connection",children:"Testing the Connection"}),"\n",(0,i.jsxs)(n.ol,{children:["\n",(0,i.jsx)(n.li,{children:"Use the provided demo credentials"}),"\n",(0,i.jsx)(n.li,{children:"Test basic queries to verify connectivity"}),"\n",(0,i.jsx)(n.li,{children:"Explore available databases and tables"}),"\n",(0,i.jsx)(n.li,{children:"Note any performance or functionality limitations"}),"\n"]}),"\n",(0,i.jsx)(n.admonition,{type:"caution",children:(0,i.jsx)(n.p,{children:"Remember this is an alpha feature. Functionality may be limited or change without notice."})})]})}function d(e={}){const{wrapper:n}={...(0,a.R)(),...e.components};return n?(0,i.jsx)(n,{...e,children:(0,i.jsx)(u,{...e})}):u(e)}},9329:(e,n,t)=>{t.d(n,{A:()=>s});t(6540);var r=t(4164);const i={tabItem:"tabItem_Ymn6"};var a=t(4848);function s(e){let{children:n,hidden:t,className:s}=e;return(0,a.jsx)("div",{role:"tabpanel",className:(0,r.A)(i.tabItem,s),hidden:t,children:n})}},5537:(e,n,t)=>{t.d(n,{A:()=>E});var r=t(6540),i=t(4164),a=t(5627),s=t(6347),o=t(372),l=t(604),c=t(1861),u=t(8749);function d(e){return r.Children.toArray(e).filter((e=>"\n"!==e)).map((e=>{if(!e||(0,r.isValidElement)(e)&&function(e){const{props:n}=e;return!!n&&"object"==typeof n&&"value"in n}(e))return e;throw new Error(`Docusaurus error: Bad <Tabs> child <${"string"==typeof e.type?e.type:e.type.name}>: all children of the <Tabs> component should be <TabItem>, and every <TabItem> should have a unique "value" prop.`)}))?.filter(Boolean)??[]}function h(e){const{values:n,children:t}=e;return(0,r.useMemo)((()=>{const e=n??function(e){return d(e).map((e=>{let{props:{value:n,label:t,attributes:r,default:i}}=e;return{value:n,label:t,attributes:r,default:i}}))}(t);return function(e){const n=(0,c.XI)(e,((e,n)=>e.value===n.value));if(n.length>0)throw new Error(`Docusaurus error: Duplicate values "${n.map((e=>e.value)).join(", ")}" found in <Tabs>. Every value needs to be unique.`)}(e),e}),[n,t])}function p(e){let{value:n,tabValues:t}=e;return t.some((e=>e.value===n))}function m(e){let{queryString:n=!1,groupId:t}=e;const i=(0,s.W6)(),a=function(e){let{queryString:n=!1,groupId:t}=e;if("string"==typeof n)return n;if(!1===n)return null;if(!0===n&&!t)throw new Error('Docusaurus error: The <Tabs> component groupId prop is required if queryString=true, because this value is used as the search param name. You can also provide an explicit value such as queryString="my-search-param".');return t??null}({queryString:n,groupId:t});return[(0,l.aZ)(a),(0,r.useCallback)((e=>{if(!a)return;const n=new URLSearchParams(i.location.search);n.set(a,e),i.replace({...i.location,search:n.toString()})}),[a,i])]}function x(e){const{defaultValue:n,queryString:t=!1,groupId:i}=e,a=h(e),[s,l]=(0,r.useState)((()=>function(e){let{defaultValue:n,tabValues:t}=e;if(0===t.length)throw new Error("Docusaurus error: the <Tabs> component requires at least one <TabItem> children component");if(n){if(!p({value:n,tabValues:t}))throw new Error(`Docusaurus error: The <Tabs> has a defaultValue "${n}" but none of its children has the corresponding value. Available values are: ${t.map((e=>e.value)).join(", ")}. If you intend to show no default tab, use defaultValue={null} instead.`);return n}const r=t.find((e=>e.default))??t[0];if(!r)throw new Error("Unexpected error: 0 tabValues");return r.value}({defaultValue:n,tabValues:a}))),[c,d]=m({queryString:t,groupId:i}),[x,f]=function(e){let{groupId:n}=e;const t=function(e){return e?`docusaurus.tab.${e}`:null}(n),[i,a]=(0,u.Dv)(t);return[i,(0,r.useCallback)((e=>{t&&a.set(e)}),[t,a])]}({groupId:i}),v=(()=>{const e=c??x;return p({value:e,tabValues:a})?e:null})();(0,o.A)((()=>{v&&l(v)}),[v]);return{selectedValue:s,selectValue:(0,r.useCallback)((e=>{if(!p({value:e,tabValues:a}))throw new Error(`Can't select invalid tab value=${e}`);l(e),d(e),f(e)}),[d,f,a]),tabValues:a}}var f=t(9136);const v={tabList:"tabList__CuJ",tabItem:"tabItem_LNqP"};var b=t(4848);function g(e){let{className:n,block:t,selectedValue:r,selectValue:s,tabValues:o}=e;const l=[],{blockElementScrollPositionUntilNextRender:c}=(0,a.a_)(),u=e=>{const n=e.currentTarget,t=l.indexOf(n),i=o[t].value;i!==r&&(c(n),s(i))},d=e=>{let n=null;switch(e.key){case"Enter":u(e);break;case"ArrowRight":{const t=l.indexOf(e.currentTarget)+1;n=l[t]??l[0];break}case"ArrowLeft":{const t=l.indexOf(e.currentTarget)-1;n=l[t]??l[l.length-1];break}}n?.focus()};return(0,b.jsx)("ul",{role:"tablist","aria-orientation":"horizontal",className:(0,i.A)("tabs",{"tabs--block":t},n),children:o.map((e=>{let{value:n,label:t,attributes:a}=e;return(0,b.jsx)("li",{role:"tab",tabIndex:r===n?0:-1,"aria-selected":r===n,ref:e=>{l.push(e)},onKeyDown:d,onClick:u,...a,className:(0,i.A)("tabs__item",v.tabItem,a?.className,{"tabs__item--active":r===n}),children:t??n},n)}))})}function j(e){let{lazy:n,children:t,selectedValue:a}=e;const s=(Array.isArray(t)?t:[t]).filter(Boolean);if(n){const e=s.find((e=>e.props.value===a));return e?(0,r.cloneElement)(e,{className:(0,i.A)("margin-top--md",e.props.className)}):null}return(0,b.jsx)("div",{className:"margin-top--md",children:s.map(((e,n)=>(0,r.cloneElement)(e,{key:n,hidden:e.props.value!==a})))})}function y(e){const n=x(e);return(0,b.jsxs)("div",{className:(0,i.A)("tabs-container",v.tabList),children:[(0,b.jsx)(g,{...n,...e}),(0,b.jsx)(j,{...n,...e})]})}function E(e){const n=(0,f.A)();return(0,b.jsx)(y,{...e,children:d(e.children)},String(n))}},8453:(e,n,t)=>{t.d(n,{R:()=>s,x:()=>o});var r=t(6540);const i={},a=r.createContext(i);function s(e){const n=r.useContext(a);return r.useMemo((function(){return"function"==typeof e?e(n):{...n,...e}}),[n,e])}function o(e){let n;return n=e.disableParentContext?"function"==typeof e.components?e.components(i):e.components||i:s(e.components),r.createElement(a.Provider,{value:n},e.children)}}}]);