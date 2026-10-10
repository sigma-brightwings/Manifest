require('./rng.js');require('./vec3.js');require('./kepler.js');require('./arcs.js');
require('./economy.js');require('./generate.js');require('./slipspace.js');require('./galaxy.js');
require('./missions.js');require('./sim.js');require('./combat.js');
const Gen=globalThis.Gen,Gx=globalThis.Galaxy,C=globalThis.Combat;
let fail=0; const ok=(c,m)=>{console.log((c?'  ok   ':'  FAIL ')+m); if(!c)fail++;};
const g=Gx.build('kawartha');

console.log('THE GREY BRANCH IS REACHABLE');
const greys=Object.keys(C.EQUIPMENT).filter(k=>C.EQUIPMENT[k].grey);
ok(greys.length>0, greys.length+' catalogue items set grey: '+greys.join(' '));

let portsWith=0,portsTot=0,anarchyWith=0,anarchyTot=0,heldWith=0;
for(const st of g.stars){let s;try{s=Gen.generateSystem(st.seed,{faction:g.factionById[st.factionId],allFactions:g.factions});}catch(e){continue;}
 const G={sys:s,standing:{},wanted:{},ship:{credits:0,cargo:{}}};
 for(const p of s.ports){portsTot++;
  const list=C.stockAt(G,p);
  const hasGrey=list.some(r=>r.item.grey);
  if(hasGrey){portsWith++; if(s.pirateHeld)heldWith++;}
  if(s.government.id==='anarchy'){anarchyTot++; if(hasGrey)anarchyWith++;}}}
ok(portsWith>0, portsWith+' of '+portsTot+' ports stock grey goods ('+(portsWith/portsTot*100).toFixed(0)+'%)');
ok(anarchyWith===0, 'none of the '+anarchyTot+' anarchy ports do — no institution, no shopfront');
ok(heldWith>0, heldWith+' of them are in Syndicate holds');

console.log('\nGREY GOODS ARE SOLD TO ANYONE');
{const s=(()=>{for(const st of g.stars){const x=Gen.generateSystem(st.seed,{faction:g.factionById[st.factionId],allFactions:g.factions});if(x.corruption>=60&&x.ports.length)return x;}})();
 const port=s.ports.find(p=>C.stockAt({sys:s,standing:{},wanted:{},ship:{}},p).some(r=>r.item.grey));
 const clean=C.stockAt({sys:s,standing:{},wanted:{},ship:{}},port);
 const hot={sys:s,standing:{},wanted:{},ship:{}}; hot.wanted[port.faction]=99999;
 const wanted=C.stockAt(hot,port);
 const gAvail=r=>r.item.grey&&r.available;
 ok(clean.filter(gAvail).length>0,'grey guns available to a clean pilot');
 ok(wanted.filter(gAvail).length===clean.filter(gAvail).length,
    'and still available to a wanted one — this is where a fugitive rearms');
 const certArmed=r=>!r.item.grey&&(r.item.kind==='gun'||r.item.kind==='turret');
 ok(wanted.filter(r=>certArmed(r)&&r.available).length===0,
    'while every certified gun at the same counter refuses them');}

console.log('\nTRADEOFFS, NOT WORSE NUMBERS');
{const gp=C.EQUIPMENT.greyphint, cp=C.EQUIPMENT.phint;
 ok(gp.dmg===cp.dmg,'bootleg intermittent keeps full damage ('+gp.dmg+')');
 ok(gp.heat>cp.heat,'but runs at '+(gp.heat/cp.heat).toFixed(1)+'x the heat');
 ok(gp.price<cp.price,'at '+(gp.price/cp.price*100).toFixed(0)+'% of list');
 ok(gp.misfire>0,'and fails to cycle '+(gp.misfire*100)+'% of the time');
 const sp=C.EQUIPMENT.greypipulse, cpp=C.EQUIPMENT.pipulse;
 ok(sp.dmg===cpp.dmg,'salvaged pion keeps full damage ('+sp.dmg+')');
 ok(sp.heat>cpp.heat && sp.price<cpp.price,'hotter and cheaper too');}

console.log('\nTHE COOK-OFF RESPONDS TO FLYING');
{const cold=C.hangChanceFor(10), warm=C.hangChanceFor(50), hot=C.hangChanceFor(85);
 ok(cold<warm && warm<hot,'hang chance rises with hull heat: '+[cold,warm,hot].map(x=>(x*100).toFixed(0)+'%').join(' / '));
 ok(C.batchFactor({missileBatch:0.02})<C.batchFactor({missileBatch:0.98}),
    'and a bad crate is '+(C.batchFactor({missileBatch:0.98})/C.batchFactor({missileBatch:0.02})).toFixed(1)+'x a clean one');
 ok(C.batchFactor({})===1,'a certified rack has no batch factor at all');
 const G={ship:{missiles:9,hullHp:100},hungSeeker:{until:0,rack:9}};
 ok(C.jettisonRack(G,null)===true && G.ship.missiles===0 && G.ship.hullHp===100,
    'jettison dumps the rack and leaves the hull alone');
 ok(G.hungSeeker===null,'and clears the rail');}

console.log('\nONE TYPE PER RACK');
{const ship={hullId:'talon'}; C.initShip(ship); ship.credits=99999;
 const G={ship:ship,standing:{},t:0};
 ok(C.buyOutfit(G,'missile','bootleg')>0,'first bootleg round buys');
 ok(ship.missileId==='bootleg','rack records the type');
 ok(ship.missileBatch!==null && ship.missileBatch!==undefined,'and a batch quality');
 ok(C.buyOutfit(G,'missile','hawk')===null,'a Hawk into the same rack is refused');
 const b=ship.missileBatch;
 C.buyOutfit(G,'missile','bootleg');
 ok(ship.missileBatch===b,'topping up the same crate does not re-roll it');}

console.log('\n'+(fail?'*** '+fail+' FAILURES':'all checks pass'));
process.exit(fail?1:0);
