const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// 🔹 CACHÉ EN MEMORIA (Nombres unificados en español)
let cacheCambios = {
    fuente: "Cambios Chaco",
    fecha: null,
    cambios: [] 
};

// Variable para saber si el primer scrapeo ya tuvo éxito
let primerScrapeoExitoso = false;

async function obtenerCambios() {
    console.log("⏳ Iniciando scrapeo en segundo plano...");
    let browser = null;
    
    try {
        browser = await puppeteer.launch({
            headless: true,
            args: [
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-accelerated-2d-canvas",
                "--no-first-run",
                "--no-zygote"
                // ❌ Eliminamos --single-process para evitar fugas de RAM en Render
            ]
        });

        const page = await browser.newPage();

        // Bloquear recursos innecesarios (Imágenes, estilos, fuentes)
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Timeout prudencial para no congelar el proceso si la web cae
        await page.goto("https://www.cambioschaco.com.py/", {
            waitUntil: "networkidle2",
            timeout: 45000 
        });

        await page.waitForSelector("table", { timeout: 15000 });

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

        // Guardamos en la caché global de inmediato
        cacheCambios = {
            fuente: "Cambios Chaco",
            fecha: new Date(),
            cambios: data
        };
        
        primerScrapeoExitoso = true;
        console.log(`✅ Caché actualizada con éxito a las: ${cacheCambios.fecha.toLocaleTimeString()}`);

    } catch (error) {
        console.error("❌ Error durante el scrapeo automático:", error.message);
    } finally {
        // Garantizamos que el navegador se cierre SIEMPRE para liberar la RAM
        if (browser !== null) {
            try {
                await browser.close();
                console.log("🔒 Navegador Chromium cerrado correctamente.");
            } catch (err) {
                console.error("❌ Error al cerrar el navegador:", err.message);
            }
        }
    }
}

// 🔹 EJECUCIÓN AUTOMÁTICA EN SEGUNDO PLANO
// Se ejecuta inmediatamente al levantar el servidor
obtenerCambios();

// Se repite cada 20 minutos de forma exacta
const VEINTE_MINUTOS = 20 * 60 * 1000;
setInterval(obtenerCambios, VEINTE_MINUTOS);


// 🔹 ENDPOINT DE LA API (Instantáneo)
app.get("/cambios", (req, res) => {
    // Si aún no se completó el primer scrapeo desde que inició el server
    if (!primerScrapeoExitoso) {
        return res.status(503).json({
            error: "Servicio temporalmente no disponible, inicializando datos por primera vez..."
        });
    }

    // Respuesta en milisegundos directamente desde la RAM
    res.json(cacheCambios);
});

app.listen(PORT, () => {
    console.log(`🚀 API corriendo en el puerto ${PORT}`);
});