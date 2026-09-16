require('./rng.js');require('./vec3.js');require('./kepler.js');require('./arcs.js');
require('./economy.js');require('./generate.js');require('./slipspace.js');require('./galaxy.js');
require('./missions.js');require('./sim.js');require('./combat.js');
const Gen=globalThis.Gen,C=globalThis.Combat,Sim=globalThis.Sim,V=globalThis.V;
let fail=0; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail++;};
const sys=Gen.generateSystem('heat-test');
const far={x:9e9,y:0,z:0};                     // deep space: no atmosphere, no flux
const mkPirate=(id)=>({id:id,name:'PIR '+id,kind:'pirate',cls:'pirate',
  hullHp:120,hullMax:120,live:{pos:{x:9e9,y:0,z:0},vel:{x:0,y:0,z:0}}});

console.log('HEAT IS LAZY, LIKE THE SHIELD');
{const p=mkPirate('a');
 ok(p.heatShed===undefined,'a ship nobody has heated carries no heat field');
 const G={ship:{},t:0}; sys.patrols=[p];
 C.updateNpcHeat(sys,G,0,0.1,null);
 ok(p.heatShed===undefined,'and the tick skips it — one undefined test, no arithmetic');
 C.npcHeat(p);
 ok(p.heatShed===C.NPC_SHED.pirate && p.heat===0,'first heat initialises it at shed '+p.heatShed);}

console.log('\nNPCs HEAT THEMSELVES FIRING, AND SHED IT');
{const p=mkPirate('b'); C.addNpcHeat(p,40,null);
 const G={ship:{},t:0}; sys.patrols=[p];
 const before=p.heat;
 for(let i=0;i<10;i++) C.updateNpcHeat(sys,G,i*0.1,0.1,null);
 ok(p.heat<before,'heat falls in vacuum: '+before.toFixed(0)+' -> '+p.heat.toFixed(0)+' over 1 s');
 ok(Math.abs((before-p.heat)-(18+C.NPC_SHED.pirate))<0.5,'at bare 18/s plus the hull bonus ('+C.NPC_SHED.pirate+'/s for a pirate)');
 ok(p.heatBy===undefined,'self-inflicted heat is not attributed to anyone');}

console.log('\nSHOOTING SOMETHING HEATS IT — AND THE DELIVERY DECIDES HOW MUCH');
{const G={ship:{credits:0,pos:far,cargo:{}},standing:{},wanted:{},t:0};
 const heatFrom=(gunId)=>{const p=mkPirate('c'+gunId); const gun=C.EQUIPMENT[gunId];
   C.npcShield(p); p.shieldHp=0;      // heat is a HULL effect; see below
   C.damageNpc(sys,G,p,20,0,null,gun,far); return p.heat;};
 const pulse=heatFrom('phpulse'), inter=heatFrom('phint'), beam=heatFrom('phbeam');
 ok(beam>inter && inter>pulse,'beam '+beam.toFixed(1)+' > burst '+inter.toFixed(1)+' > pulse '+pulse.toFixed(1)+' for the same 20 points');
 const p=mkPirate('d'); C.npcShield(p); p.shieldHp=0;
 C.damageNpc(sys,G,p,20,0,null,C.EQUIPMENT.phbeam,far);
 const sh=mkPirate('e'); C.damageNpc(sys,G,sh,10,0,null,C.EQUIPMENT.phpulse,far);
 ok(!(sh.heat>0),'a shot the shield ate deposits no heat at all — you cannot cook a ship through its bucket');
 ok(p.heatBy==='player','and it is attributed to the player');}

console.log('\nHOW LONG SUSTAINED FIRE TAKES TO REACH THE COOK-OFF BAND (78)');
for(const id of ['phbeam','pibeam','mubeam','phint','pipulse']){
 const gun=C.EQUIPMENT[id];
 const G={ship:{pos:far,cargo:{}},standing:{},wanted:{},t:0};
 const p=mkPirate('t'+id); C.npcShield(p); p.shieldHp=0; C.npcHeat(p); sys.patrols=[p];
 let t=0,shots=0; const step=0.05;
 while(t<40 && p.heat<78 && !p.dead){
   if(t>=shots*gun.cooldown){ C.damageNpc(sys,G,p,gun.dmg,t,null,gun,far); shots++; }
   C.updateNpcHeat(sys,G,t,step,null); t+=step;
   if(p.hullHp<=0) break;
 }
 const reached=p.heat>=78;
 console.log('   '+gun.name.padEnd(32)+(reached?(t.toFixed(1)+' s').padStart(7):'  never')+
   '   (hull '+Math.max(0,p.hullHp).toFixed(0)+'/120 left)');
}

console.log('\nA PIRATE RACK IS SEEDED, THE IGNITION IS NOT');
{const a=C.pirateRack(sys,mkPirate('x')), b=C.pirateRack(sys,mkPirate('x'));
 ok(JSON.stringify(a)===JSON.stringify(b),'same pirate, same system, same rack every time');
 let carry=0; for(let i=0;i<200;i++) if(C.pirateRack(sys,mkPirate('p'+i))) carry++;
 ok(carry>60 && carry<140, carry+' of 200 pirates carry a cheap crate');
 ok(C.pirateRack(sys,{id:'n1',kind:'navy',cls:'navy'})===null,'a navy cutter carries none');
 ok(C.pirateRack(sys,{id:'l1',kind:'trader',cls:'liner'})===null,'nor does a liner');}

console.log('\nA HOT PIRATE COOKS ITS OWN RACK OFF');
{let ignited=0,trials=0;
 for(let i=0;i<400;i++){
  const p=mkPirate('h'+i); if(!C.pirateRack(sys,p)) continue; trials++;
  C.addNpcHeat(p,200,'player'); p.hullHp=120;
  const G={ship:{},t:0}; sys.patrols=[p];
  for(let k=0;k<40 && p.rack;k++) C.updateNpcHeat(sys,G,k*0.25,0.25,null);
  if(!p.rack) ignited++;
 }
 ok(ignited>0, ignited+' of '+trials+' carrying pirates held at 200 heat cooked off within 10 s');
 ok(ignited<trials, 'and '+(trials-ignited)+' rode it out — a clean crate is a real thing to be carrying');}

console.log('\nWHO GETS THE KILL');
{const p=mkPirate('k1'); C.addNpcHeat(p,400,null); p.hullHp=0.5;
 const G={ship:{},wanted:{},t:0}; sys.patrols=[p];
 C.updateNpcHeat(sys,G,0,1.0,null);
 ok(p.dead,'a ship that cooks itself dies');
 ok(!Object.keys(G.wanted||{}).length,'and nobody is charged for it');
 const q=mkPirate('k2'); C.addNpcHeat(q,400,'player'); q.hullHp=0.5;
 const G2={ship:{},wanted:{},standing:{},t:0}; sys.patrols=[q];
 C.updateNpcHeat(sys,G2,0,1.0,null);
 ok(q.dead,'a ship the player cooked also dies');}

console.log('\n'+(fail?'*** '+fail+' FAILURES':'all checks pass'));
process.exit(fail?1:0);
