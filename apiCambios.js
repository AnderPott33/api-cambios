const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
// CAMBIO: Render asigna un puerto dinámico mediante variables de entorno
const PORT = process.env.PORT || 3000; 

async function obtenerCambios() {
    const browser = await puppeteer.launch({
        headless: true,
        // ELIMINAMOS executablePath para que use el por defecto de la instalación
        args: [
            "--no-sandbox", 
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage", 
            "--disable-gpu"
        ]
    });

    const page = await browser.newPage();

    // Optimización: No cargar imágenes ni CSS para que el scrapeo sea más rápido y consuma menos RAM
    await page.setRequestInterception(true);
    page.on('request', (req) => {
        if (['image', 'stylesheet', 'font'].includes(req.resourceType())) {
            req.abort();
        } else {
            req.continue();
        }
    });

    await page.goto("https://www.cambioschaco.com.py/", {
        waitUntil: "networkidle2"
    });

    await page.waitForSelector("table");

    const cambios = await page.evaluate(() => {
        const data = [];
        document.querySelectorAll("table tbody tr").forEach(row => {
            const cols = row.querySelectorAll("td");
            if (cols.length >= 3) {
                data.push({
                    moneda: cols[0].innerText.trim(),
                    compra: cols[1].innerText.trim(),
                    venta: cols[2].innerText.trim()
                });
            }
        });
        return data;
    });

    await browser.close();
    return cambios;
}

app.get("/cambios", async (req, res) => {
    try {
        const data = await obtenerCambios();
        if (!data.length) {
            return res.status(500).json({ error: "No se pudieron obtener los cambios" });
        }
        res.json({
            fuente: "Cambios Chaco",
            fecha: new Date(),
            cambios: data
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: "Error interno", detalle: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 API corriendo en el puerto ${PORT}`);
});