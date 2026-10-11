import assert from 'node:assert/strict';
import test from 'node:test';
import { materialReturnTo, MATERIAL_RETURN_TO, readMaterialQuestion } from '../lib/material-handoff.ts';
import { questionExportLabel } from '../lib/question-presentation.ts';

test('material return route only accepts the exact internal question resume route',()=>{
 assert.equal(materialReturnTo(MATERIAL_RETURN_TO),MATERIAL_RETURN_TO);
 for(const value of ['https://evil.test','//evil.test','/api/research-question','/questions?resume=materials&auto=execute','/changes',null,{},'/questions%3Fresume%3Dmaterials'])assert.equal(materialReturnTo(value),null);
 assert.equal(readMaterialQuestion({question:'原问题文本'}),'原问题文本');
 for(const value of [{question:''},{question:'x'.repeat(1001)},{question:42},{ticket:'not-retained'},null])assert.equal(readMaterialQuestion(value),null);
});
test('exports describe blocked, out-of-scope, missing-material and pending result states',()=>{
 assert.equal(questionExportLabel('ANSWER_READY','accepted'),'导出已审核研究草稿');assert.equal(questionExportLabel('ANSWER_READY','rejected'),'导出退回研究草稿');
 assert.equal(questionExportLabel('BLOCKED'),'导出阻断说明');assert.equal(questionExportLabel('OUT_OF_SCOPE'),'导出范围说明');assert.equal(questionExportLabel('ANSWER_READY'),'导出待审核研究草稿');assert.equal(questionExportLabel('PARTIAL'),'导出部分回答草稿');assert.equal(questionExportLabel('MATERIALS_REQUIRED'),'导出材料需求');
});
