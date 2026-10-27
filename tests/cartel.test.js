const test = require('node:test');
const assert = require('node:assert/strict');
const Cartel = require('../cartel.js');

const PLANISFERIO = 352 / 654; // alto/ancho del planisferio de contorno
const cm = (mm) => Math.round(mm) / 10;
const cerca = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

function util(tamano, orientacion) {
    const p = Cartel.pagina(tamano, orientacion);
    return { w: p.w - 2 * Cartel.PADDING_MM, h: p.h - 2 * Cartel.PADDING_MM };
}

test('la rotación de 90/270 invierte el aspecto', () => {
    assert.equal(Cartel.aspectoRotado(1000, 500, 0), 0.5);
    assert.equal(Cartel.aspectoRotado(1000, 500, 90), 2);
    assert.equal(Cartel.aspectoRotado(1000, 500, 180), 0.5);
    assert.equal(Cartel.aspectoRotado(1000, 500, 270), 2);
});

test('planisferio en A4: 1, 2, 3, 4 y 6 hojas, en la orientación que lo deja más grande', () => {
    const ops = Cartel.opcionesDeHojas(PLANISFERIO, 'a4');
    assert.deepEqual(ops.map(o => [o.hojas, o.cols, o.filas, o.orientacion, cm(o.anchoMm)]), [
        [1, 1, 1, 'horizontal', 28.7],
        [2, 2, 1, 'vertical', 40.0],
        [3, 3, 1, 'vertical', 53.3],
        [4, 2, 2, 'horizontal', 57.4],
        [6, 3, 2, 'horizontal', 74.3],
    ]);
});

test('una imagen alta crece primero hacia abajo: después de 1 hoja viene 2 (1 × 2)', () => {
    const ops = Cartel.opcionesDeHojas(2, 'a4');
    assert.deepEqual(ops.map(o => o.hojas), [1, 2, 3, 6, 9]);
    assert.deepEqual([ops[1].cols, ops[1].filas, ops[1].orientacion], [1, 2, 'vertical']);
});

test('imagen cuadrada: 1, 2, 4… y ante empate gana la hoja vertical', () => {
    const ops = Cartel.opcionesDeHojas(1, 'a4');
    assert.deepEqual(ops.slice(0, 3).map(o => [o.hojas, o.cols, o.filas, o.orientacion]),
        [[1, 1, 1, 'vertical'], [2, 2, 1, 'vertical'], [4, 2, 2, 'vertical']]);
});

test('cada opción usa todas sus hojas, entra en ellas y crece respecto de la anterior', () => {
    for (const a of [PLANISFERIO, 1, 2, 0.25, 3.7, 1 / 3.7]) {
        for (const tamano of ['a4', 'letter', 'legal']) {
            const ops = Cartel.opcionesDeHojas(a, tamano);
            assert.equal(ops.length, 5);
            ops.forEach((o, i) => {
                const u = util(tamano, o.orientacion);
                assert.equal(o.hojas, o.cols * o.filas);
                cerca(o.altoMm, o.anchoMm * a);
                assert.equal(Math.ceil((o.anchoMm - 0.05) / u.w), o.cols, 'columnas justas');
                assert.equal(Math.ceil((o.altoMm - 0.05) / u.h), o.filas, 'filas justas');
                if (i > 0) {
                    assert.ok(o.hojas > ops[i - 1].hojas);
                    assert.ok(o.anchoMm > ops[i - 1].anchoMm);
                }
            });
        }
    }
});

test('por medida: justo dos anchos útiles son 2 columnas, no 3', () => {
    const c = Cartel.cartelPorMedida(0.5, 'a4', 'width', 40);
    assert.deepEqual([c.hojas, c.cols, c.filas, c.orientacion], [2, 2, 1, 'vertical']);
    cerca(c.anchoMm, 400);
    cerca(c.altoMm, 200);
});

test('por medida: el tamaño de cada opción pedido en cm da la misma cantidad de hojas', () => {
    for (const a of [PLANISFERIO, 1, 2, 0.25, 3.7]) {
        for (const tamano of ['a4', 'letter', 'legal']) {
            for (const o of Cartel.opcionesDeHojas(a, tamano)) {
                assert.equal(Cartel.cartelPorMedida(a, tamano, 'width', o.anchoMm / 10).hojas, o.hojas);
                assert.equal(Cartel.cartelPorMedida(a, tamano, 'height', o.altoMm / 10).hojas, o.hojas);
            }
        }
    }
});

test('por medida elige la orientación que usa menos hojas', () => {
    const ancho = Cartel.cartelPorMedida(PLANISFERIO, 'a4', 'width', 28);
    assert.deepEqual([ancho.hojas, ancho.orientacion], [1, 'horizontal']);
    // alto 50 cm de una imagen 1:2 → 25 × 50 cm: vertical 2 × 2 = 4, horizontal 1 × 3 = 3
    const alto = Cartel.cartelPorMedida(2, 'a4', 'height', 50);
    assert.deepEqual([alto.hojas, alto.cols, alto.filas, alto.orientacion], [3, 1, 3, 'horizontal']);
    cerca(alto.anchoMm, 250);
});

test('partir: los pedazos cubren la imagen entera, en orden de lectura', () => {
    const cartel = Cartel.opcionesDeHojas(PLANISFERIO, 'a4')[4]; // 3 × 2 horizontal
    const { paginaMm, hojas } = Cartel.partirEnHojas(cartel, 'a4');
    assert.deepEqual(paginaMm, { w: 297, h: 210 });
    assert.deepEqual(hojas.map(h => [h.col, h.fila]), [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]);
    for (const h of hojas) {
        cerca(h.recorte.x, h.col * cartel.anchoMm / 3);
        cerca(h.recorte.y, h.fila * cartel.altoMm / 2);
        cerca(h.recorte.w, cartel.anchoMm / 3);
        cerca(h.recorte.h, cartel.altoMm / 2);
    }
    const ultima = hojas[hojas.length - 1];
    cerca(ultima.recorte.x + ultima.recorte.w, cartel.anchoMm);
    cerca(ultima.recorte.y + ultima.recorte.h, cartel.altoMm);
});

test('partir: cada pedazo va centrado en su hoja y dentro del margen', () => {
    for (const tamano of ['a4', 'letter', 'legal']) {
        for (const cartel of Cartel.opcionesDeHojas(PLANISFERIO, tamano)) {
            const { paginaMm, hojas } = Cartel.partirEnHojas(cartel, tamano);
            for (const h of hojas) {
                cerca(h.left, (paginaMm.w - h.recorte.w) / 2);
                cerca(h.top, (paginaMm.h - h.recorte.h) / 2);
                assert.ok(h.left >= Cartel.PADDING_MM - 0.05);
                assert.ok(h.top >= Cartel.PADDING_MM - 0.05);
            }
        }
    }
});

test('partir: sólo los bordes que se tocan con otra hoja llevan línea', () => {
    const { hojas } = Cartel.partirEnHojas(
        { hojas: 6, cols: 3, filas: 2, orientacion: 'vertical', anchoMm: 600, altoMm: 400 }, 'a4');
    const bordes = (c, f) => hojas.find(h => h.col === c && h.fila === f).bordes;
    assert.deepEqual(bordes(0, 0), { izq: false, der: true, arriba: false, abajo: true });
    assert.deepEqual(bordes(1, 0), { izq: true, der: true, arriba: false, abajo: true });
    assert.deepEqual(bordes(2, 1), { izq: true, der: false, arriba: true, abajo: false });
    const una = Cartel.partirEnHojas(
        { hojas: 1, cols: 1, filas: 1, orientacion: 'vertical', anchoMm: 200, altoMm: 100 }, 'a4');
    assert.deepEqual(una.hojas[0].bordes, { izq: false, der: false, arriba: false, abajo: false });
    assert.deepEqual(Cartel.lineasDeCorte(una.hojas[0], una.paginaMm), []);
});

test('líneas de corte: pegadas por fuera del pedazo y de borde a borde del papel', () => {
    const { paginaMm, hojas } = Cartel.partirEnHojas(
        { hojas: 4, cols: 2, filas: 2, orientacion: 'vertical', anchoMm: 400, altoMm: 400 }, 'a4');
    // cada pedazo es 200 × 200, centrado en 210 × 297: left 5, top 48,5
    const [arribaIzq] = hojas;
    const lineas = Cartel.lineasDeCorte(arribaIzq, paginaMm);
    assert.equal(lineas.length, 2);
    const [der, abajo] = lineas;
    const d = Cartel.GROSOR_CORTE_MM / 2;
    cerca(der.x1, 205 + d); cerca(der.x2, 205 + d); assert.equal(der.y1, 0); assert.equal(der.y2, 297);
    cerca(abajo.y1, 248.5 + d); cerca(abajo.y2, 248.5 + d); assert.equal(abajo.x1, 0); assert.equal(abajo.x2, 210);
    const abajoDer = Cartel.lineasDeCorte(hojas[3], paginaMm);
    cerca(abajoDer[0].x1, 5 - d); // izquierda
    cerca(abajoDer[1].y1, 48.5 - d); // arriba
});

test('colocación: rotada y centrada, la imagen ocupa exactamente el cartel', () => {
    const cartel = { anchoMm: 300, altoMm: 200 };
    for (const rotacion of [0, 90, 180, 270]) {
        const c = Cartel.colocacionDeImagen(cartel, rotacion);
        const deCostado = rotacion % 180 !== 0;
        // el <image> lleva las medidas de la imagen sin rotar
        assert.deepEqual([c.width, c.height], deCostado ? [200, 300] : [300, 200]);
        // aplicar translate(tx ty) rotate(r) a sus esquinas tiene que dar el rectángulo del cartel
        const rad = rotacion * Math.PI / 180;
        const xs = [], ys = [];
        for (const [x, y] of [[c.x, c.y], [c.x + c.width, c.y], [c.x, c.y + c.height], [c.x + c.width, c.y + c.height]]) {
            xs.push(c.tx + x * Math.cos(rad) - y * Math.sin(rad));
            ys.push(c.ty + x * Math.sin(rad) + y * Math.cos(rad));
        }
        cerca(Math.min(...xs), 0); cerca(Math.max(...xs), 300);
        cerca(Math.min(...ys), 0); cerca(Math.max(...ys), 200);
        assert.equal(c.transform, `translate(${c.tx} ${c.ty}) rotate(${rotacion})`);
    }
});

test('describir: cantidad, grilla y medida en cm con coma', () => {
    assert.equal(Cartel.describirCartel({ hojas: 4, cols: 2, filas: 2, anchoMm: 574, altoMm: 308.94 }),
        '4 hojas (2 × 2) · 57,4 × 30,9 cm');
    assert.equal(Cartel.describirCartel({ hojas: 1, cols: 1, filas: 1, anchoMm: 287, altoMm: 154.47 }),
        '1 hoja (1 × 1) · 28,7 × 15,4 cm');
});
