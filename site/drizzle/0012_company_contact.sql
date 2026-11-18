-- Replace only the previous official defaults. Keep custom administrator data
-- and all historical reservation/document snapshots intact.
UPDATE settings SET value='5519971064671'
WHERE key='whatsapp' AND value IN ('5519971505878','19971505878','(19) 97150-5878');
UPDATE settings SET value='Avenida dos Lírios, nº 142 – Vila Antônio Maschietto Filho, São José do Rio Pardo/SP – CEP 13720-146'
WHERE key='address' AND value='Av. dos Lírios, 142 - Vila Maschietto, São José do Rio Pardo - SP, 13720-146';
