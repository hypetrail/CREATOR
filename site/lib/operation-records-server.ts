import {env} from 'cloudflare:workers';
import {db,HttpError} from './rental-server';

type Input=Record<string,unknown>;
const checkNames=['brakes','tires','lights','battery','charger','key','condition'] as const;
const clean=(value:unknown,max:number)=>String(value??'').trim().slice(0,max);
const uuid=(value:unknown)=>/^[0-9a-f-]{36}$/i.test(String(value));
export async function recordAudit(actor:string,action:string,entityId:string,details:Input={}){
 await db().prepare('INSERT INTO admin_audit_events (id,actor,action,entity_id,payload,created_ms) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),actor,action,entityId,JSON.stringify(details),Date.now()).run();
}
export async function operationRecords(){
 const rows=await db().prepare('SELECT * FROM operation_records ORDER BY created_ms DESC LIMIT 500').all();
 const holds=await db().prepare('SELECT * FROM unit_safety_holds WHERE resolved_ms IS NULL ORDER BY created_ms DESC').all();
 return {records:rows.results||[],safety_holds:holds.results||[]};
}
export async function saveOperationRecord(input:Input,actor:string){
 if(Object.keys(input).some(key=>!['reservation_id','unit_id','kind','title','notes','amount_cents'].includes(key)))throw new HttpError(400,'Campos do registro operacional inválidos.');
 const kind=clean(input.kind,30),title=clean(input.title,180),notes=clean(input.notes,6000);
 if(!['incident','maintenance','expense','authorization','tracker'].includes(kind)||!title)throw new HttpError(400,'Escolha o tipo e descreva o registro.');
 let unit=clean(input.unit_id,80);
 const reservation=clean(input.reservation_id,80);
 if(reservation){
  const row=await db().prepare('SELECT unit_id FROM reservations WHERE id=?').bind(reservation).first<{unit_id:string}>();
  if(!row)throw new HttpError(404,'Reserva não encontrada.');
  if(unit&&unit!==row.unit_id)throw new HttpError(400,'A unidade não corresponde à reserva.');
  unit=row.unit_id;
 }
 if(unit&&!await db().prepare('SELECT id FROM units WHERE id=?').bind(unit).first())throw new HttpError(404,'Unidade não encontrada.');
 const amount=input.amount_cents===undefined||input.amount_cents===null?null:Number(input.amount_cents);
 if(amount!==null&&(!Number.isSafeInteger(amount)||amount<0||amount>100_000_000))throw new HttpError(400,'Valor do registro inválido.');
 const id=crypto.randomUUID();
 await db().prepare('INSERT INTO operation_records (id,reservation_id,unit_id,kind,title,notes,amount_cents,created_ms,created_by) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,reservation,unit,kind,title,notes,amount,Date.now(),actor).run();
 await recordAudit(actor,'operation_record_created',id,{kind,reservation_id:reservation,unit_id:unit,amount_cents:amount});
 return {ok:true,id};
}
export async function resolveSafetyHold(input:Input,actor:string){
 const resolution=clean(input.resolution,2000);
 if(!uuid(input.id)||resolution.length<10)throw new HttpError(400,'Informe o bloqueio e descreva a conferência ou reparo realizado.');
 const row=await db().prepare('UPDATE unit_safety_holds SET resolved_ms=?,resolved_by=?,resolution=? WHERE id=? AND resolved_ms IS NULL RETURNING id').bind(Date.now(),actor,resolution,input.id).first();
 if(!row)throw new HttpError(409,'O bloqueio já foi resolvido ou não foi encontrado.');
 await recordAudit(actor,'safety_hold_resolved',String(input.id),{});
 return {ok:true};
}
interface Photo {id:string;reservation_id:string;storage_key:string;mime:string;size:number;sha256:string;created_ms:number}
function imageSignature(bytes:Uint8Array,mime:string){
 if(mime==='image/jpeg')return bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if(mime==='image/png')return [137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
 return mime==='image/webp'&&new TextDecoder().decode(bytes.subarray(0,4))==='RIFF'&&new TextDecoder().decode(bytes.subarray(8,12))==='WEBP';
}
export async function uploadInspectionPhoto(request:Request,actor:string){
 if(!env.BUCKET)throw new HttpError(503,'O armazenamento privado de vistorias ainda não está disponível.');
 const form=await request.formData(),file=form.get('photo'),reservationId=clean(form.get('reservation_id'),80);
 if(!uuid(reservationId)||!await db().prepare('SELECT id FROM reservations WHERE id=?').bind(reservationId).first())throw new HttpError(400,'Informe a reserva da vistoria.');
 if(!(file instanceof File)||!['image/jpeg','image/png'].includes(file.type)||file.size<12||file.size>8*1024*1024)throw new HttpError(400,'Envie uma foto JPG ou PNG de até 8 MB. O painel otimiza outros formatos antes do envio.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 if(!imageSignature(bytes,file.type))throw new HttpError(400,'O conteúdo não corresponde a uma imagem permitida.');
 const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
 const id=crypto.randomUUID(),key='private-inspections/'+id;
 await env.BUCKET.put(key,bytes,{httpMetadata:{contentType:file.type}});
 try{
  await db().prepare('INSERT INTO inspection_photos (id,reservation_id,storage_key,mime,size,sha256,created_ms,created_by) VALUES (?,?,?,?,?,?,?,?)').bind(id,reservationId,key,file.type,bytes.length,sha,Date.now(),actor).run();
 }catch(error){await env.BUCKET.delete(key);throw error;}
 return {id,url:'/api/fleet/admin/inspection-photos/'+id};
}
export async function inspectionPhotoResponse(id:string){
 if(!uuid(id))throw new HttpError(404,'Foto não encontrada.');
 const photo=await db().prepare('SELECT * FROM inspection_photos WHERE id=?').bind(id).first<Photo>();
 if(!photo)throw new HttpError(404,'Foto não encontrada.');
 const object=await env.BUCKET?.get(photo.storage_key);
 if(!object)throw new HttpError(404,'Foto indisponível.');
 return new Response(object.body,{headers:{'Content-Type':photo.mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="vistoria-'+photo.id+'"'}});
}
export async function listInspections(reservationId:string){
 if(!uuid(reservationId))throw new HttpError(400,'Informe a reserva.');
 const rows=await db().prepare('SELECT id,reservation_id,kind,payload,created_ms,created_by FROM rental_inspections WHERE reservation_id=? ORDER BY created_ms DESC').bind(reservationId).all<{payload:string}>();
 return {inspections:(rows.results||[]).map(row=>({...row,payload:JSON.parse(row.payload)}))};
}
export async function saveInspection(input:Input,actor:string){
 if(Object.keys(input).some(key=>!['reservation_id','kind','checks','notes','photo_ids','maintenance_required','photo_storage','local_photo_names'].includes(key)))throw new HttpError(400,'Campos da vistoria inválidos.');
 const reservation=await db().prepare('SELECT id,unit_id,status FROM reservations WHERE id=?').bind(String(input.reservation_id||'')).first<{id:string;unit_id:string;status:string}>();
 if(!reservation)throw new HttpError(404,'Reserva não encontrada.');
 const kind=String(input.kind),checks=input.checks as Input;
 if(!['departure','return'].includes(kind)||!checks||checkNames.some(key=>checks[key]!==true))throw new HttpError(400,'Conclua a conferência de freios, pneus, iluminação, bateria, carregador, chave e conservação.');
 if((kind==='departure'&&!['preparing','ready'].includes(reservation.status))||(kind==='return'&&reservation.status!=='rented'))throw new HttpError(409,'A situação da reserva não permite esta vistoria.');
 const local=input.photo_storage==='local';
 if(input.photo_storage!==undefined&&!['local','cloud'].includes(String(input.photo_storage)))throw new HttpError(400,'Escolha onde as fotos foram guardadas.');
 const localNames=local&&Array.isArray(input.local_photo_names)?input.local_photo_names:[];
 if(local&&(localNames.length<1||localNames.length>20||localNames.some(n=>typeof n!=='string'||!n.trim()||n.length>200||/[\x00-\x1f\x7f/\\]/.test(n))||new Set(localNames).size!==localNames.length))throw new HttpError(400,'Registre de 1 a 20 nomes diferentes das fotos guardadas no computador.');
 if(!local&&(!Array.isArray(input.photo_ids)||input.photo_ids.length<1||input.photo_ids.length>20||input.photo_ids.some(id=>!uuid(id))||new Set(input.photo_ids).size!==input.photo_ids.length))throw new HttpError(400,'Anexe de 1 a 20 fotos diferentes à vistoria.');
 const ids=local?[]:input.photo_ids as string[],photos:Photo[]=[];
 for(const photoId of ids){
  const photo=await db().prepare('SELECT * FROM inspection_photos WHERE id=? AND reservation_id=?').bind(photoId,reservation.id).first<Photo>();
  if(!photo)throw new HttpError(400,'Uma foto não pertence a esta reserva.');
  photos.push(photo);
 }
 const id=crypto.randomUUID(),created=Date.now(),maintenance=input.maintenance_required===true;
 const payload={completed:true,photo_storage:local?'local':'cloud',local_photo_names:localNames,checks:Object.fromEntries(checkNames.map(key=>[key,true])),notes:clean(input.notes,6000),photo_ids:ids,photos:photos.map(({id,mime,size,sha256,created_ms})=>({id,mime,size,sha256,uploaded_ms:created_ms})),maintenance_required:maintenance,recorded_ms:created};
 const statements=[db().prepare('INSERT INTO rental_inspections (id,reservation_id,kind,payload,created_ms,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM reservations WHERE id=? AND status=?)').bind(id,reservation.id,kind,JSON.stringify(payload),created,actor,reservation.id,reservation.status)];
 if(maintenance)statements.push(db().prepare('INSERT INTO unit_safety_holds (id,unit_id,inspection_id,reason,created_ms,created_by) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM rental_inspections WHERE id=?)').bind(crypto.randomUUID(),reservation.unit_id,id,payload.notes||'Avaria ou falha registrada na vistoria.',created,actor,id));
 await db().batch(statements);
 const saved=await db().prepare('SELECT id FROM rental_inspections WHERE id=?').bind(id).first();
 if(!saved)throw new HttpError(409,'A reserva mudou durante a vistoria. Atualize a lista.');
 await recordAudit(actor,'inspection_created',id,{reservation_id:reservation.id,kind,maintenance_required:maintenance,photo_count:ids.length+localNames.length});
 return {inspection:{id,reservation_id:reservation.id,kind,payload,created_ms:created,created_by:actor},message:local?'Vistoria salva. As imagens permanecem no seu computador; o site guarda somente os nomes informados.':'Vistoria e fotos salvas em área privada. O envio ao WhatsApp é informado separadamente.'};
}
export async function auditEvents(){
 const rows=await db().prepare('SELECT id,actor,action,entity_id,payload,created_ms FROM admin_audit_events ORDER BY created_ms DESC LIMIT 300').all<{payload:string}>();
 return {events:(rows.results||[]).map(row=>({...row,details:JSON.parse(row.payload),payload:undefined}))};
}
