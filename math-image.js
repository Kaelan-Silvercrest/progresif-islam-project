const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { SVG } = require("mathjax-full/js/output/svg.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
const { AllPackages } = require("mathjax-full/js/input/tex/AllPackages.js");
const { Resvg } = require("@resvg/resvg-js");

const PAGE_WIDTH = 1080;
const PAGE_HEIGHT = 1800;
const MARGIN = 72;
const HEADER_HEIGHT = 142;
const BODY_FONT_SIZE = 30;
const BODY_LINE_HEIGHT = 45;
const MAX_FORMULA_LENGTH = 6000;

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const mathDocument = mathjax.document("", {
  InputJax: new TeX({ packages: AllPackages }),
  OutputJax: new SVG({ fontCache: "none" }),
});

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cleanProse(value) {
  return String(value)
    .replace(/^```[a-zA-Z0-9_-]*\s*$/gm, "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+/, "• ")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<\/?p>/gi, "")
    .trim();
}

function wrapText(text, maxCharacters) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (line) lines.push(line);
      line = "";
      for (let index = 0; index < word.length; index += maxCharacters) {
        const part = word.slice(index, index + maxCharacters);
        if (part.length === maxCharacters) lines.push(part);
        else line = part;
      }
      continue;
    }
    if (line && line.length + word.length + 1 > maxCharacters) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function parseSolution(content) {
  const items = [];
  const expressionPattern = /\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g;
  const text = String(content || "").replace(/\r\n?/g, "\n");
  let cursor = 0;
  let match;

  const addText = (value) => {
    for (const line of value.split("\n")) {
      if (!line.trim()) {
        items.push({ type: "space" });
        continue;
      }
      const cleanLine = cleanProse(line);
      if (!cleanLine) continue;

      const looseLatex = /\\(?:frac|dfrac|tfrac|sqrt|sum|prod|int|cdot|times|leq|geq|neq|boxed|begin|left|right)\b/.test(cleanLine);
      if (looseLatex) {
        items.push({ type: "math", formula: cleanLine });
        continue;
      }

      const isHeading = /^\s*#{1,6}\s+/.test(line);
      const isAnswer = /^(jawaban akhir|kesimpulan|hasil akhir)\b/i.test(cleanLine);
      const fontSize = isHeading || isAnswer ? 34 : BODY_FONT_SIZE;
      const maxCharacters = Math.floor((PAGE_WIDTH - 2 * MARGIN) / (fontSize * 0.56));
      for (const wrappedLine of wrapText(cleanLine, maxCharacters)) {
        items.push({ type: "text", text: wrappedLine, style: isHeading ? "heading" : isAnswer ? "answer" : "body" });
      }
    }
  };

  while ((match = expressionPattern.exec(text))) {
    addText(text.slice(cursor, match.index));
    items.push({ type: "math", formula: (match[1] || match[2] || match[3] || match[4]).trim() });
    cursor = expressionPattern.lastIndex;
  }
  addText(text.slice(cursor));

  return items.filter((item, index, list) =>
    item.type !== "space" ||
    (index > 0 && index < list.length - 1 &&
      list[index - 1].type !== "space" && list[index + 1].type !== "space")
  );
}

function renderFormula(formula) {
  const safeFormula = String(formula).slice(0, MAX_FORMULA_LENGTH);
  const html = adaptor.outerHTML(mathDocument.convert(safeFormula, { display: true }));
  const svgStart = html.indexOf("<svg");
  const svgEnd = html.indexOf("</svg>", svgStart);
  if (svgStart < 0 || svgEnd < 0) throw new Error("Rumus matematika tidak dapat dirender.");
  const svg = html.slice(svgStart, svgEnd + "</svg>".length)
    .replaceAll("currentColor", "#17212b");
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  if (!viewBox) throw new Error("Dimensi rumus hasil render tidak valid.");
  const [viewBoxX, viewBoxY, width, height] = viewBox.split(/\s+/).map(Number);
  if (
    !Number.isFinite(viewBoxX) ||
    !Number.isFinite(viewBoxY) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("Dimensi rumus hasil render tidak valid.");
  }
  return { svg, width, height };
}

function layoutItems(items) {
  const pages = [];
  let page = [];
  let usedHeight = 0;
  const maxContentHeight = PAGE_HEIGHT - HEADER_HEIGHT - MARGIN;
  const maxFormulaWidth = PAGE_WIDTH - MARGIN * 2;

  for (const item of items) {
    let block = { ...item };
    if (block.type === "math") {
      const rendered = renderFormula(block.formula);
      const scale = Math.min(0.04, maxFormulaWidth / rendered.width, maxContentHeight / rendered.height);
      const width = Math.max(1, Math.ceil(rendered.width * scale));
      const formulaImage = new Resvg(rendered.svg, {
        fitTo: { mode: "width", value: width },
      }).render().asPng();
      block = {
        ...block,
        imageData: formulaImage.toString("base64"),
        width: formulaImage.readUInt32BE(16),
        height: formulaImage.readUInt32BE(20) + 18,
      };
    } else if (block.type === "text") {
      block.height = block.style === "heading" || block.style === "answer" ? 52 : BODY_LINE_HEIGHT;
    } else {
      block.height = 24;
    }

    if (page.length && usedHeight + block.height > maxContentHeight) {
      pages.push(page);
      page = [];
      usedHeight = 0;
    }
    page.push(block);
    usedHeight += block.height;
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function pageSvg(blocks, pageIndex, pageCount) {
  let y = HEADER_HEIGHT;
  const content = [];
  for (const block of blocks) {
    if (block.type === "space") {
      y += block.height;
      continue;
    }
    if (block.type === "text") {
      const size = block.style === "heading" ? 34 : block.style === "answer" ? 32 : BODY_FONT_SIZE;
      const weight = block.style === "heading" || block.style === "answer" ? 700 : 400;
      const color = block.style === "answer" ? "#0b5cad" : "#18212b";
      content.push(
        `<text x="${MARGIN}" y="${y + size}" font-family="DejaVu Sans, sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeXml(block.text)}</text>`
      );
    } else if (block.type === "math") {
      content.push(
        `<image x="${MARGIN}" y="${y}" width="${block.width}" height="${block.height - 18}" href="data:image/png;base64,${block.imageData}"/>`
      );
    }
    y += block.height;
  }

  const pageLabel = pageCount > 1
    ? `<text x="${PAGE_WIDTH - MARGIN}" y="${PAGE_HEIGHT - 32}" text-anchor="end" font-family="DejaVu Sans, sans-serif" font-size="20" fill="#66717d">${pageIndex + 1}/${pageCount}</text>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_WIDTH}" height="${PAGE_HEIGHT}" viewBox="0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}"><rect width="100%" height="100%" fill="#ffffff"/><text x="${MARGIN}" y="66" font-family="DejaVu Sans, sans-serif" font-size="24" font-weight="700" fill="#0b5cad">RONAN CALLOWAY BOT</text><text x="${MARGIN}" y="112" font-family="DejaVu Sans, sans-serif" font-size="30" font-weight="700" fill="#18212b">Penyelesaian Matematika</text><line x1="${MARGIN}" y1="136" x2="${PAGE_WIDTH - MARGIN}" y2="136" stroke="#dce3e9" stroke-width="2"/>${content.join("")}${pageLabel}</svg>`;
}

function renderMathSolution(content) {
  const pages = layoutItems(parseSolution(content));
  return pages.map((blocks, index) => {
    const svg = pageSvg(blocks, index, pages.length);
    return new Resvg(svg, { fitTo: { mode: "original" } }).render().asPng();
  });
}

module.exports = { parseSolution, renderFormula, renderMathSolution };
