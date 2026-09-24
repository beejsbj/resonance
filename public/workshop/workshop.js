const KEY='resonance-workshop-v1';
const NS='http://www.w3.org/2000/svg';
const REACTIONS=['Unreviewed','Keep exploring','Feels right','Needs revision'];
const STATUS_NAMES={confirmed:'Confirmed',proposal:'Proposal',open:'Open',alternative:'Alternative'};
// A selection is a system, a connection, or a scenario step; each owns what the diagram highlights.
let data, selected={kind:'system',id:'mining'}, all=false, step=null, notes={};
const message=document.getElementById('message');
function say(s){message.textContent=s;}
try {const saved=JSON.parse(localStorage.getItem(KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved)) notes=saved;} catch {say('Browser storage is unavailable or unreadable. You can still export notes.');}
function el(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e;}
function svg(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;}
const system=id=>data.systems.find(n=>n.id===id);
const edge=id=>data.edges.find(e=>e.id===id);
const scenario=()=>data.scenarios[0];
function badge(status){return el('span',STATUS_NAMES[status]||status,'badge '+(status==='confirmed'||status==='Confirmed core'?'':status==='open'||status==='Open boundary'?'open':'proposal'));}
function noteKeys(){return new Set([...data.systems.map(s=>s.id),...data.edges.map(e=>'edge:'+e.id),...data.scenarios.map(s=>'scenario:'+s.id)]);}
function noteTitle(key){if(key.startsWith('edge:'))return edge(key.slice(5)).label;if(key.startsWith('scenario:'))return scenario().title;return system(key).title;}
function validNote(n){return n&&typeof n.text==='string'&&REACTIONS.includes(n.reaction);}
function save(){try{localStorage.setItem(KEY,JSON.stringify(notes));say('Notes saved in this browser. Export to share them in our chat.');}catch{say('Browser storage is unavailable. Export your notes before leaving.');}}
function noteForm(key,prompt='What should change or stay?'){const box=el('div',undefined,'note-form');const title=noteTitle(key);box.append(el('h3','Your notes · '+title));const label=el('label','Current reaction');const select=el('select');select.setAttribute('aria-label','Current reaction for '+title);for(const value of REACTIONS){const option=el('option',value);option.value=value;select.append(option);}select.value=notes[key]?.reaction||'Unreviewed';label.append(select);const textLabel=el('label',prompt);const textarea=el('textarea');textarea.setAttribute('aria-label','Notes for '+title);textarea.placeholder='Point to a relationship, name an alternative, or describe an example…';textarea.value=notes[key]?.text||'';textLabel.append(textarea);const update=()=>{notes[key]={reaction:select.value,text:textarea.value,updatedAt:new Date().toISOString()};save();};select.addEventListener('change',update);textarea.addEventListener('input',update);box.append(label,textLabel,el('small','A reaction is a workshop annotation, not a settled game decision.'));return box;}
function choose(kind,id){selected={kind,id};draw();inspect();}
function chooseStep(i){step=i;renderScenario();draw();inspect();}

// Geometry: straight-ish curves between neighbours, an arc under the row for same-row skips,
// and a sideways offset when two edges run between the same pair in opposite directions.
function route(e){const from=system(e.from),to=system(e.to);const reverse=data.edges.some(o=>o.from===e.to&&o.to===e.from&&o.status!=='alternative'&&e.status!=='alternative');const shift=reverse?(e.from<e.to?-9:9):0;
let x1=from.x+125,y1=from.y+57,x2=to.x+125,y2=to.y+57;
if(from.y===to.y&&Math.abs(x2-x1)>400){y1=y2=from.y+114;const dip=from.y+114+62;return {d:`M${x1},${y1} C${x1},${dip} ${x2},${dip} ${x2},${y2}`,mid:[(x1+x2)/2,from.y+114+46]};}
if(from.y===to.y){const direction=x2>x1?1:-1;x1+=direction*125;x2-=direction*125;y1+=shift;y2+=shift;}else {const direction=y2>y1?1:-1;y1+=direction*57;y2-=direction*57;x1+=shift;x2+=shift;}
const dx=x2-x1,dy=y2-y1;const horizontal=Math.abs(dx)>Math.abs(dy);const c1=horizontal?[x1+dx/2,y1]:[x1,y1+dy/2],c2=horizontal?[x1+dx/2,y2]:[x2,y1+dy/2];
return {d:`M${x1},${y1} C${c1[0]},${c1[1]} ${c2[0]},${c2[1]} ${x2},${y2}`,mid:[(x1+3*c1[0]+3*c2[0]+x2)/8,(y1+3*c1[1]+3*c2[1]+y2)/8]};}

function focus(){if(step!==null){const ids=new Set(scenario().steps[step].edges);return {edges:ids,labelled:ids};}
if(selected.kind==='edge'){const ids=new Set([selected.id]);return {edges:ids,labelled:ids};}
return {edges:new Set(data.edges.filter(e=>e.from===selected.id||e.to===selected.id).map(e=>e.id)),labelled:new Set()};}

function draw(){const root=document.getElementById('diagram');root.replaceChildren();const defs=svg('defs',{},root);const marker=svg('marker',{id:'arrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:5,markerHeight:5,orient:'auto-start-reverse'},defs);svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#8de6ce'},marker);
const {edges:focused,labelled}=focus();const connected=new Set(selected.kind==='system'&&step===null?[selected.id]:[]);for(const e of data.edges)if(focused.has(e.id)){connected.add(e.from);connected.add(e.to);}
for(const [i,title] of ['EXPAND / PRODUCE / INVEST','RECRUIT / ARRANGE / DEVELOP','CONDUCT / DEFEND / SURVIVE','MUSIC / TIME AWAY / PERSISTENCE'].entries())svg('text',{x:35,y:30+i*215,class:'row-label'},root).textContent=title;
const labels=[];
for(const e of data.edges){if(e.status==='alternative')continue;const relevant=focused.has(e.id);if(!all&&!relevant)continue;const {d,mid}=route(e);
const isSelected=selected.kind==='edge'&&selected.id===e.id;
svg('path',{d,class:`edge ${e.status}${relevant?' focus':''}${isSelected?' selected':''}`,'marker-end':'url(#arrow)'},root);
const hit=svg('path',{d,class:'edge-hit'},root);svg('title',{},hit).textContent=`${e.label} · ${STATUS_NAMES[e.status]}`;hit.addEventListener('click',()=>{if(step!==null){step=null;renderScenario();}choose('edge',e.id);});
if(labelled.has(e.id))labels.push([mid,e.label]);}
for(const n of data.systems){const g=svg('g',{class:`node${selected.kind==='system'&&n.id===selected.id&&step===null?' selected':''}${!all&&!connected.has(n.id)?' dim':''}`,role:'button',tabindex:0,'aria-label':`${n.title}. ${n.status}. ${n.summary}`,'aria-pressed':String(selected.kind==='system'&&n.id===selected.id)},root);svg('rect',{x:n.x,y:n.y,width:250,height:114,rx:8},g);svg('text',{x:n.x+15,y:n.y+27,class:'title'},g).textContent=n.title;svg('text',{x:n.x+15,y:n.y+55,class:'summary'},g).textContent=n.summary;svg('text',{x:n.x+15,y:n.y+91,class:'state'+(n.status==='Confirmed core'?' confirmed':'')},g).textContent=n.status;const pick=()=>{if(step!==null){step=null;renderScenario();}choose('system',n.id);};g.addEventListener('click',pick);g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();pick();root.querySelectorAll('.node')[data.systems.findIndex(s=>s.id===n.id)].focus();}});}
// Labels sit above nodes so a highlighted consequence reads even where its line passes behind a box.
for(const [[x,y],text] of labels){const plate=svg('rect',{class:'label-plate',rx:4},root);const t=svg('text',{x,y:y+4,class:'edge-label','text-anchor':'middle'},root);t.textContent=text;const box=t.getBBox();for(const [k,v] of Object.entries({x:box.x-6,y:box.y-3,width:box.width+12,height:box.height+6}))plate.setAttribute(k,v);}}

function connectionButton(e,from){const toward=e.from===from;const other=system(toward?e.to:e.from);const button=el('button',`${toward?'→':'←'} ${other.title} · ${e.label}`);button.append(' ',badge(e.status));button.addEventListener('click',()=>choose('edge',e.id));return button;}
function inspect(){const pane=document.getElementById('inspector');pane.replaceChildren();if(step!==null){pane.append(scenarioStep());return;}
if(selected.kind==='edge'){const e=edge(selected.id),from=system(e.from),to=system(e.to);pane.append(el('span','CONNECTION','eyebrow'),el('h2',e.label),badge(e.status));const ends=el('div',undefined,'ends');for(const [n,arrow] of [[from,''],[to,'→ ']]){const b=el('button',arrow+n.title);b.addEventListener('click',()=>choose('system',n.id));ends.append(b);}pane.append(ends);
pane.append(el('h4','When'),el('p',e.trigger),el('h4','Then'),el('p',e.effect));if(e.evidence)pane.append(el('h4','Playable evidence'),el('p',e.evidence,'evidence'));if(e.questions){pane.append(el('h4','Still to decide'));const list=el('ul');for(const q of e.questions)list.append(el('li',q));pane.append(list);}
const source=el('a',data.sources[e.source].title+' ↗','source');source.href=data.sources[e.source].url;source.target='_blank';source.rel='noreferrer';pane.append(source,noteForm('edge:'+e.id));return;}
const n=system(selected.id);pane.append(el('span',n.category.toUpperCase(),'eyebrow'),el('h2',n.title),badge(n.status),el('p',n.role));
for(const [heading,items] of [['Accepted direction',n.accepted],['Still to decide',n.questions]]){pane.append(el('h4',heading));const list=el('ul');for(const item of items)list.append(el('li',item));pane.append(list);}
pane.append(el('h4','Connections'));const links=el('div',undefined,'connections');for(const e of data.edges)if(e.from===n.id||e.to===n.id)links.append(connectionButton(e,n.id));pane.append(links);const source=el('a',data.sources[n.source].title+' ↗','source');source.href=data.sources[n.source].url;source.target='_blank';source.rel='noreferrer';pane.append(source,noteForm(n.id));}

// The scenario takes over the inspector so the map it lights up stays in view.
function renderScenario(){const trace=document.getElementById('trace');trace.textContent=step===null?'Trace: '+scenario().title:'Stop tracing';trace.setAttribute('aria-pressed',String(step!==null));}
function scenarioStep(){const panel=el('div',undefined,'scenario');const sc=scenario(),s=sc.steps[step];const head=el('div',undefined,'scenario-head');head.append(el('span',`${sc.title.toUpperCase()} · ${step+1} / ${sc.steps.length}`,'eyebrow'),badge(s.status));panel.append(head,el('h3',s.title),el('p',s.text));
if(s.ask)panel.append(el('p',s.ask,'ask'));
const links=el('div',undefined,'connections inline');for(const id of s.edges){const e=edge(id);const b=el('button',`${system(e.from).title} → ${system(e.to).title} · ${e.label}`);b.addEventListener('click',()=>{step=null;renderScenario();choose('edge',id);});links.append(b);}panel.append(links);
const nav=el('div',undefined,'scenario-nav');const prev=el('button','← Previous');prev.disabled=step===0;prev.addEventListener('click',()=>chooseStep(step-1));const next=el('button',step===sc.steps.length-1?'Finish':'Next →');next.addEventListener('click',()=>step===sc.steps.length-1?chooseStep(null):chooseStep(step+1));nav.append(prev,next);panel.append(nav);
if(s.ask)panel.append(noteForm('scenario:'+sc.id,'Your answer, or what should happen instead'));return panel;}

function renderNotes(){for(const target of document.querySelectorAll('.note-target'))target.replaceChildren(noteForm(target.dataset.noteTarget));}
for(const button of document.querySelectorAll('nav button'))button.addEventListener('click',()=>{for(const b of document.querySelectorAll('nav button')){b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));}for(const v of document.querySelectorAll('.view'))v.classList.toggle('active',v.id===button.dataset.view);if(data){inspect();renderNotes();}history.replaceState(null,'','#'+button.dataset.view);});
document.getElementById('show-all').addEventListener('click',e=>{all=!all;e.target.textContent=all?'Focus selection':'Show all connections';if(data)draw();});
document.getElementById('trace').addEventListener('click',()=>{if(data)chooseStep(step===null?0:null);});
document.getElementById('export').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({format:'resonance-workshop-v1',mapRevision:data?.revision||'unknown',exportedAt:new Date().toISOString(),notes},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=el('a');a.href=url;a.download='resonance-workshop-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);say('Notes exported. Attach the JSON file in our chat to share your reactions.');});
document.getElementById('import').addEventListener('change',async e=>{const file=e.target.files?.[0];if(!file)return;try{if(!data)throw Error('Wait for the map to load.');if(file.size>1000000)throw Error('Choose a workshop export smaller than 1 MB.');const incoming=JSON.parse(await file.text());if(incoming.format!=='resonance-workshop-v1'||!incoming.notes||typeof incoming.notes!=='object'||Array.isArray(incoming.notes))throw Error('This is not a workshop notes export.');const keys=noteKeys();for(const key of keys){const note=incoming.notes[key];if(note&&!validNote(note))throw Error('The export contains an invalid note.');}let count=0;for(const key of keys){const note=incoming.notes[key];if(note){notes[key]={text:note.text,reaction:note.reaction,updatedAt:typeof note.updatedAt==='string'?note.updatedAt:new Date().toISOString()};count++;}}save();inspect();renderNotes();say(`Imported ${count} notes. Matching topics were replaced; other notes were kept.`);}catch(error){say('Could not import: '+error.message);}e.target.value='';});
try{const response=await fetch('data.json');if(!response.ok)throw Error('Map data could not be loaded.');data=await response.json();const keys=noteKeys();notes=Object.fromEntries(Object.entries(notes).filter(([key,n])=>keys.has(key)&&validNote(n)));draw();inspect();renderNotes();renderScenario();const view=location.hash.slice(1);const button=[...document.querySelectorAll('nav button')].find(b=>b.dataset.view===view);if(button)button.click();}catch(error){document.getElementById('inspector').textContent='Unable to load the map. Reload to retry.';say(error.message);}
