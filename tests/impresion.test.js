// Lo que se imprime no puede depender de `vh`.
//
// Firefox, en la vista previa de impresión (y en lo que imprime desde ese diálogo), calcula `100vh`
// con el papel que tiene configurado EL DIÁLOGO menos sus márgenes, no con el `@page` de la página.
// Con el diálogo en horizontal (A4: 210 mm − 25,4 mm de márgenes = 184,6 mm), cada hoja medía
// 184,6 mm y `overflow: hidden` la cortaba ahí: la imagen desaparecía de la mitad para abajo
// (2026-10-27, lo vio Daniel). Chromium resuelve `vh` contra la página, por eso no se veía ahí.
// El tamaño de cada hoja al imprimir va en mm.
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

/** El contenido de cada bloque `@media print { … }` (con llaves balanceadas), sin comentarios. */
function bloquesDeImpresion(texto) {
    const bloques = [];
    let i = 0;
    while ((i = texto.indexOf('@media print', i)) !== -1) {
        const abre = texto.indexOf('{', i);
        let nivel = 0, j = abre;
        for (; j < texto.length; j++) {
            if (texto[j] === '{') nivel++;
            else if (texto[j] === '}' && --nivel === 0) break;
        }
        bloques.push(texto.slice(abre + 1, j).replace(/\/\*[\s\S]*?\*\//g, ''));
        i = j;
    }
    return bloques;
}

test('ningún bloque de impresión usa vh', () => {
    const bloques = bloquesDeImpresion(html);
    assert.ok(bloques.length >= 2, 'esperaba el bloque @media print fijo y el que arma aplicarEstiloDePagina');
    for (const b of bloques) {
        assert.doesNotMatch(b, /\d\s*vh\b/, `un bloque de impresión usa vh:\n${b.slice(0, 400)}`);
    }
});

test('al imprimir, la hoja de "Varias imágenes" mide lo que la página, en mm', () => {
    const dinamico = bloquesDeImpresion(html).find(b => b.includes('${s.wStr}'));
    assert.ok(dinamico, 'aplicarEstiloDePagina tiene que traer su propio @media print');
    assert.match(dinamico, /\.sheet\s*\{\s*width:\s*\$\{s\.wStr\}\s*!important;\s*height:\s*\$\{s\.hStr\}\s*!important;/);
});

test('al imprimir, el body no suma alto propio (su min-height de pantalla es 100vh)', () => {
    const fijo = bloquesDeImpresion(html)[0];
    assert.match(fijo, /body\s*\{[^}]*min-height:\s*0;/);
});

test('las hojas del cartel llevan su tamaño en mm en el style', () => {
    assert.match(html, /hoja\.style\.width = `\$\{paginaMm\.w\}mm`;/);
    assert.match(html, /hoja\.style\.height = `\$\{paginaMm\.h\}mm`;/);
});
