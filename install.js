(() => {
  const dialog = document.getElementById('installCard');
  const button = document.getElementById('installApp');
  const help = document.getElementById('installHelp');
  const displayMode = window.matchMedia('(display-mode: standalone)');
  const installed = () => displayMode.matches || navigator.standalone === true;
  const key = 'meu-mercado.install-popup.v2';
  let promptEvent = null;
  function dismiss() {
    try { localStorage.setItem(key, 'dismissed'); } catch {}
    dialog.close();
  }
  function instructions() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    help.textContent = ios
      ? 'Para concluir: abra no Safari, toque em Compartilhar → Adicionar à Tela de Início → Adicionar.'
      : 'Para concluir: abra o link no Chrome ou Edge do celular e procure “Instalar aplicativo” ou “Adicionar à tela inicial” no menu ⋮.';
    help.hidden = false;
  }
  document.getElementById('dismissInstall').onclick = dismiss;
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault(); promptEvent = event;
  });
  button.onclick = async () => {
    dismiss();
    const event = promptEvent; promptEvent = null;
    if (!event) { instructions(); return; }
    try { await event.prompt(); await event.userChoice; }
    catch { instructions(); }
  };
  window.addEventListener('appinstalled', () => { dismiss(); help.hidden = true; promptEvent = null; });
  displayMode.addEventListener?.('change', () => { if (installed()) dismiss(); });
  let dismissed = false;
  try { dismissed = localStorage.getItem(key) === 'dismissed'; } catch {}
  if (!installed() && !dismissed) dialog.showModal();
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
})();
