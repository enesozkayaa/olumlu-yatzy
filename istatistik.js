// =============================================================
// Ölümlü Yatzy - istatistikler ve rozetler
// Oyun sonunda masadakilere ödüller dağıtılır (En şanslı, Yalan makinesi, Keskin göz...).
// Bu cihazdaki oyuncunun toplam istatistikleri saklanır; belli hedeflere ulaşınca rozet kazanılır.
// =============================================================

const Istatistik = (() => {
  const ANAHTAR = 'olumluYatzy.istatistik';
  const ROZETLER = [
    { id: 'ilkZafer', emoji: '🏆', ad: 'İlk Zafer', aciklama: 'Bir oyun kazan', sart: (t) => t.galibiyet >= 1 },
    { id: 'kral', emoji: '👑', ad: 'Saloon Kralı', aciklama: '10 oyun kazan', sart: (t) => t.galibiyet >= 10 },
    { id: 'emektar', emoji: '🤠', ad: 'Emektar Kovboy', aciklama: '25 oyun oyna', sart: (t) => t.oyun >= 25 },
    { id: 'yatzyci', emoji: '🎲', ad: 'Yatzy!', aciklama: 'Bir YATZY yap', sart: (t) => t.yatzy >= 1 },
    { id: 'kedi', emoji: '🐈', ad: 'Dokuz Canlı', aciklama: 'Bir oyunda 3 kez namlunun ucundan dön', sart: (t, o) => o && o.kurtuldu >= 3 },
    { id: 'tetikci', emoji: '🔫', ad: 'Tetikçi', aciklama: 'Toplam 10 kişiyi vur', sart: (t) => t.vurdu >= 10 },
    { id: 'rekor', emoji: '📈', ad: 'Rekortmen', aciklama: 'Bir elde 200+ puan yap', sart: (t, o) => o && o.enIyiEl >= 200 },
    { id: 'domatesci', emoji: '🍅', ad: 'Domatesçi', aciklama: 'Toplam 30 domates fırlat', sart: (t) => t.domates >= 30 },
    { id: 'yatzyKrali', emoji: '👑', ad: 'Yatzy Kralı', aciklama: 'Toplam 10 YATZY yap', sart: (t) => t.yatzy >= 10 },
    { id: 'ilkOlen', emoji: '💀', ad: 'Talihsiz', aciklama: 'Masada mumu ilk sönen ol', sart: (t, o) => o && o.olumSirasi === 1 },
  ];
  const ALANLAR = ['oyun', 'galibiyet', 'yatzy', 'elKazandi', 'ates', 'vurdu', 'kurtuldu', 'hedefOldu', 'sifir', 'domates', 'enIyiEl'];

  function oku() {
    let t = null;
    try { t = JSON.parse(localStorage.getItem(ANAHTAR)); } catch (e) { /* yok */ }
    t = t && typeof t === 'object' ? t : {};
    ALANLAR.forEach(a => (t[a] = +t[a] || 0));
    t.rozetler = Array.isArray(t.rozetler) ? t.rozetler : [];
    return t;
  }
  function yaz(t) {
    try { localStorage.setItem(ANAHTAR, JSON.stringify(t)); } catch (e) { /* yok */ }
  }

  // Oyun bitti: benim istatistiklerimi topla, yeni kazanılan rozetleri döndür
  function oyunBitti(benim, kazandi) {
    const t = oku();
    t.oyun++;
    if (kazandi) t.galibiyet++;
    ['yatzy', 'elKazandi', 'ates', 'vurdu', 'kurtuldu', 'hedefOldu', 'sifir'].forEach(a => (t[a] += +benim?.[a] || 0));
    t.enIyiEl = Math.max(t.enIyiEl, +benim?.enIyiEl || 0);
    const yeni = ROZETLER.filter(r => !t.rozetler.includes(r.id) && r.sart(t, benim, kazandi));
    yeni.forEach(r => t.rozetler.push(r.id));
    yaz(t);
    return yeni;
  }
  function domatesAtildi() {
    const t = oku();
    t.domates++;
    const yeni = ROZETLER.filter(r => !t.rozetler.includes(r.id) && r.sart(t));
    yeni.forEach(r => t.rozetler.push(r.id));
    yaz(t);
    return yeni;
  }

  // Oyun sonu ödülleri: masadaki herkes arasından
  function oduller(istat) {
    const liste = [];
    const enCok = (alan, emoji, ad, aciklama) => {
      const max = Math.max(...istat.map(p => p[alan] || 0));
      if (max <= 0) return;
      const kim = istat.filter(p => (p[alan] || 0) === max);
      liste.push({ emoji, ad, kim: kim.map(p => p.ad).join(', '), aciklama: aciklama(max) });
    };
    enCok('enIyiEl', '📈', 'En yüksek el', n => `Bir elde ${n} puan yaptı`);
    enCok('yatzy', '🎲', 'Yatzy ustası', n => `${n} kez YATZY yaptı`);
    enCok('elKazandi', '🏅', 'Tabancanın sahibi', n => `${n} eli birinci bitirdi`);
    enCok('vurdu', '🔫', 'Tetikçi', n => `${n} kişiyi vurdu`);
    enCok('kurtuldu', '🍀', 'En şanslı', n => `${n} kez namlunun ucundan döndü`);
    const ilk = istat.find(p => p.olumSirasi === 1);
    if (ilk) liste.push({ emoji: '💀', ad: 'En şanssız', kim: ilk.ad, aciklama: 'Mumu ilk sönen' });
    enCok('sifir', '🙈', 'Kutu yakan', n => `${n} kutuya 0 yazdı`);
    return liste;
  }

    function paneliCiz() {
    const t = oku();
    const oran = t.oyun ? Math.round((t.galibiyet / t.oyun) * 100) : 0;
    const kutu = (deger, ad) => `<div class="istKutu"><b>${deger}</b><small>${ad}</small></div>`;
    $('istatistikIcerik').innerHTML = `<div class="istIzgara">${kutu(t.oyun, 'Oyun')}${kutu(t.galibiyet, 'Galibiyet')}${kutu('%' + oran, 'Kazanma')}`
      + `${kutu(t.yatzy, 'Yatzy')}${kutu(t.enIyiEl, 'En iyi el')}${kutu(t.elKazandi, 'Kazanılan el')}`
      + `${kutu(t.vurdu + '/' + t.ates, 'Vurulan / ateş')}${kutu(t.kurtuldu + '/' + t.hedefOldu, 'Kurtulduğun / hedef')}${kutu(t.sifir, 'Yakılan kutu')}`
      + `${kutu(t.domates, 'Domates')}</div>`
      + `<h3>Rozetler (${t.rozetler.length}/${ROZETLER.length})</h3><div class="rozetler">`
      + ROZETLER.map(r => `<div class="rozet${t.rozetler.includes(r.id) ? ' var' : ''}"><span>${r.emoji}</span><b>${r.ad}</b><small>${r.aciklama}</small></div>`).join('')
      + '</div>';
  }
  $('istatistikBtn').addEventListener('click', () => {
    paneliCiz();
    $('istatistikPaneli').hidden = false;
  });
  $('istatistikKapat').addEventListener('click', () => ($('istatistikPaneli').hidden = true));

  return { oyunBitti, domatesAtildi, oduller };
})();
