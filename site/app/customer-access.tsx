'use client';

import {useState, type FormEvent} from 'react';
import {customerApi, type CustomerProfile} from '../lib/customer-client';

export default function CustomerAccess({onAuthenticated, compact = false}: {
  onAuthenticated: (customer: CustomerProfile, phone: string, notice?: string) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register' | 'recover'>('login');
  const [phone, setPhone] = useState(''), [password, setPassword] = useState('');
  const [operational, setOperational] = useState(false), [marketing, setMarketing] = useState(false);
  const [privacy, setPrivacy] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [recoveryRequested, setRecoveryRequested] = useState(false), [recoveryCode, setRecoveryCode] = useState(''), [recoveryMessage, setRecoveryMessage] = useState('');
  const changeMode = (next:typeof mode) => {setMode(next); setPassword(''); setError(''); setRecoveryCode(''); setRecoveryMessage(''); setRecoveryRequested(false);};
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (mode === 'recover' && !recoveryRequested) {
        const result = await customerApi<{status:string;message:string}>('password/request', {phone});
        setRecoveryMessage(result.message);
        if (result.status === 'requested') setRecoveryRequested(true);
        return;
      }
      const result = await customerApi<{customer: CustomerProfile;history_review_required?:boolean;message?:string}>(mode === 'recover' ? 'password/reset' : mode, mode === 'register'
        ? {phone, password, operational_whatsapp: operational, marketing_whatsapp: marketing}
        : mode === 'recover' ? {phone, password, code:recoveryCode} : {phone, password});
      setPassword('');
      onAuthenticated(result.customer, phone, result.history_review_required ? result.message : undefined);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Confira os dados de acesso.'); }
    finally { setBusy(false); }
  };
  return <section className={`ca-access${compact ? ' ca-access-compact' : ''}`} aria-label="Acesso do cliente">
    <div className="ca-access-tabs" aria-label="Opções de acesso">
      <button type="button" aria-pressed={mode === 'login'} onClick={() => changeMode('login')}>Entrar</button>
      <button type="button" aria-pressed={mode === 'register'} onClick={() => changeMode('register')}>Criar conta</button>
    </div>
    <h2>{mode === 'login' ? 'Acesse suas reservas' : mode === 'register' ? 'Seu acesso à Calori Go' : 'Recupere seu acesso'}</h2>
    <p>{mode === 'recover' ? 'Informe seu telefone cadastrado para solicitar um código de recuperação pelo WhatsApp.' : 'Use seu telefone com DDD e uma senha. A conta permite acompanhar as novas reservas feitas enquanto você estiver conectado.'}</p>
    <form onSubmit={submit}>
      <fieldset disabled={busy}>
        <div className="ca-access-fields">
          <label>Telefone com DDD<input name="account-phone" type="tel" autoComplete="username" inputMode="tel" required maxLength={20} value={phone} onChange={event => {setPhone(event.target.value); if (mode === 'recover') {setRecoveryRequested(false); setRecoveryCode(''); setRecoveryMessage('');}}}/></label>
          {(mode !== 'recover' || recoveryRequested) && <label>{mode === 'recover' ? 'Nova senha' : 'Senha'}<input name="account-password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? undefined : 12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)}/></label>}
          {mode === 'recover' && recoveryRequested && <label>Código de recuperação<input name="recovery-code" type="text" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" minLength={6} maxLength={6} required value={recoveryCode} onChange={event => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}/></label>}
        </div>
        {mode === 'register' && <>
          <p className="ca-help">Crie uma senha com pelo menos 12 caracteres.</p>
          <label className="ca-check"><input type="checkbox" checked={operational} onChange={event => setOperational(event.target.checked)}/>Quero receber pelo WhatsApp avisos desta locação, como retirada liberada e lembrete de devolução.</label>
          <label className="ca-check"><input type="checkbox" checked={marketing} onChange={event => setMarketing(event.target.checked)}/>Quero receber ofertas e avisos de motos disponíveis pelo WhatsApp. Posso desativar depois.</label>
          <label className="ca-check"><input type="checkbox" required checked={privacy} onChange={event => setPrivacy(event.target.checked)}/>Entendi que a conta guarda meu telefone, acesso protegido, preferências e vínculo das reservas. Os dados completos que eu informar para a locação e os respectivos documentos serão registrados em área protegida para o atendimento autorizado.</label>
        </>}
        {mode === 'recover' && recoveryRequested && <p className="ca-help">A nova senha deve ter pelo menos 12 caracteres. A confirmação encerra os acessos anteriores à conta.</p>}
        {error && <p className="ca-error" role="alert">{error}</p>}
        {recoveryMessage && <p className="ca-info" role="status">{recoveryMessage}</p>}
        <button type="submit" className="ca-button" disabled={busy}>{busy ? 'Aguarde…' : mode === 'login' ? 'Entrar na minha conta' : mode === 'register' ? 'Criar minha conta' : recoveryRequested ? 'Salvar nova senha' : 'Solicitar código de recuperação'}</button>
        {mode === 'login' && <button type="button" className="ca-link-button" onClick={() => changeMode('recover')}>Esqueci minha senha</button>}
        {mode === 'recover' && !recoveryRequested && <button type="button" className="ca-link-button" onClick={() => setRecoveryRequested(true)}>Já tenho um código de recuperação</button>}
      </fieldset>
    </form>
    <p className="ca-help">Os avisos e códigos dependem da conexão do WhatsApp da loja. Se você não conseguir receber um código, procure o atendimento.</p>
  </section>;
}
