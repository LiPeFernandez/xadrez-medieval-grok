// IA x IA: verifica que nunca trava nem joga lance ilegal; valida o estado final via Game.status()
const C = require('../src/engine.js');
const levels = ['facil', 'medio', 'dificil'];
const MAXPLIES = +process.env.MAXPLIES || 300;
let fail = 0;
function run(wl, bl, label) {
  const g = new C.Game(); let worst = 0, t0 = Date.now(), n = 0;
  while (!g.status().over && g.moves.length < MAXPLIES) {
    const lvl = g.pos.side === 0 ? wl : bl;
    const legalBefore = g.legalMoves();
    const t = Date.now(), r = C.chooseMove(g.pos, lvl), dt = Date.now() - t;
    worst = Math.max(worst, dt);
    if (!r.move || !legalBefore.includes(r.move)) { console.log('FALHA lance ilegal/ausente', label, C.moveStr(r.move), g.pos.fen()); fail++; return; }
    const fenB = g.pos.fen();
    g.play(r.move); n++;
    // consistência: a posição resultante não pode deixar o rei de quem jogou em xeque
    if (g.pos.isAttacked(g.pos.kingSq[g.pos.side ^ 1], g.pos.side)) { console.log('FALHA rei em xeque após lance', fenB); fail++; return; }
  }
  const s = g.status();
  console.log(`OK   ${label}: ${g.moves.length} meio-lances, resultado=${s.over ? s.result + (s.winner >= 0 ? ' (vencedor ' + (s.winner ? 'pretas' : 'brancas') + ')' : '') : 'limite de ' + MAXPLIES + ' meio-lances'}, pior lance ${worst}ms, total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('     ' + g.sans.slice(0, 12).join(' ') + ' ...');
}
for (const l of levels) run(l, l, `${l} x ${l}`);
run('dificil', 'facil', 'dificil(B) x facil(P)');
run('facil', 'dificil', 'facil(B) x dificil(P)');
run('dificil', 'medio', 'dificil(B) x medio(P)');
run('medio', 'facil', 'medio(B) x facil(P)');
console.log(fail ? `\n${fail} FALHA(S)` : '\nSIMULAÇÕES CONCLUÍDAS SEM TRAVAR E SEM LANCE ILEGAL'); process.exit(fail ? 1 : 0);
