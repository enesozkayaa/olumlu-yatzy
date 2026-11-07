// =============================================================
// Ölümlü Yatzy - online oda (arkadaşlarla, 2-4 kişi; boş koltuklarda bot oturur)
// Bağlantı PeerJS ile cihazlar arasında doğrudan kurulur (kendi sunucumuz yok).
// Odayı açan ("ev") oyunu yönetir: motor onda çalışır, botlar onda oynar. Katılanlar ("misafir")
// hamlelerini eve yollar; ev her olayda herkese kendi gördüğü durumu yollar (başkalarının kartları gizli).
//
// Oyundan düşenin yerine bot oynar. Aynı kişi geri gelince (aynı cihaz ya da aynı adla) bot bırakır,
// oyuncu kaldığı yerden devam eder. Sayfa yenilenince aynı odaya kendiliğinden geri girilir.
//
// Mesajlar:
//   misafir → ev: { tip: 'katil', ad, kimlik, karakter, surum }  { tip: 'eylem', ad, args }  { tip: 'sohbet', metin }
//                 { tip: 'bakis', y, p }  { tip: 'tepki', e }  { tip: 'karakter', tur }  { tip: 'yer', hedef }
//                 { tip: 'ses', acik }  { tip: 'domates', hedef }  { tip: 'nabiz' }
//   ev → misafir (ek): { tip: 'domates', no, hedef }   lobi mesajında oda sahibinin oyun ayarı (özel kartlar) da gider
//   ev → misafir: { tip: 'kabul', no, surum }  { tip: 'lobi', koltuklar }  { tip: 'red', neden }
//                 { tip: 'basla', d }  { tip: 'olay', t, v, d }  { tip: 'sohbet', no, ad, metin }
//                 { tip: 'bakis', no, y, p }  { tip: 'tepki', no, e }  { tip: 'sesListesi', liste }  { tip: 'nabiz' }
//   Ses PeerJS sesli aramasıyla oyuncular arasında doğrudan gider; gelen sesin yüksekliği
//   o oyuncunun karakterinin ağzını oynatır.
// =============================================================

const Uzak = {
  yenidenAt: (no, indeksler) => Ag.eylem('yenidenAt', [indeksler]),
  kutuSec: (no, kutu) => Ag.eylem('kutu', [kutu]),
  hedefSec: (no, hedef) => Ag.eylem('hedef', [hedef]),
};

const Ag = (() => {
  // Online kısmı her değiştiğinde 1 artır: eski sürümle gelen oyuncu odaya alınmaz
  const SURUM = 1;
  const ODA_ONEKI = 'olumlu-yatzy-oda-';
  const KOD_HARFLERI = 'ABCDEFGHJKLMNPRSTUVYZ23456789';
  const KOD_UZUNLUK = 5;
  const NABIZ_ARALIGI = 3000;
  const NABIZ_ZAMAN_ASIMI = 15000;
  const OTOMATIK_KATIL = 'olumluYatzy.otomatikKatil';
  const SON_ODA = 'olumluYatzy.sonOda';
  const KIMLIK = 'olumluYatzy.kimlik';
  const RENKLER = ['#f2c14e', '#5aa9e6', '#e4572e', '#76b041'];

  const ag = {
    mod: 'yerel', peer: null, baglanti: null,
    koltuklar: [null, null, null, null],   // evde: { ad, kimlik, karakter, misafir, ses }
    basladi: false, kod: '', sonMesaj: 0, nabiz: null, okunmamis: 0,
  };

  let kimlik = '';
  try {
    kimlik = localStorage.getItem(KIMLIK) || '';
    if (!kimlik) localStorage.setItem(KIMLIK, (kimlik = Math.random().toString(36).slice(2, 12)));
  } catch (e) {
    kimlik = Math.random().toString(36).slice(2, 12);
  }

  const durumYaz = html => ($('onlineDurum').innerHTML = html);
  const kayit = (ad, deger) => {
    try {
      if (deger === null) localStorage.removeItem(ad);
      else localStorage.setItem(ad, JSON.stringify(deger));
    } catch (e) { /* hatırlanmasa da olur */ }
  };

  function adiAl() {
    const ad = $('adim').value.trim().slice(0, 12);
    if (!ad) {
      $('adim').classList.add('eksik');
      $('adim').placeholder = 'Önce adını yaz 👈';
      $('adim').focus();
      return null;
    }
    $('adim').classList.remove('eksik');
    kayitYaz(ANAHTAR_AD, ad);
    return ad;
  }

  function peerVarMi() {
    if (typeof Peer !== 'undefined') return true;
    durumYaz('❌ Online bağlantı kütüphanesi yüklenemedi. İnternet bağlantını kontrol et.');
    return false;
  }

  function kilitle(evet = true) {
    ['odaKurBtn', 'katilBtn', 'odaKoduGir', 'botlaBtn', 'adim', 'geriDonBtn'].forEach(id => $(id) && ($(id).disabled = evet));
    $('odaIptalBtn').hidden = !evet;
    $('odaIptalBtn').textContent = ag.mod === 'ev' || $('odaKurBtn').dataset.kuruluyor ? '❌ Odayı kapat' : '↩️ Vazgeç, odadan çık';
  }

  function odaKodunuGoster() {
    $('odaBilgisi').innerHTML = `🔑 Oda <b>${ag.kod}</b>`;
    $('odaBilgisi').hidden = false;
    $('sohbetBtn').hidden = false;
    $('sesliBtn').hidden = false;
  }

  function sunucuyaYenidenBaglan(peer) {
    peer.on('disconnected', () => {
      setTimeout(() => {
        if (peer.destroyed || !peer.disconnected) return;
        try { peer.reconnect(); } catch (e) { /* tekrar denenir */ }
      }, 2000);
    });
  }

  const misafirler = () => ag.koltuklar.map((k, no) => ({ k, no })).filter(x => x.k?.misafir);
  const gonder = (m, mesaj) => m?.baglanti.open && m.baglanti.send(mesaj);
  const herkese = (mesaj, haric = -1) => misafirler().forEach(({ k, no }) => no !== haric && gonder(k.misafir, mesaj));

  function nabziBaslat() {
    ag.sonMesaj = Date.now();
    clearInterval(ag.nabiz);
    ag.nabiz = setInterval(() => {
      if (ag.mod === 'ev') {
        misafirler().forEach(({ k, no }) => {
          gonder(k.misafir, { tip: 'nabiz' });
          if (Date.now() - k.misafir.sonMesaj > NABIZ_ZAMAN_ASIMI) {
            k.misafir.baglanti.close();
            koptu(no);
          }
        });
      } else if (ag.baglanti) {
        if (ag.baglanti.open) ag.baglanti.send({ tip: 'nabiz' });
        if (Date.now() - ag.sonMesaj > NABIZ_ZAMAN_ASIMI) evdenKoptu();
      }
    }, NABIZ_ARALIGI);
  }

  // ---------- Ev: oda kurma ----------
  function odaKur() {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.hazirla();
    const kod = [...Array(KOD_UZUNLUK)].map(() => KOD_HARFLERI[Math.floor(Math.random() * KOD_HARFLERI.length)]).join('');
    durumYaz('⏳ Oda açılıyor...');
    oturumuUnut();
    $('odaKurBtn').dataset.kuruluyor = '1';
    kilitle();
    try { ag.peer?.destroy(); } catch (e) { /* zaten kapalı */ }
    const peer = new Peer(ODA_ONEKI + kod);
    ag.peer = peer;
    peer.on('open', () => {
      if (ag.mod === 'ev') return;
      ag.mod = 'ev';
      ag.kod = kod;
      ag.koltuklar = [{ ad, kimlik, karakter: ui.karakter, kiyafet: Giydir.kiyafet(ui.karakter), misafir: null }, null, null, null];
      ui.benimNo = 0;
      kilitle();
      odaKodunuGoster();
      nabziBaslat();
      lobiyiCiz();
    });
    sunucuyaYenidenBaglan(peer);
    peer.on('call', gelenArama);
    peer.on('connection', baglanti => {
      const misafir = { baglanti, sonMesaj: Date.now(), no: null };
      baglanti.on('data', m => {
        misafir.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') evMesaji(misafir, m);
      });
      const kapandi = () => {
        if (misafir.no !== null && ag.koltuklar[misafir.no]?.misafir === misafir) koptu(misafir.no);
      };
      baglanti.on('close', kapandi);
      baglanti.on('error', kapandi);
    });
    peer.on('error', e => {
      if (e.type === 'unavailable-id') odaKur();
      else if (ag.mod !== 'ev') {
        kilitle(false);
        durumYaz(`❌ Oda açılamadı (${e.type}). İnternet bağlantını kontrol et.`);
      }
    });
  }

  // Boşta kalan karakterler (botlar bunları alır)
  const kullanilan = () => ag.koltuklar.filter(Boolean).map(k => k.karakter);
  const bosKarakter = () => Karakterler.TURLER.find(t => !kullanilan().includes(t));
  const koltukAdi = no => ag.koltuklar[no]?.ad ?? '🤖 Bot';

  // Bekleme odasında küçük masa: herkes kendini altta görür; koltuğa dokunan oraya geçer
  function lobiListesi(koltuklar, benimNo) {
    const yerler = [['alt', 0], ['sag', 1], ['ust', 2], ['sol', 3]];
    const koltuk = ([yer, fark]) => {
      const i = (benimNo + fark) % 4, k = koltuklar[i];
      const etiket = fark === 0 ? 'Sen' : fark === 2 ? 'Karşın' : fark === 1 ? 'Sağın' : 'Solun';
      const emoji = k ? Karakterler.BILGI[k.karakter]?.emoji ?? '🤠' : '🤖';
      return `<button type="button" class="lobiKoltuk ${yer}${fark === 0 ? ' ben' : ''}${k ? '' : ' bos'}" data-yer="${i}">`
        + `<span class="emoji">${emoji}</span><b>${k ? guvenli(k.ad) : 'Bot'}</b>`
        + `<small>${etiket}${i === 0 ? ' · oda sahibi' : ''}</small></button>`;
    };
    return `<div class="lobiMasa">${yerler.map(koltuk).join('')}<div class="lobiMasaOrta">🕯️</div></div>`
      + '<small class="lobiIpucu">👆 Oturmak istediğin koltuğa dokun. Karakterini yukarıdan değiştirebilirsin.</small>';
  }

  function yerDegistir(no, hedef) {
    if (ag.mod !== 'ev' || ag.basladi || !Number.isInteger(hedef) || hedef < 0 || hedef > 3 || hedef === no) return;
    const ev = ag.koltuklar[0];
    const d = [...ag.koltuklar];
    [d[no], d[hedef]] = [d[hedef], d[no]];
    const h = d.indexOf(ev);
    ag.koltuklar = d.map((_, i) => d[(i + h) % 4]);
    ag.koltuklar.forEach((k, yeniNo) => {
      if (!k?.misafir || k.misafir.no === yeniNo) return;
      k.misafir.no = yeniNo;
      gonder(k.misafir, { tip: 'kabul', no: yeniNo, surum: SURUM });
    });
    Ses.sec();
    sesListesiYay();
    lobiyiCiz();
  }

  const kiyafetTemiz = k => (k && typeof k === 'object'
    ? { sapka: String(k.sapka || ''), gomlek: String(k.gomlek || ''), yelek: String(k.yelek || ''), aksesuar: String(k.aksesuar || 'yok') } : {});
  function karakterDegistir(no, tur, kiyafet) {
    if (ag.mod !== 'ev' || !ag.koltuklar[no] || !Karakterler.BILGI[tur]) return;
    if (ag.koltuklar.some((k, i) => k && i !== no && k.karakter === tur)) return;   // başkası almış
    ag.koltuklar[no].karakter = tur;
    ag.koltuklar[no].kiyafet = kiyafetTemiz(kiyafet);
    if (!ag.basladi) lobiyiCiz();
  }

  function lobiyiCiz() {
    const liste = ag.koltuklar.map(k => (k ? { ad: k.ad, karakter: k.karakter } : null));
    const kisi = liste.filter(Boolean).length;
    durumYaz(`Oda kodun: <b class="odaKodu">${ag.kod}</b><br>Bu kodu arkadaşlarına söyle, “Katıl” kısmına yazsınlar.`
      + lobiListesi(liste, 0)
      + (kisi > 1 ? 'Herkes geldiyse “Oyunu başlat”a bas. Boş koltuklarda bot oynar.' : '⏳ Arkadaşların bekleniyor...'));
    $('baslatBtn').hidden = false;
    $('baslatBtn').disabled = kisi < 2;
    herkese({ tip: 'lobi', koltuklar: liste, ayar: Giydir.motorAyari() });
    karakterleriKilitle(liste);
  }

  // Menüdeki karakter düğmeleri: başkasının seçtiği karakter soluk görünür
  function karakterleriKilitle(liste) {
    document.querySelectorAll('.karakterBtn').forEach(b => {
      const alan = liste.findIndex(k => k && k.karakter === b.dataset.tur);
      b.classList.toggle('alindi', alan >= 0 && alan !== ui.benimNo);
    });
  }

  function reddet(baglanti, neden) {
    baglanti.send({ tip: 'red', neden });
    setTimeout(() => baglanti.close(), 500);
  }

  function evMesaji(misafir, m) {
    if (m?.tip === 'katil' && misafir.no === null) return katilanGeldi(misafir, m);
    if (misafir.no === null || ag.koltuklar[misafir.no]?.misafir !== misafir) return;
    const no = misafir.no;
    if (m?.tip === 'eylem' && ag.basladi && Array.isArray(m.args)) {
      if (m.ad === 'yenidenAt') Motor.yenidenAt(no, Array.isArray(m.args[0]) ? m.args[0].map(Number) : []);
      else if (m.ad === 'kutu') Motor.kutuSec(no, String(m.args[0]));
      else if (m.ad === 'hedef') Motor.hedefSec(no, +m.args[0]);
    } else if (m?.tip === 'domates' && ag.basladi) {
      domatesDagit(no, +m.hedef);
    } else if (m?.tip === 'bakis') {
      const y = +m.y || 0, p = +m.p || 0;
      herkese({ tip: 'bakis', no, y, p }, no);
      bakisGeldi(no, y, p);
    } else if (m?.tip === 'tepki' && typeof m.e === 'string') {
      tepkiDagit(no, m.e.slice(0, 8));
    } else if (m?.tip === 'sohbet' && typeof m.metin === 'string') {
      sohbetDagit(no, koltukAdi(no), m.metin);
    } else if (m?.tip === 'ses') {
      ag.koltuklar[no].ses = !!m.acik;
      sesListesiYay();
    } else if (m?.tip === 'yer') {
      yerDegistir(no, m.hedef);
    } else if (m?.tip === 'karakter') {
      karakterDegistir(no, m.tur, m.kiyafet);
    }
  }

  function katilanGeldi(misafir, m) {
    if (m.surum !== SURUM) {
      reddet(misafir.baglanti, 'Uygulaman eski sürümde kalmış. Uygulamayı tamamen kapatıp yeniden aç (tarayıcıdaysan sayfayı yenile), sonra tekrar katıl.');
      return;
    }
    const ad = String(m.ad ?? '').trim().slice(0, 12) || 'Kovboy';
    const kucuk = s => String(s).trim().toLocaleLowerCase('tr');
    let no = ag.koltuklar.findIndex((k, i) => i > 0 && k && k.kimlik === m.kimlik);
    if (no < 0 && ag.basladi) no = ag.koltuklar.findIndex((k, i) => i > 0 && k && !k.misafir && kucuk(k.ad) === kucuk(ad));
    if (no < 0) {
      if (ag.basladi) {
        reddet(misafir.baglanti, 'Oyun başlamış. Oyundan düşen bir oyuncuysan oyundaki adının aynısını yazıp tekrar katıl.');
        return;
      }
      no = ag.koltuklar.findIndex((k, i) => i > 0 && !k);
      if (no < 0) {
        reddet(misafir.baglanti, 'Oda dolu (4 kişi).');
        return;
      }
      const istenen = Karakterler.BILGI[m.karakter] && !kullanilan().includes(m.karakter) ? m.karakter : bosKarakter();
      ag.koltuklar[no] = { ad, kimlik: m.kimlik, karakter: istenen, kiyafet: istenen === m.karakter ? kiyafetTemiz(m.kiyafet) : {}, misafir: null };
    }
    const eski = ag.koltuklar[no].misafir;
    if (eski && eski !== misafir) eski.baglanti.close();
    ag.koltuklar[no].misafir = misafir;
    ag.koltuklar[no].ses = false;
    misafir.no = no;
    gonder(misafir, { tip: 'kabul', no, surum: SURUM });
    Ses.sec();
    sesListesiYay();
    if (!ag.basladi) {
      lobiyiCiz();
      return;
    }
    // Oyun sürüyor: bot bırakır, oyuncu kaldığı yerden devam eder
    gonder(misafir, { tip: 'basla', d: gorunum(no) });
    Motor.botYap(no, false);
    sohbetDagit(-1, '', `${koltukAdi(no)} oyuna geri döndü 👋`);
  }

  function koptu(no) {
    const k = ag.koltuklar[no];
    if (!k?.misafir) return;
    k.misafir = null;
    k.ses = false;
    sesListesiYay();
    if (!ag.basladi) {
      ag.koltuklar[no] = null;
      lobiyiCiz();
      return;
    }
    Motor.botYap(no, true);
    sohbetDagit(-1, '', `${k.ad} oyundan düştü, yerine bot oynuyor. Aynı adla geri girerse kaldığı yerden devam eder.`);
  }

  // Misafire giden görünüm: süre, onun saatine göre hesaplansın diye kalan süre olarak gider
  function gorunum(no) {
    const d = Motor.gorunum(no);
    if (d) d.kalanMs = d.bitis - Date.now();
    return d;
  }

  function oyunuBaslat() {
    if (ag.mod !== 'ev') return;
    ag.basladi = true;
    $('baslatBtn').hidden = true;
    // Boş koltuklara, kimsenin seçmediği karakterlerle bot oturur
    const bos = Karakterler.TURLER.filter(t => !kullanilan().includes(t)).sort(() => Math.random() - 0.5);
    const oyuncular = ag.koltuklar.map(k => {
      if (k) return { ad: k.ad, karakter: k.karakter, kiyafet: k.kiyafet, bot: false };
      const t = bos.shift();
      return { ad: Karakterler.BILGI[t].ad, karakter: t, bot: true };
    });
    // Düşmüş olanların yerine en baştan bot oynar
    ag.koltuklar.forEach((k, no) => { if (k && no > 0 && !k.misafir) oyuncular[no].bot = true; });
    Motor.yeni(oyuncular, (t, v) => {
      olayGeldi(t, v);
      olayYay(t, v);
    }, Giydir.motorAyari());
    oyuncular.forEach((p, no) => { if (p.bot && ag.koltuklar[no]) Motor.botYap(no, true); });
    misafirler().forEach(({ k, no }) => gonder(k.misafir, { tip: 'basla', d: gorunum(no) }));
    oyunEkraniniKur(Motor.gorunum(0), 0);
    sohbetDagit(-1, '', 'Oyun başladı. Mumunuz yatsıya kadar yansın! 🕯️');
  }

  function olayYay(t, v) {
    if (ag.mod !== 'ev') return;
    misafirler().forEach(({ k, no }) => gonder(k.misafir, { tip: 'olay', t, v, d: gorunum(no) }));
  }

  // ---------- Misafir: odaya katılma ----------
  function odayaKatil(kod = $('odaKoduGir').value.trim().toUpperCase()) {
    const ad = adiAl();
    if (!ad || !peerVarMi()) return;
    Ses.hazirla();
    if (kod.length !== KOD_UZUNLUK) {
      durumYaz(`Oda kodu ${KOD_UZUNLUK} karakter olmalı.`);
      return;
    }
    ag.kod = kod;
    durumYaz('⏳ Odaya bağlanılıyor...');
    kilitle();
    try { ag.peer?.destroy(); } catch (e) { /* zaten kapalı */ }
    const peer = new Peer();
    ag.peer = peer;
    peer.on('call', gelenArama);
    sunucuyaYenidenBaglan(peer);
    setTimeout(() => {
      if (ag.peer !== peer || ag.baglanti) return;
      durumYaz('❌ 15 saniyedir bağlanılamadı. Şunları dene:<br>'
        + '• Oda sahibi oyunu <b>açık</b> tutsun, ekranı kilitlenmesin.<br>'
        + '• Farklı internetlerdeyseniz bazı modemler doğrudan bağlantıya izin vermez: aynı Wi-Fi’ye bağlanmayı ya da ikiniz de mobil veriye geçmeyi deneyin.<br>'
        + '• Sonra tekrar <b>Katıl</b>’a bas.');
      oturumuUnut();
      kilitle(false);
    }, 15000);
    peer.on('open', () => {
      if (ag.peer !== peer || ag.baglanti) return;
      const baglanti = peer.connect(ODA_ONEKI + kod, { reliable: true });
      baglanti.on('open', () => {
        ag.baglanti = baglanti;
        ag.mod = 'misafir';
        baglanti.send({ tip: 'katil', ad, kimlik, karakter: ui.karakter, kiyafet: Giydir.kiyafet(ui.karakter), surum: SURUM });
        nabziBaslat();
      });
      baglanti.on('data', m => {
        ag.sonMesaj = Date.now();
        if (m?.tip !== 'nabiz') misafirMesaji(m);
      });
      baglanti.on('close', () => ag.baglanti === baglanti && evdenKoptu());
      baglanti.on('error', () => ag.baglanti === baglanti && evdenKoptu());
    });
    peer.on('error', e => {
      if (ag.peer !== peer || ag.baglanti) return;
      kilitle(false);
      if (e.type === 'peer-unavailable') {
        oturumuUnut();
        kayit(SON_ODA, null);
        $('geriDonBtn').hidden = true;
      }
      durumYaz(e.type === 'peer-unavailable'
        ? '❌ Bu kodla açık bir oda bulunamadı. Kodu kontrol et. Oda sahibinin oyunu açık mı?'
        : `❌ Bağlanılamadı (${e.type}). İnternet bağlantını kontrol et.`);
    });
  }

  // Misafirde: gelen görünümün süresini kendi saatime çevir
  const saateCevir = d => {
    if (d && typeof d.kalanMs === 'number') d.bitis = Date.now() + d.kalanMs;
    return d;
  };

  function misafirMesaji(m) {
    if (m?.tip === 'kabul' && Number.isInteger(m.no)) {
      if (m.surum !== SURUM) {
        ag.baglanti.close();
        ag.baglanti = null;
        ag.mod = 'yerel';
        kilitle(false);
        durumYaz('❌ Oda sahibinin uygulaması farklı sürümde. İkiniz de uygulamayı kapatıp yeniden açın.');
        return;
      }
      ui.benimNo = m.no;
      odaKodunuGoster();
      try { sessionStorage.setItem(OTOMATIK_KATIL, JSON.stringify({ kod: ag.kod })); } catch (e) { /* elle girer */ }
      kayit(SON_ODA, { kod: ag.kod, zaman: Date.now() });
      durumYaz('✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...');
    } else if (m?.tip === 'lobi' && Array.isArray(m.koltuklar)) {
      const ben = m.koltuklar[ui.benimNo];
      if (ben?.karakter && ben.karakter !== ui.karakter) {
        ui.karakter = ben.karakter;
        karakterGoster();
      }
      durumYaz('✅ Odaya bağlandın! Oyunu oda sahibi başlatacak, bekle...' + lobiListesi(m.koltuklar, ui.benimNo));
      karakterleriKilitle(m.koltuklar);
      if (m.ayar) Giydir.ayarlariCiz(true, m.ayar);
    } else if (m?.tip === 'red') {
      ag.baglanti = null;
      ag.mod = 'yerel';
      kilitle(false);
      oturumuUnut();
      durumYaz(`❌ Odaya girilemedi: ${guvenli(m.neden ?? '')}`);
    } else if (m?.tip === 'basla' && m.d) {
      $('baglantiEkrani').hidden = true;
      oyunEkraniniKur(saateCevir(m.d), ui.benimNo);
    } else if (m?.tip === 'olay' && m.d) {
      olayGeldi(m.t, m.v, saateCevir(m.d));
    } else if (m?.tip === 'bakis') {
      bakisGeldi(m.no, +m.y || 0, +m.p || 0);
    } else if (m?.tip === 'tepki') {
      tepkiGoster(m.no, m.e);
    } else if (m?.tip === 'domates') {
      domatesGoster(+m.no, +m.hedef);
    } else if (m?.tip === 'sohbet') {
      sohbetGeldi(m.no, m.ad, m.metin);
    } else if (m?.tip === 'sesListesi' && Array.isArray(m.liste)) {
      sesListesiGeldi(m.liste);
    }
  }

  function evdenKoptu() {
    if (!ag.baglanti) return;
    ag.baglanti = null;
    if ($('oyun').hidden) {
      ag.mod = 'yerel';
      kilitle(false);
      durumYaz('📡 Oda sahibiyle bağlantı koptu. Tekrar katılmayı dene.');
      return;
    }
    $('baglantiEkrani').hidden = false;
  }

  function oturumuUnut() {
    try { sessionStorage.removeItem(OTOMATIK_KATIL); } catch (e) { /* yoksa da olur */ }
  }

  function ayril() {
    oturumuUnut();
    kayit(SON_ODA, null);
    try { ag.peer?.destroy(); } catch (e) { /* zaten kapalı */ }
    location.reload();
  }

  // ---------- Hamle (misafir) ----------
  function eylem(ad, args) {
    if (ag.mod !== 'misafir' || !ag.baglanti?.open) return false;
    ag.baglanti.send({ tip: 'eylem', ad, args });
    return true;
  }

  // ---------- Bakış (kafa çevirme) ----------
  let sonBakis = { y: 9, p: 9 }, sonBakisZamani = 0;
  function bakisGonder(y, p) {
    if (ag.mod === 'yerel' || !ag.basladi && ag.mod === 'ev' || $('oyun').hidden) return;
    if (Math.abs(y - sonBakis.y) < 0.03 && Math.abs(p - sonBakis.p) < 0.03) return;
    if (Date.now() - sonBakisZamani < 140) return;
    sonBakis = { y, p };
    sonBakisZamani = Date.now();
    y = Math.round(y * 100) / 100;
    p = Math.round(p * 100) / 100;
    if (ag.mod === 'ev') herkese({ tip: 'bakis', no: 0, y, p });
    else if (ag.baglanti?.open) ag.baglanti.send({ tip: 'bakis', y, p });
  }
  function bakisGeldi(no, y, p) {
    if (no === ui.benimNo) return;
    Sahne.bakisUygula(no, y, p);
  }

  // ---------- Tepki (emoji) ----------
  function tepkiGonder(e) {
    if (ag.mod === 'ev') tepkiDagit(0, e);
    else if (ag.mod === 'misafir' && ag.baglanti?.open) ag.baglanti.send({ tip: 'tepki', e });
    else tepkiGoster(ui.benimNo, e);
  }
  function tepkiDagit(no, e) {
    herkese({ tip: 'tepki', no, e });
    tepkiGoster(no, e);
  }

  // ---------- Domates ----------
  // Sadece mumu sönmüş oyuncu, yaşayan birine atabilir (oda sahibi kontrol eder)
  function domatesDagit(no, hedef) {
    const d = Motor.gorunum(0);
    if (!d || d.oyuncular[no]?.canli !== false || !d.oyuncular[hedef]?.canli) return;
    herkese({ tip: 'domates', no, hedef });
    domatesGoster(no, hedef);
  }
  function domatesGonder(hedef) {
    if (ag.mod === 'misafir') {
      if (ag.baglanti?.open) ag.baglanti.send({ tip: 'domates', hedef });
    } else domatesDagit(ui.benimNo, hedef);
  }

  // ---------- Sohbet ----------
  function sohbetDagit(no, ad, metin) {
    metin = String(metin).trim().slice(0, 120);
    if (!metin) return;
    herkese({ tip: 'sohbet', no, ad, metin });
    sohbetGeldi(no, ad, metin);
  }
  function sohbetGonder(metin) {
    metin = metin.trim().slice(0, 120);
    if (!metin) return;
    if (ag.mod === 'ev') sohbetDagit(0, ag.koltuklar[0].ad, metin);
    else if (ag.mod === 'misafir' && ag.baglanti?.open) ag.baglanti.send({ tip: 'sohbet', metin });
  }
  function sohbetGeldi(no, ad, metin) {
    const satir = document.createElement('div');
    satir.className = `satir${no === -1 ? ' duyuru' : ''}`;
    satir.innerHTML = no === -1 ? guvenli(metin) : `<b style="color:${RENKLER[no] ?? '#fff'}">${guvenli(ad)}:</b> ${guvenli(metin)}`;
    $('sohbetListe').appendChild(satir);
    $('sohbetListe').scrollTop = $('sohbetListe').scrollHeight;
    if (no >= 0 && !$('oyun').hidden) balon(no, metin, false, true);
    if (no === ui.benimNo) return;
    if ($('sohbetPaneli').hidden) {
      ag.okunmamis++;
      $('okunmamis').textContent = ag.okunmamis;
      $('okunmamis').hidden = false;
      if (no === -1 && !$('oyun').hidden) mesaj(`💬 ${metin}`, '', 3000);
    }
  }

  // ---------- Sesli sohbet ----------
  // 🎤'a basan sesli sohbete katılır. Sesteki her iki kişi arasında doğrudan ses bağlantısı kurulur.
  // Gelen sesin yüksekliği ölçülür ve konuşanın karakterinin ağzı oynar.
  const ses = { akis: null, liste: [], aramalar: new Map() };

  function sesListesiYay() {
    if (ag.mod !== 'ev') return;
    const liste = ag.koltuklar.map((k, no) => {
      const peerId = no === 0 ? ag.peer?.id : k?.misafir?.baglanti.peer;
      return k?.ses && peerId ? { no, peerId } : null;
    }).filter(Boolean);
    herkese({ tip: 'sesListesi', liste });
    sesListesiGeldi(liste);
  }

  function sesListesiGeldi(liste) {
    ses.liste = liste;
    const benSesteyim = !!ses.akis && liste.some(x => x.no === ui.benimNo);
    ses.aramalar.forEach((a, peerId) => {
      if (!benSesteyim || !liste.some(x => x.peerId === peerId)) aramayiKapat(peerId);
    });
    if (benSesteyim) {
      liste.filter(x => x.no > ui.benimNo && !ses.aramalar.has(x.peerId)).forEach(x => aramayaBagla(ag.peer.call(x.peerId, ses.akis)));
    }
    sesDugmesiniCiz();
    if (ui.durum) ciz();
  }

  function gelenArama(call) {
    if (!ses.akis) {
      call.close();
      return;
    }
    call.answer(ses.akis);
    aramayaBagla(call);
  }

  function aramayaBagla(call) {
    if (!call) return;
    aramayiKapat(call.peer);
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
    const a = { call, audio, olcer: null };
    ses.aramalar.set(call.peer, a);
    call.on('stream', akis => {
      audio.srcObject = akis;
      audio.play().catch(() => {});
      // Ses yüksekliğini ölç (ağız hareketi için)
      try {
        const c = Ses.baglam();
        const kaynak = c.createMediaStreamSource(akis);
        const olcer = c.createAnalyser();
        olcer.fftSize = 512;
        kaynak.connect(olcer);
        a.olcer = olcer;
        a.veri = new Uint8Array(olcer.fftSize);
      } catch (e) { /* ağız oynamaz, ses yine gelir */ }
    });
    const bitti = () => {
      if (ses.aramalar.get(call.peer)?.call === call) aramayiKapat(call.peer);
    };
    call.on('close', bitti);
    call.on('error', bitti);
  }

  function aramayiKapat(peerId) {
    const a = ses.aramalar.get(peerId);
    if (!a) return;
    ses.aramalar.delete(peerId);
    a.audio.srcObject = null;
    try { a.call.close(); } catch (e) { /* zaten kapanmış */ }
  }

  // Konuşanların ağzı: her karede ses seviyesine göre
  setInterval(() => {
    ses.aramalar.forEach((a, peerId) => {
      if (!a.olcer) return;
      a.olcer.getByteTimeDomainData(a.veri);
      let top = 0;
      for (let i = 0; i < a.veri.length; i++) {
        const v = (a.veri[i] - 128) / 128;
        top += v * v;
      }
      const seviye = Math.min(1, Math.max(0, (Math.sqrt(top / a.veri.length) - 0.015) * 9));
      const kim = ses.liste.find(x => x.peerId === peerId);
      if (kim && seviye > 0.05) Sahne.konusmaSeviyesi(kim.no, seviye);
    });
  }, 50);

  async function sesAcKapa() {
    if (ses.akis) {
      ses.akis.getTracks().forEach(t => t.stop());
      ses.akis = null;
      sesDurumuBildir(false);
      mesaj('🎤 Sesli sohbetten çıktın.');
      return;
    }
    try {
      ses.akis = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      mesaj('🎤 Mikrofona izin verilmedi. Telefon ayarlarından tarayıcıya mikrofon izni ver.', 'kirmizi', 3500);
      return;
    }
    sesDurumuBildir(true);
    mesaj('🎙️ Sesli sohbettesin. Seste olanlar birbirini duyar.', '', 2500);
  }

  function sesDurumuBildir(acik) {
    if (ag.mod === 'ev') {
      ag.koltuklar[0].ses = acik;
      sesListesiYay();
    } else if (ag.mod === 'misafir' && ag.baglanti?.open) {
      ag.baglanti.send({ tip: 'ses', acik });
      if (!acik) sesListesiGeldi(ses.liste);
    }
    sesDugmesiniCiz();
  }

  function sesDugmesiniCiz() {
    const acik = !!ses.akis;
    $('sesliBtn').classList.toggle('acik', acik);
    $('sesliBtn').textContent = acik ? '🎙️' : '🎤';
    $('sesliBtn').title = acik ? 'Sesli sohbetten çık' : 'Sesli sohbete katıl';
  }

  const sesteMi = no => ses.liste.some(x => x.no === no);

  function sohbetiAc() {
    $('sohbetPaneli').hidden = false;
    ag.okunmamis = 0;
    $('okunmamis').hidden = true;
    $('sohbetListe').scrollTop = $('sohbetListe').scrollHeight;
  }

  // ---------- Kurulum ----------
  $('odaKurBtn').addEventListener('click', odaKur);
  $('katilBtn').addEventListener('click', () => odayaKatil());
  $('odaKoduGir').addEventListener('keydown', e => e.key === 'Enter' && odayaKatil());
  $('baslatBtn').addEventListener('click', oyunuBaslat);
  $('onlineDurum').addEventListener('click', e => {
    const b = e.target.closest('.lobiKoltuk');
    if (!b || b.classList.contains('ben')) return;
    const hedef = +b.dataset.yer;
    if (ag.mod === 'ev') yerDegistir(0, hedef);
    else if (ag.mod === 'misafir' && ag.baglanti?.open) ag.baglanti.send({ tip: 'yer', hedef });
  });
  $('odaIptalBtn').addEventListener('click', ayril);
  $('yenidenBaglanBtn').addEventListener('click', () => location.reload());
  $('baglantiCikBtn').addEventListener('click', ayril);
  $('sohbetBtn').addEventListener('click', sohbetiAc);
  $('sesliBtn').addEventListener('click', sesAcKapa);
  $('sohbetKapat').addEventListener('click', () => ($('sohbetPaneli').hidden = true));
  $('sohbetForm').addEventListener('submit', e => {
    e.preventDefault();
    sohbetGonder($('sohbetYazi').value);
    $('sohbetYazi').value = '';
  });
  document.querySelectorAll('#hizliMesaj button').forEach(b => b.addEventListener('click', () => sohbetGonder(b.textContent)));

  // Sayfa yenilenince (bağlantı koptuysa) aynı odaya otomatik geri girilir
  try {
    const otomatik = JSON.parse(sessionStorage.getItem(OTOMATIK_KATIL));
    if (otomatik?.kod && $('adim').value.trim()) {
      $('odaKoduGir').value = otomatik.kod;
      setTimeout(() => odayaKatil(otomatik.kod), 300);
    }
  } catch (e) { /* elle katılınır */ }

  // Uygulama kapanıp açıldıysa: son odaya tek dokunuşla geri dön (3 saat içinde)
  try {
    const son = JSON.parse(localStorage.getItem(SON_ODA));
    if (son?.kod && Date.now() - son.zaman < 3 * 3600 * 1000 && !$('odaKoduGir').value) {
      $('geriDonBtn').textContent = `🔁 ${son.kod} odasına geri dön`;
      $('geriDonBtn').hidden = false;
      $('geriDonBtn').addEventListener('click', () => {
        $('odaKoduGir').value = son.kod;
        odayaKatil(son.kod);
      });
    }
  } catch (e) { /* düğme görünmez */ }

  return {
    eylem, ayril, sesteMi, bakisGonder, tepkiGonder, oyunuBaslat, domatesGonder, domatesDagit,
    // Menüde karakter ya da kıyafet değişince odadakiler de görsün
    karakterSec(tur) {
      const kiyafet = Giydir.kiyafet(tur);
      if (ag.mod === 'ev') karakterDegistir(0, tur, kiyafet);
      else if (ag.mod === 'misafir' && ag.baglanti?.open) ag.baglanti.send({ tip: 'karakter', tur, kiyafet });
    },
    // Oda sahibi ayarları değiştirince bekleme odasındakiler görsün
    lobiGuncelle() {
      if (ag.mod === 'ev' && !ag.basladi) lobiyiCiz();
    },
    get mod() { return ag.mod; },
    get basladi() { return ag.basladi; },
    get sesBaglantilari() { return [...ses.aramalar].map(([id, a]) => ({ id, sesGeliyor: !!a.audio.srcObject })); },
  };
})();
