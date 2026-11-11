import * as THREE from 'three';
const p=(x,y,h)=>new THREE.Vector3(x-6.096,h,y-7.315);
// Actual nominal room bounds of the editable model. Undimensioned partitions
// are explicitly presented as model measurements rather than drawing values.
const rooms=[
 [1,'电气储藏室',0,0,12.192,2.438],[1,'档案储藏室',0,2.438,2.438,13.0],[1,'更衣室',9.754,2.438,12.192,14.63],
 [2,'计划文员办公室',0,0,8.4,2.438],[2,'打印室',8.4,0,12.192,2.438],[2,'会议室',0,4.05,2.438,14.63],
 [2,'培训师办公室',9.754,2.438,12.192,10.95],[2,'主管办公室',9.754,10.95,12.192,14.63]
];
export class Dimensions {
 constructor(scene,host){
  this.host=host;this.enabled=false;this.root=new THREE.Group();this.root.name='图纸尺寸';scene.add(this.root);this.layers={};this.labels=[];
  for(const [name,height] of [['ground',.035],['upper',3.39]]){
   const group=new THREE.Group();this.root.add(group);this.layers[name]=group;
   this.dimension(p(0,0,height),p(12.192,0,height),new THREE.Vector3(0,0,-.8),'12192 mm',group);
   for(const [a,b,label] of [[0,2.438,'2438 mm'],[2.438,9.754,'7316 mm'],[9.754,12.192,'2438 mm']])this.dimension(p(a,14.63,height),p(b,14.63,height),new THREE.Vector3(0,0,.75),label,group);
   this.dimension(p(12.192,0,height),p(12.192,2.438,height),new THREE.Vector3(.95,0,0),'2438 mm',group);
   this.dimension(p(12.192,2.438,height),p(12.192,14.63,height),new THREE.Vector3(.95,0,0),'12192 mm',group);
   this.dimension(p(0,0,height),p(0,14.63,height),new THREE.Vector3(-2.65,0,0),'14630 mm · 推算',group);
  }
  const heightGroup=new THREE.Group();this.root.add(heightGroup);this.layers.height=heightGroup;
  for(let i=0;i<2;i++)this.dimension(p(12.192,15.6,.24+i*2.896),p(12.192,15.6,.24+(i+1)*2.896),new THREE.Vector3(.7,0,0),'2896 mm',heightGroup);
  this.hud=document.createElement('div');this.hud.id='walk-dimensions';this.hud.setAttribute('role','status');
  this.roomName=document.createElement('strong');this.roomSize=document.createElement('span');this.storey=document.createElement('span');this.objectSize=document.createElement('span');
  this.hud.append(this.roomName,this.roomSize,this.storey,this.objectSize);host.parentElement.appendChild(this.hud);
  this.focusLabel=document.createElement('span');this.focusLabel.className='dimension-label';document.getElementById('dimensions-labels').appendChild(this.focusLabel);
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(15),3));
  this.focusLine=new THREE.Line(geometry,new THREE.LineBasicMaterial({color:0xd75e2d,depthTest:false,depthWrite:false,transparent:true,opacity:.95}));this.focusLine.renderOrder=12;this.focusLine.frustumCulled=false;scene.add(this.focusLine);
  this.setMode(false,'overview',false);
 }
 dimension(a,b,offset,label,group){
  const aa=a.clone().add(offset),bb=b.clone().add(offset),positions=[];
  const segment=(v,w)=>positions.push(...v.toArray(),...w.toArray());segment(aa,bb);segment(a,aa.clone().addScaledVector(offset.clone().normalize(),.1));segment(b,bb.clone().addScaledVector(offset.clone().normalize(),.1));
  for(const point of [aa,bb]){const d=new THREE.Vector3(.065,.015,.065);segment(point.clone().sub(d),point.clone().add(d));}
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const line=new THREE.LineSegments(geometry,new THREE.LineBasicMaterial({color:0x73502f,transparent:true,opacity:.92,depthTest:false,depthWrite:false}));line.renderOrder=10;group.add(line);
  const element=document.createElement('span');element.className='dimension-label';element.textContent=label;document.getElementById('dimensions-labels').appendChild(element);
  this.labels.push({element,point:aa.clone().add(bb).multiplyScalar(.5),group});
 }
 setMode(enabled,view,walking){this.enabled=enabled;this.walking=walking;this.host.parentElement.classList.toggle('walking-dimensions',enabled&&walking);this.root.visible=enabled&&!walking&&!['office','meeting'].includes(view);this.layers.ground.visible=view!=='floor2';this.layers.upper.visible=view==='floor2';this.layers.height.visible=!['floor1','floor2','office','meeting'].includes(view);this.hud.hidden=!(enabled&&walking);this.focusLine.visible=false;this.focusLabel.hidden=true;for(const label of this.labels)label.element.hidden=true;}
 update(camera,context){
  const width=this.host.clientWidth,height=this.host.clientHeight;
  for(const label of this.labels){const v=label.point.clone().project(camera);const show=this.root.visible&&label.group.visible&&v.z>0&&v.z<1&&Math.abs(v.x)<.94&&Math.abs(v.y)<.92;label.element.hidden=!show;
   if(show){label.element.style.left=`${(v.x*.5+.5)*width}px`;label.element.style.top=`${(-v.y*.5+.5)*height}px`;}}
  if(!this.enabled||!this.walking||!context){this.hud.hidden=true;this.focusLine.visible=false;this.focusLabel.hidden=true;return;}
  this.hud.hidden=false;const feet=context.feet,floor=feet.y>2.8?2:1,x=feet.x+6.096,y=feet.z+7.315;
  const room=rooms.find(r=>r[0]===floor&&x>=r[2]&&x<=r[4]&&y>=r[3]&&y<=r[5]);
  this.roomName.textContent=room?room[1]:'室外';
  this.roomSize.textContent=room?`范围 ${Math.round((room[4]-room[2])*1000)} × ${Math.round((room[5]-room[3])*1000)} mm（模型）`:'建筑范围 12192 × 14630 mm（模型）';
  this.storey.textContent='层高 2896 mm（图纸）';
  const item=context.focus;this.objectSize.hidden=!item;this.focusLine.visible=!!item;
  if(!item){this.focusLabel.hidden=true;return;}
  const bounds=item.closedBounds,dx=bounds.max[0]-bounds.min[0],dz=bounds.max[2]-bounds.min[2],dy=bounds.max[1]-bounds.min[1];
  const measurement=`${item.type==='door'?'门扇':'柜门'} ${Math.round(Math.max(dx,dz)*1000)} × ${Math.round(dy*1000)} mm（模型量取）`;
  this.objectSize.textContent=measurement;this.focusLabel.textContent=measurement;
  const box=item.localBox,alongX=box.max.x-box.min.x>=box.max.z-box.min.z;
  const corners=alongX?[[box.min.x,box.min.y,(box.min.z+box.max.z)/2],[box.max.x,box.min.y,(box.min.z+box.max.z)/2],[box.max.x,box.max.y,(box.min.z+box.max.z)/2],[box.min.x,box.max.y,(box.min.z+box.max.z)/2]]:[[(box.min.x+box.max.x)/2,box.min.y,box.min.z],[(box.min.x+box.max.x)/2,box.min.y,box.max.z],[(box.min.x+box.max.x)/2,box.max.y,box.max.z],[(box.min.x+box.max.x)/2,box.max.y,box.min.z]];
  item.node.updateWorldMatrix(true,false);const position=this.focusLine.geometry.attributes.position;
  const worldCorners=corners.map(v=>new THREE.Vector3(...v).applyMatrix4(item.node.matrixWorld));
  for(let i=0;i<5;i++){const v=worldCorners[i%4];position.setXYZ(i,v.x,v.y,v.z);}position.needsUpdate=true;
  const top=worldCorners[2].clone().add(worldCorners[3]).multiplyScalar(.5).add(new THREE.Vector3(0,.12,0)).project(camera);
  this.focusLabel.hidden=top.z<=0||top.z>=1||Math.abs(top.x)>.90||Math.abs(top.y)>.88;
  this.focusLabel.style.left=`${(top.x*.5+.5)*width}px`;this.focusLabel.style.top=`${(-top.y*.5+.5)*height}px`;
 }
}
