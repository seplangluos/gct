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
let configData = { Assuntos: [], Cadastradores: [], Status: ["Concluído", "Em andamento", "Parado"], Destinos: ["SAG", "GAE"] };
let processosData = [];
let currentMode = ''; 
let charts = [];

// Variáveis para a tabela geral
let currentPage = 1;
const itemsPerPage = 50;
let filteredList = []; 
let currentSortColumn = null;
let currentSortDirection = 'desc';

// Variáveis exclusivas para a tabela de Consulta Pública
let consultaSortColumn = 'entrada';
let consultaSortDirection = 'desc';
let consultaFilteredList = [];

// =========================================================================
// UTILITÁRIOS E MÁSCARAS
// =========================================================================
window.formatDateToBR = function(dateStr) { 
    if(!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
};

// Máscara Automática de Datas para inputs com a classe 'date-mask'
document.addEventListener('input', function(e) {
    if (e.target && e.target.classList.contains('date-mask')) {
        let v = e.target.value.replace(/\D/g, '');
        if (v.length > 8) v = v.slice(0, 8);
        if (v.length > 4) {
            v = v.replace(/^(\d{2})(\d{2})(\d+)/, "$1/$2/$3");
        } else if (v.length > 2) {
            v = v.replace(/^(\d{2})(\d+)/, "$1/$2");
        }
        e.target.value = v;
    }
});

function formatProcessoParaDB(proc) { return proc ? proc.toString().replace(/\//g, '-') : ''; }
function formatProcessoParaTela(proc) { return proc ? proc.toString().replace(/-/g, '/') : ''; }

function formatDateBR(dateStr) {
    if (!dateStr) return '';
    let limpo = dateStr.toString().replace(/-/g, '/');
    let parts = limpo.split('/');
    if (parts.length === 3) {
        if (parts[0].length === 4) return `${parts[2].padStart(2,'0')}/${parts[1].padStart(2,'0')}/${parts[0]}`;
        return `${parts[0].padStart(2,'0')}/${parts[1].padStart(2,'0')}/${parts[2]}`;
    }
    return dateStr;
}

function parseDateBR(dateStr) {
    if(!dateStr) return null;
    const formatted = formatDateBR(dateStr);
    const parts = formatted.split('/');
    if(parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}

function calcularDias(dataEntradaStr) {
    const dataEnt = parseDateBR(dataEntradaStr);
    if(!dataEnt) return 0;
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    dataEnt.setHours(0, 0, 0, 0);
    return Math.floor(Math.abs(hoje - dataEnt) / (1000 * 60 * 60 * 24));
}

function maskCTM(value) {
    if (!value) return '';
    let digits = value.toString().replace(/\D/g, '');
    if (digits.length === 9) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`;
    return value;
}

function normalizeCTM(ctm) {
    return ctm ? ctm.toString().replace(/[\.\-\/\s]/g, '').toLowerCase() : '';
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
const USER_MAPPING = { "Cadastro": "seplan.cadastro@valadares.mg.gov.br", "Admin": "admin@hotmail.com" };

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const usuario = document.getElementById('login-usuario').value;
    const pass = document.getElementById('login-password').value;
    const email = USER_MAPPING[usuario];
    
    if (!email) {
        document.getElementById('login-error').innerText = "Selecione um usuário válido.";
        document.getElementById('login-error').classList.remove('hidden');
        return;
    }
    
    document.getElementById('login-btn').innerText = 'Aguarde...';
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        nav('dashboard');
    } catch(err) {
        document.getElementById('login-error').innerText = "Erro ao logar. Verifique a senha.";
        document.getElementById('login-error').classList.remove('hidden');
    } finally { document.getElementById('login-btn').innerText = 'Entrar'; }
});

document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); nav('login'); });
document.getElementById('btn-open-consulta').addEventListener('click', () => nav('consulta'));
document.querySelectorAll('.btn-voltar-login').forEach(b => b.addEventListener('click', () => nav('login')));

onAuthStateChanged(auth, user => {
    if(user) { 
        let nomeUsuario = user.email;
        for (const [key, value] of Object.entries(USER_MAPPING)) {
            if (value === user.email) { nomeUsuario = key; break; }
        }
        document.getElementById('user-info').innerText = `Usuário: ${nomeUsuario}`; 
        nav('dashboard'); 
    }
});

loadData();

// =========================================================================
// CARREGAMENTO DE DADOS (REALTIME)
// =========================================================================
function loadData() {
    onValue(ref(db, 'Assuntos'), snap => { configData.Assuntos = snap.exists() ? snap.val() : []; populateSelects(); renderConfigListsIfActive(); });
    onValue(ref(db, 'Cadastradores'), snap => { configData.Cadastradores = snap.exists() ? snap.val() : []; populateSelects(); renderConfigListsIfActive(); });
    onValue(ref(db, 'Status'), snap => { if(snap.exists()) configData.Status = snap.val(); populateSelects(); renderConfigListsIfActive(); });
    onValue(ref(db, 'Destinos'), snap => { if(snap.exists()) configData.Destinos = snap.val(); populateSelects(); renderConfigListsIfActive(); });
    
    onValue(ref(db, 'processos'), snap => {
        processosData = [];
        if(snap.exists()) {
            const data = snap.val();
            Object.keys(data).forEach(key => { if(data[key]) processosData.push({ id: key, ...data[key] }); });
        }
        populateDateMaskFilter();
        if(document.getElementById('tabela-geral-screen').classList.contains('active')) renderTabelaGeral(false); 
        if(document.getElementById('estatisticas-screen').classList.contains('active')) renderStats();
    });
}

function renderConfigListsIfActive() {
    if(document.getElementById('configuracoes-screen').classList.contains('active')) renderConfigLists();
}

function populateSelects() {
    const arrAssuntos = configData.Assuntos || [];
    const arrFuncs = configData.Cadastradores || [];
    const arrStatus = configData.Status || [];
    const arrDestinos = configData.Destinos || [];
    
    document.querySelectorAll('.dyn-assuntos').forEach(sel => {
        let current = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>' + arrAssuntos.map(a => `<option value="${a}">${a}</option>`).join('');
        sel.value = current;
    });
    document.querySelectorAll('.dyn-funcionarios').forEach(sel => {
        let current = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>' + arrFuncs.map(a => `<option value="${a}">${a}</option>`).join('');
        sel.value = current;
    });
    document.querySelectorAll('.dyn-status').forEach(sel => {
        let current = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>' + arrStatus.map(a => `<option value="${a}">${a}</option>`).join('');
        sel.value = current;
    });
    document.querySelectorAll('.dyn-destinos').forEach(sel => {
        let current = sel.value;
        sel.innerHTML = '<option value="">Selecione...</option>' + arrDestinos.map(a => `<option value="${a}">${a}</option>`).join('');
        sel.value = current;
    });
}

function populateDateMaskFilter() {
    const select = document.getElementById('col-filter-datamask');
    if (!select) return;
    let current = select.value;
    let mesesAnosSet = new Set();
    
    processosData.forEach(p => {
        if (p['Data Status']) {
            let dt = formatDateBR(p['Data Status']);
            let parts = dt.split('/');
            if (parts.length === 3) mesesAnosSet.add(`${parts[1]}/${parts[2]}`);
        }
    });
    
    let options = Array.from(mesesAnosSet).sort((a, b) => {
        let [mA, yA] = a.split('/');
        let [mB, yB] = b.split('/');
        return new Date(yB, mB - 1) - new Date(yA, mA - 1);
    });

    select.innerHTML = '<option value="">Filtrar Mês/Ano (Data Status)...</option>' + options.map(m => `<option value="${m}">${m}</option>`).join('');
    select.value = current;
}

// =========================================================================
// CONFIGURAÇÕES
// =========================================================================
function renderConfigLists() {
    const gerarHtml = (arr, chave) => {
        return (arr || []).map((item, idx) => `
            <li class="flex justify-between items-center" style="padding: 6px 0; border-bottom: 1px solid var(--color-border);">
                <span>${item}</span>
                <button class="btn btn--error btn--sm" onclick="removerConfigItem('${chave}', ${idx})" style="padding: 2px 6px; font-size: 10px; background: red; color: white; border: none;">Excluir</button>
            </li>
        `).join('');
    };

    document.getElementById('lista-assuntos').innerHTML = gerarHtml(configData.Assuntos, 'Assuntos');
    document.getElementById('lista-funcionarios').innerHTML = gerarHtml(configData.Cadastradores, 'Cadastradores');
    document.getElementById('lista-status').innerHTML = gerarHtml(configData.Status, 'Status');
    document.getElementById('lista-destinos').innerHTML = gerarHtml(configData.Destinos, 'Destinos');
}

window.addConfigItem = async function(chave, inputId) {
    const valor = document.getElementById(inputId).value.trim();
    if(!valor) return;
    const novaLista = [...(configData[chave] || []), valor];
    try {
        await set(ref(db, chave), novaLista);
        document.getElementById(inputId).value = '';
    } catch(err) { alert("Erro ao salvar: " + err.message); }
}

window.removerConfigItem = async function(chave, index) {
    if(!confirm('Tem certeza que deseja remover este item?')) return;
    const novaLista = [...(configData[chave] || [])];
    novaLista.splice(index, 1);
    try { await set(ref(db, chave), novaLista); } 
    catch(err) { alert("Erro ao remover: " + err.message); }
}

// =========================================================================
// CADASTRO
// =========================================================================
document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btnSalvar = e.target.querySelector('button[type="submit"]');
    btnSalvar.innerText = "Salvando...";
    btnSalvar.disabled = true;

    const rawCtm = document.getElementById('cad-ctm').value;
    const ctmMascarado = maskCTM(rawCtm);
    const entradaFmt = formatDateBR(document.getElementById('cad-entrada').value);
    const DataStatusFmt = formatDateBR(document.getElementById('cad-data-status').value);

    const diasCalculados = calcularDias(entradaFmt).toString();
    const diasStatusCalculados = calcularDias(DataStatusFmt).toString();

    const obj = {
        "ctm": ctmMascarado,
        "Nº PROC": formatProcessoParaDB(document.getElementById('cad-processo').value),
        "assunto": document.getElementById('cad-assunto').value,
        "entrada": entradaFmt,
        "Vistoria": formatDateBR(document.getElementById('cad-vistoria').value),
        "funcionários": document.getElementById('cad-funcionario').value,
        "1ª VISITA": formatDateBR(document.getElementById('cad-v1').value),
        "2ª VISITA": formatDateBR(document.getElementById('cad-v2').value),
        "3ª VISITA": formatDateBR(document.getElementById('cad-v3').value),
        "OBS": document.getElementById('cad-obs').value,
        "dias": diasCalculados,
        "Data Status": DataStatusFmt,
        "dias status": DataStatusFmt ? diasStatusCalculados : "0",
        "saída": formatDateBR(document.getElementById('cad-saida').value),
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
// TABELA GERAL (Base, Edição, Pesquisa)
// =========================================================================
function setupTabelaGeral(modo) {
    currentMode = modo;
    const titulos = { 'edicao': 'Edição de Processos', 'pesquisa': 'Pesquisar Processos', 'base': 'Base de Dados Completa' };
    document.getElementById('titulo-tabela').innerText = titulos[modo];
    
    currentPage = 1; 
    currentSortColumn = 'entrada';
    currentSortDirection = 'desc';

    document.getElementById('filtro-ctm').value = '';
    document.getElementById('filtro-proc').value = '';
    
    document.getElementById('col-filter-assunto').value = '';
    document.getElementById('col-filter-func').value = '';
    document.getElementById('col-filter-status').value = '';
    document.getElementById('col-filter-destino').value = '';
    document.getElementById('col-filter-datamask').value = '';

    if (modo === 'pesquisa') {
        filteredList = [];
        renderPaginaAtual();
    } else {
        renderTabelaGeral(true);
    }
}

document.getElementById('btn-filtrar-geral').addEventListener('click', () => renderTabelaGeral(true));
['col-filter-assunto', 'col-filter-func', 'col-filter-status', 'col-filter-destino', 'col-filter-datamask'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => renderTabelaGeral(true));
});

function renderTabelaGeral(resetPage = false) {
    if(resetPage) currentPage = 1;

    const fCtm = normalizeCTM(document.getElementById('filtro-ctm').value);
    const fProc = formatProcessoParaDB(document.getElementById('filtro-proc').value).toLowerCase().trim();

    const colAss = document.getElementById('col-filter-assunto').value;
    const colFunc = document.getElementById('col-filter-func').value;
    const colStatus = document.getElementById('col-filter-status').value;
    const colDest = document.getElementById('col-filter-destino').value;
    const colDataMask = document.getElementById('col-filter-datamask').value;

    if (currentMode === 'pesquisa' && !fCtm && !fProc && !colAss && !colFunc && !colStatus && !colDest && !colDataMask) {
        filteredList = [];
        renderPaginaAtual();
        return;
    }

    filteredList = processosData.filter(p => {
        let match = true;
        const pCtm = normalizeCTM(p.ctm);
        const pProc = (p['Nº PROC'] || '').toString().toLowerCase();

        if(fCtm && !pCtm.includes(fCtm)) match = false;
        if(fProc && !pProc.includes(fProc)) match = false;

        if(colAss && p.assunto !== colAss) match = false;
        if(colFunc && p['funcionários'] !== colFunc) match = false;
        if(colStatus && p.status !== colStatus) match = false;
        if(colDest && p.destino !== colDest) match = false;
        if(colDataMask) {
            let dt = formatDateBR(p['Data Status']);
            if (!dt || !dt.endsWith(colDataMask)) match = false;
        }
        return match;
    });

    if (currentSortColumn) {
        filteredList.sort((a, b) => {
            let valA = a[currentSortColumn] || '';
            let valB = b[currentSortColumn] || '';
            
            if (currentSortColumn.includes('data') || currentSortColumn === 'entrada' || currentSortColumn === 'Vistoria') {
                valA = parseDateBR(valA) || new Date(0);
                valB = parseDateBR(valB) || new Date(0);
            } else if (currentSortColumn === 'dias' || currentSortColumn === 'dias status') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return currentSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return currentSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    renderPaginaAtual();
}

window.ordenarColuna = function(colName) {
    if (currentSortColumn === colName) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        currentSortColumn = colName;
        currentSortDirection = 'asc';
    }
    renderTabelaGeral(false);
}

function renderPaginaAtual() {
    const thead = document.getElementById('thead-geral');
    const tbody = document.getElementById('tbody-geral');
    
    const totalItems = filteredList.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    
    if(currentPage > totalPages) currentPage = totalPages;
    if(currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginatedItems = filteredList.slice(startIndex, startIndex + itemsPerPage);

    const sortIndicator = (col) => currentSortColumn === col ? (currentSortDirection === 'asc' ? ' ▲' : ' ▼') : '';

    if(currentMode === 'edicao') {
        thead.innerHTML = `
            <th onclick="ordenarColuna('ctm')" style="cursor:pointer">CTM${sortIndicator('ctm')}</th>
            <th onclick="ordenarColuna('Nº PROC')" style="cursor:pointer">Nº Processo${sortIndicator('Nº PROC')}</th>
            <th class="col-assunto" onclick="ordenarColuna('assunto')" style="cursor:pointer">Assunto${sortIndicator('assunto')}</th>
            <th onclick="ordenarColuna('entrada')" style="cursor:pointer">Entrada${sortIndicator('entrada')}</th>
            <th onclick="ordenarColuna('funcionários')" style="cursor:pointer">Funcionários${sortIndicator('funcionários')}</th>
            <th>Ações</th>`;
    } else if(currentMode === 'pesquisa') {
        thead.innerHTML = `
            <th onclick="ordenarColuna('ctm')" style="cursor:pointer">CTM${sortIndicator('ctm')}</th>
            <th onclick="ordenarColuna('Nº PROC')" style="cursor:pointer">Nº Processo${sortIndicator('Nº PROC')}</th>
            <th class="col-assunto" onclick="ordenarColuna('assunto')" style="cursor:pointer">Assunto${sortIndicator('assunto')}</th>
            <th onclick="ordenarColuna('entrada')" style="cursor:pointer">Entrada${sortIndicator('entrada')}</th>
            <th onclick="ordenarColuna('dias')" style="cursor:pointer">Dias${sortIndicator('dias')}</th>
            <th onclick="ordenarColuna('funcionários')" style="cursor:pointer">Funcionário${sortIndicator('funcionários')}</th>
            <th onclick="ordenarColuna('status')" style="cursor:pointer">Status${sortIndicator('status')}</th>
            <th onclick="ordenarColuna('Data Status')" style="cursor:pointer">Data Status${sortIndicator('Data Status')}</th>
            <th onclick="ordenarColuna('dias status')" style="cursor:pointer">Dias Status${sortIndicator('dias status')}</th>
            <th onclick="ordenarColuna('destino')" style="cursor:pointer">Destino${sortIndicator('destino')}</th>
            <th class="col-detalhes">Detalhes</th>`;
    } else {
        thead.innerHTML = `
            <th onclick="ordenarColuna('ctm')" style="cursor:pointer">CTM${sortIndicator('ctm')}</th>
            <th onclick="ordenarColuna('Nº PROC')" style="cursor:pointer">Nº Processo${sortIndicator('Nº PROC')}</th>
            <th class="col-assunto" onclick="ordenarColuna('assunto')" style="cursor:pointer">Assunto${sortIndicator('assunto')}</th>
            <th onclick="ordenarColuna('entrada')" style="cursor:pointer">Entrada${sortIndicator('entrada')}</th>
            <th onclick="ordenarColuna('dias')" style="cursor:pointer">Dias${sortIndicator('dias')}</th>
            <th onclick="ordenarColuna('funcionários')" style="cursor:pointer">Funcionário${sortIndicator('funcionários')}</th>
            <th onclick="ordenarColuna('status')" style="cursor:pointer">Status${sortIndicator('status')}</th>
            <th onclick="ordenarColuna('Data Status')" style="cursor:pointer">Data Status${sortIndicator('Data Status')}</th>
            <th onclick="ordenarColuna('dias status')" style="cursor:pointer">Dias Status${sortIndicator('dias status')}</th>
            <th onclick="ordenarColuna('destino')" style="cursor:pointer">Destino${sortIndicator('destino')}</th>
            <th>Ações</th>`;
    }

    if (totalItems === 0 && currentMode === 'pesquisa') {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center">Preencha os filtros e clique em "Pesquisar/Filtrar" para exibir os resultados.</td></tr>`;
        document.getElementById('page-info').innerText = `Página 1 de 1 (Total: 0 registros)`;
        return;
    }

    tbody.innerHTML = paginatedItems.map(p => {
        let dias = calcularDias(p.entrada);
        let diasStatus = p['Data Status'] ? calcularDias(p['Data Status']) : 0;
        let tr = '';
        
        if(currentMode === 'edicao') {
            tr = `<td>${maskCTM(p.ctm)||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC']||'')}</td>
                  <td class="col-assunto">${p.assunto||''}</td>
                  <td>${formatDateBR(p.entrada)||''}</td>
                  <td>${p['funcionários']||''}</td>
                  <td><button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button></td>`;
        } else if (currentMode === 'pesquisa') {
             tr = `<td>${maskCTM(p.ctm)||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC']||'')}</td>
                  <td class="col-assunto">${p.assunto||''}</td>
                  <td>${formatDateBR(p.entrada)||''}</td>
                  <td>${dias}</td>
                  <td>${p['funcionários']||''}</td>
                  <td>${p.status||''}</td>
                  <td>${formatDateBR(p['Data Status'])||''}</td>
                  <td>${diasStatus}</td>
                  <td>${p.destino||''}</td>
                  <td class="col-detalhes">${p['OBS']||''}</td>`;
        } else {
            let acoes = `
                <button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button> 
                <button class="btn btn--error btn--sm" style="background:red; color:white; border:none;" onclick="deletarProcesso('${p.id}')">Excluir</button>`;
            
            tr = `<td>${maskCTM(p.ctm)||''}</td>
                  <td>${formatProcessoParaTela(p['Nº PROC']||'')}</td>
                  <td class="col-assunto">${p.assunto||''}</td>
                  <td>${formatDateBR(p.entrada)||''}</td>
                  <td>${dias}</td>
                  <td>${p['funcionários']||''}</td>
                  <td>${p.status||''}</td>
                  <td>${formatDateBR(p['Data Status'])||''}</td>
                  <td>${diasStatus}</td>
                  <td>${p.destino||''}</td>
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
    const selDestinos = (configData.Destinos || []).map(a => `<option value="${a}" ${p.destino === a ? 'selected' : ''}>${a}</option>`).join('');

    body.innerHTML = `
        <div class="filters-row">
            <div class="form-group"><label>CTM</label><input type="text" id="edit-ctm" class="form-control" value="${maskCTM(p.ctm)||''}"></div>
            <div class="form-group"><label>Nº Processo</label><input type="text" id="edit-proc" class="form-control" value="${formatProcessoParaTela(p['Nº PROC']||'')}"></div>
            <div class="form-group"><label>Assunto</label><select id="edit-assunto" class="form-control"><option value="">Selecione...</option>${selAssuntos}</select></div>
            
            <div class="form-group"><label>Entrada</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-entrada" class="form-control date-mask" value="${formatDateBR(p.entrada)||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-entrada').value = formatDateToBR(this.value)">
                </div>
            </div>
            
            <div class="form-group"><label>Funcionário</label><select id="edit-func" class="form-control"><option value="">Selecione...</option>${selFuncs}</select></div>
            <div class="form-group"><label>Status</label><select id="edit-status" class="form-control"><option value="">Selecione...</option>${selStatus}</select></div>
            
            <div class="form-group"><label>Data Status</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-data-status" class="form-control date-mask" value="${formatDateBR(p['Data Status'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-data-status').value = formatDateToBR(this.value)">
                </div>
            </div>
            <div class="form-group"><label>Vistoria</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-vist" class="form-control date-mask" value="${formatDateBR(p['Vistoria'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-vist').value = formatDateToBR(this.value)">
                </div>
            </div>
            <div class="form-group"><label>1ª Vist</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-v1" class="form-control date-mask" value="${formatDateBR(p['1ª VISITA'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-v1').value = formatDateToBR(this.value)">
                </div>
            </div>
            <div class="form-group"><label>2ª Vist</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-v2" class="form-control date-mask" value="${formatDateBR(p['2ª VISITA'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-v2').value = formatDateToBR(this.value)">
                </div>
            </div>
            <div class="form-group"><label>3ª Vist</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-v3" class="form-control date-mask" value="${formatDateBR(p['3ª VISITA'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-v3').value = formatDateToBR(this.value)">
                </div>
            </div>
            <div class="form-group"><label>Data Saída</label>
                <div class="flex gap-4">
                    <input type="text" id="edit-saida" class="form-control date-mask" value="${formatDateBR(p['saída'])||''}" maxlength="10">
                    <input type="date" class="form-control" style="width: 45px; padding: 0 4px;" onchange="document.getElementById('edit-saida').value = formatDateToBR(this.value)">
                </div>
            </div>

            <div class="form-group"><label>Destino</label><select id="edit-destino" class="form-control"><option value="">Selecione...</option>${selDestinos}</select></div>
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
        
        const entradaFmt = formatDateBR(document.getElementById('edit-entrada').value);
        const DataStatusFmt = formatDateBR(document.getElementById('edit-data-status').value);
        const diasCalculados = calcularDias(entradaFmt).toString();
        const diasStatusCalculados = calcularDias(DataStatusFmt).toString();

        await update(ref(db, 'processos/' + id), {
            "ctm": maskCTM(document.getElementById('edit-ctm').value),
            "Nº PROC": formatProcessoParaDB(document.getElementById('edit-proc').value),
            "assunto": document.getElementById('edit-assunto').value,
            "entrada": entradaFmt,
            "funcionários": document.getElementById('edit-func').value,
            "status": document.getElementById('edit-status').value,
            "Data Status": DataStatusFmt,
            "dias status": DataStatusFmt ? diasStatusCalculados : "0",
            "Vistoria": formatDateBR(document.getElementById('edit-vist').value),
            "1ª VISITA": formatDateBR(document.getElementById('edit-v1').value),
            "2ª VISITA": formatDateBR(document.getElementById('edit-v2').value),
            "3ª VISITA": formatDateBR(document.getElementById('edit-v3').value),
            "saída": formatDateBR(document.getElementById('edit-saida').value),
            "destino": document.getElementById('edit-destino').value,
            "OBS": document.getElementById('edit-obs').value,
            "dias": diasCalculados
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
// CONSULTA PÚBLICA & EXPANDIR LINHAS & ORDENAÇÃO
// =========================================================================
window.toggleRowInfo = function(btn, id) {
    const targetRow = document.getElementById('details-' + id);
    if(targetRow.classList.contains('hidden')) {
        targetRow.classList.remove('hidden');
        btn.innerText = '-';
    } else {
        targetRow.classList.add('hidden');
        btn.innerText = '+';
    }
}

// Chama a lógica de ordenação da tabela de Consulta Pública
window.ordenarConsulta = function(colName) {
    if (consultaSortColumn === colName) {
        consultaSortDirection = consultaSortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        consultaSortColumn = colName;
        consultaSortDirection = 'asc';
    }
    renderConsultaPublica();
}

document.getElementById('btn-consultar-publico').addEventListener('click', () => {
    const fCtm = normalizeCTM(document.getElementById('consulta-ctm').value);
    const fProc = formatProcessoParaDB(document.getElementById('consulta-processo').value).toLowerCase().trim();
    const fFunc = document.getElementById('consulta-funcionario').value;
    
    if(!fCtm && !fProc && !fFunc) { alert("Preencha CTM, Processo ou selecione um Funcionário para consultar."); return; }

    consultaFilteredList = processosData.filter(p => {
        let match = false;
        const pCtm = normalizeCTM(p.ctm);
        const pProc = (p['Nº PROC'] || '').toString().toLowerCase();
        
        if(fCtm && pCtm.includes(fCtm)) match = true;
        if(fProc && pProc.includes(fProc)) match = true;
        if(fFunc && p['funcionários'] === fFunc) match = true;
        return match;
    });

    renderConsultaPublica();
});

// Extrai a renderização da tabela para ser reutilizada ao ordenar
function renderConsultaPublica() {
    const tbody = document.getElementById('tbody-consulta-publica');
    const thead = document.getElementById('thead-consulta-publica');
    
    // Configura o thead da Consulta com as setas
    const sortIndicator = (col) => consultaSortColumn === col ? (consultaSortDirection === 'asc' ? ' ▲' : ' ▼') : '';
    
    thead.innerHTML = `
        <th style="width: 40px;">+</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('ctm')">CTM${sortIndicator('ctm')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('Nº PROC')">Nº Processo${sortIndicator('Nº PROC')}</th>
        <th class="col-assunto" style="cursor:pointer" onclick="ordenarConsulta('assunto')">Assunto${sortIndicator('assunto')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('entrada')">Entrada${sortIndicator('entrada')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('funcionários')">Funcionário${sortIndicator('funcionários')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('status')">Status${sortIndicator('status')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('Data Status')">Data Status${sortIndicator('Data Status')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('dias status')">Dias Status${sortIndicator('dias status')}</th>
        <th style="cursor:pointer" onclick="ordenarConsulta('destino')">Destino${sortIndicator('destino')}</th>
        <th class="col-detalhes">Detalhes</th>
    `;

    if(consultaFilteredList.length === 0) {
        tbody.innerHTML = `<tr><td colspan="11" class="text-center">Nenhum processo encontrado.</td></tr>`;
        return;
    }

    // Aplica a ordenação na lista de Consulta Pública
    if (consultaSortColumn) {
        consultaFilteredList.sort((a, b) => {
            let valA = a[consultaSortColumn] || '';
            let valB = b[consultaSortColumn] || '';
            
            if (consultaSortColumn.includes('data') || consultaSortColumn === 'entrada' || consultaSortColumn === 'Vistoria' || consultaSortColumn === 'Data Status') {
                valA = parseDateBR(valA) || new Date(0);
                valB = parseDateBR(valB) || new Date(0);
            } else if (consultaSortColumn === 'dias' || consultaSortColumn === 'dias status') {
                valA = parseInt(valA) || 0;
                valB = parseInt(valB) || 0;
            } else {
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return consultaSortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return consultaSortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    // Renderiza a tabela do corpo
    tbody.innerHTML = consultaFilteredList.map(p => {
        let dias = calcularDias(p.entrada);
        let diasStatus = p['Data Status'] ? calcularDias(p['Data Status']) : 0;
        
        let linhaPrincipal = `<tr>
            <td><button class="btn btn--primary btn--sm" onclick="toggleRowInfo(this, '${p.id}')">+</button></td>
            <td>${maskCTM(p.ctm)||''}</td>
            <td>${formatProcessoParaTela(p['Nº PROC']||'')}</td>
            <td class="col-assunto">${p.assunto||''}</td>
            <td>${formatDateBR(p.entrada)||''}</td>
            <td>${p['funcionários']||''}</td>
            <td>${p.status||''}</td>
            <td>${formatDateBR(p['Data Status'])||''}</td>
            <td>${diasStatus}</td>
            <td>${p.destino||''}</td>
            <td class="col-detalhes"><div style="white-space:normal; word-wrap:break-word;">${p['OBS']||''}</div></td>
        </tr>`;

        let linhaExpandida = `<tr class="details-row hidden" id="details-${p.id}">
            <td colspan="11">
                <div class="expanded-details">
                    <h4>Informações Completas do Processo</h4>
                    <div class="expanded-details-grid">
                        <p><strong>CTM:</strong> ${maskCTM(p.ctm)||'--'}</p>
                        <p><strong>Nº Processo:</strong> ${formatProcessoParaTela(p['Nº PROC'])||'--'}</p>
                        <p><strong>Assunto:</strong> ${p.assunto||'--'}</p>
                        <p><strong>Entrada:</strong> ${formatDateBR(p.entrada)||'--'} (${dias} dias)</p>
                        <p><strong>Funcionário:</strong> ${p['funcionários']||'--'}</p>
                        <p><strong>Status:</strong> ${p.status||'--'}</p>
                        <p><strong>Data Status:</strong> ${formatDateBR(p['Data Status'])||'--'} (${diasStatus} dias)</p>
                        <p><strong>Destino:</strong> ${p.destino||'--'}</p>
                        <p><strong>Vistoria:</strong> ${formatDateBR(p['Vistoria'])||'--'}</p>
                        <p><strong>1ª Vistoria:</strong> ${formatDateBR(p['1ª VISITA'])||'--'}</p>
                        <p><strong>2ª Vistoria:</strong> ${formatDateBR(p['2ª VISITA'])||'--'}</p>
                        <p><strong>3ª Vistoria:</strong> ${formatDateBR(p['3ª VISITA'])||'--'}</p>
                        <p><strong>Saída:</strong> ${formatDateBR(p['saída'])||'--'}</p>
                        <p style="grid-column: 1 / -1;"><strong>Observações:</strong> ${p['OBS']||'--'}</p>
                    </div>
                </div>
            </td>
        </tr>`;
        
        return linhaPrincipal + linhaExpandida;
    }).join('');
}

// =========================================================================
// ESTATÍSTICAS
// =========================================================================
document.getElementById('stat-funcionario').addEventListener('change', renderStats);
document.getElementById('stat-assunto-filter').addEventListener('change', renderStats);

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
    
    // --- LÓGICA ESTATÍSTICAS FUNCIONÁRIO ---
    const funcSel = document.getElementById('stat-funcionario').value;
    const tbodyFunc = document.getElementById('tbody-stats-func');
    tbodyFunc.innerHTML = '';
    
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
                totais.setorMes += sMes;
                totais.setorAno += sAno;
                totais.cTotal += v.cTotal;
                totais.cMes += v.cMes;
                totais.cAno += v.cAno;
                
                html += `<tr>
                    <td>${k}</td><td>${v.qtd}</td><td>${v.mes}</td><td>${v.ano}</td>
                    <td>${sMes}</td><td>${pMes}</td><td>${sAno}</td><td>${pAno}</td>
                    <td>${v.cTotal}</td><td>${v.cMes}</td><td>${v.cAno}</td>
                </tr>`;
            }
        });
        
        html += `<tr style="font-weight: bold; background-color: var(--color-bg-2);">
            <td>TOTAL</td><td>${totais.qtd}</td><td>${totais.mes}</td><td>${totais.ano}</td>
            <td>${totais.setorMes}</td><td>-</td><td>${totais.setorAno}</td><td>-</td>
            <td>${totais.cTotal}</td><td>${totais.cMes}</td><td>${totais.cAno}</td>
        </tr>`;
        
        tbodyFunc.innerHTML = html;
    } else {
        tbodyFunc.innerHTML = `<tr><td colspan="11" class="text-center">Selecione um funcionário para ver as estatísticas.</td></tr>`;
    }

    // --- LÓGICA ESTATÍSTICAS ASSUNTO ---
    const assuntoSel = document.getElementById('stat-assunto-filter').value;
    const tbodyAssunto = document.getElementById('tbody-stats-assunto');
    tbodyAssunto.innerHTML = '';

    if (assuntoSel) {
        let funcsMap = {};
        configData.Cadastradores.forEach(f => funcsMap[f] = { qtd:0, mes:0, ano:0, cTotal:0, cMes:0, cAno:0 });

        processosData.forEach(p => {
            if(p.assunto === assuntoSel && funcsMap[p['funcionários']]) {
                const d = parseDateBR(p.entrada);
                let isMes = d && (d.getMonth() + 1) === currMonth && d.getFullYear() === currYear;
                let isAno = d && d.getFullYear() === currYear;
                let isConcl = (p.status === 'Concluído');

                funcsMap[p['funcionários']].qtd++;
                if (isMes) funcsMap[p['funcionários']].mes++;
                if (isAno) funcsMap[p['funcionários']].ano++;
                if (isConcl) funcsMap[p['funcionários']].cTotal++;
                if (isConcl && isMes) funcsMap[p['funcionários']].cMes++;
                if (isConcl && isAno) funcsMap[p['funcionários']].cAno++;
            }
        });

        let htmlAssunto = '';
        let totaisAss = { qtd:0, mes:0, ano:0, cTotal:0, cMes:0, cAno:0 };

        Object.keys(funcsMap).forEach(f => {
            if (funcsMap[f].qtd > 0) {
                let v = funcsMap[f];
                
                totaisAss.qtd += v.qtd;
                totaisAss.mes += v.mes;
                totaisAss.ano += v.ano;
                totaisAss.cTotal += v.cTotal;
                totaisAss.cMes += v.cMes;
                totaisAss.cAno += v.cAno;

                htmlAssunto += `<tr>
                    <td>${f}</td><td>${v.qtd}</td><td>${v.mes}</td><td>${v.ano}</td>
                    <td>${v.cTotal}</td><td>${v.cMes}</td><td>${v.cAno}</td>
                </tr>`;
            }
        });

        htmlAssunto += `<tr style="font-weight: bold; background-color: var(--color-bg-2);">
            <td>TOTAL DA EQUIPE</td><td>${totaisAss.qtd}</td><td>${totaisAss.mes}</td><td>${totaisAss.ano}</td>
            <td>${totaisAss.cTotal}</td><td>${totaisAss.cMes}</td><td>${totaisAss.cAno}</td>
        </tr>`;

        tbodyAssunto.innerHTML = htmlAssunto;
    } else {
        tbodyAssunto.innerHTML = `<tr><td colspan="7" class="text-center">Selecione um assunto acima para visualizar os dados por funcionário.</td></tr>`;
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
        if(isMes && p.status === 'Concluído' && p['funcionários']) {
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
                datasets: [{ label: label, data: dataArr.map(d => d[1]), backgroundColor: color }] 
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
        }));
    };

    createChart('chart1', 'Top Assuntos (Mês)', topAssuntos, '#32b8c6');
    createChart('chart2', 'Entradas por Funcionário (Mês)', topFuncs, '#e68161');
    createChart('chart3', 'Concluídos por Funcionário (Mês)', topFuncsConcl, '#22c55e');
}