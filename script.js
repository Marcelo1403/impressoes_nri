const WEB_APP_URL = "COLE_AQUI_A_URL_DO_SEU_APPS_SCRIPT";
const PASTA_IMAGENS = "imagens_produtos";
const EXTENSOES_IMAGEM = ["png","jpg","jpeg","webp"];
const TZ = "America/Fortaleza";

let config = { produtos: [], unidades: [], conferentes: [], turnos: [], motoristas: [], fabricas: [] };
let pendentes = [];
let historico = [];
let produtoAtual = null;
let previewAtual = null;
let impressaoPendente = null;
let enviandoCadastro = false;

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  configurarNavegacao();
  configurarEventos();
  preencherDatasPadrao();
  await carregarConfig();
  await Promise.all([carregarPendentes(), carregarHistorico()]);
});

function configurarNavegacao(){
  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => abrirView(btn.dataset.view)));
  $("menuBtn").addEventListener("click", () => alternarMenu(true));
  $("overlay").addEventListener("click", () => alternarMenu(false));
}

function abrirView(nome){
  document.querySelectorAll(".view").forEach(v => v.classList.remove("ativo"));
  document.querySelectorAll(".nav-item").forEach(v => v.classList.remove("ativo"));
  $("view-"+nome).classList.add("ativo");
  document.querySelector(`.nav-item[data-view="${nome}"]`).classList.add("ativo");
  const titulos = {
    cadastro:["Cadastro de NRI","Identificação e rastreabilidade por palete"],
    pendentes:["Impressões pendentes","Três etiquetas idênticas por NRI em uma folha A4"],
    historico:["Histórico / rastreabilidade","Consulta por lote, produto, NRI e transporte"]
  };
  $("tituloPagina").textContent = titulos[nome][0];
  $("subtituloPagina").textContent = titulos[nome][1];
  alternarMenu(false);
}

function alternarMenu(abrir){
  $("sidebar").classList.toggle("aberta", abrir);
  $("overlay").classList.toggle("ativo", abrir);
}

function configurarEventos(){
  $("codigoProduto").addEventListener("input", localizarProdutoDigitado);
  $("validade").addEventListener("change", atualizarBloqueio);
  $("formCadastro").addEventListener("submit", cadastrarNris);
  $("formCadastro").addEventListener("reset", () => setTimeout(() => { produtoAtual=null; resetPreviewProduto(); preencherDatasPadrao(); }, 0));
  $("placa").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));

  $("filtroPendentes").addEventListener("input", renderPendentes);
  $("filtroUnidade").addEventListener("change", renderPendentes);
  $("btnImprimirTudo").addEventListener("click", () => iniciarImpressao(filtrarPendentes()));
  $("btnImprimirSelecionadas").addEventListener("click", () => iniciarImpressao(obterPendentesSelecionadas()));
  $("btnSelecionarVisiveis").addEventListener("click", alternarSelecionadosVisiveis);

  ["filtroHistorico","filtroStatus","filtroHistUnidade","filtroDe","filtroAte"].forEach(id => $(id).addEventListener(id.includes("filtroHistorico")?"input":"change", renderHistorico));
  $("btnLimparHistorico").addEventListener("click", limparFiltrosHistorico);

  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => fecharModal(btn.dataset.close)));
  $("btnImprimirPreview").addEventListener("click", () => previewAtual && iniciarImpressao([previewAtual], previewAtual.status === "IMPRESSO"));
  $("btnImpressaoConcluida").addEventListener("click", confirmarImpressaoConcluida);
  $("btnImpressaoCancelada").addEventListener("click", confirmarImpressaoCancelada);
}

function preencherDatasPadrao(){
  const agora = new Date();
  $("recebimento").value = dataInputLocal(agora);
  $("hora").value = horaInputLocal(agora);
}

async function carregarConfig(){
  if(!urlConfigurada()) return toast("Informe a URL do Apps Script no script.js.","erro");
  try{
    const r = await fetch(`${WEB_APP_URL}?acao=config&_=${Date.now()}`, {cache:"no-store"});
    const d = await r.json();
    if(d.status !== "success") throw new Error(d.message || "Falha ao carregar configurações");
    config = d;
    preencherSelect("unidade",config.unidades,"Selecione");
    preencherSelect("conferente",config.conferentes,"Selecione");
    preencherSelect("turno",config.turnos,"Selecione");
    preencherSelect("motorista",config.motoristas,"Selecione");
    preencherSelect("fabrica",config.fabricas,"Selecione");
    preencherSelect("filtroUnidade",config.unidades,"Todas",true);
    preencherSelect("filtroHistUnidade",config.unidades,"Todas",true);
    const dl = $("listaProdutos"); dl.innerHTML="";
    config.produtos.forEach(p => { const o=document.createElement("option"); o.value=p.codigo; o.label=`${p.codigo} - ${p.nome}`; dl.appendChild(o); });
  }catch(e){ toast(e.message,"erro"); }
}

function preencherSelect(id, lista, placeholder, manterPrimeiro=false){
  const s=$(id); s.innerHTML = manterPrimeiro ? `<option value="">${placeholder}</option>` : `<option value="">${placeholder}</option>`;
  (lista||[]).forEach(v => { const o=document.createElement("option"); o.value=typeof v==="string"?v:v.nome; o.textContent=o.value; s.appendChild(o); });
}

function localizarProdutoDigitado(){
  const valor = $("codigoProduto").value.trim();
  produtoAtual = config.produtos.find(p => String(p.codigo).trim() === valor) || null;
  if(!produtoAtual){ resetPreviewProduto(); return; }
  $("produtoPlaceholder").classList.add("oculto");
  $("produtoInfo").classList.remove("oculto");
  $("produtoCodigo").textContent = `Código ${produtoAtual.codigo}`;
  $("produtoNome").textContent = produtoAtual.nome;
  carregarImagemComFallback($("produtoImagem"), produtoAtual.codigo);
}

function resetPreviewProduto(){
  $("produtoPlaceholder").classList.remove("oculto");
  $("produtoInfo").classList.add("oculto");
  $("produtoImagem").classList.add("oculto");
  $("produtoImagem").removeAttribute("src");
}

function carregarImagemComFallback(img, codigo){
  let i=0; img.classList.remove("oculto");
  img.onerror=()=>{ if(i>=EXTENSOES_IMAGEM.length){ img.classList.add("oculto"); return; } img.src=`${PASTA_IMAGENS}/${encodeURIComponent(codigo)}.${EXTENSOES_IMAGEM[i++]}`; };
  img.onerror();
}

function atualizarBloqueio(){
  const v=$("validade").value; if(!v){ $("bloqueio").value=""; return; }
  const d=new Date(v+"T12:00:00"); d.setDate(d.getDate()-30); $("bloqueio").value=dataInputLocal(d);
}

async function cadastrarNris(ev){
  ev.preventDefault(); if(enviandoCadastro) return;
  localizarProdutoDigitado();
  if(!produtoAtual) return toast("Código de produto não encontrado na base.","erro");
  const ids=["unidade","validade","lote","recebimento","conferente","turno","hora","motorista","placa","fabrica","caixas","qtdPaletes"];
  for(const id of ids){ if(!String($(id).value||"").trim()) return toast(`Preencha o campo ${document.querySelector(`label[for="${id}"]`).textContent.replace(" *","")}.`,"erro"); }
  if(Number($("qtdPaletes").value)<1 || Number($("qtdPaletes").value)>99) return toast("Quantidade de paletes deve ficar entre 1 e 99.","erro");
  enviandoCadastro=true; $("btnCadastrar").disabled=true; $("btnCadastrar").textContent="Salvando...";
  try{
    const payload={acao:"criar",unidade:$("unidade").value,codigoProduto:produtoAtual.codigo,nomeProduto:produtoAtual.nome,validade:$("validade").value,lote:$("lote").value.trim(),recebimento:$("recebimento").value,conferente:$("conferente").value,turno:$("turno").value,hora:$("hora").value,motorista:$("motorista").value,placa:$("placa").value.trim(),fabrica:$("fabrica").value,caixas:Number($("caixas").value),quantidadePaletes:Number($("qtdPaletes").value)};
    const d=await post(payload); if(d.status!=="success") throw new Error(d.message||"Erro ao cadastrar");
    toast(`${d.nris.length} NRI(s) cadastrado(s): ${d.nris.join(", ")}`,"sucesso");
    $("formCadastro").reset(); preencherDatasPadrao(); produtoAtual=null; resetPreviewProduto();
    await Promise.all([carregarPendentes(),carregarHistorico()]); abrirView("pendentes");
  }catch(e){ toast(e.message,"erro"); }
  finally{ enviandoCadastro=false; $("btnCadastrar").disabled=false; $("btnCadastrar").textContent="Cadastrar NRI(s)"; }
}

async function carregarPendentes(){
  $("tbodyPendentes").innerHTML='<tr><td colspan="7" class="loading-row">Carregando...</td></tr>';
  try{ const r=await fetch(`${WEB_APP_URL}?acao=pendentes&_=${Date.now()}`,{cache:"no-store"}); const d=await r.json(); if(d.status!=="success") throw new Error(d.message); pendentes=d.registros||[]; renderPendentes(); atualizarBadge(); }
  catch(e){ $("tbodyPendentes").innerHTML='<tr><td colspan="7" class="empty-row">Falha ao carregar pendências.</td></tr>'; toast(e.message,"erro"); }
}

function filtrarPendentes(){
  const q=normalizar($("filtroPendentes").value), un=$("filtroUnidade").value;
  return pendentes.filter(r => (!un||r.unidade===un) && (!q||normalizar([r.nri,r.codigoProduto,r.nomeProduto,r.lote,r.placa].join(" ")).includes(q)));
}

function renderPendentes(){
  const lista=filtrarPendentes(); $("qtdPendentes").textContent=lista.length; const tb=$("tbodyPendentes"); tb.innerHTML="";
  if(!lista.length){ tb.innerHTML='<tr><td colspan="7" class="empty-row">Nenhum NRI pendente.</td></tr>'; return; }
  lista.forEach(r => { const tr=document.createElement("tr"); tr.innerHTML=`<td><input type="checkbox" class="sel-pendente" data-id="${esc(r.id)}"></td><td>${esc(r.nri)}<strong>${esc(r.codigoProduto)} - ${esc(r.nomeProduto)}</strong></td><td>${esc(r.lote)}<strong>${fmtData(r.validade)}</strong></td><td>${fmtData(r.recebimento)}<strong>${fmtData(r.bloqueio)}</strong></td><td>${esc(r.unidade)}<small>${esc(r.placa)} · ${esc(r.motorista)}</small></td><td>${esc(r.caixas)}</td><td><div class="acoes"><button class="btn-mini" data-act="ver">Visualizar</button><button class="btn-mini" data-act="imprimir">Imprimir</button><button class="btn-mini perigo" data-act="remover">Remover</button></div></td>`;
    tr.querySelector('[data-act="ver"]').onclick=()=>visualizarNri(r); tr.querySelector('[data-act="imprimir"]').onclick=()=>iniciarImpressao([r]); tr.querySelector('[data-act="remover"]').onclick=()=>removerNri(r); tb.appendChild(tr); });
}

function obterPendentesSelecionadas(){ const ids=[...document.querySelectorAll('.sel-pendente:checked')].map(x=>x.dataset.id); return pendentes.filter(r=>ids.includes(String(r.id))); }
function alternarSelecionadosVisiveis(){ const c=[...document.querySelectorAll('.sel-pendente')]; const marcar=c.some(x=>!x.checked); c.forEach(x=>x.checked=marcar); }
function atualizarBadge(){ $("badgePendentes").textContent=pendentes.length; }

async function removerNri(r){ if(!confirm(`Remover ${r.nri} da fila de impressão? O registro permanecerá no histórico.`)) return; try{ const d=await post({acao:"remover",ids:[r.id]}); if(d.status!=="success") throw new Error(d.message); toast("NRI removido da fila.","sucesso"); await Promise.all([carregarPendentes(),carregarHistorico()]); }catch(e){ toast(e.message,"erro"); } }

async function carregarHistorico(){
  $("tbodyHistorico").innerHTML='<tr><td colspan="6" class="loading-row">Carregando...</td></tr>';
  try{ const r=await fetch(`${WEB_APP_URL}?acao=historico&_=${Date.now()}`,{cache:"no-store"}); const d=await r.json(); if(d.status!=="success") throw new Error(d.message); historico=d.registros||[]; renderHistorico(); }
  catch(e){ $("tbodyHistorico").innerHTML='<tr><td colspan="6" class="empty-row">Falha ao carregar histórico.</td></tr>'; toast(e.message,"erro"); }
}

function filtrarHistorico(){
  const q=normalizar($("filtroHistorico").value), st=$("filtroStatus").value, un=$("filtroHistUnidade").value, de=$("filtroDe").value, ate=$("filtroAte").value;
  return historico.filter(r=>{ const alvo=normalizar([r.nri,r.codigoProduto,r.nomeProduto,r.lote,r.placa,r.conferente,r.motorista,r.fabrica].join(" ")); const data=(r.criadoEmIso||"").slice(0,10); return (!q||alvo.includes(q))&&(!st||r.status===st)&&(!un||r.unidade===un)&&(!de||!data||data>=de)&&(!ate||!data||data<=ate); });
}

function renderHistorico(){
  const lista=filtrarHistorico(); const tb=$("tbodyHistorico"); tb.innerHTML="";
  if(!lista.length){ tb.innerHTML='<tr><td colspan="6" class="empty-row">Nenhum registro encontrado.</td></tr>'; return; }
  lista.forEach(r=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${esc(r.criadoEm||"-")}</td><td>${esc(r.nri)}<strong>${esc(r.codigoProduto)} - ${esc(r.nomeProduto)}</strong></td><td>${esc(r.lote)}<strong>${fmtData(r.validade)}</strong></td><td>${esc(r.unidade)}<small>${esc(r.placa)} · ${esc(r.motorista)}</small></td><td><span class="status ${String(r.status).toLowerCase()}">${esc(r.status)}</span></td><td><div class="acoes"><button class="btn-mini" data-act="ver">Ver</button>${r.status==="IMPRESSO"?'<button class="btn-mini" data-act="reemitir">Reemitir</button>':r.status==="PENDENTE"?'<button class="btn-mini" data-act="imprimir">Imprimir</button>':''}</div></td>`;
    tr.querySelector('[data-act="ver"]').onclick=()=>visualizarNri(r); const ri=tr.querySelector('[data-act="reemitir"]'); if(ri) ri.onclick=()=>iniciarImpressao([r],true); const im=tr.querySelector('[data-act="imprimir"]'); if(im) im.onclick=()=>iniciarImpressao([r]); tb.appendChild(tr); });
}

function limparFiltrosHistorico(){ ["filtroHistorico","filtroStatus","filtroHistUnidade","filtroDe","filtroAte"].forEach(id=>$(id).value=""); renderHistorico(); }

function visualizarNri(r){ previewAtual=r; $("previewConteudo").innerHTML=htmlEtiqueta(r,false); abrirModal("modalPreview"); }

function abrirModal(id){ $(id).classList.add("aberto"); $(id).setAttribute("aria-hidden","false"); }
function fecharModal(id){ $(id).classList.remove("aberto"); $(id).setAttribute("aria-hidden","true"); }

async function iniciarImpressao(registros, reemissao=false){
  if(!registros || !registros.length) return toast("Selecione ao menos um NRI para imprimir.","erro");
  impressaoPendente={registros,reemissao};
  const frame=$("printFrame"); const doc=frame.contentWindow.document;
  doc.open(); doc.write(documentoImpressao(registros)); doc.close();
  await new Promise(r=>setTimeout(r,700));
  fecharModal("modalPreview");
  frame.contentWindow.focus(); frame.contentWindow.print();
  setTimeout(()=>abrirModal("modalConfirmacaoImpressao"),350);
}

async function confirmarImpressaoConcluida(){
  if(!impressaoPendente) return;
  const ids=impressaoPendente.registros.map(r=>r.id);
  try{ const d=await post({acao:"confirmarImpressao",ids,reemissao:!!impressaoPendente.reemissao,copias:3}); if(d.status!=="success") throw new Error(d.message); toast(impressaoPendente.reemissao?"Reemissão registrada.":"Impressão confirmada e fila atualizada.","sucesso"); fecharModal("modalConfirmacaoImpressao"); impressaoPendente=null; await Promise.all([carregarPendentes(),carregarHistorico()]); }
  catch(e){ toast(e.message,"erro"); }
}

async function confirmarImpressaoCancelada(){
  if(!impressaoPendente){ fecharModal("modalConfirmacaoImpressao"); return; }
  try{ await post({acao:"cancelarImpressao",ids:impressaoPendente.registros.map(r=>r.id),reemissao:!!impressaoPendente.reemissao}); }catch(e){}
  impressaoPendente=null; fecharModal("modalConfirmacaoImpressao"); toast("Impressão mantida como não concluída.","erro");
}

function documentoImpressao(registros){
  const paginas=registros.map(r=>`<section class="page">${htmlEtiqueta(r,true)}${htmlEtiqueta(r,true)}${htmlEtiqueta(r,true)}</section>`).join("");
  return `<!DOCTYPE html><html><head><base href="${document.baseURI}"><meta charset="UTF-8"><style>@page{size:A4 portrait;margin:6mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#000}.page{height:285mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}.page:last-child{page-break-after:auto}.nri-preview-label{height:91mm;border:1px solid #111;background:#fff;color:#000}.nri-top{display:flex;justify-content:space-between;border-bottom:1px solid #111;padding:3px 7px;font-size:10px}.nri-product{display:grid;grid-template-columns:72px 1fr;align-items:center;height:27mm;border-bottom:1px solid #111;padding:3px 8px}.nri-product img{width:60px;height:23mm;object-fit:contain}.nri-product strong{font-size:16px}.nri-validade{display:flex;justify-content:space-between;align-items:center;height:19mm;border-bottom:1px solid #111;padding:4px 10px}.nri-validade span{font-size:18px;font-weight:800}.nri-validade strong{font-size:30px}.nri-row{display:grid;border-bottom:1px solid #111}.nri-row.cols-2{grid-template-columns:1fr 1fr}.nri-row.cols-3{grid-template-columns:repeat(3,1fr)}.nri-cell{padding:3px 6px;font-size:10px;border-right:1px solid #111;min-height:10mm}.nri-cell:last-child{border-right:0}.nri-cell b{display:block;font-size:8px;text-transform:uppercase;margin-bottom:2px}.nri-footer{display:flex;justify-content:space-between;padding:3px 6px;font-size:10px}</style></head><body>${paginas}<script>function imgFallback(img,code,i){const ex=['png','jpg','jpeg','webp'];i=i||0;if(i>=ex.length){img.style.display='none';return;}img.onerror=function(){imgFallback(img,code,i+1)};img.src='${PASTA_IMAGENS}/'+encodeURIComponent(code)+'.'+ex[i];}</script></body></html>`;
}

function htmlEtiqueta(r, paraImpressao){
  const img = paraImpressao ? `<img alt="" onerror="imgFallback(this,'${jsEsc(r.codigoProduto)}',1)" src="${PASTA_IMAGENS}/${encodeURIComponent(r.codigoProduto)}.png">` : `<img alt="" src="${PASTA_IMAGENS}/${encodeURIComponent(r.codigoProduto)}.png" onerror="this.style.display='none'">`;
  return `<div class="nri-preview-label"><div class="nri-top"><strong>CÓDIGO: ${esc(r.codigoProduto)}</strong><span>${esc(r.nri)}</span></div><div class="nri-product">${img}<strong>${esc(r.nomeProduto)}</strong></div><div class="nri-validade"><span>VALIDADE:</span><strong>${fmtData(r.validade)}</strong></div><div class="nri-row cols-2"><div class="nri-cell"><b>Lote</b>${esc(r.lote)}</div><div class="nri-cell"><b>Recebimento / Bloqueio</b>${fmtData(r.recebimento)} / ${fmtData(r.bloqueio)}</div></div><div class="nri-row cols-3"><div class="nri-cell"><b>Conferente</b>${esc(r.conferente)}</div><div class="nri-cell"><b>Turno / Hora</b>${esc(r.turno)} · ${esc(r.hora)}</div><div class="nri-cell"><b>Motorista / Placa</b>${esc(r.motorista)} · ${esc(r.placa)}</div></div><div class="nri-footer"><span>FÁBRICA: ${esc(r.fabrica)}</span><span>CAIXAS: <strong>${esc(r.caixas)}</strong></span></div><div class="nri-footer"><span>UNIDADE: ${esc(r.unidade)}</span></div></div>`;
}

async function post(payload){ const r=await fetch(WEB_APP_URL,{method:"POST",body:JSON.stringify(payload)}); return await r.json(); }
function urlConfigurada(){ return WEB_APP_URL.startsWith("https://script.google.com/macros/s/") && WEB_APP_URL.endsWith("/exec"); }
function normalizar(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function fmtData(v){ if(!v) return "-"; if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ const [y,m,d]=v.split("-"); return `${d}/${m}/${y}`; } return v; }
function dataInputLocal(d){ return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d); }
function horaInputLocal(d){ return new Intl.DateTimeFormat("pt-BR",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hour12:false}).format(d); }
function esc(v){ return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function jsEsc(v){ return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'"); }
let toastTimer; function toast(msg,tipo=""){ const t=$("toast"); t.textContent=msg; t.className=`toast show ${tipo}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className="toast",3600); }
