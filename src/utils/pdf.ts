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


