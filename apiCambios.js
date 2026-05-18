const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors"); // 1. Importamos el paquete cors

const app = express();
const PORT = process.env.PORT || 3000;

// 2. Habilitamos CORS de forma global y libre
app.use(cors());

// 🔹 VARIABLE GLOBAL (Nuestra Caché en memoria)
let cacheCambios = {
    fuente: "Cambios Chaco",
    fecha: null,
    changes: [] // Aquí se guardarán las cotizaciones mapeadas
};

// 🔹 Función que obtiene los cambios
async function obtenerCambios() {
    console.log("⏳ Iniciando scrapeo en segundo plano...");
    let browser;
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
                "--no-first-run",
                "--no-zygote",
                "--single-process" // 💡 Forza a Chromium a usar un solo proceso (Ahorra mucha RAM)
            ]
        });

        const page = await browser.newPage();

        // Bloquear peticiones innecesarias para ahorrar velocidad y RAM
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        await page.goto("https://www.cambioschaco.com.py/", {
            waitUntil: "networkidle2",
            timeout: 60000 // 60 segundos de tiempo límite
        });

        await page.waitForSelector("table");

        const data = await page.evaluate(() => {
            const result = [];
            document.querySelectorAll("table tbody tr").forEach(row => {
                const cols = row.querySelectorAll("td");
                if (cols.length >= 3) {
                    result.push({
                        moneda: cols[0].innerText.trim(),
                        compra: cols[1].innerText.trim(),
                        venta: cols[2].innerText.trim()
                    });
                }
            });
            return result;
        });

        console.log("✅ Scrapeo exitoso. Actualizando caché.");

        // Guardamos el resultado en la caché global
        cacheCambios = {
            fuente: "Cambios Chaco",
            fecha: new Date(),
            cambios: data
        };

    } catch (error) {
        console.error("❌ Error durante el scrapeo automático:", error);
    } finally {
        if (browser) await browser.close();
    }
}

// 🔹 EJECUCIÓN AUTOMÁTICA
// 1. Scrapea de inmediato apenas se levanta el servidor en Render
obtenerCambios();

// 2. Vuelve a scrapear automáticamente cada 20 minutos (1200000 ms)
const VEINTE_MINUTOS = 20 * 60 * 1000;
setInterval(obtenerCambios, VEINTE_MINUTOS);


// 🔹 ENDPOINT DE LA API (Ahora es instantáneo y libre)
app.get("/cambios", (req, res) => {
    // Si la caché está vacía (por ejemplo, en el primer segundo del server)
    if (!cacheCambios.cambios || !cacheCambios.cambios.length) {
        return res.status(503).json({
            error: "Servicio temporalmente no disponible, inicializando datos..."
        });
    }

    // Responde inmediatamente con lo que hay en memoria
    res.json(cacheCambios);
});

app.listen(PORT, () => {
    console.log(`🚀 API corriendo en el puerto ${PORT}`);
});