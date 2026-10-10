require('./rng.js');require('./vec3.js');require('./kepler.js');require('./arcs.js');
require('./economy.js');require('./generate.js');require('./slipspace.js');require('./galaxy.js');
require('./missions.js');require('./sim.js');require('./combat.js');
const Gen=globalThis.Gen,Eco=globalThis.Economy,Gx=globalThis.Galaxy,S=globalThis.Slipspace,C=globalThis.Combat;
let fail=0; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail++;};

console.log('DETERMINISM');
const a=Gx.build('kawartha'), b=Gx.build('kawartha');
ok(JSON.stringify(a.stars.map(s=>s.factionId))===JSON.stringify(b.stars.map(s=>s.factionId)),'same seed, same territory');
const s1=Gen.generateSystem(a.stars[3].seed,{faction:a.factionById[a.stars[3].factionId],allFactions:a.factions});
const s2=Gen.generateSystem(a.stars[3].seed,{faction:a.factionById[a.stars[3].factionId],allFactions:a.factions});
ok(s1.crimeScore===s2.crimeScore&&s1.corruption===s2.corruption,'same seed, same corruption/permissivity');

console.log('\nNO Math.random IN GENERATION');
const fs=require('fs');
for(const f of ['galaxy.js','generate.js','economy.js','slipspace.js'])
  ok(!/Math\.random/.test(fs.readFileSync(f,'utf8')),f+' has no Math.random');

console.log('\nTERRITORY across 6 seeds');
for(const seed of ['kawartha','alpha','beta','gamma','delta','epsilon']){
  const g=Gx.build(seed); const own={};
  g.stars.forEach(s=>own[s.factionId]=(own[s.factionId]||0)+1);
  const maj=g.factions.filter(f=>!f.outlaw&&!f.minor), pir=(own.outlaw||0)/g.stars.length;
  const shares=maj.map(f=>(own[f.id]||0)/g.stars.length);
  const spread=Math.max(...shares)/Math.min(...shares);
  ok(pir>0.14&&pir<0.22, seed.padEnd(9)+' pirates '+(pir*100).toFixed(0)+'%  majors '+shares.map(x=>(x*100).toFixed(0)+'%').join('/')+'  spread '+spread.toFixed(2)+'x');
  const capIds=maj.map(f=>f.capitalId);
  ok(capIds.every(cid=>{const st=g.byId[cid];return maj.some(f=>f.capitalId===cid&&st.factionId===f.id);}),'  capitals held by their own faction');
}

console.log('\nNAVY FOOTHOLD');
{const g=Gx.build('kawartha'); let heldGar=0,heldPass=0,freeGar=0,held=0;
 for(const st of g.stars){let s;try{s=Gen.generateSystem(st.seed,{faction:g.factionById[st.factionId],allFactions:g.factions});}catch(e){continue;}
  const gar=(s.patrols||[]).some(p=>p.kind==='navy'&&!p.passing);
  const pas=(s.patrols||[]).some(p=>p.passing);
  if(s.pirateHeld){held++; if(gar)heldGar++; if(pas)heldPass++;} else if(gar)freeGar++;}
 ok(heldGar===0,'no naval garrison in any of '+held+' holds');
 ok(heldPass>0,heldPass+' holds have a cutter in transit');
 ok(freeGar>0,freeGar+' free systems have a garrison');}

console.log('\nMILITARY FUEL');
{const g=Gx.build('kawartha'); let prod=0,sysNoNavy=0;
 for(const st of g.stars){let s;try{s=Gen.generateSystem(st.seed,{faction:g.factionById[st.factionId],allFactions:g.factions});}catch(e){continue;}
  const has=s.ports.some(p=>p.market.rows.milfuel&&p.market.rows.milfuel.prod>0);
  if(has){prod++; if(!Eco.navyPresent(s))sysNoNavy++;}}
 ok(prod>0&&prod<40, prod+' systems breed milfuel (of 150)');
 ok(sysNoNavy===0,'none of them without a naval garrison');}

console.log('\nTHE DRIVE');
{const cold={dryMass:42,fuel:28,thrusterFuel:12,cargo:{},fit:[]};
 const hot ={dryMass:42,fuel:28,thrusterFuel:12,cargo:{milfuel:20},modules:{mildrive:'I'}};
 ok(!S.milRunning(cold),'unfitted ship is not running hot');
 ok(S.milRunning(hot),'fitted ship runs hot by default');
 hot.milArmed=false; ok(!S.milRunning(hot),'and can be shut down');
 hot.milArmed=true;
 const m=S.allUpMass(hot);
 ok(Math.abs(S.hoursPerLyFor(m,hot)-S.hoursPerLy(m)/2)<1e-9,'halves hours per light year');
 ok(Math.abs(S.hoursPerLyFor(m,cold)-S.hoursPerLy(m))<1e-9,'leaves a cold ship alone');
 const g=Gx.build('kawartha');
 const from=g.stars[0], to=g.stars.map(s=>s).sort((x,y)=>Gx.distance3(from,x)-Gx.distance3(from,y))[1];
 const ph=Gx.jumpPlan(g,from,to,hot);
 hot.milArmed=false; const pw=Gx.jumpPlan(g,from,to,hot); hot.milArmed=true;
 const pc=Gx.jumpPlan(g,from,to,cold);
 ok(Math.abs(ph.seconds-pw.seconds/2)<1e-6,'hot jump is half the time (same hull, drive off vs on)');
 ok(ph.fuel===0&&ph.slugs>0,'hot jump spends slugs, not hydrogen');
 ok(ph.waste>0,'and breeds '+ph.waste.toFixed(2)+' t of waste');
 ok(pc.slugs===0&&pc.waste===0,'cold jump does neither');}

console.log('\nTHE WASTE BAN');
{const g=Gx.build('kawartha');
 const held=g.stars.find(s=>s.factionId==='outlaw'), free=g.stars.find(s=>s.factionId!=='outlaw');
 ok(Gx.wasteBanned(g,held),'banned in a hold');
 ok(!Gx.wasteBanned(g,free),'not banned outside one');
 const mk=()=>({galaxy:g,t:0,ship:{credits:50000,cargo:{waste:4}},standing:{},wanted:{}});
 let G=mk(); let r=C.wasteCustoms(G,held,null,null);
 ok(r&&r.fine===10000,'arriving dirty in a hold: 10,000 cr');
 ok(G.ship.credits===40000,'taken off credits');
 ok(!!C.expelledHere(G,held),'and an order to leave');
 G.ship.cargo.waste=0; ok(!C.expelledHere(G,held),'lifted the moment the hold is clean');
 G=mk(); ok(!C.wasteCustoms(G,free,null,null),'clean system charges nothing');
 G=mk(); G.ship.cargo.waste=0; ok(!C.wasteCustoms(G,held,null,null),'arriving cold in a hold charges nothing');}

console.log('\n'+(fail?'*** '+fail+' FAILURES':'all checks pass'));
process.exit(fail?1:0);
