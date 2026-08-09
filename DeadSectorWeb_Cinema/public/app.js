
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.164.1/build/three.module.js";
const socket=io();let myId=null,roomCode=null,S=null,netInfo=null,lastGameOverData=null;
fetch("/api/info").then(r=>r.json()).then(v=>netInfo=v).catch(()=>{});

const scene=new THREE.Scene();scene.background=new THREE.Color(0x070909);scene.fog=new THREE.Fog(0x070909,12,45);
const camera=new THREE.PerspectiveCamera(72,innerWidth/innerHeight,.1,100);
const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;document.body.appendChild(renderer.domElement);
scene.add(new THREE.HemisphereLight(0x9aa7a4,0x1a1815,1.35));const sun=new THREE.DirectionalLight(0xffffff,1.25);sun.position.set(8,16,5);sun.castShadow=true;scene.add(sun);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(88,76),new THREE.MeshStandardMaterial({color:0x252722,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);scene.add(new THREE.GridHelper(88,44,0x30332f,0x20221f));

const BASE_WALLS=[
  {x:-34,z:-38,w:16,d:1},{x:-11,z:-38,w:12,d:1},{x:11,z:-38,w:12,d:1},{x:34,z:-38,w:16,d:1},
  {x:-32,z:38,w:20,d:1},{x:0,z:38,w:32,d:1},{x:32,z:38,w:20,d:1},
  {x:-44,z:-22,w:1,d:32},{x:-44,z:26,w:1,d:24},
  {x:44,z:-22,w:1,d:32},{x:44,z:26,w:1,d:24},

  {x:-18,z:-26,w:1,d:23},{x:18,z:-26,w:1,d:23},
  {x:-11,z:-14,w:14,d:1},{x:11,z:-14,w:14,d:1},

  {x:-31,z:4,w:1,d:36},{x:31,z:4,w:1,d:36},
  {x:-20,z:21,w:24,d:1},{x:20,z:21,w:24,d:1},

  {x:-20,z:30,w:1,d:16},{x:20,z:30,w:1,d:16},
  {x:-9,z:30,w:1,d:16},{x:9,z:30,w:1,d:16},

  {x:-37,z:-11,w:13,d:1},{x:-37,z:14,w:13,d:1},
  {x:37,z:-11,w:13,d:1},{x:37,z:14,w:13,d:1},

  {x:-31,z:-30,w:16,d:1},{x:-23,z:-34,w:1,d:8},
  {x:31,z:-30,w:16,d:1},{x:23,z:-34,w:1,d:8},

  {x:-14,z:3,w:10,d:1},{x:14,z:3,w:10,d:1},
  {x:-18,z:11,w:10,d:1},{x:18,z:11,w:10,d:1}
];

const DOORS={
  leftHall:{x:-18,z:-14,w:1,d:6},
  rightHall:{x:18,z:-14,w:1,d:6},
  stage:{x:0,z:21,w:7,d:1},
  backstage:{x:20,z:21,w:7,d:1}
};

const ZOMBIE_WINDOWS=[
  {x:-22,z:-37.4,rot:0},{x:0,z:-37.4,rot:0},{x:22,z:-37.4,rot:0},
  {x:-43.4,z:8,rot:Math.PI/2},{x:43.4,z:8,rot:Math.PI/2},
  {x:-18,z:37.4,rot:0},{x:18,z:37.4,rot:0}
];

function box(r,h=3,c=0x3b3d39){const m=new THREE.Mesh(new THREE.BoxGeometry(r.w,h,r.d),new THREE.MeshStandardMaterial({color:c,roughness:.9}));m.position.set(r.x,h/2,r.z);m.castShadow=m.receiveShadow=true;scene.add(m);return m}
BASE_WALLS.forEach(w=>box(w));
const doorMeshes={
  leftHall:box(DOORS.leftHall,3,0x6b5635),
  rightHall:box(DOORS.rightHall,3,0x6b5635),
  stage:box(DOORS.stage,3,0x6b5635),
  backstage:box(DOORS.backstage,3,0x6b5635)
};
function doorSign(x,z,text){
  const g=new THREE.Group();
  const panel=new THREE.Mesh(
    new THREE.BoxGeometry(3.8,.8,.22),
    new THREE.MeshStandardMaterial({color:0x6b2b23,emissive:0x35120e,emissiveIntensity:.4})
  );
  panel.position.y=3.1;g.add(panel);
  g.position.set(x,0,z);scene.add(g);
  return g;
}
const doorSigns={
  leftHall:doorSign(-18,-14,"LEFT HALL"),
  rightHall:doorSign(18,-14,"RIGHT HALL"),
  stage:doorSign(0,21,"STAGE"),
  backstage:doorSign(20,21,"BACKSTAGE")
};


// ----- CINEMA DRESSING -----
function theaterBox(x,y,z,w,h,d,color,emissive=0x000000,emissiveIntensity=0){
  const mat=new THREE.MeshStandardMaterial({color,roughness:.9,emissive,emissiveIntensity});
  const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat);
  m.position.set(x,y,z);m.castShadow=m.receiveShadow=true;scene.add(m);return m;
}

// Stage platform
theaterBox(0,.45,27,30,.9,12,0x241c18);
// Red stage curtains
theaterBox(-14,3.2,21.7,2,6,1,0x5f1118);
theaterBox(14,3.2,21.7,2,6,1,0x5f1118);
theaterBox(0,5.8,21.7,26,1.4,1,0x5f1118);

// Theater seating rows with center aisle
for(let row=0;row<5;row++){
  const z=-1+row*3.1;
  for(let col=0;col<7;col++){
    const x=-25+col*3.2;
    if(x<-3||x>3)theaterBox(x,.55,z,1.4,1.1,1.4,0x3d1919);
  }
  for(let col=0;col<7;col++){
    const x=5+col*3.2;
    if(x<26)theaterBox(x,.55,z,1.4,1.1,1.4,0x3d1919);
  }
}

// Balcony rail / projector overlook
theaterBox(0,3.15,-8,27,.7,.5,0x342a22);

// Visible staircases on both auditorium sides.
// Stairs are traversable in X/Z; camera elevation is handled below.
const STAIR_ZONES=[
 {x1:-29,x2:-24,z1:-12,z2:-4,dir:1,base:0,top:2.4},
 {x1:24,x2:29,z1:-12,z2:-4,dir:1,base:0,top:2.4}
];
for(const zone of STAIR_ZONES){
  const steps=8;
  for(let i=0;i<steps;i++){
    const z=zone.z1+(i+.5)*(zone.z2-zone.z1)/steps;
    const h=.18+(i+1)*.28;
    theaterBox((zone.x1+zone.x2)/2,h/2,z,Math.abs(zone.x2-zone.x1),h,(zone.z2-zone.z1)/steps-.05,0x51483d);
  }
}

// Window frames and wooden barricade slats. Gaps remain physically open for zombies.
for(const w of ZOMBIE_WINDOWS){
  const frame=new THREE.Group();
  const mat=new THREE.MeshStandardMaterial({color:0x2f2720,roughness:1});
  const side1=new THREE.Mesh(new THREE.BoxGeometry(.25,3.2,.35),mat);
  const side2=side1.clone();
  side1.position.x=-2.2;side2.position.x=2.2;frame.add(side1,side2);
  const top=new THREE.Mesh(new THREE.BoxGeometry(4.7,.25,.35),mat);top.position.y=1.55;frame.add(top);
  const bottom=top.clone();bottom.position.y=-1.55;frame.add(bottom);
  for(let i=-1;i<=1;i++){
    const slat=new THREE.Mesh(new THREE.BoxGeometry(4.1,.22,.18),new THREE.MeshStandardMaterial({color:0x5a4330,roughness:1}));
    slat.rotation.z=(i%2===0?.13:-.13);slat.position.y=i*.65;slat.position.z=.18;frame.add(slat);
  }
  frame.position.set(w.x,1.65,w.z);frame.rotation.y=w.rot;scene.add(frame);
}

// Warm/cold theater lights
for(const [x,z] of [[0,-25],[-20,6],[20,6],[0,16],[-12,29],[12,29]]){
  const l=new THREE.PointLight(0xffd0a0,1.1,16);l.position.set(x,4.5,z);scene.add(l);
}


function station(x,z,c,label){const g=new THREE.Group(),m=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.7,.8),new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.22}));m.position.y=.85;g.add(m);g.position.set(x,0,z);g.userData.label=label;scene.add(g);return g}


station(-10,-23,0x7b2727,"JUGGERNOG");
station(27,-3,0x2e6f91,"SPEED COLA");
station(12,30,0x8b3a26,"DOUBLE TAP");
station(-12,30,0xc28f2c,"STAMIN-UP");
station(-6,-20,0x806f2f,"AMMO");
station(-26,8,0x76551f,"MYSTERY BOX");
station(0,29,0x702d85,"WEAPON UPGRADE");
station(-27,-4,0x536b7d,"AR-15 WALL BUY");
station(27,-4,0x457d66,"VIPER SMG WALL BUY");
station(-23,16,0x7d6045,"SHOTGUN WALL BUY");
station(23,16,0x5b5d82,"DMR WALL BUY");

const gun=new THREE.Group();const gunBody=new THREE.Mesh(new THREE.BoxGeometry(.16,.18,.72),new THREE.MeshStandardMaterial({color:0x151717,metalness:.55,roughness:.45}));gunBody.position.set(.28,-.28,-.64);gun.add(gunBody);const barrel=new THREE.Mesh(new THREE.BoxGeometry(.06,.06,.48),gunBody.material);barrel.position.set(.28,-.25,-1.18);gun.add(barrel);camera.add(gun);scene.add(camera);

let audioCtx=null;
function audio(){if(!audioCtx)audioCtx=new (window.AudioContext||window.webkitAudioContext)();if(audioCtx.state==="suspended")audioCtx.resume();return audioCtx}
function tone(freq,dur=.08,type="square",vol=.05,slide=0){const a=audio(),o=a.createOscillator(),g=a.createGain();o.type=type;o.frequency.setValueAtTime(freq,a.currentTime);if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(20,freq+slide),a.currentTime+dur);g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);o.connect(g);g.connect(a.destination);o.start();o.stop(a.currentTime+dur)}
function noise(dur=.09,vol=.06){const a=audio(),buf=a.createBuffer(1,a.sampleRate*dur,a.sampleRate),data=buf.getChannelData(0);for(let i=0;i<data.length;i++)data[i]=(Math.random()*2-1);const s=a.createBufferSource(),g=a.createGain();s.buffer=buf;g.gain.setValueAtTime(vol,a.currentTime);g.gain.exponentialRampToValueAtTime(.001,a.currentTime+dur);s.connect(g);g.connect(a.destination);s.start()}
function gunSound(){noise(.07,.07);tone(115,.08,"sawtooth",.035,-65)}
function pickupSound(){tone(500,.08,"sine",.08,250);setTimeout(()=>tone(850,.12,"sine",.06,300),70)}
function roundSound(){tone(130,.25,"sawtooth",.06,80);setTimeout(()=>tone(220,.3,"square",.05,120),180)}
function zombieSound(){tone(75,.3,"sawtooth",.018,-25)}

const zombies=new Map(),players=new Map(),drops=new Map(),tracers=[];
function zombieMesh(type="walker"){
 const g=new THREE.Group();
 const runner=type==="runner";
 const skin=new THREE.MeshStandardMaterial({color:runner?0x7f5b52:0x897567,roughness:1});
 const cloth=new THREE.MeshStandardMaterial({color:runner?0x443f3a:0x55574f,roughness:1});
 const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.3,.85,4,8),cloth);torso.position.y=1.15;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.27,10,8),skin);head.position.y=1.9;head.userData.hitZone="head";g.add(head);
 const eyeMat=new THREE.MeshBasicMaterial({color:runner?0xff7b2c:0xdf2e22});
 for(const x of[-.09,.09]){const e=new THREE.Mesh(new THREE.SphereGeometry(.025,6,6),eyeMat);e.position.set(x,1.95,.24);e.userData.hitZone="head";g.add(e)}
 g.userData.type=type;
 return g
}
function playerMesh(){
 const g=new THREE.Group();
 const skin=new THREE.MeshStandardMaterial({color:0xb98f70,roughness:1});
 const shirt=new THREE.MeshStandardMaterial({color:0x344a58,roughness:1});
 const pants=new THREE.MeshStandardMaterial({color:0x25292d,roughness:1});

 const torso=new THREE.Mesh(new THREE.BoxGeometry(.56,.85,.34),shirt);torso.position.y=1.25;g.add(torso);
 const head=new THREE.Mesh(new THREE.SphereGeometry(.23,12,10),skin);head.position.y=1.9;g.add(head);
 const hips=new THREE.Mesh(new THREE.BoxGeometry(.44,.3,.3),pants);hips.position.y=.72;g.add(hips);

 for(const x of[-.15,.15]){
   const leg=new THREE.Mesh(new THREE.BoxGeometry(.16,.68,.2),pants);leg.position.set(x,.3,0);g.add(leg);
 }
 for(const x of[-.38,.38]){
   const arm=new THREE.Mesh(new THREE.BoxGeometry(.14,.65,.16),skin);arm.position.set(x,1.28,0);g.add(arm);
 }
 const weapon=new THREE.Mesh(new THREE.BoxGeometry(.12,.12,.72),new THREE.MeshStandardMaterial({color:0x111414,metalness:.5}));
 weapon.position.set(.25,1.25,.34);weapon.rotation.x=Math.PI/2;g.add(weapon);
 g.userData.weaponMesh=weapon;
 return g
}
function dropMesh(type){const colors={maxammo:0x4b7dff,doublepoints:0xffb22e,instakill:0xd44b4b,nuke:0x74c96a};const g=new THREE.Group();const m=new THREE.Mesh(new THREE.OctahedronGeometry(.42),new THREE.MeshStandardMaterial({color:colors[type],emissive:colors[type],emissiveIntensity:.55}));m.position.y=.7;g.add(m);g.userData.type=type;return g}

let pos=new THREE.Vector3(-8,1.65,0),yaw=0,pitch=0,keys={},shooting=false,aiming=false,lastShot=0,last=performance.now(),lastPadReload=false,lastPadInteract=false,lastPadSwap=false,lastGroan=0,stamina=100,reloadFinishLocal=0,mobileMoveX=0,mobileMoveY=0,mobileFire=false,mobileADS=false,mobileSprint=false,mobileLookDX=0,mobileLookDY=0;
function solids(){
 const a=[...BASE_WALLS];
 if(S?.doors){
   for(const [key,d] of Object.entries(DOORS)){
     if(!S.doors[key])a.push(d);
   }
 }
 return a
}
function rectHit(px,pz,rad,r){const nx=Math.max(r.x-r.w/2,Math.min(px,r.x+r.w/2)),nz=Math.max(r.z-r.d/2,Math.min(pz,r.z+r.d/2)),dx=px-nx,dz=pz-nz;return dx*dx+dz*dz<rad*rad}
function blocked(x,z){return solids().some(r=>rectHit(x,z,.35,r))}
function moveLocal(dx,dz){let nx=Math.max(-42.5,Math.min(42.5,pos.x+dx)),nz=Math.max(-36.5,Math.min(36.5,pos.z+dz));if(!blocked(nx,pos.z))pos.x=nx;if(!blocked(pos.x,nz))pos.z=nz}


const isMobileDevice = () =>
  window.matchMedia("(pointer: coarse)").matches ||
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function bindHoldButton(id,onStart,onEnd){
  const el=document.getElementById(id);
  if(!el)return;
  const start=e=>{e.preventDefault();audio();onStart();};
  const end=e=>{e.preventDefault();onEnd();};
  el.addEventListener("touchstart",start,{passive:false});
  el.addEventListener("touchend",end,{passive:false});
  el.addEventListener("touchcancel",end,{passive:false});
  el.addEventListener("pointerdown",start);
  el.addEventListener("pointerup",end);
  el.addEventListener("pointercancel",end);
}

(function setupMobileControls(){
  const base=document.getElementById("moveBase");
  const stick=document.getElementById("moveStick");
  const movePad=document.getElementById("movePad");
  const lookZone=document.getElementById("lookZone");
  if(!base||!stick||!movePad||!lookZone)return;

  let moveTouch=null;
  function updateMove(clientX,clientY){
    const rect=base.getBoundingClientRect();
    const cx=rect.left+rect.width/2, cy=rect.top+rect.height/2;
    let dx=clientX-cx, dy=clientY-cy;
    const max=42;
    const len=Math.hypot(dx,dy)||1;
    if(len>max){dx=dx/len*max;dy=dy/len*max;}
    mobileMoveX=dx/max;
    mobileMoveY=dy/max;
    stick.style.transform=`translate(${dx}px,${dy}px)`;
  }
  function resetMove(){
    mobileMoveX=0;mobileMoveY=0;
    stick.style.transform="translate(0px,0px)";
    moveTouch=null;
  }
  movePad.addEventListener("touchstart",e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    moveTouch=t.identifier;
    updateMove(t.clientX,t.clientY);
  },{passive:false});
  movePad.addEventListener("touchmove",e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===moveTouch)updateMove(t.clientX,t.clientY);
    }
  },{passive:false});
  movePad.addEventListener("touchend",e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===moveTouch)resetMove();
    }
  },{passive:false});
  movePad.addEventListener("touchcancel",resetMove,{passive:false});

  let lookTouch=null,lastX=0,lastY=0;
  lookZone.addEventListener("touchstart",e=>{
    e.preventDefault();
    const t=e.changedTouches[0];
    lookTouch=t.identifier;lastX=t.clientX;lastY=t.clientY;
  },{passive:false});
  lookZone.addEventListener("touchmove",e=>{
    e.preventDefault();
    for(const t of e.changedTouches){
      if(t.identifier===lookTouch){
        const dx=t.clientX-lastX,dy=t.clientY-lastY;
        lastX=t.clientX;lastY=t.clientY;
        mobileLookDX+=dx;
        mobileLookDY+=dy;
      }
    }
  },{passive:false});
  lookZone.addEventListener("touchend",e=>{
    for(const t of e.changedTouches)if(t.identifier===lookTouch)lookTouch=null;
  },{passive:false});
  lookZone.addEventListener("touchcancel",()=>lookTouch=null,{passive:false});

  bindHoldButton("mFire",()=>mobileFire=true,()=>mobileFire=false);
  bindHoldButton("mADS",()=>mobileADS=true,()=>mobileADS=false);
  bindHoldButton("mSprint",()=>mobileSprint=true,()=>mobileSprint=false);

  const reload=document.getElementById("mReload");
  reload?.addEventListener("touchstart",e=>{e.preventDefault();audio();socket.emit("reload")},{passive:false});
  reload?.addEventListener("pointerdown",e=>{e.preventDefault();audio();socket.emit("reload")});

  const interactBtn=document.getElementById("mInteract");
  interactBtn?.addEventListener("touchstart",e=>{e.preventDefault();audio();interact()},{passive:false});
  interactBtn?.addEventListener("pointerdown",e=>{e.preventDefault();audio();interact()});
  const swapBtn=document.getElementById("mSwap");
  swapBtn?.addEventListener("touchstart",e=>{e.preventDefault();socket.emit("swapWeapon")},{passive:false});
  swapBtn?.addEventListener("pointerdown",e=>{e.preventDefault();socket.emit("swapWeapon")});

  if(isMobileDevice()){
    document.getElementById("mobileControls").style.display="block";
  }
})();

addEventListener("keydown",e=>{keys[e.key.toLowerCase()]=true;audio();if(e.key.toLowerCase()==="r")socket.emit("reload");if(e.key.toLowerCase()==="e")interact();if(e.key.toLowerCase()==="q"){e.preventDefault();socket.emit("swapWeapon")}});
addEventListener("keyup",e=>keys[e.key.toLowerCase()]=false);
renderer.domElement.addEventListener("contextmenu",e=>e.preventDefault());
renderer.domElement.addEventListener("mousedown",e=>{audio();if(e.button===0){shooting=true;renderer.domElement.requestPointerLock?.()}if(e.button===2){aiming=true;renderer.domElement.requestPointerLock?.()}});
addEventListener("mouseup",e=>{if(e.button===0)shooting=false;if(e.button===2)aiming=false});
addEventListener("mousemove",e=>{if(document.pointerLockElement===renderer.domElement){const lookScale=aiming?.62:1;yaw-=e.movementX*.0022*lookScale;pitch-=e.movementY*.0019*lookScale;pitch=Math.max(-1.25,Math.min(1.25,pitch))}});

document.getElementById("join").onclick=()=>{audio();document.getElementById("status").textContent="Connecting...";const inviteRoom=new URLSearchParams(location.search).get("room")||"";socket.emit("joinRoom",{room:document.getElementById("room").value||inviteRoom,name:document.getElementById("name").value||"Survivor"})};
socket.on("joined",d=>{myId=d.id;roomCode=d.room;pos.set(d.spawn?.x??-8,1.65,d.spawn?.z??0);document.getElementById("menu").style.display="none"});
socket.on("state",s=>{
  S=s;
  if(S.phase==="lobby")showLobby();
  else if(S.phase!=="gameover")hideLobby();

  if(S.phase==="gameover"){
    if(!lastGameOverData){
      lastGameOverData={
        round:S.round,
        players:S.players.map(p=>({id:p.id,name:p.name,kills:p.kills,points:p.points}))
      };
    }
    showGameOver(lastGameOverData);
  }else{
    lastGameOverData=null;
    hideGameOver();
  }
});
socket.on("joinError",m=>document.getElementById("status").textContent=m);
socket.on("roundStart",()=>{roundSound();flashMessage("ROUND START",1800)});
socket.on("roundComplete",()=>{tone(180,.2,"sine",.05,80);flashMessage("ROUND COMPLETE",2400)});
socket.on("powerup",d=>{pickupSound();const n={maxammo:"MAX AMMO!",doublepoints:"DOUBLE POINTS!",instakill:"INSTA-KILL!",nuke:"NUKE!"}[d.type]||d.type.toUpperCase();powerFlash(n)});
socket.on("perkBought",()=>{tone(330,.12,"sine",.05,150);setTimeout(()=>tone(660,.16,"sine",.05,220),100)});
socket.on("boxResult",d=>{pickupSound();powerFlash("MYSTERY BOX: "+d.name);});

socket.on("weaponBought",d=>{pickupSound();powerFlash("BOUGHT: "+d.name);});
socket.on("weaponSwapped",()=>{tone(220,.05,"square",.02,40);});
socket.on("weaponChanged",d=>{
  if(d.playerId===myId){
    tone(220,.05,"square",.02,40);
    powerFlash("SWAPPED WEAPON");
  }
});
socket.on("packDenied",d=>{
  powerFlash(`NEED ${d.needed} POINTS FOR NEXT UPGRADE`);
});
socket.on("purchaseSuccess",d=>{
  pickupSound();
  powerFlash(d.label||"PURCHASED");
});
socket.on("purchaseDenied",d=>{
  powerFlash(`NEED ${d.needed} MORE POINTS`);
});
socket.on("packResult",d=>{
  pickupSound();
  if(d.maxed && d.level>=3) powerFlash(`${d.name} — LEVEL 3 MAX`);
  else if(d.nextCost) powerFlash(`${d.name} — LEVEL ${d.level} | NEXT ${d.nextCost}`);
  else powerFlash(`${d.name} — LEVEL ${d.level}`);
});
socket.on("playerShot",d=>{
  if(d.playerId===myId)return;
  const g=players.get(d.playerId);if(!g)return;
  const start=g.position.clone().add(new THREE.Vector3(0,1.4,0));
  const dir=new THREE.Vector3(-Math.sin(d.yaw||0),0,-Math.cos(d.yaw||0)).normalize();
  const end=start.clone().add(dir.multiplyScalar(18));
  const geom=new THREE.BufferGeometry().setFromPoints([start,end]);
  const mat=new THREE.LineBasicMaterial({color:0xffe7a8,transparent:true,opacity:.8});
  const line=new THREE.Line(geom,mat);scene.add(line);tracers.push({line,born:performance.now()});
  tone(105,.045,"sawtooth",.012,-25);
});


socket.on("reloadStarted",d=>{reloadFinishLocal=d.finishAt;});
socket.on("reloadComplete",()=>{reloadFinishLocal=0;tone(280,.06,"square",.025,80);});


socket.on("gameOver",d=>{
  lastGameOverData=d;
  document.exitPointerLock?.();
  showGameOver(d);
  tone(90,.45,"sawtooth",.07,-40);
});
socket.on("matchReset",()=>{
  hideGameOver();
  hideLobby();
  pos.set(-8,1.65,0);
  yaw=0; pitch=0;
  if(!isMobileDevice())renderer.domElement.requestPointerLock?.();
  flashMessage("MATCH RESTARTING",1800);
});
socket.on("matchStarting",()=>{
  hideLobby();
  flashMessage("MATCH STARTING",2200);
});

socket.on("returnedToLobby",()=>{
  document.exitPointerLock?.();
  hideGameOver();
  showLobby();
});
socket.on("hostChanged",()=>{ if(S?.phase==="gameover") refreshGameOverButtons(); if(S?.phase==="lobby") showLobby(); });


document.getElementById("copy").onclick=copyInvite;

const self=()=>S?.players?.find(p=>p.id===myId);
function nearby(){
 const p=self();if(!p||!S)return null;
 const lvl=p.packLevels?.[p.activeSlot||0]||0;
 const opts=[
  {x:-18,z:-14,type:"door:leftHall",label:"OPEN LEFT HALL — 1000",active:!S.doors.leftHall},
  {x:18,z:-14,type:"door:rightHall",label:"OPEN RIGHT HALL — 1000",active:!S.doors.rightHall},
  {x:0,z:21,type:"door:stage",label:"OPEN STAGE — 1250",active:!S.doors.stage},
  {x:20,z:21,type:"door:backstage",label:"OPEN BACKSTAGE — 1500",active:!S.doors.backstage},

  {x:-10,z:-23,type:"jug",label:"BUY JUGGERNOG — 2500",active:!p.perkJug},
  {x:27,z:-3,type:"speed",label:"BUY SPEED COLA — 3000",active:S.doors.rightHall&&!p.perkSpeed},
  {x:12,z:30,type:"doubletap",label:"BUY DOUBLE TAP — 2000",active:(S.doors.stage||S.doors.backstage)&&!p.perkDouble},
  {x:-12,z:30,type:"staminup",label:"BUY STAMIN-UP — 2000",active:(S.doors.stage||S.doors.backstage)&&!p.perkStaminup},

  {x:-6,z:-20,type:"ammo",label:"BUY AMMO — 500",active:true},
  {x:-26,z:8,type:"mysterybox",label:"MYSTERY BOX — 950",active:true},
  {x:0,z:29,type:"pack",label:lvl>=3?"MAX WEAPON UPGRADE":`UPGRADE WEAPON LVL ${lvl+1} — ${[0,5000,15000,30000][lvl+1]}`,active:(S.doors.stage||S.doors.backstage)},

  {x:-27,z:-4,type:"wall_ar",label:"BUY AR-15 — 1200",active:S.doors.leftHall},
  {x:27,z:-4,type:"wall_smg",label:"BUY VIPER SMG — 1000",active:S.doors.rightHall},
  {x:-23,z:16,type:"wall_shotgun",label:"BUY RANGER SHOTGUN — 1500",active:true},
  {x:23,z:16,type:"wall_dmr",label:"BUY SENTINEL DMR — 1800",active:true}
 ];
 let best=null,bd=4.0;
 for(const o of opts){
   if(!o.active)continue;
   const d=Math.hypot(pos.x-o.x,pos.z-o.z);
   if(d<bd){bd=d;best=o}
 }
 for(const q of S.players){
   if(q.id===myId||!q.down)continue;
   const d=Math.hypot(pos.x-q.x,pos.z-q.z);
   if(d<bd){bd=d;best={type:"revive",playerId:q.id,label:"REVIVE "+q.name}}
 }
 return best
}
function interact(){const o=nearby();if(!o)return;if(o.type==="revive")socket.emit("revive",{playerId:o.playerId});else socket.emit("buy",{type:o.type})}

const ray=new THREE.Raycaster();
function addTracer(end){const start=new THREE.Vector3(.25,-.18,-.9).applyMatrix4(camera.matrixWorld);const geom=new THREE.BufferGeometry().setFromPoints([start,end]);const mat=new THREE.LineBasicMaterial({color:0xffe7a8,transparent:true,opacity:.95});const line=new THREE.Line(geom,mat);scene.add(line);tracers.push({line,born:performance.now()})}
function muzzle(){const m=new THREE.PointLight(0xffc46c,2.8,4);m.position.set(.25,-.2,-1).applyMatrix4(camera.matrixWorld);scene.add(m);setTimeout(()=>scene.remove(m),45)}
function fire(){
 const p=self();if(!p||p.down||p.ammo<=0||S?.phase!=="round")return;
 const now=performance.now();
 const rates={AR15:115,SMG:78,SHOTGUN:620,DMR:280,LMG:92,VOLT:330};
 const spreads={AR15:.012,SMG:.026,SHOTGUN:.07,DMR:.006,LMG:.022,VOLT:.01};
 const recoil={AR15:.020,SMG:.014,SHOTGUN:.045,DMR:.030,LMG:.024,VOLT:.010};
 const rate=(rates[p.weapon]||115);
 if(now-lastShot<rate)return;
 lastShot=now;gunSound();muzzle();

 const isADS=aiming;
 const spread=(spreads[p.weapon]||.015)*(isADS?.32:1);
 const sx=(Math.random()-.5)*spread;
 const sy=(Math.random()-.5)*spread;
 ray.setFromCamera(new THREE.Vector2(sx,sy),camera);

 const zombieTargets=[...zombies.values()];
 const hits=ray.intersectObjects(zombieTargets,true);
 let targetId=null,headshot=false;
 let end=camera.position.clone().add(new THREE.Vector3(0,0,-35).applyQuaternion(camera.quaternion));

 if(hits.length){
   end=hits[0].point.clone();
   let obj=hits[0].object;
   if(obj.userData.hitZone==="head")headshot=true;
   while(obj){
     if(obj.userData.hitZone==="head")headshot=true;
     if(obj.userData.zid!=null){targetId=obj.userData.zid;break;}
     obj=obj.parent;
   }
 }
 addTracer(end);
 socket.emit("shoot",{targetId,headshot});

 // weapon recoil
 pitch=Math.max(-1.25,Math.min(1.25,pitch+(recoil[p.weapon]||.02)*(isADS?.55:1)));
 yaw+=(Math.random()-.5)*(recoil[p.weapon]||.02)*.35;
}
function gamepad(){const g=[...(navigator.getGamepads?.()||[])].find(Boolean);if(!g)return null;const dead=v=>Math.abs(v)<.16?0:v;return{lx:dead(g.axes[0]||0),ly:dead(g.axes[1]||0),rx:dead(g.axes[2]||0),ry:dead(g.axes[3]||0),fire:(g.buttons[7]?.value||0)>.3,aim:(g.buttons[6]?.value||0)>.25,sprint:!!g.buttons[4]?.pressed,reload:!!g.buttons[2]?.pressed,interact:!!g.buttons[0]?.pressed,swap:!!g.buttons[3]?.pressed}}

function syncVisuals(now){
 if(!S)return;
 for(const [key,m] of Object.entries(doorMeshes))m.visible=!S.doors[key];
 for(const [key,m] of Object.entries(doorSigns))m.visible=!S.doors[key];
 for(const z of S.zombies){let g=zombies.get(z.id);if(!g){g=zombieMesh(z.type);g.userData.zid=z.id;g.traverse(o=>o.userData.zid=z.id);scene.add(g);zombies.set(z.id,g)}const prev=g.position.clone();g.position.lerp(new THREE.Vector3(z.x,0,z.z),.4);const dx=g.position.x-prev.x,dz=g.position.z-prev.z;if(Math.hypot(dx,dz)>.001)g.rotation.y=Math.atan2(dx,dz)}
 for(const[id,g]of[...zombies])if(!S.zombies.some(z=>z.id===id)){scene.remove(g);zombies.delete(id)}
 for(const p of S.players){if(p.id===myId)continue;let g=players.get(p.id);if(!g){g=playerMesh();scene.add(g);players.set(p.id,g)}const py=(p.z>21&&p.z<34&&p.x>-16&&p.x<16)?.9:0;g.position.lerp(new THREE.Vector3(p.x,py,p.z),.35);
   g.visible=true;
   g.rotation.z += (((p.down?-Math.PI/2:0)-g.rotation.z)*.28);
   g.rotation.y=p.yaw||0}
 for(const[id,g]of[...players])if(!S.players.some(p=>p.id===id)){scene.remove(g);players.delete(id)}
 for(const d of S.drops){let g=drops.get(d.id);if(!g){g=dropMesh(d.type);scene.add(g);drops.set(d.id,g)}g.position.set(d.x,0,d.z);g.rotation.y=now*.002;g.position.y=Math.sin(now*.004+d.id)*.14}
 for(const[id,g]of[...drops])if(!S.drops.some(d=>d.id===id)){scene.remove(g);drops.delete(id)}
 for(let i=tracers.length-1;i>=0;i--){const t=tracers[i],age=now-t.born;t.line.material.opacity=Math.max(0,1-age/120);if(age>130){scene.remove(t.line);tracers.splice(i,1)}}
}
function flashMessage(txt,ms){const e=document.getElementById("centerMessage");e.textContent=txt;setTimeout(()=>{if(e.textContent===txt)e.textContent=""},ms)}
function powerFlash(txt){const e=document.getElementById("powerMessage");e.textContent=txt;setTimeout(()=>{if(e.textContent===txt)e.textContent=""},2200)}




function getInviteUrl(){
  if(!roomCode)return "";
  let origin=location.origin;
  if(location.protocol==="https:" && netInfo?.publicOrigin){
    origin=netInfo.publicOrigin;
  }else if((location.hostname==="localhost"||location.hostname==="127.0.0.1")&&netInfo?.lanIp){
    origin=`http://${netInfo.lanIp}:${netInfo.port}`;
  }
  return origin+location.pathname+"?room="+roomCode;
}
async function copyInvite(){
  const invite=getInviteUrl();
  if(!invite)return;
  try{
    await navigator.clipboard.writeText(invite);
    powerFlash("INVITE COPIED");
  }catch{
    prompt("Send this link to your friend:",invite);
  }
}

function isHost(){return !!S && S.hostId===myId;}

function showGameOver(d){
  const screen=document.getElementById("gameOverScreen");
  screen.style.display="flex";
  document.getElementById("goRound").textContent="ROUND REACHED: "+d.round;
  document.getElementById("goScoreboard").innerHTML=
    d.players
      .sort((a,b)=>b.kills-a.kills)
      .map(p=>`<b>${p.name}</b> — ${p.kills} KILLS — ${p.points} PTS`)
      .join("<br>");
  refreshGameOverButtons();
}
function refreshGameOverButtons(){
  const host=isHost();
  document.getElementById("restartMatch").style.display=host?"inline-block":"none";
  document.getElementById("returnLobby").style.display=host?"inline-block":"none";
  document.getElementById("goHostNote").textContent=host
    ?"You are the host."
    :"Waiting for the lobby host to choose what happens next.";
}
function hideGameOver(){document.getElementById("gameOverScreen").style.display="none";}

function showLobby(){
  const screen=document.getElementById("lobbyScreen");
  screen.style.display="flex";
  document.exitPointerLock?.();
  document.getElementById("lobbyRoom").textContent="ROOM CODE: "+roomCode;
  const roster=(S?.players||[]);
  document.getElementById("lobbyPlayers").innerHTML=
    `<b>PLAYERS ${roster.length}/4</b><br><br>`+
    roster.map(p=>`${p.id===S?.hostId?"★ ":""}<b>${p.name}</b>${p.id===S?.hostId?" — HOST":""}`).join("<br>");
  const host=isHost();
  document.getElementById("startMatch").style.display=host?"inline-block":"none";
  document.getElementById("lobbyHostNote").textContent=host
    ?"Invite your friends, then press START MATCH when everyone is ready."
    :"You joined the lobby. Waiting for the host to start the match.";
}
function hideLobby(){document.getElementById("lobbyScreen").style.display="none";}

document.getElementById("restartMatch").onclick=()=>{ if(isHost())socket.emit("restartMatch"); };
document.getElementById("returnLobby").onclick=()=>{ if(isHost())socket.emit("returnToLobby"); };
document.getElementById("startMatch").onclick=()=>{ if(isHost())socket.emit("startMatch"); };
document.getElementById("lobbyCopy").onclick=copyInvite;

function updateADS(p,gp){
 const activeAim=aiming||gp?.aim||mobileADS;
 const adsWeapons={AR15:true,SMG:true,SHOTGUN:true,DMR:true,LMG:true,VOLT:true};
 const canADS=!!p&&!!adsWeapons[p.weapon];
 const on=activeAim&&canADS;

 document.body.classList.toggle("ads",on);
 document.body.classList.toggle("energy",on&&p?.weapon==="VOLT");

 const scope=document.getElementById("scopeOverlay");
 scope.style.display=(on&&p?.weapon==="DMR")?"block":"none";

 // weapon-specific FOV
 const targetFov=on?(p?.weapon==="DMR"?38:58):72;
 camera.fov += (targetFov-camera.fov)*.18;
 camera.updateProjectionMatrix();

 // bring weapon closer to center while aiming
 const tx=on?0.0:.28, ty=on?-.18:-.28, tz=on?-.78:-.64;
 gun.position.x += (tx-gun.position.x)*.25;
 gun.position.y += (ty-gun.position.y)*.25;
 gun.position.z += (tz-gun.position.z)*.25;
}

function loop(now){requestAnimationFrame(loop);const dt=Math.min(.033,(now-last)/1000);last=now;if(S&&myId){
  const p=self(),gp=gamepad();
  const playable=S.phase!=="gameover"&&S.phase!=="lobby";
  updateADS(playable?p:null,gp);
  if(playable&&gp){const lookScale=(aiming||gp.aim)?.68:1;yaw-=gp.rx*dt*2.5*lookScale;pitch+=gp.ry*dt*2*lookScale;pitch=Math.max(-1.25,Math.min(1.25,pitch));if(gp.reload&&!lastPadReload)socket.emit("reload");if(gp.interact&&!lastPadInteract)interact();if(gp.swap&&!lastPadSwap)socket.emit("swapWeapon");lastPadReload=gp.reload;lastPadInteract=gp.interact;lastPadSwap=gp.swap}if(playable&&p&&!p.down){let f=(keys.w?1:0)-(keys.s?1:0)-(gp?.ly||0)-mobileMoveY,r=(keys.d?1:0)-(keys.a?1:0)+(gp?.lx||0)+mobileMoveX,m=Math.hypot(f,r);if(m>1){f/=m;r/=m}const wantsSprint=(keys.shift||gp?.sprint||mobileSprint)&&Math.hypot(f,r)>.05;
const staminaDrain=p.perkStaminup?14:24;
const staminaRegen=p.perkStaminup?30:22;
let sprinting=wantsSprint&&stamina>1;
if(sprinting)stamina=Math.max(0,stamina-staminaDrain*dt);
else stamina=Math.min(100,stamina+staminaRegen*dt);
let sp=sprinting?5.2:3.4;
if(p.perkStaminup&&sprinting)sp*=1.22;
const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*sp*dt,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*sp*dt;moveLocal(dx,dz);socket.emit("move",{x:pos.x,z:pos.z,yaw});if(shooting||gp?.fire||mobileFire)fire()}let elevation=0;
// Stage is raised.
if(pos.z>21&&pos.z<34&&pos.x>-16&&pos.x<16)elevation=.9;
// Side staircases rise toward the balcony/projector side.
for(const s of STAIR_ZONES){
  if(pos.x>=s.x1&&pos.x<=s.x2&&pos.z>=s.z1&&pos.z<=s.z2){
    const t=(pos.z-s.z1)/(s.z2-s.z1);
    elevation=Math.max(elevation,s.base+(s.top-s.base)*t);
  }
}
camera.position.copy(pos);
camera.position.y=1.65+elevation;camera.rotation.order="YXZ";camera.rotation.y=yaw;camera.rotation.x=pitch;if(p){document.getElementById("round").textContent="ROUND "+S.round;document.getElementById("roomLabel").textContent="ROOM "+roomCode;document.getElementById("threats").textContent=S.phase==="intermission"?"BREAK":("ZOMBIES "+(S.zombies.length+S.queue));document.getElementById("points").textContent=p.points+" PTS";document.getElementById("ammo").textContent=p.ammo+" / "+p.reserve;
const names={AR15:"AR-15",SMG:"Viper SMG",SHOTGUN:"Ranger Shotgun",DMR:"Sentinel DMR",LMG:"Atlas LMG",VOLT:"Volt-9 Energy Pistol",CARBINE:"Raven Carbine",BURST:"Trident Burst Rifle"};
document.querySelector("#br > div:first-child").textContent=`${names[p.weapon]||p.weapon}  |  SLOT ${(p.activeSlot||0)+1}  |  UP ${p.packLevel||0}`;document.getElementById("hp").style.width=(p.hp/p.maxHp*100)+"%";
document.getElementById("stam").style.width=stamina+"%";
document.getElementById("reloadText").textContent=(p.reloading||reloadFinishLocal>Date.now())?"RELOADING...":"";
document.getElementById("perks").textContent=[p.perkJug?"◆ JUGGERNOG 200HP":"",p.perkSpeed?"◆ SPEED COLA FAST RELOAD":"",p.perkDouble?"◆ DOUBLE TAP +50% DMG":"",p.perkStaminup?"◆ STAMIN-UP":""] .filter(Boolean).join("   ");document.getElementById("downed").style.display=p.down?"flex":"none";document.getElementById("prompt").textContent=nearby()?.label||"";document.getElementById("players").innerHTML=S.players.map(q=>`${q.name}: ${q.down?"DOWN":Math.ceil(q.hp)+" HP"} — ${q.kills} K`).join("<br>");if(playable&&S.phase==="intermission"&&S.nextRoundAt){const sec=Math.max(0,Math.ceil((S.nextRoundAt-Date.now())/1000));document.getElementById("centerMessage").textContent=`ROUND ${Math.max(1,S.round-1)} COMPLETE\nNEXT ROUND IN ${sec}`;}else if(document.getElementById("centerMessage").textContent.includes("NEXT ROUND"))document.getElementById("centerMessage").textContent="";}if(S.zombies.length&&now-lastGroan>3500+Math.random()*3000){lastGroan=now;zombieSound()}syncVisuals(now)}renderer.render(scene,camera)}
requestAnimationFrame(loop);
addEventListener("resize",()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
