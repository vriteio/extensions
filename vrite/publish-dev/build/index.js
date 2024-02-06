var $=Symbol("usableEnv"),c=Symbol("value"),l=Symbol("id"),y=Symbol("componentName"),a={data:{},func:{},views:{},currentScope:null},v={},g=()=>`_${Math.random().toString(36).substr(2,9)}`,r=new Proxy({},{get(t,e){let n=()=>{};return Object.defineProperty(n,y,{value:e}),n}});function C(t){if(!a.data.temp){let i=()=>a.data.temp[c];Object.defineProperty(i,l,{value:"temp"}),Object.defineProperty(i,c,{value:{},writable:!0}),a.data.temp=i}let e=g(),n=i=>{let d=a.data.temp;d[c][e]&&(d[c][e][c]=i)},o=()=>a.data.temp[c][e][c];return Object.defineProperty(o,l,{value:`temp.${e}`}),Object.defineProperty(o,c,{value:t,writable:!0}),a.data.temp[c][e]=o,a.currentScope&&a.currentScope.temp.push(e),[o,n]}var h=t=>{let e=g(),n=t;return Object.defineProperty(n,l,{value:e}),a.func[e]=n,a.currentScope&&a.currentScope.func.push(e),n},s=(t,e,...n)=>({component:t[y]||"Fragment",slot:n,props:Object.fromEntries(Object.keys(e||{}).map(o=>{let i=e[o];return i&&i[l]?[o,i[l]]:[o,i]}))}),k=(...t)=>({component:"Fragment",slot:t,props:{}}),P=t=>{let e=g(),n={[l]:e,[c]:t};return a.views[e]=n,n},S=t=>{let e=v[t];e&&(e.func.forEach(n=>{delete a.func[n]}),e.temp.forEach(n=>{let o=a.data.temp;o()&&delete o()[n]}))},F=t=>({getEnvironment:()=>a,getMetadata:()=>({__value:c,__id:l,__componentName:y,__usableEnv:$}),generateRuntimeSpec:()=>({...t,onUninstall:t.onUninstall?.[l],onConfigure:t.onConfigure?.[l],configurationView:t.configurationView?.[l],contentPieceView:t.contentPieceView?.[l],blockActions:t.blockActions?.map(e=>({...e,view:e.view[l]}))}),generateView:async(e,n)=>{let o=a.views[e]?.[c];if(o){a.currentScope={func:[],temp:[]};let i=await o(n);return v[`view:${e}`]=a.currentScope,a.currentScope=null,i}return{component:"",slot:[]}},runFunction:async(e,n)=>{let o=a.func[e];o&&(a.currentScope={func:[],temp:[]},await o(n),v[`func:${e}`]=a.currentScope,a.currentScope=null,S(`func:${e}`))},removeScope:S});var R=F({onUninstall:h(async({client:t})=>{let e=await t.webhooks.list({extensionOnly:!0});e.length>0&&t.webhooks.delete({id:e[0].id})}),onConfigure:h(async({client:t,config:e,spec:n})=>{let o=await t.webhooks.list({extensionOnly:!0}),i=e?.autoPublish&&e?.contentGroupId&&e?.apiKey;o.length>0?i?await t.webhooks.update({id:o[0].id,url:"https://extensions.vrite.io/dev/webhook",metadata:{contentGroupId:`${e.contentGroupId}`}}):await t.webhooks.delete({id:o[0].id}):i&&await t.webhooks.create({name:n.displayName,event:"contentPieceAdded",metadata:{contentGroupId:`${e.contentGroupId}`},url:"https://extensions.vrite.io/dev/webhook"})}),configurationView:P(({use:t})=>{let[e]=t("config.apiKey"),[n]=t("config.organizationId"),[o,i]=t("config.autoPublish"),[d,u]=t("config.contentGroupId"),[f]=t("config.requireCanonicalLink"),[p]=t("config.draft");return typeof o()!="boolean"&&i(!0),d()||u(""),s(k,null,s(r.Field,{type:"text",color:"contrast",label:"API key",placeholder:"API key","bind:value":e},"Your Dev.to API key. You can generate one in the [settings page](https://dev.to/settings/extensions), under **DEV Community API Keys** section"),s(r.Field,{type:"text",color:"contrast",label:"Organization ID",optional:!0,"bind:value":n},"ID of the Dev.to organization you are in and want to publish your posts to. You can find the organization ID in the URL of the your [Dev.to Dashboard](https://dev.to/dashboard), when **filtering posts by organization**"),s(r.Show,{"bind:when":o},s(r.Field,{type:"text",color:"contrast",label:"Content group","bind:value":d},"Provide ID of a content group to auto-publish from, when content pieces are moved to it. You can copy the ID from the dashboard."),s(r.Field,{type:"checkbox",color:"contrast",label:"Require canonical link","bind:value":f},"Don't auto-publish when no canonical link is set")),s(r.Field,{type:"checkbox",color:"contrast",label:"Auto-publish","bind:value":o},"Publish posts automatically"),s(r.Field,{type:"checkbox",color:"contrast",label:"Draft","bind:value":p},"whether the Dev.to article should be in draft (private) by default"))}),contentPieceView:P(({config:t,token:e,extensionId:n,notify:o,use:i,flush:d})=>{let u=!t?.apiKey||t.autoPublish&&!t.contentGroupId,f=i("contentPiece"),[p,D]=i("data.devId"),[V]=i("data.devSeries"),[x,O]=i("data.autoPublish"),[I,A]=i("data.draft"),[j,w]=C(!1),[G,_]=C(p()?"Update":"Publish"),z=h(async()=>{try{w(!0),await d();let m=await fetch("https://extensions.vrite.io/dev",{method:"POST",headers:{Authorization:`Bearer ${e}`,"X-Vrite-Extension-Id":n,"Content-Type":"application/json"},body:JSON.stringify({contentPieceId:f().id})}),b=await m.json();if(!m.ok||!b.devId)throw new Error("Couldn't publish to Dev.to");p()?o({text:"Updated on Dev.to",type:"success"}):o({text:"Published to Dev.to",type:"success"}),b.devId&&b.devId!==p()&&D(b.devId),w(!1),_("Update"),await d()}catch{o({text:"Couldn't publish to Dev.to",type:"error"}),w(!1),await d()}});return typeof I()!="boolean"&&A(t?.draft||!1),typeof x()!="boolean"&&O(!0),s(r.View,{class:"flex flex-col gap-2"},s(r.Field,{type:"text",color:"contrast",label:"Series name",placeholder:"Series name","bind:value":V,disabled:u},"The exact name of the series to which this post should be added"),s(r.Field,{type:"checkbox",color:"contrast",label:"Draft","bind:value":I,disabled:u},"whether the Dev.to article should be in draft (private)"),s(r.Show,{when:t?.autoPublish},s(r.Field,{type:"checkbox",color:"contrast",label:"Auto-publish","bind:value":x,disabled:u},"whether the article should be auto-published")),s(r.Button,{color:"primary",class:"w-full flex justify-center items-center m-0",disabled:u,"bind:loading":j,"on:click":z},s(r.Text,{"bind:content":G})))})});export{R as default};
