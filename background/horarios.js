// Converte o código de horário do SIGAA (ex.: "35T34") em horários reais.
//
// Formato: <dias><turno><aulas>
//   dias:  2 = segunda, 3 = terça, 4 = quarta, 5 = quinta, 6 = sexta, 7 = sábado
//   turno: M = manhã, T = tarde, N = noite
//   aulas: índices da tabela abaixo
// Uma turma pode ter vários grupos separados por espaço, ex.: "24M12 6T34".

const TABELA_HORARIOS = {
  M: {
    1: ['07:00', '07:50'],
    2: ['07:50', '08:40'],
    3: ['08:50', '09:40'],
    4: ['09:40', '10:30'],
    5: ['10:50', '11:30'],
    6: ['11:30', '12:30'],
  },
  T: {
    1: ['13:00', '13:50'],
    2: ['13:50', '14:40'],
    3: ['14:50', '15:40'],
    4: ['15:40', '16:30'],
    5: ['16:40', '17:30'],
    6: ['17:30', '18:20'],
  },
  N: {
    1: ['18:40', '19:30'],
    2: ['19:30', '20:20'],
    3: ['20:30', '21:20'],
    4: ['21:20', '22:10'],
  },
};

const ORDEM_TURNOS = 'MTN';
const NOMES_DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// Retorna Map<diaDaSemanaJs (0 = domingo), [{ turno, aula }]> com as aulas ordenadas.
function interpretarHorario(codigo) {
  const porDia = new Map();
  for (const [, dias, turno, aulas] of (codigo || '').matchAll(/([2-7]+)([MTN])(\d+)/g)) {
    for (const dia of dias) {
      const diaJs = Number(dia) - 1;
      for (const aula of aulas) {
        if (!TABELA_HORARIOS[turno][aula]) continue;
        if (!porDia.has(diaJs)) porDia.set(diaJs, []);
        porDia.get(diaJs).push({ turno, aula: Number(aula) });
      }
    }
  }
  for (const aulas of porDia.values()) {
    aulas.sort((a, b) => ORDEM_TURNOS.indexOf(a.turno) - ORDEM_TURNOS.indexOf(b.turno) || a.aula - b.aula);
  }
  return porDia;
}

// Primeiro bloco de aulas consecutivas do dia (ex.: T3+T4 -> 14:50–16:30).
function primeiroBloco(aulas) {
  let ultima = aulas[0];
  for (const aula of aulas.slice(1)) {
    if (aula.turno !== ultima.turno || aula.aula !== ultima.aula + 1) break;
    ultima = aula;
  }
  return {
    inicio: TABELA_HORARIOS[aulas[0].turno][aulas[0].aula][0],
    fim: TABELA_HORARIOS[ultima.turno][ultima.aula][1],
  };
}

function diaDaSemana(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

// Horário da disciplina na data informada (YYYY-MM-DD).
// Se a turma não tem aula nesse dia da semana, usa o horário do primeiro dia de aula dela.
// Retorna { inicio: 'HH:MM', fim: 'HH:MM' } ou null se o código não tiver horário válido.
function horarioNaData(dataISO, codigo) {
  const porDia = interpretarHorario(codigo);
  if (!porDia.size) return null;
  const aulas = porDia.get(diaDaSemana(dataISO)) ?? porDia.get(Math.min(...porDia.keys()));
  return primeiroBloco(aulas);
}

if (typeof module !== 'undefined') {
  module.exports = { TABELA_HORARIOS, NOMES_DIAS, interpretarHorario, horarioNaData, diaDaSemana };
}
