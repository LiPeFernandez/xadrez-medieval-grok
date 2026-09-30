/* ===== Motor de xadrez (regras + IA) — tabuleiro 0x88, sem dependências ===== */
var Chess = (function () {
'use strict';

var W = 0, B = 1;
var P = 1, N = 2, BI = 3, R = 4, Q = 5, K = 6;           // tipos de peça; cor = bit 3 (8 = pretas)
var FLAG_EP = 1, FLAG_CASTLE = 2, FLAG_DOUBLE = 3;
var START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function mk(from, to, promo, flag) { return from | (to << 7) | (promo << 14) | (flag << 17); }
function mFrom(m) { return m & 127; }
function mTo(m) { return (m >> 7) & 127; }
function mPromo(m) { return (m >> 14) & 7; }
function mFlag(m) { return (m >> 17) & 7; }
function sqName(s) { return 'abcdefgh'[s & 7] + ((s >> 4) + 1); }
function nameSq(n) { return (n.charCodeAt(0) - 97) + (parseInt(n[1], 10) - 1) * 16; }
function moveStr(m) { return sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? 'nbrq'[mPromo(m) - 2] : ''); }

var KNIGHT_D = [33, 31, 18, 14, -14, -18, -31, -33];
var KING_D = [1, -1, 16, -16, 15, 17, -15, -17];
var BISHOP_D = [15, 17, -15, -17];
var ROOK_D = [1, -1, 16, -16];

var CMASK = new Int8Array(128).fill(15);
CMASK[0x00] = 15 & ~2; CMASK[0x04] = 15 & ~3; CMASK[0x07] = 15 & ~1;
CMASK[0x70] = 15 & ~8; CMASK[0x74] = 15 & ~12; CMASK[0x77] = 15 & ~4;

/* ---------- Zobrist ---------- */
var seed = 0x9E3779B9;
function rnd() { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed | 0; }
var zp1 = new Int32Array(16 * 128), zp2 = new Int32Array(16 * 128);
var zc1 = new Int32Array(16), zc2 = new Int32Array(16), ze1 = new Int32Array(8), ze2 = new Int32Array(8);
var zs1, zs2, i0;
for (i0 = 0; i0 < zp1.length; i0++) { zp1[i0] = rnd(); zp2[i0] = rnd(); }
for (i0 = 0; i0 < 16; i0++) { zc1[i0] = rnd(); zc2[i0] = rnd(); }
for (i0 = 0; i0 < 8; i0++) { ze1[i0] = rnd(); ze2[i0] = rnd(); }
zs1 = rnd(); zs2 = rnd();

var FEN_PIECES = { P: 1, N: 2, B: 3, R: 4, Q: 5, K: 6, p: 9, n: 10, b: 11, r: 12, q: 13, k: 14 };
var PIECE_CH = ' PNBRQK  pnbrqk';

function Position(fen) {
  this.b = new Int8Array(128);
  this.kingSq = [4, 116];
  this.st = [];
  this.side = W; this.castling = 0; this.ep = -1; this.half = 0; this.full = 1;
  this.h1 = 0; this.h2 = 0;
  this.setFen(fen || START);
}

Position.prototype.setFen = function (fen) {
  var parts = fen.trim().split(/\s+/);
  var rows = parts[0].split('/');
  if (rows.length !== 8) throw new Error('FEN inválida');
  this.b.fill(0);
  var kings = [0, 0];
  for (var r = 0; r < 8; r++) {
    var rank = 7 - r, file = 0, row = rows[r];
    for (var i = 0; i < row.length; i++) {
      var ch = row[i];
      if (ch >= '1' && ch <= '8') file += +ch;
      else {
        var p = FEN_PIECES[ch];
        if (!p || file > 7) throw new Error('FEN inválida');
        this.b[rank * 16 + file] = p;
        if ((p & 7) === K) { this.kingSq[p >> 3] = rank * 16 + file; kings[p >> 3]++; }
        file++;
      }
    }
  }
  if (kings[0] !== 1 || kings[1] !== 1) throw new Error('FEN inválida: reis');
  this.side = parts[1] === 'b' ? B : W;
  var c = parts[2] || '-';
  this.castling = (c.indexOf('K') >= 0 ? 1 : 0) | (c.indexOf('Q') >= 0 ? 2 : 0) | (c.indexOf('k') >= 0 ? 4 : 0) | (c.indexOf('q') >= 0 ? 8 : 0);
  this.ep = (parts[3] && parts[3] !== '-') ? nameSq(parts[3]) : -1;
  this.half = parseInt(parts[4] || '0', 10) || 0;
  this.full = parseInt(parts[5] || '1', 10) || 1;
  this.st = [];
  this.computeHash();
};

Position.prototype.fen = function () {
  var s = '';
  for (var r = 7; r >= 0; r--) {
    var empty = 0;
    for (var f = 0; f < 8; f++) {
      var p = this.b[r * 16 + f];
      if (!p) empty++;
      else { if (empty) { s += empty; empty = 0; } s += PIECE_CH[p]; }
    }
    if (empty) s += empty;
    if (r) s += '/';
  }
  var c = (this.castling & 1 ? 'K' : '') + (this.castling & 2 ? 'Q' : '') + (this.castling & 4 ? 'k' : '') + (this.castling & 8 ? 'q' : '');
  return s + ' ' + (this.side === W ? 'w' : 'b') + ' ' + (c || '-') + ' ' + (this.ep >= 0 ? sqName(this.ep) : '-') + ' ' + this.half + ' ' + this.full;
};

/* coluna do en passant relevante para o hash (só se houver peão adversário capaz) */
Position.prototype.epFile = function () {
  if (this.ep < 0) return -1;
  var b = this.b, pawnSq, me;
  if (this.side === W) { pawnSq = this.ep - 16; me = P; } else { pawnSq = this.ep + 16; me = P | 8; }
  var a = pawnSq - 1, c = pawnSq + 1;
  if ((!(a & 0x88) && b[a] === me) || (!(c & 0x88) && b[c] === me)) return this.ep & 7;
  return -1;
};

Position.prototype.computeHash = function () {
  var h1 = 0, h2 = 0, b = this.b;
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    var p = b[s];
    if (p) { h1 ^= zp1[p * 128 + s]; h2 ^= zp2[p * 128 + s]; }
  }
  if (this.side === B) { h1 ^= zs1; h2 ^= zs2; }
  h1 ^= zc1[this.castling]; h2 ^= zc2[this.castling];
  var ef = this.epFile();
  if (ef >= 0) { h1 ^= ze1[ef]; h2 ^= ze2[ef]; }
  this.h1 = h1; this.h2 = h2;
};

Position.prototype.isAttacked = function (sq, by) {
  var b = this.b, c = by << 3, s, p, i, d;
  if (by === W) {
    s = sq - 15; if (!(s & 0x88) && b[s] === P) return true;
    s = sq - 17; if (!(s & 0x88) && b[s] === P) return true;
  } else {
    s = sq + 15; if (!(s & 0x88) && b[s] === (P | 8)) return true;
    s = sq + 17; if (!(s & 0x88) && b[s] === (P | 8)) return true;
  }
  for (i = 0; i < 8; i++) {
    s = sq + KNIGHT_D[i]; if (!(s & 0x88) && b[s] === (N | c)) return true;
    s = sq + KING_D[i]; if (!(s & 0x88) && b[s] === (K | c)) return true;
  }
  for (i = 0; i < 4; i++) {
    d = BISHOP_D[i]; s = sq + d;
    while (!(s & 0x88)) { p = b[s]; if (p) { if (p === (BI | c) || p === (Q | c)) return true; break; } s += d; }
    d = ROOK_D[i]; s = sq + d;
    while (!(s & 0x88)) { p = b[s]; if (p) { if (p === (R | c) || p === (Q | c)) return true; break; } s += d; }
  }
  return false;
};

Position.prototype.inCheck = function () { return this.isAttacked(this.kingSq[this.side], this.side ^ 1); };

/* Gera lances pseudo-legais. capOnly: só capturas/promoções (quiescence). queenOnly: ignora subpromoções. */
Position.prototype.genMoves = function (capOnly, queenOnly) {
  var moves = [], b = this.b, us = this.side, col = us << 3, sq, p, t, i, to, d, tp, s;
  for (sq = 0; sq < 128; sq++) {
    if (sq & 0x88) { sq += 7; continue; }
    p = b[sq];
    if (!p || (p & 8) !== col) continue;
    t = p & 7;
    if (t === P) {
      var dir = us === W ? 16 : -16, startR = us === W ? 1 : 6, promoR = us === W ? 6 : 1, r = sq >> 4;
      to = sq + dir;
      if (b[to] === 0) {
        if (r === promoR) {
          moves.push(mk(sq, to, Q, 0));
          if (!queenOnly) { moves.push(mk(sq, to, R, 0)); moves.push(mk(sq, to, BI, 0)); moves.push(mk(sq, to, N, 0)); }
        } else if (!capOnly) {
          moves.push(mk(sq, to, 0, 0));
          if (r === startR && b[to + dir] === 0) moves.push(mk(sq, to + dir, 0, FLAG_DOUBLE));
        }
      }
      for (i = -1; i <= 1; i += 2) {
        to = sq + dir + i;
        if (to & 0x88) continue;
        tp = b[to];
        if (tp && (tp & 8) !== col) {
          if (r === promoR) {
            moves.push(mk(sq, to, Q, 0));
            if (!queenOnly) { moves.push(mk(sq, to, R, 0)); moves.push(mk(sq, to, BI, 0)); moves.push(mk(sq, to, N, 0)); }
          } else moves.push(mk(sq, to, 0, 0));
        } else if (!tp && to === this.ep) moves.push(mk(sq, to, 0, FLAG_EP));
      }
    } else if (t === N || t === K) {
      var offs = t === N ? KNIGHT_D : KING_D;
      for (i = 0; i < 8; i++) {
        to = sq + offs[i];
        if (to & 0x88) continue;
        tp = b[to];
        if (!tp) { if (!capOnly) moves.push(mk(sq, to, 0, 0)); }
        else if ((tp & 8) !== col) moves.push(mk(sq, to, 0, 0));
      }
    } else {
      var start = t === BI ? 4 : 0, end = t === R ? 4 : 8;
      for (i = start; i < end; i++) {
        d = KING_D[i]; to = sq + d;
        while (!(to & 0x88)) {
          tp = b[to];
          if (!tp) { if (!capOnly) moves.push(mk(sq, to, 0, 0)); }
          else { if ((tp & 8) !== col) moves.push(mk(sq, to, 0, 0)); break; }
          to += d;
        }
      }
    }
  }
  if (!capOnly) {
    var ks = us === W ? 4 : 0x74, them = us ^ 1;
    if (b[ks] === (K | col) && ((us === W ? this.castling & 3 : this.castling & 12))) {
      var kr = us === W ? 1 : 4, qr = us === W ? 2 : 8;
      if ((this.castling & kr) && b[ks + 3] === (R | col) && !b[ks + 1] && !b[ks + 2] &&
          !this.isAttacked(ks, them) && !this.isAttacked(ks + 1, them) && !this.isAttacked(ks + 2, them))
        moves.push(mk(ks, ks + 2, 0, FLAG_CASTLE));
      if ((this.castling & qr) && b[ks - 4] === (R | col) && !b[ks - 1] && !b[ks - 2] && !b[ks - 3] &&
          !this.isAttacked(ks, them) && !this.isAttacked(ks - 1, them) && !this.isAttacked(ks - 2, them))
        moves.push(mk(ks, ks - 2, 0, FLAG_CASTLE));
    }
  }
  return moves;
};

/* Executa o lance; retorna false se deixar o próprio rei em xeque (nesse caso chame unmake). */
Position.prototype.make = function (m) {
  var b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
  var us = this.side, them = us ^ 1, piece = b[from], cap = b[to], t = piece & 7;
  this.st.push(cap, this.castling, this.ep, this.half, this.h1, this.h2);
  var h1 = this.h1, h2 = this.h2, ef = this.epFile(), idx;
  if (ef >= 0) { h1 ^= ze1[ef]; h2 ^= ze2[ef]; }
  h1 ^= zc1[this.castling]; h2 ^= zc2[this.castling];
  idx = piece * 128 + from; h1 ^= zp1[idx]; h2 ^= zp2[idx];
  if (cap) { idx = cap * 128 + to; h1 ^= zp1[idx]; h2 ^= zp2[idx]; }
  b[from] = 0;
  var placed = promo ? (promo | (us << 3)) : piece;
  b[to] = placed;
  idx = placed * 128 + to; h1 ^= zp1[idx]; h2 ^= zp2[idx];
  if (flag === FLAG_EP) {
    var cs = to + (us === W ? -16 : 16), cp = b[cs];
    b[cs] = 0; idx = cp * 128 + cs; h1 ^= zp1[idx]; h2 ^= zp2[idx];
    cap = cp;
  } else if (flag === FLAG_CASTLE) {
    var rf, rt;
    if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
    var rk = b[rf]; b[rf] = 0; b[rt] = rk;
    idx = rk * 128 + rf; h1 ^= zp1[idx]; h2 ^= zp2[idx];
    idx = rk * 128 + rt; h1 ^= zp1[idx]; h2 ^= zp2[idx];
  }
  if (t === K) this.kingSq[us] = to;
  this.castling &= CMASK[from] & CMASK[to];
  this.ep = flag === FLAG_DOUBLE ? (from + to) >> 1 : -1;
  this.half = (t === P || cap) ? 0 : this.half + 1;
  if (us === B) this.full++;
  this.side = them;
  h1 ^= zs1; h2 ^= zs2;
  h1 ^= zc1[this.castling]; h2 ^= zc2[this.castling];
  ef = this.epFile();
  if (ef >= 0) { h1 ^= ze1[ef]; h2 ^= ze2[ef]; }
  this.h1 = h1; this.h2 = h2;
  return !this.isAttacked(this.kingSq[us], them);
};

Position.prototype.unmake = function (m) {
  var b = this.b, from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, flag = (m >> 17) & 7;
  var s = this.st;
  this.h2 = s.pop(); this.h1 = s.pop(); this.half = s.pop(); this.ep = s.pop(); this.castling = s.pop();
  var cap = s.pop();
  this.side ^= 1;
  var us = this.side, them = us ^ 1;
  var piece = promo ? (P | (us << 3)) : b[to];
  b[from] = piece;
  if (flag === FLAG_EP) { b[to] = 0; b[to + (us === W ? -16 : 16)] = P | (them << 3); }
  else b[to] = cap;
  if (flag === FLAG_CASTLE) {
    var rf, rt;
    if (to > from) { rf = from + 3; rt = from + 1; } else { rf = from - 4; rt = from - 1; }
    b[rf] = b[rt]; b[rt] = 0;
  }
  if ((piece & 7) === K) this.kingSq[us] = from;
  if (us === B) this.full--;
};

Position.prototype.legalMoves = function () {
  var ps = this.genMoves(false, false), out = [];
  for (var i = 0; i < ps.length; i++) {
    if (this.make(ps[i])) out.push(ps[i]);
    this.unmake(ps[i]);
  }
  return out;
};

/* quantas vezes a posição atual já ocorreu antes (mesmo lado a jogar) na linha atual */
Position.prototype.repetitions = function () {
  var s = this.st, n = s.length / 6, cnt = 0, lim = Math.min(this.half, n);
  for (var k = 2; k <= lim; k += 2) {
    var base = (n - k) * 6;
    if (s[base + 4] === this.h1 && s[base + 5] === this.h2) cnt++;
  }
  return cnt;
};

Position.prototype.insufficientMaterial = function () {
  var b = this.b, minors = 0, bishops = [0, 0];
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    var t = b[s] & 7;
    if (!t || t === K) continue;
    if (t === P || t === R || t === Q) return false;
    minors++;
    if (t === BI) bishops[(((s >> 4) + (s & 7)) & 1)]++;
  }
  if (minors <= 1) return true;
  // só bispos, todos em casas da mesma cor (de ambos os lados)
  var knights = 0;
  for (s = 0; s < 128; s++) { if (s & 0x88) { s += 7; continue; } if ((b[s] & 7) === N) knights++; }
  if (knights === 0 && (bishops[0] === 0 || bishops[1] === 0)) return true;
  return false;
};

function perft(pos, depth) {
  var moves = pos.genMoves(false, false), n = 0;
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i];
    if (pos.make(m)) n += depth > 1 ? perft(pos, depth - 1) : 1;
    pos.unmake(m);
  }
  return n;
}

/* ===================== Avaliação ===================== */
var PV = [0, 100, 320, 330, 500, 900, 0];
var PST = {};
PST[P] = [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0];
PST[N] = [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50];
PST[BI] = [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20];
PST[R] = [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0];
PST[Q] = [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20];
var KING_MG = [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20];
var KING_EG = [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50];

// tabelas indexadas por [peça(0..15)*128 + casa 0x88], já do ponto de vista de cada cor
var PSQ = new Int16Array(16 * 128), KMG = [new Int16Array(128), new Int16Array(128)], KEG = [new Int16Array(128), new Int16Array(128)];
(function () {
  for (var s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    var r = s >> 4, f = s & 7, wi = (7 - r) * 8 + f, bi = r * 8 + f, t;
    for (t = 1; t <= 5; t++) { PSQ[t * 128 + s] = PV[t] + PST[t][wi]; PSQ[(t | 8) * 128 + s] = PV[t] + PST[t][bi]; }
    KMG[0][s] = KING_MG[wi]; KMG[1][s] = KING_MG[bi];
    KEG[0][s] = KING_EG[wi]; KEG[1][s] = KING_EG[bi];
  }
})();
var PASSED = [0, 5, 10, 20, 35, 60, 100, 0];

/* pontuação do ponto de vista de quem joga */
function evaluate(pos) {
  var b = pos.b, score = 0, phase = 0, bishops0 = 0, bishops1 = 0;
  var wMin = [8, 8, 8, 8, 8, 8, 8, 8], bMax = [-1, -1, -1, -1, -1, -1, -1, -1];
  var wCnt = [0, 0, 0, 0, 0, 0, 0, 0], bCnt = [0, 0, 0, 0, 0, 0, 0, 0];
  var s, p, t, r, f;
  for (s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    p = b[s];
    if (!p) continue;
    t = p & 7;
    if (t === K) continue;
    r = s >> 4; f = s & 7;
    if (p < 8) {
      score += PSQ[p * 128 + s];
      if (t === P) { if (r < wMin[f]) wMin[f] = r; wCnt[f]++; }
      else if (t === BI) { bishops0++; phase += 1; }
      else if (t === N) phase += 1;
      else if (t === R) phase += 2;
      else if (t === Q) phase += 4;
    } else {
      score -= PSQ[p * 128 + s];
      if (t === P) { if (r > bMax[f]) bMax[f] = r; bCnt[f]++; }
      else if (t === BI) { bishops1++; phase += 1; }
      else if (t === N) phase += 1;
      else if (t === R) phase += 2;
      else if (t === Q) phase += 4;
    }
  }
  if (bishops0 >= 2) score += 30;
  if (bishops1 >= 2) score -= 30;
  // estrutura de peões
  for (f = 0; f < 8; f++) {
    if (wCnt[f] > 1) score -= 12 * (wCnt[f] - 1);
    if (bCnt[f] > 1) score += 12 * (bCnt[f] - 1);
  }
  for (s = 0; s < 128; s++) {
    if (s & 0x88) { s += 7; continue; }
    p = b[s];
    if (p === P) {
      r = s >> 4; f = s & 7;
      var a = f > 0 ? bMax[f - 1] : -1, c = f < 7 ? bMax[f + 1] : -1, d = bMax[f];
      if (a <= r && c <= r && d <= r) score += PASSED[r];
      if ((f === 0 || !wCnt[f - 1]) && (f === 7 || !wCnt[f + 1])) score -= 10;
    } else if (p === (P | 8)) {
      r = s >> 4; f = s & 7;
      var a2 = f > 0 ? wMin[f - 1] : 8, c2 = f < 7 ? wMin[f + 1] : 8, d2 = wMin[f];
      if (a2 >= r && c2 >= r && d2 >= r) score -= PASSED[7 - r];
      if ((f === 0 || !bCnt[f - 1]) && (f === 7 || !bCnt[f + 1])) score += 10;
    }
  }
  if (phase > 24) phase = 24;
  var wk = pos.kingSq[0], bk = pos.kingSq[1];
  score += ((KMG[0][wk] - KMG[1][bk]) * phase + (KEG[0][wk] - KEG[1][bk]) * (24 - phase)) / 24 | 0;
  return pos.side === W ? score : -score;
}

/* ===================== Busca ===================== */
var INF = 32000, MATE = 30000, MAXPLY = 64;
var TT_BITS = 18, TT_SIZE = 1 << TT_BITS, TT_MASK = TT_SIZE - 1;
var ttKey = new Int32Array(TT_SIZE), ttMove = new Int32Array(TT_SIZE), ttScore = new Int16Array(TT_SIZE);
var ttDepth = new Int8Array(TT_SIZE), ttFlag = new Int8Array(TT_SIZE);     // flag: 0 exato, 1 limite inferior, 2 limite superior
var killers = [], history = new Int32Array(16 * 128), nodes = 0, deadline = 0, aborted = false;
for (var kk = 0; kk < MAXPLY + 2; kk++) killers.push([0, 0]);

function victimOf(pos, m) {
  var f = (m >> 17) & 7;
  if (f === FLAG_EP) return P;
  return pos.b[(m >> 7) & 127] & 7;
}

function scoreMoves(pos, moves, ttm, ply) {
  var sc = new Array(moves.length), b = pos.b;
  for (var i = 0; i < moves.length; i++) {
    var m = moves[i], from = m & 127, to = (m >> 7) & 127, promo = (m >> 14) & 7, v, s;
    if (m === ttm) { sc[i] = 10000000; continue; }
    v = victimOf(pos, m);
    if (v) s = 1000000 + v * 16 - (b[from] & 7);
    else if (promo) s = 900000 + promo;
    else if (m === killers[ply][0]) s = 800000;
    else if (m === killers[ply][1]) s = 700000;
    else s = history[b[from] * 128 + to];
    if (v && promo) s += 500;
    sc[i] = s;
  }
  return sc;
}
function pickMove(moves, sc, i) {
  var bi = i, bs = sc[i];
  for (var j = i + 1; j < moves.length; j++) if (sc[j] > bs) { bs = sc[j]; bi = j; }
  if (bi !== i) { var tm = moves[i]; moves[i] = moves[bi]; moves[bi] = tm; var ts = sc[i]; sc[i] = sc[bi]; sc[bi] = ts; }
  return moves[i];
}

function qsearch(pos, alpha, beta, ply) {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return 0;
  var stand = evaluate(pos);
  if (ply >= MAXPLY) return stand;
  if (stand >= beta) return stand;
  if (stand > alpha) alpha = stand;
  var moves = pos.genMoves(true, true), sc = scoreMoves(pos, moves, 0, ply), best = stand;
  for (var i = 0; i < moves.length; i++) {
    var m = pickMove(moves, sc, i);
    var v = victimOf(pos, m);
    if (!((m >> 14) & 7) && stand + PV[v] + 200 < alpha) continue;       // poda delta
    if (!pos.make(m)) { pos.unmake(m); continue; }
    var s = -qsearch(pos, -beta, -alpha, ply + 1);
    pos.unmake(m);
    if (aborted) return 0;
    if (s > best) { best = s; if (s > alpha) { alpha = s; if (alpha >= beta) break; } }
  }
  return best;
}

function search(pos, depth, alpha, beta, ply, rootPrev) {
  if ((++nodes & 2047) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return 0;
  if (ply > 0) {
    if (pos.half >= 100 || pos.repetitions() >= 1) return 0;
  }
  var inChk = pos.inCheck();
  if (inChk && ply < MAXPLY - 1) depth++;
  if (depth <= 0 || ply >= MAXPLY - 1) return qsearch(pos, alpha, beta, ply);
  var alpha0 = alpha, idx = pos.h1 & TT_MASK, ttm = 0;
  if (ttKey[idx] === pos.h2 && ttDepth[idx] >= 0) {
    ttm = ttMove[idx];
    if (ply > 0 && ttDepth[idx] >= depth) {
      var ts = ttScore[idx];
      if (ts > MATE - 100) ts -= ply; else if (ts < -MATE + 100) ts += ply;
      var fl = ttFlag[idx];
      if (fl === 0) return ts;
      if (fl === 1 && ts > alpha) alpha = ts;
      else if (fl === 2 && ts < beta) beta = ts;
      if (alpha >= beta) return ts;
    }
  }
  if (ply === 0 && rootPrev) ttm = rootPrev;
  var moves = pos.genMoves(false, true), sc = scoreMoves(pos, moves, ttm, ply);
  var best = -INF, bestMove = 0, legal = 0;
  for (var i = 0; i < moves.length; i++) {
    var m = pickMove(moves, sc, i);
    if (!pos.make(m)) { pos.unmake(m); continue; }
    legal++;
    var s = -search(pos, depth - 1, -beta, -alpha, ply + 1, 0);
    pos.unmake(m);
    if (aborted) return 0;
    if (s > best) {
      best = s; bestMove = m;
      if (s > alpha) {
        alpha = s;
        if (alpha >= beta) {
          if (!victimOf(pos, m) && !((m >> 14) & 7)) {
            if (killers[ply][0] !== m) { killers[ply][1] = killers[ply][0]; killers[ply][0] = m; }
            history[pos.b[m & 127] * 128 + ((m >> 7) & 127)] += depth * depth;
          }
          break;
        }
      }
    }
  }
  if (!legal) return inChk ? -MATE + ply : 0;
  var store = best;
  if (store > MATE - 100) store += ply; else if (store < -MATE + 100) store -= ply;
  ttKey[idx] = pos.h2; ttMove[idx] = bestMove; ttScore[idx] = store; ttDepth[idx] = depth > 100 ? 100 : depth;
  ttFlag[idx] = best <= alpha0 ? 2 : (best >= beta ? 1 : 0);
  if (ply === 0) search.rootBest = bestMove;
  return best;
}

function resetSearch() {
  ttKey.fill(0); ttDepth.fill(-1); history.fill(0);
  for (var i = 0; i < killers.length; i++) { killers[i][0] = 0; killers[i][1] = 0; }
  nodes = 0; aborted = false;
}

/* Busca com aprofundamento iterativo. Retorna {move, score, depth, nodes} */
function iterative(pos, maxDepth, timeMs) {
  resetSearch();
  deadline = Date.now() + timeMs;
  var legal = pos.legalMoves();
  if (!legal.length) return { move: 0, score: 0, depth: 0, nodes: 0 };
  var bestMove = legal[0], bestScore = 0, done = 0;
  if (legal.length === 1) return { move: bestMove, score: 0, depth: 0, nodes: 0 };
  for (var d = 1; d <= maxDepth; d++) {
    search.rootBest = 0;
    var sc = search(pos, d, -INF, INF, 0, bestMove);
    if (aborted) break;
    if (search.rootBest) { bestMove = search.rootBest; bestScore = sc; done = d; }
    if (Math.abs(sc) > MATE - 100) break;
  }
  return { move: bestMove, score: bestScore, depth: done, nodes: nodes };
}

/* Avalia cada lance da raiz separadamente (permite ruído/escolha entre os melhores) */
function rootScores(pos, depth, timeMs, noise) {
  resetSearch();
  deadline = Date.now() + timeMs;
  var legal = pos.legalMoves(), out = [];
  var sc0 = scoreMoves(pos, legal, 0, 0);
  for (var i = 0; i < legal.length; i++) pickMove(legal, sc0, i);
  for (i = 0; i < legal.length; i++) {
    var m = legal[i];
    if (((m >> 14) & 7) && ((m >> 14) & 7) !== Q) continue;                 // a IA só promove a dama
    pos.make(m);
    var s = pos.repetitions() >= 1 || pos.half >= 100 ? 0 : -search(pos, depth - 1, -INF, INF, 1, 0);
    pos.unmake(m);
    if (aborted) { if (!out.length) out.push({ m: m, s: 0 }); break; }
    out.push({ m: m, s: s });
  }
  return out;
}

function chooseMove(pos, level) {
  var t0 = Date.now(), legal = pos.legalMoves(), i, res;
  if (!legal.length) return { move: 0, score: 0, depth: 0, nodes: 0, ms: 0 };
  // a IA sempre promove a dama
  var filtered = legal.filter(function (m) { var p = mPromo(m); return !p || p === Q; });
  if (filtered.length) legal = filtered;
  if (level === 'facil') {
    var r = Math.random(), m;
    if (r < 0.65) {
      var caps = legal.filter(function (x) { return victimOf(pos, x) !== 0; });
      if (caps.length && Math.random() < 0.5) {
        // captura simples: prefere vítima de maior valor
        var w = caps.map(function (x) { return PV[victimOf(pos, x)] + 50; }), tot = 0;
        for (i = 0; i < w.length; i++) tot += w[i];
        var pick = Math.random() * tot;
        for (i = 0; i < caps.length; i++) { pick -= w[i]; if (pick <= 0) break; }
        m = caps[Math.min(i, caps.length - 1)];
      } else m = legal[Math.floor(Math.random() * legal.length)];
      return { move: m, score: 0, depth: 0, nodes: 0, ms: Date.now() - t0 };
    }
    // profundidade 1 com muito ruído
    var bestS = -1e9;
    for (i = 0; i < legal.length; i++) {
      pos.make(legal[i]);
      var s = -evaluate(pos);
      if (pos.inCheck() && pos.legalMoves().length === 0) s = 100000;
      pos.unmake(legal[i]);
      s += (Math.random() - 0.5) * 360;
      if (s > bestS) { bestS = s; m = legal[i]; }
    }
    return { move: m, score: bestS | 0, depth: 1, nodes: legal.length, ms: Date.now() - t0 };
  }
  if (level === 'medio') {
    var list = rootScores(pos, 3, 4000, 0), best = -1e9, cand = [];
    for (i = 0; i < list.length; i++) list[i].s += (Math.random() - 0.5) * 30;   // ruído pequeno
    for (i = 0; i < list.length; i++) if (list[i].s > best) best = list[i].s;
    for (i = 0; i < list.length; i++) if (list[i].s >= best - 12) cand.push(list[i]);
    var ch = cand[Math.floor(Math.random() * cand.length)];
    return { move: ch.m, score: ch.s | 0, depth: 3, nodes: nodes, ms: Date.now() - t0 };
  }
  res = iterative(pos, 4, 8000);
  res.ms = Date.now() - t0;
  if (((res.move >> 14) & 7) && ((res.move >> 14) & 7) !== Q) res.move = legal[0];
  return res;
}

/* ===================== Partida (regras de fim de jogo, SAN, desfazer) ===================== */
var LETTER_PT = { 2: 'C', 3: 'B', 4: 'T', 5: 'D', 6: 'R' };

function Game(fen) {
  this.startFen = fen || START;
  this.pos = new Position(this.startFen);
  this.moves = []; this.sans = []; this.keys = []; this.counts = {};
  this.addKey();
  this._status = null;
}

Game.prototype.key = function () {
  var pos = this.pos, parts = pos.fen().split(' ');
  var ep = '-';
  if (pos.ep >= 0) {
    var ms = pos.legalMoves();
    for (var i = 0; i < ms.length; i++) if (mFlag(ms[i]) === FLAG_EP) { ep = sqName(pos.ep); break; }
  }
  return parts[0] + ' ' + parts[1] + ' ' + parts[2] + ' ' + ep;
};
Game.prototype.addKey = function () { var k = this.key(); this.keys.push(k); this.counts[k] = (this.counts[k] || 0) + 1; };
Game.prototype.legalMoves = function () { return this.pos.legalMoves(); };
Game.prototype.findMove = function (from, to, promo) {
  var ms = this.pos.legalMoves();
  for (var i = 0; i < ms.length; i++) {
    if (mFrom(ms[i]) === from && mTo(ms[i]) === to && (mPromo(ms[i]) || 0) === (promo || 0)) return ms[i];
  }
  return 0;
};

Game.prototype.san = function (m) {
  var pos = this.pos, from = mFrom(m), to = mTo(m), piece = pos.b[from], t = piece & 7, s = '';
  if (mFlag(m) === FLAG_CASTLE) s = to > from ? 'O-O' : 'O-O-O';
  else {
    var isCap = pos.b[to] !== 0 || mFlag(m) === FLAG_EP;
    if (t === P) { if (isCap) s += 'abcdefgh'[from & 7] + 'x'; }
    else {
      s += LETTER_PT[t];
      var others = pos.legalMoves().filter(function (o) { return o !== m && mTo(o) === to && pos.b[mFrom(o)] === piece; });
      if (others.length) {
        var sameFile = others.some(function (o) { return (mFrom(o) & 7) === (from & 7); });
        var sameRank = others.some(function (o) { return (mFrom(o) >> 4) === (from >> 4); });
        if (!sameFile) s += 'abcdefgh'[from & 7];
        else if (!sameRank) s += (from >> 4) + 1;
        else s += sqName(from);
      }
      if (isCap) s += 'x';
    }
    s += sqName(to);
    if (mPromo(m)) s += '=' + LETTER_PT[mPromo(m)];
  }
  pos.make(m);
  if (pos.inCheck()) s += pos.legalMoves().length ? '+' : '#';
  pos.unmake(m);
  return s;
};

Game.prototype.play = function (m) {
  var san = this.san(m);
  if (!this.pos.make(m)) { this.pos.unmake(m); throw new Error('Lance ilegal: ' + moveStr(m)); }
  this.moves.push(m); this.sans.push(san);
  this.addKey(); this._status = null;
  return san;
};

Game.prototype.undo = function () {
  if (!this.moves.length) return 0;
  var m = this.moves.pop();
  this.sans.pop();
  var k = this.keys.pop(); this.counts[k]--;
  this.pos.unmake(m); this._status = null;
  return m;
};

Game.prototype.status = function () {
  if (this._status) return this._status;
  var pos = this.pos, check = pos.inCheck(), st;
  var legal = pos.legalMoves();
  if (!legal.length) st = check ? { over: true, result: 'mate', winner: pos.side ^ 1, check: true } : { over: true, result: 'stalemate', winner: -1, check: false };
  else if (pos.insufficientMaterial()) st = { over: true, result: 'insufficient', winner: -1, check: check };
  else if (this.counts[this.keys[this.keys.length - 1]] >= 3) st = { over: true, result: 'threefold', winner: -1, check: check };
  else if (pos.half >= 100) st = { over: true, result: 'fifty', winner: -1, check: check };
  else st = { over: false, result: null, winner: -1, check: check };
  this._status = st;
  return st;
};

return {
  W: W, B: B, P: P, N: N, BI: BI, R: R, Q: Q, K: K, START: START,
  FLAG_EP: FLAG_EP, FLAG_CASTLE: FLAG_CASTLE, FLAG_DOUBLE: FLAG_DOUBLE,
  Position: Position, Game: Game, perft: perft, chooseMove: chooseMove, evaluate: evaluate,
  mk: mk, mFrom: mFrom, mTo: mTo, mPromo: mPromo, mFlag: mFlag, sqName: sqName, nameSq: nameSq, moveStr: moveStr, PIECE_CH: PIECE_CH
};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Chess;
