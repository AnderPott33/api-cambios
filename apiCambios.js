const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = 3000;

// 🔹 Función que obtiene los cambios
async function obtenerCambios() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    await page.goto("https://www.cambioschaco.com.py/", {
        waitUntil: "networkidle2"
    });

    // Esperar que cargue la tabla (clave)
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

// 🔹 Endpoint API
app.get("/cambios", async (req, res) => {
    try {
        const data = await obtenerCambios();

        if (!data.length) {
            return res.status(500).json({
                error: "No se pudieron obtener los cambios"
            });
        }

        res.json({
            fuente: "Cambios Chaco",
            fecha: new Date(),
            cambios: data
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            error: "Error interno",
            detalle: error.message
        });
    }
});

// 🔹 Levantar servidor
app.listen(PORT, () => {
    console.log(`🚀 API corriendo en http://localhost:${PORT}`);
});