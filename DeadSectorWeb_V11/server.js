
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
  {x:-21,z:0,w:1,d:42},{x:21,z:0,w:1,d:42},{x:0,z:-21,w:42,d:1},{x:0,z:21,w:42,d:1},
  {x:0,z:-11,w:1,d:18},{x:0,z:11,w:1,d:18},
  {x:4,z:8,w:8,d:1},{x:16,z:8,w:8,d:1}
];
const EAST_DOOR={x:0,z:0,w:1,d:4};
const LAB_DOOR={x:10,z:8,w:4,d:1};

const SPAWNS={
  0:[[-16,-15],[-15,14],[-5,-16]],
  1:[[6,-15],[16,-14],[16,4],[5,5]],
  2:[[5,15],[16,15],[16,11],[5,11]]
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
    doors:{east:false,lab:false},activeZones:new Set([0]),
    phase:"lobby",nextRoundAt:0,
    doublePointsUntil:0,instaKillUntil:0,
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
  if(Math.random()>.07)return;
  const pool=["maxammo","doublepoints","instakill","nuke"];
  const type=pool[Math.floor(Math.random()*pool.length)];
  const id=r.nextDropId++;
  r.drops.set(id,{id,type,x,z,expiresAt:Date.now()+20000});
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
function region(x,z){if(x<0)return 0;if(z<8)return 1;return 2;}
function navTarget(r,z,p){
  const zr=region(z.x,z.z),pr=region(p.x,p.z);
  if(zr===pr)return{x:p.x,z:p.z};
  if(zr===0)return{x:-.25,z:0};
  if(pr===0)return{x:.25,z:0};
  if(zr===1&&pr===2)return{x:10,z:7.75};
  if(zr===2&&pr===1)return{x:10,z:8.25};
  return{x:p.x,z:p.z};
}
function moveZombie(r,z,t,dt){
  const dx=t.x-z.x,dz=t.z-z.z,d=Math.hypot(dx,dz)||1;
  const step=z.speed*dt,nx=z.x+dx/d*step,nz=z.z+dz/d*step;
  if(!collides(r,nx,z.z,.28))z.x=nx;
  if(!collides(r,z.x,nz,.28))z.z=nz;
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
  saveActiveAmmo(p);
  p.weapons ??= ["AR15",null];
  p.slotAmmo ??= [WEAPONS.AR15.mag,0];
  p.slotReserve ??= [WEAPONS.AR15.reserve,0];
  p.packLevels ??= [0,0];

  let slot=p.weapons.indexOf(weaponId);
  if(slot===-1){
    const empty=p.weapons.findIndex(v=>!v);
    slot=empty!==-1?empty:currentSlot(p);
    p.weapons[slot]=weaponId;
    p.slotAmmo[slot]=WEAPONS[weaponId].mag;
    p.slotReserve[slot]=WEAPONS[weaponId].reserve;
    p.packLevels[slot]=0;
  }
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
  r.doors={east:false,lab:false};
  r.activeZones=new Set([0]);
  r.doublePointsUntil=0;
  r.instaKillUntil=0;
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
  r.doors={east:false,lab:false};
  r.activeZones=new Set([0]);
  r.doublePointsUntil=0;
  r.instaKillUntil=0;
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
    if(!p||p.down||p.reloading||!p.weapons?.[1])return;
    saveActiveAmmo(p);
    p.activeSlot=currentSlot(p)===0?1:0;
    syncWeaponFields(p);
    socket.emit("weaponSwapped",{slot:p.activeSlot,weapon:p.weapon});
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
      p.points-=1000;r.doors.east=true;r.activeZones.add(1);
    }else if(type==="labDoor"&&!r.doors.lab&&p.points>=1500){
      p.points-=1500;r.doors.lab=true;r.activeZones.add(2);
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
      const slot=currentSlot(p);
      const level=p.packLevels?.[slot]||0;
      const next=level+1;
      const cost=PACK_COSTS[next];
      if(next<=3&&cost&&p.points>=cost){
        p.points-=cost;
        p.packLevels[slot]=next;
        p.packLevel=next;
        const w=activeWeapon(p);
        p.ammo=w.mag+next*5;
        p.reserve=w.reserve+next*60;
        p.slotAmmo[slot]=p.ammo;
        p.slotReserve[slot]=p.reserve;
        socket.emit("packResult",{level:next,weapon:activeWeaponId(p),name:w.name});
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
