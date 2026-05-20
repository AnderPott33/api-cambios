const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// 🔹 Función que hace el scrapeo y RETORNA los datos directamente
async function obtenerCambiosEnVivo() {
    console.log("⏳ Iniciando scrapeo en tiempo real...");
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
                "--single-process" 
            ]
        });

        const page = await browser.newPage();

        // Bloquear recursos pesados para que cargue lo más rápido posible
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
                req.abort();
            } else {
                req.continue();
            }
        });

        // Vamos a la web de Cambios Chaco
        await page.goto("https://www.cambioschaco.com.py/", {
            waitUntil: "networkidle2",
            timeout: 60000 
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

        console.log("✅ Scrapeo en vivo completado con éxito.");
        
        return {
            fuente: "Cambios Chaco",
            fecha: new Date(),
            cambios: data
        };

    } catch (error) {
        console.error("❌ Error durante el scrapeo en vivo:", error);
        throw error; // Lanzamos el error para que el endpoint lo cachee
    } finally {
        if (browser) await browser.close();
    }
}

// 🔹 ENDPOINT EN VIVO
app.get("/cambios", async (req, res) => {
    try {
        // Ejecuta el scrapeo justo en este momento
        const datosActualizados = await obtenerCambiosEnVivo();
        res.json(datosActualizados);
    } catch (error) {
        res.status(500).json({
            error: "Error al obtener las cotizaciones en tiempo real",
            detalles: error.message
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API en vivo corriendo en el puerto ${PORT}`);
});