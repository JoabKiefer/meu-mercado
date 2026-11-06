(() => {
  const get = id => document.getElementById(id);
  const dialog = get('receipt');
  let worker = null, generation = 0, photoURL = null, libraryPromise, selectedFile = null, reading = false;
  function message(text) { get('receiptStatus').textContent = text; }
  function busy(value) {
    reading = value;
    get('readReceipt').disabled = value;
    get('manualReceipt').disabled = value;
    get('receiptFile').disabled = value;
    get('pasteReceipt').disabled = value;
    get('receiptProgress').hidden = !value;
    get('receiptReview').hidden = value;
  }
  function cleanup() {
    generation++;
    if (worker) { worker.terminate().catch(() => {}); worker = null; }
    if (photoURL) { URL.revokeObjectURL(photoURL); photoURL = null; }
    get('receiptPhoto').removeAttribute('src');
    get('receiptPhoto').hidden = true;
    busy(false);
  }
  function loadOCR() {
    if (window.Tesseract) return Promise.resolve();
    if (!libraryPromise) libraryPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/dist/tesseract.min.js';
      const timer = setTimeout(() => { script.remove(); reject(new Error('Tempo de carregamento esgotado.')); }, 45000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Não foi possível carregar o leitor.')); };
      document.head.append(script);
    }).catch(error => { libraryPromise = null; throw error; });
    return libraryPromise;
  }
  async function preparePhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const image = new Image(); image.src = url; await image.decode();
      const scale = Math.min(1, 2400/image.naturalWidth, 8000/image.naturalHeight);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.naturalWidth*scale);
      canvas.height = Math.round(image.naturalHeight*scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white'; ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      return canvas;
    } finally { URL.revokeObjectURL(url); }
  }
  function addRow(item = {name:'', q:1, u:'un'}) {
    const row = document.createElement('fieldset');
    row.className = 'receipt-item';
    row.innerHTML = '<legend>Produto para revisar</legend><label>Produto<input name="name" maxlength="90" required></label><div class="fields"><label>Quantidade<input name="q" type="number" min=".001" step=".001" required></label><label>Unidade<select name="u"><option>un</option><option>kg</option><option>L</option></select></label></div><small class="receipt-source"></small><button type="button" class="secondary">Excluir sugestão</button>';
    row.querySelector('legend').textContent = 'Produto' + (item.itemNumber ? ' '+item.itemNumber : '') + (item.code ? ' · Código '+item.code : '');
    row.dataset.code = item.code || '';
    row.dataset.itemNumber = item.itemNumber || '';
    for (const key of ['name','q','u']) row.querySelector('[name="'+key+'"]').value = item[key] ?? '';
    row.querySelector('small').textContent = 'Ajuste a quantidade para a próxima compra. O preço será informado no mercado.';
    row.querySelector('button').onclick = () => { row.remove(); updateTotal(); };
    row.oninput = updateTotal;
    get('receiptRows').append(row);
    setupQuantity(row); row.querySelector('[name=u]').value=item.u; row.querySelector('[name=u]').dispatchEvent(new Event('change'));
    updateTotal();
  }
  function updateTotal() {
    const rows = [...get('receiptRows').children];
    get('receiptTotal').textContent = rows.length+' produtos para a próxima compra · Sem preços da notinha';
    get('confirmReceipt').disabled = !rows.length;
  }
  get('openReceipt').onclick = () => {
    cleanup(); selectedFile = null; get('receiptFile').value = ''; get('receiptText').value = '';
    get('receiptFilename').textContent = '';
    get('receiptRows').replaceChildren(); get('receiptReview').hidden = true;
    message('Escolha, arraste ou cole uma foto nítida da notinha.');
    dialog.showModal();
  };
  get('closeReceipt').onclick = () => dialog.close();
  dialog.addEventListener('close', cleanup);
  function receivePhoto(file) {
    if (reading || !file) return;
    const supported = /^image\/(jpeg|png|webp)$/.test(file.type) || (!file.type && /\.(jpe?g|png|webp)$/i.test(file.name));
    if (!supported || file.size > 50*1024*1024) {
      message('Use uma imagem JPG, PNG ou WebP de até 50 MB. Para HEIC ou PDF, cole uma captura de tela da notinha.'); return;
    }
    selectedFile = file;
    if (photoURL) URL.revokeObjectURL(photoURL);
    photoURL = null;
    get('receiptPhoto').hidden = true;
    get('receiptReview').hidden = true;
    get('receiptRows').replaceChildren(); get('receiptText').value = '';
    photoURL = URL.createObjectURL(file);
    get('receiptPhoto').src = photoURL; get('receiptPhoto').hidden = false;
    get('receiptFilename').textContent = file.name || 'Imagem colada';
    message('Foto selecionada. Clique em Reconhecer produtos.');
  }
  get('receiptFile').onchange = () => receivePhoto(get('receiptFile').files[0]);
  dialog.addEventListener('paste', event => {
    const file = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile();
    if (file) { event.preventDefault(); receivePhoto(file); }
  });
  dialog.addEventListener('dragover', event => { event.preventDefault(); if (!reading) get('receiptDrop').classList.add('dragging'); });
  dialog.addEventListener('dragleave', () => get('receiptDrop').classList.remove('dragging'));
  dialog.addEventListener('drop', event => {
    event.preventDefault(); get('receiptDrop').classList.remove('dragging');
    receivePhoto(event.dataTransfer?.files[0]);
  });
  get('pasteReceipt').onclick = async () => {
    const run = generation;
    try {
      if (!navigator.clipboard?.read) throw new Error('unavailable');
      const entries = await navigator.clipboard.read();
      for (const entry of entries) {
        const type = entry.types.find(type => /^image\/(png|jpeg|webp)$/.test(type));
        if (type) {
          const blob = await entry.getType(type);
          if (run === generation && dialog.open) receivePhoto(new File([blob], 'Imagem colada.'+type.split('/')[1], {type}));
          return;
        }
      }
      if (run === generation) message('Não há uma imagem copiada. Copie a imagem ou faça uma captura de tela e pressione Ctrl+V aqui.');
    } catch {
      if (run === generation) message('Para colar, copie a imagem ou faça uma captura de tela e pressione Ctrl+V nesta janela.');
    }
  };
  get('readReceipt').onclick = async () => {
    const file = selectedFile;
    if (!file) { message('Escolha uma foto primeiro.'); get('receiptFile').focus(); return; }
    const run = ++generation;
    busy(true); get('receiptProgress').removeAttribute('value');
    message('Preparando o leitor. O primeiro uso pode demorar para baixar os arquivos.');
    let activeWorker;
    let timeout;
    try {
      const job = async () => {
        await loadOCR();
        if (run !== generation) return;
        activeWorker = await Tesseract.createWorker('por', 1, {
          logger: event => {
            if (run !== generation) return;
            if (event.status === 'recognizing text') {
              get('receiptProgress').value = event.progress;
              message('Reconhecendo produtos: '+Math.round(event.progress*100)+'%');
            }
          }
        });
        if (run !== generation) { await activeWorker.terminate(); return; }
        worker = activeWorker;
        await activeWorker.setParameters({preserve_interword_spaces:'1'});
        const photo = await preparePhoto(file);
        if (run !== generation) return;
        const {data} = await activeWorker.recognize(photo);
        if (run !== generation) return;
        get('receiptText').value = data.text;
        get('receiptRows').replaceChildren();
        const suggestions = parseReceipt(data.text);
        
        suggestions.forEach(addRow);
        updateTotal();
        message(suggestions.length ? 'Leitura concluída. Confira os produtos e ajuste quanto deseja comprar. Os preços da nota serão ignorados.' : 'Não encontramos produtos. Você pode editar o texto lido ou incluir produtos manualmente.');
      };
      await Promise.race([job(),new Promise((_,reject) => { timeout = setTimeout(() => reject(new Error('A leitura demorou demais. Tente uma foto menor ou uma conexão melhor.')),180000); })]);
    } catch (error) {
      if (run === generation) message((error.message || 'Falha na leitura.')+' Tente novamente ou revise manualmente abaixo.');
    } finally {
      clearTimeout(timeout);
      if (run === generation) {
        generation++; busy(false); get('receiptReview').hidden = false; updateTotal();
        worker = null;
      }
      if (activeWorker) activeWorker.terminate().catch(() => {});
    }
  };
  get('manualReceipt').onclick = () => { get('receiptReview').hidden = false; addRow(); };
  get('addReceiptRow').onclick = () => addRow();
  get('parseReceiptText').onclick = () => {
    // Keep corrections already made; replacing them requires an explicit choice.
    if (get('receiptRows').children.length && !confirm('Substituir as sugestões e as correções pelo texto abaixo?')) return;
    get('receiptRows').replaceChildren(); const suggestions = parseReceipt(get('receiptText').value);  suggestions.forEach(addRow); updateTotal();
    message('Sugestões atualizadas. Revise os campos antes de adicionar.');
  };
  get('receiptReview').onsubmit = event => {
    event.preventDefault();
    const drafts = [];
    for (const row of get('receiptRows').children) {
      const input = name => row.querySelector('[name="'+name+'"]');
      const name = input('name').value.trim(), q = Number(input('q').value);
      if (!name || !Number.isFinite(q) || q <= 0) {
        message('Preencha o nome e quanto deseja comprar de cada produto.'); return;
      }
      drafts.push({name,q,u:input('u').value,p:null,discount:0,code:row.dataset.code,itemNumber:row.dataset.itemNumber,done:false});
    }
    if (!drafts.length) return;
    items.push(...drafts);
    $('status').textContent = drafts.length+' produtos da notinha adicionados à lista.';
    save(); dialog.close(); selectTab('lista'); setBuilderOpen(false,true);
  };
})();
