import fs from 'fs';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, TableOfContents,
  PageBreak, Table, TableRow, TableCell, WidthType, BorderStyle,
  ShadingType, AlignmentType, Footer, Header, PageNumber, NumberFormat,
  TabStopType, TabStopPosition, LevelFormat,
} from 'docx';

// ── Color palette ──
const COLORS = {
  primary:   '0A1628',
  body:      '1A2B40',
  secondary: '6878A0',
  accent:    '5B8DB8',
  surface:   'F4F8FC',
  white:     'FFFFFF',
};

// ── Shared style helpers ──
const FONT = 'Calibri';
const BODY_SIZE = 22; // 11pt in half-points

function emptyPara(spacing = {}) {
  return new Paragraph({ spacing, children: [] });
}

// ── Parse worklog.md ──
function parseWorklog(filePath) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  // Split on --- lines (which now may be followed by a Fecha: line)
  const entries = raw.split(/^---\s*$/m).map(block => block.trim()).filter(Boolean);

  return entries.map((block, idx) => {
    const lines = block.split('\n');
    const taskId = '';
    let agent = '';
    let task = '';
    let fecha = '';
    let section = null; // 'worklog' | 'summary'
    const workLogItems = [];
    const summaryItems = [];

    for (const rawLine of lines) {
      const line = rawLine.replace(/\t/g, '    '); // normalize tabs

      if (line.startsWith('Task ID:')) {
        // store but we'll extract after
      } else if (line.startsWith('Fecha:')) {
        fecha = line.replace('Fecha:', '').trim();
      } else if (line.startsWith('Agent:')) {
        agent = line.replace('Agent:', '').trim();
      } else if (line.startsWith('Task:')) {
        task = line.replace('Task:', '').trim();
      } else if (line.startsWith('Work Log:')) {
        section = 'worklog';
        continue;
      } else if (line.startsWith('Stage Summary:')) {
        section = 'summary';
        continue;
      } else if (section === 'worklog') {
        if (line.startsWith('- ')) {
          workLogItems.push({ level: 0, text: line.substring(2) });
        } else if (line.startsWith('  - ')) {
          workLogItems.push({ level: 1, text: line.substring(4) });
        } else if (line.trim() === '') {
          // skip blank lines in work log
        }
      } else if (section === 'summary') {
        if (line.startsWith('- ')) {
          summaryItems.push({ level: 0, text: line.substring(2) });
        } else if (line.startsWith('  - ')) {
          summaryItems.push({ level: 1, text: line.substring(4) });
        }
      }
    }

    // Extract Task ID from the first line
    const firstLine = lines[0] || '';
    const tidMatch = firstLine.match(/Task ID:\s*(.+)/);
    const tid = tidMatch ? tidMatch[1].trim() : `${idx + 1}`;

    return { taskId: tid, agent, task, fecha, workLogItems, summaryItems };
  });
}

// ── Build bullet paragraph ──
function bulletParagraph(text, level = 0) {
  const indent = level === 0 ? 720 : 1440; // twips: 0.5" and 1"
  const bulletChar = level === 0 ? '\u2022 ' : '\u2013 '; // • for level 0, – for level 1
  const fontSize = level === 0 ? BODY_SIZE : 20; // 10pt for sub-items
  const color = level === 0 ? COLORS.body : COLORS.secondary;

  return new Paragraph({
    spacing: { line: 312, after: 60 },
    indent: { left: indent, hanging: 240 },
    children: [
      new TextRun({
        text: bulletChar + text,
        font: FONT,
        size: fontSize,
        color,
      }),
    ],
  });
}

// ── Build a task entry ──
function buildTaskEntry(entry, isFirst) {
  const paragraphs = [];

  // Date, Task ID and Agent as subtitle
  const subtitleParts = [];
  if (entry.fecha) {
    subtitleParts.push(`Fecha: ${entry.fecha}`);
  }
  subtitleParts.push(`Task ID: ${entry.taskId}`);
  subtitleParts.push(`Agente: ${entry.agent}`);
  const subtitleChildren = [
    new TextRun({
      text: subtitleParts.join('  |  '),
      font: FONT,
      size: 18, // 9pt
      color: COLORS.secondary,
      italics: true,
    }),
  ];
  if (!isFirst) {
    subtitleChildren.unshift(new PageBreak());
  }
  paragraphs.push(
    new Paragraph({
      spacing: { line: 312, after: 40 },
      children: subtitleChildren,
    })
  );

  // Task title as Heading 2
  paragraphs.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { line: 312, before: 80, after: 160 },
      children: [
        new TextRun({
          text: entry.task,
          font: FONT,
          bold: true,
          size: 28, // 14pt
          color: COLORS.primary,
        }),
      ],
    })
  );

  // Work Log label
  paragraphs.push(
    new Paragraph({
      spacing: { line: 312, before: 120, after: 80 },
      children: [
        new TextRun({
          text: 'Work Log:',
          font: FONT,
          bold: true,
          size: BODY_SIZE,
          color: COLORS.accent,
        }),
      ],
    })
  );

  // Work Log items
  for (const item of entry.workLogItems) {
    paragraphs.push(bulletParagraph(item.text, item.level));
  }

  // Small spacer
  paragraphs.push(emptyPara({ after: 80 }));

  // Stage Summary label
  paragraphs.push(
    new Paragraph({
      spacing: { line: 312, before: 120, after: 80 },
      children: [
        new TextRun({
          text: 'Resumen de Etapa:',
          font: FONT,
          bold: true,
          size: BODY_SIZE,
          color: COLORS.accent,
        }),
      ],
    })
  );

  // Summary items
  for (const item of entry.summaryItems) {
    paragraphs.push(bulletParagraph(item.text, item.level));
  }

  return paragraphs;
}

// ── Main ──
async function main() {
  const entries = parseWorklog('/home/z/my-project/worklog.md');
  console.log(`Parsed ${entries.length} worklog entries.`);

  // ── Cover page: full-page dark-blue table ──
  const coverTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        height: { value: 16838, rule: 'exact' },
        children: [
          new TableCell({
            shading: {
              type: ShadingType.CLEAR,
              fill: COLORS.primary,
            },
            verticalAlign: 'center',
            borders: {
              top:    { style: BorderStyle.NONE, size: 0 },
              bottom: { style: BorderStyle.NONE, size: 0 },
              left:   { style: BorderStyle.NONE, size: 0 },
              right:  { style: BorderStyle.NONE, size: 0 },
            },
            children: [
              // Spacer
              emptyPara({ after: 2400 }),
              // Title
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 200 },
                children: [
                  new TextRun({
                    text: 'Bitácora de Desarrollo',
                    font: FONT,
                    bold: true,
                    size: 56, // 28pt
                    color: COLORS.white,
                  }),
                ],
              }),
              // Spacer
              emptyPara({ after: 200 }),
              // Subtitle
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 400 },
                children: [
                  new TextRun({
                    text: 'RutaTica — Toda Costa Rica en una APP',
                    font: FONT,
                    size: 32, // 16pt
                    color: COLORS.white,
                  }),
                ],
              }),
              // Spacer before footer
              emptyPara({ after: 2400 }),
              // Footer text
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: 'Registro completo de desarrollo del proyecto',
                    font: FONT,
                    size: 20, // 10pt
                    color: '999999', // white ~60%
                  }),
                ],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  // ── TOC section ──
  const tocChildren = [
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { line: 312, after: 300 },
      children: [
        new TextRun({
          text: 'Tabla de Contenidos',
          font: FONT,
          bold: true,
          size: 36, // 18pt
          color: COLORS.primary,
        }),
      ],
    }),
    new TableOfContents('Tabla de Contenidos', {
      hyperlink: true,
      headingStyleRange: '1-3',
    }),
    // PageBreak + Gray italic note on same paragraph to avoid blank page
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { line: 312, after: 200 },
      children: [
        new PageBreak(),
        new TextRun({
          text: 'Para actualizar los números de página, haga clic derecho sobre la tabla y seleccione "Actualizar campo"',
          font: FONT,
          size: 18,
          color: COLORS.secondary,
          italics: true,
        }),
      ],
    }),
    emptyPara({ after: 200 }),
  ];

  // ── Body section paragraphs ──
  const bodyChildren = [];
  for (let i = 0; i < entries.length; i++) {
    const taskParagraphs = buildTaskEntry(entries[i], i === 0);
    bodyChildren.push(...taskParagraphs);
  }

  // ── Build document ──
  const doc = new Document({
    features: {
      updateFields: true,
    },
    styles: {
      default: {
        document: {
          run: {
            font: FONT,
            size: BODY_SIZE,
            color: COLORS.body,
          },
          paragraph: {
            spacing: { line: 312 },
          },
        },
        heading1: {
          run: {
            font: FONT,
            bold: true,
            size: 36,
            color: COLORS.primary,
          },
          paragraph: {
            spacing: { line: 312, before: 240, after: 160 },
            outlineLevel: 0,
          },
        },
        heading2: {
          run: {
            font: FONT,
            bold: true,
            size: 28,
            color: COLORS.primary,
          },
          paragraph: {
            spacing: { line: 312, before: 200, after: 120 },
            outlineLevel: 1,
          },
        },
        heading3: {
          run: {
            font: FONT,
            bold: true,
            size: 24,
            color: COLORS.accent,
          },
          paragraph: {
            spacing: { line: 312, before: 160, after: 100 },
            outlineLevel: 2,
          },
        },
      },
    },
    sections: [
      // Section 1: Cover page (no page numbers, no header/footer)
      {
        properties: {
          page: {
            margin: {
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            },
          },
        },
        children: [coverTable],
      },
      // Section 2: TOC (no page numbers)
      {
        properties: {
          page: {
            margin: {
              top: 1440,  // 1 inch
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
          },
        },
        children: tocChildren,
      },
      // Section 3: Body (page numbers start at 1, Arabic)
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              bottom: 1440,
              left: 1440,
              right: 1440,
            },
            pageNumbers: {
              start: 1,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: 'RutaTica — Bitácora de Desarrollo',
                    font: FONT,
                    size: 16,
                    color: COLORS.secondary,
                    italics: true,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    children: [PageNumber.CURRENT],
                    font: FONT,
                    size: 18,
                    color: COLORS.secondary,
                  }),
                ],
              }),
            ],
          }),
        },
        children: bodyChildren,
      },
    ],
  });

  // ── Generate ──
  const buffer = await Packer.toBuffer(doc);
  const outPath = '/home/z/my-project/Bitacora_RutaTica.docx';
  fs.writeFileSync(outPath, buffer);
  const stats = fs.statSync(outPath);
  console.log(`\nDocument generated: ${outPath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
}

main().catch(err => {
  console.error('Error generating document:', err);
  process.exit(1);
});
