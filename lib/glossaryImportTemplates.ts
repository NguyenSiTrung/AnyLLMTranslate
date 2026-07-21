/**
 * Downloadable glossary import templates + helper.
 * Samples must stay in sync with UI (GlossaryImportHint) and parse via lib/glossary.
 */

export type GlossaryTemplateFormat = 'json' | 'csv';

export const GLOSSARY_JSON_TEMPLATE_FILENAME = 'anyllm-glossary-template.json';
export const GLOSSARY_CSV_TEMPLATE_FILENAME = 'anyllm-glossary-template.csv';

/** Pretty-printed JSON array of { source, target } — authoritative sample bytes. */
export const GLOSSARY_JSON_TEMPLATE = `[
  { "source": "React", "target": "React" },
  { "source": "API", "target": "API" },
  { "source": "machine learning", "target": "machine learning" }
]
`;

/** CSV with header source,target — authoritative sample bytes. */
export const GLOSSARY_CSV_TEMPLATE = `source,target
React,React
API,API
machine learning,machine learning
`;

export function downloadGlossaryTemplate(format: GlossaryTemplateFormat): void {
  const isJson = format === 'json';
  const content = isJson ? GLOSSARY_JSON_TEMPLATE : GLOSSARY_CSV_TEMPLATE;
  const filename = isJson
    ? GLOSSARY_JSON_TEMPLATE_FILENAME
    : GLOSSARY_CSV_TEMPLATE_FILENAME;
  const mime = isJson ? 'application/json' : 'text/csv';

  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
