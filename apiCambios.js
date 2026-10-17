
const express = require("express");
const cheerio = require("cheerio");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ======================================================
// CONFIGURACIÓN
// ======================================================

const URL_WIDGET =
    "https://www.cambioschaco.com.py/widgets/cotizacion/?lang=es";

const VEINTE_MINUTOS = 20 * 60 * 1000;

// ======================================================
// CACHÉ EN MEMORIA
// ======================================================

let cacheCambios = {
    fuente: "Cambios Chaco",
    fecha: null,
    cambios: [],
};

let primerScrapeoExitoso = false;
let scrapeoEnCurso = false;
let ultimoError = null;

// ======================================================
// OBTENER COTIZACIONES
// ======================================================

async function obtenerCambios() {
    if (scrapeoEnCurso) {
        console.log("⏳ Ya existe una consulta en curso.");
        return;
    }

    scrapeoEnCurso = true;

    console.log("⏳ Consultando cotizaciones de Cambios Chaco...");

    try {
        const response = await fetch(URL_WIDGET, {
            method: "GET",
            headers: {
                "User-Agent": "Mozilla/5.0",
                "Accept": "text/html",
                "Accept-Language": "es,pt-BR;q=0.9,pt;q=0.8",
            },
            signal: AbortSignal.timeout(20000),
        });

        if (!response.ok) {
            throw new Error(`Error HTTP ${response.status}`);
        }

       const html = await response.text();
const $ = cheerio.load(html);

console.log("HTTP:", response.status);
console.log("URL solicitada:", URL_WIDGET);
console.log("HTML recibido:", html.length, "caracteres");
console.log("Título:", $("title").text().trim());
console.log("Tablas encontradas:", $("table").length);
console.log("Contenido inicial:", $("body").text().trim().slice(0, 800));

if ($(".cotiz-tabla").length === 0) {
    throw new Error(
        "No se encontró .cotiz-tabla. Revisar el HTML recibido en los logs."
    );
}

        // Obtener la fecha publicada por Cambios Chaco.
        const fecha =
            $(".cotiz-update .time").text().trim() || null;

        const cambios = [];

        // Extraer las cotizaciones de la tabla.
        $(".cotiz-tabla tbody tr").each((_, row) => {
            const columnas = $(row).find("td");

            if (columnas.length < 3) {
                return;
            }

            const extraerTexto = (elemento) => {
                return $(elemento)
                    .clone()
                    .children()
                    .remove()
                    .end()
                    .text()
                    .replace(/\s+/g, " ")
                    .trim();
            };

            const moneda = extraerTexto(columnas[0]);
            const compra = extraerTexto(columnas[1]);
            const venta = extraerTexto(columnas[2]);

            if (moneda && compra && venta) {
                cambios.push({
                    moneda,
                    compra,
                    venta,
                });
            }
        });

        // No reemplazar la caché con datos vacíos.
        if (cambios.length === 0) {
            throw new Error(
                "No se encontraron cotizaciones válidas."
            );
        }

        // Actualizar la caché únicamente si la extracción tuvo éxito.
        cacheCambios = {
            fuente: "Cambios Chaco",
            fecha: fecha || new Date().toISOString(),
            cambios,
        };

        primerScrapeoExitoso = true;
        ultimoError = null;

        console.log(
            `✅ ${cambios.length} cotizaciones obtenidas correctamente.`
        );

        console.log("📅 Última actualización:", cacheCambios.fecha);

        console.log(
            "💱 Monedas:",
            cambios.map((item) => item.moneda).join(", ")
        );

    } catch (error) {
        ultimoError = error.message;

        console.error(
            "❌ Error al obtener cotizaciones:",
            error.message
        );

    } finally {
        scrapeoEnCurso = false;
    }
}

// ======================================================
// ACTUALIZACIÓN AUTOMÁTICA
// ======================================================

// Ejecutar una consulta al iniciar el servidor.
obtenerCambios();

// Actualizar cada 20 minutos.
setInterval(obtenerCambios, VEINTE_MINUTOS);

// ======================================================
// ENDPOINT PRINCIPAL: GET /cambios
// ======================================================

app.get("/cambios", (req, res) => {
    if (!primerScrapeoExitoso) {
        return res.status(503).json({
            error: "Las cotizaciones todavía no están disponibles.",
            detalle: ultimoError,
        });
    }

    res.json(cacheCambios);
});

// ======================================================
// ENDPOINT: GET /estado
// ======================================================

app.get("/estado", (req, res) => {
    res.json({
        servicio: "API de Cambios Chaco",
        disponible: primerScrapeoExitoso,
        consultando: scrapeoEnCurso,
        ultimaActualizacion: cacheCambios.fecha,
        cantidadCambios: cacheCambios.cambios.length,
        error: ultimoError,
    });
});

// ======================================================
// ENDPOINT RAÍZ: GET /
// ======================================================

app.get("/", (req, res) => {
    res.json({
        mensaje: "API de cotizaciones funcionando",
        endpoints: {
            cambios: "/cambios",
            estado: "/estado",
        },
    });
});

// ======================================================
// INICIAR SERVIDOR
// ======================================================

app.listen(PORT, () => {
    console.log(`🚀 API corriendo en el puerto ${PORT}`);
    console.log(`📡 Endpoint: /cambios`);
    console.log(`🔎 Estado: /estado`);
});
