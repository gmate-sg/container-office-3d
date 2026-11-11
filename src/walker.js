import * as THREE from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';

const UP = new THREE.Vector3(0,1,0), DOWN = new THREE.Vector3(0,-1,0), SKIN=.0012;

export class Walker {
  constructor({scene,camera,element,model,data,interactions,notify,onChange}) {
    Object.assign(this,{scene,camera,element,model,data,interactions,notify,onChange});
    this.active=false;this.controlling=false;this.fallbackControl=false;this.thirdPerson=true;this.viewZoom=1;
    this.keys={};this.yaw=0;this.pitch=.12;this.velocity=new THREE.Vector3();this.move=new THREE.Vector2();
    this.radius=data.walking?.capsuleRadius||.24;this.eyeHeight=data.walking?.eyeHeight||1.65;
    this.height=Math.max(1.65,this.eyeHeight);this.stepHeight=data.walking?.stepHeight||.22;
    this.capsule=new Capsule(new THREE.Vector3(0,this.radius,0),new THREE.Vector3(0,this.height-this.radius,0),this.radius);
    this.ray=new THREE.Ray();this.octree=null;this.onFloor=false;this.supportBoxes=[];this.panelCache=[];
    this.avatar=this.makeAvatar();this.avatar.visible=false;scene.add(this.avatar);this.bindInputs();
  }
  isTouch(){return matchMedia('(pointer:coarse)').matches;}
  hasModal(){return !!document.querySelector('dialog[open]');}
  canControl(){return this.active&&this.controlling&&!document.hidden&&!this.hasModal();}
  clearInput(){
    this.keys={};this.jumpRequested=false;this.move.set(0,0);this.velocity.x=this.velocity.z=0;
    const knob=document.getElementById('joystick-knob');if(knob)knob.style.transform='';
  }
  pause(){
    this.controlling=false;this.clearInput();const b=document.getElementById('capture-button');
    if(document.pointerLockElement===this.element)document.exitPointerLock?.();
    if(b&&this.active)b.hidden=false;this.onChange?.();
  }
  async capture(){
    if(!this.active||this.hasModal())return;
    this.element.focus?.({preventScroll:true});
    if(this.isTouch()){this.controlling=true;document.getElementById('capture-button').hidden=true;this.onChange?.();return;}
    if(document.pointerLockElement===this.element){this.controlling=true;this.clearInput();document.getElementById('capture-button').hidden=true;this.onChange?.();return;}
    try{await this.element.requestPointerLock();}
    catch{
      this.fallbackControl=true;this.controlling=true;document.getElementById('capture-button').hidden=true;
      this.notify('当前浏览器使用拖动转头 · WASD 行走，Esc 暂停');this.onChange?.();
    }
  }
  look(x,y){this.yaw-=x*.0028;this.pitch=THREE.MathUtils.clamp(this.pitch-y*.0028,-1.32,1.32);this._lookDirty=true;}
  zoomView(scale){
    if(!this.active||this.hasModal()||!Number.isFinite(scale)||scale<=0)return false;
    const next=this.viewZoom*scale;
    if(!Number.isFinite(next)||next<=0)return false;
    this.viewZoom=next;this.camera.zoom=next;this.camera.updateProjectionMatrix();this._lookDirty=true;this.onChange?.();return true;
  }
  bindInputs(){
    document.addEventListener('keydown',e=>{
      if(e.code==='Escape'&&this.active){this.pause();return;}
      if(!this.active||this.hasModal()||/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName||''))return;
      if(e.code==='KeyV'&&!e.repeat){this.togglePerspective();return;}
      if(!this.canControl())return;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
      if(e.code==='KeyE'&&!e.repeat)this.onInteract?.();this.keys[e.code]=true;
    });
    document.addEventListener('keyup',e=>{this.keys[e.code]=false;});
    window.addEventListener('blur',()=>{if(this.active)this.pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.pause();});
    document.addEventListener('pointerlockchange',()=>{
      const locked=document.pointerLockElement===this.element;
      if(locked&&this.active){this.controlling=true;this.fallbackControl=false;this.clearInput();document.getElementById('capture-button').hidden=true;}
      else if(this._wasLocked&&this.active)this.pause();
      this._wasLocked=locked;this.onChange?.();
    });
    document.addEventListener('mousemove',e=>{if(this.canControl()&&document.pointerLockElement===this.element)this.look(e.movementX,e.movementY);});
    this.element.addEventListener('wheel',e=>{
      if(!this.active||this.hasModal())return;
      e.preventDefault();const units=e.deltaMode===1?16:e.deltaMode===2?(this.element.clientHeight||600):1;
      this.zoomView(Math.exp(-e.deltaY*units*.0015));
    },{passive:false});
    this.element.addEventListener('click',()=>{if(this.active&&!this.isTouch())this.capture();});
    document.getElementById('capture-button').onclick=()=>this.capture();
    document.getElementById('perspective-button').onclick=()=>this.togglePerspective();
    const jump=document.getElementById('jump-button');
    jump.addEventListener('pointerdown',e=>{e.preventDefault();if(this.canControl())this.jumpRequested=true;});
    ['pointerup','pointercancel','pointerleave'].forEach(t=>jump.addEventListener(t,()=>{this.keys.Space=false;}));
    this.bindTouch();
  }
  makeAvatar(){
    const g=new THREE.Group(),orange=new THREE.MeshStandardMaterial({color:0xd9602c,roughness:.8});
    const pants=new THREE.MeshStandardMaterial({color:0x283c39,roughness:.9}),skin=new THREE.MeshStandardMaterial({color:0xc89473,roughness:.9}),cream=new THREE.MeshStandardMaterial({color:0xf2e9cc,roughness:.7});
    const part=(geo,mat,x,y,z,parent=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m;};
    part(new THREE.BoxGeometry(.40,.55,.24),orange,0,1.03,0);part(new THREE.BoxGeometry(.29,.29,.27),skin,0,1.47,0);
    part(new THREE.BoxGeometry(.33,.09,.31),cream,0,1.65,0);part(new THREE.BoxGeometry(.39,.025,.36),cream,0,1.60,0);
    const eyes=new THREE.MeshStandardMaterial({color:0x202921});part(new THREE.BoxGeometry(.035,.035,.015),eyes,-.07,1.48,-.143);part(new THREE.BoxGeometry(.035,.035,.015),eyes,.07,1.48,-.143);
    this.limbs=[];
    for(const side of [-1,1]){
      const leg=new THREE.Group();leg.position.set(side*.115,.77,0);g.add(leg);
      part(new THREE.BoxGeometry(.17,.56,.18),pants,0,-.28,0,leg);part(new THREE.BoxGeometry(.18,.12,.27),pants,0,-.62,-.035,leg);this.limbs.push(leg);
      const arm=new THREE.Group();arm.position.set(side*.275,1.27,0);g.add(arm);
      part(new THREE.BoxGeometry(.14,.40,.16),orange,0,-.19,0,arm);part(new THREE.BoxGeometry(.135,.13,.14),skin,0,-.45,0,arm);this.limbs.push(arm);
    }
    return g;
  }
  buildCollision(){
    if(this.octree)return;
    const proxy=new THREE.Group();
    const addBox=spec=>{
      const box=new THREE.Box3(new THREE.Vector3(...spec.min),new THREE.Vector3(...spec.max)),size=box.getSize(new THREE.Vector3());
      if(Math.min(size.x,size.y,size.z)<=0)return;
      this.supportBoxes.push(box);const m=new THREE.Mesh(new THREE.BoxGeometry(size.x,size.y,size.z));m.position.copy(box.getCenter(new THREE.Vector3()));proxy.add(m);
    };
    if(this.data.collision){
      [...(this.data.collision.boxes||[]),...(this.data.collision.entrySteps||[])].forEach(addBox);
      for(const triangle of this.data.collision.triangles||[]){
        const points=Array.isArray(triangle[0])?triangle.flat():triangle;
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));geo.setIndex([0,1,2,2,1,0]);geo.computeVertexNormals();proxy.add(new THREE.Mesh(geo));
      }
    }else{
      this.model.updateMatrixWorld(true);
      this.model.traverse(o=>{
        if(!o.isMesh)return;
        for(let p=o;p;p=p.parent)if(p.userData.interactionId)return;
        const role=o.userData.webRole||'',group=o.userData.webGroup||'';
        if(group==='roof'||['glass','doorHardware','cabinetHardware'].includes(role)||/围网|围栏|盆栽|植物|螺钉|键盘|鼠标|密封|窗台|执手|檐沟|落水|碎石|楼梯|格栅踏步/.test(o.name))return;
        if(role==='furniture'){const b=new THREE.Box3().setFromObject(o);addBox({min:b.min.toArray(),max:b.max.toArray()});}
        else{const clone=new THREE.Mesh(o.geometry);clone.matrixAutoUpdate=false;clone.matrix.copy(o.matrixWorld);proxy.add(clone);}
      });
    }
    this.stairs=this.data.walking?.stairs||[];
    for(const stair of this.stairs){
      const [x,y,z]=stair.bottom,[,ty,tz]=stair.top,hw=stair.walkableWidth/2,n=stair.steps||18;
      // Thin closed tread colliders bridge the visual grating holes without
      // filling the usable headroom below a flight. Actual tread heights also
      // keep the player's feet above each visible step, unlike a smooth ramp.
      for(let k=0;k<n;k++){
        const za=z+(tz-z)*k/n,zb=z+(tz-z)*(k+1)/n,top=y+(ty-y)*(k+1)/n;
        addBox({min:[x-hw,top-.05,Math.min(za,zb)-.01],max:[x+hw,top,Math.max(za,zb)+.01]});
      }
    }
    const ground=new THREE.Mesh(new THREE.PlaneGeometry(160,160));ground.rotation.x=-Math.PI/2;ground.position.y=-.025;proxy.add(ground);
    this.supportBoxes.push(new THREE.Box3(new THREE.Vector3(-80,-.125,-80),new THREE.Vector3(80,-.025,80)));
    proxy.updateMatrixWorld(true);this.octree=new Octree();this.octree.trianglesPerLeaf=16;this.octree.maxLevel=12;this.octree.fromGraphNode(proxy);
    this.colliderTriangles=this.supportBoxes.length*12+(this.data.collision?.triangles?.length||0)*2+2;
  }
  enter(spawn='courtyard'){
    this.buildCollision();this.active=true;this.controlling=this.isTouch();this.fallbackControl=false;this.teleport(spawn);
    this.camera.near=.045;this.camera.fov=65;this.camera.zoom=this.viewZoom;this.camera.updateProjectionMatrix();document.getElementById('walk-ui').hidden=false;document.querySelector('.stage').classList.add('walking');
    document.getElementById('capture-button').hidden=this.isTouch();this.onChange?.();
    this.notify(this.isTouch()?'左侧摇杆移动，右侧滑动转头':'点击画面开始 · WASD 行走，E 开门柜，V 切换人称');
  }
  teleport(key){
    const s=this.data.walking.spawns[key]||this.data.walking.spawns.courtyard,p=new THREE.Vector3(...s.feet);
    this.spawn=key;this.clearInput();this.velocity.y=0;
    this.capsule.start.copy(p).addScaledVector(UP,this.radius+SKIN);this.capsule.end.copy(p).addScaledVector(UP,this.height-this.radius+SKIN);
    const dir=new THREE.Vector3(...s.target).sub(p.clone().addScaledVector(UP,this.eyeHeight));
    this.yaw=Math.atan2(-dir.x,-dir.z);this.pitch=THREE.MathUtils.clamp(Math.atan2(dir.y,Math.hypot(dir.x,dir.z)),-1.32,1.32);
    this.preparePanels();this.resolveCapsule(this.capsule);const support=this.findSupport(this.getFeet(),.02,.05);this.onFloor=!!support;
    if(support)this.capsule.translate(new THREE.Vector3(0,support.height-this.getFeet().y+SKIN,0));
    if(key!=='courtyard')this.thirdPerson=false;
    this.avatar.position.copy(this.getFeet());this.avatar.rotation.y=this.yaw;this.syncPerspectiveButton();this.syncCamera();this._lookDirty=true;this.onChange?.();
  }
  exit(){
    this.active=false;this.controlling=false;this.avatar.visible=false;this.clearInput();document.exitPointerLock?.();document.getElementById('walk-ui').hidden=true;
    document.querySelector('.stage').classList.remove('walking');this.onChange?.();
  }
  togglePerspective(){if(!this.active)return;this.thirdPerson=!this.thirdPerson;this.syncPerspectiveButton();this.syncCamera();this._lookDirty=true;this.onChange?.();}
  syncPerspectiveButton(){document.getElementById('perspective-button').textContent=(this.thirdPerson?'第三人称':'第一人称')+(this.isTouch()?'':' · V');this.avatar.visible=this.active&&this.thirdPerson;}
  findSupport(feet,maxRise,maxDrop=.075){
    let height=-Infinity;const reach=this.radius+.025;
    const closedDoorRise=top=>top>feet.y+.03&&this.panelCache.some(p=>p.item.type==='door'&&!p.item.open&&Math.abs(p.worldBox.min.y-top)<.06&&p.worldBox.distanceToPoint(new THREE.Vector3(feet.x,top+.5,feet.z))<this.radius+.14);
    // Reach the tread with the capsule footprint before its centre reaches it.
    for(const box of this.supportBoxes){
      const top=box.max.y;if(top>feet.y+maxRise||top<feet.y-maxDrop||closedDoorRise(top))continue;
      const dx=Math.max(box.min.x-feet.x,0,feet.x-box.max.x),dz=Math.max(box.min.z-feet.z,0,feet.z-box.max.z);
      if(dx*dx+dz*dz<=reach*reach&&top>height)height=top;
    }
    return height>-Infinity?{height}:null;
  }
  preparePanels(){
    this.panelCache=[];const position=this.getFeet();
    for(const item of this.interactions||[]){
      if(!item.node||!item.localBox)continue;
      let visible=true;for(let n=item.node;n;n=n.parent)if(!n.visible){visible=false;break;}if(!visible)continue;
      item.node.updateWorldMatrix(true,false);const worldBox=item.localBox.clone().applyMatrix4(item.node.matrixWorld);if(worldBox.distanceToPoint(position)>4)continue;
      this.panelCache.push({item,inverse:item.node.matrixWorld.clone().invert(),matrix:item.node.matrixWorld.clone(),worldBox});
    }
  }
  panelCorrection(capsule,panel){
    const a=capsule.start.clone().applyMatrix4(panel.inverse),b=capsule.end.clone().applyMatrix4(panel.inverse),box=panel.item.localBox;
    const x=(a.x+b.x)/2,z=(a.z+b.z)/2,lo=Math.min(a.y,b.y),hi=Math.max(a.y,b.y),r=this.radius;
    const px=THREE.MathUtils.clamp(x,box.min.x,box.max.x),pz=THREE.MathUtils.clamp(z,box.min.z,box.max.z);
    let sy=THREE.MathUtils.clamp((lo+hi)/2,box.min.y,box.max.y),by=sy;
    if(hi<box.min.y){sy=hi;by=box.min.y;}else if(lo>box.max.y){sy=lo;by=box.max.y;}
    const delta=new THREE.Vector3(x-px,sy-by,z-pz),length=delta.length();if(length>=r)return null;
    let penetration;
    if(length>.000001){penetration=r-length;delta.multiplyScalar(1/length);}
    else{
      const candidates=[
        {v:new THREE.Vector3(-1,0,0),d:x-box.min.x+r},{v:new THREE.Vector3(1,0,0),d:box.max.x-x+r},
        {v:new THREE.Vector3(0,0,-1),d:z-box.min.z+r},{v:new THREE.Vector3(0,0,1),d:box.max.z-z+r},
        {v:new THREE.Vector3(0,-1,0),d:hi-box.min.y+r},{v:new THREE.Vector3(0,1,0),d:box.max.y-lo+r}
      ].filter(c=>c.d>=0).sort((u,v)=>u.d-v.d);
      if(!candidates.length)return null;delta.copy(candidates[0].v);penetration=candidates[0].d;
    }
    delta.transformDirection(panel.matrix);return{normal:delta,depth:penetration};
  }
  resolveCapsule(capsule,iterations=4){
    let floor=false;const normals=[];
    for(let i=0;i<iterations;i++){
      let touched=false;const hit=this.octree.capsuleIntersect(capsule);
      if(hit){capsule.translate(hit.normal.clone().multiplyScalar(hit.depth+.0001));floor||=hit.normal.y>.45;normals.push(hit.normal.clone());touched=true;}
      for(const panel of this.panelCache){const p=this.panelCorrection(capsule,panel);if(p){capsule.translate(p.normal.clone().multiplyScalar(p.depth+.0001));floor||=p.normal.y>.45;normals.push(p.normal.clone());touched=true;}}
      if(!touched)break;
    }
    return{floor,normals};
  }
  step(dt){
    const wasGround=this.onFloor,oldFeet=this.getFeet(),horizontal=new THREE.Vector3(this.velocity.x*dt,0,this.velocity.z*dt);
    if(wasGround&&this.velocity.y<=0)this.velocity.y=0;else this.velocity.y-=12*dt;
    let advanced=false;
    if(wasGround&&this.velocity.y<=0&&horizontal.lengthSq()>.00000001){
      const support=this.findSupport(oldFeet.clone().add(horizontal),this.stepHeight+.005),rise=support?support.height-oldFeet.y:0;
      if(rise>.002&&rise<=this.stepHeight+.005){
        const trial=this.capsule.clone().translate(horizontal.clone().addScaledVector(UP,rise+SKIN));this.resolveCapsule(trial);
        const trialFeet=trial.start.clone().addScaledVector(UP,-this.radius),progress=trialFeet.clone().sub(oldFeet).dot(horizontal.clone().normalize());
        // A closed door or low ceiling still blocks the entire raised capsule.
        if(progress>=horizontal.length()*.55&&trialFeet.y>=support.height-.01&&trialFeet.y<=oldFeet.y+this.stepHeight+.025){this.capsule.copy(trial);advanced=true;}
      }
    }
    if(!advanced)this.capsule.translate(horizontal);this.capsule.translate(new THREE.Vector3(0,this.velocity.y*dt,0));
    const contact=this.resolveCapsule(this.capsule);this.onFloor=contact.floor;
    if(this.velocity.y<=0){
      const feet=this.getFeet(),support=this.findSupport(feet,.012,.075);
      if(support){const gap=support.height-feet.y;if(gap>=-.075&&gap<=.012){this.capsule.translate(new THREE.Vector3(0,gap+SKIN,0));this.resolveCapsule(this.capsule,2);this.onFloor=true;}}
    }
    if(this.onFloor&&this.velocity.y<0)this.velocity.y=0;
    if(contact.normals.some(n=>n.y<-.45)&&this.velocity.y>0)this.velocity.y=0;
    for(const n of contact.normals)if(Math.abs(n.y)<.35){const dot=this.velocity.dot(n);if(dot<0)this.velocity.addScaledVector(n,-dot);}
  }
  update(dt,time){
    if(!this.active)return false;
    if(!this.canControl()){this.clearInput();if(this._lookDirty){this.syncCamera();this._lookDirty=false;return true;}return false;}
    dt=Math.min(Math.max(dt,0),.04);const before=this.getFeet(),lookDirty=this._lookDirty;
    const x=(this.keys.KeyD||this.keys.ArrowRight?1:0)-(this.keys.KeyA||this.keys.ArrowLeft?1:0)+this.move.x;
    const z=(this.keys.KeyW||this.keys.ArrowUp?1:0)-(this.keys.KeyS||this.keys.ArrowDown?1:0)-this.move.y;
    const forward=new THREE.Vector3(-Math.sin(this.yaw),0,-Math.cos(this.yaw)),right=new THREE.Vector3(Math.cos(this.yaw),0,-Math.sin(this.yaw));
    const wish=forward.multiplyScalar(z).addScaledVector(right,x);if(wish.lengthSq()>1)wish.normalize();
    const speed=this.keys.ShiftLeft||this.keys.ShiftRight?3.5:2.05;
    this.velocity.x=THREE.MathUtils.damp(this.velocity.x,wish.x*speed,12,dt);this.velocity.z=THREE.MathUtils.damp(this.velocity.z,wish.z*speed,12,dt);
    if((this.keys.Space||this.jumpRequested)&&this.onFloor){this.velocity.y=4.6;this.onFloor=false;this.keys.Space=false;}
    this.jumpRequested=false;
    this.preparePanels();for(let i=0;i<4;i++)this.step(dt/4);
    const feet=this.getFeet();if(feet.y<-8||Math.abs(feet.x)>55||Math.abs(feet.z)>55){this.teleport(this.spawn||'courtyard');return true;}
    this.avatar.position.copy(feet);this.avatar.rotation.y=this.yaw;
    const stride=Math.min(1,Math.hypot(this.velocity.x,this.velocity.z)/1.6),swing=Math.sin(time*9)*.52*stride;
    this.limbs.forEach((m,i)=>{m.rotation.x=swing*(i<2?1:-1)*(i%2?1:-1);});this.syncCamera();this._lookDirty=false;
    return lookDirty||feet.distanceToSquared(before)>.00000001||stride>.01;
  }
  getFeet(){return this.capsule.start.clone().addScaledVector(UP,-this.radius);}
  getEye(){return this.getFeet().addScaledVector(UP,this.eyeHeight);}
  syncCamera(){
    const eye=this.getEye(),q=new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch,this.yaw,0,'YXZ'));
    if(!this.thirdPerson){this.camera.position.copy(eye);this.camera.quaternion.copy(q);this.avatar.visible=false;return;}
    const back=new THREE.Vector3(0,.30,3.25).applyQuaternion(q),length=back.length();this.ray.set(eye,back.clone().normalize());
    const hit=this.octree.rayIntersect(this.ray);let clear=hit?Math.min(length,Math.max(.12,hit.distance-.18)):length;
    for(const panel of this.panelCache){
      const ray=this.ray.clone().applyMatrix4(panel.inverse),box=panel.item.localBox.clone().expandByScalar(.15);
      if(box.containsPoint(ray.origin))continue;
      const point=ray.intersectBox(box,new THREE.Vector3());if(point)clear=Math.min(clear,Math.max(.12,point.distanceTo(ray.origin)-.03));
    }
    back.setLength(clear);this.camera.position.copy(eye).add(back);this.camera.lookAt(eye.clone().add(new THREE.Vector3(0,0,-2).applyQuaternion(q)));
    this.avatar.visible=clear>.65;
  }
  bindTouch(){
    const pad=document.getElementById('joystick'),knob=document.getElementById('joystick-knob');let id=null;
    pad.addEventListener('pointerdown',e=>{if(!this.canControl())return;id=e.pointerId;pad.setPointerCapture(id);e.preventDefault();});
    pad.addEventListener('pointermove',e=>{
      if(e.pointerId!==id||!this.canControl())return;const r=pad.getBoundingClientRect();
      this.move.set((e.clientX-r.left-r.width/2)/34,(e.clientY-r.top-r.height/2)/34).clampLength(0,1);
      knob.style.transform='translate('+(this.move.x*30)+'px,'+(this.move.y*30)+'px)';
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>pad.addEventListener(t,()=>{id=null;this.move.set(0,0);knob.style.transform='';}));
    let drag=null,pinchDistance=null;const canvasTouches=new Map();
    const distance=()=>{const points=[...canvasTouches.values()];return points.length>=2?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):null;};
    this.element.addEventListener('pointerdown',e=>{
      if(this.active&&!this.hasModal()&&(e.pointerType==='touch'||this.fallbackControl)){
        if(this.isTouch()){this.controlling=true;document.getElementById('capture-button').hidden=true;}
        if(e.pointerType==='touch')canvasTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(canvasTouches.size>=2){drag=null;pinchDistance=distance();}else drag={id:e.pointerId,x:e.clientX,y:e.clientY};
        this.element.setPointerCapture(e.pointerId);
      }
    });
    this.element.addEventListener('pointermove',e=>{
      if(!this.canControl()||document.pointerLockElement===this.element)return;
      if(canvasTouches.has(e.pointerId)){
        canvasTouches.set(e.pointerId,{x:e.clientX,y:e.clientY});
        if(canvasTouches.size>=2){const next=distance();if(pinchDistance>0&&next>0)this.zoomView(next/pinchDistance);pinchDistance=next;return;}
      }
      if(drag?.id!==e.pointerId)return;
      this.look(e.clientX-drag.x,e.clientY-drag.y);drag.x=e.clientX;drag.y=e.clientY;
    });
    const release=e=>{
      const removed=canvasTouches.delete(e.pointerId);
      if(removed){
        pinchDistance=canvasTouches.size>=2?distance():null;
        if(canvasTouches.size===1){const [pointerId,point]=canvasTouches.entries().next().value;drag={id:pointerId,x:point.x,y:point.y};}else drag=null;
      }else if(drag?.id===e.pointerId)drag=null;
    };
    ['pointerup','pointercancel','lostpointercapture'].forEach(t=>this.element.addEventListener(t,release));
  }
}

