
import express from "express";
import http from "http";
import os from "os";
import crypto from "crypto";
import { Server } from "socket.io";

const app=express();
const server=http.createServer(app);
const io=new Server(server);
const PORT=Number(process.env.PORT||3000);
app.set("trust proxy", 1);
app.use(express.static("public"));
app.get("/health",(_req,res)=>res.status(200).send("ok"));

function lanIp(){
  const nets=os.networkInterfaces();
  for(const list of Object.values(nets)){
    for(const n of list||[]){
      if(n.family==="IPv4"&&!n.internal&&!n.address.startsWith("169.254.")) return n.address;
    }
  }
  return "127.0.0.1";
}
app.get("/api/info",(req,res)=>{
  const forwarded=req.get("x-forwarded-proto");
  const proto=forwarded?forwarded.split(",")[0]:req.protocol;
  const host=req.get("host");
  res.json({port:PORT,lanIp:lanIp(),publicOrigin:`${proto}://${host}`});
});

const rooms=new Map();

const BASE_WALLS=[
  // Original ruined-theater layout inspired by classic cinema zombie maps
  {x:-34,z:0,w:1,d:64},{x:34,z:0,w:1,d:64},
  {x:0,z:-32,w:68,d:1},{x:0,z:32,w:68,d:1},

  // Foyer / spawn room
  {x:-15,z:-21,w:1,d:21},
  {x:15,z:-21,w:1,d:21},
  {x:-10,z:-10,w:10,d:1},
  {x:10,z:-10,w:10,d:1},

  // Main auditorium shell
  {x:-25,z:5,w:1,d:28},
  {x:25,z:5,w:1,d:28},
  {x:-18,z:17,w:14,d:1},
  {x:18,z:17,w:14,d:1},

  // Stage / backstage
  {x:0,z:18,w:22,d:1},
  {x:-15,z:25,w:1,d:14},
  {x:15,z:25,w:1,d:14},
  {x:-7,z:26,w:1,d:12},
  {x:7,z:26,w:1,d:12},

  // Left theater hall
  {x:-29,z:-8,w:9,d:1},
  {x:-29,z:10,w:9,d:1},

  // Right theater hall
  {x:29,z:-8,w:9,d:1},
  {x:29,z:10,w:9,d:1},

  // Projection / control rooms
  {x:-23,z:-25,w:12,d:1},
  {x:23,z:-25,w:12,d:1},
  {x:-18,z:-28,w:1,d:8},
  {x:18,z:-28,w:1,d:8},

  // Auditorium cover / aisle dividers
  {x:-10,z:4,w:7,d:1},
  {x:10,z:4,w:7,d:1},
  {x:-15,z:11,w:8,d:1},
  {x:15,z:11,w:8,d:1}
];

const EAST_DOOR={x:15,z:-10,w:1,d:4};
const LAB_DOOR={x:15,z:18,w:4,d:1};
const NORTH_DOOR={x:0,z:18,w:4,d:1};
const SOUTH_DOOR={x:-15,z:-10,w:1,d:4};

const SPAWNS={
  0:[[-10,-27],[0,-27],[10,-27],[-12,-17],[12,-17]],
  1:[[25,-3],[30,0],[29,8],[20,6]],
  2:[[-12,5],[0,7],[12,5],[-18,12],[18,12]],
  3:[[-10,27],[0,29],[10,27],[-20,25],[20,25]],
  4:[[-29,-2],[-30,7],[-25,6],[-20,0]],
  5:[[-24,-27],[-20,-26],[-28,-23]],
  6:[[24,-27],[20,-26],[28,-23]]
};

const WEAPONS={
  AR15:{name:"AR-15",damage:40,fireRate:115,mag:30,reserve:180,headMult:2.5,reload:1500},
  SMG:{name:"Viper SMG",damage:27,fireRate:78,mag:40,reserve:240,headMult:2.25,reload:1250},
  SHOTGUN:{name:"Ranger Shotgun",damage:24,fireRate:620,mag:8,reserve:64,pellets:7,headMult:1.7,reload:1800},
  DMR:{name:"Sentinel DMR",damage:78,fireRate:280,mag:12,reserve:84,headMult:2.8,reload:1600},
  LMG:{name:"Atlas LMG",damage:36,fireRate:92,mag:75,reserve:300,headMult:2.2,reload:2400},
  VOLT:{name:"Volt-9 Energy Pistol",damage:150,fireRate:330,mag:12,reserve:84,headMult:2.0,reload:1500},
  CARBINE:{name:"Raven Carbine",damage:46,fireRate:130,mag:30,reserve:180,headMult:2.45,reload:1450},
  BURST:{name:"Trident Burst Rifle",damage:52,fireRate:190,mag:24,reserve:168,headMult:2.55,reload:1550}
};
const BOX_POOL=["SMG","SHOTGUN","DMR","LMG","AR15","CARBINE","BURST","VOLT"];

const WALL_BUYS={
  wall_ar:{weapon:"AR15",cost:1200},
  wall_smg:{weapon:"SMG",cost:1000},
  wall_shotgun:{weapon:"SHOTGUN",cost:1500},
  wall_dmr:{weapon:"DMR",cost:1800}
};
const PACK_COSTS={1:5000,2:15000,3:30000};

const PERKS={
  jug:{cost:2500},
  speed:{cost:3000},
  doubletap:{cost:2000},
  staminup:{cost:2000}
};

function makeCode(){return crypto.randomBytes(3).toString("hex").toUpperCase();}
function createRoom(code){
  const r={
    code,players:new Map(),zombies:new Map(),drops:new Map(),
    nextZombieId:1,nextDropId:1,round:1,queue:0,nextSpawn:0,
    doors:{east:false,lab:false,north:false,south:false},activeZones:new Set([0]),
    phase:"lobby",nextRoundAt:0,
    doublePointsUntil:0,instaKillUntil:0,lastPowerDropAt:0,killsSinceDrop:0,
    hostId:null, gameOverAt:0, gameOverSince:0
  };
  rooms.set(code,r);return r;
}
function getRoom(code){return rooms.get(code)||createRoom(code);}
function publicState(r){
  return {
    round:r.round,queue:r.queue,doors:r.doors,activeZones:[...r.activeZones],
    phase:r.phase,nextRoundAt:r.nextRoundAt,doublePointsUntil:r.doublePointsUntil,instaKillUntil:r.instaKillUntil,
    hostId:r.hostId, gameOverAt:r.gameOverAt, gameOverSince:r.gameOverSince,
    players:[...r.players.values()].map(p=>{syncWeaponFields(p);return {...p}}),
    zombies:[...r.zombies.values()].map(z=>({...z})),
    drops:[...r.drops.values()].map(d=>({...d}))
  };
}
function rectHit(px,pz,rad,r){
  const nx=Math.max(r.x-r.w/2,Math.min(px,r.x+r.w/2));
  const nz=Math.max(r.z-r.d/2,Math.min(pz,r.z+r.d/2));
  const dx=px-nx,dz=pz-nz;
  return dx*dx+dz*dz<rad*rad;
}
function solids(r){
  const a=[...BASE_WALLS];
  if(!r.doors.east)a.push(EAST_DOOR);
  if(!r.doors.lab)a.push(LAB_DOOR);
  if(!r.doors.north)a.push(NORTH_DOOR);
  if(!r.doors.south)a.push(SOUTH_DOOR);
  return a;
}
function collides(r,x,z,rad=.35){return solids(r).some(w=>rectHit(x,z,rad,w));}

function startRound(r,now=Date.now()){
  r.phase="round";
  r.queue=5+r.round*4+Math.floor(r.round*1.35);
  r.nextRoundAt=0;
  spawnZombie(r);r.queue--;r.nextSpawn=now+650;
}
function spawnZombie(r){
  const zones=[...r.activeZones];
  const zone=zones[Math.floor(Math.random()*zones.length)];
  const list=SPAWNS[zone]||SPAWNS[0];
  const pt=list[Math.floor(Math.random()*list.length)];
  const id=r.nextZombieId++;
  const runnerChance=Math.min(.55,.08+r.round*.035);
  const type=Math.random()<runnerChance?"runner":"walker";
  const hpBase = type==="runner" ? 70 : 85;
  const hp=hpBase+r.round*18; // less bullet-spongy than V3
  const speed=type==="runner"
    ? 2.45+Math.min(1.1,r.round*.035)
    : 1.15+Math.min(.7,r.round*.025);
  r.zombies.set(id,{
    id,x:pt[0],z:pt[1],zone,type,
    hp,maxHp:hp,speed,
    damage:(type==="runner"?11:9)+Math.min(20,r.round*.55),
    lastAttack:0
  });
}
function maybeDrop(r,x,z){
  const now=Date.now();
  r.killsSinceDrop=(r.killsSinceDrop||0)+1;

  // Never allow drops back-to-back.
  if(now-(r.lastPowerDropAt||0) < 18000) return;

  // Require a reasonable number of kills before a drop can even roll.
  if(r.killsSinceDrop < 10) return;

  // After 10 kills, chance rises slowly until a drop happens.
  const extra=Math.min(15,r.killsSinceDrop-10);
  const chance=0.035 + extra*0.006; // 3.5% -> max ~12.5%
  if(Math.random() > chance) return;

  // Weighted rarity: Max Ammo most common, Nuke rare.
  const roll=Math.random();
  let type;
  if(roll < 0.42) type="maxammo";
  else if(roll < 0.72) type="doublepoints";
  else if(roll < 0.92) type="instakill";
  else type="nuke";

  const id=r.nextDropId++;
  r.drops.set(id,{id,type,x,z,expiresAt:now+20000});
  r.lastPowerDropAt=now;
  r.killsSinceDrop=0;
}
function nearestLiving(r,z){
  let best=null,bd=Infinity;
  for(const p of r.players.values()){
    if(p.down)continue;
    const d=(p.x-z.x)**2+(p.z-z.z)**2;
    if(d<bd){bd=d;best=p;}
  }
  return best;
}
function region(x,z){
  // 0 foyer, 1 right hall, 2 auditorium, 3 backstage/stage,
  // 4 left hall, 5 left projection, 6 right projection
  if(z < -10 && x > -15 && x < 15) return 0;
  if(x >= 15 && z < 18) return 1;
  if(x <= -15 && z < 18) return 4;
  if(z >= 18) return 3;
  if(z >= -10 && z < 18 && x > -25 && x < 25) return 2;
  if(x < -15 && z < -20) return 5;
  if(x > 15 && z < -20) return 6;
  return 2;
}

function theaterNodes(){
  return [
    {id:"foyer",x:0,z:-18,r:0},
    {id:"aud",x:0,z:6,r:2},
    {id:"stage",x:0,z:22,r:3},
    {id:"left",x:-27,z:0,r:4},
    {id:"right",x:27,z:0,r:1},
    {id:"lproj",x:-23,z:-26,r:5},
    {id:"rproj",x:23,z:-26,r:6},

    {id:"leftA",x:-14,z:-10,r:0},{id:"leftB",x:-16,z:-10,r:4},
    {id:"rightA",x:14,z:-10,r:0},{id:"rightB",x:16,z:-10,r:1},
    {id:"stageA",x:0,z:17,r:2},{id:"stageB",x:0,z:19,r:3},
    {id:"backA",x:14,z:18,r:2},{id:"backB",x:16,z:18,r:3},

    // open corridor connections to projector rooms
    {id:"lpA",x:-24,z:-18,r:4},{id:"lpB",x:-23,z:-23,r:5},
    {id:"rpA",x:24,z:-18,r:1},{id:"rpB",x:23,z:-23,r:6}
  ];
}

function theaterEdges(r){
  const e={
    foyer:["aud"],
    aud:["foyer"],
    stage:[],
    left:["lpA"],
    right:["rpA"],
    lproj:["lpB"],
    rproj:["rpB"],
    leftA:["foyer"],leftB:["left"],
    rightA:["foyer"],rightB:["right"],
    stageA:["aud"],stageB:["stage"],
    backA:["aud"],backB:["stage"],
    lpA:["left","lpB"],lpB:["lpA","lproj"],
    rpA:["right","rpB"],rpB:["rpA","rproj"]
  };

  if(r.doors.south){
    e.foyer.push("leftA");e.leftA.push("leftB");e.leftB.push("left");
    e.left.push("leftB");e.leftB.push("leftA");e.leftA.push("foyer");
  }
  if(r.doors.east){
    e.foyer.push("rightA");e.rightA.push("rightB");e.rightB.push("right");
    e.right.push("rightB");e.rightB.push("rightA");e.rightA.push("foyer");
  }
  if(r.doors.north){
    e.aud.push("stageA");e.stageA.push("stageB");e.stageB.push("stage");
    e.stage.push("stageB");e.stageB.push("stageA");e.stageA.push("aud");
  }
  if(r.doors.lab){
    e.aud.push("backA");e.backA.push("backB");e.backB.push("stage");
    e.stage.push("backB");e.backB.push("backA");e.backA.push("aud");
  }
  return e;
}

function nearestTheaterNode(nodes,x,z,r){
  let best=null,bd=Infinity;
  for(const n of nodes){
    if(n.r!==r)continue;
    const d=(n.x-x)**2+(n.z-z)**2;
    if(d<bd){bd=d;best=n;}
  }
  return best;
}

function theaterPath(r,fx,fz,tx,tz){
  const fr=region(fx,fz),tr=region(tx,tz);
  if(fr===tr)return[{x:tx,z:tz}];

  const nodes=theaterNodes(),edges=theaterEdges(r);
  const byId=Object.fromEntries(nodes.map(n=>[n.id,n]));
  const start=nearestTheaterNode(nodes,fx,fz,fr);
  const goal=nearestTheaterNode(nodes,tx,tz,tr);
  if(!start||!goal)return[{x:tx,z:tz}];

  const q=[start.id],prev={[start.id]:null};
  while(q.length){
    const cur=q.shift();
    if(cur===goal.id)break;
    for(const nxt of(edges[cur]||[])){
      if(!(nxt in prev)){prev[nxt]=cur;q.push(nxt);}
    }
  }
  if(!(goal.id in prev))return[{x:tx,z:tz}];

  const ids=[];let cur=goal.id;
  while(cur){ids.push(cur);cur=prev[cur];}
  ids.reverse();

  const pts=ids.map(id=>({x:byId[id].x,z:byId[id].z}));
  pts.push({x:tx,z:tz});
  return pts;
}

function navTarget(r,z,p){
  const path=theaterPath(r,z.x,z.z,p.x,p.z);
  for(const pt of path){
    if(Math.hypot(pt.x-z.x,pt.z-z.z)>.55)return pt;
  }
  return{x:p.x,z:p.z};
}
function moveZombie(r,z,t,dt){
  const dx=t.x-z.x,dz=t.z-z.z,d=Math.hypot(dx,dz)||1;
  const step=z.speed*dt,nx=z.x+dx/d*step,nz=z.z+dz/d*step;
  if(!collides(r,nx,z.z,.20))z.x=nx;
  if(!collides(r,z.x,nz,.20))z.z=nz;

  z._lx ??= z.x; z._lz ??= z.z; z._stuck ??= 0;
  const moved=Math.hypot(z.x-z._lx,z.z-z._lz);
  if(moved<.012)z._stuck+=dt;else z._stuck=0;
  if(z._stuck>1.25){
    const side=Math.random()>.5?1:-1;
    const px=-dz/d*side*.32,pz=dx/d*side*.32;
    if(!collides(r,z.x+px,z.z,.18))z.x+=px;
    if(!collides(r,z.x,z.z+pz,.18))z.z+=pz;
    z._stuck=0;
  }
  z._lx=z.x;z._lz=z.z;
}

function weaponSlot(p,index){ return p.weapons?.[index] || null; }
function currentSlot(p){ return Math.max(0,Math.min(1,p.activeSlot||0)); }
function activeWeaponId(p){ return weaponSlot(p,currentSlot(p)) || p.weapon || "AR15"; }
function activeWeapon(p){ return WEAPONS[activeWeaponId(p)]||WEAPONS.AR15; }

function syncWeaponFields(p){
  const slot=currentSlot(p);
  p.weapon=activeWeaponId(p);
  p.ammo=p.slotAmmo?.[slot] ?? activeWeapon(p).mag;
  p.reserve=p.slotReserve?.[slot] ?? activeWeapon(p).reserve;
  p.packLevel=p.packLevels?.[slot] ?? 0;
}
function saveActiveAmmo(p){
  const slot=currentSlot(p);
  p.slotAmmo ??= [0,0];
  p.slotReserve ??= [0,0];
  p.slotAmmo[slot]=p.ammo;
  p.slotReserve[slot]=p.reserve;
}
function equipWeapon(p,weaponId){
  if(!WEAPONS[weaponId])return;
  p.weapons ??= ["AR15",null];
  p.slotAmmo ??= [WEAPONS.AR15.mag,0];
  p.slotReserve ??= [WEAPONS.AR15.reserve,0];
  p.packLevels ??= [0,0];

  saveActiveAmmo(p);

  // If player already owns this weapon, switch to that slot and refill it.
  let slot=p.weapons.indexOf(weaponId);
  if(slot!==-1){
    p.activeSlot=slot;
    p.slotAmmo[slot]=WEAPONS[weaponId].mag;
    p.slotReserve[slot]=WEAPONS[weaponId].reserve;
    syncWeaponFields(p);
    return;
  }

  // Empty slot first. If full, replace the currently active gun.
  const empty=p.weapons.findIndex(v=>!v);
  slot=empty!==-1 ? empty : currentSlot(p);

  p.weapons[slot]=weaponId;
  p.slotAmmo[slot]=WEAPONS[weaponId].mag;
  p.slotReserve[slot]=WEAPONS[weaponId].reserve;
  p.packLevels[slot]=0;
  p.activeSlot=slot;
  syncWeaponFields(p);
}
function refillAllWeapons(p){
  p.weapons ??= ["AR15",null];
  p.slotAmmo ??= [0,0];
  p.slotReserve ??= [0,0];
  for(let i=0;i<2;i++){
    const id=p.weapons[i];
    if(!id)continue;
    const w=WEAPONS[id];
    p.slotAmmo[i]=w.mag;
    p.slotReserve[i]=w.reserve;
  }
  syncWeaponFields(p);
}

function pickupDrop(r,p,d,now){
  if(d.type==="maxammo"){
    for(const q of r.players.values())refillAllWeapons(q);
  }else if(d.type==="doublepoints"){
    r.doublePointsUntil=now+30000;
  }else if(d.type==="instakill"){
    r.instaKillUntil=now+30000;
  }else if(d.type==="nuke"){
    for(const z of [...r.zombies.values()])r.zombies.delete(z.id);
    for(const q of r.players.values())q.points+=400;
  }
  r.drops.delete(d.id);
  io.to(r.code).emit("powerup",{type:d.type});
}
function applyPerk(p,type){
  if(type==="jug"){p.perkJug=true;p.maxHp=200;p.hp=200;}
  if(type==="speed")p.perkSpeed=true;
  if(type==="doubletap")p.perkDouble=true;
  if(type==="staminup")p.perkStaminup=true;
}


function resetPlayerForMatch(p){
  const base=WEAPONS.AR15;
  p.x=-8; p.z=0; p.yaw=0;
  p.hp=100; p.maxHp=100;
  p.points=500; p.kills=0;
  p.weapon="AR15"; p.ammo=base.mag; p.reserve=base.reserve; p.weapons=["AR15",null]; p.activeSlot=0; p.slotAmmo=[base.mag,0]; p.slotReserve=[base.reserve,0]; p.packLevels=[0,0]; p.packLevel=0;
  p.down=false; p.lastShot=0; p.lastDamageAt=0; p.reloading=false; p.reloadFinishAt=0;
  p.perkJug=false; p.perkSpeed=false; p.perkDouble=false; p.perkStaminup=false;
}
function resetMatch(r){
  r.zombies.clear();
  r.drops.clear();
  r.nextZombieId=1;
  r.nextDropId=1;
  r.round=1;
  r.queue=0;
  r.nextSpawn=0;
  r.doors={east:false,lab:false,north:false,south:false};
  r.activeZones=new Set([0]);
  r.doublePointsUntil=0;
  r.instaKillUntil=0;
  r.lastPowerDropAt=0;
  r.killsSinceDrop=0;
  r.phase="intermission";
  r.nextRoundAt=Date.now()+5000;
  r.gameOverAt=0;
  r.gameOverSince=0;
  for(const p of r.players.values()) resetPlayerForMatch(p);
  io.to(r.code).emit("matchReset",{round:1});
  io.to(r.code).emit("state",publicState(r));
}
function returnRoomToLobby(r){
  r.zombies.clear();
  r.drops.clear();
  r.nextZombieId=1;
  r.nextDropId=1;
  r.round=1;
  r.queue=0;
  r.nextSpawn=0;
  r.doors={east:false,lab:false,north:false,south:false};
  r.activeZones=new Set([0]);
  r.doublePointsUntil=0;
  r.instaKillUntil=0;
  r.lastPowerDropAt=0;
  r.killsSinceDrop=0;
  r.phase="lobby";
  r.nextRoundAt=0;
  r.gameOverAt=0;
  r.gameOverSince=0;
  for(const p of r.players.values()) resetPlayerForMatch(p);
  io.to(r.code).emit("returnedToLobby",{room:r.code});
  io.to(r.code).emit("state",publicState(r));
}

io.on("connection",socket=>{
  socket.on("joinRoom",({room,name})=>{
    let code=(room||"").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,8);
    if(!code)code=makeCode();
    const r=getRoom(code);
    if(r.players.size>=4)return socket.emit("joinError","Room is full (4 max).");
    const base=WEAPONS.AR15;
    const p={
      id:socket.id,name:(name||"Survivor").slice(0,18),
      x:-8,z:0,yaw:0,hp:100,maxHp:100,points:500,kills:0,
      weapon:"AR15",ammo:base.mag,reserve:base.reserve,weapons:["AR15",null],activeSlot:0,slotAmmo:[base.mag,0],slotReserve:[base.reserve,0],packLevels:[0,0],packLevel:0,
      down:false,lastShot:0,lastDamageAt:0,reloading:false,reloadFinishAt:0,
      perkJug:false,perkSpeed:false,perkDouble:false,perkStaminup:false
    };
    r.players.set(socket.id,p);socket.data.room=code;socket.join(code);
    if(!r.hostId) r.hostId=socket.id;
    socket.emit("joined",{room:code,id:socket.id,spawn:{x:p.x,z:p.z}});
    io.to(code).emit("state",publicState(r));
  });

  socket.on("move",d=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id);
    if(!r||!p||p.down)return;
    const tx=Number(d.x),tz=Number(d.z);
    if(!Number.isFinite(tx)||!Number.isFinite(tz))return;
    if(Math.hypot(tx-p.x,tz-p.z)>1.5)return;
    const nx=Math.max(-20.2,Math.min(20.2,tx)),nz=Math.max(-20.2,Math.min(20.2,tz));
    if(!collides(r,nx,p.z,.35))p.x=nx;
    if(!collides(r,p.x,nz,.35))p.z=nz;
    p.yaw=Number(d.yaw)||0;
  });

  socket.on("shoot",({targetId,headshot=false})=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id);
    if(!r||!p||p.down||r.phase!=="round")return;
    const now=Date.now(),weaponId=activeWeaponId(p),w=activeWeapon(p);
    const rate=w.fireRate;
    if(now-p.lastShot<rate||p.ammo<=0||p.reloading)return;
    p.lastShot=now;p.ammo--;saveActiveAmmo(p);

    const z=r.zombies.get(Number(targetId));
    if(!z||Math.hypot(z.x-p.x,z.z-p.z)>=36)return;

    let damage=w.damage;
    if(p.perkDouble)damage*=1.5;
    const pack=p.packLevels?.[currentSlot(p)]||0;
    damage*=([1,2,4,8][pack]||1);
    if(headshot)damage*=w.headMult;
    if(now<r.instaKillUntil)damage=999999;

    // shotgun pellet simplification handled client-side as one shot with stronger body/head hit
    if(p.weapon==="SHOTGUN") damage*=2.15;

    z.hp-=damage;
    const mult=now<r.doublePointsUntil?2:1;
    p.points+=(headshot?15:10)*mult;

    if(z.hp<=0){
      const zx=z.x,zz=z.z;
      r.zombies.delete(z.id);
      p.points+=(headshot?130:100)*mult;
      p.kills++;
      maybeDrop(r,zx,zz);
    }
    io.to(r.code).emit("playerShot",{playerId:p.id,weapon:weaponId,yaw:p.yaw,x:p.x,z:p.z,targetId:Number(targetId)||null,headshot:!!headshot});
  });


  socket.on("swapWeapon",()=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id);
    if(!r||!p||p.down||p.reloading)return;

    p.weapons ??= ["AR15",null];
    if(!p.weapons[0] || !p.weapons[1]) return;

    saveActiveAmmo(p);
    p.activeSlot = currentSlot(p)===0 ? 1 : 0;
    syncWeaponFields(p);

    io.to(r.code).emit("weaponChanged",{
      playerId:p.id,
      slot:p.activeSlot,
      weapon:p.weapon,
      ammo:p.ammo,
      reserve:p.reserve,
      packLevel:p.packLevel
    });
    io.to(r.code).emit("state",publicState(r));
  });

  socket.on("reload",()=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id);
    if(!p||p.down||p.reloading)return;
    const w=activeWeapon(p);
    if(p.ammo>=w.mag||p.reserve<=0)return;
    const baseReload = p.weapon==="SHOTGUN" ? 1800 : (p.weapon==="LMG" ? 2400 : 1500);
    const delay = p.perkSpeed ? Math.floor(baseReload*0.5) : baseReload;
    p.reloading=true;
    p.reloadFinishAt=Date.now()+delay;
    socket.emit("reloadStarted",{finishAt:p.reloadFinishAt,weapon:p.weapon});
  });

  socket.on("buy",({type})=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id);
    if(!r||!p||p.down)return;

    if(type==="eastDoor"&&!r.doors.east&&p.points>=1000){
      p.points-=1000;r.doors.east=true;r.activeZones.add(1);r.activeZones.add(6);
    }else if(type==="southDoor"&&!r.doors.south&&p.points>=1000){
      p.points-=1000;r.doors.south=true;r.activeZones.add(4);r.activeZones.add(5);
    }else if(type==="northDoor"&&!r.doors.north&&p.points>=1250){
      p.points-=1250;r.doors.north=true;r.activeZones.add(2);r.activeZones.add(3);
    }else if(type==="labDoor"&&!r.doors.lab&&p.points>=1500){
      p.points-=1500;r.doors.lab=true;r.activeZones.add(3);
    }else if(type==="ammo"&&p.points>=500){
      p.points-=500;
      const w=activeWeapon(p);
      p.reserve=Math.min(w.reserve*2,p.reserve+w.reserve);
    }else if(type==="mysterybox"&&p.points>=950){
      p.points-=950;
      let pick=BOX_POOL[Math.floor(Math.random()*BOX_POOL.length)];
      if(Math.random()<0.09)pick="VOLT";
      equipWeapon(p,pick);
      socket.emit("boxResult",{weapon:pick,name:WEAPONS[pick].name,slot:p.activeSlot});
    }else if(WALL_BUYS[type]&&p.points>=WALL_BUYS[type].cost){
      const wb=WALL_BUYS[type];
      p.points-=wb.cost;
      equipWeapon(p,wb.weapon);
      socket.emit("weaponBought",{weapon:wb.weapon,name:WEAPONS[wb.weapon].name,slot:p.activeSlot});
    }else if(type==="pack"){
      p.packLevels ??= [0,0];
      const slot=currentSlot(p);
      const level=p.packLevels[slot]||0;
      const next=level+1;
      const cost=PACK_COSTS[next];

      if(level>=3){
        socket.emit("packResult",{level:3,maxed:true,weapon:activeWeaponId(p),name:activeWeapon(p).name});
      }else if(cost && p.points>=cost){
        p.points-=cost;
        p.packLevels[slot]=next;
        p.packLevel=next;

        const w=activeWeapon(p);
        const magBonus=next*5;
        const reserveBonus=next*60;
        p.ammo=w.mag+magBonus;
        p.reserve=w.reserve+reserveBonus;
        p.slotAmmo[slot]=p.ammo;
        p.slotReserve[slot]=p.reserve;

        socket.emit("packResult",{
          level:next,
          maxed:next>=3,
          weapon:activeWeaponId(p),
          name:w.name,
          nextLevel:next<3?next+1:null,
          nextCost:next<3?PACK_COSTS[next+1]:null
        });
      }else{
        socket.emit("packDenied",{needed:cost||0,level:level});
      }
    }else if(PERKS[type]){
      const owned=(type==="jug"&&p.perkJug)||(type==="speed"&&p.perkSpeed)||(type==="doubletap"&&p.perkDouble)||(type==="staminup"&&p.perkStaminup);
      if(!owned&&p.points>=PERKS[type].cost){
        p.points-=PERKS[type].cost;
        applyPerk(p,type);
        io.to(r.code).emit("perkBought",{playerId:p.id,type});
      }
    }
    io.to(r.code).emit("state",publicState(r));
  });


  socket.on("restartMatch",()=>{
    const r=rooms.get(socket.data.room);
    if(!r||socket.id!==r.hostId||r.phase!=="gameover")return;
    resetMatch(r);
  });

  socket.on("returnToLobby",()=>{
    const r=rooms.get(socket.data.room);
    if(!r||socket.id!==r.hostId||r.phase!=="gameover")return;
    returnRoomToLobby(r);
  });

  socket.on("startMatch",()=>{
    const r=rooms.get(socket.data.room);
    if(!r||socket.id!==r.hostId||r.phase!=="lobby")return;
    resetMatch(r);
    io.to(r.code).emit("matchStarting",{startsAt:r.nextRoundAt});
  });

  socket.on("revive",({playerId})=>{
    const r=rooms.get(socket.data.room),p=r?.players.get(socket.id),q=r?.players.get(playerId);
    if(p&&q&&q.down&&Math.hypot(p.x-q.x,p.z-q.z)<2.2){
      q.down=false;q.hp=Math.floor(q.maxHp*.5);
    }
  });

  socket.on("disconnect",()=>{
    const r=rooms.get(socket.data.room);
    if(!r)return;
    r.players.delete(socket.id);
    if(!r.players.size){rooms.delete(r.code);return;}
    if(r.hostId===socket.id){
      r.hostId=[...r.players.keys()][0];
      io.to(r.code).emit("hostChanged",{hostId:r.hostId});
    }
  });
});

setInterval(()=>{
  const now=Date.now(),dt=.05;
  for(const r of rooms.values()){
    if(r.phase==="gameover"){
      io.to(r.code).emit("state",publicState(r));
      continue;
    }

    if(r.phase==="lobby"){
      io.to(r.code).emit("state",publicState(r));
      continue;
    }

    // Team wipe detection: all connected players are down.
    const connected=[...r.players.values()];
    const allDown=connected.length>0 && connected.every(p=>p.down);
    if(allDown){
      if(!r.gameOverSince) r.gameOverSince=now;
      if(now-r.gameOverSince>=2500){
        r.phase="gameover";
        r.gameOverAt=now;
        r.queue=0;
        r.nextSpawn=0;
        r.nextRoundAt=0;
        io.to(r.code).emit("gameOver",{
          round:r.round,
          players:connected.map(p=>({id:p.id,name:p.name,kills:p.kills,points:p.points}))
        });
        io.to(r.code).emit("state",publicState(r));
        continue;
      }
    }else{
      r.gameOverSince=0;
    }

    if(r.phase==="intermission"&&r.nextRoundAt&&now>=r.nextRoundAt){
      startRound(r,now);
      io.to(r.code).emit("roundStart",{round:r.round});
    }

    if(r.phase==="round"&&r.queue>0&&now>=r.nextSpawn){
      spawnZombie(r);r.queue--;r.nextSpawn=now+Math.max(325,900-r.round*28);
    }

    if(r.phase==="round"){
      for(const z of r.zombies.values()){
        const p=nearestLiving(r,z);if(!p)continue;
        const d=Math.hypot(p.x-z.x,p.z-z.z);
        if(d>1.05)moveZombie(r,z,navTarget(r,z,p),dt);
        else if(now-z.lastAttack>800){
          z.lastAttack=now;p.hp-=z.damage;p.lastDamageAt=now;
          if(p.hp<=0){p.hp=0;p.down=true;}
        }
      }
      if(r.queue===0&&r.zombies.size===0){
        r.phase="intermission";r.nextRoundAt=now+9000;
        io.to(r.code).emit("roundComplete",{round:r.round});
        r.round++;
      }
    }


    // Timed reload completion + health regeneration.
    for(const p of r.players.values()){
      if(p.reloading && now>=p.reloadFinishAt){
        const w=activeWeapon(p);
        const take=Math.min(w.mag-p.ammo,p.reserve);
        p.ammo+=take;
        p.reserve-=take;
        saveActiveAmmo(p);
        p.reloading=false;
        p.reloadFinishAt=0;
        io.to(p.id).emit("reloadComplete");
      }

      // Classic-style regen: starts after 5 seconds without damage.
      if(!p.down && p.hp>0 && p.hp<p.maxHp && now-(p.lastDamageAt||0)>=5000){
        const regenPerSecond = p.perkJug ? 24 : 20;
        p.hp=Math.min(p.maxHp,p.hp+regenPerSecond*0.05);
      }
    }

    for(const d of [...r.drops.values()]){
      if(now>=d.expiresAt){r.drops.delete(d.id);continue;}
      for(const p of r.players.values()){
        if(!p.down&&Math.hypot(p.x-d.x,p.z-d.z)<1.25){pickupDrop(r,p,d,now);break;}
      }
    }

    io.to(r.code).emit("state",publicState(r));
  }
},50);

server.listen(PORT,"0.0.0.0",()=>{
  console.log(`Dead Sector V4: http://localhost:${PORT}`);
  console.log(`LAN friends: http://${lanIp()}:${PORT}`);
});
