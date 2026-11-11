import './style.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Walker } from './walker.js';
import { Dimensions } from './dimensions.js';
import { bindScreenMode } from './screen-mode.js';

const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
const asset=name=>import.meta.env.BASE_URL+'assets/'+name;
const host=$('#canvas-host'),stage=$('.stage');
let toastTimer;function notify(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3300);}
const state={view:'overview',roof:false,dimensions:false,dusk:false,high:!matchMedia('(pointer:coarse)').matches,ready:false,dirty:true};
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.04,350);camera.position.set(-19,16,24);
let renderer;try{renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});}catch(error){$('#loading-detail').textContent='当前浏览器无法启用三维加速，请使用新版 Chrome、Edge 或 Safari。';throw error;}
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.AgXToneMapping;renderer.toneMappingExposure=1.12;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
host.appendChild(renderer.domElement);
const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.dampingFactor=.075;controls.minDistance=0;controls.maxDistance=Infinity;controls.minZoom=0;controls.maxZoom=Infinity;controls.maxPolarAngle=Math.PI*.49;controls.target.set(-.5,2.8,0);
controls.addEventListener('change',()=>{if(!walker?.active)updateProjection();state.dirty=true;});
const composer=new EffectComposer(renderer),renderPass=new RenderPass(scene,camera);composer.addPass(renderPass);
const ao=new GTAOPass(scene,camera,800,600,undefined,{radius:.48,thickness:1.1,distanceExponent:1.4,samples:12},{lumaPhi:8,depthPhi:2,normalPhi:3,radius:4,samples:12});ao.blendIntensity=.60;composer.addPass(ao);composer.addPass(new OutputPass());composer.addPass(new SMAAPass());
const ambient=new THREE.HemisphereLight(0xd9e4ef,0x756c55,.38);scene.add(ambient);
const sun=new THREE.DirectionalLight(0xfff1df,2.7);sun.position.set(-18,27,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-19;sun.shadow.camera.right=19;sun.shadow.camera.top=22;sun.shadow.camera.bottom=-22;sun.shadow.camera.near=1;sun.shadow.camera.far=80;sun.shadow.normalBias=.018;sun.shadow.bias=-.0001;sun.shadow.radius=3;sun.target.position.set(0,2,0);scene.add(sun,sun.target);
const fill=new THREE.DirectionalLight(0xccdbed,.35);fill.position.set(15,10,-17);scene.add(fill);
const indoorLights=[],interactions=[],interactiveMeshes=[],hotspots=[];let data,model,walker,environment,transition,hovered=null,dimensions,notesData,roofLod;const roofDetail=[];
const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2();
const views={overview:{label:'整体'},floor1:{label:'一层'},floor2:{label:'二层'},office:{label:'办公区'},meeting:{label:'会议室'}};
function updateProjection(){
 const distance=camera.position.distanceTo(controls.target);
 camera.near=walker?.active ? .045 : Math.max(.000001,distance*.012);camera.far=Math.max(500,distance*12+100);
 if(scene.fog){scene.fog.near=Math.max(65,distance*1.6);scene.fog.far=Math.max(190,distance*3.5);}
 camera.updateProjectionMatrix();const shift=walker?.active?0:(camera.userData.shiftY||0);
 if(shift){camera.projectionMatrix.elements[9]+=2*shift*camera.aspect;camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
}
function updateText(key){const v=views[key]||views.overview;$('#view-label').textContent=v.label;$$('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===key));}
function setView(key,instant=false){
  if(!state.ready)return;state.view=key;updateText(key);
  if(walker.active){const spawns={overview:'courtyard',floor1:'storage',floor2:'office',office:'office',meeting:'meeting'};walker.teleport(spawns[key]);updateLighting();return;}
  state.roof=key==='floor1'||key==='floor2';applyVisibility();
  const p=data.cameras[key]||data.cameras.overview,indoor=['office','meeting'].includes(key);
  controls.maxPolarAngle=indoor?Math.PI*.93:Math.PI*.49;
  const fov=indoor?THREE.MathUtils.clamp(p.fov+10,58,70):p.fov;
  camera.near=indoor?.04:.45;camera.far=500;updateProjection();
  const target=new THREE.Vector3(...p.target),to=new THREE.Vector3(...p.position);
  if(!indoor){const scale=(key==='overview'?1.08:1)*Math.max(1,1.0/camera.aspect);to.sub(target).multiplyScalar(scale).add(target);}
  transition={start:performance.now(),duration:instant?0:1100,from:camera.position.clone(),to,targetFrom:controls.target.clone(),targetTo:target,fovFrom:camera.fov,fovTo:fov,shiftFrom:camera.userData.shiftY||0,shiftTo:indoor?(p.shiftY??-.10):0};state.dirty=true;updateLighting();
}
function applyVisibility(){
  if(!model)return;
  model.traverse(o=>{if(!o.isMesh)return;const group=o.userData.webGroup,role=o.userData.webRole;
    let visible=true;if(!walker?.active){if(state.roof&&(group==='roof'||role==='ceiling'))visible=false;if(state.view==='floor1'&&(group==='floor2'||o.userData.webFloor===2))visible=false;}
    o.visible=visible;
  });
  $('#roof-button').setAttribute('aria-pressed',String(state.roof));$('#roof-button .tool-label').textContent=state.roof?'合顶':'揭顶';renderer.shadowMap.needsUpdate=true;state.dirty=true;
  dimensions?.setMode(state.dimensions,state.view,!!walker?.active);
  updateRoofLOD();
}
function updateRoofLOD(){
 if(!roofLod)return;
 const allowed=!state.roof||!!walker?.active;
 const far=matchMedia('(pointer:coarse)').matches&&!state.high&&!walker?.active&&camera.position.distanceTo(new THREE.Vector3(0,3,0))>18;
 roofLod.visible=allowed&&far;for(const mesh of roofDetail)mesh.visible=allowed&&!far;
}
function updateLighting(){
  const indoor=walker?.active&&walker.getFeet().y>.3||['office','meeting'].includes(state.view);
  scene.environmentIntensity=state.dusk?.25:indoor?.78:.8;renderer.toneMappingExposure=state.dusk?.82:indoor?1.20:1.02;
  sun.intensity=state.dusk?.32:2.0;sun.color.set(state.dusk?0xffab71:0xfff4e4);ambient.intensity=state.dusk?.18:.33;fill.intensity=state.dusk?.13:.28;
  scene.backgroundIntensity=state.dusk?.20:1;
  updateLocalLights();
  $('#light-button').setAttribute('aria-pressed',String(state.dusk));$('#light-button .tool-label').textContent=state.dusk?'夜间':'日间';$('#light-button>span').textContent=state.dusk?'☾':'☀';state.dirty=true;
}
function updateLocalLights(){
 if(!data||!indoorLights.length)return;
 const point=walker?.active?walker.getEye():camera.position;
 const nearby=(data.lights||[]).map(source=>({source,distance:new THREE.Vector3(...source.position).distanceToSquared(point)})).sort((a,b)=>a.distance-b.distance).slice(0,indoorLights.length);
 indoorLights.forEach((light,index)=>{const source=nearby[index]?.source;if(!source){light.intensity=0;return;}light.position.fromArray(source.position);light.color.fromArray(source.color||[1,.955,.85]);light.intensity=Math.max(.16,Math.min(12,(source.power??source.energy??16)*.45))*(state.dusk?1.4:1);});
}
function resize(){const w=host.clientWidth,h=host.clientHeight;if(!w||!h)return;
 const nextAspect=w/h,previousAspect=camera.aspect;
 if(state.ready&&!walker?.active&&!['office','meeting'].includes(state.view)&&Math.abs(nextAspect-previousAspect)>.05){
  const factor=Math.max(1,1/nextAspect)/Math.max(1,1/previousAspect);
  camera.position.sub(controls.target).multiplyScalar(factor).add(controls.target);
  if(transition){transition.from.sub(transition.targetFrom).multiplyScalar(factor).add(transition.targetFrom);transition.to.sub(transition.targetTo).multiplyScalar(factor).add(transition.targetTo);}
 }
 const ratio=state.high?Math.min(devicePixelRatio,1.6):Math.min(devicePixelRatio,1);renderer.setPixelRatio(ratio);renderer.setSize(w,h);composer.setPixelRatio(ratio);composer.setSize(w,h);camera.aspect=nextAspect;updateProjection();ao.enabled=state.high;state.dirty=true;}
new ResizeObserver(resize).observe(host);
function interactionOf(object){let o=object;while(o){if(o.userData.interactionId)return interactions.find(i=>i.id===o.userData.interactionId);o=o.parent;}return null;}
function isVisible(o){for(;o;o=o.parent)if(!o.visible)return false;return true;}
function toggle(item){
  if(!item||!isVisible(item.node))return;
  if(item.open&&walker.active){const box=new THREE.Box3(new THREE.Vector3(...item.closedBounds.min),new THREE.Vector3(...item.closedBounds.max));box.expandByScalar(.26);if(box.containsPoint(walker.getEye().add(new THREE.Vector3(0,-.6,0)))){notify('请先离开门口，再关闭');return;}}
  item.open=!item.open;item.target=item.closedAngle+(item.open?item.angle:0);state.dirty=true;
  notify(`${item.label.replaceAll('_',' · ')}已${item.open?'打开':'关闭'}`);
}
function setupInteractions(){
  for(const spec of data.interactions||[]){const node=model.getObjectByName(spec.name);if(!node)continue;
    node.updateWorldMatrix(true,true);const inverse=node.matrixWorld.clone().invert(),localBox=new THREE.Box3();
    node.traverse(child=>{if(child.isMesh){child.geometry.computeBoundingBox();localBox.union(child.geometry.boundingBox.clone().applyMatrix4(inverse.clone().multiply(child.matrixWorld)));}});
    const item={...spec,node,open:false,closedAngle:node.rotation.y,target:node.rotation.y,localBox};interactions.push(item);node.traverse(child=>{child.userData.interactionId=spec.id;if(child.isMesh)interactiveMeshes.push(child);});
  }
}
function makeHotspots(){
  for(const spot of [{key:'office',text:'进入办公区',position:[0,4.7,-5]},{key:'meeting',text:'进入会议室',position:[-4.9,4.5,2]},{key:'floor1',text:'查看一层',position:[5,1.55,2]}]){
    const el=document.createElement('button');el.className='hotspot';el.textContent=spot.text;el.onclick=()=>setView(spot.key);$('#hotspots').appendChild(el);hotspots.push({...spot,el,point:new THREE.Vector3(...spot.position)});
  }
}
function updateHotspots(){
  const w=host.clientWidth,h=host.clientHeight;
  for(const spot of hotspots){const p=spot.point.clone().project(camera),show=!walker?.active&&state.view==='overview'&&!state.dimensions&&p.z>0&&p.z<1&&Math.abs(p.x)<.87&&p.y<.83&&p.y>-.40;spot.el.hidden=!show;spot.el.style.left=`${(p.x*.5+.5)*w}px`;spot.el.style.top=`${(-p.y*.5+.5)*h}px`;}
}
let pressed=null;host.addEventListener('pointerdown',e=>{pressed={x:e.clientX,y:e.clientY};});
host.addEventListener('pointerup',e=>{if(!state.ready||walker.active||!pressed||Math.hypot(e.clientX-pressed.x,e.clientY-pressed.y)>5)return;const r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(model,true).find(h=>isVisible(h.object));if(hit)toggle(interactionOf(hit.object));});
let lastPointerTime=0;host.addEventListener('pointermove',e=>{if(!state.ready||walker.active||e.buttons||performance.now()-lastPointerTime<90){$('#object-tooltip').hidden=true;return;}lastPointerTime=performance.now();const r=host.getBoundingClientRect();pointer.set((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(model,true).find(h=>isVisible(h.object));const item=hit?interactionOf(hit.object):null;const tip=$('#object-tooltip');tip.hidden=!item;host.style.cursor=item?'pointer':'grab';if(item){tip.textContent=`点击${item.open?'关闭':'打开'}${item.type==='door'?'房门':'柜门'}`;tip.style.left=`${Math.min(e.clientX-r.left+14,r.width-135)}px`;tip.style.top=`${e.clientY-r.top+14}px`;}});host.addEventListener('pointerleave',()=>{$('#object-tooltip').hidden=true;});
function findNearbyInteraction(){
  if(!walker.active)return;
  const eye=walker.getEye(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(walker.pitch,walker.yaw,0,'YXZ'));
  const previousFocus=hovered;raycaster.set(eye,new THREE.Vector3(0,0,-1).applyQuaternion(q));raycaster.far=2.5;const hit=raycaster.intersectObject(model,true).find(h=>isVisible(h.object));hovered=hit?interactionOf(hit.object):null;raycaster.far=Infinity;if(previousFocus!==hovered)state.dirty=true;
  const button=$('#interact-button');button.disabled=!hovered;const prefix=walker.isTouch()?'':'E ';button.textContent=hovered?`${prefix}${hovered.open?'关闭':'打开'}${hovered.type==='door'?'房门':'柜门'}`:prefix+'交互';
}
$('#interact-button').onclick=()=>toggle(hovered);
$$('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
$('.brand').onclick=e=>{e.preventDefault();if(walker?.active)exitWalk();setView('overview');};
$('#reset-button').onclick=()=>setView(state.view);
$('#roof-button').onclick=()=>{if(walker?.active){notify('揭顶查看请先切换到上帝视角');return;}state.roof=!state.roof;applyVisibility();};
$('#dimensions-button').onclick=()=>{const enabled=!state.dimensions;if(enabled&&!walker?.active&&['office','meeting'].includes(state.view))setView('floor2');state.dimensions=enabled;$('#dimensions-button').setAttribute('aria-pressed',String(state.dimensions));dimensions?.setMode(state.dimensions,state.view,!!walker?.active);state.dirty=true;};
$('#light-button').onclick=()=>{state.dusk=!state.dusk;updateLighting();};
$('#quality-button').onclick=()=>{state.high=!state.high;$('#quality-button').setAttribute('aria-pressed',String(state.high));$('#quality-button .tool-label').textContent=state.high?'高清':'流畅';resize();notify(state.high?'画质：高清':'画质：流畅');};
$('#fullscreen-button').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('#app').requestFullscreen();}catch{notify('当前浏览器不支持全屏，可旋转手机横屏查看');}};
function enterWalk(){if(!state.ready)return;transition=null;controls.enabled=false;state.roof=false;state.view='overview';camera.userData.shiftY=0;updateText('overview');host.style.cursor='crosshair';$('#object-tooltip').hidden=true;walker.enter('courtyard');$('#app').classList.add('person-active');applyVisibility();$('#walk-mode').classList.add('selected');$('#walk-mode').setAttribute('aria-pressed','true');$('#god-mode').classList.remove('selected');$('#god-mode').setAttribute('aria-pressed','false');$('#view-label').textContent='人物漫游';updateLighting();}
function exitWalk(){walker?.exit();$('#app').classList.remove('person-active');camera.zoom=1;controls.enabled=true;$('#god-mode').classList.add('selected');$('#god-mode').setAttribute('aria-pressed','true');$('#walk-mode').classList.remove('selected');$('#walk-mode').setAttribute('aria-pressed','false');setView('overview',true);}
$('#walk-mode').onclick=()=>{if(!walker?.active)enterWalk();};$('#god-mode').onclick=()=>{if(walker?.active)exitWalk();};$('#exit-walk').onclick=exitWalk;
bindScreenMode({app:$('#app'),button:$('#landscape-button'),notify,beforeChange:()=>walker?.clearInput(),onChange:()=>{state.dirty=true;}});
$('#gallery-button').onclick=()=>{document.exitPointerLock?.();$('#gallery').showModal();};$('#help-button').onclick=()=>{document.exitPointerLock?.();$('#help').showModal();};
$$('[data-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
$$('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}}));
const imageNames={exterior:'建筑外观',courtyard:'庭院正面',office:'办公区',meeting:'会议室',storage:'储藏室',locker:'更衣室',safety:'应急灯与出口标识'};
$$('[data-image]').forEach(b=>b.onclick=()=>{$$('[data-image]').forEach(t=>t.classList.toggle('active',t===b));$('#gallery-image').src=asset(b.dataset.image+'.webp');$('#gallery-image').alt=imageNames[b.dataset.image]+'原生效果图';$('#download-render').href=asset(b.dataset.image+'.webp');$('#download-render').download=imageNames[b.dataset.image]+'.webp';});
function showNotes(tab='specifications'){
 const content=$('#notes-content');content.replaceChildren();$$('[data-notes-tab]').forEach(b=>b.classList.toggle('active',b.dataset.notesTab===tab));
 if(!notesData){content.textContent='图纸说明正在载入…';return;}
 const paragraph=(parent,tag,text,className)=>{const node=document.createElement(tag);node.textContent=text;if(className)node.className=className;parent.appendChild(node);return node;};
 if(tab==='specifications')for(const note of notesData.notes){const block=document.createElement('section');block.className='note-block';paragraph(block,'small',`原图第 ${note.page} 页`);paragraph(block,'p',note.translation);paragraph(block,'p',note.original,'note-original');content.appendChild(block);}
 if(tab==='legend')for(const item of notesData.legends){const block=document.createElement('section');block.className='note-block';paragraph(block,'small',`第 ${item.page} 页 · ${item.original}`);paragraph(block,'h3',item.translation);paragraph(block,'p',`本方案：${notesData.installedCounts[item.type]??'—'} 处`);paragraph(block,'p',item.remarks||'按原图图例表达；设备外形和未注尺寸为表现示意。','note-original');content.appendChild(block);}
 if(tab==='dimensions')for(const item of notesData.dimensionNotes){const block=document.createElement('section');block.className='note-block';paragraph(block,'h3',item.title);paragraph(block,'p',item.text);content.appendChild(block);}
}
$('#notes-button').onclick=()=>{document.exitPointerLock?.();showNotes();$('#notes').showModal();};$$('[data-notes-tab]').forEach(button=>button.onclick=()=>showNotes(button.dataset.notesTab));
document.addEventListener('visibilitychange',()=>{state.dirty=true;});
let previous=performance.now(),lastHover=0,elapsed=0,lastLightUpdate=0;
function frame(now){
  requestAnimationFrame(frame);if(!state.ready||document.hidden)return;
  const dt=Math.min((now-previous)/1000,.04);previous=now;elapsed+=dt;
  let moving=false;
  if(transition){const t=transition.duration?Math.min((now-transition.start)/transition.duration,1):1,k=t*t*(3-2*t);camera.position.lerpVectors(transition.from,transition.to,k);controls.target.lerpVectors(transition.targetFrom,transition.targetTo,k);camera.fov=THREE.MathUtils.lerp(transition.fovFrom,transition.fovTo,k);camera.userData.shiftY=THREE.MathUtils.lerp(transition.shiftFrom,transition.shiftTo,k);updateProjection();if(t===1)transition=null;moving=true;}
  if(walker.active){moving=walker.update(dt,elapsed)||moving;if(now-lastHover>120){findNearbyInteraction();lastHover=now;}}
  else if(controls.update())moving=true;
  for(const item of interactions){const diff=item.target-item.node.rotation.y;if(Math.abs(diff)>.0005){item.node.rotation.y=THREE.MathUtils.damp(item.node.rotation.y,item.target,8,dt);moving=true;}else item.node.rotation.y=item.target;}
  if(now-lastLightUpdate>350&&(moving||state.dirty)){updateLocalLights();lastLightUpdate=now;}
  if(state.dirty||moving){dimensions?.update(camera,walker?.active?{feet:walker.getFeet(),focus:hovered}:null);updateRoofLOD();composer.render();updateHotspots();state.dirty=false;}
}
requestAnimationFrame(frame);
async function load(){
  data=await fetch(asset('scene-data.json')).then(r=>{if(!r.ok)throw Error('空间数据加载失败');return r.json();});
  data.collision=await fetch(asset('collision.json')).then(r=>{if(!r.ok)throw Error('行走数据加载失败');return r.json();});
  notesData=await fetch(asset('spec-notes.json')).then(r=>r.json());
  const loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const hdrPromise=new HDRLoader().loadAsync(asset('environment.hdr'));
  const gltf=await loader.loadAsync(asset(data.model),e=>{const progress=e.total?Math.round(e.loaded/e.total*80):Math.min(75,Math.round(e.loaded/180000));$('#loading-bar').style.width=`${progress}%`;$('#loading-detail').textContent=`加载进度 ${progress}%`;});
  model=gltf.scene;scene.add(model);$('#loading-detail').textContent='加载光照…';$('#loading-bar').style.width='86%';
  // Quantization can add geometry children below semantic nodes. Inherit the tags.
  model.traverse(o=>{if(!o.parent)return;for(const key of ['webGroup','webRole','webFloor'])if(o.userData[key]===undefined&&o.parent.userData[key]!==undefined)o.userData[key]=o.parent.userData[key];});
  // Galvanized roofing has a smooth sheet finish. The native generic tread-
  // plate scan aliases at small phone sizes, so retain its corrugated geometry
  // with a dedicated realtime sheet-metal material instead of the tread map.
  const roofSheet=new THREE.MeshStandardMaterial({name:'网页_镀锌屋面',color:0x8c9394,metalness:.75,roughness:.58,envMapIntensity:.75});
  model.traverse(o=>{if(o.isMesh&&o.userData.webGroup==='roof'&&o.material?.name.includes('金属构件'))o.material=roofSheet;});
  // At phone overview distances the 25mm corrugation is subpixel and aliases.
  // Keep the same roof envelope with two smooth planes; restore exact geometry
  // when zooming closer, enabling high quality, or entering person mode.
  model.traverse(o=>{if(!o.isMesh||o.userData.webGroup!=='roof')return;for(let parent=o;parent&&parent!==model;parent=parent.parent)if(parent.name.includes('沿坡向排水')){roofDetail.push(o);break;}});
  if(roofDetail.length){
   const box=new THREE.Box3();for(const mesh of roofDetail)box.union(new THREE.Box3().setFromObject(mesh));const min=box.min,max=box.max,middle=(min.x+max.x)/2,eave=min.y+.0015,peak=max.y-.025;
   const vertices=[min.x,eave,min.z,middle,peak,min.z,middle,peak,max.z,min.x,eave,max.z,middle,peak,min.z,max.x,eave,min.z,max.x,eave,max.z,middle,peak,max.z];
   const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setIndex([0,2,1,0,3,2,4,6,5,4,7,6]);geometry.computeVertexNormals();roofLod=new THREE.Mesh(geometry,roofSheet);roofLod.name='屋面_手机远景';roofLod.userData={webGroup:'roof',webRole:'roof'};roofLod.castShadow=true;roofLod.visible=false;model.add(roofLod);
  }
  model.traverse(o=>{if(!o.isMesh)return;const fineRib=/真实截面|压型|螺钉|围网|密封|胶条/.test(o.name);o.castShadow=o.userData.webGroup!=='site'&&!fineRib;o.receiveShadow=!fineRib;const mats=Array.isArray(o.material)?o.material:[o.material];for(const mat of mats){for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap'])if(mat[key])mat[key].anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);if(mat.transmission>0){mat.transmission=0;mat.transparent=true;mat.opacity=.30;mat.depthWrite=false;mat.color.set(0xa0b8bf);mat.roughness=.10;mat.metalness=.16;mat.side=THREE.DoubleSide;}if(mat.isMeshStandardMaterial&&mat.name.includes('橙色')){mat.envMapIntensity=.65;mat.roughness=Math.max(mat.roughness,.60);mat.clearcoat=.025;mat.specularIntensity=.32;}}});
  environment=await hdrPromise;environment.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);scene.environment=pmrem.fromEquirectangular(environment).texture;pmrem.dispose();scene.environmentRotation.y=data.environmentRotationY;
  scene.background=environment;scene.backgroundRotation.y=data.environmentRotationY;scene.backgroundBlurriness=.035;scene.backgroundIntensity=1;
  scene.fog=new THREE.Fog(0xd0d8cf,65,190);
  // Extend the finite site with textured ground, avoiding distorted photo-ground
  // when the client looks down from the god camera.
  let roadMaterial;model.traverse(o=>{if(o.isMesh&&o.material?.name.includes('沥青'))roadMaterial=o.material;});
  const groundMaterial=roadMaterial?roadMaterial.clone():new THREE.MeshStandardMaterial({color:0x777b70,roughness:.95});
  for(const key of ['map','normalMap','roughnessMap'])if(groundMaterial[key]){groundMaterial[key]=groundMaterial[key].clone();groundMaterial[key].repeat.set(75,75);groundMaterial[key].wrapS=groundMaterial[key].wrapT=THREE.RepeatWrapping;}
  for(const key of ['map','normalMap','roughnessMap'])if(groundMaterial[key])groundMaterial[key].repeat.set(220,220);
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(440,440),groundMaterial);ground.rotation.x=-Math.PI/2;ground.position.y=-.034;ground.receiveShadow=true;scene.add(ground);
  let concrete;model.traverse(o=>{if(o.isMesh&&o.material?.name.includes('抹光混凝土'))concrete=o.material;});
  for(const step of data.collision.entrySteps){const min=new THREE.Vector3(...step.min),max=new THREE.Vector3(...step.max),size=max.clone().sub(min);const tread=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z),concrete||new THREE.MeshStandardMaterial({color:0x96978a,roughness:.85}));tread.name=step.name;tread.position.copy(min.add(max).multiplyScalar(.5));tread.castShadow=true;tread.receiveShadow=true;scene.add(tread);}
  for(let i=0;i<8;i++){const light=new THREE.PointLight(0xffefd8,0,5,2);scene.add(light);indoorLights.push(light);}
  dimensions=new Dimensions(scene,host);
  setupInteractions();makeHotspots();walker=new Walker({scene,camera,element:host,model,data,interactions,notify,onChange:()=>{dimensions?.setMode(state.dimensions,state.view,!!walker?.active);state.dirty=true;}});walker.onInteract=()=>toggle(hovered);
  state.ready=true;updateLighting();resize();setView('overview',true);$('#quality-button').setAttribute('aria-pressed',String(state.high));$('#quality-button .tool-label').textContent=state.high?'高清':'流畅';
  $('#interaction-hint').textContent=matchMedia('(pointer:coarse)').matches?'单指旋转 · 双指缩放':'左键旋转 · 滚轮缩放 · 右键平移';
  $('#loading-bar').style.width='100%';await renderer.compileAsync(scene,camera);composer.render();$('#loader').classList.add('finished');
  window.__viewer={state,scene,camera,controls,model,data,interactions,walker,dimensions,setView,enterWalk,exitWalk,toggle,notify,renderer,ao,sun,ready:true};
  // The quick location selector is useful on touch devices and for client review.
  const select=document.createElement('select');select.id='spawn-select';select.setAttribute('aria-label','漫游位置');select.innerHTML='<option value="courtyard">中央庭院</option><option value="office">办公区</option><option value="meeting">会议室</option><option value="storage">储藏室</option><option value="lockers">更衣柜</option><option value="fileCabinet">资料柜</option><option value="archive">档案室</option>';
  select.onchange=()=>{walker.teleport(select.value);updateLighting();};$('.walk-actions').prepend(select);
}
load().catch(error=>{console.error(error);$('#loading-detail').textContent='空间加载失败，请检查网络后重试。';const retry=document.createElement('button');retry.textContent='重新加载';retry.style.cssText='margin-top:20px;padding:10px 20px;background:#d75e2d;color:white;border-radius:4px';retry.onclick=()=>location.reload();$('#loader').appendChild(retry);});
