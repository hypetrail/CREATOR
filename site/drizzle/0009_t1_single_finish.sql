-- Change only current fleet presentation and units. Accepted reservation
-- snapshots, prices, photos and historical color descriptions stay intact.
UPDATE rental_models SET
 colors = '[{"id":"padrao-loja","name":"Padrão da loja","hex":"#f58220","photos":[]}]',
 spec = json_set(spec, '$.color_selection', json('false'),
   '$.notes', json('["Autonomia estimada varia com carga, trajeto e condições da bateria.","Peso total de condutor, eventual passageiro e bagagem abaixo de 120 kg.","Passageiro e condução dependem da documentação, configuração e requisitos legais da unidade.","Não circular em vias movimentadas, estradas vicinais ou rodovias."]'))
 WHERE id = 't1';
-- Wrangler applies a migration transactionally. Recreate the unchanged guard
-- after this one-time finish change; active reservations keep their snapshots.
DROP TRIGGER IF EXISTS unit_active_reservation_guard;
--> statement-breakpoint
UPDATE units SET color = 'padrao-loja' WHERE model_id = 't1';

--> statement-breakpoint
CREATE TRIGGER unit_active_reservation_guard BEFORE UPDATE OF status,color,model_id ON units
WHEN (NEW.status <> 'available' OR NEW.color <> OLD.color OR NEW.model_id <> OLD.model_id)
 AND EXISTS (SELECT 1 FROM reservations r WHERE r.unit_id=OLD.id
 AND (r.status='rented' OR (r.status IN ('reserved','preparing','ready')
 AND COALESCE(r.due_ms,r.end_ms)>CAST(strftime('%s','now') AS INTEGER)*1000)))
BEGIN SELECT RAISE(ABORT,'UNIT_ACTIVE_RESERVATION'); END;
