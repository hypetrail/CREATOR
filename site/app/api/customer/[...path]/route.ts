export const dynamic='force-dynamic';
function disabled(){return Response.json({error:'As contas de clientes foram encerradas. Reserve sem cadastro e acompanhe os avisos pelo WhatsApp da loja.'},{status:410,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Set-Cookie':'calori_customer=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0'}});}
export const GET=disabled;
export const POST=disabled;
