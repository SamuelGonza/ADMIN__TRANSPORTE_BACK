import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const guessChromeExecutables = (): string[] => {
    const candidates: string[] = [];
    const envPath = process.env.CHROME_PATH || process.env.PUPPETEER_EXECUTABLE_PATH;
    if (envPath) candidates.push(envPath);

    if (process.platform === "win32") {
        const programFiles = process.env["PROGRAMFILES"] || "C:\\Program Files";
        const programFilesX86 = process.env["PROGRAMFILES(X86)"] || "C:\\Program Files (x86)";
        const localAppData = process.env["LOCALAPPDATA"] || "";
        candidates.push(
            path.join(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(localAppData, "Google", "Chrome", "Application", "chrome.exe"),
            path.join(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
            path.join(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
        );
    } else if (process.platform === "darwin") {
        candidates.push(
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        );
    } else {
        candidates.push(
            "/usr/bin/google-chrome",
            "/usr/bin/google-chrome-stable",
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser"
        );
    }

    return candidates;
};

const findExistingExecutable = (): string | undefined => {
    for (const p of guessChromeExecutables()) {
        try {
            if (p && fs.existsSync(p)) return p;
        } catch {}
    }
    return undefined;
};

export async function renderHtmlToPdfBuffer(html: string): Promise<Buffer> {
    const executablePath = findExistingExecutable();
    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu"
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: "networkidle0" });
        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" }
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close();
    }
}

/**
 * Convierte un PDF a imagen base64 usando puppeteer
 * @param pdfUrl URL del PDF a convertir
 * @returns Base64 string de la imagen o null si hay error
 */
export async function convertPdfToImageBase64(pdfUrl: string): Promise<string | null> {
    const executablePath = findExistingExecutable();
    const browser = await puppeteer.launch({
        headless: true,
        executablePath,
        args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-web-security"
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1600 });
        
        // Navegar directamente al PDF
        await page.goto(pdfUrl, { 
            waitUntil: "networkidle0", 
            timeout: 30000 
        });
        
        // Esperar a que el PDF se renderice completamente
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Tomar screenshot de la página completa
        const screenshot = await page.screenshot({
            type: 'png',
            fullPage: true
        });

        const base64 = Buffer.from(screenshot).toString('base64');
        return `data:image/png;base64,${base64}`;
    } catch (error) {
        console.error("Error convirtiendo PDF a imagen:", error);
        // Intentar método alternativo con embed
        try {
            const page = await browser.newPage();
            await page.setViewport({ width: 1200, height: 1600 });
            
            const html = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <style>
                        body {
                            margin: 0;
                            padding: 0;
                            background: white;
                            overflow: hidden;
                        }
                        embed {
                            width: 100%;
                            height: 100vh;
                        }
                    </style>
                </head>
                <body>
                    <embed src="${pdfUrl}" type="application/pdf" />
                </body>
                </html>
            `;
            
            await page.setContent(html, { waitUntil: "networkidle0", timeout: 30000 });
            await new Promise(resolve => setTimeout(resolve, 3000));
            
            const screenshot = await page.screenshot({
                type: 'png',
                fullPage: true
            });
            
            const base64 = Buffer.from(screenshot).toString('base64');
            return `data:image/png;base64,${base64}`;
        } catch (fallbackError) {
            console.error("Error en método alternativo:", fallbackError);
            return null;
        }
    } finally {
        await browser.close();
    }
}


