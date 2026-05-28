import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle,
  Footer, PageNumber, convertMillimetersToTwip,
} from 'docx';
import { writeFileSync } from 'fs';

const FONT = 'Times New Roman';
const SZ = 28; // 14pt
const SZ_SMALL = 24;
const LINE_15 = 360;
const INDENT = convertMillimetersToTwip(12.5);
const MARGINS = {
  top: convertMillimetersToTwip(20),
  bottom: convertMillimetersToTwip(20),
  left: convertMillimetersToTwip(30),
  right: convertMillimetersToTwip(10),
};
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 1, color: '000000' };
const TB = { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER };

function bodyP(text) {
  return new Paragraph({
    spacing: { line: LINE_15, after: 0, before: 0 },
    indent: { firstLine: INDENT },
    alignment: AlignmentType.JUSTIFIED,
    children: [new TextRun({ text, font: FONT, size: SZ })],
  });
}

function h1(text, pb = true) {
  return new Paragraph({
    spacing: { line: LINE_15, before: 0, after: 200 },
    alignment: AlignmentType.CENTER,
    pageBreakBefore: pb,
    children: [new TextRun({ text: text.toUpperCase(), font: FONT, size: SZ, bold: true })],
  });
}

function h2(text) {
  return new Paragraph({
    spacing: { line: LINE_15, before: 200, after: 100 },
    indent: { firstLine: INDENT },
    children: [new TextRun({ text, font: FONT, size: SZ, bold: true })],
  });
}

function centerP(text, opts = {}) {
  return new Paragraph({
    spacing: { line: LINE_15, after: 0, before: 0 },
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, font: FONT, size: SZ, ...opts })],
  });
}

function emptyP() { return new Paragraph({ spacing: { line: LINE_15 } }); }

function tc(text, opts = {}) {
  return new TableCell({
    borders: TB,
    children: [new Paragraph({
      spacing: { line: 276, after: 0, before: 0 },
      alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children: [new TextRun({ text, font: FONT, size: SZ_SMALL, bold: !!opts.bold })],
    })],
  });
}

function makeTable(hdr, rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: hdr.map(h => tc(h, { bold: true, center: true })) }),
      ...rows.map(r => new TableRow({ children: r.map(c => tc(c)) })),
    ],
  });
}

// Import content from separate file
import { getAllSections } from './diploma-content.mjs';

const sections = getAllSections({ bodyP, h1, h2, centerP, emptyP, makeTable, convertMillimetersToTwip, INDENT, LINE_15, FONT, SZ });

const pageFooter = new Footer({
  children: [new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SZ_SMALL })],
  })],
});

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: SZ },
        paragraph: { spacing: { line: LINE_15 } },
      },
    },
  },
  sections: [
    {
      properties: { page: { margin: MARGINS } },
      children: sections.titlePage,
    },
    {
      properties: { page: { margin: MARGINS } },
      footers: { default: pageFooter },
      children: [
        ...sections.toc,
        ...sections.introduction,
        ...sections.generalPart,
        ...sections.specialPart,
        ...sections.economicPart,
        ...sections.laborProtection,
        ...sections.conclusion,
        ...sections.references,
        ...sections.appendixA,
        ...sections.appendixB,
      ],
    },
  ],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('Документация_дипломного_проекта.docx', buffer);
console.log('✓ Документация создана: Документация_дипломного_проекта.docx');
