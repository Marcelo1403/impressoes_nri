const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbxKUbmHswmXauzd6dZVOLxzSVL9RwE63ipMzbVXK1ZqolGzVymOpa2zDrWwvteXZCRg/exec";
const PASTA_IMAGENS = "imagens_produtos";
const EXTENSOES_IMAGEM = ["png","jpg","jpeg","webp"];
const TZ = "America/Fortaleza";
const SESSION_KEY = "nri_session_v2";

let config = { produtos: [], unidades: [], conferentes: [], turnos: [], motoristas: [], fabricas: [], clientes: [], motivosAvaria: [] };
let pendentes = [];
let historico = [];
let usuarios = [];
let avarias = [];
let usuarioAtual = null;
let tokenSessao = "";
let produtoAtual = null;
let previewAtual = null;
let impressaoPendente = null;
let enviandoCadastro = false;
let enviandoAvaria = false;
let fotoAvariaDataUrl = "";
let assinaturaFeita = false;
let desenhandoAssinatura = false;
let avariaDetalheAtual = null;
let timerAtualizacaoAutomatica = null;
let atualizacaoAutomaticaEmAndamento = false;
const AUTO_REFRESH_MS = 3000;

const $ = id => document.getElementById(id);
const isAdmin = () => usuarioAtual && usuarioAtual.perfil === "ADMIN";
const isArmazem = () => usuarioAtual && ["ADMIN","COLABORADOR_ARMAZEM"].includes(usuarioAtual.perfil);
const isEntrega = () => usuarioAtual && ["ADMIN","COLABORADOR_ENTREGA"].includes(usuarioAtual.perfil);
const podeNri = () => isArmazem();
const podeAvarias = () => isEntrega();
function rotuloPerfil(perfil){
  if(perfil === "ADMIN") return "Admin";
  if(perfil === "COLABORADOR_ENTREGA") return "Colaborador Entrega";
  return "Colaborador Armazém";
}

document.addEventListener("DOMContentLoaded", async () => {
  configurarEventosBase();
  preencherDatasPadrao();
  await verificarBackend();
  await restaurarSessao();
});


async function verificarBackend(){
  const badge = $("backendStatus");
  if(!badge) return;
  if(!urlConfigurada()){
    definirStatusBackend("error","URL do Apps Script não configurada");
    return;
  }
  try{
    const qs = new URLSearchParams({acao:"health",_:Date.now().toString()});
    const r = await fetch(`${WEB_APP_URL}?${qs.toString()}`,{cache:"no-store"});
    const txt = await r.text();
    let d;
    try{ d = JSON.parse(txt); }catch(_e){ throw new Error("Resposta inválida do servidor"); }
    if(d.status === "success" && d.auth === true){
      definirStatusBackend("ok","Sistema conectado");
    }else{
      definirStatusBackend("error","Apps Script precisa ser atualizado/publicado");
    }
  }catch(e){
    definirStatusBackend("error","Não foi possível conectar ao Apps Script");
  }
}

function definirStatusBackend(tipo,texto){
  const badge = $("backendStatus");
  if(!badge) return;
  badge.classList.remove("ok","error","checking");
  badge.classList.add(tipo || "checking");
  const textoEl = badge.querySelector("span:last-child");
  if(textoEl) textoEl.textContent = texto;
}

function configurarEventosBase(){
  $("formLogin").addEventListener("submit", fazerLogin);
  $("btnMostrarSenha").addEventListener("click", alternarSenhaLogin);
  $("btnSair").addEventListener("click", sair);
  $("btnSairMobile").addEventListener("click", sair);

  document.querySelectorAll(".nav-item").forEach(btn => btn.addEventListener("click", () => abrirView(btn.dataset.view)));
  $("menuBtn").addEventListener("click", () => alternarMenu(true));
  $("overlay").addEventListener("click", () => alternarMenu(false));

  $("codigoProduto").addEventListener("input", localizarProdutoDigitado);
  $("validade").addEventListener("change", atualizarBloqueio);
  $("formCadastro").addEventListener("submit", cadastrarNris);
  $("formCadastro").addEventListener("reset", () => setTimeout(() => { produtoAtual=null; resetPreviewProduto(); preencherDatasPadrao(); }, 0));
  $("btnUltimoCadastro").addEventListener("click", preencherComUltimoCadastro);
  $("placa").addEventListener("input", e => e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,""));

  $("filtroPendentes").addEventListener("input", renderPendentes);
  $("filtroUnidade").addEventListener("change", renderPendentes);
  $("btnImprimirTudo").addEventListener("click", () => iniciarImpressao(filtrarPendentes()));
  $("btnImprimirSelecionadas").addEventListener("click", () => iniciarImpressao(obterPendentesSelecionadas()));
  $("btnSelecionarVisiveis").addEventListener("click", alternarSelecionadosVisiveis);

  ["filtroHistorico","filtroStatus","filtroHistUnidade","filtroDe","filtroAte"].forEach(id => $(id).addEventListener(id === "filtroHistorico" ? "input" : "change", renderHistorico));
  $("btnLimparHistorico").addEventListener("click", limparFiltrosHistorico);

  document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => fecharModal(btn.dataset.close)));
  $("btnImprimirPreview").addEventListener("click", () => previewAtual && iniciarImpressao([previewAtual], previewAtual.status === "IMPRESSO"));
  $("btnImpressaoConcluida").addEventListener("click", confirmarImpressaoConcluida);
  $("btnImpressaoCancelada").addEventListener("click", confirmarImpressaoCancelada);

  $("formUsuario").addEventListener("submit", salvarUsuario);
  $("btnCancelarUsuario").addEventListener("click", limparFormularioUsuario);

  $("avariaPdv").addEventListener("input", localizarClienteAvaria);
  $("avariaLote").addEventListener("input", e => e.target.value = e.target.value.toUpperCase());
  $("formAvaria").addEventListener("submit", salvarAvaria);
  $("btnLimparAvaria").addEventListener("click", limparFormularioAvaria);
  $("btnCameraAvaria").addEventListener("click", () => $("fotoAvariaCamera").click());
  $("btnArquivoAvaria").addEventListener("click", () => $("fotoAvariaArquivo").click());
  $("fotoAvariaCamera").addEventListener("change", onFotoAvariaSelecionada);
  $("fotoAvariaArquivo").addEventListener("change", onFotoAvariaSelecionada);
  $("btnRemoverFotoAvaria").addEventListener("click", limparFotoAvaria);
  $("btnLimparAssinatura").addEventListener("click", limparAssinatura);
  $("btnAtualizarAvarias").addEventListener("click", () => carregarAvarias());
  ["filtroAvarias","filtroStatusAvaria","filtroLoteAvaria"].forEach(id => $(id).addEventListener(id === "filtroAvarias" ? "input" : "change", renderAvarias));
  $("btnAprovarAvariaModal").addEventListener("click", () => avariaDetalheAtual && avaliarAvaria(avariaDetalheAtual.id,"APROVADO"));
  $("btnReprovarAvariaModal").addEventListener("click", () => avariaDetalheAtual && avaliarAvaria(avariaDetalheAtual.id,"REPROVADO"));
  configurarCanvasAssinatura();
}

async function restaurarSessao(){
  if(!urlConfigurada()){
    mostrarLogin("Configure a URL do Apps Script no arquivo script.js.");
    return;
  }

  const salva = localStorage.getItem(SESSION_KEY);
  if(!salva){ mostrarLogin(); return; }

  try{
    const sessao = JSON.parse(salva);
    tokenSessao = sessao.token || "";
    const d = await getApi("sessao");
    if(d.status !== "success") throw new Error(d.message || "Sessão expirada");
    usuarioAtual = d.usuario;
    await iniciarAplicacao();
  }catch(e){
    limparSessaoLocal();
    mostrarLogin("Sua sessão expirou. Entre novamente.");
  }
}

async function fazerLogin(ev){
  ev.preventDefault();
  if(!urlConfigurada()) return mostrarMensagemLogin("Configure a URL do Apps Script no script.js.");

  const usuario = $("loginUsuario").value.trim();
  const senha = $("loginSenha").value;
  if(!usuario || !senha) return mostrarMensagemLogin("Informe usuário e senha.");

  $("btnEntrar").disabled = true;
  $("btnEntrar").textContent = "Entrando...";
  mostrarMensagemLogin("");

  try{
    const d = await postApi({acao:"login",usuario,senha}, true);
    if(d.status !== "success") throw new Error(d.message || "Falha no login.");
    tokenSessao = d.token;
    usuarioAtual = d.usuario;
    localStorage.setItem(SESSION_KEY, JSON.stringify({token:tokenSessao,usuario:usuarioAtual}));
    $("loginSenha").value = "";
    await iniciarAplicacao();
  }catch(e){
    const msg = String(e.message || e || "");
    if(msg.includes("Failed to fetch") || msg.includes("NetworkError")){
      mostrarMensagemLogin("Não foi possível concluir o login. Confirme se o Apps Script publicado está na versão 7.0 e tente novamente.");
      definirStatusBackend("error","Falha de conexão com o Apps Script");
    }else{
      mostrarMensagemLogin(msg || "Usuário ou senha inválidos.");
    }
  }finally{
    $("btnEntrar").disabled = false;
    $("btnEntrar").textContent = "Entrar";
  }
}

async function iniciarAplicacao(){
  aplicarPerfil();
  $("loginScreen").classList.add("oculto");
  $("appShell").classList.remove("oculto");

  await carregarConfig();

  if(podeNri()) await carregarPendentes();
  if(podeAvarias()) await carregarAvarias();
  if(isAdmin()) await Promise.all([carregarHistorico(), carregarUsuarios()]);

  preencherDatasPadrao();
  limparFormularioAvaria();
  abrirView(usuarioAtual?.perfil === "COLABORADOR_ENTREGA" ? "avarias" : "cadastro");
  iniciarAtualizacaoAutomatica();
}

function aplicarPerfil(){
  const nome = usuarioAtual?.nome || usuarioAtual?.usuario || "Usuário";
  const perfil = usuarioAtual?.perfil || "COLABORADOR_ARMAZEM";
  const inicial = nome.trim().charAt(0).toUpperCase() || "U";

  ["userNome","userNomeMobile"].forEach(id => $(id).textContent = nome);
  ["userPerfil","userPerfilMobile"].forEach(id => $(id).textContent = rotuloPerfil(perfil));
  ["userAvatar","userAvatarMobile"].forEach(id => $(id).textContent = inicial);
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("oculto", !isAdmin()));
  document.querySelectorAll(".nri-access").forEach(el => el.classList.toggle("oculto", !podeNri()));
  document.querySelectorAll(".avaria-access").forEach(el => el.classList.toggle("oculto", !podeAvarias()));

  if($("avariaEntregador")) $("avariaEntregador").value = nome;
  if($("tituloListaAvarias")) $("tituloListaAvarias").textContent = isAdmin() ? "Todas as avarias" : "Minhas avarias";
  if($("subtituloListaAvarias")) $("subtituloListaAvarias").textContent = isAdmin() ? "Analise, visualize e aprove ou reprove as ocorrências registradas pela entrega." : "Acompanhe o status dos seus lançamentos.";
  if($("chipAvarias")) $("chipAvarias").textContent = isAdmin() ? "Gestão Admin" : "Entrega";
}

function mostrarLogin(msg=""){
  $("appShell").classList.add("oculto");
  $("loginScreen").classList.remove("oculto");
  mostrarMensagemLogin(msg);
  setTimeout(() => $("loginUsuario").focus(), 50);
}

function mostrarMensagemLogin(msg){ $("loginMessage").textContent = msg || ""; }

function alternarSenhaLogin(){
  const campo = $("loginSenha");
  const mostrar = campo.type === "password";
  campo.type = mostrar ? "text" : "password";
  $("btnMostrarSenha").textContent = mostrar ? "Ocultar" : "Mostrar";
}

async function sair(){
  pararAtualizacaoAutomatica();
  try{ if(tokenSessao) await postApi({acao:"logout"}); }catch(_e){}
  limparSessaoLocal();
  usuarioAtual = null;
  tokenSessao = "";
  mostrarLogin();
}

function limparSessaoLocal(){ localStorage.removeItem(SESSION_KEY); }

function abrirView(nome){
  if(["cadastro","pendentes"].includes(nome) && !podeNri()){
    toast("Seu perfil não possui acesso aos módulos de NRI.","erro"); return;
  }
  if(nome === "avarias" && !podeAvarias()){
    toast("Seu perfil não possui acesso ao módulo de Avarias.","erro"); return;
  }
  if((nome === "historico" || nome === "usuarios") && !isAdmin()){
    toast("Seu perfil não possui acesso a esta área.","erro"); return;
  }
  const target = $("view-"+nome);
  if(!target) return;
  document.querySelectorAll(".view").forEach(v => v.classList.remove("ativo"));
  document.querySelectorAll(".nav-item").forEach(v => v.classList.remove("ativo"));
  target.classList.add("ativo");
  const nav = document.querySelector(`.nav-item[data-view="${nome}"]`);
  if(nav) nav.classList.add("ativo");
  const titulos = {
    cadastro:["Cadastro de NRI","Identificação e rastreabilidade por palete"],
    pendentes:["Impressões pendentes","Três etiquetas idênticas por NRI em uma folha A4"],
    avarias:["Avarias","Registro, evidências e aprovação de ocorrências"],
    historico:["Histórico / rastreabilidade","Consulta por lote, produto, NRI, usuário e transporte"],
    usuarios:["Usuários e perfis","Administração de acessos ao sistema"]
  };
  $("tituloPagina").textContent = titulos[nome][0];
  $("subtituloPagina").textContent = titulos[nome][1];
  alternarMenu(false);
}

function alternarMenu(abrir){
  $("sidebar").classList.toggle("aberta", abrir);
  $("overlay").classList.toggle("ativo", abrir);
}

function iniciarAtualizacaoAutomatica(){
  pararAtualizacaoAutomatica();
  timerAtualizacaoAutomatica = setInterval(sincronizarTelaAtual, AUTO_REFRESH_MS);
}

function pararAtualizacaoAutomatica(){
  if(timerAtualizacaoAutomatica){
    clearInterval(timerAtualizacaoAutomatica);
    timerAtualizacaoAutomatica = null;
  }
}

async function sincronizarTelaAtual(){
  if(atualizacaoAutomaticaEmAndamento || !usuarioAtual || !tokenSessao) return;
  if(document.visibilityState === "hidden") return;
  if(document.querySelector(".modal.aberto")) return;

  const view = document.querySelector(".view.ativo");
  if(!view) return;

  atualizacaoAutomaticaEmAndamento = true;
  try{
    if(view.id === "view-cadastro"){
      await carregarConfig(true);
      return;
    }

    if(view.id === "view-pendentes"){
      const selecionados = new Set(
        [...document.querySelectorAll(".sel-pendente:checked")].map(x => String(x.dataset.id))
      );
      const d = await getApi("pendentes");
      if(d.status === "success"){
        pendentes = d.registros || [];
        renderPendentes(selecionados);
        atualizarBadge();
      }
      return;
    }

    if(view.id === "view-avarias" && podeAvarias()){
      const d = await getApi("avarias");
      if(d.status === "success"){
        avarias = d.registros || [];
        renderAvarias();
        atualizarBadgeAvarias();
      }
      return;
    }

    if(view.id === "view-historico" && isAdmin()){
      const d = await getApi("historico");
      if(d.status === "success"){
        historico = d.registros || [];
        renderHistorico();
      }
      return;
    }

    if(view.id === "view-usuarios" && isAdmin()){
      const d = await getApi("usuarios");
      if(d.status === "success"){
        usuarios = d.usuarios || [];
        renderUsuarios();
      }
    }
  }catch(e){
    if(String(e.message||e) === "SESSAO_EXPIRADA") tratarErroApi(e);
  }finally{
    atualizacaoAutomaticaEmAndamento = false;
  }
}

document.addEventListener("visibilitychange", () => {
  if(document.visibilityState === "visible" && usuarioAtual && tokenSessao){
    sincronizarTelaAtual();
  }
});

function preencherDatasPadrao(){
  const agora = new Date();
  if($("recebimento")) $("recebimento").value = dataInputLocal(agora);
  if($("hora")) $("hora").value = horaInputLocal(agora);
  if($("avariaData") && !$("avariaData").value) $("avariaData").value = dataInputLocal(agora);
}

async function carregarConfig(silencioso=false){
  try{
    const d = await getApi("config");
    if(d.status !== "success") throw new Error(d.message || "Falha ao carregar configurações");
    aplicarConfig(d, true);
  }catch(e){
    if(!silencioso || String(e.message||e) === "SESSAO_EXPIRADA") tratarErroApi(e);
  }
}

function aplicarConfig(d, preservarValores=true){
  const idsSelect = ["unidade","conferente","turno","motorista","fabrica","filtroUnidade","filtroHistUnidade"];
  const valoresAtuais = {};
  if(preservarValores){
    idsSelect.forEach(id => { const campo=$(id); valoresAtuais[id]=campo ? campo.value : ""; });
  }

  config = {...config,...d};
  preencherSelect("unidade",config.unidades||[],"Selecione");
  preencherSelect("conferente",config.conferentes,"Selecione");
  preencherSelect("turno",config.turnos,"Selecione");
  preencherSelect("motorista",config.motoristas,"Selecione");
  preencherSelect("fabrica",config.fabricas,"Selecione");
  preencherSelect("filtroUnidade",config.unidades,"Todas");
  preencherSelect("filtroHistUnidade",config.unidades,"Todas");

  if(preservarValores){
    idsSelect.forEach(id => {
      if(valoresAtuais[id]) definirValorSelect(id,valoresAtuais[id]);
    });
  }

  const dl = $("listaProdutos");
  dl.innerHTML="";
  (config.produtos||[]).forEach(p => {
    const o=document.createElement("option");
    o.value=p.codigo;
    o.label=`${p.codigo} - ${p.nome}`;
    dl.appendChild(o);
  });

  if($("codigoProduto").value.trim()) localizarProdutoDigitado();
  preencherClientesAvaria();
  preencherMotivosAvaria();
  if($("avariaPdv").value.trim()) localizarClienteAvaria();
}

function preencherSelect(id, lista, placeholder){
  const s=$(id); s.innerHTML = `<option value="">${placeholder}</option>`;
  (lista||[]).forEach(v => { const o=document.createElement("option"); o.value=typeof v==="string"?v:v.nome; o.textContent=o.value; s.appendChild(o); });
}

function definirValorSelect(id, valor){
  const select = $(id);
  const texto = String(valor || "").trim();
  if(!select || !texto) return;

  const existente = Array.from(select.options).find(o => normalizar(o.value) === normalizar(texto));
  if(existente){
    select.value = existente.value;
    return;
  }

  // Garante que o próprio usuário autenticado possa ser usado como conferente
  // mesmo se a lista de CONFERENTES ainda não tiver sido atualizada.
  const opcao = document.createElement("option");
  opcao.value = texto;
  opcao.textContent = texto;
  select.appendChild(opcao);
  select.value = texto;
}

async function preencherComUltimoCadastro(){
  const btn = $("btnUltimoCadastro");
  if(!btn || btn.disabled) return;

  btn.disabled = true;
  const textoOriginal = btn.textContent;
  btn.textContent = "Buscando último cadastro...";

  try{
    const d = await getApi("ultimoCadastro");
    if(d.status !== "success") throw new Error(d.message || "Não foi possível localizar o último cadastro.");
    if(!d.registro){
      toast("Você ainda não possui um cadastro anterior para reaproveitar.","erro");
      return;
    }

    const r = d.registro;

    definirValorSelect("unidade", r.unidade);
    $("recebimento").value = r.recebimento || "";

    // O conferente é sempre o usuário que está atualmente autenticado.
    definirValorSelect("conferente", usuarioAtual?.nome || usuarioAtual?.usuario || r.conferente);

    definirValorSelect("turno", r.turno);
    $("hora").value = r.hora || "";
    definirValorSelect("motorista", r.motorista);
    $("placa").value = String(r.placa || "").toUpperCase();
    definirValorSelect("fabrica", r.fabrica);

    toast("Dados do último cadastro preenchidos. Informe agora os dados do produto.","sucesso");
    $("codigoProduto").focus();
  }catch(e){
    tratarErroApi(e);
  }finally{
    btn.disabled = false;
    btn.textContent = textoOriginal;
  }
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
  const ids=["unidade","validade","lote","recebimento","conferente","turno","hora","motorista","placa","fabrica","quantidade","qtdPaletes"];
  for(const id of ids){ if(!String($(id).value||"").trim()) return toast(`Preencha o campo ${document.querySelector(`label[for="${id}"]`).textContent.replace(" *","")}.`,"erro"); }
  if(Number($("qtdPaletes").value)<1 || Number($("qtdPaletes").value)>99) return toast("Quantidade de paletes deve ficar entre 1 e 99.","erro");

  enviandoCadastro=true; $("btnCadastrar").disabled=true; $("btnCadastrar").textContent="Salvando...";
  try{
    const payload={acao:"criar",unidade:$("unidade").value,codigoProduto:produtoAtual.codigo,nomeProduto:produtoAtual.nome,validade:$("validade").value,lote:$("lote").value.trim(),recebimento:$("recebimento").value,conferente:$("conferente").value,turno:$("turno").value,hora:$("hora").value,motorista:$("motorista").value,placa:$("placa").value.trim(),fabrica:$("fabrica").value,quantidade:Number($("quantidade").value),quantidadePaletes:Number($("qtdPaletes").value)};
    const d=await postApi(payload); if(d.status!=="success") throw new Error(d.message||"Erro ao cadastrar");
    toast(`${d.nris.length} NRI(s) cadastrado(s): ${d.nris.join(", ")}`,"sucesso");
    $("formCadastro").reset(); preencherDatasPadrao(); produtoAtual=null; resetPreviewProduto();
    await carregarPendentes();
    if(isAdmin()) await carregarHistorico();
    abrirView("pendentes");
  }catch(e){ tratarErroApi(e); }
  finally{ enviandoCadastro=false; $("btnCadastrar").disabled=false; $("btnCadastrar").textContent="Cadastrar NRI(s)"; }
}

async function carregarPendentes(){
  $("tbodyPendentes").innerHTML='<tr><td colspan="7" class="loading-row">Carregando...</td></tr>';
  try{ const d=await getApi("pendentes"); if(d.status!=="success") throw new Error(d.message); pendentes=d.registros||[]; renderPendentes(); atualizarBadge(); }
  catch(e){ $("tbodyPendentes").innerHTML='<tr><td colspan="7" class="empty-row">Falha ao carregar pendências.</td></tr>'; tratarErroApi(e); }
}

function filtrarPendentes(){
  const q=normalizar($("filtroPendentes").value), un=$("filtroUnidade").value;
  return pendentes.filter(r => (!un||r.unidade===un) && (!q||normalizar([r.nri,r.codigoProduto,r.nomeProduto,r.lote,r.placa].join(" ")).includes(q)));
}

function renderPendentes(selecionadosPreservados=null){
  const selecionados = selecionadosPreservados || new Set(
    [...document.querySelectorAll(".sel-pendente:checked")].map(x => String(x.dataset.id))
  );
  const lista=filtrarPendentes(); $("qtdPendentes").textContent=lista.length; const tb=$("tbodyPendentes"); tb.innerHTML="";
  if(!lista.length){ tb.innerHTML='<tr><td colspan="7" class="empty-row">Nenhum NRI pendente.</td></tr>'; return; }
  lista.forEach(r => { const tr=document.createElement("tr"); tr.innerHTML=`<td><input type="checkbox" class="sel-pendente" data-id="${esc(r.id)}"></td><td>${esc(r.nri)}<strong>${esc(r.codigoProduto)} - ${esc(r.nomeProduto)}</strong></td><td>${esc(r.lote)}<strong>${fmtData(r.validade)}</strong></td><td>${fmtData(r.recebimento)}<strong>${fmtData(r.bloqueio)}</strong></td><td>${esc(r.unidade)}<small>${esc(r.placa)} · ${esc(r.motorista)}</small></td><td>${esc(r.quantidade ?? r.caixas)}</td><td><div class="acoes"><button class="btn-mini" data-act="ver">Visualizar</button><button class="btn-mini" data-act="imprimir">Imprimir</button><button class="btn-mini perigo" data-act="remover">Remover</button></div></td>`;
    const checkbox = tr.querySelector('.sel-pendente');
    if(checkbox && selecionados.has(String(r.id))) checkbox.checked = true;
    tr.querySelector('[data-act="ver"]').onclick=()=>visualizarNri(r); tr.querySelector('[data-act="imprimir"]').onclick=()=>iniciarImpressao([r]); tr.querySelector('[data-act="remover"]').onclick=()=>removerNri(r); tb.appendChild(tr); });
}

function obterPendentesSelecionadas(){ const ids=[...document.querySelectorAll('.sel-pendente:checked')].map(x=>x.dataset.id); return pendentes.filter(r=>ids.includes(String(r.id))); }
function alternarSelecionadosVisiveis(){ const c=[...document.querySelectorAll('.sel-pendente')]; const marcar=c.some(x=>!x.checked); c.forEach(x=>x.checked=marcar); }
function atualizarBadge(){ $("badgePendentes").textContent=pendentes.length; }

async function removerNri(r){
  if(!confirm(`Remover ${r.nri} da fila de impressão? O registro permanecerá no histórico.`)) return;
  try{ const d=await postApi({acao:"remover",ids:[r.id]}); if(d.status!=="success") throw new Error(d.message); toast("NRI removido da fila.","sucesso"); await carregarPendentes(); if(isAdmin()) await carregarHistorico(); }
  catch(e){ tratarErroApi(e); }
}

async function carregarHistorico(){
  if(!isAdmin()) return;
  $("tbodyHistorico").innerHTML='<tr><td colspan="7" class="loading-row">Carregando...</td></tr>';
  try{ const d=await getApi("historico"); if(d.status!=="success") throw new Error(d.message); historico=d.registros||[]; renderHistorico(); }
  catch(e){ $("tbodyHistorico").innerHTML='<tr><td colspan="7" class="empty-row">Falha ao carregar histórico.</td></tr>'; tratarErroApi(e); }
}

function filtrarHistorico(){
  const q=normalizar($("filtroHistorico").value), st=$("filtroStatus").value, un=$("filtroHistUnidade").value, de=$("filtroDe").value, ate=$("filtroAte").value;
  return historico.filter(r=>{ const alvo=normalizar([r.nri,r.codigoProduto,r.nomeProduto,r.lote,r.placa,r.conferente,r.motorista,r.fabrica,r.usuarioCadastro,r.nomeUsuarioCadastro].join(" ")); const data=(r.criadoEmIso||"").slice(0,10); return (!q||alvo.includes(q))&&(!st||r.status===st)&&(!un||r.unidade===un)&&(!de||!data||data>=de)&&(!ate||!data||data<=ate); });
}

function renderHistorico(){
  if(!isAdmin()) return;
  const lista=filtrarHistorico(); const tb=$("tbodyHistorico"); tb.innerHTML="";
  if(!lista.length){ tb.innerHTML='<tr><td colspan="7" class="empty-row">Nenhum registro encontrado.</td></tr>'; return; }
  lista.forEach(r=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${esc(r.criadoEm||"-")}<small>${esc(r.usuarioCadastro||"-")}</small></td><td>${esc(r.nri)}<strong>${esc(r.codigoProduto)} - ${esc(r.nomeProduto)}</strong></td><td>${esc(r.lote)}<strong>${fmtData(r.validade)}</strong></td><td>${esc(r.unidade)}<small>${esc(r.placa)} · ${esc(r.motorista)}</small></td><td><strong>${esc(r.nomeUsuarioCadastro||r.usuarioCadastro||"-")}</strong><small>Conferente: ${esc(r.conferente||"-")}</small></td><td><span class="status ${String(r.status).toLowerCase()}">${esc(r.status)}</span></td><td><div class="acoes"><button class="btn-mini" data-act="ver">Ver</button>${r.status==="IMPRESSO"?'<button class="btn-mini" data-act="reemitir">Reemitir</button>':r.status==="PENDENTE"?'<button class="btn-mini" data-act="imprimir">Imprimir</button>':''}</div></td>`;
    tr.querySelector('[data-act="ver"]').onclick=()=>visualizarNri(r); const ri=tr.querySelector('[data-act="reemitir"]'); if(ri) ri.onclick=()=>iniciarImpressao([r],true); const im=tr.querySelector('[data-act="imprimir"]'); if(im) im.onclick=()=>iniciarImpressao([r]); tb.appendChild(tr); });
}

function limparFiltrosHistorico(){ ["filtroHistorico","filtroStatus","filtroHistUnidade","filtroDe","filtroAte"].forEach(id=>$(id).value=""); renderHistorico(); }

async function carregarUsuarios(){
  if(!isAdmin()) return;
  try{ const d=await getApi("usuarios"); if(d.status!=="success") throw new Error(d.message); usuarios=d.usuarios||[]; renderUsuarios(); }
  catch(e){ tratarErroApi(e); }
}

function renderUsuarios(){
  const tb=$("tbodyUsuarios"); tb.innerHTML="";
  if(!usuarios.length){ tb.innerHTML='<tr><td colspan="5" class="empty-row">Nenhum usuário cadastrado.</td></tr>'; return; }
  usuarios.forEach(u=>{
    const tr=document.createElement("tr");
    tr.innerHTML=`<td><strong>${esc(u.usuario)}</strong></td><td>${esc(u.nome)}</td><td><span class="status ${u.perfil==='ADMIN'?'impresso':'pendente'}">${esc(rotuloPerfil(u.perfil))}</span></td><td>${u.ativo?'<span class="status impresso">ATIVO</span>':'<span class="status removido">INATIVO</span>'}</td><td><button class="btn-mini" data-edit>Editar</button></td>`;
    tr.querySelector("[data-edit]").onclick=()=>editarUsuario(u);
    tb.appendChild(tr);
  });
}

function editarUsuario(u){
  $("usuarioOriginal").value=u.usuario;
  $("novoUsuario").value=u.usuario;
  $("novoNome").value=u.nome;
  $("novoPerfil").value=u.perfil;
  $("novaSenha").value="";
  $("novoAtivo").checked=!!u.ativo;
  $("senhaOpcional").textContent="(deixe em branco para manter a atual)";
  window.scrollTo({top:0,behavior:"smooth"});
}

function limparFormularioUsuario(){
  $("formUsuario").reset();
  $("usuarioOriginal").value="";
  $("novoPerfil").value="COLABORADOR_ARMAZEM";
  $("novoAtivo").checked=true;
  $("senhaOpcional").textContent="";
}

async function salvarUsuario(ev){
  ev.preventDefault(); if(!isAdmin()) return;
  const original=$("usuarioOriginal").value.trim();
  const usuario=$("novoUsuario").value.trim();
  const nome=$("novoNome").value.trim();
  const perfil=$("novoPerfil").value;
  const senha=$("novaSenha").value;
  const ativo=$("novoAtivo").checked;
  if(!usuario||!nome||!perfil) return toast("Preencha usuário, nome e perfil.","erro");
  if(!original && senha.length<6) return toast("Para novo usuário, informe uma senha com pelo menos 6 caracteres.","erro");
  if(senha && senha.length<6) return toast("A senha deve ter pelo menos 6 caracteres.","erro");
  $("btnSalvarUsuario").disabled=true; $("btnSalvarUsuario").textContent="Salvando...";
  try{
    const d=await postApi({acao:"salvarUsuario",usuarioOriginal:original,usuario,nome,perfil,senha,ativo});
    if(d.status!=="success") throw new Error(d.message);
    toast("Usuário salvo com sucesso.","sucesso"); limparFormularioUsuario(); await carregarUsuarios();
  }catch(e){ tratarErroApi(e); }
  finally{ $("btnSalvarUsuario").disabled=false; $("btnSalvarUsuario").textContent="Salvar usuário"; }
}

function preencherClientesAvaria(){
  const dl=$("listaPdvs"); if(!dl) return;
  dl.innerHTML="";
  (config.clientes||[]).forEach(c=>{
    const o=document.createElement("option");
    o.value=String(c.codigo||"");
    o.label=`${c.codigo} - ${c.nome} - ${c.cidade}`;
    dl.appendChild(o);
  });
}

function preencherMotivosAvaria(){
  const s=$("avariaMotivo"); if(!s) return;
  const atual=s.value;
  s.innerHTML='<option value="">Selecione</option>';
  (config.motivosAvaria||[]).forEach(m=>{
    const o=document.createElement("option"); o.value=m; o.textContent=m; s.appendChild(o);
  });
  if(atual && [...s.options].some(o=>o.value===atual)) s.value=atual;
}

function localizarClienteAvaria(){
  const codigo=String($("avariaPdv").value||"").trim();
  const cliente=(config.clientes||[]).find(c=>String(c.codigo||"").trim().toUpperCase()===codigo.toUpperCase()) || null;
  if(cliente){
    $("avariaClienteNome").textContent=cliente.nome || "Cliente sem nome";
    $("avariaCidade").textContent=cliente.cidade || "\u2014";
    $("clienteAvariaCard").classList.add("localizado");
    return cliente;
  }
  $("avariaClienteNome").textContent=codigo ? "PDV n\u00e3o encontrado" : "Digite um PDV para localizar o cliente";
  $("avariaCidade").textContent="\u2014";
  $("clienteAvariaCard").classList.remove("localizado");
  return null;
}

async function onFotoAvariaSelecionada(ev){
  const input=ev.target;
  const file=input.files && input.files[0];
  input.value="";
  if(!file) return;
  if(!String(file.type||"").startsWith("image/")) return toast("Selecione um arquivo de imagem.","erro");
  try{
    $("fotoAvariaStatus").textContent="Processando...";
    fotoAvariaDataUrl=await comprimirImagem(file,1400,0.8);
    const area=$("fotoAvariaPreview");
    area.classList.remove("vazio");
    area.innerHTML='<img alt="Foto da avaria">';
    area.querySelector("img").src=fotoAvariaDataUrl;
    $("fotoAvariaStatus").textContent="Foto pronta";
    $("fotoAvariaStatus").classList.add("ok");
    $("btnRemoverFotoAvaria").classList.remove("oculto");
  }catch(e){
    limparFotoAvaria();
    toast("N\u00e3o foi poss\u00edvel processar a foto.","erro");
  }
}

function comprimirImagem(file,maxDim=1400,qualidade=0.8){
  return new Promise((resolve,reject)=>{
    const leitor=new FileReader();
    leitor.onerror=()=>reject(new Error("Falha ao ler imagem"));
    leitor.onload=()=>{
      const img=new Image();
      img.onerror=()=>reject(new Error("Imagem inv\u00e1lida"));
      img.onload=()=>{
        const escala=Math.min(1,maxDim/Math.max(img.naturalWidth||1,img.naturalHeight||1));
        const w=Math.max(1,Math.round(img.naturalWidth*escala));
        const h=Math.max(1,Math.round(img.naturalHeight*escala));
        const c=document.createElement("canvas"); c.width=w; c.height=h;
        const ctx=c.getContext("2d");
        ctx.fillStyle="#fff"; ctx.fillRect(0,0,w,h); ctx.drawImage(img,0,0,w,h);
        resolve(c.toDataURL("image/jpeg",qualidade));
      };
      img.src=leitor.result;
    };
    leitor.readAsDataURL(file);
  });
}

function limparFotoAvaria(){
  fotoAvariaDataUrl="";
  const area=$("fotoAvariaPreview");
  if(area){ area.classList.add("vazio"); area.innerHTML='<span>&#128247;</span><small>Nenhuma foto adicionada</small>'; }
  if($("fotoAvariaStatus")){ $("fotoAvariaStatus").textContent="Pendente"; $("fotoAvariaStatus").classList.remove("ok"); }
  if($("btnRemoverFotoAvaria")) $("btnRemoverFotoAvaria").classList.add("oculto");
}

function configurarCanvasAssinatura(){
  const canvas=$("assinaturaCanvas"); if(!canvas) return;
  const ctx=canvas.getContext("2d");
  const limparBase=()=>{ ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height); };
  limparBase();
  ctx.strokeStyle="#162b3d"; ctx.lineWidth=6; ctx.lineCap="round"; ctx.lineJoin="round";

  const ponto=(e)=>{
    const r=canvas.getBoundingClientRect();
    return {x:(e.clientX-r.left)*(canvas.width/r.width),y:(e.clientY-r.top)*(canvas.height/r.height)};
  };
  canvas.addEventListener("pointerdown",e=>{
    e.preventDefault(); desenhandoAssinatura=true; canvas.setPointerCapture?.(e.pointerId);
    const p=ponto(e); ctx.beginPath(); ctx.moveTo(p.x,p.y);
  });
  canvas.addEventListener("pointermove",e=>{
    if(!desenhandoAssinatura) return; e.preventDefault(); const p=ponto(e); ctx.lineTo(p.x,p.y); ctx.stroke();
    assinaturaFeita=true; atualizarStatusAssinatura();
  });
  const fim=e=>{ if(!desenhandoAssinatura) return; e.preventDefault(); desenhandoAssinatura=false; ctx.closePath(); };
  canvas.addEventListener("pointerup",fim); canvas.addEventListener("pointercancel",fim); canvas.addEventListener("pointerleave",fim);
}

function atualizarStatusAssinatura(){
  $("assinaturaPlaceholder").classList.toggle("oculto",assinaturaFeita);
  $("assinaturaStatus").textContent=assinaturaFeita?"Assinada":"Pendente";
  $("assinaturaStatus").classList.toggle("ok",assinaturaFeita);
}

function limparAssinatura(){
  const canvas=$("assinaturaCanvas"); if(!canvas) return;
  const ctx=canvas.getContext("2d"); ctx.fillStyle="#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.strokeStyle="#162b3d"; ctx.lineWidth=6; ctx.lineCap="round"; ctx.lineJoin="round";
  assinaturaFeita=false; desenhandoAssinatura=false; atualizarStatusAssinatura();
}

function limparFormularioAvaria(){
  const form=$("formAvaria"); if(!form) return;
  form.reset();
  $("avariaData").value=dataInputLocal(new Date());
  $("avariaEntregador").value=usuarioAtual?.nome || usuarioAtual?.usuario || "";
  limparFotoAvaria(); limparAssinatura(); localizarClienteAvaria(); preencherMotivosAvaria();
}

async function salvarAvaria(ev){
  ev.preventDefault(); if(enviandoAvaria || !podeAvarias()) return;
  const cliente=localizarClienteAvaria();
  if(!$("avariaData").value) return toast("Informe a data da avaria.","erro");
  if(!cliente) return toast("Informe um PDV v\u00e1lido da base de clientes.","erro");
  const ids=["avariaMapa","avariaProduto","avariaLote","avariaQuantidade","avariaUnidadeQtd","avariaMotivo"];
  for(const id of ids){ if(!String($(id).value||"").trim()) return toast(`Preencha o campo ${document.querySelector(`label[for="${id}"]`)?.textContent.replace(" *","") || id}.`,"erro"); }
  if(!fotoAvariaDataUrl) return toast("A foto do produto avariado \u00e9 obrigat\u00f3ria.","erro");
  if(!assinaturaFeita) return toast("A assinatura do cliente \u00e9 obrigat\u00f3ria.","erro");

  enviandoAvaria=true; $("btnSalvarAvaria").disabled=true; $("btnSalvarAvaria").textContent="Enviando evid\u00eancias...";
  try{
    const d=await postApi({
      acao:"salvarAvaria",data:$("avariaData").value,pdv:$("avariaPdv").value.trim(),mapa:$("avariaMapa").value.trim(),
      produtoAvariado:$("avariaProduto").value.trim(),lote:$("avariaLote").value.trim(),quantidadeAvariada:Number($("avariaQuantidade").value),
      unidadeQuantidade:$("avariaUnidadeQtd").value,motivoAvaria:$("avariaMotivo").value,fotoDataUrl:fotoAvariaDataUrl,
      assinaturaDataUrl:$("assinaturaCanvas").toDataURL("image/png")
    });
    if(d.status!=="success") throw new Error(d.message||"Erro ao registrar avaria.");
    toast(d.loteCompativel?"Avaria registrada. Lote compat\u00edvel com o hist\u00f3rico NRI.":"Avaria registrada. O lote n\u00e3o foi encontrado no hist\u00f3rico NRI.","sucesso");
    limparFormularioAvaria(); await carregarAvarias(true);
  }catch(e){ tratarErroApi(e); }
  finally{ enviandoAvaria=false; $("btnSalvarAvaria").disabled=false; $("btnSalvarAvaria").textContent="Registrar avaria"; }
}

async function carregarAvarias(silencioso=false){
  if(!podeAvarias()) return;
  if(!silencioso) $("tbodyAvarias").innerHTML='<tr><td colspan="7" class="loading-row">Carregando avarias...</td></tr>';
  try{
    const d=await getApi("avarias"); if(d.status!=="success") throw new Error(d.message);
    avarias=d.registros||[]; renderAvarias(); atualizarBadgeAvarias();
  }catch(e){ if(!silencioso) $("tbodyAvarias").innerHTML='<tr><td colspan="7" class="empty-row">Falha ao carregar avarias.</td></tr>'; tratarErroApi(e); }
}

function filtrarAvarias(){
  if(!isAdmin()) return avarias;
  const q=normalizar($("filtroAvarias").value), st=$("filtroStatusAvaria").value, lote=$("filtroLoteAvaria").value;
  return avarias.filter(r=>{
    const alvo=normalizar([r.pdv,r.cliente,r.cidade,r.entregadorNome,r.produtoAvariado,r.lote,r.mapa,r.motivoAvaria].join(" "));
    const loteOk=!lote || (lote==="COMPATIVEL"?!!r.loteCompativel:!r.loteCompativel);
    return (!q||alvo.includes(q))&&(!st||r.status===st)&&loteOk;
  });
}

function renderAvarias(){
  if(!podeAvarias()) return;
  const lista=filtrarAvarias(), tb=$("tbodyAvarias"); tb.innerHTML="";
  if(!lista.length){ tb.innerHTML='<tr><td colspan="7" class="empty-row">Nenhuma avaria encontrada.</td></tr>'; return; }
  lista.forEach(r=>{
    const tr=document.createElement("tr");
    const comp=r.loteCompativel?'<span class="lote-badge ok">Lote compat\u00edvel</span>':'<span class="lote-badge nao">Lote n\u00e3o encontrado</span>';
    const cls=String(r.status||"pendente").toLowerCase();
    const acoes=isAdmin() && r.status==="PENDENTE"
      ? '<button class="btn-mini" data-ver>Visualizar</button><button class="btn-mini aprovar" data-aprovar>Aprovar</button><button class="btn-mini perigo" data-reprovar>Reprovar</button>'
      : '<button class="btn-mini" data-ver>Visualizar</button>';
    tr.innerHTML=`<td>${fmtData(r.data)}<strong>PDV ${esc(r.pdv)} - ${esc(r.cliente)}</strong><small>${esc(r.cidade)} \u2022 Mapa ${esc(r.mapa)}</small></td><td><strong>${esc(r.entregadorNome||r.entregadorUsuario)}</strong><small>${esc(r.criadoEm||"")}</small></td><td><strong>${esc(r.produtoAvariado)}</strong><small>Lote: ${esc(r.lote)}</small></td><td><strong>${esc(r.quantidadeAvariada)} ${esc(formatarUnidadeAvaria(r.unidadeQuantidade))}</strong><small>${esc(r.motivoAvaria)}</small></td><td>${comp}</td><td><span class="status ${cls}">${esc(r.status)}</span>${r.avaliadoPorNome?`<small>Por ${esc(r.avaliadoPorNome)} em ${esc(r.avaliadoEm)}</small>`:""}</td><td><div class="acoes">${acoes}</div></td>`;
    tr.querySelector("[data-ver]").onclick=()=>visualizarAvaria(r);
    const ap=tr.querySelector("[data-aprovar]"); if(ap) ap.onclick=()=>avaliarAvaria(r.id,"APROVADO");
    const rp=tr.querySelector("[data-reprovar]"); if(rp) rp.onclick=()=>avaliarAvaria(r.id,"REPROVADO");
    tb.appendChild(tr);
  });
}

function formatarUnidadeAvaria(v){ return String(v||"").toUpperCase()==="CX"?"Cx":"Un"; }
function atualizarBadgeAvarias(){ if($("badgeAvarias")) $("badgeAvarias").textContent=avarias.filter(a=>a.status==="PENDENTE").length; }

async function visualizarAvaria(r){
  avariaDetalheAtual=r; abrirModal("modalDetalheAvaria");
  $("detalheAvariaConteudo").innerHTML='<div class="loading-row">Carregando foto, assinatura e rastreabilidade...</div>';
  try{
    const d=await getApi("detalheAvaria",{id:r.id}); if(d.status!=="success") throw new Error(d.message);
    avariaDetalheAtual=d.registro;
    const a=d.registro;
    const comp=a.loteCompativel?'<span class="lote-badge ok">Lote compat\u00edvel</span>':'<span class="lote-badge nao">Lote n\u00e3o encontrado</span>';
    const matches=isAdmin()?renderCorrespondenciasNri(d.correspondenciasNri||[]):"";
    $("detalheAvariaConteudo").innerHTML=`
      <div class="detalhe-grid">
        ${detalheItem("Data",fmtData(a.data))}${detalheItem("Entregador",a.entregadorNome)}${detalheItem("Status",a.status)}
        ${detalheItem("PDV",a.pdv+" - "+a.cliente)}${detalheItem("Cidade",a.cidade)}${detalheItem("Mapa",a.mapa)}
        ${detalheItem("Produto avariado",a.produtoAvariado)}${detalheItem("Lote",a.lote)}${detalheItem("Quantidade",a.quantidadeAvariada+" "+formatarUnidadeAvaria(a.unidadeQuantidade))}
        ${detalheItem("Motivo",a.motivoAvaria)}<div class="detalhe-item"><span>Compara\u00e7\u00e3o com NRI</span><strong>${comp}</strong></div>${detalheItem("Registrado em",a.criadoEm)}
      </div>
      <div class="detalhe-evidencias">
        <div class="detalhe-evidencia"><h4>Foto do produto avariado</h4><img id="detalheFotoAvaria" alt="Foto do produto avariado"></div>
        <div class="detalhe-evidencia"><h4>Assinatura do cliente</h4><img id="detalheAssinaturaAvaria" alt="Assinatura do cliente"></div>
      </div>
      ${matches}
      ${a.avaliadoPorNome?`<div class="avaliacao-box"><strong>Avaliado por:</strong> ${esc(a.avaliadoPorNome)} em ${esc(a.avaliadoEm||"")} ${a.observacaoAvaliacao?`<br><strong>Observa\u00e7\u00e3o:</strong> ${esc(a.observacaoAvaliacao)}`:""}</div>`:""}`;
    const foto=$("detalheFotoAvaria"); if(foto){ if(d.fotoDataUrl) foto.src=d.fotoDataUrl; else foto.replaceWith(document.createTextNode("Foto indispon\u00edvel")); }
    const ass=$("detalheAssinaturaAvaria"); if(ass){ if(d.assinaturaDataUrl) ass.src=d.assinaturaDataUrl; else ass.replaceWith(document.createTextNode("Assinatura indispon\u00edvel")); }
    $("btnAprovarAvariaModal").classList.toggle("oculto",!isAdmin()||a.status!=="PENDENTE");
    $("btnReprovarAvariaModal").classList.toggle("oculto",!isAdmin()||a.status!=="PENDENTE");
  }catch(e){ $("detalheAvariaConteudo").innerHTML=`<div class="empty-row">${esc(e.message||e)}</div>`; }
}

function detalheItem(rotulo,valor){ return `<div class="detalhe-item"><span>${esc(rotulo)}</span><strong>${esc(valor||"-")}</strong></div>`; }
function renderCorrespondenciasNri(lista){
  if(!lista.length) return '<div class="nri-match-box"><h4>Rastreabilidade NRI</h4><span class="lote-badge nao">Lote n\u00e3o encontrado no hist\u00f3rico de NRI</span></div>';
  return `<div class="nri-match-box"><h4>Rastreabilidade NRI - ${lista.length} correspond\u00eancia(s)</h4><div class="nri-match-list">${lista.map(n=>`<div class="nri-match-item"><strong>${esc(n.nri)}</strong><span>${esc(n.codigoProduto)} - ${esc(n.nomeProduto)}</span><span>${esc(n.unidade)} \u2022 ${fmtData(n.validade)}</span></div>`).join("")}</div></div>`;
}

async function avaliarAvaria(id,decisao){
  if(!isAdmin()) return;
  let observacao="";
  if(decisao==="APROVADO"){
    if(!confirm("Aprovar esta avaria?")) return;
  }else{
    const resp=prompt("Observa\u00e7\u00e3o da reprova\u00e7\u00e3o (opcional):","");
    if(resp===null) return; observacao=resp;
  }
  try{
    const d=await postApi({acao:"avaliarAvaria",id,decisao,observacao}); if(d.status!=="success") throw new Error(d.message);
    toast(decisao==="APROVADO"?"Avaria aprovada.":"Avaria reprovada.","sucesso");
    fecharModal("modalDetalheAvaria"); avariaDetalheAtual=null; await carregarAvarias(true);
  }catch(e){ tratarErroApi(e); }
}

function visualizarNri(r){ previewAtual=r; $("previewConteudo").innerHTML=htmlEtiqueta(r,false); carregarImagensPreview(); abrirModal("modalPreview"); }
function abrirModal(id){ $(id).classList.add("aberto"); $(id).setAttribute("aria-hidden","false"); }
function fecharModal(id){ $(id).classList.remove("aberto"); $(id).setAttribute("aria-hidden","true"); }

function carregarImagensPreview(){
  $("previewConteudo").querySelectorAll("img[data-code]").forEach(img=>carregarImagemComFallback(img,img.dataset.code));
}

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
  try{ const d=await postApi({acao:"confirmarImpressao",ids,reemissao:!!impressaoPendente.reemissao,copias:3}); if(d.status!=="success") throw new Error(d.message); toast(impressaoPendente.reemissao?"Reemissão registrada.":"Impressão confirmada e fila atualizada.","sucesso"); fecharModal("modalConfirmacaoImpressao"); impressaoPendente=null; await carregarPendentes(); if(isAdmin()) await carregarHistorico(); }
  catch(e){ tratarErroApi(e); }
}

async function confirmarImpressaoCancelada(){
  if(!impressaoPendente){ fecharModal("modalConfirmacaoImpressao"); return; }
  try{ await postApi({acao:"cancelarImpressao",ids:impressaoPendente.registros.map(r=>r.id),reemissao:!!impressaoPendente.reemissao}); }catch(_e){}
  impressaoPendente=null; fecharModal("modalConfirmacaoImpressao"); toast("Impressão mantida como não concluída.","erro");
}

function documentoImpressao(registros){
  const paginas=registros.map(r=>`<section class="page">${htmlEtiqueta(r,true)}${htmlEtiqueta(r,true)}${htmlEtiqueta(r,true)}</section>`).join("");
  return `<!DOCTYPE html><html><head><base href="${document.baseURI}"><meta charset="UTF-8"><style>
@page{size:A4 portrait;margin:5mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,Helvetica,sans-serif;color:#686868}.page{height:287mm;display:flex;flex-direction:column;justify-content:space-between;page-break-after:always}.page:last-child{page-break-after:auto}.nri-preview-label{height:89mm;width:100%;border:1.2px solid #777;background:#fff;color:#686868;overflow:hidden}.nri-top{display:grid;grid-template-columns:auto 1fr auto;align-items:center;height:11mm;border-bottom:2px solid #777}.nri-code-label{padding:.5mm 2.2mm;font-size:20pt;font-weight:1000;border-right:2px solid #777;color:#686868}.nri-code-value{padding:.2mm 3mm;font-size:36pt;line-height:1;font-weight:1000;color:#000!important}.nri-id{padding:.5mm 2mm;font-size:10pt;font-weight:900;color:#686868}.nri-product-title{height:18mm;border-bottom:1px solid #777;display:flex;align-items:center;justify-content:center;gap:3mm;padding:1mm 3mm;text-align:center}.nri-product-title img{width:14mm;height:14mm;object-fit:contain}.nri-product-title strong{font-size:24pt;line-height:.96;font-weight:1000;letter-spacing:.1mm}.nri-mini-strip{display:grid;grid-template-columns:1fr 1fr;height:4.5mm;border-bottom:1px solid #777}.nri-mini-cell{display:flex;align-items:center;padding:.2mm 1.8mm;font-size:9pt;font-weight:700}.nri-mini-cell+.nri-mini-cell{border-left:1px solid #777}.nri-mini-cell b{font-size:8.5pt;font-weight:1000;text-transform:uppercase;margin-right:1.3mm}.nri-validade{display:grid;grid-template-columns:31% 69%;align-items:center;height:28mm;border-bottom:1px solid #777}.nri-validade span{height:100%;display:flex;align-items:center;padding:1.5mm 2.5mm;border-right:1px solid #777;font-size:25pt;font-weight:1000;letter-spacing:-.3mm}.nri-validade strong{font-size:58pt;line-height:.84;text-align:center;font-weight:1000;letter-spacing:.1mm;color:#000!important}.nri-dates{display:grid;grid-template-columns:1fr 1fr;height:10mm;border-bottom:1px solid #777}.nri-date-cell{display:grid;grid-template-columns:auto 1fr;align-items:center}.nri-date-cell+.nri-date-cell{border-left:1px solid #777}.nri-date-cell b{padding:1mm 1.8mm;font-size:10.5pt;font-weight:1000}.nri-date-cell strong{text-align:center;padding:1mm 1.4mm;border-left:1px solid #777;font-size:13.5pt;line-height:1;font-weight:1000}.nri-meta{display:grid;grid-template-columns:1.55fr .85fr .8fr 1.15fr 1fr;height:7mm;border-bottom:1px solid #777}.nri-meta-cell{text-align:center;border-right:1px solid #777;overflow:hidden}.nri-meta-cell:last-child{border-right:0}.nri-meta-cell b{display:block;padding:.08mm .6mm 0;font-size:7.8pt;line-height:.95;font-weight:1000;text-decoration:underline;text-transform:uppercase;color:#686868}.nri-meta-cell span{display:block;padding:.05mm .6mm 0;font-size:9.6pt;line-height:.95;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#686868}.nri-bottom{display:grid;grid-template-columns:1.8fr .75fr 1.1fr;height:5.5mm}.nri-bottom>div{display:flex;align-items:center;padding:.2mm 1.6mm;font-size:9.5pt;line-height:1;font-weight:700;border-right:1px solid #777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.nri-bottom>div:last-child{border-right:0}.nri-bottom b{font-size:9pt;font-weight:1000;text-transform:uppercase;margin-right:1.2mm}.nri-product-title strong,.nri-mini-cell,.nri-mini-cell b,.nri-validade span,.nri-date-cell b,.nri-date-cell strong,.nri-meta-cell b,.nri-meta-cell span,.nri-bottom>div,.nri-bottom b{color:#686868}.nri-validade strong{color:#000!important}
</style></head><body>${paginas}<script>function imgFallback(img,code,i){const ex=['png','jpg','jpeg','webp'];i=i||0;if(i>=ex.length){img.style.display='none';return;}img.onerror=function(){imgFallback(img,code,i+1)};img.src='${PASTA_IMAGENS}/'+encodeURIComponent(code)+'.'+ex[i];}<\/script></body></html>`;
}

function htmlEtiqueta(r, paraImpressao){
  const img = paraImpressao
    ? `<img alt="" onerror="imgFallback(this,'${jsEsc(r.codigoProduto)}',1)" src="${PASTA_IMAGENS}/${encodeURIComponent(r.codigoProduto)}.png">`
    : `<img alt="" data-code="${esc(r.codigoProduto)}">`;

  return `<div class="nri-preview-label">
    <div class="nri-top">
      <div class="nri-code-label">CÓDIGO:</div>
      <div class="nri-code-value">${esc(r.codigoProduto)}</div>
      <div class="nri-id">${esc(r.nri)}</div>
    </div>
    <div class="nri-product-title">${img}<strong>${esc(r.nomeProduto)}</strong></div>
    <div class="nri-mini-strip">
      <div class="nri-mini-cell"><b>LOTE:</b>${esc(r.lote)}</div>
      <div class="nri-mini-cell"><b>UNIDADE:</b>${esc(r.unidade)}</div>
    </div>
    <div class="nri-validade"><span>VALIDADE:</span><strong>${fmtData(r.validade)}</strong></div>
    <div class="nri-dates">
      <div class="nri-date-cell"><b>RECEB:</b><strong>${fmtData(r.recebimento)}</strong></div>
      <div class="nri-date-cell"><b>BLOQUEIO:</b><strong>${fmtData(r.bloqueio)}</strong></div>
    </div>
    <div class="nri-meta">
      <div class="nri-meta-cell"><b>Conferente</b><span>${esc(r.conferente)}</span></div>
      <div class="nri-meta-cell"><b>Turno</b><span>${esc(r.turno)}</span></div>
      <div class="nri-meta-cell"><b>Hora</b><span>${esc(r.hora)}</span></div>
      <div class="nri-meta-cell"><b>Motorista</b><span>${esc(r.motorista)}</span></div>
      <div class="nri-meta-cell"><b>Placa</b><span>${esc(r.placa)}</span></div>
    </div>
    <div class="nri-bottom">
      <div><b>Fábrica:</b>${esc(r.fabrica)}</div>
      <div><b>Quantidade:</b>${esc(r.quantidade ?? r.caixas)}</div>
      <div><b>NRI:</b>${esc(r.nri)}</div>
    </div>
  </div>`;
}

async function getApi(acao, extras={}){
  const qs = new URLSearchParams({acao,token:tokenSessao,...extras,_:Date.now().toString()});
  const r = await fetch(`${WEB_APP_URL}?${qs.toString()}`,{cache:"no-store"});
  const d = await lerRespostaJson(r);
  if(d.status === "unauthorized") throw new Error("SESSAO_EXPIRADA");
  return d;
}

async function postApi(payload, semToken=false){
  const requestId = gerarRequestId();
  const body = semToken
    ? {...payload,requestId}
    : {...payload,token:tokenSessao,requestId};

  /*
    O Apps Script usa ContentService, que redireciona a resposta para
    script.googleusercontent.com. Em alguns navegadores, ler diretamente
    a resposta de um POST iniciado no GitHub Pages pode falhar por causa
    desse redirecionamento. Por isso o POST é enviado em modo no-cors e
    o resultado é consultado logo em seguida por GET usando requestId.
  */
  try{
    await fetch(WEB_APP_URL,{
      method:"POST",
      mode:"no-cors",
      body:JSON.stringify(body)
    });
  }catch(_e){
    throw new Error("Não foi possível enviar a solicitação ao Apps Script.");
  }

  const inicio = Date.now();
  const timeoutMs = 30000;

  while(Date.now() - inicio < timeoutMs){
    await esperar(350);

    const qs = new URLSearchParams({
      acao:"resultadoPost",
      requestId,
      _:Date.now().toString()
    });

    const r = await fetch(`${WEB_APP_URL}?${qs.toString()}`,{cache:"no-store"});
    const d = await lerRespostaJson(r);

    if(d.status === "processing") continue;
    if(d.status === "unauthorized") throw new Error("SESSAO_EXPIRADA");
    return d;
  }

  throw new Error("O servidor demorou mais que o esperado para concluir a operação. Tente novamente.");
}

function gerarRequestId(){
  if(window.crypto && typeof window.crypto.randomUUID === "function"){
    return window.crypto.randomUUID();
  }
  return "nri-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

function esperar(ms){
  return new Promise(resolve => setTimeout(resolve,ms));
}

async function lerRespostaJson(response){
  const txt = await response.text();
  try{
    return JSON.parse(txt);
  }catch(_e){
    throw new Error("O Apps Script retornou uma resposta inválida. Verifique se a implantação foi publicada como App da Web e se a URL termina em /exec.");
  }
}

function tratarErroApi(e){
  if(String(e.message||e) === "SESSAO_EXPIRADA"){
    pararAtualizacaoAutomatica();
    limparSessaoLocal(); tokenSessao=""; usuarioAtual=null; mostrarLogin("Sua sessão expirou. Entre novamente.");
    return;
  }
  toast(e.message||String(e),"erro");
}

function urlConfigurada(){ return WEB_APP_URL.startsWith("https://script.google.com/macros/s/") && WEB_APP_URL.endsWith("/exec"); }
function normalizar(v){ return String(v||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim(); }
function fmtData(v){ if(!v) return "-"; if(/^\d{4}-\d{2}-\d{2}$/.test(v)){ const [y,m,d]=v.split("-"); return `${d}/${m}/${y}`; } return v; }
function dataInputLocal(d){ return new Intl.DateTimeFormat("en-CA",{timeZone:TZ,year:"numeric",month:"2-digit",day:"2-digit"}).format(d); }
function horaInputLocal(d){ return new Intl.DateTimeFormat("pt-BR",{timeZone:TZ,hour:"2-digit",minute:"2-digit",hour12:false}).format(d); }
function esc(v){ return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])); }
function jsEsc(v){ return String(v??"").replace(/\\/g,"\\\\").replace(/'/g,"\\'"); }
let toastTimer; function toast(msg,tipo=""){ const t=$("toast"); t.textContent=msg; t.className=`toast show ${tipo}`; clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.className="toast",3600); }
