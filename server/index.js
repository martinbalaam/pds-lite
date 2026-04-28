import express from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const generatedPdfDir = process.env.GENERATED_PDF_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(projectRoot, "generated-pdfs");
const distDir = path.join(projectRoot, "dist");
const app = express();
const port = Number(process.env.PORT || 4174);

app.use(express.json({ limit: "20mb" }));
app.use("/generated-pdfs", express.static(generatedPdfDir, { maxAge: "1h" }));
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, generatedPdfDir });
});

app.post("/api/pim/upload-pdf", async (req, res) => {
  const { apiFeedKey, fileName } = req.body || {};

  if (!apiFeedKey || !fileName) {
    res.status(400).json({ error: "API Feed Key and generated PDF filename are required." });
    return;
  }

  try {
    const safeFileName = path.basename(fileName);
    const filePath = path.join(generatedPdfDir, safeFileName);
    const fileBytes = await fs.readFile(filePath);
    const fileSize = fileBytes.byteLength;
    const form = new FormData();
    form.append("file", new Blob([fileBytes], { type: "application/pdf" }), safeFileName);

    const uploadUrl = new URL("https://api.pimberly.io/core/assets");
    uploadUrl.searchParams.set("access_token", String(apiFeedKey));

    const response = await fetch(uploadUrl, {
      method: "POST",
      body: form,
      headers: {
        Accept: "application/json",
      },
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text };
    }

    if (!response.ok) {
      res.status(response.status).json({
        error:
          payload?.message ||
          payload?.error ||
          (response.status === 413
            ? `PIM upload rejected the PDF as too large (${formatBytes(fileSize)}).`
            : `PIM upload failed with ${response.status}.`),
      });
      return;
    }

    res.json({
      message: `PDF uploaded to PIM successfully (${formatBytes(fileSize)}).`,
      pimResponse: payload,
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Could not upload the PDF to PIM.",
    });
  }
});

app.post("/api/pdf/generate", async (req, res) => {
  const { brand, fileName, page, product, template } = req.body || {};

  if (!brand || !page || !product || !template) {
    res.status(400).json({ error: "Brand, product, template, and page details are required." });
    return;
  }

  try {
    await fs.mkdir(generatedPdfDir, { recursive: true });
    const finalFileName = uniquePdfFileName(fileName || "tech-sheet.pdf");
    const filePath = path.join(generatedPdfDir, finalFileName);
    const stats = await renderPdfToFile({ brand, filePath, page, product, template });

    res.json({
      fileName: finalFileName,
      fileSize: stats.size,
      publicUrl: `${publicBaseUrl(req)}/generated-pdfs/${finalFileName}`,
    });
  } catch (error) {
    console.error("PDF generation failed:", error);
    res.status(500).json({
      error: error instanceof Error ? error.message : "Could not generate the PDF.",
    });
  }
});

if (await exists(distDir)) {
  app.use(express.static(distDir));
  app.get(/^(?!\/api\/|\/generated-pdfs\/).*/, async (req, res) => {
    res.sendFile(path.join(distDir, "index.html"));
  });
}

await fs.mkdir(generatedPdfDir, { recursive: true });

app.listen(port, () => {
  console.log(`PDS Lite PDF server listening on http://127.0.0.1:${port}`);
  console.log(`Generated PDFs directory: ${generatedPdfDir}`);
});

async function renderPdfToFile({ brand, filePath, page, product, template }) {
  const pdf = await PDFDocument.create();
  const imageCache = new Map();
  const pages = template.pages?.length ? template.pages : [{ id: "sheet-1" }];
  const pageNumbers = defaultPageNumbers(template);
  const bodyFont = await pdf.embedFont(fontForName(brand?.bodyFont || "Inter"));
  const headingFont = await pdf.embedFont(fontForName(brand?.headingFont || brand?.bodyFont || "Inter"));

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pdfPage = pdf.addPage([page.width, page.height]);
    drawPageSurface(pdfPage, template.page || {}, page.width, page.height);

    const elements = (template.elements || []).filter((element) => (element.pageIndex ?? 0) === pageIndex);
    for (const element of elements) {
      await drawElement({
        bodyFont,
        brand,
        headingFont,
        imageCache,
        pageHeight: page.height,
        pdf,
        pdfPage,
        product,
        element,
      });
    }

    drawPageNumber(pdfPage, pageNumbers, pageIndex, pages.length, page.height, page.width, bodyFont);
  }

  const bytes = await pdf.save();
  await fs.writeFile(filePath, bytes);
  return { size: bytes.byteLength };
}

async function drawElement({ bodyFont, brand, headingFont, imageCache, pageHeight, pdf, pdfPage, product, element }) {
  const box = pdfRect(element, pageHeight);
  drawElementBackground(pdfPage, element, box);

  if (element.type === "shape") {
    drawShape(pdfPage, element, box);
    return;
  }

  if (element.type === "logo") {
    await drawImageIntoBox(pdf, pdfPage, brand?.logo, box, "contain", imageCache);
    drawElementBorder(pdfPage, element, box);
    return;
  }

  if (element.type === "image") {
    const source = resolveBinding(product, element.binding);
    if (looksLikeImageAssetUrl(source) || looksLikeDataImageUrl(source)) {
      await drawImageIntoBox(pdf, pdfPage, source, box, "fill", imageCache);
    } else if (source) {
      drawTextBlock(pdfPage, String(source), box, {
        color: parseHexColor(element.color || "#17211f"),
        font: bodyFont,
        fontSize: element.fontSize || 12,
        horizontalAlign: "left",
        verticalAlign: "top",
      });
    }
    drawElementBorder(pdfPage, element, box);
    return;
  }

  if (element.type === "text" && !element.binding) {
    drawTextBlock(pdfPage, element.value || "", box, {
      color: parseHexColor(element.color || "#17211f"),
      font: bodyFont,
      fontSize: element.fontSize || 14,
      horizontalAlign: element.contentHorizontalAlign || "left",
      verticalAlign: element.contentVerticalAlign || "top",
    });
    drawElementBorder(pdfPage, element, box);
    return;
  }

  if (element.type === "table") {
    const rows = specRows(product);
    drawSimpleRows(pdfPage, rows, box, bodyFont, element.fontSize || 12, parseHexColor(element.color || "#17211f"));
    drawElementBorder(pdfPage, element, box);
    return;
  }

  if (element.fields?.length || element.binding) {
    await drawAttributeElement({ bodyFont, box, element, headingFont, imageCache, page: pdfPage, pdf, product });
    drawElementBorder(pdfPage, element, box);
    return;
  }

  drawElementBorder(pdfPage, element, box);
}

async function drawAttributeElement({ bodyFont, box, element, headingFont, imageCache, page, pdf, product }) {
  const fields = getElementFields(element);
  const mode = element.displayMode || (element.fields?.length ? "tabular" : "valueOnly");
  const fontSize = element.fontSize || 12;
  const labelWidth = ((element.attributeLabelColumnWidth ?? 38) / 100) * box.width;
  const valueWidth = box.width - labelWidth;
  const baseColor = parseHexColor(element.color || "#17211f");

  if (mode === "tabular") {
    const rowHeight = Math.max(24, box.height / Math.max(fields.length, 1));
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const rowY = box.y + box.height - rowHeight * (index + 1);
      page.drawRectangle({
        x: box.x,
        y: rowY,
        width: labelWidth,
        height: rowHeight,
        color: withOpacity(parseHexColor("#dfeceb"), 1),
        borderColor: withOpacity(parseHexColor("#d0d8d6"), 1),
        borderWidth: 0.5,
      });
      page.drawRectangle({
        x: box.x + labelWidth,
        y: rowY,
        width: valueWidth,
        height: rowHeight,
        borderColor: withOpacity(parseHexColor("#d0d8d6"), 1),
        borderWidth: 0.5,
      });
      drawTextBlock(page, field.label, { x: box.x + 6, y: rowY + 4, width: labelWidth - 12, height: rowHeight - 8 }, {
        color: baseColor,
        font: headingFont,
        fontSize,
        horizontalAlign: element.attributeHorizontalAlign || "left",
        verticalAlign: element.attributeVerticalAlign || "top",
      });
      await drawFieldValue({ bodyFont, box: { x: box.x + labelWidth + 6, y: rowY + 4, width: valueWidth - 12, height: rowHeight - 8 }, field, fontSize, imageCache, page, pdf, product, textColor: baseColor });
    }
    return;
  }

  if (mode === "inline") {
    const rowHeight = Math.max(32, box.height / Math.max(fields.length, 1));
    for (let index = 0; index < fields.length; index += 1) {
      const field = fields[index];
      const rowY = box.y + box.height - rowHeight * (index + 1);
      drawTextBlock(page, field.label, { x: box.x + 8, y: rowY + rowHeight / 2, width: box.width - 16, height: rowHeight / 2 - 4 }, {
        color: baseColor,
        font: headingFont,
        fontSize: Math.max(fontSize - 1, 10),
        horizontalAlign: element.attributeHorizontalAlign || "left",
        verticalAlign: "top",
      });
      await drawFieldValue({ bodyFont, box: { x: box.x + 8, y: rowY + 4, width: box.width - 16, height: rowHeight / 2 }, field, fontSize, imageCache, page, pdf, product, textColor: baseColor });
    }
    return;
  }

  const rowHeight = Math.max(24, box.height / Math.max(fields.length, 1));
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const rowY = box.y + box.height - rowHeight * (index + 1);
    await drawFieldValue({ bodyFont, box: { x: box.x + 8, y: rowY + 4, width: box.width - 16, height: rowHeight - 8 }, field, fontSize, imageCache, page, pdf, product, textColor: baseColor });
  }
}

async function drawFieldValue({ bodyFont, box, field, fontSize, imageCache, page, pdf, product, textColor }) {
  const value = field.binding ? resolveBinding(product, field.binding) : field.value || "";
  if (!value) return;

  if ((field.type === "image" || field.type === "logo") && (looksLikeImageAssetUrl(value) || looksLikeDataImageUrl(value))) {
    await drawImageIntoBox(pdf, page, value, box, "fill", imageCache);
    return;
  }

  const displayMode = field.urlDisplayMode || "text";
  const textValue = looksLikeUrl(value) && displayMode === "link" ? field.label : String(value);
  drawTextBlock(page, textValue, box, {
    color: textColor,
    font: bodyFont,
    fontSize,
    horizontalAlign: "left",
    verticalAlign: "top",
  });
}

function drawSimpleRows(page, rows, box, font, fontSize, color) {
  const rowHeight = Math.max(20, box.height / Math.max(rows.length, 1));
  for (let index = 0; index < rows.length; index += 1) {
    const [label, value] = rows[index];
    const rowY = box.y + box.height - rowHeight * (index + 1);
    drawTextBlock(page, `${label}: ${value}`, { x: box.x + 8, y: rowY + 4, width: box.width - 16, height: rowHeight - 8 }, {
      color,
      font,
      fontSize,
      horizontalAlign: "left",
      verticalAlign: "top",
    });
  }
}

function drawPageSurface(page, pageStyle, width, height) {
  page.drawRectangle({
    x: 0,
    y: 0,
    width,
    height,
    color: parseHexColor(pageStyle.background || "#ffffff"),
    opacity: clamp(Number(pageStyle.backgroundOpacity ?? 1), 0, 1),
  });

  if ((pageStyle.edgeStyle || "solid") !== "none" && (pageStyle.edgeWidth ?? 1) > 0) {
    page.drawRectangle({
      x: (pageStyle.edgeWidth ?? 1) / 2,
      y: (pageStyle.edgeWidth ?? 1) / 2,
      width: width - (pageStyle.edgeWidth ?? 1),
      height: height - (pageStyle.edgeWidth ?? 1),
      borderColor: parseHexColor(pageStyle.edgeColor || "#bac8c4"),
      borderWidth: pageStyle.edgeWidth ?? 1,
      borderOpacity: clamp(Number(pageStyle.edgeOpacity ?? 1), 0, 1),
    });
  }
}

function drawPageNumber(page, pageNumbers, pageIndex, pageTotal, pageHeight, pageWidth, font) {
  if (pageNumbers.mode === "none") return;
  const text = pageNumbers.mode === "pageOfTotal" ? `Page ${pageIndex + 1} of ${pageTotal}` : `Page ${pageIndex + 1}`;
  const size = pageNumbers.fontSize || 12;
  const textWidth = font.widthOfTextAtSize(text, size);
  const margin = 18;
  const manual = pageNumbers.manualPositions?.[pageIndex];
  let x = (pageWidth - textWidth) / 2;
  let y = margin;

  if (manual) {
    x = manual.x;
    y = pageHeight - manual.y - size;
  } else {
    if (pageNumbers.horizontalAlign === "left") x = margin;
    if (pageNumbers.horizontalAlign === "right") x = pageWidth - textWidth - margin;
    if (pageNumbers.verticalAlign === "top") y = pageHeight - size - margin;
  }

  page.drawText(text, {
    x,
    y,
    size,
    font,
    color: parseHexColor(pageNumbers.color || "#17211f"),
  });
}

function drawElementBackground(page, element, box) {
  const opacity = elementBackgroundOpacity(element);
  if (opacity <= 0) return;
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: parseHexColor(element.background || "#ffffff"),
    opacity,
    borderRadius: undefined,
  });
}

function drawElementBorder(page, element, box) {
  const borderWidth = element.borderWidth ?? defaultBorderWidth(element);
  if (!borderWidth) return;
  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    borderColor: parseHexColor(element.borderColor || defaultBorderColor(element)),
    borderWidth,
  });
}

function drawShape(page, element, box) {
  const fillColor = parseHexColor(element.fillColor || element.background || "#0c7c78");
  const fillOpacity = clamp(Number(element.fillOpacity ?? 1), 0, 1);
  const strokeColor = parseHexColor(element.outlineColor || element.borderColor || "#17211f");
  const strokeOpacity = clamp(Number(element.outlineOpacity ?? 1), 0, 1);
  const strokeWidth = element.outlineStyle === "none" ? 0 : element.outlineWidth ?? element.borderWidth ?? 1;

  if (element.shapeType === "ellipse") {
    page.drawEllipse({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
      xScale: box.width / 2,
      yScale: box.height / 2,
      color: fillColor,
      opacity: fillOpacity,
      borderColor: strokeColor,
      borderOpacity: strokeOpacity,
      borderWidth: strokeWidth,
    });
    return;
  }

  page.drawRectangle({
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    color: fillColor,
    opacity: fillOpacity,
    borderColor: strokeColor,
    borderOpacity: strokeOpacity,
    borderWidth: strokeWidth,
  });
}

async function drawImageIntoBox(pdf, page, source, box, mode, imageCache) {
  const image = await embedImage(pdf, source, imageCache);
  if (!image) return;

  if (mode === "contain") {
    const scale = Math.min(box.width / image.width, box.height / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    page.drawImage(image, {
      x: box.x + (box.width - width) / 2,
      y: box.y + (box.height - height) / 2,
      width,
      height,
    });
    return;
  }

  page.drawImage(image, {
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  });
}

async function embedImage(pdf, source, imageCache) {
  const cacheKey = String(source || "");
  if (cacheKey && imageCache?.has(cacheKey)) return imageCache.get(cacheKey);
  const bytesInfo = await imageBytesFromSource(source);
  if (!bytesInfo) return null;
  let embedded = null;
  if (bytesInfo.mimeType.includes("png")) embedded = await pdf.embedPng(bytesInfo.bytes);
  if (bytesInfo.mimeType.includes("jpg") || bytesInfo.mimeType.includes("jpeg")) embedded = await pdf.embedJpg(bytesInfo.bytes);
  if (embedded && cacheKey) imageCache?.set(cacheKey, embedded);
  return embedded;
}

async function imageBytesFromSource(source) {
  if (!source || typeof source !== "string") return null;
  if (source.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(source);
    if (!match) return null;
    return optimizeImageBytes({
      bytes: Uint8Array.from(Buffer.from(match[2], "base64")),
      mimeType: match[1].toLowerCase(),
    });
  }
  if (!/^https?:\/\//i.test(source)) return null;
  try {
    const response = await fetch(source, {
      headers: {
        Accept: "image/png,image/jpeg,image/webp,image/*,*/*;q=0.8",
      },
    });
    if (!response.ok) return null;
    const mimeType = (response.headers.get("content-type") || "").toLowerCase();
    if (!mimeType.includes("png") && !mimeType.includes("jpeg") && !mimeType.includes("jpg")) return null;
    return optimizeImageBytes({
      bytes: new Uint8Array(await response.arrayBuffer()),
      mimeType,
    });
  } catch {
    return null;
  }
}

async function optimizeImageBytes({ bytes, mimeType }) {
  try {
    const pipeline = sharp(bytes, { failOn: "none" }).rotate();
    const metadata = await pipeline.metadata();
    const longestSide = Math.max(metadata.width || 0, metadata.height || 0);
    const resized = longestSide > 1400 ? pipeline.resize({ fit: "inside", height: 1400, width: 1400 }) : pipeline;

    if ((metadata.hasAlpha || mimeType.includes("png")) && !mimeType.includes("jpeg") && !mimeType.includes("jpg")) {
      const output = await resized.png({ compressionLevel: 9, palette: true, quality: 70 }).toBuffer();
      return {
        bytes: new Uint8Array(output),
        mimeType: "image/png",
      };
    }

    const output = await resized.jpeg({ mozjpeg: true, quality: 68 }).toBuffer();
    return {
      bytes: new Uint8Array(output),
      mimeType: "image/jpeg",
    };
  } catch {
    return { bytes, mimeType };
  }
}

function drawTextBlock(page, text, box, options) {
  const lines = wrapText(text, options.font, options.fontSize, box.width);
  const lineHeight = options.fontSize * 1.2;
  const blockHeight = lines.length * lineHeight;
  let y = box.y + box.height - options.fontSize;

  if (options.verticalAlign === "center") y = box.y + (box.height + blockHeight) / 2 - lineHeight;
  if (options.verticalAlign === "bottom") y = box.y + blockHeight - lineHeight + 4;

  lines.forEach((line, index) => {
    const width = options.font.widthOfTextAtSize(line, options.fontSize);
    let x = box.x;
    if (options.horizontalAlign === "center") x = box.x + (box.width - width) / 2;
    if (options.horizontalAlign === "right") x = box.x + box.width - width;
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      size: options.fontSize,
      font: options.font,
      color: options.color,
    });
  });
}

function wrapText(text, font, fontSize, maxWidth) {
  const rawLines = String(text || "").split("\n");
  const wrapped = [];
  rawLines.forEach((rawLine) => {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (!words.length) {
      wrapped.push("");
      return;
    }
    let current = words[0];
    for (let index = 1; index < words.length; index += 1) {
      const next = `${current} ${words[index]}`;
      if (font.widthOfTextAtSize(next, fontSize) <= maxWidth) {
        current = next;
      } else {
        wrapped.push(current);
        current = words[index];
      }
    }
    wrapped.push(current);
  });
  return wrapped;
}

function getElementFields(element) {
  if (element.fields?.length) return element.fields;
  if (!element.binding) return [];
  return [
    {
      binding: element.binding,
      label: element.label,
      type: element.type,
      urlDisplayMode: element.urlDisplayMode,
      value: element.value,
    },
  ];
}

function resolveBinding(product, pathValue) {
  if (!pathValue) return "";
  return pathValue.split(".").reduce((value, key) => (value ? value[key] : ""), product) || "";
}

function specRows(product) {
  const preferredKeys = ["productId", "category", "voltage", "enclosure", "operatingTemp", "warranty"];
  const preferredRows = preferredKeys
    .filter((key) => product.attributes?.[key])
    .map((key) => [labelize(key), product.attributes[key]]);
  if (preferredRows.length >= 2) return preferredRows;
  return Object.entries(product.attributes || {}).slice(0, 8).map(([key, value]) => [labelize(key), value]);
}

function labelize(key) {
  return String(key || "")
    .replace(/[.]+/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/([A-Z])/g, " $1")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function pdfRect(element, pageHeight) {
  return {
    x: Number(element.x || 0),
    y: pageHeight - Number(element.y || 0) - Number(element.height || 0),
    width: Number(element.width || 0),
    height: Number(element.height || 0),
  };
}

function defaultPageNumbers(template) {
  return {
    mode: "none",
    fontFamily: "Inter, sans-serif",
    color: optimizedTextColor(template.page?.background || "#ffffff"),
    fontSize: 12,
    horizontalAlign: "center",
    verticalAlign: "bottom",
    ...(template.pageNumbers || {}),
  };
}

function optimizedTextColor(background) {
  const color = parseHexColor(background || "#ffffff");
  const luminance = (0.299 * color.red + 0.587 * color.green + 0.114 * color.blue) / 255;
  return luminance > 0.58 ? "#17211f" : "#ffffff";
}

function elementBackgroundOpacity(element) {
  if (element.backgroundOpacity !== undefined) return clamp(Number(element.backgroundOpacity), 0, 1);
  if (!element.background || element.background === "transparent" || element.background === "#ffffff") return 0;
  return 1;
}

function defaultBorderColor(element) {
  if (element.type === "shape") return element.background || "#0c7c78";
  return "#cbd8d4";
}

function defaultBorderWidth(element) {
  if (element.type === "text" || element.type === "table" || element.fields?.length || element.binding) return 1;
  return 0;
}

function fontForName(name) {
  const token = String(name || "").toLowerCase();
  if (token.includes("courier")) return StandardFonts.Courier;
  if (token.includes("times") || token.includes("serif")) return StandardFonts.TimesRoman;
  return StandardFonts.Helvetica;
}

function looksLikeUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function looksLikeDataImageUrl(value) {
  return typeof value === "string" && /^data:image\//i.test(value);
}

function looksLikeImageAssetUrl(value) {
  if (!looksLikeUrl(value)) return false;
  try {
    const { pathname } = new URL(value);
    return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)$/i.test(pathname);
  } catch {
    return /\.(jpe?g|png|gif|webp|svg|bmp|tiff?)(?:[?#].*)?$/i.test(value);
  }
}

function parseHexColor(value) {
  const color = String(value || "#000000").trim();
  const normalized = /^#[0-9a-f]{3}$/i.test(color)
    ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
    : color;
  const safe = /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : "#000000";
  return rgb(
    parseInt(safe.slice(1, 3), 16) / 255,
    parseInt(safe.slice(3, 5), 16) / 255,
    parseInt(safe.slice(5, 7), 16) / 255,
  );
}

function withOpacity(color, opacity) {
  return rgb(color.red * opacity + (1 - opacity), color.green * opacity + (1 - opacity), color.blue * opacity + (1 - opacity));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function uniquePdfFileName(fileName) {
  const ext = path.extname(fileName).toLowerCase() === ".pdf" ? ".pdf" : ".pdf";
  const base = path.basename(fileName, path.extname(fileName)) || "tech-sheet";
  const safeBase = base.replace(/[^A-Za-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "tech_sheet";
  return `${safeBase}${ext}`;
}

function publicBaseUrl(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, "");
  const forwardedProto = req.headers["x-forwarded-proto"];
  const protocol = typeof forwardedProto === "string" ? forwardedProto.split(",")[0] : req.protocol;
  return `${protocol}://${req.get("host")}`;
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function shutdown() {
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
