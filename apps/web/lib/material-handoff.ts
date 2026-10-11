// Tab-local handoff contains only bounded question text. Never put signed tickets in URLs/exports.
export const MATERIAL_HANDOFF_KEY='beacon-material-handoff-v1';
export const MATERIAL_RETURN_TO='/questions?resume=materials';
export function materialReturnTo(value:unknown):string|null {return value===MATERIAL_RETURN_TO?MATERIAL_RETURN_TO:null;}
export function readMaterialQuestion(value:unknown):string|null {
  if(!value||typeof value!=='object')return null;
  const question=(value as {question?:unknown}).question;
  return typeof question==='string'&&question.trim()&&question.length<=1000?question:null;
}
