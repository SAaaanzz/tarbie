import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/auth';
import { api } from '../lib/api';
import {
  Sparkles, Loader2, Copy, Check, BookOpen, Calendar,
  ClipboardList, Lightbulb, RefreshCw, AlertTriangle,
} from 'lucide-react';

type PromptCategory = 'topics' | 'plan' | 'activity' | 'advice' | 'document';

interface GeneratedContent {
  category: PromptCategory;
  prompt: string;
  result: string;
}

const PROMPT_TEMPLATES: Record<PromptCategory, { icon: JSX.Element; labelRu: string; labelKz: string; placeholderRu: string; placeholderKz: string }> = {
  topics: {
    icon: <BookOpen size={18} />,
    labelRu: 'Темы занятий',
    labelKz: 'Сабақ тақырыптары',
    placeholderRu: 'Укажите направление (патриотизм, экология, дружба, здоровье...)',
    placeholderKz: 'Бағытты көрсетіңіз (патриотизм, экология, достық, денсаулық...)',
  },
  plan: {
    icon: <Calendar size={18} />,
    labelRu: 'План урока',
    labelKz: 'Сабақ жоспары',
    placeholderRu: 'Тема и возраст (например: Дружба, 3 курс)',
    placeholderKz: 'Тақырып пен жас (мысалы: Достық, 3 курс)',
  },
  activity: {
    icon: <ClipboardList size={18} />,
    labelRu: 'Активности и игры',
    labelKz: 'Белсенділіктер мен ойындар',
    placeholderRu: 'Тема и формат (Экология, квиз; Дружба, дебаты...)',
    placeholderKz: 'Тақырып және формат (Экология, квиз; Достық, дебат...)',
  },
  advice: {
    icon: <Lightbulb size={18} />,
    labelRu: 'Советы куратору',
    labelKz: 'Кураторға кеңес',
    placeholderRu: 'Опишите ситуацию (студент пропускает, конфликт в группе...)',
    placeholderKz: 'Жағдайды сипаттаңыз (студент босатады, топта қақтығыс...)',
  },
  document: {
    icon: <ClipboardList size={18} />,
    labelRu: 'Шаблон документа',
    labelKz: 'Құжат үлгісі',
    placeholderRu: 'Тип документа (характеристика, отчёт, справка, протокол...)',
    placeholderKz: 'Құжат түрі (мінездеме, есеп, анықтама, хаттама...)',
  },
};

export function AssistantPage() {
  const { lang } = useAuthStore();
  const [category, setCategory] = useState<PromptCategory>('topics');
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);

  useEffect(() => {
    api.get<{ used: number; limit: number }>('/api/assistant/usage')
      .then(setUsage)
      .catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ result: string; usage: { used: number; limit: number } }>('/api/assistant/generate', {
        category, prompt: prompt.trim(), lang,
      });
      setHistory(prev => [{ category, prompt: prompt.trim(), result: res.result }, ...prev]);
      setUsage(res.usage);
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : (lang === 'kz' ? 'Генерация қатесі' : 'Ошибка генерации'));
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const tmpl = PROMPT_TEMPLATES[category];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Sparkles size={24} className="text-amber-500" />
          {lang === 'kz' ? 'AI-көмекші' : 'AI-ассистент'}
        </h1>
        {usage && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${
            usage.used >= usage.limit ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {usage.used}/{usage.limit} {lang === 'kz' ? 'сұрау' : 'запросов'}
          </span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          <AlertTriangle size={16} className="shrink-0" />
          {error}
        </div>
      )}

      {/* Category selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {(Object.keys(PROMPT_TEMPLATES) as PromptCategory[]).map(cat => {
          const t = PROMPT_TEMPLATES[cat];
          const active = cat === category;
          return (
            <button key={cat} onClick={() => setCategory(cat)}
              className={`flex items-center gap-2 rounded-xl border p-3 text-left transition-all ${
                active ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-gray-200 bg-white hover:border-gray-300'
              }`}>
              <span className={active ? 'text-amber-600' : 'text-gray-400'}>{t.icon}</span>
              <span className={`text-xs font-medium ${active ? 'text-amber-800' : 'text-gray-700'}`}>
                {lang === 'kz' ? t.labelKz : t.labelRu}
              </span>
            </button>
          );
        })}
      </div>

      {/* Input */}
      <div className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200">
        <label className="mb-2 block text-sm font-medium text-gray-700 flex items-center gap-2">
          {tmpl.icon}
          {lang === 'kz' ? tmpl.labelKz : tmpl.labelRu}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            className="input-field flex-1"
            placeholder={lang === 'kz' ? tmpl.placeholderKz : tmpl.placeholderRu}
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleGenerate(); }}
          />
          <button onClick={handleGenerate} disabled={loading || !prompt.trim()}
            className="btn-primary flex items-center gap-1.5 px-4">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {lang === 'kz' ? 'Жасау' : 'Сгенерировать'}
          </button>
        </div>
      </div>

      {/* Results */}
      {history.length > 0 && (
        <div className="space-y-4">
          {history.map((item, i) => {
            const t = PROMPT_TEMPLATES[item.category];
            const id = `result-${i}`;
            return (
              <div key={i} className="rounded-2xl bg-white p-5 shadow-sm border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">{t.icon}</span>
                    <span className="text-sm font-medium text-gray-700">{lang === 'kz' ? t.labelKz : t.labelRu}</span>
                    <span className="text-xs text-gray-400">— {item.prompt}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setCategory(item.category); setPrompt(item.prompt); }}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={lang === 'kz' ? 'Қайта жасау' : 'Переделать'}>
                      <RefreshCw size={14} />
                    </button>
                    <button onClick={() => handleCopy(item.result, id)}
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title={lang === 'kz' ? 'Көшіру' : 'Копировать'}>
                      {copied === id ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans">{item.result}</pre>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {history.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-400">
          <Sparkles size={48} className="mx-auto mb-3 opacity-20" />
          <p className="text-sm">{lang === 'kz' ? 'Сұрау жазып, нәтижені алыңыз' : 'Введите запрос и получите результат'}</p>
          <p className="text-xs mt-1">{lang === 'kz' ? 'AI көмегімен сабақ жоспарлау' : 'Планируйте занятия с помощью AI'}</p>
        </div>
      )}
    </div>
  );
}
