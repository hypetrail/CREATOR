export function cloudflareProductionConfig(base, variables = process.env) {
  const databaseId = variables.CALORI_D1_DATABASE_ID?.trim() || base.d1_databases?.[0]?.database_id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(databaseId || '') || databaseId === '00000000-0000-4000-8000-000000000000') {
    throw new Error('Configure CALORI_D1_DATABASE_ID com o Database ID do banco D1 criado no painel Cloudflare. Não é uma senha.');
  }
  const name = variables.CALORI_WORKER_NAME?.trim() || base.name;
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name || '')) throw new Error('Nome inválido para o Worker.');
  const databaseName = variables.CALORI_D1_DATABASE_NAME?.trim() || base.d1_databases[0].database_name;
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(databaseName || '')) throw new Error('Nome inválido para o banco D1.');
  return {...base, name, vars: {...base.vars, CALORI_AUTH_MODE: 'password'}, d1_databases: [{...base.d1_databases[0], database_id: databaseId, database_name: databaseName}]};
}
