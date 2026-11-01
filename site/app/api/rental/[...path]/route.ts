import * as service from '../../../../lib/rental-server';
export const dynamic='force-dynamic';
async function handle(req:Request){try{
 const user=await service.identity(req),url=new URL(req.url),path=url.pathname.replace(/^\/api\/rental\//,'');
 if(req.method==='POST'&&path==='reservations')throw new service.HttpError(410,'O cadastro antigo foi encerrado. Use /api/fleet/reservations sem dados pessoais.');
 if(req.method!=='GET'){const origin=req.headers.get('origin');if(origin&&origin!==url.origin)throw new service.HttpError(403,'Origem da solicitação inválida.');}
 await service.initialize(user);let result:any;
 if(req.method==='GET'&&path==='bootstrap')result=await service.bootstrap(user);
 else if(req.method==='GET'&&path==='availability')result=await service.availability(url.searchParams.get('start')||'',url.searchParams.get('end')||'');
 else if(req.method==='GET'&&path.startsWith('photos/'))return await service.photoResponse(path.slice(7));
 else if(req.method==='POST'&&path==='quote')result=await service.quote(await req.json());
 else if(req.method==='POST'&&path==='reservations')result=await service.reserve(await req.json());
 else if(req.method==='POST'&&path==='lookup')result=await service.lookup(await req.json());
 else if(path.startsWith('admin')){await service.admin(user);
   if(req.method==='GET'&&path==='admin')result=await service.adminData();
   else if(req.method==='POST'&&path==='admin/photos')result=await service.uploadPhoto(req);
   else if(req.method==='POST'){const input:any=await req.json();
     if(path==='admin/model')result=await service.saveModel(input);
     else if(path==='admin/settings')result=await service.saveSettings(input);
     else if(path==='admin/unit')result=await service.updateUnit(input);
     else if(path==='admin/block')result=await service.addBlock(input);
     else if(path==='admin/delete-block')result=await service.deleteBlock(input.id);
     else if(path==='admin/reservation')throw new service.HttpError(410,'Atualize a reserva pelo painel de frota.');
   }
 }
 if(result===undefined)throw new service.HttpError(404,'Página não encontrada.');return Response.json(result,{headers:{'Cache-Control':'no-store'}});
}catch(error){const status=error instanceof service.HttpError?error.status:400;return Response.json({error:error instanceof Error?error.message:'Não foi possível concluir esta ação.'},{status,headers:{'Cache-Control':'no-store'}});}}
export const GET=handle;export const POST=handle;
