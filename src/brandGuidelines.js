import JSZip from "jszip";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const fontNames = [
  "Arial",
  "Aptos",
  "Calibri",
  "Courier New",
  "Futura",
  "Garamond",
  "Georgia",
  "Gotham",
  "Helvetica",
  "Inter",
  "Lato",
  "Montserrat",
  "Open Sans",
  "Poppins",
  "Roboto",
  "Times New Roman",
  "Verdana",
];

export async function extractBrandGuideline(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  const buffer = await file.arrayBuffer();
  let text = "";

  if (extension === "pdf") {
    text = await extractPdfText(buffer);
  } else if (extension === "docx" || extension === "pptx") {
    text = await extractOfficeText(buffer);
  } else if (extension === "txt") {
    text = await file.text();
  } else {
    text = "";
  }

  return {
    colors: extractColors(text),
    fileName: file.name,
    fonts: extractFonts(text),
    toneRules: extractToneRules(text),
    textSample: text.replace(/\s+/g, " ").trim().slice(0, 900),
    uploadedAt: new Date().toISOString(),
  };
}

async function extractOfficeText(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const parts = [];

  await Promise.all(
    Object.values(zip.files)
      .filter((file) => !file.dir && file.name.endsWith(".xml"))
      .map(async (file) => {
        const xml = await file.async("text");
        parts.push(xml);
        parts.push(xmlToText(xml));
      }),
  );

  return parts.join("\n");
}

async function extractPdfText(buffer) {
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => item.str).join(" "));
  }

  return pages.join("\n");
}

function extractColors(text) {
  const colors = new Set();
  const hexMatches = text.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  hexMatches.forEach((color) => colors.add(normalizeHex(color)));

  const xmlColorMatches = text.match(/(?:val|color|srgbClr)="[0-9a-fA-F]{6}"/g) || [];
  xmlColorMatches.forEach((match) => colors.add(`#${match.match(/[0-9a-fA-F]{6}/)?.[0]}`.toLowerCase()));

  const rgbMatches = text.match(/rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)/gi) || [];
  rgbMatches.forEach((color) => colors.add(rgbToHex(color)));

  return [...colors].filter(Boolean).slice(0, 12);
}

function extractFonts(text) {
  const lower = text.toLowerCase();
  return fontNames.filter((font) => lower.includes(font.toLowerCase())).slice(0, 8);
}

function extractToneRules(text) {
  const sentences = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const keywords = ["tone", "voice", "style", "personality", "write", "language", "copy", "friendly", "formal"];

  return sentences
    .filter((line) => keywords.some((keyword) => line.toLowerCase().includes(keyword)))
    .slice(0, 8);
}

function normalizeHex(color) {
  if (color.length === 4) {
    return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`.toLowerCase();
  }

  return color.slice(0, 7).toLowerCase();
}

function rgbToHex(color) {
  const values = color.match(/\d{1,3}/g)?.map(Number);
  if (!values || values.length < 3) return "";

  return `#${values
    .slice(0, 3)
    .map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0"))
    .join("")}`;
}

function xmlToText(xml) {
  return xml
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, " ");
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
