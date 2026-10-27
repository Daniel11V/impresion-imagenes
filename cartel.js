/**
 * Cartel: una sola imagen impresa más grande que una hoja, partida en varias hojas que se
 * recortan al ras y se unen. Cálculo puro, sin DOM: lo usa index.html (global `Cartel`) y los
 * tests de Node (`node --test tests/`). Medidas en mm.
 *
 * Reglas:
 *   - Para cada cantidad de hojas, la grilla (columnas × filas) y la orientación (vertical u
 *     horizontal) que dejan la imagen más grande. Ante empate, vertical y menos columnas.
 *   - Los pedazos son todos iguales y van centrados en su hoja, con el mismo margen que el modo
 *     Varias imágenes.
 *   - Sólo los bordes que se tocan con otra hoja llevan línea de corte.
 */
(function (raiz) {
    'use strict';

    const PADDING_MM = 5; // mismo margen que el modo Varias imágenes
    const TOLERANCE_MM = 0.05;
    const MAX_HOJAS = 400;
    const GROSOR_CORTE_MM = 0.3;
    const TRAZO_CORTE = '2 1.5'; // stroke-dasharray, en mm

    const TAMANOS = {
        a4: { w: 210, h: 297 },
        letter: { w: 215.9, h: 279.4 },
        legal: { w: 215.9, h: 355.6 }
    };
    const ORIENTACIONES = ['vertical', 'horizontal'];

    /** Alto/ancho tal como queda en la hoja después de rotar. */
    function aspectoRotado(anchoPx, altoPx, rotacion) {
        return rotacion % 180 !== 0 ? anchoPx / altoPx : altoPx / anchoPx;
    }

    function pagina(tamano, orientacion) {
        const s = TAMANOS[tamano];
        return orientacion === 'horizontal' ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
    }

    function areaUtil(tamano, orientacion) {
        const p = pagina(tamano, orientacion);
        return { w: p.w - 2 * PADDING_MM, h: p.h - 2 * PADDING_MM };
    }

    /**
     * Las primeras `cuantas` cantidades de hojas en las que la imagen crece, cada una con la
     * imagen en su tamaño máximo. Arranca siempre en 1 hoja.
     */
    function opcionesDeHojas(aspecto, tamano, cuantas = 5) {
        const opciones = [];
        let anchoAnterior = 0;
        for (let n = 1; n <= MAX_HOJAS && opciones.length < cuantas; n++) {
            let mejor = null;
            for (const orientacion of ORIENTACIONES) {
                const u = areaUtil(tamano, orientacion);
                for (let cols = 1; cols <= n; cols++) {
                    if (n % cols !== 0) continue;
                    const filas = n / cols;
                    const ancho = Math.min(cols * u.w, filas * u.h / aspecto);
                    if (!mejor || ancho > mejor.anchoMm + TOLERANCE_MM) {
                        mejor = { hojas: n, cols, filas, orientacion, anchoMm: ancho, altoMm: ancho * aspecto };
                    }
                }
            }
            if (mejor.anchoMm > anchoAnterior + TOLERANCE_MM) {
                opciones.push(mejor);
                anchoAnterior = mejor.anchoMm;
            }
        }
        return opciones;
    }

    /** La imagen a una medida fija (ancho o alto, en cm), en la orientación que use menos hojas. */
    function cartelPorMedida(aspecto, tamano, dimension, valorCm) {
        const ancho = dimension === 'height' ? valorCm * 10 / aspecto : valorCm * 10;
        const alto = ancho * aspecto;
        let mejor = null;
        for (const orientacion of ORIENTACIONES) {
            const u = areaUtil(tamano, orientacion);
            const cols = Math.max(1, Math.ceil((ancho - TOLERANCE_MM) / u.w));
            const filas = Math.max(1, Math.ceil((alto - TOLERANCE_MM) / u.h));
            if (!mejor || cols * filas < mejor.hojas) {
                mejor = { hojas: cols * filas, cols, filas, orientacion, anchoMm: ancho, altoMm: alto };
            }
        }
        return mejor;
    }

    /** Una hoja por pedazo, de izquierda a derecha y de arriba abajo. */
    function partirEnHojas(cartel, tamano) {
        const paginaMm = pagina(tamano, cartel.orientacion);
        const w = cartel.anchoMm / cartel.cols;
        const h = cartel.altoMm / cartel.filas;
        const hojas = [];
        for (let fila = 0; fila < cartel.filas; fila++) {
            for (let col = 0; col < cartel.cols; col++) {
                hojas.push({
                    col,
                    fila,
                    recorte: { x: col * w, y: fila * h, w, h },
                    left: (paginaMm.w - w) / 2,
                    top: (paginaMm.h - h) / 2,
                    bordes: {
                        izq: col > 0,
                        der: col < cartel.cols - 1,
                        arriba: fila > 0,
                        abajo: fila < cartel.filas - 1
                    }
                });
            }
        }
        return { paginaMm, hojas };
    }

    /**
     * Segmentos de la línea punteada de una hoja: pegados por fuera del pedazo (el corte no se
     * lleva dibujo) y de borde a borde del papel (el corte separa la hoja entera).
     */
    function lineasDeCorte(hoja, paginaMm) {
        const d = GROSOR_CORTE_MM / 2;
        const izq = hoja.left - d;
        const der = hoja.left + hoja.recorte.w + d;
        const arriba = hoja.top - d;
        const abajo = hoja.top + hoja.recorte.h + d;
        const lineas = [];
        if (hoja.bordes.izq) lineas.push({ x1: izq, y1: 0, x2: izq, y2: paginaMm.h });
        if (hoja.bordes.der) lineas.push({ x1: der, y1: 0, x2: der, y2: paginaMm.h });
        if (hoja.bordes.arriba) lineas.push({ x1: 0, y1: arriba, x2: paginaMm.w, y2: arriba });
        if (hoja.bordes.abajo) lineas.push({ x1: 0, y1: abajo, x2: paginaMm.w, y2: abajo });
        return lineas;
    }

    /**
     * Dónde va la imagen original en coordenadas del cartel (mm): centrada y rotada para ocupar
     * exactamente anchoMm × altoMm. `width`/`height` son las medidas SIN rotar (de costado van
     * intercambiadas); `transform` es para un <image> de SVG.
     */
    function colocacionDeImagen(cartel, rotacion) {
        const deCostado = rotacion % 180 !== 0;
        const width = deCostado ? cartel.altoMm : cartel.anchoMm;
        const height = deCostado ? cartel.anchoMm : cartel.altoMm;
        const tx = cartel.anchoMm / 2;
        const ty = cartel.altoMm / 2;
        return {
            x: -width / 2, y: -height / 2, width, height, tx, ty,
            transform: `translate(${tx} ${ty}) rotate(${rotacion})`
        };
    }

    function cmTexto(mm) {
        return (Math.round(mm) / 10).toFixed(1).replace('.', ',');
    }

    function describirCartel(c) {
        return `${c.hojas} ${c.hojas === 1 ? 'hoja' : 'hojas'} (${c.cols} × ${c.filas}) · `
            + `${cmTexto(c.anchoMm)} × ${cmTexto(c.altoMm)} cm`;
    }

    const api = {
        PADDING_MM, GROSOR_CORTE_MM, TRAZO_CORTE, TAMANOS,
        aspectoRotado, pagina, opcionesDeHojas, cartelPorMedida, partirEnHojas, lineasDeCorte,
        colocacionDeImagen, describirCartel
    };
    if (typeof module === 'object' && module.exports) module.exports = api;
    else raiz.Cartel = api;
})(typeof window !== 'undefined' ? window : globalThis);
