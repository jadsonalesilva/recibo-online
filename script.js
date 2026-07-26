/* =========================================================
   MAGO RECIBOS — lógica do aplicativo
   100% offline: tudo é persistido em localStorage.
========================================================= */

/* ---------- chaves de armazenamento ---------- */
const LS = {
  clientes: 'mr_clientes',
  servicos: 'mr_servicos',
  historico: 'mr_historico',
  empresa: 'mr_empresa',
  seq: 'mr_seq',
  orcamentos: 'mr_orcamentos',
  orcSeq: 'mr_orc_seq'
};

const EMPRESA_PADRAO = {
  nome: 'Mago Soluções',
  documento: '119.726.484-11',
  telefone: '(82) 99360-0940',
  whatsapp: '5582993600940',
  logo: ''
};

/* ---------- helpers de armazenamento ---------- */
function load(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    return fallback;
  }
}
function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

/* ---------- estado em memória ---------- */
let clientes = load(LS.clientes, []);
let servicos = load(LS.servicos, []);
let historico = load(LS.historico, []);
let empresa = load(LS.empresa, EMPRESA_PADRAO);
let reciboSeq = load(LS.seq, 0);
let orcamentos = load(LS.orcamentos, []);
let orcSeq = load(LS.orcSeq, 0);

let currentItems = [];          // itens do recibo em edição
let previewOverrideNumero = null; // usado ao reabrir um recibo do histórico
let currentOrcItems = [];             // itens do orçamento em edição
let previewOverrideOrcNumero = null;  // usado ao reabrir um orçamento salvo

/* ---------- utilidades ---------- */
function uid() {
  return 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function toNumber(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
function formatBRL(n) {
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function todayISO() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
function formatDateLong(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}
function formatDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('pt-BR');
}
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* =========================================================
   NAVEGAÇÃO ENTRE ABAS
========================================================= */
function initTabs() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}
function switchTab(tab) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.tab === tab));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('is-active', s.id === 'tab-' + tab));
}

/* =========================================================
   FORMULÁRIO — CLIENTE
========================================================= */
const clienteSelect = document.getElementById('clienteSelect');
const orcClienteSelect = document.getElementById('orcClienteSelect');

// Atualiza os dois seletores de cliente (recibo e orçamento) de uma vez,
// preservando a seleção atual de cada um quando possível.
function renderClienteSelect() {
  [clienteSelect, orcClienteSelect].forEach(sel => {
    if (!sel) return;
    const atual = sel.value;
    sel.innerHTML = '<option value="">— Selecione um cliente —</option>' +
      clientes.map(c => `<option value="${c.id}">${escapeHtml(c.nome)}${c.telefone ? ' — ' + escapeHtml(c.telefone) : ''}</option>`).join('');
    if (clientes.some(c => c.id === atual)) sel.value = atual;
  });
}

document.getElementById('btnNovoClienteToggle').addEventListener('click', () => {
  const box = document.getElementById('newClientBox');
  box.hidden = !box.hidden;
});

document.getElementById('btnSalvarNovoCliente').addEventListener('click', () => {
  const nome = document.getElementById('novoClienteNome').value.trim();
  const telefone = document.getElementById('novoClienteTelefone').value.trim();
  if (!nome) { document.getElementById('novoClienteNome').focus(); return; }
  const cliente = { id: uid(), nome, telefone };
  clientes.push(cliente);
  save(LS.clientes, clientes);
  renderClienteSelect();
  clienteSelect.value = cliente.id;
  document.getElementById('novoClienteNome').value = '';
  document.getElementById('novoClienteTelefone').value = '';
  document.getElementById('newClientBox').hidden = true;
  renderClientesTable();
  onFormChanged();
});

clienteSelect.addEventListener('change', onFormChanged);

// mesma lógica de "cadastro rápido de cliente", só que na aba de orçamentos
document.getElementById('btnOrcNovoClienteToggle').addEventListener('click', () => {
  const box = document.getElementById('orcNewClientBox');
  box.hidden = !box.hidden;
});

document.getElementById('btnOrcSalvarNovoCliente').addEventListener('click', () => {
  const nome = document.getElementById('orcNovoClienteNome').value.trim();
  const telefone = document.getElementById('orcNovoClienteTelefone').value.trim();
  if (!nome) { document.getElementById('orcNovoClienteNome').focus(); return; }
  const cliente = { id: uid(), nome, telefone };
  clientes.push(cliente);
  save(LS.clientes, clientes);
  renderClienteSelect();
  orcClienteSelect.value = cliente.id;
  document.getElementById('orcNovoClienteNome').value = '';
  document.getElementById('orcNovoClienteTelefone').value = '';
  document.getElementById('orcNewClientBox').hidden = true;
  renderClientesTable();
  onOrcFormChanged();
});

orcClienteSelect.addEventListener('change', onOrcFormChanged);

/* =========================================================
   FORMULÁRIO — ITENS DO RECIBO
========================================================= */
const itemsRowsEl = document.getElementById('itemsRows');
const catalogoSelect = document.getElementById('catalogoSelect');
const orcItemsRowsEl = document.getElementById('orcItemsRows');
const orcCatalogoSelect = document.getElementById('orcCatalogoSelect');

// Atualiza os dois dropdowns de catálogo (recibo e orçamento) de uma vez.
function renderCatalogoSelect() {
  [catalogoSelect, orcCatalogoSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = '<option value="">Adicionar do catálogo…</option>' +
      servicos.map(s => `<option value="${s.id}">${escapeHtml(s.descricao)} — ${formatBRL(s.valor)}</option>`).join('');
  });
}

catalogoSelect.addEventListener('change', () => {
  const s = servicos.find(x => x.id === catalogoSelect.value);
  if (s) addItem(s.descricao, 1, s.valor);
  catalogoSelect.value = '';
});

document.getElementById('btnAddItemVazio').addEventListener('click', () => addItem('', 1, 0));

function addItem(desc, qtd, valor) {
  currentItems.push({ id: uid(), desc, qtd, valor });
  renderItemsRows();
  onFormChanged();
}
function removeItem(id) {
  currentItems = currentItems.filter(i => i.id !== id);
  renderItemsRows();
  onFormChanged();
}

function renderItemsRows() {
  if (currentItems.length === 0) {
    itemsRowsEl.innerHTML = '<div class="no-items-msg">Nenhum item adicionado ainda.</div>';
    return;
  }
  itemsRowsEl.innerHTML = currentItems.map(item => `
    <div class="item-row">
      <input type="text" data-id="${item.id}" data-field="desc" value="${escapeHtml(item.desc)}" placeholder="Descrição do item">
      <input type="number" data-id="${item.id}" data-field="qtd" value="${item.qtd}" min="1" step="1">
      <input type="number" data-id="${item.id}" data-field="valor" value="${item.valor}" min="0" step="0.01">
      <button type="button" class="item-remove" data-remove="${item.id}" title="Remover item">✕</button>
    </div>
  `).join('');
}

// delegação de eventos: edição inline sem perder o foco a cada tecla
itemsRowsEl.addEventListener('input', e => {
  const id = e.target.dataset.id, field = e.target.dataset.field;
  if (!id) return;
  const item = currentItems.find(i => i.id === id);
  if (!item) return;
  item[field] = (field === 'desc') ? e.target.value : toNumber(e.target.value);
  onFormChanged(true); // true = não re-renderiza as linhas (evita perder o foco)
});
itemsRowsEl.addEventListener('click', e => {
  const id = e.target.dataset.remove;
  if (id) removeItem(id);
});

/* ---------- itens do orçamento (mesma lógica, formulário separado) ---------- */
orcCatalogoSelect.addEventListener('change', () => {
  const s = servicos.find(x => x.id === orcCatalogoSelect.value);
  if (s) addOrcItem(s.descricao, 1, s.valor);
  orcCatalogoSelect.value = '';
});

document.getElementById('btnOrcAddItemVazio').addEventListener('click', () => addOrcItem('', 1, 0));

function addOrcItem(desc, qtd, valor) {
  currentOrcItems.push({ id: uid(), desc, qtd, valor });
  renderOrcItemsRows();
  onOrcFormChanged();
}
function removeOrcItem(id) {
  currentOrcItems = currentOrcItems.filter(i => i.id !== id);
  renderOrcItemsRows();
  onOrcFormChanged();
}

function renderOrcItemsRows() {
  if (currentOrcItems.length === 0) {
    orcItemsRowsEl.innerHTML = '<div class="no-items-msg">Nenhum item adicionado ainda.</div>';
    return;
  }
  orcItemsRowsEl.innerHTML = currentOrcItems.map(item => `
    <div class="item-row">
      <input type="text" data-id="${item.id}" data-field="desc" value="${escapeHtml(item.desc)}" placeholder="Descrição do item">
      <input type="number" data-id="${item.id}" data-field="qtd" value="${item.qtd}" min="1" step="1">
      <input type="number" data-id="${item.id}" data-field="valor" value="${item.valor}" min="0" step="0.01">
      <button type="button" class="item-remove" data-remove="${item.id}" title="Remover item">✕</button>
    </div>
  `).join('');
}

orcItemsRowsEl.addEventListener('input', e => {
  const id = e.target.dataset.id, field = e.target.dataset.field;
  if (!id) return;
  const item = currentOrcItems.find(i => i.id === id);
  if (!item) return;
  item[field] = (field === 'desc') ? e.target.value : toNumber(e.target.value);
  onOrcFormChanged(true);
});
orcItemsRowsEl.addEventListener('click', e => {
  const id = e.target.dataset.remove;
  if (id) removeOrcItem(id);
});

/* =========================================================
   FORMULÁRIO — demais campos
========================================================= */
const dataRecebimentoEl = document.getElementById('dataRecebimento');
const meioPagamentoEl = document.getElementById('meioPagamento');
const observacaoEl = document.getElementById('observacao');

[dataRecebimentoEl, meioPagamentoEl, observacaoEl].forEach(el => el.addEventListener('input', onFormChanged));

document.getElementById('btnLimparForm').addEventListener('click', () => {
  currentItems = [];
  clienteSelect.value = '';
  dataRecebimentoEl.value = todayISO();
  meioPagamentoEl.value = 'PIX';
  observacaoEl.value = '';
  previewOverrideNumero = null;
  renderItemsRows();
  onFormChanged();
});

const orcDataEl = document.getElementById('orcData');
const orcValidadeEl = document.getElementById('orcValidade');
const orcObservacaoEl = document.getElementById('orcObservacao');

[orcDataEl, orcValidadeEl, orcObservacaoEl].forEach(el => el.addEventListener('input', onOrcFormChanged));

document.getElementById('btnLimparOrcForm').addEventListener('click', () => {
  currentOrcItems = [];
  orcClienteSelect.value = '';
  orcDataEl.value = todayISO();
  orcValidadeEl.value = '';
  orcObservacaoEl.value = '';
  previewOverrideOrcNumero = null;
  renderOrcItemsRows();
  onOrcFormChanged();
});

/* =========================================================
   CÁLCULO E PREVIEW
========================================================= */
function calcularTotal() {
  return currentItems.reduce((s, i) => s + (toNumber(i.qtd) * toNumber(i.valor)), 0);
}

function getCurrentReciboData() {
  const cliente = clientes.find(c => c.id === clienteSelect.value);
  return {
    numero: previewOverrideNumero ?? (reciboSeq + 1),
    clienteNome: cliente ? cliente.nome : '(cliente não selecionado)',
    clienteTelefone: cliente ? cliente.telefone : '',
    data: dataRecebimentoEl.value || todayISO(),
    meioPagamento: meioPagamentoEl.value,
    itens: currentItems.map(i => ({ desc: i.desc || '(sem descrição)', qtd: toNumber(i.qtd), valor: toNumber(i.valor) })),
    observacao: observacaoEl.value.trim(),
    total: calcularTotal(),
    empresa: { ...empresa }
  };
}

function onFormChanged(skipRowsRerender) {
  document.getElementById('totalFormulario').textContent = formatBRL(calcularTotal());
  renderPreview();
}

function calcularTotalOrc() {
  return currentOrcItems.reduce((s, i) => s + (toNumber(i.qtd) * toNumber(i.valor)), 0);
}

function getCurrentOrcamentoData() {
  const cliente = clientes.find(c => c.id === orcClienteSelect.value);
  return {
    numero: previewOverrideOrcNumero ?? (orcSeq + 1),
    clienteId: cliente ? cliente.id : '',
    clienteNome: cliente ? cliente.nome : '(cliente não selecionado)',
    clienteTelefone: cliente ? cliente.telefone : '',
    data: orcDataEl.value || todayISO(),
    validade: orcValidadeEl.value || '',
    itens: currentOrcItems.map(i => ({ desc: i.desc || '(sem descrição)', qtd: toNumber(i.qtd), valor: toNumber(i.valor) })),
    observacao: orcObservacaoEl.value.trim(),
    total: calcularTotalOrc(),
    empresa: { ...empresa }
  };
}

function onOrcFormChanged(skipRowsRerender) {
  document.getElementById('orcTotalFormulario').textContent = formatBRL(calcularTotalOrc());
  renderOrcPreview();
}

// Monta o HTML do comprovante/proposta dentro de targetEl. Usada tanto pelo
// recibo quanto pelo orçamento — só muda o texto/rótulos via "opts".
function renderReceiptPreview(targetEl, d, opts) {
  opts = opts || {};
  const label = opts.label || 'Recibo';
  const dataLabel = opts.dataLabel || 'Recebido em';
  const boxTitulo = opts.boxTitulo || 'Comprovante de recebimento';
  const boxTextoHtml = opts.boxTextoHtml || `Declaro que recebi de <strong>${escapeHtml(d.clienteNome)}</strong> o valor de <strong>${formatBRL(d.total)}</strong> pelos serviços/itens prestados abaixo, no dia <strong>${formatDateLong(d.data)}</strong>.`;
  const extraLinhaHtml = opts.extraLinhaHtml !== undefined ? opts.extraLinhaHtml : `Meio de pagamento: ${escapeHtml(d.meioPagamento)}`;
  const totalLabel = opts.totalLabel || 'Total recebido';
  const footerNota = opts.footerNota || 'Comprovante gerado digitalmente';

  const logoHtml = d.empresa.logo
    ? `<img src="${d.empresa.logo}" alt="logo">`
    : `<span class="r-logo-fallback">${escapeHtml((d.empresa.nome || 'E').charAt(0).toUpperCase())}</span>`;

  const itensHtml = d.itens.length
    ? d.itens.map(i => `
      <tr>
        <td>${escapeHtml(i.desc)}</td>
        <td>${i.qtd}</td>
        <td>${formatBRL(i.valor)}</td>
        <td>${formatBRL(i.qtd * i.valor)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="color:var(--ink-soft)">Nenhum item adicionado.</td></tr>`;

  targetEl.innerHTML = `
    <div class="r-header">
      <span class="r-recibo-num">${label} #${d.numero}</span>
      <div class="r-header-top">
        <div class="r-logo">${logoHtml}</div>
        <div class="r-header-info">
          <strong>${escapeHtml(d.empresa.nome || 'Sua Empresa')}</strong>
          <div>${escapeHtml(d.empresa.documento || '')}</div>
          <div>${escapeHtml(d.empresa.telefone || '')}</div>
        </div>
      </div>
    </div>
    <div class="r-body">
      <div class="r-row-top">
        <div>
          <div class="r-block-label">Cliente</div>
          <div class="r-cliente-nome">${escapeHtml(d.clienteNome)}</div>
          ${d.clienteTelefone ? `<div class="r-cliente-tel">${escapeHtml(d.clienteTelefone)}</div>` : ''}
        </div>
        <div>
          <div class="r-block-label">${escapeHtml(dataLabel)}</div>
          <div class="r-data-val">${formatDateLong(d.data)}</div>
        </div>
      </div>

      <div class="r-comprovante">
        <div class="r-block-label">${escapeHtml(boxTitulo)}</div>
        <p>${boxTextoHtml}</p>
        ${extraLinhaHtml ? `<div class="r-meio">${extraLinhaHtml}</div>` : ''}
      </div>

      <div class="r-itens-label">Itens / serviços</div>
      <table class="r-table">
        <thead><tr><th>Descrição</th><th>Qtd</th><th>Unit.</th><th>Total</th></tr></thead>
        <tbody>${itensHtml}</tbody>
      </table>

      <div class="r-total"><span>${escapeHtml(totalLabel)}</span><strong>${formatBRL(d.total)}</strong></div>

      ${d.observacao ? `<div class="r-obs">${escapeHtml(d.observacao)}</div>` : ''}
    </div>
    <div class="r-footer">
      <div><strong>${escapeHtml(d.empresa.nome || '')}</strong><span>${escapeHtml(d.empresa.documento || '')}</span></div>
      <div><strong>${escapeHtml(d.empresa.telefone || '')}</strong><span>${escapeHtml(footerNota)}</span></div>
    </div>
  `;
}

function renderPreview() {
  const d = getCurrentReciboData();
  renderReceiptPreview(document.getElementById('reciboPreview'), d);
}

function renderOrcPreview() {
  const d = getCurrentOrcamentoData();
  renderReceiptPreview(document.getElementById('orcamentoPreview'), d, {
    label: 'Orçamento',
    dataLabel: 'Data do orçamento',
    boxTitulo: 'Proposta de orçamento',
    boxTextoHtml: `Proposta de orçamento para <strong>${escapeHtml(d.clienteNome)}</strong>, no valor total de <strong>${formatBRL(d.total)}</strong>, referente aos itens/serviços abaixo.`,
    extraLinhaHtml: d.validade
      ? `Válido até: ${escapeHtml(formatDateLong(d.validade))}`
      : 'Validade não informada',
    totalLabel: 'Total do orçamento',
    footerNota: 'Orçamento gerado digitalmente'
  });
}

/* =========================================================
   SALVAR RECIBO NO HISTÓRICO
========================================================= */
document.getElementById('btnSalvarRecibo').addEventListener('click', () => {
  if (!clienteSelect.value) { alert('Selecione (ou cadastre) um cliente antes de salvar.'); return; }
  if (currentItems.length === 0) { alert('Adicione ao menos um item ao recibo.'); return; }

  reciboSeq += 1;
  save(LS.seq, reciboSeq);

  const d = getCurrentReciboData();
  d.numero = reciboSeq;
  d.id = uid();
  d.criadoEm = new Date().toISOString();

  historico.unshift(d);
  save(LS.historico, historico);

  previewOverrideNumero = d.numero;
  renderPreview();
  renderHistorico();

  const btn = document.getElementById('btnSalvarRecibo');
  const original = btn.textContent;
  btn.textContent = 'Salvo ✓';
  setTimeout(() => { btn.textContent = original; }, 1500);
});

/* =========================================================
   SALVAR ORÇAMENTO
========================================================= */
document.getElementById('btnSalvarOrcamento').addEventListener('click', () => {
  if (!orcClienteSelect.value) { alert('Selecione (ou cadastre) um cliente antes de salvar.'); return; }
  if (currentOrcItems.length === 0) { alert('Adicione ao menos um item ao orçamento.'); return; }

  orcSeq += 1;
  save(LS.orcSeq, orcSeq);

  const d = getCurrentOrcamentoData();
  d.numero = orcSeq;
  d.id = uid();
  d.status = 'pendente';
  d.criadoEm = new Date().toISOString();

  orcamentos.unshift(d);
  save(LS.orcamentos, orcamentos);

  previewOverrideOrcNumero = d.numero;
  renderOrcPreview();
  renderOrcamentosTable();

  const btn = document.getElementById('btnSalvarOrcamento');
  const original = btn.textContent;
  btn.textContent = 'Salvo ✓';
  setTimeout(() => { btn.textContent = original; }, 1500);
});

/* =========================================================
   EXPORTAÇÃO — PDF (via impressão do navegador)
========================================================= */
document.getElementById('btnBaixarPDF').addEventListener('click', () => {
  window.print();
});
document.getElementById('btnOrcBaixarPDF').addEventListener('click', () => {
  window.print();
});

/* =========================================================
   EXPORTAÇÃO — PNG (desenho manual em <canvas>, sem libs externas)
========================================================= */
function isIOS() {
  // detecta iPhone/iPad/iPod, incluindo iPadOS 13+ (que se identifica como Mac)
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

// Converte um <canvas> em PNG e entrega ao usuário. Compartilhado pelo
// recibo e pelo orçamento.
function exportCanvasAsPNG(canvas, fileName) {
  canvas.toBlob(async (blob) => {
    if (!blob) return;

    // No iPhone/iPad, tenta usar o menu de compartilhamento nativo
    // (permite salvar direto no app Fotos).
    if (navigator.share && navigator.canShare) {
      try {
        const file = new File([blob], fileName, { type: 'image/png' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: fileName });
          return;
        }
      } catch (err) {
        if (err && err.name === 'AbortError') return; // usuário cancelou o compartilhamento
        // qualquer outro erro: cai no fallback abaixo
      }
    }

    const url = URL.createObjectURL(blob);
    if (isIOS()) {
      // Safari no iOS ignora o atributo "download" de links — em vez de
      // tentar baixar, abrimos a imagem numa nova aba, onde o usuário
      // pode tocar e segurar para salvar em Fotos.
      window.open(url, '_blank');
    } else {
      const link = document.createElement('a');
      link.download = fileName;
      link.href = url;
      link.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }, 'image/png');
}

document.getElementById('btnBaixarPNG').addEventListener('click', async () => {
  const d = getCurrentReciboData();
  const canvas = await drawReceiptToCanvas(d);
  exportCanvasAsPNG(canvas, `recibo-${d.numero}.png`);
});

document.getElementById('btnOrcBaixarPNG').addEventListener('click', async () => {
  const d = getCurrentOrcamentoData();
  const canvas = await drawOrcamentoToCanvas(d);
  exportCanvasAsPNG(canvas, `orcamento-${d.numero}.png`);
});

function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(' ');
  const lines = [];
  let line = '';
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  });
  if (line) lines.push(line);
  return lines;
}

function loadImagePromise(src) {
  return new Promise(resolve => {
    if (!src) return resolve(null);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

// Calcula onde o conteúdo termina (antes do rodapé), usando os mesmos
// incrementos aplicados durante o desenho real — para que altura do canvas
// e posição do rodapé fiquem sempre consistentes com o que é desenhado.
function computeContentEndY(d, comprovanteLines, obsLines) {
  let cy = 96 + 24;      // header
  cy += 18;               // rótulos "cliente" / "recebido em"
  cy += 6;
  if (d.clienteTelefone) cy += 15;
  cy += 26;

  const boxH = 34 + comprovanteLines.length * 19 + 24; // caixa comprovante
  cy += boxH + 24;

  cy += 18;  // rótulo "itens/serviços"
  cy += 26;  // cabeçalho da tabela

  if (d.itens.length === 0) {
    cy += 30;
  } else {
    d.itens.forEach(() => { cy += 22 + 10; });
  }
  cy += 24;
  cy += 40 + 20; // caixa de total

  if (obsLines.length) {
    cy += 16 + obsLines.length * 16 + 2;
  }
  return cy;
}

async function drawReceiptToCanvas(d, opts) {
  opts = opts || {};
  const previewElId = opts.previewElId || 'reciboPreview';
  const label = opts.label || 'RECIBO';
  const dataLabel = opts.dataLabel || 'RECEBIDO EM';
  const boxTitulo = opts.boxTitulo || 'COMPROVANTE DE RECEBIMENTO';
  const boxTexto = opts.boxTexto || `Declaro que recebi de ${d.clienteNome} o valor de ${formatBRL(d.total)} pelos serviços/itens prestados abaixo, no dia ${formatDateLong(d.data)}.`;
  const extraLinha = opts.extraLinha !== undefined ? opts.extraLinha : `Meio de pagamento: ${d.meioPagamento}`;
  const totalLabel = opts.totalLabel || 'Total recebido';
  const footerNota = opts.footerNota || 'Comprovante gerado digitalmente';

  // largura igual à do card exibido na tela, para manter a mesma proporção do template
  const previewEl = document.getElementById(previewElId);
  const W = Math.round(Math.min(800, Math.max(360, previewEl.clientWidth || 480)));
  const PAD = 26;
  const colors = {
    navy: '#111c33', ink: '#1c2436', soft: '#5b6478',
    border: '#e1e5f0', slate: '#f4f6fb', white: '#ffffff', blue: '#4c63a6'
  };

  // canvas de medição (contexto não depende do tamanho final)
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '13px -apple-system, Segoe UI, Roboto, Arial, sans-serif';
  const comprovanteLines = wrapText(measure, boxTexto, W - PAD * 2 - 32);
  let obsLines = [];
  if (d.observacao) obsLines = wrapText(measure, d.observacao, W - PAD * 2);

  const footH = 66;

  // altura real do conteúdo, usando exatamente os mesmos incrementos do
  // desenho abaixo — garante que o rodapé encoste no conteúdo, sem vão.
  const contentEndY = computeContentEndY(d, comprovanteLines, obsLines);
  const H = Math.ceil(contentEndY) + footH;

  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.white;
  ctx.fillRect(0, 0, W, H);

  const logoImg = await loadImagePromise(d.empresa.logo);

  // header
  ctx.fillStyle = colors.navy;
  ctx.fillRect(0, 0, W, 96);
  ctx.fillStyle = '#c3cbe6';
  ctx.font = '10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${label} #${d.numero}`, W - 18, 20);
  ctx.textAlign = 'left';

  // logo
  const logoX = PAD, logoY = 26, logoSize = 44;
  ctx.fillStyle = colors.white;
  roundRect(ctx, logoX, logoY, logoSize, logoSize, 10);
  ctx.fill();
  if (logoImg) {
    ctx.save();
    roundRect(ctx, logoX, logoY, logoSize, logoSize, 10);
    ctx.clip();
    ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
    ctx.restore();
  } else {
    ctx.fillStyle = colors.blue;
    ctx.font = '700 18px -apple-system, Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText((d.empresa.nome || 'E').charAt(0).toUpperCase(), logoX + logoSize / 2, logoY + logoSize / 2 + 6);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 16px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(d.empresa.nome || 'Sua Empresa', logoX + logoSize + 14, logoY + 16);
  ctx.fillStyle = '#c3cbe6';
  ctx.font = '11px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(d.empresa.documento || '', logoX + logoSize + 14, logoY + 32);
  ctx.fillText(d.empresa.telefone || '', logoX + logoSize + 14, logoY + 46);

  let cy = 96 + 24;
  // cliente / data
  ctx.fillStyle = colors.soft;
  ctx.font = '700 10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText('CLIENTE', PAD, cy);
  ctx.fillText(dataLabel, W / 2 + 10, cy);
  cy += 18;
  ctx.fillStyle = colors.ink;
  ctx.font = '700 14px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(d.clienteNome, PAD, cy);
  ctx.fillText(formatDateLong(d.data), W / 2 + 10, cy);
  cy += 6;
  if (d.clienteTelefone) {
    cy += 15;
    ctx.fillStyle = colors.soft;
    ctx.font = '12px -apple-system, Segoe UI, Arial, sans-serif';
    ctx.fillText(d.clienteTelefone, PAD, cy);
  }
  cy += 26;

  // caixa comprovante
  const boxH = 34 + comprovanteLines.length * 19 + 24;
  ctx.fillStyle = colors.slate;
  roundRect(ctx, PAD, cy, W - PAD * 2, boxH, 10);
  ctx.fill();
  ctx.strokeStyle = colors.border;
  ctx.stroke();
  let ty = cy + 22;
  ctx.fillStyle = colors.soft;
  ctx.font = '700 10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(boxTitulo, PAD + 16, ty);
  ty += 20;
  ctx.fillStyle = colors.ink;
  ctx.font = '13px -apple-system, Segoe UI, Arial, sans-serif';
  comprovanteLines.forEach(line => { ctx.fillText(line, PAD + 16, ty); ty += 19; });
  ty += 4;
  if (extraLinha) {
    ctx.fillStyle = colors.soft;
    ctx.font = '12px -apple-system, Segoe UI, Arial, sans-serif';
    ctx.fillText(extraLinha, PAD + 16, ty);
  }
  cy += boxH + 24;

  // itens
  ctx.fillStyle = colors.soft;
  ctx.font = '700 10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText('ITENS / SERVIÇOS', PAD, cy);
  cy += 18;
  ctx.strokeStyle = colors.border;
  ctx.beginPath(); ctx.moveTo(PAD, cy); ctx.lineTo(W - PAD, cy); ctx.stroke();
  ctx.font = '700 10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText('DESCRIÇÃO', PAD, cy + 16);
  ctx.fillText('QTD', W - PAD - 200, cy + 16);
  ctx.fillText('UNIT.', W - PAD - 130, cy + 16);
  ctx.textAlign = 'right';
  ctx.fillText('TOTAL', W - PAD, cy + 16);
  ctx.textAlign = 'left';
  cy += 26;
  ctx.strokeStyle = colors.border;
  ctx.beginPath(); ctx.moveTo(PAD, cy); ctx.lineTo(W - PAD, cy); ctx.stroke();

  if (d.itens.length === 0) {
    ctx.fillStyle = colors.soft;
    ctx.font = '13px -apple-system, Segoe UI, Arial, sans-serif';
    ctx.fillText('Nenhum item adicionado.', PAD, cy + 20);
    cy += 30;
  } else {
    d.itens.forEach(item => {
      cy += 22;
      ctx.fillStyle = colors.ink;
      ctx.font = '13px -apple-system, Segoe UI, Arial, sans-serif';
      ctx.fillText(truncate(measure, item.desc, W - PAD * 2 - 220), PAD, cy);
      ctx.fillStyle = colors.soft;
      ctx.fillText(String(item.qtd), W - PAD - 200, cy);
      ctx.fillText(formatBRL(item.valor), W - PAD - 130, cy);
      ctx.fillStyle = colors.ink;
      ctx.font = '700 13px -apple-system, Segoe UI, Arial, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatBRL(item.qtd * item.valor), W - PAD, cy);
      ctx.textAlign = 'left';
      cy += 10;
      ctx.strokeStyle = colors.border;
      ctx.beginPath(); ctx.moveTo(PAD, cy); ctx.lineTo(W - PAD, cy); ctx.stroke();
    });
  }
  cy += 24;

  // total
  ctx.fillStyle = colors.slate;
  roundRect(ctx, PAD, cy, W - PAD * 2, 40, 10);
  ctx.fill();
  ctx.fillStyle = colors.ink;
  ctx.font = '600 13px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(totalLabel, PAD + 16, cy + 25);
  ctx.font = '700 16px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(formatBRL(d.total), W - PAD - 16, cy + 26);
  ctx.textAlign = 'left';
  cy += 40 + 20;

  if (obsLines.length) {
    ctx.strokeStyle = colors.border;
    ctx.setLineDash([4, 3]);
    ctx.beginPath(); ctx.moveTo(PAD, cy); ctx.lineTo(W - PAD, cy); ctx.stroke();
    ctx.setLineDash([]);
    cy += 16;
    ctx.fillStyle = colors.soft;
    ctx.font = '12px -apple-system, Segoe UI, Arial, sans-serif';
    obsLines.forEach(line => { ctx.fillText(line, PAD, cy); cy += 16; });
    cy += 2;
  }

  // rodapé — desenhado exatamente onde o conteúdo terminou (sem vão sobrando)
  ctx.fillStyle = colors.navy;
  ctx.fillRect(0, cy, W, footH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 12px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(d.empresa.nome || '', W * 0.28, cy + 28);
  ctx.fillText(d.empresa.telefone || '', W * 0.72, cy + 28);
  ctx.fillStyle = '#8b95b3';
  ctx.font = '10px -apple-system, Segoe UI, Arial, sans-serif';
  ctx.fillText(d.empresa.documento || '', W * 0.28, cy + 44);
  ctx.fillText(footerNota, W * 0.72, cy + 44);
  ctx.textAlign = 'left';

  return canvas;
}

// Desenha o orçamento reaproveitando o mesmo layout do recibo, só trocando
// os rótulos e textos para o contexto de proposta/orçamento.
function drawOrcamentoToCanvas(d) {
  return drawReceiptToCanvas(d, {
    previewElId: 'orcamentoPreview',
    label: 'ORÇAMENTO',
    dataLabel: 'DATA DO ORÇAMENTO',
    boxTitulo: 'PROPOSTA DE ORÇAMENTO',
    boxTexto: `Proposta de orçamento para ${d.clienteNome}, no valor total de ${formatBRL(d.total)}, referente aos itens/serviços abaixo.`,
    extraLinha: d.validade ? `Válido até: ${formatDateLong(d.validade)}` : 'Validade não informada',
    totalLabel: 'Total do orçamento',
    footerNota: 'Orçamento gerado digitalmente'
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function truncate(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
  return t + '…';
}

/* =========================================================
   ORÇAMENTOS — lista e ações (aprovar / recusar / editar / excluir)
========================================================= */
const orcamentosBody = document.getElementById('orcamentosBody');
const buscaOrcamentosEl = document.getElementById('buscaOrcamentos');
const ORC_STATUS_LABEL = { pendente: 'Pendente', aprovado: 'Aprovado', recusado: 'Recusado' };

function renderOrcamentosTable() {
  const termo = buscaOrcamentosEl.value.trim().toLowerCase();
  const lista = orcamentos.filter(o =>
    !termo || o.clienteNome.toLowerCase().includes(termo) || String(o.numero).includes(termo)
  );
  document.getElementById('orcamentosVazio').hidden = orcamentos.length !== 0;
  orcamentosBody.innerHTML = lista.map(o => `
    <tr>
      <td>#${o.numero}</td>
      <td>${escapeHtml(o.clienteNome)}</td>
      <td>${formatDateShort(o.data)}</td>
      <td>${o.validade ? formatDateShort(o.validade) : '—'}</td>
      <td class="num">${formatBRL(o.total)}</td>
      <td><span class="badge badge-${o.status}">${ORC_STATUS_LABEL[o.status] || o.status}</span></td>
      <td>
        <div class="row-actions">
          <button data-ver-orc="${o.id}">Ver / editar</button>
          <button data-aprovar-orc="${o.id}">Aprovar</button>
          <button data-recusar-orc="${o.id}" class="danger">Recusar</button>
          <button data-excluir-orc="${o.id}" class="danger">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

orcamentosBody.addEventListener('click', e => {
  const verId = e.target.dataset.verOrc;
  const aprovarId = e.target.dataset.aprovarOrc;
  const recusarId = e.target.dataset.recusarOrc;
  const excluirId = e.target.dataset.excluirOrc;
  if (verId) abrirOrcamento(verId);
  if (aprovarId) aprovarOrcamento(aprovarId);
  if (recusarId) recusarOrcamento(recusarId);
  if (excluirId) {
    if (confirm('Excluir este orçamento?')) {
      orcamentos = orcamentos.filter(o => o.id !== excluirId);
      save(LS.orcamentos, orcamentos);
      renderOrcamentosTable();
    }
  }
});
buscaOrcamentosEl.addEventListener('input', renderOrcamentosTable);

function abrirOrcamento(id) {
  const o = orcamentos.find(x => x.id === id);
  if (!o) return;
  currentOrcItems = o.itens.map(i => ({ id: uid(), desc: i.desc, qtd: i.qtd, valor: i.valor }));
  const clienteExiste = clientes.some(c => c.id === o.clienteId);
  orcClienteSelect.value = clienteExiste ? o.clienteId : '';
  orcDataEl.value = o.data;
  orcValidadeEl.value = o.validade || '';
  orcObservacaoEl.value = o.observacao || '';
  previewOverrideOrcNumero = o.numero;
  renderOrcItemsRows();
  document.getElementById('orcTotalFormulario').textContent = formatBRL(o.total);
  renderOrcPreview();
  switchTab('orcamentos');
}

function recusarOrcamento(id) {
  const o = orcamentos.find(x => x.id === id);
  if (!o) return;
  if (!confirm(`Marcar o orçamento #${o.numero} como recusado?`)) return;
  o.status = 'recusado';
  save(LS.orcamentos, orcamentos);
  renderOrcamentosTable();
}

// Aprova o orçamento e já leva os dados para a aba "Novo recibo", prontos
// para o usuário escolher o meio de pagamento e finalizar o recibo.
function aprovarOrcamento(id) {
  const o = orcamentos.find(x => x.id === id);
  if (!o) return;

  if (o.status === 'aprovado') {
    if (!confirm('Este orçamento já foi aprovado antes. Deseja gerar um novo recibo a partir dele mesmo assim?')) return;
  } else if (!confirm(`Aprovar o orçamento #${o.numero} de ${o.clienteNome}?`)) {
    return;
  }

  o.status = 'aprovado';
  save(LS.orcamentos, orcamentos);
  renderOrcamentosTable();

  // pré-preenche o formulário de recibo com os dados do orçamento aprovado
  currentItems = o.itens.map(i => ({ id: uid(), desc: i.desc, qtd: i.qtd, valor: i.valor }));
  const clienteExiste = clientes.some(c => c.id === o.clienteId);
  clienteSelect.value = clienteExiste ? o.clienteId : '';
  dataRecebimentoEl.value = todayISO();
  meioPagamentoEl.value = 'PIX';
  observacaoEl.value = o.observacao || '';
  previewOverrideNumero = null;
  renderItemsRows();
  onFormChanged();
  switchTab('novo');
  alert('Orçamento aprovado! Confira o meio de pagamento e clique em "Salvar no histórico" para gerar o recibo.');
}

/* =========================================================
   HISTÓRICO
========================================================= */
const historicoBody = document.getElementById('historicoBody');
const buscaHistorico = document.getElementById('buscaHistorico');

function renderHistorico() {
  const termo = buscaHistorico.value.trim().toLowerCase();
  const lista = historico.filter(r =>
    !termo || r.clienteNome.toLowerCase().includes(termo) || String(r.numero).includes(termo)
  );
  document.getElementById('historicoVazio').hidden = historico.length !== 0;
  historicoBody.innerHTML = lista.map(r => `
    <tr>
      <td>#${r.numero}</td>
      <td>${escapeHtml(r.clienteNome)}</td>
      <td>${formatDateShort(r.data)}</td>
      <td>${escapeHtml(r.meioPagamento)}</td>
      <td class="num">${formatBRL(r.total)}</td>
      <td>
        <div class="row-actions">
          <button data-ver="${r.id}">Ver / reemitir</button>
          <button data-excluir="${r.id}" class="danger">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

historicoBody.addEventListener('click', e => {
  const verId = e.target.dataset.ver;
  const excluirId = e.target.dataset.excluir;
  if (verId) abrirReciboDoHistorico(verId);
  if (excluirId) {
    if (confirm('Excluir este recibo do histórico?')) {
      historico = historico.filter(r => r.id !== excluirId);
      save(LS.historico, historico);
      renderHistorico();
    }
  }
});
buscaHistorico.addEventListener('input', renderHistorico);

function abrirReciboDoHistorico(id) {
  const r = historico.find(x => x.id === id);
  if (!r) return;
  currentItems = r.itens.map(i => ({ id: uid(), desc: i.desc, qtd: i.qtd, valor: i.valor }));
  const clienteExiste = clientes.some(c => c.id === r.clienteId);
  clienteSelect.value = clienteExiste ? r.clienteId : '';
  dataRecebimentoEl.value = r.data;
  meioPagamentoEl.value = r.meioPagamento;
  observacaoEl.value = r.observacao || '';
  previewOverrideNumero = r.numero;
  renderItemsRows();
  document.getElementById('totalFormulario').textContent = formatBRL(r.total);
  renderPreview();
  switchTab('novo');
}

/* =========================================================
   CLIENTES (cadastro)
========================================================= */
const clientesBody = document.getElementById('clientesBody');

function renderClientesTable() {
  document.getElementById('clientesVazio').hidden = clientes.length !== 0;
  clientesBody.innerHTML = clientes.map(c => `
    <tr>
      <td>${escapeHtml(c.nome)}</td>
      <td>${escapeHtml(c.telefone || '—')}</td>
      <td>
        <div class="row-actions">
          <button data-usar="${c.id}">Usar no recibo</button>
          <button data-excluir="${c.id}" class="danger">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btnAddCliente').addEventListener('click', () => {
  const nome = document.getElementById('clienteNomeInput').value.trim();
  const telefone = document.getElementById('clienteTelefoneInput').value.trim();
  if (!nome) return;
  clientes.push({ id: uid(), nome, telefone });
  save(LS.clientes, clientes);
  document.getElementById('clienteNomeInput').value = '';
  document.getElementById('clienteTelefoneInput').value = '';
  renderClientesTable();
  renderClienteSelect();
});

clientesBody.addEventListener('click', e => {
  const usarId = e.target.dataset.usar;
  const excluirId = e.target.dataset.excluir;
  if (usarId) {
    clienteSelect.value = usarId;
    onFormChanged();
    switchTab('novo');
  }
  if (excluirId) {
    if (confirm('Excluir este cliente?')) {
      clientes = clientes.filter(c => c.id !== excluirId);
      save(LS.clientes, clientes);
      renderClientesTable();
      renderClienteSelect();
    }
  }
});

/* =========================================================
   SERVIÇOS / ITENS (catálogo)
========================================================= */
const servicosBody = document.getElementById('servicosBody');

function renderServicosTable() {
  document.getElementById('servicosVazio').hidden = servicos.length !== 0;
  servicosBody.innerHTML = servicos.map(s => `
    <tr>
      <td>${escapeHtml(s.descricao)}</td>
      <td>${formatBRL(s.valor)}</td>
      <td>
        <div class="row-actions">
          <button data-usar="${s.id}">Adicionar ao recibo</button>
          <button data-excluir="${s.id}" class="danger">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

document.getElementById('btnAddServico').addEventListener('click', () => {
  const descricao = document.getElementById('servicoDescInput').value.trim();
  const valor = toNumber(document.getElementById('servicoValorInput').value);
  if (!descricao) return;
  servicos.push({ id: uid(), descricao, valor });
  save(LS.servicos, servicos);
  document.getElementById('servicoDescInput').value = '';
  document.getElementById('servicoValorInput').value = '';
  renderServicosTable();
  renderCatalogoSelect();
});

servicosBody.addEventListener('click', e => {
  const usarId = e.target.dataset.usar;
  const excluirId = e.target.dataset.excluir;
  if (usarId) {
    const s = servicos.find(x => x.id === usarId);
    if (s) { addItem(s.descricao, 1, s.valor); switchTab('novo'); }
  }
  if (excluirId) {
    if (confirm('Excluir este item do catálogo?')) {
      servicos = servicos.filter(s => s.id !== excluirId);
      save(LS.servicos, servicos);
      renderServicosTable();
      renderCatalogoSelect();
    }
  }
});

/* =========================================================
   MINHA EMPRESA
========================================================= */
function renderEmpresaForm() {
  document.getElementById('empNome').value = empresa.nome || '';
  document.getElementById('empDocumento').value = empresa.documento || '';
  document.getElementById('empTelefone').value = empresa.telefone || '';
  document.getElementById('empWhatsapp').value = empresa.whatsapp || '';
  const wrap = document.getElementById('empLogoPreviewWrap');
  if (empresa.logo) {
    wrap.hidden = false;
    document.getElementById('empLogoPreview').src = empresa.logo;
  } else {
    wrap.hidden = true;
  }
}

document.getElementById('empLogoInput').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    empresa.logo = reader.result;
    renderEmpresaForm();
  };
  reader.readAsDataURL(file);
});
document.getElementById('btnRemoverLogo').addEventListener('click', () => {
  empresa.logo = '';
  renderEmpresaForm();
});

document.getElementById('btnSalvarEmpresa').addEventListener('click', () => {
  empresa.nome = document.getElementById('empNome').value.trim();
  empresa.documento = document.getElementById('empDocumento').value.trim();
  empresa.telefone = document.getElementById('empTelefone').value.trim();
  empresa.whatsapp = document.getElementById('empWhatsapp').value.trim();
  save(LS.empresa, empresa);
  onFormChanged();
  const hint = document.getElementById('empSaveHint');
  hint.hidden = false;
  setTimeout(() => hint.hidden = true, 1800);
});

/* =========================================================
   INICIALIZAÇÃO
========================================================= */
function init() {
  initTabs();
  dataRecebimentoEl.value = todayISO();
  orcDataEl.value = todayISO();
  renderClienteSelect();
  renderCatalogoSelect();
  renderItemsRows();
  renderOrcItemsRows();
  renderHistorico();
  renderClientesTable();
  renderServicosTable();
  renderEmpresaForm();
  renderOrcamentosTable();
  onFormChanged();
  onOrcFormChanged();
}

document.addEventListener('DOMContentLoaded', init);
