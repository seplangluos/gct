import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, ref, push, set, onValue, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

// =========================================================================
// CONFIGURAÇÃO FIREBASE
// =========================================================================
const firebaseConfig = {
    apiKey: "AIzaSyDIMziMEygrNUc3VeYxLOyj98JSMyeEkI8",
    authDomain: "cadastro-39a2b.firebaseapp.com",
    databaseURL: "https://cadastro-39a2b-default-rtdb.firebaseio.com",
    projectId: "cadastro-39a2b",
    storageBucket: "cadastro-39a2b.firebasestorage.app",
    messagingSenderId: "457985275329",
    appId: "1:457985275329:web:3f830cce90394d93e76b40"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

// =========================================================================
// VARIÁVEIS GLOBAIS
// =========================================================================
let configData = { Assuntos: [], Cadastradores: [], Status: ["Em andamento", "Concluído", "Parado"] };
let processosData = [];
let currentMode = ''; // 'edicao', 'pesquisa', 'base'
let charts = [];

// Variáveis de Paginação
let currentPage = 1;
const itemsPerPage = 50;
let filteredList = []; 

// =========================================================================
// UTILITÁRIOS
// =========================================================================
function formatProcessoParaDB(proc) { 
    return proc ? proc.replace(/\//g, '-') : ''; 
}

function formatProcessoParaTela(proc) { 
    return proc ? proc.replace(/-/g, '/') : ''; 
}

function parseDateBR(dateStr) {
    if(!dateStr) return null;
    // O JSON original possui data com hífen (05-04-2021). O sistema converte tanto hífen quanto barra.
    const separator = dateStr.includes('-') ? '-' : '/';
    const parts = dateStr.split(separator);
    if(parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function calcularDias(dataEntradaStr) {
    const dataEnt = parseDateBR(dataEntradaStr);
    if(!dataEnt) return 0;
    
    // Zera as horas para calcular apenas os dias corridos
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataEnt.setHours(0, 0, 0, 0);

    const diffTime = Math.abs(hoje - dataEnt);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// =========================================================================
// NAVEGAÇÃO
// =========================================================================
window.nav = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    
    if(['login', 'consulta', 'dashboard', 'cadastro', 'estatisticas', 'configuracoes'].includes(screenId)) {
        document.getElementById(screenId + '-screen').classList.add('active');
        if(screenId === 'configuracoes') renderConfigLists();
        if(screenId === 'estatisticas') renderStats();
    } else {
        document.getElementById('tabela-geral-screen').classList.add('active');
        setupTabelaGeral(screenId);
    }
}

// =========================================================================
// AUTENTICAÇÃO
// =========================================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    
    document.getElementById('login-btn').innerText = 'Aguarde...';
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        nav('dashboard');
    } catch(err) {
        document.getElementById('login-error').innerText = "Erro ao logar. Verifique credenciais.";
        document.getElementById('login-error').classList.remove('hidden');
    } finally {
        document.getElementById('login-btn').innerText = 'Entrar';
    }
});

document.getElementById('btn-logout').addEventListener('click', () => { 
    signOut(auth); 
    nav('login'); 
});

document.getElementById('btn-open-consulta').addEventListener('click', () => nav('consulta'));

document.querySelectorAll('.btn-voltar-login').forEach(b => {
    b.addEventListener('click', () => nav('login'));
});

onAuthStateChanged(auth, user => {
    if(user) { 
        document.getElementById('user-info').innerText = user.email; 
        nav('dashboard'); 
        loadData(); 
    }
});

// =========================================================================
// CARREGAMENTO DE DADOS (REALTIME)
// =========================================================================
function loadData() {
    // Carrega as configurações (listas de Assuntos, Cadastradores, Status)
    onValue(ref(db, 'config'), snap => {
        if(snap.exists()) {
            configData = { ...configData, ...snap.val() };
            populateSelects();
            if(document.getElementById('configuracoes-screen').classList.contains('active')){
                renderConfigLists();
            }
        }
    });

    // Carrega os processos do nó JSON correspondente
    onValue(ref(db, 'processos'), snap => {
        processosData = [];
        if(snap.exists()) {
            // Verifica se os dados vieram como Array ou como Objeto
            const data = snap.val();
            if (Array.isArray(data)) {
                data.forEach((val, index) => { 
                    if(val) processosData.push({ id: index.toString(), ...val }); 
                });
            } else {
                Object.keys(data).forEach(key => {
                    processosData.push({ id: key, ...data[key] });
                });
            }
        }
        
        if(document.getElementById('tabela-geral-screen').classList.contains('active')) {
            renderTabelaGeral(false); 
        }
        if(document.getElementById('estatisticas-screen').classList.contains('active')) {
            renderStats();
        }
    });
}

function populateSelects() {
    const arrAssuntos = configData.Assuntos || [];
    const arrFuncs = configData.Cadastradores || [];
    const arrStatus = configData.Status || [];
    
    document.querySelectorAll('.dyn-assuntos').forEach(sel => {
        sel.innerHTML = '<option value="">Selecione...</option>' + arrAssuntos.map(a => `<option value="${a}">${a}</option>`).join('');
    });
    document.querySelectorAll('.dyn-funcionarios').forEach(sel => {
        sel.innerHTML = '<option value="">Selecione...</option>' + arrFuncs.map(a => `<option value="${a}">${a}</option>`).join('');
    });
    document.querySelectorAll('.dyn-status').forEach(sel => {
        sel.innerHTML = '<option value="">Selecione...</option>' + arrStatus.map(a => `<option value="${a}">${a}</option>`).join('');
    });
}

// =========================================================================
// CONFIGURAÇÕES (Adicionar/Remover itens das listas)
// =========================================================================
function renderConfigLists() {
    const gerarHtml = (arr, chave) => {
        return (arr || []).map((item, idx) => `
            <li class="flex justify-between items-center" style="padding: 8px 0; border-bottom: 1px solid var(--color-border);">
                <span>${item}</span>
                <button class="btn btn--error btn--sm" onclick="removerConfigItem('${chave}', ${idx})" style="padding: 4px 8px; font-size: 10px; background: red; color: white; border: none;">Excluir</button>
            </li>
        `).join('');
    };

    document.getElementById('lista-assuntos').innerHTML = gerarHtml(configData.Assuntos, 'Assuntos');
    document.getElementById('lista-funcionarios').innerHTML = gerarHtml(configData.Cadastradores, 'Cadastradores');
    document.getElementById('lista-status').innerHTML = gerarHtml(configData.Status, 'Status');
}

window.addConfigItem = async function(chave, inputId) {
    const valor = document.getElementById(inputId).value.trim();
    if(!valor) return;
    
    const novaLista = [...(configData[chave] || []), valor];
    
    try {
        await set(ref(db, 'config/' + chave), novaLista);
        document.getElementById(inputId).value = '';
    } catch(err) { 
        alert("Erro ao salvar: " + err.message); 
    }
}

window.removerConfigItem = async function(chave, index) {
    if(!confirm('Tem certeza que deseja remover este item?')) return;
    
    const novaLista = [...(configData[chave] || [])];
    novaLista.splice(index, 1);
    
    try {
        await set(ref(db, 'config/' + chave), novaLista);
    } catch(err) { 
        alert("Erro ao remover: " + err.message); 
    }
}

// =========================================================================
// TELA DE CADASTRO
// =========================================================================
document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const btnSalvar = e.target.querySelector('button[type="submit"]');
    btnSalvar.innerText = "Salvando...";
    btnSalvar.disabled = true;

    // Respeitando as nomenclaturas EXATAS solicitadas para a base de dados
    const diasCalculados = calcularDias(document.getElementById('cad-entrada').value).toString();

    const obj = {
        "ctm": document.getElementById('cad-ctm').value,
        "Nº PROC.": formatProcessoParaDB(document.getElementById('Nº PROC.').value),
        "assunto": document.getElementById('cad-assunto').value,
        "entrada": document.getElementById('cad-entrada').value,
        "Vistoria": document.getElementById('cad-vistoria').value,
        "funcionários": document.getElementById('cad-funcionários').value,
        "1ª VISITA": document.getElementById('cad-v1').value,
        "2ª VISITA": document.getElementById('cad-v2').value,
        "3ª VISITA": document.getElementById('cad-v3').value,
        "OBS": document.getElementById('cad-obs').value,
        "dias": diasCalculados,
        "saída": document.getElementById('cad-saida').value,
        "destino": document.getElementById('cad-destino').value,
        "status": document.getElementById('cad-status').value
    };

    try {
        await push(ref(db, 'processos'), obj);
        alert('Cadastro realizado com sucesso!');
        e.target.reset();
    } catch(err) { 
        alert("Erro ao salvar: " + err.message); 
    } finally {
        btnSalvar.innerText = "Salvar Nova Entrada";
        btnSalvar.disabled = false;
    }
});

// =========================================================================
// PAGINAÇÃO E TABELA GERAL (Base, Edição, Pesquisa)
// =========================================================================
function setupTabelaGeral(modo) {
    currentMode = modo;
    const titulos = { 
        'edicao': 'Edição de Processos', 
        'pesquisa': 'Pesquisar Processos', 
        'base': 'Base de Dados Completa' 
    };
    document.getElementById('titulo-tabela').innerText = titulos[modo];
    
    currentPage = 1; 
    document.getElementById('filtro-ctm').value = '';
    document.getElementById('filtro-proc').value = '';
    document.getElementById('filtro-func').value = '';
    document.getElementById('filtro-assunto').value = '';
    
    renderTabelaGeral(true);
}

document.getElementById('btn-filtrar-geral').addEventListener('click', () => {
    renderTabelaGeral(true);
});

function renderTabelaGeral(resetPage = false) {
    if(resetPage) currentPage = 1;

    const fCtm = document.getElementById('filtro-ctm').value.toLowerCase();
    const fProc = formatProcessoParaDB(document.getElementById('filtro-proc').value.toLowerCase());
    const fFunc = document.getElementById('filtro-func').value;
    const fAss = document.getElementById('filtro-assunto').value;

    filteredList = processosData.filter(p => {
        let match = true;
        if(fCtm && !(p.ctm || '').toLowerCase().includes(fCtm)) match = false;
        if(fProc && !(p['Nº PROC.'] || '').toLowerCase().includes(fProc)) match = false;
        if(fFunc && p['funcionários'] !== fFunc) match = false;
        if(fAss && p.assunto !== fAss) match = false;
        return match;
    });

    renderPaginaAtual();
}

function renderPaginaAtual() {
    const thead = document.getElementById('thead-geral');
    const tbody = document.getElementById('tbody-geral');
    
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if(currentPage > totalPages) currentPage = totalPages;
    if(currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    
    const paginatedItems = filteredList.slice(startIndex, endIndex);

    if(currentMode === 'edicao') {
        thead.innerHTML = `<th>CTM</th><th>Nº Processo</th><th>Assunto</th><th>Funcionários</th><th>Ações</th>`;
    } else if(currentMode === 'pesquisa') {
        thead.innerHTML = `<th>CTM</th><th>Nº Processo</th><th>Assunto</th><th>Entrada</th><th>Dias</th><th>Funcionário</th><th>Status</th><th>Detalhes</th>`;
    } else {
        thead.innerHTML = `<th>CTM</th><th>Nº Processo</th><th>Assunto</th><th>Entrada</th><th>Dias</th><th>Funcionário</th><th>Status</th><th>Ações</th>`;
    }

    tbody.innerHTML = paginatedItems.map(p => {
        let dias = calcularDias(p.entrada);
        let tr = '';
        
        if(currentMode === 'edicao') {
            tr = `<td>${p.ctm||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC.']||'')}</td>
                  <td>${p.assunto||''}</td>
                  <td>${p['funcionários']||''}</td>
                  <td><button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button></td>`;
        } else if (currentMode === 'pesquisa') {
             tr = `<td>${p.ctm||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC.']||'')}</td>
                  <td>${p.assunto||''}</td>
                  <td>${p.entrada||''}</td>
                  <td>${dias}</td>
                  <td>${p['funcionários']||''}</td>
                  <td>${p.status||''}</td>
                  <td>${p['OBS']||''}</td>`;
        } else {
            let acoes = `
                <button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button> 
                <button class="btn btn--error btn--sm" style="background:red; color:white; border:none;" onclick="deletarProcesso('${p.id}')">Excluir</button>`;
            
            tr = `<td>${p.ctm||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC.']||'')}</td>
                  <td>${p.assunto||''}</td>
                  <td>${p.entrada||''}</td>
                  <td>${dias}</td>
                  <td>${p['funcionários']||''}</td>
                  <td>${p.status||''}</td>
                  <td>${acoes}</td>`;
        }
        return `<tr>${tr}</tr>`;
    }).join('');

    document.getElementById('page-info').innerText = `Página ${currentPage} de ${totalPages} (Total: ${totalItems} registros)`;
    document.getElementById('btn-prev-page').disabled = (currentPage === 1);
    document.getElementById('btn-next-page').disabled = (currentPage === totalPages);
}

window.mudarPagina = function(direction) {
    const totalPages = Math.ceil(filteredList.length / itemsPerPage) || 1;
    currentPage += direction;
    
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    
    renderPaginaAtual();
}

// =========================================================================
// EDIÇÃO E EXCLUSÃO
// =========================================================================
window.abrirEdicao = function(id) {
    const p = processosData.find(x => x.id === id);
    if(!p) return;
    
    const body = document.getElementById('modal-edicao-body');
    
    const selAssuntos = configData.Assuntos.map(a => `<option value="${a}" ${p.assunto === a ? 'selected' : ''}>${a}</option>`).join('');
    const selFuncs = configData.Cadastradores.map(a => `<option value="${a}" ${p['funcionários'] === a ? 'selected' : ''}>${a}</option>`).join('');
    const selStatus = configData.Status.map(a => `<option value="${a}" ${p.status === a ? 'selected' : ''}>${a}</option>`).join('');

    body.innerHTML = `
        <div class="filters-row">
            <div class="form-group"><label>CTM</label><input type="text" id="edit-ctm" class="form-control" value="${p.ctm||''}"></div>
            <div class="form-group"><label>Nº Processo</label><input type="text" id="edit-proc" class="form-control" value="${formatProcessoParaTela(p['Nº PROC.']||'')}"></div>
            <div class="form-group"><label>Assunto</label><select id="edit-assunto" class="form-control"><option value="">Selecione...</option>${selAssuntos}</select></div>
            <div class="form-group"><label>Entrada</label><input type="text" id="edit-entrada" class="form-control" value="${p.entrada||''}"></div>
            <div class="form-group"><label>Funcionário</label><select id="edit-func" class="form-control"><option value="">Selecione...</option>${selFuncs}</select></div>
            <div class="form-group"><label>Status</label><select id="edit-status" class="form-control"><option value="">Selecione...</option>${selStatus}</select></div>
            <div class="form-group"><label>Vistoria</label><input type="text" id="edit-vist" class="form-control" value="${p['Vistoria']||''}"></div>
            <div class="form-group"><label>1ª Vist</label><input type="text" id="edit-v1" class="form-control" value="${p['1ª VISITA']||''}"></div>
            <div class="form-group"><label>2ª Vist</label><input type="text" id="edit-v2" class="form-control" value="${p['2ª VISITA']||''}"></div>
            <div class="form-group"><label>3ª Vist</label><input type="text" id="edit-v3" class="form-control" value="${p['3ª VISITA']||''}"></div>
            <div class="form-group"><label>Data Saída</label><input type="text" id="edit-saida" class="form-control" value="${p['saída']||''}"></div>
            <div class="form-group"><label>Destino</label><input type="text" id="edit-destino" class="form-control" value="${p.destino||''}"></div>
        </div>
        <div class="form-group mt-8">
            <label>Observação</label>
            <textarea id="edit-obs" class="form-control" rows="3">${p['OBS']||''}</textarea>
        </div>
    `;
    document.getElementById('modal-edicao').classList.remove('hidden');
    
    document.getElementById('btn-salvar-edicao').onclick = async () => {
        const btnSalvar = document.getElementById('btn-salvar-edicao');
        btnSalvar.innerText = "Salvando...";
        
        await update(ref(db, 'processos/' + id), {
            "ctm": document.getElementById('edit-ctm').value,
            "Nº PROC.": formatProcessoParaDB(document.getElementById('edit-proc').value),
            "assunto": document.getElementById('edit-assunto').value,
            "entrada": document.getElementById('edit-entrada').value,
            "funcionários": document.getElementById('edit-func').value,
            "status": document.getElementById('edit-status').value,
            "Vistoria": document.getElementById('edit-vist').value,
            "1ª VISITA": document.getElementById('edit-v1').value,
            "2ª VISITA": document.getElementById('edit-v2').value,
            "3ª VISITA": document.getElementById('edit-v3').value,
            "saída": document.getElementById('edit-saida').value,
            "destino": document.getElementById('edit-destino').value,
            "OBS": document.getElementById('edit-obs').value
        });
        
        btnSalvar.innerText = "Salvar Edição";
        document.getElementById('modal-edicao').classList.add('hidden');
    };
}

window.deletarProcesso = async function(id) {
    if(confirm("Tem certeza que deseja excluir permanentemente esta entrada?")) {
        await remove(ref(db, 'processos/' + id));
    }
}

// =========================================================================
// CONSULTA PÚBLICA (TELA INICIAL)
// =========================================================================
document.getElementById('btn-consultar-publico').addEventListener('click', () => {
    const fCtm = document.getElementById('consulta-ctm').value.toLowerCase().trim();
    const fProc = formatProcessoParaDB(document.getElementById('consulta-processo').value.toLowerCase().trim());
    
    const tbody = document.getElementById('tbody-consulta-publica');
    
    if(!fCtm && !fProc) {
        alert("Preencha CTM ou Processo para consultar.");
        return;
    }

    const res = processosData.filter(p => {
        let match = false;
        if(fCtm && (p.ctm || '').toLowerCase().includes(fCtm)) match = true;
        if(fProc && (p['Nº PROC.'] || '').toLowerCase().includes(fProc)) match = true;
        return match;
    });

    if(res.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">Nenhum processo encontrado.</td></tr>`;
        return;
    }

    tbody.innerHTML = res.map(p => `<tr>
        <td>${p.ctm||''}</td>
        <td>${formatProcessoParaTela(p['Nº PROC.']||'')}</td>
        <td>${p.assunto||''}</td>
        <td>${p.entrada||''}</td>
        <td>${p['funcionários']||''}</td>
        <td>${p.status||''}</td>
        <td><div style="max-width:200px; white-space:normal; word-wrap:break-word;">${p['OBS']||''}</div></td>
    </tr>`).join('');
});

// =========================================================================
// ESTATÍSTICAS
// =========================================================================
document.getElementById('stat-funcionario').addEventListener('change', renderStats);

function renderStats() {
    if(!document.getElementById('estatisticas-screen').classList.contains('active')) return;
    
    const now = new Date();
    const currMonth = now.getMonth() + 1;
    const currYear = now.getFullYear();

    let totalEntradas = processosData.length;
    let mensais = 0;
    let concluidos = 0;
    let concluidosMes = 0;
    
    let totalSetorAssuntoMes = {};
    let totalSetorAssuntoAno = {};

    processosData.forEach(p => {
        const d = parseDateBR(p.entrada);
        let isMes = d && (d.getMonth() + 1) === currMonth && d.getFullYear() === currYear;
        let isAno = d && d.getFullYear() === currYear;
        let isConcl = (p.status === 'Concluído');
        
        if(isMes) mensais++;
        if(isConcl) concluidos++;
        if(isConcl && isMes) concluidosMes++;
        
        if(!totalSetorAssuntoMes[p.assunto]) totalSetorAssuntoMes[p.assunto] = 0;
        if(!totalSetorAssuntoAno[p.assunto]) totalSetorAssuntoAno[p.assunto] = 0;
        
        if(isMes) totalSetorAssuntoMes[p.assunto]++;
        if(isAno) totalSetorAssuntoAno[p.assunto]++;
    });

    document.getElementById('st-total').innerText = totalEntradas;
    document.getElementById('st-mensal').innerText = mensais;
    document.getElementById('st-concl').innerText = concluidos;
    document.getElementById('st-concl-mes').innerText = concluidosMes;
    
    const funcSel = document.getElementById('stat-funcionario').value;
    const tbody = document.getElementById('tbody-stats-func');
    tbody.innerHTML = '';
    
    if(funcSel) {
        let assuntosMap = {};
        configData.Assuntos.forEach(a => assuntosMap[a] = { qtd:0, mes:0, ano:0, cTotal:0, cMes:0, cAno:0 });
        
        processosData.forEach(p => {
            if(p['funcionários'] === funcSel && assuntosMap[p.assunto]) {
                const d = parseDateBR(p.entrada);
                let isMes = d && (d.getMonth() + 1) === currMonth && d.getFullYear() === currYear;
                let isAno = d && d.getFullYear() === currYear;
                let isConcl = (p.status === 'Concluído');
                
                assuntosMap[p.assunto].qtd++;
                if(isMes) assuntosMap[p.assunto].mes++;
                if(isAno) assuntosMap[p.assunto].ano++;
                if(isConcl) assuntosMap[p.assunto].cTotal++;
                if(isConcl && isMes) assuntosMap[p.assunto].cMes++;
                if(isConcl && isAno) assuntosMap[p.assunto].cAno++;
            }
        });
        
        let html = '';
        let totais = { qtd:0, mes:0, ano:0, setorMes:0, setorAno:0, cTotal:0, cMes:0, cAno:0 };
        
        Object.keys(assuntosMap).forEach(k => {
            if(assuntosMap[k].qtd > 0) {
                let v = assuntosMap[k];
                let sMes = totalSetorAssuntoMes[k] || 0;
                let sAno = totalSetorAssuntoAno[k] || 0;
                
                let pMes = sMes > 0 ? ((v.mes / sMes) * 100).toFixed(1) + '%' : '0%';
                let pAno = sAno > 0 ? ((v.ano / sAno) * 100).toFixed(1) + '%' : '0%';
                
                totais.qtd += v.qtd;
                totais.mes += v.mes;
                totais.ano += v.ano;
                totais.cTotal += v.cTotal;
                totais.cMes += v.cMes;
                totais.cAno += v.cAno;
                
                html += `<tr>
                    <td>${k}</td>
                    <td>${v.qtd}</td>
                    <td>${v.mes}</td>
                    <td>${v.ano}</td>
                    <td>${sMes}</td>
                    <td>${pMes}</td>
                    <td>${sAno}</td>
                    <td>${pAno}</td>
                    <td>${v.cTotal}</td>
                    <td>${v.cMes}</td>
                    <td>${v.cAno}</td>
                </tr>`;
            }
        });
        
        html += `<tr style="font-weight: bold; background-color: var(--color-bg-2);">
            <td>TOTAL</td>
            <td>${totais.qtd}</td>
            <td>${totais.mes}</td>
            <td>${totais.ano}</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>-</td>
            <td>${totais.cTotal}</td>
            <td>${totais.cMes}</td>
            <td>${totais.cAno}</td>
        </tr>`;
        
        tbody.innerHTML = html;
    } else {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center">Selecione um funcionário para ver as estatísticas.</td></tr>`;
    }
    
    renderCharts(currMonth, currYear);
}

// GRÁFICOS (Chart.js)
function renderCharts(mes, ano) {
    charts.forEach(c => c.destroy());
    charts = [];
    
    let assCount = {};
    let funcCount = {};
    let funcConclCount = {};
    
    processosData.forEach(p => {
        const d = parseDateBR(p.entrada);
        let isMes = d && (d.getMonth() + 1) === mes && d.getFullYear() === ano;
        
        if(isMes && p.assunto) {
            assCount[p.assunto] = (assCount[p.assunto]||0) + 1;
        }
        if(isMes && p['funcionários']) {
            funcCount[p['funcionários']] = (funcCount[p['funcionários']]||0) + 1;
        }
        if(p.status === 'Concluído' && p['funcionários']) {
            funcConclCount[p['funcionários']] = (funcConclCount[p['funcionários']]||0) + 1;
        }
    });

    const sortTop6 = (obj) => Object.entries(obj).sort((a,b) => b[1]-a[1]).slice(0,6);
    
    const topAssuntos = sortTop6(assCount);
    const topFuncs = sortTop6(funcCount);
    const topFuncsConcl = sortTop6(funcConclCount);

    const createChart = (id, label, dataArr, color) => {
        const canvas = document.getElementById(id);
        if(!canvas) return; 
        
        const ctx = canvas.getContext('2d');
        charts.push(new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: dataArr.map(d => d[0]), 
                datasets: [{ 
                    label: label, 
                    data: dataArr.map(d => d[1]), 
                    backgroundColor: color 
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: { 
                    y: { beginAtZero: true, ticks: { stepSize: 1 } } 
                } 
            }
        }));
    };

    createChart('chart1', 'Top Assuntos (Mês)', topAssuntos, '#32b8c6');
    createChart('chart2', 'Entradas por Funcionário', topFuncs, '#e68161');
    createChart('chart3', 'Concluídos por Funcionário', topFuncsConcl, '#22c55e');
}