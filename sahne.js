// =============================================================
// Ölümlü Yatzy - 3D sahne (Three.js)
// Western saloonu: tahta zemin ve duvarlar, sallanan kapılar + tabela, bar tezgâhı ve şişeler,
// piyano, "ARANIYOR" afişleri, tavandan sarkan lambalar. Ortada kare masa, dört tarafında
// hayvan kovboylar, herkesin önünde yanan bir mum. Mum, sahibi ölünce söner.
// Kamera benim gözümdür (birinci şahıs): fare/parmakla sağa sola bakılır.
// Koltuklar ekrana göre: 0 ben (+z), 1 sağ (+x), 2 karşı (-z), 3 sol (-x).
// =============================================================

const Sahne = (() => {
  const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const MASA_Y = 0.92, MASA_YARI = 1.12, OTURMA = 1.78;
  const KART_G = 0.17, KART_Y = 0.25;
  let renderer, sahne, kamera, saat;
  let koltuklar = [];     // koltuk -> { k: karakter | null, mum, isik, alev, aci, no }
  let noKoltuk = {};      // oyuncu no -> koltuk
  let benimNo = 0;
  let yigin, acikGrup, tabanca, tabancaIsik, flasIsigi;
  const animler = [];
  const bakis = { yaw: 0, pitch: 0, hedefYaw: 0, hedefPitch: 0 };
  let titreme = 0, oldum = 0, olumSure = 0;
  let kartDoku = {}, sirtMalzeme;
  let etiketGuncelle = () => {};

  // ---------- Yardımcılar ----------
  function dokuKanvas(gen, yuk, ciz, tekrar) {
    const c = document.createElement('canvas');
    c.width = gen;
    c.height = yuk;
    ciz(c.getContext('2d'), gen, yuk);
    const d = new THREE.CanvasTexture(c);
    d.colorSpace = THREE.SRGBColorSpace;
    d.anisotropy = 4;
    if (tekrar) {
      d.wrapS = d.wrapT = THREE.RepeatWrapping;
      d.repeat.set(...tekrar);
    }
    return d;
  }
  const mat = (renk, ek = {}) => new THREE.MeshStandardMaterial({ color: renk, roughness: 0.8, ...ek });
  function kutu(g, y, d, malzeme, x, yy, z, ust = sahne) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(g, y, d), malzeme);
    m.position.set(x, yy, z);
    m.castShadow = m.receiveShadow = true;
    ust.add(m);
    return m;
  }

  // Tahta dokusu
  function tahtaDoku(renk1, renk2, tekrar, dikey) {
    return dokuKanvas(256, 256, (g, w, h) => {
      const n = 6;
      for (let i = 0; i < n; i++) {
        const t = Math.random();
        g.fillStyle = `color-mix(in srgb, ${renk1} ${Math.round(t * 100)}%, ${renk2})`;
        if (dikey) g.fillRect((i * w) / n, 0, w / n, h);
        else g.fillRect(0, (i * h) / n, w, h / n);
        // damarlar
        g.strokeStyle = 'rgba(40,20,5,.18)';
        for (let k = 0; k < 6; k++) {
          g.beginPath();
          const a = (i + Math.random()) * (dikey ? w : h) / n;
          if (dikey) { g.moveTo(a, 0); g.bezierCurveTo(a + 4, h / 3, a - 4, (2 * h) / 3, a, h); }
          else { g.moveTo(0, a); g.bezierCurveTo(w / 3, a + 4, (2 * w) / 3, a - 4, w, a); }
          g.stroke();
        }
        g.fillStyle = 'rgba(20,10,0,.55)';
        if (dikey) g.fillRect((i * w) / n, 0, 2, h);
        else g.fillRect(0, (i * h) / n, w, 2);
      }
    }, tekrar);
  }

  // ---------- Kart görselleri (hem 3D hem ekrandaki el için) ----------
  const KART_RENK = { P: '#8a1c1c', K: '#7a2a6e', A: '#1d3f7a', J: '#1f6b2c' };
  const KART_YAZI = { P: 'P', K: 'K', A: 'A', J: '★' };
  const KART_ADI = { P: 'PAPAZ', K: 'KIZ', A: 'AS', J: 'JOKER' };
  function kartCiz(g, w, h, tur) {
    g.fillStyle = '#f3e6c4';
    g.beginPath();
    g.roundRect(0, 0, w, h, w * 0.08);
    g.fill();
    g.strokeStyle = KART_RENK[tur];
    g.lineWidth = w * 0.035;
    g.strokeRect(w * 0.07, w * 0.07, w - w * 0.14, h - w * 0.14);
    g.lineWidth = w * 0.012;
    g.strokeRect(w * 0.11, w * 0.11, w - w * 0.22, h - w * 0.22);
    g.fillStyle = KART_RENK[tur];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    // Köşe harfleri
    g.font = `900 ${w * 0.17}px Georgia, serif`;
    g.fillText(KART_YAZI[tur], w * 0.21, w * 0.24);
    g.save();
    g.translate(w * 0.79, h - w * 0.24);
    g.rotate(Math.PI);
    g.fillText(KART_YAZI[tur], 0, 0);
    g.restore();
    // Ortadaki resim
    const cx = w / 2, cy = h * 0.46;
    g.save();
    g.translate(cx, cy);
    if (tur === 'P') {         // taç
      g.beginPath();
      g.moveTo(-w * 0.26, w * 0.12);
      g.lineTo(-w * 0.26, -w * 0.12); g.lineTo(-w * 0.13, w * 0.0); g.lineTo(0, -w * 0.2);
      g.lineTo(w * 0.13, 0); g.lineTo(w * 0.26, -w * 0.12); g.lineTo(w * 0.26, w * 0.12); g.closePath();
      g.fill();
      g.fillStyle = '#e8b830';
      [-0.26, 0, 0.26].forEach((x, i) => { g.beginPath(); g.arc(x * w, (i === 1 ? -0.2 : -0.12) * w, w * 0.035, 0, 7); g.fill(); });
    } else if (tur === 'K') {  // gül
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.ellipse(Math.cos(i * 1.256) * w * 0.08, Math.sin(i * 1.256) * w * 0.08 - w * 0.04, w * 0.1, w * 0.07, i * 1.256, 0, 7);
        g.fill();
      }
      g.fillStyle = '#f3e6c4';
      g.beginPath(); g.arc(0, -w * 0.04, w * 0.04, 0, 7); g.fill();
      g.strokeStyle = '#2f6b2a'; g.lineWidth = w * 0.03;
      g.beginPath(); g.moveTo(0, w * 0.06); g.quadraticCurveTo(w * 0.04, w * 0.16, 0, w * 0.25); g.stroke();
    } else if (tur === 'A') {  // şerif yıldızı
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? w * 0.11 : w * 0.26, a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = '#f3e6c4';
      g.beginPath(); g.arc(0, 0, w * 0.06, 0, 7); g.fill();
    } else {                   // joker: kovboy şapkalı kafatası
      g.beginPath(); g.arc(0, w * 0.03, w * 0.17, 0, 7); g.fill();
      g.fillRect(-w * 0.1, w * 0.12, w * 0.2, w * 0.12);
      g.fillStyle = '#f3e6c4';
      [-1, 1].forEach(y => { g.beginPath(); g.arc(y * w * 0.07, w * 0.03, w * 0.05, 0, 7); g.fill(); });
      for (let i = -1; i <= 1; i++) g.fillRect(i * w * 0.06 - w * 0.012, w * 0.15, w * 0.024, w * 0.09);
      g.fillStyle = KART_RENK.J;
      g.beginPath(); g.ellipse(0, -w * 0.12, w * 0.3, w * 0.05, 0, 0, 7); g.fill();
      g.fillRect(-w * 0.13, -w * 0.3, w * 0.26, w * 0.18);
    }
    g.restore();
    g.font = `800 ${w * 0.11}px Georgia, serif`;
    g.fillStyle = KART_RENK[tur];
    g.fillText(KART_ADI[tur], cx, h * 0.8);
  }
  function sirtCiz(g, w, h) {
    g.fillStyle = '#6e1f1a';
    g.beginPath(); g.roundRect(0, 0, w, h, w * 0.08); g.fill();
    g.strokeStyle = '#e6c27a';
    g.lineWidth = w * 0.03;
    g.strokeRect(w * 0.08, w * 0.08, w - w * 0.16, h - w * 0.16);
    g.fillStyle = 'rgba(230,194,122,.35)';
    for (let x = 0; x < w; x += w * 0.1) for (let y = 0; y < h; y += w * 0.1) if (((x + y) / (w * 0.1)) % 2 < 1) g.fillRect(x, y, w * 0.05, w * 0.05);
    // ortada mum
    g.fillStyle = '#f3e6c4';
    g.fillRect(w * 0.44, h * 0.45, w * 0.12, h * 0.25);
    g.fillStyle = '#ffb02e';
    g.beginPath(); g.ellipse(w * 0.5, h * 0.38, w * 0.06, h * 0.07, 0, 0, 7); g.fill();
  }
  // Ekrandaki el için kart resmi (data URL)
  const resimOnbellek = {};
  function kartResmi(tur) {
    if (!resimOnbellek[tur]) {
      const c = document.createElement('canvas');
      c.width = 200; c.height = 294;
      const g = c.getContext('2d');
      if (tur === 'sirt') sirtCiz(g, 200, 294); else kartCiz(g, 200, 294, tur);
      resimOnbellek[tur] = c.toDataURL();
    }
    return resimOnbellek[tur];
  }

  // ---------- Kurulum ----------
  function baslat(kap) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    kap.appendChild(renderer.domElement);
    sahne = new THREE.Scene();
    sahne.background = new THREE.Color(0x3a2416);
    sahne.fog = new THREE.Fog(0x3a2416, 9, 18);
    kamera = new THREE.PerspectiveCamera(60, 1, 0.05, 60);
    saat = new THREE.Clock();

    // Işıklar: sıcak, loş ama karanlık değil
    sahne.add(new THREE.HemisphereLight(0xffe2b8, 0x4a2a14, 1.25));
    const tepe = new THREE.SpotLight(0xffd59a, 30, 9, 0.75, 0.55, 1.4);
    tepe.position.set(0, 3.6, 0);
    tepe.target.position.set(0, 0, 0);
    tepe.castShadow = true;
    tepe.shadow.mapSize.set(1024, 1024);
    tepe.shadow.bias = -0.0005;
    sahne.add(tepe, tepe.target);
    flasIsigi = new THREE.PointLight(0xffe0a0, 0, 6);
    sahne.add(flasIsigi);

    // Kart dokuları
    ['P', 'K', 'A', 'J'].forEach(t => (kartDoku[t] = dokuKanvas(200, 294, (g, w, h) => kartCiz(g, w, h, t))));
    kartDoku.sirt = dokuKanvas(200, 294, sirtCiz);
    sirtMalzeme = mat('#ffffff', { map: kartDoku.sirt, roughness: 0.6 });

    odaKur();
    masaKur();
    yigin = new THREE.Group();
    acikGrup = new THREE.Group();
    sahne.add(yigin, acikGrup);
    tabancaKur();

    boyutla();
    window.addEventListener('resize', boyutla);
    bakisDinle();
    renderer.setAnimationLoop(kare);
  }

  function boyutla() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    kamera.aspect = w / h;
    kamera.fov = w / h < 0.6 ? 100 : w / h < 0.8 ? 90 : w / h < 1.5 ? 70 : 62;
    kamera.updateProjectionMatrix();
  }

  function odaKur() {
    const zemin = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), mat('#ffffff', { map: tahtaDoku('#8a5a32', '#6a4024', [6, 6]) }));
    zemin.rotation.x = -Math.PI / 2;
    zemin.receiveShadow = true;
    sahne.add(zemin);
    const duvarDoku = tahtaDoku('#9a6a3e', '#7a4c2a', [5, 2], true);
    const duvar = mat('#ffffff', { map: duvarDoku });
    const D = 6, Y = 4.4;
    // Karşı duvar kapı boşluğu bırakılarak üç parça: sol, sağ, kapının üstü
    const K = 0.9, KY = 2.6;
    [[-(D + K) / 2, D - K, Y / 2, Y], [(D + K) / 2, D - K, Y / 2, Y], [0, 2 * K, (KY + Y) / 2, Y - KY]].forEach(([x, g, y, h]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(g, h), mat('#ffffff', { map: duvarDoku.clone() }));
      m.material.map.repeat.set((5 * g) / (2 * D), (2 * h) / Y);
      m.material.map.needsUpdate = true;
      m.position.set(x, y, -D);
      m.receiveShadow = true;
      sahne.add(m);
    });
    [[0, D, Math.PI], [-D, 0, Math.PI / 2], [D, 0, -Math.PI / 2]].forEach(([x, z, r]) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2 * D, Y), duvar);
      m.position.set(x, Y / 2, z);
      m.rotation.y = r;
      m.receiveShadow = true;
      sahne.add(m);
      // Duvar dibi süpürgelik
      const s = kutu(2 * D, 0.25, 0.06, mat('#4a2a14'), 0, 0.12, 0, sahne);
      s.position.set(x + Math.sin(r) * 0.03, 0.12, z + Math.cos(r) * 0.03);
      s.rotation.y = r;
    });
    // Tavan ve kirişler
    const tavan = new THREE.Mesh(new THREE.PlaneGeometry(2 * D, 2 * D), mat('#5a3a20'));
    tavan.rotation.x = Math.PI / 2;
    tavan.position.y = Y;
    sahne.add(tavan);
    for (let x = -4.5; x <= 4.5; x += 1.5) kutu(0.18, 0.22, 2 * D, mat('#4a2c16'), x, Y - 0.11, 0);

    // Karşı duvarda sallanan kapılar ve tabela (oyuncunun tam karşısı)
    disariKur(D);
    kutu(0.14, 2.7, 0.14, mat('#4a2a14'), -0.95, 1.35, -D + 0.07);
    kutu(0.14, 2.7, 0.14, mat('#4a2a14'), 0.95, 1.35, -D + 0.07);
    kutu(2.04, 0.16, 0.14, mat('#4a2a14'), 0, 2.68, -D + 0.07);
    const kapiDoku = tahtaDoku('#b07a44', '#8a5a30', [1, 1], true);
    window.__kapilar = [-1, 1].map(y => {
      const mentese = new THREE.Group();
      mentese.position.set(y * 0.86, 1.25, -D + 0.12);
      sahne.add(mentese);
      const k = kutu(0.85, 1.1, 0.05, mat('#ffffff', { map: kapiDoku }), -y * 0.425, 0, 0, mentese);
      // kapı kanadının üstü dalgalı görünsün diye üstte ince çıta
      kutu(0.85, 0.06, 0.07, mat('#5a3417'), -y * 0.425, 0.55, 0, mentese);
      kutu(0.85, 0.06, 0.07, mat('#5a3417'), -y * 0.425, -0.55, 0, mentese);
      k.userData.y = y;
      return mentese;
    });
    const tabela = dokuKanvas(512, 128, (g, w, h) => {
      g.fillStyle = '#3a1f0e'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#d9a35a'; g.lineWidth = 8; g.strokeRect(8, 8, w - 16, h - 16);
      g.fillStyle = '#f3d08a'; g.font = '900 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('S A L O O N', w / 2, h / 2 + 4);
    });
    const tab = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), mat('#ffffff', { map: tabela }));
    tab.position.set(0, 3.2, -D + 0.04);
    sahne.add(tab);

    // Sol duvar: bar tezgâhı, raflar, şişeler
    const tezgah = mat('#6a3a1a');
    kutu(0.7, 1.15, 5, tezgah, -D + 1.4, 0.575, 0.2);
    kutu(0.85, 0.08, 5.1, mat('#3a1f0e'), -D + 1.4, 1.17, 0.2);
    [1.5, 2.2].forEach(y => kutu(0.35, 0.05, 4.2, mat('#4a2a14'), -D + 0.2, y, 0.2));
    const siseRenk = ['#2f6b2a', '#7a3a10', '#8a1c1c', '#c9a25a', '#2a4a6b'];
    for (let i = 0; i < 18; i++) {
      const y = i < 9 ? 1.5 : 2.2, z = -1.6 + (i % 9) * 0.45;
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.3, 10), mat(siseRenk[i % 5], { roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.85 }));
      s.position.set(-D + 0.2, y + 0.18, z);
      sahne.add(s);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.1, 8), s.material);
      b.position.set(-D + 0.2, y + 0.38, z);
      sahne.add(b);
    }
    // Tezgâh üstünde birkaç bardak
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.04, 0.11, 10), mat('#d8e6e6', { transparent: true, opacity: 0.55, roughness: 0.1 }));
      b.position.set(-D + 1.35, 1.27, -1 + i * 0.7);
      sahne.add(b);
    }
    // Ayna (barın arkasında)
    const ayna = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), mat('#9fb4b8', { roughness: 0.15, metalness: 0.6 }));
    ayna.position.set(-D + 0.02, 3.0, 0.2);
    ayna.rotation.y = Math.PI / 2;
    sahne.add(ayna);

    // Sağ duvar: piyano ve "ARANIYOR" afişleri
    const piyano = mat('#2a160c');
    kutu(1.6, 1.3, 0.6, piyano, D - 0.4, 0.65, 1.2).rotation.y = -Math.PI / 2;
    kutu(1.5, 0.1, 0.25, mat('#f0ead8'), D - 0.75, 0.85, 1.2).rotation.y = -Math.PI / 2;
    const afis = isim => dokuKanvas(200, 270, (g, w, h) => {
      g.fillStyle = '#e8d3a2'; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(120,80,30,.25)'; for (let i = 0; i < 40; i++) g.fillRect(Math.random() * w, Math.random() * h, 8, 8);
      g.fillStyle = '#3a200e'; g.textAlign = 'center'; g.font = '900 30px Georgia, serif';
      g.fillText('ARANIYOR', w / 2, 40);
      g.strokeStyle = '#3a200e'; g.lineWidth = 3; g.strokeRect(35, 58, 130, 120);
      g.font = '70px serif'; g.fillText(isim, w / 2, 145);
      g.font = '700 22px Georgia, serif'; g.fillText('YALANCI', w / 2, 210);
      g.font = '800 26px Georgia, serif'; g.fillText('$ 500', w / 2, 245);
    });
    [['🦝', -1.2], ['🐸', 0], ['🐓', -2.6]].forEach(([e, z]) => {
      const a = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.8), mat('#ffffff', { map: afis(e) }));
      a.position.set(D - 0.02, 2.2, z);
      a.rotation.y = -Math.PI / 2;
      a.rotation.z = (Math.random() - 0.5) * 0.12;
      sahne.add(a);
    });
    // Arka duvarda (benim arkam) boynuzlu kafatası süsü yerine büyük bir saat :)
    const saatDoku = dokuKanvas(128, 128, (g, w) => {
      g.fillStyle = '#f3e6c4'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 4, 0, 7); g.fill();
      g.strokeStyle = '#3a200e'; g.lineWidth = 6; g.stroke();
      g.lineWidth = 4; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2, 22); g.moveTo(w / 2, w / 2); g.lineTo(w - 36, w / 2); g.stroke();
    });
    const sa = new THREE.Mesh(new THREE.CircleGeometry(0.4, 24), mat('#ffffff', { map: saatDoku }));
    sa.position.set(0, 3, D - 0.02);
    sa.rotation.y = Math.PI;
    sahne.add(sa);

    // Tavandan sarkan gaz lambaları (köşelerde, sıcak ışık)
    [[-3.2, -3.2], [3.2, -3.2], [-3.2, 3.2], [3.2, 3.2]].forEach(([x, z]) => {
      const zincir = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4), mat('#222'));
      zincir.position.set(x, Y - 0.45, z);
      sahne.add(zincir);
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), new THREE.MeshBasicMaterial({ color: 0xffd28a }));
      l.position.set(x, Y - 1, z);
      sahne.add(l);
      const isik = new THREE.PointLight(0xffb866, 6, 7, 1.6);
      isik.position.set(x, Y - 1.1, z);
      sahne.add(isik);
    });
  }

  // Kapının dışı: güneşli çöl, uzakta kızıl kayalıklar, ara sıra yuvarlanan diken otu
  let dikenOtu = null;
  function disariKur(D) {
    const kum = new THREE.Mesh(new THREE.PlaneGeometry(40, 16), new THREE.MeshBasicMaterial({ color: 0xe0b878, fog: false }));
    kum.rotation.x = -Math.PI / 2;
    kum.position.set(0, -0.01, -D - 8);
    sahne.add(kum);
    const gok = dokuKanvas(512, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#7ab8e8');
      gr.addColorStop(0.62, '#f3d9a8');
      gr.addColorStop(0.63, '#d9a466');
      gr.addColorStop(1, '#e0b878');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#b5552e';
      [[30, 120, 70], [150, 135, 50], [300, 112, 110], [430, 128, 60]].forEach(([x, y, gen]) => {
        g.beginPath();
        g.moveTo(x - 14, 162);
        g.lineTo(x, y);
        g.lineTo(x + gen, y);
        g.lineTo(x + gen + 16, 162);
        g.fill();
      });
      g.fillStyle = '#4a7a3a';
      g.fillRect(222, 120, 9, 50);
      g.fillRect(212, 132, 8, 18);
      g.fillRect(233, 128, 8, 16);
      g.fillStyle = '#fff6d0';
      g.beginPath(); g.arc(400, 40, 18, 0, 7); g.fill();
    });
    const arka = new THREE.Mesh(new THREE.PlaneGeometry(40, 12), new THREE.MeshBasicMaterial({ map: gok, fog: false }));
    arka.position.set(0, 3.6, -D - 14);
    sahne.add(arka);
    dikenOtu = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: 0x8a6a3a, wireframe: true, fog: false }));
    dikenOtu.userData = { x: -30, sonraki: 6 };
    dikenOtu.position.set(-30, 0.32, -D - 3.5);
    sahne.add(dikenOtu);
  }

  function masaKur() {
    // Kare masa: koyu yeşil çuha, ahşap kenar, kalın ayaklar; üstünde lamba
    const cuha = dokuKanvas(256, 256, (g, w, h) => {
      g.fillStyle = '#2e5a3a'; g.fillRect(0, 0, w, h);
      for (let k = 0; k < 5000; k++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,20,5' : '90,140,90'},0.12)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });
    const ust = new THREE.Mesh(new THREE.BoxGeometry(MASA_YARI * 2, 0.06, MASA_YARI * 2), mat('#ffffff', { map: cuha, roughness: 0.95 }));
    ust.position.y = MASA_Y - 0.03;
    ust.receiveShadow = true;
    sahne.add(ust);
    const kenar = mat('#5a3014', { roughness: 0.5 });
    [[0, MASA_YARI, 0], [0, -MASA_YARI, 0], [MASA_YARI, 0, 1], [-MASA_YARI, 0, 1]].forEach(([x, z, d]) => {
      kutu(d ? 0.1 : MASA_YARI * 2 + 0.2, 0.1, d ? MASA_YARI * 2 + 0.2 : 0.1, kenar, x, MASA_Y - 0.01, z);
    });
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => kutu(0.14, MASA_Y - 0.06, 0.14, kenar, x * (MASA_YARI - 0.15), (MASA_Y - 0.06) / 2, z * (MASA_YARI - 0.15)));
    // Masanın tam üstündeki lamba
    const lamba = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.3, 20, 1, true), mat('#2c4a2c', { side: THREE.DoubleSide }));
    lamba.position.set(0, 3.05, 0);
    sahne.add(lamba);
    const ampul = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0 }));
    ampul.position.set(0, 2.92, 0);
    sahne.add(ampul);
    const ip = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.3, 4), mat('#222'));
    ip.position.set(0, 3.75, 0);
    sahne.add(ip);
  }

  const KABZA = V(0, -0.1, -0.09);   // tabancada elin tuttuğu yer (kabza)
  let KOL_X = -0.7, KOL_Y = 0.5;     // tabancayı tutan kolun duruşu
  let elim = null, kapiAcik = 0;
  function tabancaKur() {
    // Altıpatlar: namlu, top (6 hazneli), kabza, tetik korkuluğu
    tabanca = new THREE.Group();
    const metal = mat('#55585e', { metalness: 0.8, roughness: 0.35 });
    const ahsap = mat('#6b3a1a', { roughness: 0.6 });
    const namlu = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.32, 12), metal);
    namlu.rotation.x = Math.PI / 2;
    namlu.position.set(0, 0.03, 0.2);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), metal);
    top.rotation.x = Math.PI / 2;
    top.position.set(0, 0.015, 0.01);
    tabanca.userData.top = top;
    const govde = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.12), metal);
    govde.position.set(0, 0.02, 0.01);
    const kabza = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.16, 0.06), ahsap);
    kabza.position.set(0, -0.07, -0.08);
    kabza.rotation.x = -0.35;
    const korkuluk = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 12, Math.PI), metal);
    korkuluk.position.set(0, -0.025, 0.0);
    korkuluk.rotation.set(0, Math.PI / 2, Math.PI);
    [namlu, top, govde, kabza, korkuluk].forEach(m => { m.castShadow = true; tabanca.add(m); });
    // Ağzında flaş
    tabancaIsik = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0 }));
    tabancaIsik.position.set(0, 0.03, 0.4);
    tabanca.add(tabancaIsik);
    tabanca.scale.setScalar(0.75);
    // Birinci şahısta tabancayı tutan kendi elim (kabzanın üstünde) ve kolum
    elim = new THREE.Group();
    const avuc = new THREE.Mesh(new THREE.SphereGeometry(0.055, 14, 10), mat('#ffffff', { roughness: 0.9 }));
    avuc.position.copy(KABZA);
    avuc.scale.set(1.25, 1, 1.1);
    const parmak = new THREE.Mesh(new THREE.CapsuleGeometry(0.018, 0.05, 3, 8), avuc.material);
    parmak.position.set(0, -0.03, 0.0);
    parmak.rotation.x = 1.2;
    const kol = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.5, 4, 10), mat('#ffffff', { roughness: 0.9 }));
    kol.position.set(0, -0.3, -0.3);
    kol.rotation.x = -0.75;
    elim.add(avuc, parmak, kol);
    elim.visible = false;
    tabanca.add(elim);
    tabanca.visible = false;
    sahne.add(tabanca);
  }

  // Herkesin kendi tabancası masada, önünde (mumun öbür yanında) durur. Ceza alan kendi tabancasını
  // alır: masadaki tabanca gizlenir, yerine hareket eden tabanca oradan kalkar, iş bitince geri konur.
  let aktifTabancaNo = null;
  function masaTabancasiYap(kt) {
    const t = tabanca.clone();
    t.children.slice(5).forEach(c => t.remove(c));   // flaş ve el kopyalanmasın
    t.scale.setScalar(0.75);
    const a = koltukAcisi(kt.koltuk);
    // Oyuncunun sağında (yan > 0 = o oyuncunun sağı), kabzası ona dönük, namlusu masanın ortasına
    const ileri = MASA_YARI - 0.3, yan = 0.45;
    t.position.set(Math.sin(a) * ileri + Math.cos(a) * yan, MASA_Y + 0.035, Math.cos(a) * ileri - Math.sin(a) * yan);
    t.rotation.set(0, a + Math.PI + 0.5, Math.PI / 2);
    t.traverse(m => m.isMesh && (m.castShadow = true));
    sahne.add(t);
    kt.tabanca = t;
  }
  function tabancaMasaya(hemen) {
    const kt = koltuklar.find(k => k.no === aktifTabancaNo);
    aktifTabancaNo = null;
    if (!kt?.tabanca || hemen) {
      tabanca.visible = false;
      koltuklar.forEach(k => k.tabanca && (k.tabanca.visible = true));
      return;
    }
    hedefle(tabanca, kt.tabanca.position, kt.tabanca.rotation, 0.8);
    setTimeout(() => {
      if (aktifTabancaNo !== null) return;   // bu arada yine kullanıldı
      tabanca.visible = false;
      kt.tabanca.visible = true;
    }, 850);
  }

  // ---------- Koltuklar ve karakterler ----------
  function koltukAcisi(koltuk) { return (koltuk * Math.PI) / 2; }
  function koltukKonumu(koltuk, r = OTURMA, y = 0) {
    const a = koltukAcisi(koltuk);
    return V(Math.sin(a) * r, y, Math.cos(a) * r);
  }

  // oyuncular: [{ no, karakter, ad }], ben: benim no
  function kur(oyuncular, ben) {
    benimNo = ben;
    koltuklar.forEach(kt => { if (kt.k) sahne.remove(kt.k.kok); sahne.remove(kt.mumGrup); zarMasasiTemizle(kt); });
    icilen = null;
    koltuklar = [];
    noKoltuk = {};
    const n = oyuncular.length;
    oyuncular.forEach(p => {
      // Benden başlayarak saat yönünde: 4 kişide 0,1,2,3; 2 kişide karşılıklı; 3 kişide sağ-karşı
      const fark = (p.no - ben + n) % n;
      const koltuk = n === 2 ? fark * 2 : n === 3 ? [0, 1, 3][fark] : fark;
      noKoltuk[p.no] = koltuk;
      const kt = { no: p.no, koltuk };
      if (p.no !== ben) {
        kt.k = Karakterler.yap(p.karakter, { kiyafet: p.kiyafet });
        const pos = koltukKonumu(koltuk);
        kt.k.kok.position.copy(pos);
        kt.k.kok.rotation.y = koltukAcisi(koltuk) + Math.PI;
        sahne.add(kt.k.kok);
      }
      // Mum: oyuncunun önünde, masanın kenarına yakın, solunda
      kt.mumGrup = mumYap();
      const a = koltukAcisi(koltuk);
      // Mum oyuncunun solunda (tabanca sağında), yanındaki oyuncunun tabancasına da değmesin
      const ileri = MASA_YARI - 0.27, yan = -0.6;
      kt.mumGrup.position.set(Math.sin(a) * ileri + Math.cos(a) * yan, MASA_Y, Math.cos(a) * ileri - Math.sin(a) * yan);
      sahne.add(kt.mumGrup);
      zarMasasiKur(kt);
      koltuklar.push(kt);
    });
    yiginiTemizle();
    efektleriTemizle();
    dagitilan = null;
    tabanca.visible = false;
    if (window.__ortaTabanca) sahne.remove(window.__ortaTabanca);
    window.__ortaTabanca = ortaTabancaKur();
    const benimOyuncu = oyuncular.find(p => p.no === ben);
    const benimKarakter = benimOyuncu?.karakter;
    elim.children.forEach((m, i) => m.material.color.set(i < 2 ? Karakterler.elRengi(benimKarakter) : benimOyuncu?.kiyafet?.gomlek || Karakterler.gomlekRengi(benimKarakter)));
    gezginleriKur(oyuncular.map(p => p.karakter));
    oldum = 0;
    olumSure = 0;
    titreme = 0;
  }

  function mumYap() {
    const g = new THREE.Group();
    const tabak = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.02, 16), mat('#8a6a3a', { metalness: 0.6, roughness: 0.4 }));
    tabak.position.y = 0.01;
    const govde = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.22, 12), mat('#f3ead2', { roughness: 0.9 }));
    govde.position.y = 0.13;
    // erimiş damlalar
    const damla = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), govde.material);
    damla.position.set(0.032, 0.2, 0.01);
    damla.scale.y = 2;
    const fitil = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 4), mat('#222'));
    fitil.position.y = 0.255;
    const alev = new THREE.Group();
    alev.position.y = 0.29;
    const dis = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 }));
    dis.scale.set(1, 2.1, 1);
    const ic = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0xfff6c0 }));
    ic.scale.set(1, 1.8, 1);
    ic.position.y = -0.008;
    alev.add(dis, ic);
    const isik = new THREE.PointLight(0xffa040, 1.4, 1.6, 1.8);
    isik.position.y = 0.32;
    [tabak, govde, damla].forEach(m => (m.castShadow = true));
    g.add(tabak, govde, damla, fitil, alev, isik);
    g.scale.setScalar(0.85);
    g.userData = { alev, isik, yanik: 1, hedef: 1, duman: [] };
    return g;
  }

  function mumSondur(no) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt) return;
    kt.mumGrup.userData.hedef = 0;
    // Duman
    for (let i = 0; i < 6; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9a9a9a, transparent: true, opacity: 0.5, depthWrite: false }));
      d.position.copy(kt.mumGrup.position).add(V(0, 0.3, 0));
      sahne.add(d);
      animEkle(2.4, (p, t) => {
        d.position.y = kt.mumGrup.position.y + 0.3 + p * 0.8;
        d.position.x = kt.mumGrup.position.x + Math.sin(t * 3 + i) * 0.05 * p;
        d.scale.setScalar(1 + p * 3);
        d.material.opacity = 0.45 * (1 - p);
      }, () => sahne.remove(d), i * 0.18);
    }
  }

  // ---------- Kartlar ----------
  function kartMesh(yuz) {
    const on = yuz ? mat('#ffffff', { map: kartDoku[yuz], roughness: 0.6 }) : sirtMalzeme;
    const kenar = mat('#e8dcb8');
    // kutunun +y yüzü ön, -y yüzü sırt (masaya yatar)
    const m = new THREE.Mesh(new THREE.BoxGeometry(KART_G, 0.004, KART_Y), [kenar, kenar, sirtMalzeme, on, kenar, kenar]);
    m.castShadow = true;
    return m;
  }

  function yiginiTemizle() {
    while (yigin.children.length) yigin.remove(yigin.children[0]);
    while (acikGrup.children.length) acikGrup.remove(acikGrup.children[0]);
  }

  // Karakterlerin elindeki kart sayılarını güncelle
  function kartSayilari(oyuncular) {
    oyuncular.forEach(p => {
      const kt = koltuklar.find(k => k.no === p.no);
      // Dağıtım sürerken elinde sadece o ana kadar gelen kartlar görünür
      const adet = dagitilan ? Math.min(p.kartSayisi, dagitilan[p.no] || 0) : p.kartSayisi;
      if (kt?.k) Karakterler.kartlariAyarla(kt.k, p.canli ? adet : 0, sirtMalzeme);
    });
  }

  // ---------- El başı: masa kartı tanıtımı ve dağıtım ----------
  // Masanın ortasında büyük masa kartı havada döner (herkes görsün), sonra küçülüp kaybolur.
  // Ardından desteden kartlar sırası gelen oyuncudan başlayarak, her oyuncuya 5'er 5'er uçar.
  let dagitilan = null, tanitimKarti = null, dagitimParcalari = [];
  // Ekran çizilemediyse (telefon arka plandaydı vb.) süre dolunca dağıtım burada zorla bitirilir
  function dagitimBitir() {
    dagitilan = null;
    dagitimParcalari.forEach(m => sahne.remove(m));
    dagitimParcalari = [];
    if (tanitimKarti) sahne.remove(tanitimKarti);
    tanitimKarti = null;
    for (let i = animler.length - 1; i >= 0; i--) if (animler[i].dagitim) animler.splice(i, 1);
  }
  function dagitimBasla(tur, sirali, tanitim, kartAra, elKart, kartGeldi, bitti) {
    dagitimBitir();
    dagitilan = {};
    sirali.forEach(no => (dagitilan[no] = 0));
    const ilkAnim = animler.length;
    // Dönen büyük kart
    if (tanitimKarti) sahne.remove(tanitimKarti);
    const kenar = mat('#e8dcb8');
    const on = mat('#ffffff', { map: kartDoku[tur], roughness: 0.5, emissive: '#ffffff', emissiveMap: kartDoku[tur], emissiveIntensity: 0.25 });
    const arka = mat('#ffffff', { map: kartDoku.sirt, roughness: 0.5 });
    const kart = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.68, 0.012), [kenar, kenar, kenar, kenar, on, on]);
    const isik = new THREE.PointLight(0xffe0a0, 3, 2.5);
    const grup = new THREE.Group();
    grup.add(kart, isik);
    grup.position.set(0, MASA_Y + 0.75, 0);
    sahne.add(grup);
    tanitimKarti = grup;
    const t0 = tanitim / 1000;
    animEkle(t0, (p, t) => {
      const giris = Math.min(1, t / 0.35), cikis = Math.max(0, (p - 0.85) / 0.15);
      grup.scale.setScalar((1 - Math.pow(1 - giris, 3)) * (1 - cikis));
      grup.position.y = MASA_Y + 0.75 + Math.sin(t * 2.2) * 0.05 - cikis * 0.4;
      kart.rotation.y = t * 3.2;    // her iki yüzde de masa kartı var: dönerken herkes görür
      kart.rotation.z = Math.sin(t * 1.7) * 0.08;
    }, () => {
      sahne.remove(grup);
      if (tanitimKarti === grup) tanitimKarti = null;
    });
    void arka;
    // Ortadaki deste (dağıttıkça azalır)
    const deste = new THREE.Group();
    const toplam = sirali.length * elKart;
    for (let i = 0; i < toplam; i++) {
      const m = kartMesh(null);
      m.position.y = i * 0.004;
      m.rotation.y = (Math.random() - 0.5) * 0.08;
      deste.add(m);
    }
    deste.position.set(0, MASA_Y + 0.003, 0);
    deste.visible = false;
    sahne.add(deste);
    setTimeout(() => (deste.visible = true), tanitim * 0.85);
    dagitimParcalari.push(grup, deste);
    // Kartlar sırayla uçar
    let sayac = 0;
    sirali.forEach((no, pi) => {
      const kt = koltuklar.find(k => k.no === no);
      for (let i = 0; i < elKart; i++) {
        const gecikme = (tanitim + (pi * elKart + i) * kartAra) / 1000;
        const m = kartMesh(null);
        m.visible = false;
        sahne.add(m);
        dagitimParcalari.push(m);
        animEkle(0.42, p => {
          if (!m.visible) {
            m.visible = true;
            const ust = deste.children.pop();
            if (ust) deste.remove(ust);
          }
          const hedef = kt?.k ? kt.k.elKartlari.getWorldPosition(V()) : koltukKonumu(kt ? kt.koltuk : 0, 1.35, 1.25);
          const bas = V(0, MASA_Y + 0.1, 0);
          m.position.lerpVectors(bas, hedef, p);
          m.position.y += Math.sin(Math.PI * p) * 0.35;
          m.rotation.set(-0.3 * p, koltukAcisi(kt ? kt.koltuk : 0) + p * 6.3, 0);
        }, () => {
          sahne.remove(m);
          dagitilan && (dagitilan[no] = (dagitilan[no] || 0) + 1);
          kartGeldi(no);
          if (++sayac === toplam) {
            dagitilan = null;
            sahne.remove(deste);
            bitti();
          }
        }, gecikme);
      }
    });
    animler.slice(ilkAnim).forEach(a => (a.dagitim = true));
    if (!toplam) {
      dagitilan = null;
      bitti();
    }
  }

  // no numaralı oyuncu adet kartı kapalı olarak ortaya atar
  function kartAt(no, adet) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt) return;
    const a = koltukAcisi(kt.koltuk);
    const bas = kt.k ? kt.k.elKartlari.getWorldPosition(V()) : koltukKonumu(kt.koltuk, 1.3, 1.25);
    // Önceki atılanlar yığına karışır
    acikGrup.children.slice().forEach(m => { acikGrup.remove(m); yigin.add(m); });
    yigin.children.forEach((m, i) => { m.position.y = MASA_Y + 0.004 * (i + 1); });
    for (let i = 0; i < adet; i++) {
      const m = kartMesh(null);
      m.position.copy(bas);
      acikGrup.add(m);
      const hedef = V(Math.sin(a) * 0.32 + (i - (adet - 1) / 2) * 0.06 * Math.cos(a), MASA_Y + 0.004 * (yigin.children.length + i + 1) + 0.002,
        Math.cos(a) * 0.32 - (i - (adet - 1) / 2) * 0.06 * Math.sin(a));
      const don = new THREE.Euler(0, a + (Math.random() - 0.5) * 0.5, 0);
      m.rotation.set(-1, a, 0);
      hedefle(m, hedef, don, 0.45, i * 0.08, true);
    }
  }

  // Son atılan kartları aç: türlerine göre yüzleri gösterilir
  function kartlariAc(turler, yalanVar, masaKarti) {
    const kartlar = acikGrup.children.slice();
    turler.forEach((tur, i) => {
      const m = kartlar[i];
      if (!m) return;
      // Yüzü değiştir ve havada döndürerek çevir
      m.material[3] = mat('#ffffff', { map: kartDoku[tur], roughness: 0.6 });
      const yer = m.position.clone();
      const r0 = m.rotation.clone();
      const kaldir = V(yer.x * 0.7, MASA_Y + 0.35 + i * 0.01, yer.z * 0.7);
      animEkle(0.5, p => {
        const e = p < 0.5 ? p * 2 : 1;
        m.position.lerpVectors(yer, kaldir, Math.sin(Math.PI * Math.min(p, 1) * 0.5));
        m.rotation.set(r0.x, r0.y, r0.z + Math.PI * e);
      }, () => {
        m.rotation.set(r0.x, r0.y, r0.z + Math.PI);
        // Ters dönmüş kart: z ekseninde 180° = yüzü yukarı
        m.rotation.set(0, r0.y, 0);
        m.material = [m.material[0], m.material[1], m.material[3], m.material[2], m.material[4], m.material[5]];
        const dogru = tur === 'J' || tur === masaKarti;
        hedefle(m, V(yer.x * 0.6, MASA_Y + 0.02 + i * 0.004, yer.z * 0.6), m.rotation.clone(), 0.3);
        if (!dogru) {
          // Yalan olan kartın etrafına kırmızı çerçeve
          const c = new THREE.Mesh(new THREE.BoxGeometry(KART_G + 0.03, 0.002, KART_Y + 0.03), new THREE.MeshBasicMaterial({ color: 0xff2a2a }));
          c.position.y = -0.002;
          m.add(c);
        }
      }, i * 0.15);
    });
  }

  // ---------- Tabanca ----------
  // Tabanca cezalının kafasına gelir. Ben isem ekranın sağından şakağıma.
  function tabancaKaldir(no) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt) return;
    // Kendi masadaki tabancasını alır
    aktifTabancaNo = no;
    tabanca.position.copy(kt.tabanca.position);
    tabanca.quaternion.copy(kt.tabanca.quaternion);
    tabanca.userData.top.rotation.y = 0;
    kt.tabanca.visible = false;
    tabanca.visible = true;
    if (!kt.k) {
      // Birinci şahıs: kameraya göre yer (her karede kameraya bağlanır)
      tabanca.userData.bende = true;
      tabanca.userData.bendeOran = 0;
      tabanca.scale.setScalar(0.75);
      return;
    }
    tabanca.userData.bende = false;
    const k = kt.k;
    const kafa = k.kafa.getWorldPosition(V());
    const a = koltukAcisi(kt.koltuk) + Math.PI;
    // Kafanın sağ yanında, namlu şakağa dönük
    const sag = V(Math.cos(a), 0, -Math.sin(a));
    // Tabanca kafanın bana dönük yanında olsun (arkada kalıp görünmesin)
    const yan = kafa.clone().add(sag).distanceTo(kamera.position) < kafa.clone().sub(sag).distanceTo(kamera.position) ? 1 : -1;
    tabanca.scale.setScalar(1.0);
    // Her karede elin yerine taşınır (kare() içinde); buradan oraya uçarak gelir
    tabanca.userData.sahip = k;
    tabanca.userData.sahipOran = 0;
    tabanca.userData.bas = tabanca.position.clone();
    // O taraftaki eli tabancayı tutar gibi kalksın
    k.tabancaTut = true;
    k.tabancaKolu = 0;   // herkes tabancayı sağ eliyle alır
  }

  function tetikSonuc(no, oldu) {
    const kt = koltuklar.find(k => k.no === no);
    const top = tabanca.userData.top;
    animEkle(0.25, p => (top.rotation.y = (p * Math.PI) / 3));
    if (oldu) {
      tabancaIsik.material.opacity = 1;
      flasIsigi.position.copy(tabanca.getWorldPosition(V()));
      flasIsigi.intensity = 25;
      animEkle(0.35, p => {
        tabancaIsik.material.opacity = 1 - p;
        tabancaIsik.scale.setScalar(1 + p * 3);
        flasIsigi.intensity = 25 * (1 - p);
      });
      titreme = 0.6;
      if (kt?.k) {
        Karakterler.oldur(kt.k);
        setTimeout(() => sinekEkle(no), 2500);   // ölünün başında sinek dolaşır :)
        // geriye savrulma
        const k = kt.k;
        const yer = k.kok.position.clone();
        const geri = koltukKonumu(kt.koltuk, OTURMA + 0.18);
        animEkle(0.3, p => k.kok.position.lerpVectors(yer, geri, Math.sin(p * Math.PI) * 0.6 + p * 0.4));
      } else if (no === benimNo) {
        oldum = 0.0001;
      }
      mumSondur(no);
    } else {
      titreme = 0.12;
      if (kt?.k) Karakterler.tepki(kt.k, 'rahat', 1.6);
    }
    if (kt?.k) setTimeout(() => (kt.k.tabancaTut = false), 900);
    setTimeout(() => {
      tabanca.userData.bende = false;
      tabanca.userData.sahip = null;
      tabanca.scale.setScalar(0.75);
      tabancaMasaya();
    }, 1100);
  }

  // ---------- Animasyon yardımcıları ----------
  function animEkle(sure, adim, bitti, gecikme = 0) {
    animler.push({ sure, adim, bitti, t: -gecikme });
  }
  function hedefle(nesne, konum, donus, sure, gecikme = 0, yay) {
    if (!sure) {
      nesne.position.copy(konum);
      nesne.rotation.copy(donus);
      return;
    }
    const p0 = nesne.position.clone();
    const q0 = nesne.quaternion.clone();
    const q1 = new THREE.Quaternion().setFromEuler(donus);
    animEkle(sure, p => {
      const e = 1 - Math.pow(1 - p, 3);
      nesne.position.lerpVectors(p0, konum, e);
      if (yay) nesne.position.y += Math.sin(Math.PI * p) * 0.25;
      nesne.quaternion.slerpQuaternions(q0, q1, e);
    }, () => {
      nesne.position.copy(konum);
      nesne.quaternion.copy(q1);
    }, gecikme);
  }

  // ---------- Bakış ----------
  function bakisDinle() {
    const el = renderer.domElement;
    let surukle = null;
    // Fare: imlecin ekrandaki yerine göre kafa döner. Dokunmatik: sürükledikçe döner.
    window.addEventListener('pointermove', e => {
      if (e.pointerType === 'mouse') {
        // Kartların / düğmelerin üstündeyken kafa oynamasın (yoksa kart seçerken görüş kayar)
        if (e.target !== el) return;
        const x = e.clientX / window.innerWidth - 0.5;
        const y = Math.min(e.clientY / window.innerHeight, 0.62);
        bakis.hedefYaw = -Math.sign(x) * Math.max(0, Math.abs(x) - 0.06) * 2.1;
        bakis.hedefPitch = -(y - 0.4) * 0.6;
      } else if (surukle) {
        bakis.hedefYaw = surukle.yaw + ((e.clientX - surukle.x) / window.innerWidth) * 2.4;
        bakis.hedefPitch = surukle.pitch + ((e.clientY - surukle.y) / window.innerHeight) * 1.0;
        bakis.hedefYaw = Math.max(-1.1, Math.min(1.1, bakis.hedefYaw));
        bakis.hedefPitch = Math.max(-0.45, Math.min(0.4, bakis.hedefPitch));
      }
    });
    el.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'mouse') surukle = { x: e.clientX, y: e.clientY, yaw: bakis.hedefYaw, pitch: bakis.hedefPitch };
    });
    window.addEventListener('pointerup', () => (surukle = null));
    document.addEventListener('mouseleave', () => { bakis.hedefYaw = 0; bakis.hedefPitch = 0; });
    window.addEventListener('pointercancel', () => (surukle = null));
  }

  // Bot karakterin kafasını bir oyuncuya ya da masaya çevir
  function bak(no, hedefNo) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt?.k) return;
    const benim = kt.k.kok.position;
    let hedef;
    if (hedefNo === 'masa') hedef = V(0, MASA_Y, 0);
    else if (hedefNo === 'kart') hedef = null;
    else {
      const ht = koltuklar.find(k => k.no === hedefNo);
      if (!ht) return;
      hedef = ht.k ? ht.k.kafa.getWorldPosition(V()) : kamera.position.clone();
    }
    if (!hedef) {
      kt.k.hedefYaw = 0;
      kt.k.hedefPitch = 0.55;      // elindeki kartlara bakar
      return;
    }
    const a = kt.k.kok.rotation.y;
    const d = hedef.clone().sub(V(benim.x, 1.55, benim.z));
    // Karakterin kendi yönüne göre açı (karakter +z'ye bakar)
    const yerel = d.clone().applyAxisAngle(V(0, 1, 0), -a);
    kt.k.hedefYaw = Math.max(-1.3, Math.min(1.3, Math.atan2(yerel.x, yerel.z)));
    kt.k.hedefPitch = Math.max(-0.4, Math.min(0.7, -Math.atan2(yerel.y, Math.hypot(yerel.x, yerel.z))));
  }

  function tepki(no, tur, sure) {
    const kt = koltuklar.find(k => k.no === no);
    if (kt?.k) Karakterler.tepki(kt.k, tur, sure);
  }

  // Benim baktığım oyuncu (yoksa -1): botlar bakılınca geri bakar
  function baktigim() {
    let enIyi = -1, enAz = 0.28;
    const ileri = kamera.getWorldDirection(V());
    koltuklar.forEach(kt => {
      if (!kt.k || kt.k.olu) return;
      const d = kt.k.kafa.getWorldPosition(V()).sub(kamera.position).normalize();
      const aci = Math.acos(Math.min(1, ileri.dot(d)));
      if (aci < enAz) { enAz = aci; enIyi = kt.no; }
    });
    return enIyi;
  }

  // ---------- Her kare ----------
  function kare() {
    const hamDt = saat.getDelta();
    const dt = Math.min(0.1, hamDt);
    const t = saat.elapsedTime;
    // Animasyonlar (dağıtım gerçek saate göre ilerler: yavaş cihazda da zamanında biter)
    for (let i = animler.length - 1; i >= 0; i--) {
      const a = animler[i];
      a.t += a.dagitim ? Math.min(hamDt, 1) : dt;
      if (a.t < 0) continue;
      const p = Math.min(1, a.t / a.sure);
      a.adim(p, a.t);
      if (p >= 1) {
        animler.splice(i, 1);
        a.bitti && a.bitti();
      }
    }
    // Karakterler
    koltuklar.forEach(kt => {
      if (kt.k) {
        Karakterler.guncelle(kt.k, t, dt);
        // Tabancayı tutan kol kafaya kalkar (önce kol, sonra tabanca ele yerleşir)
        // Zehir içen: sağ el kadehle ağzına kalkar
        if (kt.k.icmeKolu !== null && kt.k.icmeKolu !== undefined) {
          const kol = kt.k.kollar[0];
          kol.omuz.rotation.x = -0.75;
          kol.omuz.rotation.y = 0.5;
        }
        kt.k.kollar.forEach((kol, i) => {
          if (kt.k.icmeKolu === 0 && i === 0) return;
          if (kt.k.tabancaTut && kt.k.tabancaKolu === i && tabanca.userData.nisan) {
            // Kol hedefe doğru uzanır (önce yatay dönüş, sonra yukarı-aşağı)
            const n = tabanca.userData.nisan();
            const omuzD = kol.omuz.getWorldPosition(V());
            const yerel = kt.k.govde.worldToLocal(n.clone()).sub(kt.k.govde.worldToLocal(omuzD.clone()));
            kol.omuz.rotation.order = 'YXZ';
            kol.omuz.rotation.y = Math.atan2(yerel.x, yerel.z);
            kol.omuz.rotation.x = -Math.atan2(yerel.y, Math.hypot(yerel.x, yerel.z));
          } else if (kt.k.tabancaTut && kt.k.tabancaKolu === i) {
            kol.omuz.rotation.x = KOL_X;
            kol.omuz.rotation.y = kol.y * KOL_Y;
          } else {
            kol.omuz.rotation.order = 'XYZ';
            kol.omuz.rotation.y = -kol.y * 0.42;
          }
        });
        const tu = tabanca.userData;
        if (tu.sahip === kt.k && kt.k.tabancaTut) {
          // Tabanca elde, namlusu şakağa dönük
          tu.sahipOran = Math.min(1, tu.sahipOran + dt * 1.6);
          const el = kt.k.kollar[kt.k.tabancaKolu].el.getWorldPosition(V());
          const kafa = tu.nisan ? tu.nisan() : kt.k.kafa.getWorldPosition(V());
          // Önce elden kafaya doğru çevir, sonra kabzası tam ele gelecek şekilde kaydır
          const o = 1 - Math.pow(1 - tu.sahipOran, 3);
          const yer = V();
          for (let d = 0; d < 2; d++) {
            tabanca.position.copy(d ? yer : el);
            tabanca.lookAt(kafa);
            yer.copy(el).sub(KABZA.clone().multiplyScalar(tabanca.scale.x).applyQuaternion(tabanca.quaternion));
          }
          tabanca.position.lerpVectors(tu.bas, yer, o);
          tabanca.lookAt(kafa);
        }
      }
      // Mum alevi titrer; sönerken küçülür
      const u = kt.mumGrup.userData;
      u.yanik += (u.hedef - u.yanik) * Math.min(1, dt * 5);
      const tit = 1 + Math.sin(t * 13 + kt.no * 2) * 0.08 + Math.sin(t * 29 + kt.no) * 0.05;
      u.alev.scale.set(u.yanik * (2 - tit), u.yanik * tit, u.yanik * (2 - tit));
      u.alev.visible = u.yanik > 0.03;
      u.alev.rotation.z = Math.sin(t * 5 + kt.no) * 0.08;
      u.isik.intensity = 1.4 * u.yanik * tit;
    });
    // Kapılar hafifçe sallanır
    kapiAcik += ((kapiyaYakin() ? 1 : 0) - kapiAcik) * Math.min(1, dt * 5);
    window.__kapilar?.forEach((m, i) => (m.rotation.y = (Math.sin(t * 0.9 + i) * 0.06 + kapiAcik * 1.25 + Math.sin(t * 9) * 0.08 * kapiAcik) * (i ? -1 : 1)));
    gezginleriGuncelle(t, dt);

    // Kamera (benim kafam)
    const ben = koltuklar.find(k => k.no === benimNo);
    const bk = ben ? ben.koltuk : 0;
    const a0 = koltukAcisi(bk);
    const h = 1 - Math.exp(-dt * 7);
    bakis.yaw += (bakis.hedefYaw - bakis.yaw) * h;
    bakis.pitch += (bakis.hedefPitch - bakis.pitch) * h;
    // Dik telefon ekranında yandakiler de görünsün diye kamera biraz geride ve yukarıda
    const dik = kamera.aspect < 0.8;
    // Ölünce: önce yere yığılır (oldum), 2.5 sn sonra hayalet gibi yükselip masayı izler (hayalet)
    const hayalet = Math.min(1, Math.max(0, (olumSure - 2.5) / 2));
    const dusus = oldum * (1 - hayalet);
    const goz = koltukKonumu(bk, OTURMA + (dik ? 0.95 : 0.24) + hayalet * 0.8, (dik ? 2.3 : 1.74) - dusus * 0.7 + hayalet * 1.1);
    kamera.position.copy(goz);
    const yon = a0 + Math.PI + bakis.yaw;
    const pitch = (dik ? -0.42 : -0.4) + bakis.pitch + dusus * 0.5 - hayalet * 0.3;
    kamera.rotation.set(0, 0, 0);
    kamera.rotation.order = 'YXZ';
    kamera.rotation.y = yon + Math.PI;
    kamera.rotation.x = pitch;
    kamera.rotation.z = dusus * 0.6;
    if (titreme > 0) {
      kamera.position.x += (Math.random() - 0.5) * titreme * 0.15;
      kamera.position.y += (Math.random() - 0.5) * titreme * 0.15;
      titreme = Math.max(0, titreme - dt * 1.2);
    }
    if (oldum > 0) {
      oldum = Math.min(1, oldum + dt * 1.2);
      olumSure += dt;
    }
    // Birinci şahısta tabanca kameraya bağlı: ekranın sağından şakağa
    if (tabanca.userData.bende) {
      tabanca.userData.bendeOran = Math.min(1, tabanca.userData.bendeOran + dt * 1.5);
      const o = 1 - Math.pow(1 - tabanca.userData.bendeOran, 3);
      const ileri = !!tabanca.userData.ileri;
      const yerel = ileri ? V(0.2, -0.3 + 0.12 * o, -0.5) : V(0.44 - 0.16 * o, -0.4 + 0.33 * o, -0.4);
      tabanca.position.copy(yerel.applyQuaternion(kamera.quaternion).add(kamera.position));
      tabanca.quaternion.copy(kamera.quaternion);
      tabanca.rotateY(ileri ? Math.PI : -1.0);
      tabanca.rotateZ(Math.sin(t * 40) * 0.01);
    }
    elim.visible = !!tabanca.userData.bende;
    icmeGuncelle(dt);
    dikenOtuGuncelle(dt);
    efektleriGuncelle(t, dt);
    renderer.render(sahne, kamera);
    etiketGuncelle();
  }

  // Ekrandaki etiketler için: oyuncunun kafasının ekrandaki yeri
  function ekranKonumu(no) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt?.k) return null;
    const p = kt.k.kafa.getWorldPosition(V()).add(V(0, 0.42, 0)).project(kamera);
    if (p.z > 1) return null;
    return { x: (p.x * 0.5 + 0.5) * window.innerWidth, y: (-p.y * 0.5 + 0.5) * window.innerHeight };
  }

  // =============================================================
  // ZAR OYUNU: deri bardaklar, 3D zarlar, zehirli kadehler
  // =============================================================
  const ZAR_B = 0.036;
  let zarMalzemeleri = null;
  // Zar yüzü: krem rengi, siyah noktalı (1 kırmızı)
  function zarYuzu(n) {
    return dokuKanvas(128, 128, (g, w) => {
      g.fillStyle = '#f4ecd8';
      g.fillRect(0, 0, w, w);
      g.strokeStyle = '#c9bb98';
      g.lineWidth = 6;
      g.strokeRect(3, 3, w - 6, w - 6);
      const d = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [1, 3], [3, 1], [3, 3]], 5: [[1, 1], [1, 3], [2, 2], [3, 1], [3, 3]], 6: [[1, 1], [1, 2], [1, 3], [3, 1], [3, 2], [3, 3]] }[n];
      g.fillStyle = n === 1 ? '#b3261e' : '#1a1a1a';
      d.forEach(([x, y]) => {
        g.beginPath();
        g.arc((x * w) / 4, (y * w) / 4, n === 1 ? 17 : 12, 0, 7);
        g.fill();
      });
    });
  }
  function zarYap() {
    if (!zarMalzemeleri) {
      // Kutunun yüz sırası: +x, -x, +y, -y, +z, -z  →  2, 5, 1, 6, 3, 4 (karşılıklı yüzlerin toplamı 7)
      zarMalzemeleri = [2, 5, 1, 6, 3, 4].map(n => mat('#ffffff', { map: zarYuzu(n), roughness: 0.4 }));
    }
    const dis = new THREE.Group();
    const ic = new THREE.Mesh(new THREE.BoxGeometry(ZAR_B, ZAR_B, ZAR_B), zarMalzemeleri);
    ic.castShadow = true;
    dis.add(ic);
    // Parlama halkası (sayılırken)
    const halka = new THREE.Mesh(new THREE.RingGeometry(ZAR_B * 0.75, ZAR_B * 1.05, 20), new THREE.MeshBasicMaterial({ color: 0x7dff6a, transparent: true, opacity: 0, side: THREE.DoubleSide }));
    halka.rotation.x = -Math.PI / 2;
    halka.position.y = -ZAR_B / 2 + 0.002;
    dis.add(halka);
    dis.userData = { ic, halka };
    return dis;
  }
  // Zarın üstünde n görünsün
  const YUZ_DONUS = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [0, 0, Math.PI / 2], 5: [0, 0, -Math.PI / 2], 3: [-Math.PI / 2, 0, 0], 4: [Math.PI / 2, 0, 0] };
  function zarAyarla(z, n) {
    z.userData.ic.rotation.set(...YUZ_DONUS[n]);
    z.rotation.y = Math.random() * Math.PI * 2;
    z.userData.deger = n;
  }

  // Deri zar bardağı (ağzı aşağı kapalı)
  function bardakYap() {
    const p = [[0.112, 0], [0.115, 0.012], [0.104, 0.02], [0.09, 0.16], [0.094, 0.172], [0.06, 0.18], [0, 0.18]].map(([x, y]) => new THREE.Vector2(x, y));
    const deri = Karakterler.malzeme('#6b3a1a', 'deri', { side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.LatheGeometry(p, 28), deri);
    m.castShadow = true;
    const g = new THREE.Group();
    g.add(m);
    // Dikiş şeridi
    const serit = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.012, 28, 1, true), Karakterler.malzeme('#c9a25a', 'deri', { side: THREE.DoubleSide }));
    serit.position.y = 0.09;
    serit.scale.set(0.98, 1, 0.98);
    g.add(serit);
    return g;
  }

  // Zehirli kadeh: cam + yeşil zehir (içilince boşalır, ters kapatılır)
  function kadehYap() {
    const g = new THREE.Group();
    const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.028, 0.085, 16, 1, true),
      new THREE.MeshStandardMaterial({ color: 0xd8f0e8, transparent: true, opacity: 0.35, roughness: 0.05, side: THREE.DoubleSide }));
    cam.position.y = 0.0425;
    const dip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), cam.material);
    dip.position.y = 0.005;
    const zehir = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.027, 0.06, 16),
      new THREE.MeshStandardMaterial({ color: 0x5aff3a, emissive: 0x2a9a1a, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 }));
    zehir.position.y = 0.04;
    // Kurukafa etiketi
    const etiket = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 0.035), new THREE.MeshBasicMaterial({ map: dokuKanvas(64, 64, (c, w) => {
      c.font = '48px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('☠️', w / 2, w / 2 + 3);
    }), transparent: true }));
    etiket.position.set(0, 0.045, 0.034);
    g.add(cam, dip, zehir, etiket);
    g.userData = { zehir, dolu: true };
    return g;
  }

  // Her koltuğa: bardak + 5 zar (bardağın altında) + 2 zehirli kadeh
  function zarMasasiKur(kt) {
    const a = koltukAcisi(kt.koltuk);
    const yer = (ileri, yan, y = MASA_Y) => V(Math.sin(a) * ileri + Math.cos(a) * yan, y, Math.cos(a) * ileri - Math.sin(a) * yan);
    kt.bardakYeri = yer(MASA_YARI - 0.4, 0, MASA_Y + 0.001);
    kt.bardak = bardakYap();
    kt.bardak.position.copy(kt.bardakYeri);
    sahne.add(kt.bardak);
    kt.zarlar = [];
    for (let i = 0; i < 5; i++) {
      const z = zarYap();
      const ac = (i / 5) * Math.PI * 2 + 0.3, r = i === 4 ? 0 : 0.055;
      z.position.copy(kt.bardakYeri).add(V(Math.cos(ac) * r, ZAR_B / 2 + 0.001, Math.sin(ac) * r));
      z.userData.yer = z.position.clone();
      zarAyarla(z, 1 + Math.floor(Math.random() * 6));
      sahne.add(z);
      kt.zarlar.push(z);
    }
    kt.kadehler = [].map(yan => {
      const k = kadehYap();
      k.position.copy(yer(MASA_YARI - 0.28, yan, MASA_Y + 0.001));
      k.userData.yer = k.position.clone();
      sahne.add(k);
      return k;
    });
  }
  function zarMasasiTemizle(kt) {
    [kt.bardak, ...(kt.zarlar || []), ...(kt.kadehler || [])].forEach(m => m && sahne.remove(m));
  }

  // Kadeh durumunu uygula (kalan bardak sayısına göre), oyuna sonradan girince
  function kadehleriAyarla(oyuncular) {
    oyuncular.forEach(p => {
      const kt = koltuklar.find(k => k.no === p.no);
      if (!kt?.kadehler) return;
      kt.kadehler.forEach((k, i) => {
        const dolu = i < p.bardak;
        k.userData.dolu = dolu;
        k.userData.zehir.visible = dolu;
        k.rotation.x = dolu ? 0 : Math.PI;   // içilen kadeh ters kapatılır
        k.position.copy(k.userData.yer).add(V(0, dolu ? 0 : 0.09, 0));
      });
      if (!p.canli && kt.bardak) kt.bardak.visible = kt.zarlar.forEach(z => (z.visible = false)) || false;
    });
  }

  // Tur başı: bardaklar kalkar-iner, sallanır (zarlar yeniden atılır)
  function bardaklariSalla(oyuncular, benimZarlarim) {
    animler.filter(a => a.bardak).forEach(a => (a.t = a.sure));
    koltuklar.forEach(kt => {
      const p = oyuncular.find(x => x.no === kt.no);
      if (!kt.bardak || !p?.canli) return;
      const b = kt.bardak, yer = kt.bardakYeri;
      kt.zarlar.forEach((z, i) => {
        zarAyarla(z, kt.no === benimNo && benimZarlarim ? benimZarlarim[i] : 1 + Math.floor(Math.random() * 6));
        z.userData.halka.material.opacity = 0;
        z.position.copy(z.userData.yer);
        z.scale.setScalar(1);
        z.visible = true;
      });
      const faz = Math.random() * 3;
      const a = { sure: 1.7, adim: (p2, t) => {
        // Bardak kalkar, havada sallanır, hızla masaya kapanır
        const kalk = p2 < 0.15 ? p2 / 0.15 : p2 > 0.8 ? 1 - (p2 - 0.8) / 0.2 : 1;
        b.position.set(yer.x + Math.sin(t * 38 + faz) * 0.035 * (p2 < 0.8 ? 1 : 0), yer.y + kalk * 0.12, yer.z + Math.cos(t * 31 + faz) * 0.03 * (p2 < 0.8 ? 1 : 0));
        b.rotation.set(Math.sin(t * 29 + faz) * 0.3 * kalk, 0, Math.cos(t * 33) * 0.3 * kalk);
        // Sallanırken zarlar bardağın içinde (görünmesin)
        kt.zarlar.forEach(z => (z.visible = p2 > 0.95));
      }, bitti: () => {
        b.position.copy(yer);
        b.rotation.set(0, 0, 0);
        kt.zarlar.forEach(z => (z.visible = true));
      }, t: 0, bardak: true };
      animler.push(a);
    });
  }

  // "Yalancı!" / "TAM!": bütün bardaklar kalkar, gerçek zarlar görünür, iddia edilen sayıdakiler
  // tek tek parlar. sayildi(n) her sayılan zarda çağrılır.
  // Açılışta zarlar büyür ve aralanır (uzaktan da okunsun); sayım yavaş yavaş yapılır
  const ACIK_OLCEK = 1.9, SAYIM_ARA = 0.6, SAYIM_BAS = 1.0;
  function zarlariAc(zarlar, yuz, joker, sayildi) {
    const sayilacak = [];
    koltuklar.forEach(kt => {
      const dz = zarlar[kt.no];
      if (!kt.bardak || !dz?.length) return;
      const merkez = kt.bardakYeri;
      kt.zarlar.forEach((z, i) => {
        zarAyarla(z, dz[i]);
        z.visible = true;
        const bas = z.userData.yer.clone();
        const hedef = merkez.clone().add(bas.clone().sub(merkez).multiplyScalar(2.1));
        hedef.y = MASA_Y + (ZAR_B * ACIK_OLCEK) / 2 + 0.001;
        z.userData.acikYer = hedef;
        animEkle(0.5, p => {
          const e = 1 - Math.pow(1 - p, 3);
          z.position.lerpVectors(bas, hedef, e);
          z.position.y += Math.sin(Math.PI * p) * 0.05;
          z.scale.setScalar(1 + (ACIK_OLCEK - 1) * e);
        }, null, 0.3);
        if (dz[i] === yuz || (joker && dz[i] === 1 && yuz !== 1)) sayilacak.push(z);
      });
      // Bardak kalkıp oyuncuya doğru devrilir
      const b = kt.bardak, yer = kt.bardakYeri.clone();
      // Bardak oyuncunun sağına kalkıp yana yatar (zarları ve görüşü kapatmasın)
      const ac0 = koltukAcisi(kt.koltuk);
      const sag = V(Math.cos(ac0), 0, -Math.sin(ac0));
      const ileri = V(Math.sin(ac0), 0, Math.cos(ac0));
      animEkle(0.5, p => {
        const e = 1 - Math.pow(1 - p, 3);
        b.position.set(yer.x + sag.x * 0.34 * e, yer.y + 0.12 * e, yer.z + sag.z * 0.34 * e);
        b.rotation.set(0, 0, 0);
        b.rotateOnWorldAxis(ileri, -1.6 * e);
      });
    });
    sayilacak.forEach((z, i) => {
      animEkle(0.45, p => {
        z.userData.halka.material.opacity = Math.min(1, p * 2) * 0.95;
        z.position.y = z.userData.acikYer.y + Math.sin(Math.PI * p) * 0.08;
      }, () => sayildi(i + 1, z.getWorldPosition(V())), SAYIM_BAS + i * SAYIM_ARA);
    });
    if (!sayilacak.length) setTimeout(() => sayildi(0, null), SAYIM_BAS * 1000);
    return sayilacak.length;
  }
  function bardaklariKapat() {
    koltuklar.forEach(kt => {
      if (!kt.bardak) return;
      const b = kt.bardak, bas = b.position.clone(), q0 = b.quaternion.clone(), q1 = new THREE.Quaternion();
      animEkle(0.45, p => {
        b.position.lerpVectors(bas, kt.bardakYeri, p);
        b.quaternion.slerpQuaternions(q0, q1, p);
      });
      kt.zarlar.forEach(z => {
        z.userData.halka.material.opacity = 0;
        const bas = z.position.clone(), s0 = z.scale.x;
        animEkle(0.45, p => {
          z.position.lerpVectors(bas, z.userData.yer, p);
          z.scale.setScalar(s0 + (1 - s0) * p);
        });
      });
    });
  }

  // Zehir içme: kaybeden önündeki dolu kadehi alır, ağzına götürür, diker
  let icilen = null;
  function icmeBasla(no) {
    const kt = koltuklar.find(k => k.no === no);
    const kadeh = kt?.kadehler?.find(k => k.userData.dolu);
    if (!kadeh) return;
    icilen = { kt, kadeh, oran: 0, bas: kadeh.position.clone(), ben: !kt.k, t: 0 };
    if (kt.k) {
      kt.k.icmeKolu = 0;
      Karakterler.ifade(kt.k, 'korkmus', 3);
    }
  }
  function icmeBitti(no, oldu) {
    const ic = icilen;
    icilen = null;
    const kt = koltuklar.find(k => k.no === no);
    if (ic) {
      ic.kadeh.userData.dolu = false;
      ic.kadeh.userData.zehir.visible = false;
      // Boş kadeh ters kapatılıp yerine konur
      const bas = ic.kadeh.position.clone(), q0 = ic.kadeh.quaternion.clone();
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0));
      const hedef = ic.kadeh.userData.yer.clone().add(V(0, 0.09, 0));
      animEkle(0.6, p => {
        ic.kadeh.position.lerpVectors(bas, hedef, p);
        ic.kadeh.position.y += Math.sin(Math.PI * p) * 0.1;
        ic.kadeh.quaternion.slerpQuaternions(q0, q1, p);
      });
    }
    if (kt?.k) {
      kt.k.icmeKolu = null;
      if (oldu) {
        Karakterler.oldur(kt.k);
        setTimeout(() => sinekEkle(no), 2500);
      } else {
        Karakterler.tepki(kt.k, 'titre', 2.2);
        Karakterler.ifade(kt.k, 'korkmus', 3);
        oksur(kt);
      }
    } else if (no === benimNo) {
      titreme = 0.25;
      if (oldu) oldum = 0.0001;
    }
    if (oldu) {
      mumSondur(no);
      kt?.zarlar?.forEach(z => (z.visible = false));
      if (kt?.bardak) kt.bardak.visible = false;
    }
  }
  // Zehir içen öksürür: yeşil kabarcıklar
  function oksur(kt) {
    for (let i = 0; i < 10; i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.015 + Math.random() * 0.015, 8, 6), new THREE.MeshBasicMaterial({ color: 0x7dff5a, transparent: true, opacity: 0.8 }));
      sahne.add(d);
      const yon = V((Math.random() - 0.5) * 0.3, 0.3 + Math.random() * 0.3, (Math.random() - 0.5) * 0.3);
      animEkle(1.2, p => {
        d.position.copy(kt.k.kafa.localToWorld(V(0, -0.05, 0.2))).add(yon.clone().multiplyScalar(p));
        d.material.opacity = 0.8 * (1 - p);
        d.scale.setScalar(1 + p * 2);
      }, () => sahne.remove(d), i * 0.12);
    }
  }
  // Her karede: kadeh elde (bot) ya da kameranın önünde (ben)
  function icmeGuncelle(dt) {
    if (!icilen) return;
    const ic = icilen;
    ic.oran = Math.min(1, ic.oran + dt * 1.4);
    ic.t += dt;
    const o = 1 - Math.pow(1 - ic.oran, 3);
    let hedef, egim;
    if (ic.ben) {
      hedef = V(0.05, -0.16 + o * 0.08, -0.32).applyQuaternion(kamera.quaternion).add(kamera.position);
      egim = Math.min(1.6, Math.max(0, (ic.t - 0.9) * 1.6));
      ic.kadeh.quaternion.copy(kamera.quaternion);
      ic.kadeh.rotateX(egim);
    } else {
      const kol = ic.kt.k.kollar[0];
      hedef = kol.el.getWorldPosition(V()).add(V(0, 0.03, 0));
      egim = Math.min(1.5, Math.max(0, (ic.t - 0.9) * 1.6));
      ic.kadeh.lookAt(ic.kt.k.kafa.getWorldPosition(V()));
      ic.kadeh.rotateX(-Math.PI / 2 + egim);
    }
    ic.kadeh.position.lerpVectors(ic.bas, hedef, o);
    // Zehir azalır
    ic.kadeh.userData.zehir.scale.y = Math.max(0.05, 1 - Math.max(0, ic.t - 1.1) * 0.9);
  }

  // ---------- ÖLÜMLÜ YATZY ----------
  const DIZ_OLCEK = 1.75;
  // Zarlar oyuncunun önünde, masada sıra hâlinde (herkes herkesin zarını görür)
  function dizilisYeri(kt, i) {
    const a = koltukAcisi(kt.koltuk);
    const ileri = MASA_YARI - 0.5, yan = (i - 2) * 0.095;
    return V(Math.sin(a) * ileri + Math.cos(a) * yan, MASA_Y + (ZAR_B * DIZ_OLCEK) / 2 + 0.001, Math.cos(a) * ileri - Math.sin(a) * yan);
  }
  // Atış: bardaklar sallanır, sonra zarlar dökülüp önde sıralanır
  function yatzyAt(oyuncular) {
    bardaklariSalla(oyuncular, null);
    setTimeout(() => {
      koltuklar.forEach(kt => {
        const p = oyuncular.find(x => x.no === kt.no);
        if (!kt.bardak || !p?.canli) return;
        // Bardak yana yatar
        const b = kt.bardak, yer = kt.bardakYeri.clone();
        const a0 = koltukAcisi(kt.koltuk);
        const sag = V(Math.cos(a0), 0, -Math.sin(a0)), ileriEks = V(Math.sin(a0), 0, Math.cos(a0));
        animEkle(0.4, q => {
          const e = 1 - Math.pow(1 - q, 3);
          b.position.set(yer.x + sag.x * 0.36 * e, yer.y + 0.1 * e, yer.z + sag.z * 0.36 * e);
          b.rotation.set(0, 0, 0);
          b.rotateOnWorldAxis(ileriEks, -1.6 * e);
        });
        kt.zarlar.forEach((z, i) => zarDok(kt, z, i, p.zarlar[i], i * 0.06));
      });
    }, 1500);
  }
  function zarDok(kt, z, i, deger, gecikme = 0) {
    const bas = kt.bardakYeri.clone().add(V(0, 0.05, 0));
    const hedef = dizilisYeri(kt, i);
    z.visible = true;
    zarAyarla(z, deger);
    z.userData.ic.rotation.x += Math.PI * 2;
    const r0 = z.userData.ic.rotation.clone(), son = new THREE.Euler(...YUZ_DONUS[deger]);
    animEkle(0.55, q => {
      const e = 1 - Math.pow(1 - q, 3);
      z.position.lerpVectors(bas, hedef, e);
      z.position.y += Math.sin(Math.PI * q) * 0.12;
      z.scale.setScalar(1 + (DIZ_OLCEK - 1) * e);
      z.userData.ic.rotation.set(r0.x + (son.x - r0.x) * e + (1 - e) * 6, son.y, son.z + (1 - e) * 4);
    }, () => {
      z.position.copy(hedef);
      z.userData.ic.rotation.copy(son);
    }, gecikme);
  }
  // Seçilen zarlar zıplayıp yeni değerle iner
  function yenidenAtAnim(no, indeksler, zarlar) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt) return;
    indeksler.forEach((i, j) => {
      const z = kt.zarlar[i];
      const yer = dizilisYeri(kt, i);
      zarAyarla(z, zarlar[i]);
      const son = z.userData.ic.rotation.clone();
      animEkle(0.6, q => {
        z.position.copy(yer);
        z.position.y += Math.sin(Math.PI * q) * 0.22;
        z.userData.ic.rotation.set(son.x + (1 - q) * 9, son.y + (1 - q) * 5, son.z);
      }, () => z.userData.ic.rotation.copy(son), j * 0.05);
    });
  }
  // Seçim işaretleri (benim zarlarım): seçilen zar yeşil halka
  function zarIsaretle(no, secili) {
    const kt = koltuklar.find(k => k.no === no);
    kt?.zarlar.forEach((z, i) => (z.userData.halka.material.opacity = secili.includes(i) ? 0.9 : 0));
  }
  // Masanın ortasındaki tek tabanca
  function ortaTabancaKur() {
    const t = tabanca.clone();
    t.children.slice(5).forEach(c => t.remove(c));
    t.scale.setScalar(0.85);
    t.position.set(0, MASA_Y + 0.04, 0);
    t.rotation.set(0, 0.7, Math.PI / 2);
    t.traverse(m => m.isMesh && (m.castShadow = true));
    sahne.add(t);
    koltuklar.forEach(kt => (kt.tabanca = t));
    return t;
  }
  // Ateş eden tabancayı alır ve hedefe doğrultur
  function nisanAl(atici, hedef) {
    const kh = koltuklar.find(k => k.no === hedef);
    const ka = koltuklar.find(k => k.no === atici);
    if (!kh || !ka) return;
    tabanca.userData.nisan = () => (kh.k ? kh.k.kafa.getWorldPosition(V()) : kamera.position.clone());
    tabanca.userData.ileri = !ka.k;
    tabancaKaldir(atici);
    if (ka.k) ka.k.tabancaKolu = 0;
    if (kh.k) {
      Karakterler.ifade(kh.k, 'korkmus', 4);
      Karakterler.tepki(kh.k, 'titre', 4);
    }
  }
  // Benim kafamı bir oyuncuya çevir (hedefe bakmak için)
  function oyuncuyaBak(no) {
    const kt = koltuklar.find(k => k.no === no);
    const ben = koltuklar.find(k => k.no === benimNo);
    if (!kt || !ben) return;
    const fark = ((kt.koltuk - ben.koltuk) + 4) % 4;
    bakis.hedefYaw = { 0: 0, 1: -0.85, 2: 0, 3: 0.85 }[fark];
    bakis.hedefPitch = 0.05;
  }
  function atesSonuc(atici, hedef, oldu) {
    const kh = koltuklar.find(k => k.no === hedef);
    const top = tabanca.userData.top;
    animEkle(0.25, q => (top.rotation.y = (q * Math.PI) / 3));
    if (oldu) {
      tabancaIsik.material.opacity = 1;
      flasIsigi.position.copy(tabanca.getWorldPosition(V()));
      flasIsigi.intensity = 25;
      animEkle(0.35, q => {
        tabancaIsik.material.opacity = 1 - q;
        tabancaIsik.scale.setScalar(1 + q * 3);
        flasIsigi.intensity = 25 * (1 - q);
      });
      titreme = 0.5;
      if (kh?.k) {
        Karakterler.oldur(kh.k);
        setTimeout(() => sinekEkle(hedef), 2500);
        const k = kh.k, yer = k.kok.position.clone(), geri = koltukKonumu(kh.koltuk, OTURMA + 0.18);
        animEkle(0.3, q => k.kok.position.lerpVectors(yer, geri, Math.sin(q * Math.PI) * 0.6 + q * 0.4));
      } else if (hedef === benimNo) oldum = 0.0001;
      mumSondur(hedef);
      kh?.zarlar?.forEach(z => (z.visible = false));
      if (kh?.bardak) kh.bardak.visible = false;
    } else {
      titreme = 0.1;
      if (kh?.k) Karakterler.tepki(kh.k, 'rahat', 1.6);
    }
    const ka = koltuklar.find(k => k.no === atici);
    if (ka?.k) setTimeout(() => (ka.k.tabancaTut = false), 900);
    setTimeout(() => {
      tabanca.userData.bende = false;
      tabanca.userData.sahip = null;
      tabanca.userData.nisan = null;
      tabanca.userData.ileri = false;
      tabanca.scale.setScalar(0.85);
      tabancaMasaya();
    }, 1100);
  }

  function zarKoltukTemizle() {
    koltuklar.forEach(zarMasasiTemizle);
    icilen = null;
  }

  // ---------- Saloonda gezenler ----------
  // Masada oturmayan karakterlerden biri piyano çalar, biri kapıdan girip bara gider, masaya gelip
  // kartlara bakar, sonra çıkıp gider. Kapı geçerken açılır.
  const YOL = {
    dis: V(0, 0, -9.5), kapi: V(0, 0, -6.4), iceri: V(0, 0, -4.6),
    bar1: V(-4.25, 0, -1.4), bar2: V(-4.25, 0, 1.0),
    masa2: V(0.85, 0, -2.85), masa1: V(2.95, 0, -0.9), masa3: V(-2.95, 0, -0.9),
  };
  let gezginler = [], piyanist = null;
  function gezginleriKur(kullanilan) {
    gezginler.forEach(g => sahne.remove(g.k.kok));
    if (piyanist) sahne.remove(piyanist.kok);
    gezginler = [];
    const bos = Karakterler.TURLER.filter(t => !kullanilan.includes(t)).sort(() => Math.random() - 0.5);
    while (bos.length < 2) bos.push(Karakterler.TURLER[Math.floor(Math.random() * 6)]);
    // Piyanist: piyanonun önünde oturur
    piyanist = Karakterler.yap(bos[0]);
    piyanist.kok.position.set(4.85, 0, 1.2);
    piyanist.kok.rotation.y = Math.PI / 2;
    piyanist.elKartlari.visible = false;
    piyanist.hedefPitch = 0.3;
    sahne.add(piyanist.kok);
    // Gezgin
    const k = Karakterler.yap(bos[1], { ayakta: true });
    k.kok.position.copy(YOL.dis);
    sahne.add(k.kok);
    gezginler.push({ k, plan: [], bekle: 3 + Math.random() * 5, hedef: null, durus: false });
  }

  function planYap() {
    const masa = ['masa1', 'masa2', 'masa3'].sort(() => Math.random() - 0.5);
    const bar = Math.random() < 0.5 ? 'bar1' : 'bar2';
    const p = ['kapi', 'iceri', bar, masa[0]];
    if (Math.random() < 0.5) p.push(masa[1]);
    p.push('iceri', 'kapi', 'dis');
    return p;
  }

  // A'dan B'ye düz yol masaya (ve sandalyelere) çok yaklaşıyorsa, masanın çevresinden dolaşan
  // ara noktalar döner. Dolaşma her zaman masanın arka tarafından olur (kameranın önünden geçmez).
  const MASA_UZAK = 2.6, DOLASMA_R = 3.1;
  function dolasma(a, b) {
    const ab = V(b.x - a.x, 0, b.z - a.z);
    const uz = ab.lengthSq();
    const t = uz ? Math.max(0, Math.min(1, -(a.x * ab.x + a.z * ab.z) / uz)) : 0;
    const enYakin = Math.hypot(a.x + ab.x * t, a.z + ab.z * t);
    if (enYakin >= MASA_UZAK) return [];
    const aci = v => {
      const x = Math.atan2(v.x, v.z);   // 0: kameranın olduğu taraf
      return x < 0 ? x + Math.PI * 2 : x;
    };
    const a1 = aci(a), a2 = aci(b);
    const adim = Math.max(1, Math.ceil(Math.abs(a2 - a1) / 0.7));
    const noktalar = [];
    for (let i = 0; i <= adim; i++) {
      const x = a1 + ((a2 - a1) * i) / adim;
      noktalar.push(V(Math.sin(x) * DOLASMA_R, 0, Math.cos(x) * DOLASMA_R));
    }
    return noktalar;
  }

  function kapiyaYakin() {
    return gezginler.some(g => Math.abs(g.k.kok.position.x) < 1.2 && Math.abs(g.k.kok.position.z + 6) < 1.3);
  }

  function gezginleriGuncelle(t, dt) {
    if (piyanist) {
      Karakterler.guncelle(piyanist, t, dt);
      const calar = typeof Ses !== 'undefined' && Ses.muzikCaliyor;
      piyanist.kollar.forEach((kol, i) => (kol.omuz.rotation.x = 0.6 + (calar ? Math.sin(t * 9 + i * 2) * 0.12 : 0)));
      piyanist.kafa.rotation.z = calar ? Math.sin(t * 4.4) * 0.12 : 0;
    }
    gezginler.forEach(g => {
      const k = g.k;
      Karakterler.guncelle(k, t, dt);
      if (g.bekle > 0) {
        g.bekle -= dt;
        k.yuru = Math.max(0, k.yuru - dt * 4);
        // Masada duruyorsa kartlara bakar, ara sıra güler / mırıldanır
        if (g.durus && Math.random() < dt * 0.25) Karakterler.tepki(k, Math.random() < 0.5 ? 'gul' : 'dusun', 1.4);
        return;
      }
      if (!g.hedef) {
        if (g.ara?.length) g.hedef = g.ara.shift();   // masanın etrafından dolaşan ara noktalar
        else {
          if (!g.plan.length) g.plan = planYap();
          g.ad = g.plan.shift();
          g.ara = dolasma(k.kok.position, YOL[g.ad]);
          g.ara.push(YOL[g.ad]);
          g.hedef = g.ara.shift();
        }
      }
      const p = k.kok.position;
      const fark = g.hedef.clone().sub(p);
      fark.y = 0;
      const mesafe = fark.length();
      if (mesafe < 0.08) {
        g.hedef = null;
        if (g.ara.length) return;   // ara noktadaydı, durmadan devam
        g.durus = g.ad.startsWith('masa');
        g.bekle = g.ad === 'dis' ? 6 + Math.random() * 14 : g.ad.startsWith('bar') ? 4 + Math.random() * 5 : g.durus ? 5 + Math.random() * 5 : 0;
        if (g.durus) {
          k.hedefAci = Math.atan2(-p.x, -p.z);   // masaya dön, kartlara eğil
          k.hedefPitch = 0.45;
        } else if (g.ad.startsWith('bar')) {
          k.hedefAci = -Math.PI / 2;
          k.hedefPitch = 0.1;
        }
        return;
      }
      k.hedefPitch = 0;
      k.yuru = Math.min(1, k.yuru + dt * 3);
      p.add(fark.normalize().multiplyScalar(Math.min(mesafe, dt * 1.15 * k.yuru)));
      k.hedefAci = Math.atan2(fark.x, fark.z);
    });
    gezginler.forEach(({ k }) => {
      if (k.hedefAci === undefined) return;
      let d = k.hedefAci - k.kok.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      k.kok.rotation.y += d * Math.min(1, dt * 5);
    });
  }

  function dikenOtuGuncelle(dt) {
    const u = dikenOtu.userData;
    if (u.sonraki > 0) {
      u.sonraki -= dt;
      return;
    }
    u.x += dt * 3.2;
    dikenOtu.position.x = u.x;
    dikenOtu.position.y = 0.32 + Math.abs(Math.sin(u.x * 1.3)) * 0.35;
    dikenOtu.rotation.z -= dt * 6;
    if (u.x > 20) {
      u.x = -20;
      u.sonraki = 15 + Math.random() * 25;
    }
  }

  // ---------- Küçük efektler: ter damlası, ölünün etrafında uçan sinek ----------
  const efektler = [];
  function terle(no, sure = 3) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt?.k) return;
    for (let i = 0; i < Math.round(sure * 3); i++) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), new THREE.MeshStandardMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.85, roughness: 0.1 }));
      d.scale.y = 1.5;
      d.visible = false;
      sahne.add(d);
      const yan = (Math.random() < 0.5 ? -1 : 1) * (0.12 + Math.random() * 0.06);
      animEkle(0.7, p => {
        d.visible = true;
        d.position.copy(kt.k.kafa.localToWorld(V(yan, 0.08 - p * 0.3, 0.1)));
        d.material.opacity = 0.85 * (1 - p);
      }, () => sahne.remove(d), i * 0.33 + Math.random() * 0.2);
    }
  }
  function sinekEkle(no) {
    const kt = koltuklar.find(k => k.no === no);
    if (!kt?.k) return;
    const s = new THREE.Group();
    const govde = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 5), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    const kanat = new THREE.Mesh(new THREE.PlaneGeometry(0.025, 0.012), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    kanat.position.y = 0.008;
    s.add(govde, kanat);
    sahne.add(s);
    efektler.push({ tur: 'sinek', s, kanat, kt, faz: Math.random() * 6 });
  }
  function efektleriGuncelle(t) {
    efektler.forEach(e => {
      const merkez = e.kt.k.kafa.getWorldPosition(V());
      const a = t * 3.1 + e.faz;
      e.s.position.set(merkez.x + Math.cos(a) * 0.3 + Math.sin(t * 7) * 0.04, merkez.y + 0.15 + Math.sin(t * 5.3) * 0.08, merkez.z + Math.sin(a * 1.3) * 0.3);
      e.kanat.rotation.x = Math.sin(t * 80) * 0.8;
    });
  }
  function efektleriTemizle() {
    efektler.splice(0).forEach(e => sahne.remove(e.s));
  }

  // ---------- Domates (mumu sönenler atar) ----------
  // kimden: atan oyuncu, hedef: vurulan oyuncu. Domates yay çizerek uçar, suratta ezilir.
  function domatesAt(kimden, hedef, bana) {
    const kaynak = koltuklar.find(k => k.no === kimden);
    const kt = koltuklar.find(k => k.no === hedef);
    if (!kaynak || !kt) return;
    const bas = kaynak.k ? kaynak.k.kafa.getWorldPosition(V()).add(V(0, 0.1, 0)) : kamera.position.clone().add(V(0, -0.2, 0));
    const d = new THREE.Group();
    const top = new THREE.Mesh(new THREE.SphereGeometry(0.06, 14, 10), new THREE.MeshStandardMaterial({ color: 0xd8261c, roughness: 0.35 }));
    top.scale.y = 0.85;
    const sap = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.03, 6), new THREE.MeshStandardMaterial({ color: 0x2f6b2a }));
    sap.position.y = 0.05;
    d.add(top, sap);
    sahne.add(d);
    const hedefNokta = () => (kt.k ? kt.k.kafa.localToWorld(V(0, 0.02, 0.18)) : kamera.position.clone().add(kamera.getWorldDirection(V()).multiplyScalar(0.25)));
    animEkle(0.7, p => {
      const h = hedefNokta();
      d.position.lerpVectors(bas, h, p);
      d.position.y += Math.sin(Math.PI * p) * 0.7;
      d.rotation.x += 0.3;
      d.rotation.z += 0.2;
    }, () => {
      sahne.remove(d);
      if (bana) return;   // ekrana yapışan domatesi oyun.js çizer
      if (!kt.k) return;
      // Suratta ezilmiş domates (birkaç saniye kalır, sonra kayıp düşer)
      const ezik = new THREE.Mesh(new THREE.SphereGeometry(0.09, 14, 8), new THREE.MeshStandardMaterial({ color: 0xc81e14, roughness: 0.3, transparent: true, opacity: 0.95 }));
      ezik.scale.set(1.2, 0.9, 0.25);
      ezik.position.set((Math.random() - 0.5) * 0.08, 0.02, 0.17);
      kt.k.kafa.add(ezik);
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.SphereGeometry(0.02, 6, 5), ezik.material);
        const yon = V(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.2).normalize();
        const b0 = kt.k.kafa.localToWorld(V(0, 0, 0.2));
        sahne.add(c);
        animEkle(0.6, p => {
          c.position.copy(b0).add(yon.clone().multiplyScalar(p * 0.4));
          c.position.y -= p * p * 0.5;
        }, () => sahne.remove(c));
      }
      Karakterler.tepki(kt.k, 'zipla', 1.2);
      Karakterler.ifade(kt.k, 'kizgin', 3);
      animEkle(5, p => {
        ezik.position.y = 0.02 - Math.max(0, p - 0.6) * 0.3;
        ezik.material.opacity = 0.95 * Math.min(1, (1 - p) * 3);
      }, () => kt.k.kafa.remove(ezik));
    });
  }

  // ---------- Online / ses için ----------
  const kt_ = no => koltuklar.find(k => k.no === no)?.k;
  // Mikrofondan gelen ses seviyesi (0-1): ağzı oynatır
  function konusmaSeviyesi(no, v) {
    const k = kt_(no);
    if (k) k.konusmaHedef = Math.max(k.konusmaHedef, v);
  }
  function konus(no, sure) {
    const k = kt_(no);
    if (k) Karakterler.konus(k, sure);
  }
  function ifade(no, tur, sure) {
    const k = kt_(no);
    if (k) Karakterler.ifade(k, tur, sure);
  }
  // Başka bir oyuncunun kafasını (kendi ekranında baktığı yöne göre) çevir
  function bakisUygula(no, yaw, pitch) {
    const k = kt_(no);
    if (!k) return;
    k.hedefYaw = Math.max(-1.3, Math.min(1.3, yaw));
    k.hedefPitch = Math.max(-0.4, Math.min(0.7, 0.12 - pitch));
  }
  // Oyuna sonradan girince: ölmüş olanlar hemen ölü görünsün, mumları sönük olsun
  function olumleriUygula(oyuncular) {
    oyuncular.forEach(p => {
      if (p.canli) return;
      const kt = koltuklar.find(k => k.no === p.no);
      if (!kt) return;
      kt.mumGrup.userData.hedef = kt.mumGrup.userData.yanik = 0;
      if (kt.k && !kt.k.olu) {
        Karakterler.oldur(kt.k);
        kt.k.oluOran = 1;
        sinekEkle(p.no);
      }
      if (p.no === benimNo) {
        oldum = 1;
        olumSure = 5;
      }
    });
  }

  return {
    yatzyAt, yenidenAtAnim, zarIsaretle, nisanAl, atesSonuc, oyuncuyaBak, ortaTabancaKur,
    bardaklariSalla, zarlariAc, bardaklariKapat, icmeBasla, icmeBitti, kadehleriAyarla,
    domatesAt, terle, sinekEkle, efektleriTemizle, konusmaSeviyesi, konus, ifade, bakisUygula, olumleriUygula,
    dagitimBasla, dagitimBitir, baslat, kur, kartSayilari, kartAt, kartlariAc, yiginiTemizle, tabancaKaldir, tetikSonuc, mumSondur,
    bak, tepki, baktigim, ekranKonumu, kartResmi,
    set etiketGuncelle(f) { etiketGuncelle = f; },
    get bakis() { return bakis; },
    get _ic() { return { tabanca, kamera, sahne, koltuklar }; },  // test için
  };
})();
