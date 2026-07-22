import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getDatabase, ref, push, set, onValue, update, remove } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

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

// Estado da Aplicação
let configData = { Assuntos: [], Cadastradores: [], Status: ["Em andamento", "Concluído", "Parado"] };
let processosData = [];
let currentMode = ''; // edicao, pesquisa, base

// Navegação
window.nav = function(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if(screenId === 'login' || screenId === 'consulta' || screenId === 'dashboard' || screenId === 'cadastro' || screenId === 'estatisticas') {
        document.getElementById(screenId + '-screen').classList.add('active');
    } else {
        document.getElementById('tabela-geral-screen').classList.add('active');
        setupTabelaGeral(screenId);
    }
}

// Utilitários de Data e Processo
function formatProcessoParaDB(proc) { return proc.replace(/\//g, '-'); }
function formatProcessoParaTela(proc) { return proc.replace(/-/g, '/'); }
function parseDateBR(dateStr) {
    if(!dateStr) return null;
    const parts = dateStr.split('/');
    if(parts.length !== 3) return null;
    return new Date(parts[2], parts[1] - 1, parts[0]);
}
function calcularDias(dataEntradaStr) {
    const dataEnt = parseDateBR(dataEntradaStr);
    if(!dataEnt) return 0;
    const diffTime = Math.abs(new Date() - dataEnt);
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

// Autenticação
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        await signInWithEmailAndPassword(auth, email, pass);
        nav('dashboard');
    } catch(err) {
        alert("Erro ao logar: " + err.message);
    }
});
document.getElementById('btn-logout').addEventListener('click', () => { signOut(auth); nav('login'); });
document.getElementById('btn-open-consulta').addEventListener('click', () => { nav('consulta'); });
document.querySelectorAll('.btn-voltar-login').forEach(b => b.addEventListener('click', () => nav('login')));

onAuthStateChanged(auth, user => {
    if(user) { document.getElementById('user-info').innerText = user.email; nav('dashboard'); loadData(); }
});

// Carregar Dados do Firebase
function loadData() {
    onValue(ref(db, 'config'), snap => {
        if(snap.exists()) {
            configData = { ...configData, ...snap.val() };
            populateSelects();
        }
    });
    onValue(ref(db, 'processos'), snap => {
        processosData = [];
        if(snap.exists()) {
            snap.forEach(child => { processosData.push({ id: child.key, ...child.val() }); });
        }
        if(document.getElementById('estatisticas-screen').classList.contains('active')) renderStats();
    });
}

function populateSelects() {
    const arrAssuntos = configData.Assuntos || ["Alienação", "Alvará Funcionamento"];
    const arrFuncs = configData.Cadastradores || ["Abel", "Ariadna"];
    const arrStatus = configData.Status || ["Concluído", "Em Andamento"];
    
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

// Salvar Cadastro
document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const obj = {
        ctm: document.getElementById('cad-ctm').value,
        processo: formatProcessoParaDB(document.getElementById('cad-processo').value),
        assunto: document.getElementById('cad-assunto').value,
        entrada: document.getElementById('cad-entrada').value,
        funcionario: document.getElementById('cad-funcionario').value,
        status: document.getElementById('cad-status').value,
        vistoria: document.getElementById('cad-vistoria').value,
        v1: document.getElementById('cad-v1').value,
        v2: document.getElementById('cad-v2').value,
        v3: document.getElementById('cad-v3').value,
        saida: document.getElementById('cad-saida').value,
        destino: document.getElementById('cad-destino').value,
        observacao: document.getElementById('cad-obs').value
    };
    try {
        await push(ref(db, 'processos'), obj);
        alert('Salvo com sucesso!');
        e.target.reset();
    } catch(err) { alert("Erro: " + err.message); }
});

// Setup Tabelas Múltiplas (Base, Edição, Pesquisa)
function setupTabelaGeral(modo) {
    currentMode = modo;
    const titulos = { 'edicao': 'Edição de Processos', 'pesquisa': 'Pesquisar Processos', 'base': 'Base de Dados' };
    document.getElementById('titulo-tabela').innerText = titulos[modo];
    renderTabelaGeral();
}

document.getElementById('btn-filtrar-geral').addEventListener('click', renderTabelaGeral);

function renderTabelaGeral() {
    const fCtm = document.getElementById('filtro-ctm').value.toLowerCase();
    const fProc = formatProcessoParaDB(document.getElementById('filtro-proc').value.toLowerCase());
    const fFunc = document.getElementById('filtro-func').value;
    const fAss = document.getElementById('filtro-assunto').value;

    let filtered = processosData.filter(p => {
        let match = true;
        if(fCtm && !(p.ctm || '').toLowerCase().includes(fCtm)) match = false;
        if(fProc && !(p.processo || '').toLowerCase().includes(fProc)) match = false;
        if(fFunc && p.funcionario !== fFunc) match = false;
        if(fAss && p.assunto !== fAss) match = false;
        return match;
    });

    const thead = document.getElementById('thead-geral');
    const tbody = document.getElementById('tbody-geral');
    
    // Headers dinâmicos
    if(currentMode === 'edicao') {
        thead.innerHTML = `<th>CTM</th><th>Nº Processo</th><th>Assunto</th><th>Funcionários</th><th>Ações</th>`;
    } else {
        thead.innerHTML = `<th>CTM</th><th>Nº Processo</th><th>Assunto</th><th>Entrada</th><th>Dias</th><th>Funcionário</th><th>Status</th><th>Ações</th>`;
    }

    tbody.innerHTML = filtered.map(p => {
        let dias = calcularDias(p.entrada);
        let tr = '';
        if(currentMode === 'edicao') {
            tr = `<td>${p.ctm||''}</td><td>${formatProcessoParaTela(p.processo||'')}</td><td>${p.assunto||''}</td><td>${p.funcionario||''}</td>
                  <td><button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button></td>`;
        } else {
            let acoes = currentMode === 'base' ? 
                `<button class="btn btn--warning btn--sm" onclick="abrirEdicao('${p.id}')">Editar</button> <button class="btn btn--error btn--sm" style="background:red;color:white;" onclick="deletarProcesso('${p.id}')">Excluir</button>` : '';
            tr = `<td>${p.ctm||''}</td><td>${formatProcessoParaTela(p.processo||'')}</td><td>${p.assunto||''}</td><td>${p.entrada||''}</td><td>${dias}</td><td>${p.funcionario||''}</td><td>${p.status||''}</td><td>${acoes}</td>`;
        }
        return `<tr>${tr}</tr>`;
    }).join('');
}

// Edição
window.abrirEdicao = function(id) {
    const p = processosData.find(x => x.id === id);
    if(!p) return;
    
    const body = document.getElementById('modal-edicao-body');
    body.innerHTML = `
        <div class="form-group"><label>Nº Processo</label><input type="text" id="edit-proc" class="form-control" value="${formatProcessoParaTela(p.processo||'')}"></div>
        <div class="form-group"><label>CTM</label><input type="text" id="edit-ctm" class="form-control" value="${p.ctm||''}"></div>
        <div class="form-group"><label>Status</label><input type="text" id="edit-status" class="form-control" value="${p.status||''}"></div>
    `;
    document.getElementById('modal-edicao').classList.remove('hidden');
    
    document.getElementById('btn-salvar-edicao').onclick = async () => {
        await update(ref(db, 'processos/' + id), {
            processo: formatProcessoParaDB(document.getElementById('edit-proc').value),
            ctm: document.getElementById('edit-ctm').value,
            status: document.getElementById('edit-status').value
        });
        document.getElementById('modal-edicao').classList.add('hidden');
        renderTabelaGeral();
    };
}
window.deletarProcesso = async function(id) {
    if(confirm("Tem certeza que deseja excluir?")) {
        await remove(ref(db, 'processos/' + id));
        renderTabelaGeral();
    }
}

// Consulta Pública
document.getElementById('btn-consultar-publico').addEventListener('click', () => {
    const fCtm = document.getElementById('consulta-ctm').value.toLowerCase();
    const fProc = formatProcessoParaDB(document.getElementById('consulta-processo').value.toLowerCase());
    
    const tbody = document.getElementById('tbody-consulta-publica');
    if(!fCtm && !fProc) return alert("Preencha CTM ou Processo");

    const res = processosData.filter(p => {
        let match = false;
        if(fCtm && (p.ctm || '').toLowerCase().includes(fCtm)) match = true;
        if(fProc && (p.processo || '').toLowerCase().includes(fProc)) match = true;
        return match;
    });

    tbody.innerHTML = res.map(p => `<tr>
        <td>${p.ctm||''}</td><td>${formatProcessoParaTela(p.processo||'')}</td><td>${p.assunto||''}</td><td>${p.entrada||''}</td><td>${p.funcionario||''}</td><td>${p.status||''}</td>
        <td><div style="max-width:200px;overflow:hidden;text-overflow:ellipsis;">${p.observacao||''}</div></td>
    </tr>`).join('');
});

// Estatísticas
let charts = [];
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

    processosData.forEach(p => {
        const d = parseDateBR(p.entrada);
        let isMes = d && (d.getMonth() + 1) === currMonth && d.getFullYear() === currYear;
        let isConcl = (p.status === 'Concluído');
        
        if(isMes) mensais++;
        if(isConcl) concluidos++;
        if(isConcl && isMes) concluidosMes++;
    });

    document.getElementById('st-total').innerText = totalEntradas;
    document.getElementById('st-mensal').innerText = mensais;
    document.getElementById('st-concl').innerText = concluidos;
    document.getElementById('st-concl-mes').innerText = concluidosMes;
    
    // Tabela Funcionario Especifico
    const funcSel = document.getElementById('stat-funcionario').value;
    const tbody = document.getElementById('tbody-stats-func');
    tbody.innerHTML = '';
    
    if(funcSel) {
        let assuntosMap = {};
        configData.Assuntos.forEach(a => assuntosMap[a] = { qtd:0, mes:0, ano:0, cTotal:0, cMes:0, cAno:0 });
        
        processosData.forEach(p => {
            if(p.funcionario === funcSel && assuntosMap[p.assunto]) {
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
        Object.keys(assuntosMap).forEach(k => {
            if(assuntosMap[k].qtd > 0) {
                html += `<tr><td>${k}</td><td>${assuntosMap[k].qtd}</td><td>${assuntosMap[k].mes}</td><td>${assuntosMap[k].ano}</td>
                <td>-</td><td>-</td><td>-</td><td>-</td><td>${assuntosMap[k].cTotal}</td><td>${assuntosMap[k].cMes}</td><td>${assuntosMap[k].cAno}</td></tr>`;
            }
        });
        tbody.innerHTML = html;
    }
    
    // Gerar Graficos (Top 6)
    renderCharts(currMonth, currYear);
}

function renderCharts(mes, ano) {
    charts.forEach(c => c.destroy());
    charts = [];
    
    let assCount = {};
    let funcCount = {};
    let funcConclCount = {};
    
    processosData.forEach(p => {
        const d = parseDateBR(p.entrada);
        if(d && (d.getMonth() + 1) === mes && d.getFullYear() === ano) {
            assCount[p.assunto] = (assCount[p.assunto]||0) + 1;
            funcCount[p.funcionario] = (funcCount[p.funcionario]||0) + 1;
        }
        if(p.status === 'Concluído') {
            funcConclCount[p.funcionario] = (funcConclCount[p.funcionario]||0) + 1;
        }
    });

    const sortTop6 = (obj) => Object.entries(obj).sort((a,b)=>b[1]-a[1]).slice(0,6);
    
    const topAssuntos = sortTop6(assCount);
    const topFuncs = sortTop6(funcCount);
    const topFuncsConcl = sortTop6(funcConclCount);

    const createChart = (id, label, dataArr, color) => {
        const ctx = document.getElementById(id).getContext('2d');
        charts.push(new Chart(ctx, {
            type: 'bar',
            data: { labels: dataArr.map(d=>d[0]), datasets: [{ label: label, data: dataArr.map(d=>d[1]), backgroundColor: color }] },
            options: { responsive: true, scales: { y: { beginAtZero: true } } }
        }));
    };

    createChart('chart1', 'Top Assuntos (Mês)', topAssuntos, '#32b8c6');
    createChart('chart2', 'Entradas por Funcionário', topFuncs, '#e68161');
    createChart('chart3', 'Concluídos por Funcionário', topFuncsConcl, '#22c55e');
}