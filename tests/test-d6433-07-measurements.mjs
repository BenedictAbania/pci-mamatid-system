import assert from 'node:assert/strict';
import { moduleUrl } from './helpers/typescript-test-loader.mjs';
const { ASPHALT_CATALOG } = await import(await moduleUrl('src/lib/d6433-07/catalog.ts'));
const { blankPart, measureParts, smallPotholeSeverity, severityEvidence } = await import(await moduleUrl('src/lib/d6433-07/measurement-parts.ts'));
let checks = 0;
function eq(a,b) { assert.deepEqual(a,b); checks++; }
function fails(fn,pattern) { assert.throws(fn,pattern); checks++; }
eq(ASPHALT_CATALOG.length,19);
for (const type of ASPHALT_CATALOG) {
  const draft = blankPart(type.unit);
  eq(draft.mode,type.unit==='m²'?'rectangle':type.unit==='m'?'length':'small_pothole');
  if (type.unit === 'm²') {
    eq(measureParts([{...draft,length:'2',width:'3'},{...draft,mode:'irregular',area:'4'}],type.unit,type.code===12?null:'low').quantity,10);
  } else if (type.unit === 'm') {
    eq(measureParts([{...draft,length:'2.5'},{...draft,length:'1.5'}],type.unit,'low').quantity,4);
  } else {
    const measured=measureParts([{...draft,count:'2',diameter:'150',depth:'20'}],type.unit,'low');
    eq(measured.quantity,2); eq(measured.potholes.small_count,2);
  }
}
const area=blankPart('m²');
fails(()=>measureParts([{...area,length:'',width:'2'}],'m²','low'),/Part length/);
fails(()=>measureParts([{...area,length:'-1',width:'2'}],'m²','low'),/positive/);
fails(()=>measureParts([{...area,length:'Infinity',width:'2'}],'m²','low'),/positive/);
fails(()=>measureParts([{...area,mode:'length',length:'2'}],'m²','low'),/catalog unit/);
const hole=blankPart('No.');
for (const diameter of [200,450,750,99]) fails(()=>smallPotholeSeverity(diameter,20),/unambiguous/);
fails(()=>smallPotholeSeverity(150,12),/unambiguous/);
eq(smallPotholeSeverity(150,20),'low');
eq(smallPotholeSeverity(300,35),'medium');
eq(smallPotholeSeverity(600,60),'high');
fails(()=>measureParts([{...hole,count:'1.5',diameter:'150',depth:'20'}],'No.','low'),/whole number/);
fails(()=>measureParts([{...hole,count:'1',diameter:'150',depth:'20'}],'No.','medium'),/selected provisional severity/);
eq(measureParts([{...hole,mode:'large_pothole',diameter:'800',depth:'20',area:'0.75'}],'No.','medium').quantity,1.5);
eq(severityEvidence(15,'8'),{metric:'mean_rut_depth_mm',value_mm:8});
fails(()=>severityEvidence(15,'0'),/positive/);
eq(severityEvidence(1,''),null);
console.log(`Passed ${checks} D6433-07 measurement-part checks across all 19 catalog types.`);
