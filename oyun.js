// =============================================================
// Ölümlü Yatzy - ekran: menü, zarlarım (seç → yeniden at), puan kâğıdım, herkesin kâğıdı,
// el sonu sıralaması, hedef seçimi, mesajlar, tepkiler. Motor'dan (ya da online'da oda sahibinden)
// gelen olaylara göre sahneyi oynatır.
// =============================================================

const $ = id => document.getElementById(id);
const ANAHTAR_AD = 'olumluYatzy.ad';
const ANAHTAR_KARAKTER = 'olumluYatzy.karakter';
const kayitOku = (a, v) => { try { return localStorage.getItem(a) ?? v; } catch (e) { return v; } };
const kayitYaz = (a, v) => { try { localStorage.setItem(a, v); } catch (e) { /* yok */ } };
const guvenli = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let Masa = Motor;
const ui = {
  benimNo: 0,
  durum: null,
  karakter: kayitOku(ANAHTAR_KARAKTER, 'horoz'),
  etiketler: {},
  bakisSayac: { no: -1, sure: 0 },
  ozelBakis: {},
  secili: new Set(),        // TUTTUĞUM zarlar (yeniden atışta bunlar kalır, diğerleri atılır)
  zarGizli: false,
};
const online = () => typeof Ag !== 'undefined' && Ag.mod !== 'yerel';

const zarResimOnbellek = {};
function zarResmi(n) {
  if (!zarResimOnbellek[n]) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#f4ecd8';
    g.beginPath(); g.roundRect(4, 4, 88, 88, 16); g.fill();
    g.strokeStyle = '#b8a77e'; g.lineWidth = 4; g.stroke();
    const d = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]] }[n];
    g.fillStyle = n === 1 ? '#b3261e' : '#1a1a1a';
    d.forEach(([x, y]) => { g.beginPath(); g.arc(x * 24, y * 24, n === 1 ? 12 : 9, 0, 7); g.fill(); });
    zarResimOnbellek[n] = c.toDataURL();
  }
  return zarResimOnbellek[n];
}
const zarImg = (n, sinif = '') => `<img class="zarResim ${sinif}" src="${zarResmi(n)}" alt="${n}">`;
const kutuAdi = k => Motor.KUTULAR[k]?.ad || k;

// ---------- Botların lafları ----------
const SOZLER = {
  yatzy: ['YATZY! 🎉 Şansıma bak!', 'Beşi de aynı! Kim tutar beni?', 'Yatzyyyy! 🤠'],
  iyi: ['Fena değil, fena değil…', 'Bu kutu benim!', 'Hehe, puanlar geliyor.', 'Bunu kaçırır mıyım?'],
  sifir: ['Of… bu kutuyu yakıyorum.', 'Sıfır! Zarlar bana küs.', 'Bunu görmediniz!'],
  ates: ['Gözünü kırpma…', 'Hiç kişisel değil.', 'Dua etmeye başla!', 'Puanlar konuştu!'],
  kurtuldu: ['Ohh… az kalsın!', 'Kalbim duracaktı!', 'Bir dahakine bana doğrultma!'],
  oldu: { akbaba: 'Cenaze benden… 🦅', diger: ['Mumu söndü…', 'Toprağı bol olsun.', 'Zarlar ona küsmüştü…'] },
};
const sec = (liste, r) => liste[Math.floor((r ?? Math.random()) * liste.length) % liste.length];

// ---------- Menü ----------
function menuKur() {
  $('adim').value = kayitOku(ANAHTAR_AD, '');
  const kap = $('karakterler');
  Karakterler.TURLER.forEach(t => {
    const b = document.createElement('button');
    b.className = 'karakterBtn';
    b.dataset.tur = t;
    const bilgi = Karakterler.BILGI[t];
    b.innerHTML = `<span class="emoji">${bilgi.emoji}</span>${bilgi.ad}`;
    b.addEventListener('click', () => {
      if (b.classList.contains('alindi')) return;
      ui.karakter = t;
      kayitYaz(ANAHTAR_KARAKTER, t);
      karakterGoster();
      Ses.sec();
      if (online()) Ag.karakterSec(t);
    });
    kap.appendChild(b);
  });
  if (!Karakterler.BILGI[ui.karakter]) ui.karakter = 'horoz';
  karakterGoster();
  $('botlaBtn').addEventListener('click', botlaBasla);
}
function karakterGoster() {
  document.querySelectorAll('.karakterBtn').forEach(b => b.classList.toggle('secili', b.dataset.tur === ui.karakter));
  $('karakterAciklama').textContent = Karakterler.BILGI[ui.karakter].aciklama;
}

function botlaBasla() {
  Ses.hazirla();
  const ad = $('adim').value.trim() || 'Sen';
  kayitYaz(ANAHTAR_AD, $('adim').value.trim());
  const kalan = Karakterler.TURLER.filter(t => t !== ui.karakter).sort(() => Math.random() - 0.5);
  const oyuncular = [{ ad, karakter: ui.karakter, bot: false, kiyafet: Giydir.kiyafet(ui.karakter) }];
  for (let i = 0; i < 3; i++) oyuncular.push({ ad: Karakterler.BILGI[kalan[i]].ad, karakter: kalan[i], bot: true });
  ui.son = oyuncular;
  ui.sonAyar = Giydir.motorAyari();
  Masa = Motor;
  Motor.yeni(oyuncular, olayGeldi, ui.sonAyar);
  oyunEkraniniKur(Motor.gorunum(0), 0);
}

function oyunEkraniniKur(d, benimNo) {
  ui.benimNo = benimNo;
  ui.durum = d;
  ui.secili.clear();
  Masa = online() && Ag.mod === 'misafir' ? Uzak : Motor;
  $('menu').hidden = true;
  $('oyun').hidden = false;
  $('sonEkran').hidden = true;
  $('olumPerdesi').hidden = true;
  $('acilan').hidden = true;
  $('hedefPaneli').hidden = true;
  $('sahne').classList.toggle('olu', !d.oyuncular[benimNo].canli);
  Sahne.kur(d.oyuncular, benimNo);
  Sahne.olumleriUygula(d.oyuncular);
  etiketleriKur();
  ciz();
  Ses.muzikBaslat();
  // Kurallar oyun başında herkese gösterilir
  const k = Motor.KAGITLAR[d.ayar.kagit];
  mesaj(`📋 ${k.ad} kâğıt: ${k.kutular.length} kutu${d.ayar.bonus && d.ayar.kagit === 'uzun' ? ' · 63+ → +35' : ''} · En son hayatta kalan kazanır`, 'orta', 4200);
}

function menuyeDon() {
  if (online()) {
    Ag.ayril();
    return;
  }
  Motor.temizle();
  Ses.gerilimDurdur(true);
  $('oyun').hidden = true;
  $('menu').hidden = false;
  $('sahne').classList.remove('olu');
}

// ---------- Olaylar ----------
const adi = no => ui.durum.oyuncular[no].ad;

function olayGeldi(tip, v, d) {
  ui.durum = d || Motor.gorunum(ui.benimNo);
  d = ui.durum;
  const p = no => d.oyuncular[no];
  if (tip === 'el') {
    $('acilan').hidden = true;
    $('hedefPaneli').hidden = true;
    mesaj(`📋 ${v.elNo}. EL · ${v.kutuSayisi} kutu · 🔫 ${v.hazne - v.cekilen}/${v.hazne} hazne kaldı`, 'iri orta', 2200);
  } else if (tip === 'atis') {
    ui.secili.clear();
    ui.zarGizli = true;
    Sahne.yatzyAt(d.oyuncular);
    Ses.zarSalla();
    setTimeout(() => {
      ui.zarGizli = false;
      ciz(true);
    }, 1600);
  } else if (tip === 'yenidenAtti') {
    Sahne.yenidenAtAnim(v.no, v.indeksler, d.oyuncular[v.no].zarlar);
    Ses.zarSay(3);
    if (v.no === ui.benimNo) {
      ui.secili.clear();
      Sahne.zarIsaretle(ui.benimNo, []);
      setTimeout(() => ciz(true), 50);
    }
  } else if (tip === 'secti') {
    if (v.no === ui.benimNo) Ses.sec();
    else if (p(v.no).bot && (v.kutu === 'yatzy' && v.puan ? true : v.r < 0.35)) {
      balon(v.no, v.kutu === 'yatzy' && v.puan ? sec(SOZLER.yatzy, v.r) : v.puan ? `${kutuAdi(v.kutu)}: ${v.puan}! ${sec(SOZLER.iyi, v.r)}` : sec(SOZLER.sifir, v.r));
    }
    if (v.kutu === 'yatzy' && v.puan) {
      Ses.kazandin();
      mesaj(`🎉 ${v.no === ui.benimNo ? 'YATZY yaptın' : `${adi(v.no)} YATZY yaptı`}! +50`, 'iri', 2200);
      Sahne.tepki(v.no, 'gul', 1.8);
    }
  } else if (tip === 'elSonu') {
    Ses.bardakKalk();
    const sirali = [...v.puanlar].sort((a, b) => b.toplam - a.toplam);
    const satir = (x, i) => `<div class="sira${x.no === v.atici ? ' atici' : ''}"><b>${i + 1}.</b> ${Karakterler.BILGI[p(x.no).karakter].emoji} ${guvenli(x.no === ui.benimNo ? 'Sen' : adi(x.no))}<span>${x.toplam}${x.bonus ? ' <small>(+35)</small>' : ''}</span></div>`;
    let ek = '';
    if (v.beraberlik) ek = `<p class="beraber">Berabere! Zar atıldı: ${v.beraberlik.map(tur => tur.map(a => `${guvenli(a.no === ui.benimNo ? 'Sen' : adi(a.no))} ${zarImg(a.zar, 'mini')}`).join(' · ')).join(' → ')}</p>`;
    $('acilan').innerHTML = `<h3>📋 El sonu</h3>${sirali.map(satir).join('')}${ek}<p class="kaybeden">🔫 ${v.atici === ui.benimNo ? 'Tabanca SENDE!' : `Tabancayı alan: ${guvenli(adi(v.atici))}`}</p>`;
    $('acilan').hidden = false;
    Sahne.tepki(v.atici, 'gul', 1.6);
    d.oyuncular.forEach(x => x.bot && x.canli && x.no !== v.atici && Sahne.bak(x.no, v.atici));
  } else if (tip === 'hedefSec') {
    if (v.no === ui.benimNo) {
      $('acilan').hidden = true;
      Ses.siraSende();
      hedefPaneliniAc();
    } else {
      mesaj(`🔫 ${adi(v.no)} kime ateş edeceğini düşünüyor…`, '', 3000);
      Sahne.ifade(v.no, 'supheli', 3);
    }
  } else if (tip === 'tetikHazir') {
    $('acilan').hidden = true;
    $('hedefPaneli').hidden = true;
    Sahne.nisanAl(v.no, v.hedef);
    Ses.topDon();
    Ses.gerilimBaslat(4);
    setTimeout(() => Ses.gerilim(), 500);
    if (v.no === ui.benimNo) Sahne.oyuncuyaBak(v.hedef);
    else if (v.hedef !== ui.benimNo) Sahne.oyuncuyaBak(v.hedef);
    else Sahne.oyuncuyaBak(v.no);
    const ihtimal = `(ihtimal 1/${v.hazne - v.cekilen})`;
    mesaj(v.no === ui.benimNo ? `🔫 Tabancayı doğrulttun → 🎯 ${adi(v.hedef)} ${ihtimal}`
      : v.hedef === ui.benimNo ? `🔫 ${adi(v.no)} tabancayı SANA doğrulttu! ${ihtimal}`
      : `🔫 ${adi(v.no)} tabancayı doğrulttu → 🎯 ${adi(v.hedef)} ${ihtimal}`, 'kirmizi', 4000);
    if (p(v.no).bot) setTimeout(() => balon(v.no, sec(SOZLER.ates, Math.random())), 400);
    Sahne.terle(v.hedef, 3.5);
    d.oyuncular.forEach(x => x.bot && x.canli && x.no !== v.no && x.no !== v.hedef && Sahne.bak(x.no, v.hedef));
    if (p(v.hedef).bot) Sahne.bak(v.hedef, v.no);
  } else if (tip === 'tetik') {
    Ses.gerilimDurdur();
    Sahne.atesSonuc(v.no, v.hedef, v.oldu);
    if (v.oldu) {
      Ses.bam();
      setTimeout(Ses.mum, 500);
      mesaj(v.hedef === ui.benimNo ? 'BAM! Mumun söndü 🕯️' : `BAM! 🕯️ ${adi(v.hedef)} öldü, mumu söndü`, 'iri kirmizi', 2600);
      if (v.hedef === ui.benimNo) {
        $('sahne').classList.add('olu');
        $('olumMenuBtn').textContent = online() ? '👀 İzlemeye devam' : '🏠 Ana menü';
        setTimeout(() => ($('olumPerdesi').hidden = false), 1600);
      }
      const yasayan = d.oyuncular.filter(x => x.canli && x.bot);
      const konusan = yasayan.find(x => x.karakter === 'akbaba') || yasayan[Math.floor(v.r * yasayan.length)];
      if (konusan) setTimeout(() => balon(konusan.no, konusan.karakter === 'akbaba' ? SOZLER.oldu.akbaba : sec(SOZLER.oldu.diger, v.r)), 1400);
    } else {
      Ses.tik();
      mesaj(`TIK! ${v.hedef === ui.benimNo ? 'Kurtuldun' : `${adi(v.hedef)} kurtuldu`}… (${v.cekilen}/${v.hazne})`, 'iri', 2200);
      if (p(v.hedef).bot) setTimeout(() => balon(v.hedef, sec(SOZLER.kurtuldu, v.r)), 500);
    }
    setTimeout(() => { Sahne.bakis.hedefYaw = 0; }, 2000);
  } else if (tip === 'yenidenDoldu') {
    mesaj(`🔫 Tabanca yeniden dolduruldu: artık ${v.hazne} hazne, 1 mermi`, '', 2600);
    Ses.topDon();
  } else if (tip === 'bitti') {
    setTimeout(() => sonuGoster(v.kazanan, v.istat), 1200);
  }
  ciz();
}

// Ateş eden benim: hedefimi seçerim
function hedefPaneliniAc() {
  const d = ui.durum;
  const puanlar = d.sonuc?.puanlar || [];
  $('hedefPaneli').innerHTML = '<h3>🔫 Kime doğrultacaksın?</h3><div class="hedefler">' + d.oyuncular.filter(x => x.canli && x.no !== ui.benimNo)
    .map(x => `<button data-no="${x.no}">${Karakterler.BILGI[x.karakter].emoji} ${guvenli(x.ad)}<small>${puanlar.find(y => y.no === x.no)?.toplam ?? 0} puan</small></button>`).join('')
    + `</div><p class="not">Tabancada ${d.hazne - d.cekilen} hazne kaldı, 1 mermi var.</p>`;
  $('hedefPaneli').hidden = false;
}
$('hedefPaneli').addEventListener('click', e => {
  const b = e.target.closest('button[data-no]');
  if (!b) return;
  Ses.sec();
  Masa.hedefSec(ui.benimNo, +b.dataset.no);
  $('hedefPaneli').hidden = true;
});

// ---------- Domates (mumu sönenler atar) ----------
let sonDomates = 0;
function domatesFirlat(hedef) {
  if (Date.now() - sonDomates < 2000) return;
  sonDomates = Date.now();
  Ag.domatesGonder(hedef);
  const yeni = Istatistik.domatesAtildi();
  yeni.forEach(r => setTimeout(() => mesaj(`🏅 Yeni rozet: ${r.emoji} ${r.ad}`, 'iri', 3000), 900));
}
function domatesGoster(kimden, hedef) {
  if (!ui.durum) return;
  const bana = hedef === ui.benimNo;
  Sahne.domatesAt(kimden, hedef, bana);
  Ses.domates();
  if (bana) {
    setTimeout(ekranaDomates, 700);
    setTimeout(() => mesaj(`🍅 ${adi(kimden)} sana domates attı!`, '', 2000), 750);
  }
}
// Ekrana yapışan domates: ezik domates (çekirdekli, parçalı, parlak) görüşü kapatır, suyu 2 sn boyunca
// aşağı doğru akar, sonra yavaşça kaybolur.
function ekranaDomates() {
  const c = $('domatesKanvas');
  const w = (c.width = innerWidth), h = (c.height = innerHeight);
  const g = c.getContext('2d');
  const R = Math.min(w, h) * (0.3 + Math.random() * 0.06);
  const cx = w * (0.35 + Math.random() * 0.3), cy = h * (0.28 + Math.random() * 0.2);
  // Eziğin kendisi: bir kez çizilip saklanır
  const ez = document.createElement('canvas');
  ez.width = w;
  ez.height = h;
  const e = ez.getContext('2d');
  const sekil = [...Array(5)].map(() => [Math.random() * 6, 2 + Math.floor(Math.random() * 5), 0.05 + Math.random() * 0.12]);
  const kenar = a => R * (1 + sekil.reduce((t, [f, n, s]) => t + Math.sin(a * n + f) * s, 0));
  const yol = (olcek, dx = 0, dy = 0) => {
    e.beginPath();
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2, r = kenar(a) * olcek;
      e.lineTo(cx + dx + Math.cos(a) * r, cy + dy + Math.sin(a) * r * 0.9);
    }
    e.closePath();
  };
  // Etrafa sıçrayan damlalar
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2, u = R * (1.05 + Math.random() * 0.8), r = 4 + Math.random() * R * 0.07;
    e.fillStyle = `rgba(${170 + Math.random() * 40},${14 + Math.random() * 20},10,0.92)`;
    e.beginPath();
    e.ellipse(cx + Math.cos(a) * u, cy + Math.sin(a) * u, r, r * (0.6 + Math.random() * 0.4), a, 0, 7);
    e.fill();
  }
  // Ana ezik: koyu kenar, içte açık kırmızı, sulu parlaklık
  const gr = e.createRadialGradient(cx - R * 0.2, cy - R * 0.25, R * 0.1, cx, cy, R * 1.1);
  gr.addColorStop(0, '#ff5a3c');
  gr.addColorStop(0.55, '#d8241a');
  gr.addColorStop(1, '#8e0f0a');
  e.fillStyle = gr;
  yol(1);
  e.fill();
  // İç et parçaları (daha açık, düzensiz)
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, u = R * Math.random() * 0.6;
    e.fillStyle = `rgba(255,${90 + Math.random() * 50},${70 + Math.random() * 30},0.55)`;
    e.beginPath();
    e.ellipse(cx + Math.cos(a) * u, cy + Math.sin(a) * u, R * (0.12 + Math.random() * 0.12), R * (0.07 + Math.random() * 0.08), Math.random() * 3, 0, 7);
    e.fill();
  }
  // Çekirdekler (sarımsı, jöleli)
  for (let i = 0; i < 34; i++) {
    const a = Math.random() * Math.PI * 2, u = R * Math.sqrt(Math.random()) * 0.75;
    const x = cx + Math.cos(a) * u, y = cy + Math.sin(a) * u, b = 3 + Math.random() * 4;
    e.fillStyle = 'rgba(255,190,120,0.35)';
    e.beginPath(); e.ellipse(x, y, b * 1.9, b * 1.4, a, 0, 7); e.fill();
    e.fillStyle = '#f2d27a';
    e.beginPath(); e.ellipse(x, y, b, b * 0.6, a, 0, 7); e.fill();
  }
  // Kabuk parçası ve sap
  e.fillStyle = '#b5150e';
  e.beginPath(); e.ellipse(cx + R * 0.45, cy - R * 0.35, R * 0.22, R * 0.1, -0.6, 0, 7); e.fill();
  e.fillStyle = '#3a7a2a';
  for (let i = 0; i < 5; i++) {
    e.beginPath();
    e.ellipse(cx - R * 0.3 + Math.cos(i * 1.26) * 10, cy - R * 0.45 + Math.sin(i * 1.26) * 10, 12, 4, i * 1.26, 0, 7);
    e.fill();
  }
  // Islak parlaklık
  e.fillStyle = 'rgba(255,255,255,0.35)';
  for (let i = 0; i < 6; i++) {
    e.beginPath();
    e.ellipse(cx - R * 0.35 + Math.random() * R * 0.5, cy - R * 0.4 + Math.random() * R * 0.4, 6 + Math.random() * 16, 3 + Math.random() * 5, -0.5, 0, 7);
    e.fill();
  }
  // Akan su: eziğin alt kenarından aşağı süzülen damlalar
  const akintilar = [...Array(9 + Math.floor(Math.random() * 5))].map(() => {
    const a = Math.PI * (0.15 + Math.random() * 0.7);   // alt yarım
    return {
      x: cx + Math.cos(a) * kenar(a) * 0.85, y0: cy + Math.sin(a) * kenar(a) * 0.8,
      gen: 7 + Math.random() * 16, boy: 0, hiz: 70 + Math.random() * 130, sal: Math.random() * 6,
    };
  });
  const bas = performance.now();
  c.style.transition = 'none';
  c.style.opacity = '1';
  cancelAnimationFrame(ekranaDomates.istek);
  const ciz = () => {
    const t = (performance.now() - bas) / 1000;
    g.clearRect(0, 0, w, h);
    akintilar.forEach(a => {
      if (t < 2.2) {
        a.boy += a.hiz * (1 - t / 3) * (1 / 60) * (0.6 + Math.random() * 0.8);   // giderek yavaşlar
      }
      const x = a.x + Math.sin(t * 2 + a.sal) * 3;
      const ust = a.y0 - 10, alt = a.y0 + a.boy;
      const gr2 = g.createLinearGradient(0, ust, 0, alt);
      gr2.addColorStop(0, 'rgba(200,24,14,0.95)');
      gr2.addColorStop(1, 'rgba(170,16,10,0.85)');
      g.fillStyle = gr2;
      g.beginPath();
      g.moveTo(x - a.gen / 2, ust);
      g.quadraticCurveTo(x - a.gen * 0.42, (ust + alt) / 2, x - a.gen * 0.3, alt);
      g.arc(x, alt, a.gen * 0.42, Math.PI, 0, true);   // ucunda damla
      g.quadraticCurveTo(x + a.gen * 0.42, (ust + alt) / 2, x + a.gen / 2, ust);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(x - a.gen * 0.2, ust, 2, a.boy * 0.8);
    });
    g.drawImage(ez, 0, 0);
    if (t < 2.6) ekranaDomates.istek = requestAnimationFrame(ciz);
    else {
      // Akış bitti: yavaşça silinir
      c.style.transition = 'opacity 1.4s';
      c.style.opacity = '0';
    }
  };
  ciz();
}

// Mumu sönmüş botlar ara sıra yaşayanlara domates atar (tek başına ya da oda sahibiyken)
setInterval(() => {
  const d = ui.durum;
  if (!d || d.asama === 'bitti' || $('oyun').hidden || Masa !== Motor) return;
  const yasayan = d.oyuncular.filter(p => p.canli);
  d.oyuncular.filter(p => !p.canli && p.bot).forEach(p => {
    if (Math.random() < 0.1 && yasayan.length) Ag.domatesDagit(p.no, yasayan[Math.floor(Math.random() * yasayan.length)].no);
  });
}, 4000);

// Botların bakışları: sıradakine bakarlar, sıradaki bot kartlarına bakar.
// Ben bir bota bir süre bakarsam o da bana bakar. (İnsan oyuncuların kafası kendi ekranlarından gelir.)
function bakislar() {
  const d = ui.durum;
  if (!d || d.asama !== 'atis') return;
  const simdi = performance.now();
  // Atış sırasında botlar ya kendi zarlarına bakar ya da başkalarının zarlarına göz atar
  d.oyuncular.forEach(p => {
    if (!p.bot || !p.canli) return;
    if (ui.ozelBakis[p.no] > simdi) Sahne.bak(p.no, ui.benimNo);
    else if (!p.secti && Math.random() < 0.7) Sahne.bak(p.no, 'masa');
    else if (Math.random() < 0.15) {
      const diger = d.oyuncular.filter(x => x.canli && x.no !== p.no);
      Sahne.bak(p.no, diger[Math.floor(Math.random() * diger.length)].no);
    }
  });
}
setInterval(() => {
  if ($('oyun').hidden || !ui.durum) return;
  const no = Sahne.baktigim();
  const p = ui.durum.oyuncular[no];
  if (no === ui.bakisSayac.no && no >= 0 && p?.bot) {
    ui.bakisSayac.sure += 0.3;
    if (ui.bakisSayac.sure > 1 && !(ui.ozelBakis[no] > performance.now())) {
      ui.ozelBakis[no] = performance.now() + 2000;
      Sahne.bak(no, ui.benimNo);
      Sahne.ifade(no, Math.random() < 0.5 ? 'supheli' : 'kizgin', 2);
      if (Math.random() < 0.35) Sahne.tepki(no, Math.random() < 0.5 ? 'dusun' : 'gul', 1.2);
    }
  } else ui.bakisSayac = { no, sure: 0 };
  bakislar();
}, 300);
// Kendi bakışımı (kafamın yönünü) odadakilere yolla
setInterval(() => {
  if (online() && !$('oyun').hidden) Ag.bakisGonder(Sahne.bakis.yaw, Sahne.bakis.pitch);
}, 150);



// ---------- Çizim ----------
function ciz(yeniZar) {
  const d = ui.durum;
  if (!d) return;
  const k = Motor.KAGITLAR[d.ayar.kagit];
  $('sonIddia').innerHTML = `<div><small>${k.ad} kâğıt${d.ayar.bonus && d.ayar.kagit === 'uzun' ? ' · +35 bonus' : ''}</small><b>${d.elNo}. El · Atış ${Math.max(d.atisNo, 0)}/${k.kutular.length}</b></div>`
    + `<div class="tabancaDurum"><small>Tabanca</small><b>🔫 ${d.hazne - d.cekilen}/${d.hazne}</b></div>`;
  d.oyuncular.forEach(p => {
    const e = ui.etiketler[p.no];
    if (!e) return;
    e.el.classList.toggle('sirada', d.asama === 'hedef' && d.atici === p.no);
    e.el.classList.toggle('olu', !p.canli);
    const ses = online() && Ag.sesteMi(p.no) ? ' 🎙️' : '';
    const bot = p.yedekBot ? ' · 🤖' : '';
    const durum = d.asama === 'atis' ? (p.secti ? ' · ✅' : ' · 🤔') : '';
    e.bilgi.textContent = p.canli ? `📋 ${p.toplam} puan${durum}${bot}${ses}` : '🕯️ mumu söndü';
  });
  const ben = d.oyuncular[ui.benimNo];
  const karar = d.asama === 'atis' && ben.canli && !ben.secti && !ui.zarGizli;
  $('benimBilgi').classList.toggle('sirada', karar);
  $('benimBilgi').innerHTML = ben.canli
    ? `${Karakterler.BILGI[ben.karakter].emoji} <b>${guvenli(ben.ad)}</b> · 📋 <b>${ben.toplam}</b> puan${ben.bonus ? ' <small>(+35 bonus)</small>' : ''}${d.asama === 'atis' && ben.secti ? ` · ✅ ${kutuAdi(ben.secti)} seçtin, diğerleri bekleniyor` : karar ? ' · <b>Kutunu seç!</b>' : ''}`
    : '🕯️ Mumun söndü';
  zarlarimCiz(yeniZar);
  kagidimCiz(karar);
  $('alt').style.visibility = ben.canli ? '' : 'hidden';
  const domatesVar = !ben.canli && d.asama !== 'bitti';
  $('domatesCubugu').hidden = !domatesVar;
  if (domatesVar) {
    $('domatesCubugu').innerHTML = '<span>🍅 Domates at:</span>' + d.oyuncular.filter(p => p.canli)
      .map(p => `<button data-no="${p.no}">${Karakterler.BILGI[p.karakter].emoji} ${guvenli(p.ad)}</button>`).join('');
  }
  if (!$('kagitlarPaneli').hidden) kagitlariCiz();
}

// Benim zarlarım: dokununca yeniden atmak için seçilir
function zarlarimCiz(yeni) {
  const d = ui.durum, ben = d?.oyuncular[ui.benimNo];
  const kap = $('zarlarim');
  if (!ben?.canli || !ben.zarlar?.length || d.asama !== 'atis') {
    kap.innerHTML = '';
    $('yenidenAtBtn').hidden = true;
    return;
  }
  if (ui.zarGizli) {
    kap.innerHTML = '<div class="sallaniyor">🎲 Zarlar atılıyor…</div>';
    $('yenidenAtBtn').hidden = true;
    return;
  }
  const secebilir = !ben.secti && !ben.yenidenAtti;
  kap.innerHTML = ben.zarlar.map((z, i) => `<button class="zarKutu${yeni ? ' yeni' : ''}${ui.secili.has(i) ? ' secili' : ''}" data-i="${i}" ${secebilir ? '' : 'disabled'} style="animation-delay:${i * 0.06}s">${zarImg(z)}</button>`).join('');
  $('yenidenAtBtn').hidden = ben.secti;
  const atilacak = 5 - ui.secili.size;
  $('yenidenAtBtn').disabled = !secebilir || !atilacak;
  $('yenidenAtBtn').textContent = ben.yenidenAtti ? '🎲 Yeniden atma hakkını kullandın'
    : !atilacak ? '✋ Hepsini tuttun: kutunu seç'
    : ui.secili.size ? `🎲 Tuttuğun ${ui.secili.size} zar kalsın, diğer ${atilacak} zarı at (1 hak)`
    : '🎲 5 zarın hepsini yeniden at (1 hak) · tutmak istediklerine dokun';
}
$('zarlarim').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  if (!b || b.disabled) return;
  const i = +b.dataset.i;
  ui.secili.has(i) ? ui.secili.delete(i) : ui.secili.add(i);
  Ses.sec();
  Sahne.zarIsaretle(ui.benimNo, [...ui.secili]);
  zarlarimCiz();
});
$('yenidenAtBtn').addEventListener('click', () => {
  // Tuttuklarım kalır, tutmadıklarım atılır
  const atilacak = [0, 1, 2, 3, 4].filter(i => !ui.secili.has(i));
  if (!atilacak.length) return;
  Masa.yenidenAt(ui.benimNo, atilacak);
});

// Puan kâğıdım: boş kutularda bu zarlarla kaç puan alacağım yazar, dokununca seçilir
// Her kutu ne ister (oyunu bilmeyenler için kısa açıklama)
const KUTU_IPUCU = {
  birler: "1'lerin toplamı", ikiler: "2'lerin toplamı", ucler: "3'lerin toplamı", dortler: "4'lerin toplamı", besler: "5'lerin toplamı", altilar: "6'ların toplamı",
  cift: '2 aynı zar', ikiCift: '2 ayrı çift', uclu: '3 aynı zar', dortlu: '4 aynı zar', kucukKent: '1-2-3-4-5 sıralı = 15', buyukKent: '2-3-4-5-6 sıralı = 20',
  full: '3 aynı + 2 aynı', sans: '5 zarın toplamı', yatzy: '5 zar aynı = 50',
};
// Bu kutunun puanına hangi zarlar sayılıyor (sarı çerçeveyle gösterilir)
function sayilanZarlar(kutu, z) {
  if (!Motor.puan(kutu, z)) return [];
  const ust = Motor.KUTULAR[kutu]?.ust;
  const hepsi = [0, 1, 2, 3, 4];
  if (ust) return hepsi.filter(i => z[i] === ust);
  const say = [0, 0, 0, 0, 0, 0, 0];
  z.forEach(d => say[d]++);
  const sec = (deger, adet) => hepsi.filter(i => z[i] === deger).slice(0, adet);
  const enBuyuk = n => [6, 5, 4, 3, 2, 1].find(v => say[v] >= n);
  if (kutu === 'cift') return sec(enBuyuk(2), 2);
  if (kutu === 'uclu') return sec(enBuyuk(3), 3);
  if (kutu === 'dortlu') return sec(enBuyuk(4), 4);
  if (kutu === 'ikiCift') {
    const [a, b] = [6, 5, 4, 3, 2, 1].filter(v => say[v] >= 2);
    return [...sec(a, 2), ...sec(b, 2)];
  }
  return hepsi;   // kentler, full house, şans, yatzy: beş zar da sayılır
}
const miniZarlar = (z, sayilan) => `<div class="miniZarlar">${z.map((d, i) => `<img src="${zarResmi(d)}" class="${sayilan.includes(i) ? 'sayilir' : 'sayilmaz'}" alt="${d}">`).join('')}</div>`;

function kagidimCiz(karar) {
  const d = ui.durum, ben = d?.oyuncular[ui.benimNo];
  const kap = $('kagidim');
  if (!ben?.canli || d.asama === 'bitti') {
    kap.innerHTML = '';
    return;
  }
  kap.innerHTML = d.kutular.map(k => {
    const dolu = ben.kagit[k] !== null && ben.kagit[k] !== undefined;
    const olasi = !dolu && karar ? Motor.puan(k, ben.zarlar) : null;
    const sinif = dolu ? 'dolu' : karar ? (olasi ? 'olasi' : 'sifir') : 'bos';
    // Boş kutularda: neyi istediği ve puanı hangi zarların getirdiği (sarı çerçeveli olanlar sayılır)
    const aciklama = !dolu && karar ? `<small class="ipucu">${KUTU_IPUCU[k]}</small>${miniZarlar(ben.zarlar, sayilanZarlar(k, ben.zarlar))}` : '';
    return `<button class="kutu ${sinif}${ben.secti === k ? ' yeniSecildi' : ''}" data-kutu="${k}" ${dolu || !karar ? 'disabled' : ''} title="${KUTU_IPUCU[k]}">`
      + `<div class="ust"><span>${kutuAdi(k)}</span><b>${dolu ? ben.kagit[k] : olasi !== null ? olasi : '–'}</b></div>${aciklama}</button>`;
  }).join('') + `<div class="kutu toplamKutu"><div class="ust"><span>Toplam</span><b>${ben.toplam}</b></div></div>`;
  $('kagitIpucu').hidden = !karar;
}
// Fareyle bir kutunun üstüne gelince büyük zarlarda da sayılanlar sarı çerçeveyle gösterilir
$('kagidim').addEventListener('pointerover', e => {
  const b = e.target.closest('button[data-kutu]');
  const ben = ui.durum?.oyuncular[ui.benimNo];
  if (!ben?.zarlar) return;
  const sayilan = b && !b.disabled ? sayilanZarlar(b.dataset.kutu, ben.zarlar) : [];
  document.querySelectorAll('#zarlarim .zarKutu').forEach((z, i) => z.classList.toggle('sayilir', sayilan.includes(i)));
});
$('kagidim').addEventListener('pointerleave', () => document.querySelectorAll('#zarlarim .zarKutu').forEach(z => z.classList.remove('sayilir')));
$('kagidim').addEventListener('click', e => {
  const b = e.target.closest('button[data-kutu]');
  if (!b || b.disabled) return;
  const k = b.dataset.kutu;
  // Sıfır puanlık kutu seçilirse emin misin diye sorma: hızlı oyun; ama uyarı ver
  Masa.kutuSec(ui.benimNo, k);
});

// Herkesin kâğıdı (📋 düğmesi)
function kagitlariCiz() {
  const d = ui.durum;
  if (!d) return;
  const oy = d.oyuncular;
  $('kagitlarTablo').innerHTML = `<tr><th></th>${oy.map(p => `<th class="${p.canli ? '' : 'olu'}">${Karakterler.BILGI[p.karakter].emoji}<br><small>${guvenli(p.no === ui.benimNo ? 'Sen' : p.ad)}</small></th>`).join('')}</tr>`
    + d.kutular.map(k => `<tr><td>${kutuAdi(k)}</td>${oy.map(p => `<td>${p.kagit?.[k] ?? '–'}</td>`).join('')}</tr>`).join('')
    + (d.ayar.bonus && d.ayar.kagit === 'uzun' ? `<tr><td>Bonus (63+)</td>${oy.map(p => `<td>${p.bonus ? '+35' : `${p.ust || 0}/63`}</td>`).join('')}</tr>` : '')
    + `<tr class="toplam"><td>Toplam</td>${oy.map(p => `<td>${p.toplam ?? 0}</td>`).join('')}</tr>`;
}
$('kagitlarBtn').addEventListener('click', () => {
  kagitlariCiz();
  $('kagitlarPaneli').hidden = false;
});
$('kagitlarKapat').addEventListener('click', () => ($('kagitlarPaneli').hidden = true));

function etiketleriKur() {
  const kap = $('etiketler');
  kap.innerHTML = '';
  ui.etiketler = {};
  ui.durum.oyuncular.forEach(p => {
    if (p.no === ui.benimNo) return;
    const el = document.createElement('div');
    el.className = 'etiket';
    el.innerHTML = `<div class="balon"></div><div class="kutu"><div class="ad">${Karakterler.BILGI[p.karakter].emoji} ${guvenli(p.ad)}</div><div class="bilgi"></div></div>`;
    kap.appendChild(el);
    ui.etiketler[p.no] = { el, bilgi: el.querySelector('.bilgi'), balon: el.querySelector('.balon') };
  });
  Sahne.etiketGuncelle = () => {
    for (const no in ui.etiketler) {
      const e = ui.etiketler[no];
      const k = Sahne.ekranKonumu(+no);
      e.el.style.display = k ? '' : 'none';
      if (k) e.el.style.transform = `translate(${k.x}px, ${Math.max(k.y, 118)}px) translate(-50%, -100%)`;
    }
  };
}

function balon(no, yazi, kirmizi, sohbet) {
  if (no === ui.benimNo) {
    mesaj(`Sen: “${yazi}”`, kirmizi ? 'kirmizi' : '', sohbet ? 2500 : 1400);
    return;
  }
  const e = ui.etiketler[no];
  if (!e) return;
  e.balon.textContent = yazi;
  e.balon.className = 'balon goster' + (kirmizi ? ' kirmizi' : '');
  if (ui.durum?.oyuncular[no]?.bot) Sahne.konus(no, Math.min(2, 0.4 + yazi.length * 0.05));
  clearTimeout(e.zaman);
  e.zaman = setTimeout(() => (e.balon.className = 'balon'), sohbet ? 3500 : 2200);
}

const TEPKI_HAREKET = { '😂': 'gul', '😡': 'bagir', '😱': 'zipla', '🤠': 'salla', '👍': 'salla', '🤥': 'dusun' };
function tepkiGoster(no, e) {
  if (!ui.durum || !Object.keys(TEPKI_HAREKET).includes(e)) return;
  if (no === ui.benimNo) {
    mesaj(`Sen: ${e}`, 'iri', 1200);
    return;
  }
  balon(no, e);
  Sahne.tepki(no, TEPKI_HAREKET[e], 1.4);
}

let mesajZamani = null;
function mesaj(yazi, sinif = '', sure = 2000) {
  const m = $('mesaj');
  m.textContent = yazi;
  m.className = 'goster ' + sinif;
  clearTimeout(mesajZamani);
  mesajZamani = setTimeout(() => (m.className = sinif), sure);
}

function sonuGoster(kazanan, istat) {
  const d = ui.durum;
  $('olumPerdesi').hidden = true;
  $('sonEkran').hidden = false;
  $('domatesCubugu').hidden = true;
  $('hedefPaneli').hidden = true;
  if (istat) {
    const oduller = Istatistik.oduller(istat, d.ayar);
    $('oduller').innerHTML = oduller.map(o => `<div class="odul"><span>${o.emoji}</span><div><b>${o.ad}: ${guvenli(o.kim)}</b><small>${o.aciklama}</small></div></div>`).join('');
    const yeni = Istatistik.oyunBitti(istat.find(p => p.no === ui.benimNo), kazanan === ui.benimNo);
    $('yeniRozet').innerHTML = yeni.map(r => `<div class="rozet var"><span>${r.emoji}</span><b>Yeni rozet: ${r.ad}</b><small>${r.aciklama}</small></div>`).join('');
  }
  const misafir = online() && Ag.mod === 'misafir';
  $('tekrarBtn').hidden = misafir;
  $('sonBekle').hidden = !misafir;
  if (kazanan === ui.benimNo) {
    Ses.kazandin();
    $('sonBaslik').textContent = '🏆 Kazandın!';
    $('sonYazi').textContent = 'Masada hayatta kalan bir tek sen oldun!';
  } else {
    const p = d.oyuncular[kazanan];
    $('sonBaslik').textContent = `🏆 ${p ? `${Karakterler.BILGI[p.karakter].emoji} ${p.ad}` : 'Kimse'} kazandı`;
    $('sonYazi').textContent = 'Saloonda hayatta kalan son kişi o oldu.';
  }
}

// Süre çubuğu: atışta karar süresi, hedef seçerken hedef süresi
setInterval(() => {
  const d = ui.durum;
  const c = $('sureCubugu').firstElementChild;
  const ben = d?.oyuncular[ui.benimNo];
  const bende = d && ben?.canli && ((d.asama === 'atis' && !ben.secti) || (d.asama === 'hedef' && d.atici === ui.benimNo));
  if (!bende) { c.style.width = '0'; return; }
  const sure = (d.asama === 'hedef' ? Motor.HEDEF_SURE : Motor.SURE) * 1000;
  const kalan = Math.max(0, Math.min(1, (d.bitis - Date.now()) / sure));
  c.style.width = `${kalan * 100}%`;
  if (kalan < 0.2 && Math.round(Date.now() / 250) % 4 === 0) Ses.tikTak();
}, 250);

// ---------- Düğmeler ----------
$('menuBtn').addEventListener('click', () => {
  const soru = online() ? (Ag.mod === 'ev' ? 'Odayı kapatıp ana menüye dönülsün mü? (Arkadaşlarının oyunu da biter)' : 'Odadan çıkılsın mı? (Yerine bot oynar, aynı adla geri girebilirsin)') : 'Oyundan çıkıp ana menüye dönülsün mü?';
  if ((!Motor.aktif && !online()) || confirm(soru)) menuyeDon();
});
$('olumMenuBtn').addEventListener('click', () => (online() ? ($('olumPerdesi').hidden = true) : menuyeDon()));
$('sonMenuBtn').addEventListener('click', menuyeDon);
$('tekrarBtn').addEventListener('click', () => {
  if (online()) Ag.oyunuBaslat();
  else {
    Motor.yeni(ui.son, olayGeldi, ui.sonAyar);
    oyunEkraniniKur(Motor.gorunum(0), 0);
  }
});
document.querySelectorAll('#tepkiler button').forEach(b => b.addEventListener('click', () => {
  Ses.sec();
  Ag.tepkiGonder(b.textContent);
}));
$('domatesCubugu').addEventListener('click', e => {
  const b = e.target.closest('button[data-no]');
  if (b) domatesFirlat(+b.dataset.no);
});
function sesDugmesi() {
  $('sesBtn').textContent = Ses.acik ? '🔊' : '🔇';
  $('muzikBtn').classList.toggle('kapali', !Ses.muzikAcik);
}
$('sesBtn').addEventListener('click', () => { Ses.ac(!Ses.acik); sesDugmesi(); });
$('muzikBtn').addEventListener('click', () => { Ses.muzikAc(!Ses.muzikAcik); sesDugmesi(); });
sesDugmesi();

Sahne.baslat($('sahne'));
menuKur();
