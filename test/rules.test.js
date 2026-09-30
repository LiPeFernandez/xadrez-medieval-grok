const C = require('../src/engine.js');
let fail = 0;
function eq(name, got, exp) { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FALHA'} ${name}${ok ? '' : ' -> obtido ' + JSON.stringify(got) + ' esperado ' + JSON.stringify(exp)}`); }
const uci = g => g.legalMoves().map(C.moveStr).sort();
const play = (g, s) => s.split(' ').forEach(x => { const m = g.findMove(C.nameSq(x.slice(0,2)), C.nameSq(x.slice(2,4)), x[4] ? 'nbrq'.indexOf(x[4]) + 2 : 0); if (!m) throw new Error('ilegal ' + x); g.play(m); });
const st = g => g.status().result;

// mate do pastor / mate do louco
let g = new C.Game(); play(g, 'f2f3 e7e5 g2g4 d8h4'); eq('mate do louco', [st(g), g.status().winner, g.sans[g.sans.length-1]], ['mate', 1, 'Dh4#']);
// afogamento
g = new C.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); eq('afogamento', st(g), 'stalemate');
// material insuficiente
eq('R vs R', st(new C.Game('8/8/4k3/8/8/3K4/8/8 w - - 0 1')), 'insufficient');
eq('R+B vs R', st(new C.Game('8/8/4k3/8/8/3KB3/8/8 w - - 0 1')), 'insufficient');
eq('R+N vs R', st(new C.Game('8/8/4k3/8/8/3KN3/8/8 w - - 0 1')), 'insufficient');
eq('B vs B mesma cor', st(new C.Game('8/8/4kb2/8/8/3KB3/8/8 w - - 0 1')), 'insufficient');
eq('B vs B cor oposta NÃO é empate', st(new C.Game('8/8/2b1k3/8/8/3KB3/8/8 w - - 0 1')), null);
eq('N vs N NÃO é empate automático', st(new C.Game('8/8/4kn2/8/8/3KN3/8/8 w - - 0 1')), null);
eq('R+P vs R não é empate', st(new C.Game('8/8/4k3/8/8/3KP3/8/8 w - - 0 1')), null);
// 50 lances
eq('50 lances', st(new C.Game('8/8/4k3/8/8/3K4/R7/8 w - - 100 80')), 'fifty');
eq('99 meio-lances ainda não', st(new C.Game('8/8/4k3/8/8/3K4/R7/8 w - - 99 80')), null);
// tripla repetição
g = new C.Game(); play(g, 'g1f3 g8f6 f3g1 f6g8'); eq('2a ocorrência', st(g), null);
play(g, 'g1f3 g8f6 f3g1 f6g8'); eq('tripla repetição', st(g), 'threefold');
g.undo(); eq('undo desfaz empate', st(g), null);
// roque: permitido
g = new C.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
eq('roque branco ambos', uci(g).filter(x => ['e1g1','e1c1'].includes(x)), ['e1c1','e1g1']);
play(g, 'e1g1'); eq('roque pequeno move torre', g.pos.fen().split(' ')[0], 'r3k2r/8/8/8/8/8/8/R4RK1');
play(g, 'e8c8'); eq('roque grande preto', g.pos.fen().split(' ')[0], '2kr3r/8/8/8/8/8/8/R4RK1');
// roque proibido: rei em xeque, casa atravessada atacada, destino atacado, peças no caminho, sem direito
const castles = f => uci(new C.Game(f)).filter(x => ['e1g1','e1c1'].includes(x));
eq('em xeque', castles('4r2k/8/8/8/8/8/8/R3K2R w KQ - 0 1'), []);
eq('f1 atacada', castles('5r1k/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1c1']);
eq('g1 atacada', castles('6rk/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1c1']);
eq('d1 atacada (grande proibido)', castles('3r3k/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1g1']);
eq('c1 atacada (grande proibido)', castles('2r4k/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1g1']);
eq('b1 atacada (grande PERMITIDO)', castles('1r5k/8/8/8/8/8/8/R3K2R w KQ - 0 1'), ['e1c1','e1g1']);
eq('peça no caminho b1', castles('7k/8/8/8/8/8/8/RN2K2R w KQ - 0 1'), ['e1g1']);
eq('sem direito K', castles('7k/8/8/8/8/8/8/R3K2R w Q - 0 1'), ['e1c1']);
g = new C.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1'); play(g, 'h1h2 a8a7 h2h1 a7a8'); eq('torre que se moveu perde direito', castles(g.pos.fen()).length && uci(g).filter(x=>x==='e1g1'), []);
// torre capturada em casa inicial remove direito
g = new C.Game('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1'); play(g, 'g2h1'); eq('torre capturada remove roque', g.pos.fen().split(' ')[2], 'Qkq');
// en passant
g = new C.Game(); play(g, 'e2e4 a7a6 e4e5 d7d5'); eq('en passant disponível', uci(g).includes('e5d6'), true);
play(g, 'e5d6'); eq('en passant captura peão', g.pos.fen().split(' ')[0], 'rnbqkbnr/1pp1pppp/p2P4/8/8/8/PPPP1PPP/RNBQKBNR');
g = new C.Game(); play(g, 'e2e4 a7a6 e4e5 d7d5 b1c3 a6a5'); eq('en passant expira', uci(g).includes('e5d6'), false);
// en passant ilegal por cravada horizontal
eq('en passant com cravada horizontal proibido', uci(new C.Game('8/8/8/KPp4r/8/8/8/7k w - c6 0 1')).includes('b5c6'), false);
// en passant que resolve xeque
eq('en passant para sair de xeque', uci(new C.Game('8/8/8/2k5/3Pp3/8/8/4K3 b - d3 0 1')).includes('e4d3'), true);
// promoção
g = new C.Game('8/P6k/8/8/8/8/8/K7 w - - 0 1'); eq('4 promoções', uci(g).filter(x => x.startsWith('a7')), ['a7a8b','a7a8n','a7a8q','a7a8r']);
play(g, 'a7a8n'); eq('subpromoção cavalo', g.pos.fen().split(' ')[0], 'N7/7k/8/8/8/8/8/K7');
g.undo(); eq('undo de promoção', g.pos.fen(), '8/P6k/8/8/8/8/8/K7 w - - 0 1');
// peão cravado / rei não pode andar para casa atacada
eq('peão cravado não captura fora da linha', uci(new C.Game('4r2k/8/8/8/3p4/4P3/8/4K3 w - - 0 1')).filter(x=>x[0]==='e'&&x[1]==='3'), ['e3e4']);
eq('rei não entra em xeque', uci(new C.Game('7k/8/8/8/8/8/5r2/4K3 w - - 0 1')).filter(x=>x.startsWith('e1')).sort(), ['e1d1','e1f2']);
// undo completo
g = new C.Game(); const f0 = g.pos.fen(); play(g, 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 e1g1'); while (g.undo()); eq('undo total restaura', g.pos.fen(), f0);
// SAN
g = new C.Game(); play(g, 'e2e4 e7e5 g1f3 b8c6 f1b5 a7a6 b5c6 d7c6 e1g1'); eq('SAN', g.sans, ['e4','e5','Cf3','Cc6','Bb5','a6','Bxc6','dxc6','O-O']);
g = new C.Game('4k3/8/8/8/8/8/4K3/R6R w - - 0 1'); eq('SAN desambiguação', g.san(g.findMove(C.nameSq('a1'), C.nameSq('d1'))), 'Tad1');
console.log(fail ? `\n${fail} FALHA(S)` : '\nTODOS OS TESTES DE REGRAS PASSARAM'); process.exit(fail ? 1 : 0);
