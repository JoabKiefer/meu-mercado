(() => {
  const el=id=>document.getElementById(id), store=window.marketStore, config=window.MARKET_SUPABASE||{};
  const dialog=el('accountDialog'); let client=null,user=null,epoch=0,busy=false;
  const message=text=>{el('accountMessage').textContent=text;};
  function status(){
    try{el('restoreBackup').hidden=!user||!localStorage.getItem('meu-mercado.backup.'+user.id);}catch{el('restoreBackup').hidden=true;}
    el('accountButton').textContent=user?'Minha conta':'Entrar';
    el('quickSave').hidden=!user;
    el('cloudStatus').textContent=!navigator.onLine?'Sem internet · salvo neste aparelho':!user?'Salvo neste aparelho':store.meta().dirty?'Alterações neste aparelho · salve na conta':store.meta().revision?'Salvo na conta · cópia neste aparelho':'Conta conectada · lista ainda não salva na nuvem';
  }
  function errorText(error){
    if(error?.code==='40001'||error?.message?.includes('revision_conflict'))return 'Sua conta tem uma versão mais recente. Carregue as listas da conta antes de salvar. Sua versão local foi mantida.';
    if(/Invalid login credentials/i.test(error?.message||''))return 'E-mail ou senha incorretos. Confira ou use “Esqueci minha senha”.';
    if(/Email not confirmed/i.test(error?.message||''))return 'Confirme seu e-mail para entrar.';
    if(/rate limit|too many/i.test(error?.message||''))return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.';
    return navigator.onLine?'Não foi possível concluir. Tente novamente; suas listas continuam neste aparelho.':'Você está sem internet. Suas listas continuam neste aparelho.';
  }
  async function run(fn){if(busy)return;busy=true;for(const b of dialog.querySelectorAll('button:not(#closeAccount)'))b.disabled=true;el('quickSave').disabled=true;try{await fn();}catch(error){message(errorText(error));}finally{busy=false;for(const b of dialog.querySelectorAll('button'))b.disabled=false;el('quickSave').disabled=false;status();}}
  function open(){if(!dialog.open)dialog.showModal();if(!client)message('O login está sendo preparado. Por enquanto, suas listas ficam salvas neste aparelho.');}
  el('accountButton').onclick=open;el('closeAccount').onclick=()=>dialog.close();
  window.addEventListener('market-change',status);window.addEventListener('online',status);window.addEventListener('offline',status);
  const redirect=()=>location.origin+location.pathname;
  async function readCloud(id){const {data,error}=await client.from('market_states').select('state,revision').eq('user_id',id).maybeSingle();if(error)throw error;return data;}
  async function sessionChanged(session){
    const next=session?.user||null;if(next?.id===user?.id)return;
    const current=++epoch;user=next;
    el('authForm').hidden=!!user;el('accountSignedIn').hidden=!user;el('accountEmail').textContent=user?.email||'';el('newPasswordForm').hidden=true;
    try{
      const hadLocal=store.switchUser(user?.id);status();
      if(user){message('Conta conectada. Carregando suas listas…');const initial=JSON.stringify(store.read());const remote=await readCloud(user.id);if(current!==epoch)return;
        if(remote&&!hadLocal&&initial===JSON.stringify(store.read())){store.apply({...remote.state,cloudRevision:remote.revision,cloudDirty:false});message('Suas listas foram carregadas.');}
        else message(remote?'Conta conectada. Suas alterações locais foram preservadas.':'Conta pronta. Copie suas listas deste aparelho ou comece uma nova compra.');
      }else message('Você saiu. Agora está usando as listas sem login deste aparelho.');
    }catch(error){message(errorText(error));}status();
  }
  el('authForm').onsubmit=e=>{e.preventDefault();if(!client){open();return;}run(async()=>{message('Entrando…');const {data,error}=await client.auth.signInWithPassword({email:el('authEmail').value.trim(),password:el('authPassword').value});if(error)throw error;el('authPassword').value='';await sessionChanged(data.session);});};
  el('signupButton').onclick=()=>{if(!client){open();return;}if(!el('authForm').reportValidity())return;run(async()=>{const {data,error}=await client.auth.signUp({email:el('authEmail').value.trim(),password:el('authPassword').value,options:{emailRedirectTo:redirect()}});if(error)throw error;el('authPassword').value='';if(data.session)await sessionChanged(data.session);else message('Confira seu e-mail e confirme o cadastro para entrar.');});};
  el('resetPassword').onclick=()=>{if(!client){open();return;}if(!el('authEmail').reportValidity())return;run(async()=>{const {error}=await client.auth.resetPasswordForEmail(el('authEmail').value.trim(),{redirectTo:redirect()});if(error)throw error;message('Se houver uma conta com esse e-mail, você receberá as instruções para trocar a senha.');});};
  el('newPasswordForm').onsubmit=e=>{e.preventDefault();run(async()=>{const {error}=await client.auth.updateUser({password:el('newPassword').value});if(error)throw error;el('newPassword').value='';el('newPasswordForm').hidden=true;message('Senha atualizada.');});};
  async function saveCloud(){if(!client||!user)return;const id=user.id,token=epoch,snapshot=store.read(),revision=store.meta().revision;
    if(!store.meta().readable||!store.valid(snapshot))throw Error('invalid state');message('Salvando na sua conta…');
    const {data,error}=await client.rpc('market_save_state',{p_state:snapshot,p_expected_revision:revision});if(error)throw error;
    if(token!==epoch||id!==user?.id)return;store.markSaved(snapshot,data);message(store.meta().dirty?'Versão salva. Há novas alterações neste aparelho; salve novamente.':'Listas, bases e histórico salvos na sua conta.');
  }
  el('saveCloud').onclick=()=>run(saveCloud);el('quickSave').onclick=()=>{open();run(saveCloud);};
  el('loadCloud').onclick=()=>run(async()=>{if(!user)return;const token=epoch,id=user.id;const remote=await readCloud(id);if(token!==epoch)return;if(!remote){message('Ainda não há listas salvas nesta conta.');return;}if(!store.valid(remote.state))throw Error('invalid state');if(!confirm('Carregar as listas da conta? A versão atual deste aparelho será guardada como cópia de segurança.'))return;
    localStorage.setItem('meu-mercado.backup.'+id,JSON.stringify(store.read()));store.apply({...remote.state,cloudRevision:remote.revision,cloudDirty:false});message('Listas da conta carregadas.');});
  el('importGuest').onclick=()=>run(async()=>{if(!user)return;const guest=store.guest();if(!store.valid({...guest,baseLists:guest.baseLists||[]}))throw Error('invalid state');if(!confirm('Copiar as listas usadas sem login para esta conta? A lista atual da conta neste aparelho será guardada como cópia de segurança.'))return;localStorage.setItem('meu-mercado.backup.'+user.id,JSON.stringify(store.read()));store.apply({...guest,baseLists:guest.baseLists||[],cloudRevision:store.meta().revision,cloudDirty:true});message('Listas copiadas. Toque em salvar para guardá-las na sua conta.');});
  el('restoreBackup').onclick=()=>run(async()=>{if(!user)return;const raw=localStorage.getItem('meu-mercado.backup.'+user.id);if(!raw){message('Nenhuma cópia anterior disponível.');return;}const backup=JSON.parse(raw);if(!store.valid(backup))throw Error('invalid state');if(!confirm('Recuperar a cópia anterior neste aparelho? Salve depois para atualizar a conta.'))return;store.apply({...backup,cloudRevision:store.meta().revision,cloudDirty:true});message('Cópia recuperada neste aparelho. Salve para atualizar sua conta.');});
  el('logoutButton').onclick=()=>run(async()=>{if(store.meta().dirty&&!confirm('Há alterações ainda não salvas na conta. Elas ficam neste aparelho para quando você entrar novamente. Sair?'))return;const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;await sessionChanged(null);});
  status();
  if(!config.url||!config.publishableKey||!window.supabase)return;
  client=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  client.auth.onAuthStateChange((event,session)=>{setTimeout(async()=>{await sessionChanged(session);if(event==='PASSWORD_RECOVERY'){el('newPasswordForm').hidden=false;open();message('Escolha uma nova senha.');}},0);});
  client.auth.getSession().then(({data,error})=>{if(error)throw error;return sessionChanged(data.session);}).catch(error=>message(errorText(error)));
})();
