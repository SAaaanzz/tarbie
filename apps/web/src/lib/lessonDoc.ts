// Builds the lesson-plan Word document (.docx) from a generated plan + metadata,
// reproducing the college template: fixed cover pages (with the emblem),
// page-3 header, then the plan body. Bilingual (kz / ru).
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  ImageRun,
  BorderStyle,
  PageBreak,
} from 'docx';
import logoUrl from '../assets/college-logo.png';

export type LessonLang = 'kz' | 'ru';

export interface LessonPlanStage {
  order: number;
  name: string;
  minutes: number;
  content: string;
}
export interface LessonPlanGroupWork {
  group: string;
  title: string;
  situation: string;
  questions: string[];
  conclusion: string;
}
export interface LessonPlan {
  topic_title: string;
  goals: string[];
  resources: string[];
  stages: LessonPlanStage[];
  relevance: string;
  group_work: LessonPlanGroupWork[];
  reflection: { method: string; tool_url?: string; question: string };
}

export interface LessonPlanMeta {
  lang: LessonLang;
  group: string; // e.g. "Т22-4А"
  curatorName: string; // "Н. Фамилия"
  date: string; // "17.05.2026"
  weekTopic?: string; // «Адал Азамат» weekly topic (page 1)
  weekMotto?: string; // дәйек сөзі (top of plan)
}

const L = {
  kz: {
    ministry: 'ҚАЗАҚСТАН РЕСПУБЛИКАСЫ ОҚУ-АҒАРТУ МИНИСТРЛІГІ',
    dept: 'Алматы қаласы Білім басқармасының',
    college: '«Аlmaty Рolytechnic Сollege» КМҚК',
    approve: ['Бекітемін:', 'Директордың оқу-тәрбие', 'жұмысы жөніндегі орынбасары', '__________А.Абдраймова', '__________ 2026 ж.'],
    analysis: 'Тәрбие сағатының талдамасы:',
    agreed: ['Келісілді:', 'Топ жетекшілерінің әдістемелік', 'бірлестігінің төрайымы', '_______________Сонурова Мехирам Мухтаровна', '«_____»__________ 2026ж.'],
    curator: 'Топ жетекшісі: ',
    groupLabel: 'Тобы: ',
    planTitle: 'Тәрбие сағатының жоспары',
    tTopic: 'Қауіпсіздік/тәрбие сағатының тақырыбы',
    tDate: 'Мерзімі',
    tCurator: 'Топ жетекшісі',
    tGroup: 'Тобы',
    tGoals: 'Мақсаты',
    tResources: 'Қажетті ресурстар',
    course: 'Тәрбие сағатының барысы',
    min: 'мин',
    safetyTitle: 'Есте сақта!',
    safety: [['Өрт күзеті', '101'], ['Полиция', '102'], ['Жедел жәрдем', '103'], ['Авариялық газ қызметі', '104'], ['Бірыңғай құтқару қызметі', '112'], ['«111 байланыс орталығы»', '111']],
    relevance: 'Мазмұны / өзектілігі',
    groupWork: 'Топтық жұмыс',
    situation: 'Ситуация: ',
    questions: 'Талдау сұрақтары:',
    conclusion: 'Қорытынды: ',
    reflection: 'Рефлексия',
    motto: 'Аптаның дәйек сөзі: ',
  },
  ru: {
    ministry: 'МИНИСТЕРСТВО ПРОСВЕЩЕНИЯ РЕСПУБЛИКИ КАЗАХСТАН',
    dept: 'Управление образования города Алматы',
    college: 'КГКП «Аlmaty Рolytechnic Сollege»',
    approve: ['Утверждаю:', 'Заместитель директора по', 'учебно-воспитательной работе', '__________А.Абдраймова', '__________ 2026 г.'],
    analysis: 'Разработка воспитательного часа:',
    agreed: ['Согласовано:', 'Председатель методического объединения', 'кураторов групп', '_______________Сонурова Мехирам Мухтаровна', '«_____»__________ 2026 г.'],
    curator: 'Куратор группы: ',
    groupLabel: 'Группа: ',
    planTitle: 'План воспитательного часа',
    tTopic: 'Тема воспитательного часа',
    tDate: 'Дата',
    tCurator: 'Куратор группы',
    tGroup: 'Группа',
    tGoals: 'Цель',
    tResources: 'Необходимые ресурсы',
    course: 'Ход воспитательного часа',
    min: 'мин',
    safetyTitle: 'Запомни!',
    safety: [['Пожарная служба', '101'], ['Полиция', '102'], ['Скорая помощь', '103'], ['Аварийная газовая служба', '104'], ['Единая служба спасения', '112'], ['Контакт-центр «111»', '111']],
    relevance: 'Содержание / актуальность',
    groupWork: 'Групповая работа',
    situation: 'Ситуация: ',
    questions: 'Вопросы для анализа:',
    conclusion: 'Вывод: ',
    reflection: 'Рефлексия',
    motto: 'Цитата недели: ',
  },
} as const;

const FONT = 'Times New Roman';

function center(text: string, opts: { bold?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 24, font: FONT })],
  });
}
function line(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}): Paragraph {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.LEFT,
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 24, font: FONT })],
  });
}
function empty(): Paragraph {
  return new Paragraph({ children: [new TextRun({ text: '', font: FONT })] });
}

function labelValueRow(label: string, value: string): TableRow {
  const para = (text: string, bold: boolean) =>
    new Paragraph({ children: [new TextRun({ text, bold, size: 24, font: FONT })] });
  const labelCell = new TableCell({
    width: { size: 32, type: WidthType.PERCENTAGE },
    children: [para(label, true)],
  });
  const valueCell = new TableCell({
    width: { size: 68, type: WidthType.PERCENTAGE },
    children: value.split('\n').map((ln) => para(ln, false)),
  });
  return new TableRow({ children: [labelCell, valueCell] });
}

export async function buildLessonPlanDocx(plan: LessonPlan, meta: LessonPlanMeta): Promise<Blob> {
  const t = L[meta.lang];

  // Load the college emblem (extracted from the original template).
  const logoBuf = await fetch(logoUrl).then((r) => r.arrayBuffer());
  const logoPara = () =>
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: 'png', data: logoBuf, transformation: { width: 200, height: 93 } })],
    });

  const children: (Paragraph | Table)[] = [];

  // ── Page 1: cover ──
  children.push(logoPara());
  children.push(center(t.ministry, { bold: true }));
  children.push(center(t.dept));
  children.push(center(t.college));
  children.push(empty());
  for (const l of t.approve) children.push(line(l, { align: AlignmentType.RIGHT }));
  for (let i = 0; i < 4; i++) children.push(empty());
  children.push(line(t.analysis, { bold: true }));
  children.push(center(`«${meta.weekTopic || '________________________________________'}»`, { bold: true }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Page 2: agreement + curator/group ──
  for (const l of t.agreed) children.push(line(l));
  children.push(empty());
  children.push(line(`${t.curator}${meta.curatorName || '_________'}`));
  children.push(line(`${t.groupLabel}${meta.group || '_________'}`));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // ── Page 3: plan header ──
  children.push(logoPara());
  children.push(center(t.college));
  children.push(center(t.planTitle, { bold: true, size: 28 }));
  children.push(empty());

  if (meta.weekMotto) {
    children.push(line(`${t.motto}${meta.weekMotto}`, { bold: true }));
    children.push(empty());
  }

  // Header info table
  const noBorders = {
    top: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    bottom: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    left: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    right: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
    insideVertical: { style: BorderStyle.SINGLE, size: 4, color: '999999' },
  };
  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: noBorders,
      rows: [
        labelValueRow(t.tTopic, plan.topic_title),
        labelValueRow(t.tDate, meta.date || ''),
        labelValueRow(t.tCurator, meta.curatorName || ''),
        labelValueRow(t.tGroup, meta.group || ''),
        labelValueRow(t.tGoals, plan.goals.map((g, i) => `${i + 1}) ${g}`).join('\n')),
        labelValueRow(t.tResources, plan.resources.join('\n')),
      ],
    }),
  );
  children.push(empty());

  // ── Course of the lesson ──
  children.push(center(t.course, { bold: true, size: 26 }));
  for (const st of [...plan.stages].sort((a, b) => a.order - b.order)) {
    children.push(line(`${st.order}. ${st.name} — ${st.minutes} ${t.min}`, { bold: true }));
    children.push(line(st.content));
    // Safety-numbers block under the "minute of safety" stage (heuristic by order = 2).
    if (st.order === 2) {
      children.push(line(t.safetyTitle, { bold: true }));
      for (const [name, num] of t.safety) {
        children.push(line(`${name} — ${num}`));
      }
    }
    children.push(empty());
  }

  // ── Relevance ──
  children.push(line(t.relevance, { bold: true, size: 26 }));
  children.push(line(plan.relevance));
  children.push(empty());

  // ── Group work ──
  if (plan.group_work?.length) {
    children.push(line(t.groupWork, { bold: true, size: 26 }));
    for (const gw of plan.group_work) {
      children.push(line(`${gw.group}: ${gw.title}`, { bold: true }));
      children.push(line(`${t.situation}${gw.situation}`));
      children.push(line(t.questions, { bold: true }));
      gw.questions.forEach((q, i) => children.push(line(`${i + 1}. ${q}`)));
      children.push(line(`${t.conclusion}${gw.conclusion}`));
      children.push(empty());
    }
  }

  // ── Reflection ──
  children.push(line(t.reflection, { bold: true, size: 26 }));
  children.push(line(`${plan.reflection.method}`));
  if (plan.reflection.tool_url) children.push(line(plan.reflection.tool_url));
  children.push(line(plan.reflection.question));

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBlob(doc);
}

// File name follows the college convention: "ТСЖ {short topic} {group}".
export function lessonPlanFileName(plan: LessonPlan, meta: LessonPlanMeta): string {
  const topicShort = (plan.topic_title.replace(/[«»"]/g, '').split(/[:,.]/)[0] ?? '').trim().slice(0, 40);
  return `ТСЖ ${topicShort} ${meta.group || ''}`.trim();
}
