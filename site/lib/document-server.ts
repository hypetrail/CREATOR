import {db,HttpError} from './rental-server';
import {deliveryConfiguration} from './document-delivery-server';
import {defaultDocumentPolicy,parseDocumentPolicy,documentSections} from './document-policy';
export async function currentDocumentPolicy(){
 const row=await db().prepare('SELECT payload FROM document_versions WHERE approved=1 ORDER BY created_ms DESC,rowid DESC LIMIT 1').first<{payload:string}>();
 return row?parseDocumentPolicy(JSON.parse(row.payload)):defaultDocumentPolicy;
}
export async function documentAdmin(){
 const rows=(await db().prepare('SELECT payload FROM document_versions ORDER BY created_ms DESC,rowid DESC LIMIT 30').all<{payload:string}>()).results||[];
 return {current:await currentDocumentPolicy(),versions:rows.map(row=>parseDocumentPolicy(JSON.parse(row.payload))),integrations:deliveryConfiguration()};
}
export async function saveDocumentVersion(input:Record<string,unknown>){
 const policy=parseDocumentPolicy(input.policy);
 if(input.publish===true){
  if(input.reviewed!==true)throw new HttpError(400,'Confirme a revisão das condições antes de publicar.');
  if(Object.values(policy.company).some(value=>!value)||documentSections.some(([key])=>!policy.clauses[key]))throw new HttpError(400,'Preencha a identificação da empresa e todas as seções.');
  if(documentSections.some(([key])=>policy.clauses[key]===defaultDocumentPolicy.clauses[key]&&['cancellation','insurance'].includes(key)))throw new HttpError(400,'Substitua as orientações pendentes pelas condições aprovadas da empresa.');
 }
 const result={...policy,version:'doc-'+crypto.randomUUID(),approved:input.publish===true,created_ms:Date.now()};
 await db().prepare('INSERT INTO document_versions (id,approved,payload,created_ms) VALUES (?,?,?,?)').bind(result.version,result.approved?1:0,JSON.stringify(result),result.created_ms).run();
 return result;
}
export async function linkExternalCustomer(input:Record<string,unknown>){
 if(Object.keys(input).some(key=>!['id','system','reference'].includes(key)))throw new HttpError(400,'Informe somente a referência interna do cadastro externo.');
 const system=String(input.system||'').trim(),reference=String(input.reference||'').trim();
 if(!system||system.length>80||!reference||!/^[-A-Za-z0-9_.:]{1,120}$/.test(reference))throw new HttpError(400,'Informe o sistema e seu identificador interno, sem dados pessoais.');
 if(/^\d{11}$/.test(reference)||/^55\d{10,11}$/.test(reference))throw new HttpError(400,'Use o identificador interno do sistema, não CPF ou telefone.');
 const row=await db().prepare('UPDATE reservations SET external_customer_system=?,external_customer_ref=? WHERE id=? RETURNING id').bind(system,reference,input.id).first();
 if(!row)throw new HttpError(404,'Reserva não encontrada.');
 return {ok:true};
}
