export function bindScreenMode({app,button,notify,onChange,beforeChange}){
 let requested=false;
 const fullscreen=()=>document.fullscreenElement||document.webkitFullscreenElement;
 const update=()=>{button.textContent=requested?'退出全屏':'横屏';button.setAttribute('aria-pressed',String(requested));app.classList.toggle('landscape-requested',requested);onChange?.();};
 const unlock=()=>{try{screen.orientation?.unlock?.();}catch{}};
 button.addEventListener('click',async()=>{
  beforeChange?.();
  if(requested){requested=false;unlock();try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.webkitFullscreenElement)document.webkitExitFullscreen();}catch{}update();return;}
  let full=false,locked=false;
  try{if(!fullscreen()){if(app.requestFullscreen)await app.requestFullscreen({navigationUI:'hide'});else if(app.webkitRequestFullscreen)app.webkitRequestFullscreen();}full=!!fullscreen();}catch{}
  try{if(screen.orientation?.lock){await screen.orientation.lock('landscape');locked=true;}}catch{}
  requested=full||locked;update();
  if(!locked)notify('未自动转屏时，请将手机横置操作');
 });
 const changed=()=>{if(!fullscreen()&&requested){requested=false;unlock();}update();};
 document.addEventListener('fullscreenchange',changed);document.addEventListener('webkitfullscreenchange',changed);
 screen.orientation?.addEventListener?.('change',()=>{update();});
 update();return{get requested(){return requested;}};
}
