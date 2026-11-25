/* ============================================================================
 * Portal de Trocas — Medieval Joias (medievaljoias.com.br/pedidos)
 *
 * A cliente cadastra as trocas, imprime os canhotos (por troca ou o pacote) e
 * acompanha o andamento. A equipe trata as trocas no módulo Trocas do Sentinela.
 * Dados no Supabase do Sentinela (tabelas portal_*, bucket portal-anexos).
 * ========================================================================== */
(() => {
  const SUPABASE_URL = 'https://dqiosohjicnruwrhxeou.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxaW9zb2hqaWNucnV3cmh4ZW91Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI0OTI0NzcsImV4cCI6MjA4ODA2ODQ3N30.y5LVH3Lb9xDuHLDVvDaNCrzuS2RsJenI0EqgVtHBWfM';
  const BUCKET = 'portal-anexos';
  // Login por nome de usuário: "giovana" vira giovana@portal.medievaljoias.com.br (e-mail interno, nunca recebe nada)
  const DOMINIO_USUARIO = 'portal.medievaljoias.com.br';
  const paraEmail = (v) => { const t = String(v || '').trim().toLowerCase(); return t.includes('@') ? t : (t ? `${t}@${DOMINIO_USUARIO}` : ''); };
  const usuarioDe = (email) => String(email || '').replace(`@${DOMINIO_USUARIO}`, '');
  const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'mj-portal-auth' }
  });

  /* ── Constantes ─────────────────────────────────────────────── */
  const TIPOS = { troca_aro: 'Troca de aro', troca_modelo: 'Troca de modelo', defeito: 'Defeito', nova_gravacao: 'Nova gravação', regravacao: 'Regravação' };
  const ORDEM = Object.keys(TIPOS);
  const GRAV = ['nova_gravacao', 'regravacao'];
  const FONTES = ['Arial', 'Monotype Corsiva', 'Script MT Bold'];
  // Mesmos caracteres do módulo de Gravação do Sentinela (♥ U+2665, ∞ U+221E) + o coração vazado (♡ U+2661)
  const SIMBOLOS = [{ c: '♥', t: 'Coração' }, { c: '♡', t: 'Coração vazado' }, { c: '∞', t: 'Infinito' }];
  const MAX_ANEXOS = 3;
  // Aros que a Medieval trabalha: sem pedra 10 a 35, com pedra 10 a 25 (só números inteiros)
  const ARO_MIN = 10, ARO_MAX = 35, ARO_MAX_PEDRA = 25;
  const faixaAro = (a) => (a.w === 'Fem.' && a.pedra ? [ARO_MIN, ARO_MAX_PEDRA] : [ARO_MIN, ARO_MAX]);
  function erroAro(a, v) {
    if (v == null || v === '') return '';
    const [min, max] = faixaAro(a);
    const pedra = a.w === 'Fem.' && a.pedra;
    if (!Number.isInteger(v)) return `Use um aro inteiro (ex.: 16). Trabalhamos com aros de ${min} a ${max}${pedra ? ' para aliança com pedra' : ''}.`;
    if (v < min || v > max) return `O aro ${v} não é fornecido. Trabalhamos com aros de ${min} a ${max}${pedra ? ' para aliança com pedra' : ' (com pedra, de 10 a 25)'}.`;
    return '';
  }
  function msgsAro(a, comNovo) {
    const m = [];
    const e1 = erroAro(a, a.de); if (e1) m.push(`Aro atual: ${e1}`);
    if (comNovo) { const e2 = erroAro(a, a.para); if (e2) m.push(`Aro novo: ${e2}`); }
    return m;
  }
  const MAX_BYTES = 10 * 1024 * 1024;
  const QR_TROCA = 'https://medievaljoias.com.br/pedidos/#/t/';
  const QR_PACOTE = 'https://medievaljoias.com.br/pedidos/#/p/';
  const MM = 96 / 25.4, CAP_1 = 281 - 11 - 29, CAP_N = 281 - 11, LONGA = 24;
  const ETAPAS = ['Enviada', 'Recebida pela Medieval', 'Finalizada e enviada de volta'];
  const ST = {
    rascunho: { t: 'No pacote aberto', k: 'neutral' },
    enviada: { t: 'Enviada', k: 'info' },
    recebida: { t: 'Recebida', k: 'warn' },
    concluida: { t: 'Finalizada', k: 'ok' },
    devolvida: { t: 'Finalizada', k: 'ok' },
    cancelada: { t: 'Cancelada', k: 'done' }
  };
  const NOME_ANEL = { 'Fem.': 'Feminina', 'Masc.': 'Masculina' };

  /* ── Utilitários ────────────────────────────────────────────── */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad2 = (n) => String(n).padStart(2, '0');
  const fmt = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16); }));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const ordenar = (tipos) => [...tipos].sort((a, b) => ORDEM.indexOf(a) - ORDEM.indexOf(b));
  const temGrav = (t) => GRAV.some((k) => t.tipos.includes(k));
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  const totalAl = (itens) => itens.reduce((s, t) => s + t.aneis.length, 0);
  const pacoteDe = (codigo) => (codigo || '').split('-').slice(0, 2).join('-');
  const nomeSeguro = (n) => String(n || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '-').slice(-60);
  function msgErro(e) {
    const m = e?.message || String(e);
    if (/Invalid login credentials/i.test(m)) return 'Usuário ou senha incorretos.';
    if (/JSON object requested|0 rows|multiple \(or no\) rows/i.test(m)) return 'Não deu para salvar. A Medieval pode já ter recebido esta troca; recarregue a página.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
    return m;
  }

  /* ── Conversão banco ⇄ tela ─────────────────────────────────── */
  function deDb(r, lote) {
    return {
      id: r.id, loteId: r.lote_id, codigo: r.codigo, ref: r.referencia || '', peca: r.peca === 'par' ? 'Par' : 'Avulsa',
      tipos: r.tipos || [], modelo: r.modelo_atual || '', modeloNovo: r.modelo_novo || '', defeito: r.defeito_descricao || '', obs: r.observacao || '',
      aneis: (r.aneis || []).map((a) => ({
        w: a.identificacao === 'masculina' ? 'Masc.' : 'Fem.',
        de: a.aro_atual ?? null, para: a.aro_novo ?? null, pedra: !!a.pedra,
        gravs: (a.gravacoes || []).map((g) => ({
          local: g.local === 'externa' ? 'Externa' : 'Interna',
          texto: g.texto || '', fonte: g.fonte || 'Arial', outra: !FONTES.includes(g.fonte || 'Arial'),
          anexos: (g.anexos || []).map((x) => ({ id: x.path, path: x.path, nome: x.nome, tipo: x.tipo, tamanho: x.tamanho, url: urlAnexo.get(x.path) || null }))
        }))
      })),
      versao: r.versao, versaoEm: fmt(r.versao_em), impressaVersao: r.impressa_versao, status: r.status,
      nota: r.nota_equipe || '', divergencia: r.divergencia ? (r.divergencia_nota || 'Sim') : '',
      eventos: [
        ['Enviada', lote?.fechado_em], ['Recebida pela Medieval', r.conferido_em], ['Finalizada e enviada de volta', r.devolvido_em || r.concluido_em]
      ].filter(([, d]) => d).map(([acao, d]) => ({ acao, data: fmt(d) }))
    };
  }
  function paraDb(t) {
    return {
      referencia: t.ref, peca: t.peca === 'Par' ? 'par' : 'avulsa', tipos: ordenar(t.tipos),
      modelo_atual: t.modelo, modelo_novo: t.modeloNovo, defeito_descricao: t.defeito, observacao: t.obs,
      aneis: t.aneis.map((a) => ({
        identificacao: a.w === 'Masc.' ? 'masculina' : 'feminina', pedra: a.w === 'Fem.' && !!a.pedra,
        aro_atual: a.de, aro_novo: t.tipos.includes('troca_aro') ? a.para : null,
        gravacoes: a.gravs.map((g) => ({
          local: g.local.toLowerCase(), texto: g.texto, fonte: g.texto ? g.fonte : '',
          anexos: g.anexos.map((x) => ({ path: x.path, nome: x.nome, tipo: x.tipo, tamanho: x.tamanho }))
        }))
      }))
    };
  }

  /* ── Estado ─────────────────────────────────────────────────── */
  let db = { user: null, cliente: null, equipe: false, clientes: [], draft: { lote: null, itens: [] }, lotes: [] };
  const ui = { view: 'boot', form: null, original: null, editId: null, editLote: null, errors: [], invalid: new Set(), lote: null, troca: null, modal: null, flash: null, busca: '', buscaMsg: '', print: null, recemFechado: false, uploads: [], ocupado: false, hashPendente: null };
  const urlAnexo = new Map(); // path → signed URL (miniaturas)

  async function carregarTudo() {
    const { data: cli, error: e0 } = await sb.from('portal_clientes').select('id,nome').eq('user_id', db.user.id).maybeSingle();
    if (e0) throw e0;
    db.cliente = cli || null;
    db.equipe = !cli;
    db.clientes = [];
    if (db.equipe) {
      const { data } = await sb.from('portal_clientes').select('id,nome');
      db.clientes = data || [];
    }
    let rascunhos = [];
    let loteAberto = null;
    if (db.cliente) {
      const { data: abertos, error: e1 } = await sb.rpc('portal_pacote_aberto', { p_criar: false });
      if (e1) throw e1;
      loteAberto = (abertos || [])[0] || null;
      if (loteAberto) {
        const { data, error } = await sb.from('portal_itens').select('*').eq('lote_id', loteAberto.id).order('seq');
        if (error) throw error;
        rascunhos = data || [];
      }
    }
    const { data: lotes, error: e2 } = await sb.from('portal_lotes').select('*').neq('status', 'aberto').order('fechado_em', { ascending: false }).limit(60);
    if (e2) throw e2;
    const ids = (lotes || []).map((l) => l.id);
    let itens = [];
    if (ids.length) {
      const { data, error } = await sb.from('portal_itens').select('*').in('lote_id', ids).order('seq');
      if (error) throw error;
      itens = data || [];
    }
    await assinarAnexos([...rascunhos, ...itens]);
    db.draft = { lote: loteAberto, itens: rascunhos.map((r) => deDb(r, loteAberto)) };
    db.lotes = (lotes || []).map((l) => ({
      id: l.id, codigo: l.codigo, status: l.status, clienteId: l.cliente_id, fechado: fmt(l.fechado_em),
      itens: itens.filter((i) => i.lote_id === l.id).map((r) => deDb(r, l))
    }));
  }
  async function assinarAnexos(linhas) {
    const paths = [];
    linhas.forEach((r) => (r.aneis || []).forEach((a) => (a.gravacoes || []).forEach((g) => (g.anexos || []).forEach((x) => {
      if (String(x.tipo || '').startsWith('image/') && !urlAnexo.has(x.path)) paths.push(x.path);
    }))));
    if (!paths.length) return;
    const { data } = await sb.storage.from(BUCKET).createSignedUrls(paths, 6 * 3600);
    (data || []).forEach((d) => { if (d.signedUrl) urlAnexo.set(d.path, d.signedUrl); });
  }
  function acharTroca(codigo) {
    const d = db.draft.itens.find((t) => t.codigo === codigo);
    if (d) return { t: d, lote: null };
    for (const l of db.lotes) { const t = l.itens.find((x) => x.codigo === codigo); if (t) return { t, lote: l }; }
    return { t: null, lote: null };
  }
  const nomeCliente = (id) => db.clientes.find((c) => c.id === id)?.nome || 'Cliente';

  /* ── QR ─────────────────────────────────────────────────────── */
  const qrCache = new Map();
  function qrSVG(text) {
    if (!text) return '<div class="ph">QR sai ao salvar</div>';
    if (qrCache.has(text)) return qrCache.get(text);
    let out = '<div class="ph">QR</div>';
    try {
      if (typeof qrcode === 'function') { const q = qrcode(0, 'M'); q.addData(text); q.make(); out = q.createSvgTag({ cellSize: 2, margin: 0, scalable: true }); }
    } catch (_) { /* fica o quadro */ }
    qrCache.set(text, out);
    return out;
  }

  /* ── Canhoto (papel) ────────────────────────────────────────── */
  const pTipos = (t) => `<span class="peca">${esc(t.peca)}</span>` + ordenar(t.tipos).map((k) => `<span class="tipo"><span class="chk" aria-hidden="true">✓</span>${esc(TIPOS[k])}</span>`).join('');
  function pAro(t, a) {
    if (a.de == null) return 'aro <b>?</b>';
    if (!t.tipos.includes('troca_aro') || a.para == null) return `aro <b>${a.de}</b>`;
    if (a.para === a.de) return `aro <b>${a.de}</b> (mantém)`;
    return `aro <b>${a.de} → ${a.para}</b>`;
  }
  function pTexto(g) {
    const txt = g.texto || '';
    const linhas = txt.split('\n');
    const total = txt.replace(/\n/g, '').length;
    const nAnexos = (g.anexos || []).length;
    const corpo = total ? `<span class="grav"><q>${linhas.map(esc).join('<span class="br">↵</span>')}</q></span>`
      : `<span class="fonte">${nAnexos ? '(desenho do anexo)' : '(sem texto)'}</span>`;
    const extra = [];
    if (total > LONGA) extra.push(`${total} caracteres${linhas.length > 1 ? ` · ${linhas.length} linhas` : ''}`);
    if (nAnexos) extra.push(`<span class="anx">ANEXO:</span> ${plural(nAnexos, 'arquivo', 'arquivos')} para vetorizar (ver no sistema)`);
    return corpo + (extra.length ? `<span class="cnt">${extra.join(' · ')}</span>` : '');
  }
  const pFonte = (g) => {
    if (!(g.texto || '').trim()) return '<span class="fonte">—</span>';
    const f = (g.fonte || '').trim() || '?';
    return f === 'Arial' ? esc(f) : `<span class="fonte outra">${esc(f)}</span>`;
  };
  function pAneis(t) {
    const grav = temGrav(t);
    const algum = grav && t.aneis.some((a) => a.gravs.length);
    const corpo = t.aneis.map((a) => {
      const gravs = grav ? a.gravs : [];
      const ring = `<tr class="ring"><td colspan="3"><b>${NOME_ANEL[a.w] || esc(a.w)}</b>${a.pedra ? ' · <span class="pedra">com pedra</span>' : ''} · ${pAro(t, a)}${gravs.length ? '' : ' · <span class="fonte">sem gravação</span>'}</td></tr>`;
      return `<tbody>${ring}${gravs.map((g) => `<tr class="gv"><td>${esc(g.local)}</td><td>${pTexto(g)}</td><td>${pFonte(g)}</td></tr>`).join('')}</tbody>`;
    }).join('');
    return `<table class="aneis"><colgroup><col class="cl"><col><col class="cf"></colgroup>${algum ? '<thead><tr><th>Local</th><th>Gravação (texto exato)</th><th>Fonte</th></tr></thead>' : ''}${corpo}</table>`;
  }
  function pLinhas(t) {
    let h = `<div class="prow"><span class="k">Modelo</span><span class="v">${esc(t.modelo) || '<span class="fonte">?</span>'}${t.tipos.includes('troca_modelo') && t.modeloNovo ? ` → <b>${esc(t.modeloNovo)}</b>` : ''}</span></div>`;
    if (t.tipos.includes('defeito') && t.defeito) h += `<div class="prow"><span class="k">Defeito</span><span class="v">${esc(t.defeito)}</span></div>`;
    if (t.obs) h += `<div class="prow"><span class="k">Obs.</span><span class="v">${esc(t.obs)}</span></div>`;
    return h;
  }
  const nomeDoPapel = () => db.cliente?.nome || 'Cliente';
  function pVia(t, via) {
    const label = via === 1 ? `1ª via · <span class="who">${esc(t.clienteNome || nomeDoPapel())}</span>` : '2ª via · <span class="who">Medieval Joias</span>';
    const foot = t.versaoEm
      ? `<span>Atualizada em <b>${t.versaoEm}</b></span><span>Pacote ${pacoteDe(t.codigo)}</span>`
      : '<span>Código e data saem ao salvar</span><span></span>';
    return `<div class="via">
      <div class="via-top">
        <div class="via-id">
          <div class="via-label">${label}</div>
          <div class="code">${esc(t.codigo)}</div>
          <div class="ref">${esc(t.ref) || '<span class="fonte">(sem referência)</span>'}</div>
          <div class="tipos">${pTipos(t)}</div>
        </div>
        <div class="qr">${qrSVG(t.versaoEm ? QR_TROCA + t.codigo : '')}</div>
      </div>
      ${pLinhas(t)}
      ${pAneis(t)}
      <div class="via-foot">${foot}</div>
    </div>`;
  }
  const pStrip = (t) => `<div class="strip">${pVia(t, 1)}${pVia(t, 2)}</div>`;

  function pResumo(itens) {
    const g = new Map();
    itens.forEach((t) => { const k = ordenar(t.tipos).map((x) => TIPOS[x]).join(' + '); g.set(k, (g.get(k) || 0) + t.aneis.length); });
    return [...g.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div><b>${n}</b> ${esc(k)}</div>`).join('');
  }
  function pFolhas({ itens, lote, titulo, nome }) {
    const m = document.getElementById('measure');
    m.innerHTML = `<div class="strips">${itens.map(pStrip).join('')}</div>`;
    const alt = [...m.querySelectorAll('.strip')].map((el) => el.getBoundingClientRect().height / MM);
    m.innerHTML = '';
    const pags = [[]]; let usado = 0;
    itens.forEach((t, i) => {
      const cap = pags.length === 1 && lote ? CAP_1 : CAP_N;
      if (usado + alt[i] > cap && pags[pags.length - 1].length) { pags.push([]); usado = 0; }
      pags[pags.length - 1].push(i); usado += alt[i];
    });
    return pags.map((idx, p) => `<div class="fit"><article class="sheet paper" aria-label="Folha ${p + 1} de ${pags.length}">
      <header class="sheet-head"><span class="bm">Medieval Joias</span><span class="sub">Trocas · ${esc(nome)}</span><span class="grow"></span><span class="page">${esc(titulo)}${pags.length > 1 ? ` · folha ${p + 1} de ${pags.length}` : ''}</span></header>
      ${p === 0 && lote ? `<section class="band">
        <div><div class="k">Pacote</div><div class="lote">${lote.codigo}</div><div class="meta">Fechado por ${esc(nome)} em ${lote.fechado}</div><div class="tot">${plural(lote.itens.length, 'troca', 'trocas')} · ${plural(totalAl(lote.itens), 'aliança', 'alianças')}</div></div>
        <div class="resumo"><div class="k">Resumo (alianças por tipo)</div>${pResumo(lote.itens)}</div>
        <div class="qr">${qrSVG(QR_PACOTE + lote.codigo)}</div></section>` : ''}
      <div class="strips">${idx.map((i) => pStrip(itens[i])).join('')}</div>
    </article></div>`).join('');
  }

  /* ── Pedaços da interface ───────────────────────────────────── */
  const pill = (s) => `<span class="pill ${s.k}">${esc(s.t)}</span>`;
  function impressao(t) {
    if (t.impressaVersao == null) return { t: 'Ainda não impressa', k: 'neutral' };
    if (t.impressaVersao === t.versao) return { t: 'Impressa', k: 'ok' };
    return { t: 'Alterada depois de impressa · imprima de novo', k: 'warn' };
  }
  const precisaImprimir = (t) => t.impressaVersao !== t.versao;
  function loteStatus(l) {
    const s = l.itens.map((i) => i.status);
    if (l.status === 'devolvido' || (s.length && s.every((x) => x === 'devolvida' || x === 'concluida' || x === 'cancelada'))) return { t: 'Finalizado', k: 'ok' };
    if (s.some((x) => x !== 'enviada')) return { t: 'Em andamento', k: 'warn' };
    return { t: 'Aguardando a Medieval receber', k: 'info' };
  }
  const tagsHTML = (t) => `<span class="tag">${esc(t.peca)}</span>` + ordenar(t.tipos).map((k) => `<span class="tag">${esc(TIPOS[k])}</span>`).join('');
  const textoUI = (texto) => esc(texto).split('\n').join('<span class="ret" title="quebra de linha na gravação">↵</span>');
  function aroUI(t, a) {
    if (!t.tipos.includes('troca_aro') || a.para == null) return `aro <b>${a.de ?? '?'}</b>`;
    if (a.para === a.de) return `aro <b>${a.de}</b> (mantém)`;
    return `aro <b>${a.de} → ${a.para}</b>`;
  }
  const miniAnexos = (g) => (g.anexos || []).map((x) => `<span class="mini-th" title="${esc(x.nome)}" style="${x.url ? `background-image:url('${esc(x.url)}')` : ''}"></span>`).join('');
  const textoOuDesenho = (g) => (g.texto ? `<q>${textoUI(g.texto)}</q>` : '<span class="muted">(desenho do anexo)</span>');
  function resumoAneisUI(t) {
    return t.aneis.map((a) => {
      const gr = temGrav(t) ? a.gravs.map((g) => `<div>Gravação ${esc(g.local.toLowerCase())}: ${textoOuDesenho(g)}${g.texto ? ` · fonte ${esc(g.fonte)}` : ''}${(g.anexos || []).length ? ` · ${miniAnexos(g)}${plural(g.anexos.length, 'anexo', 'anexos')}` : ''}</div>`).join('') : '';
      return `<div><b>${NOME_ANEL[a.w] || esc(a.w)}</b>${a.pedra ? ' <span class="pedra-ui">com pedra</span>' : ''} · ${aroUI(t, a)}</div>${gr}`;
    }).join('');
  }
  function tabelaAneisUI(t) {
    return `<div class="t-wrap"><table class="t-aneis"><thead><tr><th>Aliança</th><th>Aro</th><th>Gravação</th></tr></thead><tbody>${t.aneis.map((a) => {
      const gravs = temGrav(t) && a.gravs.length
        ? a.gravs.map((g) => `<div><span class="loc">${esc(g.local)}</span> ${textoOuDesenho(g)} ${g.texto ? `<span class="fnt${g.fonte !== 'Arial' ? ' outra' : ''}">· fonte ${esc(g.fonte)}</span>` : ''}${(g.anexos || []).length ? `<div style="margin-top:4px">${miniAnexos(g)}<span class="muted">${plural(g.anexos.length, 'anexo para vetorizar', 'anexos para vetorizar')}</span></div>` : ''}</div>`).join('')
        : '<span class="muted">sem gravação</span>';
      return `<tr><td><b>${NOME_ANEL[a.w] || esc(a.w)}</b>${a.pedra ? '<br><span class="pedra-ui">com pedra</span>' : ''}</td><td>${aroUI(t, a).replace('aro ', '')}</td><td>${gravs}</td></tr>`;
    }).join('')}</tbody></table></div>`;
  }

  function headerHTML() {
    const n = db.draft.itens.length;
    const emAberto = ui.view === 'aberto' || (ui.view === 'form' && !ui.editLote) || (ui.view === 'imprimir' && ui.print?.origem === 'aberto');
    const nome = db.cliente?.nome || usuarioDe(db.user?.email) || '';
    return `<header class="top"><div class="wrap gutter top-in">
      <div class="brand"><span class="mark">Medieval Joias</span><span class="sub">Trocas</span></div>
      <nav class="tabs" aria-label="Áreas">
        ${db.cliente ? `<button class="tab${emAberto ? ' on' : ''}" data-act="go-aberto" id="tab-aberto">Pacote aberto <span class="count">${n}</span></button>` : ''}
        <button class="tab${!emAberto ? ' on' : ''}" data-act="go-pacotes" id="tab-pacotes">Pacotes enviados</button>
      </nav>
      <div class="user">${db.equipe ? '<span class="proto">Equipe</span>' : ''}<span>${esc(nome)}</span><button class="link" data-act="trocar-senha" id="btn-senha">Trocar senha</button><button class="link" data-act="logout" id="btn-sair">Sair</button></div>
    </div></header>`;
  }
  const flashHTML = () => (ui.flash ? `<div class="flash${ui.flash.warn ? ' warn' : ''} print-hide" role="status"><div>${ui.flash.html}</div></div>` : '');
  const footerHTML = () => '<footer class="foot gutter"><span>Medieval Joias · portal de trocas</span></footer>';
  function modalHTML() {
    if (!ui.modal) return '';
    const m = ui.modal;
    return `<div class="modal" data-act="modal-cancel"><div class="modal-box" role="alertdialog" aria-modal="true" aria-labelledby="modal-t">
      <h2 id="modal-t">${esc(m.title)}</h2>${m.body ? `<p>${m.body}</p>` : ''}
      <div class="modal-actions">${m.run ? `<button class="btn ghost" data-act="modal-cancel" id="modal-cancel">${esc(m.cancel || 'Cancelar')}</button>` : ''}<button class="btn ${m.danger ? 'danger' : 'accent'}" data-act="modal-ok" id="modal-ok">${esc(m.ok)}</button></div>
    </div></div>`;
  }

  /* ── Telas ──────────────────────────────────────────────────── */
  function loginHTML() {
    if (ui.recuperacao) {
      return `<main class="login gutter"><form class="card login-card" data-form="nova-senha">
        <div class="mark">Medieval Joias</div>
        <p class="muted">Crie a sua senha nova (mínimo 8 caracteres)</p>
        <label class="field" for="l-nova"><span>Senha nova</span><input id="l-nova" type="password" minlength="8" autocomplete="new-password" required></label>
        <button class="btn accent" type="submit" id="l-salvar-senha">Salvar senha</button>
        ${db.user ? '<button class="link" type="button" data-act="cancelar-senha" id="l-cancelar-senha" style="justify-self:center">Voltar</button>' : ''}
        ${ui.flash ? `<p class="muted" role="status">${ui.flash.html}</p>` : ''}
      </form></main>`;
    }
    return `<main class="login gutter"><form class="card login-card" data-form="login">
      <div class="mark">Medieval Joias</div>
      <p class="muted">Portal de trocas</p>
      <label class="field" for="l-email"><span>Usuário</span><input id="l-email" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="Ex.: giovana" value="${esc(ui.loginEmail || '')}" required></label>
      <label class="field" for="l-senha"><span>Senha</span><input id="l-senha" type="password" autocomplete="current-password" required></label>
      <button class="btn accent" type="submit" id="l-entrar">Entrar</button>
      <button class="link" type="button" data-act="esqueci" id="l-esqueci" style="justify-self:center">Esqueci a senha</button>
      ${ui.flash ? `<p class="muted" role="status">${ui.flash.html}</p>` : ''}
    </form></main>`;
  }

  function trocaCardHTML(t) {
    return `<article class="card troca-card">
      <div class="tc-top">
        <div class="tc-main">
          <div class="tc-line"><span class="tc-code">${t.codigo}</span>${pill(impressao(t))}</div>
          <div class="tc-ref">${esc(t.ref)}</div>
          <div class="tc-tags">${tagsHTML(t)}</div>
        </div>
        <div class="tc-actions">
          <button class="btn sm${precisaImprimir(t) ? '' : ' ghost'}" data-act="imprimir-troca" data-cod="${t.codigo}" id="im-${t.codigo}">Imprimir</button>
          <button class="btn sm ghost" data-act="editar" data-cod="${t.codigo}" id="ed-${t.codigo}">Editar</button>
          <button class="btn sm ghost danger" data-act="excluir" data-cod="${t.codigo}" id="ex-${t.codigo}">Excluir</button>
        </div>
      </div>
      <div class="tc-body">${t.tipos.includes('troca_modelo') ? `<div>Modelo <b>${esc(t.modelo)}</b> → <b>${esc(t.modeloNovo)}</b></div>` : `<div>Modelo <b>${esc(t.modelo)}</b></div>`}${resumoAneisUI(t)}${t.tipos.includes('defeito') ? `<div>Defeito: ${esc(t.defeito)}</div>` : ''}</div>
    </article>`;
  }
  function abertoHTML() {
    const itens = db.draft.itens;
    const pend = itens.filter(precisaImprimir).length;
    const cod = db.draft.lote?.codigo;
    return `<section class="page">
      <div class="page-head">
        <div><h1>Pacote aberto${cod ? ` <span class="mono" style="font-size:18px;color:var(--muted)">${cod}</span>` : ''}</h1>
          <span class="muted">${plural(itens.length, 'troca', 'trocas')} · ${plural(totalAl(itens), 'aliança', 'alianças')} · fica salvo e você pode continuar outro dia</span></div>
        <button class="btn primary" data-act="nova" id="btn-nova">+ Adicionar troca</button>
      </div>
      <span class="hint">Cada troca pode ser impressa sozinha assim que for salva. Se você alterar uma troca já impressa, imprima só ela de novo.</span>
      ${itens.length ? `<div class="list">${itens.map(trocaCardHTML).join('')}</div>`
        : '<div class="card empty"><strong>Nenhuma troca no pacote ainda</strong>Toque em “Adicionar troca” para começar. Você pode ir juntando as trocas durante a semana.</div>'}
      <div class="close-bar">
        <div><strong>Pronto para mandar?</strong><span class="muted">Ao fechar, o pacote vai para a Medieval e sai a folha de resumo${pend ? `, junto com ${plural(pend, 'canhoto que falta', 'canhotos que faltam')} imprimir` : ''}.</span></div>
        <button class="btn accent" data-act="fechar" id="btn-fechar" ${itens.length ? '' : 'disabled'}>Fechar pacote</button>
      </div>
    </section>`;
  }

  function contador(txt) {
    const n = (txt || '').replace(/\n/g, '').length;
    const l = (txt || '').split('\n').length;
    return `${plural(n, 'caractere', 'caracteres')}${l > 1 ? ` · ${l} linhas` : ''} · Enter pula linha na gravação`;
  }
  const inv = (id) => (ui.invalid.has(id) ? ' is-invalid' : '');
  function gravFormHTML(i, g) {
    const id = `f-a${i}-${g.local}`;
    const escolhida = g.outra ? 'Outra' : g.fonte;
    return `<div class="grav-box">
      <div class="grav-title">Gravação ${g.local.toLowerCase()}</div>
      <div class="field"><label for="${id}-texto" style="font-size:13px;font-weight:600">Texto da gravação</label>
        <textarea id="${id}-texto" class="${inv(`${id}-texto`)}" rows="2" maxlength="200" data-bind="aneis.${i}.gravs.${g.local}.texto" placeholder="Exatamente como deve ser gravado">${esc(g.texto)}</textarea>
        <div class="sym-row"><span>Inserir:</span>${SIMBOLOS.map((s) => `<button type="button" class="sym" data-act="sym" data-target="${id}-texto" data-c="${s.c}" id="${id}-sym-${s.c.codePointAt(0)}"><b aria-hidden="true">${s.c}</b>${s.t}</button>`).join('')}</div>
        <em class="hint" id="${id}-cnt">${contador(g.texto)}</em></div>
      <div class="field"><span id="${id}-lf">Fonte</span>
        <div class="chips" role="radiogroup" aria-labelledby="${id}-lf">${[...FONTES, 'Outra'].map((f) => `<label class="chip-check r"><input type="radio" name="${id}-fonte" id="${id}-fonte-${f.replace(/\s+/g, '')}" value="${f}" data-change="fonte" data-i="${i}" data-local="${g.local}"${escolhida === f ? ' checked' : ''}><span class="box">✓</span>${f === 'Outra' ? 'Outra…' : f}</label>`).join('')}</div>
        ${g.outra ? `<input id="${id}-fonte-nome" class="${inv(`${id}-fonte-nome`)}" data-bind="aneis.${i}.gravs.${g.local}.fonte" value="${esc(g.fonte)}" placeholder="Escreva o nome da fonte" maxlength="40" autocomplete="off" style="max-width:320px">` : ''}
      </div>
      <div class="field"><span>Anexo <em>(opcional)</em></span>
        ${(g.anexos || []).length ? `<div class="anexos">${g.anexos.map((x) => `<div class="anexo">
            <div class="th${x.enviando ? ' enviando' : ''}" style="${x.url ? `background-image:url('${esc(x.url)}')` : ''}">${x.enviando ? 'Enviando…' : (x.url ? '' : 'PDF')}</div>
            <span class="nm" title="${esc(x.nome)}">${esc(x.nome)}</span>
            ${x.enviando ? '' : `<button type="button" class="link" data-act="anexo-remover" data-i="${i}" data-local="${g.local}" data-id="${esc(x.id)}">Remover</button>`}
          </div>`).join('')}</div>` : ''}
        ${(g.anexos || []).length < MAX_ANEXOS ? `<label class="btn sm file-btn" style="justify-self:start" for="${id}-anexo">Anexar foto ou desenho<input type="file" id="${id}-anexo" accept="image/*,application/pdf" multiple data-change="anexo" data-i="${i}" data-local="${g.local}"></label>` : ''}
        <em class="hint">Para quando a gravação for um desenho ou símbolo que precisa ser vetorizado. Até ${MAX_ANEXOS} arquivos (foto, imagem ou PDF, até 10 MB cada).</em>
      </div>
    </div>`;
  }
  function anelFormHTML(a, i, f) {
    const has = (k) => f.tipos.includes(k);
    const titulo = f.aneis.length > 1 ? `Aliança ${i + 1}` : 'Aliança';
    return `<div class="anel">
      <div class="anel-title">${titulo}</div>
      <div class="anel-grid">
        <div class="field f-w"><span id="f-a${i}-lw">De quem é</span>
          <div class="seg" role="radiogroup" aria-labelledby="f-a${i}-lw">
            <label><input type="radio" name="f-a${i}-w" id="f-a${i}-w-f" value="Fem." data-change="anel-w" data-i="${i}"${a.w === 'Fem.' ? ' checked' : ''}>Feminina</label>
            <label><input type="radio" name="f-a${i}-w" id="f-a${i}-w-m" value="Masc." data-change="anel-w" data-i="${i}"${a.w === 'Masc.' ? ' checked' : ''}>Masculina</label>
          </div></div>
        <label class="field" for="f-a${i}-de"><span>Aro atual</span><input id="f-a${i}-de" class="${inv(`f-a${i}-de`)}${erroAro(a, a.de) ? ' is-invalid' : ''}" type="number" inputmode="numeric" step="1" min="${faixaAro(a)[0]}" max="${faixaAro(a)[1]}" data-bind="aneis.${i}.de" value="${a.de ?? ''}"></label>
        ${has('troca_aro') ? `<label class="field" for="f-a${i}-para"><span>Aro novo <em>(igual = mantém)</em></span><input id="f-a${i}-para" class="${inv(`f-a${i}-para`)}${erroAro(a, a.para) ? ' is-invalid' : ''}" type="number" inputmode="numeric" step="1" min="${faixaAro(a)[0]}" max="${faixaAro(a)[1]}" data-bind="aneis.${i}.para" value="${a.para ?? ''}"></label>` : ''}
      </div>
      <div class="aro-msg" id="f-a${i}-aro-msg" role="alert">${msgsAro(a, has('troca_aro')).map(esc).join('<br>')}</div>
      <span class="hint">Aros de ${faixaAro(a)[0]} a ${faixaAro(a)[1]}${a.w === 'Fem.' && a.pedra ? ' (com pedra)' : ''}.</span>
      ${a.w === 'Fem.' ? `<div class="chips"><label class="chip-check"><input type="checkbox" id="f-a${i}-pedra" data-change="pedra" data-i="${i}"${a.pedra ? ' checked' : ''}><span class="box">✓</span>Com pedra</label></div>` : ''}
      ${temGrav(f) ? `<div class="gravs">
        <span class="sub-label" id="lbl-g${i}">Onde gravar</span>
        <div class="chips" role="group" aria-labelledby="lbl-g${i}">${['Interna', 'Externa'].map((loc) => `<label class="chip-check"><input type="checkbox" id="f-a${i}-g-${loc}" data-change="grav-local" data-i="${i}" value="${loc}"${a.gravs.some((g) => g.local === loc) ? ' checked' : ''}><span class="box">✓</span>${loc}</label>`).join('')}</div>
        ${a.gravs.map((g) => gravFormHTML(i, g)).join('') || '<span class="hint">Marque interna, externa ou as duas.</span>'}
      </div>` : ''}
    </div>`;
  }
  function formHTML() {
    const f = ui.form;
    const has = (k) => f.tipos.includes(k);
    const voltar = ui.editLote ? `<button class="link back" data-act="troca" data-cod="${f.codigo}" id="f-voltar">← ${f.codigo}</button>` : '<button class="link back" data-act="go-aberto" id="f-voltar">← Pacote aberto</button>';
    const jaImpressa = ui.editId && f.impressaVersao === f.versao;
    const enviando = f.aneis.some((a) => a.gravs.some((g) => (g.anexos || []).some((x) => x.enviando)));
    const erros = ui.errors.length ? `<div class="errors" role="alert" id="erros"><strong>Falta pouco para salvar:</strong><ul>${ui.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : '';
    return `<section class="page">
      ${voltar}
      <div class="page-head"><div><h1>${ui.editId ? `Editar troca <span class="mono" style="font-size:18px;color:var(--muted)">${f.codigo}</span>` : 'Nova troca'}</h1>
        <span class="muted">${ui.editId ? (jaImpressa ? 'Esta troca já foi impressa. Se você mudar algo, imprima só ela de novo e troque o papel na aliança.' : 'Ainda não foi impressa. Pode mudar à vontade.') : 'Ao salvar, a troca ganha o código e já pode ser impressa.'}</span></div></div>
      ${erros}
      <form class="form" data-form="troca" novalidate>
        <fieldset class="card"><legend>Cliente</legend>
          <label class="field" for="f-ref"><span>Referência</span>
            <input id="f-ref" class="${inv('f-ref')}" data-bind="ref" maxlength="60" value="${esc(f.ref)}" placeholder="Nome do cliente ou nº do pedido" autocomplete="off">
            <em class="hint">Sai no canhoto para você saber de quem é a troca.</em></label>
        </fieldset>
        <fieldset class="card"><legend>Peça e o que precisa ser feito</legend>
          <div class="field"><span id="lbl-peca">Peça</span>
            <div class="seg" role="radiogroup" aria-labelledby="lbl-peca">
              <label><input type="radio" name="peca" id="f-peca-par" value="Par" data-change="peca"${f.peca === 'Par' ? ' checked' : ''}>Par</label>
              <label><input type="radio" name="peca" id="f-peca-av" value="Avulsa" data-change="peca"${f.peca === 'Avulsa' ? ' checked' : ''}>Avulsa</label>
            </div></div>
          <div class="field"><span id="lbl-tipos">O que precisa ser feito</span>
            <div class="chips${ui.invalid.has('f-tipos') ? ' is-invalid' : ''}" role="group" aria-labelledby="lbl-tipos" style="border-radius:10px">${ORDEM.map((k) => `<label class="chip-check"><input type="checkbox" id="f-tipo-${k}" value="${k}" data-change="tipo"${has(k) ? ' checked' : ''}><span class="box">✓</span>${TIPOS[k]}</label>`).join('')}</div>
            <em class="hint">Marque tudo o que vale para esta troca.</em></div>
        </fieldset>
        <fieldset class="card"><legend>Modelo</legend>
          <div class="grid2">
            <label class="field" for="f-modelo"><span>Modelo atual</span><input id="f-modelo" class="${inv('f-modelo')}" data-bind="modelo" maxlength="60" value="${esc(f.modelo)}" placeholder="Ex.: Anatômica 6 mm polida" autocomplete="off"></label>
            ${has('troca_modelo') ? `<label class="field" for="f-modelo-novo"><span>Modelo novo</span><input id="f-modelo-novo" class="${inv('f-modelo-novo')}" data-bind="modeloNovo" maxlength="60" value="${esc(f.modeloNovo)}" placeholder="Para qual modelo vai" autocomplete="off"></label>` : ''}
          </div>
        </fieldset>
        <fieldset class="card"><legend>${f.aneis.length > 1 ? 'Alianças do par' : 'Aliança'}</legend>
          ${f.aneis.map((a, i) => anelFormHTML(a, i, f)).join('')}
        </fieldset>
        ${has('defeito') ? `<fieldset class="card"><legend>Defeito</legend><label class="field" for="f-defeito"><span>O que está com defeito</span><textarea id="f-defeito" class="${inv('f-defeito')}" data-bind="defeito" rows="2" maxlength="300" placeholder="Descreva o que você viu na peça">${esc(f.defeito)}</textarea></label></fieldset>` : ''}
        <fieldset class="card"><legend>Observação</legend><label class="field" for="f-obs"><span>Observação <em>(opcional)</em></span><textarea id="f-obs" data-bind="obs" rows="2" maxlength="300" placeholder="Algo que a Medieval precisa saber">${esc(f.obs)}</textarea></label></fieldset>
        <section class="card preview"><div class="preview-head"><h2>Prévia do canhoto</h2><span class="muted">Assim esta troca vai sair no papel. Atualiza enquanto você preenche.</span></div><div class="fit" id="preview"></div></section>
        <div class="form-actions"><button type="button" class="btn ghost" data-act="${ui.editLote ? 'troca' : 'go-aberto'}" data-cod="${f.codigo || ''}" id="f-cancelar">Cancelar</button><button type="submit" class="btn accent" id="f-salvar"${enviando || ui.ocupado ? ' disabled' : ''}>${enviando ? 'Enviando anexo…' : 'Salvar troca'}</button></div>
      </form>
    </section>`;
  }

  function barraHTML(itens) {
    const n = itens.length || 1;
    const c = { enviada: 0, recebida: 0, devolvida: 0 };
    itens.forEach((t) => { const st = t.status === 'concluida' ? 'devolvida' : t.status; if (st in c) c[st] += 1; });
    const ordem = ['devolvida', 'recebida', 'enviada'];
    const bar = ordem.filter((s) => c[s]).map((s) => `<span class="${ST[s].k}" style="width:${(c[s] / n) * 100}%"></span>`).join('');
    const leg = ordem.filter((s) => c[s]).map((s) => `<span><i class="${ST[s].k}"></i>${c[s]} ${ST[s].t.toLowerCase()}${c[s] > 1 ? 's' : ''}</span>`).join('');
    return `<div class="bar" aria-hidden="true">${bar}</div><div class="legend">${leg}</div>`;
  }
  function pacotesHTML() {
    return `<section class="page">
      <div class="page-head"><div><h1>Pacotes enviados</h1><span class="muted">Acompanhe cada troca depois que o pacote saiu.</span></div></div>
      <form class="search" data-form="buscar" role="search">
        <input id="busca" value="${esc(ui.busca)}" placeholder="Código (ex.: TR-0041-02) ou link do QR" aria-label="Buscar por código" autocomplete="off">
        <button class="btn" type="submit" id="btn-buscar">Buscar</button>
        <button class="btn" type="button" data-act="camera" id="btn-camera" title="Abre a câmera para ler o QR do canhoto">Ler QR com a câmera</button>
      </form>
      ${ui.buscaMsg ? `<div class="flash warn" role="status"><div>${esc(ui.buscaMsg)}</div></div>` : ''}
      ${db.lotes.length ? `<div class="list">${db.lotes.map((l) => `<button class="card lote-card" data-act="lote" data-cod="${l.codigo}" id="lote-${l.codigo}">
          <div class="lc-top"><span class="mono">${l.codigo}</span>${pill(loteStatus(l))}</div>
          <div class="lc-meta">${db.equipe ? `${esc(nomeCliente(l.clienteId))} · ` : ''}Fechado em ${l.fechado} · ${plural(l.itens.length, 'troca', 'trocas')} · ${plural(totalAl(l.itens), 'aliança', 'alianças')}</div>
          ${barraHTML(l.itens)}
        </button>`).join('')}</div>` : '<div class="card empty"><strong>Nenhum pacote enviado ainda</strong>Quando você fechar um pacote, ele aparece aqui.</div>'}
    </section>`;
  }

  function pacoteHTML() {
    const l = db.lotes.find((x) => x.codigo === ui.lote);
    if (!l) return pacotesHTML();
    return `<section class="page">
      <button class="link back" data-act="go-pacotes" id="p-voltar">← Pacotes enviados</button>
      <div class="page-head">
        <div><h1 class="mono">${l.codigo}</h1><span class="muted">Fechado em ${l.fechado} · ${plural(l.itens.length, 'troca', 'trocas')} · ${plural(totalAl(l.itens), 'aliança', 'alianças')}</span></div>
        ${pill(loteStatus(l))}
      </div>
      <div class="actions"><button class="btn" data-act="imprimir-pacote" data-cod="${l.codigo}" id="p-imprimir">Imprimir pacote</button><span class="hint">Para imprimir ou alterar uma troca só, abra a troca.</span></div>
      <div class="card" style="display:grid;gap:8px">${barraHTML(l.itens)}
        <div class="rows">${l.itens.map((t) => `<button class="row-btn" data-act="troca" data-cod="${t.codigo}" id="t-${t.codigo}">
          <span class="mono">${t.codigo}</span>
          <span class="rb-main"><span>${esc(t.ref)}</span><span>${esc(t.peca)} · ${ordenar(t.tipos).map((k) => TIPOS[k]).join(', ')}</span></span>
          <span class="rb-pills">${pill(ST[t.status] || ST.enviada)}${precisaImprimir(t) && t.status === 'enviada' ? pill(impressao(t)) : ''}</span>
        </button>`).join('')}</div>
      </div>
    </section>`;
  }

  function trocaHTML() {
    const { t, lote: l } = acharTroca(ui.troca);
    if (!t || !l) return pacotesHTML();
    const feitos = new Map(t.eventos.map((e) => [e.acao, e.data]));
    const linha = ETAPAS.map((s) => `<li class="${feitos.has(s) ? 'done' : ''}"><span class="dot">✓</span><div><div class="tl-t">${s}</div><div class="tl-d">${feitos.get(s) || 'ainda não'}</div></div></li>`).join('');
    const dl = [
      ['Peça', esc(t.peca)],
      ['Tipo', ordenar(t.tipos).map((k) => `<span class="tag">${TIPOS[k]}</span>`).join(' ')],
      ['Modelo', esc(t.modelo) + (t.tipos.includes('troca_modelo') ? ` → <b>${esc(t.modeloNovo)}</b>` : '')],
      ...(t.tipos.includes('defeito') ? [['Defeito', esc(t.defeito)]] : []),
      ...(t.obs ? [['Observação', esc(t.obs)]] : []),
      ['Atualizada em', `${t.versaoEm} ${pill(impressao(t))}`]
    ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const podeEditar = t.status === 'enviada' && !!db.cliente;
    return `<section class="page">
      <button class="link back" data-act="lote" data-cod="${l.codigo}" id="tr-voltar">← Pacote ${l.codigo}</button>
      <div class="page-head"><div><h1 class="mono">${t.codigo}</h1><span class="muted">${esc(t.ref)}</span></div>${pill(ST[t.status] || ST.enviada)}</div>
      <div class="actions">
        <button class="btn${precisaImprimir(t) ? ' accent' : ''}" data-act="imprimir-troca" data-cod="${t.codigo}" id="tr-imprimir">Imprimir esta troca</button>
        ${podeEditar ? `<button class="btn ghost" data-act="editar" data-cod="${t.codigo}" id="tr-editar">Alterar</button><span class="hint">Dá para alterar enquanto a Medieval não receber esta troca.</span>` : ''}
      </div>
      <div class="two">
        <section class="card" style="display:grid;gap:14px"><h2>O que você enviou</h2><dl class="dl">${dl}</dl>${tabelaAneisUI(t)}</section>
        <section class="card track"><h2>Acompanhamento</h2><ol class="timeline">${linha}</ol>
          ${t.divergencia ? `<div class="note warn"><b>Diferença do que foi descrito</b><span>${esc(t.divergencia)}</span></div>` : ''}
          ${t.nota ? `<div class="note"><b>O que a Medieval fez</b><span>${esc(t.nota)}</span></div>` : (t.status === 'enviada' ? '<span class="hint">A Medieval ainda não recebeu esta troca.</span>' : '<span class="hint">A Medieval está cuidando desta troca.</span>')}
        </section>
      </div>
    </section>`;
  }

  function itensDaImpressao() {
    const p = ui.print;
    if (!p) return [];
    if (p.tipo === 'troca') { const { t } = acharTroca(p.troca); return t ? [t] : []; }
    const l = db.lotes.find((x) => x.codigo === p.lote);
    return l ? l.itens.filter((t) => p.ids.includes(t.id)) : [];
  }
  function imprimirHTML() {
    const p = ui.print;
    const itens = itensDaImpressao();
    const nome = db.cliente?.nome || 'Cliente';
    if (p.tipo === 'troca') {
      const t = itens[0];
      if (!t) return abertoHTML();
      const voltar = p.origem === 'aberto' ? '<button class="link back print-hide" data-act="go-aberto" id="i-voltar">← Pacote aberto</button>' : `<button class="link back print-hide" data-act="troca" data-cod="${t.codigo}" id="i-voltar">← ${t.codigo}</button>`;
      return `<section class="page">
        ${voltar}
        <div class="page-head print-hide"><div><h1>Imprimir <span class="mono">${t.codigo}</span></h1><span class="muted">${esc(t.ref)} · a tira sai no topo de uma folha A4</span></div>
          <button class="btn accent" data-act="imprimir-ja" id="i-imprimir">Imprimir</button></div>
        <div class="sheets">${pFolhas({ itens: [t], lote: null, titulo: `Troca ${t.codigo}`, nome })}</div>
      </section>`;
    }
    const l = db.lotes.find((x) => x.codigo === p.lote);
    if (!l) return pacotesHTML();
    const pend = l.itens.filter(precisaImprimir).length;
    const nomeL = db.equipe ? nomeCliente(l.clienteId) : nome;
    return `<section class="page">
      <button class="link back print-hide" data-act="lote" data-cod="${l.codigo}" id="i-voltar">← Pacote ${l.codigo}</button>
      ${ui.recemFechado ? `<div class="flash print-hide" role="status"><div><b>Pacote ${l.codigo} fechado.</b> Imprima a folha de resumo para ir dentro do pacote${pend ? ` e os ${plural(pend, 'canhoto que ainda falta', 'canhotos que ainda faltam')}` : ''}. Corte nas linhas tracejadas e grampeie cada tira na sua aliança.</div></div>` : ''}
      <div class="page-head print-hide"><div><h1>Imprimir pacote <span class="mono">${l.codigo}</span></h1><span class="muted">Folha de resumo + canhotos · tiras de 6 cm</span></div>
        <button class="btn accent" data-act="imprimir-ja" id="i-imprimir">Imprimir</button></div>
      <div class="field print-hide"><span id="lbl-filtro">Canhotos que entram</span>
        <div class="seg" role="radiogroup" aria-labelledby="lbl-filtro">
          <label><input type="radio" name="filtro" id="filtro-todas" value="todas" data-change="filtro"${p.filtro === 'todas' ? ' checked' : ''}>Todas (${l.itens.length})</label>
          <label><input type="radio" name="filtro" id="filtro-pend" value="pendentes" data-change="filtro"${p.filtro === 'pendentes' ? ' checked' : ''}>Só as que faltam (${pend})</label>
        </div></div>
      <div class="sheets">${pFolhas({ itens: itens.map((t) => ({ ...t, clienteNome: nomeL })), lote: l, titulo: `Pacote ${l.codigo}`, nome: nomeL })}</div>
    </section>`;
  }

  /* ── Render ─────────────────────────────────────────────────── */
  function render(manterFoco) {
    const ativo = manterFoco ? document.activeElement?.id : null;
    const app = document.getElementById('app');
    if (ui.view === 'boot') { app.innerHTML = '<div class="boot">Carregando…</div>'; return; }
    if (ui.view === 'login') { app.innerHTML = loginHTML() + modalHTML(); return; }
    let corpo = '';
    if (ui.view === 'aberto') corpo = abertoHTML();
    else if (ui.view === 'form') corpo = formHTML();
    else if (ui.view === 'pacotes') corpo = pacotesHTML();
    else if (ui.view === 'pacote') corpo = pacoteHTML();
    else if (ui.view === 'troca') corpo = trocaHTML();
    else if (ui.view === 'imprimir') corpo = imprimirHTML();
    app.innerHTML = headerHTML() + `<main class="main wrap gutter" id="main">${flashHTML()}${corpo}</main>` + footerHTML() + modalHTML();
    if (ui.view === 'form') atualizarPrevia();
    encaixar();
    if (ativo) document.getElementById(ativo)?.focus();
    if (ui.modal) document.getElementById('modal-ok')?.focus();
  }
  function ir(view, extra = {}) {
    Object.assign(ui, { view, flash: null, modal: null, buscaMsg: '', recemFechado: false }, extra);
    render();
    window.scrollTo(0, 0);
  }
  const inicio = () => (db.cliente ? 'aberto' : 'pacotes');
  function encaixar() {
    document.querySelectorAll('.fit').forEach((f) => {
      const inner = f.firstElementChild;
      if (!inner) return;
      inner.style.transform = 'none';
      const s = Math.min(1, f.clientWidth / inner.offsetWidth);
      inner.style.transform = `scale(${s})`;
      f.style.height = `${inner.offsetHeight * s}px`;
    });
  }
  function atualizarPrevia() {
    const el = document.getElementById('preview');
    if (!el || !ui.form) return;
    const t = { ...ui.form };
    if (!t.codigo) t.codigo = `${db.draft.lote?.codigo || 'TR-····'}-${pad2((db.draft.lote?.seq || 0) + 1)}`;
    if (ui.editId && dadosMudaram(ui.original, ui.form) && ui.form.impressaVersao === ui.form.versao) t.versao = ui.form.versao + 1;
    el.innerHTML = `<div class="paper strip-wrap">${pStrip(t)}</div>`;
    encaixar();
  }
  function erroFlash(e) {
    ui.flash = { html: `<b>Não deu certo.</b> ${esc(msgErro(e))}`, warn: true };
    ui.ocupado = false;
    render();
    window.scrollTo(0, 0);
  }
  async function recarregar() {
    await carregarTudo();
  }

  /* ── Formulário ─────────────────────────────────────────────── */
  const anel = (w, de, para = null, gravs = [], pedra = false) => ({ w, de, para, gravs, pedra });
  const novaTroca = () => ({ id: uuid(), codigo: '', ref: '', peca: 'Par', tipos: [], modelo: '', modeloNovo: '', defeito: '', obs: '',
    aneis: [anel('Fem.', null), anel('Masc.', null)], versao: 1, versaoEm: null, impressaVersao: null, status: 'rascunho' });
  function setPath(f, path, valor) {
    const p = path.split('.');
    if (p[0] !== 'aneis') { f[p[0]] = valor; return; }
    const a = f.aneis[Number(p[1])];
    if (p[2] === 'gravs') { const g = a.gravs.find((x) => x.local === p[3]); if (g) g[p[4]] = valor; return; }
    a[p[2]] = valor === '' ? null : Number(valor);
  }
  function validar(f) {
    const e = [], bad = new Set();
    const has = (k) => f.tipos.includes(k);
    if (!f.ref.trim()) { e.push('Preencha a referência (nome do cliente ou nº do pedido).'); bad.add('f-ref'); }
    if (!f.tipos.length) { e.push('Marque o que precisa ser feito nesta troca.'); bad.add('f-tipos'); }
    if (!f.modelo.trim()) { e.push('Preencha o modelo atual.'); bad.add('f-modelo'); }
    if (has('troca_modelo') && !f.modeloNovo.trim()) { e.push('Preencha o modelo novo.'); bad.add('f-modelo-novo'); }
    f.aneis.forEach((a, i) => {
      const qual = f.aneis.length > 1 ? `da aliança ${i + 1}` : 'da aliança';
      if (!a.de) { e.push(`Preencha o aro atual ${qual}.`); bad.add(`f-a${i}-de`); }
      if (has('troca_aro') && !a.para) { e.push(`Preencha o aro novo ${qual}.`); bad.add(`f-a${i}-para`); }
      if (erroAro(a, a.de)) { e.push(`Aro atual ${qual}: ${erroAro(a, a.de)}`); bad.add(`f-a${i}-de`); }
      if (has('troca_aro') && erroAro(a, a.para)) { e.push(`Aro novo ${qual}: ${erroAro(a, a.para)}`); bad.add(`f-a${i}-para`); }
      if (temGrav(f)) a.gravs.forEach((g) => {
        if (!g.texto.trim() && !(g.anexos || []).length) { e.push(`Escreva o texto da gravação ${g.local.toLowerCase()} ${qual} ou anexe o desenho.`); bad.add(`f-a${i}-${g.local}-texto`); }
        if (g.texto.trim() && !g.fonte.trim()) { e.push(`Escreva o nome da fonte da gravação ${g.local.toLowerCase()} ${qual}.`); bad.add(`f-a${i}-${g.local}-fonte-nome`); }
      });
    });
    if (has('troca_aro') && f.aneis.every((a) => a.de && a.para && a.de === a.para)) { e.push('Nenhum aro muda. Ajuste o aro novo ou desmarque “Troca de aro”.'); f.aneis.forEach((a, i) => bad.add(`f-a${i}-para`)); }
    if (temGrav(f) && !f.aneis.some((a) => a.gravs.length)) e.push('Marque se a gravação é interna ou externa em pelo menos uma aliança.');
    if (has('defeito') && !f.defeito.trim()) { e.push('Descreva o defeito.'); bad.add('f-defeito'); }
    return { e, bad };
  }
  function normalizar(f) {
    const t = clone(f);
    const has = (k) => t.tipos.includes(k);
    t.ref = t.ref.trim(); t.modelo = t.modelo.trim(); t.modeloNovo = has('troca_modelo') ? t.modeloNovo.trim() : '';
    t.defeito = has('defeito') ? t.defeito.trim() : ''; t.obs = t.obs.trim();
    t.aneis.forEach((a) => {
      if (!has('troca_aro')) a.para = null;
      a.pedra = a.w === 'Fem.' && !!a.pedra;
      a.gravs = temGrav(t) ? a.gravs.map((g) => ({ ...g, fonte: g.fonte.trim(), anexos: (g.anexos || []).filter((x) => !x.enviando) })) : [];
    });
    return t;
  }
  const dadosDe = (t) => JSON.stringify(paraDb(t));
  const dadosMudaram = (a, b) => !!a && dadosDe(normalizar(a)) !== dadosDe(normalizar(b));

  async function salvarTroca() {
    const { e, bad } = validar(ui.form);
    ui.errors = e; ui.invalid = bad;
    if (e.length) { render(); document.getElementById('erros')?.scrollIntoView({ block: 'center' }); return; }
    ui.ocupado = true;
    render(true);
    const t = normalizar(ui.form);
    const dados = paraDb(t);
    try {
      if (ui.editId) {
        const { data, error } = await sb.from('portal_itens').update(dados).eq('id', t.id).select().single();
        if (error) throw error;
        const subiu = data.versao > ui.original.versao;
        const mudou = dadosMudaram(ui.original, ui.form);
        ui.uploads = [];
        await recarregar();
        const msg = !mudou ? 'Nada mudou nesta troca.'
          : (subiu ? `<b>Troca ${data.codigo} alterada.</b> Imprima de novo o canhoto desta troca e troque o papel na aliança. <button class="link" data-act="imprimir-troca" data-cod="${data.codigo}">Imprimir agora</button>` : `<b>Troca ${data.codigo} salva.</b>`);
        const extra = { form: null, original: null, editId: null, errors: [], invalid: new Set(), ocupado: false, flash: { html: msg, warn: subiu } };
        if (ui.editLote) ir('troca', { ...extra, troca: data.codigo, editLote: null }); else ir('aberto', { ...extra, editLote: null });
        return;
      }
      let lote = db.draft.lote;
      if (!lote) {
        const { data, error } = await sb.rpc('portal_pacote_aberto', { p_criar: true });
        if (error) throw error;
        lote = data[0];
      }
      const { data, error } = await sb.from('portal_itens').insert({ id: t.id, lote_id: lote.id, ...dados }).select().single();
      if (error) throw error;
      ui.uploads = [];
      await recarregar();
      ir('aberto', { form: null, original: null, editId: null, errors: [], invalid: new Set(), ocupado: false,
        flash: { html: `<b>Troca ${data.codigo} salva.</b> Já dá para imprimir o canhoto dela. <button class="link" data-act="imprimir-troca" data-cod="${data.codigo}" id="fl-imprimir">Imprimir agora</button>` } });
    } catch (err) {
      erroFlash(err);
    }
  }
  async function descartarUploads() {
    if (!ui.uploads.length) return;
    const paths = ui.uploads; ui.uploads = [];
    await sb.storage.from(BUCKET).remove(paths).catch(() => null);
  }

  /* ── Pacotes e impressão ────────────────────────────────────── */
  async function fecharPacote() {
    const lote = db.draft.lote;
    try {
      const { error } = await sb.rpc('portal_fechar_lote', { p_lote: lote.id });
      if (error) throw error;
      await recarregar();
      const l = db.lotes.find((x) => x.id === lote.id);
      const pend = l.itens.filter(precisaImprimir);
      ir('imprimir', { recemFechado: true, print: { tipo: 'pacote', lote: l.codigo, filtro: pend.length ? 'pendentes' : 'todas', ids: (pend.length ? pend : l.itens).map((t) => t.id) } });
    } catch (err) {
      erroFlash(err);
    }
  }
  function abrirImpressaoPacote(cod) {
    const l = db.lotes.find((x) => x.codigo === cod);
    ir('imprimir', { print: { tipo: 'pacote', lote: cod, filtro: 'todas', ids: l.itens.map((t) => t.id) } });
  }
  function imprimirJa() {
    const itens = itensDaImpressao();
    const depois = () => {
      window.removeEventListener('afterprint', depois);
      if (!db.cliente || !itens.length) return;
      ui.modal = {
        title: 'Os canhotos saíram na impressora?',
        body: `Se saíram, ${plural(itens.length, 'a troca fica marcada como impressa', 'as trocas ficam marcadas como impressas')} como estão agora.`,
        ok: 'Sim, saíram', cancel: 'Não saíram',
        run: async () => {
          try {
            const { error } = await sb.rpc('portal_marcar_impresso', { p_itens: itens.map((t) => t.id) });
            if (error) throw error;
            await recarregar();
            ui.flash = { html: `<b>${plural(itens.length, 'Canhoto marcado como impresso', 'Canhotos marcados como impressos')}.</b>` };
            render();
          } catch (err) { erroFlash(err); }
        }
      };
      render();
    };
    window.addEventListener('afterprint', depois);
    window.print();
  }
  function buscar(q) {
    ui.busca = q;
    const m = String(q).toUpperCase().match(/TR-\d{4,}(-\d{2,})?/);
    if (!m) { ui.buscaMsg = 'Digite um código como TR-0041 ou TR-0041-02, ou cole o link do QR.'; render(); return; }
    const cod = m[0];
    if (m[1]) {
      const { t, lote } = acharTroca(cod);
      if (t && lote) { ir('troca', { troca: cod, busca: '' }); return; }
      if (t) { ir('aberto', { busca: '', flash: { html: `<b>${cod}</b> está no pacote aberto.` } }); return; }
    } else if (db.lotes.some((l) => l.codigo === cod)) { ir('pacote', { lote: cod, busca: '' }); return; }
    ui.buscaMsg = m[1] ? `Nenhuma troca com o código ${cod}.` : `Nenhum pacote com o código ${cod}.`;
    render();
  }
  // Link do QR: #/t/TR-0042-03 (troca) ou #/p/TR-0042 (pacote)
  function seguirHash() {
    const h = decodeURIComponent(location.hash || '');
    const m = h.match(/^#\/(t|p)\/(TR-[\d-]+)/i);
    if (!m) return false;
    buscar(m[2]);
    return true;
  }

  /* ── Símbolos e anexos ──────────────────────────────────────── */
  let ultimoTexto = null;
  document.addEventListener('focusin', (ev) => { if (ev.target.matches?.('textarea[id$="-texto"]')) ultimoTexto = ev.target.id; });
  document.addEventListener('mousedown', (ev) => { if (ev.target.closest('.sym')) ev.preventDefault(); });
  function inserirSimbolo(alvo, c) {
    const ta = document.getElementById(alvo);
    if (!ta) return;
    const temCursor = ultimoTexto === alvo && document.activeElement === ta;
    const ini = temCursor ? ta.selectionStart : ta.value.length;
    const fim = temCursor ? ta.selectionEnd : ta.value.length;
    if (ta.value.length - (fim - ini) + c.length > ta.maxLength) return;
    ta.value = ta.value.slice(0, ini) + c + ta.value.slice(fim);
    ta.focus();
    ta.setSelectionRange(ini + c.length, ini + c.length);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  async function enviarAnexos(i, local, arquivos) {
    const g = ui.form.aneis[i].gravs.find((x) => x.local === local);
    const livres = MAX_ANEXOS - (g.anexos || []).length;
    const problemas = [];
    for (const file of [...arquivos].slice(0, livres)) {
      if (file.size > MAX_BYTES) { problemas.push(`${file.name} passa de 10 MB.`); continue; }
      if (!/^image\//.test(file.type) && file.type !== 'application/pdf') { problemas.push(`${file.name} não é imagem nem PDF.`); continue; }
      const path = `${db.cliente.id}/${ui.form.id}/${uuid().slice(0, 8)}-${nomeSeguro(file.name)}`;
      const x = { id: path, path, nome: file.name, tipo: file.type, tamanho: file.size, url: file.type.startsWith('image/') ? URL.createObjectURL(file) : null, enviando: true };
      g.anexos = [...(g.anexos || []), x];
      render(true);
      const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) { g.anexos = g.anexos.filter((a) => a.path !== path); problemas.push(`${file.name}: ${msgErro(error)}`); }
      else { x.enviando = false; ui.uploads.push(path); }
      render(true);
    }
    if (problemas.length) { ui.flash = { html: `<b>Anexo não enviado.</b> ${esc(problemas.join(' '))}`, warn: true }; render(true); }
  }

  /* ── Eventos ────────────────────────────────────────────────── */
  document.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'modal-cancel') { if (ev.target !== b && b.classList.contains('modal')) return; ui.modal = null; render(); return; }
    if (act === 'modal-ok') { const run = ui.modal?.run; ui.modal = null; render(); if (run) run(); return; }
    const saindoDoForm = ui.view === 'form' && ['go-aberto', 'go-pacotes', 'troca', 'logout'].includes(act);
    if (saindoDoForm) await descartarUploads();
    if (act === 'go-aberto') ir('aberto', { form: null, editId: null, editLote: null, errors: [], invalid: new Set() });
    else if (act === 'go-pacotes') ir('pacotes');
    else if (act === 'cancelar-senha') { ui.recuperacao = false; ir(inicio()); }
    else if (act === 'logout') { await sb.auth.signOut(); }
    else if (act === 'esqueci') {
      ui.loginEmail = document.getElementById('l-email')?.value.trim() || '';
      ui.flash = { html: 'Fale com a Medieval pelo WhatsApp: ela cria uma senha nova para você. Depois de entrar, dá para trocar a senha em “Trocar senha”.' };
      render();
    }
    else if (act === 'trocar-senha') {
      ui.modal = null;
      ui.recuperacao = true;
      ui.flash = null;
      ui.view = 'login';
      render();
    }
    else if (act === 'nova') ir('form', { form: novaTroca(), original: null, editId: null, editLote: null, errors: [], invalid: new Set(), uploads: [] });
    else if (act === 'editar') {
      const { t, lote } = acharTroca(b.dataset.cod);
      ir('form', { form: clone(t), original: clone(t), editId: t.id, editLote: lote ? lote.codigo : null, errors: [], invalid: new Set(), uploads: [] });
    } else if (act === 'excluir') {
      const { t } = acharTroca(b.dataset.cod);
      ui.modal = { title: `Excluir a troca ${t.codigo}?`, body: `${esc(t.ref)} sai do pacote aberto. ${t.impressaVersao != null ? 'Se o canhoto já estiver impresso, jogue o papel fora.' : ''}`, ok: 'Excluir', danger: true,
        run: async () => {
          try {
            const { error } = await sb.from('portal_itens').delete().eq('id', t.id);
            if (error) throw error;
            const paths = t.aneis.flatMap((a) => a.gravs.flatMap((g) => g.anexos.map((x) => x.path)));
            if (paths.length) await sb.storage.from(BUCKET).remove(paths).catch(() => null);
            await recarregar();
            ir('aberto', { flash: { html: `<b>Troca ${t.codigo} excluída.</b>` } });
          } catch (err) { erroFlash(err); }
        } };
      render();
    } else if (act === 'imprimir-troca') {
      const { lote } = acharTroca(b.dataset.cod);
      ir('imprimir', { print: { tipo: 'troca', troca: b.dataset.cod, origem: lote ? 'lote' : 'aberto' } });
    } else if (act === 'imprimir-pacote') abrirImpressaoPacote(b.dataset.cod);
    else if (act === 'imprimir-ja') imprimirJa();
    else if (act === 'camera') {
      const lido = typeof window.lerQRCamera === 'function' ? await window.lerQRCamera({ titulo: 'Ler o QR do canhoto' }) : null;
      if (lido) buscar(lido);
    }
    else if (act === 'sym') inserirSimbolo(b.dataset.target, b.dataset.c);
    else if (act === 'anexo-remover') {
      const g = ui.form.aneis[Number(b.dataset.i)].gravs.find((x) => x.local === b.dataset.local);
      const path = b.dataset.id;
      g.anexos = (g.anexos || []).filter((x) => x.id !== path);
      if (ui.uploads.includes(path)) { ui.uploads = ui.uploads.filter((p) => p !== path); sb.storage.from(BUCKET).remove([path]).catch(() => null); }
      render(true);
    } else if (act === 'fechar') {
      const it = db.draft.itens;
      const pend = it.filter(precisaImprimir).length;
      ui.modal = { title: `Fechar o pacote ${db.draft.lote?.codigo || ''} com ${plural(it.length, 'troca', 'trocas')}?`,
        body: `São ${plural(totalAl(it), 'aliança', 'alianças')}. ${pend ? `${plural(pend, 'troca ainda não foi impressa ou mudou depois de impressa', 'trocas ainda não foram impressas ou mudaram depois de impressas')}; elas já entram na impressão. ` : 'Todos os canhotos já estão impressos; sai só a folha de resumo. '}Depois de fechar, dá para alterar uma troca enquanto a Medieval não receber.`,
        ok: 'Fechar pacote', run: fecharPacote };
      render();
    } else if (act === 'lote') ir('pacote', { lote: b.dataset.cod });
    else if (act === 'troca') ir('troca', { troca: b.dataset.cod, form: null, editId: null, editLote: null });
  });

  document.addEventListener('submit', async (ev) => {
    const f = ev.target.closest('[data-form]');
    if (!f) return;
    ev.preventDefault();
    if (f.dataset.form === 'login') {
      const btn = document.getElementById('l-entrar');
      btn.setAttribute('aria-busy', 'true');
      ui.loginEmail = document.getElementById('l-email').value.trim();
      const { error } = await sb.auth.signInWithPassword({ email: paraEmail(ui.loginEmail), password: document.getElementById('l-senha').value });
      btn.removeAttribute('aria-busy');
      if (error) { ui.flash = { html: esc(msgErro(error)) }; render(); document.getElementById('l-senha')?.focus(); }
    } else if (f.dataset.form === 'nova-senha') {
      const { error } = await sb.auth.updateUser({ password: document.getElementById('l-nova').value });
      if (error) { ui.flash = { html: esc(msgErro(error)) }; render(); return; }
      ui.recuperacao = false;
      if (/access_token|type=recovery/.test(location.hash)) history.replaceState(null, '', location.pathname);
      if (db.user) ir(inicio(), { flash: { html: '<b>Senha trocada.</b>' } });
      else await entrar();
    }
    else if (f.dataset.form === 'troca') salvarTroca();
    else if (f.dataset.form === 'buscar') buscar(document.getElementById('busca').value);
  });

  let previaPendente = false;
  document.addEventListener('input', (ev) => {
    const el = ev.target;
    if (!el.dataset.bind || !ui.form) return;
    setPath(ui.form, el.dataset.bind, el.value);
    if (ui.invalid.has(el.id)) { ui.invalid.delete(el.id); el.classList.remove('is-invalid'); }
    const mAro = /^aneis\.(\d+)\.(de|para)$/.exec(el.dataset.bind);
    if (mAro) {
      const i = Number(mAro[1]);
      const a = ui.form.aneis[i];
      el.classList.toggle('is-invalid', !!erroAro(a, a[mAro[2]]));
      const box = document.getElementById(`f-a${i}-aro-msg`);
      if (box) box.innerHTML = msgsAro(a, ui.form.tipos.includes('troca_aro')).map(esc).join('<br>');
    }
    if (el.tagName === 'TEXTAREA' && el.id.endsWith('-texto')) {
      const cnt = document.getElementById(el.id.replace(/-texto$/, '-cnt'));
      if (cnt) cnt.textContent = contador(el.value);
    }
    if (!previaPendente) { previaPendente = true; requestAnimationFrame(() => { previaPendente = false; atualizarPrevia(); }); }
  });

  document.addEventListener('change', (ev) => {
    const el = ev.target;
    const kind = el.dataset.change;
    if (!kind) return;
    if (kind === 'filtro') {
      const l = db.lotes.find((x) => x.codigo === ui.print.lote);
      const lista = el.value === 'pendentes' ? l.itens.filter(precisaImprimir) : l.itens;
      ui.print = { ...ui.print, filtro: el.value, ids: lista.map((t) => t.id) };
      ui.flash = null;
      render(true);
      return;
    }
    if (!ui.form) return;
    const f = ui.form;
    if (kind === 'peca') {
      f.peca = el.value;
      if (f.peca === 'Par' && f.aneis.length === 1) f.aneis.push(anel(f.aneis[0].w === 'Fem.' ? 'Masc.' : 'Fem.', null));
      if (f.peca === 'Avulsa') f.aneis = [f.aneis[0]];
    } else if (kind === 'tipo') {
      f.tipos = el.checked ? ordenar([...f.tipos, el.value]) : f.tipos.filter((k) => k !== el.value);
      if (el.value === 'troca_aro' && el.checked) f.aneis.forEach((a) => { if (a.para == null) a.para = a.de; });
      ui.invalid.delete('f-tipos');
    } else if (kind === 'anel-w') {
      const a = f.aneis[Number(el.dataset.i)];
      a.w = el.value;
      if (a.w !== 'Fem.') a.pedra = false;
    } else if (kind === 'pedra') {
      f.aneis[Number(el.dataset.i)].pedra = el.checked;
    } else if (kind === 'anexo') {
      enviarAnexos(Number(el.dataset.i), el.dataset.local, el.files);
      return;
    } else if (kind === 'grav-local') {
      const a = f.aneis[Number(el.dataset.i)];
      if (el.checked) a.gravs.push({ local: el.value, texto: '', fonte: 'Arial', outra: false, anexos: [] });
      else a.gravs = a.gravs.filter((g) => g.local !== el.value);
      a.gravs.sort((x, y) => (x.local === 'Interna' ? -1 : 1) - (y.local === 'Interna' ? -1 : 1));
    } else if (kind === 'fonte') {
      const g = f.aneis[Number(el.dataset.i)].gravs.find((x) => x.local === el.dataset.local);
      if (el.value === 'Outra') { g.outra = true; if (FONTES.includes(g.fonte)) g.fonte = ''; }
      else { g.outra = false; g.fonte = el.value; }
      render(true);
      if (g.outra) document.getElementById(`f-a${el.dataset.i}-${g.local}-fonte-nome`)?.focus();
      return;
    }
    render(true);
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && ui.modal) { ui.modal = null; render(); }
  });
  window.addEventListener('resize', encaixar);
  window.addEventListener('hashchange', () => { if (db.user) seguirHash(); });
  // Volta para a aba: relê o andamento (a Medieval pode ter mexido)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !db.user || ui.view === 'form' || ui.view === 'imprimir') return;
    try { await recarregar(); render(true); } catch (_) { /* segue com o que tem */ }
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (ui.view === 'imprimir') render(); else encaixar(); });

  /* ── Sessão ─────────────────────────────────────────────────── */
  let entrando = null;
  function entrar() {
    if (!entrando) entrando = entrarAgora().finally(() => { entrando = null; });
    return entrando;
  }
  async function entrarAgora() {
    const { data } = await sb.auth.getUser();
    if (!data?.user) { db.user = null; ir('login'); return; }
    db.user = data.user;
    ui.view = 'boot'; render();
    try {
      await carregarTudo();
      if (!seguirHash()) ir(inicio());
    } catch (err) {
      ir(inicio());
      erroFlash(err);
    }
  }
  sb.auth.onAuthStateChange((evento, sessao) => {
    if (evento === 'PASSWORD_RECOVERY') { ui.recuperacao = true; ir('login'); return; }
    if (evento === 'SIGNED_IN' && sessao?.user && db.user?.id !== sessao.user.id && !ui.recuperacao) { setTimeout(entrar, 0); return; }
    if (evento === 'SIGNED_OUT') { db = { user: null, cliente: null, equipe: false, clientes: [], draft: { lote: null, itens: [] }, lotes: [] }; ir('login'); }
  });
  sb.auth.getSession().then(({ data }) => { if (data?.session) entrar(); else if (!ui.recuperacao) ir('login'); });
})();
