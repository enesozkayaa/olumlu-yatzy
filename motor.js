// =============================================================
// Ölümlü Yatzy - oyun motoru: eş zamanlı atışlar, Yatzy kâğıdı, tabanca, istatistikler, botlar
// Ekrandan bağımsızdır (online oyunda oda sahibinin cihazında çalışır).
//
// Kurallar:
//   - Her atışta yaşayan herkes AYNI ANDA 5 zar atar. İstediği zarları seçip 1 kez yeniden atabilir.
//   - Sonra kendi kâğıdında boş bir kutu seçer, o kutunun puanı yazılır (uymuyorsa 0).
//   - Herkes seçince sıradaki atışa geçilir. Süre biterse seçmeyene en iyi kutu yazılır.
//   - Kâğıtlar dolunca (el sonu) en yüksek puanlı tabancayı alır (eşitlikte zar atılır) ve
//     yaşayan birine doğrultur. Tabancada 1 mermi var: patlarsa hedef ölür.
//   - Hazne sayısı yaşayanlara göre: 4 kişi 6, 3 kişi 4, 2 kişi 2. Biri ölünce tabanca yeniden doldurulur.
//   - Patlamazsa herkes yeni boş kâğıtla devam eder. En son hayatta kalan kazanır.
// Puanlar (Yatzy): Birler..Altılar o sayının toplamı; Çift, İki Çift, Üçlü, Dörtlü, Full House, Şans zarların
//   toplamı; Küçük Kent (1-5) 15, Büyük Kent (2-6) 20, Yatzy 50. Üst bölüm 63+ ise (ayar açıksa) +35.
// =============================================================

const Motor = (() => {
  const KUTULAR = {
    birler: { ad: 'Birler', ust: 1 }, ikiler: { ad: 'İkiler', ust: 2 }, ucler: { ad: 'Üçler', ust: 3 },
    dortler: { ad: 'Dörtler', ust: 4 }, besler: { ad: 'Beşler', ust: 5 }, altilar: { ad: 'Altılar', ust: 6 },
    cift: { ad: 'Çift' }, ikiCift: { ad: 'İki Çift' }, uclu: { ad: 'Üçlü' }, dortlu: { ad: 'Dörtlü' },
    kucukKent: { ad: 'Küçük Kent' }, buyukKent: { ad: 'Büyük Kent' }, full: { ad: 'Full House' },
    sans: { ad: 'Şans' }, yatzy: { ad: 'YATZY' },
  };
  const KAGITLAR = {
    kisa: { ad: 'Kısa', kutular: ['cift', 'uclu', 'full', 'kucukKent', 'buyukKent', 'yatzy'] },
    orta: { ad: 'Orta', kutular: ['cift', 'ikiCift', 'uclu', 'dortlu', 'kucukKent', 'buyukKent', 'full', 'sans', 'yatzy'] },
    uzun: { ad: 'Uzun', kutular: ['birler', 'ikiler', 'ucler', 'dortler', 'besler', 'altilar', 'cift', 'ikiCift', 'uclu', 'dortlu', 'kucukKent', 'buyukKent', 'full', 'sans', 'yatzy'] },
  };
  const SURE = 30;               // atış başına karar süresi (sn)
  const HEDEF_SURE = 20;         // ateş edenin hedef seçme süresi
  const HAZNE = { 4: 6, 3: 4, 2: 2 };
  const BEKLE = { atis: 1500, sonraki: 1300, elSonu: 3200, beraberlik: 2600, tetikHazir: 1600, tetik: 2600, sonra: 2600, el: 1500 };

  let o = null;
  let dinleyici = () => {};
  let zamanlayici = null, sayacZamani = null;
  const botZamanlari = [];

  const rastgele = n => Math.floor(Math.random() * n);
  const zarAt = () => 1 + rastgele(6);
  const canlilar = () => o.oyuncular.filter(p => p.canli);
  const olay = (tip, veri = {}) => {
    try {
      dinleyici(tip, veri);
    } catch (e) {
      console.error('Olay işlenirken hata:', tip, e);   // ekran hatası oyunu durdurmasın
    }
  };

  // ---------- Puan hesabı ----------
  function puan(kutu, z) {
    const say = [0, 0, 0, 0, 0, 0, 0];
    z.forEach(d => say[d]++);
    const toplam = z.reduce((a, b) => a + b, 0);
    const k = KUTULAR[kutu];
    if (k?.ust) return say[k.ust] * k.ust;
    const cokluk = n => { for (let v = 6; v >= 1; v--) if (say[v] >= n) return v; return 0; };
    switch (kutu) {
      case 'cift': return cokluk(2) * 2;
      case 'ikiCift': {
        const ciftler = [6, 5, 4, 3, 2, 1].filter(v => say[v] >= 2);
        return ciftler.length >= 2 ? (ciftler[0] + ciftler[1]) * 2 : 0;
      }
      case 'uclu': return cokluk(3) * 3;
      case 'dortlu': return cokluk(4) * 4;
      case 'kucukKent': return [1, 2, 3, 4, 5].every(v => say[v] === 1) ? 15 : 0;
      case 'buyukKent': return [2, 3, 4, 5, 6].every(v => say[v] === 1) ? 20 : 0;
      case 'full': return say.includes(3) && say.includes(2) ? toplam : 0;
      case 'sans': return toplam;
      case 'yatzy': return say.includes(5) ? 50 : 0;
    }
    return 0;
  }
  function toplamPuan(p) {
    let t = 0, ust = 0;
    Object.entries(p.kagit).forEach(([k, v]) => {
      if (v === null) return;
      t += v;
      if (KUTULAR[k].ust) ust += v;
    });
    const bonus = o.ayar.bonus && o.ayar.kagit === 'uzun' && ust >= 63 ? 35 : 0;
    return { toplam: t + bonus, ust, bonus };
  }
  const bosKutular = p => Object.keys(p.kagit).filter(k => p.kagit[k] === null);

  // ---------- Kurulum ----------
  // ayar: { kagit: 'kisa'|'orta'|'uzun', bonus }
  function yeni(oyuncular, dinle, ayar = {}) {
    temizle();
    dinleyici = dinle || (() => {});
    o = {
      oyuncular: oyuncular.map((p, no) => ({
        no, ad: p.ad, karakter: p.karakter, kiyafet: p.kiyafet || null, bot: !!p.bot,
        zarlar: [], kagit: {}, canli: true, yenidenAtti: false, secti: null,
        istat: { yatzy: 0, enIyiEl: 0, elKazandi: 0, ates: 0, vurdu: 0, kurtuldu: 0, hedefOldu: 0, sifir: 0, olumSirasi: 0 },
      })),
      ayar: { kagit: KAGITLAR[ayar.kagit] ? ayar.kagit : 'orta', bonus: !!ayar.bonus },
      elNo: 0, atisNo: 0, asama: 'el', bitis: 0, atici: null, hedef: null, olenSayisi: 0,
      hazne: HAZNE[Math.min(4, oyuncular.length)] || 6, mermi: 0, cekilen: 0, kazanan: null, sonuc: null,
    };
    o.mermi = rastgele(o.hazne);
    setTimeout(elBasla, 400);
    return o;
  }

  function temizle() {
    clearTimeout(zamanlayici);
    clearInterval(sayacZamani);
    botZamanlari.splice(0).forEach(clearTimeout);
    zamanlayici = sayacZamani = null;
  }

  // Yeni el: herkese boş kâğıt
  function elBasla() {
    o.elNo++;
    o.atisNo = 0;
    o.atici = o.hedef = o.sonuc = null;
    const kutular = KAGITLAR[o.ayar.kagit].kutular;
    o.oyuncular.forEach(p => {
      p.kagit = {};
      kutular.forEach(k => (p.kagit[k] = null));
    });
    olay('el', { elNo: o.elNo, kutuSayisi: kutular.length, hazne: o.hazne, cekilen: o.cekilen });
    zamanlayici = setTimeout(atisBasla, BEKLE.el);
  }

  // Yeni atış: yaşayan herkes aynı anda zar atar
  function atisBasla() {
    o.atisNo++;
    o.asama = 'atis';
    canlilar().forEach(p => {
      p.zarlar = [...Array(5)].map(zarAt);
      p.yenidenAtti = false;
      p.secti = null;
    });
    o.bitis = Date.now() + SURE * 1000 + BEKLE.atis;
    olay('atis', { atisNo: o.atisNo, toplamAtis: KAGITLAR[o.ayar.kagit].kutular.length });
    // Botlar düşünür
    canlilar().filter(p => p.bot).forEach(p => botZamanlari.push(setTimeout(() => botOyna(p), BEKLE.atis + 1200 + Math.random() * 3500)));
    // Süre dolunca seçmeyenlere en iyi kutu
    clearInterval(sayacZamani);
    sayacZamani = setInterval(() => {
      if (o.asama !== 'atis' || Date.now() < o.bitis) return;
      clearInterval(sayacZamani);
      canlilar().filter(p => !p.secti).forEach(p => kutuSec(p.no, enIyiKutu(p, true)));
    }, 250);
  }

  // ---------- Hamleler ----------
  function yenidenAt(no, indeksler) {
    const p = o?.oyuncular[no];
    if (!p || o.asama !== 'atis' || !p.canli || p.secti || p.yenidenAtti) return false;
    const ids = [...new Set(indeksler)].filter(i => Number.isInteger(i) && i >= 0 && i < 5);
    if (!ids.length) return false;
    ids.forEach(i => (p.zarlar[i] = zarAt()));
    p.yenidenAtti = true;
    olay('yenidenAtti', { no, indeksler: ids });
    return true;
  }

  function kutuSec(no, kutu) {
    const p = o?.oyuncular[no];
    if (!p || o.asama !== 'atis' || !p.canli || p.secti || !(kutu in p.kagit) || p.kagit[kutu] !== null) return false;
    const deger = puan(kutu, p.zarlar);
    p.kagit[kutu] = deger;
    p.secti = kutu;
    if (kutu === 'yatzy' && deger) p.istat.yatzy++;
    if (!deger) p.istat.sifir++;
    olay('secti', { no, kutu, puan: deger, zarlar: [...p.zarlar], r: Math.random() });
    if (canlilar().every(x => x.secti)) {
      clearInterval(sayacZamani);
      const doldu = canlilar().every(x => !bosKutular(x).length);
      zamanlayici = setTimeout(doldu ? elSonu : atisBasla, BEKLE.sonraki);
    }
    return true;
  }

  // Kâğıtlar doldu: en yüksek puanlı ateş eder
  function elSonu() {
    o.asama = 'elSonu';
    const puanlar = canlilar().map(p => ({ no: p.no, ...toplamPuan(p) }));
    const enYuksek = Math.max(...puanlar.map(x => x.toplam));
    let adaylar = puanlar.filter(x => x.toplam === enYuksek).map(x => x.no);
    puanlar.forEach(x => (o.oyuncular[x.no].istat.enIyiEl = Math.max(o.oyuncular[x.no].istat.enIyiEl, x.toplam)));
    let beraberlik = null;
    // Eşitlik: eşit olanlar zar atar, büyük atan ateş eder (yine eşitse tekrar)
    if (adaylar.length > 1) {
      beraberlik = [];
      while (adaylar.length > 1) {
        const atislar = adaylar.map(no => ({ no, zar: zarAt() }));
        beraberlik.push(atislar);
        const max = Math.max(...atislar.map(a => a.zar));
        adaylar = atislar.filter(a => a.zar === max).map(a => a.no);
      }
    }
    o.atici = adaylar[0];
    o.oyuncular[o.atici].istat.elKazandi++;
    o.sonuc = { puanlar, atici: o.atici, beraberlik };
    olay('elSonu', { puanlar, atici: o.atici, beraberlik });
    zamanlayici = setTimeout(hedefBekle, BEKLE.elSonu + (beraberlik ? BEKLE.beraberlik : 0));
  }

  function hedefBekle() {
    o.asama = 'hedef';
    const p = o.oyuncular[o.atici];
    o.bitis = Date.now() + HEDEF_SURE * 1000;
    olay('hedefSec', { no: p.no, bitis: o.bitis });
    if (p.bot) botZamanlari.push(setTimeout(() => hedefSec(p.no, botHedef(p)), 2000 + Math.random() * 1500));
    else {
      clearInterval(sayacZamani);
      sayacZamani = setInterval(() => {
        if (o.asama !== 'hedef' || Date.now() < o.bitis) return;
        clearInterval(sayacZamani);
        hedefSec(p.no, botHedef(p));
      }, 250);
    }
  }

  function hedefSec(no, hedef) {
    if (!o || o.asama !== 'hedef' || o.atici !== no || hedef === no || !o.oyuncular[hedef]?.canli) return false;
    clearInterval(sayacZamani);
    o.asama = 'tetik';
    o.hedef = hedef;
    olay('tetikHazir', { no, hedef, hazne: o.hazne, cekilen: o.cekilen, ihtimal: 1 / (o.hazne - o.cekilen) });
    zamanlayici = setTimeout(tetikCek, BEKLE.tetikHazir + BEKLE.tetik);
    return true;
  }

  function tetikCek() {
    const atici = o.oyuncular[o.atici], hedef = o.oyuncular[o.hedef];
    const oldu = o.cekilen === o.mermi;
    o.cekilen++;
    atici.istat.ates++;
    if (oldu) {
      hedef.canli = false;
      hedef.zarlar = [];
      hedef.istat.olumSirasi = ++o.olenSayisi;
      atici.istat.vurdu++;
    } else hedef.istat.kurtuldu++;
    hedef.istat.hedefOldu++;
    olay('tetik', { no: atici.no, hedef: hedef.no, oldu, cekilen: o.cekilen, hazne: o.hazne, r: Math.random() });
    zamanlayici = setTimeout(() => {
      const kalan = canlilar();
      if (kalan.length <= 1) {
        o.asama = 'bitti';
        o.kazanan = kalan[0]?.no ?? -1;
        olay('bitti', { kazanan: o.kazanan, istat: o.oyuncular.map(x => ({ no: x.no, ad: x.ad, karakter: x.karakter, ...x.istat })) });
        return;
      }
      // Biri öldüyse tabanca daha az hazneyle yeniden doldurulur
      if (oldu) {
        o.hazne = HAZNE[kalan.length] || 2;
        o.mermi = rastgele(o.hazne);
        o.cekilen = 0;
        olay('yenidenDoldu', { hazne: o.hazne });
      }
      o.asama = 'el';
      zamanlayici = setTimeout(elBasla, BEKLE.el);
    }, BEKLE.sonra + (oldu ? 600 : 0));
  }

  // ---------- Botlar ----------
  // Her kutunun "normalde" beklenen puanı: düşük çıkan kutuyu boşa harcamamak için
  const BEKLENEN = { birler: 2, ikiler: 5, ucler: 8, dortler: 11, besler: 13, altilar: 16, cift: 9, ikiCift: 15, uclu: 11, dortlu: 7, kucukKent: 4, buyukKent: 4, full: 10, sans: 21, yatzy: 4 };
  function enIyiKutu(p, zorunlu) {
    let en = null, enDeger = -Infinity;
    bosKutular(p).forEach(k => {
      const pu = puan(k, p.zarlar);
      // Puan + kutunun değerine göre: boş kalırsa az kaybettiren kutuyu yakar
      const deger = zorunlu ? pu - BEKLENEN[k] * 0.3 : pu - BEKLENEN[k] * 0.7 + (k === 'yatzy' && pu ? 40 : 0);
      if (deger > enDeger) { enDeger = deger; en = k; }
    });
    return en;
  }
  // Hangi zarları yeniden atsın: en çok olan sayıyı tutar; kent ihtimali varsa sıralıları tutar
  function botYenidenAt(p) {
    const z = p.zarlar;
    const say = [0, 0, 0, 0, 0, 0, 0];
    z.forEach(d => say[d]++);
    const bos = bosKutular(p);
    // Zaten iyi bir el varsa (yatzy, kent, full, dörtlü) atmaz
    if (bos.some(k => ['yatzy', 'buyukKent', 'kucukKent', 'full', 'dortlu'].includes(k) && puan(k, z) > 0)) return null;
    const kentVar = bos.includes('kucukKent') || bos.includes('buyukKent');
    const farkli = say.filter(n => n > 0).length;
    if (kentVar && farkli >= 4) {
      // Tekrarlananlardan birini at
      const goruldu = new Set();
      return z.map((d, i) => (goruldu.has(d) ? i : (goruldu.add(d), -1))).filter(i => i >= 0);
    }
    let en = 6, enN = 0;
    for (let v = 6; v >= 1; v--) if (say[v] > enN) { enN = say[v]; en = v; }
    const at = z.map((d, i) => (d === en ? -1 : i)).filter(i => i >= 0);
    return at.length ? at : null;
  }
  function botOyna(p) {
    if (o.asama !== 'atis' || !p.canli || p.secti) return;
    const at = botYenidenAt(p);
    if (at && yenidenAt(p.no, at)) {
      botZamanlari.push(setTimeout(() => kutuSec(p.no, enIyiKutu(p)), 1500 + Math.random() * 2000));
      return;
    }
    kutuSec(p.no, enIyiKutu(p));
  }
  // Bot kime ateş eder: çoğunlukla en yüksek puanlı rakibe (en tehlikelisi), bazen rastgele
  function botHedef(p) {
    const rakip = canlilar().filter(x => x.no !== p.no);
    if (Math.random() < 0.3) return rakip[rastgele(rakip.length)].no;
    const puanlar = o.sonuc?.puanlar || [];
    rakip.sort((a, b) => (puanlar.find(x => x.no === b.no)?.toplam || 0) - (puanlar.find(x => x.no === a.no)?.toplam || 0));
    return rakip[0].no;
  }

  // ---------- Dışarıya gösterilen hâl (Yatzy'de gizli bilgi yok: herkes her şeyi görür) ----------
  function gorunum() {
    if (!o) return null;
    return {
      elNo: o.elNo, atisNo: o.atisNo, asama: o.asama, bitis: o.bitis, ayar: o.ayar,
      kutular: KAGITLAR[o.ayar.kagit].kutular, hazne: o.hazne, cekilen: o.cekilen,
      atici: o.atici, hedef: o.hedef, kazanan: o.kazanan, sonuc: o.sonuc,
      oyuncular: o.oyuncular.map(p => ({
        no: p.no, ad: p.ad, karakter: p.karakter, kiyafet: p.kiyafet, bot: p.bot, yedekBot: !!p.yedekBot, canli: p.canli,
        zarlar: p.zarlar, kagit: p.kagit, yenidenAtti: p.yenidenAtti, secti: p.secti, ...(o ? toplamPuan(p) : {}),
      })),
    };
  }

  function botYap(no, evet) {
    const p = o?.oyuncular[no];
    if (!p || p.bot === evet) return;
    p.bot = evet;
    p.yedekBot = evet;
    if (evet) {
      if (o.asama === 'atis' && p.canli && !p.secti) botZamanlari.push(setTimeout(() => botOyna(p), 1200));
      if (o.asama === 'hedef' && o.atici === no) botZamanlari.push(setTimeout(() => hedefSec(no, botHedef(p)), 1500));
    }
  }

  return {
    yeni, temizle, yenidenAt, kutuSec, hedefSec, gorunum, botYap, puan, KUTULAR, KAGITLAR, SURE, HEDEF_SURE,
    get aktif() { return !!o && o.asama !== 'bitti'; },
  };
})();
