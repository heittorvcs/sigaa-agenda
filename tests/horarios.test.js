const { test } = require('node:test');
const assert = require('node:assert/strict');
const { horarioNaData, interpretarHorario } = require('../background/horarios.js');

test('35T34 numa terça usa T3–T4', () => {
  assert.deepEqual(horarioNaData('2026-10-13', '35T34'), { inicio: '14:50', fim: '16:30' });
});

test('6T56 numa sexta usa T5–T6', () => {
  assert.deepEqual(horarioNaData('2026-10-16', '6T56'), { inicio: '16:40', fim: '18:20' });
});

test('4T12 numa quarta usa T1–T2', () => {
  assert.deepEqual(horarioNaData('2026-10-07', '4T12'), { inicio: '13:00', fim: '14:40' });
});

test('dia sem aula usa o horário do primeiro dia da turma', () => {
  // 35T34 numa sexta: não tem aula, usa o bloco de terça
  assert.deepEqual(horarioNaData('2026-10-16', '35T34'), { inicio: '14:50', fim: '16:30' });
});

test('vários grupos: cada dia usa o seu bloco', () => {
  assert.deepEqual(horarioNaData('2026-10-12', '24M12 6T34'), { inicio: '07:00', fim: '08:40' }); // segunda
  assert.deepEqual(horarioNaData('2026-10-16', '24M12 6T34'), { inicio: '14:50', fim: '16:30' }); // sexta
});

test('aulas não consecutivas no mesmo dia: usa o primeiro bloco', () => {
  assert.deepEqual(horarioNaData('2026-10-12', '2M12 2T34'), { inicio: '07:00', fim: '08:40' });
});

test('noite', () => {
  assert.deepEqual(horarioNaData('2026-10-14', '4N1234'), { inicio: '18:40', fim: '22:10' });
});

test('código vazio ou inválido não tem horário', () => {
  assert.equal(horarioNaData('2026-10-13', ''), null);
  assert.equal(horarioNaData('2026-10-13', '3N56'), null);
  assert.equal(interpretarHorario('').size, 0);
});
